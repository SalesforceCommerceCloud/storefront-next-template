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
import { isAddressEmpty } from '@/lib/address/address-utils';
import { getShippingMethodsForShipment } from '@/lib/api/shipping-methods.server';
import { findOrCreateDeliveryShipment as findOrCreateCanonicalDeliveryShipment } from '@/lib/cart/shipments.server';
import { generateRandomShipmentId, isDeliveryShipment } from '@/extensions/multiship/lib/basket-utils.server';

/**
 * Consolidates all basket delivery items into a single shipment for single-shipping-address checkout.
 * Uses the 'me' shipment if it exists, otherwise the first available shipment.
 * Excludes pickup items from consolidation.
 *
 * @param basket - The shopping basket
 * @param context - Router context
 * @returns Updated basket with all delivery items assigned to the target shipment
 */
export async function assignProductsToDefaultShipment(
    basket: ShopperBasketsV2.schemas['Basket'],
    context: Readonly<RouterContextProvider>
): Promise<ShopperBasketsV2.schemas['Basket']> {
    if (!basket.basketId) {
        throw new Error('Basket is missing a basketId');
    }
    const clients = createApiClients(context);
    let updatedBasket = basket;

    // Build set of delivery shipment IDs (shipments without c_fromStoreId)
    const deliveryShipmentIds = new Set<string>();
    basket.shipments?.forEach((shipment) => {
        if (shipment.shipmentId && isDeliveryShipment(shipment)) {
            deliveryShipmentIds.add(shipment.shipmentId);
        }
    });

    // Find the default shipment (prefer 'me' if it's a delivery shipment)
    let targetShipment = basket.shipments?.find((s) => s.shipmentId === 'me' && isDeliveryShipment(s));
    let targetShipmentId = 'me';

    // If default shipment doesn't exist or is not a delivery shipment, pick the first delivery shipment
    if (!targetShipment) {
        const firstDeliveryShipment = basket.shipments?.find(isDeliveryShipment);
        if (firstDeliveryShipment?.shipmentId) {
            targetShipment = firstDeliveryShipment;
            targetShipmentId = firstDeliveryShipment.shipmentId;
        } else {
            throw new Error('Basket has no delivery shipments');
        }
    }

    // Find all delivery items not in the target shipment
    const itemsToMove =
        basket.productItems?.filter(
            (
                item
            ): item is ShopperBasketsV2.schemas['ProductItem'] & {
                itemId: string;
                productId: string;
                quantity: number;
            } =>
                Boolean(
                    item.shipmentId &&
                        item.shipmentId !== targetShipmentId &&
                        deliveryShipmentIds.has(item.shipmentId) &&
                        item.itemId &&
                        item.productId &&
                        item.quantity
                )
        ) || [];

    // Move items to target shipment if there are any to move
    if (itemsToMove.length > 0) {
        const itemsToUpdate = itemsToMove.map((item) => ({
            itemId: item.itemId,
            productId: item.productId,
            quantity: item.quantity,
            shipmentId: targetShipmentId,
        }));

        const { data: basketAfterMove } = await clients.shopperBasketsV2.updateItemsInBasket({
            params: {
                path: { basketId: basket.basketId },
            },
            body: itemsToUpdate,
        });
        updatedBasket = basketAfterMove;
    }

    // Get the latest basket state after moving items
    const { data: latestBasket } = await clients.shopperBasketsV2.getBasket({
        params: { path: { basketId: basket.basketId } },
    });
    updatedBasket = latestBasket;

    return updatedBasket;
}

/**
 * Updates the shipping address for a shipment and returns the updated basket.
 *
 * @param context - Router context
 * @param basketId - Basket ID
 * @param shipmentId - Shipment ID
 * @param address - Shipping address to set
 * @returns Updated basket with the address set on the shipment
 * @throws Error if shipment not found after updating address
 */
export async function updateShipmentAddress(
    context: Readonly<RouterContextProvider>,
    basketId: string,
    shipmentId: string,
    address: ShopperBasketsV2.schemas['OrderAddress']
): Promise<ShopperBasketsV2.schemas['Basket']> {
    const clients = createApiClients(context);
    const { data: updatedBasket } = await clients.shopperBasketsV2.updateShippingAddressForShipment({
        params: {
            path: {
                basketId,
                shipmentId,
            },
            query: {
                useAsBilling: false,
            },
        },
        body: address,
    });
    return updatedBasket;
}

/**
 * Creates a new delivery shipment with the specified address in a single API call.
 *
 * @param context - Router context
 * @param basketId - Basket ID
 * @param address - Shipping address to set on the new shipment (optional)
 * @returns Object containing the updated basket and the new shipment ID
 * @throws Error if shipment not found after creation
 */
export async function createDeliveryShipment(
    context: Readonly<RouterContextProvider>,
    basketId: string,
    address?: ShopperBasketsV2.schemas['OrderAddress']
): Promise<{ basket: ShopperBasketsV2.schemas['Basket']; shipmentId: string }> {
    const clients = createApiClients(context);
    const shipmentId = generateRandomShipmentId();

    const body: { shipmentId: string; shippingAddress?: ShopperBasketsV2.schemas['OrderAddress'] } = {
        shipmentId,
    };
    if (address) {
        body.shippingAddress = address;
    }

    const { data: updatedBasket } = await clients.shopperBasketsV2.createShipmentForBasket({
        params: { path: { basketId } },
        body,
    });

    const createdShipment = updatedBasket.shipments?.find((s) => s.shipmentId === shipmentId);
    if (!createdShipment) {
        throw new Error('Shipment was not created');
    }
    return { basket: updatedBasket, shipmentId };
}

/**
 * Finds an existing delivery shipment for the basket, or creates a delivery shipment if none exist.
 *
 * @param basket - The shopping basket
 * @param context - Router context
 * @returns The found or newly created delivery shipment
 * @throws Error if basket is missing a basketId or if shipment creation fails
 */
export async function findOrCreateDeliveryShipment(
    basket: ShopperBasketsV2.schemas['Basket'],
    context: Readonly<RouterContextProvider>
): Promise<ShopperBasketsV2.schemas['Shipment']> {
    return findOrCreateCanonicalDeliveryShipment(basket, context);
}

/**
 * Removes empty shipments from the basket, excluding the default 'me' shipment.
 * Empty shipments are those that have no product items assigned to them.
 *
 * @param context - Router context
 * @param basket - The shopping basket
 * @param shipmentIdsWithItems - Optional set of shipment IDs that have items assigned. If not provided, will be computed from basket.
 * @returns Promise that resolves with the updated basket after removing empty shipments
 */
export async function removeEmptyShipments(
    context: Readonly<RouterContextProvider>,
    basket: ShopperBasketsV2.schemas['Basket'],
    shipmentIdsWithItems?: Set<string>
): Promise<ShopperBasketsV2.schemas['Basket']> {
    if (!basket.shipments || !basket.productItems || !basket.basketId) {
        return basket;
    }

    const clients = createApiClients(context);
    const basketId = basket.basketId;
    let updatedBasket = basket;

    // Find shipments that have items assigned (compute if not provided)
    const shipmentIdsWithItemsSet =
        shipmentIdsWithItems ??
        new Set(updatedBasket.productItems?.map((item) => item.shipmentId).filter((id): id is string => !!id) || []);

    // Find empty shipments (excluding 'me')
    // default shipment 'me' is not considered as an empty shipment
    const emptyShipments =
        updatedBasket.shipments?.filter(
            (shipment) =>
                shipment.shipmentId && shipment.shipmentId !== 'me' && !shipmentIdsWithItemsSet.has(shipment.shipmentId)
        ) || [];

    // Delete each empty shipment
    for (const emptyShipment of emptyShipments) {
        if (emptyShipment.shipmentId) {
            const { data: basketAfterDelete } = await clients.shopperBasketsV2.removeShipmentFromBasket({
                params: {
                    path: {
                        basketId,
                        shipmentId: emptyShipment.shipmentId,
                    },
                },
            });
            updatedBasket = basketAfterDelete;
        }
    }

    return updatedBasket;
}

/**
 * Sets the billing address and default shipping method on the 'me' shipment if it has no product items assigned to it.
 * This ensures empty shipments have a consistent address and shipping method state.
 *
 * After setting up the 'me' shipment, removes all empty shipments (excluding 'me') from the basket.
 * Even though the server removes empty shipments on place-order, we need to remove them here to bypass
 * address and shipping method validation errors that would occur before the server removes them.
 *
 * @param context - Router context
 * @param basket - The shopping basket
 * @returns Promise that resolves when the shipment address and shipping method updates are complete
 */
export async function resolveEmptyShipments(
    context: Readonly<RouterContextProvider>,
    basket: ShopperBasketsV2.schemas['Basket']
): Promise<void> {
    if (!basket.shipments || !basket.productItems || !basket.basketId) {
        return;
    }

    // Build a set of shipment IDs that have items assigned
    const shipmentIdsWithItems = new Set<string>();
    basket.productItems.forEach((item) => {
        if (item.shipmentId) {
            shipmentIdsWithItems.add(item.shipmentId);
        }
    });

    // Remove empty shipments (excluding 'me') to bypass validation errors
    // The server removes them on place-order, but we need to remove them here to avoid
    // address and shipping method validation errors before place-order
    let updatedBasket = await removeEmptyShipments(context, basket, shipmentIdsWithItems);

    if (!updatedBasket.basketId) {
        return;
    }

    // Find the 'me' shipment
    const defaultShipment = updatedBasket.shipments?.find((shipment) => shipment.shipmentId === 'me');

    if (defaultShipment) {
        // Check if the 'me' shipment has no product items assigned
        if (
            !shipmentIdsWithItems.has('me') &&
            updatedBasket.billingAddress &&
            isAddressEmpty(defaultShipment.shippingAddress)
        ) {
            // Set the billing address on the shipment via API only if the current address is empty
            const basketAfterAddressUpdate = await updateShipmentAddress(
                context,
                updatedBasket.basketId,
                'me',
                updatedBasket.billingAddress
            );
            updatedBasket = basketAfterAddressUpdate;

            // Set default shipping method if not already set
            if (!defaultShipment.shippingMethod && updatedBasket.basketId) {
                const clients = createApiClients(context);
                const shippingMethods = await getShippingMethodsForShipment(context, updatedBasket.basketId, 'me');
                const defaultShippingMethodId =
                    shippingMethods?.defaultShippingMethodId ?? shippingMethods?.applicableShippingMethods?.[0]?.id;

                if (defaultShippingMethodId) {
                    await clients.shopperBasketsV2.updateShippingMethodForShipment({
                        params: {
                            path: {
                                basketId: updatedBasket.basketId,
                                shipmentId: 'me',
                            },
                        },
                        body: {
                            id: defaultShippingMethodId,
                        },
                    });
                }
            }
        }
    }
}
