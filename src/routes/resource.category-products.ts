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
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import type { Route } from './+types/resource.category-products';
import type { ShopperSearch } from '@/scapi';
import { fetchSearchProducts } from '@/lib/api/search.server';
import { getAllQueryParams, getQueryParam, PRODUCT_SEARCH_QUERY_PARAMS } from '@/lib/query-params';
import { resolveRequestOrigin } from '@/lib/origin';
import { getLogger } from '@/lib/logger.server';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';

type ProductSearchHit = ShopperSearch.schemas['ProductSearchHit'];

/**
 * Response shape returned to the "Load more" fetcher on the product listing page.
 *
 * @property hits - The batch of product hits for the requested offset window.
 * @property total - Total number of products matching the current search/refinements.
 * @property offset - The offset this batch starts at (echoed back so the client can accumulate).
 * @property limit - The batch size that was applied.
 */
export interface CategoryProductsResult {
    hits: ProductSearchHit[];
    total: number;
    offset: number;
    limit: number;
}

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Reject cross-origin GETs so this data endpoint can only be driven by the storefront itself.
 * Mirrors the guard used by the other resource routes (e.g. resource.recommendations).
 */
function isSameOrigin(request: Request): boolean {
    let serverOrigin: string;
    try {
        serverOrigin = new URL(resolveRequestOrigin(request) ?? request.url).origin;
    } catch {
        return false;
    }

    const requestUrlOrigin = new URL(request.url).origin;
    const origin = request.headers.get('origin');
    if (origin) {
        return origin === serverOrigin || origin === requestUrlOrigin;
    }

    const referer = request.headers.get('referer');
    if (!referer) {
        return false;
    }

    try {
        const refererOrigin = new URL(referer).origin;
        return refererOrigin === serverOrigin || refererOrigin === requestUrlOrigin;
    } catch {
        return false;
    }
}

/**
 * Resource endpoint that returns a single offset window of product search results.
 *
 * Consumed by the product listing page "Load more" / infinite-scroll control via `useFetcher`,
 * so the shopper can append additional products without a full route navigation. Accepts the same
 * `offset` / `sort` / `refine` query parameters the category loader uses, plus a `limit`.
 *
 * @example
 * GET /resource/category-products?offset=24&limit=24&refine=cgid%3Dwomens&sort=best-matches
 */
export async function loader({ request, context }: Route.LoaderArgs): Promise<Response> {
    const logger = getLogger(context);
    if (!isSameOrigin(request)) {
        logger.warn('CategoryProducts: cross-origin GET rejected');
        return new Response('Forbidden', { status: 403, headers: NO_STORE_HEADERS });
    }

    const url = new URL(request.url);
    const { searchParams } = url;

    const offset = Math.max(
        0,
        parseInt(getQueryParam(searchParams, PRODUCT_SEARCH_QUERY_PARAMS.OFFSET) || '0', 10) || 0
    );
    const parsedLimit = parseInt(getQueryParam(searchParams, PRODUCT_SEARCH_QUERY_PARAMS.LIMIT) || '0', 10) || 0;
    // Clamp to the same page size the storefront uses elsewhere; never let a caller request an unbounded page.
    const limit = Math.min(Math.max(1, parsedLimit || 24), 100);
    const sort = getQueryParam(searchParams, PRODUCT_SEARCH_QUERY_PARAMS.SORT) || undefined;
    const refine = getAllQueryParams(searchParams, PRODUCT_SEARCH_QUERY_PARAMS.REFINE);

    // Explicit query param wins; otherwise fall back to the request-scoped site context.
    const currency =
        getQueryParam(searchParams, PRODUCT_SEARCH_QUERY_PARAMS.CURRENCY) ||
        context.get(siteContext)?.currency ||
        undefined;

    if (refine.length === 0) {
        return new Response('Missing refine', { status: 400, headers: NO_STORE_HEADERS });
    }

    try {
        const result = await fetchSearchProducts(context, {
            limit,
            offset,
            ...(sort ? { sort } : {}),
            refine,
            ...(currency ? { currency } : {}),
        });

        const payload: CategoryProductsResult = {
            hits: result.hits ?? [],
            total: result.total ?? 0,
            offset: result.offset ?? offset,
            limit,
        };
        return Response.json(payload, { headers: NO_STORE_HEADERS });
    } catch (error) {
        const status = error instanceof NormalizedApiError && error.status ? error.status : 500;
        logger.error('CategoryProducts: search failed', { error });
        return new Response('Internal Error', { status, headers: NO_STORE_HEADERS });
    }
}

export function action() {
    return new Response(null, { status: 405, headers: { Allow: 'GET', ...NO_STORE_HEADERS } });
}
