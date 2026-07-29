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
import type { MiddlewareFunction } from 'react-router';
import { getAuth } from '@/middlewares/auth.server';
import { createCookie } from '@/lib/cookie-utils.server';
import { getLogger } from '@/lib/logger.server';
import { USERTYPE_COOKIE_NAME, validateUserType, type UserType } from '@/lib/auth/user-type-hint';

// One year. The hint is a non-sensitive UI-restore convenience, not an auth token — it does not gate
// access to anything (the server is always the source of truth), so it can outlive the short-lived
// token cookies. A stale hint self-corrects: the response phase rewrites it on every non-cached
// request from the authoritative session, and the client validates it on read.
const USERTYPE_HINT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * userType-hint middleware — writes the JS-readable UI-restore hint for the shopper's auth state.
 *
 * Writes the `__sfdc_usertype` companion cookie in its **response phase** (after downstream
 * loaders/actions run via `next()`), so the value reflects the final per-request session state —
 * e.g. a just-completed login flips guest → registered before the cookie is serialized. This mirrors
 * how the basket middleware serializes `__sfdc_basket` after `next()`.
 *
 * The cookie carries the guest/registered flag **only** and is written `httpOnly:false` so
 * `AuthProvider` can restore the header auth state and wishlist-icon path on the client when a shared,
 * cached app-shell HTML document froze the loader-baked `userType`. See the App Shell Caching LLD.
 *
 * ## Security invariants (LLD §8)
 *
 * - This middleware writes ONLY the `userType` hint. It NEVER reads or writes the httpOnly token
 *   cookies (`cc-at`, `cc-nx`, `cc-nx-g`, `usid`, …). `usid` in particular is a session correlator
 *   and must stay `httpOnly:true`, server-only, out of every hint — a JS-readable copy is an XSS
 *   session-hijacking vector.
 * - The hint is strictly less than what the SSR hydration payload already exposes today, so it is a
 *   net security improvement, not a new exposure.
 * - `customerId` / `encUserId` are intentionally absent — no shell branch needs them.
 *
 * The value is written through the template cookie helpers, so it is auto-namespaced `_{siteId}` and
 * inherits the configured cookie domain / `Secure` posture. It is serialized as base64(JSON) — the
 * same on-the-wire format as the currency and basket companion cookies — so the client reads it back
 * through the shared `parseCookie` helper rather than a bespoke decoder.
 */
export const userTypeHintMiddleware: MiddlewareFunction<Response> = async ({ context }, next) => {
    const response = await next();

    const logger = getLogger(context);

    // Read the authoritative, final session state for this request. getAuth() reads request-scoped
    // context populated by the auth middleware, so a login/logout that happened in a downstream
    // action is already reflected here.
    let authResolved = false;
    let userType: UserType | null = null;
    try {
        userType = validateUserType(getAuth(context).userType);
        authResolved = true;
    } catch {
        // getAuth throws when the auth middleware did not initialize (e.g. an early error response).
        // The hint is a best-effort convenience — skip it rather than fail the response.
        logger.debug('userType hint: auth context unavailable, skipping');
    }

    const cookie = createCookie<string>(USERTYPE_COOKIE_NAME, { httpOnly: false, sameSite: 'lax' }, context);

    if (!userType) {
        // The session resolved but carries no meaningful userType — the logged-out / destroyed state
        // `destroyAuth()` leaves behind (logout, or an auth error that clears the session). A
        // previously-written `registered` hint has a year-long max-age, so leaving it in place would
        // mis-restore the header/wishlist to a signed-in state for a now-guest shopper the next time
        // they land on a cached app shell (where the origin doesn't run to overwrite it). Actively
        // expire it, mirroring the auth middleware's destroyed-session cleanup (auth.server.ts) which
        // deletes its cookies with `expires: new Date(0)`.
        //
        // Only do this when auth actually resolved. If getAuth() threw (no auth context — an early
        // error response), we can't tell what the session is, so leave any existing hint untouched
        // rather than clobber a valid one on a transient error.
        if (authResolved) {
            response.headers.append(
                'Set-Cookie',
                await cookie.serialize('', { maxAge: undefined, expires: new Date(0) })
            );
            logger.debug('userType hint: session has no userType, expired any stale hint');
        }
        return response;
    }

    // `httpOnly:false` so the client can read it. Serialize as base64(JSON) — the documented inverse
    // of the shared `parseCookie` reader (`JSON.parse(atob(...))`) — so the hint is read back the same
    // way as the currency/basket companion cookies. `userType` is a fixed ASCII enum, so this stays
    // within `parseCookie`'s ASCII-only decode shortcut.
    response.headers.append(
        'Set-Cookie',
        await cookie.serialize(btoa(JSON.stringify(userType)), { maxAge: Math.floor(USERTYPE_HINT_MAX_AGE_MS / 1000) })
    );

    logger.debug('userType hint: wrote hint', { userType });

    return response;
};

export default userTypeHintMiddleware;
