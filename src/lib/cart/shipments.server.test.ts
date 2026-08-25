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

import type { RouterContextProvider } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ShopperBasketsV2 } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { findOrCreateDeliveryShipment } from './shipments.server';

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(),
}));

describe('findOrCreateDeliveryShipment', () => {
    const context = {} as Readonly<RouterContextProvider>;
    const createShipmentForBasket = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createApiClients).mockReturnValue({
            shopperBasketsV2: { createShipmentForBasket },
        } as never);
    });

    test('reuses an existing delivery shipment', async () => {
        const pickupShipment = { shipmentId: 'pickup', c_fromStoreId: 'store-1' };
        const deliveryShipment = { shipmentId: 'delivery' };
        const basket = {
            basketId: 'basket-1',
            shipments: [pickupShipment, deliveryShipment],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = await findOrCreateDeliveryShipment(basket, context);

        expect(result).toBe(deliveryShipment);
        expect(createShipmentForBasket).not.toHaveBeenCalled();
    });

    test('creates a delivery shipment when the basket only has pickup shipments', async () => {
        const pickupShipment = { shipmentId: 'pickup', c_fromStoreId: 'store-1' };
        const basket = {
            basketId: 'basket-1',
            shipments: [pickupShipment],
        } as ShopperBasketsV2.schemas['Basket'];
        createShipmentForBasket.mockImplementation(({ body }) => ({
            data: { shipments: [pickupShipment, { shipmentId: body.shipmentId }] },
        }));

        const result = await findOrCreateDeliveryShipment(basket, context);

        expect(createShipmentForBasket).toHaveBeenCalledWith({
            params: { path: { basketId: 'basket-1' } },
            body: { shipmentId: expect.stringMatching(/^Shipment_/) },
        });
        expect(result.shipmentId).toMatch(/^Shipment_/);
    });
});
