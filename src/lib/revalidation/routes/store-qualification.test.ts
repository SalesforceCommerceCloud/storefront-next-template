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
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, data, type ShouldRevalidateFunctionArgs } from 'react-router';
import { shouldRevalidate as home } from './home';
import { shouldRevalidate as root } from './root';
import { shouldRevalidate as cart } from './cart';
import { shouldRevalidate as checkout } from './checkout';
import { shouldRevalidate as listing } from './category';
import { shouldRevalidate as wishlist } from './wishlist';
import { shouldRevalidate as pastPurchases } from './buy-it-again';
import { shouldRevalidate as content } from './content';
import { shouldRevalidate as product } from './product';
import { shouldRevalidate as api } from './api-client';
import { createFetcherRegistration } from '@/lib/scapi/fetcher-registry';
import { encodeResource } from '@/lib/scapi/resource-encoding';
import { resourceRoutes } from '@/route-paths';
import { createStoreLocatorStore } from '@/extensions/store-locator/stores/store-locator-store';
import {
    createSelectionCoordinator,
    type SelectionResult,
} from '@/extensions/store-locator/stores/selection-coordinator';
import type { StoreSelectionEffects } from '@/extensions/store-locator/lib/selection-effects';
import { isStoreQualificationMutation } from './shared';

describe('store qualification contract boundaries', () => {
    it.each([
        ['unchanged', false],
        ['committed', true],
        ['reconciled', true],
        ['unknown', false],
        [undefined, true],
        [null, true],
        ['custom', true],
    ] as const)('handles native context %s conservatively', (nativeContext, refresh) => {
        const result = { effects: { storeSelection: 'committed', nativeContext } };
        expect(isStoreQualificationMutation(resourceRoutes.setSelectedStore, result)).toBe(refresh);
        expect(isStoreQualificationMutation(resourceRoutes.cartItemAdd, result)).toBe(false);
        expect(isStoreQualificationMutation(resourceRoutes.setSelectedStore, { ...result, outcome: 'unknown' })).toBe(
            false
        );
        expect(
            isStoreQualificationMutation(resourceRoutes.setSelectedStore, {
                effects: { storeSelection: 'unknown', nativeContext },
            })
        ).toBe(false);
    });

    it.each([
        undefined,
        null,
        {},
        { effects: null },
        { effects: {} },
    ])('refreshes a custom action without explicit native effects: %j', (result) => {
        expect(isStoreQualificationMutation(resourceRoutes.setSelectedStore, result)).toBe(true);
    });
});

const canonical = { id: 'B', name: 'B', inventoryId: 'inventory-b' };
const old = { id: 'A', inventoryId: 'inventory-a' };
const effects = (
    storeSelection: StoreSelectionEffects['storeSelection'],
    nativeContext: StoreSelectionEffects['nativeContext']
): StoreSelectionEffects => ({ storeSelection, nativeContext });
const scenarios = [
    {
        name: 'native commit',
        status: 200,
        refresh: true,
        priceAfter: 20,
        result: { success: true, selectedStoreInfo: canonical, effects: effects('committed', 'committed') },
    },
    {
        name: 'preference only',
        status: 200,
        refresh: false,
        priceAfter: 10,
        result: { success: true, selectedStoreInfo: canonical, effects: effects('committed', 'unchanged') },
    },
    {
        name: 'invalid request',
        status: 400,
        refresh: false,
        priceAfter: 10,
        result: { success: false, effects: effects('unchanged', 'unchanged') },
    },
    {
        name: 'basket consent refusal',
        status: 409,
        refresh: false,
        priceAfter: 10,
        result: { success: false, effects: effects('unchanged', 'unchanged') },
    },
    {
        name: 'account-default failure after commit',
        status: 502,
        refresh: true,
        priceAfter: 20,
        result: {
            success: false,
            selectedStoreInfo: canonical,
            error: 'PREFERRED_STORE_PERSISTENCE_FAILED',
            effects: effects('committed', 'committed'),
        },
    },
    {
        name: 'lost native response',
        status: 502,
        refresh: false,
        priceAfter: 20,
        result: { success: false, outcome: 'unknown' as const, effects: effects('unknown', 'unknown') },
    },
    {
        name: 'native readback conflict',
        status: 409,
        refresh: false,
        priceAfter: 20,
        result: { success: false, outcome: 'unknown' as const, effects: effects('unknown', 'unknown') },
    },
    {
        name: 'native reconciliation',
        status: 200,
        refresh: true,
        priceAfter: 20,
        result: { success: true, selectedStoreInfo: canonical, effects: effects('reconciled', 'reconciled') },
    },
    {
        name: 'off-mode reconciliation',
        status: 200,
        refresh: false,
        priceAfter: 10,
        result: { success: true, selectedStoreInfo: canonical, effects: effects('reconciled', 'unchanged') },
    },
];

describe.each([
    ['home', home],
    ['listing', listing],
    ['wishlist', wishlist],
    ['past purchases', pastPurchases],
    ['CMS product components', content],
] as const)('%s store qualification — real Router', (_name, policy) => {
    it.each(scenarios)('$name', async (scenario) => {
        let nativePrice = 10;
        const loader = vi.fn(() => ({ price: nativePrice }));
        const router = createMemoryRouter(
            [
                { id: 'page', path: '/shop', loader, shouldRevalidate: policy, Component: () => null },
                {
                    path: resourceRoutes.setSelectedStore,
                    action: () => {
                        nativePrice = scenario.priceAfter;
                        return data(scenario.result, { status: scenario.status });
                    },
                },
            ],
            { initialEntries: ['/shop'] }
        );
        try {
            await vi.waitFor(() => expect(router.state.initialized).toBe(true));
            const before = loader.mock.calls.length;
            await router.fetch('selection', 'page', resourceRoutes.setSelectedStore, {
                formMethod: 'POST',
                formData: new FormData(),
            });
            expect(loader.mock.calls.length - before).toBe(scenario.refresh ? 1 : 0);
            expect(router.state.loaderData.page.price).toBe(scenario.refresh ? scenario.priceAfter : 10);
        } finally {
            router.dispose();
        }
    });
});

describe.each([
    ['root', root],
    ['cart', cart],
    ['checkout', checkout],
    ['PDP', product],
] as const)('%s store and inventory effects — real Router', (_name, policy) => {
    it.each(scenarios)('$name', async (scenario) => {
        const refresh =
            !('outcome' in scenario.result) &&
            (scenario.result.effects.storeSelection !== 'unchanged' ||
                scenario.result.effects.nativeContext !== 'unchanged');
        const loader = vi.fn(() => ({}));
        const router = createMemoryRouter(
            [
                { id: 'page', path: '/shop', loader, shouldRevalidate: policy, Component: () => null },
                {
                    path: resourceRoutes.setSelectedStore,
                    action: () => data(scenario.result, { status: scenario.status }),
                },
            ],
            { initialEntries: ['/shop'] }
        );
        try {
            await vi.waitFor(() => expect(router.state.initialized).toBe(true));
            const before = loader.mock.calls.length;
            await router.fetch('selection', 'page', resourceRoutes.setSelectedStore, {
                formMethod: 'POST',
                formData: new FormData(),
            });
            expect(loader.mock.calls.length - before).toBe(refresh ? 1 : 0);
        } finally {
            router.dispose();
        }
    });
});

describe('store qualification — real fetcher registry', () => {
    it.each(scenarios)('$name', async (scenario) => {
        const definitions = [
            {
                name: 'price',
                client: 'shopperProducts',
                method: 'getProduct',
                query: { expand: ['prices', 'promotions'] },
                qualified: true,
            },
            { name: 'default-product', client: 'shopperProducts', method: 'getProduct', query: {}, qualified: true },
            {
                name: 'availability',
                client: 'shopperProducts',
                method: 'getProduct',
                query: { expand: ['availability'] },
                qualified: false,
            },
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            {
                name: 'store-inventory',
                client: 'shopperProducts',
                method: 'getProducts',
                query: { expand: ['availability'], inventoryIds: ['inventory-a'] },
                qualified: false,
                inventory: true,
            },
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
            {
                name: 'images',
                client: 'shopperProducts',
                method: 'getProduct',
                query: { expand: ['images'] },
                qualified: false,
            },
            {
                name: 'none',
                client: 'shopperProducts',
                method: 'getProduct',
                query: { expand: ['none'] },
                qualified: false,
            },
            { name: 'empty', client: 'shopperProducts', method: 'getProduct', query: { expand: [] }, qualified: true },
            {
                name: 'non-array',
                client: 'shopperProducts',
                method: 'getProduct',
                query: { expand: 'images' },
                qualified: true,
            },
            {
                name: 'non-string',
                client: 'shopperProducts',
                method: 'getProduct',
                query: { expand: [null, 1, {}] },
                qualified: true,
            },
            {
                name: 'mixed-none',
                client: 'shopperProducts',
                method: 'getProduct',
                query: { expand: ['none', 'images'] },
                qualified: true,
            },
            {
                name: 'unknown-product-method',
                client: 'shopperProducts',
                method: 'custom',
                query: { expand: ['images'] },
                qualified: true,
            },
            { name: 'basket', client: 'shopperBasketsV2', method: 'getBasket', query: {}, qualified: true },
            {
                name: 'suggestions-images',
                client: 'shopperSearch',
                method: 'getSearchSuggestions',
                query: { expand: ['images'] },
                qualified: false,
            },
            {
                name: 'suggestions-none',
                client: 'shopperSearch',
                method: 'getSearchSuggestions',
                query: { expand: ['none'] },
                qualified: true,
            },
            // Native OAS: suggestions include prices by default, even without expand.
            {
                name: 'suggestions-default',
                client: 'shopperSearch',
                method: 'getSearchSuggestions',
                query: {},
                qualified: true,
            },
            {
                name: 'custom-expansion',
                client: 'shopperProducts',
                method: 'getProduct',
                query: { expand: ['merchant_value'] },
                qualified: true,
            },
            { name: 'custom-method', client: 'merchant', method: 'read', query: {}, qualified: true },
        ];
        const counts: Record<string, number> = {};
        const router = createMemoryRouter(
            [
                { id: 'page', path: '/shop', Component: () => null },
                {
                    id: 'api',
                    path: '/api/:name',
                    loader: ({ params }) => {
                        const name = params.name;
                        if (!name) throw new Error('Expected resource name');
                        counts[name] = (counts[name] ?? 0) + 1;
                        return {};
                    },
                    shouldRevalidate: api,
                },
                {
                    path: resourceRoutes.setSelectedStore,
                    action: () => data(scenario.result, { status: scenario.status }),
                },
            ],
            { initialEntries: ['/shop'] }
        );
        const handles: ReturnType<typeof createFetcherRegistration>[] = [];
        try {
            await vi.waitFor(() => expect(router.state.initialized).toBe(true));
            for (const def of definitions) {
                const key = encodeResource(def.client, def.method, {
                    params: { path: { id: def.name }, query: def.query },
                });
                const href = `/api/${def.name}`;
                router.getFetcher(key);
                const handle = createFetcherRegistration(key);
                handles.push(handle);
                handle.register(async () => {
                    await router.fetch(key, 'page', href);
                }, href);
                await router.fetch(key, 'page', href);
            }
            await router.fetch('selection', 'page', resourceRoutes.setSelectedStore, {
                formMethod: 'POST',
                formData: new FormData(),
            });
            await vi.waitFor(() =>
                expect([...router.state.fetchers.values()].every((f) => f.state === 'idle')).toBe(true)
            );
            for (const def of definitions) {
                // Preserve the independent inventory rule for known outcomes; an uncertain write waits for recovery.
                const uncertain = scenario.result.effects.nativeContext === 'unknown';
                const refresh =
                    !uncertain &&
                    (('inventory' in def && def.inventory === true) || (scenario.refresh && def.qualified));
                expect(counts[def.name], def.name).toBe(refresh ? 2 : 1);
            }
        } finally {
            handles.forEach((handle) => handle.unregister());
            router.dispose();
            await new Promise<void>((resolve) => queueMicrotask(resolve));
        }
    });
});

describe('selection and qualified price settlement', () => {
    it('keeps the selected store and refreshed financial result aligned after a profile-default failure', async () => {
        const store = createStoreLocatorStore();
        store.getState().setSelectedStoreInfo(old);
        const coordinator = createSelectionCoordinator(store);
        const operation = coordinator.begin('B', 0);
        if (!operation) throw new Error('Expected operation');
        const scenario = scenarios.find((s) => s.status === 502 && s.refresh);
        if (!scenario) throw new Error('Expected partial-failure scenario');
        let nativePrice = 10;
        const router = createMemoryRouter(
            [
                {
                    id: 'page',
                    path: '/shop',
                    loader: () => ({ price: nativePrice }),
                    shouldRevalidate: listing,
                    Component: () => null,
                },
                {
                    path: resourceRoutes.setSelectedStore,
                    action: () => {
                        nativePrice = 20;
                        return data(scenario.result, { status: 502 });
                    },
                },
            ],
            { initialEntries: ['/shop'] }
        );
        let result: SelectionResult | undefined;
        const unsubscribe = router.subscribe((state) => {
            const value = state.fetchers.get('selection')?.data;
            if (value !== undefined) result = value as SelectionResult;
        });
        try {
            await vi.waitFor(() => expect(router.state.initialized).toBe(true));
            await router.fetch('selection', 'page', resourceRoutes.setSelectedStore, {
                formMethod: 'POST',
                formData: operation.formData,
            });
            coordinator.complete(operation.id, result);
            expect(store.getState().selectedStoreInfo).toEqual(canonical);
            expect(router.state.loaderData.page.price).toBe(20);
            expect(store.getState().selectionError).toBe('PREFERRED_STORE_PERSISTENCE_FAILED');
            expect(store.getState().confirmedSelection).toBeNull();
        } finally {
            unsubscribe();
            router.dispose();
        }
    });

    it.each([home, listing, wishlist])('keeps unknown/custom action contracts conservative', (policy) => {
        const args = {
            currentUrl: new URL('https://example.com/shop'),
            nextUrl: new URL('https://example.com/shop'),
            currentParams: {},
            nextParams: {},
            formAction: resourceRoutes.setSelectedStore,
            formMethod: 'POST',
            defaultShouldRevalidate: true,
        } as ShouldRevalidateFunctionArgs;
        expect(policy(args)).toBe(true);
    });
});

describe('PDP inventory and pricing during store changes', () => {
    it.each(scenarios)('$name', async (scenario) => {
        const loader = vi.fn(() => ({ price: scenario.priceAfter }));
        const router = createMemoryRouter(
            [
                { id: 'page', path: '/shop', loader, shouldRevalidate: product, Component: () => null },
                {
                    path: resourceRoutes.setSelectedStore,
                    action: () => data(scenario.result, { status: scenario.status }),
                },
            ],
            { initialEntries: ['/shop'] }
        );
        try {
            await vi.waitFor(() => expect(router.state.initialized).toBe(true));
            const before = loader.mock.calls.length;
            await router.fetch('selection', 'page', resourceRoutes.setSelectedStore, {
                formMethod: 'POST',
                formData: new FormData(),
            });
            // Inventory still refreshes for a preference change; explicit no-ops and unknown outcomes do not.
            const unchanged =
                scenario.result.effects.nativeContext === 'unchanged' &&
                scenario.result.effects.storeSelection === 'unchanged';
            expect(loader.mock.calls.length - before).toBe(
                scenario.result.effects.nativeContext === 'unknown' || unchanged ? 0 : 1
            );
        } finally {
            router.dispose();
        }
    });
});

describe('unknown write followed by existing read-only reconciliation', () => {
    it.each([
        true,
        false,
    ])('settles the canonical store and prices without replaying the native write (committed=%s)', async (remotelyCommitted) => {
        const store = createStoreLocatorStore();
        store.getState().setSelectedStoreInfo(old);
        const coordinator = createSelectionCoordinator(store);
        let nativePrice = 10;
        let attempts = 0;
        let recoveryReads = 0;
        const router = createMemoryRouter(
            [
                {
                    id: 'page',
                    path: '/shop',
                    loader: () => ({ price: nativePrice }),
                    shouldRevalidate: listing,
                    Component: () => null,
                },
                {
                    path: resourceRoutes.setSelectedStore,
                    action: async ({ request }) => {
                        if ((await request.formData()).get('intent') === 'reconcile') {
                            recoveryReads++;
                            return {
                                success: true,
                                selectedStoreInfo: remotelyCommitted ? canonical : old,
                                effects: effects('reconciled', 'reconciled'),
                            };
                        }
                        attempts++;
                        if (remotelyCommitted) nativePrice = 20;
                        return data(
                            { success: false, outcome: 'unknown', effects: effects('unknown', 'unknown') },
                            { status: 502 }
                        );
                    },
                },
            ],
            { initialEntries: ['/shop'] }
        );
        let result: SelectionResult | undefined;
        const unsubscribe = router.subscribe((state) => {
            const value = state.fetchers.get('selection')?.data;
            if (value !== undefined) result = value as SelectionResult;
        });
        try {
            await vi.waitFor(() => expect(router.state.initialized).toBe(true));
            const operation = coordinator.begin('B', 0);
            if (!operation) throw new Error('Expected write');
            await router.fetch('selection', 'page', resourceRoutes.setSelectedStore, {
                formMethod: 'POST',
                formData: operation.formData,
            });
            coordinator.complete(operation.id, result);
            expect(store.getState().selectedStoreInfo).toMatchObject(old);
            expect(store.getState().selectionError).toBe('outcome_unknown');
            expect(router.state.loaderData.page.price).toBe(10);
            const recovery = coordinator.retry(0);
            if (!recovery) throw new Error('Expected recovery');
            expect(recovery.formData.get('intent')).toBe('reconcile');
            await router.fetch('selection', 'page', resourceRoutes.setSelectedStore, {
                formMethod: 'POST',
                formData: recovery.formData,
            });
            coordinator.complete(recovery.id, result);
            expect(store.getState().selectedStoreInfo).toMatchObject(remotelyCommitted ? canonical : old);
            expect(router.state.loaderData.page.price).toBe(remotelyCommitted ? 20 : 10);
            expect(store.getState().selectionError).toBeNull();
            expect(attempts).toBe(1);
            expect(recoveryReads).toBe(1);
        } finally {
            unsubscribe();
            router.dispose();
        }
    });
});
