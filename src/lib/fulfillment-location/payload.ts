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
import type { CartFulfillmentItem, FulfillmentPayload } from './types';

/** Convert resolved cart items into the payload sent to SCAPI when the order is placed. */
export function buildFulfillmentPayload(orderId: string, items: readonly CartFulfillmentItem[]): FulfillmentPayload {
    return {
        orderId,
        items: items.map((item) => ({
            productId: item.productId,
            sku: item.sku,
            quantity: item.quantity,
            fulfillment: { ...item.fulfillment },
        })),
    };
}

/**
 * Basket line item custom attributes (`c_*`) that carry the fulfillment context through the basket
 * lifecycle. They must be defined on the ProductLineItem system object in Business Manager first.
 */
export function toBasketLineCustomAttributes(item: CartFulfillmentItem): Record<string, string | number | null> {
    const { fulfillment } = item;
    return {
        c_fulfillmentLocationId: fulfillment.locationId,
        c_fulfillmentCity: fulfillment.city,
        c_fulfillmentPostalCode: fulfillment.postalCode,
        c_fulfillmentStockLevel: fulfillment.stockLevel,
        c_fulfillmentDistance: fulfillment.distance,
        c_fulfillmentDistanceUnit: fulfillment.distanceUnit,
        c_fulfillmentLeadTime: fulfillment.leadTime,
        c_fulfillmentLeadTimeUnit: fulfillment.leadTimeUnit,
    };
}
