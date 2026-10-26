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
import type { Route } from './+types/resource.recommendations';
import { fetchProductRecommendations } from '@/lib/product/recommendations.server';
import { getLogger } from '@/lib/logger.server';
import type { Product } from '@/hooks/recommenders/use-recommenders';
import { isSameOrigin } from '@/lib/origin';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function loader({ request, context }: Route.LoaderArgs) {
    const logger = getLogger(context);
    if (!isSameOrigin(request)) {
        logger.warn('Recommendations: cross-origin GET rejected');
        return new Response('Forbidden', { status: 403, headers: NO_STORE_HEADERS });
    }

    const url = new URL(request.url);
    const recommenderName = url.searchParams.get('recommenderName');
    if (!recommenderName) {
        return new Response('Missing recommenderName', { status: 400, headers: NO_STORE_HEADERS });
    }

    const productsRaw = url.searchParams.get('products');
    let products: Product[] | undefined;
    if (productsRaw) {
        try {
            const parsed = JSON.parse(productsRaw);
            products = Array.isArray(parsed) ? (parsed as Product[]) : undefined;
        } catch {
            return new Response('Invalid products JSON', { status: 400, headers: NO_STORE_HEADERS });
        }
    }

    let args: Record<string, unknown> | undefined;
    const argsRaw = url.searchParams.get('args');
    if (argsRaw) {
        try {
            const parsed = JSON.parse(argsRaw);
            args = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
        } catch {
            return new Response('Invalid args JSON', { status: 400, headers: NO_STORE_HEADERS });
        }
    }

    try {
        const type = url.searchParams.get('type') ?? undefined;
        // Explicit query param wins; otherwise fall back to the request-scoped `siteContext`
        const currency = url.searchParams.get('currency') ?? context.get(siteContext)?.currency ?? undefined;
        const data = await fetchProductRecommendations(
            { context, request },
            {
                name: recommenderName,
                products,
                ...(currency ? { currency } : {}),
                args: { ...(args ?? {}), ...(type ? { type } : {}) },
            }
        );
        return Response.json(data, { headers: NO_STORE_HEADERS });
    } catch (error) {
        logger.error('Recommendations: helper threw', { error });
        return new Response('Internal Error', { status: 500, headers: NO_STORE_HEADERS });
    }
}

export function action() {
    return new Response(null, { status: 405, headers: { Allow: 'GET', ...NO_STORE_HEADERS } });
}
