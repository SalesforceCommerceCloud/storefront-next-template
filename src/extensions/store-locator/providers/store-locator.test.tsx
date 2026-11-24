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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useEffect, type ComponentProps } from 'react';
import { MemoryRouter } from 'react-router';
import { renderToReadableStream } from 'react-dom/server';
import StoreLocatorProvider, {
    SelectedStoreBoundary,
    useStoreLocator,
    useStoreLocatorApi,
    type SelectedStoreResolution,
} from './store-locator';
import HomeStorePrompt from '@/extensions/store-locator/components/header/home-store-prompt';
import StoreLocatorBadge from '../components/header/store-locator-badge';
import { getStoreLocatorSearchMemoryKey } from '@/extensions/store-locator/stores/store-locator-search-memory';
import { createSelectionCoordinator } from '@/extensions/store-locator/stores/selection-coordinator';
vi.mock('@/extensions/store-locator/providers/selection', () => ({
    default: ({ children }: { children: React.ReactNode }) => children,
}));

const activeSite = vi.hoisted(() => ({ id: 'test-site' }));
vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@salesforce/storefront-next-runtime/site-context')>()),
    useSite: () => ({ site: activeSite }),
    stripPathPrefix: ({ pathname }: { pathname: string }) => (pathname === '/' ? '' : pathname),
}));
vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: () => ({ url: { prefix: '/:siteId/:localeId' } }),
}));
vi.mock('@/components/link', async () => ({
    Link: (await import('react-router')).Link,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }) }));
const first = { id: 'store-001', name: 'Downtown Store', inventoryId: 'inventory-001' };
const second = { id: 'store-002', name: 'Westside Store', inventoryId: 'inventory-002' };
let api: ReturnType<typeof useStoreLocatorApi>;
function Selection() {
    api = useStoreLocatorApi();
    const info = useStoreLocator((state) => state.selectedStoreInfo);
    const hasStore = useStoreLocator((state) => Boolean(state.selectedStoreInfo));
    return (
        <>
            <output>{info ? `${info.name} (${info.id})` : 'No store selected'}</output>
            <span>{hasStore ? 'Yes' : 'No'}</span>
        </>
    );
}
function tree(props: ComponentProps<typeof StoreLocatorProvider> = {}) {
    return (
        <StoreLocatorProvider {...props}>
            <Selection />
        </StoreLocatorProvider>
    );
}
function remember(value: unknown, site = activeSite.id) {
    sessionStorage.setItem(getStoreLocatorSearchMemoryKey(site), JSON.stringify(value));
}
const searchMemory = {
    mode: 'input' as const,
    searchParams: { countryCode: 'US', postalCode: '94105' },
    searchResult: { success: true, stores: { data: [{ id: 'store-1' }] } },
};
beforeEach(() => {
    sessionStorage.clear();
    activeSite.id = 'test-site';
});

function heldSelection() {
    let resolve!: (value: SelectedStoreResolution) => void;
    const promise = new Promise<SelectedStoreResolution>((release) => {
        resolve = release;
    });
    return { promise, resolve };
}
describe('streamed selected store', () => {
    const profile = { id: 'profile', name: 'Profile Store', inventoryId: 'inventory' };
    const mounted = vi.fn();
    function StreamedSelection() {
        api = useStoreLocatorApi();
        const selection = useStoreLocator((state) => state.selectedStoreInfo);
        return <output aria-label="Selected store">{selection?.id ?? 'empty'}</output>;
    }
    function Shell() {
        useEffect(() => {
            mounted();
        }, []);
        return <main>Shell</main>;
    }
    function streamedTree(promise: Promise<SelectedStoreResolution>, identity = 'A') {
        return (
            <StoreLocatorProvider identity={identity} selectedStoreResolution={promise}>
                <Shell />
                <StreamedSelection />
            </StoreLocatorProvider>
        );
    }
    async function release(held: ReturnType<typeof heldSelection>, selectedStoreInfo = profile) {
        await act(async () => {
            held.resolve({ selectedStoreInfo, error: null });
            await held.promise;
        });
    }
    it.each([
        'profile',
        'store',
    ] as const)('keeps the chooser and known selection after a terminal %s failure', async (error) => {
        render(
            <StoreLocatorProvider
                selectedStoreInfo={profile}
                selectedStoreResolution={Promise.resolve({ selectedStoreInfo: null, error })}>
                <SelectedStoreBoundary fallback={<span>Pending</span>}>
                    {(selection) => <button>{selection === undefined ? 'Known chooser' : 'Empty chooser'}</button>}
                </SelectedStoreBoundary>
                <StreamedSelection />
            </StoreLocatorProvider>
        );
        expect(await screen.findByRole('button')).toHaveTextContent('Known chooser');
        expect(screen.getByRole('status', { name: 'Selected store' })).toHaveTextContent('profile');
        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    });
    it('renders the shell before resolution and publishes the store without remounting it', async () => {
        mounted.mockClear();
        const held = heldSelection();
        render(streamedTree(held.promise));
        expect(screen.getByRole('main')).toHaveTextContent('Shell');
        expect(screen.getByRole('status', { name: 'Selected store' })).toHaveTextContent('empty');
        await release(held);
        expect(screen.getByRole('status', { name: 'Selected store' })).toHaveTextContent('profile');
        expect(mounted).toHaveBeenCalledTimes(1);
    });
    it('does not overwrite an optimistic selection and its rollback with an older profile read', async () => {
        const held = heldSelection();
        render(streamedTree(held.promise));
        act(() => {
            const coordinator = createSelectionCoordinator(api);
            const operation = coordinator.begin('optimistic', api.getState().generation);
            if (!operation) throw new Error('Expected operation');
            coordinator.complete(operation.id, { success: false, error: 'failed' });
        });
        await release(held);
        expect(screen.getByRole('status', { name: 'Selected store' })).toHaveTextContent('empty');
    });
    it('rejects an old read after selection A to B to A', async () => {
        const held = heldSelection();
        render(streamedTree(held.promise));
        act(() => {
            const coordinator = createSelectionCoordinator(api);
            for (const id of ['A', 'B', 'A']) {
                const operation = coordinator.begin(id, api.getState().generation);
                if (!operation) throw new Error('Expected operation');
                coordinator.complete(operation.id, {
                    success: true,
                    selectedStoreInfo: { id, inventoryId: `inv-${id}` },
                });
            }
        });
        await release(held);
        expect(screen.getByRole('status', { name: 'Selected store' })).toHaveTextContent('A');
    });
    it.each(['identity', 'site'])('discards a late response after a %s change', async (change) => {
        const oldRead = heldSelection(),
            currentRead = heldSelection();
        const { rerender } = render(streamedTree(oldRead.promise));
        if (change === 'site') activeSite.id = 'site-B';
        rerender(streamedTree(currentRead.promise, change === 'identity' ? 'B' : 'A'));
        await release(oldRead);
        expect(screen.getByRole('status', { name: 'Selected store' })).toHaveTextContent('empty');
        await release(currentRead, { ...profile, id: 'current' });
        expect(screen.getByRole('status', { name: 'Selected store' })).toHaveTextContent('current');
    });
    it('does not reuse a held old promise when identity changes before new loader data arrives', async () => {
        const held = heldSelection();
        const { rerender } = render(streamedTree(held.promise));
        rerender(streamedTree(held.promise, 'B'));
        await release(held);
        expect(screen.getByRole('status', { name: 'Selected store' })).toHaveTextContent('empty');
    });
    it.each([
        ['/', false],
        ['/', true],
        ['/cart', false],
    ] as const)('shows a loading state, no link or prompt, on auth error with home path %s and dismissal %s', async (path, dismissed) => {
        render(
            <MemoryRouter initialEntries={[path]}>
                <StoreLocatorProvider
                    homeStorePromptDismissed={dismissed}
                    selectedStoreResolution={Promise.resolve({
                        selectedStoreInfo: null,
                        error: 'profile',
                        authError: true,
                    })}>
                    <StoreLocatorBadge />
                    <HomeStorePrompt />
                </StoreLocatorProvider>
            </MemoryRouter>
        );
        await act(async () => {});
        expect(screen.queryByRole('link')).toBeNull();
        expect(screen.queryByTestId('store-locator-home-prompt')).not.toBeInTheDocument();
    });
    it('reserves space only for an eligible pending home prompt', () => {
        const held = heldSelection();
        const prompt = (dismissed = false) => (
            <MemoryRouter>
                <StoreLocatorProvider homeStorePromptDismissed={dismissed} selectedStoreResolution={held.promise}>
                    <HomeStorePrompt />
                </StoreLocatorProvider>
            </MemoryRouter>
        );
        const { container, rerender } = render(prompt());
        expect(container.querySelector('.h-36')).not.toBeNull();
        rerender(prompt(true));
        expect(container.querySelector('.h-36')).toBeNull();
    });
    it('never renders a recovery link on a late auth error', async () => {
        const held = heldSelection();
        render(
            <MemoryRouter initialEntries={['/alias/uk/cart?q=shirt']}>
                <StoreLocatorProvider selectedStoreResolution={held.promise}>
                    <Shell />
                </StoreLocatorProvider>
            </MemoryRouter>
        );
        expect(screen.getByRole('main')).toHaveTextContent('Shell');
        await act(async () => {
            held.resolve({ selectedStoreInfo: null, error: 'profile', authError: true });
            await held.promise;
        });
        expect(screen.queryByRole('link')).toBeNull();
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByRole('main')).toHaveTextContent('Shell');
    });
});

describe('StoreLocatorProvider', () => {
    it('renders children', () => {
        render(
            <StoreLocatorProvider>
                <div>Test Child</div>
            </StoreLocatorProvider>
        );
        expect(screen.getByText('Test Child')).toBeInTheDocument();
    });
    it('creates store with initial selected store info from prop', () => {
        render(tree({ selectedStoreInfo: first }));
        expect(api.getState().selectedStoreInfo).toEqual(first);
        expect(api.getState().homeStorePromptDismissed).toBe(false);
    });
    it('creates store with null when no selectedStoreInfo prop is provided', () => {
        render(tree());
        expect(api.getState().selectedStoreInfo).toBeNull();
        expect(api.getState().homeStorePromptDismissed).toBe(false);
    });
    it('creates store with null when selectedStoreInfo prop is null', () => {
        render(tree({ selectedStoreInfo: null }));
        expect(api.getState().selectedStoreInfo).toBeNull();
        expect(api.getState().homeStorePromptDismissed).toBe(false);
    });
    it('syncs the selected store after the root loader value changes', () => {
        const { rerender } = render(tree({ selectedStoreInfo: first }));
        const original = api;
        rerender(tree({ selectedStoreInfo: second }));
        expect(api).toBe(original);
        expect(api.getState().selectedStoreInfo).toEqual(second);
        expect(api.getState().homeStorePromptDismissed).toBe(false);
    });
    it('clears the selected store after the root loader value is cleared', () => {
        const { rerender } = render(tree({ selectedStoreInfo: first }));
        rerender(tree({ selectedStoreInfo: null }));
        expect(api.getState().selectedStoreInfo).toBeNull();
        expect(api.getState().homeStorePromptDismissed).toBe(false);
    });
    it('hydrates a previous store search from browser-session storage', () => {
        remember(searchMemory);
        render(tree());
        expect(api.getState()).toMatchObject(searchMemory);
    });
    it('does not hydrate search results from another site', () => {
        remember(searchMemory, 'other-site');
        render(tree());
        expect(api.getState().searchResult).toBeNull();
    });
    it('projects search memory without allowing it to overwrite selection or actions', () => {
        remember({
            mode: 'input',
            searchParams: null,
            searchResult: { success: true },
            selectedStoreInfo: { id: 'attacker' },
            generation: -1,
            close: 'not a function',
        });
        render(tree({ selectedStoreInfo: { id: 'profile' } }));
        expect(api.getState()).toMatchObject({
            mode: 'input',
            searchParams: null,
            searchResult: { success: true },
            selectedStoreInfo: { id: 'profile' },
            generation: 0,
        });
        expect(api.getState().close).toBeTypeOf('function');
    });
    it.each([
        ['guest', 'A'],
        ['A', 'guest'],
        ['A', 'B'],
        ['guest', 'new-signup'],
    ])('invalidates transient state for identity %s to %s even with null selections', (from, to) => {
        const { rerender } = render(tree({ identity: from, selectedStoreInfo: null }));
        const original = api;
        act(() => api.setState({ searchResult: searchMemory.searchResult as never, shouldSearch: true }));
        rerender(tree({ identity: to, selectedStoreInfo: null }));
        expect(api).toBe(original);
        expect(api.getState()).toMatchObject({
            generation: 1,
            searchResult: null,
            shouldSearch: false,
            selectedStoreInfo: null,
        });
    });
    it('invalidates transient state on site change without remounting children', () => {
        const mounted = vi.fn();
        function Child() {
            mounted();
            return <Selection />;
        }
        const child = <Child />;
        const { rerender } = render(
            <StoreLocatorProvider identity="A" selectedStoreInfo={first}>
                {child}
            </StoreLocatorProvider>
        );
        const original = api;
        act(() => api.setState({ generation: 2, searchResult: searchMemory.searchResult as never }));
        activeSite.id = 'other-site';
        rerender(
            <StoreLocatorProvider identity="A" selectedStoreInfo={null}>
                {child}
            </StoreLocatorProvider>
        );
        expect(api).toBe(original);
        expect(api.getState()).toMatchObject({ generation: 3, searchResult: null, selectedStoreInfo: null });
        // Selector updates may render the consumer, but the provider/store is retained.
        expect(mounted).toHaveBeenCalledTimes(1);
    });
    it('provides store context to children', () => {
        render(tree({ selectedStoreInfo: first }));
        expect(screen.getByRole('status')).toHaveTextContent('Downtown Store (store-001)');
    });
    it('useStoreLocator throws error when used outside provider', () => {
        expect(() => render(<Selection />)).toThrow('useStoreLocator must be used within StoreLocatorProvider');
    });
    it('useStoreLocator works with different selectors', () => {
        render(tree({ selectedStoreInfo: first }));
        expect(screen.getByRole('status')).toHaveTextContent('Downtown Store');
        expect(screen.getByText('Yes')).toBeInTheDocument();
    });
    it('useStoreLocator works with null selected store info', () => {
        render(tree({ selectedStoreInfo: null }));
        expect(screen.getByRole('status')).toHaveTextContent('No store selected');
    });
});

// Run server rendering after client cases: React's separate renderer retains its context slot.
describe('streamed selected store', () => {
    it('contains an SSR rejection even when its pending fallback is null', async () => {
        const errors = vi.fn();
        const stream = await renderToReadableStream(
            <StoreLocatorProvider selectedStoreResolution={Promise.reject(new Error('timeout'))}>
                <main>Shell</main>
                <SelectedStoreBoundary fallback={null}>{() => <span>Chooser</span>}</SelectedStoreBoundary>
            </StoreLocatorProvider>,
            { onError: errors }
        );
        expect(await new Response(stream).text()).toContain('Shell');
        expect(errors).not.toHaveBeenCalled();
    });

    it.each([
        { selection: null, promptVisible: true },
        { selection: { id: 'saved-store' }, promptVisible: false },
    ])('renders the $promptVisible prompt state in the first HTML frame', async ({ selection, promptVisible }) => {
        const resolution = Promise.resolve<SelectedStoreResolution>({ selectedStoreInfo: selection, error: null });
        await resolution;
        const stream = await renderToReadableStream(
            <MemoryRouter initialEntries={['/']}>
                <StoreLocatorProvider selectedStoreResolution={resolution}>
                    <HomeStorePrompt />
                </StoreLocatorProvider>
            </MemoryRouter>
        );
        const html = await new Response(stream).text();
        expect(html.includes('data-home-store-prompt')).toBe(promptVisible);
        expect(html).not.toContain('h-36');
    });
});
