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
import type { LoaderFunctionArgs } from 'react-router';
import type { ShopperProducts } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { getLogger } from '@/lib/logger.server';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';

type GetProductsQuery = ShopperProducts.operations['getProducts']['parameters']['query'];
type GetProductQuery = ShopperProducts.operations['getProduct']['parameters']['query'];

export type FetchProductsByIdsOptions = Partial<Omit<GetProductsQuery, 'ids' | 'siteId'>>;
export type FetchProductByIdOptions = Partial<Omit<GetProductQuery, 'siteId'>>;

/**
 * SCAPI's `shopperProducts.getProducts` caps the `ids` query parameter at 24 IDs. Requests with
 * more are rejected with `'ids' violates the value constraint. The expected value is between '(0..24)'`.
 * Larger ID lists (e.g. a cart with 25+ distinct products) must be split into chunks of this size.
 */
export const SCAPI_GET_PRODUCTS_MAX_IDS = 24;

/**
 * Fetch multiple products by IDs.
 *
 * Wraps SCAPI's `shopperProducts.getProducts` with operation-context logging and
 * normalizes any thrown error into `NormalizedApiError` for consistent downstream handling.
 *
 * IDs are chunked into batches of at most {@link SCAPI_GET_PRODUCTS_MAX_IDS} (SCAPI's hard limit)
 * and fetched in parallel, then merged — so callers can pass an unbounded list (e.g. every line in
 * a large cart) without tripping the endpoint's `ids` value constraint.
 *
 * @param context - Router context
 * @param ids - Array of product IDs (will be deduplicated and trimmed)
 * @param options - Additional query parameters
 * @throws {NormalizedApiError} When the API request fails (including 404s, auth failures, network errors)
 */
export async function fetchProductsByIds(
    context: LoaderFunctionArgs['context'],
    ids: string[],
    options: FetchProductsByIdsOptions = {}
): Promise<ShopperProducts.schemas['Product'][]> {
    const normalizedIds = Array.from(
        new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim()))
    );

    if (!normalizedIds.length) {
        return [];
    }

    const logger = getLogger(context);
    const clients = createApiClients(context);

    // Split into SCAPI-sized batches. A single chunk (the common case) issues exactly one request,
    // preserving prior behavior; larger lists fan out and merge.
    const idChunks: string[][] = [];
    for (let i = 0; i < normalizedIds.length; i += SCAPI_GET_PRODUCTS_MAX_IDS) {
        idChunks.push(normalizedIds.slice(i, i + SCAPI_GET_PRODUCTS_MAX_IDS));
    }

    try {
        const responses = await Promise.all(
            idChunks.map((chunk) =>
                clients.shopperProducts.getProducts({
                    params: {
                        query: {
                            ids: chunk,
                            ...options,
                        },
                    },
                })
            )
        );

        return responses.flatMap(({ data }) => data?.data ?? []);
    } catch (error) {
        logger.error('shopperProducts.getProducts failed', { ids: normalizedIds });
        throw new NormalizedApiError(error);
    }
}

/**
 * Fetch a single product by ID.
 *
 * Wraps SCAPI's `shopperProducts.getProduct` with operation-context logging and
 * normalizes any thrown error into `NormalizedApiError` for consistent downstream handling.
 *
 * Different contexts require different error handling:
 * - Page Designer ProductTile: Catch 404 → return null → show placeholder
 * - Product Detail Page: Let 404 propagate → loader re-throws as Response(404) → 404 page with proper HTTP status
 *
 * @param context - Router context
 * @param id - Product ID (will be trimmed)
 * @param options - Additional query parameters
 * @returns Product data or null if ID is empty/whitespace
 * @throws {NormalizedApiError} When the API request fails (including 404s, auth failures, network errors)
 */
export async function fetchProductById(
    context: LoaderFunctionArgs['context'],
    id: string,
    options: FetchProductByIdOptions = {}
): Promise<ShopperProducts.schemas['Product'] | null> {
    if (!id || id.trim().length === 0) {
        return null;
    }

    const logger = getLogger(context);
    const clients = createApiClients(context);
    const trimmedId = id.trim();

    try {
        const { data } = await clients.shopperProducts.getProduct({
            params: {
                path: { id: trimmedId },
                query: { ...options },
            },
        });
        return data ?? null;
    } catch (error) {
        logger.error('shopperProducts.getProduct failed', { productId: trimmedId });
        throw new NormalizedApiError(error);
    }
}
