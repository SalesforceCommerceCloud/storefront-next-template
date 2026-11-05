/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { act, lazy, Suspense, useEffect, type FC, type ReactNode } from 'react';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToPipeableStream } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { Region, type ComponentType } from './index';
import { EmbeddedComponentRegion } from './embedded-component-region';
import type { ShopperExperience } from '@/scapi';
import type { ComponentWithComponentData } from '@/lib/page-designer/component-loader.server';
import { registry } from '@/lib/page-designer/registry';
import { registerServerRenderedComponentTypes } from '@/lib/page-designer/registry-components';
import HeroCarousel, { HeroCarouselPlain } from '@/components/hero-carousel';
import AuthProvider, { useAuth } from '@/providers/auth';
import { getUserTypeCookieName } from '@/lib/auth/user-type-hint';

// `Region` reads `config.features.livePreview` at the top level, so an SSR render without a
// `ConfigProvider` in the tree throws. Force a stable config while leaving the module's other
// exports intact for anything rendered through the registry.
vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>()),
    useConfig: () => ({ features: { livePreview: true } }),
}));

interface StreamedRender {
    shellReady: Promise<void>;
    completed: Promise<string>;
    read: () => string;
    abort: () => void;
    errors: unknown[];
}

const SITE_ID = 'RefArchGlobal';

const componentMarkerId = (componentId: string) => `pdc-${encodeURIComponent(componentId)}`;

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function renderStreaming(element: ReactNode): StreamedRender {
    let html = '';
    const errors: unknown[] = [];
    let resolveShell!: () => void;
    let rejectShell!: (error: unknown) => void;
    let rejectCompletion!: (error: unknown) => void;
    const shellReady = new Promise<void>((resolve, reject) => {
        resolveShell = resolve;
        rejectShell = reject;
    });
    const destination = new PassThrough();
    destination.setEncoding('utf8');
    destination.on('data', (chunk: string) => {
        html += chunk;
    });
    const completed = new Promise<string>((resolve, reject) => {
        rejectCompletion = reject;
        destination.on('end', () => resolve(html));
        destination.on('error', reject);
    });

    const stream = renderToPipeableStream(element, {
        progressiveChunkSize: 1,
        onShellReady() {
            stream.pipe(destination);
            resolveShell();
        },
        onShellError(error) {
            rejectShell(error);
            rejectCompletion(error);
        },
        onError(error) {
            errors.push(error);
        },
    });

    return { shellReady, completed, read: () => html, abort: stream.abort, errors };
}

function documentWith(content: ReactNode) {
    return (
        <html lang="en">
            <body>
                <div>SHELL_ANCHOR</div>
                {content}
            </body>
        </html>
    );
}

function component(id: string, typeId: string): ComponentType {
    return { id, typeId } as ComponentType;
}

function pageWith(componentValue: ComponentType, componentData?: Record<string, Promise<unknown>>) {
    return {
        id: 'streaming-page',
        typeId: 'storePage',
        regions: [{ id: 'main', components: [componentValue] }],
        componentData,
    } as ShopperExperience.schemas['Page'] & { componentData?: Record<string, Promise<unknown>> };
}

async function register(typeId: string, Component: FC<{ data?: unknown; component?: ComponentType }>, fallback?: FC) {
    registry.registerImporter(typeId, () => Promise.resolve({ default: Component, fallback }));
    await registry.loadAndRegister(typeId);
}

describe('Page Designer region streaming SSR', () => {
    beforeEach(() => {
        vi.stubEnv('SSR', true);
        registry.clear();
    });
    afterEach(() => {
        registry.clear();
        vi.unstubAllEnvs();
    });

    it('runs the Page Designer region through the SSR branch', () => {
        expect(import.meta.env.SSR).toBe(true);
    });

    it('blocks a critical region until its component render tree is ready and emits the content inline', async () => {
        const nestedModule = deferred<{ default: FC }>();
        const Nested = lazy(() => nestedModule.promise);
        const importer = vi.fn(() =>
            Promise.resolve({
                default: () => <Nested />,
                fallback: () => <div>CRITICAL_FALLBACK</div>,
            })
        );
        registry.registerImporter('Content.critical', importer);

        const streamed = renderStreaming(
            documentWith(
                <Region page={pageWith(component('critical-component', 'Content.critical'))} regionId="main" critical />
            )
        );
        let didReachShell = false;
        void streamed.shellReady.then(() => {
            didReachShell = true;
        });

        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(importer).toHaveBeenCalledOnce();
        expect(didReachShell).toBe(false);
        expect(streamed.read()).toBe('');

        nestedModule.resolve({ default: () => <div>CRITICAL_CONTENT</div> });
        await streamed.shellReady;
        const html = await streamed.completed;

        expect(html).toContain('CRITICAL_CONTENT');
        expect(html).not.toContain('CRITICAL_FALLBACK');
        expect(html).not.toContain('<div hidden id="S:');
        expect(html).not.toContain('<!--$?-->');
    });

    it('streams a component-local fallback for a suspending non-critical component', async () => {
        const nestedModule = deferred<{ default: FC }>();
        const Nested = lazy(() => nestedModule.promise);
        await register(
            'Content.nonCritical',
            () => <Nested />,
            () => <div>NON_CRITICAL_FALLBACK</div>
        );

        const streamed = renderStreaming(
            documentWith(
                <Region page={pageWith(component('non-critical-component', 'Content.nonCritical'))} regionId="main" />
            )
        );
        await streamed.shellReady;
        await vi.waitFor(() => expect(streamed.read()).toContain('NON_CRITICAL_FALLBACK'));
        const shell = streamed.read();

        expect(shell).not.toContain('NON_CRITICAL_CONTENT');
        expect(shell).toContain('<!--$?-->');
        expect(shell).toContain('data-pdct="Content.nonCritical"');

        nestedModule.resolve({ default: () => <div>NON_CRITICAL_CONTENT</div> });
        const html = await streamed.completed;

        expect(html).toContain('NON_CRITICAL_CONTENT');
        expect(html).toContain('<div hidden id="S:');
    });

    it('keeps deferred component data local even inside a critical region', async () => {
        const componentData = deferred<unknown>();
        await register(
            'Content.criticalWithData',
            ({ data }) => <div data-critical-component-data={String(data)}>CRITICAL_DATA_CONTENT</div>,
            () => <div>CRITICAL_DATA_FALLBACK</div>
        );

        const streamed = renderStreaming(
            documentWith(
                <Region
                    page={pageWith(component('critical-data', 'Content.criticalWithData'), {
                        'critical-data': componentData.promise,
                    })}
                    regionId="main"
                    critical
                />
            )
        );
        await streamed.shellReady;
        await vi.waitFor(() => expect(streamed.read()).toContain('CRITICAL_DATA_FALLBACK'));
        const shell = streamed.read();

        expect(shell).not.toContain('CRITICAL_DATA_CONTENT');
        expect(shell).toContain('<!--$?-->');
        expect(shell).toContain(componentMarkerId('critical-data'));
        // The data stays local, but the type still registers before hydration.
        expect(shell).toContain('data-pdct="Content.criticalWithData"');

        componentData.resolve('resolved');
        const html = await streamed.completed;

        expect(html).toContain('data-critical-component-data="resolved"');
        expect(html).toContain('CRITICAL_DATA_CONTENT');
        expect(html).toContain('<div hidden id="S:');
    });

    it('streams the region fallback while a non-critical page is unresolved', async () => {
        const page = deferred<ReturnType<typeof pageWith>>();
        await register('Content.afterPage', () => <div>PAGE_CONTENT</div>);

        const streamed = renderStreaming(
            documentWith(<Region page={page.promise} regionId="main" fallbackElement={<div>PAGE_FALLBACK</div>} />)
        );
        await streamed.shellReady;
        await vi.waitFor(() => expect(streamed.read()).toContain('PAGE_FALLBACK'));
        const shell = streamed.read();

        expect(shell).not.toContain('PAGE_CONTENT');
        expect(shell).toContain('<!--$?-->');

        page.resolve(pageWith(component('after-page', 'Content.afterPage')));
        const html = await streamed.completed;

        expect(html).toContain('PAGE_CONTENT');
        expect(html).toContain('<div hidden id="S:');
    });

    it('hydrates a critical region without remounting and localizes later client suspensions', async () => {
        let initialMounts = 0;
        let initialCleanups = 0;
        const Initial: FC = () => {
            useEffect(() => {
                initialMounts += 1;
                return () => {
                    initialCleanups += 1;
                };
            }, []);
            return <div data-testid="initial-critical-content">INITIAL_CRITICAL_CONTENT</div>;
        };
        await register('Content.initialHydration', Initial);

        const initialPage = pageWith(component('initial-hydration', 'Content.initialHydration'));
        const tree = (page: ReturnType<typeof pageWith>) => (
            <Suspense fallback={<div data-testid="outer-region-fallback">OUTER_REGION_FALLBACK</div>}>
                <Region page={page} regionId="main" critical />
            </Suspense>
        );
        const serverRender = renderStreaming(<div data-testid="hydration-root">{tree(initialPage)}</div>);
        await serverRender.shellReady;
        const serverHtml = await serverRender.completed;
        const container = document.createElement('div');
        container.innerHTML = serverHtml;
        document.body.append(container);
        const serverNode = container.querySelector('[data-testid="initial-critical-content"]');
        const markerId = componentMarkerId('initial-hydration');
        const serverMarker = document.getElementById(markerId);
        expect(serverNode).not.toBeNull();
        expect(serverMarker).not.toBeNull();

        registry.clear();
        const clientImporter = vi.fn(() => Promise.resolve({ default: Initial }));
        registry.registerImporter('Content.initialHydration', clientImporter);
        await registerServerRenderedComponentTypes(container);
        expect(clientImporter).toHaveBeenCalledOnce();

        vi.stubEnv('SSR', false);
        const root = hydrateRoot(container, <div data-testid="hydration-root">{tree(initialPage)}</div>);
        await act(() => Promise.resolve());

        expect(initialMounts).toBe(1);
        expect(initialCleanups).toBe(0);
        expect(container.querySelector('[data-testid="initial-critical-content"]')).toBe(serverNode);
        expect(document.getElementById(markerId)).toBe(serverMarker);

        const laterModule = deferred<{ default: FC }>();
        const Later = lazy(() => laterModule.promise);
        await register(
            'Content.laterClient',
            () => <Later />,
            () => <div data-testid="later-component-fallback">LATER_COMPONENT_FALLBACK</div>
        );
        const laterPage = pageWith(component('later-client', 'Content.laterClient'));
        act(() => root.render(<div data-testid="hydration-root">{tree(laterPage)}</div>));

        expect(container.querySelector('[data-testid="outer-region-fallback"]')).toBeNull();
        expect(container.querySelector('[data-testid="later-component-fallback"]')).not.toBeNull();

        await act(async () => {
            laterModule.resolve({ default: () => <div>LATER_CLIENT_CONTENT</div> });
            await laterModule.promise;
        });
        expect(container).toHaveTextContent('LATER_CLIENT_CONTENT');

        act(() => root.unmount());
        container.remove();
    });

    it('preserves the Hero Carousel and Hero markers through hydration', async () => {
        const Hero: FC<{ component?: ComponentType }> = ({ component: hero }) => (
            <div data-testid={`hero-${hero?.id}`}>{String(hero?.data?.title)}</div>
        );
        await register('Content.hero', Hero);
        await register('Layout.heroCarousel', HeroCarousel as FC<{ component?: ComponentType }>);

        const carousel = {
            id: 'hero-carousel',
            typeId: 'Layout.heroCarousel',
            regions: [
                {
                    id: 'slides',
                    components: [
                        { id: 'hero-one', typeId: 'Content.hero', data: { title: 'Hero one' } },
                        { id: 'hero-two', typeId: 'Content.hero', data: { title: 'Hero two' } },
                    ],
                },
            ],
        } as unknown as ComponentType;
        const page = pageWith(carousel);
        const tree = (
            <Suspense fallback={<div>CAROUSEL_OUTER_FALLBACK</div>}>
                <Region page={page} regionId="main" critical />
            </Suspense>
        );
        const serverRender = renderStreaming(<div data-testid="carousel-root">{tree}</div>);
        await serverRender.shellReady;
        const container = document.createElement('div');
        const serverHtml = await serverRender.completed;
        expect(serverHtml).toContain('data-pdct="Layout.heroCarousel"');
        expect(serverHtml).toContain('data-pdct="Content.hero"');
        container.innerHTML = serverHtml;
        expect(serverRender.errors).toEqual([]);
        document.body.append(container);

        const markerIds = [
            componentMarkerId('hero-carousel'),
            componentMarkerId('hero-one'),
            componentMarkerId('hero-two'),
        ];
        const serverMarkers = markerIds.map((id) => document.getElementById(id));
        expect(serverMarkers.every(Boolean)).toBe(true);
        expect(serverMarkers.map((marker) => marker?.dataset.pdct)).toEqual([
            'Layout.heroCarousel',
            'Content.hero',
            'Content.hero',
        ]);

        registry.clear();
        registry.registerImporter('Content.hero', () => Promise.resolve({ default: Hero }));
        registry.registerImporter('Layout.heroCarousel', () => Promise.resolve({ default: HeroCarousel }));
        await registerServerRenderedComponentTypes(container);
        expect(serverMarkers.map((marker) => marker?.dataset.pdct)).toEqual([
            'Layout.heroCarousel',
            'Content.hero',
            'Content.hero',
        ]);

        vi.stubEnv('SSR', false);
        const root = hydrateRoot(container, <div data-testid="carousel-root">{tree}</div>, {
            onRecoverableError: vi.fn(),
        });
        await act(() => Promise.resolve());

        markerIds.forEach((id, index) => {
            expect(document.getElementById(id)).toBe(serverMarkers[index]);
            expect(document.getElementById(id)?.dataset.pdct).toBe(
                index === 0 ? 'Layout.heroCarousel' : 'Content.hero'
            );
        });
        act(() => root.unmount());
        container.remove();
    });

    it('gives a conditionally mounted nested critical component its own client boundary', async () => {
        const nestedModule = deferred<{ default: FC }>();
        const Nested = lazy(() => nestedModule.promise);
        const conditionalChildImporter = vi.fn(() =>
            Promise.resolve({
                default: () => <Nested />,
                fallback: () => <div data-testid="conditional-component-fallback">CONDITIONAL_COMPONENT_FALLBACK</div>,
            })
        );
        registry.registerImporter('Content.conditionalChild', conditionalChildImporter);
        await register('Layout.conditional', ({ component: owner }) => {
            const shouldRenderChild = owner?.name === 'show-child';
            return shouldRenderChild && owner ? (
                <Region component={owner} regionId="conditional" />
            ) : (
                <div>CONDITIONAL_LAYOUT_ONLY</div>
            );
        });

        const conditionalPage = (showChild: boolean) =>
            pageWith({
                id: 'conditional-layout',
                typeId: 'Layout.conditional',
                name: showChild ? 'show-child' : 'hide-child',
                regions: [
                    {
                        id: 'conditional',
                        components: [component('conditional-child', 'Content.conditionalChild')],
                    },
                ],
            } as ComponentType);
        const tree = (showChild: boolean) => (
            <Suspense fallback={<div data-testid="outer-region-fallback">OUTER_REGION_FALLBACK</div>}>
                <Region page={conditionalPage(showChild)} regionId="main" critical />
            </Suspense>
        );

        const serverRender = renderStreaming(<div data-testid="conditional-root">{tree(false)}</div>);
        await serverRender.shellReady;
        const container = document.createElement('div');
        container.innerHTML = await serverRender.completed;
        document.body.append(container);
        expect(container).toHaveTextContent('CONDITIONAL_LAYOUT_ONLY');
        expect(container.querySelector('[data-testid="conditional-component-fallback"]')).toBeNull();
        expect(conditionalChildImporter).not.toHaveBeenCalled();
        const childMarkerId = componentMarkerId('conditional-child');
        expect(document.getElementById(childMarkerId)).toBeNull();

        await registerServerRenderedComponentTypes(container);
        vi.stubEnv('SSR', false);
        const root = hydrateRoot(container, <div data-testid="conditional-root">{tree(false)}</div>);
        await act(() => Promise.resolve());
        act(() => root.render(<div data-testid="conditional-root">{tree(true)}</div>));
        await act(() => Promise.resolve());

        expect(container.querySelector('[data-testid="outer-region-fallback"]')).toBeNull();
        expect(conditionalChildImporter).toHaveBeenCalledOnce();
        expect(document.getElementById(childMarkerId)).toBeNull();

        await act(async () => {
            nestedModule.resolve({ default: () => <div>CONDITIONAL_CLIENT_CONTENT</div> });
            await nestedModule.promise;
        });
        expect(container).toHaveTextContent('CONDITIONAL_CLIENT_CONTENT');

        act(() => root.unmount());
        container.remove();
    });

    it('keeps server-rendered Hero Carousel slides in place through the carousel render after hydration', async () => {
        const Hero: FC<{ component?: ComponentType }> = ({ component: hero }) => (
            <div data-testid={`hero-${hero?.id}`}>{String(hero?.data?.title)}</div>
        );
        await register('Content.hero', Hero);
        const carousel = {
            id: 'hero-carousel',
            typeId: 'Layout.heroCarousel',
            regions: [
                {
                    id: 'slides',
                    components: [
                        { id: 'hero-one', typeId: 'Content.hero', data: { title: 'Hero one' } },
                        { id: 'hero-two', typeId: 'Content.hero', data: { title: 'Hero two' } },
                    ],
                },
            ],
        } as unknown as ComponentType;
        const tree = (
            <div data-testid="hero-carousel-root">
                <HeroCarouselPlain component={carousel} />
            </div>
        );

        const serverRender = renderStreaming(tree);
        await serverRender.shellReady;
        const container = document.createElement('div');
        container.innerHTML = await serverRender.completed;
        document.body.append(container);
        const serverHero = container.querySelector('[data-testid="hero-hero-one"]');
        expect(serverHero).not.toBeNull();

        registry.clear();
        const importHero = vi.fn(() => Promise.resolve({ default: Hero }));
        registry.registerImporter('Content.hero', importHero);
        await registerServerRenderedComponentTypes(container);
        expect(importHero).toHaveBeenCalledOnce();
        vi.stubEnv('SSR', false);
        const onRecoverableError = vi.fn();
        const root = hydrateRoot(container, tree, { onRecoverableError });
        try {
            await act(() => Promise.resolve());
            expect(container.querySelector('[data-testid="hero-hero-one"]')).toBe(serverHero);
            expect(onRecoverableError).not.toHaveBeenCalled();
        } finally {
            act(() => root.unmount());
            container.remove();
        }
    });

    const setUserTypeCookie = (userType: string) => {
        document.cookie = `${getUserTypeCookieName(SITE_ID)}=${btoa(JSON.stringify(userType))}; path=/`;
    };
    const clearUserTypeCookie = () => {
        document.cookie = `${getUserTypeCookieName(SITE_ID)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    };
    const GuestAuthProvider = ({ children }: { children: ReactNode }) => (
        <AuthProvider value={{ userType: 'guest' }} siteId={SITE_ID}>
            {children}
        </AuthProvider>
    );

    // A critical embedded region is part of the server shell and hydrates with it, so even a real context change right
    // after hydration (a registered shopper on a page cached for guests) has no hydrating boundary to reach.
    it('renders a critical embedded region in the shell and keeps it through a context change', async () => {
        let bannerMounts = 0;
        const Banner: FC = () => {
            useEffect(() => {
                bannerMounts += 1;
            }, []);
            return <div data-testid="critical-banner">CRITICAL_BANNER</div>;
        };
        const serverModule = deferred<{ default: FC }>();
        const serverImporter = vi.fn(() => serverModule.promise);
        registry.registerImporter('Content.criticalBanner', serverImporter);
        const header = {
            id: 'header',
            typeId: 'header',
            regions: [{ id: 'announcement', components: [component('banner', 'Content.criticalBanner')] }],
        } as unknown as ComponentWithComponentData;
        const probeRenders = { count: 0 };
        const Probe: FC = () => {
            probeRenders.count += 1;
            return <span data-testid="user-type">{useAuth()?.userType}</span>;
        };
        const tree = (
            <div data-testid="critical-embedded-root">
                <GuestAuthProvider>
                    <Probe />
                    <header>
                        <EmbeddedComponentRegion component={header} regionId="announcement" critical />
                    </header>
                </GuestAuthProvider>
            </div>
        );

        const serverRender = renderStreaming(tree);
        let didReachShell = false;
        void serverRender.shellReady.then(() => {
            didReachShell = true;
        });
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(serverImporter).toHaveBeenCalledOnce();
        expect(didReachShell).toBe(false);

        serverModule.resolve({ default: Banner });
        await serverRender.shellReady;
        const serverHtml = await serverRender.completed;
        expect(serverHtml).toContain('CRITICAL_BANNER');
        expect(serverHtml).not.toContain('<!--$?-->');
        expect(serverHtml).toContain('data-pdct="Content.criticalBanner"');
        expect(serverRender.errors).toEqual([]);

        const container = document.createElement('div');
        container.innerHTML = serverHtml;
        document.body.append(container);
        const serverBanner = container.querySelector('[data-testid="critical-banner"]');
        const markerId = componentMarkerId('banner');
        const serverMarker = document.getElementById(markerId);
        expect(serverBanner).not.toBeNull();
        expect(serverMarker).not.toBeNull();

        let root: ReturnType<typeof hydrateRoot> | undefined;
        try {
            registry.clear();
            const clientImporter = vi.fn(() => Promise.resolve({ default: Banner }));
            registry.registerImporter('Content.criticalBanner', clientImporter);
            await registerServerRenderedComponentTypes(container);
            expect(clientImporter).toHaveBeenCalledOnce();

            setUserTypeCookie('registered');
            vi.stubEnv('SSR', false);
            const onRecoverableError = vi.fn();
            probeRenders.count = 0;
            root = hydrateRoot(container, tree, { onRecoverableError });
            await act(() => Promise.resolve());

            // The context value changed after hydration...
            expect(container.querySelector('[data-testid="user-type"]')).toHaveTextContent('registered');
            expect(probeRenders.count).toBe(2);
            // ...and the banner kept its server DOM.
            expect(container.querySelector('[data-testid="critical-banner"]')).toBe(serverBanner);
            expect(document.getElementById(markerId)).toBe(serverMarker);
            expect(bannerMounts).toBe(1);
            expect(onRecoverableError).not.toHaveBeenCalled();
        } finally {
            act(() => root?.unmount());
            container.remove();
            clearUserTypeCookie();
        }
    });

    // The layout loader streams the header promise. With no boundary above it, the critical region holds the shell
    // until the header resolves, and hydration waits for the client copy of the promise in place.
    it('blocks the shell on a pending critical embedded component and hydrates it in place', async () => {
        const Banner: FC = () => <div data-testid="streamed-banner">STREAMED_BANNER</div>;
        await register('Content.streamedBanner', Banner);
        const header = {
            id: 'header',
            typeId: 'header',
            regions: [{ id: 'announcement', components: [component('streamed', 'Content.streamedBanner')] }],
        } as unknown as ComponentWithComponentData;
        const tree = (pending: Promise<ComponentWithComponentData | null>) => (
            <div data-testid="streamed-embedded-root">
                <header>
                    <EmbeddedComponentRegion component={pending} regionId="announcement" critical />
                </header>
                <main>PAGE_CONTENT</main>
            </div>
        );

        const serverHeader = deferred<ComponentWithComponentData | null>();
        const serverRender = renderStreaming(tree(serverHeader.promise));
        let didReachShell = false;
        void serverRender.shellReady.then(() => {
            didReachShell = true;
        });
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(didReachShell).toBe(false);
        expect(serverRender.read()).toBe('');

        serverHeader.resolve(header);
        await serverRender.shellReady;
        const serverHtml = await serverRender.completed;
        expect(serverHtml.indexOf('STREAMED_BANNER')).toBeGreaterThan(-1);
        expect(serverHtml.indexOf('STREAMED_BANNER')).toBeLessThan(serverHtml.indexOf('PAGE_CONTENT'));
        expect(serverHtml).not.toContain('<!--$?-->');
        expect(serverHtml).not.toContain('<div hidden id="S:');
        expect(serverRender.errors).toEqual([]);

        const container = document.createElement('div');
        container.innerHTML = serverHtml;
        document.body.append(container);
        const serverBanner = container.querySelector('[data-testid="streamed-banner"]');
        const serverPage = container.querySelector('main');
        expect(serverBanner).not.toBeNull();

        let root: ReturnType<typeof hydrateRoot> | undefined;
        try {
            await registerServerRenderedComponentTypes(container);
            vi.stubEnv('SSR', false);
            const onRecoverableError = vi.fn();
            const clientHeader = deferred<ComponentWithComponentData | null>();
            root = hydrateRoot(container, tree(clientHeader.promise), { onRecoverableError });
            await act(() => Promise.resolve());
            expect(container.querySelector('[data-testid="streamed-banner"]')).toBe(serverBanner);

            await act(async () => {
                clientHeader.resolve(header);
                await clientHeader.promise;
            });
            expect(container.querySelector('[data-testid="streamed-banner"]')).toBe(serverBanner);
            expect(container.querySelector('main')).toBe(serverPage);
            expect(onRecoverableError).not.toHaveBeenCalled();
        } finally {
            act(() => root?.unmount());
            container.remove();
        }
    });
});
