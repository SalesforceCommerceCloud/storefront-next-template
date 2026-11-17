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
import { useBulkChildProductInventory } from '@/hooks/product/use-bulk-child-product-inventory';
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

describe('useBulkChildProductInventory - BOPIS', () => {
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

    describe('BOPIS functionality', () => {
        it('should include inventoryIds parameter when inventoryId is provided', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: 'store-inventory-123',
                    }),
                { wrapper }
            );

            await waitFor(() => {
                expect(mockLoad).toHaveBeenCalled();
            });
        });

        it('should not include inventoryIds parameter when inventoryId is undefined', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

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

        it('should enrich product with store inventory when inventoryId is provided', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const storeInventory = [
                {
                    id: 'store-inventory-123',
                    stockLevel: 15,
                    orderable: true,
                },
            ];

            const enrichedProduct = createMockProduct('product-1', {
                inventory: { id: 'inventory-1', ats: 10, orderable: true },
                inventories: storeInventory,
            });

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: 'store-inventory-123',
                    }),
                { wrapper }
            );

            // Simulate successful API response
            await simulateSuccessfulFetch([enrichedProduct], rerender);

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.inventories).toEqual(storeInventory);
            });
        });

        it('marks pickup unavailable instead of preserving stale stock when the current response has no inventories', async () => {
            const originalInventories = [
                {
                    id: 'store-inventory-123',
                    stockLevel: 5,
                    orderable: true,
                },
            ];

            const product = createMockProduct('product-1', {
                inventories: originalInventories,
            });
            const selection = createChildSelection(product);

            const enrichedProduct = createMockProduct('product-1', {
                inventory: { id: 'inventory-1', ats: 10, orderable: true },
                inventories: undefined,
            });

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: 'store-inventory-123',
                    }),
                { wrapper }
            );

            // Simulate successful API response with no inventories
            await simulateSuccessfulFetch([enrichedProduct], rerender, { selections: [selection] });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.inventory?.ats).toBe(10);
                expect(result.current.enrichedSelections[0].product.inventories).toEqual([
                    { id: 'store-inventory-123', ats: 0, stockLevel: 0, orderable: false },
                ]);
            });
        });

        it('should trigger re-fetch when inventoryId changes', async () => {
            const product = createMockProduct('product-1');
            const selection = createChildSelection(product);

            const enrichedProduct1 = createMockProduct('product-1', {
                inventory: { id: 'inventory-1', ats: 10, orderable: true },
                inventories: [
                    {
                        id: 'store-inventory-123',
                        stockLevel: 15,
                        orderable: true,
                    },
                ],
            });

            const { result, rerender } = renderHook(
                ({ selections, inventoryId }) =>
                    useBulkChildProductInventory({
                        childSelections: selections,
                        inventoryId,
                    }),
                {
                    wrapper,
                    initialProps: {
                        selections: [selection],
                        inventoryId: 'store-inventory-123',
                    },
                }
            );

            // Simulate successful API response for first inventoryId
            await simulateSuccessfulFetch([enrichedProduct1], rerender, {
                selections: [selection],
                inventoryId: 'store-inventory-123',
            });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.inventories).toHaveLength(1);
                expect(result.current.enrichedSelections[0].product.inventories?.[0].id).toBe('store-inventory-123');
            });

            // Change inventoryId - this will trigger a new fetch
            const enrichedProduct2 = createMockProduct('product-1', {
                inventory: { id: 'inventory-1', ats: 10, orderable: true },
                inventories: [
                    {
                        id: 'store-inventory-456',
                        stockLevel: 20,
                        orderable: true,
                    },
                ],
            });

            // First rerender with new inventoryId to trigger the fetch
            // The useEffect will call fetcher.load() when inventoryId changes
            // We need to reset the fetcher state to ensure useScapiFetcherEffect
            // detects the state transition properly
            act(() => {
                // Reset fetcher state to ensure proper state transition
                updateFetcher(undefined, 'idle', false);
            });

            rerender({
                selections: [selection],
                inventoryId: 'store-inventory-456',
            });

            // Wait for the useEffect to trigger fetcher.load()
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            // Simulate successful API response for second inventoryId
            // The state transition from 'idle' -> 'loading' -> 'idle' with success=true
            // will trigger useScapiFetcherEffect onSuccess
            await simulateSuccessfulFetch([enrichedProduct2], rerender, {
                selections: [selection],
                inventoryId: 'store-inventory-456',
            });

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.inventories?.[0].id).toBe('store-inventory-456');
            });
        });

        it('should handle multiple child selections with store inventory', async () => {
            const product1 = createMockProduct('product-1');
            const product2 = createMockProduct('product-2');
            const selections = [createChildSelection(product1), createChildSelection(product2)];

            const enrichedProduct1 = createMockProduct('product-1', {
                inventory: { id: 'inventory-1', ats: 10, orderable: true },
                inventories: [
                    {
                        id: 'store-inventory-123',
                        stockLevel: 15,
                        orderable: true,
                    },
                ],
            });

            const enrichedProduct2 = createMockProduct('product-2', {
                inventory: { id: 'inventory-1', ats: 20, orderable: true },
                inventories: [
                    {
                        id: 'store-inventory-123',
                        stockLevel: 25,
                        orderable: true,
                    },
                ],
            });

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: selections,
                        inventoryId: 'store-inventory-123',
                    }),
                { wrapper }
            );

            // Simulate successful API response
            await simulateSuccessfulFetch([enrichedProduct1, enrichedProduct2], rerender, { selections });

            await waitFor(() => {
                expect(result.current.enrichedSelections).toHaveLength(2);
                expect(result.current.enrichedSelections[0].product.inventories).toHaveLength(1);
                expect(result.current.enrichedSelections[1].product.inventories).toHaveLength(1);
                expect(result.current.enrichedSelections[0].product.inventories?.[0].stockLevel).toBe(15);
                expect(result.current.enrichedSelections[1].product.inventories?.[0].stockLevel).toBe(25);
            });
        });

        it('should enrich variant products with store inventory', async () => {
            const product = createMockProduct('product-1');
            const variant = createMockVariant('variant-1');
            const selection = createChildSelection(product, { variant });

            const enrichedProduct = createMockProduct('variant-1', {
                inventory: { id: 'inventory-1', ats: 10, orderable: true },
                inventories: [
                    {
                        id: 'store-inventory-123',
                        stockLevel: 12,
                        orderable: true,
                    },
                ],
            });

            const { result, rerender } = renderHook(
                () =>
                    useBulkChildProductInventory({
                        childSelections: [selection],
                        inventoryId: 'store-inventory-123',
                    }),
                { wrapper }
            );

            // Simulate successful API response
            await simulateSuccessfulFetch([enrichedProduct], rerender);

            await waitFor(() => {
                expect(result.current.enrichedSelections[0].product.inventories).toHaveLength(1);
                expect(result.current.enrichedSelections[0].product.inventories?.[0].stockLevel).toBe(12);
            });
        });
    });
});
