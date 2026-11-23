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
import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedResource } from '@/lib/scapi/resource-encoding';
import { resourceRoutes, routes } from '@/route-paths';
import { shouldRevalidate } from './api-client';

// Spy on the registry walk so we can assert the trigger fires (and how often) without real fetchers.
const mockInvokeMatching = vi.fn();
vi.mock('@/lib/scapi/fetcher-registry', () => ({
    invokeMatchingFetchers: (predicate: unknown) => mockInvokeMatching(predicate),
}));

vi.mock('@salesforce/storefront-next-runtime/config', async (original) => ({
    ...(await original<Record<string, unknown>>()),
    getConfig: () => ({ features: { localInventory: { enabled: true } } }),
}));

/** Flush the `queueMicrotask` that resets the once-per-pass guard. */
const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(resolve));

// A complete `ShouldRevalidateFunctionArgs` for a mutation submission; override fields per test.
const args = (overrides: Partial<ShouldRevalidateFunctionArgs> = {}): ShouldRevalidateFunctionArgs => ({
    formAction: resourceRoutes.cartItemAdd,
    formMethod: 'POST',
    actionResult: { success: true },
    currentUrl: new URL('https://shop.example.com/cart'),
    nextUrl: new URL('https://shop.example.com/cart'),
    currentParams: {},
    nextParams: {},
    defaultShouldRevalidate: true,
    ...overrides,
});

const inv = (client: string, method = 'getX', options: unknown = {}): DecodedResource => ({ client, method, options });

/** A product invocation scoped to a specific store's inventory (`query.inventoryIds`). */
const withInventoryIds = (client = 'shopperProducts', method = 'getProduct'): DecodedResource =>
    inv(client, method, { params: { query: { inventoryIds: ['store-123'], expand: ['availability'] } } });

// Drive the route trigger and return the registry-walk predicate it handed to `invokeMatchingFetchers` — the only
// observable surface of the shipped policy now that the per-fetcher evaluator is module-private. Flushes the
// once-per-pass guard so it can be called repeatedly within one test.
const policyPredicate = async (
    overrides: Partial<ShouldRevalidateFunctionArgs> = {}
): Promise<(i: DecodedResource) => boolean> => {
    mockInvokeMatching.mockClear();
    shouldRevalidate(args(overrides));
    const predicate = mockInvokeMatching.mock.calls[0][0] as (i: DecodedResource) => boolean;
    await flushMicrotasks();
    return predicate;
};

describe('shipped revalidation policy (global mutations reload every fetcher)', () => {
    afterEach(() => vi.clearAllMocks());

    it('reloads every governed read after a global mutation, regardless of client', async () => {
        // The four reads this route governs are all priced/localized, so a site/currency/locale or shopper-context
        // switch re-scopes every one of them. Asserts each registered read shape, not just a representative client.
        const governedReads: DecodedResource[] = [
            inv('shopperBasketsV2', 'getBasket'),
            inv('shopperProducts', 'getProduct'),
            withInventoryIds('shopperProducts', 'getProducts'),
            inv('shopperSearch', 'getSearchSuggestions', { params: { query: { q: 'shoe', expand: ['prices'] } } }),
        ];
        for (const formAction of [resourceRoutes.setSiteContext, resourceRoutes.updateShopperContext]) {
            const matches = await policyPredicate({ formAction });
            for (const read of governedReads) {
                expect(matches(read)).toBe(true);
            }
        }
    });

    it('does not reload after a mutation with no matching rule', async () => {
        // Couplings deliberately left without a rule (see api-client.ts policy doc):
        // - cart writes → getBasket: provider is synced from the action's returned basket, so a reload is redundant.
        // - cart writes → product availability: a basket change reserves no inventory, so it cannot stale stock.
        // - consent / add-review: not inputs to any governed read.
        for (const formAction of [
            resourceRoutes.updateMarketingConsent,
            resourceRoutes.addReview,
            resourceRoutes.cartItemAdd,
            resourceRoutes.cartItemRemove,
            resourceRoutes.cartItemUpdate,
            resourceRoutes.promoCodeAdd,
            resourceRoutes.placeOrder,
        ]) {
            const matches = await policyPredicate({ formAction });
            expect(matches(inv('shopperBasketsV2', 'getBasket'))).toBe(false);
            expect(matches(inv('shopperProducts', 'getProduct'))).toBe(false);
            expect(matches(withInventoryIds())).toBe(false);
        }
    });

    it('does not reload after an identity transition (login / signup / logout)', async () => {
        // Identity routes are an ambient dimension for the suppress-by-default PAGE loaders (home, PLP) but NOT for
        // this resource route: the persistent basket provider re-seeds from the post-merge root-loader snapshot and
        // Set-Cookie on the identity redirect, so reloading the fetcher would re-read a basket it already holds.
        // Locks in that api-client admits isContextMutation only — identity routes must match no rule here. The routes
        // are site/locale-prefixed in practice; assert both the bare and prefixed forms.
        for (const formAction of [
            routes.login,
            routes.signup,
            routes.logout,
            '/RefArchGlobal/en-US/login',
            '/RefArchGlobal/en-US/logout',
        ]) {
            const matches = await policyPredicate({ formAction });
            expect(matches(inv('shopperBasketsV2', 'getBasket'))).toBe(false);
            expect(matches(inv('shopperProducts', 'getProduct'))).toBe(false);
            expect(matches(withInventoryIds())).toBe(false);
        }
    });

    it('does not reload for a GET request even on a global-mutation route', async () => {
        const matches = await policyPredicate({ formMethod: 'GET', formAction: resourceRoutes.setSiteContext });
        expect(matches(inv('shopperBaskets'))).toBe(false);
    });
});

// @sfdc-extension-block-start SFDC_EXT_BOPIS
describe('store-selection policy (BOPIS: reload store-scoped inventory fetchers)', () => {
    afterEach(() => vi.clearAllMocks());

    const storeSelectionMutations = [resourceRoutes.setSelectedStore, resourceRoutes.cartPickupStoreUpdate];

    it('reloads any inventoryIds-scoped fetcher after a store-selection mutation', async () => {
        for (const formAction of storeSelectionMutations) {
            const matches = await policyPredicate({ formAction });
            // Covers getProduct and the bulk getProducts child-inventory fetch uniformly — keyed on inventoryIds, not method.
            expect(matches(withInventoryIds('shopperProducts', 'getProduct'))).toBe(true);
            expect(matches(withInventoryIds('shopperProducts', 'getProducts'))).toBe(true);
        }
    });

    it('reloads product fetchers whose inventory scope is injected server-side', async () => {
        const matches = await policyPredicate({ formAction: resourceRoutes.setSelectedStore });
        // The browser no longer needs to supply inventoryIds for a store-scoped read.
        expect(matches(inv('shopperProducts', 'getProduct', { params: { query: { expand: ['availability'] } } }))).toBe(
            true
        );
        expect(matches(inv('shopperProducts', 'getProduct'))).toBe(true);
    });

    it('does not reload for a GET request on a store-selection route', async () => {
        const matches = await policyPredicate({ formMethod: 'GET', formAction: resourceRoutes.setSelectedStore });
        expect(matches(withInventoryIds())).toBe(false);
    });
});
// @sfdc-extension-block-end SFDC_EXT_BOPIS

describe('shouldRevalidate (route trigger)', () => {
    beforeEach(() => mockInvokeMatching.mockClear());
    afterEach(() => vi.clearAllMocks());

    it('always returns false (the route opts out of RR blanket auto-revalidation)', async () => {
        expect(shouldRevalidate(args())).toBe(false);
        await flushMicrotasks();
    });

    it('walks the registry once when a mutation triggers the pass', async () => {
        shouldRevalidate(args({ formAction: resourceRoutes.cartItemAdd }));
        expect(mockInvokeMatching).toHaveBeenCalledTimes(1);
        await flushMicrotasks();
    });

    it('walks the registry only once across the per-fetcher calls of a single pass', async () => {
        // RR calls shouldRevalidate once per active fetcher with identical args — simulate three.
        shouldRevalidate(args());
        shouldRevalidate(args());
        shouldRevalidate(args());
        expect(mockInvokeMatching).toHaveBeenCalledTimes(1);
        await flushMicrotasks();
        // After the microtask resets the guard, a new pass walks again.
        shouldRevalidate(args());
        expect(mockInvokeMatching).toHaveBeenCalledTimes(2);
        await flushMicrotasks();
    });

    it('walks once per distinct mutation when two mutations resolve in the same tick', async () => {
        // The dedup keys on the mutation (normalized formAction), not on a blanket "already fired" flag. Two different
        // global mutations landing in one microtask tick must each drive their own walk — the second is not swallowed.
        shouldRevalidate(args({ formAction: resourceRoutes.setSiteContext }));
        shouldRevalidate(args({ formAction: resourceRoutes.updateShopperContext }));
        expect(mockInvokeMatching).toHaveBeenCalledTimes(2);

        // Repeats of each mutation within the same tick still collapse (RR's per-fetcher burst).
        shouldRevalidate(args({ formAction: resourceRoutes.setSiteContext }));
        shouldRevalidate(args({ formAction: resourceRoutes.updateShopperContext }));
        expect(mockInvokeMatching).toHaveBeenCalledTimes(2);
        await flushMicrotasks();
    });

    it('still walks the registry for a navigation or GET (the predicate, not the trigger, scopes the reload)', async () => {
        shouldRevalidate(args({ formMethod: undefined, formAction: undefined }));
        expect(mockInvokeMatching).toHaveBeenCalledTimes(1);
        await flushMicrotasks();

        mockInvokeMatching.mockClear();
        shouldRevalidate(args({ formMethod: 'GET', formAction: resourceRoutes.setSiteContext }));
        expect(mockInvokeMatching).toHaveBeenCalledTimes(1);
        await flushMicrotasks();
    });

    it('normalizes an absolute formAction to a pathname before matching', async () => {
        // An absolute URL with a trailing `?index` must still match the bare `resourceRoutes.*` pathname.
        const matches = await policyPredicate({
            formAction: `https://shop.example.com${resourceRoutes.setSiteContext}?index`,
        });
        expect(matches(inv('shopperBaskets'))).toBe(true);
    });
});
