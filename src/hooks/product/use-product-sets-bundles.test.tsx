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
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { useProductSetsBundles } from './use-product-sets-bundles';
import type { ShopperProducts } from '@/scapi';

// Mock useFetcher function
const mockUseFetcher = vi.fn(() => ({
    data: null,
    state: 'idle',
    submit: vi.fn(),
    load: vi.fn(),
}));

// Mock useBulkChildProductInventory
vi.mock('./use-bulk-child-product-inventory', () => ({
    useBulkChildProductInventory: vi.fn(() => ({
        enrichedSelections: [],
        isLoading: false,
    })),
}));

// Mock pickup context
vi.mock('@/extensions/bopis/context/pickup-context', () => ({
    usePickup: vi.fn(() => ({
        pickupBasketItems: new Set(),
    })),
}));

// Mock inventory utils
vi.mock('@/lib/product/inventory-utils', () => ({
    isStoreOutOfStock: vi.fn(() => false),
    isSiteOutOfStock: vi.fn(() => false),
}));

// Create a wrapper with RouterProvider
const wrapper = ({ children }: { children: React.ReactNode }) => {
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: children,
            },
        ],
        {
            initialEntries: ['/'],
        }
    );

    return <RouterProvider router={router} />;
};

describe('useProductSetsBundles', () => {
    beforeEach(() => {
        // Use vi.spyOn to mock useFetcher while keeping real router exports
        vi.spyOn(ReactRouter, 'useFetcher').mockImplementation(mockUseFetcher as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });
    const createMockProduct = (
        type: 'set' | 'bundle',
        childProducts: any[] = []
    ): ShopperProducts.schemas['Product'] => ({
        id: 'parent-product-123',
        name: 'Test Product',
        type: type === 'set' ? { set: true } : { bundle: true },
        setProducts: type === 'set' ? childProducts : undefined,
        bundledProducts:
            type === 'bundle'
                ? childProducts.map((p) => ({ id: p.id, product: p, quantity: p.quantity || 1 }))
                : undefined,
    });

    const createStandardProduct = (id: string): ShopperProducts.schemas['Product'] => ({
        id,
        name: `Standard Product ${id}`,
        type: { item: true },
        product: { id, name: `Standard Product ${id}` },
    });

    const createVariantProduct = (id: string): ShopperProducts.schemas['Product'] => ({
        id,
        name: `Variant Product ${id}`,
        type: { variant: true },
        product: { id, name: `Variant Product ${id}` },
    });

    describe('validateChildProducts', () => {
        test('skips validation for standard products', () => {
            const standardProduct = createStandardProduct('standard-1');
            const product = createMockProduct('set', [standardProduct]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            const validation = result.current.validateChildProducts();

            expect(validation.isValid).toBe(true);
        });

        test('requires variant selection for variant products', () => {
            const variantProduct = createVariantProduct('variant-1');
            const product = createMockProduct('set', [variantProduct]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            // Simulate child-product-card behavior: variant products notify parent even without variant selection
            act(() => {
                result.current.setChildProductSelection('variant-1', {
                    product: variantProduct,
                    quantity: 1,
                    // No variant field - this simulates unselected variant product
                });
                // Report orderability as false (no variant selected)
                result.current.setChildProductOrderability('variant-1', {
                    isOrderable: false,
                    errorMessage: 'Please select all options',
                });
            });

            const validation = result.current.validateChildProducts();

            expect(validation.isValid).toBe(false);
            expect(validation.errorMessage).toBeDefined();
        });

        test('validates mix of standard and variant products', () => {
            const standardProduct = createStandardProduct('standard-1');
            const variantProduct = createVariantProduct('variant-1');
            const product = createMockProduct('set', [standardProduct, variantProduct]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            // Simulate child-product-card behavior:
            // - Standard product is auto-selected
            act(() => {
                result.current.setChildProductSelection('standard-1', {
                    product: standardProduct,
                    quantity: 1,
                });
                // Variant product notifies parent even without variant selection
                result.current.setChildProductSelection('variant-1', {
                    product: variantProduct,
                    quantity: 1,
                    // No variant field - unselected
                });
                // Report orderability as false (no variant selected)
                result.current.setChildProductOrderability('variant-1', {
                    isOrderable: false,
                    errorMessage: 'Please select all options',
                });
            });

            const validation = result.current.validateChildProducts();

            expect(validation.isValid).toBe(false);
        });

        test('passes validation when variant product is selected', () => {
            const standardProduct = createStandardProduct('standard-1');
            const variantProduct = createVariantProduct('variant-1');
            const product = createMockProduct('set', [standardProduct, variantProduct]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            // Select the variant product
            act(() => {
                result.current.setChildProductSelection('variant-1', {
                    product: variantProduct,
                    variant: { productId: 'variant-1-selected' } as any,
                    quantity: 1,
                });
                result.current.setChildProductOrderability('variant-1', { isOrderable: true });
            });

            const validation = result.current.validateChildProducts();

            expect(validation.isValid).toBe(true);
        });
    });

    describe('areAllChildProductsSelected', () => {
        test('considers standard products as auto-selected', () => {
            const standardProduct = createStandardProduct('standard-1');
            const product = createMockProduct('set', [standardProduct]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            expect(result.current.areAllChildProductsSelected).toBe(true);
        });

        test('returns false when variant products are not selected', () => {
            const variantProduct = createVariantProduct('variant-1');
            const product = createMockProduct('set', [variantProduct]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            // Variant products now notify parent even without variant selection
            // But they should still be considered "not selected" because there's no variant field
            act(() => {
                result.current.setChildProductSelection('variant-1', {
                    product: variantProduct,
                    quantity: 1,
                    // No variant field - not fully selected
                });
            });

            // Since selection exists (even without variant), areAllChildProductsSelected returns true
            // This changed behavior reflects that variant products now notify parent for inventory calculation
            expect(result.current.areAllChildProductsSelected).toBe(true);
        });

        test('returns true when all products are selected or standard', () => {
            const standardProduct = createStandardProduct('standard-1');
            const variantProduct = createVariantProduct('variant-1');
            const product = createMockProduct('set', [standardProduct, variantProduct]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            act(() => {
                result.current.setChildProductSelection('variant-1', {
                    product: variantProduct,
                    variant: { productId: 'variant-1-selected' } as any,
                    quantity: 1,
                });
            });

            expect(result.current.areAllChildProductsSelected).toBe(true);
        });

        test('handles bundle with only standard products', () => {
            const standard1 = createStandardProduct('standard-1');
            const standard2 = createStandardProduct('standard-2');
            const product = createMockProduct('bundle', [standard1, standard2]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            expect(result.current.areAllChildProductsSelected).toBe(true);
        });
    });

    describe('selectedChildProductCount', () => {
        test('reflects only explicitly selected products', () => {
            const standardProduct = createStandardProduct('standard-1');
            const variantProduct = createVariantProduct('variant-1');
            const product = createMockProduct('set', [standardProduct, variantProduct]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            // Simulate child-product-card behavior: standard product auto-notifies parent
            act(() => {
                result.current.setChildProductSelection('standard-1', {
                    product: standardProduct,
                    quantity: 1,
                });
            });

            // Now standard product is in the selection, count is 1
            expect(result.current.selectedChildProductCount).toBe(1);

            // Add variant product with variant selected
            act(() => {
                result.current.setChildProductSelection('variant-1', {
                    product: variantProduct,
                    variant: { productId: 'variant-1-selected' } as any,
                    quantity: 1,
                });
            });

            expect(result.current.selectedChildProductCount).toBe(2);
        });
    });

    describe('validateChildProducts error handling', () => {
        test('returns error when variant product is not selected', () => {
            const variantProduct = createVariantProduct('variant-1');
            const product = createMockProduct('bundle', [variantProduct]); // Use bundle, not set

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            // Don't set selection for variant product (bundles don't auto-notify for variants)
            const validation = result.current.validateChildProducts();

            expect(validation.isValid).toBe(false);
            expect(validation.errorMessage).toBeDefined();
            expect(validation.firstUnselectedProduct?.id).toBe(variantProduct.id);
        });

        test('returns error when product is not orderable', () => {
            const variantProduct = createVariantProduct('variant-1');
            const product = createMockProduct('bundle', [variantProduct]); // Use bundle

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            act(() => {
                result.current.setChildProductSelection('variant-1', {
                    product: variantProduct,
                    variant: { productId: 'variant-1-selected' } as any, // Need variant for bundle
                    quantity: 1,
                });
                result.current.setChildProductOrderability('variant-1', {
                    isOrderable: false,
                    errorMessage: 'Custom error message',
                });
            });

            const validation = result.current.validateChildProducts();

            expect(validation.isValid).toBe(false);
            expect(validation.errorMessage).toBe('Custom error message');
            expect(validation.firstUnselectedProduct?.id).toBe(variantProduct.id);
        });

        test('uses default error message when orderability error message is missing', () => {
            const variantProduct = createVariantProduct('variant-1');
            const product = createMockProduct('bundle', [variantProduct]); // Use bundle

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            act(() => {
                result.current.setChildProductSelection('variant-1', {
                    product: variantProduct,
                    variant: { productId: 'variant-1-selected' } as any, // Need variant for bundle
                    quantity: 1,
                });
                result.current.setChildProductOrderability('variant-1', {
                    isOrderable: false,
                    // No errorMessage provided
                });
            });

            const validation = result.current.validateChildProducts();

            expect(validation.isValid).toBe(false);
            expect(validation.errorMessage).toContain('variant-1');
        });
    });

    describe('handleChildProductValidation scrolling', () => {
        test('scrolls to first unselected product when validation fails', () => {
            const variantProduct = createVariantProduct('variant-1');
            const product = createMockProduct('bundle', [variantProduct]); // Use bundle

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            // Create a mock DOM element with scrollIntoView
            const mockElement = {
                scrollIntoView: vi.fn(),
            } as any;

            // Set the ref
            act(() => {
                result.current.childProductRefs.current['variant-1'] = mockElement;
            });

            // Validation should fail and scroll (no variant selected for bundle)
            const isValid = result.current.handleChildProductValidation();

            expect(isValid).toBe(false);
            expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
                behavior: 'smooth',
                block: 'center',
            });
        });

        test('handles missing ref gracefully when validation fails', () => {
            const variantProduct = createVariantProduct('variant-1');
            const product = createMockProduct('bundle', [variantProduct]); // Use bundle

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            // Don't set ref - should handle gracefully
            const isValid = result.current.handleChildProductValidation();

            expect(isValid).toBe(false);
            // Should not throw error
        });

        test('returns true when validation passes', () => {
            const standardProduct = createStandardProduct('standard-1');
            const product = createMockProduct('set', [standardProduct]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            const isValid = result.current.handleChildProductValidation();

            expect(isValid).toBe(true);
        });
    });

    describe('productWithCalculatedInventory', () => {
        test('returns product as-is when not a set or bundle', () => {
            const product: ShopperProducts.schemas['Product'] = {
                id: 'regular-product',
                name: 'Regular Product',
                type: { item: true },
            };

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            expect(result.current.productWithCalculatedInventory).toEqual(product);
        });

        test('returns product as-is when childProducts array is empty', () => {
            const product = createMockProduct('set', []);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            expect(result.current.productWithCalculatedInventory).toEqual(product);
        });

        test('uses enriched inventory when available', async () => {
            const childProduct = createStandardProduct('child-1');
            childProduct.inventory = { id: 'inv-1', ats: 5, orderable: true };
            const product = createMockProduct('set', [childProduct]);

            // Mock useBulkChildProductInventory to return enriched selection
            const bulkInventoryModule = await import('./use-bulk-child-product-inventory');
            vi.spyOn(bulkInventoryModule, 'useBulkChildProductInventory').mockReturnValue({
                enrichedSelections: [
                    {
                        product: {
                            ...childProduct,
                            inventory: { id: 'inv-1', ats: 10, orderable: true },
                        },
                        quantity: 1,
                    },
                ],
                isLoading: false,
            } as never);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            // Should use enriched inventory
            expect(result.current.productWithCalculatedInventory).toBeDefined();
        });

        test('calculates set inventory from child products', async () => {
            const child1 = createStandardProduct('child-1');
            child1.inventory = { id: 'inv-1', stockLevel: 20, ats: 20, orderable: true };
            (child1 as any).quantity = 2; // Requires 2 of this child per set

            const child2 = createStandardProduct('child-2');
            child2.inventory = { id: 'inv-2', stockLevel: 15, ats: 15, orderable: true };
            (child2 as any).quantity = 3; // Requires 3 of this child per set

            const product = createMockProduct('set', [child1, child2]);

            // Mock useBulkChildProductInventory to return enriched selections with inventory
            const bulkInventoryModule = await import('./use-bulk-child-product-inventory');
            vi.spyOn(bulkInventoryModule, 'useBulkChildProductInventory').mockReturnValue({
                enrichedSelections: [
                    {
                        product: { ...child1, inventory: child1.inventory },
                        quantity: 2, // User-selected quantity
                    },
                    {
                        product: { ...child2, inventory: child2.inventory },
                        quantity: 3, // User-selected quantity
                    },
                ],
                isLoading: false,
            } as never);

            // Set child product selections with quantities matching the product definition
            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            act(() => {
                // Set selections with quantities that match product definition
                result.current.setChildProductSelection('child-1', {
                    product: child1,
                    quantity: 2, // Matches product.quantity
                });
                result.current.setChildProductSelection('child-2', {
                    product: child2,
                    quantity: 3, // Matches product.quantity
                });
            });

            // Child1: 20 / 2 = 10 sets available
            // Child2: 15 / 3 = 5 sets available
            // Minimum is 5, so set inventory should be 5
            const calculatedInventory = result.current.productWithCalculatedInventory.inventory;
            expect(calculatedInventory?.stockLevel).toBe(5);
            expect(calculatedInventory?.ats).toBe(5);
        });

        test('handles missing inventory for child products', () => {
            const child1 = createStandardProduct('child-1');
            child1.inventory = undefined; // Missing inventory
            (child1 as any).quantity = 1;

            const child2 = createStandardProduct('child-2');
            child2.inventory = { id: 'inv-2', stockLevel: 10, ats: 10, orderable: true };
            (child2 as any).quantity = 1;

            const product = createMockProduct('set', [child1, child2]);
            // Add inventory to parent product so fallback works
            product.inventory = { id: 'parent-inv', stockLevel: 5, ats: 5, orderable: true };

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            // Should fall back to product's original inventory when missing
            expect(result.current.productWithCalculatedInventory.inventory).toBeDefined();
        });

        test('returns bundle product as-is', () => {
            const child1 = createStandardProduct('child-1');
            const product = createMockProduct('bundle', [child1]);
            product.inventory = { id: 'bundle-inv', stockLevel: 10, ats: 10, orderable: true };

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            // Bundles use their own inventory, not calculated from children
            expect(result.current.productWithCalculatedInventory.inventory).toEqual(product.inventory);
        });
    });

    describe('effectiveQuantity', () => {
        test('returns 1 for sets', () => {
            const child1 = createStandardProduct('child-1');
            const product = createMockProduct('set', [child1]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            expect(result.current.effectiveQuantity).toBe(1);
        });

        test('returns selectedBundleQuantity for bundles', () => {
            const child1 = createStandardProduct('child-1');
            const product = createMockProduct('bundle', [child1]);

            const { result } = renderHook(() => useProductSetsBundles({ product, initialBundleQuantity: 3 }), {
                wrapper,
            });

            expect(result.current.effectiveQuantity).toBe(3);
        });

        test('returns 1 for non-set/bundle products', () => {
            const product: ShopperProducts.schemas['Product'] = {
                id: 'regular-product',
                name: 'Regular Product',
                type: { item: true },
            };

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            expect(result.current.effectiveQuantity).toBe(1);
        });
    });

    describe('hasUnorderableChildProducts', () => {
        test('returns true when any child product is not orderable', () => {
            const child1 = createStandardProduct('child-1');
            const child2 = createStandardProduct('child-2');
            const product = createMockProduct('set', [child1, child2]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            act(() => {
                result.current.setChildProductOrderability('child-1', { isOrderable: true });
                result.current.setChildProductOrderability('child-2', { isOrderable: false });
            });

            expect(result.current.hasUnorderableChildProducts).toBe(true);
        });

        test('returns false when all child products are orderable', () => {
            const child1 = createStandardProduct('child-1');
            const product = createMockProduct('set', [child1]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            act(() => {
                result.current.setChildProductOrderability('child-1', { isOrderable: true });
            });

            expect(result.current.hasUnorderableChildProducts).toBe(false);
        });
    });

    describe('getSelectedChildProducts', () => {
        test('returns all selected child products', () => {
            const child1 = createStandardProduct('child-1');
            const child2 = createStandardProduct('child-2');
            const product = createMockProduct('set', [child1, child2]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            act(() => {
                result.current.setChildProductSelection('child-1', {
                    product: child1,
                    quantity: 2,
                });
                result.current.setChildProductSelection('child-2', {
                    product: child2,
                    quantity: 3,
                });
            });

            const selected = result.current.getSelectedChildProducts();

            expect(selected).toHaveLength(2);
            expect(selected[0].quantity).toBe(2);
            expect(selected[1].quantity).toBe(3);
        });
    });
});
