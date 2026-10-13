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

/**
 * Shared pickup/BOPIS shipping method detection.
 * Used by both the bopis extension and shipping-delivery extension.
 */

import type { ShopperBasketsV2 } from '@/scapi';

export const PICKUP_SHIPPING_METHOD_ID = '005';

/**
 * Structural type for shipping methods compatible with pickup detection.
 * Both ShopperBasketsV2 ShippingMethod and ShopperProducts ProductShippingMethod satisfy this.
 */
export type PickupCompatibleShippingMethod = {
    id?: string;
    c_storePickupEnabled?: boolean;
};

/**
 * Returns true if the shipping method is a pickup method.
 * Uses c_storePickupEnabled === true when set; falls back to id PICKUP_SHIPPING_METHOD_ID ('005').
 * When pickupCurrencies is provided, also recognizes currency-suffixed variants that match the site's
 * supported currencies (e.g., `005-usd`, `005-gbp` for a site with ['USD', 'GBP']).
 *
 * @param method - Shipping method to test (any shape with id and/or c_storePickupEnabled)
 * @param opts - Options object
 * @param opts.pickupCurrencies - Site's supported currencies; when provided, match currency-suffixed pickup IDs
 */
export function isPickupShippingMethod(
    method: PickupCompatibleShippingMethod,
    opts: { pickupCurrencies?: string[] } = {}
): boolean {
    if (method.c_storePickupEnabled === true) return true;
    if (method.id === PICKUP_SHIPPING_METHOD_ID) return true; // legacy exact match (always)
    if (opts.pickupCurrencies?.some((c) => method.id === `${PICKUP_SHIPPING_METHOD_ID}-${c.toLowerCase()}`))
        return true;
    return false;
}

/**
 * Resolves the pickup shipping method ID from the API response.
 * Returns the id of the first applicable method that is a pickup method (c_storePickupEnabled or id '005').
 * When pickupCurrencies is provided, also recognizes currency-suffixed variants (`005-usd`, `005-gbp`).
 *
 * @param shippingMethodResult - Shipping method result from SCAPI
 * @param opts - Options object
 * @param opts.pickupCurrencies - Site's supported currencies; enables currency-suffixed ID matching
 * @returns The pickup method id, or null if no pickup method found
 */
export function getPickupShippingMethodId(
    shippingMethodResult: ShopperBasketsV2.schemas['ShippingMethodResult'] | null | undefined,
    opts: { pickupCurrencies?: string[] } = {}
): string | null {
    const methods = shippingMethodResult?.applicableShippingMethods;
    if (!methods?.length) return null;

    const pickupMethod = methods.find((m) => isPickupShippingMethod(m, opts));
    return pickupMethod?.id ?? null;
}
