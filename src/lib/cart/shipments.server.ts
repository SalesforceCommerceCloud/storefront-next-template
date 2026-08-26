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
import type { ShopperBasketsV2 } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';

function generateShipmentId(): string {
    return `Shipment_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e8).toString(36)}`;
}

function isDeliveryShipment(shipment: ShopperBasketsV2.schemas['Shipment']): boolean {
    return !shipment.c_fromStoreId;
}

export async function findOrCreateDeliveryShipment(
    basket: ShopperBasketsV2.schemas['Basket'],
    context: Readonly<RouterContextProvider>
): Promise<ShopperBasketsV2.schemas['Shipment']> {
    if (!basket.basketId) {
        throw new Error('Basket is missing a basketId');
    }

    const existingShipment = basket.shipments?.find(isDeliveryShipment);
    if (existingShipment) {
        return existingShipment;
    }

    const shipmentId = generateShipmentId();
    const clients = createApiClients(context);
    const { data: updatedBasket } = await clients.shopperBasketsV2.createShipmentForBasket({
        params: { path: { basketId: basket.basketId } },
        body: { shipmentId },
    });
    const createdShipment = updatedBasket.shipments?.find((shipment) => shipment.shipmentId === shipmentId);
    if (!createdShipment) {
        throw new Error('Shipment was not created');
    }

    return createdShipment;
}
