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

import { useMemo } from 'react';
import type { ShopperBasketsV2 } from '@/scapi';
import { buildDeliveries, hasDeliveryData, useShopperCityId, type Delivery } from '@/lib/delivery-promise';

type Basket = ShopperBasketsV2.schemas['Basket'];

export interface DeliveryLine {
    itemId: string;
    productId: string;
    quantity: number;
}

/** Basket lines that take part in the delivery split: no bonus items, no lines without hub stock data. */
export function toDeliveryLines(items: readonly ShopperBasketsV2.schemas['ProductItem'][] | undefined): DeliveryLine[] {
    const lines: DeliveryLine[] = [];
    for (const item of items ?? []) {
        if (item.bonusProductLineItem || !item.itemId || !item.productId) continue;
        if ((item.quantity ?? 0) <= 0 || !hasDeliveryData(item.productId)) continue;
        lines.push({ itemId: item.itemId, productId: item.productId, quantity: item.quantity ?? 0 });
    }
    return lines;
}

export interface CartDeliveries {
    /** The shopper's selected city, the origin of every distance and date. */
    cityId: string;
    /** One delivery per hub + lead time, in first-seen order. */
    deliveries: Delivery<DeliveryLine>[];
    /** The delivery a basket line ships in (undefined for lines without hub stock data). */
    getDelivery: (itemId: string | undefined) => Delivery<DeliveryLine> | undefined;
}

/**
 * Splits the basket into deliveries with the shared delivery engine, using the selected city and the real
 * basket quantities (so a quantity above hub stock is reflected immediately). Nothing is persisted: the
 * basket is the source of truth and the result is recomputed from it.
 */
export function useCartDeliveries(basket: Basket | undefined | null): CartDeliveries {
    const cityId = useShopperCityId();
    const items = basket?.productItems;
    return useMemo(() => {
        const deliveries = buildDeliveries(toDeliveryLines(items), cityId);
        const byItemId = new Map<string, Delivery<DeliveryLine>>();
        for (const delivery of deliveries) for (const line of delivery.items) byItemId.set(line.itemId, delivery);
        return { cityId, deliveries, getDelivery: (itemId) => (itemId ? byItemId.get(itemId) : undefined) };
    }, [cityId, items]);
}
