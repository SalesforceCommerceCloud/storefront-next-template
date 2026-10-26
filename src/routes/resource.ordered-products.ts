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
import type { Route } from './+types/resource.ordered-products';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
import { isSameOrigin } from '@/lib/origin';
import { getLogger } from '@/lib/logger.server';
import { getAuth } from '@/middlewares/auth.server';
import { fetchOrderedProducts } from '@/lib/api/ordered-products.server';
import { SORT_OPTIONS, DEFAULT_SORT } from '@/lib/ordered-products';

export { shouldRevalidate } from '@/lib/revalidation/routes/buy-it-again';

const VALID_SORT_IDS = new Set(SORT_OPTIONS.map((o) => o.id));
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Resource endpoint that returns paginated, sortable ordered-product results for the authenticated shopper.
 *
 * Intentionally in `src/routes/` (canonical layer) rather than a vertical — this endpoint is a
 * cross-vertical placeholder for a future native SCAPI ordered-products search. When that endpoint
 * ships, only this file's implementation changes; the {@link OrderedProductsResult} contract and all
 * callers stay the same.
 *
 * Fetches recent order history, resolves full product details, applies the requested sort, and
 * returns an {@link OrderedProductsResult} page whose shape mirrors a native SCAPI product search result.
 * Guests receive a 401.
 *
 * @example
 * GET /resource/ordered-products?offset=0&limit=12
 * GET /resource/ordered-products?offset=24&limit=24&sort=most-ordered
 * GET /resource/ordered-products?sort=most-recent
 */
export async function loader({ request, context }: Route.LoaderArgs): Promise<Response> {
    const logger = getLogger(context);
    if (!isSameOrigin(request)) {
        logger.warn('OrderedProducts: cross-origin GET rejected');
        return new Response('Forbidden', { status: 403, headers: NO_STORE_HEADERS });
    }

    const session = getAuth(context);
    if (!session.customerId || session.userType !== 'registered') {
        return new Response('Unauthorized', { status: 401, headers: NO_STORE_HEADERS });
    }

    const url = new URL(request.url);
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
    const limit = parseInt(url.searchParams.get('limit') || '12', 10) || 12;
    const rawSort = url.searchParams.get('sort') ?? DEFAULT_SORT;
    const sort = VALID_SORT_IDS.has(rawSort) ? rawSort : DEFAULT_SORT;

    try {
        const payload = await fetchOrderedProducts(context, session.customerId, { offset, limit, sort });
        return Response.json(payload, { headers: NO_STORE_HEADERS });
    } catch (error) {
        logger.error('OrderedProducts: product fetch failed', { error });
        const status = error instanceof NormalizedApiError && error.status ? error.status : 500;
        return new Response('Internal Error', { status, headers: NO_STORE_HEADERS });
    }
}

export function action() {
    return new Response(null, { status: 405, headers: { Allow: 'GET', ...NO_STORE_HEADERS } });
}
