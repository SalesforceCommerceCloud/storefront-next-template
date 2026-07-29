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
import { resourceRoutes, routes } from '@/route-paths';
import { CHECKOUT_ACTION_INTENTS } from '@/components/checkout/utils/checkout-context-types';
import { getActionPath } from './shared';

/**
 * Mutations that change none of the fields the root loader returns. The root loader is synchronous (no SCAPI I/O), but
 * its return — `appConfig`, `seoMeta`, `errorTranslations`, etc. — is re-serialized into the response on every
 * revalidation. Skipping that for these submissions avoids re-sending the full root payload after the interaction.
 *
 * Every entry is proven on two axes: (1) the action mutates no root field — it never calls `updateAuth` (so
 * `clientAuth` is untouched) and writes no site/locale/currency cookie; and (2) it is submitted via a non-navigating
 * `useFetcher().submit()` and returns data (not a `redirect`), so root would otherwise revalidate for nothing.
 * Cart/wishlist state reaches the client without the root loader anyway — the basket via the `__sfdc_basket` cookie +
 * `BasketProvider` and the action's own fetcher result, the wishlist via the client-side module-level wishlist store;
 * `basketSnapshot` on the root loader is only an SSR seed, the cookie is the post-hydration source of truth.
 *
 * This is a denylist, NOT an allowlist. The root loader carries `clientAuth`, so the safe default must be to
 * revalidate: a forgotten entry only wastes a payload, whereas a wrongly-skipped auth-relevant mutation would leave
 * `clientAuth` stale (stale header auth state, broken post-login pending-action resume). Only paths proven to touch no
 * root field belong here — notably NOT `setSiteContext` (currency/site/locale), `updateTrackingConsent`,
 * `verifyPasswordlessOtp`, or `postOrderRegister`, each of which changes `clientAuth` or the site context.
 * `updateShopperContext` is deliberately excluded too. The shopper context is a cross-cutting input to every SCAPI
 * response (promotions, pricing, A/B segments); keeping it on the revalidating path is the safe stance. So is
 * `setSelectedStore`: the root loader returns `selectedStoreInfo` sourced from the cookie that action writes.
 */
const ROOT_IRRELEVANT_MUTATIONS: readonly string[] = [
    // Cart & wishlist — state propagates via cookie/provider, never the root loader.
    resourceRoutes.cartItemAdd,
    resourceRoutes.cartItemRemove,
    resourceRoutes.cartItemUpdate,
    resourceRoutes.cartBundleAdd,
    resourceRoutes.cartBundleUpdate,
    resourceRoutes.cartSetAdd,
    resourceRoutes.bonusProductAdd,
    resourceRoutes.promoCodeAdd,
    resourceRoutes.promoCodeRemove,
    resourceRoutes.wishlistAdd,
    resourceRoutes.wishlistRemove,
    // Account & preferences — SCAPI-only mutations, no `updateAuth`, no site-context cookie.
    resourceRoutes.updateMarketingConsent,
    resourceRoutes.paymentMethodAdd,
    resourceRoutes.paymentMethodRemove,
    resourceRoutes.paymentMethodSetDefault,
    resourceRoutes.customerPreferencesUpdate,
    // Pre-auth flows — SLAS calls that issue no session (distinct from verifyPasswordlessOtp, which logs in).
    resourceRoutes.requestPasswordReset,
    resourceRoutes.otpRequest,
    resourceRoutes.otpVerify,
    // Extension actions — same two axes hold. Notably NOT setSelectedStore: the root loader returns `selectedStoreInfo`
    // from the selected-store cookie that action writes, so it must keep revalidating.
    resourceRoutes.cartPickupStoreUpdate,
    resourceRoutes.addReview,
];

// Checkout step intents — same two axes as ROOT_IRRELEVANT_MUTATIONS: each step action touches only the basket, no
// `updateAuth`, no site/locale/currency cookie write. Step submissions post back to `/checkout` itself, so they need
// an intent check (below) rather than a path-only match. Derived from CHECKOUT_ACTION_INTENTS so a new step intent
// automatically participates in the skip.
const CHECKOUT_STEP_INTENTS: ReadonlySet<string> = new Set(Object.values(CHECKOUT_ACTION_INTENTS));

/**
 * `shouldRevalidate` policy for the root route. Suppresses the root loader's post-action revalidation only for
 * mutations proven not to affect any root field ({@link ROOT_IRRELEVANT_MUTATIONS}).
 *
 * Everything else defers to `defaultShouldRevalidate`:
 *
 * - **Navigations and explicit `useRevalidator().revalidate()` calls** carry no `formMethod`, so they always fall
 *   through. This is load-bearing — the checkout login flow and the back/forward `BackNavigationRevalidator` call
 *   `revalidate()` specifically to refresh `clientAuth`, and the currency switch (`set-site-context`) submits an
 *   action whose result the root loader must pick up.
 * - **Unlisted mutations** fall through too, so a new auth-/currency-/locale-affecting action revalidates by default
 *   until it is explicitly proven safe to skip.
 * @see https://reactrouter.com/start/framework/route-module#shouldrevalidate
 */
export function shouldRevalidate({
    currentUrl,
    formMethod,
    formAction,
    formData,
    defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
    if (formMethod && formMethod !== 'GET') {
        const actionPath = getActionPath(formAction, currentUrl.origin);
        if (!actionPath) {
            return defaultShouldRevalidate;
        }
        if (ROOT_IRRELEVANT_MUTATIONS.includes(actionPath)) {
            return false;
        }
        // Checkout step submissions: post back to `/checkout` itself; dispatch on the `intent` form field.
        if (actionPath.endsWith(routes.checkout)) {
            const intent = formData?.get('intent');
            if (typeof intent === 'string' && CHECKOUT_STEP_INTENTS.has(intent)) {
                return false;
            }
        }
    }

    return defaultShouldRevalidate;
}
