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
import ChildProducts from '@/components/product-view/child-products';
import type { ShopperProducts } from '@/scapi';

// Mock hooks and components
vi.mock('@/hooks/product/use-product-sets-bundles', () => ({
    useProductSetsBundles: vi.fn(),
}));

vi.mock('@/hooks/product/use-product-actions', () => ({
    useProductActions: vi.fn(),
}));

vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    useStoreLocator: vi.fn(),
}));

vi.mock('@/components/fulfillment/delivery-options', () => ({
    default: () => <div data-testid="delivery-options">Delivery Options</div>,
}));

vi.mock('@/components/product-view/child-product-card', () => ({
    default: ({ childProduct, onSelectionChange, onOrderabilityChange }: any) => (
        <div data-testid={`child-product-${childProduct.id}`}>
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
    setProducts: setLineItems,
});

const createBundleProduct = (): ShopperProducts.schemas['Product'] => ({
    id: 'bundle-123',
    name: 'Test Bundle',
    type: { bundle: true },
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

describe('ChildProducts - BOPIS', () => {
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
        const { useStoreLocator } = await import('@/extensions/store-locator/providers/store-locator');

        vi.mocked(useStoreLocator).mockReturnValue(null);

        vi.mocked(useProductActions).mockReturnValue({
            isAddingToOrUpdatingCart: false,
            handleProductSetAddToCart: mockHandleProductSetAddToCart,
            handleProductBundleAddToCart: mockHandleProductBundleAddToCart,
            handleUpdateBundle: mockHandleUpdateBundle,
            basketPickupStore: undefined,
        } as any);

        // Default mock - can be overridden in individual tests
        vi.mocked(useProductSetsBundles).mockReturnValue(createDefaultSetsBundlesMock());
    });

    describe('BOPIS integration', () => {
        test('renders delivery options in add mode', () => {
            const setProduct = createSetProduct();

            renderChildProducts({
                parentProduct: setProduct,
                mode: 'add',
            });

            expect(screen.getByTestId('delivery-options')).toBeInTheDocument();
        });

        test('does not render delivery options in edit mode when basketPickupStore exists', async () => {
            const bundleProduct = createBundleProduct();

            const { useProductActions } = await import('@/hooks/product/use-product-actions');
            vi.mocked(useProductActions).mockReturnValue({
                isAddingToOrUpdatingCart: false,
                handleProductSetAddToCart: mockHandleProductSetAddToCart,
                handleProductBundleAddToCart: mockHandleProductBundleAddToCart,
                handleUpdateBundle: mockHandleUpdateBundle,
                basketPickupStore: { id: 'store-123', name: 'Test Store' },
            } as any);

            renderChildProducts({
                parentProduct: bundleProduct,
                mode: 'edit',
                itemId: 'item-123',
                initialBundleQuantity: 2,
            });

            expect(screen.queryByTestId('delivery-options')).not.toBeInTheDocument();
        });

        test('does not render delivery options in edit mode when basketPickupStore is undefined', () => {
            const bundleProduct = createBundleProduct();

            renderChildProducts({
                parentProduct: bundleProduct,
                mode: 'edit',
                itemId: 'item-123',
                initialBundleQuantity: 2,
            });

            expect(screen.queryByTestId('delivery-options')).not.toBeInTheDocument();
        });
    });

    describe('BOPIS store selection', () => {
        test('passes selectedStore inventoryId to useProductSetsBundles', async () => {
            const setProduct = createSetProduct();
            const mockSelectedStore = {
                id: 'store-123',
                name: 'Test Store',
                inventoryId: 'inventory-store-123',
            };

            const { useStoreLocator } = await import('@/extensions/store-locator/providers/store-locator');
            vi.mocked(useStoreLocator).mockReturnValue(mockSelectedStore);

            const { useProductSetsBundles } = await import('@/hooks/product/use-product-sets-bundles');
            const mockUseProductSetsBundles = vi.mocked(useProductSetsBundles);
            mockUseProductSetsBundles.mockClear();

            renderChildProducts({
                parentProduct: setProduct,
            });

            await waitFor(() => {
                expect(mockUseProductSetsBundles).toHaveBeenCalledWith(
                    expect.objectContaining({
                        selectedStoreInventoryId: 'inventory-store-123',
                    })
                );
            });
        });

        test('handles null selectedStore gracefully', () => {
            const setProduct = createSetProduct();

            renderChildProducts({
                parentProduct: setProduct,
            });

            // Should render without crashing
            expect(screen.getByTestId('child-product-child-1')).toBeInTheDocument();
        });
    });
});
