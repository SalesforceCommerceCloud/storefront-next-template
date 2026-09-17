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
 * Cookie `Domain` attribute validation.
 *
 * This is the single source of truth for "is this configured cookie domain safe to emit?", shared
 * by every place that turns a merchant-configured `cookies.domain` into a `Set-Cookie` / `document.
 * cookie` `Domain` attribute:
 *  - the site-context middleware here (site / locale / currency cookies), and
 *  - the templates' server (`resolveCookieDomain`) and client (`dw_attribution`) cookie writers.
 *
 * It is a pure, dependency-free module (no React, no `react-router`, no node built-ins) so the same
 * check is client-safe and adds negligible weight to a browser bundle. Callers keep their own
 * logging and host-only fallback; this module only answers the yes/no question.
 */

// Reject cookie-domain values a browser will drop, or that could inject an extra cookie attribute:
// wildcards (`*`), separators (`,`), an `=`, whitespace, or a stray `;`. Conservative on purpose —
// it still accepts leading/trailing dots, subdomains, `localhost`, and bare IPs.
const INVALID_COOKIE_DOMAIN_PATTERN = /[*,;=\s]/;

/**
 * Whether `domain` is safe to use as a cookie `Domain` attribute.
 *
 * An empty/`undefined` domain is treated as valid: it means "emit no `Domain` attribute" (host-only
 * scoping), which is always safe. A non-empty value is valid only when it contains no wildcard,
 * separator, `=`, or whitespace.
 *
 * Callers that want to warn on a *misconfigured* (non-empty but invalid) domain should short-circuit
 * the empty case first, then treat a `false` result as "invalid — warn and fall back to host-only".
 *
 * @param domain - the configured cookie domain (e.g. `.example.com`), or empty/`undefined`
 * @returns `true` when the value needs no `Domain` attribute or is a safe one; `false` when it is a
 *   non-empty value a browser would reject.
 */
export function isValidCookieDomain(domain: string | undefined | null): boolean {
    return !domain || !INVALID_COOKIE_DOMAIN_PATTERN.test(domain);
}
