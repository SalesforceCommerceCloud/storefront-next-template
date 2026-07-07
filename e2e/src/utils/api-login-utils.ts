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

import type { RegisteredTokens } from './scapi-helper';

/**
 * SFCC cookie names used by the storefront's SCAPI/SLAS auth scheme, parameterized
 * by the site ID. Single source of truth — referenced by api-login-utils,
 * api-cart-setup.flow, login.flow (logout), and storefront.page.
 */
export interface SfccCookieNames {
    /** SLAS access token (JWT). Used for both guest and registered sessions. */
    accessToken: string;
    /** SLAS refresh token for a registered (logged-in) session. */
    registeredRefresh: string;
    /** SLAS refresh token for a guest session. */
    guestRefresh: string;
    /** SCAPI user session ID. */
    usid: string;
    /** Customer ID (set on registered sessions). */
    customerId: string;
    /** Storefront-set basket snapshot (NOT site-scoped). */
    basket: string;
}

export function getSfccCookieNames(siteId: string): SfccCookieNames {
    return {
        accessToken: `cc-at_${siteId}`,
        registeredRefresh: `cc-nx_${siteId}`,
        guestRefresh: `cc-nx-g_${siteId}`,
        usid: `usid_${siteId}`,
        customerId: `customer_id_${siteId}`,
        basket: '__sfdc_basket',
    };
}

/**
 * Cookie attributes shared by every SFCC session cookie injected by the E2E
 * harness: the domain comes from the storefront origin, path is always root,
 * `secure` follows the protocol, and SameSite is Lax (matches the cookies the
 * storefront sets in production).
 */
export interface CookieDefaults {
    domain: string;
    path: '/';
    secure: boolean;
    sameSite: 'Lax';
}

export function buildCookieDefaults(origin: string): CookieDefaults {
    const url = new URL(origin);
    return {
        domain: url.hostname,
        path: '/',
        secure: url.protocol === 'https:',
        sameSite: 'Lax',
    };
}

/**
 * Cookie shape compatible with Playwright's `addCookies()`. Re-declared here so
 * the pure helper can be unit-tested without pulling in Playwright types.
 */
export interface PlaywrightCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    sameSite: 'Lax' | 'Strict' | 'None';
    httpOnly: boolean;
}

/**
 * Cookie operations needed to transition the Playwright browser context into a
 * registered-shopper session: which cookie names to clear first, and which
 * cookies to add. Callers should apply `clear` then `add`.
 */
export interface RegisteredSessionCookieOps {
    /** Cookie names to clear before adding the new session cookies. */
    clear: string[];
    /** Cookies to add for the registered session. */
    add: PlaywrightCookie[];
}

/**
 * Build the cookie operations that transition the browser to a registered-shopper
 * session.
 *
 * Mirrors the storefront's auth middleware on a real UI login (see
 * `src/middlewares/auth.server.ts`):
 *
 * - **Adds** `cc-at_` (access token), `cc-nx_` (registered refresh token, no `-g`
 *   suffix — the `-g` variant is for guest sessions), `usid_` (user session ID),
 *   and `customerId_`.
 * - **Clears** `cc-nx-g_` (guest refresh token). The middleware deletes it on
 *   login to enforce its "exactly one refresh token cookie exists" invariant.
 *   The middleware uses cookie-presence to derive user type, so leaving both
 *   cookies present after API login would diverge from the real-login state and
 *   break tests that assert on the absence of the guest cookie post-login (see
 *   `login.spec.ts` "Guest shopper login transitions cookies" scenario).
 *
 * Domain comes from the BASE_URL origin so cookies are scoped correctly under
 * both `http://localhost` and `https://*.mobify-storefront.com`.
 *
 * **Cookie expiry is intentionally omitted (session cookies).** In production
 * the auth middleware sets `expires` on each cookie (~30 min for access token,
 * the JWT-claim duration for refresh token). Tests scope every login to the
 * Playwright browser context's lifetime, which is much shorter than the
 * production expiries — so for setup-style tests the difference is invisible.
 * It is **not** invisible for tests that assert on cookie expiry behavior
 * (token rotation, "session expires after N minutes", etc.). Those tests
 * should use `loginFlow.execute()` (real UI login) so they exercise the
 * production cookie attributes, not this helper.
 *
 * Pure function — no Playwright/CodeceptJS dependency — so it can be unit-tested
 * directly.
 */
export function buildRegisteredSessionCookieOps(
    siteId: string,
    tokens: RegisteredTokens,
    origin: string
): RegisteredSessionCookieOps {
    const cookieDefaults = buildCookieDefaults(origin);
    const names = getSfccCookieNames(siteId);

    return {
        clear: [names.guestRefresh],
        add: [
            { ...cookieDefaults, name: names.accessToken, value: tokens.accessToken, httpOnly: true },
            { ...cookieDefaults, name: names.registeredRefresh, value: tokens.refreshToken, httpOnly: true },
            { ...cookieDefaults, name: names.usid, value: tokens.usid, httpOnly: true },
            { ...cookieDefaults, name: names.customerId, value: tokens.customerId, httpOnly: true },
        ],
    };
}
