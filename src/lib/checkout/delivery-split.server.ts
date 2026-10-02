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

import type { ActionFunctionArgs } from 'react-router';
import { ApiError, type ShopperBasketsV2 } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { updateBasketResource } from '@/middlewares/basket.server';
import { getLogger } from '@/lib/logger.server';
import {
    DELIVERY_SPLIT_ATTRIBUTE,
    SHOPPER_CITY_COOKIE,
    buildDeliverySplit,
    getCityById,
    hasDeliveryData,
    serializeDeliverySplit,
} from '@/lib/delivery-promise';

type ActionContext = ActionFunctionArgs['context'];
type Basket = ShopperBasketsV2.schemas['Basket'];

/** The shopper's city from the cookie the city picker writes; `undefined` when absent or unknown. */
export function readShopperCityId(request: Request): string | undefined {
    const header = request.headers.get('Cookie') ?? '';
    for (const part of header.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name !== SHOPPER_CITY_COOKIE) continue;
        try {
            const value = decodeURIComponent(rest.join('='));
            return getCityById(value) ? value : undefined;
        } catch {
            return undefined;
        }
    }
    return undefined;
}

/**
 * Saves the delivery split on the basket as `c_deliverySplit` just before the order is created. SFCC copies basket
 * custom attributes onto the order when it is placed, so order history, the confirmation page and returns can read
 * `order.c_deliverySplit` instead of recalculating it from today's date, stock and the shopper's current city.
 *
 * Best effort by design: a failure here is logged and the basket is returned unchanged, because losing this
 * demo metadata must never block a shopper from paying. Pages fall back to the old calculation for such orders.
 */
export async function saveDeliverySplitToBasket(
    context: ActionContext,
    request: Request,
    basket: Basket & { basketId: string }
): Promise<Basket> {
    const logger = getLogger(context);
    try {
        const lines = (basket.productItems ?? []).flatMap((item) =>
            item.itemId && item.productId && !item.bonusProductLineItem
                ? [{ itemId: item.itemId, productId: item.productId, quantity: item.quantity ?? 1 }]
                : []
        );
        const split = buildDeliverySplit(lines, readShopperCityId(request), {
            // The order number does not exist yet; the basket id is stable for this basket, so a retry reproduces
            // the same tracking numbers.
            trackingSeed: basket.basketId,
            hasDeliveryData,
        });
        if (!split) return basket;

        const { data: updated } = await createApiClients(context).shopperBasketsV2.updateBasket({
            params: { path: { basketId: basket.basketId } },
            body: { [DELIVERY_SPLIT_ATTRIBUTE]: serializeDeliverySplit(split) },
        });
        updateBasketResource(context, updated);
        logger.info('[Checkout] delivery split saved on the basket', {
            basketId: basket.basketId,
            deliveries: split.deliveries.length,
        });
        return updated;
    } catch (error) {
        logger.warn('[Checkout] could not save the delivery split on the basket', {
            basketId: basket.basketId,
            error: error instanceof Error ? error.message : String(error),
            // SCAPI says why in the body, for example that the custom attribute does not exist on the Basket.
            ...(error instanceof ApiError ? { status: error.status, responseBody: error.body } : {}),
        });
        return basket;
    }
}
