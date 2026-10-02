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
import { useEffect, useMemo } from 'react';
import type { ShopperBasketsV2 } from '@/scapi';
import {
    groupByLocation,
    reconcileWithBasket,
    resolveCartItems,
    updateCartFulfillmentState,
    useCartFulfillmentState,
    type BasketLine,
    type CartFulfillmentItem,
    type DeliveryGroup,
} from '@/lib/fulfillment-location';

type Basket = ShopperBasketsV2.schemas['Basket'];

export function toBasketLines(basket: Basket | undefined | null): BasketLine[] | undefined {
    if (!basket?.productItems) return undefined;
    return basket.productItems
        .filter((item) => !item.bonusProductLineItem)
        .map((item) => ({
            productId: item.productId ?? '',
            productName: item.productName ?? '',
            quantity: item.quantity ?? 0,
        }));
}

export interface FulfillmentSplit {
    /** One section per fulfillment city, in first-seen order. */
    groups: DeliveryGroup[];
    /** Fulfillment data for a basket product id (undefined for products without fulfillment data). */
    getItem: (productId: string | undefined) => CartFulfillmentItem | undefined;
}

/**
 * Splits the basket by fulfillment city and keeps the stored JSON in sync with the basket. The basket
 * decides which products/quantities exist; nothing is written until the basket has loaded.
 */
export function useFulfillmentSplit(basket: Basket | undefined | null): FulfillmentSplit {
    const state = useCartFulfillmentState();
    const lines = useMemo(() => toBasketLines(basket), [basket]);
    const items = useMemo(() => resolveCartItems(lines ?? [], state), [lines, state]);
    const groups = useMemo(() => groupByLocation(items), [items]);

    useEffect(() => {
        if (!lines) return;
        updateCartFulfillmentState((current) => reconcileWithBasket(current, lines));
    }, [lines]);

    return useMemo(() => {
        const byProductId = new Map(items.map((item) => [item.productId, item]));
        return { groups, getItem: (productId) => (productId ? byProductId.get(productId) : undefined) };
    }, [groups, items]);
}
