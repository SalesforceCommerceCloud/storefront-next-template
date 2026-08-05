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

import type { Route } from './+types/action.order-lookup-return';
import { data } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getLogger } from '@/lib/logger.server';
import { parseOrderNumber, parseEmail } from '@/lib/order/lookup/validation';
import { returnGuestOrder } from '@/lib/order/scapi.server';
import type { ReturnProductItem } from '@/lib/order-management/return';
import { redactEmailForLog } from '@/lib/turnstile/log-redact.server';
import { verifyOrderState, hashOrderNumber, ACCESS_CODE_TTL_SECONDS } from '@/lib/order/session.server';
import { createCookie, getCookieConfig } from '@/lib/cookie-utils.server';
import { getSite } from '@/lib/utils.server';
import { ErrorCode } from '@/lib/error-codes';
import { redactOrder } from '@/lib/order/redact';
import { fetchOmsMetaData, type OmsMetaDataResult } from '@/lib/api/order.server';
import type { ReturnErrorKind } from '@/lib/order-management/return-error';

const ORDER_STATE_COOKIE_PREFIX = 'glo_order_';

type ReturnOrderSuccess = {
    success: true;
    order: unknown;
    omsMetaData: OmsMetaDataResult;
};

type ReturnOrderError = {
    success: false;
    error: { kind: ReturnErrorKind; status: number };
};

export type ReturnOrderResponse = ReturnOrderSuccess | ReturnOrderError;

/** Map a guest `returnGuestOrder` wire code to the {@link ReturnErrorKind} the shared return dialog expects. */
function returnErrorKindFor(code: string): ReturnErrorKind {
    switch (code) {
        case 'RETURN_INVALID_REASON':
            return 'invalid_reason';
        case 'RETURN_UNKNOWN_ITEMS':
            return 'unknown_items';
        case 'RETURN_QUANTITY_EXCEEDED':
            return 'quantity_exceeded';
        case 'LOOKUP_FAILED':
            return 'not_found';
        case 'RETURN_CONFLICT':
            return 'not_returnable';
        default:
            return 'transient';
    }
}

function failure(kind: ReturnErrorKind, status: number): ReturnType<typeof data<ReturnOrderResponse>> {
    return data({ success: false, error: { kind, status } }, { status });
}

/**
 * Server action to return one or more items of a guest order.
 *
 * Response shape matches the registered-customer `/action/return-order` action
 * ({success, error:{kind,status}}) so the guest UI can reuse `ReturnOrderDialog` unmodified.
 *
 * Security defenses:
 * - Independently re-verifies the per-order state cookie (`glo_order_<orderHash>`) on every
 *   request — never trusts any client-side state about whether an order/item is "returnable".
 * - The cookie name itself is scoped to the order's hash, and the signed payload's
 *   `orderNumberHash` is also checked, preventing access earned for order A from being reused
 *   to return items on order B.
 */
export async function action({
    request,
    context,
}: Route.ActionArgs): Promise<ReturnType<typeof data<ReturnOrderResponse>>> {
    const logger = getLogger(context);

    if (request.method !== 'POST') {
        return failure('transient', 405);
    }

    const appConfig = getConfig(context);

    // Feature gate: return 404 if guest order lookup is disabled
    if (!appConfig.guestOrderLookup.enabled) {
        logger.debug('[OrderLookup] Guest order lookup is disabled', { action: 'return' });
        return failure('not_found', 404);
    }

    const { siteId } = getSite(context);

    const formData = await request.formData();
    const orderNumber = formData.get('orderNumber')?.toString();
    const email = formData.get('email')?.toString();
    const rawProductItems = formData.get('productItems')?.toString();

    // Validate order number
    const orderNumberResult = parseOrderNumber(orderNumber);
    if (!orderNumberResult.ok) {
        logger.debug('[OrderLookup] Invalid order number format', {
            action: 'return',
        });
        return failure('invalid_input', 400);
    }

    const validatedOrderNumber = orderNumberResult.value;
    const orderHash = hashOrderNumber(validatedOrderNumber);

    // Verify the per-order state cookie (`glo_order_<orderHash>`) — mirrors the same defense used
    // by action.order-lookup-results-fetch.ts.
    const orderStateCookie = createCookie<string>(
        `${ORDER_STATE_COOKIE_PREFIX}${orderHash}`,
        getCookieConfig({ httpOnly: true, path: '/' }, context),
        context
    );
    const orderStateValue = await orderStateCookie.parse(request.headers.get('cookie'));

    if (!orderStateValue) {
        logger.debug('[OrderLookup] Missing order-state cookie', { action: 'return' });
        return failure('not_found', 401);
    }

    const orderState = verifyOrderState(orderStateValue, siteId, ACCESS_CODE_TTL_SECONDS);

    if (!orderState || !orderState.verified) {
        logger.debug('[OrderLookup] Invalid, expired, or unverified order state', { action: 'return' });
        return failure('not_found', 401);
    }

    // Defense-in-depth: the cookie name is already order-scoped, but also check the signed
    // payload's orderNumberHash — guards against a cookie value being copied/replayed under the
    // wrong per-order cookie name.
    if (orderState.orderNumberHash !== orderHash) {
        logger.warn('[OrderLookup] Order state hash mismatch', { action: 'return' });
        return failure('not_found', 401);
    }

    // Validate email
    const emailResult = parseEmail(email);
    if (!emailResult.ok) {
        logger.debug('[OrderLookup] Invalid email format', {
            action: 'return',
        });
        return failure('invalid_input', 400);
    }

    const validatedEmail = emailResult.value;

    // productItems arrives as a JSON string. Parse defensively: a throw, a
    // non-array, or an empty array is malformed local input, rejected before the
    // SCAPI call (OmsReturnOrderRequest requires productItems with minItems: 1).
    let parsed: unknown;
    try {
        parsed = rawProductItems ? JSON.parse(rawProductItems) : undefined;
    } catch {
        logger.debug('[OrderLookup] productItems is not valid JSON', { action: 'return' });
        return failure('invalid_input', 400);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
        logger.debug('[OrderLookup] productItems is not a non-empty array', { action: 'return' });
        return failure('invalid_input', 400);
    }

    // Coerce and validate each row — same shape check as the registered-customer return action.
    const productItems: ReturnProductItem[] = [];
    for (const item of parsed) {
        const { itemId, quantity, reason } = item as { itemId?: unknown; quantity?: unknown; reason?: unknown };
        const qty = Number(quantity);
        if (typeof itemId !== 'string' || !itemId || !Number.isFinite(qty) || qty <= 0) {
            logger.debug('[OrderLookup] productItems has an item with an invalid itemId or quantity', {
                action: 'return',
            });
            return failure('invalid_input', 400);
        }
        productItems.push({
            itemId,
            quantity: qty,
            ...(typeof reason === 'string' && reason ? { reason } : {}),
        });
    }

    // Call SCAPI returnGuestOrder
    try {
        const result = await returnGuestOrder({
            orderNo: validatedOrderNumber,
            productItems,
            context,
        });

        if (result.ok) {
            // Success: redact order to allowed fields
            const allowedFields = appConfig.guestOrderLookup.allowedFields || [];
            const redactedOrder = redactOrder(result.order, allowedFields);
            const omsMetaData = await fetchOmsMetaData(context);

            logger.info('[OrderLookup] Order returned successfully', {
                action: 'return',
                email: redactEmailForLog(validatedEmail),
            });

            return data(
                { success: true, order: redactedOrder, omsMetaData },
                {
                    headers: {
                        'Cache-Control': 'no-store',
                    },
                }
            );
        }

        // Error from SCAPI wrapper — map to the same classification the registered-customer flow uses.
        logger.warn('[OrderLookup] Return failed', {
            action: 'return',
            email: redactEmailForLog(validatedEmail),
            status: result.status,
            code: result.code,
            requestId: result.requestId,
        });

        return failure(returnErrorKindFor(result.code), result.status);
    } catch (error) {
        // SCAPI_UNSUPPORTED thrown by the wrapper
        if (error && typeof error === 'object' && 'code' in error && error.code === ErrorCode.SCAPI_UNSUPPORTED) {
            logger.warn('[OrderLookup] SCAPI method not supported (requires v26.8+)', {
                action: 'return',
            });
            return failure('transient', 501);
        }

        // Unknown error
        logger.error('[OrderLookup] Return threw unexpected error', {
            action: 'return',
            email: redactEmailForLog(validatedEmail),
            error: error instanceof Error ? error.message : 'unknown',
        });

        return failure('transient', 500);
    }
}
