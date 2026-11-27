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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createMemoryRouter,
    Outlet,
    RouterContextProvider,
    RouterProvider,
    redirect,
    UNSAFE_getTurboStreamSingleFetchDataStrategy,
} from 'react-router';
import { AuthContext } from '@/providers/auth';
import BasketProvider, { useBasketSnapshot } from '@/providers/basket';
import { useHybridBasketRefresh } from '@/hooks/use-hybrid-basket-refresh';
import { clientLoader, shouldRevalidate } from '@/routes/resource.basket-refresh';
import { parseBasketCookie } from '@/lib/basket/cookie';

vi.mock('@/middlewares/basket.server', () => ({ refreshBasket: vi.fn() }));
vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({
    useSite: () => ({ site: { id: 'RefArchGlobal' }, locale: { id: 'en-GB' }, currency: 'GBP' }),
}));

type ClientLoaderArgs = Parameters<typeof clientLoader>[0];
type ServerResult = Awaited<ReturnType<ClientLoaderArgs['serverLoader']>>;

function result(count: number): ServerResult {
    const snapshot = { basketId: 'b1', totalItemCount: count, uniqueProductCount: 1, lastModified: String(count) };
    return {
        success: true,
        basketId: 'b1',
        basket: { basketId: 'b1', productItems: [{ quantity: count }], lastModified: String(count) },
        snapshot,
        cookie: `__sfdc_basket=${btoa(JSON.stringify(snapshot))}; Path=/`,
    } as ServerResult; // Framework serialization narrows SCAPI's unknown custom-field index signatures.
}
function Storefront() {
    useHybridBasketRefresh();
    return <div>Storefront badge: {useBasketSnapshot()?.totalItemCount}</div>;
}

beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const initial = result(1);
    if (initial.success && initial.cookie) document.cookie = initial.cookie;
});
afterEach(() => {
    document.cookie = '__sfdc_basket=; Max-Age=0; Path=/';
    vi.unstubAllGlobals();
});

describe('hybrid refresh with real router, auth fetcher, and basket provider', () => {
    it('contains a body stream failure through the framework single-fetch decoder', async () => {
        const fetch = vi.fn().mockResolvedValue(
            new Response(
                new ReadableStream({
                    start(controller) {
                        controller.error(new TypeError('Connection lost after headers'));
                    },
                }),
                { headers: { 'Content-Type': 'text/x-script', 'X-Remix-Response': 'yes' } }
            )
        );
        vi.stubGlobal('fetch', fetch);
        const routeDefaults = {
            hasAction: false,
            hasClientAction: false,
            hasClientMiddleware: false,
            hasErrorBoundary: false,
            module: '/route.js',
            clientActionModule: undefined,
            clientLoaderModule: undefined,
            clientMiddlewareModule: undefined,
            hydrateFallbackModule: undefined,
        };
        const strategy = UNSAFE_getTurboStreamSingleFetchDataStrategy(
            () => router,
            {
                entry: { imports: [], module: '/entry.client.js' },
                url: '/manifest.js',
                version: 'test',
                routes: {
                    root: { ...routeDefaults, id: 'root', hasLoader: false, hasClientLoader: false },
                    refresh: { ...routeDefaults, id: 'refresh', hasLoader: true, hasClientLoader: true },
                },
            },
            {},
            true,
            '/',
            false
        );
        const router = createMemoryRouter(
            [
                {
                    id: 'root',
                    path: '/',
                    Component: () => (
                        <AuthContext value={{ authContextVersion: 'v1' }}>
                            <BasketProvider>
                                <Storefront />
                                <Outlet />
                            </BasketProvider>
                        </AuthContext>
                    ),
                    ErrorBoundary: () => <div>Root error page</div>,
                    children: [
                        {
                            id: 'refresh',
                            path: 'resource/basket-refresh',
                            loader: (args, singleFetch) =>
                                clientLoader({
                                    ...args,
                                    url: new URL(args.request.url),
                                    pattern: '/resource/basket-refresh',
                                    serverLoader: singleFetch as ClientLoaderArgs['serverLoader'],
                                }),
                        },
                    ],
                },
            ],
            { dataStrategy: strategy }
        );
        const view = render(<RouterProvider router={router} />);
        try {
            await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
            await waitFor(() => expect(router.getFetcher('hybrid-basket-refresh').state).toBe('idle'));
            expect(router.state.errors).toBeNull();
            expect(screen.getByText('Storefront badge: 1')).toBeVisible();
            expect(parseBasketCookie(document.cookie)?.totalItemCount).toBe(1);
        } finally {
            view.unmount();
            router.dispose();
        }
    });

    it('settles an initial read whose redirect was discarded after newer navigation', async () => {
        let finish: (value: Response) => void = () => {
            throw new Error('Read not started');
        };
        const read = vi
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise<Response>((resolve) => {
                        finish = resolve;
                    })
            )
            .mockResolvedValue(result(3));
        const router = createMemoryRouter([
            {
                path: '/',
                Component: () => (
                    <AuthContext value={{ authContextVersion: 'v1' }}>
                        <BasketProvider>
                            <Storefront />
                            <Outlet />
                        </BasketProvider>
                    </AuthContext>
                ),
                children: [
                    { path: 'other', loader: () => null },
                    { path: 'resource/basket-refresh', loader: read },
                ],
            },
        ]);
        const view = render(<RouterProvider router={router} />);
        try {
            await waitFor(() => expect(read).toHaveBeenCalledOnce());
            await act(() => router.navigate('/other'));
            await act(async () => {
                finish(redirect('/login'));
                await Promise.resolve();
            });
            await waitFor(() => expect(router.getFetcher('hybrid-basket-refresh').state).toBe('idle'));
            act(() => {
                fireEvent.focus(window);
            });
            await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
            await screen.findByText('Storefront badge: 3');
            expect(router.state.location.pathname).toBe('/other');
            expect(router.state.errors).toBeNull();
        } finally {
            view.unmount();
            router.dispose();
        }
    });

    it.each([
        ['offline', () => new TypeError('Failed to fetch')],
        ['unavailable', () => new Response('Unavailable', { status: 503 })],
    ])('preserves the storefront after %s and retries on the next return', async (_label, failure) => {
        const serverLoader = vi
            .fn<ClientLoaderArgs['serverLoader']>()
            .mockResolvedValueOnce(result(1))
            .mockRejectedValueOnce(failure())
            .mockResolvedValueOnce(result(3));
        const router = createMemoryRouter([
            {
                path: '/',
                Component: () => (
                    <AuthContext value={{ authContextVersion: 'v1' }}>
                        <BasketProvider>
                            <Outlet />
                        </BasketProvider>
                    </AuthContext>
                ),
                ErrorBoundary: () => <div>Root error page</div>,
                children: [
                    { index: true, Component: Storefront },
                    {
                        path: 'resource/basket-refresh',
                        shouldRevalidate,
                        // Data mode models the framework's clientLoader -> serverLoader boundary.
                        loader: (args) =>
                            clientLoader({
                                ...args,
                                url: new URL(args.request.url),
                                pattern: '/resource/basket-refresh',
                                context: new RouterContextProvider(),
                                serverLoader,
                            }),
                    },
                ],
            },
        ]);
        const view = render(<RouterProvider router={router} />);
        try {
            await waitFor(() => expect(serverLoader).toHaveBeenCalledTimes(1));
            await waitFor(() => expect(router.getFetcher('hybrid-basket-refresh').state).toBe('idle'));
            expect(await screen.findByText('Storefront badge: 1')).toBeVisible();
            act(() => {
                fireEvent.focus(window);
            });
            await waitFor(() => expect(serverLoader).toHaveBeenCalledTimes(2));
            await waitFor(() => expect(router.getFetcher('hybrid-basket-refresh').state).toBe('idle'));
            expect(router.state.errors).toBeNull();
            expect(screen.queryByText('Root error page')).not.toBeInTheDocument();
            expect(screen.getByText('Storefront badge: 1')).toBeVisible();
            expect(parseBasketCookie(document.cookie)?.totalItemCount).toBe(1);
            act(() => {
                fireEvent.focus(window);
            });
            await screen.findByText('Storefront badge: 3');
            expect(serverLoader).toHaveBeenCalledTimes(3);
            expect(parseBasketCookie(document.cookie)?.totalItemCount).toBe(3);
        } finally {
            view.unmount();
            router.dispose();
        }
    });
});
