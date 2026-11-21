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
const protectedCookieName = /^(?:cc-taob-|cc-auth-fence-|cc-auth-provenance_)/;

/** Privacy classification only: never use cookie-name presence as authorization or identity. */
export function hasProtectedAuthCookies(header: string | null): boolean {
    return (header ?? '').split(';').some((entry) => protectedCookieName.test(entry.trim().split('=')[0]));
}

/** Over-matching only makes a response private, so normalize case, percent-encoding, and repeated slashes. */
export function isAgentLifecycleUrl(url: string): boolean {
    let path = new URL(url).pathname;
    try {
        path = decodeURIComponent(path);
    } catch {
        // A malformed escape cannot be decoded; match the raw path.
    }
    return /\/login\/agent(?:\/authorize|\/callback|\/complete)?(?:\.data)?\/?$/.test(
        path.toLowerCase().replace(/\/{2,}/g, '/')
    );
}

/** The entry form posts back to itself; `no-referrer` would make the browser send `Origin: null` and fail the CSRF checks. */
function isAgentEntryUrl(url: string): boolean {
    return /\/login\/agent(?:\.data)?\/?$/.test(new URL(url).pathname);
}

/** Keep cookie-bound identity/version payloads private, including errors and the first fenced response. */
export function applyAuthPrivacyHeaders(request: Request, headers: Headers): void {
    const lifecycle = isAgentLifecycleUrl(request.url);
    const setsProtectedCookie = headers.getSetCookie().some((cookie) => protectedCookieName.test(cookie));
    if (!lifecycle && !hasProtectedAuthCookies(request.headers.get('cookie')) && !setsProtectedCookie) return;
    headers.set('Cache-Control', 'private, no-store');
    headers.set('CDN-Cache-Control', 'no-store');
    headers.set('Surrogate-Control', 'no-store');
    headers.set('Referrer-Policy', isAgentEntryUrl(request.url) ? 'same-origin' : 'no-referrer');
    if (lifecycle) headers.set('X-Robots-Tag', 'noindex, nofollow');
}
