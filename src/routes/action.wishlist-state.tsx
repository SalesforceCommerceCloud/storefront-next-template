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
import { data, type LoaderFunctionArgs } from 'react-router';
import { getAuth } from '@/middlewares/auth.server';
import { getWishlist } from '@/lib/api/wishlist.server';
import { getLogger } from '@/lib/logger.server';

/** Shape returned to the client for the lazy heart load. */
export type WishlistStateResponse = { productIds: string[] };

/**
 * The body is a per-shopper wishlist read served from a fixed, query-less URL (an identical cache
 * key for every shopper) and fetched as the bare resource URL, so a cache would key one shopper's
 * list under all. `no-store` on every return path prevents that, matching `resource.recommendations`.
 */
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * On-demand wishlist read for the lazy client load.
 *
 * Loaders skip the per-page-view SCAPI read to eliminate the `productLists` volume; the client
 * store instead calls this route once per session, on the shopper's first product intent (tile
 * hover / PDP heart mount), to fill hearts.
 * Read-only: uses `getWishlist` (never `getOrCreateWishlist`), so reading a fresh shopper
 * never provisions an empty list. Works for any session with a valid `customerId` (guest or
 * registered) — SCAPI's product-list endpoints accept either token type.
 *
 * Best-effort: any failure (no session, SCAPI error) resolves to an empty list rather
 * than throwing, so a missed read degrades to unfilled hearts instead of breaking the
 * browse experience.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
    const logger = getLogger(context);

    if (request.method !== 'GET') {
        logger.warn('WishlistState: method not allowed', { method: request.method });
        return data<WishlistStateResponse>({ productIds: [] }, { status: 405, headers: NO_STORE_HEADERS });
    }

    const session = getAuth(context);
    if (!session.customerId) {
        return data<WishlistStateResponse>({ productIds: [] }, { headers: NO_STORE_HEADERS });
    }

    try {
        const { items } = await getWishlist(context, session.customerId);
        const productIds: string[] = [];
        for (const item of items) {
            if (item.productId && typeof item.productId === 'string' && item.productId.trim().length > 0) {
                productIds.push(item.productId);
            }
        }
        return data<WishlistStateResponse>({ productIds }, { headers: NO_STORE_HEADERS });
    } catch (error) {
        // The load is best-effort — never break browse on a failed read.
        logger.warn('WishlistState: getWishlist failed, returning empty state', { error });
        return data<WishlistStateResponse>({ productIds: [] }, { headers: NO_STORE_HEADERS });
    }
}
