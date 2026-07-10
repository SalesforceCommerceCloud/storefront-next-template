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
import type { Url } from '../config/types';

/**
 * Parses search config string into key-value pairs, preserving ':param' placeholders.
 * '?lng=:localeId&site=:siteId' → { lng: ':localeId', site: ':siteId' }
 */
export function parseSearchConfig(search: string): Record<string, string> {
    const searchParams = new URLSearchParams(search);
    const result: Record<string, string> = {};
    for (const [key, value] of searchParams) {
        result[key] = value;
    }
    return result;
}

/**
 * Extracts parameter names from a prefix string.
 * '/:siteId/:localeId' → ['siteId', 'localeId']
 */
export function extractPrefixParams(prefix: string): string[] {
    const matches = prefix.match(/:(\w+)/g);
    return matches ? matches.map((m) => m.slice(1)) : [];
}

/**
 * Splits a URL string into its component parts.
 * '/product/123?color=red#details' → { pathname: '/product/123', search: 'color=red', hash: '#details' }
 */
export function decomposeUrl(url: string): { pathname: string; search: string; hash: string } {
    const hashIdx = url.indexOf('#');
    const hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
    const withoutHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
    const searchIdx = withoutHash.indexOf('?');
    const search = searchIdx >= 0 ? withoutHash.slice(searchIdx + 1) : '';
    const pathname = searchIdx >= 0 ? withoutHash.slice(0, searchIdx) : withoutHash;
    return { pathname, search, hash };
}

/**
 * Resolves a prefix template by replacing parameter placeholders with values.
 *
 * @example
 * resolvePrefix({ prefix: '/:siteId/:localeId', params: { siteId: 'global', localeId: 'en-GB' } })
 * // → '/global/en-GB'
 */
export function resolvePrefix({ prefix, params }: { prefix: string; params: Record<string, string> }): string {
    let resolved = prefix;
    for (const paramName of extractPrefixParams(prefix)) {
        const value = params[paramName];
        if (value) {
            resolved = resolved.replace(`:${paramName}`, value);
        }
    }
    return resolved;
}

/**
 * Strips a URL prefix from a pathname.
 *
 * Accepts either a resolved prefix or a prefix pattern — segments may be
 * literal strings (must match the pathname exactly) or `:param` placeholders
 * (match any segment value). Mixed prefixes are supported.
 *
 * Returns `''` when the pathname matches the prefix exactly with no remainder
 * (so concatenating `prefix + result` round-trips the input), `pathname`
 * unchanged when literal segments don't match or the path is shorter than the
 * prefix, or the bare remainder otherwise. Callers that need the homepage to
 * be `'/'` should coerce: `stripPathPrefix(...) || '/'`.
 *
 * @example
 * stripPathPrefix({ pathname: '/global/en-GB/checkout', prefix: '/:siteId/:localeId' })   // → '/checkout'
 * stripPathPrefix({ pathname: '/global/en-GB/checkout', prefix: '/global/en-GB' })        // → '/checkout'
 * stripPathPrefix({ pathname: '/shop/en-GB/x',          prefix: '/shop/:localeId' })      // → '/x'
 * stripPathPrefix({ pathname: '/global/en-GB',          prefix: '/:siteId/:localeId' })   // → ''
 * stripPathPrefix({ pathname: '/checkout',              prefix: '/:siteId/:localeId' })   // → '/checkout'
 * stripPathPrefix({ pathname: '/other/x',               prefix: '/global/en-GB' })        // → '/other/x'
 * stripPathPrefix({ pathname: '/x',                     prefix: '' })                     // → '/x'
 */
export function stripPathPrefix({ pathname, prefix }: { pathname: string; prefix: string }): string {
    if (!prefix || prefix === '/') return pathname;

    const prefixSegments = prefix.split('/').filter(Boolean);
    const pathSegments = pathname.split('/').filter(Boolean);

    if (pathSegments.length < prefixSegments.length) return pathname;

    // Literal segments must match exactly; ':param' segments match anything.
    for (let i = 0; i < prefixSegments.length; i++) {
        const segment = prefixSegments[i];
        if (!segment.startsWith(':') && segment !== pathSegments[i]) {
            return pathname;
        }
    }

    const remaining = pathSegments.slice(prefixSegments.length);
    return remaining.length === 0 ? '' : `/${remaining.join('/')}`;
}

/**
 * Extracts the values of `:param` placeholders in a prefix pattern from a pathname.
 *
 * Mirrors {@link stripPathPrefix}'s matching rules: literal segments must match the
 * pathname exactly, `:param` segments capture the corresponding path segment. Returns
 * an empty object when the pathname doesn't carry the prefix (a literal segment
 * mismatches, or the path has fewer segments than the prefix) — so a non-empty result
 * is a reliable signal that the prefix was present.
 *
 * Pair this with {@link stripPathPrefix}: strip gives you the bare functional path,
 * this gives you the site/locale the path carried. Together they let a caller
 * re-decorate a path for a different URL shape without double-stacking.
 *
 * @example
 * extractPrefixParamValues({ pathname: '/global/en-GB/cart', prefix: '/:siteId/:localeId' }) // → { siteId: 'global', localeId: 'en-GB' }
 * extractPrefixParamValues({ pathname: '/uk/cart',           prefix: '/:localeId' })          // → { localeId: 'uk' }
 * extractPrefixParamValues({ pathname: '/shop/uk/x',         prefix: '/shop/:localeId' })     // → { localeId: 'uk' }
 * extractPrefixParamValues({ pathname: '/cart',              prefix: '/:siteId/:localeId' })  // → {} (too few segments)
 * extractPrefixParamValues({ pathname: '/other/x',          prefix: '/shop/:localeId' })     // → {} (literal mismatch)
 * extractPrefixParamValues({ pathname: '/cart',              prefix: '' })                    // → {}
 */
export function extractPrefixParamValues({
    pathname,
    prefix,
}: {
    pathname: string;
    prefix: string;
}): Record<string, string> {
    if (!prefix || prefix === '/') return {};

    const prefixSegments = prefix.split('/').filter(Boolean);
    const pathSegments = pathname.split('/').filter(Boolean);

    if (pathSegments.length < prefixSegments.length) return {};

    const values: Record<string, string> = {};
    for (let i = 0; i < prefixSegments.length; i++) {
        const segment = prefixSegments[i];
        if (segment.startsWith(':')) {
            values[segment.slice(1)] = pathSegments[i];
        } else if (segment !== pathSegments[i]) {
            // Literal segment doesn't match — the path doesn't carry this prefix.
            return {};
        }
    }
    return values;
}

/**
 * Detects a link that targets somewhere outside this app's routing and must NOT receive the
 * site/locale prefix. Three shapes count as external:
 *
 * 1. **Explicit scheme** — `https://…`, `mailto:…`, `tel:…`, `ftp://…`, etc. Matched by a leading
 *    `scheme:` per RFC 3986 (a letter followed by letters/digits/`+`/`-`/`.`, then `:`).
 * 2. **Protocol-relative** — `//example.com/page`.
 * 3. **Scheme-less bare domain** — what a merchant typically types into a Page Designer link field,
 *    e.g. `www.google.com` or `example.com/products`. It does not start with `/`, and its first
 *    path segment contains a dot (a hostname), so it is not an in-app route. These are normalized
 *    to `https://` by {@link buildUrl} so the browser performs a real cross-origin navigation
 *    instead of resolving them as a relative in-app path (which would glue the site prefix on and
 *    produce a broken link like `/global/en-GBwww.google.com`).
 *
 * A rooted path is always internal, even when it contains a dot (e.g. `/assets/sitemap.xml`).
 * Conversely, an *unrooted* dotted value with no slash (e.g. `page.html`, `sitemap.xml`) is
 * genuinely ambiguous — filename or domain — and is intentionally treated as a domain
 * (`https://page.html`); author unrooted internal targets as rooted paths (`/page.html`).
 * Relative-path prefixes (`./sibling`, `../parent`) are exempted and stay internal.
 */
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
function classifyExternal(to: string): 'passthrough' | 'normalize' | 'internal' {
    if (SCHEME_RE.test(to) || to.startsWith('//')) return 'passthrough';
    // Scheme-less: only a non-rooted value whose first segment is a hostname (contains a dot) is
    // treated as an external bare domain. Everything rooted (`/…`) or relative-without-dot stays
    // internal.
    const firstSegment = to.split('/')[0];
    // `.`/`..` first segments are relative-path links (`./sibling`, `../parent`), which React
    // Router resolves as string routes — never a domain — so keep them internal even though they
    // contain a dot.
    if (!to.startsWith('/') && firstSegment !== '.' && firstSegment !== '..' && firstSegment.includes('.')) {
        return 'normalize';
    }
    return 'internal';
}

/**
 * Builds a fully-qualified URL with site context prefix and search params.
 *
 * Only keys defined in urlConfig.search are set by site context. Any other query params
 * already present on the `to` URL (including duplicate keys) are preserved as-is.
 * e.g. to='/api/search?refine=color:blue&refine=size:M', search='?lng=:localeId'
 *   → '/api/search?refine=color:blue&refine=size:M&lng=en-GB'
 *
 * External links (explicit scheme, protocol-relative, or a scheme-less bare domain) are never
 * site-prefixed — see {@link classifyExternal}.
 *
 * @example
 * buildUrl({ to: '/product/123', urlConfig: { prefix: '/:siteId', search: '?lng=:localeId' }, params: { siteId: 'global', localeId: 'en-GB' } })
 * // → '/global/product/123?lng=en-GB'
 */
export function buildUrl({
    to,
    urlConfig,
    params,
}: {
    to: string;
    urlConfig?: Url;
    params: Record<string, string>;
}): string {
    if (!urlConfig) return to;
    if (!to || to === '#') return to;

    const external = classifyExternal(to);
    if (external === 'passthrough') return to;
    if (external === 'normalize') return `https://${to}`;

    const { pathname, search: existingSearch, hash } = decomposeUrl(to);

    const pathPrefix =
        urlConfig.prefix && urlConfig.prefix !== '/' ? resolvePrefix({ prefix: urlConfig.prefix, params }) : '';
    const path = pathPrefix ? `${pathPrefix}${stripPathPrefix({ pathname, prefix: pathPrefix })}` : pathname;

    const searchParams = new URLSearchParams(existingSearch);
    if (urlConfig.search) {
        const searchConfig = parseSearchConfig(urlConfig.search);
        for (const [queryKey, value] of Object.entries(searchConfig)) {
            if (value.startsWith(':')) {
                const paramValue = params[value.slice(1)];
                if (paramValue) {
                    searchParams.set(queryKey, paramValue);
                }
            } else {
                searchParams.set(queryKey, value);
            }
        }
    }

    const search = searchParams.toString();
    return `${path}${search ? `?${search}` : ''}${hash}`;
}
