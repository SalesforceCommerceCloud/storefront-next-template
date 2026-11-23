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
// @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import {
    getActionPath,
    isAmbientMutation,
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    isStoreQualificationMutation,
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    isStoreInventoryMutation,
} from './shared';

/**
 * `shouldRevalidate` policy for the home page. The loader fetches catalog, content and selected-store stock, so it opts out of
 * the post-action revalidation React Router runs by default — every non-navigating mutation submitted while the home
 * page is active (notably add-to-cart from the quick view modal) would otherwise re-issue its four fetches for no
 * observable change. The basket badge stays current on its own: the cart action returns the updated basket and sets
 * the `__sfdc_basket` cookie the basket provider reads client-side.
 *
 * Committed store changes refresh inventory-dependent shelves even when native qualification is unchanged.
 * Other exceptions are the shared {@link isAmbientMutation} dimensions: a currency switch genuinely changes the
 * loader's output (per-currency SCAPI prices), shopper-context updates change every SCAPI response, and an auth
 * identity transition changes customer-group-scoped SCAPI output (pricing / promotions) — so they must be allowed
 * through. Navigations and explicit `useRevalidator().revalidate()` calls carry no `formMethod` and are suppressed
 * too — a fresh navigation to the route is a new match that runs the loader regardless of this gate, and the basket
 * badge stays current via its provider rather than this loader.
 *
 * Wishlist note: the wishlist store's session binding is NOT threaded through this loader. The `_app` shell binds it
 * from client auth (`useAuth()` → `useWishlistSession`), so cross-shopper eviction happens on the shell re-render that
 * follows an identity transition, independent of this gate.
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
        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        if (
            actionPath &&
            (isStoreQualificationMutation(actionPath, actionResult) ||
                (getConfig().features?.localInventory?.enabled && isStoreInventoryMutation(actionPath, actionResult)))
        )
            return true;
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
        if (actionPath && isAmbientMutation(actionPath)) {
            return true;
        }
    }

    return false;
}
