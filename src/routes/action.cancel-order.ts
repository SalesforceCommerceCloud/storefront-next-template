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
import { getLogger } from '@/lib/logger.server';
import { createApiClients } from '@/lib/api-clients.server';
import { ApiError } from '@/scapi';
import { classifyCancelError, type CancelErrorKind } from '@/lib/order-management/cancel-error';

export type { CancelErrorKind };

/** Classify a thrown cancel-order error, extracting the HTTP status from an {@link ApiError}. */
function classifyThrownCancelError(error: unknown): { kind: CancelErrorKind; status: number } {
    const status = error instanceof ApiError ? error.status : 500;
    return { kind: classifyCancelError(status), status };
}

/**
 * Server action for order-level OMS cancellations. The cancel dialog POSTs the
 * shopper's selection here; this action forwards it to
 * `POST /orders/{orderNo}/actions/oms-cancel-order` and classifies any failure
 * so the dialog can pick the right recovery affordance (see
 * {@link classifyCancelError}).
 *
 * The cancellation always applies to the entire order; partial cancellations
 * are not supported. Registered shoppers only — access control relies on SCAPI
 * token scoping (the cancel endpoint requires a registered shopper token). No
 * cancel-specific auth handling; the guest `orderAccessCode` is never sent.
 *
 * POST FormData { orderNo, reason? }  // reason is an optional cancel reason code
 *   -> 200 { success: true }
 *   -> 400 { success: false, error: { kind: 'invalid_input' } }     // missing orderNo, no SCAPI call
 *   -> 4xx/5xx { success: false, error: { kind, status } }          // classified SCAPI failure
 */
export async function action({ request, context }: ActionFunctionArgs): Promise<Response> {
    const logger = getLogger(context);

    if (request.method !== 'POST') {
        return new Response(null, { status: 405 });
    }

    const formData = await request.formData();
    const rawOrderNo = formData.get('orderNo');
    const rawReason = formData.get('reason');
    const orderNo = typeof rawOrderNo === 'string' ? rawOrderNo.trim() : '';
    const reason = typeof rawReason === 'string' ? rawReason.trim() : '';

    if (!orderNo) {
        logger.warn('[OrderManagement] cancel-order: missing orderNo');
        return invalidInput();
    }

    const clients = createApiClients(context);
    try {
        await clients.shopperOrders.cancelOmsOrder({
            params: { path: { orderNo } },
            body: reason ? { reason } : {},
        });
        return Response.json({ success: true });
    } catch (error) {
        const classified = classifyThrownCancelError(error);
        logger.error('[OrderManagement] cancel-order: SCAPI cancelOmsOrder failed', {
            orderNo,
            status: classified.status,
            kind: classified.kind,
            error,
        });
        return Response.json({ success: false, error: classified }, { status: classified.status });
    }
}

/** Locally-detected malformed input: 400 with the `invalid_input` kind, no SCAPI call. */
function invalidInput(): Response {
    return Response.json({ success: false, error: { kind: 'invalid_input' as const, status: 400 } }, { status: 400 });
}
