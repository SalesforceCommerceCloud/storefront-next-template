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
 * Prepend the url prefix to a URL path based on SITE_ALIAS and
 * LOCALE environment variables. Both are optional; whichever is present
 * is included, with SITE_ALIAS first when both exist.
 *
 * Only apply this to test-authored path literals and parameters.
 * Do NOT apply to URLs extracted from the page DOM — those already reflect
 * the storefront's rendered routing and would be double-prefixed.
 *
 * @param path - A root-relative URL path, e.g. `/checkout` or `/account/orders`
 * @returns The path with any applicable url prefix prepended
 *
 * @example
 * // SITE_ALIAS=default, LOCALE=en-GB
 * buildSitePath('/checkout') // => '/default/en-GB/checkout'
 *
 * @example
 * // SITE_ALIAS=default, LOCALE unset
 * buildSitePath('/checkout') // => '/default/checkout'
 *
 * @example
 * // Both unset
 * buildSitePath('/checkout') // => '/checkout'
 */
export function buildSitePath(path: string): string {
    const siteRef = process.env.SITE_ALIAS;
    const localeRef = process.env.LOCALE;

    const prefix = [siteRef, localeRef].filter(Boolean).join('/');
    if (!prefix) return path;

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `/${prefix}${normalizedPath}`;
}

/**
 * Determine whether a URL is within a route path, including when site and locale
 * segments precede the route.
 *
 * @param url - URL to inspect
 * @param route - Route path without leading or trailing slashes
 */
export function isRoutePath(url: URL, route: string): boolean {
    const normalizedRoute = route.replace(/^\/+|\/+$/g, '');
    return url.pathname.includes(`/${normalizedRoute}/`);
}
