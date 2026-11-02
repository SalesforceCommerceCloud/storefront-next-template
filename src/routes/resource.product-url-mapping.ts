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
import type { Route } from './+types/resource.product-url-mapping';
import { getUrlMapping } from '@/lib/api/shopper-seo.server';
import { getLogger } from '@/lib/logger.server';
import { isSameOrigin } from '@/lib/origin';

export type ProductUrlMappingData = {
    /** The product the URL segment maps to, or `null` when it maps to none. */
    productId: string | null;
};

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Resolves a backend URL segment to the product it maps to, with Shopper SEO `getUrlMapping` for the
 * active site and locale.
 *
 * Used by the Shopper Agent to point a product link at the storefront when the product id cannot be
 * read from the backend URL alone (see `cimulate-product-links.ts`). A segment that does not map to a
 * product returns `{ productId: null }`. A failed lookup returns 502, so the caller can tell it apart
 * and try again later.
 *
 * @example
 *   GET /resource/product-url-mapping?urlSegment=en_US%2Fdipsea-tie-headband-2040793A5H.html
 *   → { productId: '2040793A5H' }
 */
export async function loader({ request, context }: Route.LoaderArgs): Promise<Response> {
    const logger = getLogger(context);
    if (!isSameOrigin(request)) {
        logger.warn('ProductUrlMapping: cross-origin GET rejected');
        return new Response('Forbidden', { status: 403, headers: NO_STORE_HEADERS });
    }

    const urlSegment = new URL(request.url).searchParams.get('urlSegment')?.trim();
    if (!urlSegment) {
        return new Response('Missing urlSegment', { status: 400, headers: NO_STORE_HEADERS });
    }

    let mapping;
    try {
        // Resolves to null when the segment maps to nothing (a Shopper SEO 404)
        mapping = await getUrlMapping(context, urlSegment);
    } catch (error) {
        logger.warn('ProductUrlMapping: lookup failed', { error });
        return new Response('Bad Gateway', { status: 502, headers: NO_STORE_HEADERS });
    }
    const productId = mapping?.resourceType === 'PRODUCT' && mapping.resourceId ? mapping.resourceId : null;
    return Response.json({ productId } satisfies ProductUrlMappingData, { headers: NO_STORE_HEADERS });
}

export function action() {
    return new Response(null, { status: 405, headers: { Allow: 'GET', ...NO_STORE_HEADERS } });
}
