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
import { PICKUP_SHIPMENT_ID, PICKUP_SHIPPING_METHOD_ID } from '@/extensions/bopis/constants';
import type { ShopperBasketsV2, ShopperStores } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { getShippingMethodsForShipment } from '@/lib/api/shipping-methods.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getPickupShippingMethodId } from '@/extensions/bopis/lib/pickup-shipping-method-utils';
import { orderAddressFromStoreAddress } from '@/extensions/bopis/lib/store-utils';

export { getPickupShippingMethodId } from '@/extensions/bopis/lib/pickup-shipping-method-utils';

/** Raised when a basket's one supported pickup shipment belongs to another store. */
export class PickupShipmentStoreConflictError extends Error {
    constructor(message = 'Pickup shipment assigned to a different store') {
        super(message);
        this.name = 'PickupShipmentStoreConflictError';
    }
}

/**
 * Update shipment custom attributes for pickup
 * Sets c_fromStoreId
 *
 * @param context - Router context
 * @param basketId - Basket ID
 * @param shipmentId - Shipment ID (defaults to PICKUP_SHIPMENT_ID)
 * @param storeId - Store ID for pickup
 * @returns Updated basket
 */
export async function updateShipmentForPickup(
    context: Readonly<RouterContextProvider>,
    basketId: string,
    shipmentId: string = PICKUP_SHIPMENT_ID,
    storeId: string
): Promise<ShopperBasketsV2.schemas['Basket']> {
    const clients = createApiClients(context);

    // Update shipment with custom attributes
    const { data: updatedBasket } = await clients.shopperBasketsV2.updateShipmentForBasket({
        params: {
            path: {
                basketId,
                shipmentId,
            },
        },
        body: {
            shipmentId,
            c_fromStoreId: storeId,
        },
    });

    return updatedBasket;
}

/**
 * Sets store address and shipping method for BOPIS orders.
 *
 * @param context - Router context
 * @param basketId - Basket ID
 * @param store - Store details for pickup
 * @param shipmentId - Shipment ID (defaults to PICKUP_SHIPMENT_ID)
 * @returns Updated basket with store address and shipping method
 */
export async function setAddressAndMethodForPickup(
    context: Readonly<RouterContextProvider>,
    basketId: string | undefined,
    store: ShopperStores.schemas['Store'],
    shipmentId: string = PICKUP_SHIPMENT_ID
): Promise<ShopperBasketsV2.schemas['Basket']> {
    const { t } = getTranslation(context);
    const clients = createApiClients(context);

    if (!basketId) {
        throw new Error(t('errors:noBasketFound'));
    }

    const storeAddress = orderAddressFromStoreAddress(store, context);

    // Set shipping address so API returns applicable shipping methods
    await clients.shopperBasketsV2.updateShippingAddressForShipment({
        params: {
            path: {
                basketId,
                shipmentId,
            },
        },
        body: storeAddress,
    });

    // Get applicable shipping methods and resolve pickup method ID
    const shippingMethodResult = await getShippingMethodsForShipment(context, basketId, shipmentId);
    const pickupMethodId = getPickupShippingMethodId(shippingMethodResult) ?? PICKUP_SHIPPING_METHOD_ID;

    // Set the shipping method for pickup shipment
    const { data: updatedBasket } = await clients.shopperBasketsV2.updateShippingMethodForShipment({
        params: {
            path: {
                basketId,
                shipmentId,
            },
        },
        body: { id: pickupMethodId },
    });

    return updatedBasket;
}

/**
 * Creates a new pickup shipment for the basket
 *
 * @param basket - The shopping basket
 * @param context - Router context
 * @param pickupStoreId - Store ID for pickup shipment
 * @returns The newly created shipment
 */
async function createPickupShipment(
    basket: ShopperBasketsV2.schemas['Basket'],
    context: Readonly<RouterContextProvider>,
    pickupStoreId: string
): Promise<ShopperBasketsV2.schemas['Shipment']> {
    if (!basket.basketId) {
        throw new Error('Basket is missing a basketId');
    }

    // This implementation supports a single pickup shipment with a well-known ID.
    // If multiple pickup shipments are needed, replace this with a unique ID per store ID.
    const shipmentId = PICKUP_SHIPMENT_ID;
    const clients = createApiClients(context);
    await clients.shopperBasketsV2.createShipmentForBasket?.({
        params: { path: { basketId: basket.basketId } },
        body: { shipmentId, c_fromStoreId: pickupStoreId },
    });

    // Get refreshed basket with new shipment
    const { data: refreshedBasket } = await clients.shopperBasketsV2.getBasket({
        params: { path: { basketId: basket.basketId } },
    });
    const shipment = refreshedBasket.shipments?.find((s) => s.shipmentId === shipmentId);
    if (!shipment) {
        throw new Error('Shipment was not created');
    }

    return shipment;
}

/**
 * Finds or creates a pickup shipment for the basket with the specified store ID.
 * If no pickup shipments exist, creates a new pickup shipment for that store.
 * If a pickup shipment already exists and has product items assigned, throws an exception.
 * If a pickup shipment exists but has no product items, updates its store ID and returns it.
 *
 * @param basket - The shopping basket
 * @param context - Router context
 * @param pickupStoreId - Store ID for pickup shipment
 * @returns The existing or newly created pickup shipment
 * @throws Error if a pickup shipment with assigned product items already exists
 */
export async function findOrCreatePickupShipment(
    basket: ShopperBasketsV2.schemas['Basket'],
    context: Readonly<RouterContextProvider>,
    pickupStoreId: string
): Promise<ShopperBasketsV2.schemas['Shipment']> {
    if (!basket.basketId) {
        throw new Error('Basket is missing a basketId');
    }

    // Find any existing pickup shipment (identified by c_fromStoreId being truthy)
    const existingPickupShipment = basket.shipments?.find((s) => s.c_fromStoreId);

    if (!existingPickupShipment) {
        // No pickup shipments exist, create a new one
        return createPickupShipment(basket, context, pickupStoreId);
    }

    // Check if the existing pickup shipment already has the correct store ID
    if (existingPickupShipment.c_fromStoreId === pickupStoreId) {
        return existingPickupShipment;
    }

    // Check if the existing pickup shipment has product items assigned
    const hasProductItems = basket.productItems?.some((item) => item.shipmentId === existingPickupShipment.shipmentId);

    if (hasProductItems) {
        throw new PickupShipmentStoreConflictError();
    }

    // Existing pickup shipment has no product items, update its store ID
    const updatedBasket = await updateShipmentForPickup(
        context,
        basket.basketId,
        existingPickupShipment.shipmentId,
        pickupStoreId
    );

    const updatedShipment = updatedBasket.shipments?.find((s) => s.shipmentId === existingPickupShipment.shipmentId);

    if (!updatedShipment) {
        throw new Error('Shipment not found after updating store ID');
    }

    return updatedShipment;
}
