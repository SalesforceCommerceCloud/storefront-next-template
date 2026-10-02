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

import type { ShopperOrders, ShopperProducts } from '@/scapi';
import { findImageGroupBy } from '@/lib/product/image-groups-utils';
import { findDeliveryForItem, parseDeliverySplit } from '@/lib/delivery-promise';
import type { ReturnableLine } from './types';

type Order = ShopperOrders.schemas['Order'];
type Product = ShopperProducts.schemas['Product'];

/**
 * Turns a SCAPI order plus its product data into the plain lines the return screens use. Pure, so it is unit-testable
 * and the loader stays a thin fetch.
 *
 * Deliveries and the return window come from the split saved on the order at checkout (`c_deliverySplit`): a line is
 * grouped under its delivery, and its 30-day window starts on that delivery's date. For orders placed before the split
 * was saved, lines keep the old behaviour: grouped by SFCC shipment, window counted from the latest OMS
 * `actualDeliveryDate`, or from the order creation date when there is none.
 */

/** Master product ids the exchange picker needs, so the loader can fetch their variants in one call. */
export function collectMasterIds(order: Order, productsById: Record<string, Product | undefined>): string[] {
    const ids = new Set<string>();
    for (const item of order.productItems ?? []) {
        const masterId = item.productId ? productsById[item.productId]?.master?.masterId : undefined;
        if (masterId) ids.add(masterId);
    }
    return Array.from(ids);
}

export function getOrderDeliveredAt(order: Order): string | undefined {
    const shipments = (order.omsData as { shipments?: { actualDeliveryDate?: string }[] } | undefined)?.shipments ?? [];
    let latest: number | undefined;
    for (const shipment of shipments) {
        const time = shipment.actualDeliveryDate ? new Date(shipment.actualDeliveryDate).getTime() : Number.NaN;
        if (!Number.isNaN(time) && (latest === undefined || time > latest)) latest = time;
    }
    if (latest !== undefined) return new Date(latest).toISOString();
    return order.creationDate ? new Date(order.creationDate).toISOString() : undefined;
}

export function buildReturnableLines(
    order: Order,
    productsById: Record<string, Product | undefined>,
    mastersById: Record<string, Product | undefined>
): ReturnableLine[] {
    const deliveredAt = getOrderDeliveredAt(order);
    const split = parseDeliverySplit((order as { c_deliverySplit?: unknown }).c_deliverySplit);

    return (order.productItems ?? []).flatMap((item, index): ReturnableLine[] => {
        // A line without a product id cannot be matched to a SKU rule, so it is left out rather than guessed at.
        if (!item.productId) return [];

        const product = productsById[item.productId];
        const master = product?.master?.masterId ? mastersById[product.master.masterId] : undefined;
        const image = findImageGroupBy(product?.imageGroups, { viewType: 'small' })?.images?.[0];

        const lineKey = item.itemId ?? `${item.productId}-${index}`;
        // A line the split does not mention (no hub data, or a bonus item) falls back to the order-level values.
        const delivery = item.itemId ? findDeliveryForItem(split, item.itemId) : undefined;

        return [
            {
                lineKey,
                sku: item.productId,
                name: (product?.name ?? item.productName)?.trim() || item.productId,
                imageUrl: image?.disBaseLink ?? image?.link,
                quantity: item.quantity ?? 1,
                categoryId: product?.primaryCategoryId ?? master?.primaryCategoryId,
                deliveryId: delivery?.id ?? item.shipmentId ?? 'default',
                deliveryCity: delivery?.city,
                deliveredAt: delivery?.deliveryDate ?? deliveredAt,
                variationValues: { ...(product?.variationValues ?? {}) } as Record<string, string>,
                variationAttributes: (master?.variationAttributes ?? []).map((attribute) => ({
                    id: attribute.id,
                    name: attribute.name ?? attribute.id,
                    values: (attribute.values ?? []).map((value) => ({
                        value: value.value,
                        name: value.name ?? value.value,
                    })),
                })),
                variants: (master?.variants ?? []).map((variant) => ({
                    sku: variant.productId,
                    variationValues: { ...(variant.variationValues ?? {}) } as Record<string, string>,
                    orderable: variant.orderable !== false,
                })),
            },
        ];
    });
}
