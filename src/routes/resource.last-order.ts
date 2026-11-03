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
import type { Route } from './+types/resource.last-order';
import type { Order } from '@/components/account/order-list';
import { MAX_VISIBLE_TILES } from '@/components/last-order-card';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
import { isSameOrigin } from '@/lib/origin';
import { getLogger } from '@/lib/logger.server';
import { getAuth } from '@/middlewares/auth.server';
import { fetchLastOrder } from '@/lib/api/order.server';

export { shouldRevalidate } from '@/lib/revalidation/routes/buy-it-again';

export type LastOrderResponse = { order: Order | null };

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Resource endpoint that returns the authenticated shopper's most recent order.
 *
 * Returns `{ order: null }` when the shopper has no order history.
 * Guests receive a 401.
 *
 * @example
 * GET /resource/last-order
 */
export async function loader({ request, context }: Route.LoaderArgs): Promise<Response> {
    const logger = getLogger(context);
    if (!isSameOrigin(request)) {
        logger.warn('LastOrder: cross-origin GET rejected');
        return new Response('Forbidden', { status: 403, headers: NO_STORE_HEADERS });
    }

    const session = getAuth(context);
    if (!session.customerId || session.userType !== 'registered') {
        return new Response('Unauthorized', { status: 401, headers: NO_STORE_HEADERS });
    }

    try {
        const order = await fetchLastOrder(context, session.customerId, { imageLimit: MAX_VISIBLE_TILES });
        const payload: LastOrderResponse = { order };
        return Response.json(payload, { headers: NO_STORE_HEADERS });
    } catch (error) {
        logger.error('LastOrder: fetch failed', { error });
        const status = error instanceof NormalizedApiError && error.status ? error.status : 500;
        return new Response('Internal Error', { status, headers: NO_STORE_HEADERS });
    }
}

export function action() {
    return new Response(null, { status: 405, headers: { Allow: 'GET', ...NO_STORE_HEADERS } });
}
