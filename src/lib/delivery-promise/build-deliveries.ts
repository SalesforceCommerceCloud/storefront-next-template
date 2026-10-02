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
import { calculateDeliveryDate } from './calculate-delivery-date';
import { generateTrackingNumber } from './tracking';
import type { Delivery, DeliveryLineInput } from './types';

interface BuildDeliveriesOptions {
    today?: Date;
    /** When set, each delivery gets a mock tracking number derived from this seed (e.g. the order number). */
    trackingSeed?: string;
}

/**
 * Split cart lines into deliveries: lines with the same hub, lead time and transit time (hence the same
 * date) form one delivery. Order is first-seen. One SFCC order is still placed.
 */
export function buildDeliveries<T extends DeliveryLineInput>(
    items: readonly T[],
    cityId: string | null | undefined,
    { today, trackingSeed }: BuildDeliveriesOptions = {}
): Delivery<T>[] {
    const deliveries = new Map<string, Delivery<T>>();
    for (const item of items) {
        if (item.quantity <= 0) continue;
        const promise = calculateDeliveryDate({ cityId, productId: item.productId, quantity: item.quantity, today });
        const key = `${promise.locationId}|${promise.leadTimeDays}|${promise.transitDays}`;
        const existing = deliveries.get(key);
        if (existing) {
            existing.items.push(item);
            continue;
        }
        const id = `delivery-${deliveries.size + 1}`;
        deliveries.set(key, {
            id,
            locationId: promise.locationId,
            cityId: promise.cityId,
            city: promise.city,
            leadTimeDays: promise.leadTimeDays,
            transitDays: promise.transitDays,
            distanceKm: promise.distanceKm,
            deliveryDate: promise.deliveryDate,
            inStock: promise.inStock,
            maxAvailableUnits: promise.maxAvailableUnits,
            items: [item],
            ...(trackingSeed
                ? { trackingNumber: generateTrackingNumber(promise.locationId, `${trackingSeed}-${id}`) }
                : {}),
        });
    }
    return [...deliveries.values()];
}
