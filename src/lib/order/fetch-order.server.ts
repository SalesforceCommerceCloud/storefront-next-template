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

import type { RouterContextProvider } from 'react-router';
import { guestOrderLookup } from './scapi.server';
import { redactOrder } from './redact';
import {
    fetchGuestOrderProducts,
    fetchOmsMetaData,
    type OmsMetaDataResult,
    type OrderProductDataById,
} from '@/lib/api/order.server';
import { redactEmailForLog } from '@/lib/turnstile/log-redact.server';
import { ErrorCode } from '@/lib/error-codes';
import type { Logger } from '@/lib/logger';

export type FetchGuestOrderSuccess = {
    ok: true;
    order: unknown;
    omsMetaData: OmsMetaDataResult;
    productsById: OrderProductDataById;
};

export type FetchGuestOrderError = {
    ok: false;
    code: string;
    message?: string;
    retryAfterSeconds?: number;
};

export type FetchGuestOrderResult = FetchGuestOrderSuccess | FetchGuestOrderError;

/**
 * Calls SCAPI's guest order lookup, redacts the result to `allowedFields`, and fetches product
 * data for the redacted `productItems` only. Used by the results loader
 * (`_app.order-lookup.results.$orderNo.tsx`) to auto-fetch an already-verified order — the access
 * code is only ever handed to SCAPI server-side and never round-tripped back to the client.
 */
export async function fetchGuestOrderResult({
    orderNumber,
    email,
    code,
    allowedFields,
    context,
    logger,
    actionName,
}: {
    orderNumber: string;
    email: string;
    code: string;
    allowedFields: string[];
    context: Readonly<RouterContextProvider>;
    logger: Logger;
    actionName: string;
}): Promise<FetchGuestOrderResult> {
    try {
        const result = await guestOrderLookup({ orderNo: orderNumber, email, accessCode: code, context });

        if ('ok' in result && result.ok) {
            const redactedOrder = redactOrder(result.order, allowedFields);

            logger.info('[OrderLookup] Order fetched successfully', {
                action: actionName,
                email: redactEmailForLog(email),
            });

            // Fetch product data (images, variations) only for productItems that survived
            // redaction — never for the raw, unredacted order's productItems. This ensures a
            // merchant that excludes `productItems` from allowedFields never triggers a product
            // fetch for order contents the shopper isn't authorized to see redacted-field data for.
            const productIds = (redactedOrder.productItems ?? [])
                .map((item) => item.productId)
                .filter((id): id is string => typeof id === 'string' && id.length > 0);
            const [productsById, omsMetaData] = await Promise.all([
                fetchGuestOrderProducts(context, productIds),
                fetchOmsMetaData(context),
            ]);

            return { ok: true, order: redactedOrder, omsMetaData, productsById };
        }

        // Error from SCAPI wrapper
        if (result.code === 'INVALID_CODE') {
            logger.debug('[OrderLookup] Invalid code or order not found', {
                action: actionName,
                email: redactEmailForLog(email),
            });
            return { ok: false, code: 'INVALID_CODE', message: 'Invalid code' };
        }

        if (result.code === ErrorCode.RATE_LIMITED) {
            logger.warn('[OrderLookup] Rate limited by SCAPI', {
                action: actionName,
                email: redactEmailForLog(email),
                retryAfterSeconds: result.retryAfterSeconds,
            });
            return {
                ok: false,
                code: ErrorCode.RATE_LIMITED,
                retryAfterSeconds: result.retryAfterSeconds,
                message: 'Too many requests, please try again later',
            };
        }

        // Generic error — do not leak existence
        logger.warn('[OrderLookup] Lookup failed', {
            action: actionName,
            email: redactEmailForLog(email),
            status: result.status,
            requestId: result.requestId,
        });
        return { ok: false, code: 'LOOKUP_FAILED', message: 'Unable to retrieve order' };
    } catch (error) {
        // SCAPI_UNSUPPORTED thrown by the wrapper
        if (error && typeof error === 'object' && 'code' in error && error.code === ErrorCode.SCAPI_UNSUPPORTED) {
            logger.warn('[OrderLookup] SCAPI method not supported (requires v26.8+)', { action: actionName });
            return {
                ok: false,
                code: ErrorCode.SCAPI_UNSUPPORTED,
                message: 'Order lookup requires a newer API version',
            };
        }

        // Unknown error
        logger.error('[OrderLookup] Lookup threw unexpected error', {
            action: actionName,
            email: redactEmailForLog(email),
            error: error instanceof Error ? error.message : 'unknown',
        });
        return { ok: false, code: 'LOOKUP_FAILED', message: 'Unable to retrieve order' };
    }
}
