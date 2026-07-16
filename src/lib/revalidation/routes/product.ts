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
import { getActionPath, isAmbientMutation } from './shared';

/**
 * Mutations whose result changes a field the PDP loader reads, so they MUST trigger its re-run. The PDP loader is
 * expensive — it `await`s `fetchProductById` (availability, prices, promotions, variations) and the reviews summary,
 * then fans out to category, Page Designer, BNPL, reviews list, returns/warranty, FAQ, and estimated-delivery fetches.
 * React Router re-runs the whole loader after *every* action submission by default, so a single add-to-cart on the PDP
 * re-issues that entire fan-out for data the cart never touched. This route therefore opts out of the blanket
 * post-action revalidation and re-admits only the writes proven to feed the loader.
 *
 * This is an allowlist matched on the same suppress-by-default model as the home and product-listing pages: the safe
 * action is to skip, and each admitted mutation is justified against a loader read:
 *
 * - **{@link isAmbientMutation}** — the shared request-wide dimensions. `set-site-context` (currency → per-currency
 *   prices) and `update-shopper-context` (a cross-cutting input to all SCAPI pricing/promotions) change the product
 *   read; `/login` `/signup` `/logout` change customer-group-scoped SCAPI output (pricing / promotions). A logout
 *   submitted while on the PDP keeps the route matched, so this gate must re-run it. (Wishlist eviction is handled by
 *   the `_app` shell from client auth, not this loader.)
 * - **Store selection** — `setSelectedStore` / `cartPickupStoreUpdate` change the selected store, and the PDP loader
 *   passes `inventoryIds: [selectedStoreInfo.inventoryId]` to `getProduct`, so the store-scoped `inventories[].ats`
 *   the loader reads goes stale (`shared-backend-state`, keyed on the `inventory_ids` param).
 * - **`addReview`** — changes the reviews summary/list the loader reads for this product.
 *
 * Everything else is skipped by omission: cart / promo / wishlist state reaches the client without this loader (basket
 * via the `__sfdc_basket` cookie + `BasketProvider`, wishlist via the client-side module-level store), and
 * account / payment / address writes touch only `getBasket` / `getCustomer`, which the PDP never reads. The audit
 * explicitly refutes a cart→availability edge (a cart edit reserves no inventory) and a cart→reviews-summary edge.
 * `updateTrackingConsent` is omitted deliberately: its coupling is unsettled and the loader reads no consent-gated
 * field — matching the home / listing precedent. A loader change that begins reading store-default availability or
 * consent-gated data must add the corresponding mutation here.
 */
const PRODUCT_RELEVANT_MUTATIONS: readonly string[] = [
    // Store selection — the PDP loader scopes `getProduct` to the selected store's `inventoryIds`.
    resourceRoutes.setSelectedStore,
    resourceRoutes.cartPickupStoreUpdate,
    // Reviews — changes the reviews summary/list the loader reads for this product.
    resourceRoutes.addReview,
];

/**
 * Whether a submitted action path changes data the PDP loader reads: one of the shared ambient dimensions
 * (currency / shopper-context / auth identity) or a product-specific write ({@link PRODUCT_RELEVANT_MUTATIONS}).
 */
function isProductRelevantMutation(actionPath: string): boolean {
    return isAmbientMutation(actionPath) || PRODUCT_RELEVANT_MUTATIONS.includes(actionPath);
}

/**
 * `shouldRevalidate` policy for the PDP route. It gates two axes:
 *
 * - **Action axis** — suppress-by-default: a non-`GET` submission skips the expensive loader re-run unless it is a
 *   product-relevant mutation ({@link isProductRelevantMutation}). An unclassifiable submission (no resolvable
 *   `formAction`) is skipped too — a product-relevant write always posts to a dedicated action route.
 * - **Navigation axis** — revalidate on a different product (`pathname`) or a different variant (`pid`), but skip
 *   client-only search-param changes (color/size) the loader doesn't consume, so the page doesn't flash a skeleton
 *   when swapping swatches. An explicit `useRevalidator().revalidate()` (which arrives with `defaultShouldRevalidate`
 *   true and no `formMethod`) still forces a re-run.
 */
export function shouldRevalidate({
    currentUrl,
    nextUrl,
    formMethod,
    formAction,
    defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
    // Action axis: skip the loader re-run unless the mutation feeds the loader. A relevant mutation forces `true`
    // unconditionally, NOT `defaultShouldRevalidate` — unlike the listing policy (category.ts) which defers admitted
    // mutations to the default. The PDP carries a custom navigation axis (RR's default mishandles `pid`/swatch
    // params), so this axis is a standalone yes/no with no navigation nuance left to defer to.
    if (formMethod && formMethod !== 'GET') {
        const actionPath = getActionPath(formAction, currentUrl.origin);
        return Boolean(actionPath && isProductRelevantMutation(actionPath));
    }

    // Navigation axis: revalidate for a different product or variant.
    if (
        currentUrl.pathname !== nextUrl.pathname ||
        currentUrl.searchParams.get('pid') !== nextUrl.searchParams.get('pid')
    ) {
        return true;
    }

    // Same product and variant: defer to the default rather than hard-skipping. An explicit revalidate() arrives
    // with it true and forces a re-run; a client-only param change (color/size) arrives with it false and is skipped.
    return defaultShouldRevalidate;
}
