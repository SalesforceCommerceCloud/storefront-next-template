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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { resourceRoutes } from '@/route-paths';
import { useMiniCartData, useMiniCartDataLoader } from './use-mini-cart-data';
import { isMiniCartPanelMounted } from './mini-cart-store';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';
import { findImageGroupBy } from '@/lib/product/image-groups-utils';

type FetcherData = {
    basket: ShopperBasketsV2.schemas['Basket'] | null;
    productsById: Record<string, ShopperProducts.schemas['Product']>;
} | null;

// Mock React Router's useFetcher
const mockFetcher = {
    state: 'idle' as 'idle' | 'loading' | 'submitting',
    data: null as FetcherData,
    load: vi.fn(),
};

vi.mock('react-router', () => ({
    href: (path: string) => path,
    useFetcher: vi.fn(() => mockFetcher),
}));

// Mock image group utility
vi.mock('@/lib/product/image-groups-utils', () => ({
    findImageGroupBy: vi.fn(() => ({
        viewType: 'small',
        images: [{ link: 'https://example.com/small.jpg', alt: 'Small image' }],
    })),
}));

const mockedFindImageGroupBy = vi.mocked(findImageGroupBy);

const mockUpdateBasket = vi.fn();
const mockSnapshot = {
    basketId: 'basket-123' as string | undefined,
    totalItemCount: 1 as number,
    uniqueProductCount: 1 as number,
};
// The full basket BasketProvider holds (with its SCAPI lastModified). Null models the cookie-only state where no
// complete basket has been loaded yet; a value models the post-mutation/post-open state the staleness check compares.
let mockCurrentBasket: ShopperBasketsV2.schemas['Basket'] | null = null;
vi.mock('@/providers/basket', () => ({
    useBasketUpdater: () => mockUpdateBasket,
    useBasket: () => mockCurrentBasket,
    useBasketSnapshot: () =>
        mockSnapshot.basketId
            ? {
                  basketId: mockSnapshot.basketId,
                  totalItemCount: mockSnapshot.totalItemCount,
                  uniqueProductCount: mockSnapshot.uniqueProductCount,
              }
            : null,
}));

describe('useMiniCartData', () => {
    const mockBasket: ShopperBasketsV2.schemas['Basket'] = {
        basketId: 'basket-123',
        productItems: [
            {
                itemId: 'item-1',
                productId: 'product-1',
                productName: 'Test Product 1',
                quantity: 2,
                price: 50,
                priceAfterItemDiscount: 45,
                variationValues: { color: 'red', size: 'M' },
            },
            {
                itemId: 'item-2',
                productId: 'product-2',
                productName: 'Test Product 2',
                quantity: 1,
                price: 100,
                priceAfterItemDiscount: 100,
            },
        ],
    };

    const mockProductsData: Record<string, ShopperProducts.schemas['Product']> = {
        'product-1': {
            id: 'product-1',
            name: 'Full Product 1',
            imageGroups: [
                {
                    viewType: 'large',
                    images: [{ link: 'https://example.com/large1.jpg', alt: 'Large image 1' }],
                },
            ],
            variationAttributes: [
                { id: 'color', name: 'Color', values: [{ value: 'red', name: 'Red' }] },
                { id: 'size', name: 'Size', values: [{ value: 'M', name: 'Medium' }] },
            ],
        },
        'product-2': {
            id: 'product-2',
            name: 'Full Product 2',
            imageGroups: [
                {
                    viewType: 'large',
                    images: [{ link: 'https://example.com/large2.jpg', alt: 'Large image 2' }],
                },
            ],
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockFetcher.state = 'idle';
        mockFetcher.data = null;
        mockFetcher.load.mockReturnValue(Promise.resolve());
        mockSnapshot.basketId = 'basket-123';
        mockSnapshot.totalItemCount = 1;
        mockSnapshot.uniqueProductCount = 1;
        mockCurrentBasket = null;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('panel-visibility flag', () => {
        it('marks the panel mounted while the hook is rendered and unmounted on cleanup', () => {
            // The flag is the open cart sheet's visibility — only the open panel mounts this hook. The
            // basket-products shouldRevalidate reads it to suppress post-action revalidation while closed.
            const { unmount } = renderHook(() => useMiniCartData());

            expect(isMiniCartPanelMounted()).toBe(true);

            unmount();

            expect(isMiniCartPanelMounted()).toBe(false);
        });
    });

    it('returns loading state on cold open before the fetcher resolves', () => {
        // Regression guard: the hook must not surface a "no basket" snapshot while the resource route
        // is still in flight on first mount. Otherwise a cold open (touch device, external
        // setMiniCartOpen(true), no prefetch) flashes the empty-cart panel for one frame. The hook
        // must report isLoading=true whenever fetcherData has not yet resolved, so the cart sheet
        // panel renders the loading state instead of empty.
        const { result } = renderHook(() => useMiniCartData());

        expect(result.current.basket).toBeNull();
        expect(result.current.productItems).toEqual([]);
        expect(result.current.productsById).toEqual({});
        expect(result.current.isLoading).toBe(true);
        expect(result.current.error).toBeNull();
        expect(mockFetcher.load).toHaveBeenCalledWith(resourceRoutes.basketProducts);
    });

    describe('when no basketId is in the snapshot', () => {
        beforeEach(() => {
            mockSnapshot.basketId = undefined;
        });

        it('does not dispatch a fetch', () => {
            // Regression guard: a fresh visitor with no __sfdc_basket cookie has no basket to enrich.
            // The cart sheet may still mount (e.g. via an externally-driven setMiniCartOpen(true)),
            // and must render an empty-cart state without forcing a SCAPI round-trip. The loader
            // also passes ensureBasket: false; this gate is the call-site half of the same defense.
            renderHook(() => useMiniCartData());

            expect(mockFetcher.load).not.toHaveBeenCalled();
        });

        it('reports isLoading=false so the panel renders the empty state instead of a permanent spinner', () => {
            const { result } = renderHook(() => useMiniCartData());

            expect(result.current.isLoading).toBe(false);
            expect(result.current.basket).toBeNull();
            expect(result.current.productItems).toEqual([]);
        });
    });

    describe('when the snapshot reports an empty basket', () => {
        beforeEach(() => {
            mockSnapshot.basketId = 'basket-123';
            mockSnapshot.totalItemCount = 0;
        });

        it('does not dispatch a fetch', () => {
            // The cookie-derived snapshot is the source of truth for "is the cart empty". When it says
            // zero items there is nothing to enrich — opening the cart sheet (or hover-prefetch) must
            // not round-trip to SCAPI. Cookie-vs-server divergence is documented in the hook; the next
            // route loader reconciles via the basket middleware.
            renderHook(() => useMiniCartData());

            expect(mockFetcher.load).not.toHaveBeenCalled();
        });

        it('reports isLoading=false so the panel renders the empty state instead of a permanent spinner', () => {
            const { result } = renderHook(() => useMiniCartData());

            expect(result.current.isLoading).toBe(false);
            expect(result.current.basket).toBeNull();
            expect(result.current.productItems).toEqual([]);
        });

        it('reloads to clear stale items when the cookie empties but the fetcher still holds a non-empty basket', () => {
            // Closed-panel empty-out (cart-page remove, post-checkout return, cross-tab clear): the action fired while
            // the panel was closed, so shouldRevalidate suppressed it and the shared fetcher cache still holds the
            // pre-empty line items. The cookie is now empty. On reopen the panel reads `basket` straight from this
            // fetcher, so without a reload it renders ghost line items + an active Checkout footer while the badge
            // (cookie-driven) correctly shows 0. The empty-cookie path must still reload to flush the stale cache.
            mockFetcher.data = { basket: mockBasket, productsById: mockProductsData };

            renderHook(() => useMiniCartData());

            expect(mockFetcher.load).toHaveBeenCalledWith(resourceRoutes.basketProducts);
        });

        it('does not loop once the fetcher holds the emptied (item-less) basket for the now-empty cookie', () => {
            // Loop guard for the empty-cookie reload above: after the reload resolves, the fetcher holds the emptied
            // basket — basketId still present (SCAPI does not delete an emptied basket), productItems []. The decision
            // must key on whether the cache holds ITEMS, not on basketId presence, or the effect re-dispatches every
            // idle cycle and hammers the resource route.
            mockFetcher.data = { basket: { basketId: 'basket-123', productItems: [] }, productsById: {} };

            renderHook(() => useMiniCartData());

            expect(mockFetcher.load).not.toHaveBeenCalled();
        });

        it('dispatches a fetch when totalItemCount transitions 0 → N (add-to-cart from empty)', () => {
            // After an add-to-cart from an empty cart the cookie flips totalItemCount 0 → 1. The effect
            // must observe the new value via the snapshot dep and fire its first load — otherwise the
            // mini-cart never picks up the newly added item.
            const { rerender } = renderHook(() => useMiniCartData());

            expect(mockFetcher.load).not.toHaveBeenCalled();

            mockSnapshot.totalItemCount = 1;
            rerender();

            expect(mockFetcher.load).toHaveBeenCalledWith(resourceRoutes.basketProducts);
        });
    });

    it('returns empty productItems when the loaded basket has no items', () => {
        mockFetcher.data = { basket: { basketId: 'basket-123', productItems: [] }, productsById: {} };

        const { result } = renderHook(() => useMiniCartData());

        expect(result.current.basket).toEqual({ basketId: 'basket-123', productItems: [] });
        expect(result.current.productItems).toEqual([]);
        expect(result.current.isLoading).toBe(false);
    });

    it('returns loading state when the fetcher is loading', () => {
        mockFetcher.state = 'loading';

        const { result } = renderHook(() => useMiniCartData());

        expect(result.current.isLoading).toBe(true);
    });

    it('merges basket items with product data', async () => {
        mockFetcher.data = { basket: mockBasket, productsById: mockProductsData };

        const { result } = renderHook(() => useMiniCartData());

        await waitFor(() => {
            expect(result.current.productItems.length).toBe(2);
        });

        const firstItem = result.current.productItems[0];
        expect(firstItem.itemId).toBe('item-1');
        expect(firstItem.quantity).toBe(2);
        expect(firstItem.price).toBe(50);
        expect(firstItem.variationAttributes).toBeDefined();
        expect(result.current.productsById).toBe(mockProductsData);
    });

    it('preserves basket-specific data when merging', async () => {
        mockFetcher.data = { basket: mockBasket, productsById: mockProductsData };

        const { result } = renderHook(() => useMiniCartData());

        await waitFor(() => {
            expect(result.current.productItems.length).toBe(2);
        });

        const firstItem = result.current.productItems[0];
        expect(firstItem.itemId).toBe('item-1');
        expect(firstItem.quantity).toBe(2);
        expect(firstItem.price).toBe(50);
        expect(firstItem.priceAfterItemDiscount).toBe(45);
    });

    it('returns basic items when product data is missing for some products', async () => {
        // Only product-1 has data — hook waits for all to be present before enriching.
        mockFetcher.data = {
            basket: mockBasket,
            productsById: { 'product-1': mockProductsData['product-1'] },
        };

        const { result } = renderHook(() => useMiniCartData());

        await waitFor(() => {
            expect(result.current.productItems.length).toBe(2);
        });

        // Both items remain basic until all product data is available.
        expect(result.current.productItems[0].itemId).toBe('item-1');
        expect(result.current.productItems[0].variationAttributes).toBeUndefined();
        expect(result.current.productItems[1].itemId).toBe('item-2');
        expect(result.current.productItems[1].productName).toBe('Test Product 2');
    });

    it('does not trigger a fetch when the fetcher already has data for the current basket', () => {
        // mockBasket has 3 total items across 2 lines; align the snapshot so its key matches the fetched
        // basket's key. Matching keys mean the persisted data is current — reopening must reuse it, not reload.
        mockSnapshot.totalItemCount = 3;
        mockSnapshot.uniqueProductCount = 2;
        mockFetcher.data = { basket: mockBasket, productsById: mockProductsData };

        renderHook(() => useMiniCartData());

        expect(mockFetcher.load).not.toHaveBeenCalled();
    });

    it('reloads when persisted data is for a different basket than the snapshot now describes', () => {
        // A mutation landed while the panel was closed (revalidation suppressed), so the cookie snapshot moved
        // but the persisted fetcher data is stale. On reopen the keys diverge and the hook reloads once.
        mockSnapshot.totalItemCount = 5;
        mockSnapshot.uniqueProductCount = 3;
        mockFetcher.data = { basket: mockBasket, productsById: mockProductsData };

        renderHook(() => useMiniCartData());

        expect(mockFetcher.load).toHaveBeenCalledWith(resourceRoutes.basketProducts);
    });

    describe('staleness via lastModified when a full basket is the reference', () => {
        it('reloads after a count-neutral mutation (variant swap) when lastModified moved', () => {
            // The bug the lastModified comparison fixes: a variant swap keeps both total item count and unique
            // line count identical, so the cookie-derived count key is unchanged and cannot signal the change.
            // BasketProvider's full basket carries the SCAPI lastModified, which DID move. With a full basket as
            // the reference, the hook compares lastModified and reloads even though the counts collide.
            mockSnapshot.totalItemCount = 3;
            mockSnapshot.uniqueProductCount = 2;
            mockCurrentBasket = { ...mockBasket, lastModified: '2026-06-23T10:00:01.000Z' };
            mockFetcher.data = {
                basket: { ...mockBasket, lastModified: '2026-06-23T10:00:00.000Z' },
                productsById: mockProductsData,
            };

            renderHook(() => useMiniCartData());

            expect(mockFetcher.load).toHaveBeenCalledWith(resourceRoutes.basketProducts);
        });

        it('does not reload when the fetched basket is newer than a lagging reference (open-panel revalidation just landed)', () => {
            // The double-request regression. On an open-panel mutation, resource.basket-products' shouldRevalidate
            // already refreshed the fetcher to the new revision (Request 1). The BasketProvider reference trails that
            // fetcher by a render — the publish-back is a parent setState that cannot converge within the same commit.
            // So at the commit the revalidated data lands, fetched is NEWER than the reference. A symmetric `!==`
            // comparison read that benign lag as "stale" and fired a redundant second basket-products load. The gate
            // must treat the just-arrived fetcher data as authoritative: a reference older than the cache is never a
            // reason to reload.
            mockSnapshot.totalItemCount = 3;
            mockSnapshot.uniqueProductCount = 2;
            mockCurrentBasket = { ...mockBasket, lastModified: '2026-06-23T10:00:00.000Z' };
            mockFetcher.data = {
                basket: { ...mockBasket, lastModified: '2026-06-23T10:00:01.000Z' },
                productsById: mockProductsData,
            };

            renderHook(() => useMiniCartData());

            expect(mockFetcher.load).not.toHaveBeenCalled();
        });

        it('reuses persisted data when the full basket lastModified matches the fetched basket', () => {
            // Steady state: the fetched basket has already been published into BasketProvider, so the reference
            // lastModified equals the cached one. No round-trip on reopen.
            mockSnapshot.totalItemCount = 3;
            mockSnapshot.uniqueProductCount = 2;
            const lastModified = '2026-06-23T10:00:00.000Z';
            mockCurrentBasket = { ...mockBasket, lastModified };
            mockFetcher.data = { basket: { ...mockBasket, lastModified }, productsById: mockProductsData };

            renderHook(() => useMiniCartData());

            expect(mockFetcher.load).not.toHaveBeenCalled();
        });

        it('does not re-dispatch once the full-basket reference and cached data share a lastModified', () => {
            // Loop guard: the load effect keys on the reference and cached lastModified. Re-renders at the
            // matched steady state must not re-fire — a regression here would hammer the resource route.
            mockSnapshot.totalItemCount = 3;
            mockSnapshot.uniqueProductCount = 2;
            const lastModified = '2026-06-23T10:00:00.000Z';
            mockCurrentBasket = { ...mockBasket, lastModified };
            mockFetcher.data = { basket: { ...mockBasket, lastModified }, productsById: mockProductsData };

            const { rerender } = renderHook(() => useMiniCartData());
            rerender();
            rerender();

            expect(mockFetcher.load).not.toHaveBeenCalled();
        });

        it('reloads on reopen when a quantity change flushed as the panel closed moved the cookie ahead of an equal reference and cache', () => {
            // The flush-on-close gap. The shopper bumps a line quantity in the mini cart and closes the panel in the
            // same beat. The close-flush PATCH persists server-side and the browser applies its Set-Cookie, so the
            // cookie snapshot moves to the new totals — but the response never reaches React: the edit handler unmounts
            // before it lands and basket-products revalidation is suppressed while the panel is closed. So BOTH the
            // BasketProvider reference and the fetcher cache stay on the pre-change revision, sharing one lastModified,
            // while the cookie reports the new quantity. A lastModified-only comparison sees equal revisions and would
            // reuse the stale cache, showing the OLD quantity on reopen. The count-visible cookie divergence must win
            // and force the reload.
            mockSnapshot.totalItemCount = 5;
            mockSnapshot.uniqueProductCount = 2;
            const lastModified = '2026-06-23T10:00:00.000Z';
            mockCurrentBasket = { ...mockBasket, lastModified };
            mockFetcher.data = { basket: { ...mockBasket, lastModified }, productsById: mockProductsData };

            renderHook(() => useMiniCartData());

            expect(mockFetcher.load).toHaveBeenCalledWith(resourceRoutes.basketProducts);
        });

        it('converges after the reopen reload republishes the flushed revision (no reload loop)', () => {
            // Loop guard for the close-flush reload above: once the reopen reload resolves, the fetcher holds the
            // flushed revision (new totals, new lastModified) and publishes it back into BasketProvider, so the
            // reference, the cache, and the cookie all agree. The next idle cycle must not re-dispatch.
            mockSnapshot.totalItemCount = 5;
            mockSnapshot.uniqueProductCount = 2;
            const flushedBasket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-123',
                lastModified: '2026-06-23T10:00:01.000Z',
                productItems: [
                    { itemId: 'item-1', productId: 'product-1', productName: 'Test Product 1', quantity: 4, price: 50 },
                    {
                        itemId: 'item-2',
                        productId: 'product-2',
                        productName: 'Test Product 2',
                        quantity: 1,
                        price: 100,
                    },
                ],
            };
            mockCurrentBasket = flushedBasket;
            mockFetcher.data = { basket: flushedBasket, productsById: mockProductsData };

            const { rerender } = renderHook(() => useMiniCartData());
            rerender();

            expect(mockFetcher.load).not.toHaveBeenCalled();
        });
    });

    describe('staleness when only a cookie snapshot is the reference', () => {
        it('reuses cached data when the count key matches and no full basket reference exists', () => {
            // No complete basket has been loaded into BasketProvider yet (returning visitor, nothing added this
            // session, panel never opened) — only the cookie snapshot, which has no lastModified. With no full-basket
            // reference to compare revisions, the count-derived key is the fallback signal: matching counts mean the
            // cached data is current, so the panel reuses it rather than round-tripping on every open. (A count-neutral
            // change in another tab is invisible here — the documented narrow gap; it self-heals on the next loader
            // run, and any mutation in THIS tab publishes a full basket that flips the comparison to lastModified.)
            mockSnapshot.totalItemCount = 3;
            mockSnapshot.uniqueProductCount = 2;
            mockCurrentBasket = null;
            mockFetcher.data = { basket: mockBasket, productsById: mockProductsData };

            renderHook(() => useMiniCartData());

            expect(mockFetcher.load).not.toHaveBeenCalled();
        });

        it('fetches when the count key diverges and no full basket reference exists', () => {
            // Cookie-only fallback still catches a count change: a mutation moved the cookie counts while the panel was
            // closed, but no full basket was published into context. The diverging count key signals stale cache.
            mockSnapshot.totalItemCount = 5;
            mockSnapshot.uniqueProductCount = 3;
            mockCurrentBasket = null;
            mockFetcher.data = { basket: mockBasket, productsById: mockProductsData };

            renderHook(() => useMiniCartData());

            expect(mockFetcher.load).toHaveBeenCalledWith(resourceRoutes.basketProducts);
        });

        it('does not fetch when the snapshot reports an empty basket even with no full basket reference', () => {
            // The empty/no-basketId skip gate still wins over "fetch to be safe": an empty cookie has nothing to
            // enrich, so neither the cold path nor the missing-lastModified path may round-trip.
            mockSnapshot.totalItemCount = 0;
            mockCurrentBasket = null;
            mockFetcher.data = { basket: { basketId: 'basket-123', productItems: [] }, productsById: {} };

            renderHook(() => useMiniCartData());

            expect(mockFetcher.load).not.toHaveBeenCalled();
        });
    });

    it('derives variation values from single-value variation attributes when basket variation values are missing', async () => {
        const basketWithoutVariationValues: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'basket-123',
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    productName: 'Test Product 1',
                    quantity: 1,
                    price: 50,
                },
            ],
        };
        mockFetcher.data = {
            basket: basketWithoutVariationValues,
            productsById: {
                'product-1': {
                    ...mockProductsData['product-1'],
                    variationValues: undefined,
                    variationAttributes: [
                        { id: 'color', name: 'Color', values: [{ value: 'yellow', name: 'Yellow' }] },
                    ],
                },
            },
        };

        const { result } = renderHook(() => useMiniCartData());

        await waitFor(() => {
            expect(result.current.productItems.length).toBe(1);
        });

        expect(mockedFindImageGroupBy).not.toHaveBeenCalled();
        expect(result.current.productItems[0].variationValues).toEqual({ color: 'yellow' });
    });

    it('uses variation image matching when explicit variation values exist', async () => {
        mockFetcher.data = { basket: mockBasket, productsById: mockProductsData };

        renderHook(() => useMiniCartData());

        await waitFor(() => {
            expect(mockedFindImageGroupBy).toHaveBeenCalledWith(expect.any(Array), {
                viewType: 'small',
                selectedVariationAttributes: { color: 'red', size: 'M' },
            });
        });
    });

    describe('publishes basket into BasketProvider', () => {
        it('writes the fetched basket via useBasketUpdater on data arrival', () => {
            mockFetcher.data = { basket: mockBasket, productsById: mockProductsData };

            renderHook(() => useMiniCartData());

            expect(mockUpdateBasket).toHaveBeenCalledWith(mockBasket);
        });

        it('does not write when fetcher data is null', () => {
            mockFetcher.data = null;

            renderHook(() => useMiniCartData());

            expect(mockUpdateBasket).not.toHaveBeenCalled();
        });

        it('does not write when fetched basket has no basketId', () => {
            mockFetcher.data = { basket: null, productsById: {} };

            renderHook(() => useMiniCartData());

            expect(mockUpdateBasket).not.toHaveBeenCalled();
        });

        it('does not re-fire on re-render with stable fetcherData reference', () => {
            // Cycle insurance: dep array is [basketId, lastModified, updateBasket]; updateBasket is
            // reference-stable, the id/lastModified pair is value-stable. A regression here would
            // cause an infinite render loop the moment BasketProvider's context update re-rendered
            // the hook.
            mockFetcher.data = { basket: mockBasket, productsById: mockProductsData };

            const { rerender } = renderHook(() => useMiniCartData());
            rerender();
            rerender();

            expect(mockUpdateBasket).toHaveBeenCalledTimes(1);
        });

        it('does not re-fire when a revalidation returns a fresh data object with identical lastModified', () => {
            // Regression guard: fetcher.data flips to a new object reference on every revalidation,
            // even when SCAPI returns an unchanged basket. Without keying the publisher effect on
            // `basketId + lastModified`, every harmless revalidation would re-publish into context
            // and fan out renders across every useBasket() consumer (PDP, PLP, checkout, header).
            const basketWithLastModified = { ...mockBasket, lastModified: '2026-05-17T12:00:00.000Z' };
            mockFetcher.data = { basket: basketWithLastModified, productsById: mockProductsData };

            const { rerender } = renderHook(() => useMiniCartData());

            // Simulate a revalidation that returned an identical basket: new top-level object,
            // new productsById object, but same basketId + lastModified.
            mockFetcher.data = {
                basket: { ...basketWithLastModified },
                productsById: { ...mockProductsData },
            };
            rerender();

            expect(mockUpdateBasket).toHaveBeenCalledTimes(1);
        });

        it('re-fires when lastModified changes', () => {
            const basketA = { ...mockBasket, lastModified: '2026-05-17T12:00:00.000Z' };
            mockFetcher.data = { basket: basketA, productsById: mockProductsData };

            const { rerender } = renderHook(() => useMiniCartData());

            const basketB = { ...mockBasket, lastModified: '2026-05-17T12:00:01.000Z' };
            mockFetcher.data = { basket: basketB, productsById: mockProductsData };
            rerender();

            expect(mockUpdateBasket).toHaveBeenCalledTimes(2);
            expect(mockUpdateBasket).toHaveBeenLastCalledWith(basketB);
        });
    });
});

describe('useMiniCartDataLoader', () => {
    beforeEach(() => {
        mockFetcher.state = 'idle';
        mockFetcher.data = null;
        mockFetcher.load.mockReset();
        mockSnapshot.basketId = 'basket-123';
        mockSnapshot.totalItemCount = 1;
        mockSnapshot.uniqueProductCount = 1;
        mockCurrentBasket = null;
    });

    it('loads the basket-products resource when called', () => {
        const { result } = renderHook(() => useMiniCartDataLoader());

        act(() => {
            result.current();
        });

        expect(mockFetcher.load).toHaveBeenCalledWith(resourceRoutes.basketProducts);
    });

    it('skips dispatch when fetcher is in flight', () => {
        mockFetcher.state = 'loading';

        const { result } = renderHook(() => useMiniCartDataLoader());

        act(() => {
            result.current();
        });

        expect(mockFetcher.load).not.toHaveBeenCalled();
    });

    // A cached basket of 2 items across 1 line — keyed as `basket-123:2:1`.
    const cachedBasket: ShopperBasketsV2.schemas['Basket'] = {
        basketId: 'basket-123',
        productItems: [{ itemId: 'item-1', productId: 'product-1', quantity: 2 }],
    };

    it('skips dispatch when fetcher already has data for the current basket', () => {
        // Align the snapshot to the cached basket's counts so the keys match. Matching keys mean the warm
        // cache is current — a hover must not round-trip.
        mockSnapshot.totalItemCount = 2;
        mockSnapshot.uniqueProductCount = 1;
        mockFetcher.data = { basket: cachedBasket, productsById: {} };

        const { result } = renderHook(() => useMiniCartDataLoader());

        act(() => {
            result.current();
        });

        expect(mockFetcher.load).not.toHaveBeenCalled();
    });

    it('dispatches when cached data is stale for the basket the snapshot now describes', () => {
        // A mutation landed while the panel was closed (revalidation suppressed), so the cookie snapshot
        // moved but the persisted fetcher data is for the old basket. A subsequent hover must re-warm the
        // cache — the prefetch path picks up the outstanding fetch, not just the very first cold warm.
        mockSnapshot.totalItemCount = 5;
        mockSnapshot.uniqueProductCount = 3;
        mockFetcher.data = { basket: cachedBasket, productsById: {} };

        const { result } = renderHook(() => useMiniCartDataLoader());

        act(() => {
            result.current();
        });

        expect(mockFetcher.load).toHaveBeenCalledWith(resourceRoutes.basketProducts);
    });

    it('skips dispatch when no basketId is in the snapshot', () => {
        mockSnapshot.basketId = undefined;

        const { result } = renderHook(() => useMiniCartDataLoader());

        act(() => {
            result.current();
        });

        expect(mockFetcher.load).not.toHaveBeenCalled();
    });

    it('skips dispatch when the snapshot reports an empty basket', () => {
        // A hover-prefetch on an empty cart should not round-trip — the cookie already tells us there
        // are no items to enrich. Mirrors the call-site gate in useMiniCartData.
        mockSnapshot.totalItemCount = 0;

        const { result } = renderHook(() => useMiniCartDataLoader());

        act(() => {
            result.current();
        });

        expect(mockFetcher.load).not.toHaveBeenCalled();
    });

    it('dispatches on a count-neutral change when the full basket reference lastModified moved', () => {
        // Hover-prefetch parity with the panel: after a variant swap the counts are unchanged, so the count key
        // alone would treat the warm cache as current. The full basket reference (published by the add handler)
        // carries a moved lastModified, so the hover re-warms the cache for the swapped basket.
        mockSnapshot.totalItemCount = 2;
        mockSnapshot.uniqueProductCount = 1;
        mockCurrentBasket = { ...cachedBasket, lastModified: '2026-06-23T10:00:01.000Z' };
        mockFetcher.data = {
            basket: { ...cachedBasket, lastModified: '2026-06-23T10:00:00.000Z' },
            productsById: {},
        };

        const { result } = renderHook(() => useMiniCartDataLoader());

        act(() => {
            result.current();
        });

        expect(mockFetcher.load).toHaveBeenCalledWith(resourceRoutes.basketProducts);
    });

    it('skips dispatch when the cached data is newer than a lagging reference', () => {
        // Prefetch-path parity with the panel's double-request guard: a hover firing right after an open-panel
        // revalidation must not re-warm a cache that is already newer than the trailing BasketProvider reference.
        // Directional comparison — an older reference is render-lag, not staleness.
        mockSnapshot.totalItemCount = 2;
        mockSnapshot.uniqueProductCount = 1;
        mockCurrentBasket = { ...cachedBasket, lastModified: '2026-06-23T10:00:00.000Z' };
        mockFetcher.data = {
            basket: { ...cachedBasket, lastModified: '2026-06-23T10:00:01.000Z' },
            productsById: {},
        };

        const { result } = renderHook(() => useMiniCartDataLoader());

        act(() => {
            result.current();
        });

        expect(mockFetcher.load).not.toHaveBeenCalled();
    });

    it('skips dispatch when the full basket reference lastModified matches the cached data', () => {
        // Steady state on the prefetch path: the reference revision equals the cached one, so a hover must not
        // round-trip even though this is the cookie-only fallback's "matching counts" case too.
        mockSnapshot.totalItemCount = 2;
        mockSnapshot.uniqueProductCount = 1;
        const lastModified = '2026-06-23T10:00:00.000Z';
        mockCurrentBasket = { ...cachedBasket, lastModified };
        mockFetcher.data = { basket: { ...cachedBasket, lastModified }, productsById: {} };

        const { result } = renderHook(() => useMiniCartDataLoader());

        act(() => {
            result.current();
        });

        expect(mockFetcher.load).not.toHaveBeenCalled();
    });

    it('dispatches when a close-flush moved the cookie ahead of an equal reference and cache', () => {
        // Prefetch-path parity with the panel's close-flush reload: a hover after the shopper changed a quantity and
        // closed the panel must re-warm the cache. The reference and the cache share the pre-change revision (one
        // lastModified); the cookie moved to the new totals. The count divergence forces the re-warm even though the
        // revisions match, so the panel opens on fresh data rather than the stale pre-close quantity.
        mockSnapshot.totalItemCount = 5;
        mockSnapshot.uniqueProductCount = 1;
        const lastModified = '2026-06-23T10:00:00.000Z';
        mockCurrentBasket = { ...cachedBasket, lastModified };
        mockFetcher.data = { basket: { ...cachedBasket, lastModified }, productsById: {} };

        const { result } = renderHook(() => useMiniCartDataLoader());

        act(() => {
            result.current();
        });

        expect(mockFetcher.load).toHaveBeenCalledWith(resourceRoutes.basketProducts);
    });

    it('returns a reference-stable callback across renders', () => {
        // Regression guard: like useBasketLoader, this callback ends up wired into
        // the cart-badge prefetch and downstream useEffect dep arrays. The ref-mirror pattern keeps
        // identity stable; this test fails if a future refactor reintroduces fetcher-keyed deps.
        const { result, rerender } = renderHook(() => useMiniCartDataLoader());

        const first = result.current;
        rerender();
        rerender();
        expect(result.current).toBe(first);
    });
});
