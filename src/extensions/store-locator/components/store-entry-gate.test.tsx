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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { mockConfig } from '@/test-utils/config';
import StoreLocatorProvider, { type SelectedStoreResolution } from '@/extensions/store-locator/providers/store-locator';
import StoreEntryGate from '@/extensions/store-locator/components/store-entry-gate';
import { useStoreEntryAdd } from '@/extensions/store-locator/hooks/use-store-entry-add';
import type { StoreEntryConfig } from '@/extensions/store-locator/lib/store-entry';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';
import { resourceRoutes } from '@/route-paths';

import { storeEntryCapabilities } from '@/extensions/store-locator/lib/store-entry-capabilities';

// Replacement boutique choosers intentionally omit store entry; keep these assertions for implementing surfaces.
const describeStoreEntry = describe.skipIf(!storeEntryCapabilities.fulfillmentFirst);

// Explicit resource/action doubles exercise the real chooser and shared client controller, not a live tenant.
const search = vi.fn();
const select = vi.fn();
const add = vi.fn();
const selection: SelectedStoreInfo = {
    id: 'A',
    name: 'Market Street flagship and neighbourhood store',
    inventoryId: 'inventory-a',
    fulfillmentMode: 'pickup',
};
const intent = {
    productId: 'variant-red-small',
    quantity: 2,
    optionItems: [{ optionId: 'wrap', optionValueId: 'yes' }],
};
const base = '/MarketStreet/en-GB';

function Page({ title }: { title: string }) {
    const entry = useStoreEntryAdd();
    return (
        <>
            <h2>{title}</h2>
            <button
                onClick={() => {
                    if (!entry.intercept(intent, add)) add(intent, entry.getSelection());
                }}>
                Add product
            </button>
        </>
    );
}

function setup({
    policy = 'required',
    enabled = true,
    initial = '/p/scarf?color=red&size=small#details',
    selectedStoreInfo,
    selectedStoreResolution,
    modes = ['pickup', 'delivery'],
    server = false,
    rootAlias = false,
}: {
    policy?: StoreEntryConfig['policy'] | 'default';
    enabled?: boolean;
    initial?: string;
    selectedStoreInfo?: SelectedStoreInfo | null;
    selectedStoreResolution?: Promise<SelectedStoreResolution>;
    modes?: StoreEntryConfig['fulfillmentModes'];
    server?: boolean;
    rootAlias?: boolean;
} = {}) {
    const config = {
        ...mockConfig,
        features: {
            ...mockConfig.features,
            storeEntry: {
                enabled,
                policy: policy === 'default' ? undefined : policy,
                fulfillmentModes: modes,
                countries: ['GB'],
            },
        },
    };
    const router = createMemoryRouter(
        [
            {
                path: rootAlias ? '/' : base,
                element: (
                    <AllProvidersWrapper config={config}>
                        <StoreLocatorProvider
                            selectedStoreInfo={selectedStoreInfo}
                            selectedStoreResolution={selectedStoreResolution}
                            entryEnabled={enabled}>
                            <main id="main-content" tabIndex={-1}>
                                <StoreEntryGate>
                                    <Outlet />
                                </StoreEntryGate>
                            </main>
                        </StoreLocatorProvider>
                    </AllProvidersWrapper>
                ),
                children: [
                    {
                        index: true,
                        id: rootAlias ? 'routes/_app._index--root-duplicate' : 'routes/_app._index',
                        element: <Page title="Home page" />,
                    },
                    { path: 'p/*', id: 'routes/_app.p.$', element: <Page title="Product page" /> },
                    { path: 'c/*', id: 'routes/_app.c.$', element: <Page title="Category page" /> },
                    { path: 'search', id: 'routes/_app.search', element: <Page title="Search page" /> },
                    { path: 'cart', id: 'routes/_app.cart', element: <Page title="Cart page" /> },
                    { path: 'checkout', id: 'routes/_checkout.checkout', element: <Page title="Checkout page" /> },
                    { path: 'account', id: 'routes/_app.account', element: <Page title="Account page" /> },
                    { path: 'help', id: 'routes/_app.help', element: <Page title="Help page" /> },
                    { path: 'legal', id: 'routes/_app.legal', element: <Page title="Legal page" /> },
                    {
                        path: 'catalogue/*',
                        id: 'verticals/fashion/routes/_app.p.$',
                        element: <Page title="SEO product page" />,
                    },
                    { path: 'campaign', handle: { storeEntryRequired: true }, element: <Page title="Campaign page" /> },
                    {
                        path: 'preview',
                        id: 'preview/_app.p.$',
                        handle: { storeEntryRequired: false },
                        element: <Page title="Preview page" />,
                    },
                ],
            },
            { path: resourceRoutes.stores, loader: search },
            { path: resourceRoutes.setSelectedStore, action: select },
        ],
        { initialEntries: [`${rootAlias ? '' : base}${initial}`] }
    );
    const ui = <RouterProvider router={router} />;
    if (!server) render(ui);
    return { router, ui, user: userEvent.setup() };
}

async function chooseStore(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('radio', { name: 'Collection' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Country' }), 'GB');
    await user.type(screen.getByRole('textbox', { name: 'Postcode' }), 'SW1A 1AA');
    await user.click(screen.getByRole('button', { name: 'Find' }));
    await user.click(await screen.findByRole('radio', { name: /Market Street flagship/ }));
}

beforeEach(() => {
    vi.resetAllMocks();
    search.mockImplementation(({ request }: { request: Request }) => ({
        success: true,
        fulfillmentMode: new URL(request.url).searchParams.get('fulfillmentMode'),
        stores: { data: [selection], total: 1, limit: 200 },
        eligibility: { A: { eligible: true } },
    }));
    select.mockImplementation(() => {
        return { success: true, selectedStoreInfo: selection };
    });
});

describeStoreEntry('merchant-configurable required entry', () => {
    it.each([
        ['/', 'Home page'],
        ['/p/scarf', 'Product page'],
        ['/c/new-arrivals', 'Category page'],
        ['/search?q=scarf', 'Search page'],
        ['/cart', 'Cart page'],
        ['/checkout', 'Checkout page'],
        ['/catalogue/scarf', 'SEO product page'],
        ['/campaign', 'Campaign page'],
    ])('gates shopping route %s before rendering its view', async (initial, title) => {
        setup({ initial });
        expect(screen.queryByText(title)).not.toBeInTheDocument();
        expect(await screen.findByText('Choose a store to continue')).toBeInTheDocument();
        expect(await screen.findByRole('dialog')).toBeVisible();
        expect(add).not.toHaveBeenCalled();
    });

    it.each([
        ['/help', 'Help page'],
        ['/legal', 'Legal page'],
        ['/account', 'Account page'],
        ['/preview', 'Preview page'],
    ])('keeps %s accessible without selection', (initial, title) => {
        setup({ initial });
        expect(screen.getByRole('heading', { name: title })).toBeVisible();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it.each(['soft', 'default'] as const)('preserves browsing for the soft/default policy: %s', (policy) => {
        const { router } = setup({ policy });
        expect(screen.getByRole('heading', { name: 'Product page' })).toBeVisible();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(router.state.location.pathname).toBe(`${base}/p/scarf`);
    });

    it('does not enforce required policy when the entry feature is disabled', () => {
        setup({ enabled: false });
        expect(screen.getByRole('heading', { name: 'Product page' })).toBeVisible();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('gates the initial server render without exposing the shopping view', () => {
        const { ui } = setup({ server: true });
        const html = renderToString(ui);
        // Both a cold module's loading state and the cached gate must withhold the shopping view.
        expect(html).toMatch(/Choose a store to continue|Loading store selection/);
        expect(html).not.toContain('Product page');
        expect(select).not.toHaveBeenCalled();
    });

    it('also gates the unprefixed root homepage alias', async () => {
        setup({ initial: '/', rootAlias: true });
        expect(screen.queryByText('Home page')).not.toBeInTheDocument();
        expect(await screen.findByRole('dialog')).toBeVisible();
    });

    it('retains the gate and a usable retry after search failure', async () => {
        search.mockResolvedValueOnce({ success: false, error: 'STORE_SEARCH_UNAVAILABLE' });
        const { user } = setup();
        await user.click(await screen.findByRole('radio', { name: 'Collection' }));
        await user.selectOptions(screen.getByRole('combobox', { name: 'Country' }), 'GB');
        await user.type(screen.getByRole('textbox', { name: 'Postcode' }), 'SW1A 1AA');
        await user.click(screen.getByRole('button', { name: 'Find' }));
        await user.click(await screen.findByRole('button', { name: 'Retry search' }));
        expect(await screen.findByRole('radio', { name: /Market Street flagship/ })).toBeVisible();
        expect(screen.queryByText('Product page')).not.toBeInTheDocument();
        expect(select).not.toHaveBeenCalled();
        expect(add).not.toHaveBeenCalled();
    });

    it.each([
        'Escape',
        'Close',
    ])('allows %s, keeps the page gated and returns focus to reopening selection', async (method) => {
        const { user, router } = setup();
        await screen.findByRole('dialog');
        if (method === 'Escape') await user.keyboard('{Escape}');
        else await user.click(screen.getByRole('button', { name: /close/i }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.queryByText('Product page')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Choose store' })).toHaveFocus();
        expect(router.state.location.pathname + router.state.location.search + router.state.location.hash).toBe(
            `${base}/p/scarf?color=red&size=small#details`
        );
        expect(select).not.toHaveBeenCalled();
        expect(add).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Choose store' }));
        expect(await screen.findByRole('dialog')).toBeVisible();
    });

    it('continues to the original deep link after success, focuses the page and never adds on arrival', async () => {
        const { user, router } = setup();
        await chooseStore(user);
        expect(await screen.findByRole('heading', { name: 'Product page' })).toBeVisible();
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(router.state.location.pathname + router.state.location.search + router.state.location.hash).toBe(
            `${base}/p/scarf?color=red&size=small#details`
        );
        await waitFor(() => expect(document.getElementById('main-content')).toHaveFocus());
        expect(select).toHaveBeenCalledTimes(1);
        expect(add).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Add product' }));
        expect(add).toHaveBeenCalledExactlyOnceWith(intent, selection);
    });

    it('retains the gate and results after selection failure, then permits an explicit retry', async () => {
        select.mockImplementationOnce(() => {
            return {
                success: false,
                code: 'STORE_CONTEXT_UNAVAILABLE',
            };
        });
        const { user } = setup();
        await chooseStore(user);
        expect(await screen.findByRole('button', { name: 'Try again' })).toBeEnabled();
        expect(screen.getByRole('radio', { name: /Market Street flagship/ })).toBeVisible();
        expect(screen.queryByText('Product page')).not.toBeInTheDocument();
        expect(add).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Try again' }));
        expect(await screen.findByRole('heading', { name: 'Product page' })).toBeVisible();
        expect(select).toHaveBeenCalledTimes(2);
        expect(add).not.toHaveBeenCalled();
    });

    it('waits for streamed selection and reveals the deep link without opening another chooser', async () => {
        let resolve!: (value: SelectedStoreResolution) => void;
        const selectedStoreResolution = new Promise<SelectedStoreResolution>((complete) => {
            resolve = complete;
        });
        setup({ selectedStoreResolution });
        expect(screen.getByText('Loading store selection…')).toHaveAttribute('role', 'status');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await act(async () => {
            resolve({ selectedStoreInfo: selection, error: null });
            await selectedStoreResolution;
        });
        expect(await screen.findByRole('heading', { name: 'Product page' })).toBeVisible();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(select).not.toHaveBeenCalled();
    });

    it('keeps help available while the streamed selection is unresolved', () => {
        setup({ initial: '/help', selectedStoreResolution: new Promise<SelectedStoreResolution>(() => {}) });
        expect(screen.getByRole('heading', { name: 'Help page' })).toBeVisible();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('skips required entry for a committed supported store/mode', () => {
        setup({ selectedStoreInfo: selection });
        expect(screen.getByRole('heading', { name: 'Product page' })).toBeVisible();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it.each([
        { ...selection, fulfillmentMode: undefined },
        { ...selection, inventoryId: undefined },
        { ...selection, fulfillmentMode: 'delivery' as const },
    ])('requires a complete selection in a currently configured mode', async (selectedStoreInfo) => {
        setup({ selectedStoreInfo, modes: ['pickup'] });
        expect(screen.queryByText('Product page')).not.toBeInTheDocument();
        expect(await screen.findByRole('textbox', { name: 'Postcode' })).toBeVisible();
        expect(screen.queryByRole('radio', { name: 'Collection' })).not.toBeInTheDocument();
    });

    it('keeps help accessible after cancellation and gates a subsequent shopping navigation', async () => {
        const { user, router } = setup();
        await screen.findByRole('dialog');
        await user.keyboard('{Escape}');
        await act(async () => {
            await router.navigate(`${base}/help`);
        });
        expect(screen.getByRole('heading', { name: 'Help page' })).toBeVisible();
        await act(async () => {
            await router.navigate(`${base}/c/new-arrivals`);
        });
        expect(screen.queryByText('Category page')).not.toBeInTheDocument();
        expect(await screen.findByRole('dialog')).toBeVisible();
    });
});
