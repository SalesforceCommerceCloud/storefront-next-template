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
import type { Route } from './+types/action.return-advance';
import { getAuth } from '@/middlewares/auth.server';
import { advanceReturnViaApi } from '@/lib/returns/returns-api.server';
import type { ReturnStatus } from '@/lib/returns/types';

const STATUSES: readonly string[] = ['submitted', 'approved', 'received', 'refunded', 'exchange_shipped'];

/**
 * POST /action/return-advance (JSON { orderNo, rmaNo, expectedStatus? }): moves a return one step forward through the
 * Returns custom API. `expectedStatus` is the status the shopper was looking at; if it is no longer current the
 * return comes back unchanged, so a double click moves exactly one step.
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
    const { orderNo, rmaNo, expectedStatus } = (
        typeof payload === 'object' && payload !== null ? payload : {}
    ) as Record<string, unknown>;
    if (typeof orderNo !== 'string' || !orderNo || typeof rmaNo !== 'string' || !rmaNo) {
        return Response.json({ error: 'invalid-body' }, { status: 400 });
    }
    if (expectedStatus !== undefined && (typeof expectedStatus !== 'string' || !STATUSES.includes(expectedStatus))) {
        return Response.json({ error: 'invalid-body' }, { status: 400 });
    }

    const result = await advanceReturnViaApi(context, orderNo, rmaNo, expectedStatus as ReturnStatus | undefined);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ return: result.value }, { headers: { 'Cache-Control': 'no-store' } });
}
