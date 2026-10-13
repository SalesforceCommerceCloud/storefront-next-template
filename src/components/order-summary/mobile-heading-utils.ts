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
import type { ShopperBasketsV2, ShopperOrders } from '@/scapi';
import type { useTranslation } from 'react-i18next';

/** Basket or Order – shared shape for order summary item count and heading. */
export type OrderSummaryBasket = ShopperBasketsV2.schemas['Basket'] | ShopperOrders.schemas['Order'];

type CartTranslate = ReturnType<typeof useTranslation<'cart'>>['t'];

/**
 * Returns `true` when shipping or tax totals are still unknown,
 * meaning the order total is an estimate rather than a final figure.
 */
export function isOrderTotalEstimated(basket: OrderSummaryBasket): boolean {
    const shippingKnown = typeof basket.shippingTotal === 'number' && basket.shippingTotal >= 0;
    const taxKnown = basket.taxation === 'gross' || (typeof basket.taxTotal === 'number' && basket.taxTotal >= 0);
    return !shippingKnown || !taxKnown;
}

export function getOrderSummaryItemCount(basket: OrderSummaryBasket): number {
    return basket?.productItems?.reduce((acc, item) => acc + (item.quantity ?? 1), 0) || 0;
}

export function getOrderSummaryMobileHeading(t: CartTranslate, basket: OrderSummaryBasket, isEstimate = true): string {
    const key = isEstimate ? 'summary.mobileHeading' : 'summary.mobileHeadingTotal';
    return t(key, { count: getOrderSummaryItemCount(basket) });
}
