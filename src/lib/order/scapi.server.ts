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
import { ApiError, type ShopperOrders } from '@/scapi';
import { ErrorCode } from '@/lib/error-codes';
import { createApiClients } from '@/lib/api-clients.server';
import { classifyReturnError, readReturnErrorCode } from '@/lib/order-management/return-error';
import { classifyCancelError } from '@/lib/order-management/cancel-error';

/**
 * Success result for requestOrderAccessCode.
 */
export interface RequestCodeSuccess {
    ok: true;
}

/**
 * Error result for requestOrderAccessCode.
 */
export interface RequestCodeError {
    code: string;
    status: number;
    message: string;
    requestId?: string;
    retryAfterSeconds?: number;
}

/**
 * Result type for requestOrderAccessCode.
 */
export type RequestCodeResult = RequestCodeSuccess | RequestCodeError;

/**
 * Success result for guestOrderLookup.
 */
export interface LookupSuccess {
    ok: true;
    order: ShopperOrders.schemas['Order'];
}

/**
 * Error result for guestOrderLookup.
 */
export interface LookupError {
    ok: false;
    code: string;
    status: number;
    message?: string;
    requestId?: string;
    retryAfterSeconds?: number;
}

/**
 * Result type for guestOrderLookup.
 */
export type LookupResult = LookupSuccess | LookupError;

/**
 * Success result for cancelGuestOrder.
 */
export interface CancelOrderSuccess {
    ok: true;
    order: ShopperOrders.schemas['Order'];
}

/**
 * Error result for cancelGuestOrder. `code` is one of the wire codes the guest
 * cancel action route maps to an HTTP status — derived from {@link classifyCancelError}
 * so the classification logic is shared with the registered-customer cancel flow.
 */
export interface CancelOrderError {
    ok: false;
    code: 'CANCEL_INVALID_REASON' | 'LOOKUP_FAILED' | 'CANCEL_CONFLICT' | 'CANCEL_FAILED';
    status: number;
    message?: string;
    requestId?: string;
}

/**
 * Result type for cancelGuestOrder.
 */
export type CancelOrderResult = CancelOrderSuccess | CancelOrderError;

/** Map a {@link classifyCancelError} outcome to the wire code {@link cancelGuestOrder} returns. */
function cancelErrorCodeFor(status: number): CancelOrderError['code'] {
    switch (classifyCancelError(status)) {
        case 'invalid_reason':
            return 'CANCEL_INVALID_REASON';
        case 'not_found':
            return 'LOOKUP_FAILED';
        case 'not_cancellable':
            return 'CANCEL_CONFLICT';
        default:
            return 'CANCEL_FAILED';
    }
}

/**
 * Success result for returnGuestOrder.
 */
export interface ReturnOrderSuccess {
    ok: true;
    order: ShopperOrders.schemas['Order'];
}

/**
 * Error result for returnGuestOrder. `code` is one of the wire codes the guest
 * return action route maps to an HTTP status — derived from {@link classifyReturnError}
 * so the classification logic is shared with the registered-customer return flow.
 */
export interface ReturnOrderError {
    ok: false;
    code:
        | 'RETURN_INVALID_REASON'
        | 'RETURN_UNKNOWN_ITEMS'
        | 'RETURN_QUANTITY_EXCEEDED'
        | 'LOOKUP_FAILED'
        | 'RETURN_CONFLICT'
        | 'RETURN_FAILED';
    status: number;
    message?: string;
    requestId?: string;
}

/**
 * Result type for returnGuestOrder.
 */
export type ReturnOrderResult = ReturnOrderSuccess | ReturnOrderError;

/** Map a {@link classifyReturnError} outcome to the wire code {@link returnGuestOrder} returns. */
function returnErrorCodeFor(status: number, subCode: string | undefined): ReturnOrderError['code'] {
    switch (classifyReturnError(status, subCode)) {
        case 'invalid_reason':
            return 'RETURN_INVALID_REASON';
        case 'unknown_items':
            return 'RETURN_UNKNOWN_ITEMS';
        case 'quantity_exceeded':
            return 'RETURN_QUANTITY_EXCEEDED';
        case 'not_found':
            return 'LOOKUP_FAILED';
        case 'not_returnable':
            return 'RETURN_CONFLICT';
        default:
            return 'RETURN_FAILED';
    }
}

/**
 * Parses a `Retry-After` header value into a whole number of seconds.
 * Per RFC 9110, the header is either a delay in seconds (e.g. "30") or an HTTP-date
 * (e.g. "Wed, 21 Oct 2026 07:28:00 GMT") — SCAPI/CDN infrastructure may emit either
 * form, so both are handled. Returns undefined for a missing/unparseable header or a
 * date already in the past.
 */
function parseRetryAfterSeconds(headerValue: string | null): number | undefined {
    if (!headerValue) {
        return undefined;
    }

    const asSeconds = Number(headerValue);
    if (Number.isFinite(asSeconds)) {
        return Math.max(0, Math.round(asSeconds));
    }

    const asDate = Date.parse(headerValue);
    if (!Number.isNaN(asDate)) {
        return Math.max(0, Math.round((asDate - Date.now()) / 1000));
    }

    return undefined;
}

/**
 * Request an access code for guest order lookup.
 * The access code is sent via email to the address on the order.
 *
 * Pre-26.8 gate: if the SCAPI client method does not exist, throws an error with code SCAPI_UNSUPPORTED.
 *
 * @param params - Request parameters
 * @param params.orderNo - Order number
 * @param params.email - Email address on the order
 * @param params.context - Router context provider
 * @returns Success { ok: true } or error { code, status, message, requestId }
 */
export async function requestOrderAccessCode({
    orderNo,
    email,
    context,
}: {
    orderNo: string;
    email: string;
    context: Readonly<RouterContextProvider>;
}): Promise<RequestCodeResult> {
    const clients = createApiClients(context);

    // Pre-26.8 gate: check if the method exists
    if (typeof clients.shopperOrders.requestOrderAccessCode !== 'function') {
        const error = new Error('Guest order lookup requires SCAPI v26.8 or later');
        Object.assign(error, { code: ErrorCode.SCAPI_UNSUPPORTED });
        throw error;
    }

    try {
        const { response } = await clients.shopperOrders.requestOrderAccessCode({
            params: { path: { orderNo } },
            body: { email },
        });

        if (!response.ok) {
            // Non-2xx response — map to stable error shape
            return {
                code: 'REQUEST_CODE_FAILED',
                status: response.status,
                message: 'Failed to request order access code',
                requestId: response.headers.get('x-request-id') ?? undefined,
            };
        }

        return { ok: true };
    } catch (error) {
        // Network or other exception
        if (error instanceof ApiError) {
            return {
                code: 'REQUEST_CODE_FAILED',
                status: error.status ?? 500,
                message: 'Failed to request order access code',
                requestId: error.headers.get('x-request-id') ?? undefined,
            };
        }

        // Unknown error
        return {
            code: 'REQUEST_CODE_FAILED',
            status: 500,
            message: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Look up an order using the order number, email, and access code.
 *
 * Pre-26.8 gate: if the SCAPI client method does not exist, throws an error with code SCAPI_UNSUPPORTED.
 *
 * @param params - Lookup parameters
 * @param params.orderNo - Order number
 * @param params.email - Email address on the order
 * @param params.accessCode - Access code (OTP) received via email
 * @param params.context - Router context provider
 * @returns Success { ok: true, order } or error { code, status, requestId?, retryAfterSeconds? }
 */
export async function guestOrderLookup({
    orderNo,
    email,
    accessCode,
    context,
}: {
    orderNo: string;
    email: string;
    accessCode: string;
    context: Readonly<RouterContextProvider>;
}): Promise<LookupResult> {
    const clients = createApiClients(context);

    // Pre-26.8 gate: check if the method exists
    if (typeof clients.shopperOrders.guestOrderLookup !== 'function') {
        const error = new Error('Guest order lookup requires SCAPI v26.8 or later');
        Object.assign(error, { code: ErrorCode.SCAPI_UNSUPPORTED });
        throw error;
    }

    try {
        const { data, response } = await clients.shopperOrders.guestOrderLookup({
            params: {
                path: { orderNo },
                // `expand=oms,oms_shipments` loads Order Management enrichment (per-item
                // `omsData.quantityAvailableToCancel`/`quantityAvailableToReturn`) onto the
                // order, without which cancel/return eligibility could never be computed.
                // Silently disregarded on a non-OMS org (OAS degrade contract).
                query: { expand: ['oms', 'oms_shipments'] },
            },
            body: { email, orderViewCode: accessCode },
        });

        if (!response.ok) {
            // Handle known error codes
            if (response.status === 401 || response.status === 403) {
                return {
                    ok: false,
                    code: 'INVALID_CODE',
                    status: response.status,
                    requestId: response.headers.get('x-request-id') ?? undefined,
                };
            }

            if (response.status === 429) {
                return {
                    ok: false,
                    code: ErrorCode.RATE_LIMITED,
                    status: response.status,
                    retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('retry-after')),
                    requestId: response.headers.get('x-request-id') ?? undefined,
                };
            }

            // Other 4xx/5xx
            return {
                ok: false,
                code: 'LOOKUP_FAILED',
                status: response.status,
                requestId: response.headers.get('x-request-id') ?? undefined,
            };
        }

        if (!data) {
            return {
                ok: false,
                code: 'LOOKUP_FAILED',
                status: response.status,
                message: 'No order data returned',
            };
        }

        return {
            ok: true,
            order: data,
        };
    } catch (error) {
        // Network or other exception
        if (error instanceof ApiError) {
            if (error.status === 401 || error.status === 403) {
                return {
                    ok: false,
                    code: 'INVALID_CODE',
                    status: error.status,
                    requestId: error.headers.get('x-request-id') ?? undefined,
                };
            }

            if (error.status === 429) {
                return {
                    ok: false,
                    code: ErrorCode.RATE_LIMITED,
                    status: error.status,
                    retryAfterSeconds: parseRetryAfterSeconds(error.headers.get('retry-after')),
                    requestId: error.headers.get('x-request-id') ?? undefined,
                };
            }

            return {
                ok: false,
                code: 'LOOKUP_FAILED',
                status: error.status ?? 500,
                requestId: error.headers.get('x-request-id') ?? undefined,
            };
        }

        // Unknown error
        return {
            ok: false,
            code: 'LOOKUP_FAILED',
            status: 500,
            message: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Cancel a guest order using Order Management (OMS) cancellation.
 * The shopper is authenticated via the shopper token from `createApiClients` (already
 * independently verified server-side by the caller via the `glo_verification_token` cookie) —
 * no order access code is required for this call.
 *
 * Pre-26.8 gate: if the SCAPI client method does not exist, throws an error with code SCAPI_UNSUPPORTED.
 *
 * @param params - Cancel parameters
 * @param params.orderNo - Order number
 * @param params.reason - Optional OMS cancel reason code
 * @param params.context - Router context provider
 * @returns Success { ok: true, order } or error { ok: false, code, status, message?, requestId? }
 */
export async function cancelGuestOrder({
    orderNo,
    reason,
    context,
}: {
    orderNo: string;
    reason?: string;
    context: Readonly<RouterContextProvider>;
}): Promise<CancelOrderResult> {
    const clients = createApiClients(context);

    // Pre-26.8 gate: check if the method exists
    if (typeof clients.shopperOrders.cancelOmsOrder !== 'function') {
        const error = new Error('Guest order cancellation requires SCAPI v26.8 or later');
        Object.assign(error, { code: ErrorCode.SCAPI_UNSUPPORTED });
        throw error;
    }

    try {
        const { data, response } = await clients.shopperOrders.cancelOmsOrder({
            params: { path: { orderNo } },
            body: reason ? { reason } : {},
        });

        if (!response.ok) {
            return {
                ok: false,
                code: cancelErrorCodeFor(response.status),
                status: response.status,
                requestId: response.headers.get('x-request-id') ?? undefined,
            };
        }

        if (!data) {
            return {
                ok: false,
                code: 'CANCEL_FAILED',
                status: response.status,
                message: 'No order data returned',
            };
        }

        return {
            ok: true,
            order: data,
        };
    } catch (error) {
        // Network or other exception
        if (error instanceof ApiError) {
            const status = error.status ?? 500;
            return {
                ok: false,
                code: cancelErrorCodeFor(status),
                status,
                requestId: error.headers.get('x-request-id') ?? undefined,
            };
        }

        // Unknown error
        return {
            ok: false,
            code: 'CANCEL_FAILED',
            status: 500,
            message: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Return one or more items of a guest order using Order Management (OMS) returns.
 * The shopper is authenticated via the shopper token from `createApiClients` (already
 * independently verified server-side by the caller via the `glo_verification_token` cookie) —
 * no order access code is required for this call.
 *
 * Pre-26.8 gate: if the SCAPI client method does not exist, throws an error with code SCAPI_UNSUPPORTED.
 *
 * @param params - Return parameters
 * @param params.orderNo - Order number
 * @param params.productItems - OMS return payload rows (`{ itemId, quantity, reason? }`)
 * @param params.context - Router context provider
 * @returns Success { ok: true, order } or error { ok: false, code, status, message?, requestId? }
 */
export async function returnGuestOrder({
    orderNo,
    productItems,
    context,
}: {
    orderNo: string;
    productItems: ShopperOrders.schemas['OmsReturnProductItem'][];
    context: Readonly<RouterContextProvider>;
}): Promise<ReturnOrderResult> {
    const clients = createApiClients(context);

    // Pre-26.8 gate: check if the method exists
    if (typeof clients.shopperOrders.returnOmsOrder !== 'function') {
        const error = new Error('Guest order return requires SCAPI v26.8 or later');
        Object.assign(error, { code: ErrorCode.SCAPI_UNSUPPORTED });
        throw error;
    }

    try {
        const { data, response } = await clients.shopperOrders.returnOmsOrder({
            params: { path: { orderNo } },
            body: { productItems },
        });

        if (!response.ok) {
            return {
                ok: false,
                code: returnErrorCodeFor(response.status, undefined),
                status: response.status,
                requestId: response.headers.get('x-request-id') ?? undefined,
            };
        }

        if (!data) {
            return {
                ok: false,
                code: 'RETURN_FAILED',
                status: response.status,
                message: 'No order data returned',
            };
        }

        return {
            ok: true,
            order: data,
        };
    } catch (error) {
        if (error instanceof ApiError) {
            const status = error.status ?? 500;
            return {
                ok: false,
                code: returnErrorCodeFor(status, readReturnErrorCode(error)),
                status,
                requestId: error.headers.get('x-request-id') ?? undefined,
            };
        }

        // Unknown error
        return {
            ok: false,
            code: 'RETURN_FAILED',
            status: 500,
            message: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
