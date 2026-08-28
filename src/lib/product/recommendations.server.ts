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
import type { ShopperSearch } from '@/scapi';
import { fetchProductsByIds } from '@/lib/api/products.server';
import { getLogger } from '@/lib/logger.server';
import { convertProductToProductSearchHit } from '@/lib/product/product-conversion';
import { getEinsteinRecommendations, type EinsteinRecommendationResponse } from './recommendations-einstein.server';
import type { Product, Recommendation } from '@/hooks/recommenders/use-recommenders';

/**
 * Thin orchestrator over the Einstein recs vendor function. Single entry point used
 * by route loaders, the PD component-loader, and the `/resource/recommendations` BFF.
 *
 * Calls `getEinsteinRecommendations` (passing through identity/segmentation derivation),
 * then resolves each recommended ID into a `ProductSearchHit` via `fetchProductsByIds`.
 * Silences `AbortError` and `TimeoutError` (returns `{}`) so callers can render an
 * empty carousel without special-casing.
 */
export async function fetchProductRecommendations(
    { context, request }: { context: Readonly<RouterContextProvider>; request: Request },
    {
        name,
        products,
        currency,
        args,
    }: {
        name: string;
        products?: Product[];
        currency?: string;
        args?: Record<string, unknown>;
    }
): Promise<Recommendation> {
    const logger = getLogger(context);

    let einsteinResponse: EinsteinRecommendationResponse;
    try {
        einsteinResponse = await getEinsteinRecommendations({
            context,
            request,
            name,
            products,
            args,
            signal: request.signal,
        });
    } catch (error) {
        const errorName = (error as Error)?.name;
        if (errorName !== 'AbortError' && errorName !== 'TimeoutError') {
            logger.warn('Recommendations: Einstein call failed', { error });
        }
        return {};
    }

    const { recs: rawRecs, recoUUID, displayMessage, recommenderName } = einsteinResponse;
    const ids = rawRecs?.map((r) => r.id).filter((id): id is string => Boolean(id)) ?? [];
    if (ids.length === 0) {
        return { recoUUID, displayMessage, recommenderName: recommenderName ?? name, recs: [] };
    }

    let productsById: Awaited<ReturnType<typeof fetchProductsByIds>>;
    try {
        productsById = await fetchProductsByIds(context, ids, {
            ...(currency ? { currency } : {}),
            allImages: true,
        });
    } catch (error) {
        // fetchProductsByIds wraps failures in NormalizedApiError, so the original error (client aborts,
        // timeouts) is on `.cause` — check it to actually skip the warn for those (not error.name, which
        // is always 'NormalizedApiError').
        const causeName = ((error as Error)?.cause as Error | undefined)?.name;
        if (causeName !== 'AbortError' && causeName !== 'TimeoutError') {
            logger.warn('Recommendations: SCAPI product enrichment failed', { error });
        }
        return {};
    }
    type ProductSearchHit = ShopperSearch.schemas['ProductSearchHit'];
    const byId = new Map(productsById.map((p) => [p.id, p] as const));
    const recs = (rawRecs ?? []).reduce((acc: ProductSearchHit[], rec) => {
        const product = rec.id ? byId.get(rec.id) : undefined;
        if (product) {
            const productSearchHit = convertProductToProductSearchHit(product);
            const finalProductId = productSearchHit.productId || product.id || rec.id || '';
            finalProductId &&
                acc.push({
                    ...productSearchHit,
                    productId: finalProductId,
                });
        }
        return acc;
    }, []);

    return { recoUUID, displayMessage, recommenderName: recommenderName ?? name, recs };
}
