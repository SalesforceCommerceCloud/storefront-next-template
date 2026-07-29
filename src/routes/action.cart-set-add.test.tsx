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
import { action } from './action.cart-set-add';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { createApiClients } from '@/lib/api-clients.server';
import { getConfig } from '@salesforce/storefront-next-runtime/config';

vi.mock('@/middlewares/basket.server');

const { createContext: reactCreateContext, actualReactRouter } = vi.hoisted(() => {
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const reactRouter = require('react-router');
    return { createContext: React.createContext, actualReactRouter: reactRouter };
});

vi.mock('@/lib/api-clients.server');
vi.mock('@salesforce/storefront-next-runtime/config');
vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({
    getTranslation: () => ({ t: (key: string) => key }),
}));
// @sfdc-extension-block-start SFDC_EXT_BOPIS
vi.mock('@/extensions/bopis/lib/api/shipment.server', () => ({
    findOrCreatePickupShipment: vi.fn(() => Promise.resolve({ shipmentId: 'pickup-shipment-1' })),
}));
// @sfdc-extension-block-end SFDC_EXT_BOPIS
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

describe('action.cart-set-add', () => {
    const emptyBasket = { basketId: 'test-basket-123', productItems: [] };
    const updatedBasket = {
        basketId: 'test-basket-123',
        productItems: [
            { itemId: 'item-1', productId: 'p-1', quantity: 1 },
            { itemId: 'item-2', productId: 'p-2', quantity: 2 },
        ],
    };

    const mockClients = {
        shopperBasketsV2: {
            addItemToBasket: vi.fn(),
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getBasket).mockResolvedValue({ current: emptyBasket, snapshot: null } as any);
        vi.mocked(updateBasketResource).mockImplementation(() => {});
        vi.mocked(createApiClients).mockReturnValue(mockClients as any);
        vi.mocked(getConfig).mockReturnValue({} as any);
    });

    test('adds multiple regular items to the basket', async () => {
        mockClients.shopperBasketsV2.addItemToBasket.mockResolvedValue({ data: updatedBasket });

        const request = createFormDataRequest(`http://localhost${resourceRoutes.cartSetAdd}`, 'POST', {
            productItems: JSON.stringify([
                { productId: 'p-1', quantity: 1 },
                { productId: 'p-2', quantity: 2 },
            ]),
        });

        const result = await action(createActionArgs(request, {} as any, { pattern: resourceRoutes.cartSetAdd }));

        expect(result.data.success).toBe(true);
        expect(mockClients.shopperBasketsV2.addItemToBasket).toHaveBeenCalledTimes(1);
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    test('rejects pickup set from a different store than existing pickup items (BOPIS)', async () => {
        const basketWithPickup = {
            basketId: 'test-basket-123',
            productItems: [{ itemId: 'item-existing', productId: 'p-existing', shipmentId: 's-1', quantity: 1 }],
            shipments: [{ shipmentId: 's-1', c_fromStoreId: 'store-A' }],
        };
        vi.mocked(getBasket).mockResolvedValue({ current: basketWithPickup, snapshot: null } as any);

        const request = createFormDataRequest(`http://localhost${resourceRoutes.cartSetAdd}`, 'POST', {
            productItems: JSON.stringify([
                { productId: 'p-1', quantity: 1, storeId: 'store-B', inventoryId: 'inv-B' },
                { productId: 'p-2', quantity: 1, storeId: 'store-B', inventoryId: 'inv-B' },
            ]),
        });

        const result = await action(createActionArgs(request, {} as any, { pattern: resourceRoutes.cartSetAdd }));

        expectStatus(result, 409);
        expect(result.data.success).toBe(false);
        expect(result.data.error?.code).toBe('CONFLICT');
        expect(mockClients.shopperBasketsV2.addItemToBasket).not.toHaveBeenCalled();
    });

    test('allows pickup set from the same store as existing pickup items', async () => {
        const basketWithPickup = {
            basketId: 'test-basket-123',
            productItems: [{ itemId: 'item-existing', productId: 'p-existing', shipmentId: 's-1', quantity: 1 }],
            shipments: [{ shipmentId: 's-1', c_fromStoreId: 'store-A' }],
        };
        vi.mocked(getBasket).mockResolvedValue({ current: basketWithPickup, snapshot: null } as any);
        mockClients.shopperBasketsV2.addItemToBasket.mockResolvedValue({ data: updatedBasket });

        const request = createFormDataRequest(`http://localhost${resourceRoutes.cartSetAdd}`, 'POST', {
            productItems: JSON.stringify([
                { productId: 'p-1', quantity: 1, storeId: 'store-A', inventoryId: 'inv-A' },
                { productId: 'p-2', quantity: 1, storeId: 'store-A', inventoryId: 'inv-A' },
            ]),
        });

        const result = await action(createActionArgs(request, {} as any, { pattern: resourceRoutes.cartSetAdd }));

        expect(result.data.success).toBe(true);
        expect(mockClients.shopperBasketsV2.addItemToBasket).toHaveBeenCalledTimes(1);
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
});
