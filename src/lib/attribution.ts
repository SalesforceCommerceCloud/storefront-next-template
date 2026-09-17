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

/**
 * Client-side helpers for the `dw_attribution` first-touch marketing-attribution cookie
 * (W-23493124).
 *
 * CIP (Commerce Intelligence Platform) attributes placed orders back to the marketing campaign that
 * drove the shopper. At order placement ECOM reads this cookie server-side and emits
 * `entryRequestURL` + `sessionReferrer`. On SFRA/SiteGenesis ECOM reads the ClickStream first-click
 * URL, but headless flows have no ClickStream, so the storefront must write the value into a
 * first-party cookie that rides along to SCAPI on the order call. The cookie name and value format
 * are a cross-system contract ECOM reads verbatim — do not change them.
 *
 * A cookie (rather than `session.custom` or Shopper Context `customQualifiers`) is used because it
 * is independent of the SLAS USID, which rotates on logout — so attribution survives
 * `login -> logout -> re-login` within a visit.
 *
 * ## Why the client writes it (not an SSR middleware)
 *
 * The cookie is written in the browser (see `useAttribution`), not by a response-phase middleware,
 * for two reasons a server-side writer cannot satisfy:
 *  - A CDN document-cache hit serves cached HTML from the edge and never runs the SSR handler, so a
 *    server-written cookie is lost on cached landing pages (the common case for a campaign home
 *    page — the `Referer` isn't in the cache key and there is no `Vary` on it). Client JS runs in
 *    every browser regardless of the response cache, reading this shopper's own `document.referrer`
 *    / `location.search`.
 *  - The cookie is not HttpOnly, so the client can also clear it the instant a shopper opts out of
 *    tracking (an in-session consent change), without waiting for the next full-page navigation.
 *    Not being HttpOnly is safe here: the value is non-PII marketing data the page can already read
 *    from `location.search` / `document.referrer`, and it is never used for authorization.
 *
 * The value is an allowlist only, sanitized at write time (no free-text query params are stored):
 * percent-encoded `key=value` pairs joined with `&`, e.g.
 *   utm_source=google&utm_medium=cpc&gclid=abc123&ref=https%3A%2F%2Fblog.com%2Fpost%3Futm_source%3Dnews
 * which ECOM URL-decodes to `ref = https://blog.com/post?utm_source=news` and emits as
 * `sessionReferrer`. The referrer keeps its origin, path, and its own allowlisted params; free-text
 * query, the fragment, and credentials are dropped.
 */
import { isValidCookieDomain } from '@salesforce/storefront-next-runtime/cookie-domain';
import { createLogger } from '@/lib/logger';

const logger = createLogger();

export const ATTRIBUTION_COOKIE_NAME = 'dw_attribution';

// Attribution params captured from the current (entry/landing) request URL. Includes the three
// major ad-network click IDs — gclid (Google), fbclid (Meta/Facebook), msclkid (Microsoft/Bing) —
// which all arrive as query params on the landing URL when a shopper clicks through a paid ad.
export const LANDING_PARAM_ALLOWLIST = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid',
    'fbclid',
    'msclkid',
] as const;

// Attribution params captured from the referrer URL. Same set as the landing allowlist: the click
// IDs arrive on the landing URL, but may also appear on an external referrer, and none are PII.
export const REFERRER_PARAM_ALLOWLIST = [...LANDING_PARAM_ALLOWLIST] as const;

// Absolute (write-once, not sliding) TTL for the cookie: 30 minutes.
export const ATTRIBUTION_COOKIE_MAX_AGE_SECONDS = 30 * 60;

// Cap the serialized cookie value to keep the cookie small (it shares the request Cookie-header
// budget with the SLAS/session cookies forwarded to SCAPI).
export const MAX_ATTRIBUTION_COOKIE_VALUE_LENGTH = 2000;

/**
 * Build the sanitized `ref` component from a referrer URL.
 *
 * Keeps the referrer's origin, path, and its own allowlisted attribution params. Drops free-text
 * query params, the fragment, and any credentials (userinfo). Same-origin referrers are dropped —
 * they are internal navigation, not attribution.
 *
 * @param refererHeader - raw referrer value (`document.referrer`)
 * @param requestHostname - hostname of the current page (`location.hostname`)
 * @returns the sanitized referrer URL, or '' when there is nothing to keep
 */
export function buildSanitizedReferrer(
    refererHeader: string | null | undefined,
    requestHostname: string | undefined
): string {
    if (!refererHeader) return '';

    let url: URL;
    try {
        url = new URL(refererHeader);
    } catch {
        // Malformed referrer — ignore it.
        return '';
    }

    // Only http(s) referrers are meaningful for web attribution.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';

    // Same-origin navigation is not attribution; only keep external referrers.
    if (requestHostname && url.hostname === requestHostname) return '';

    // Keep only the referrer's own allowlisted attribution params.
    const refParams = new URLSearchParams();
    for (const key of REFERRER_PARAM_ALLOWLIST) {
        const value = url.searchParams.get(key);
        if (value) refParams.set(key, value);
    }
    const qs = refParams.toString();

    // `url.origin` is protocol + host (+ port) only — it excludes any `user:password@` credentials.
    // We keep `url.pathname` (the referrer path is part of the attribution signal ECOM emits as
    // sessionReferrer) but deliberately drop `url.hash` and any non-allowlisted query params.
    return `${url.origin}${url.pathname}${qs ? `?${qs}` : ''}`;
}

/**
 * Serialize ordered `[key, value]` pairs to percent-encoded `key=value` pairs joined with `&`
 * (the `dw_attribution` cookie value format).
 */
function serializePairs(pairs: Array<[string, string]>): string {
    const params = new URLSearchParams();
    // URLSearchParams preserves insertion order, so the serialized order is stable.
    for (const [key, value] of pairs) params.set(key, value);
    return params.toString();
}

/**
 * Build the full `dw_attribution` cookie value from the current page.
 *
 * @param input.searchParams - the current URL's query params (`new URLSearchParams(location.search)`)
 * @param input.referer - raw referrer value (`document.referrer`)
 * @param input.requestHostname - current hostname (drops same-origin referrers)
 * @returns the cookie value, or '' when there is nothing to attribute
 */
export function buildAttributionValue({
    searchParams = new URLSearchParams(),
    referer,
    requestHostname,
}: {
    searchParams?: URLSearchParams;
    referer?: string | null;
    requestHostname?: string;
} = {}): string {
    // Landing params first, in allowlist order; then the sanitized referrer.
    // `URLSearchParams.get` returns the first value of a repeated param and null when absent, so a
    // bracket-notation param like `?utm_source[x]=y` is a distinct key that never matches here (and
    // never serializes to junk like `[object Object]`).
    const pairs: Array<[string, string]> = [];
    for (const key of LANDING_PARAM_ALLOWLIST) {
        const value = searchParams.get(key);
        if (value) pairs.push([key, value]);
    }
    const ref = buildSanitizedReferrer(referer, requestHostname);
    if (ref) pairs.push(['ref', ref]);

    let value = serializePairs(pairs);
    if (value.length <= MAX_ATTRIBUTION_COOKIE_VALUE_LENGTH) return value;

    // Over budget. Drop `ref` first — it is the longest component and the current URL's own params
    // are the primary attribution signal.
    let trimmed = pairs.filter(([key]) => key !== 'ref');
    value = serializePairs(trimmed);

    // Still over budget (a pathologically long param value): drop the least-critical trailing
    // params until it fits.
    while (value.length > MAX_ATTRIBUTION_COOKIE_VALUE_LENGTH && trimmed.length > 0) {
        trimmed = trimmed.slice(0, -1);
        value = serializePairs(trimmed);
    }
    return value;
}

/**
 * Validate a configured cookie `Domain`, using the runtime's shared {@link isValidCookieDomain} so
 * the client agrees with the server (`resolveCookieDomain`) and the site-context middleware. An
 * invalid value — a wildcard or a stray `,`/`;`/`=`/whitespace, which a browser rejects and where a
 * `;` could even be read as an extra cookie attribute — falls back to a host-scoped cookie (returns
 * undefined). Warns at most once.
 */
let warnedInvalidCookieDomain = false;
function validateClientCookieDomain(cookieDomain: string | undefined): string | undefined {
    if (!cookieDomain) return undefined;
    if (!isValidCookieDomain(cookieDomain)) {
        if (!warnedInvalidCookieDomain) {
            warnedInvalidCookieDomain = true;
            logger.warn(
                'dw_attribution: ignoring invalid cookieDomain; cookie domains must not contain ' +
                    'wildcards or special characters (e.g. ".example.com"). Falling back to a ' +
                    'host-scoped cookie.',
                { cookieDomain }
            );
        }
        return undefined;
    }
    return cookieDomain;
}

/**
 * Serialize a `document.cookie` write string for the `dw_attribution` cookie.
 *
 * @param value - the cookie value (already percent-encoded `key=value` pairs) — written verbatim,
 *   or '' for a deletion
 * @param options.maxAge - `Max-Age` in seconds (0 deletes the cookie)
 * @param options.cookieDomain - value for the `Domain` attribute
 * @param options.secure - append `Secure` (only over HTTPS)
 * @returns a string suitable for assigning to `document.cookie`
 */
export function serializeAttributionCookie(
    value: string,
    { maxAge, cookieDomain, secure }: { maxAge?: number; cookieDomain?: string; secure?: boolean } = {}
): string {
    const domain = validateClientCookieDomain(cookieDomain);
    const parts = [`${ATTRIBUTION_COOKIE_NAME}=${value}`];
    // Emit Max-Age for any defined value, including 0 (a deletion).
    if (typeof maxAge === 'number') parts.push(`Max-Age=${maxAge}`);
    parts.push('Path=/');
    // Lax (not Strict) lets the cookie ride along on the top-level cross-site navigation from the
    // ad/referrer that is the whole point of attribution.
    parts.push('SameSite=Lax');
    if (domain) parts.push(`Domain=${domain}`);
    if (secure) parts.push('Secure');
    return parts.join('; ');
}

/**
 * Read the raw `dw_attribution` value from `document.cookie`.
 *
 * Used only as the write-once presence check, so the raw (still-encoded) value is returned as-is;
 * the caller only cares whether the cookie exists.
 *
 * @returns the raw value, or null when absent
 */
function readAttributionCookie(): string | null {
    const match = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${ATTRIBUTION_COOKIE_NAME}=`));
    if (!match) return null;
    return match.slice(ATTRIBUTION_COOKIE_NAME.length + 1);
}

export type CaptureAttributionOptions = {
    /** value for the cookie's `Domain` attribute (from the resolved site/app cookie domain) */
    cookieDomain?: string;
    /** defaults to `document.referrer` */
    referer?: string;
    /** defaults to `window.location.search` */
    search?: string;
    /** defaults to `window.location.hostname` */
    hostname?: string;
    /** defaults to whether the page is served over HTTPS */
    secure?: boolean;
};

/**
 * Write the first-touch `dw_attribution` cookie in the browser.
 *
 * Write-once (first touch wins): does nothing when the cookie already exists. Reads the current
 * URL's query params and the referrer, sanitizes them to the allowlist, and writes the cookie only
 * when there is something to attribute — so ordinary (non-campaign) traffic is left untouched.
 *
 * All work is wrapped in a fail-open boundary: attribution is best-effort and must never break the
 * app.
 */
export function captureAttribution(options: CaptureAttributionOptions = {}): void {
    if (typeof document === 'undefined') return;
    try {
        const {
            cookieDomain,
            referer = document.referrer,
            search = window.location.search,
            hostname = window.location.hostname,
            secure = window.location.protocol === 'https:',
        } = options;

        // First touch wins — never overwrite an existing attribution cookie.
        if (readAttributionCookie() != null) return;

        const value = buildAttributionValue({
            searchParams: new URLSearchParams(search),
            referer,
            requestHostname: hostname,
        });

        // Nothing to attribute: leave everything untouched.
        if (!value) return;

        // `value` is already a safe set of percent-encoded `key=value` pairs joined with `&` — it
        // carries no cookie separators — so write it verbatim. Do NOT re-encode it (e.g. via
        // js-cookie's default converter): that would double-encode the value and break the agreed
        // on-the-wire format ECOM reads.
        document.cookie = serializeAttributionCookie(value, {
            maxAge: ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
            cookieDomain,
            secure,
        });
    } catch (error) {
        // Attribution is best-effort; never let it break the app.
        logger.warn('dw_attribution: skipping cookie capture due to error', { error });
    }
}

export type ClearAttributionOptions = {
    /** must match the write's `Domain` or the browser will not drop the cookie */
    cookieDomain?: string;
    /** defaults to whether the page is served over HTTPS */
    secure?: boolean;
};

/**
 * Expire any existing `dw_attribution` cookie.
 *
 * Called when the shopper has opted out of tracking (`dw_dnt=1`) so a first-touch value captured
 * before the opt-out is not forwarded on a later order. The `Domain` and `Path` must match the
 * original write or the browser will not drop the cookie.
 */
export function clearAttribution(options: ClearAttributionOptions = {}): void {
    if (typeof document === 'undefined') return;
    try {
        const { cookieDomain, secure = window.location.protocol === 'https:' } = options;
        document.cookie = serializeAttributionCookie('', {
            maxAge: 0,
            cookieDomain,
            secure,
        });
    } catch (error) {
        logger.warn('dw_attribution: skipping cookie clear due to error', { error });
    }
}
