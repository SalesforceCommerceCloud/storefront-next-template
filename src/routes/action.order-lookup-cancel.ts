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

import type { Route } from './+types/action.order-lookup-cancel';
import { data } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getLogger } from '@/lib/logger.server';
import { parseOrderNumber, parseEmail } from '@/lib/order/lookup/validation';
import { cancelGuestOrder } from '@/lib/order/scapi.server';
import { redactEmailForLog } from '@/lib/turnstile/log-redact.server';
import { verifyOrderState, hashOrderNumber, ACCESS_CODE_TTL_SECONDS } from '@/lib/order/session.server';
import { createCookie, getCookieConfig } from '@/lib/cookie-utils.server';
import { getSite } from '@/lib/utils.server';
import { ErrorCode } from '@/lib/error-codes';
import { redactOrder } from '@/lib/order/redact';
import { fetchOmsMetaData, type OmsMetaDataResult } from '@/lib/api/order.server';
import type { CancelErrorKind } from '@/lib/order-management/cancel-error';

const ORDER_STATE_COOKIE_PREFIX = 'glo_order_';

type CancelOrderSuccess = {
    success: true;
    order: unknown;
    omsMetaData: OmsMetaDataResult;
};

type CancelOrderError = {
    success: false;
    error: { kind: CancelErrorKind; status: number };
};

export type CancelOrderResponse = CancelOrderSuccess | CancelOrderError;

/** Map a guest `cancelGuestOrder` wire code to the {@link CancelErrorKind} the shared cancel dialog expects. */
function cancelErrorKindFor(code: string): CancelErrorKind {
    switch (code) {
        case 'CANCEL_INVALID_REASON':
            return 'invalid_reason';
        case 'LOOKUP_FAILED':
            return 'not_found';
        case 'CANCEL_CONFLICT':
            return 'not_cancellable';
        default:
            return 'transient';
    }
}

function failure(kind: CancelErrorKind, status: number): ReturnType<typeof data<CancelOrderResponse>> {
    return data({ success: false, error: { kind, status } }, { status });
}

/**
 * Server action to cancel a guest order.
 *
 * Response shape matches the registered-customer `/action/cancel-order` action
 * ({success, error:{kind,status}}) so the guest UI can reuse `CancelOrderDialog` unmodified.
 *
 * Security defenses:
 * - Independently re-verifies the per-order state cookie (`glo_order_<orderHash>`) on every
 *   request — never trusts any client-side state about whether an order is "cancellable".
 * - The cookie name itself is scoped to the order's hash, and the signed payload's
 *   `orderNumberHash` is also checked, preventing access earned for order A from being reused
 *   to cancel order B.
 */
export async function action({
    request,
    context,
}: Route.ActionArgs): Promise<ReturnType<typeof data<CancelOrderResponse>>> {
    const logger = getLogger(context);

    if (request.method !== 'POST') {
        return failure('transient', 405);
    }

    const appConfig = getConfig(context);

    // Feature gate: return 404 if guest order lookup is disabled
    if (!appConfig.guestOrderLookup.enabled) {
        logger.debug('[OrderLookup] Guest order lookup is disabled', { action: 'cancel' });
        return failure('not_found', 404);
    }

    const { siteId } = getSite(context);

    const formData = await request.formData();
    const orderNumber = formData.get('orderNumber')?.toString();
    const email = formData.get('email')?.toString();
    const reason = formData.get('reason')?.toString();

    // Validate order number
    const orderNumberResult = parseOrderNumber(orderNumber);
    if (!orderNumberResult.ok) {
        logger.debug('[OrderLookup] Invalid order number format', {
            action: 'cancel',
        });
        return failure('invalid_input', 400);
    }

    const validatedOrderNumber = orderNumberResult.value;
    const orderHash = hashOrderNumber(validatedOrderNumber);

    // Verify the per-order state cookie (`glo_order_<orderHash>`) — mirrors the same defense used
    // by the results loader.
    const orderStateCookie = createCookie<string>(
        `${ORDER_STATE_COOKIE_PREFIX}${orderHash}`,
        getCookieConfig({ httpOnly: true, path: '/' }, context),
        context
    );
    const orderStateValue = await orderStateCookie.parse(request.headers.get('cookie'));

    if (!orderStateValue) {
        logger.debug('[OrderLookup] Missing order-state cookie', { action: 'cancel' });
        return failure('not_found', 401);
    }

    const orderState = verifyOrderState(orderStateValue, siteId, ACCESS_CODE_TTL_SECONDS);

    if (!orderState || !orderState.verified) {
        logger.debug('[OrderLookup] Invalid, expired, or unverified order state', { action: 'cancel' });
        return failure('not_found', 401);
    }

    // Defense-in-depth: the cookie name is already order-scoped, but also check the signed
    // payload's orderNumberHash — guards against a cookie value being copied/replayed under the
    // wrong per-order cookie name.
    if (orderState.orderNumberHash !== orderHash) {
        logger.warn('[OrderLookup] Order state hash mismatch', { action: 'cancel' });
        return failure('not_found', 401);
    }

    // Validate email
    const emailResult = parseEmail(email);
    if (!emailResult.ok) {
        logger.debug('[OrderLookup] Invalid email format', {
            action: 'cancel',
        });
        return failure('invalid_input', 400);
    }

    const validatedEmail = emailResult.value;

    // Call SCAPI cancelGuestOrder
    try {
        const result = await cancelGuestOrder({
            orderNo: validatedOrderNumber,
            reason,
            context,
        });

        if (result.ok) {
            // Success: redact order to allowed fields
            const allowedFields = appConfig.guestOrderLookup.allowedFields || [];
            const redactedOrder = redactOrder(result.order, allowedFields);
            const omsMetaData = await fetchOmsMetaData(context);

            logger.info('[OrderLookup] Order cancelled successfully', {
                action: 'cancel',
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

        // Error from SCAPI wrapper
        logger.warn('[OrderLookup] Cancel failed', {
            action: 'cancel',
            email: redactEmailForLog(validatedEmail),
            status: result.status,
            code: result.code,
            requestId: result.requestId,
        });

        return failure(cancelErrorKindFor(result.code), result.status);
    } catch (error) {
        // SCAPI_UNSUPPORTED thrown by the wrapper
        if (error && typeof error === 'object' && 'code' in error && error.code === ErrorCode.SCAPI_UNSUPPORTED) {
            logger.warn('[OrderLookup] SCAPI method not supported (requires v26.8+)', {
                action: 'cancel',
            });
            return failure('transient', 501);
        }

        // Unknown error
        logger.error('[OrderLookup] Cancel threw unexpected error', {
            action: 'cancel',
            email: redactEmailForLog(validatedEmail),
            error: error instanceof Error ? error.message : 'unknown',
        });

        return failure('transient', 500);
    }
}
