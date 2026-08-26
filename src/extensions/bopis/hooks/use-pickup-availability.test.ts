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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { masterProductWithInventories } from '@/components/__mocks__/master-product-with-inventories';
import { isStoreOutOfStock } from '@/lib/product/inventory-utils';
import { usePickupAvailability } from './use-pickup-availability';

vi.mock('@/lib/product/inventory-utils', async () => {
    const actual = await vi.importActual('@/lib/product/inventory-utils');
    return { ...actual, isStoreOutOfStock: vi.fn() };
});

const pickupStore = { id: 'store-1', inventoryId: 'inventory-1' };

describe('usePickupAvailability', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(isStoreOutOfStock).mockReturnValue(false);
    });

    it('checks selected-store inventory with the requested quantity', () => {
        renderHook(() => usePickupAvailability({ product: masterProductWithInventories, quantity: 2, pickupStore }));

        expect(isStoreOutOfStock).toHaveBeenCalledWith(masterProductWithInventories, 'inventory-1', 2);
    });

    it('treats a selected store without inventory metadata as unavailable', () => {
        const { result } = renderHook(() =>
            usePickupAvailability({
                product: masterProductWithInventories,
                quantity: 1,
                pickupStore: { id: 'store-1' },
            })
        );

        expect(result.current).toBe(true);
        expect(isStoreOutOfStock).not.toHaveBeenCalled();
    });

    it('does not flash unavailable while ordinary-product store inventory is loading', () => {
        const { result } = renderHook(() =>
            usePickupAvailability({
                product: { ...masterProductWithInventories, inventories: [] },
                quantity: 1,
                pickupStore,
            })
        );

        expect(result.current).toBe(false);
        expect(isStoreOutOfStock).not.toHaveBeenCalled();
    });

    it('uses calculated inventory for sets and bundles', () => {
        const { result } = renderHook(() =>
            usePickupAvailability({
                product: { ...masterProductWithInventories, type: { set: true }, inventories: [] },
                quantity: 1,
                pickupStore,
            })
        );

        expect(result.current).toBe(false);
        expect(isStoreOutOfStock).toHaveBeenCalled();
    });
});
