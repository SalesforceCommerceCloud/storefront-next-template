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
import { resourceRoutes, routes } from '@/route-paths';

/**
 * @fileoverview Shared helpers for the `shouldRevalidate` policies in this folder.
 *
 * The request-wide dimensions a suppress-by-default policy MUST let through. A policy that opts a route out of React
 * Router's blanket post-action revalidation (an allowlist gate, as on home and the product listing pages) takes on the
 * burden of re-admitting every mutation that changes data the loader reads through an ambient input rather than the
 * URL. Revalidate-by-default policies (root, checkout, account) get these for free and need not import this module.
 *
 * Two ambient dimensions are modeled here, exposed both separately and as a combined predicate so each consumer admits
 * exactly the dimensions its loader is sensitive to:
 *
 * - **Context** ({@link isContextMutation}) — `set-site-context` (currency → per-currency SCAPI prices; site/locale
 *   switches hard-reload and bypass `shouldRevalidate`) and `update-shopper-context` (a cross-cutting input to every
 *   SCAPI response: pricing, promotions, A/B segments). These are unprefixed `/action/*` resource routes, matched
 *   exactly.
 * - **Auth identity** ({@link isIdentityMutation}) — `/login`, `/signup`, `/logout`. An identity transition re-scopes
 *   every customer-scoped read and any customer-group-scoped SCAPI output (pricing / promotions) a page loader reads.
 *   These are site/locale-prefixed (`buildUrl` prefixes them; they are not in `url.excludeRoutes`), so they are matched
 *   on the trailing path segment, anchored on a leading slash so a route like `/account/auto-logout` cannot match
 *   `/logout`. (Wishlist eviction rides the `_app` shell's client-auth binding, not a loader value.)
 *
 * {@link isAmbientMutation} is the union — the right gate for a page loader that stays matched across an identity
 * redirect back to its own route (home, the product listing pages), so it must re-run to refresh customer-group-scoped
 * reads. The resource-route fetcher policy (`api-client.ts`) admits {@link isContextMutation} only: identity routes
 * navigate away and the basket it governs is re-seeded server-side on that redirect, so a fetcher reload is redundant.
 *
 * Not modeled here, by design — a suppress-by-default policy must justify each omission against the route's loader:
 * `setSelectedStore` / `cartPickupStoreUpdate` (only stale a read that passes `query.inventoryIds`) and
 * `updateTrackingConsent` (consent → personalization; coupling unsettled). A policy whose loader reads store-scoped or
 * consent-gated data must enumerate those itself.
 */

/** Context — currency / shopper-context, unprefixed `/action/*` resource routes, matched by exact path. */
const CONTEXT_MUTATIONS: readonly string[] = [resourceRoutes.setSiteContext, resourceRoutes.updateShopperContext];

/** Auth identity — site/locale-prefixed routes, matched on the trailing path segment, anchored on a leading slash. */
const IDENTITY_MUTATIONS: readonly string[] = [routes.login, routes.signup, routes.logout];

/**
 * Normalizes a form action to a pathname for comparison: resolves it against the current origin (handling both a bare
 * path and an absolute URL) and drops any trailing query string (e.g. an index-route `?index`). Returns `undefined`
 * when no form action was submitted.
 */
export function getActionPath(formAction: string | undefined, origin: string): string | undefined {
    return formAction ? new URL(formAction, origin).pathname : undefined;
}

/**
 * Whether a submitted action path changes the request-wide context dimension — currency / shopper context. Exact-match
 * on the unprefixed `/action/*` routes.
 */
export function isContextMutation(actionPath: string): boolean {
    return CONTEXT_MUTATIONS.includes(actionPath);
}

/**
 * Whether a submitted action path is an auth identity transition (`/login`, `/signup`, `/logout`). Matches the
 * site/locale-prefixed routes on their anchored trailing segment (leading slash), so `/account/auto-logout` does not
 * match `/logout`.
 */
export function isIdentityMutation(actionPath: string): boolean {
    return IDENTITY_MUTATIONS.some((route) => actionPath === route || actionPath.endsWith(route));
}

/**
 * Whether a submitted action path is one of the ambient dimensions a suppress-by-default page loader must revalidate
 * for (see the module overview): the union of {@link isContextMutation} and {@link isIdentityMutation}.
 */
export function isAmbientMutation(actionPath: string): boolean {
    return isContextMutation(actionPath) || isIdentityMutation(actionPath);
}
