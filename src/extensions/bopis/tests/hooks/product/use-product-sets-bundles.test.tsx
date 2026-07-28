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

import { renderHook } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { useProductSetsBundles } from '@/hooks/product/use-product-sets-bundles';
import type { ShopperProducts } from '@/scapi';

// Mock useFetcher function
const mockUseFetcher = vi.fn(() => ({
    data: null,
    state: 'idle',
    submit: vi.fn(),
    load: vi.fn(),
}));

// Mock useBulkChildProductInventory
vi.mock('@/hooks/product/use-bulk-child-product-inventory', () => ({
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

describe('useProductSetsBundles - BOPIS', () => {
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

    describe('bundleStockLevel and bundleOutOfStock', () => {
        test('returns undefined for sets', () => {
            const child1 = createStandardProduct('child-1');
            const product = createMockProduct('set', [child1]);

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            expect(result.current.bundleStockLevel).toBeUndefined();
            expect(result.current.bundleOutOfStock).toBeUndefined();
        });

        test('returns bundle stock level from site inventory', () => {
            const child1 = createStandardProduct('child-1');
            const product = createMockProduct('bundle', [child1]);
            product.inventory = { id: 'bundle-inv', stockLevel: 15, ats: 15, orderable: true };

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            expect(result.current.bundleStockLevel).toBe(15);
            expect(result.current.bundleOutOfStock).toBe(false);
        });

        test('returns bundle stock level from store inventory when pickup selected', async () => {
            const child1 = createStandardProduct('child-1');
            const product = createMockProduct('bundle', [child1]);
            product.inventory = { id: 'bundle-inv', stockLevel: 10, ats: 10, orderable: true };
            product.inventories = [{ id: 'store-1', stockLevel: 5, orderable: true }];

            // Mock usePickup context to return pickup selected
            const pickupModule = await import('@/extensions/bopis/context/pickup-context');
            vi.spyOn(pickupModule, 'usePickup').mockReturnValue({
                pickupBasketItems: new Set(['parent-product-123']),
            } as never);

            const { result } = renderHook(
                () =>
                    useProductSetsBundles({
                        product,
                        selectedStoreInventoryId: 'store-1',
                    }),
                { wrapper }
            );

            // Should use store inventory when pickup is selected
            expect(result.current.bundleStockLevel).toBe(5);
        });

        test('returns true when bundle is completely out of stock', () => {
            const child1 = createStandardProduct('child-1');
            const product = createMockProduct('bundle', [child1]);
            product.inventory = { id: 'bundle-inv', stockLevel: 0, ats: 0, orderable: false };

            const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });

            expect(result.current.bundleOutOfStock).toBe(true);
        });
    });

    describe('isCompletelyOutOfStock', () => {
        test('returns true when both site and store are out of stock', async () => {
            const child1 = createStandardProduct('child-1');
            const product = createMockProduct('set', [child1]);
            product.inventory = { id: 'inv-1', stockLevel: 0, ats: 0, orderable: false };
            product.inventories = [{ id: 'store-1', stockLevel: 0, orderable: false }];

            // Mock inventory utils to return out of stock
            const inventoryUtilsModule = await import('@/lib/product/inventory-utils');
            vi.spyOn(inventoryUtilsModule, 'isStoreOutOfStock').mockReturnValue(true);
            vi.spyOn(inventoryUtilsModule, 'isSiteOutOfStock').mockReturnValue(true);

            const { result } = renderHook(
                () =>
                    useProductSetsBundles({
                        product,
                        selectedStoreInventoryId: 'store-1',
                    }),
                { wrapper }
            );

            expect(result.current.isCompletelyOutOfStock).toBe(true);
        });
    });
});
