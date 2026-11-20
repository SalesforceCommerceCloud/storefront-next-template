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
import {
    getActionPath,
    isAmbientMutation,
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    isStoreQualificationMutation,
} from './shared';

/**
 * `shouldRevalidate` policy for the wishlist pages (`/wishlist` and `/account/wishlist`). Both render from the same
 * `loadWishlistPageData` shape — items + a deferred `productsByProductId` Promise — so they share one policy.
 *
 * The loader fetches the shopper's wishlist items and the product details for the tiles. Cart adds, wishlist toggles,
 * payment changes, and account-preference mutations submitted from this page change none of that data, so the default
 * post-action revalidation would re-issue an expensive `getCustomerProductLists` SCAPI read plus the per-item product
 * lookups for no observable change. The tile grid still updates on remove without a loader re-run: the wishlist tile's
 * remove fetcher feeds the parent's `disabledItemIds` Set in `wishlist-page.tsx`, which filters the rendered list
 * client-side. Add-to-cart from a wishlist tile updates the mini-cart via the basket cookie that the basket provider
 * reads.
 *
 * The exceptions are the {@link isAmbientMutation} dimensions: a currency switch genuinely changes the loader's output
 * (per-currency SCAPI prices), shopper-context updates change every SCAPI response, and an auth identity transition
 * (login / signup / logout) re-scopes the auth-dependent wishlist seed — the loader's `getCustomerProductLists` read
 * returns the shopper's saved items for a registered session and nothing for a guest. Navigations and explicit
 * `useRevalidator().revalidate()` calls carry no `formMethod` and are suppressed too — a fresh navigation re-matches
 * the route and runs the loader regardless of this gate.
 * @see https://reactrouter.com/start/framework/route-module#shouldrevalidate
 */
export function shouldRevalidate({
    currentUrl,
    formMethod,
    formAction,
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    actionResult,
}: ShouldRevalidateFunctionArgs): boolean {
    if (formMethod && formMethod !== 'GET') {
        const actionPath = getActionPath(formAction, currentUrl.origin);
        // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
        if (actionPath && isStoreQualificationMutation(actionPath, actionResult)) return true;
        if (actionPath && isAmbientMutation(actionPath)) {
            return true;
        }
    }

    return false;
}
