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

import type { ShopperBasketsV2, ShopperStores } from '@/scapi';
import type { PickupItemInfo } from '@/extensions/bopis/context/pickup-context';
import { getPickupStoreFromMap } from '@/extensions/bopis/lib/store-utils';
import { isPickupShippingMethod } from '@/extensions/bopis/lib/pickup-shipping-method-utils';

/**
 * Extracts pickup items from basket by checking shipments for store pickup.
 *
 * For items to be marked as pickup:
 * 1. The basket must have a shipment with c_fromStoreId set (indicating store pickup)
 * 2. Product items in that shipment must have an inventoryId
 *
 * Note: When c_fromStoreId is set on a shipment, all items in that shipment are
 * pickup items from that store. The inventoryId on product items will be the
 * store's inventory ID (not the site's global inventory).
 *
 * @param basket - The shopping basket containing shipments and product items
 * @returns Map of productId to PickupItemInfo (inventoryId and storeId)
 *
 * @example
 * ```tsx
 * // Get basket from context
 * const basket = (await getBasket(context)).current;
 *
 * // Extract pickup items from basket
 * const pickupItems = getPickupItemsFromBasket(basket);
 *
 * // Check if a specific product is for pickup
 * const productId = 'product-123';
 * if (pickupItems.has(productId)) {
 *   const pickupInfo = pickupItems.get(productId);
 *   console.log(`Product ${productId} will be picked up from store ${pickupInfo?.storeId}`);
 * }
 *
 * // Iterate through all pickup items
 * for (const [productId, { inventoryId, storeId }] of pickupItems) {
 *   console.log(`Product ${productId}: inventory ${inventoryId}, store ${storeId}`);
 * }
 *
 * // Use with pickup context
 * const pickup = usePickup();
 * const basketPickupItems = getPickupItemsFromBasket(basket);
 * // Compare or merge with pickup context items...
 * ```
 */
export function getPickupItemsFromBasket(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined
): Map<string, PickupItemInfo> {
    const pickupItems = new Map<string, PickupItemInfo>();

    // Return empty map if basket, shipments, or product items don't exist
    if (!basket?.shipments || !basket.productItems) {
        return pickupItems;
    }

    // Build a map of shipmentId -> storeId for pickup shipments
    const pickupShipments = new Map<string, string>();
    basket.shipments.forEach((shipment) => {
        if (shipment.shipmentId && shipment.c_fromStoreId) {
            pickupShipments.set(shipment.shipmentId, shipment.c_fromStoreId as string);
        }
    });

    // If no pickup shipments, return early
    if (pickupShipments.size === 0) {
        return pickupItems;
    }

    // Iterate through product items once and check if they belong to a pickup shipment
    basket.productItems.forEach((item) => {
        // Skip if item doesn't have required fields
        if (!item.productId || !item.inventoryId || !item.shipmentId) {
            return;
        }

        // Check if this item's shipment is a pickup shipment
        const storeId = pickupShipments.get(item.shipmentId);
        if (storeId) {
            pickupItems.set(item.productId, {
                inventoryId: item.inventoryId,
                storeId,
            });
        }
    });

    return pickupItems;
}

/**
 * Extracts unique inventory IDs from pickup shipments in the basket.
 *
 * This function is useful when fetching product data that needs store-level
 * inventory information. It collects all inventory IDs from items in shipments
 * that have c_fromStoreId set (store pickup shipments).
 *
 * @param basket - The shopping basket containing shipments and product items
 * @returns Sorted array of unique inventory IDs from pickup items, or empty array if none found
 *
 * @example
 * ```tsx
 * const basket = (await getBasket(context)).current;
 * const inventoryIds = getInventoryIdsFromPickupShipments(basket);
 *
 * const productsResponse = await client.ShopperProducts.getProducts({
 *     parameters: {
 *         ids: productIds,
 *         allImages: true,
 *         ...(inventoryIds.length > 0 ? { inventoryIds } : {}),
 *     },
 * });
 * ```
 */
export function getInventoryIdsFromPickupShipments(
    basket: ShopperBasketsV2.schemas['Basket'] | null | undefined
): string[] {
    // Return empty array if basket, shipments, or product items don't exist
    if (!basket?.shipments || !basket.productItems) {
        return [];
    }

    // Build a set of shipment IDs that are for pickup (have c_fromStoreId)
    const pickupShipmentIds = new Set<string>();
    basket.shipments.forEach((shipment) => {
        if (shipment.shipmentId && shipment.c_fromStoreId) {
            pickupShipmentIds.add(shipment.shipmentId);
        }
    });

    // If no pickup shipments, return early
    if (pickupShipmentIds.size === 0) {
        return [];
    }

    // Collect unique inventory IDs from items in pickup shipments
    const inventoryIds = new Set<string>();
    basket.productItems.forEach((item) => {
        if (item.shipmentId && item.inventoryId && pickupShipmentIds.has(item.shipmentId)) {
            inventoryIds.add(item.inventoryId);
        }
    });

    // Convert to array and sort, ensuring consistent order for cache keys
    return Array.from(inventoryIds).sort();
}

/**
 * Extracts unique store IDs from pickup shipments in the basket.
 *
 * This function collects all c_fromStoreId values from shipments that have
 * store pickup configured, returning them as a sorted array of unique values.
 * Useful for batch operations that need to know which stores are involved
 * in the current basket.
 *
 * @param basket - The shopping basket containing shipments
 * @returns Sorted array of unique store IDs from pickup shipments, or empty array if none found
 *
 * @example
 * ```tsx
 * const basket = (await getBasket(context)).current;
 * const storeIds = getStoreIdsFromBasket(basket);
 *
 * // Fetch store details for all stores in the basket
 * const { data: stores } = useScapiFetcher({
 *     method: 'getStores',
 *     parameters: {
 *         ids: storeIds,
 *     },
 * });
 * ```
 */
export function getStoreIdsFromBasket(basket: ShopperBasketsV2.schemas['Basket'] | null | undefined): string[] {
    // Collect unique store IDs from shipments
    const storeIds = new Set<string>();
    basket?.shipments?.forEach((shipment) => {
        if (shipment.c_fromStoreId) {
            storeIds.add(shipment.c_fromStoreId as string);
        }
    });

    // Convert to array and sort, ensuring consistent order for cache keys
    return Array.from(storeIds).sort();
}

/**
 * Gets the first pickup store ID (c_fromStoreId) from the basket's shipments.
 *
 * This function finds the first shipment with c_fromStoreId set and returns that store ID.
 * Useful when you need to know if a basket has pickup items and which store they're from.
 *
 * @param basket - The shopping basket containing shipments
 * @returns The first store ID (c_fromStoreId) found, or undefined if no pickup shipments exist
 *
 * @example
 * ```tsx
 * const basket = (await getBasket(context)).current;
 * const storeId = getFirstPickupStoreId(basket);
 *
 * if (storeId) {
 *     // Basket has pickup items from this store
 *     console.log(`Pickup store: ${storeId}`);
 * } else {
 *     // No pickup shipments in basket
 *     console.log('No pickup store set');
 * }
 * ```
 */
export function getFirstPickupStoreId(
    basket: ShopperBasketsV2.schemas['Basket'] | null | undefined
): string | undefined {
    const shipment = getPickupShipment(basket);
    return shipment?.c_fromStoreId as string | undefined;
}

/**
 * Gets the shipment ID of the first pickup shipment
 *
 * @param basket
 * @returns The shipment ID of first pickup shipment, or undefined
 */
export function getFirstPickupShipmentId(
    basket: ShopperBasketsV2.schemas['Basket'] | null | undefined
): string | undefined {
    const shipment = getPickupShipment(basket);
    return shipment?.shipmentId;
}

/**
 * Gets the Store object for the first pickup store in the basket.
 *
 * This function gets the first store ID from the basket using getStoreIdsFromBasket
 * and then looks it up in the pickupStores map using getPickupStoreFromMap.
 *
 * @param basket - The shopping basket containing shipments
 * @param pickupStores - Map of storeId → Store objects
 * @returns The Store object for the first pickup store, or undefined if no pickup store found
 *
 * @example
 * ```tsx
 * const pickup = usePickup();
 * const store = getFirstPickupStore(basket, pickup?.pickupStores);
 *
 * if (store) {
 *     // Display store information
 *     console.log(`Pickup store: ${store.name}`);
 * }
 * ```
 */
export function getFirstPickupStore(
    basket: ShopperBasketsV2.schemas['Basket'] | null | undefined,
    pickupStores?: Map<string, ShopperStores.schemas['Store']>
): ShopperStores.schemas['Store'] | undefined {
    const storeIds = getStoreIdsFromBasket(basket);
    const firstStoreId = storeIds[0];
    return getPickupStoreFromMap(firstStoreId, pickupStores);
}

/**
 * Gets the store ID (c_fromStoreId) for a specific basket item.
 *
 * This function looks up a product item by its itemId and returns the c_fromStoreId
 * from its associated shipment. If the item is in a store pickup shipment, this will
 * return the store ID. For regular delivery shipments, this returns undefined.
 *
 * @param basket - The shopping basket containing shipments and product items
 * @param itemId - The itemId of the product item to look up (optional)
 * @returns The store ID (c_fromStoreId) if the item is in a pickup shipment, undefined otherwise
 *
 * @example
 * ```tsx
 * const basket = (await getBasket(context)).current;
 * const storeId = getStoreIdForBasketItem(basket, 'item-123');
 *
 * if (storeId) {
 *     // Item is for store pickup from this store
 *     console.log(`Item will be picked up from store: ${storeId}`);
 * } else {
 *     // Item is for regular delivery or not found
 *     console.log('Item is for delivery');
 * }
 * ```
 */
export function getStoreIdForBasketItem(
    basket: ShopperBasketsV2.schemas['Basket'] | null | undefined,
    itemId?: string
): string | undefined {
    if (!itemId) return undefined;

    // Find the product item with the given itemId
    const productItem = basket?.productItems?.find((item) => item.itemId === itemId);

    // Find the shipment for this item and return its store ID
    const shipment = basket?.shipments?.find((s) => s.shipmentId === productItem?.shipmentId);
    return shipment?.c_fromStoreId as string | undefined;
}

/**
 * Gets product items from the basket that belong to a specific pickup store.
 *
 * This function filters product items to only include those that belong to shipments
 * with the specified storeId in c_fromStoreId. Since a basket typically has a single
 * store pickup shipment, this is useful when you need to filter items by store.
 *
 * @param basket - The shopping basket containing shipments and product items
 * @param storeId - The store ID to filter by
 * @returns Array of product items that belong to shipments with the specified storeId, or empty array if none found
 *
 * @example
 * ```tsx
 * const basket = (await getBasket(context)).current;
 * const storeId = getFirstPickupStoreId(basket);
 * const pickupItems = getPickupProductItemsForStore(basket, storeId);
 *
 * // Validate inventory for items from this specific store
 * for (const item of pickupItems) {
 *   const quantity = item.quantity || 1;
 *   // Check inventory...
 * }
 * ```
 */
export function getPickupProductItemsForStore(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined,
    storeId: string
): ShopperBasketsV2.schemas['ProductItem'][] {
    if (!basket?.shipments || !basket.productItems) {
        return [];
    }

    // Build a set of shipment IDs that have the specified storeId
    const shipmentIds = new Set<string>();
    basket.shipments.forEach((shipment) => {
        if (shipment.shipmentId && shipment.c_fromStoreId) {
            const shipmentStoreId = shipment.c_fromStoreId as string;
            if (shipmentStoreId === storeId) {
                shipmentIds.add(shipment.shipmentId);
            }
        }
    });

    // If no matching shipments, return early
    if (shipmentIds.size === 0) {
        return [];
    }

    // Filter product items that belong to shipments with the specified storeId
    return basket.productItems.filter((item) => {
        return item.shipmentId && shipmentIds.has(item.shipmentId);
    });
}

/**
 * Filters basket product items to only include those that are in the pickup context.
 *
 * This function checks each product item's productId against the pickupBasketItems map
 * to determine if it should be included in the pickup items list.
 *
 * @param basket - The shopping basket containing product items
 * @returns Array of product items that are marked for pickup, or empty array if none found
 *
 * @example
 * ```tsx
 * const pickup = usePickup();
 * const pickupItems = filterPickupProductItems(basket, pickup?.pickupBasketItems);
 *
 * if (pickupItems.length > 0) {
 *   return <PickupItemsList items={pickupItems} />;
 * }
 * ```
 */
export function filterPickupProductItems(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined
): ShopperBasketsV2.schemas['ProductItem'][] {
    if (!basket?.productItems || !basket.shipments) return [];
    const pickupShipmentIds = new Set(basket.shipments.filter((s) => s.c_fromStoreId).map((s) => s.shipmentId));
    return basket.productItems.filter((item) => item.shipmentId && pickupShipmentIds.has(item.shipmentId));
}

/**
 * Filters out pickup shipping methods from a shipping methods map.
 *
 * Removes methods identified as pickup (c_storePickupEnabled === true, or id '005' as fallback),
 *
 * @param shippingMethodsMap - A map of shipment ID to shipping method results
 * @param pickupCurrencies - Site's supported currencies; when provided, recognize currency-suffixed pickup method IDs (e.g., `005-usd`)
 * @returns A shipping methods map with pickup methods filtered out from each shipment
 *
 * @example
 * ```tsx
 * const deliveryMethodsMap = filterDeliveryShippingMethods(shippingMethodsMap);
 * ```
 */
export function filterDeliveryShippingMethods(
    shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>,
    pickupCurrencies?: string[]
): Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> {
    const filteredMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {};

    for (const [shipmentId, shippingMethods] of Object.entries(shippingMethodsMap)) {
        if (!shippingMethods.applicableShippingMethods) {
            filteredMap[shipmentId] = shippingMethods;
            continue;
        }

        filteredMap[shipmentId] = {
            ...shippingMethods,
            applicableShippingMethods: shippingMethods.applicableShippingMethods.filter(
                (method) => !isPickupShippingMethod(method, { pickupCurrencies })
            ),
        };
    }

    return filteredMap;
}

/**
 * Checks if the basket has store pickup enabled.
 *
 * This function checks all shipments in the basket for the c_fromStoreId field.
 * When present in any shipment, it indicates that the order (or at least part of it)
 * is configured for store pickup.
 *
 * @param basket - The shopping basket to check
 * @returns true if any shipment in the basket has store pickup enabled, false otherwise
 */
export function isStorePickup(basket: ShopperBasketsV2.schemas['Basket'] | null | undefined): boolean {
    return basket?.shipments?.some((shipment) => Boolean(shipment.c_fromStoreId)) ?? false;
}

/**
 * Gets the pickup shipment with store pickup (c_fromStoreId) configured.
 *
 * This function iterates through the basket's shipments and returns the first one
 * that has a c_fromStoreId value set, indicating it's configured for store pickup.
 *
 * @param basket - The shopping basket containing shipments
 * @returns The first shipment with c_fromStoreId set, or undefined if none found
 */
export function getPickupShipment(
    basket: ShopperBasketsV2.schemas['Basket'] | null | undefined
): ShopperBasketsV2.schemas['Shipment'] | undefined {
    return basket?.shipments?.find((shipment) => Boolean(shipment.c_fromStoreId));
}
