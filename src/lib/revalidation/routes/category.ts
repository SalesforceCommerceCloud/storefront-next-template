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
import { getSearchWithoutClientOnlyParams } from '@/hooks/use-filters-panel-state';
import { getActionPath, isAmbientMutation } from './shared';

/**
 * Shared `shouldRevalidate` policy for the product listing pages (category + search). Both routes derive their data
 * purely from the URL (`q` / `refine` / `sort` / `offset` / category id) and the site context (currency), so the
 * loader only needs to re-run when one of those actually changes.
 *
 * Two cases are suppressed beyond React Router's default:
 *
 * 1. **Client-only param toggles.** The filters-panel open/closed flag and pending-action params live in the URL for
 *    shareability but never affect server data. A navigation that touches only those, is skipped.
 * 2. **Listing-irrelevant mutations.** A non-`GET` submission triggers RR's default post-action revalidation, but
 *    cart/wishlist/etc. mutations don't change listing data — cart state propagates via the `__sfdc_basket` cookie
 *    and the action's own fetcher result, wishlist via the client-side module-level store. Only the shared
 *    {@link isAmbientMutation} dimensions are allowed to revalidate: currency / shopper-context change the
 *    loader's SCAPI prices and promotions, and an auth identity transition (login / signup / logout) changes
 *    customer-group-scoped SCAPI output (pricing / promotions). A submission with no resolvable `formAction`
 *    cannot be confirmed as an ambient dimension, so it is skipped too. (Wishlist eviction is handled by the
 *    `_app` shell from client auth, not this loader.)
 *
 * `setSelectedStore` / `cartPickupStoreUpdate` are intentionally NOT admitted: the listing's `productSearch` read
 * passes no `query.inventoryIds`, so a store change cannot stale its results. If a tile ever surfaces store-scoped
 * availability, this policy must enumerate those mutations itself.
 *
 * Everything else falls through to `defaultShouldRevalidate`, so genuine navigations (new query, refinement, sort,
 * page) and explicit `useRevalidator()` calls (no `formMethod`) behave normally.
 */
export function shouldRevalidate({
    currentUrl,
    nextUrl,
    formMethod,
    formAction,
    defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
    // Client-only param toggles (filters panel, pending action)
    const clientOnlyParamsChanged =
        currentUrl.pathname === nextUrl.pathname &&
        currentUrl.search !== nextUrl.search &&
        getSearchWithoutClientOnlyParams(currentUrl.search) === getSearchWithoutClientOnlyParams(nextUrl.search);
    if (clientOnlyParamsChanged) {
        return false;
    }

    // A mutation submitted from the listing (formMethod is set and non-GET). Skip the revalidation unless the action
    // is one of the ambient dimensions that actually changes listing data. An unclassifiable submission (no
    // `formAction`) cannot be confirmed as an ambient dimension, so it is skipped too.
    if (formMethod && formMethod !== 'GET') {
        const actionPath = getActionPath(formAction, currentUrl.origin);
        if (!actionPath || !isAmbientMutation(actionPath)) {
            return false;
        }
    }

    return defaultShouldRevalidate;
}
