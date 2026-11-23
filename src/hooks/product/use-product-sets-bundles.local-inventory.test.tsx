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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ShopperProducts } from '@/scapi';
import { useProductSetsBundles } from './use-product-sets-bundles';

vi.mock('./use-bulk-child-product-inventory', () => ({
    useBulkChildProductInventory: () => ({ enrichedSelections: [], isLoading: false }),
}));

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('selected-list product-set quantities', () => {
    it.each([
        [0.25, 0.25, 0.25, 1],
        [3.3, 3.3, 1.1, 3],
        [0.25, 0.2, 0.25, 0],
        [0, 0, 0.25, 0],
        [0.25, 0.25, 0, 0],
    ])('normalizes stock %s and ATS %s for child quantity %s', (stockLevel, ats, quantity, availableSets) => {
        const inventory = { id: 'preparing-list', stockLevel, ats, orderable: true };
        const child = { id: 'milk', type: { item: true }, inventory, inventories: [inventory] };
        const product: ShopperProducts.schemas['Product'] = {
            id: 'set',
            type: { set: true },
            c_localInventoryId: inventory.id,
            inventory,
            inventories: [inventory],
            setProducts: [child],
        };
        const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });
        act(() => result.current.setChildProductSelection(child.id, { product: child, quantity }));
        expect(result.current.productWithCalculatedInventory.inventory).toMatchObject({
            stockLevel: availableSets,
            ats: availableSets,
        });
        expect(result.current.productWithCalculatedInventory.inventories).toEqual([
            expect.objectContaining({ id: inventory.id, stockLevel: availableSets, ats: availableSets }),
        ]);
        expect(result.current.isCompletelyOutOfStock).toBe(availableSets === 0);
    });

    it('keeps a missing child record unavailable despite positive parent and site stock', () => {
        const inventory = { id: 'preparing-list', stockLevel: 20, ats: 20, orderable: true };
        const child = { id: 'milk', type: { item: true }, inventory: { ...inventory, id: 'site' }, inventories: [] };
        const product: ShopperProducts.schemas['Product'] = {
            id: 'set',
            type: { set: true },
            c_localInventoryId: inventory.id,
            inventory,
            inventories: [inventory],
            setProducts: [child],
        };
        const { result } = renderHook(() => useProductSetsBundles({ product }), { wrapper });
        expect(result.current.productWithCalculatedInventory.inventories).toEqual([]);
        expect(result.current.isCompletelyOutOfStock).toBe(true);
    });
});
