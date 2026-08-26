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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { useBulkChildProductInventory } from './use-bulk-child-product-inventory';
import type { ShopperProducts } from '@/scapi';
import type { ChildProductSelection } from '@/lib/product/inventory-utils';

// Mock useScapiFetcher directly
// Store fetcher properties separately and return new object each time so React detects changes
let mockFetcherData: any = undefined;
let mockFetcherState: 'idle' | 'loading' | 'submitting' = 'idle';
let mockFetcherSuccess: boolean = false;
let mockFetcherErrors: string[] | undefined = undefined;
let fetcherVersion = 0;
const mockLoad = vi.fn(() => Promise.resolve());
const mockSubmit = vi.fn();

// Helper to update fetcher - increments version to force new object reference
// For getProducts, data should be { data: Product[], limit?, total? }
const updateFetcher = (
    data: any,
    state: 'idle' | 'loading' | 'submitting' = 'idle',
    success: boolean = true,
    errors?: string[]
) => {
    mockFetcherData = data;
    mockFetcherState = state;
    mockFetcherSuccess = success;
    mockFetcherErrors = errors;
    fetcherVersion++; // Increment to ensure new object reference
};

const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => mockLogger),
}));

vi.mock('@/hooks/use-scapi-fetcher', () => ({
    useScapiFetcher: vi.fn(() => {
        // Return a new object each time with current properties
        // This matches the ScapiFetcher interface with data, success, errors getters
        return {
            get data() {
                return mockFetcherData;
            },
            get state() {
                return mockFetcherState;
            },
            get success() {
                return mockFetcherSuccess;
            },
            get errors() {
                return mockFetcherErrors;
            },
            load: mockLoad,
            submit: mockSubmit,
            _version: fetcherVersion, // Internal property to ensure unique reference
        };
    }),
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

describe('useBulkChildProductInventory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetcherData = undefined;
        mockFetcherState = 'idle';
        mockFetcherSuccess = false;
        mockFetcherErrors = undefined;
        fetcherVersion = 0;
        mockLoad.mockReturnValue(Promise.resolve());
    });

    // Helper to simulate successful API response
    // For getProducts, the data structure is { data: Product[], limit?, total? }
    // This function updates the fetcher state and triggers re-renders so React can detect changes
    const simulateSuccessfulFetch = async (
        products: ShopperProducts.schemas['Product'][],
        rerender?: (props?: any) => void,
        currentProps?: any
    ): Promise<void> => {
        // First set loading state to ensure state transition is detected by useScapiFetcherEffect
        // useScapiFetcherEffect tracks previousStateRef, so we need a state change
        act(() => {
            updateFetcher(undefined, 'loading', false);
            // Trigger re-render if rerender function is provided
            if (rerender) {
                if (currentProps) {
                    rerender(currentProps);
                } else {
                    rerender();
                }
            }
        });

        // Wait for React to process the state change
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        // Then set success state with data
        // getProducts returns { data: Product[], limit?, total? }
        // useScapiFetcherEffect triggers onSuccess when state changes to 'idle' with success=true
        act(() => {
            updateFetcher({ data: products }, 'idle', true);
            // Trigger re-render if rerender function is provided
            if (rerender) {
                if (currentProps) {
                    rerender(currentProps);
                } else {
                    rerender();
                }
            }
        });

        // Wait for effects to run and onSuccess to be called
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
    };

    afterEach(() => {
        vi.clearAllMocks();
    });

    const createMockProduct = (
        id: string,
        options?: {
            inventory?: ShopperProducts.schemas['Inventory'];
            inventories?: ShopperProducts.schemas['Inventory'][];
            variants?: ShopperProducts.schemas['Variant'][];
            master?: { masterId: string };
        }
    ): ShopperProducts.schemas['Product'] => ({
        id,
        name: `Product ${id}`,
        type: { item: true },
        inventory: options?.inventory,
        inventories: options?.inventories,
        variants: options?.variants,
        master: options?.master,
    });

    const createMockVariant = (productId: string): ShopperProducts.schemas['Variant'] => ({
        productId,
        orderable: true,
    });

    const createChildSelection = (
        product: ShopperProducts.schemas['Product'],
        options?: {
            variant?: ShopperProducts.schemas['Variant'];
            quantity?: number;
        }
    ): ChildProductSelection => ({
        product,
        variant: options?.variant,
        quantity: options?.quantity ?? 1,
    });

    describe('Basic functionality', () => {
        it('should return original selections when no product IDs are provided', () => {
            const { result } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            expect(result.current.enrichedSelections).toEqual([]);
            expect(result.current.isLoading).toBe(false);
        });

        it('should not call fetcher.load when childSelections is empty', () => {
            renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            expect(mockLoad).not.toHaveBeenCalled();
        });

        it('should extract product IDs from child selections', async () => {
            const product1 = createMockProduct('product-1');
            const product2 = createMockProduct('product-2');
            const selections = [createChildSelection(product1), createChildSelection(product2)];

            renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: selections,
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Wait for effect to run
            await waitFor(() => {
                expect(mockLoad).toHaveBeenCalled();
            });
        });

        it('should prefer variant ID over product ID when variant is selected', async () => {
            const product = createMockProduct('product-1');
            const variant = createMockVariant('variant-1');
            const selection = createChildSelection(product, { variant });

            renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            await waitFor(() => {
                expect(mockLoad).toHaveBeenCalled();
            });
        });

        it('should return loading state when fetcher is loading', () => {
            updateFetcher(undefined, 'loading', false);

            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const { result } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            expect(result.current.isLoading).toBe(true);
        });

        it('should return loading state when fetcher is submitting', () => {
            updateFetcher(undefined, 'submitting', false);

            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const { result } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            expect(result.current.isLoading).toBe(true);
        });

        it('should return original selections when fetcher data is not available', () => {
            updateFetcher(undefined, 'idle', false);

            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const { result } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            expect(result.current.enrichedSelections).toEqual([selection]);
        });
    });

    describe('Enrichment logic', () => {
        it('should enrich product with inventory data from API response', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const enrichedProduct = createMockProduct('product-1', {
                inventory: {
                    id: 'inventory-1',
                    ats: 10,
                    orderable: true,
                },
            });

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Initially, no data, so no enrichment
            expect(result.current.enrichedSelections[0].product.inventory).toBeUndefined();

            // Simulate successful API response
            // getProducts returns { data: Product[], limit?, total? }
            await simulateSuccessfulFetch([enrichedProduct], rerender);

            // Wait for enrichment to complete (useScapiFetcherEffect onSuccess)
            await waitFor(
                () => {
                    expect(result.current.enrichedSelections[0].product.inventory).toEqual({
                        id: 'inventory-1',
                        ats: 10,
                        orderable: true,
                    });
                },
                { timeout: 3000 }
            );
        });

        it('should enrich product with variants array from API response', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const enrichedVariants = [createMockVariant('variant-1'), createMockVariant('variant-2')];

            const enrichedProduct = createMockProduct('product-1', {
                variants: enrichedVariants,
            });

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Simulate successful API response
            await simulateSuccessfulFetch([enrichedProduct], rerender);

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.variants).toEqual(enrichedVariants);
            });
        });

        it('should match product by direct variant ID', async () => {
            const product = createMockProduct('product-1');
            const variant = createMockVariant('variant-1');
            const selection = createChildSelection(product, { variant });

            const enrichedProduct = createMockProduct('variant-1', {
                inventory: { id: 'inventory-1', ats: 5, orderable: true },
            });

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Simulate successful API response
            await simulateSuccessfulFetch([enrichedProduct], rerender);

            await waitFor(() => {
                // The hook enriches the product with inventory data but keeps the original product ID
                // The variant is matched and inventory is enriched, but product.id remains 'product-1'
                expect(result.current.enrichedSelections[0].product.id).toBe('product-1');
                expect(result.current.enrichedSelections[0].product.inventory).toEqual({
                    id: 'inventory-1',
                    ats: 5,
                    orderable: true,
                });
            });
        });

        it('should match product by product ID', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const enrichedProduct = createMockProduct('product-1', {
                inventory: { id: 'inventory-1', ats: 8, orderable: true },
            });

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Simulate successful API response
            await simulateSuccessfulFetch([enrichedProduct], rerender);

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.inventory).toEqual({
                    id: 'inventory-1',
                    ats: 8,
                    orderable: true,
                });
            });
        });

        it('should match product by master ID when variant has master relationship', async () => {
            const product = createMockProduct('product-1');
            const variant = createMockVariant('variant-1');
            const selection = createChildSelection(product, { variant });

            const enrichedProduct = createMockProduct('variant-1', {
                master: { masterId: 'product-1' },
                inventory: { id: 'inventory-1', ats: 12, orderable: true },
            });

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Simulate successful API response
            await simulateSuccessfulFetch([enrichedProduct], rerender);

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.inventory).toEqual({
                    id: 'inventory-1',
                    ats: 12,
                    orderable: true,
                });
            });
        });

        it('should return original selection when no matching product is found', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const enrichedProduct = createMockProduct('product-2', {
                inventory: { id: 'inventory-1', ats: 5, orderable: true },
            });

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Simulate successful API response with non-matching product
            await simulateSuccessfulFetch([enrichedProduct], rerender, { selections: [selection] });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0]).toEqual(selection);
            });
        });

        it('should preserve original inventory when fetched product has no inventory', async () => {
            const originalInventory = { id: 'inventory-1', ats: 3, orderable: true };
            const product = createMockProduct('product-1', {
                inventory: originalInventory,
            });
            const selection = createChildSelection(product);

            const enrichedProduct = createMockProduct('product-1', {
                inventory: undefined,
            });

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Simulate successful API response with product that has no inventory
            await simulateSuccessfulFetch([enrichedProduct], rerender, { selections: [selection] });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.inventory).toEqual(originalInventory);
            });
        });

        it('should handle multiple child selections', async () => {
            const product1 = createMockProduct('product-1');
            const product2 = createMockProduct('product-2');
            const selections = [createChildSelection(product1), createChildSelection(product2)];

            const enrichedProduct1 = createMockProduct('product-1', {
                inventory: { id: 'inventory-1', ats: 10, orderable: true },
            });
            const enrichedProduct2 = createMockProduct('product-2', {
                inventory: { id: 'inventory-1', ats: 20, orderable: true },
            });

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: selections,
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Simulate successful API response
            await simulateSuccessfulFetch([enrichedProduct1, enrichedProduct2], rerender, { selections });

            await waitFor(() => {
                expect(result.current.enrichedSelections).toHaveLength(2);
                expect(result.current.enrichedSelections[0].product.inventory?.ats).toBe(10);
                expect(result.current.enrichedSelections[1].product.inventory?.ats).toBe(20);
            });
        });
    });

    describe('Quantity and variant merging', () => {
        it('should preserve current quantity from childSelections', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product, { quantity: 3 });

            const enrichedProduct = createMockProduct('product-1', {
                inventory: { id: 'inventory-1', ats: 10, orderable: true },
            });

            const { result, rerender } = renderHook(
                ({ selections }) =>
                    useBulkChildProductInventory({
                        childSelections: selections,
                        inventoryId: undefined,
                    }),
                {
                    wrapper,
                    initialProps: { selections: [selection] },
                }
            );

            // Simulate successful API response
            await simulateSuccessfulFetch([enrichedProduct], rerender, { selections: [selection] });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].quantity).toBe(3);
            });

            // Update quantity
            const updatedSelection = createChildSelection(product, { quantity: 5 });
            rerender({ selections: [updatedSelection] });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].quantity).toBe(5);
            });
        });

        it('should preserve current variant from childSelections', async () => {
            const product = createMockProduct('product-1');
            const variant1 = createMockVariant('variant-1');
            const selection = createChildSelection(product, { variant: variant1 });

            const enrichedProduct = createMockProduct('product-1', {
                inventory: { id: 'inventory-1', ats: 10, orderable: true },
            });

            const { result, rerender } = renderHook(
                ({ selections }) =>
                    useBulkChildProductInventory({
                        childSelections: selections,
                        inventoryId: undefined,
                    }),
                {
                    wrapper,
                    initialProps: { selections: [selection] },
                }
            );

            // Simulate successful API response
            await simulateSuccessfulFetch([enrichedProduct], rerender, { selections: [selection] });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].variant).toEqual(variant1);
            });

            // Update variant
            const variant2 = createMockVariant('variant-2');
            const updatedSelection = createChildSelection(product, { variant: variant2 });
            rerender({ selections: [updatedSelection] });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].variant).toEqual(variant2);
            });
        });

        it('should merge enriched inventory with current quantity and variant', async () => {
            const product = createMockProduct('product-1');
            const variant = createMockVariant('variant-1');
            const selection = createChildSelection(product, { variant, quantity: 2 });

            const enrichedProduct = createMockProduct('product-1', {
                inventory: { id: 'inventory-1', ats: 15, orderable: true },
                inventories: [
                    {
                        id: 'store-1',
                        stockLevel: 20,
                        orderable: true,
                    },
                ],
            });

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Simulate successful API response
            await simulateSuccessfulFetch([enrichedProduct], rerender);

            await waitFor(() => {
                const enriched = result.current.enrichedSelections[0];
                expect(enriched.product.inventory?.ats).toBe(15);
                expect(enriched.quantity).toBe(2);
                expect(enriched.variant).toEqual(variant);
            });
        });
    });

    describe('Infinite loop prevention', () => {
        it('should not re-enrich when productIds have not changed', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const enrichedProduct = createMockProduct('product-1', {
                inventory: { id: 'inventory-1', ats: 10, orderable: true },
            });

            const { result, rerender } = renderHook(
                ({ selections }) =>
                    useBulkChildProductInventory({
                        childSelections: selections,
                        inventoryId: undefined,
                    }),
                {
                    wrapper,
                    initialProps: { selections: [selection] },
                }
            );

            // Simulate successful API response
            await simulateSuccessfulFetch([enrichedProduct], rerender, { selections: [selection] });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.inventory?.ats).toBe(10);
            });

            const firstEnrichment = result.current.enrichedSelections[0];

            // Rerender with same product IDs but different quantity (should not re-enrich)
            const updatedSelection = createChildSelection(product, { quantity: 5 });
            rerender({ selections: [updatedSelection] });

            await waitFor(() => {
                // Should still have enriched inventory, but with updated quantity
                expect(result.current.enrichedSelections[0].product.inventory?.ats).toBe(10);
                expect(result.current.enrichedSelections[0].quantity).toBe(5);
            });

            // Verify the enrichment didn't change (same product.inventory reference)
            expect(result.current.enrichedSelections[0].product.inventory).toEqual(firstEnrichment.product.inventory);
        });

        it('should re-enrich when productIds change', async () => {
            const product1 = createMockProduct('product-1');
            const selection1 = createChildSelection(product1);

            const enrichedProduct1 = createMockProduct('product-1', {
                inventory: { id: 'inventory-1', ats: 10, orderable: true },
            });

            const { result, rerender } = renderHook(
                ({ selections }) =>
                    useBulkChildProductInventory({
                        childSelections: selections,
                        inventoryId: undefined,
                    }),
                {
                    wrapper,
                    initialProps: { selections: [selection1] },
                }
            );

            // Simulate successful API response for first product
            await simulateSuccessfulFetch([enrichedProduct1], rerender, { selections: [selection1] });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.inventory?.ats).toBe(10);
            });

            // Change to different product
            const product2 = createMockProduct('product-2');
            const selection2 = createChildSelection(product2);

            const enrichedProduct2 = createMockProduct('product-2', {
                inventory: { id: 'inventory-1', ats: 20, orderable: true },
            });

            // Simulate successful API response for second product
            await simulateSuccessfulFetch([enrichedProduct2], rerender, { selections: [selection2] });

            rerender({ selections: [selection2] });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.id).toBe('product-2');
                expect(result.current.enrichedSelections[0].product.inventory?.ats).toBe(20);
            });
        });

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        it('should re-enrich when the selected inventory changes', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);
            const storeAProduct = createMockProduct('product-1', {
                inventories: [{ id: 'store-a', stockLevel: 10, orderable: true }],
            });

            const { result, rerender } = renderHook(
                ({ selections, inventoryId }) =>
                    useBulkChildProductInventory({
                        childSelections: selections,
                        inventoryId,
                    }),
                {
                    wrapper,
                    initialProps: { selections: [selection], inventoryId: 'store-a' },
                }
            );

            await simulateSuccessfulFetch([storeAProduct], rerender, {
                selections: [selection],
                inventoryId: 'store-a',
            });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.inventories?.[0]?.stockLevel).toBe(10);
            });

            const storeBProduct = createMockProduct('product-1', {
                inventories: [{ id: 'store-b', stockLevel: 20, orderable: true }],
            });
            rerender({ selections: [selection], inventoryId: 'store-b' });
            await simulateSuccessfulFetch([storeBProduct], rerender, {
                selections: [selection],
                inventoryId: 'store-b',
            });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.inventories?.[0]?.id).toBe('store-b');
                expect(result.current.enrichedSelections[0].product.inventories?.[0]?.stockLevel).toBe(20);
            });
        });
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
    });

    describe('Edge cases', () => {
        it('should handle empty childSelections array', () => {
            const { result } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            expect(result.current.enrichedSelections).toEqual([]);
            expect(result.current.isLoading).toBe(false);
        });

        it('should handle childSelections with products that have no ID', () => {
            const product = createMockProduct('');
            const selection = createChildSelection(product);

            const { result } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            expect(result.current.enrichedSelections).toEqual([selection]);
            expect(mockLoad).not.toHaveBeenCalled();
        });

        it('should handle fetcher.data with empty data array', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Simulate successful API response with empty array
            await simulateSuccessfulFetch([], rerender);

            await waitFor(() => {
                expect(result.current.enrichedSelections[0]).toEqual(selection);
            });
        });

        it('should handle fetcher error response', () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Simulate error response
            act(() => {
                updateFetcher(undefined, 'idle', false, ['API Error']);
                rerender();
            });

            // Should return original selection on error
            expect(result.current.enrichedSelections).toEqual([selection]);
        });

        it('should handle partial matches in multiple selections', async () => {
            const product1 = createMockProduct('product-1');
            const product2 = createMockProduct('product-2');
            const product3 = createMockProduct('product-3');
            const selections = [
                createChildSelection(product1),
                createChildSelection(product2),
                createChildSelection(product3),
            ];

            // Only product1 and product3 are in the response
            const enrichedProduct1 = createMockProduct('product-1', {
                inventory: { id: 'inventory-1', ats: 10, orderable: true },
            });
            const enrichedProduct3 = createMockProduct('product-3', {
                inventory: { id: 'inventory-1', ats: 30, orderable: true },
            });

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: selections,
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Simulate successful API response with partial matches
            await simulateSuccessfulFetch([enrichedProduct1, enrichedProduct3], rerender);

            await waitFor(() => {
                expect(result.current.enrichedSelections).toHaveLength(3);
                expect(result.current.enrichedSelections[0].product.inventory?.ats).toBe(10);
                expect(result.current.enrichedSelections[1]).toEqual(selections[1]); // product2 unchanged
                expect(result.current.enrichedSelections[2].product.inventory?.ats).toBe(30);
            });
        });

        it('should return early when fetchedProducts is null', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Simulate fetch with null data
            act(() => {
                updateFetcher(null, 'idle', true);
                rerender();
            });

            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            // Should return original selection when fetchedProducts is null
            expect(result.current.enrichedSelections[0]).toEqual(selection);
        });

        it('should return early when productIds is undefined', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Simulate fetch with empty productIds (should not happen, but test the guard)
            // This tests the early return when productIds is falsy
            act(() => {
                updateFetcher({ data: [] }, 'idle', true);
                rerender();
            });

            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            // Should handle gracefully
            expect(result.current.enrichedSelections).toBeDefined();
        });

        it('should skip enrichment when already enriched with same productIds and inventoryId', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const enrichedProduct = createMockProduct('product-1', {
                inventory: { id: 'inventory-1', ats: 10, orderable: true },
            });

            const { result, rerender } = renderHook(
                ({ selections, inventoryId }) =>
                    useBulkChildProductInventory({
                        childSelections: selections,
                        inventoryId,
                    }),
                {
                    wrapper,
                    initialProps: { selections: [selection], inventoryId: undefined },
                }
            );

            // First enrichment
            await simulateSuccessfulFetch([enrichedProduct], rerender, {
                selections: [selection],
                inventoryId: undefined,
            });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.inventory?.ats).toBe(10);
            });

            const firstEnrichment = result.current.enrichedSelections[0];

            // Trigger another fetch with same productIds and inventoryId
            act(() => {
                updateFetcher({ data: [enrichedProduct] }, 'loading', false);
                rerender({ selections: [selection], inventoryId: undefined });
            });

            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            act(() => {
                updateFetcher({ data: [enrichedProduct] }, 'idle', true);
                rerender({ selections: [selection], inventoryId: undefined });
            });

            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            // Should still have the same enrichment (not re-enriched)
            expect(result.current.enrichedSelections[0].product.inventory).toEqual(firstEnrichment.product.inventory);
        });

        it('should handle errors in onError callback', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // First trigger a load to set up the fetcher
            await waitFor(() => {
                expect(mockLoad).toHaveBeenCalled();
            });

            // Simulate error response - need to trigger useScapiFetcherEffect onError
            // This requires going through loading state first, then to idle with errors
            act(() => {
                updateFetcher(undefined, 'loading', false);
                rerender();
            });

            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 20));
            });

            // Then set error state (idle with success=false and errors)
            // useScapiFetcherEffect triggers onError when state changes to idle with errors
            act(() => {
                updateFetcher(undefined, 'idle', false, ['API Error', 'Network Error']);
                rerender();
            });

            // Wait for useScapiFetcherEffect to process the state change
            await waitFor(
                () => {
                    expect(mockLogger.warn).toHaveBeenCalled();
                },
                { timeout: 1000 }
            );

            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to fetch bulk child product inventory', {
                errors: expect.stringContaining('API Error'),
            });

            // Should return original selection on error
            expect(result.current.enrichedSelections).toEqual([selection]);
        });

        it('should handle empty errors array in onError callback', async () => {
            mockLogger.warn.mockClear();
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: undefined,
                    }),
                { wrapper }
            );

            // Simulate error response with empty errors array
            act(() => {
                updateFetcher(undefined, 'idle', false, []);
                rerender();
            });

            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            // Should not log when errors array is empty
            expect(mockLogger.warn).not.toHaveBeenCalled();

            // Should return original selection
            expect(result.current.enrichedSelections).toEqual([selection]);
        });
    });
});
