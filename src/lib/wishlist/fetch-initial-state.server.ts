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
import { getAuth } from '@/middlewares/auth.server';
import { getWishlist } from '@/lib/api/wishlist.server';
import { EMPTY_WISHLIST_STATE, type WishlistInitialState } from './state';

/**
 * SCAPI's product-list endpoints accept both guest (gcid) and registered (rcid) tokens —
 * the only requirement is a valid `customerId` and a non-expired access token. This
 * matches `/action/wishlist-add`'s behavior, which has supported guest wishlists for
 * gcid-bearing sessions since before this migration.
 */
function hasValidWishlistSession(session: ReturnType<typeof getAuth>): boolean {
    return (
        Boolean(session.customerId) &&
        Boolean(session.accessToken) &&
        typeof session.accessTokenExpiry === 'number' &&
        session.accessTokenExpiry > Date.now()
    );
}

/**
 * Loads the shopper's wishlist state for app-shell hydration. Works for both guest
 * (gcid) and registered (rcid) sessions — SCAPI's product-list endpoints accept either
 * token type, so the only requirement is a valid `customerId`.
 *
 * Read-only: uses `getWishlist`, never `getOrCreateWishlist`, so hydrating hearts on a
 * fresh shopper never creates an empty list. A shopper with no wishlist resolves to an
 * empty set; the list is provisioned lazily on the first add, when `WishlistProvider`
 * posts to `/action/wishlist-add`.
 *
 * Throws `NormalizedApiError` (or other errors from SCAPI) on failure — does NOT catch.
 * Callers wrap rejection (`<Await errorElement>`) for silent degradation.
 *
 * Sessions without a usable `customerId` return `EMPTY_WISHLIST_STATE` without calling SCAPI.
 */
export async function fetchWishlistInitialState(context: LoaderFunctionArgs['context']): Promise<WishlistInitialState> {
    const session = getAuth(context);
    if (!hasValidWishlistSession(session) || !session.customerId) {
        return EMPTY_WISHLIST_STATE;
    }

    const customerId = session.customerId;
    const { items } = await getWishlist(context, customerId);

    const productIds = new Set<string>();
    for (const item of items) {
        if (item.productId && typeof item.productId === 'string' && item.productId.trim().length > 0) {
            productIds.add(item.productId);
        }
    }

    return { customerId, productIds };
}
