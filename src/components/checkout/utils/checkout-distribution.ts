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
import { isAddressEmpty } from '@/lib/address/address-utils';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import {
    getPickupShipmentDistribution,
    type PickupShipmentDistribution,
} from '@/extensions/bopis/lib/checkout-distribution';
// @sfdc-extension-block-end SFDC_EXT_BOPIS
// @sfdc-extension-block-start SFDC_EXT_MULTISHIP
import {
    getMultiShipmentDistribution,
    type MultiShipmentDistribution,
} from '@/extensions/multiship/lib/checkout-distribution';
// @sfdc-extension-block-end SFDC_EXT_MULTISHIP

/**
 * Return type for single shipment distribution analysis functions.
 */
export type SingleShipmentDistribution = {
    /** `true` if there are product items but the first shipment has no valid shipping address (empty or missing) */
    hasUnaddressedDeliveryItems: boolean;
    /** `true` if the first shipment exists, has items, and has a falsey shippingMethod */
    needsShippingMethods: boolean;
    /** `true` if the first shipment exists but there are no product items */
    hasEmptyShipments: boolean;
    /** Array containing the first shipment if it exists and has items (address can be empty), otherwise an empty array */
    deliveryShipments: ShopperBasketsV2.schemas['Shipment'][];
};

/**
 * Determines the shopper's current delivery shipment preferences for a single shipment checkout flow.
 *
 * This function assumes there is only one shipment (shipments[0]) and that all product items
 * belong to it. It analyzes the basket to determine:
 * - Whether there are delivery items but no valid shipping address (using isAddressEmpty)
 * - Whether the first shipment exists but has no items assigned
 *
 * Empty addresses are detected using {@link isAddressEmpty}, which checks if an address
 * has meaningful content (not just null/undefined, but also empty address fields).
 *
 * @param basket - The shopping basket containing shipments and product items
 * @returns Object containing flags for delivery distribution:
 *   - `hasUnaddressedDeliveryItems`: `true` if there are product items but the first shipment
 *     has no valid shipping address (empty or missing)
 *   - `needsShippingMethods`: `true` if the first shipment exists, has items, and has a falsey shippingMethod
 *   - `hasEmptyShipments`: `true` if the first shipment exists but there are no product items
 *   - `deliveryShipments`: Array containing the first shipment if it exists and has items
 *     (address can be empty), otherwise an empty array
 *
 * @example
 * ```tsx
 * const basket = (await getBasket(context)).current;
 * const distribution = getSingleShipmentDistribution(basket);
 *
 * if (distribution.hasUnaddressedDeliveryItems) {
 *   // Show address form - items exist but no valid address
 * } else if (distribution.deliveryShipments.length > 0) {
 *   // Proceed with checkout - shipment has items (address may be empty)
 * }
 * ```
 */
export function getSingleShipmentDistribution(basket?: ShopperBasketsV2.schemas['Basket']): SingleShipmentDistribution {
    // Early return if basket is invalid
    if (!basket?.shipments || !basket.productItems) {
        return {
            hasUnaddressedDeliveryItems: false,
            needsShippingMethods: false,
            hasEmptyShipments: basket?.shipments ? basket.shipments.length > 0 : false,
            deliveryShipments: [],
        };
    }

    // Assume there is only one shipment (shipments[0]) and all items are in it
    const firstShipment = basket.shipments[0];
    const hasItems = basket.productItems.length > 0;

    // Check if there are items but no shipping address on the first shipment
    const hasUnaddressedDeliveryItems = !!(hasItems && firstShipment && isAddressEmpty(firstShipment.shippingAddress));

    // Check if the first shipment exists, has items, and needs a shipping method
    const needsShippingMethods = !!(hasItems && firstShipment && !firstShipment.shippingMethod);

    // Check if the first shipment exists but has no items assigned
    const hasEmptyShipments = !!firstShipment && !hasItems;

    // Return the first shipment if it exists and has items (address can be empty)
    const deliveryShipments = firstShipment && hasItems ? [firstShipment] : [];

    return {
        hasUnaddressedDeliveryItems,
        needsShippingMethods,
        hasEmptyShipments,
        deliveryShipments,
    };
}

/**
 * Return type for shipment distribution analysis functions.
 * Structured such that the type varies based on the extensions installed.
 */
// biome-ignore format: each intersection member stays on its own line so @sfdc-extension-line stripping removes whole members cleanly
export type ShipmentDistribution = SingleShipmentDistribution &
    // @sfdc-extension-line SFDC_EXT_BOPIS
    PickupShipmentDistribution &
    // @sfdc-extension-line SFDC_EXT_MULTISHIP
    MultiShipmentDistribution &
    // empty object to satisfy the type
    {};

/**
 * Determines the shopper's current delivery shipment preferences.
 *
 * This is a convenience wrapper that provides a generic function name for shipment distribution analysis.
 *
 * @param basket - The shopping basket containing shipments and product items
 * @returns Object containing flags for delivery distribution
 *
 * @example
 * ```tsx
 * const basket = (await getBasket(context)).current;
 * const distribution = getShipmentDistribution(basket);
 *
 * if (distribution.hasUnaddressedDeliveryItems) {
 *   // Show address form
 * }
 * ```
 */
export function getShipmentDistribution(basket?: ShopperBasketsV2.schemas['Basket']): ShipmentDistribution {
    // single distribution is trivial to compute so we do it even if we will discard it
    let result: ShipmentDistribution = getSingleShipmentDistribution(basket) as ShipmentDistribution;
    // now a series of overrides from whatever extensions are installed.
    // these are more complex to compute so we just do one.
    let assigned = false;
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    if (!assigned) {
        result = getPickupShipmentDistribution(basket);
        assigned = true;
    }
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    // @sfdc-extension-block-start SFDC_EXT_MULTISHIP
    if (!assigned) {
        result = getMultiShipmentDistribution(basket) as ShipmentDistribution;
        assigned = true;
    }
    // @sfdc-extension-block-end SFDC_EXT_MULTISHIP
    return result;
}
