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

/**
 * Client-safe shared wishlist types and sentinels.
 *
 * Lives outside the `.server.ts` boundary so the client bundle (e.g. `<WishlistProvider>`,
 * `_app.tsx` route component) can import the type and `EMPTY_WISHLIST_STATE` without
 * pulling server-only modules. The server-side fetch helper (`fetch-initial-state.server.ts`)
 * imports from here and adds the loader logic.
 */

/**
 * Server-resolved wishlist state used to seed `<WishlistProvider>`.
 *
 * The provider issues add/remove through the `/action/wishlist-*` server actions,
 * which are keyed by `productId` and resolve the list/item IDs server-side — so the
 * client only needs the set of product IDs already in the wishlist (to paint filled
 * hearts) and `customerId` as the signed-in gate.
 */
export type WishlistInitialState = {
    customerId: string | null;
    productIds: ReadonlySet<string>;
};

export const EMPTY_WISHLIST_STATE: WishlistInitialState = {
    customerId: null,
    productIds: new Set(),
};
