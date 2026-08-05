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

import type { Route } from './+types/action.order-lookup-results-fetch';
import { data } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getLogger } from '@/lib/logger.server';
import { parseOrderNumber, parseEmail } from '@/lib/order/lookup/validation';
import { verifyOrderState, hashOrderNumber, ACCESS_CODE_TTL_SECONDS } from '@/lib/order/session.server';
import { createCookie, getCookieConfig } from '@/lib/cookie-utils.server';
import { getSite } from '@/lib/utils.server';
import { ErrorCode } from '@/lib/error-codes';
import { fetchGuestOrderResult, type FetchGuestOrderResult } from '@/lib/order/fetch-order.server';

const ORDER_STATE_COOKIE_PREFIX = 'glo_order_';

export type FetchOrderResponse = FetchGuestOrderResult;

/**
 * Server action to fetch a guest order using the access code.
 * The access code is never stored server-side — it flows through the form each time.
 *
 * Security defenses:
 * - Per-order state cookie verification (`glo_order_<orderHash>`; requires `verified: true` and
 *   proves the browser earned access to this specific order)
 * - Enumeration defense: INVALID_CODE for both wrong-code and no-such-order
 * - Access code never logged or persisted
 */
export async function action({
    request,
    context,
}: Route.ActionArgs): Promise<ReturnType<typeof data<FetchOrderResponse>>> {
    const logger = getLogger(context);

    if (request.method !== 'POST') {
        return data(
            {
                ok: false,
                code: ErrorCode.METHOD_NOT_ALLOWED,
                message: 'Method not allowed',
            },
            { status: 405 }
        );
    }

    const appConfig = getConfig(context);

    // Feature gate: return 404 if guest order lookup is disabled
    if (!appConfig.guestOrderLookup.enabled) {
        logger.debug('[OrderLookup] Guest order lookup is disabled', { action: 'results-fetch' });
        return data(
            {
                ok: false,
                code: ErrorCode.NOT_FOUND,
                message: 'Not found',
            },
            { status: 404 }
        );
    }

    const { siteId } = getSite(context);

    const formData = await request.formData();
    const orderNumber = formData.get('orderNumber')?.toString();
    const email = formData.get('email')?.toString();

    // Validate order number
    const orderNumberResult = parseOrderNumber(orderNumber);
    if (!orderNumberResult.ok) {
        logger.debug('[OrderLookup] Invalid order number format', {
            action: 'results-fetch',
        });
        return data(
            {
                ok: false,
                code: 'VALIDATION',
                message: 'Invalid order number format',
            },
            { status: 400 }
        );
    }

    const validatedOrderNumber = orderNumberResult.value;
    const orderHash = hashOrderNumber(validatedOrderNumber);

    // Verify the per-order state cookie (`glo_order_<orderHash>`). Scoping the cookie name by
    // order hash means a browser that verified order A and then verified a different order B
    // still holds a valid, independent cookie for order A — the two verifications no longer
    // clobber each other (see action.order-lookup-verify.ts).
    const orderStateCookie = createCookie<string>(
        `${ORDER_STATE_COOKIE_PREFIX}${orderHash}`,
        getCookieConfig({ httpOnly: true, path: '/' }, context),
        context
    );
    const orderStateValue = await orderStateCookie.parse(request.headers.get('cookie'));

    if (!orderStateValue) {
        logger.debug('[OrderLookup] Missing order-state cookie', { action: 'results-fetch' });
        return data(
            {
                ok: false,
                code: ErrorCode.NOT_AUTHORIZED,
                message: 'Unauthorized',
            },
            { status: 401 }
        );
    }

    const orderState = verifyOrderState(orderStateValue, siteId, ACCESS_CODE_TTL_SECONDS);

    if (!orderState || !orderState.verified) {
        logger.debug('[OrderLookup] Invalid, expired, or unverified order state', { action: 'results-fetch' });
        return data(
            {
                ok: false,
                code: ErrorCode.NOT_AUTHORIZED,
                message: 'Unauthorized',
            },
            { status: 401 }
        );
    }

    // Defense-in-depth: the cookie name is already order-scoped, but also check the signed
    // payload's orderNumberHash — guards against a cookie value being copied/replayed under
    // the wrong per-order cookie name.
    if (orderState.orderNumberHash !== orderHash || !orderState.verifiedCode) {
        logger.warn('[OrderLookup] Order state hash mismatch', { action: 'results-fetch' });
        return data(
            {
                ok: false,
                code: ErrorCode.NOT_AUTHORIZED,
                message: 'Unauthorized',
            },
            { status: 401 }
        );
    }

    // Validate email
    const emailResult = parseEmail(email);
    if (!emailResult.ok) {
        logger.debug('[OrderLookup] Invalid email format', {
            action: 'results-fetch',
        });
        return data(
            {
                ok: false,
                code: 'VALIDATION',
                message: 'Invalid email format',
            },
            { status: 400 }
        );
    }

    const validatedEmail = emailResult.value;

    // Use the OTP captured server-side at verification time (`orderState.verifiedCode`), never a
    // client-submitted `code` field — a caller that already holds a verified cookie for this
    // order has no reason to resend the code, and trusting a client-supplied value here would let
    // a caller swap in an arbitrary code once it has *any* verified cookie.
    const result = await fetchGuestOrderResult({
        orderNumber: validatedOrderNumber,
        email: validatedEmail,
        code: orderState.verifiedCode,
        allowedFields: appConfig.guestOrderLookup.allowedFields || [],
        context,
        logger,
        actionName: 'results-fetch',
    });

    if (result.ok) {
        return data(result, { headers: { 'Cache-Control': 'no-store' } });
    }

    return data(result, { status: statusForFetchError(result.code) });
}

function statusForFetchError(code: string): number {
    switch (code) {
        case 'INVALID_CODE':
            return 400;
        case ErrorCode.RATE_LIMITED:
            return 429;
        case ErrorCode.SCAPI_UNSUPPORTED:
            return 501;
        default:
            return 500;
    }
}
