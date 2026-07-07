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

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '@/scapi';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
import { loader } from './_app.cart';
import { createTestContext, ROUTE_PATTERN } from '@/lib/test-utils';
import type { Route } from './+types/_app.cart';

vi.mock('@/middlewares/basket.server', () => ({
    getBasket: vi.fn(),
    getBasketSnapshot: vi.fn(),
}));

vi.mock('@/lib/cart/basket-products.server', () => ({
    fetchProductsInBasket: vi.fn(),
}));

vi.mock('@/lib/cart/basket-promotions.server', () => ({
    fetchPromotionsForBasket: vi.fn(),
}));

vi.mock('@/lib/cart/cart-wishlist.server', () => ({
    fetchWishlistProductIdsForCart: vi.fn(),
}));

vi.mock('@/lib/wishlist/fetch-initial-state.server', () => ({
    fetchWishlistInitialState: vi.fn(() => Promise.resolve({ customerId: null, productIds: new Set() })),
}));

vi.mock('@/lib/product/recommendations.server', () => ({
    fetchProductRecommendations: vi.fn(),
}));

// Per-page UI flags. Default to the canonical value (recommendations on); the
// gating test flips it to assert the loader skips the Einstein fetches.
vi.mock('@/lib/config.ui', () => ({
    uiConfig: { pages: { cart: { showRecommendations: true } } },
}));

vi.mock('@/lib/cart/rule-based-bonus.server', () => ({
    fetchRuleBasedBonusProductsForBasket: vi.fn(),
}));

// @sfdc-extension-block-start SFDC_EXT_BOPIS
vi.mock('@/extensions/bopis/lib/api/stores.server', () => ({
    fetchStoresForBasket: vi.fn(),
}));
// @sfdc-extension-block-end SFDC_EXT_BOPIS

import { getBasket, getBasketSnapshot } from '@/middlewares/basket.server';
import { fetchProductsInBasket } from '@/lib/cart/basket-products.server';
import { fetchPromotionsForBasket } from '@/lib/cart/basket-promotions.server';
import { fetchWishlistProductIdsForCart } from '@/lib/cart/cart-wishlist.server';
import { fetchProductRecommendations } from '@/lib/product/recommendations.server';
import { fetchRuleBasedBonusProductsForBasket } from '@/lib/cart/rule-based-bonus.server';
import { uiConfig } from '@/lib/config.ui';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { fetchStoresForBasket } from '@/extensions/bopis/lib/api/stores.server';
// @sfdc-extension-block-end SFDC_EXT_BOPIS

describe('Cart route loader', () => {
    const mockBasket = {
        basketId: 'basket-123',
        productItems: [{ itemId: 'item-1', productId: 'product-1', quantity: 1 }],
        currency: 'USD',
    };

    const createLoaderArgs = (): Route.LoaderArgs => ({
        params: { siteId: 'test-site', localeId: 'en-US' },
        context: createTestContext({ currency: 'USD' }),
        request: new Request('http://localhost/cart'),
        url: new URL('http://localhost/cart'),
        pattern: ROUTE_PATTERN,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset to canonical default — the gating test mutates this.
        uiConfig.pages.cart.showRecommendations = true;
        vi.mocked(getBasket).mockResolvedValue({ current: mockBasket } as any);
        vi.mocked(getBasketSnapshot).mockReturnValue({
            basketId: 'basket-123',
            totalItemCount: 1,
            uniqueProductCount: 1,
            currency: 'USD',
            lastModified: '',
        });
        vi.mocked(fetchProductsInBasket).mockResolvedValue({
            productsByItemId: { 'item-1': { id: 'product-1' } as any },
            bonusProductsById: {},
        });
        vi.mocked(fetchPromotionsForBasket).mockResolvedValue({});
        vi.mocked(fetchWishlistProductIdsForCart).mockResolvedValue([]);
        vi.mocked(fetchProductRecommendations).mockResolvedValue({ recs: [] });
        vi.mocked(fetchRuleBasedBonusProductsForBasket).mockResolvedValue({});
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        vi.mocked(fetchStoresForBasket).mockResolvedValue(new Map());
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
    });

    test('returns basketDataPromise, wishlistProductIdsPromise, basketSnapshot, and pageUrl', () => {
        const result = loader(createLoaderArgs()) as any;

        expect(result).toHaveProperty('basketDataPromise');
        expect(result).toHaveProperty('wishlistProductIdsPromise');
        expect(result.basketSnapshot).toEqual({
            basketId: 'basket-123',
            totalItemCount: 1,
            uniqueProductCount: 1,
            currency: 'USD',
            lastModified: '',
        });
        expect(result.pageUrl).toContain('/cart');
    });

    test('skips the Einstein recommendation fetches when recommendations are disabled', async () => {
        uiConfig.pages.cart.showRecommendations = false;

        const result = loader(createLoaderArgs()) as any;

        await expect(result.cartMayAlsoLikePromise).resolves.toEqual({});
        await expect(result.cartRecentlyViewedPromise).resolves.toEqual({});
        expect(fetchProductRecommendations).not.toHaveBeenCalled();
    });

    test('issues the Einstein recommendation fetches when recommendations are enabled', async () => {
        const result = loader(createLoaderArgs()) as any;
        await result.cartMayAlsoLikePromise;
        await result.cartRecentlyViewedPromise;

        expect(fetchProductRecommendations).toHaveBeenCalled();
    });

    test('basketDataPromise resolves to basket, products, promotions, and stores (no wishlist)', async () => {
        const result = loader(createLoaderArgs()) as any;
        const data = await result.basketDataPromise;

        expect(data).toHaveProperty('basket');
        expect(data).toHaveProperty('productsByItemId');
        expect(data).toHaveProperty('bonusProductsById');
        expect(data).toHaveProperty('promotions');
        expect(data).toHaveProperty('storesByStoreId');
        expect(data).not.toHaveProperty('wishlistProductIds');
        expect(data.basket).toEqual(mockBasket);
        expect(data.productsByItemId).toEqual({ 'item-1': { id: 'product-1' } });
        expect(data.bonusProductsById).toEqual({});
        expect(data.promotions).toEqual({});
        expect(data.storesByStoreId).toEqual({});
    });

    test('wishlistProductIdsPromise resolves independently of basketDataPromise', async () => {
        vi.mocked(fetchWishlistProductIdsForCart).mockResolvedValue(['wish-1', 'wish-2']);

        const result = loader(createLoaderArgs()) as any;

        await expect(result.wishlistProductIdsPromise).resolves.toEqual(['wish-1', 'wish-2']);
    });

    test('wishlist failure does NOT reject basketDataPromise (silent degradation)', async () => {
        vi.mocked(fetchWishlistProductIdsForCart).mockRejectedValue(new NormalizedApiError(new Error('wishlist down')));

        const result = loader(createLoaderArgs()) as any;

        // Wishlist promise rejects ...
        await expect(result.wishlistProductIdsPromise).rejects.toThrow(NormalizedApiError);
        // ... but basket promise still resolves cleanly.
        await expect(result.basketDataPromise).resolves.toMatchObject({ basket: mockBasket });
    });

    test('basketDataPromise rejects with NormalizedApiError when getBasket fails', async () => {
        const apiError = new ApiError({
            status: 500,
            statusText: 'Server Error',
            headers: new Headers(),
            body: { type: 'Server Error', title: 'Server Error', detail: 'Basket down' },
            rawBody: JSON.stringify({ detail: 'Basket down' }),
            url: 'https://api.example.com/baskets',
            method: 'GET',
        });
        vi.mocked(getBasket).mockRejectedValue(new NormalizedApiError(apiError));

        const result = loader(createLoaderArgs()) as any;

        await expect(result.basketDataPromise).rejects.toThrow(NormalizedApiError);
        await expect(result.basketDataPromise).rejects.toMatchObject({ status: 500 });
    });

    test('basketDataPromise rejects with NormalizedApiError when fetchProductsInBasket fails', async () => {
        vi.mocked(fetchProductsInBasket).mockRejectedValue(new NormalizedApiError(new TypeError('Network failure')));

        const result = loader(createLoaderArgs()) as any;

        await expect(result.basketDataPromise).rejects.toThrow(NormalizedApiError);
        await expect(result.basketDataPromise).rejects.toThrow('Network failure');
    });

    test('defers two recommendation promises and forwards request', async () => {
        const result = loader(createLoaderArgs()) as any;

        expect(result.cartMayAlsoLikePromise).toBeInstanceOf(Promise);
        expect(result.cartRecentlyViewedPromise).toBeInstanceOf(Promise);

        // CART_RECENTLY_VIEWED fires immediately (no basket dependency).
        // CART_MAY_ALSO_LIKE chains off basketDataPromise — it only fires once that resolves.
        await result.basketDataPromise;
        await result.cartMayAlsoLikePromise;
        await result.cartRecentlyViewedPromise;

        const fetchEnriched = vi.mocked(fetchProductRecommendations);
        expect(fetchEnriched).toHaveBeenCalledTimes(2);

        const mayAlsoLikeCall = fetchEnriched.mock.calls.find(
            ([, opts]) => (opts as { name: string }).name === 'product-to-product-einstein'
        );
        expect(mayAlsoLikeCall).toBeDefined();
        const mayAlsoLikeOpts = mayAlsoLikeCall?.[1] as { products?: unknown[] } | undefined;
        expect(mayAlsoLikeOpts?.products?.length).toBeGreaterThanOrEqual(1);
    });

    test('passes a deduplicated products array to CART_MAY_ALSO_LIKE', async () => {
        // Two cart lines mapping to the same parent productId would double-count in Einstein
        // if the loader passed `Object.values(productsByItemId)` directly. The loader's rec
        // chain dedups by `product.id` before invoking `fetchProductRecommendations`.
        const sharedProduct = { id: 'p-1', name: 'Shirt' } as any;
        vi.mocked(fetchProductsInBasket).mockResolvedValue({
            productsByItemId: {
                'i-1': sharedProduct,
                'i-2': sharedProduct,
            },
            bonusProductsById: {},
        });

        const result = loader(createLoaderArgs()) as any;
        await result.basketDataPromise;
        await result.cartMayAlsoLikePromise;

        const fetchEnriched = vi.mocked(fetchProductRecommendations);
        const mayAlsoLikeCall = fetchEnriched.mock.calls.find(
            ([, opts]) => (opts as { name: string }).name === 'product-to-product-einstein'
        );
        const mayAlsoLikeOpts = mayAlsoLikeCall?.[1] as { products?: { id: string }[] } | undefined;
        // Critically: 1 product, not 2.
        expect(mayAlsoLikeOpts?.products).toHaveLength(1);
        expect(mayAlsoLikeOpts?.products?.[0]?.id).toBe('p-1');

        const recentlyViewedCall = fetchEnriched.mock.calls.find(
            ([, opts]) => (opts as { name: string }).name === 'viewed-recently-einstein'
        );
        expect(recentlyViewedCall).toBeDefined();
    });

    test('cartMayAlsoLikePromise silently degrades when basketDataPromise rejects', async () => {
        vi.mocked(getBasket).mockRejectedValue(new NormalizedApiError(new Error('basket down')));

        const result = loader(createLoaderArgs()) as any;

        await expect(result.basketDataPromise).rejects.toThrow();
        await expect(result.cartMayAlsoLikePromise).resolves.toEqual({});
    });

    test('exposes ruleBasedBonusProductsPromise that chains off basketDataPromise', async () => {
        vi.mocked(fetchRuleBasedBonusProductsForBasket).mockResolvedValue({ 'promo-1': [{ productId: 'h1' } as any] });

        const result = loader(createLoaderArgs()) as any;

        expect(result.ruleBasedBonusProductsPromise).toBeInstanceOf(Promise);
        await result.basketDataPromise;
        await expect(result.ruleBasedBonusProductsPromise).resolves.toEqual({
            'promo-1': [{ productId: 'h1' }],
        });
    });

    test('invokes the rule-based bonus helper exactly once with the resolved basket and configured limit', async () => {
        vi.mocked(fetchRuleBasedBonusProductsForBasket).mockResolvedValue({});

        const result = loader(createLoaderArgs()) as any;
        await result.ruleBasedBonusProductsPromise;

        expect(fetchRuleBasedBonusProductsForBasket).toHaveBeenCalledTimes(1);
        // `createTestContext` wires `appConfigContext` from `@/config/server`, which sets
        // `pages.cart.ruleBasedProductLimit: 50`. Pin the literal so a config drift or a typo in the
        // loader's `?? 25` fallback gets caught here, not silently in CI.
        expect(fetchRuleBasedBonusProductsForBasket).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ basketId: 'basket-123' }),
            50
        );
    });

    test('ruleBasedBonusProductsPromise silently degrades to {} when basketDataPromise rejects', async () => {
        vi.mocked(getBasket).mockRejectedValue(new NormalizedApiError(new Error('basket down')));

        const result = loader(createLoaderArgs()) as any;

        await expect(result.basketDataPromise).rejects.toThrow();
        await expect(result.ruleBasedBonusProductsPromise).resolves.toEqual({});
        // When the basket-data chain rejects upstream of the helper, the helper itself must not be invoked
        // — its caller (`basketDataPromise.then(...)`) never runs the success branch.
        expect(fetchRuleBasedBonusProductsForBasket).not.toHaveBeenCalled();
    });

    test('loader works with empty basket', async () => {
        vi.mocked(getBasket).mockResolvedValue({
            current: { basketId: 'basket-123', productItems: [], currency: 'USD' },
        } as any);
        vi.mocked(fetchProductsInBasket).mockResolvedValue({ productsByItemId: {}, bonusProductsById: {} });

        const result = loader(createLoaderArgs()) as any;
        const data = await result.basketDataPromise;

        expect(data.basket?.productItems).toEqual([]);
        expect(data.productsByItemId).toEqual({});
        expect(data.bonusProductsById).toEqual({});
        expect(data.promotions).toEqual({});
    });
});
