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
import type { RouterContextProvider } from 'react-router';
import { getRequestFromContext } from '@/middlewares/request-origin';

/**
 * Trim the leading entry from a comma-separated forwarded header value,
 * returning `undefined` if the entry is empty after trim. The empty case
 * matters because `??` only falls through `null`/`undefined` — coercing
 * `''` here keeps callers from stitching together malformed URLs like
 * `https://` (no host) or `://example.com` (no scheme).
 */
function firstForwardedValue(headerValue: string | null | undefined): string | undefined {
    if (!headerValue) return undefined;
    const trimmed = headerValue.split(',')[0].trim();
    return trimmed === '' ? undefined : trimmed;
}

/**
 * Exact-match localhost check. Substring matches (e.g. `localhost.example.com`,
 * `mylocalhost.com`) must NOT downgrade the protocol to http — that would ship
 * insecure callback URLs in customer emails when the storefront runs on a
 * vanity hostname containing the literal `localhost`.
 */
const isLocalhostHost = (host: string): boolean => host === 'localhost' || host.startsWith('localhost:');

/**
 * Compute the public origin from request headers, preferring the forwarded
 * host (set by eCDN to the customer-facing domain on MRT). Returns `null`
 * when no header is available so callers can fall back to env-based origin.
 *
 * Reads the following request headers (no environment variables):
 * - `x-forwarded-host` — preferred; takes the first value if comma-separated
 * - `x-forwarded-proto` — preferred when present, else `https` (or `http`
 *   for an exact-match `localhost` host)
 * - `host` — fallback when forwarded headers are missing
 *
 * Trust model: this reads `x-forwarded-host` directly. That header is only
 * safe when the deployment is fronted by a proxy that strips client-supplied
 * values:
 * - On MRT, the eCDN does this and the Lambda function URL is not directly
 *   reachable, so the only path to the app is via the eCDN.
 * - In local dev the SDK's host-header middleware sets the value from
 *   `EXTERNAL_DOMAIN_NAME` when missing, so a developer's machine never
 *   reads an attacker-supplied header.
 *
 * If a deployment ever exposes the runtime directly (no eCDN, raw Lambda
 * function URL, etc.), an attacker could spoof `x-forwarded-host` and
 * poison the URL embedded in the magic-link / reset-password emails this
 * value feeds into. Don't add such a deployment shape without putting an
 * env-pinned canonical-host override in front of this resolver, mirroring
 * `getPublicOrigin` in `packages/storefront-next-ci/src/dashboard/lib/utils.ts`.
 */
export function resolveRequestOrigin(request: Request): string | null {
    const forwardedProto = firstForwardedValue(request.headers.get('x-forwarded-proto'));
    const forwardedHost = firstForwardedValue(request.headers.get('x-forwarded-host'));

    if (forwardedHost) {
        const protocol = forwardedProto ?? (isLocalhostHost(forwardedHost) ? 'http' : 'https');
        return `${protocol}://${forwardedHost}`;
    }

    const host = request.headers.get('host');
    if (host) {
        const protocol = forwardedProto ?? (isLocalhostHost(host) ? 'http' : 'https');
        return `${protocol}://${host}`;
    }

    return null;
}

/**
 * Per-request memoization keyed by router context. The router instantiates a
 * fresh `RouterContextProvider` per request, so the WeakMap entry naturally
 * scopes to a single request's lifetime — same shape as the SCAPI client
 * dedupe registry in `lib/api-clients.server.ts`.
 *
 * Header parsing is dirt-cheap individually, but `createApiClients` runs on
 * effectively every request that talks to SCAPI. Caching avoids reparsing
 * within the same request when both the SCAPI client and an auth callback
 * URL builder ask for the origin.
 */
const ORIGIN_CACHE = new WeakMap<Readonly<RouterContextProvider>, string | null>();

/**
 * Returns the application's origin.
 *
 * This function is isomorphic, it can be used on the client and server, but
 * the resolution mechanism differs by environment:
 *
 * Server:
 * 1. The origin parsed from the in-flight `Request` stashed in `context` by
 *    `requestOriginMiddleware` (derived from `x-forwarded-host` /
 *    `x-forwarded-proto`). This is what lets a single deployment serve
 *    multiple custom domains correctly. Memoized per request.
 * 2. `EXTERNAL_DOMAIN_NAME` env var, for callsites without a context (e.g.
 *    bootstrap-time JWKS URLs).
 *
 * Client: always `window.location.origin`. The `context` argument is
 * intentionally ignored on the client — `requestOriginMiddleware` is server-only
 * (and not registered in `clientMiddleware` in `root.tsx`) because client
 * navigations don't have an incoming HTTP request with forwarding headers; the
 * `Request` the router synthesizes is a fetch-spec Request, not the original
 * eCDN-fronted one. `window.location.origin` already reflects the actual
 * public domain the user is browsing, which is what we want.
 *
 * Lives in its own module (rather than `lib/utils.ts`) so that broadly-imported
 * client utilities like `cn()` don't drag the request-origin middleware — and
 * its `react-router` `createContext` call site — into every client chunk.
 *
 * @env EXTERNAL_DOMAIN_NAME — Public hostname used as the bootstrap-time fallback
 *   when no router context is available. Optional. Example:
 *   `my-storefront.commercecloud.salesforce.com` or `localhost:5173`.
 *
 * @param context - Router context. Pass when available so the request's
 *   actual public origin is used rather than the env-var fallback. Ignored
 *   on the client (see above).
 */
export const getAppOrigin = (context?: Readonly<RouterContextProvider>): string => {
    if (context) {
        let origin = ORIGIN_CACHE.get(context);
        if (origin === undefined) {
            const request = getRequestFromContext(context);
            origin = request ? resolveRequestOrigin(request) : null;
            ORIGIN_CACHE.set(context, origin);
        }
        if (origin) return origin;
    }

    if (typeof window !== 'undefined') {
        return window.location.origin;
    }

    const EXTERNAL_DOMAIN_NAME = process.env.EXTERNAL_DOMAIN_NAME || 'localhost:5173';
    const protocol = isLocalhostHost(EXTERNAL_DOMAIN_NAME) ? 'http' : 'https';
    return `${protocol}://${EXTERNAL_DOMAIN_NAME}`;
};

/**
 * Returns true when the request's `Origin` or `Referer` header matches the
 * server's own origin. Used by resource routes to reject cross-origin fetches.
 *
 * **Referrer-Policy dependency:** same-origin `fetch()` GETs — the kind
 * `useFetcher.load()` issues — do not include an `Origin` header per the Fetch
 * spec (browsers only send `Origin` for cross-origin or credentialed requests).
 * Same-origin GETs therefore fall through to the `Referer` check, which means
 * this function depends on the storefront's `Referrer-Policy` being
 * `strict-origin-when-cross-origin` (or looser). If the policy is ever
 * tightened to `no-referrer`, or if a browser extension / network appliance
 * strips the `Referer` header, `isSameOrigin` will return `false` for
 * legitimate same-origin fetches and resource routes will respond with 403.
 * See `README-SECURITY-HEADERS.md` before changing the Referrer-Policy.
 */
export function isSameOrigin(request: Request): boolean {
    let serverOrigin: string;
    try {
        serverOrigin = new URL(resolveRequestOrigin(request) ?? request.url).origin;
    } catch {
        return false;
    }

    const requestUrlOrigin = new URL(request.url).origin;
    const origin = request.headers.get('origin');
    if (origin) {
        return origin === serverOrigin || origin === requestUrlOrigin;
    }

    // No Origin header on same-origin GETs (see JSDoc). Fall back to Referer,
    // which is present as long as Referrer-Policy is not set to no-referrer.
    const referer = request.headers.get('referer');
    if (!referer) {
        return false;
    }

    try {
        const refererOrigin = new URL(referer).origin;
        return refererOrigin === serverOrigin || refererOrigin === requestUrlOrigin;
    } catch {
        return false;
    }
}
