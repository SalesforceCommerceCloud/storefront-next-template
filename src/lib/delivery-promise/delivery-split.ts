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

import { buildDeliveries } from './build-deliveries';
import { resolveCity } from './city-management';

/**
 * The delivery split saved on the order as `c_deliverySplit`, so order pages show what was promised at checkout instead
 * of recalculating it from today's date, today's stock and the shopper's current city.
 *
 * Stored as versioned JSON in a Text attribute. The shape is a contract with the Business Manager attribute and any
 * server code that reads it, so change it only by bumping `version` and keeping a reader for the old one.
 */
export const DELIVERY_SPLIT_ATTRIBUTE = 'c_deliverySplit';
export const DELIVERY_SPLIT_VERSION = 1;

export interface DeliverySplitItem {
    /** Order line item id. Basket line ids are kept on the order, so the same id is valid on both. */
    itemId: string;
    productId: string;
    quantity: number;
}

export interface SavedDelivery {
    /** `D1`, `D2`, ... in first-seen order. */
    id: string;
    hubId: string;
    /** City of the hub the delivery ships from. */
    city: string;
    distanceKm: number;
    /** Total days from the order: hub handling plus transit. */
    leadTimeDays: number;
    /** `YYYY-MM-DD`. The start of the return window. */
    deliveryDate: string;
    trackingNumber?: string;
    items: DeliverySplitItem[];
}

export interface DeliverySplit {
    version: typeof DELIVERY_SPLIT_VERSION;
    shopperCityId: string;
    deliveries: SavedDelivery[];
}

/**
 * Builds the split for a set of order lines. Lines without hub stock data have no delivery promise and are skipped,
 * exactly as the order confirmation already does. Returns `null` when nothing is left to split.
 *
 * `trackingSeed` must be stable for the order (the basket id works: the order number does not exist yet), so the
 * tracking numbers saved now are the ones shown later.
 */
export function buildDeliverySplit(
    lines: readonly DeliverySplitItem[],
    shopperCityId: string | null | undefined,
    options: { today?: Date; trackingSeed: string; hasDeliveryData: (productId: string) => boolean }
): DeliverySplit | null {
    const eligible = lines.filter((line) => options.hasDeliveryData(line.productId));
    if (eligible.length === 0) return null;

    const city = resolveCity(shopperCityId);
    const deliveries = buildDeliveries(eligible, city.id, { today: options.today, trackingSeed: options.trackingSeed });

    return {
        version: DELIVERY_SPLIT_VERSION,
        shopperCityId: city.id,
        deliveries: deliveries.map((delivery, index) => ({
            id: `D${index + 1}`,
            hubId: delivery.locationId,
            city: delivery.city,
            distanceKm: delivery.distanceKm,
            leadTimeDays: delivery.leadTimeDays + delivery.transitDays,
            deliveryDate: delivery.deliveryDate,
            ...(delivery.trackingNumber ? { trackingNumber: delivery.trackingNumber } : {}),
            items: delivery.items.map(({ itemId, productId, quantity }) => ({ itemId, productId, quantity })),
        })),
    };
}

export function serializeDeliverySplit(split: DeliverySplit): string {
    return JSON.stringify(split);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

function parseItem(value: unknown): DeliverySplitItem | null {
    if (!isRecord(value)) return null;
    const { itemId, productId, quantity } = value;
    if (typeof itemId !== 'string' || !itemId || typeof productId !== 'string' || !productId) return null;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) return null;
    return { itemId, productId, quantity };
}

function parseDelivery(value: unknown): SavedDelivery | null {
    if (!isRecord(value)) return null;
    const { id, hubId, city, distanceKm, leadTimeDays, deliveryDate, trackingNumber, items } = value;
    if (typeof id !== 'string' || !id || typeof hubId !== 'string' || typeof city !== 'string') return null;
    if (typeof distanceKm !== 'number' || typeof leadTimeDays !== 'number' || !isDate(deliveryDate)) return null;
    if (!Array.isArray(items)) return null;
    const parsedItems = items.map(parseItem);
    if (parsedItems.some((item) => item === null)) return null;
    return {
        id,
        hubId,
        city,
        distanceKm,
        leadTimeDays,
        deliveryDate,
        ...(typeof trackingNumber === 'string' && trackingNumber ? { trackingNumber } : {}),
        items: parsedItems as DeliverySplitItem[],
    };
}

/**
 * Reads `order.c_deliverySplit`. Accepts the raw JSON string (what SFCC stores) or an already parsed object.
 * Returns `null` for a missing, malformed or unknown-version value, so callers fall back to the old behaviour
 * (orders placed before this change have no split) instead of crashing the page.
 */
export function parseDeliverySplit(raw: unknown): DeliverySplit | null {
    let value: unknown = raw;
    if (typeof raw === 'string') {
        if (!raw.trim()) return null;
        try {
            value = JSON.parse(raw);
        } catch {
            return null;
        }
    }
    if (!isRecord(value) || value.version !== DELIVERY_SPLIT_VERSION) return null;
    if (typeof value.shopperCityId !== 'string' || !Array.isArray(value.deliveries)) return null;

    const deliveries = value.deliveries.map(parseDelivery);
    if (deliveries.length === 0 || deliveries.some((delivery) => delivery === null)) return null;
    return {
        version: DELIVERY_SPLIT_VERSION,
        shopperCityId: value.shopperCityId,
        deliveries: deliveries as SavedDelivery[],
    };
}

/** Finds the saved delivery that holds an order line. */
export function findDeliveryForItem(
    split: DeliverySplit | null | undefined,
    itemId: string
): SavedDelivery | undefined {
    return split?.deliveries.find((delivery) => delivery.items.some((item) => item.itemId === itemId));
}
