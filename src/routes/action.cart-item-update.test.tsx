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
import { action } from './action.cart-item-update';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { createApiClients } from '@/lib/api-clients.server';

vi.mock('@/middlewares/basket.server');

const { createContext: reactCreateContext, actualReactRouter } = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reactRouter = require('react-router');
    return { createContext: React.createContext, actualReactRouter: reactRouter };
});

vi.mock('@/lib/api-clients.server');
vi.mock('react-router', () => {
    return {
        ...actualReactRouter,
        createContext: reactCreateContext,
    };
});
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

import { createFormDataRequest } from '@/test-utils/request-helpers';
import { createActionArgs, expectStatus } from '@/lib/test-utils';
import { resourceRoutes } from '@/route-paths';

describe('action.cart-item-update', () => {
    const basketWithItem = {
        basketId: 'test-basket-123',
        productItems: [{ itemId: 'item-1', productId: 'p-1', quantity: 1 }],
    };
    const updatedBasket = {
        basketId: 'test-basket-123',
        productItems: [{ itemId: 'item-1', productId: 'p-1', quantity: 2 }],
    };

    const mockClients = {
        shopperProducts: {
            getProducts: vi.fn(),
        },
        shopperBasketsV2: {
            updateItemInBasket: vi.fn(),
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getBasket).mockResolvedValue({ current: basketWithItem, snapshot: null } as any);
        vi.mocked(updateBasketResource).mockImplementation(() => {});
        vi.mocked(createApiClients).mockReturnValue(mockClients as any);
    });

    const runUpdate = (fields: Record<string, string>) => {
        const request = createFormDataRequest(`http://localhost${resourceRoutes.cartItemUpdate}`, 'PATCH', fields);
        return action(createActionArgs(request, {} as any, { pattern: resourceRoutes.cartItemUpdate }));
    };

    test('allows a quantity increase that stays within available stock', async () => {
        mockClients.shopperProducts.getProducts.mockResolvedValue({
            data: { data: [{ id: 'p-1', inventory: { ats: 5, orderable: true } }] },
        });
        mockClients.shopperBasketsV2.updateItemInBasket.mockResolvedValue({ data: updatedBasket });

        const result = await runUpdate({ itemId: 'item-1', quantity: '2' });

        expect(result.data.success).toBe(true);
        expect(mockClients.shopperProducts.getProducts).toHaveBeenCalledTimes(1);
        expect(mockClients.shopperBasketsV2.updateItemInBasket).toHaveBeenCalledTimes(1);
    });

    test('rejects a quantity increase that exceeds available stock without writing to the basket', async () => {
        mockClients.shopperProducts.getProducts.mockResolvedValue({
            data: { data: [{ id: 'p-1', inventory: { ats: 2, orderable: true } }] },
        });

        const result = await runUpdate({ itemId: 'item-1', quantity: '3' });

        expectStatus(result, 422);
        expect(result.data.success).toBe(false);
        expect(result.data.error?.code).toBe('OUT_OF_STOCK');
        expect(mockClients.shopperBasketsV2.updateItemInBasket).not.toHaveBeenCalled();
    });

    test('treats a non-orderable product as out of stock even when ats is sufficient', async () => {
        mockClients.shopperProducts.getProducts.mockResolvedValue({
            data: { data: [{ id: 'p-1', inventory: { ats: 10, orderable: false } }] },
        });

        const result = await runUpdate({ itemId: 'item-1', quantity: '2' });

        expectStatus(result, 422);
        expect(result.data.error?.code).toBe('OUT_OF_STOCK');
        expect(mockClients.shopperBasketsV2.updateItemInBasket).not.toHaveBeenCalled();
    });

    test('skips the availability fetch on a quantity decrease', async () => {
        vi.mocked(getBasket).mockResolvedValue({
            current: {
                basketId: 'test-basket-123',
                productItems: [{ itemId: 'item-1', productId: 'p-1', quantity: 3 }],
            },
            snapshot: null,
        } as any);
        mockClients.shopperBasketsV2.updateItemInBasket.mockResolvedValue({ data: updatedBasket });

        const result = await runUpdate({ itemId: 'item-1', quantity: '2' });

        expect(result.data.success).toBe(true);
        expect(mockClients.shopperProducts.getProducts).not.toHaveBeenCalled();
        expect(mockClients.shopperBasketsV2.updateItemInBasket).toHaveBeenCalledTimes(1);
    });

    test('resolves the product from the submitted productId when changing a variant', async () => {
        mockClients.shopperProducts.getProducts.mockResolvedValue({
            data: { data: [{ id: 'p-2', inventory: { ats: 0, orderable: true } }] },
        });

        const result = await runUpdate({ itemId: 'item-1', productId: 'p-2', quantity: '2' });

        expectStatus(result, 422);
        expect(result.data.error?.code).toBe('OUT_OF_STOCK');
        expect(mockClients.shopperProducts.getProducts).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({
                    query: expect.objectContaining({ ids: ['p-2'], expand: ['availability'] }),
                }),
            })
        );
    });

    test('checks availability on a same-quantity variant swap to an out-of-stock variant', async () => {
        // Switching to a different variant at the same quantity must still validate stock — the guard cannot
        // key off a quantity increase alone, or an out-of-stock swap slips through and fails later at checkout.
        mockClients.shopperProducts.getProducts.mockResolvedValue({
            data: { data: [{ id: 'p-2', inventory: { ats: 0, orderable: true } }] },
        });

        const result = await runUpdate({ itemId: 'item-1', productId: 'p-2', quantity: '1' });

        expectStatus(result, 422);
        expect(result.data.error?.code).toBe('OUT_OF_STOCK');
        expect(mockClients.shopperProducts.getProducts).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({ query: expect.objectContaining({ ids: ['p-2'] }) }),
            })
        );
        expect(mockClients.shopperBasketsV2.updateItemInBasket).not.toHaveBeenCalled();
    });

    test('rejects an increase when the product document is missing (delisted/unknown SKU)', async () => {
        // An empty result means the product itself is gone. The guard must reject rather than silently no-op on
        // missing data and write an unchecked quantity that only fails later at order creation.
        mockClients.shopperProducts.getProducts.mockResolvedValue({ data: { data: [] } });

        const result = await runUpdate({ itemId: 'item-1', quantity: '3' });

        expectStatus(result, 422);
        expect(result.data.error?.code).toBe('OUT_OF_STOCK');
        expect(mockClients.shopperBasketsV2.updateItemInBasket).not.toHaveBeenCalled();
    });

    test('allows an increase when a transient availability lookup fails', async () => {
        // A product-service blip must not block a cart edit SCAPI would otherwise accept. Fail open; the
        // place-order backstop still catches a genuine out-of-stock at checkout.
        mockClients.shopperProducts.getProducts.mockRejectedValue(new Error('product service unavailable'));
        mockClients.shopperBasketsV2.updateItemInBasket.mockResolvedValue({ data: updatedBasket });

        const result = await runUpdate({ itemId: 'item-1', quantity: '3' });

        expect(result.data.success).toBe(true);
        expect(mockClients.shopperBasketsV2.updateItemInBasket).toHaveBeenCalledTimes(1);
    });

    test('allows an increase for a set/bundle whose parent carries no site inventory block', async () => {
        // A set/bundle parent has no top-level `inventory` (stock lives on its children). isSiteOutOfStock would
        // treat the missing block as out of stock, so the guard must leave a present-but-inventory-less product to SCAPI.
        mockClients.shopperProducts.getProducts.mockResolvedValue({
            data: { data: [{ id: 'p-1', type: { set: true } }] },
        });
        mockClients.shopperBasketsV2.updateItemInBasket.mockResolvedValue({ data: updatedBasket });

        const result = await runUpdate({ itemId: 'item-1', quantity: '3' });

        expect(result.data.success).toBe(true);
        expect(mockClients.shopperBasketsV2.updateItemInBasket).toHaveBeenCalledTimes(1);
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // A pickup line is bound to a store's inventory, not site ATS. The minicart stepper submits only
    // itemId + quantity (no deliveryOption), so the BOPIS delivery-option handler falls through and this
    // guard runs. It must check the store's stockLevel, not the site ats. These tests strip with the
    // pickup branch in the source — without the branch a pickup increase is not store-checked and the
    // assertions below would no longer hold.
    const basketWithPickupItem = {
        basketId: 'test-basket-123',
        productItems: [
            { itemId: 'item-1', productId: 'p-1', quantity: 1, shipmentId: 'ship-pickup', inventoryId: 'inv-1' },
        ],
        shipments: [{ shipmentId: 'ship-pickup', c_fromStoreId: 'store-9' }],
    };

    test('rejects a pickup quantity increase against store stock even when site stock is sufficient', async () => {
        vi.mocked(getBasket).mockResolvedValue({ current: basketWithPickupItem, snapshot: null } as any);
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

        const result = await runUpdate({ itemId: 'item-1', quantity: '3' });

        expectStatus(result, 422);
        expect(result.data.error?.code).toBe('OUT_OF_STOCK');
        expect(mockClients.shopperProducts.getProducts).toHaveBeenCalledWith(
            expect.objectContaining({
                params: expect.objectContaining({
                    query: expect.objectContaining({ ids: ['p-1'], inventoryIds: ['inv-1'], expand: ['availability'] }),
                }),
            })
        );
        expect(mockClients.shopperBasketsV2.updateItemInBasket).not.toHaveBeenCalled();
    });

    test('allows a pickup quantity increase within store stock even when site stock is exhausted', async () => {
        vi.mocked(getBasket).mockResolvedValue({ current: basketWithPickupItem, snapshot: null } as any);
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
        mockClients.shopperBasketsV2.updateItemInBasket.mockResolvedValue({ data: updatedBasket });

        const result = await runUpdate({ itemId: 'item-1', quantity: '3' });

        expect(result.data.success).toBe(true);
        expect(mockClients.shopperBasketsV2.updateItemInBasket).toHaveBeenCalledTimes(1);
    });

    test('allows a pickup increase when the store availability lookup fails transiently', async () => {
        vi.mocked(getBasket).mockResolvedValue({ current: basketWithPickupItem, snapshot: null } as any);
        mockClients.shopperProducts.getProducts.mockRejectedValue(new Error('product service unavailable'));
        mockClients.shopperBasketsV2.updateItemInBasket.mockResolvedValue({ data: updatedBasket });

        const result = await runUpdate({ itemId: 'item-1', quantity: '3' });

        expect(result.data.success).toBe(true);
        expect(mockClients.shopperBasketsV2.updateItemInBasket).toHaveBeenCalledTimes(1);
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
});
