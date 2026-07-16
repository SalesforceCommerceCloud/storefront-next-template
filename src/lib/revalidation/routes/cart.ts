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
import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { resourceRoutes } from '@/route-paths';
import { getActionPath } from './shared';

/**
 * The cart-line wishlist toggle. The only mutation this revalidate-by-default route denies: the route tracks wishlist
 * state client-side (pinned promises + the `useWishlist` fetcher) and the audit confirms the write touches only
 * `getCustomerProductList(s)`, which the cart's basket / products / promotions never read.
 */
const WISHLIST_MUTATIONS: readonly string[] = [resourceRoutes.wishlistAdd, resourceRoutes.wishlistRemove];

/**
 * `shouldRevalidate` policy for the cart route (`/cart`).
 *
 * Unlike the home / PDP / product-listing pages — which opt OUT of post-action revalidation by default because the
 * basket never feeds their loaders — the cart loader's primary, rendered-from-loader-data content IS the basket: it
 * `await`s `getBasket`, the in-basket product details (store-scoped via `inventoryIds` under BOPIS), the
 * promotion callouts keyed on each line's `priceAdjustment.promotionId`, and the BOPIS pickup stores. Those are
 * exactly the reads coupled to cart, promo, and pickup-store mutations:
 *
 * - `addItemToBasket` / `removeItemFromBasket` / `updateItemInBasket` (cart-item-* + bonus-product-add) → `getBasket`
 *   `basket.productItems[]` / totals / `priceAdjustments[]` — server-recalculated on every line change.
 * - `addCouponToBasket` / `removeCouponFromBasket` (promo-code-*) → `basket.couponItems[]` and the promotion IDs the
 *   loader feeds to `getPromotions`.
 * - BOPIS `updateShipmentForBasket` (cart-pickup-store-update) and `setSelectedStore` → `basket.shipments[]` and the
 *   store-scoped `inventories[].ats` the in-basket product read returns for the new `inventoryIds` (the loader derives
 *   them from the pickup shipments). Both are allowed to revalidate via the default rather than being enumerated.
 *
 * So the cart is a REVALIDATE-by-default route. This policy is therefore a denylist (the safe action is to re-run),
 * matching the `checkout.ts` model rather than the `home.ts` / `product.ts` allowlist model. The shared ambient
 * dimensions (currency / shopper-context) and identity transitions (login / signup / logout) need no explicit
 * admission here — they fall through to `defaultShouldRevalidate`, which is `true` for a post-action pass, so this
 * module does not import `shared.ts`'s ambient predicate.
 *
 * The one denied class is the wishlist toggle from a cart line (`wishlist-add` / `wishlist-remove`). Two reasons, both
 * decisive:
 *
 *   1. **Correctness/UX.** The route pins `wishlistProductIdsPromise` via lazy `useState`, and the cart-line wishlist
 *      button tracks its own state through the client-side `useWishlist` fetcher. A
 *      revalidation here re-runs the loader → fresh basket Promise identity → the basket `<Await>` re-suspends →
 *      cart-line Suspense subtrees unmount → the in-flight wishlist `useFetcher` is orphaned mid-submit (see the route
 *      component's pinning rationale in `_app.cart.tsx`).
 *   2. **No coupling.**: wishlist writes touch only `getCustomerProductList(s)`, which the cart loader's pinned seed
 *      reads once at mount and never re-renders from. The basket, products, and promotions the cart shows are untouched
 *      by a wishlist toggle.
 *
 * A submission with no resolvable `formAction` is left to revalidate (the safe default for this denylist route) — a
 * wishlist toggle always posts to its dedicated action route, so an unclassifiable submission is never one.
 * @see https://reactrouter.com/start/framework/route-module#shouldrevalidate
 */
export function shouldRevalidate({
    currentUrl,
    formMethod,
    formAction,
    defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
    if (formMethod && formMethod !== 'GET') {
        const actionPath = getActionPath(formAction, currentUrl.origin);
        if (actionPath && WISHLIST_MUTATIONS.includes(actionPath)) {
            return false;
        }
    }

    return defaultShouldRevalidate;
}
