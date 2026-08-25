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
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FulfillmentOptionContributor } from '@/components/fulfillment/types';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { useBopisFulfillmentOption } from './pickup-option-contributor';

const { pickupContext, storeLocatorState } = vi.hoisted(() => ({
    pickupContext: {
        current: {
            addItem: vi.fn(),
            removeItem: vi.fn(),
            pickupBasketItems: new Map(),
            pickupStores: new Map(),
            clearItems: vi.fn(),
        },
    },
    storeLocatorState: {
        isOpen: false,
        open: vi.fn(),
        selectedStoreInfo: null,
    },
}));

vi.mock('@/extensions/bopis/context/pickup-context', () => ({
    usePickup: () => pickupContext.current,
}));

vi.mock('@/extensions/store-locator/providers/store-locator', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/extensions/store-locator/providers/store-locator')>();
    return {
        ...actual,
        useStoreLocator: (selector: (state: typeof storeLocatorState) => unknown) => selector(storeLocatorState),
    };
});

describe('useBopisFulfillmentOption', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        pickupContext.current = {
            addItem: vi.fn(),
            removeItem: vi.fn(),
            pickupBasketItems: new Map(),
            pickupStores: new Map(),
            clearItems: vi.fn(),
        };
        storeLocatorState.selectedStoreInfo = null as never;
    });

    it('returns Pickup with store selection metadata during render', () => {
        const { result } = renderHook(
            () =>
                useBopisFulfillmentOption({
                    product: { id: 'product-1' } as never,
                    quantity: 1,
                    basketPickupStore: { id: 'store-1', name: 'Downtown Store', inventoryId: 'inventory-1' },
                }),
            { wrapper: AllProvidersWrapper }
        );

        const pickup = result.current.contributor as FulfillmentOptionContributor;
        expect(pickup.option.id).toBe('pickup');
        expect(pickup.createSelection?.('pickup')).toEqual({
            optionId: 'pickup',
            metadata: { storeId: 'store-1', inventoryId: 'inventory-1' },
        });
        expect(pickup.option.description).toBe('Downtown Store');
    });

    it('returns Pickup as unavailable when the selected store is out of stock', () => {
        const { result } = renderHook(
            () =>
                useBopisFulfillmentOption({
                    product: {
                        id: 'product-1',
                        inventories: [{ id: 'inventory-1', stockLevel: 0, orderable: false }],
                    } as never,
                    quantity: 1,
                    basketPickupStore: { id: 'store-1', inventoryId: 'inventory-1' },
                }),
            { wrapper: AllProvidersWrapper }
        );

        expect(result.current.contributor).toMatchObject({
            option: { id: 'pickup', availability: { available: false } },
        });
    });

    it('opens Store Locator without selecting Pickup when no store is selected', () => {
        const { result } = renderHook(
            () => useBopisFulfillmentOption({ product: { id: 'product-1' } as never, quantity: 1 }),
            { wrapper: AllProvidersWrapper }
        );

        expect(result.current.contributor.onSelect?.()).toBe(false);
        expect(storeLocatorState.open).toHaveBeenCalledOnce();
    });

    it('synchronizes the template-owned selection directly to pickup context', () => {
        storeLocatorState.selectedStoreInfo = { id: 'store-1', inventoryId: 'inventory-1' } as never;
        const { result } = renderHook(
            () => useBopisFulfillmentOption({ product: { id: 'product-1' } as never, quantity: 1 }),
            { wrapper: AllProvidersWrapper }
        );

        act(() => result.current.synchronizeSelection('pickup'));
        expect(pickupContext.current.addItem).toHaveBeenCalledWith('product-1', 'inventory-1', 'store-1');

        act(() => result.current.synchronizeSelection('delivery'));
        expect(pickupContext.current.removeItem).toHaveBeenCalledWith('product-1');
    });

    it('clears pickup context for Delivery without a selected store', () => {
        const { result } = renderHook(
            () => useBopisFulfillmentOption({ product: { id: 'product-1' } as never, quantity: 1 }),
            { wrapper: AllProvidersWrapper }
        );

        act(() => result.current.synchronizeSelection('delivery'));

        expect(pickupContext.current.removeItem).toHaveBeenCalledWith('product-1');
    });

    it('does not add a pickup item when the selected store has no inventory ID', () => {
        storeLocatorState.selectedStoreInfo = { id: 'store-1' } as never;
        const { result } = renderHook(
            () => useBopisFulfillmentOption({ product: { id: 'product-1' } as never, quantity: 1 }),
            { wrapper: AllProvidersWrapper }
        );

        act(() => result.current.synchronizeSelection('pickup'));

        expect(pickupContext.current.addItem).not.toHaveBeenCalled();
    });

    it('does not mutate pickup state when the pickup context is unavailable', () => {
        pickupContext.current = null as never;
        const { result } = renderHook(
            () => useBopisFulfillmentOption({ product: { id: 'product-1' } as never, quantity: 1 }),
            { wrapper: AllProvidersWrapper }
        );

        expect(() => result.current.synchronizeSelection('pickup')).not.toThrow();
    });

    it('does not mutate pickup context for an item already in the basket', () => {
        const { result } = renderHook(
            () =>
                useBopisFulfillmentOption({
                    product: { id: 'product-1' } as never,
                    quantity: 1,
                    basketPickupStore: { id: 'store-1', inventoryId: 'inventory-1' },
                }),
            { wrapper: AllProvidersWrapper }
        );

        act(() => result.current.synchronizeSelection('pickup'));

        expect(pickupContext.current.addItem).not.toHaveBeenCalled();
        expect(pickupContext.current.removeItem).not.toHaveBeenCalled();
    });
});
