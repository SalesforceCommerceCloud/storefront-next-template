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
import { siteContext, type SiteContext } from '@salesforce/storefront-next-runtime/site-context';
import { fetchOrderedProductIds } from './order.server';
import { fetchProductsByIds, getDefaultProductExpansions } from './products.server';
import { convertProductToProductSearchHit } from '@/lib/product/product-conversion';
import { type OrderedProductsResult, SORT_OPTIONS, DEFAULT_SORT } from '@/lib/ordered-products';

/**
 * Fetches one page of the shopper's ordered products.
 *
 * Sorts the full ordered-ID list (derived from order history, no product data needed),
 * slices to the requested page, then fetches only those product details from SCAPI.
 * At most `limit` products are fetched per call regardless of how many orders exist.
 *
 * This is a placeholder for a future native SCAPI ordered-products search endpoint.
 * When that ships, only this file's implementation changes.
 *
 * @param context - React Router loader context
 * @param customerId - Registered shopper's customer ID
 * @param options.offset - Zero-based page offset (default 0)
 * @param options.limit - Page size, clamped to 1–100 (default 12)
 * @param options.sort - Sort ID from {@link SORT_OPTIONS} (default {@link DEFAULT_SORT})
 * @throws {NormalizedApiError} When the product fetch fails — callers decide how to handle
 */
export async function fetchOrderedProducts(
    context: LoaderFunctionArgs['context'],
    customerId: string,
    options?: { offset?: number; limit?: number; sort?: string }
): Promise<OrderedProductsResult> {
    const offset = Math.max(0, options?.offset ?? 0);
    const limit = Math.min(Math.max(1, options?.limit ?? 12), 100);
    const sort = options?.sort ?? DEFAULT_SORT;

    // Known limitation: the full order-history scan runs on every call, including
    // load-more requests. The sorted ID list is identical across pages for the same
    // session, so pages 2+ repeat redundant SCAPI work. Fixing this cleanly requires
    // stateful ID caching, which is not straightforward on MRT (serverless). Deferred
    // until the native SCAPI ordered-products endpoint lands and replaces this file.
    const orderedItems = await fetchOrderedProductIds(context, customerId);
    const total = orderedItems.length;

    if (total === 0) {
        return { hits: [], total: 0, offset, limit, sortingOptions: SORT_OPTIONS, selectedSortingOption: sort };
    }

    // Sort at the ID level — no product data required for the supported sort options.
    // most-recent uses the natural insertion order from fetchOrderedProductIds.
    // Everything else (including unknown values) falls back to most-ordered.
    const sortedItems = sort === 'most-recent' ? orderedItems : [...orderedItems].sort((a, b) => b.count - a.count);

    // Slice first, then fetch — never touches more than `limit` products per call.
    const pageIds = sortedItems.slice(offset, offset + limit).map(({ id }) => id);

    if (pageIds.length === 0) {
        return { hits: [], total, offset, limit, sortingOptions: SORT_OPTIONS, selectedSortingOption: sort };
    }

    const currency = (context.get(siteContext) as SiteContext | null)?.currency;
    const products = await fetchProductsByIds(context, pageIds, {
        expand: getDefaultProductExpansions(),
        currency,
    });
    const hits = products.map(convertProductToProductSearchHit);

    return { hits, total, offset, limit, sortingOptions: SORT_OPTIONS, selectedSortingOption: sort };
}
