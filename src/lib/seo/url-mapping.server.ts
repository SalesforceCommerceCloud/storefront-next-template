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
import type { ShopperSeo } from '@/scapi';
import { createCategoryUrl, createProductUrl, type SeoUrlContext } from '@/route-paths';
import { appendSuffix, findLegacyRoute, type LegacyRoute } from '@/middlewares/legacy-routes';
import type { SeoFallbackSitePolicy } from '@/types/config';

type UrlMapping = ShopperSeo.schemas['UrlMapping'];
type QueryResource = keyof SeoFallbackSitePolicy['allowedQueryParameters'];
type Scalar = string | number | boolean;

export type UrlMappingOutcome =
    | { type: 'redirect'; status: 301 | 302 | 307; location: string }
    | { type: 'hybrid'; status: 301 | 302 | 307; location: string }
    | { type: 'not-found' }
    | { type: 'rejected' };

export type ResolveUrlMappingOptions = {
    requestUrl: URL | string;
    publicOrigin: string;
    incomingPathname: string;
    sitePolicy?: SeoFallbackSitePolicy;
    seoUrlContext: SeoUrlContext;
    destinationPrefix?: string;
    buildResourceUrl?: (location: string) => string;
    legacyRoutes: ReadonlyArray<string | LegacyRoute>;
};

const REDIRECT_STATUSES = new Set([301, 302, 307]);
const SENSITIVE_QUERY_PARAMETERS = new Set([
    'access_token',
    'authorization',
    'callback',
    'code',
    'code_verifier',
    'dwsid',
    'id_token',
    'idp_refresh_token',
    'localeid',
    'redirect_uri',
    'refreshtoken',
    'refresh_token',
    'session',
    'sessionid',
    'sfdc_dwsid',
    'sfdc_usid',
    'siteid',
    'state',
    'token',
    'usid',
    '__data',
]);

function encodePathSegment(segment: string): string {
    return encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
}

export function buildUrlSegment(pathname: string): string {
    const pathOnly = pathname.split(/[?#]/, 1)[0].replace(/^\/+/, '');
    try {
        return pathOnly
            .split('/')
            .map((segment) => encodePathSegment(decodeURIComponent(segment)))
            .join('/');
    } catch {
        throw new TypeError('Malformed percent encoding in pathname');
    }
}

export function isEligibleFallbackRequest(request: Request): boolean {
    return request.method === 'GET' || request.method === 'HEAD';
}

function rejected(): UrlMappingOutcome {
    return { type: 'rejected' };
}

function strictSearchParams(value: string): URLSearchParams | null {
    const source = value.startsWith('?') ? value.slice(1) : value;
    if (/%(?![0-9a-f]{2})/i.test(source)) return null;
    for (const pair of source.split('&')) {
        const rawKey = pair.split('=', 1)[0];
        if (rawKey.includes('%')) return null;
    }
    return new URLSearchParams(source);
}

function normalizeOrigin(value: string): URL | null {
    try {
        const origin = new URL(value);
        const isLocalHttp =
            origin.protocol === 'http:' &&
            (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1' || origin.hostname === '[::1]');
        if (
            (origin.protocol !== 'https:' && !isLocalHttp) ||
            origin.username ||
            origin.password ||
            origin.pathname !== '/'
        ) {
            return null;
        }
        return origin;
    } catch {
        return null;
    }
}

function parseDestination(destination: string, publicOrigin: URL): URL | null {
    if (
        !destination ||
        destination !== destination.trim() ||
        destination.startsWith('//') ||
        destination.includes('\\') ||
        // oxlint-disable-next-line no-control-regex -- redirect targets containing ASCII controls are unsafe
        /[\u0000-\u001f\u007f]/.test(destination) ||
        /%(?![0-9a-f]{2})/i.test(destination)
    ) {
        return null;
    }
    try {
        const parsed = new URL(destination, publicOrigin);
        const isRelativeLocalDestination =
            !/^[a-z][a-z\d+.-]*:/i.test(destination) &&
            publicOrigin.protocol === 'http:' &&
            parsed.origin === publicOrigin.origin;
        if ((parsed.protocol !== 'https:' && !isRelativeLocalDestination) || parsed.username || parsed.password)
            return null;
        return parsed;
    } catch {
        return null;
    }
}

function stripPrefix(pathname: string, prefix?: string): string {
    if (!prefix) return pathname;
    const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    if (pathname === normalizedPrefix) return '/';
    return pathname.startsWith(`${normalizedPrefix}/`) ? pathname.slice(normalizedPrefix.length) : pathname;
}

function decodedSegments(pathname: string): string[] | null {
    try {
        return pathname
            .split('/')
            .filter(Boolean)
            .map((segment) => decodeURIComponent(segment));
    } catch {
        return null;
    }
}

function resourceDestinationSegments(pathname: string, options: ResolveUrlMappingOptions): string[] | null {
    const segments = decodedSegments(stripPrefix(pathname, options.destinationPrefix));
    if (!segments) return null;

    const siteIndex = segments[0]?.toLowerCase() === 's' ? 1 : 0;
    if (segments[siteIndex]?.toLowerCase() !== options.seoUrlContext.siteId.toLowerCase()) return segments;

    const firstHierarchyIndex = siteIndex + 1;
    const locale = segments[firstHierarchyIndex];
    return segments.slice(
        locale && /^[a-z]{2}(?:[-_][A-Z]{2})?$/.test(locale) ? firstHierarchyIndex + 1 : firstHierarchyIndex
    );
}

function permittedParameters(policy: SeoFallbackSitePolicy | undefined, resource: QueryResource): Set<string> {
    return new Set((policy?.allowedQueryParameters[resource] ?? []).map((key) => key.toLowerCase()));
}

function isScalar(value: unknown): value is Scalar {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function mergeParameters(
    mapping: UrlMapping,
    destination: URL,
    requestUrl: URL,
    policy: SeoFallbackSitePolicy | undefined,
    resource: QueryResource
): URLSearchParams | null {
    const allowed = permittedParameters(policy, resource);
    const merged = new Map<string, { key: string; values: string[] }>();
    const add = (key: string, values: readonly Scalar[]) => {
        const normalized = key.toLowerCase();
        if (SENSITIVE_QUERY_PARAMETERS.has(normalized) || !allowed.has(normalized)) return;
        merged.set(normalized, { key, values: values.map(String) });
    };
    const addSearch = (search: string): boolean => {
        const parsed = strictSearchParams(search);
        if (!parsed) return false;
        for (const [key, value] of parsed) {
            add(key, [value]);
        }
        return true;
    };

    if (mapping.copySourceParams && !addSearch(requestUrl.search)) return null;
    if (!addSearch(destination.search)) return null;
    if (mapping.additionalUrlParams && !addSearch(mapping.additionalUrlParams)) return null;
    if (mapping.refinements) {
        for (const [key, value] of Object.entries(mapping.refinements)) {
            const values = Array.isArray(value) ? value : [value];
            if (!values.every(isScalar)) return null;
            add(key, values);
        }
    }

    const result = new URLSearchParams();
    for (const { key, values } of merged.values()) {
        for (const value of values) result.append(key, value);
    }
    return result;
}

function withSearch(pathname: string, searchParams: URLSearchParams, hash = ''): string {
    const search = searchParams.toString();
    return `${pathname}${search ? `?${search}` : ''}${hash}`;
}

function canonicalUrl(origin: URL, pathname: string, search: string): string {
    const url = new URL(pathname, origin);
    url.search = search;
    url.hash = '';
    return url.href;
}

export function resolveUrlMapping(
    mapping: UrlMapping | null | undefined,
    options: ResolveUrlMappingOptions
): UrlMappingOutcome {
    if (!mapping) return { type: 'not-found' };

    const publicOrigin = normalizeOrigin(options.publicOrigin);
    if (!publicOrigin) return rejected();

    let requestUrl: URL;
    try {
        requestUrl = new URL(options.requestUrl);
    } catch {
        return rejected();
    }

    if (mapping.resourceType === 'CONTENT_ASSET') return rejected();

    const isResourceMapping = mapping.resourceType === 'PRODUCT' || mapping.resourceType === 'CATEGORY';
    const rawDestination = mapping.destinationUrl;
    if (!rawDestination && !isResourceMapping) return rejected();
    const destination = rawDestination ? parseDestination(rawDestination, publicOrigin) : new URL('/', publicOrigin);
    if (!destination) return rejected();
    const sameOrigin = destination.origin === publicOrigin.origin;

    if (isResourceMapping) {
        const statusCode = mapping.statusCode ?? 302;
        if (!REDIRECT_STATUSES.has(statusCode)) return rejected();
        const status = statusCode as 301 | 302 | 307;
        if (!sameOrigin || !mapping.resourceId) return rejected();
        const segments = rawDestination ? resourceDestinationSegments(destination.pathname, options) : [];
        if (!segments || (rawDestination && segments.length === 0)) return rejected();
        const categoryMode = options.seoUrlContext.seoRoutes?.[options.seoUrlContext.siteId]?.category.mode;
        const finalSegment = segments.at(-1);
        const hasIdSuffix = finalSegment === mapping.resourceId || finalSegment === `${mapping.resourceId}.html`;
        if (!rawDestination && mapping.resourceType === 'CATEGORY' && categoryMode === 'slug-path') return rejected();
        const slugSegments = hasIdSuffix ? segments.slice(0, -1) : segments;
        const resource = mapping.resourceType === 'PRODUCT' ? 'product' : 'category';
        const searchParams = mergeParameters(mapping, destination, requestUrl, options.sitePolicy, resource);
        if (!searchParams) return rejected();
        try {
            const bareLocation =
                mapping.resourceType === 'PRODUCT'
                    ? createProductUrl(
                          { productId: mapping.resourceId, slugSegments, searchParams },
                          options.seoUrlContext
                      )
                    : withSearch(
                          createCategoryUrl({ categoryId: mapping.resourceId, slugSegments }, options.seoUrlContext),
                          searchParams
                      );
            if (bareLocation === '#') return rejected();
            const locationWithHash = `${bareLocation}${destination.hash}`;
            const location = options.buildResourceUrl?.(locationWithHash) ?? locationWithHash;
            const finalDestination = new URL(location, publicOrigin);
            const sourcePathname = requestUrl.pathname || options.incomingPathname;
            if (
                finalDestination.origin === publicOrigin.origin &&
                canonicalUrl(publicOrigin, finalDestination.pathname, finalDestination.search) ===
                    canonicalUrl(publicOrigin, sourcePathname, requestUrl.search)
            ) {
                return rejected();
            }
            return { type: 'redirect', status, location };
        } catch {
            return rejected();
        }
    }

    if (!REDIRECT_STATUSES.has(mapping.statusCode ?? 0)) return rejected();
    const status = mapping.statusCode as 301 | 302 | 307;
    if (!sameOrigin) {
        const allowedOrigins = new Set(
            (options.sitePolicy?.redirectOrigins ?? [])
                .map(normalizeOrigin)
                .filter((origin): origin is URL => origin !== null)
                .map((origin) => origin.origin)
        );
        if (!allowedOrigins.has(destination.origin)) return rejected();
    }

    const searchParams = mergeParameters(mapping, destination, requestUrl, options.sitePolicy, 'redirect');
    if (!searchParams) return rejected();
    const bareDestination = stripPrefix(destination.pathname, options.destinationPrefix);
    const legacyRoute = sameOrigin ? findLegacyRoute(bareDestination, options.legacyRoutes) : undefined;
    if (legacyRoute) {
        const location = withSearch(
            appendSuffix(destination.pathname, legacyRoute.suffix),
            searchParams,
            destination.hash
        );
        return { type: 'hybrid', status, location };
    }

    const sourcePathname = requestUrl.pathname || options.incomingPathname;
    if (
        sameOrigin &&
        canonicalUrl(publicOrigin, destination.pathname, searchParams.toString()) ===
            canonicalUrl(publicOrigin, sourcePathname, requestUrl.search)
    ) {
        return rejected();
    }

    const relativeLocation = withSearch(destination.pathname, searchParams, destination.hash);
    return {
        type: 'redirect',
        status,
        location: sameOrigin ? relativeLocation : `${destination.origin}${relativeLocation}`,
    };
}
