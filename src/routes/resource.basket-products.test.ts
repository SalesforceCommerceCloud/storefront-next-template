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
import { loader, shouldRevalidate } from './resource.basket-products';
import { createLoaderArgs, createTestContext } from '@/lib/test-utils';
import { resourceRoutes } from '@/route-paths';
import config from '@/config/server';
import { markMiniCartPanelMounted, markMiniCartPanelUnmounted } from '@/hooks/mini-cart-store';

// Mock getBasket
vi.mock('@/middlewares/basket.server', () => ({
    getBasket: vi.fn(),
}));

// Mock createApiClients
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(),
}));

const expectedSiteId = config.app.commerce.sites[0].id;

// Mock getConfig - use importOriginal to preserve other exports like appConfigContext
vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as Record<string, unknown>),
        getConfig: vi.fn(() => ({
            commerce: {
                api: {
                    organizationId: 'test-org',
                    siteId: expectedSiteId,
                },
            },
        })),
    };
});

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

import { getBasket } from '@/middlewares/basket.server';
import { createApiClients } from '@/lib/api-clients.server';

describe('resource.basket-products', () => {
    let mockContext: ReturnType<typeof createTestContext>;

    const mockProduct1 = {
        id: 'product-1',
        name: 'Test Product 1',
        imageGroups: [{ viewType: 'small', images: [{ link: 'https://example.com/1.jpg' }] }],
    };

    const mockProduct2 = {
        id: 'product-2',
        name: 'Test Product 2',
        imageGroups: [{ viewType: 'small', images: [{ link: 'https://example.com/2.jpg' }] }],
    };

    const mockGetProducts = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockContext = createTestContext();

        vi.mocked(createApiClients).mockReturnValue({
            shopperProducts: {
                getProducts: mockGetProducts,
            },
        } as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    const getLoaderArgs = () =>
        createLoaderArgs(new Request(`http://localhost${resourceRoutes.basketProducts}`), mockContext, {
            pattern: resourceRoutes.basketProducts,
        });

    describe('shouldRevalidate', () => {
        const baseArgs = {
            currentUrl: new URL('http://localhost/'),
            currentParams: {},
            nextUrl: new URL('http://localhost/'),
            nextParams: {},
            defaultShouldRevalidate: true,
        };

        afterEach(() => {
            // The panel-open flag is module-scoped shared state; reset it so cases can't leak.
            markMiniCartPanelUnmounted();
        });

        describe('with the mini-cart panel open', () => {
            beforeEach(() => {
                markMiniCartPanelMounted();
            });

            it('revalidates when an action returns a basket payload', () => {
                // Basket-mutating actions (cart-item-add/update/remove, cart-bundle-update,
                // bonus-product-add, place-order) follow the BasketActionResponse shape
                // `{ success, basket, ... }`. While the panel is open, the resource fetcher must
                // reload to refresh the enriched line items and footer totals.
                expect(
                    shouldRevalidate({
                        ...baseArgs,
                        formAction: resourceRoutes.cartItemAdd,
                        actionResult: { success: true, basket: { basketId: 'basket-123' } },
                    })
                ).toBe(true);
            });

            it('skips when an action returns a response without a basket field', () => {
                // Non-basket actions (wishlist, locale, OTP, set-site-context, ...) return responses
                // without `basket`, so we avoid a SCAPI round-trip per unrelated submission.
                expect(
                    shouldRevalidate({
                        ...baseArgs,
                        formAction: resourceRoutes.wishlistAdd,
                        actionResult: { success: true },
                    })
                ).toBe(false);
            });

            it('skips when actionResult.basket has no basketId', () => {
                // Defensive: an action that returns a malformed/empty basket object should not
                // trigger a reload — there's nothing actionable for the mini-cart to refresh against.
                expect(
                    shouldRevalidate({
                        ...baseArgs,
                        formAction: resourceRoutes.cartItemAdd,
                        actionResult: { success: false, basket: {} },
                    })
                ).toBe(false);
            });
        });

        describe('with the mini-cart panel closed', () => {
            it('skips a basket-mutating action so a hidden flyout never enriches products', () => {
                // The closed panel has no consumer for the enriched products: the badge count and
                // every useBasket() consumer read the cookie snapshot / BasketProvider, which the
                // action handlers refresh directly. Reloading this resource here would round-trip to
                // SCAPI (getBasket read + getProducts) for a flyout no one is looking at. useMiniCartData
                // reloads on the next open only if the snapshot moved.
                expect(
                    shouldRevalidate({
                        ...baseArgs,
                        formAction: resourceRoutes.cartItemAdd,
                        actionResult: { success: true, basket: { basketId: 'basket-123' } },
                    })
                ).toBe(false);
            });
        });

        it('defers to defaultShouldRevalidate for navigation triggers regardless of panel state', () => {
            // Imperative useRevalidator().revalidate() (root.tsx, contact-info post-login) and
            // navigation triggers don't carry a formAction. Returning false unconditionally here
            // would pin the mini-cart to a stale guest basket after a guest→registered handoff,
            // since post-login revalidation is how that flow refreshes per-customer data. The
            // panel-open gate applies only to the formAction branch, so navigation defers to the
            // default whether the panel is open or closed.
            markMiniCartPanelUnmounted();
            expect(
                shouldRevalidate({
                    ...baseArgs,
                    defaultShouldRevalidate: true,
                })
            ).toBe(true);
            expect(
                shouldRevalidate({
                    ...baseArgs,
                    defaultShouldRevalidate: false,
                })
            ).toBe(false);
        });
    });

    it('should return null basket and empty productsById when basket is undefined', async () => {
        vi.mocked(getBasket).mockResolvedValue({ current: undefined } as any);

        const result = await loader(getLoaderArgs());

        expect(result).toEqual({ basket: null, productsById: {} });
        expect(mockGetProducts).not.toHaveBeenCalled();
    });

    it('should return basket and empty productsById when basket has no product items', async () => {
        const basket = { basketId: 'basket-123', productItems: [] };
        vi.mocked(getBasket).mockResolvedValue({ current: basket } as any);

        const result = await loader(getLoaderArgs());

        expect(result).toEqual({ basket, productsById: {} });
        expect(mockGetProducts).not.toHaveBeenCalled();
    });

    it('should return basket and empty productsById when items have no productId', async () => {
        const basket = {
            basketId: 'basket-123',
            productItems: [
                { itemId: 'item-1', quantity: 1 },
                { itemId: 'item-2', quantity: 2 },
            ],
        };
        vi.mocked(getBasket).mockResolvedValue({ current: basket } as any);

        const result = await loader(getLoaderArgs());

        expect(result).toEqual({ basket, productsById: {} });
        expect(mockGetProducts).not.toHaveBeenCalled();
    });

    it('should fetch and return basket plus products keyed by ID', async () => {
        const basket = {
            basketId: 'basket-123',
            productItems: [
                { itemId: 'item-1', productId: 'product-1', quantity: 1 },
                { itemId: 'item-2', productId: 'product-2', quantity: 2 },
            ],
        };
        vi.mocked(getBasket).mockResolvedValue({ current: basket } as any);

        mockGetProducts.mockResolvedValue({
            data: {
                data: [mockProduct1, mockProduct2],
            },
        });

        const result = await loader(getLoaderArgs());

        expect(result).toEqual({
            basket,
            productsById: {
                'product-1': mockProduct1,
                'product-2': mockProduct2,
            },
        });

        // siteId and organizationId are injected by the SCAPI client now that the loader routes
        // through the shared fetchProductsByIds helper, so they are no longer passed explicitly.
        expect(mockGetProducts).toHaveBeenCalledWith({
            params: {
                query: {
                    ids: ['product-1', 'product-2'],
                    allImages: true,
                    perPricebook: true,
                    currency: 'GBP',
                    expand: ['availability', 'images', 'prices', 'promotions', 'variations'],
                },
            },
        });
    });

    it('batches product IDs for baskets with more than 24 distinct products', async () => {
        // Regression for SCAPI's 24-ID getProducts cap: the mini cart routes through
        // fetchProductsByIds so an oversized basket fans out into multiple requests instead of a
        // single rejected call.
        const productItems = Array.from({ length: 25 }, (_, i) => ({
            itemId: `item-${i}`,
            productId: `product-${i}`,
            quantity: 1,
        }));
        const basket = { basketId: 'basket-123', productItems };
        vi.mocked(getBasket).mockResolvedValue({ current: basket } as any);
        mockGetProducts.mockResolvedValue({ data: { data: [] } });

        await loader(getLoaderArgs());

        // 25 IDs -> two batches (24 + 1), neither exceeding the SCAPI limit.
        expect(mockGetProducts).toHaveBeenCalledTimes(2);
        const batchSizes = mockGetProducts.mock.calls.map((call) => call[0].params.query.ids.length);
        expect(batchSizes).toEqual([24, 1]);
    });

    it('passes an explicit expand list scoped to mini-cart consumers', async () => {
        // Regression guard: cart-sheet bonus-product callouts depend on productPromotions
        // (`promotions` expand). The mini cart also reads `availability` (stock badge,
        // BOPIS inventories), `images` (imageGroups), `prices` (list/sale), and `variations`
        // (attribute chips). Asserting the full set with deep equality prevents silent drift
        // that would either re-introduce SCAPI over-fetching or drop a field a consumer relies on.
        const basket = {
            basketId: 'basket-123',
            productItems: [{ itemId: 'item-1', productId: 'product-1', quantity: 1 }],
        };
        vi.mocked(getBasket).mockResolvedValue({ current: basket } as any);
        mockGetProducts.mockResolvedValue({ data: { data: [mockProduct1] } });

        await loader(getLoaderArgs());

        const callQuery = mockGetProducts.mock.calls[0][0].params.query;
        expect(callQuery.expand).toEqual(['availability', 'images', 'prices', 'promotions', 'variations']);
    });

    it('should handle API errors gracefully', async () => {
        const basket = {
            basketId: 'basket-123',
            productItems: [{ itemId: 'item-1', productId: 'product-1', quantity: 1 }],
        };
        vi.mocked(getBasket).mockResolvedValue({ current: basket } as any);

        mockGetProducts.mockRejectedValue(new Error('API Error'));

        const result = await loader(getLoaderArgs());

        expect(result).toEqual({ basket, productsById: {} });
    });

    it('should return basket and empty productsById when API returns no data', async () => {
        const basket = {
            basketId: 'basket-123',
            productItems: [{ itemId: 'item-1', productId: 'product-1', quantity: 1 }],
        };
        vi.mocked(getBasket).mockResolvedValue({ current: basket } as any);

        mockGetProducts.mockResolvedValue({
            data: { data: null },
        });

        const result = await loader(getLoaderArgs());

        expect(result).toEqual({ basket, productsById: {} });
    });

    it('should filter out items without productId', async () => {
        vi.mocked(getBasket).mockResolvedValue({
            current: {
                basketId: 'basket-123',
                productItems: [
                    { itemId: 'item-1', productId: 'product-1', quantity: 1 },
                    { itemId: 'item-2', quantity: 2 }, // No productId
                    { itemId: 'item-3', productId: '', quantity: 3 }, // Empty productId
                ],
            },
        } as any);

        mockGetProducts.mockResolvedValue({
            data: {
                data: [mockProduct1],
            },
        });

        await loader(getLoaderArgs());

        // Should only request product-1
        expect(mockGetProducts).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({
                    query: expect.objectContaining({
                        ids: ['product-1'],
                    }),
                }),
            })
        );
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    it('should include inventoryIds when basket has pickup shipments', async () => {
        const basket = {
            basketId: 'basket-123',
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    quantity: 3,
                    shipmentId: 'pickup-shipment-1',
                    inventoryId: 'store-inventory-001',
                },
            ],
            shipments: [
                {
                    shipmentId: 'pickup-shipment-1',
                    c_fromStoreId: 'store-burlington',
                },
            ],
        };
        vi.mocked(getBasket).mockResolvedValue({ current: basket } as any);

        mockGetProducts.mockResolvedValue({
            data: { data: [mockProduct1] },
        });

        await loader(getLoaderArgs());

        expect(mockGetProducts).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({
                    query: expect.objectContaining({
                        ids: ['product-1'],
                        inventoryIds: expect.arrayContaining(['store-inventory-001']),
                        // SCAPI honors `inventoryIds` only when `availability` is in expand —
                        // dropping `availability` would silently break BOPIS pickup stock resolution.
                        expand: expect.arrayContaining(['availability']),
                    }),
                }),
            })
        );
    });

    it('should not include inventoryIds when basket has no pickup shipments', async () => {
        const basket = {
            basketId: 'basket-123',
            productItems: [{ itemId: 'item-1', productId: 'product-1', quantity: 1, shipmentId: 'delivery-shipment' }],
            shipments: [{ shipmentId: 'delivery-shipment' }],
        };
        vi.mocked(getBasket).mockResolvedValue({ current: basket } as any);

        mockGetProducts.mockResolvedValue({
            data: { data: [mockProduct1] },
        });

        await loader(getLoaderArgs());

        const callQuery = mockGetProducts.mock.calls[0][0].params.query;
        expect(callQuery).not.toHaveProperty('inventoryIds');
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
});
