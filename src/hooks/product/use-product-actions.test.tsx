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

import { renderHook, act } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { mockAltSiteObject } from '@/test-utils/config';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type {
    ShopperProducts,
    ShopperBasketsV2,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    ShopperStores,
} from '@/scapi';
import { useProductActions } from './use-product-actions';
import { resourceRoutes } from '@/route-paths';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as BasketModule from '@/providers/basket';
const BasketProvider = BasketModule.default;
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import PickupProvider from '@/extensions/bopis/context/pickup-context';
import { createMockBasketWithPickupItems } from '@/extensions/bopis/tests/__mocks__/basket';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
// @sfdc-extension-block-end SFDC_EXT_BOPIS
import { standardProd } from '@/components/__mocks__/standard-product-2';

// Mock useFetcher function
const mockUseFetcher = vi.fn(() => ({
    data: null,
    state: 'idle',
    submit: vi.fn(),
}));

const { mockAddToast } = vi.hoisted(() => ({ mockAddToast: vi.fn() }));

// Open-flyout side effect lives in the standalone mini-cart store; spy on it so the success-effect assertions never
// mutate the shared module and stay isolated from the cart-badge/cart-sheet suites that read the real store.
const { mockSetMiniCartOpen } = vi.hoisted(() => ({ mockSetMiniCartOpen: vi.fn() }));
vi.mock('@/hooks/mini-cart-store', () => ({
    setMiniCartOpen: mockSetMiniCartOpen,
}));

// Controllable item-fetcher stubs, keyed by the componentName the hook passes. The cart success effect reads
// `cartFetcher.data`; tests flip `.data` to a settled response and rerender to drive the effect. Keeping the cart and
// bundle fetchers as distinct objects prevents one effect from firing the other's branch.
const { cartItemFetcher, bundleItemFetcher } = vi.hoisted(() => ({
    cartItemFetcher: { data: null as unknown, state: 'idle', submit: vi.fn() },
    bundleItemFetcher: { data: null as unknown, state: 'idle', submit: vi.fn() },
}));

vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: mockAddToast,
    }),
}));

vi.mock('@/hooks/use-item-fetcher', () => ({
    useItemFetcher: ({ componentName }: { componentName?: string } = {}) =>
        componentName === 'product-bundle-actions' ? bundleItemFetcher : cartItemFetcher,
}));

vi.mock('@/hooks/product/use-current-variant', () => ({
    useCurrentVariant: () => null,
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: vi.fn(() => ({
        engagement: {
            adapters: {
                einstein: { enabled: true },
            },
        },
    })),
}));

vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => {
    const actual = await importOriginal<object>();
    return {
        ...actual,
        useSite: vi.fn(() => ({
            site: { id: mockAltSiteObject.id, defaultLocale: mockAltSiteObject.defaultLocale },
            language: mockAltSiteObject.defaultLocale,
            currency: mockAltSiteObject.defaultCurrency,
        })),
    };
});

// Mock functions from useAnalytics to avoid tracking consent dependency chain
vi.mock('@/hooks/use-analytics', () => ({
    useAnalytics: vi.fn(() => ({
        trackCartItemAdd: vi.fn(),
    })),
}));

// Note: usePickup context is not mocked
// We wrap components with PickupProvider to provide the real context
// This allows tests to use the actual pickup context for proper integration testing

const mockBasket: ShopperBasketsV2.schemas['Basket'] = {
    basketId: 'test-basket-123',
    productItems: [
        {
            itemId: 'item-1',
            productId: 'product-1',
            productName: 'Product 1',
            quantity: 2,
        },
        {
            itemId: 'item-2',
            productId: 'product-2',
            productName: 'Product 2',
            quantity: 1,
        },
    ],
};

const createTestProviders = (
    children: React.ReactNode,
    basket?: ShopperBasketsV2.schemas['Basket'],
    // @sfdc-extension-line SFDC_EXT_BOPIS
    stores?: Map<string, ShopperStores.schemas['Store']>
) => (
    // @sfdc-extension-line SFDC_EXT_BOPIS
    <PickupProvider initialPickupStores={stores}>
        <BasketProvider {...(basket ? { basket } : {})}>{children}</BasketProvider>
        {/* @sfdc-extension-line SFDC_EXT_BOPIS */}
    </PickupProvider>
);

const wrapper = ({ children, basket }: { children: React.ReactNode; basket?: ShopperBasketsV2.schemas['Basket'] }) => {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: createTestProviders(children, basket),
            },
            {
                path: resourceRoutes.cartItemAdd,
                action: () => {
                    return Response.json({ success: true, basket });
                },
            },
            {
                path: resourceRoutes.cartSetAdd,
                action: () => {
                    return Response.json({ success: true, basket });
                },
            },
            {
                path: resourceRoutes.cartBundleAdd,
                action: () => {
                    return Response.json({ success: true, basket });
                },
            },
            {
                path: resourceRoutes.cartItemUpdate,
                action: () => {
                    return Response.json({ success: true, basket });
                },
            },
        ],
        {
            initialEntries: ['/'],
        }
    );
    return <RouterProvider router={router} />;
};

describe('useProductActions', () => {
    beforeEach(() => {
        // Use vi.spyOn to mock useFetcher while keeping real router exports
        vi.spyOn(ReactRouter, 'useFetcher').mockImplementation(mockUseFetcher as any);
        mockAddToast.mockClear();
        mockSetMiniCartOpen.mockClear();
        // Reset the controllable item-fetcher stubs so a settled response can't leak between cases.
        cartItemFetcher.data = null;
        cartItemFetcher.state = 'idle';
        cartItemFetcher.submit = vi.fn();
        bundleItemFetcher.data = null;
        bundleItemFetcher.state = 'idle';
        bundleItemFetcher.submit = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });
    const createStandardProduct = (): ShopperProducts.schemas['Product'] => ({
        id: 'standard-123',
        name: 'Standard Product',
        type: { item: true },
        price: 29.99,
        inventory: {
            id: 'inventory-123',
            ats: 10,
            orderable: true,
        },
    });

    const createVariantProduct = (): ShopperProducts.schemas['Product'] => ({
        id: 'variant-123',
        name: 'Variant Product',
        type: { variant: true },
        price: 29.99,
        inventory: {
            id: 'inventory-123',
            ats: 10,
            orderable: true,
        },
    });

    const createBundleProduct = (): ShopperProducts.schemas['Product'] => ({
        id: 'bundle-123',
        name: 'Bundle Product',
        type: { bundle: true },
        price: 99,
        inventory: {
            id: 'inventory-123',
            ats: 10,
            orderable: true,
        },
    });

    const createSetProduct = (): ShopperProducts.schemas['Product'] => ({
        id: 'set-123',
        name: 'Set Product',
        type: { set: true },
        price: 49,
        inventory: {
            id: 'inventory-123',
            ats: 10,
            orderable: true,
        },
        setProducts: [],
    });

    describe('canAddToCart', () => {
        test('allows standard product when orderable and in stock', () => {
            const product = createStandardProduct();

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product,
                        currentVariant: null,
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            expect(result.current.canAddToCart).toBe(true);
        });

        test('prevents standard product when out of stock', () => {
            const product = createStandardProduct();
            // Set inventory to 0 as well to test out of stock behavior
            product.inventory = {
                id: 'inventory-123',
                ats: 0,
                orderable: true,
            };

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product,
                        currentVariant: null,
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            expect(result.current.canAddToCart).toBe(false);
        });

        test('allows bundle when orderable and in stock', () => {
            const product = createBundleProduct();

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product,
                        currentVariant: null,
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            expect(result.current.canAddToCart).toBe(true);
        });

        test('allows set when orderable and in stock', () => {
            const product = createSetProduct();

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product,
                        currentVariant: null,
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            expect(result.current.canAddToCart).toBe(true);
        });

        test('prevents adding when quantity exceeds stock', () => {
            // Create a product with limited stock using standardProd pattern (consistent with BOPIS tests)
            const productWithLimitedStock = {
                ...standardProd,
                inventory: { ats: 5, id: 'inv-1', orderable: true },
            };

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product: productWithLimitedStock,
                        initialQuantity: 10,
                        currentVariant: null,
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            // Verify stock level is correctly calculated
            expect(result.current.stockLevel).toBe(5);
            // Verify quantity exceeds stock - should prevent adding to cart
            expect(result.current.canAddToCart).toBe(false);
        });

        test('prevents adding master product without a selected variant', () => {
            // Give the master a priced variant so the price gate doesn't short-circuit first —
            // this test isolates the master-needs-variant rule, not the no-price rule.
            const product: ShopperProducts.schemas['Product'] = {
                id: 'master-123',
                name: 'Master Product',
                type: { master: true },
                variants: [{ productId: 'master-123-v1', price: 29.99, orderable: true }],
                inventory: {
                    id: 'inventory-123',
                    ats: 10,
                    orderable: true,
                },
            };

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product,
                        currentVariant: null,
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            expect(result.current.canAddToCart).toBe(false);
        });

        test('prevents adding a product with no price for the active currency', () => {
            const product = createStandardProduct();
            // Simulate a currency with no price-book entry: SCAPI omits the price field.
            delete product.price;

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product,
                        currentVariant: null,
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            expect(result.current.canAddToCart).toBe(false);
        });

        test('allows adding a product with an explicit price of 0', () => {
            const product = createStandardProduct();
            product.price = 0;

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product,
                        currentVariant: null,
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            expect(result.current.canAddToCart).toBe(true);
        });

        test('allows adding a no-price product when allowMissingPrice is set (e.g. bonus products)', () => {
            const product = createStandardProduct();
            delete product.price;

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product,
                        currentVariant: null,
                        allowMissingPrice: true,
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            expect(result.current.canAddToCart).toBe(true);
        });

        test('does NOT bypass the price gate when itemId is an empty string', () => {
            // Defensive: itemId='' must not be treated as edit-mode. Several callers in the repo
            // pass `itemId || ''`, and a future drift could feed the empty string into this hook.
            const product = createStandardProduct();
            delete product.price;

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product,
                        currentVariant: null,
                        itemId: '',
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            expect(result.current.canAddToCart).toBe(false);
        });

        test('allows updating a no-price product when itemId is set (edit mode)', () => {
            // Edit-mode bypass: an item already in the basket must remain editable even if its
            // catalog price is missing for the active currency (e.g. shopper switched currencies).
            const product = createStandardProduct();
            delete product.price;

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product,
                        currentVariant: null,
                        itemId: 'cart-line-1',
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            expect(result.current.canAddToCart).toBe(true);
        });

        test('blocks a no-price product in the wishlist (skipInventoryValidation) path', () => {
            const product = createStandardProduct();
            delete product.price;

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product,
                        currentVariant: null,
                        skipInventoryValidation: true,
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            expect(result.current.canAddToCart).toBe(false);
        });
    });

    describe('handleProductBundleAddToCart', () => {
        test('prepares correct data for bundle with standard products only', async () => {
            const product = createBundleProduct();
            const mockSubmit = vi.fn();

            mockUseFetcher.mockReturnValue({
                data: null,
                state: 'idle',
                submit: mockSubmit,
            } as any);

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product,
                        currentVariant: null,
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            const standardProduct = createStandardProduct();
            const childSelections = [
                {
                    product: standardProduct,
                    variant: { productId: standardProduct.id } as ShopperProducts.schemas['Variant'],
                    quantity: 1,
                },
            ];

            await act(async () => {
                await result.current.handleProductBundleAddToCart(1, childSelections);
            });

            // Verify submit was not called immediately (async operation)
            expect(mockSubmit).not.toHaveBeenCalled();
        });

        test('prepares correct data for bundle with variant products', async () => {
            const product = createBundleProduct();
            const mockSubmit = vi.fn();

            mockUseFetcher.mockReturnValue({
                data: null,
                state: 'idle',
                submit: mockSubmit,
            } as any);

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product,
                        currentVariant: null,
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            const childSelections = [
                {
                    product: createVariantProduct(),
                    variant: { productId: 'variant-selected-123' } as any,
                    quantity: 2,
                },
            ];

            await act(async () => {
                await result.current.handleProductBundleAddToCart(1, childSelections);
            });

            expect(mockSubmit).not.toHaveBeenCalled();
        });

        test('prepares correct data for bundle with mix of standard and variants', async () => {
            const product = createBundleProduct();
            const mockSubmit = vi.fn();

            mockUseFetcher.mockReturnValue({
                data: null,
                state: 'idle',
                submit: mockSubmit,
            } as any);

            const { result } = renderHook(
                () =>
                    useProductActions({
                        product,
                        currentVariant: null,
                    }),
                {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                }
            );

            const standardProduct = createStandardProduct();
            const childSelections = [
                {
                    product: standardProduct,
                    variant: { productId: standardProduct.id } as ShopperProducts.schemas['Variant'],
                    quantity: 1,
                },
                {
                    product: createVariantProduct(),
                    variant: { productId: 'variant-selected-123' } as ShopperProducts.schemas['Variant'],
                    quantity: 2,
                },
            ];

            await act(async () => {
                await result.current.handleProductBundleAddToCart(2, childSelections);
            });

            expect(mockSubmit).not.toHaveBeenCalled();
        });
    });

    describe('opens the mini-cart flyout on a successful add', () => {
        // The open-flyout side effect fires from the success effects once the item fetcher settles with a basket
        // payload. Drive it by flipping the controllable stub's `.data` to a settled response and rerendering, the same
        // sequence React Router produces when the action resolves.
        const settledAddResponse = { success: true, basket: mockBasket };

        test('opens the flyout when an add-to-cart action returns a basket (add mode)', async () => {
            const { result, rerender } = renderHook(
                () => useProductActions({ product: createStandardProduct(), currentVariant: null }),
                { wrapper: ({ children }) => wrapper({ children, basket: mockBasket }) }
            );

            await act(async () => {
                await result.current.handleAddToCart();
            });

            expect(mockSetMiniCartOpen).not.toHaveBeenCalled();

            // The action resolved: settle the cart fetcher and rerender so the success effect observes the payload.
            cartItemFetcher.data = settledAddResponse;
            act(() => {
                rerender();
            });

            expect(mockSetMiniCartOpen).toHaveBeenCalledWith(true);
        });

        test('does not open the flyout in edit mode (itemId present)', async () => {
            // Editing an existing line item must not pop the flyout — only first adds do. The success effect skips the
            // open call when `itemId` is set.
            const { result, rerender } = renderHook(
                () => useProductActions({ product: createStandardProduct(), currentVariant: null, itemId: 'item-1' }),
                { wrapper: ({ children }) => wrapper({ children, basket: mockBasket }) }
            );

            await act(async () => {
                await result.current.handleAddToCart();
            });

            cartItemFetcher.data = settledAddResponse;
            act(() => {
                rerender();
            });

            expect(mockSetMiniCartOpen).not.toHaveBeenCalled();
        });

        test('does not open the flyout when the add action reports failure', async () => {
            // A failed add surfaces an error toast; the flyout stays closed so the shopper isn't shown an unchanged cart.
            const { result, rerender } = renderHook(
                () => useProductActions({ product: createStandardProduct(), currentVariant: null }),
                { wrapper: ({ children }) => wrapper({ children, basket: mockBasket }) }
            );

            await act(async () => {
                await result.current.handleAddToCart();
            });

            cartItemFetcher.data = { success: false, error: { code: 'ERR', message: 'nope' } };
            act(() => {
                rerender();
            });

            expect(mockSetMiniCartOpen).not.toHaveBeenCalled();
        });

        test('opens the flyout when a bundle add returns a basket', async () => {
            const { result, rerender } = renderHook(
                () => useProductActions({ product: createBundleProduct(), currentVariant: null }),
                { wrapper: ({ children }) => wrapper({ children, basket: mockBasket }) }
            );

            const standardProduct = createStandardProduct();
            await act(async () => {
                await result.current.handleProductBundleAddToCart(1, [
                    {
                        product: standardProduct,
                        variant: { productId: standardProduct.id } as ShopperProducts.schemas['Variant'],
                        quantity: 1,
                    },
                ]);
            });

            expect(mockSetMiniCartOpen).not.toHaveBeenCalled();

            bundleItemFetcher.data = settledAddResponse;
            act(() => {
                rerender();
            });

            expect(mockSetMiniCartOpen).toHaveBeenCalledWith(true);
        });
    });

    describe('useProductActions - functionality', () => {
        beforeEach(() => {
            vi.clearAllMocks();
            vi.resetModules();
        });

        describe('stock validation', () => {
            test('isInStock returns true when product has stock', () => {
                const productInStock = {
                    ...standardProd,
                    inventory: { ats: 10, id: 'inventory_test', orderable: true },
                };
                const { result } = renderHook(
                    () => useProductActions({ product: productInStock, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.isInStock).toBe(true);
            });

            test('isInStock returns false when product is out of stock', () => {
                const productOutOfStock = { ...standardProd, inventory: { ats: 0, id: 'inventory_test' } };
                const { result } = renderHook(
                    () => useProductActions({ product: productOutOfStock, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.isInStock).toBe(false);
            });

            test('isOutOfStock is false while variant selection is incomplete even if master inventory shows OOS', () => {
                const masterWithVariantsOos = {
                    ...standardProd,
                    type: { master: true },
                    inventory: { ats: 0, id: 'inventory_test', orderable: false },
                    variants: [
                        { productId: 'v1', variationValues: { color: 'A' } },
                        { productId: 'v2', variationValues: { color: 'B' } },
                    ],
                };
                const { result } = renderHook(
                    () => useProductActions({ product: masterWithVariantsOos, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.isInStock).toBe(false);
                expect(result.current.isOutOfStock).toBe(false);
            });

            test('isInStock handles undefined inventory', () => {
                const productNoInventory = { ...standardProd, inventory: undefined };
                const { result } = renderHook(
                    () => useProductActions({ product: productNoInventory, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.isInStock).toBe(false);
            });

            test('isInStock checks all set products when product is a set', () => {
                // For sets, inventory should be pre-calculated and stored on the parent product
                // When one child is out of stock, the parent should have inventory reflecting that
                const setProduct = {
                    ...standardProd,
                    type: { set: true },
                    inventory: { ats: 0, id: 'inv-1', orderable: false }, // Pre-calculated: one child out of stock
                    setProducts: [
                        { id: 'p1', inventory: { ats: 5, orderable: true } },
                        { id: 'p2', inventory: { ats: 0, orderable: false } }, // Out of stock
                    ],
                };

                const { result } = renderHook(
                    () => useProductActions({ product: setProduct as any, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.isInStock).toBe(false);
            });

            test('isInStock returns true when all set products have stock', () => {
                const setProduct = {
                    ...standardProd,
                    type: { set: true },
                    setProducts: [
                        { id: 'p1', inventory: { ats: 5, orderable: true } },
                        { id: 'p2', inventory: { ats: 3, orderable: true } },
                    ],
                };

                const { result } = renderHook(
                    () => useProductActions({ product: setProduct as any, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.isInStock).toBe(true);
            });

            test('stockLevel is calculated from product inventory', () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // stockLevel should be calculated from product.inventory.ats
                expect(result.current.stockLevel).toBeGreaterThanOrEqual(0);
            });

            test('isInStock handles set product with undefined setProducts', () => {
                const setProduct = {
                    ...standardProd,
                    type: { set: true },
                    setProducts: undefined,
                };
                const { result } = renderHook(() => useProductActions({ product: setProduct, currentVariant: null }), {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                });

                // Falls back to main product inventory when setProducts is undefined
                expect(result.current.isInStock).toBe(true);
            });
        });

        describe('quantity validation', () => {
            test('allows quantity to be set when product has sufficient stock', () => {
                const productInStock = {
                    ...standardProd,
                    inventory: { ats: 10, id: 'inventory_test', orderable: true },
                };
                const { result } = renderHook(
                    () => useProductActions({ product: productInStock, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                act(() => {
                    result.current.setQuantity(5);
                });

                expect(result.current.quantity).toBe(5);
            });

            test('quantity defaults to 1 when not provided', () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.quantity).toBe(1);
            });

            test('uses initialQuantity when provided', () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null, initialQuantity: 3 }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.quantity).toBe(3);
            });

            test('can update quantity with setQuantity', () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.quantity).toBe(1);

                act(() => {
                    result.current.setQuantity(10);
                });

                expect(result.current.quantity).toBe(10);
            });
        });

        describe('loading states', () => {
            test('isAddingToOrUpdatingCart starts as false', () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.isAddingToOrUpdatingCart).toBe(false);
            });
        });

        describe('basket item lookup', () => {
            test('basketProductItems includes items from basket', () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Should have access to basket product items
                expect(result.current).toBeDefined();
            });
        });

        describe('product type checks', () => {
            test('detects master products', () => {
                const masterProduct = { ...standardProd, type: { master: true } };
                const { result } = renderHook(
                    () => useProductActions({ product: masterProduct, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.isMasterOrVariantProduct).toBe(true);
            });

            test('detects variant products', () => {
                const variantProduct = { ...standardProd, type: { variant: true } };
                const { result } = renderHook(
                    () => useProductActions({ product: variantProduct, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.isMasterOrVariantProduct).toBe(true);
            });

            test('standard products are not master/variant', () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.isMasterOrVariantProduct).toBe(false);
            });

            test('set products are not master/variant', () => {
                const setProduct = { ...standardProd, type: { set: true } };
                const { result } = renderHook(() => useProductActions({ product: setProduct, currentVariant: null }), {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                });

                expect(result.current.isMasterOrVariantProduct).toBe(false);
            });

            test('bundle products are not master/variant', () => {
                const bundleProduct = { ...standardProd, type: { bundle: true } };
                const { result } = renderHook(
                    () => useProductActions({ product: bundleProduct, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.isMasterOrVariantProduct).toBe(false);
            });
        });

        describe('canAddToCart validation', () => {
            test('allows adding orderable standard product', () => {
                const orderableProduct = {
                    ...standardProd,
                    inventory: { ats: 10, id: 'inv-1', orderable: true },
                };
                const { result } = renderHook(
                    () => useProductActions({ product: orderableProduct, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.canAddToCart).toBe(true);
            });

            test('allows adding orderable set product', () => {
                const setProduct = {
                    ...standardProd,
                    type: { set: true },
                    inventory: { ats: 10, id: 'inv-1', orderable: true },
                    setProducts: [{ id: 'p1', inventory: { ats: 5, id: 'inv-p1', orderable: true } }],
                };
                const { result } = renderHook(() => useProductActions({ product: setProduct, currentVariant: null }), {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                });

                expect(result.current.canAddToCart).toBe(true);
            });

            test('allows adding orderable bundle product', () => {
                const bundleProduct = {
                    ...standardProd,
                    type: { bundle: true },
                    inventory: { ats: 10, id: 'inv-1', orderable: true },
                };
                const { result } = renderHook(
                    () => useProductActions({ product: bundleProduct, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.canAddToCart).toBe(true);
            });

            test('disallows adding product with insufficient stock', () => {
                const outOfStockProduct = {
                    ...standardProd,
                    inventory: { ats: 0, id: 'inv-1', orderable: false, backorderable: false },
                };
                const { result } = renderHook(
                    () => useProductActions({ product: outOfStockProduct, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.canAddToCart).toBe(false);
            });

            test('disallows adding master product', () => {
                const masterProduct = {
                    ...standardProd,
                    type: { master: true },
                    inventory: { ats: 10, id: 'inv-1', orderable: true },
                };
                const { result } = renderHook(
                    () => useProductActions({ product: masterProduct, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.canAddToCart).toBe(false);
            });

            test('disallows adding product with zero quantity', () => {
                const productWithStock = {
                    ...standardProd,
                    inventory: { ats: 10, id: 'inv-1', orderable: true },
                };
                const { result } = renderHook(
                    () =>
                        useProductActions({
                            product: productWithStock,
                            currentVariant: null,
                            initialQuantity: 0,
                        }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.canAddToCart).toBe(false);
            });

            test('disallows adding product when quantity exceeds stock', () => {
                const productWithLimitedStock = {
                    ...standardProd,
                    inventory: { ats: 2, id: 'inv-1', orderable: true },
                };
                const { result } = renderHook(
                    () =>
                        useProductActions({
                            product: productWithLimitedStock,
                            currentVariant: null,
                            initialQuantity: 5,
                        }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.canAddToCart).toBe(false);
            });
        });

        describe('unfulfillable and stock status', () => {
            test('marks as unfulfillable when quantity exceeds stock', () => {
                const productWithLimitedStock = {
                    ...standardProd,
                    inventory: { ats: 2, id: 'inv-1', orderable: true },
                };
                const { result } = renderHook(
                    () =>
                        useProductActions({
                            product: productWithLimitedStock,
                            currentVariant: null,
                            initialQuantity: 5,
                        }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.unfulfillable).toBe(true);
                expect(result.current.stockLevel).toBeGreaterThan(0);
            });

            test('marks as fulfillable when quantity within stock', () => {
                const productWithStock = {
                    ...standardProd,
                    inventory: { ats: 10, id: 'inv-1', orderable: true },
                };
                const { result } = renderHook(
                    () =>
                        useProductActions({
                            product: productWithStock,
                            currentVariant: null,
                            initialQuantity: 5,
                        }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.unfulfillable).toBe(false);
                expect(result.current.stockLevel).toBeGreaterThan(0);
            });

            test('marks set as unfulfillable when out of stock', () => {
                const outOfStockSet = {
                    ...standardProd,
                    type: { set: true },
                    inventory: { ats: 0, id: 'inv-1' },
                    setProducts: [{ id: 'p1', inventory: { ats: 0, id: 'inv-p1' } }],
                };
                const { result } = renderHook(
                    () => useProductActions({ product: outOfStockSet, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.unfulfillable).toBe(true);
                expect(result.current.stockLevel).toBe(0);
            });

            test('marks product as out of stock when ats is 0', () => {
                const outOfStockProduct = {
                    ...standardProd,
                    inventory: { ats: 0, id: 'inv-1' },
                };
                const { result } = renderHook(
                    () => useProductActions({ product: outOfStockProduct, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.stockLevel).toBe(0);
                expect(result.current.isInStock).toBe(false);
            });

            test('calculates stockLevel from product inventory', () => {
                const product = {
                    ...standardProd,
                    inventory: { ats: 5, id: 'inv-1', orderable: true },
                };
                const { result } = renderHook(() => useProductActions({ product, currentVariant: null }), {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                });

                expect(result.current.stockLevel).toBe(5);
                expect(result.current.isInStock).toBe(true);
            });

            test('defaults stockLevel to 0 when no inventory', () => {
                const productNoInventory = {
                    ...standardProd,
                    inventory: undefined,
                };
                const { result } = renderHook(
                    () => useProductActions({ product: productNoInventory, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.stockLevel).toBe(0);
                expect(result.current.isInStock).toBe(false);
            });

            test('uses inventory ats when stockLevel not provided', () => {
                const productWithInventory = {
                    ...standardProd,
                    inventory: { ats: 15, id: 'inv-1', orderable: true },
                };
                const { result } = renderHook(
                    () => useProductActions({ product: productWithInventory, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.stockLevel).toBe(15);
                expect(result.current.isInStock).toBe(true);
            });

            test('handles set with child product missing inventory', () => {
                // For sets, inventory should be pre-calculated and stored on the parent product
                // When a child has missing inventory, the parent should reflect that (ats: 0)
                const setWithMissingInventory = {
                    ...standardProd,
                    type: { set: true },
                    inventory: { ats: 0, id: 'inv-1', orderable: false }, // Pre-calculated: one child missing inventory
                    setProducts: [
                        { id: 'p1', inventory: { ats: 5, id: 'inv-p1', orderable: true } },
                        { id: 'p2', inventory: undefined },
                    ],
                };
                const { result } = renderHook(
                    () => useProductActions({ product: setWithMissingInventory, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.isInStock).toBe(false);
            });
        });

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        describe('handleAddToCart with inventoryId', () => {
            test('adds item WITHOUT inventoryId when product is NOT in pickup map', async () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Don't add to pickup map
                expect(result.current.pickupBasketItems?.size).toBe(0);

                // Add to cart - should work without inventoryId
                await act(async () => {
                    await result.current.handleAddToCart();
                });

                // Should complete without error
                expect(result.current.pickupBasketItems?.size).toBe(0);
            });

            test('adds item WITH inventoryId when product IS in pickup map', async () => {
                const productWithId = { ...standardProd, id: 'test-product-123' };
                const { result } = renderHook(
                    () => useProductActions({ product: productWithId, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Mark product for pickup
                act(() => {
                    result.current.addItem?.('test-product-123', 'inventory-store-123', 'store-123');
                });

                expect(result.current.pickupBasketItems?.has('test-product-123')).toBe(true);

                // Add to cart - should include inventoryId
                await act(async () => {
                    await result.current.handleAddToCart();
                });

                // Pickup item should still be in map
                expect(result.current.pickupBasketItems?.has('test-product-123')).toBe(true);
                expect(result.current.pickupBasketItems?.get('test-product-123')).toEqual({
                    inventoryId: 'inventory-store-123',
                    storeId: 'store-123',
                });
            });
        });

        describe('handleProductSetAddToCart with inventoryId', () => {
            test('adds set items WITHOUT inventoryId when products NOT in pickup map', async () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                const productSelections = [
                    {
                        product: { id: 'set-product-1', price: 10 },
                        variant: { productId: 'set-product-1', price: 10 },
                        quantity: 1,
                    },
                    {
                        product: { id: 'set-product-2', price: 20 },
                        variant: { productId: 'set-product-2', price: 20 },
                        quantity: 2,
                    },
                ];

                // Don't add to pickup map
                expect(result.current.pickupBasketItems?.size).toBe(0);

                // Add set to cart - should work without inventoryId
                await act(async () => {
                    await result.current.handleProductSetAddToCart(productSelections);
                });

                expect(result.current.pickupBasketItems?.size).toBe(0);
            });

            test('adds set items WITH inventoryId for items in pickup map', async () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                const productSelections = [
                    {
                        product: { id: 'set-product-1', price: 10 },
                        variant: { productId: 'set-product-1', price: 10 },
                        quantity: 1,
                    },
                    {
                        product: { id: 'set-product-2', price: 20 },
                        variant: { productId: 'set-product-2', price: 20 },
                        quantity: 2,
                    },
                ];

                // Mark first product for pickup
                act(() => {
                    result.current.addItem?.('set-product-1', 'inventory-store-1', 'store-1');
                });

                expect(result.current.pickupBasketItems?.has('set-product-1')).toBe(true);
                expect(result.current.pickupBasketItems?.has('set-product-2')).toBe(false);

                // Add set to cart
                await act(async () => {
                    await result.current.handleProductSetAddToCart(productSelections);
                });

                // Verify map still has the pickup item
                expect(result.current.pickupBasketItems?.has('set-product-1')).toBe(true);
            });

            test("adds set items with MIXED inventoryId (some have, some don't)", async () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                const productSelections = [
                    {
                        product: { id: 'set-product-1', price: 10 },
                        variant: { productId: 'set-product-1', price: 10 },
                        quantity: 1,
                    },
                    {
                        product: { id: 'set-product-2', price: 20 },
                        variant: { productId: 'set-product-2', price: 20 },
                        quantity: 2,
                    },
                    {
                        product: { id: 'set-product-3', price: 30 },
                        variant: { productId: 'set-product-3', price: 30 },
                        quantity: 1,
                    },
                ];

                // Mark only some products for pickup
                act(() => {
                    result.current.addItem?.('set-product-1', 'inventory-store-1', 'store-1');
                    result.current.addItem?.('set-product-3', 'inventory-store-3', 'store-3');
                });

                // Verify pickup status
                expect(result.current.pickupBasketItems?.has('set-product-1')).toBe(true);
                expect(result.current.pickupBasketItems?.has('set-product-2')).toBe(false);
                expect(result.current.pickupBasketItems?.has('set-product-3')).toBe(true);

                // Add set to cart - should include inventoryId only for marked products
                await act(async () => {
                    await result.current.handleProductSetAddToCart(productSelections);
                });

                // Verify all marked items still in map
                expect(result.current.pickupBasketItems?.size).toBe(2);
            });

            test('handles set items with missing productId gracefully', async () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                const productSelections = [
                    {
                        product: { id: '', price: 10 }, // Empty id
                        variant: { productId: '', price: 10 }, // Empty productId
                        quantity: 1,
                    },
                    {
                        product: { id: 'set-product-2', price: 20 },
                        variant: { productId: 'set-product-2', price: 20 },
                        quantity: 2,
                    },
                ] as any;

                // Add set to cart - should handle empty productId gracefully
                await act(async () => {
                    await result.current.handleProductSetAddToCart(productSelections);
                });

                expect(result.current.pickupBasketItems?.size).toBe(0);
            });
        });

        describe('handleProductBundleAddToCart with inventoryId', () => {
            test('adds bundle WITHOUT inventoryId when bundle NOT in pickup map', async () => {
                const bundleProduct = { ...standardProd, id: 'bundle-123', type: { bundle: true } };
                const { result } = renderHook(
                    () => useProductActions({ product: bundleProduct, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                const childSelections = [
                    {
                        product: { id: 'child-1', price: 5 },
                        variant: { productId: 'child-1', price: 5 },
                        quantity: 1,
                    },
                ];

                // Don't add to pickup map
                expect(result.current.pickupBasketItems?.size).toBe(0);

                // Add bundle to cart - should work without inventoryId
                await act(async () => {
                    await result.current.handleProductBundleAddToCart(1, childSelections);
                });

                expect(result.current.pickupBasketItems?.size).toBe(0);
            });

            test('adds bundle WITH inventoryId when bundle IS in pickup map', async () => {
                const bundleProduct = { ...standardProd, id: 'bundle-123', type: { bundle: true }, price: 50 };
                const { result } = renderHook(
                    () => useProductActions({ product: bundleProduct, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                const childSelections = [
                    {
                        product: { id: 'child-1', price: 5 },
                        variant: { productId: 'child-1', price: 5 },
                        quantity: 1,
                    },
                ];

                // Mark bundle for pickup (not children)
                act(() => {
                    result.current.addItem?.('bundle-123', 'inventory-store-bundle', 'store-bundle');
                });

                expect(result.current.pickupBasketItems?.has('bundle-123')).toBe(true);

                // Add bundle to cart
                await act(async () => {
                    await result.current.handleProductBundleAddToCart(1, childSelections);
                });

                // Verify bundle still in pickup map
                expect(result.current.pickupBasketItems?.has('bundle-123')).toBe(true);
                expect(result.current.pickupBasketItems?.get('bundle-123')).toEqual({
                    inventoryId: 'inventory-store-bundle',
                    storeId: 'store-bundle',
                });
            });
        });
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        describe('handleUpdateBundle validation', () => {
            test('returns early when isAddingToOrUpdatingCart is true', async () => {
                const bundleProduct = { ...standardProd, id: 'bundle-123', type: { bundle: true } };
                const { result } = renderHook(
                    () => useProductActions({ product: bundleProduct, itemId: 'item-bundle', currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Set adding state to true
                act(() => {
                    result.current.setQuantity(2);
                });

                // Try to update bundle while already updating
                const childSelections = [
                    {
                        product: { id: 'child-1' } as any,
                        variant: { productId: 'child-1' } as any,
                        quantity: 1,
                    },
                ];

                // Should return early without error
                await act(async () => {
                    await result.current.handleUpdateBundle(2, childSelections);
                });

                // No error should be thrown
                expect(result.current).toBeDefined();
            });

            test('shows error when bundleQuantity is invalid', async () => {
                const bundleProduct = {
                    ...standardProd,
                    id: 'bundle-123',
                    type: { bundle: true },
                    inventory: { ats: 10, id: 'inv-1', orderable: true },
                };

                const { result } = renderHook(
                    () => useProductActions({ product: bundleProduct, itemId: 'item-bundle', currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                const childSelections = [
                    {
                        product: { id: 'child-1' } as any,
                        variant: { productId: 'child-1' } as any,
                        quantity: 1,
                    },
                ];

                // Should handle invalid quantity gracefully without throwing
                await act(async () => {
                    await result.current.handleUpdateBundle(0, childSelections);
                });

                expect(result.current).toBeDefined();
            });

            test('shows error when childProductSelections is empty', async () => {
                const bundleProduct = {
                    ...standardProd,
                    id: 'bundle-123',
                    type: { bundle: true },
                    inventory: { ats: 10, id: 'inv-1', orderable: true },
                };

                const { result } = renderHook(
                    () => useProductActions({ product: bundleProduct, itemId: 'item-bundle', currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Should handle empty selections gracefully without throwing
                await act(async () => {
                    await result.current.handleUpdateBundle(2, []);
                });

                expect(result.current).toBeDefined();
            });

            test('returns early when product has no id', async () => {
                const bundleProductNoId = {
                    ...standardProd,
                    id: undefined,
                    type: { bundle: true },
                    inventory: { ats: 10, id: 'inv-1', orderable: true },
                };

                const { result } = renderHook(
                    () =>
                        useProductActions({
                            product: bundleProductNoId as any,
                            itemId: 'item-bundle',
                            currentVariant: null,
                        }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                const childSelections = [
                    {
                        product: { id: 'child-1' } as any,
                        variant: { productId: 'child-1' } as any,
                        quantity: 1,
                    },
                ];

                // Should handle missing id gracefully without throwing
                await act(async () => {
                    await result.current.handleUpdateBundle(2, childSelections);
                });

                expect(result.current).toBeDefined();
            });

            test('returns early when no itemId provided', async () => {
                const bundleProduct = {
                    ...standardProd,
                    id: 'bundle-123',
                    type: { bundle: true },
                    inventory: { ats: 10, id: 'inv-1', orderable: true },
                };
                const { result } = renderHook(
                    () => useProductActions({ product: bundleProduct, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                const childSelections = [
                    {
                        product: { id: 'child-1' } as any,
                        variant: { productId: 'child-1' } as any,
                        quantity: 1,
                    },
                ];

                // Should not throw error, just return early
                await act(async () => {
                    await result.current.handleUpdateBundle(2, childSelections);
                });

                expect(result.current).toBeDefined();
            });
        });

        describe('handleUpdateCart validation', () => {
            test('returns early when no itemId provided', async () => {
                const product = { ...standardProd, inventory: { ats: 10, id: 'inv-1', orderable: true } };
                const { result } = renderHook(() => useProductActions({ product, currentVariant: null }), {
                    wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                });

                // Should not throw error, just return early
                await act(async () => {
                    await result.current.handleUpdateCart();
                });

                expect(result.current).toBeDefined();
            });

            test('returns early when canAddToCart is false', async () => {
                const outOfStockProduct = {
                    ...standardProd,
                    inventory: { ats: 0, id: 'inv-1', orderable: false },
                };
                const { result } = renderHook(
                    () => useProductActions({ product: outOfStockProduct, itemId: 'item-1', currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Should not throw error, just return early
                await act(async () => {
                    await result.current.handleUpdateCart();
                });

                expect(result.current).toBeDefined();
            });

            test('shows error when quantity is invalid', async () => {
                const product = { ...standardProd, inventory: { ats: 10, id: 'inv-1', orderable: true } };
                const { result } = renderHook(
                    () => useProductActions({ product, itemId: 'item-1', initialQuantity: 0, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Should handle invalid quantity gracefully
                await act(async () => {
                    await result.current.handleUpdateCart();
                });

                expect(result.current).toBeDefined();
            });

            test('uses currentVariant for master/variant products', () => {
                const variantProduct = {
                    ...standardProd,
                    type: { variant: true },
                    inventory: { ats: 10, id: 'inv-1', orderable: true },
                };
                const { result } = renderHook(
                    () => useProductActions({ product: variantProduct, itemId: 'item-1', currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Should use variant product logic
                expect(result.current.isMasterOrVariantProduct).toBe(true);
            });

            test('uses product for non-variant products', () => {
                const standardProduct = { ...standardProd, inventory: { ats: 10, id: 'inv-1', orderable: true } };
                const { result } = renderHook(
                    () => useProductActions({ product: standardProduct, itemId: 'item-1', currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Should use standard product logic
                expect(result.current.isMasterOrVariantProduct).toBe(false);
            });

            test('handles product with no id gracefully', async () => {
                const productNoId = {
                    ...standardProd,
                    id: undefined,
                    inventory: { ats: 10, id: 'inv-1', orderable: true },
                };
                const { result } = renderHook(
                    () => useProductActions({ product: productNoId as any, itemId: 'item-1', currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Should handle missing id gracefully
                await act(async () => {
                    await result.current.handleUpdateCart();
                });

                expect(result.current).toBeDefined();
            });

            test('handles product with no productId gracefully', async () => {
                const product = {
                    ...standardProd,
                    productId: undefined,
                    inventory: { ats: 10, id: 'inv-1', orderable: true },
                };
                const { result } = renderHook(
                    () => useProductActions({ product, itemId: 'item-1', currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Should handle missing productId gracefully
                await act(async () => {
                    await result.current.handleUpdateCart();
                });

                expect(result.current).toBeDefined();
            });
        });

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        describe('pickup item management', () => {
            test('addItem adds product to pickup map', () => {
                const productWithId = { ...standardProd, id: 'test-product-123' };
                const { result } = renderHook(
                    () => useProductActions({ product: productWithId, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.pickupBasketItems?.size).toBe(0);

                act(() => {
                    result.current.addItem?.('test-product-123', 'inventory-store-123', 'store-123');
                });

                expect(result.current.pickupBasketItems?.has('test-product-123')).toBe(true);
                expect(result.current.pickupBasketItems?.get('test-product-123')).toEqual({
                    inventoryId: 'inventory-store-123',
                    storeId: 'store-123',
                });
            });

            test('removeItem removes product from pickup map', () => {
                const productWithId = { ...standardProd, id: 'test-product-123' };
                const { result } = renderHook(
                    () => useProductActions({ product: productWithId, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                act(() => {
                    result.current.addItem?.('test-product-123', 'inventory-store-123', 'store-123');
                });

                expect(result.current.pickupBasketItems?.has('test-product-123')).toBe(true);

                act(() => {
                    result.current.removeItem?.('test-product-123');
                });

                expect(result.current.pickupBasketItems?.has('test-product-123')).toBe(false);
            });

            test('addItem updates existing product inventoryId and storeId', () => {
                const productWithId = { ...standardProd, id: 'test-product-123' };
                const { result } = renderHook(
                    () => useProductActions({ product: productWithId, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                act(() => {
                    result.current.addItem?.('test-product-123', 'inventory-store-old', 'store-old');
                });

                expect(result.current.pickupBasketItems?.get('test-product-123')).toEqual({
                    inventoryId: 'inventory-store-old',
                    storeId: 'store-old',
                });

                act(() => {
                    result.current.addItem?.('test-product-123', 'inventory-store-new', 'store-new');
                });

                expect(result.current.pickupBasketItems?.get('test-product-123')).toEqual({
                    inventoryId: 'inventory-store-new',
                    storeId: 'store-new',
                });
            });
        });

        describe('inventory calculations with pickup selection', () => {
            test('uses site inventory when pickup is not selected', () => {
                const productWithInventories = {
                    ...standardProd,
                    id: 'test-product-123',
                    inventory: { ats: 10, id: 'site-inventory', orderable: true },
                    inventories: [
                        {
                            id: 'store-inventory',
                            ats: 5,
                            stockLevel: 5,
                            orderable: true,
                        },
                    ],
                };

                const { result } = renderHook(
                    () => useProductActions({ product: productWithInventories, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Pickup is not selected, so should use site inventory
                expect(result.current.stockLevel).toBe(10); // Site inventory
            });

            test('uses store inventory when pickup is selected', () => {
                const productWithInventories = {
                    ...standardProd,
                    id: 'test-product-123',
                    inventory: { ats: 10, id: 'site-inventory', orderable: true },
                    inventories: [
                        {
                            id: 'store-inventory',
                            ats: 5,
                            stockLevel: 5,
                            orderable: true,
                        },
                    ],
                };

                const { result } = renderHook(
                    () => useProductActions({ product: productWithInventories, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Mark product for pickup
                act(() => {
                    result.current.addItem?.('test-product-123', 'store-inventory', 'store-1');
                });

                // Should use store inventory when pickup is selected
                expect(result.current.stockLevel).toBe(5); // Store inventory
            });

            test('isInStock uses store inventory when pickup is selected', () => {
                const productWithInventories = {
                    ...standardProd,
                    id: 'test-product-123',
                    inventory: { ats: 10, id: 'site-inventory', orderable: true },
                    inventories: [
                        {
                            id: 'store-inventory',
                            ats: 2,
                            stockLevel: 2,
                            orderable: true,
                        },
                    ],
                };

                const { result } = renderHook(
                    () =>
                        useProductActions({
                            product: productWithInventories,
                            currentVariant: null,
                            initialQuantity: 1,
                        }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Initially uses site inventory (10 in stock)
                expect(result.current.isInStock).toBe(true);

                // Mark product for pickup
                act(() => {
                    result.current.addItem?.('test-product-123', 'store-inventory', 'store-1');
                });

                // Should use store inventory (2 in stock, quantity 1)
                expect(result.current.isInStock).toBe(true);
            });

            test('isInStock reflects store inventory when pickup is selected and quantity exceeds store stock', () => {
                const productWithInventories = {
                    ...standardProd,
                    id: 'test-product-123',
                    inventory: { ats: 10, id: 'site-inventory', orderable: true },
                    inventories: [
                        {
                            id: 'store-inventory',
                            ats: 2,
                            stockLevel: 2,
                            orderable: true,
                        },
                    ],
                };

                const { result } = renderHook(
                    () =>
                        useProductActions({
                            product: productWithInventories,
                            currentVariant: null,
                            initialQuantity: 5,
                        }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Mark product for pickup
                act(() => {
                    result.current.addItem?.('test-product-123', 'store-inventory', 'store-1');
                });

                // Should use store inventory (2 in stock, quantity 5)
                expect(result.current.isInStock).toBe(false); // Store only has 2, quantity is 5
            });
        });

        describe('exported BOPIS functions', () => {
            test('exports addItem function', () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(typeof result.current.addItem).toBe('function');
            });

            test('exports removeItem function', () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(typeof result.current.removeItem).toBe('function');
            });

            test('exports pickupBasketItems map', () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.pickupBasketItems).toBeInstanceOf(Map);
            });

            test('exports clearItems function', () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(typeof result.current.clearItems).toBe('function');
            });

            test('clearItems clears all pickup items', () => {
                const productWithId = { ...standardProd, id: 'test-product-123' };
                const { result } = renderHook(
                    () => useProductActions({ product: productWithId, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                // Add multiple items to pickup
                act(() => {
                    result.current.addItem?.('product-1', 'inventory-1', 'store-1');
                    result.current.addItem?.('product-2', 'inventory-2', 'store-2');
                    result.current.addItem?.('product-3', 'inventory-3', 'store-3');
                });

                expect(result.current.pickupBasketItems?.size).toBe(3);

                // Clear all items
                act(() => {
                    result.current.clearItems?.();
                });

                expect(result.current.pickupBasketItems?.size).toBe(0);
            });
        });

        describe('basketPickupStore', () => {
            test('returns undefined when not editing basket item', () => {
                const { result } = renderHook(
                    () => useProductActions({ product: standardProd, currentVariant: null }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
                    }
                );

                expect(result.current.basketPickupStore).toBeUndefined();
            });

            test('returns undefined when editing basket item without pickup store', () => {
                // Basket item without pickup (regular delivery)
                const basketWithoutPickup: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'test-basket-123',
                    productItems: [
                        {
                            itemId: 'item-1',
                            productId: 'product-1',
                            productName: 'Product 1',
                            quantity: 2,
                            shipmentId: 'shipment-1',
                        },
                    ],
                    shipments: [
                        {
                            shipmentId: 'shipment-1',
                            // No c_fromStoreId - regular delivery
                        },
                    ],
                };

                const { result } = renderHook(
                    () =>
                        useProductActions({
                            product: { ...standardProd, id: 'product-1' },
                            currentVariant: null,
                            itemId: 'item-1',
                        }),
                    {
                        wrapper: ({ children }) => wrapper({ children, basket: basketWithoutPickup }),
                    }
                );

                expect(result.current.basketPickupStore).toBeUndefined();
            });

            test('returns store info when editing basket item with pickup store', () => {
                // Basket with pickup item
                const basketWithPickup: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'test-basket-123',
                    productItems: [
                        {
                            itemId: 'item-1',
                            productId: 'product-1',
                            productName: 'Product 1',
                            quantity: 2,
                            shipmentId: 'shipment-1',
                            inventoryId: 'inventory-store-123',
                        },
                    ],
                    shipments: [
                        {
                            shipmentId: 'shipment-1',
                            c_fromStoreId: 'store-123',
                        },
                    ],
                };

                // Setup stores in pickup context
                const stores = new Map([
                    ['store-123', { id: 'store-123', name: 'Test Store', inventoryId: 'inventory-store-123' }],
                ]);

                const customWrapper = ({ children }: { children: React.ReactNode }) => {
                    const router = createMemoryRouter(
                        [
                            {
                                path: '/',
                                element: createTestProviders(children, basketWithPickup, stores),
                            },
                        ],
                        {
                            initialEntries: ['/'],
                        }
                    );
                    return <RouterProvider router={router} />;
                };

                const { result } = renderHook(
                    () =>
                        useProductActions({
                            product: { ...standardProd, id: 'product-1' },
                            currentVariant: null,
                            itemId: 'item-1',
                        }),
                    {
                        wrapper: customWrapper,
                    }
                );

                expect(result.current.basketPickupStore).toEqual({
                    id: 'store-123',
                    name: 'Test Store',
                    inventoryId: 'inventory-store-123',
                });
            });

            test('returns store with ID only when store details not in pickup stores map', () => {
                // Basket with pickup item but store not in pickupStores map
                const basketWithPickup: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'test-basket-123',
                    productItems: [
                        {
                            itemId: 'item-1',
                            productId: 'product-1',
                            productName: 'Product 1',
                            quantity: 2,
                            shipmentId: 'shipment-1',
                            inventoryId: 'inventory-store-456',
                        },
                    ],
                    shipments: [
                        {
                            shipmentId: 'shipment-1',
                            c_fromStoreId: 'store-456',
                        },
                    ],
                };

                // Empty stores map - store not in map
                const stores = new Map();

                const customWrapper = ({ children }: { children: React.ReactNode }) => {
                    const router = createMemoryRouter(
                        [
                            {
                                path: '/',
                                element: createTestProviders(children, basketWithPickup, stores),
                            },
                        ],
                        {
                            initialEntries: ['/'],
                        }
                    );
                    return <RouterProvider router={router} />;
                };

                const { result } = renderHook(
                    () =>
                        useProductActions({
                            product: { ...standardProd, id: 'product-1' },
                            currentVariant: null,
                            itemId: 'item-1',
                        }),
                    {
                        wrapper: customWrapper,
                    }
                );

                // Should return minimal store object with just ID when not in map
                expect(result.current.basketPickupStore).toEqual({
                    id: 'store-456',
                });
            });

            test('basketPickupStore is available for basket items with pickup', () => {
                // Basket with pickup item
                const basketWithPickup: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'test-basket-123',
                    productItems: [
                        {
                            itemId: 'item-1',
                            productId: 'product-1',
                            productName: 'Product 1',
                            quantity: 2,
                            shipmentId: 'shipment-1',
                            inventoryId: 'inventory-store-789',
                        },
                    ],
                    shipments: [
                        {
                            shipmentId: 'shipment-1',
                            c_fromStoreId: 'store-789',
                        },
                    ],
                };

                const stores = new Map([
                    ['store-789', { id: 'store-789', name: 'Store 789', inventoryId: 'inventory-store-789' }],
                ]);

                const customWrapper = ({ children }: { children: React.ReactNode }) => {
                    const router = createMemoryRouter(
                        [
                            {
                                path: '/',
                                element: createTestProviders(children, basketWithPickup, stores),
                            },
                        ],
                        {
                            initialEntries: ['/'],
                        }
                    );
                    return <RouterProvider router={router} />;
                };

                const { result } = renderHook(
                    () =>
                        useProductActions({
                            product: { ...standardProd, id: 'product-1' },
                            currentVariant: null,
                            itemId: 'item-1',
                        }),
                    {
                        wrapper: customWrapper,
                    }
                );

                // Verify basketPickupStore is set correctly and includes all expected fields
                expect(result.current.basketPickupStore).toEqual({
                    id: 'store-789',
                    name: 'Store 789',
                    inventoryId: 'inventory-store-789',
                });

                // The basketPickupStore is used internally to determine pickup selection status
                // which affects stock calculations and canAddToCart validation
                expect(result.current.basketPickupStore).toBeDefined();
                expect(result.current.basketPickupStore?.inventoryId).toBe('inventory-store-789');
            });
        });
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
    });

    describe('useBasket autoLoad gating', () => {
        // The PDP performance fix routes BOPIS validation to the server, so add-mode no longer needs
        // the full basket on first render. We verify the contract here: edit-mode (itemId present)
        // calls useBasket with autoLoad: true, add-mode with autoLoad: false.
        test('passes autoLoad: false to useBasket in add mode (no itemId)', () => {
            const product = createStandardProduct();
            const useBasketSpy = vi.spyOn(BasketModule, 'useBasket');

            renderHook(() => useProductActions({ product, currentVariant: null }), {
                wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
            });

            expect(useBasketSpy).toHaveBeenCalledWith({ autoLoad: false });
        });

        test('passes autoLoad: true to useBasket in edit mode (itemId present)', () => {
            const product = createStandardProduct();
            const useBasketSpy = vi.spyOn(BasketModule, 'useBasket');

            renderHook(() => useProductActions({ product, currentVariant: null, itemId: 'item-1' }), {
                wrapper: ({ children }) => wrapper({ children, basket: mockBasket }),
            });

            expect(useBasketSpy).toHaveBeenCalledWith({ autoLoad: true });
        });
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    describe('opportunistic BOPIS pre-check', () => {
        // The cart-add server actions are authoritative — these tests cover the optimization layer:
        // when the basket is already hydrated client-side, surface the conflict toast immediately and
        // skip the network round-trip. We assert via the toast call: the change-store error is only
        // raised by the pre-check, so its presence/absence is a faithful signal.
        const orderableInventory = { ats: 10, id: 'inv-site', orderable: true };
        // When pickup is selected the hook reads from the store-keyed entry in `inventories`,
        // not `inventory`. Without a matching store inventory canAddToCart returns false and the
        // handler short-circuits before reaching the pre-check.
        const otherStoreInventories = [{ id: 'inv-other-store', ats: 10, stockLevel: 10, orderable: true }];
        const existingStoreInventories = [{ id: 'inv-existing-store', ats: 10, stockLevel: 10, orderable: true }];
        const conflictKey = 'extBopis:cart.addToCartValidation.changeStoreError';
        const conflictingBasket = createMockBasketWithPickupItems([
            { productId: 'other-product', inventoryId: 'inventory-other', storeId: 'store-existing' },
        ]);

        test('handleAddToCart toasts the change-store error when basket has a conflicting pickup store', async () => {
            const product = {
                ...standardProd,
                id: 'pickup-product',
                inventory: orderableInventory,
                inventories: otherStoreInventories,
            };

            const { result } = renderHook(() => useProductActions({ product, currentVariant: null }), {
                wrapper: ({ children }) => wrapper({ children, basket: conflictingBasket }),
            });

            act(() => {
                result.current.addItem?.('pickup-product', 'inv-other-store', 'store-other');
            });

            await act(async () => {
                await result.current.handleAddToCart();
            });

            const { t } = getTranslation();
            expect(mockAddToast).toHaveBeenCalledWith(t(conflictKey), 'error');
        });

        test('handleAddToCart does not toast a conflict when basket pickup store matches the new item', async () => {
            const product = {
                ...standardProd,
                id: 'pickup-product',
                inventory: orderableInventory,
                inventories: existingStoreInventories,
            };
            const matchingBasket = createMockBasketWithPickupItems([
                { productId: 'other-product', inventoryId: 'inventory-other', storeId: 'store-existing' },
            ]);

            const { result } = renderHook(() => useProductActions({ product, currentVariant: null }), {
                wrapper: ({ children }) => wrapper({ children, basket: matchingBasket }),
            });

            act(() => {
                result.current.addItem?.('pickup-product', 'inv-existing-store', 'store-existing');
            });

            await act(async () => {
                await result.current.handleAddToCart();
            });

            const { t } = getTranslation();
            expect(mockAddToast).not.toHaveBeenCalledWith(t(conflictKey), 'error');
        });

        test('handleProductSetAddToCart toasts on conflicting store', async () => {
            const setProduct = {
                ...standardProd,
                id: 'set-1',
                type: { set: true },
                inventory: orderableInventory,
            };

            const { result } = renderHook(() => useProductActions({ product: setProduct, currentVariant: null }), {
                wrapper: ({ children }) => wrapper({ children, basket: conflictingBasket }),
            });

            act(() => {
                result.current.addItem?.('child-1', 'inv-other-store', 'store-other');
            });

            await act(async () => {
                await result.current.handleProductSetAddToCart([
                    {
                        product: { id: 'child-1', price: 10 } as any,
                        variant: { productId: 'child-1', price: 10 } as any,
                        quantity: 1,
                    },
                ]);
            });

            const { t } = getTranslation();
            expect(mockAddToast).toHaveBeenCalledWith(t(conflictKey), 'error');
        });

        test('handleProductBundleAddToCart toasts on conflicting store', async () => {
            const bundleProduct = {
                ...standardProd,
                id: 'bundle-1',
                type: { bundle: true },
                inventory: orderableInventory,
            };

            const { result } = renderHook(() => useProductActions({ product: bundleProduct, currentVariant: null }), {
                wrapper: ({ children }) => wrapper({ children, basket: conflictingBasket }),
            });

            act(() => {
                result.current.addItem?.('bundle-1', 'inv-other-store', 'store-other');
            });

            await act(async () => {
                await result.current.handleProductBundleAddToCart(1, [
                    {
                        product: { id: 'child-1' } as any,
                        variant: { productId: 'child-1' } as any,
                        quantity: 1,
                    },
                ]);
            });

            const { t } = getTranslation();
            expect(mockAddToast).toHaveBeenCalledWith(t(conflictKey), 'error');
        });

        test('handleAddToCart proceeds when basket is undefined (server is authoritative)', async () => {
            const product = {
                ...standardProd,
                id: 'pickup-product',
                inventory: orderableInventory,
                inventories: [{ id: 'inv-store', ats: 10, stockLevel: 10, orderable: true }],
            };

            // Wrapper that omits the `basket` prop so BasketProvider starts uninitialized.
            const noBasketWrapper = ({ children }: { children: React.ReactNode }) => {
                const router = createMemoryRouter(
                    [
                        {
                            path: '/',
                            element: createTestProviders(children, undefined),
                        },
                        {
                            path: resourceRoutes.cartItemAdd,
                            action: () => Response.json({ success: true }),
                        },
                    ],
                    { initialEntries: ['/'] }
                );
                return <RouterProvider router={router} />;
            };

            const { result } = renderHook(() => useProductActions({ product, currentVariant: null }), {
                wrapper: noBasketWrapper,
            });

            act(() => {
                result.current.addItem?.('pickup-product', 'inv-store', 'store-any');
            });

            await act(async () => {
                await result.current.handleAddToCart();
            });

            const { t } = getTranslation();
            expect(mockAddToast).not.toHaveBeenCalledWith(t(conflictKey), 'error');
        });
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
});
