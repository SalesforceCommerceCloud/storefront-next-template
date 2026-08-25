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

// Testing libraries
import { render, screen, waitFor } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import type { ShopperProducts } from '@/scapi';
// React Router
import { createMemoryRouter, RouterProvider } from 'react-router';
// Components
import ProductInfo from '@/components/product-view/product-info';
import ProductViewProvider from '@/providers/product-view';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
// mock data
import { masterProduct as mockProduct } from '@/components/__mocks__/master-variant-product';
import { standardProd } from '@/components/__mocks__/standard-product-2';

const { pickupContext } = vi.hoisted(() => ({
    pickupContext: {
        current: {
            addItem: vi.fn(),
            removeItem: vi.fn(),
            pickupBasketItems: new Map(),
            pickupStores: new Map(),
            clearItems: vi.fn(),
        },
    },
}));

vi.mock('@/extensions/bopis/context/pickup-context', () => ({
    usePickup: () => pickupContext.current,
}));

describe('ProductInfo - BOPIS', () => {
    describe('delivery options', () => {
        beforeEach(() => {
            vi.clearAllMocks();
            pickupContext.current = {
                addItem: vi.fn(),
                removeItem: vi.fn(),
                pickupBasketItems: new Map(),
                pickupStores: new Map(),
                clearItems: vi.fn(),
            };
        });

        const renderProductInfo = ({
            product,
            currentVariant,
            initialFulfillmentSelection,
            mode,
            clearDeferredPickupSelection,
        }: {
            product: ShopperProducts.schemas['Product'];
            currentVariant?: ShopperProducts.schemas['Variant'];
            initialFulfillmentSelection?: {
                optionId: 'delivery' | 'pickup';
                metadata?: { storeId: string; inventoryId: string };
            };
            mode?: 'add' | 'edit';
            clearDeferredPickupSelection?: boolean;
        }) => {
            const router = createMemoryRouter(
                [
                    {
                        path: '/product/:productId',
                        element: (
                            <AllProvidersWrapper>
                                <ProductViewProvider
                                    product={product}
                                    currentVariant={currentVariant}
                                    mode={mode}
                                    clearDeferredPickupSelection={clearDeferredPickupSelection}
                                    initialFulfillmentSelection={initialFulfillmentSelection}>
                                    <ProductInfo product={product} currentVariantOverride={currentVariant} />
                                </ProductViewProvider>
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                { initialEntries: ['/product/test-product'] }
            );
            return render(<RouterProvider router={router} />);
        };

        test('should render DeliveryOptions for an orderable product in normal (add) mode', async () => {
            const simpleProduct = standardProd;

            // Using createMemoryRouter in framework mode is fine
            // because both framework and data routers share the same underlying architecture, so it provides a valid navigation context for hooks and <Link>.
            // Even though it's listed under "data routers," it fully supports testing non-route components that rely on router behavior.
            const router = createMemoryRouter(
                [
                    {
                        path: '/product/:productId',
                        element: (
                            <AllProvidersWrapper>
                                <ProductViewProvider product={simpleProduct}>
                                    <ProductInfo product={simpleProduct} />
                                </ProductViewProvider>
                            </AllProvidersWrapper>
                        ),
                    },
                    // Catch-all route to prevent 404 errors when navigating
                    {
                        path: '*',
                        element: <div>Navigated</div>,
                    },
                ],
                {
                    initialEntries: ['/product/test-product'],
                }
            );
            render(<RouterProvider router={router} />);

            await waitFor(() => expect(screen.getByRole('radiogroup')).toBeInTheDocument());
            expect(screen.getAllByRole('radio')).toHaveLength(2);
            expect(screen.getByRole('radio', { name: 'Delivery' })).not.toBeChecked();
            expect(screen.getByRole('radio', { name: /pickup in/i })).toBeInTheDocument();
        });

        test('should not render DeliveryOptions in edit mode without basketPickupStore', () => {
            const simpleProduct = {
                ...mockProduct,
                variationAttributes: [],
            };

            // In edit mode without basket context/itemId, basketPickupStore is undefined
            const router = createMemoryRouter(
                [
                    {
                        path: '/product/:productId',
                        element: (
                            <AllProvidersWrapper>
                                <ProductViewProvider product={simpleProduct} mode="edit">
                                    <ProductInfo product={simpleProduct} />
                                </ProductViewProvider>
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                {
                    initialEntries: ['/product/test-product'],
                }
            );
            render(<RouterProvider router={router} />);

            // DeliveryOptions hidden in edit mode when no basket pickup store exists
            expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
        });

        test.each([
            ['preorderable', { preorderable: true, backorderable: false }],
            ['backorderable', { preorderable: false, backorderable: true }],
        ])('keeps the picker for a resolved %s variant', async (_availability, availability) => {
            const currentVariant = {
                productId: 'deferred-variant',
                inventory: { id: 'variant-inventory', ats: 0, orderable: true, ...availability },
            } as ShopperProducts.schemas['Variant'];

            renderProductInfo({ product: standardProd, currentVariant });

            await waitFor(() =>
                expect(screen.getByRole('radiogroup', { name: 'Fulfillment method' })).toBeInTheDocument()
            );
        });

        test('keeps the picker for a deferred standalone product', async () => {
            const deferredProduct = {
                ...standardProd,
                inventory: {
                    ...standardProd.inventory,
                    id: 'standalone-inventory',
                    ats: 0,
                    orderable: true,
                    preorderable: true,
                    backorderable: false,
                },
            };

            renderProductInfo({ product: deferredProduct });

            await waitFor(() =>
                expect(screen.getByRole('radiogroup', { name: 'Fulfillment method' })).toBeInTheDocument()
            );
        });

        test('keeps Delivery available when standalone inventory has no ats', async () => {
            const productWithUnknownAvailability = {
                ...standardProd,
                inventory: {
                    ...standardProd.inventory,
                    id: 'standalone-inventory',
                    ats: undefined,
                    orderable: true,
                    preorderable: true,
                    backorderable: false,
                },
            };

            renderProductInfo({ product: productWithUnknownAvailability });

            expect(await screen.findByRole('radio', { name: 'Delivery' })).toBeEnabled();
        });

        test('keeps Delivery available when standalone inventory is incomplete', async () => {
            const productWithUnknownAvailability = {
                ...standardProd,
                inventory: {
                    ...standardProd.inventory,
                    id: 'standalone-inventory',
                    ats: undefined,
                    orderable: undefined,
                },
            };

            renderProductInfo({ product: productWithUnknownAvailability });

            expect(await screen.findByRole('radio', { name: 'Delivery' })).toBeEnabled();
        });

        test('keeps Delivery unavailable when standalone inventory explicitly is not orderable without ats', async () => {
            const productWithUnavailableInventory = {
                ...standardProd,
                inventory: {
                    ...standardProd.inventory,
                    id: 'standalone-inventory',
                    ats: undefined,
                    orderable: false,
                    preorderable: false,
                    backorderable: false,
                },
            };

            renderProductInfo({ product: productWithUnavailableInventory });

            expect(await screen.findByRole('radio', { name: 'Delivery' })).toBeDisabled();
        });

        test('keeps Delivery unavailable when a standalone product is out of stock', async () => {
            const outOfStockProduct = {
                ...standardProd,
                inventory: {
                    ...standardProd.inventory,
                    id: 'standalone-inventory',
                    ats: 0,
                    orderable: false,
                    preorderable: false,
                    backorderable: false,
                },
            };

            renderProductInfo({ product: outOfStockProduct });

            expect(await screen.findByRole('radio', { name: 'Delivery' })).toBeDisabled();
        });

        test('keeps the picker for an unresolved master with deferred master inventory', async () => {
            const masterProduct = {
                ...standardProd,
                type: { master: true },
                inventory: {
                    ...standardProd.inventory,
                    id: 'master-inventory',
                    ats: 0,
                    orderable: true,
                    preorderable: true,
                    backorderable: false,
                },
                variationAttributes: [
                    {
                        id: 'size',
                        name: 'Size',
                        values: [
                            { name: 'Small', value: 'S', orderable: true },
                            { name: 'Medium', value: 'M', orderable: true },
                        ],
                    },
                ],
                variants: [
                    { productId: 'variant-small', variationValues: { size: 'S' }, orderable: true },
                    { productId: 'variant-medium', variationValues: { size: 'M' }, orderable: true },
                ],
            };

            renderProductInfo({ product: masterProduct });

            expect(await screen.findByRole('radiogroup', { name: 'Fulfillment method' })).toBeInTheDocument();
            expect(screen.getByRole('radio', { name: 'Delivery' })).toBeEnabled();
        });

        test('keeps Delivery available for an unavailable master with no loaded variants', async () => {
            const masterProduct = {
                ...standardProd,
                type: { master: true },
                inventory: {
                    ...standardProd.inventory,
                    id: 'master-inventory',
                    ats: 0,
                    orderable: false,
                    preorderable: false,
                    backorderable: false,
                },
                variants: undefined,
            };

            renderProductInfo({ product: masterProduct });

            expect(await screen.findByRole('radiogroup', { name: 'Fulfillment method' })).toBeInTheDocument();
            expect(screen.getByRole('radio', { name: 'Delivery' })).toBeEnabled();
        });

        test('keeps the picker while a resolved variant has no inventory yet', async () => {
            const currentVariant = { productId: 'loading-variant' } as ShopperProducts.schemas['Variant'];
            const deferredMasterProduct = {
                ...standardProd,
                type: { master: true },
                inventory: {
                    ...standardProd.inventory,
                    id: 'master-inventory',
                    ats: 0,
                    orderable: true,
                    preorderable: true,
                    backorderable: false,
                },
                variants: [currentVariant],
            };

            renderProductInfo({ product: deferredMasterProduct, currentVariant });

            expect(await screen.findByRole('radiogroup', { name: 'Fulfillment method' })).toBeInTheDocument();
            expect(screen.getByRole('radio', { name: 'Delivery' })).toBeEnabled();
        });

        test('keeps Delivery unavailable when a resolved variant explicitly is not orderable without ats', async () => {
            const currentVariant = {
                productId: 'unavailable-variant',
                inventory: {
                    id: 'variant-inventory',
                    ats: undefined,
                    orderable: false,
                    preorderable: false,
                    backorderable: false,
                },
            } as ShopperProducts.schemas['Variant'];

            renderProductInfo({ product: standardProd, currentVariant });

            expect(await screen.findByRole('radio', { name: 'Delivery' })).toBeDisabled();
        });

        test('clears master and variant-keyed pickup state for deferred availability', async () => {
            const currentVariant = {
                productId: 'deferred-variant',
                inventory: {
                    id: 'variant-inventory',
                    ats: 0,
                    orderable: true,
                    preorderable: true,
                    backorderable: false,
                },
            } as ShopperProducts.schemas['Variant'];
            pickupContext.current.pickupBasketItems.set(currentVariant.productId, {
                storeId: 'store-1',
                inventoryId: 'store-inventory',
            });
            renderProductInfo({
                product: standardProd,
                currentVariant,
                initialFulfillmentSelection: {
                    optionId: 'pickup',
                    metadata: { storeId: 'store-1', inventoryId: 'store-inventory' },
                },
                clearDeferredPickupSelection: true,
            });

            await waitFor(() =>
                expect(screen.getByRole('radiogroup', { name: 'Fulfillment method' })).toBeInTheDocument()
            );
            expect(pickupContext.current.removeItem).toHaveBeenCalledTimes(2);
            expect(pickupContext.current.removeItem).toHaveBeenNthCalledWith(1, standardProd.id);
            expect(pickupContext.current.removeItem).toHaveBeenNthCalledWith(2, currentVariant.productId);
        });

        test('clears stale pickup context when deferred availability already selects delivery', async () => {
            const currentVariant = {
                productId: 'deferred-variant',
                inventory: {
                    id: 'variant-inventory',
                    ats: 0,
                    orderable: true,
                    preorderable: true,
                    backorderable: false,
                },
            } as ShopperProducts.schemas['Variant'];
            pickupContext.current.pickupBasketItems.set(standardProd.id, {
                storeId: 'store-1',
                inventoryId: 'store-inventory',
            });

            renderProductInfo({
                product: standardProd,
                currentVariant,
                initialFulfillmentSelection: { optionId: 'delivery' },
                clearDeferredPickupSelection: true,
            });

            await waitFor(() =>
                expect(screen.getByRole('radiogroup', { name: 'Fulfillment method' })).toBeInTheDocument()
            );
            expect(pickupContext.current.removeItem).toHaveBeenCalledWith(standardProd.id);
        });

        test('does not clear a cart edit pickup selection for deferred availability', async () => {
            const currentVariant = {
                productId: 'deferred-variant',
                inventory: {
                    id: 'variant-inventory',
                    ats: 0,
                    orderable: true,
                    preorderable: true,
                    backorderable: false,
                },
            } as ShopperProducts.schemas['Variant'];
            pickupContext.current.pickupBasketItems.set(standardProd.id, {
                storeId: 'store-1',
                inventoryId: 'store-inventory',
            });

            renderProductInfo({
                product: standardProd,
                currentVariant,
                mode: 'edit',
                clearDeferredPickupSelection: true,
                initialFulfillmentSelection: {
                    optionId: 'pickup',
                    metadata: { storeId: 'store-1', inventoryId: 'store-inventory' },
                },
            });

            await waitFor(() =>
                expect(screen.queryByRole('radiogroup', { name: 'Fulfillment method' })).not.toBeInTheDocument()
            );
            expect(pickupContext.current.removeItem).not.toHaveBeenCalled();
        });

        test('does not clear pickup context outside the PDP fulfillment flow', async () => {
            const currentVariant = {
                productId: 'deferred-variant',
                inventory: {
                    id: 'variant-inventory',
                    ats: 0,
                    orderable: true,
                    preorderable: true,
                    backorderable: false,
                },
            } as ShopperProducts.schemas['Variant'];
            pickupContext.current.pickupBasketItems.set(standardProd.id, {
                storeId: 'store-1',
                inventoryId: 'store-inventory',
            });

            renderProductInfo({
                product: standardProd,
                currentVariant,
                initialFulfillmentSelection: {
                    optionId: 'pickup',
                    metadata: { storeId: 'store-1', inventoryId: 'store-inventory' },
                },
            });

            await waitFor(() =>
                expect(screen.getByRole('radiogroup', { name: 'Fulfillment method' })).toBeInTheDocument()
            );
            expect(pickupContext.current.removeItem).not.toHaveBeenCalled();
        });

        test('keeps DeliveryOptions mounted without stale store availability while selected variant inventory loads', () => {
            const simpleProduct = {
                ...mockProduct,
                variationAttributes: [],
                inventories: [{ id: 'store-inventory', stockLevel: 0, orderable: false }],
            };
            const router = createMemoryRouter(
                [
                    {
                        path: '/product/:productId',
                        element: (
                            <AllProvidersWrapper>
                                <ProductViewProvider product={simpleProduct} isVariantInventoryLoading>
                                    <ProductInfo product={simpleProduct} isVariantInventoryLoading />
                                </ProductViewProvider>
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                {
                    initialEntries: ['/product/test-product'],
                }
            );
            render(<RouterProvider router={router} />);

            expect(screen.getByRole('radiogroup', { name: 'Fulfillment method' })).toBeInTheDocument();
            expect(screen.getByRole('radio', { name: /pickup in/i })).toBeEnabled();
        });
    });
});
