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

import type { ShopperBasketsV2 } from '@/scapi';
import { getAddressKey } from '@/lib/address/address-utils';

/**
 * Return type for multi-shipment distribution analysis functions.
 */
export type MultiShipmentDistribution = {
    /** `true` if there are any delivery items */
    hasDeliveryItems: boolean;
    /** `true` if there are more than one product items (productItems.length > 1) */
    enableMultiAddress: boolean;
    /** `true` if there are more than one unique delivery addresses */
    hasMultipleDeliveryAddresses: boolean;
    /** `true` if there are delivery shipments with items but no shipping address */
    hasUnaddressedDeliveryItems: boolean;
    /** `true` if any non-empty delivery shipment has a falsey shippingMethod */
    needsShippingMethods: boolean;
    /** `true` if there are any shipments with no items assigned */
    hasEmptyShipments: boolean;
    /** Array of non-empty delivery shipments */
    deliveryShipments: ShopperBasketsV2.schemas['Shipment'][];
};

/**
 * Determines the shopper's current delivery shipment preferences,
 * especially for the purpose of determining the proper checkout flow.
 *
 * This function analyzes the basket's shipments and product items to determine:
 * - Whether there are more than one product items (enables multi-address checkout)
 * - Whether there are more than one unique delivery addresses
 * - Whether there are delivery shipments with items but no shipping address
 * - Whether there are any shipments with no items assigned
 *
 * Empty shipments (shipments with no assigned items) are always excluded from all
 * distribution flags except `hasEmptyShipments`. This ensures that empty shipments
 * do not affect address checks.
 *
 * @param basket - The shopping basket containing shipments and product items
 * @returns Object containing flags for delivery distribution:
 *   - enableMultiAddress: true if there are more than one product items (productItems.length > 1)
 *   - hasMultipleDeliveryAddresses: true if there are more than one unique delivery addresses
 *   - hasUnaddressedDeliveryItems: true if there are delivery shipments with items but no shipping address
 *   - needsShippingMethods: true if any non-empty delivery shipment has a falsey shippingMethod
 *   - hasEmptyShipments: true if there are any shipments with no items assigned
 *   - deliveryShipments: array of non-empty delivery shipments
 *
 * @example
 * ```tsx
 * const basket = (await getBasket(context)).current;
 * const distribution = getMultiShipmentDistribution(basket);
 *
 * if (distribution.hasMultipleDeliveryAddresses) {
 *   // Multiple addresses - show multiship checkout flow
 * } else {
 *   // Single delivery - show standard checkout flow
 * }
 * ```
 */
export function getMultiShipmentDistribution(basket?: ShopperBasketsV2.schemas['Basket']): MultiShipmentDistribution {
    // Early return if basket is invalid
    if (!basket?.shipments || !basket.productItems) {
        return {
            hasDeliveryItems: false,
            enableMultiAddress: false,
            hasMultipleDeliveryAddresses: false,
            hasUnaddressedDeliveryItems: false,
            needsShippingMethods: false,
            hasEmptyShipments: basket?.shipments ? basket.shipments.length > 0 : false,
            deliveryShipments: [],
        };
    }

    // Build a map of shipmentId -> item count for efficient lookups
    const shipmentItemCounts = new Map<string, number>();
    basket.productItems.forEach((item) => {
        if (item.shipmentId) {
            shipmentItemCounts.set(item.shipmentId, (shipmentItemCounts.get(item.shipmentId) || 0) + 1);
        }
    });

    // Always exclude empty shipments from all flags except hasEmptyShipments
    // Empty shipments should not affect delivery distribution calculations
    const deliveryShipments = basket.shipments.filter((shipment) => {
        if (!shipment.shipmentId || shipment.c_fromStoreId) return false;
        // Only include shipments that have at least one item assigned
        return (shipmentItemCounts.get(shipment.shipmentId) || 0) > 0;
    });

    // Check if we can use multiple delivery shipments
    const enableMultiAddress = basket.productItems.length > 1;

    // Check for multiple unique delivery addresses
    // Use address keys for efficient O(1) duplicate detection
    const uniqueAddressKeys = new Set<string>();
    deliveryShipments.forEach((shipment) => {
        if (!shipment.shippingAddress) return;
        const addressKey = getAddressKey(shipment.shippingAddress);
        uniqueAddressKeys.add(addressKey);
    });

    const hasMultipleDeliveryAddresses = uniqueAddressKeys.size > 1;

    // Check for unaddressed delivery items (delivery shipments with items but no address)
    const hasUnaddressedDeliveryItems = deliveryShipments.some((shipment) => {
        const itemCount = shipmentItemCounts.get(shipment.shipmentId || '') || 0;
        return itemCount > 0 && !shipment.shippingAddress;
    });

    // Check if any non-empty delivery shipment needs a shipping method
    const needsShippingMethods = deliveryShipments.some((shipment) => !shipment.shippingMethod);

    // Check for empty shipments (any shipment with no items assigned)
    const hasEmptyShipments = basket.shipments.some((shipment) => {
        if (!shipment.shipmentId) return false;
        return (shipmentItemCounts.get(shipment.shipmentId) || 0) === 0;
    });

    return {
        hasDeliveryItems: deliveryShipments.length > 0,
        enableMultiAddress,
        hasMultipleDeliveryAddresses,
        hasUnaddressedDeliveryItems,
        needsShippingMethods,
        hasEmptyShipments,
        deliveryShipments,
    };
}
