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

import { render, screen, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import ChildProducts from './child-products';
import type { ShopperProducts } from '@/scapi';
import userEvent from '@testing-library/user-event';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

// Mock hooks and components
vi.mock('@/hooks/product/use-product-sets-bundles', () => ({
    useProductSetsBundles: vi.fn(),
}));

vi.mock('@/hooks/product/use-product-actions', () => ({
    useProductActions: vi.fn(),
}));

vi.mock('@/providers/product-view', () => ({
    useOptionalProductView: vi.fn(),
}));

// @sfdc-extension-block-start SFDC_EXT_BOPIS
vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    useStoreLocator: vi.fn(),
}));

vi.mock('@/components/fulfillment/delivery-options', () => ({
    default: ({ onSelectionChange }: any) => (
        <button
            data-testid="delivery-options"
            onClick={() =>
                onSelectionChange?.({
                    optionId: 'pickup',
                    metadata: { storeId: 'store-123', inventoryId: 'inventory-store-123' },
                })
            }>
            Delivery Options
        </button>
    ),
}));
// @sfdc-extension-block-end SFDC_EXT_BOPIS

vi.mock('./child-product-card', () => ({
    default: ({ childProduct, onSelectionChange, onOrderabilityChange, selectionSource }: any) => (
        <div data-testid={`child-product-${childProduct.id}`} data-selection-source={selectionSource ?? 'url'}>
            <div>{childProduct.name}</div>
            <button
                onClick={() =>
                    onSelectionChange(childProduct.id, {
                        product: childProduct,
                        quantity: 1,
                    })
                }>
                Select Product
            </button>
            <button
                onClick={() =>
                    onOrderabilityChange?.(childProduct.id, {
                        isOrderable: true,
                    })
                }>
                Mark Orderable
            </button>
        </div>
    ),
}));

const setLineItems = [
    { id: 'child-1', product: { id: 'child-1', name: 'Child 1', type: { item: true } }, quantity: 1 },
    { id: 'child-2', product: { id: 'child-2', name: 'Child 2', type: { item: true } }, quantity: 1 },
] as NonNullable<ShopperProducts.schemas['Product']['setProducts']>;

const bundledLineItems = [
    { id: 'child-1', product: { id: 'child-1', name: 'Child 1', type: { item: true } }, quantity: 1 },
    { id: 'child-2', product: { id: 'child-2', name: 'Child 2', type: { item: true } }, quantity: 1 },
] as NonNullable<ShopperProducts.schemas['Product']['bundledProducts']>;

const createSetProduct = (): ShopperProducts.schemas['Product'] => ({
    id: 'set-123',
    name: 'Test Set',
    type: { set: true },
    price: 49,
    setProducts: setLineItems,
});

const createBundleProduct = (): ShopperProducts.schemas['Product'] => ({
    id: 'bundle-123',
    name: 'Test Bundle',
    type: { bundle: true },
    price: 99,
    bundledProducts: bundledLineItems,
});

const renderChildProducts = (props: any) => {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: <ChildProducts {...props} />,
            },
        ],
        {
            initialEntries: ['/'],
        }
    );
    return render(<RouterProvider router={router} />);
};

describe('ChildProducts', () => {
    const { t } = getTranslation();
    const mockHandleProductSetAddToCart = vi.fn();
    const mockHandleProductBundleAddToCart = vi.fn();
    const mockHandleUpdateBundle = vi.fn();
    const mockHandleChildProductValidation = vi.fn();
    const mockSetChildProductSelection = vi.fn();
    const mockSetChildProductOrderability = vi.fn();
    const mockSetSelectedBundleQuantity = vi.fn();

    // Helper to create default mock return value
    const createDefaultSetsBundlesMock = (overrides: any = {}) => {
        const childProducts = [
            { id: 'child-1', name: 'Child 1', type: { item: true } },
            { id: 'child-2', name: 'Child 2', type: { item: true } },
        ];
        return {
            comboProduct: { childProducts },
            childProductSelection: {},
            selectedBundleQuantity: 1,
            areAllChildProductsSelected: false,
            hasUnorderableChildProducts: false,
            handleChildProductValidation: mockHandleChildProductValidation,
            setChildProductSelection: mockSetChildProductSelection,
            setChildProductOrderability: mockSetChildProductOrderability,
            setSelectedBundleQuantity: mockSetSelectedBundleQuantity,
            selectedChildProductCount: 0,
            totalChildProducts: 2,
            isCompletelyOutOfStock: false,
            productWithCalculatedInventory: { id: 'set-123' },
            effectiveQuantity: 1,
            bundleStockLevel: 10,
            bundleOutOfStock: false,
            ...overrides,
        };
    };

    beforeEach(async () => {
        vi.clearAllMocks();

        const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
        const { useProductActions } = await import('@/hooks/product/use-product-actions');
        const { useOptionalProductView } = await import('@/providers/product-view');
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        const { useStoreLocator } = await import('@/extensions/store-locator/providers/store-locator');

        vi.mocked(useStoreLocator).mockReturnValue(null);
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        vi.mocked(useProductActions).mockReturnValue({
            isAddingToOrUpdatingCart: false,
            handleProductSetAddToCart: mockHandleProductSetAddToCart,
            handleProductBundleAddToCart: mockHandleProductBundleAddToCart,
            handleUpdateBundle: mockHandleUpdateBundle,
            basketPickupStore: undefined,
        } as any);
        vi.mocked(useOptionalProductView).mockReturnValue(null);

        // Default mock - can be overridden in individual tests
        vi.mocked(useProductSetsBundles).mockReturnValue(createDefaultSetsBundlesMock());
    });

    describe('basic rendering', () => {
        test('returns null for non-set/non-bundle products', () => {
            const standardProduct: ShopperProducts.schemas['Product'] = {
                id: 'standard-123',
                name: 'Standard Product',
                type: { item: true },
            };

            const { container } = renderChildProducts({
                parentProduct: standardProduct,
            });

            expect(container.firstChild).toBeNull();
        });

        test('renders child products grid for set', () => {
            const setProduct = createSetProduct();

            renderChildProducts({
                parentProduct: setProduct,
            });

            expect(screen.getByTestId('child-product-child-1')).toBeInTheDocument();
            expect(screen.getByTestId('child-product-child-2')).toBeInTheDocument();
        });

        test('renders child products grid for bundle', () => {
            const bundleProduct = createBundleProduct();

            renderChildProducts({
                parentProduct: bundleProduct,
            });

            expect(screen.getByTestId('child-product-child-1')).toBeInTheDocument();
            expect(screen.getByTestId('child-product-child-2')).toBeInTheDocument();
        });

        test('renders progress indicator showing selection count', () => {
            const setProduct = createSetProduct();

            renderChildProducts({
                parentProduct: setProduct,
            });

            expect(screen.getByText(/0.*2/)).toBeInTheDocument(); // "0 of 2" format
        });

        test('passes selectionSource="url" to child cards by default (PDP behavior)', () => {
            const setProduct = createSetProduct();

            renderChildProducts({
                parentProduct: setProduct,
            });

            expect(screen.getByTestId('child-product-child-1')).toHaveAttribute('data-selection-source', 'url');
            expect(screen.getByTestId('child-product-child-2')).toHaveAttribute('data-selection-source', 'url');
        });

        test('passes selectionSource="local" to child cards when explicitly set (modal behavior)', () => {
            const setProduct = createSetProduct();

            renderChildProducts({
                parentProduct: setProduct,
                selectionSource: 'local',
            });

            expect(screen.getByTestId('child-product-child-1')).toHaveAttribute('data-selection-source', 'local');
            expect(screen.getByTestId('child-product-child-2')).toHaveAttribute('data-selection-source', 'local');
        });
    });

    describe('price availability', () => {
        const fullySelected = (overrides: any = {}) =>
            createDefaultSetsBundlesMock({
                areAllChildProductsSelected: true,
                hasUnorderableChildProducts: false,
                isCompletelyOutOfStock: false,
                selectedChildProductCount: 2,
                ...overrides,
            });

        test('disables "Add Set to Cart" when the set has no price for the active currency', async () => {
            const setProduct = createSetProduct();
            delete setProduct.price;

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue(fullySelected());

            renderChildProducts({ parentProduct: setProduct, mode: 'add' });

            expect(screen.getByRole('button', { name: /add set to cart/i })).toBeDisabled();
        });

        test('disables "Add Bundle to Cart" when the bundle has no price for the active currency', async () => {
            const bundleProduct = createBundleProduct();
            delete bundleProduct.price;

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue(fullySelected());

            renderChildProducts({ parentProduct: bundleProduct, mode: 'add' });

            expect(screen.getByRole('button', { name: /add bundle to cart/i })).toBeDisabled();
        });

        test('keeps "Add Set to Cart" enabled when the set price is an explicit 0', async () => {
            const setProduct = createSetProduct();
            setProduct.price = 0;

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue(fullySelected());

            renderChildProducts({ parentProduct: setProduct, mode: 'add' });

            expect(screen.getByRole('button', { name: /add set to cart/i })).toBeEnabled();
        });
    });

    describe('product set behavior', () => {
        test('does not show bundle quantity picker for sets', () => {
            const setProduct = createSetProduct();

            renderChildProducts({
                parentProduct: setProduct,
            });

            expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
        });

        test('shows "Add Set to Cart" button for sets in add mode', () => {
            const setProduct = createSetProduct();

            renderChildProducts({
                parentProduct: setProduct,
                mode: 'add',
            });

            expect(screen.getByRole('button', { name: /add set to cart/i })).toBeInTheDocument();
        });

        test('calls handleProductSetAddToCart when adding set', async () => {
            const setProduct = createSetProduct();
            const user = userEvent.setup();

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                comboProduct: {
                    childProducts: [
                        { id: 'child-1', name: 'Child 1', type: { item: true } },
                        { id: 'child-2', name: 'Child 2', type: { item: true } },
                    ],
                },
                childProductSelection: {
                    'child-1': { product: { id: 'child-1' }, quantity: 1 },
                    'child-2': { product: { id: 'child-2' }, quantity: 1 },
                },
                selectedBundleQuantity: 1,
                areAllChildProductsSelected: true,
                hasUnorderableChildProducts: false,
                handleChildProductValidation: mockHandleChildProductValidation.mockReturnValue(true),
                setChildProductSelection: mockSetChildProductSelection,
                setChildProductOrderability: mockSetChildProductOrderability,
                setSelectedBundleQuantity: mockSetSelectedBundleQuantity,
                selectedChildProductCount: 2,
                totalChildProducts: 2,
                isCompletelyOutOfStock: false,
                productWithCalculatedInventory: { id: 'set-123' },
                effectiveQuantity: 1,
                bundleStockLevel: 10,
                bundleOutOfStock: false,
            } as any);

            renderChildProducts({
                parentProduct: setProduct,
            });

            const button = screen.getByRole('button', { name: /add set to cart/i });
            await user.click(button);

            await waitFor(() => {
                expect(mockHandleChildProductValidation).toHaveBeenCalled();
                expect(mockHandleProductSetAddToCart).toHaveBeenCalledWith([
                    { product: { id: 'child-1' }, quantity: 1 },
                    { product: { id: 'child-2' }, quantity: 1 },
                ]);
            });
        });

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        test('passes the parent fulfillment selection when adding every set item', async () => {
            const setProduct = createSetProduct();
            const user = userEvent.setup();
            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue(
                createDefaultSetsBundlesMock({
                    childProductSelection: {
                        'child-1': { product: { id: 'child-1' }, quantity: 1 },
                        'child-2': { product: { id: 'child-2' }, quantity: 1 },
                    },
                    areAllChildProductsSelected: true,
                    selectedChildProductCount: 2,
                })
            );
            mockHandleChildProductValidation.mockReturnValue(true);

            renderChildProducts({ parentProduct: setProduct });
            await user.click(screen.getByTestId('delivery-options'));
            await user.click(screen.getByRole('button', { name: /add set to cart/i }));

            expect(mockHandleProductSetAddToCart).toHaveBeenCalledWith(expect.any(Array), {
                optionId: 'pickup',
                metadata: { storeId: 'store-123', inventoryId: 'inventory-store-123' },
            });
        });

        test('uses the PDP fulfillment selection when adding a set', async () => {
            const setProduct = createSetProduct();
            const user = userEvent.setup();
            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            const { useOptionalProductView } = await import('@/providers/product-view');
            vi.mocked(useProductSetsBundles).mockReturnValue(
                createDefaultSetsBundlesMock({
                    childProductSelection: {
                        'child-1': { product: { id: 'child-1' }, quantity: 1 },
                        'child-2': { product: { id: 'child-2' }, quantity: 1 },
                    },
                    areAllChildProductsSelected: true,
                    selectedChildProductCount: 2,
                })
            );
            vi.mocked(useOptionalProductView).mockReturnValue({
                fulfillmentSelection: { optionId: 'delivery' },
                setFulfillmentSelection: vi.fn(),
            } as never);
            mockHandleChildProductValidation.mockReturnValue(true);

            renderChildProducts({ parentProduct: setProduct });
            await user.click(screen.getByRole('button', { name: /add set to cart/i }));

            expect(mockHandleProductSetAddToCart).toHaveBeenCalledWith(expect.any(Array), { optionId: 'delivery' });
        });
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
    });

    describe('product bundle behavior', () => {
        test('shows bundle quantity picker for bundles', () => {
            const bundleProduct = createBundleProduct();

            renderChildProducts({
                parentProduct: bundleProduct,
            });

            expect(screen.getByRole('spinbutton')).toBeInTheDocument();
        });

        test('shows "Add Bundle to Cart" button for bundles in add mode', () => {
            const bundleProduct = createBundleProduct();

            renderChildProducts({
                parentProduct: bundleProduct,
                mode: 'add',
            });

            expect(screen.getByRole('button', { name: /add bundle to cart/i })).toBeInTheDocument();
        });

        test('shows "Update Cart" button for bundles in edit mode', async () => {
            const bundleProduct = createBundleProduct();

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');

            // Clear and override mock for this specific test
            vi.mocked(useProductSetsBundles).mockClear();
            vi.mocked(useProductSetsBundles).mockImplementation(() =>
                createDefaultSetsBundlesMock({
                    areAllChildProductsSelected: true,
                    selectedChildProductCount: 2,
                    selectedBundleQuantity: 2,
                    childProductSelection: {
                        'child-1': { product: { id: 'child-1' }, quantity: 1 },
                        'child-2': { product: { id: 'child-2' }, quantity: 1 },
                    },
                })
            );

            renderChildProducts({
                parentProduct: bundleProduct,
                mode: 'edit',
                itemId: 'item-123',
                initialBundleQuantity: 2,
            });

            // Button text may be "Update" or "Update Cart" depending on uiStrings
            expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
        });

        test('calls handleProductBundleAddToCart when adding bundle', async () => {
            const bundleProduct = createBundleProduct();
            const user = userEvent.setup();

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                comboProduct: {
                    childProducts: [
                        { id: 'child-1', name: 'Child 1', type: { item: true } },
                        { id: 'child-2', name: 'Child 2', type: { item: true } },
                    ],
                },
                childProductSelection: {
                    'child-1': { product: { id: 'child-1' }, quantity: 1 },
                    'child-2': { product: { id: 'child-2' }, quantity: 1 },
                },
                selectedBundleQuantity: 3,
                areAllChildProductsSelected: true,
                hasUnorderableChildProducts: false,
                handleChildProductValidation: mockHandleChildProductValidation.mockReturnValue(true),
                setChildProductSelection: mockSetChildProductSelection,
                setChildProductOrderability: mockSetChildProductOrderability,
                setSelectedBundleQuantity: mockSetSelectedBundleQuantity,
                selectedChildProductCount: 2,
                totalChildProducts: 2,
                isCompletelyOutOfStock: false,
                productWithCalculatedInventory: { id: 'bundle-123' },
                effectiveQuantity: 3,
                bundleStockLevel: 10,
                bundleOutOfStock: false,
            } as any);

            renderChildProducts({
                parentProduct: bundleProduct,
            });

            const button = screen.getByRole('button', { name: /add bundle to cart/i });
            await user.click(button);

            await waitFor(() => {
                expect(mockHandleChildProductValidation).toHaveBeenCalled();
                expect(mockHandleProductBundleAddToCart).toHaveBeenCalledWith(3, [
                    { product: { id: 'child-1' }, quantity: 1 },
                    { product: { id: 'child-2' }, quantity: 1 },
                ]);
            });
        });

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        test('passes the parent fulfillment selection when adding a bundle', async () => {
            const bundleProduct = createBundleProduct();
            const user = userEvent.setup();
            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue(
                createDefaultSetsBundlesMock({
                    childProductSelection: {
                        'child-1': { product: { id: 'child-1' }, quantity: 1 },
                        'child-2': { product: { id: 'child-2' }, quantity: 1 },
                    },
                    selectedBundleQuantity: 2,
                    areAllChildProductsSelected: true,
                    selectedChildProductCount: 2,
                    productWithCalculatedInventory: { id: 'bundle-123' },
                })
            );
            mockHandleChildProductValidation.mockReturnValue(true);

            renderChildProducts({ parentProduct: bundleProduct });
            await user.click(screen.getByTestId('delivery-options'));
            await user.click(screen.getByRole('button', { name: /add bundle to cart/i }));

            expect(mockHandleProductBundleAddToCart).toHaveBeenCalledWith(2, expect.any(Array), {
                optionId: 'pickup',
                metadata: { storeId: 'store-123', inventoryId: 'inventory-store-123' },
            });
        });

        test('uses the PDP fulfillment selection when adding a bundle', async () => {
            const bundleProduct = createBundleProduct();
            const user = userEvent.setup();
            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            const { useOptionalProductView } = await import('@/providers/product-view');
            vi.mocked(useProductSetsBundles).mockReturnValue(
                createDefaultSetsBundlesMock({
                    childProductSelection: {
                        'child-1': { product: { id: 'child-1' }, quantity: 1 },
                        'child-2': { product: { id: 'child-2' }, quantity: 1 },
                    },
                    selectedBundleQuantity: 2,
                    areAllChildProductsSelected: true,
                    selectedChildProductCount: 2,
                    productWithCalculatedInventory: { id: 'bundle-123' },
                })
            );
            vi.mocked(useOptionalProductView).mockReturnValue({
                fulfillmentSelection: { optionId: 'delivery' },
                setFulfillmentSelection: vi.fn(),
            } as never);
            mockHandleChildProductValidation.mockReturnValue(true);

            renderChildProducts({ parentProduct: bundleProduct });
            await user.click(screen.getByRole('button', { name: /add bundle to cart/i }));

            expect(mockHandleProductBundleAddToCart).toHaveBeenCalledWith(2, expect.any(Array), {
                optionId: 'delivery',
            });
        });
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        test('calls handleUpdateBundle when updating bundle', async () => {
            const bundleProduct = createBundleProduct();
            const user = userEvent.setup();

            mockHandleChildProductValidation.mockReturnValue(true);

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');

            // Clear and override mock for this specific test
            vi.mocked(useProductSetsBundles).mockClear();
            vi.mocked(useProductSetsBundles).mockImplementation(() => ({
                ...createDefaultSetsBundlesMock(),
                childProductSelection: {
                    'child-1': { product: { id: 'child-1' }, quantity: 1 },
                    'child-2': { product: { id: 'child-2' }, quantity: 1 },
                },
                selectedBundleQuantity: 2,
                areAllChildProductsSelected: true,
                selectedChildProductCount: 2,
            }));

            renderChildProducts({
                parentProduct: bundleProduct,
                mode: 'edit',
                itemId: 'item-123',
                initialBundleQuantity: 2,
            });

            const button = screen.getByRole('button', { name: /update/i });
            await user.click(button);

            await waitFor(() => {
                expect(mockHandleChildProductValidation).toHaveBeenCalled();
                expect(mockHandleUpdateBundle).toHaveBeenCalledWith(2, [
                    { product: { id: 'child-1' }, quantity: 1 },
                    { product: { id: 'child-2' }, quantity: 1 },
                ]);
            });
        });
    });

    describe('validation and error handling', () => {
        test('disables button when not all children selected', () => {
            const setProduct = createSetProduct();

            renderChildProducts({
                parentProduct: setProduct,
            });

            const button = screen.getByRole('button', { name: /add set to cart/i });
            expect(button).toBeDisabled();
        });

        test('shows error message when not all children selected', () => {
            const setProduct = createSetProduct();

            // Default mock already has areAllChildProductsSelected: false
            renderChildProducts({
                parentProduct: setProduct,
            });

            expect(screen.getByText(t('product:selectAllOptionsAbove'))).toBeInTheDocument();
        });

        test('disables button when has unorderable child products', async () => {
            const setProduct = createSetProduct();

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                comboProduct: {
                    childProducts: [
                        { id: 'child-1', name: 'Child 1', type: { item: true } },
                        { id: 'child-2', name: 'Child 2', type: { item: true } },
                    ],
                },
                childProductSelection: {},
                selectedBundleQuantity: 1,
                areAllChildProductsSelected: true,
                hasUnorderableChildProducts: true,
                handleChildProductValidation: mockHandleChildProductValidation,
                setChildProductSelection: mockSetChildProductSelection,
                setChildProductOrderability: mockSetChildProductOrderability,
                setSelectedBundleQuantity: mockSetSelectedBundleQuantity,
                selectedChildProductCount: 2,
                totalChildProducts: 2,
                isCompletelyOutOfStock: false,
                productWithCalculatedInventory: { id: 'set-123' },
                effectiveQuantity: 1,
                bundleStockLevel: 10,
                bundleOutOfStock: false,
            } as any);

            renderChildProducts({
                parentProduct: setProduct,
            });

            const button = screen.getByRole('button', { name: /add set to cart/i });
            expect(button).toBeDisabled();
        });

        test('disables button when completely out of stock', async () => {
            const setProduct = createSetProduct();

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                comboProduct: {
                    childProducts: [
                        { id: 'child-1', name: 'Child 1', type: { item: true } },
                        { id: 'child-2', name: 'Child 2', type: { item: true } },
                    ],
                },
                childProductSelection: {},
                selectedBundleQuantity: 1,
                areAllChildProductsSelected: true,
                hasUnorderableChildProducts: false,
                handleChildProductValidation: mockHandleChildProductValidation,
                setChildProductSelection: mockSetChildProductSelection,
                setChildProductOrderability: mockSetChildProductOrderability,
                setSelectedBundleQuantity: mockSetSelectedBundleQuantity,
                selectedChildProductCount: 2,
                totalChildProducts: 2,
                isCompletelyOutOfStock: true,
                productWithCalculatedInventory: { id: 'set-123' },
                effectiveQuantity: 1,
                bundleStockLevel: 0,
                bundleOutOfStock: true,
            } as any);

            renderChildProducts({
                parentProduct: setProduct,
            });

            const button = screen.getByRole('button', { name: /add set to cart/i });
            expect(button).toBeDisabled();
        });

        test('does not call cart action when validation fails', async () => {
            const setProduct = createSetProduct();
            const user = userEvent.setup();

            mockHandleChildProductValidation.mockReturnValue(false);

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                comboProduct: {
                    childProducts: [
                        { id: 'child-1', name: 'Child 1', type: { item: true } },
                        { id: 'child-2', name: 'Child 2', type: { item: true } },
                    ],
                },
                childProductSelection: {},
                selectedBundleQuantity: 1,
                areAllChildProductsSelected: true,
                hasUnorderableChildProducts: false,
                handleChildProductValidation: mockHandleChildProductValidation,
                setChildProductSelection: mockSetChildProductSelection,
                setChildProductOrderability: mockSetChildProductOrderability,
                setSelectedBundleQuantity: mockSetSelectedBundleQuantity,
                selectedChildProductCount: 2,
                totalChildProducts: 2,
                isCompletelyOutOfStock: false,
                productWithCalculatedInventory: { id: 'set-123' },
                effectiveQuantity: 1,
                bundleStockLevel: 10,
                bundleOutOfStock: false,
            } as any);

            renderChildProducts({
                parentProduct: setProduct,
            });

            const button = screen.getByRole('button', { name: /add set to cart/i });
            await user.click(button);

            await waitFor(() => {
                expect(mockHandleChildProductValidation).toHaveBeenCalled();
            });

            expect(mockHandleProductSetAddToCart).not.toHaveBeenCalled();
        });

        test('shows loading state during cart operation', async () => {
            const setProduct = createSetProduct();

            const { useProductActions } = await import('@/hooks/product/use-product-actions');
            vi.mocked(useProductActions).mockReturnValue({
                isAddingToOrUpdatingCart: true,
                handleProductSetAddToCart: mockHandleProductSetAddToCart,
                handleProductBundleAddToCart: mockHandleProductBundleAddToCart,
                handleUpdateBundle: mockHandleUpdateBundle,
                basketPickupStore: undefined,
            } as any);

            renderChildProducts({
                parentProduct: setProduct,
            });

            expect(screen.getByRole('button', { name: /adding/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled();
        });

        test('shows updating state during update operation in edit mode', async () => {
            const bundleProduct = createBundleProduct();

            const { useProductActions } = await import('@/hooks/product/use-product-actions');
            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');

            vi.mocked(useProductActions).mockReturnValueOnce({
                isAddingToOrUpdatingCart: true,
                handleProductSetAddToCart: mockHandleProductSetAddToCart,
                handleProductBundleAddToCart: mockHandleProductBundleAddToCart,
                handleUpdateBundle: mockHandleUpdateBundle,
                basketPickupStore: undefined,
            } as any);

            // Clear and override mock for this specific test
            vi.mocked(useProductSetsBundles).mockClear();
            vi.mocked(useProductSetsBundles).mockImplementation(() => ({
                ...createDefaultSetsBundlesMock(),
                areAllChildProductsSelected: true,
                selectedChildProductCount: 2,
                selectedBundleQuantity: 2,
            }));

            renderChildProducts({
                parentProduct: bundleProduct,
                mode: 'edit',
                itemId: 'item-123',
                initialBundleQuantity: 2,
            });

            expect(screen.getByRole('button', { name: /updating/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /updating/i })).toBeDisabled();
        });
    });

    describe('callbacks', () => {
        test('calls onBeforeCartAction before adding to cart', async () => {
            const onBeforeCartAction = vi.fn();
            const setProduct = createSetProduct();
            const user = userEvent.setup();

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                comboProduct: {
                    childProducts: [
                        { id: 'child-1', name: 'Child 1', type: { item: true } },
                        { id: 'child-2', name: 'Child 2', type: { item: true } },
                    ],
                },
                childProductSelection: {
                    'child-1': { product: { id: 'child-1' }, quantity: 1 },
                },
                selectedBundleQuantity: 1,
                areAllChildProductsSelected: true,
                hasUnorderableChildProducts: false,
                handleChildProductValidation: mockHandleChildProductValidation.mockReturnValue(true),
                setChildProductSelection: mockSetChildProductSelection,
                setChildProductOrderability: mockSetChildProductOrderability,
                setSelectedBundleQuantity: mockSetSelectedBundleQuantity,
                selectedChildProductCount: 1,
                totalChildProducts: 2,
                isCompletelyOutOfStock: false,
                productWithCalculatedInventory: { id: 'set-123' },
                effectiveQuantity: 1,
                bundleStockLevel: 10,
                bundleOutOfStock: false,
            } as any);

            renderChildProducts({
                parentProduct: setProduct,
                onBeforeCartAction,
            });

            const button = screen.getByRole('button', { name: /add set to cart/i });
            await user.click(button);

            await waitFor(() => {
                expect(onBeforeCartAction).toHaveBeenCalled();
            });
        });

        test('calls onCartSuccess after successful add', async () => {
            const onCartSuccess = vi.fn();
            const setProduct = createSetProduct();
            const user = userEvent.setup();

            mockHandleProductSetAddToCart.mockResolvedValue(undefined);

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                comboProduct: {
                    childProducts: [
                        { id: 'child-1', name: 'Child 1', type: { item: true } },
                        { id: 'child-2', name: 'Child 2', type: { item: true } },
                    ],
                },
                childProductSelection: {
                    'child-1': { product: { id: 'child-1' }, quantity: 1 },
                },
                selectedBundleQuantity: 1,
                areAllChildProductsSelected: true,
                hasUnorderableChildProducts: false,
                handleChildProductValidation: mockHandleChildProductValidation.mockReturnValue(true),
                setChildProductSelection: mockSetChildProductSelection,
                setChildProductOrderability: mockSetChildProductOrderability,
                setSelectedBundleQuantity: mockSetSelectedBundleQuantity,
                selectedChildProductCount: 1,
                totalChildProducts: 2,
                isCompletelyOutOfStock: false,
                productWithCalculatedInventory: { id: 'set-123' },
                effectiveQuantity: 1,
                bundleStockLevel: 10,
                bundleOutOfStock: false,
            } as any);

            renderChildProducts({
                parentProduct: setProduct,
                onCartSuccess,
            });

            const button = screen.getByRole('button', { name: /add set to cart/i });
            await user.click(button);

            await waitFor(() => {
                expect(onCartSuccess).toHaveBeenCalled();
            });
        });

        test('calls onCartError after failed add', async () => {
            const onCartError = vi.fn();
            const setProduct = createSetProduct();
            const user = userEvent.setup();

            const error = new Error('Cart error');
            mockHandleProductSetAddToCart.mockRejectedValue(error);

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                comboProduct: {
                    childProducts: [
                        { id: 'child-1', name: 'Child 1', type: { item: true } },
                        { id: 'child-2', name: 'Child 2', type: { item: true } },
                    ],
                },
                childProductSelection: {
                    'child-1': { product: { id: 'child-1' }, quantity: 1 },
                },
                selectedBundleQuantity: 1,
                areAllChildProductsSelected: true,
                hasUnorderableChildProducts: false,
                handleChildProductValidation: mockHandleChildProductValidation.mockReturnValue(true),
                setChildProductSelection: mockSetChildProductSelection,
                setChildProductOrderability: mockSetChildProductOrderability,
                setSelectedBundleQuantity: mockSetSelectedBundleQuantity,
                selectedChildProductCount: 1,
                totalChildProducts: 2,
                isCompletelyOutOfStock: false,
                productWithCalculatedInventory: { id: 'set-123' },
                effectiveQuantity: 1,
                bundleStockLevel: 10,
                bundleOutOfStock: false,
            } as any);

            renderChildProducts({
                parentProduct: setProduct,
                onCartError,
            });

            const button = screen.getByRole('button', { name: /add set to cart/i });
            await user.click(button);

            await waitFor(() => {
                expect(onCartError).toHaveBeenCalledWith(error);
            });
        });

        test('calls onBeforeCartAction before updating cart', async () => {
            const onBeforeCartAction = vi.fn();
            const bundleProduct = createBundleProduct();
            const user = userEvent.setup();

            mockHandleChildProductValidation.mockReturnValue(true);

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');

            // Clear and override mock for this specific test
            vi.mocked(useProductSetsBundles).mockClear();
            vi.mocked(useProductSetsBundles).mockImplementation(() => ({
                ...createDefaultSetsBundlesMock(),
                childProductSelection: {
                    'child-1': { product: { id: 'child-1' }, quantity: 1 },
                    'child-2': { product: { id: 'child-2' }, quantity: 1 },
                },
                selectedBundleQuantity: 2,
                areAllChildProductsSelected: true,
                selectedChildProductCount: 2,
            }));

            renderChildProducts({
                parentProduct: bundleProduct,
                mode: 'edit',
                itemId: 'item-123',
                initialBundleQuantity: 2,
                onBeforeCartAction,
            });

            const button = screen.getByRole('button', { name: /update/i });
            await user.click(button);

            await waitFor(() => {
                expect(onBeforeCartAction).toHaveBeenCalled();
            });
        });

        test('calls onCartSuccess after successful update', async () => {
            const onCartSuccess = vi.fn();
            const bundleProduct = createBundleProduct();
            const user = userEvent.setup();

            mockHandleUpdateBundle.mockResolvedValue(undefined);
            mockHandleChildProductValidation.mockReturnValue(true);

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');

            vi.mocked(useProductSetsBundles).mockReturnValue({
                ...createDefaultSetsBundlesMock(),
                childProductSelection: {
                    'child-1': { product: { id: 'child-1' }, quantity: 1 },
                    'child-2': { product: { id: 'child-2' }, quantity: 1 },
                },
                selectedBundleQuantity: 2,
                areAllChildProductsSelected: true,
                selectedChildProductCount: 2,
            });

            renderChildProducts({
                parentProduct: bundleProduct,
                mode: 'edit',
                itemId: 'item-123',
                initialBundleQuantity: 2,
                onCartSuccess,
            });

            const button = screen.getByRole('button', { name: /update/i });
            await user.click(button);

            await waitFor(() => {
                expect(onCartSuccess).toHaveBeenCalled();
            });
        });

        test('calls onCartError after failed update', async () => {
            const onCartError = vi.fn();
            const bundleProduct = createBundleProduct();
            const user = userEvent.setup();

            const error = new Error('Update error');
            mockHandleUpdateBundle.mockRejectedValue(error);
            mockHandleChildProductValidation.mockReturnValue(true);

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');

            vi.mocked(useProductSetsBundles).mockReturnValue({
                ...createDefaultSetsBundlesMock(),
                childProductSelection: {
                    'child-1': { product: { id: 'child-1' }, quantity: 1 },
                    'child-2': { product: { id: 'child-2' }, quantity: 1 },
                },
                selectedBundleQuantity: 2,
                areAllChildProductsSelected: true,
                selectedChildProductCount: 2,
            });

            renderChildProducts({
                parentProduct: bundleProduct,
                mode: 'edit',
                itemId: 'item-123',
                initialBundleQuantity: 2,
                onCartError,
            });

            const button = screen.getByRole('button', { name: /update/i });
            await user.click(button);

            await waitFor(() => {
                expect(onCartError).toHaveBeenCalledWith(error);
            });
        });

        test('calls onCartError when bundle add fails', async () => {
            const onCartError = vi.fn();
            const bundleProduct = createBundleProduct();
            const user = userEvent.setup();

            const error = new Error('Bundle add error');
            mockHandleProductBundleAddToCart.mockRejectedValue(error);
            mockHandleChildProductValidation.mockReturnValue(true);

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                comboProduct: {
                    childProducts: [
                        { id: 'child-1', name: 'Child 1', type: { item: true } },
                        { id: 'child-2', name: 'Child 2', type: { item: true } },
                    ],
                },
                childProductSelection: {
                    'child-1': { product: { id: 'child-1' }, quantity: 1 },
                    'child-2': { product: { id: 'child-2' }, quantity: 1 },
                },
                selectedBundleQuantity: 3,
                areAllChildProductsSelected: true,
                hasUnorderableChildProducts: false,
                handleChildProductValidation: mockHandleChildProductValidation,
                setChildProductSelection: mockSetChildProductSelection,
                setChildProductOrderability: mockSetChildProductOrderability,
                setSelectedBundleQuantity: mockSetSelectedBundleQuantity,
                selectedChildProductCount: 2,
                totalChildProducts: 2,
                isCompletelyOutOfStock: false,
                productWithCalculatedInventory: { id: 'bundle-123' },
                effectiveQuantity: 3,
                bundleStockLevel: 10,
                bundleOutOfStock: false,
            } as any);

            renderChildProducts({
                parentProduct: bundleProduct,
                onCartError,
            });

            const button = screen.getByRole('button', { name: /add bundle to cart/i });
            await user.click(button);

            await waitFor(() => {
                expect(onCartError).toHaveBeenCalledWith(error);
            });
        });
    });

    describe('child product interactions', () => {
        test('passes setChildProductSelection to child cards', () => {
            const setProduct = createSetProduct();

            renderChildProducts({
                parentProduct: setProduct,
            });

            const selectButton = screen.getAllByText('Select Product')[0];
            selectButton.click();

            expect(mockSetChildProductSelection).toHaveBeenCalledWith('child-1', {
                product: { id: 'child-1', name: 'Child 1', type: { item: true } },
                quantity: 1,
            });
        });

        test('passes setChildProductOrderability to child cards', () => {
            const setProduct = createSetProduct();

            renderChildProducts({
                parentProduct: setProduct,
            });

            const orderableButton = screen.getAllByText('Mark Orderable')[0];
            orderableButton.click();

            expect(mockSetChildProductOrderability).toHaveBeenCalledWith('child-1', {
                isOrderable: true,
            });
        });
    });

    describe('edge cases and error scenarios', () => {
        test('handles empty childProducts array', async () => {
            const setProduct = createSetProduct();

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                ...createDefaultSetsBundlesMock(),
                comboProduct: {
                    childProducts: [],
                },
                totalChildProducts: 0,
                selectedChildProductCount: 0,
                areAllChildProductsSelected: false, // With no children, this should be false
            });

            renderChildProducts({
                parentProduct: setProduct,
            });

            // Should render without crashing - button should still be present but disabled
            const button = screen.getByRole('button', { name: /add set to cart/i });
            expect(button).toBeInTheDocument();
            expect(button).toBeDisabled();
        });

        test('handles undefined childProducts gracefully', async () => {
            const setProduct = createSetProduct();

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                ...createDefaultSetsBundlesMock(),
                comboProduct: {
                    childProducts: undefined,
                },
                totalChildProducts: 0,
                selectedChildProductCount: 0,
            });

            renderChildProducts({
                parentProduct: setProduct,
            });

            // Should render without crashing
            expect(screen.queryByTestId('child-product-child-1')).not.toBeInTheDocument();
        });

        test('calculates progress bar width correctly', async () => {
            const setProduct = createSetProduct();

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                ...createDefaultSetsBundlesMock(),
                selectedChildProductCount: 1,
                totalChildProducts: 2,
            });

            const { container } = renderChildProducts({
                parentProduct: setProduct,
            });

            // Progress bar should be at 50% (1/2)
            const progressBar = container.querySelector('.bg-primary.h-2.rounded-full');
            expect(progressBar).toHaveStyle({ width: '50%' });
        });

        test('handles progress bar at 0%', async () => {
            const setProduct = createSetProduct();

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                ...createDefaultSetsBundlesMock(),
                selectedChildProductCount: 0,
                totalChildProducts: 2,
            });

            const { container } = renderChildProducts({
                parentProduct: setProduct,
            });

            const progressBar = container.querySelector('.bg-primary.h-2.rounded-full');
            expect(progressBar).toHaveStyle({ width: '0%' });
        });

        test('handles progress bar at 100%', async () => {
            const setProduct = createSetProduct();

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                ...createDefaultSetsBundlesMock(),
                selectedChildProductCount: 2,
                totalChildProducts: 2,
            });

            const { container } = renderChildProducts({
                parentProduct: setProduct,
            });

            const progressBar = container.querySelector('.bg-primary.h-2.rounded-full');
            expect(progressBar).toHaveStyle({ width: '100%' });
        });

        test('handles division by zero in progress calculation gracefully', async () => {
            const setProduct = createSetProduct();

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                ...createDefaultSetsBundlesMock(),
                selectedChildProductCount: 0,
                totalChildProducts: 0,
            });

            const { container } = renderChildProducts({
                parentProduct: setProduct,
            });

            // Should render without crashing (NaN or 0% width)
            const progressBar = container.querySelector('.bg-primary.h-2.rounded-full');
            expect(progressBar).toBeInTheDocument();
        });

        test('does not call cart action when validation fails in update mode', async () => {
            const bundleProduct = createBundleProduct();
            const user = userEvent.setup();

            mockHandleChildProductValidation.mockReturnValue(false);

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                ...createDefaultSetsBundlesMock(),
                areAllChildProductsSelected: true,
                selectedChildProductCount: 2,
            });

            renderChildProducts({
                parentProduct: bundleProduct,
                mode: 'edit',
                itemId: 'item-123',
                initialBundleQuantity: 2,
            });

            const button = screen.getByRole('button', { name: /update/i });
            await user.click(button);

            await waitFor(() => {
                expect(mockHandleChildProductValidation).toHaveBeenCalled();
            });

            expect(mockHandleUpdateBundle).not.toHaveBeenCalled();
        });
    });

    describe('bundle quantity picker integration', () => {
        test('passes correct props to ProductQuantityPicker for bundles', async () => {
            const bundleProduct = createBundleProduct();

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                ...createDefaultSetsBundlesMock(),
                selectedBundleQuantity: 3,
                bundleStockLevel: 10,
                bundleOutOfStock: false,
            });

            renderChildProducts({
                parentProduct: bundleProduct,
            });

            const quantityPicker = screen.getByRole('spinbutton');
            expect(quantityPicker).toBeInTheDocument();
            expect(quantityPicker).toHaveValue(3);
        });

        test('handles bundle out of stock state', async () => {
            const bundleProduct = createBundleProduct();

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            vi.mocked(useProductSetsBundles).mockReturnValue({
                ...createDefaultSetsBundlesMock(),
                selectedBundleQuantity: 1,
                bundleStockLevel: 0,
                bundleOutOfStock: true,
            });

            renderChildProducts({
                parentProduct: bundleProduct,
            });

            const quantityPicker = screen.getByRole('spinbutton');
            expect(quantityPicker).toBeInTheDocument();
        });
    });
});
