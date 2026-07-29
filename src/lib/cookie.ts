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

// Client-safe cookie reading shared across commerce domains (currency, basket, …).
// Server-side cookie writing/namespacing lives in `cookie-utils.server.ts` (which pulls
// in React Router context and env helpers); keep this module free of those so it can run
// in the browser.

/** Escape regex metacharacters so a cookie name (e.g. `currency.v2`) is matched literally. */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the named cookie from a raw `Cookie` header and decode the value our middlewares
 * write via React Router's `createCookie`. Returns the parsed JSON value (of unknown shape —
 * callers narrow/validate it) or `null` when the cookie is absent or decoding fails.
 *
 * # ASCII-only decode shortcut
 *
 * For an ASCII payload, React Router's encode pipeline
 * (`JSON.stringify → encodeURIComponent → myUnescape → btoa → encodeURIComponent`) collapses to a
 * plain `btoa(JSON.stringify(...))` post-decode, so inverting it is just
 * `decodeURIComponent → atob → JSON.parse`. If a cookie ever carries non-ASCII content, the writer
 * and this reader must both invert the full pipeline (adding the `myEscape`/`myUnescape` bridge);
 * until then callers guard against Mojibake by validating the decoded value is ASCII-shaped.
 *
 * @see {@link https://github.com/remix-run/react-router/blob/main/packages/react-router/lib/server-runtime/cookies.ts}
 */
export function parseCookie(cookieHeader: string, cookieName: string): unknown {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escapeRegExp(cookieName)}=([^;]+)`));
    if (!match) {
        return null;
    }
    try {
        return JSON.parse(atob(decodeURIComponent(match[1])));
    } catch {
        return null;
    }
}
