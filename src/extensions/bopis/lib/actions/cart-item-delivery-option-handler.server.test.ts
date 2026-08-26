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

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import { handleCartItemDeliveryOptionChange } from './cart-item-delivery-option-handler.server';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { createApiClients } from '@/lib/api-clients.server';
import { findOrCreateDeliveryShipment } from '@/lib/cart/shipments.server';
import {
    findOrCreatePickupShipment,
    PickupShipmentStoreConflictError,
} from '@/extensions/bopis/lib/api/shipment.server';
import { getStoreInventoryId } from '@/extensions/bopis/lib/api/stores.server';
import { expectStatus } from '@/lib/test-utils/expect-status';
import type { CartItemUpdateData } from '@/lib/cart/basket-schemas';

vi.mock('@/middlewares/basket.server');
vi.mock('@/lib/api-clients.server');
vi.mock('@/lib/cart/shipments.server');
vi.mock('@/extensions/bopis/lib/api/shipment.server');
vi.mock('@/extensions/bopis/lib/api/stores.server', () => ({
    getStoreInventoryId: vi.fn(() => Promise.resolve('inv-1')),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

describe('handleCartItemDeliveryOptionChange', () => {
    const basketWithDeliveryItem = {
        basketId: 'test-basket-123',
        productItems: [{ itemId: 'item-1', productId: 'p-1', quantity: 3 }],
    };
    const refetchedBasket = { basketId: 'test-basket-123', productItems: [] };

    const mockClients = {
        shopperProducts: {
            getProducts: vi.fn(),
        },
        shopperBasketsV2: {
            updateItemInBasket: vi.fn(),
            getBasket: vi.fn(),
        },
    };

    const context = {} as Readonly<RouterContextProvider>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getBasket).mockResolvedValue({ current: basketWithDeliveryItem, snapshot: null } as never);
        vi.mocked(updateBasketResource).mockImplementation(() => {});
        vi.mocked(createApiClients).mockReturnValue(mockClients as never);
        vi.mocked(findOrCreatePickupShipment).mockResolvedValue({ shipmentId: 'ship-pickup' } as never);
        vi.mocked(findOrCreateDeliveryShipment).mockResolvedValue({ shipmentId: 'ship-delivery' } as never);
        vi.mocked(getStoreInventoryId).mockResolvedValue('inv-1');
        mockClients.shopperBasketsV2.getBasket.mockResolvedValue({ data: refetchedBasket });
    });

    const run = (input: Partial<CartItemUpdateData>) =>
        handleCartItemDeliveryOptionChange(
            { itemId: 'item-1', productId: undefined, quantity: 3, ...input } as CartItemUpdateData,
            context
        );

    test('returns null when no delivery option is provided (falls back to the default handler)', async () => {
        const result = await run({ deliveryOption: undefined });

        expect(result).toBeNull();
        expect(mockClients.shopperProducts.getProducts).not.toHaveBeenCalled();
        expect(mockClients.shopperBasketsV2.updateItemInBasket).not.toHaveBeenCalled();
    });

    test('rejects an unknown cart item before it can create or retarget a shipment', async () => {
        const result = await run({
            itemId: 'missing-item',
            deliveryOption: 'pickup',
            storeId: 'store-9',
            inventoryId: 'inv-1',
        });

        if (!result) throw new Error('expected an invalid-item response, received null');
        expectStatus(result, 404);
        expect(result.data.error?.code).toBe('NOT_FOUND');
        expect(mockClients.shopperProducts.getProducts).not.toHaveBeenCalled();
        expect(mockClients.shopperBasketsV2.updateItemInBasket).not.toHaveBeenCalled();
        expect(findOrCreatePickupShipment).not.toHaveBeenCalled();
        expect(findOrCreateDeliveryShipment).not.toHaveBeenCalled();
    });

    test('rejects a pickup swap to a store that stocks fewer units than the line quantity', async () => {
        // The reachable repro: a 3-unit delivery line is switched to pickup at a store that stocks 2. The client
        // dropdown renders before a store is selected, so its store-stock guard is inert; the server must catch it.
        mockClients.shopperProducts.getProducts.mockResolvedValue({
            data: {
                data: [
                    {
                        id: 'p-1',
                        inventory: { ats: 50, orderable: true },
                        inventories: [{ id: 'inv-1', stockLevel: 2, orderable: true }],
                    },
                ],
            },
        });

        const result = await run({ deliveryOption: 'pickup', storeId: 'store-9', inventoryId: 'inv-1' });

        if (!result) throw new Error('expected a rejection response, received null');
        expectStatus(result, 422);
        expect(result?.data.success).toBe(false);
        expect(result?.data.error?.code).toBe('OUT_OF_STOCK');
        expect(mockClients.shopperProducts.getProducts).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({
                    query: expect.objectContaining({
                        ids: ['p-1'],
                        inventoryIds: ['inv-1'],
                        expand: ['availability'],
                    }),
                }),
            })
        );
        expect(mockClients.shopperBasketsV2.updateItemInBasket).not.toHaveBeenCalled();
        expect(findOrCreatePickupShipment).not.toHaveBeenCalled();
    });

    test('rejects a pickup swap without both store and inventory IDs', async () => {
        const result = await run({ deliveryOption: 'pickup', storeId: 'store-9' });

        if (!result) throw new Error('expected a required-field response, received null');
        expectStatus(result, 400);
        expect(result.data.error?.code).toBe('REQUIRED_FIELD');
        expect(mockClients.shopperProducts.getProducts).not.toHaveBeenCalled();
        expect(mockClients.shopperBasketsV2.updateItemInBasket).not.toHaveBeenCalled();
        expect(findOrCreatePickupShipment).not.toHaveBeenCalled();
    });

    test('rejects a pickup swap whose store and inventory IDs do not match', async () => {
        vi.mocked(getStoreInventoryId).mockResolvedValue('inv-other');

        const result = await run({ deliveryOption: 'pickup', storeId: 'store-9', inventoryId: 'inv-1' });

        if (!result) throw new Error('expected an invalid-input response, received null');
        expectStatus(result, 400);
        expect(result.data.error?.code).toBe('INVALID_INPUT');
        expect(mockClients.shopperProducts.getProducts).not.toHaveBeenCalled();
        expect(mockClients.shopperBasketsV2.updateItemInBasket).not.toHaveBeenCalled();
        expect(findOrCreatePickupShipment).not.toHaveBeenCalled();
    });

    test('allows a pickup swap within store stock even when site stock is exhausted', async () => {
        mockClients.shopperProducts.getProducts.mockResolvedValue({
            data: {
                data: [
                    {
                        id: 'p-1',
                        inventory: { ats: 0, orderable: false },
                        inventories: [{ id: 'inv-1', stockLevel: 10, orderable: true }],
                    },
                ],
            },
        });

        const result = await run({ deliveryOption: 'pickup', storeId: 'store-9', inventoryId: 'inv-1' });

        expect(result?.data.success).toBe(true);
        expect(mockClients.shopperBasketsV2.updateItemInBasket).toHaveBeenCalledTimes(1);
    });

    test('rejects a delivery swap when site stock is below the line quantity', async () => {
        mockClients.shopperProducts.getProducts.mockResolvedValue({
            data: { data: [{ id: 'p-1', inventory: { ats: 2, orderable: true } }] },
        });

        const result = await run({ deliveryOption: 'delivery' });

        if (!result) throw new Error('expected a rejection response, received null');
        expectStatus(result, 422);
        expect(result?.data.error?.code).toBe('OUT_OF_STOCK');
        expect(mockClients.shopperProducts.getProducts).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({ query: expect.objectContaining({ ids: ['p-1'] }) }),
            })
        );
        expect(mockClients.shopperBasketsV2.updateItemInBasket).not.toHaveBeenCalled();
        expect(findOrCreateDeliveryShipment).not.toHaveBeenCalled();
    });

    test('allows a delivery swap within site stock', async () => {
        mockClients.shopperProducts.getProducts.mockResolvedValue({
            data: { data: [{ id: 'p-1', inventory: { ats: 5, orderable: true } }] },
        });

        const result = await run({ deliveryOption: 'delivery' });

        expect(result?.data.success).toBe(true);
        expect(mockClients.shopperBasketsV2.updateItemInBasket).toHaveBeenCalledTimes(1);
    });

    test('resolves the product from the submitted productId when swapping a variant', async () => {
        mockClients.shopperProducts.getProducts.mockResolvedValue({
            data: { data: [{ id: 'p-2', inventory: { ats: 0, orderable: true } }] },
        });

        const result = await run({ deliveryOption: 'delivery', productId: 'p-2' });

        if (!result) throw new Error('expected a rejection response, received null');
        expectStatus(result, 422);
        expect(mockClients.shopperProducts.getProducts).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({ query: expect.objectContaining({ ids: ['p-2'] }) }),
            })
        );
        expect(mockClients.shopperBasketsV2.updateItemInBasket).not.toHaveBeenCalled();
    });

    test('rejects when the product document is missing (delisted/unknown SKU)', async () => {
        mockClients.shopperProducts.getProducts.mockResolvedValue({ data: { data: [] } });

        const result = await run({ deliveryOption: 'delivery' });

        if (!result) throw new Error('expected a rejection response, received null');
        expectStatus(result, 422);
        expect(result?.data.error?.code).toBe('OUT_OF_STOCK');
        expect(mockClients.shopperBasketsV2.updateItemInBasket).not.toHaveBeenCalled();
    });

    test('allows a delivery swap for a set/bundle parent that carries no site inventory block', async () => {
        // A set/bundle parent has no top-level `inventory` (stock lives on its children). isSiteOutOfStock treats a
        // missing block as out of stock, so the guard must leave a present-but-inventory-less product to SCAPI.
        mockClients.shopperProducts.getProducts.mockResolvedValue({
            data: { data: [{ id: 'p-1', type: { set: true } }] },
        });

        const result = await run({ deliveryOption: 'delivery' });

        expect(result?.data.success).toBe(true);
        expect(mockClients.shopperBasketsV2.updateItemInBasket).toHaveBeenCalledTimes(1);
    });

    test('returns 409 when pickup would target a different store than an existing pickup line', async () => {
        mockClients.shopperProducts.getProducts.mockResolvedValue({
            data: {
                data: [
                    {
                        id: 'p-1',
                        inventory: { ats: 50, orderable: true },
                        inventories: [{ id: 'inv-1', stockLevel: 10, orderable: true }],
                    },
                ],
            },
        });
        vi.mocked(findOrCreatePickupShipment).mockRejectedValue(
            new PickupShipmentStoreConflictError('Pickup shipment is assigned elsewhere')
        );

        const result = await run({ deliveryOption: 'pickup', storeId: 'store-9', inventoryId: 'inv-1' });

        if (!result) throw new Error('expected a conflict response, received null');
        expectStatus(result, 409);
        expect(result.data.error?.code).toBe('CONFLICT');
        expect(mockClients.shopperBasketsV2.updateItemInBasket).not.toHaveBeenCalled();
    });

    test('allows the swap when the availability lookup fails transiently', async () => {
        mockClients.shopperProducts.getProducts.mockRejectedValue(new Error('product service unavailable'));

        const result = await run({ deliveryOption: 'delivery' });

        expect(result?.data.success).toBe(true);
        expect(mockClients.shopperBasketsV2.updateItemInBasket).toHaveBeenCalledTimes(1);
    });
});
