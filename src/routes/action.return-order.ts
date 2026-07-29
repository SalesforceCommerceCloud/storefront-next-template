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
import type { ReturnProductItem } from '@/lib/order-management/return';
import { classifyReturnError, readReturnErrorCode } from '@/lib/order-management/return-error';

/**
 * Server action for item-level OMS returns. The return dialog POSTs the shopper's
 * selection here; this action forwards it to
 * `POST /orders/{orderNo}/actions/oms-return-order` and classifies any failure so
 * the dialog can pick the right recovery affordance (see {@link classifyReturnError}).
 *
 * Eligibility and the payload shape are the dialog's concern (WI-1 helpers in
 * `lib/order-management/return.ts`); this action only transports and classifies.
 * Registered shoppers only — SFN's auth middleware redirects unauthenticated
 * requests before this runs, so there is no return-specific auth handling and the
 * guest `orderAccessCode` is never sent.
 *
 * POST FormData { orderNo, productItems }  // productItems is a JSON array string
 *   -> 200 { success: true }
 *   -> 400 { success: false, error: { kind: 'invalid_input' } }         // malformed local input (bad JSON,
 *                                                                        // empty array, or a row missing a
 *                                                                        // valid itemId/quantity), no SCAPI call
 *   -> 4xx/5xx { success: false, error: { kind, status } }              // classified SCAPI failure
 */
export async function action({ request, context }: ActionFunctionArgs): Promise<Response> {
    const logger = getLogger(context);

    if (request.method !== 'POST') {
        return new Response(null, { status: 405 });
    }

    const formData = await request.formData();
    const orderNo = formData.get('orderNo')?.toString() ?? '';
    const raw = formData.get('productItems')?.toString() ?? '';

    if (!orderNo || !raw) {
        logger.warn('[Returns] return-order: missing orderNo or productItems');
        return invalidInput();
    }

    // productItems arrives as a JSON string. Parse defensively: a throw, a
    // non-array, or an empty array is malformed local input, rejected before the
    // SCAPI call (OmsReturnOrderRequest requires productItems with minItems: 1).
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        logger.warn('[Returns] return-order: productItems is not valid JSON');
        return invalidInput();
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
        logger.warn('[Returns] return-order: productItems is not a non-empty array');
        return invalidInput();
    }

    // Coerce and validate each row. The action must not trust the wire: coerce
    // quantity to a Number (format: double), then reject anything the payload
    // shape can't satisfy — a missing/blank itemId or a non-finite/non-positive
    // quantity (e.g. a garbage string coerces to NaN). Catching these locally as
    // invalid_input keeps the reported kind honest; forwarding them would let
    // SCAPI reject them and surface as a misleading `transient`.
    const productItems: ReturnProductItem[] = [];
    for (const item of parsed) {
        const { itemId, quantity, reason } = item as { itemId?: unknown; quantity?: unknown; reason?: unknown };
        const qty = Number(quantity);
        if (typeof itemId !== 'string' || !itemId || !Number.isFinite(qty) || qty <= 0) {
            logger.warn('[Returns] return-order: productItems has an item with an invalid itemId or quantity');
            return invalidInput();
        }
        productItems.push({
            itemId,
            quantity: qty,
            ...(typeof reason === 'string' && reason ? { reason } : {}),
        });
    }

    const clients = createApiClients(context);
    try {
        await clients.shopperOrders.returnOmsOrder({
            params: { path: { orderNo } },
            body: { productItems },
        });
        return Response.json({ success: true });
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 500;
        const code = readReturnErrorCode(error);
        const kind = classifyReturnError(status, code);
        logger.error('[Returns] return-order: SCAPI returnOmsOrder failed', {
            orderNo,
            status,
            code,
            kind,
            error,
        });
        return Response.json({ success: false, error: { kind, status } }, { status });
    }
}

/** Locally-detected malformed input: 400 with the `invalid_input` kind, no SCAPI call. */
function invalidInput(): Response {
    return Response.json({ success: false, error: { kind: 'invalid_input' } }, { status: 400 });
}
