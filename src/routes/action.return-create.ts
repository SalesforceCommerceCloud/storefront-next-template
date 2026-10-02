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

import { getConfig } from '@salesforce/storefront-next-runtime/config';
import type { Route } from './+types/action.return-create';
import { getAuth } from '@/middlewares/auth.server';
import { createReturnViaApi, type CreateReturnBody } from '@/lib/returns/returns-api.server';
import { RETURN_REASONS, type ReturnReasonId } from '@/lib/returns/types';

const MAX_ITEMS = 50;
const MAX_REQUEST_ID_LENGTH = 64;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Keeps only the fields the Returns API accepts, with the right types. This is shape cleaning only: whether the items
 * may be returned is decided by the API, which re-runs the return rules on the server.
 */
function sanitize(raw: unknown): { orderNo: string; body: CreateReturnBody } | null {
    if (!isRecord(raw) || typeof raw.orderNo !== 'string' || !raw.orderNo || !Array.isArray(raw.items)) return null;
    if (raw.items.length === 0 || raw.items.length > MAX_ITEMS) return null;

    const items: CreateReturnBody['items'] = [];
    for (const item of raw.items) {
        if (!isRecord(item)) return null;
        const { lineKey, itemId = lineKey, quantity, action: itemAction, reason, replacementSku } = item;
        if (typeof itemId !== 'string' || !itemId || typeof quantity !== 'number') return null;
        if (itemAction !== 'return' && itemAction !== 'exchange') return null;
        if (!RETURN_REASONS.some((candidate) => candidate.id === reason)) return null;
        items.push({
            itemId,
            quantity,
            action: itemAction,
            reason: reason as ReturnReasonId,
            ...(itemAction === 'exchange' && typeof replacementSku === 'string' ? { replacementSku } : {}),
        });
    }
    const clientRequestId =
        typeof raw.clientRequestId === 'string' ? raw.clientRequestId.slice(0, MAX_REQUEST_ID_LENGTH) : undefined;
    return { orderNo: raw.orderNo, body: { items, ...(clientRequestId ? { clientRequestId } : {}) } };
}

/**
 * POST /action/return-create (JSON): saves a return on the order through the Returns custom API.
 * Only registered shoppers may call it; the API itself checks the order belongs to them.
 */
export async function action({ request, context }: Route.ActionArgs): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (!getConfig(context).features?.returnsCustomApi) throw new Response('Not Found', { status: 404 });

    const session = getAuth(context);
    if (session.userType !== 'registered' || !session.customerId) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return Response.json({ error: 'invalid-body' }, { status: 400 });
    }
    const parsed = sanitize(payload);
    if (!parsed) return Response.json({ error: 'invalid-body' }, { status: 400 });

    const result = await createReturnViaApi(context, parsed.orderNo, parsed.body);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ return: result.value }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
