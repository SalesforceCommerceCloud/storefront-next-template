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
import type { SeoRoutesConfig } from '@salesforce/storefront-next-runtime/config';

type RouteResolutionOptions = {
    url: URL;
    params?: Record<string, string | undefined>;
    urlPrefix?: string;
    siteId: string;
    seoRoutes?: SeoRoutesConfig;
};

export type CategoryRouteResolution = {
    /** ID for id-suffix mode; full decoded slug hierarchy for slug-path mode. */
    categoryLookup: string;
    /** The single route-authoritative category refinement for every product-search phase. */
    routeRefinement: `cgid=${string}` | `cgslug=${string}`;
    /** Full decoded hierarchy for slug-path mode. */
    slugPath?: string;
};

export function isCategoryRefinement(refinement: string): boolean {
    return refinement.startsWith('cgid=') || refinement.startsWith('cgslug=');
}

/** Replace all caller-supplied category refinements with the route-authoritative value. */
export function applyCategoryRouteRefinement(
    refinements: readonly string[],
    routeRefinement: CategoryRouteResolution['routeRefinement']
): string[] {
    return [...refinements.filter((refinement) => !isCategoryRefinement(refinement)), routeRefinement];
}

function decodeRawSegment(segment: string): string {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

function getSeoPathSegments(url: URL, urlPrefix?: string): string[] | null {
    const pathSegments = url.pathname.split('/');
    if (pathSegments[0] === '') pathSegments.shift();

    const prefixSegments = (urlPrefix ?? '').split('/').filter(Boolean);
    if (pathSegments.length < prefixSegments.length) return null;

    for (let index = 0; index < prefixSegments.length; index++) {
        const prefixSegment = prefixSegments[index];
        if (!pathSegments[index]) return null;
        if (!prefixSegment.startsWith(':') && prefixSegment !== pathSegments[index]) return null;
    }

    const resourceSegments = pathSegments.slice(prefixSegments.length);
    while (resourceSegments.at(-1) === '') resourceSegments.pop();
    return resourceSegments.some((segment) => segment.length === 0) ? null : resourceSegments;
}

/**
 * Returns the final raw path segment of the request URL, decoded only after it has
 * been isolated.
 *
 * Under the SEO route aliases (a configured product/category prefix routes through
 * a pathless parent whose `{prefix}/*` alias children own the splat), the resource
 * ID always sits in the last path segment for both `/{prefix}/{id}` and
 * `/{prefix}/{slug}/{id}` forms. It is read from the raw URL rather than React
 * Router's `params["*"]` because the splat is already percent-decoded, which would
 * mis-split an ID whose encoded form contains a slash; isolating the raw segment
 * first and decoding after keeps the boundary between segments unambiguous.
 *
 * Takes the already-parsed `URL` the loader builds for `searchParams`, so the
 * request URL is parsed once per load.
 *
 * `params` are the loader's route params. When the alias splat (`params["*"]`) is
 * present but empty, the URL is the bare SEO prefix with no resource ID
 * (`/{prefix}`, `/{prefix}/`, `/{prefix}//`); returning an empty ID lets the lookup
 * 404 rather than resolving the prefix segment itself as an ID. Only the splat's
 * emptiness is inspected — never its value, which is percent-decoded and would
 * mis-split; the ID is still read from the raw URL below.
 *
 * A final `.html` stays part of the returned ID — the deterministic route treats
 * the whole segment as the ID.
 */
export function decodeFinalRawSegment(url: URL, params?: Record<string, string | undefined>): string {
    const aliasSplat = params?.['*'];
    if (aliasSplat !== undefined && !/[^/]/.test(aliasSplat)) {
        return '';
    }
    const { pathname } = url;
    const withoutTrailingSlashes = pathname.replace(/\/+$/, '');
    const rawSegment = withoutTrailingSlashes.slice(withoutTrailingSlashes.lastIndexOf('/') + 1);
    // Malformed percent-encoding is client-supplied input at the URL boundary. Keep the
    // raw segment so the resource lookup 404s cleanly rather than throwing a 500 from decode.
    return decodeRawSegment(rawSegment);
}

/** Resolve a product ID only when the matched alias belongs to the active site. */
export function resolveProductRoute(options: RouteResolutionOptions): { productId: string } | null {
    if (!options.seoRoutes) {
        return { productId: decodeFinalRawSegment(options.url, options.params) };
    }

    const siteConfig = options.seoRoutes[options.siteId];
    if (!siteConfig) return null;
    const pathSegments = getSeoPathSegments(options.url, options.urlPrefix);
    if (!pathSegments) return null;
    const [rawPrefix, ...rawResourceSegments] = pathSegments;
    if (rawPrefix?.toLowerCase() !== siteConfig.product.prefix.toLowerCase() || rawResourceSegments.length === 0) {
        return null;
    }

    return { productId: decodeRawSegment(rawResourceSegments.at(-1) ?? '') };
}

/** Resolve the active site's deterministic category grammar from the raw request path. */
export function resolveCategoryRoute(options: RouteResolutionOptions): CategoryRouteResolution | null {
    if (!options.seoRoutes) {
        const categoryId = decodeFinalRawSegment(options.url, options.params);
        return { categoryLookup: categoryId, routeRefinement: `cgid=${categoryId}` };
    }

    const siteConfig = options.seoRoutes[options.siteId];
    if (!siteConfig) return null;
    const pathSegments = getSeoPathSegments(options.url, options.urlPrefix);
    if (!pathSegments) return null;
    const [rawPrefix, ...rawResourceSegments] = pathSegments;
    if (rawPrefix?.toLowerCase() !== siteConfig.category.prefix.toLowerCase() || rawResourceSegments.length === 0) {
        return null;
    }

    if (siteConfig.category.mode === 'slug-path') {
        const slugPath = rawResourceSegments.map(decodeRawSegment).join('/');
        return {
            categoryLookup: slugPath,
            routeRefinement: `cgslug=${slugPath}`,
            slugPath,
        };
    }

    const categoryId = decodeRawSegment(rawResourceSegments.at(-1) ?? '');
    return { categoryLookup: categoryId, routeRefinement: `cgid=${categoryId}` };
}
