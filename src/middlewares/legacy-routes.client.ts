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
import type { DataStrategyResult, MiddlewareFunction } from 'react-router';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { stripPathPrefix } from '@salesforce/storefront-next-runtime/site-context';
import type { AppConfig } from '@/types/config';
// Pure matching/suffix helpers live in a plain (non-`.client`) module so they're usable during
// SSR too (the site-aware <Link> calls them). React Router strips `*.client` exports on the
// server, so they cannot live in this file. See `legacy-routes.ts`.
import { appendSuffix, findLegacyRoute } from '@/middlewares/legacy-routes';

/**
 * Client-side middleware that intercepts navigation to legacy routes and forces a full page navigation.
 *
 * This middleware runs before any loaders or components render, checking if the current
 * navigation target is a configured legacy route. If so, it triggers a full page navigation
 * to let the CDN/server handle routing to the legacy backend (e.g., SFRA, SiteGenesis).
 *
 * Configuration:
 * Set `site.hybrid.legacyRoutes` in your config to define which routes should trigger redirects.
 * Supports exact paths, single-segment named params (`:name`), and multi-segment wildcards
 * (`*`) — the latter two follow React Router-style syntax.
 *
 * Each entry is either a bare pattern string or `{ pattern, suffix }`. The optional `suffix` is
 * appended to the stripped pathname when the full-page redirect is built. This handles legacy
 * SEO URLs that carry a file extension: SFCC appends `.html` to product/category SEO URLs (when
 * `StorefrontURLsEnabled` is on), while routes like `/cart` resolve as clean paths. Without the
 * suffix, a redirect to `/product/123` would 404 on the legacy backend that expects
 * `/product/123.html`.
 *
 * Example:
 * ```
 * site: {
 *   hybrid: {
 *     enabled: true,
 *     legacyRoutes: [
 *       '/checkout',                                  // Exact match, no suffix
 *       '/account/orders',                            // Exact match
 *       { pattern: '/product/:id', suffix: '.html' }, // Single segment, redirect adds .html
 *       '/category/:categoryId/item/:itemId',         // Multiple single segments
 *       '/categoryLv1/*',                             // Splat: /categoryLv1/shoes, /categoryLv1/shoes/running
 *       '/category/:cat/*',                           // :param + splat combined
 *       '/files/*-thumb'                              // '*' may appear anywhere, not only trailing
 *     ]
 *   }
 * }
 * ```
 *
 * Note: `/categoryLv1/*` does NOT match the bare `/categoryLv1` (no trailing slash). If you
 * need both, list `/categoryLv1` as a separate exact entry. The bare pattern `'*'` matches any
 * path (catch-all).
 *
 * Flow:
 * 1. User clicks <Link to="/checkout">
 * 2. React Router begins client-side navigation
 * 3. This middleware checks if /checkout matches any pattern in legacyRoutes
 * 4. If yes → appends the matched route's suffix (if any) and triggers a full-page navigation →
 *    server/CDN handles routing
 * 5. If no → continue normal client-side navigation
 *
 * Note: this middleware is a backstop for programmatic `navigate()` to a legacy route. Link
 * clicks are handled earlier by `@/components/link`, which renders legacy routes with
 * `reloadDocument` so React Router never starts a client navigation (see that file for why).
 *
 * No loop guard is needed. The redirect produces a full-document load, and React Router does NOT
 * run client middleware on the initial document load / hydration (only on subsequent client-side
 * navigations) in this SSR app — so a legacy route the CDN fails to route away lands once on the
 * catch-all 404 rather than re-entering this middleware and looping. (PWA Kit needed a
 * `redirected=1` guard because its client router re-ran on every load; that leaked the param to
 * the legacy backend, which 404s on the unexpected query string.)
 */

const legacyRoutesMiddleware: MiddlewareFunction<Record<string, DataStrategyResult>> = async (
    { request, context },
    next
) => {
    // Only run on client-side
    if (typeof window === 'undefined') {
        return next();
    }

    const config = context.get(appConfigContext) as AppConfig | undefined;
    const enabled = config?.hybrid?.enabled ?? false;
    const legacyRoutes = config?.hybrid?.legacyRoutes;

    // If hybrid mode is disabled or no legacy routes configured, skip
    if (!enabled || !legacyRoutes || legacyRoutes.length === 0) {
        return next();
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // Never hand Storefront Next infrastructure paths (data endpoints, static assets) to the legacy
    // backend. React Router runs client middleware for fetcher/data loads too — not just page
    // navigations — so this middleware also sees requests like `/resource/basket-products`,
    // `/action/*`, `*.data`, `/mobify/*`, and `/assets/*`. None are legacy routes.
    //
    // This guard is essential because the prefix-stripping below can mis-reduce a two-segment path
    // to `/`: with `url.prefix = '/:siteId/:localeId'`, both prefix segments are wildcards, so
    // `stripPathPrefix('/resource/basket-products')` (or `/assets/x.js`) strips the first two
    // segments and yields `/`. If `/` is a configured legacy route, that fetcher/asset load would be
    // redirected to the legacy backend (a full-page navigation to `/`), bouncing the user off
    // Storefront Next. The list covers the union of the dev proxy's own skips (`shouldSkipProxy`)
    // and the infra patterns the eCDN routing rules keep on Storefront Next — the client middleware
    // can't query the CDN, so it hard-codes the superset as a failsafe regardless of URL prefix.
    if (
        /^\/(resource|action|mobify|assets)(\/|$)/.test(pathname) ||
        pathname.endsWith('.data') ||
        /\.(js|jsx|ts|tsx|css|json|map|woff2?|ttf|svg|png|jpe?g|gif|webp|ico|mp4)$/i.test(pathname)
    ) {
        return next();
    }

    // Normalize the pathname by stripping the site context prefix before matching.
    //
    // When the url prefix is other than '/', every subpage URL is prefixed accordingly to the
    // config (e.g. '/checkout' → '/global/en-GB/checkout'). Without stripping, the incoming
    // pathname would never match the bare paths configured in legacyRoutes. Stripping early
    // normalizes the URL so the matching logic always operates on functional paths rather than
    // URL variations.
    //
    // Why this approach:
    // - No config bloat: '/cart' is defined once — you don't need a separate entry for every
    //   site/locale permutation (e.g. '/global/en-GB/cart', '/us/en-US/cart').
    // - Consistency: uses the same normalized path that ecdn-matcher and the runtime use.
    // - Centralized strategy: the prefix pattern comes from config.url.prefix, so changing
    //   your URL strategy (e.g. '/:siteId/:localeId' → '/:localeId') requires only one
    //   update — the legacyRoutes list stays untouched.
    const urlPrefix = config?.url?.prefix ?? '';
    const strippedPathname = stripPathPrefix({ pathname, prefix: urlPrefix }) || '/';
    const matchedRoute = findLegacyRoute(strippedPathname, legacyRoutes);

    if (matchedRoute) {
        // Navigate to the stripped pathname so the legacy backend (or local hybrid proxy)
        // can apply its own site/locale prefix without doubling up on storefront-next's.
        // Without this, '/global/en-GB/cart' would be handed to the proxy, which prepends
        // its own SFRA prefix and produces '/s/{siteId}/{locale}/global/en-GB/cart' — a 404.
        //
        // Append the matched route's suffix (e.g. '.html') so legacy SEO URLs resolve. The
        // suffix goes on the path, before the query string and hash, so '/product/123' becomes
        // '/product/123.html' while '?source=cart' and any '#fragment' are preserved below.
        const redirectPathname = appendSuffix(strippedPathname, matchedRoute.suffix);
        const legacyUrl = new URL(redirectPathname, url.origin);
        legacyUrl.search = url.search;
        legacyUrl.hash = url.hash;

        // Force a full page navigation to hit the server/CDN
        // The CDN routing rules or server middleware will handle routing to the legacy backend
        window.location.href = legacyUrl.toString();

        // Suspend indefinitely while the browser navigates away.
        // Returning an empty object would cause React Router to error with
        // "No result returned from dataStrategy" since it expects a DataStrategyResult
        // for every matched route. This never-resolving promise keeps React Router
        // waiting until the page unloads. It's zero-cost (no timers or listeners)
        // and is garbage collected when the browser completes the navigation.
        // oxlint-disable-next-line @typescript-eslint/no-empty-function
        return new Promise(() => {});
    }

    // Not a legacy route, continue with normal client-side navigation
    return next();
};

export default legacyRoutesMiddleware;
