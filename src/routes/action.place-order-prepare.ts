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

import { CommerceContextError } from '@/lib/auth/commerce-context.server';
import { InventoryQuantityError } from '@/scapi';
import { LocalInventoryError } from '@/lib/product/local-inventory.server';
import type { ActionFunctionArgs } from 'react-router';
import { getBasket } from '@/middlewares/basket.server';
// @sfdc-extension-line SFDC_EXT_MULTISHIP
import { resolveEmptyShipments } from '@/extensions/multiship/lib/api/basket.server';
import { getLogger } from '@/lib/logger.server';
import {
    validatePlaceOrderPreconditions,
    calculateBasketForOrder,
    syncPaymentInstrumentAmount,
} from '@/lib/checkout/place-order-orchestration.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';

/**
 * Pre-flight for an extension-driven place-order. Runs the framework's
 * non-payment steps (validate, multiship resolution, calculate) before
 * delegating payment to the extension's `onPlaceOrder` callback.
 *
 * POST -> 200 { success: true } | 400 { success: false, error, step }.
 */
export async function action({ request, context }: ActionFunctionArgs): Promise<Response> {
    const logger = getLogger(context);

    if (request.method !== 'POST') {
        return new Response(null, { status: 405 });
    }

    try {
        const basketResource = await getBasket(context);

        const validation = validatePlaceOrderPreconditions(basketResource.current);
        if (!validation.ok) {
            logger.info('[Checkout] place-order-prepare: validation failed');
            return validation.response;
        }

        // @sfdc-extension-line SFDC_EXT_MULTISHIP
        await resolveEmptyShipments(context, validation.basket);

        const calculatedBasket = await calculateBasketForOrder(context, validation.basket);

        // Bring the payment instrument's amount in lockstep with orderTotal before
        // the extension's onPlaceOrder runs createOrder.
        await syncPaymentInstrumentAmount(context, calculatedBasket);

        logger.info('[Checkout] place-order-prepare: ready for payment', {
            basketId: validation.basket.basketId,
        });
        return Response.json({ success: true });
    } catch (error) {
        logger.error('[Checkout] place-order-prepare: unexpected error', { error });
        const status =
            error instanceof CommerceContextError || error instanceof LocalInventoryError
                ? error.status
                : error instanceof InventoryQuantityError
                  ? 400
                  : 500;
        return Response.json(
            {
                success: false,
                ...(error instanceof CommerceContextError && (error.change ?? { code: error.code })),
                error: createActionError({
                    error,
                    code:
                        error instanceof LocalInventoryError && error.status === 422
                            ? ErrorCode.OUT_OF_STOCK
                            : ErrorCode.OPERATION_FAILED,
                }),
                step: 'placeOrder',
            },
            { status, headers: { 'Cache-Control': 'private, no-store' } }
        );
    }
}
