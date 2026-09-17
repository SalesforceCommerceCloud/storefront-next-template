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
import { describe, expect, test } from 'vitest';
import type { ShopperSeo } from '@/scapi';
import type { SeoFallbackSitePolicy } from '@/types/config';
import {
    buildUrlSegment,
    isEligibleFallbackRequest,
    resolveUrlMapping,
    type ResolveUrlMappingOptions,
} from './url-mapping.server';

type UrlMapping = ShopperSeo.schemas['UrlMapping'];

const seoRoutes = {
    RefArch: {
        product: { prefix: 'p' },
        category: { prefix: 'c', mode: 'id-suffix' as const },
    },
    SlugStore: {
        product: { prefix: 'products' },
        category: { prefix: 'catalog', mode: 'slug-path' as const },
    },
};

const policy: SeoFallbackSitePolicy = {
    redirectOrigins: ['https://approved.example'],
    allowedQueryParameters: {
        product: ['color', 'view'],
        category: ['prefn1', 'prefv1', 'page'],
        redirect: ['campaign', 'source'],
    },
    contentOwned: true,
};

function options(overrides: Partial<ResolveUrlMappingOptions> = {}): ResolveUrlMappingOptions {
    return {
        requestUrl: new URL('https://internal.mrt.example/RefArch/en-US/legacy?campaign=source&session=secret'),
        publicOrigin: 'https://shop.example',
        incomingPathname: '/legacy',
        sitePolicy: policy,
        seoUrlContext: { siteId: 'RefArch', seoRoutes },
        destinationPrefix: '/RefArch/en-US',
        legacyRoutes: [{ pattern: '/legacy-products/:id', suffix: '.html' }],
        ...overrides,
    };
}

describe('buildUrlSegment', () => {
    test('removes the leading slash and excludes query and fragment input', () => {
        expect(buildUrlSegment('/women/dresses?color=blue#details')).toBe('women/dresses');
    });

    test('removes every leading slash from the API segment', () => {
        expect(buildUrlSegment('///women/dresses')).toBe('women/dresses');
    });

    test('decodes and re-encodes Unicode exactly once', () => {
        expect(buildUrlSegment('/caf%C3%A9/%E2%9C%93')).toBe('caf%C3%A9/%E2%9C%93');
        expect(buildUrlSegment('/café/✓')).toBe('caf%C3%A9/%E2%9C%93');
    });

    test('rejects malformed percent encoding', () => {
        expect(() => buildUrlSegment('/bad%2')).toThrow(/malformed/i);
    });
});

describe('isEligibleFallbackRequest', () => {
    test.each(['GET', 'HEAD'])('accepts %s requests', (method) => {
        expect(isEligibleFallbackRequest(new Request('https://shop.example/missing', { method }))).toBe(true);
    });

    test.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('rejects %s requests', (method) => {
        expect(isEligibleFallbackRequest(new Request('https://shop.example/missing', { method }))).toBe(false);
    });
});

describe('resource mappings', () => {
    test.each([
        { resourceType: 'PRODUCT' as const, resourceId: 'p1', statusCode: 301 as const },
        { resourceType: 'CATEGORY' as const, resourceId: 'c1', statusCode: 307 as const },
    ])('preserves supported $resourceType status $statusCode', (mapping) => {
        expect(resolveUrlMapping(mapping, options())).toMatchObject({
            type: 'redirect',
            status: mapping.statusCode,
        });
    });

    test('defaults an absent resource status to 302 and rejects unsupported resource statuses', () => {
        expect(resolveUrlMapping({ resourceType: 'PRODUCT', resourceId: 'p1' }, options())).toMatchObject({
            type: 'redirect',
            status: 302,
        });
        expect(resolveUrlMapping({ resourceType: 'PRODUCT', resourceId: 'p1', statusCode: 308 }, options())).toEqual({
            type: 'rejected',
        });
    });

    test('hands the bare builder result to site-context URL construction with query and hash intact', () => {
        const buildResourceUrl = (location: string) => `/global/en${location}`;
        expect(
            resolveUrlMapping(
                {
                    resourceType: 'PRODUCT',
                    resourceId: 'p1',
                    destinationUrl: '/RefArch/en-US/women/p1?color=blue#details',
                },
                options({ buildResourceUrl })
            )
        ).toEqual({
            type: 'redirect',
            status: 302,
            location: '/global/en/p/women/p1?color=blue#details',
        });
    });

    test('rejects a resource mapping that resolves to the original public URL', () => {
        const buildResourceUrl = (location: string) => `/global/en${location}`;
        expect(
            resolveUrlMapping(
                {
                    resourceType: 'PRODUCT',
                    resourceId: 'p1',
                    destinationUrl: '/RefArch/en-US/p1',
                },
                options({ requestUrl: 'https://shop.example/global/en/p/p1', buildResourceUrl })
            )
        ).toEqual({ type: 'rejected' });
    });

    test('builds a configured product URL without destination hierarchy', () => {
        expect(resolveUrlMapping({ resourceType: 'PRODUCT', resourceId: 'red dress' }, options())).toEqual({
            type: 'redirect',
            status: 302,
            location: '/p/red%20dress',
        });
    });

    test('builds an ID-suffix category URL without destination hierarchy', () => {
        expect(resolveUrlMapping({ resourceType: 'CATEGORY', resourceId: 'moisturisers' }, options())).toEqual({
            type: 'redirect',
            status: 302,
            location: '/c/moisturisers',
        });
    });

    test('rejects a slug-path category without destination hierarchy', () => {
        expect(
            resolveUrlMapping(
                { resourceType: 'CATEGORY', resourceId: 'internal-mens-clothing' },
                options({
                    seoUrlContext: { siteId: 'SlugStore', seoRoutes },
                    destinationPrefix: '/SlugStore/en-US',
                })
            )
        ).toEqual({ type: 'rejected' });
    });

    test('applies allowed query parameters and refinements without a resource destination', () => {
        expect(
            resolveUrlMapping(
                {
                    resourceType: 'CATEGORY',
                    resourceId: 'shoes',
                    copySourceParams: true,
                    additionalUrlParams: 'page=3&ignored=no',
                    refinements: { prefn1: 'color', prefv1: ['blue', 'green'] },
                },
                options({ requestUrl: 'https://shop.example/legacy?page=2&unknown=no' })
            )
        ).toEqual({
            type: 'redirect',
            status: 302,
            location: '/c/shoes?page=3&prefn1=color&prefv1=blue&prefv1=green',
        });
    });

    test('builds configured product URLs from the mapped ID and available hierarchy', () => {
        const mapping: UrlMapping = {
            resourceType: 'PRODUCT',
            resourceId: 'red dress',
            destinationUrl: '/RefArch/en-US/women/dresses/red%20dress',
            additionalUrlParams: 'color=blue&view=grid&ignored=no',
        };

        expect(resolveUrlMapping(mapping, options())).toEqual({
            type: 'redirect',
            status: 302,
            location: '/p/women/dresses/red%20dress?color=blue&view=grid',
        });
    });

    test('uses every destination segment as product hierarchy when the destination omits the resource ID', () => {
        expect(
            resolveUrlMapping(
                {
                    resourceType: 'PRODUCT',
                    resourceId: 'p1',
                    destinationUrl: '/RefArch/en-US/women/red-dress',
                },
                options()
            )
        ).toEqual({
            type: 'redirect',
            status: 302,
            location: '/p/women/red-dress/p1',
        });
    });

    test('uses every destination segment as ID-suffix category hierarchy when the destination omits the resource ID', () => {
        expect(
            resolveUrlMapping(
                {
                    resourceType: 'CATEGORY',
                    resourceId: 'c1',
                    destinationUrl: '/RefArch/en-US/women/dresses',
                },
                options()
            )
        ).toEqual({
            type: 'redirect',
            status: 302,
            location: '/c/women/dresses/c1',
        });
    });

    test('normalizes a Commerce product destination before building the storefront URL', () => {
        expect(
            resolveUrlMapping(
                {
                    resourceType: 'PRODUCT',
                    resourceId: 'p1',
                    destinationUrl: '/s/RefArch/en_US/women/red-dress/p1.html',
                },
                options({ buildResourceUrl: (location) => `/global/en${location}` })
            )
        ).toEqual({
            type: 'redirect',
            status: 302,
            location: '/global/en/p/women/red-dress/p1',
        });
    });

    test('normalizes a Commerce category destination before building the storefront URL', () => {
        expect(
            resolveUrlMapping(
                {
                    resourceType: 'CATEGORY',
                    resourceId: 'c1',
                    destinationUrl: '/s/RefArch/en-US/women/dresses/c1.html',
                },
                options({ buildResourceUrl: (location) => `/global/en${location}` })
            )
        ).toEqual({
            type: 'redirect',
            status: 302,
            location: '/global/en/c/women/dresses/c1',
        });
    });

    test('strips a language-only Commerce locale from a resource destination', () => {
        expect(
            resolveUrlMapping(
                {
                    resourceType: 'CATEGORY',
                    resourceId: 'c1',
                    destinationUrl: '/s/RefArch/en/women/dresses/c1.html',
                },
                options({ buildResourceUrl: (location) => `/global/en${location}` })
            )
        ).toEqual({
            type: 'redirect',
            status: 302,
            location: '/global/en/c/women/dresses/c1',
        });
    });

    test.each([
        {
            name: 'ID-suffix',
            mapping: {
                resourceType: 'CATEGORY',
                resourceId: 'moisturisers',
                destinationUrl: '/RefArch/en-US/skincare/moisturisers',
            } satisfies UrlMapping,
            expected: '/c/skincare/moisturisers',
            optionOverrides: {},
        },
        {
            name: 'slug-path',
            mapping: {
                resourceType: 'CATEGORY',
                resourceId: 'internal-mens-clothing',
                destinationUrl: '/SlugStore/en-US/mens/clothing',
            } satisfies UrlMapping,
            expected: '/catalog/mens/clothing',
            optionOverrides: {
                seoUrlContext: { siteId: 'SlugStore', seoRoutes },
                destinationPrefix: '/SlugStore/en-US',
            },
        },
    ])('uses the centralized category builder in $name mode', ({ mapping, expected, optionOverrides }) => {
        expect(resolveUrlMapping(mapping, options(optionOverrides))).toEqual({
            type: 'redirect',
            status: 302,
            location: expected,
        });
    });

    test('merges allowed category refinements and lets mapping values replace source values', () => {
        const mapping: UrlMapping = {
            resourceType: 'CATEGORY',
            resourceId: 'shoes',
            destinationUrl: '/RefArch/en-US/shoes',
            copySourceParams: true,
            refinements: { prefn1: 'color', prefv1: ['blue', 'green'], nested: { no: true } },
        };

        expect(
            resolveUrlMapping(mapping, options({ requestUrl: 'https://shop.example/legacy?prefn1=size&page=2' }))
        ).toEqual({
            type: 'rejected',
        });

        mapping.refinements = { prefn1: 'color', prefv1: ['blue', 'green'], page: 3 };
        expect(
            resolveUrlMapping(mapping, options({ requestUrl: 'https://shop.example/legacy?prefn1=size&page=2' }))
        ).toEqual({
            type: 'redirect',
            status: 302,
            location: '/c/shoes?prefn1=color&page=3&prefv1=blue&prefv1=green',
        });
    });

    test.each<UrlMapping>([
        { resourceType: 'PRODUCT' },
        { resourceType: 'PRODUCT', resourceId: 'p1', destinationUrl: '/RefArch/en-US/' },
        { resourceType: 'CATEGORY' },
    ])('fails closed for missing resource fields or URL-builder configuration', (mapping) => {
        expect(resolveUrlMapping(mapping, options())).toEqual({ type: 'rejected' });
    });

    test('returns not-found for no mapping and rejects content without a concrete route', () => {
        expect(resolveUrlMapping(null, options())).toEqual({ type: 'not-found' });
        expect(resolveUrlMapping({ resourceType: 'CONTENT_ASSET', resourceId: 'about' }, options())).toEqual({
            type: 'rejected',
        });
    });
});

describe('redirect mappings', () => {
    test.each([301, 302, 307])('accepts redirect status %s', (statusCode) => {
        expect(resolveUrlMapping({ statusCode, destinationUrl: '/sale?campaign=mapped#offers' }, options())).toEqual({
            type: 'redirect',
            status: statusCode,
            location: '/sale?campaign=mapped#offers',
        });
    });

    test('resolves same-origin and exact allowlisted HTTPS destinations', () => {
        expect(resolveUrlMapping({ statusCode: 302, destinationUrl: 'https://shop.example/sale' }, options())).toEqual({
            type: 'redirect',
            status: 302,
            location: '/sale',
        });
        expect(
            resolveUrlMapping({ statusCode: 302, destinationUrl: 'https://approved.example/sale' }, options())
        ).toEqual({ type: 'redirect', status: 302, location: 'https://approved.example/sale' });
    });

    test('allows relative and resource mappings on an HTTP localhost public origin', () => {
        const localhostOptions = options({
            requestUrl: 'http://localhost:5173/legacy',
            publicOrigin: 'http://localhost:5173',
        });

        expect(resolveUrlMapping({ statusCode: 302, destinationUrl: '/sale' }, localhostOptions)).toEqual({
            type: 'redirect',
            status: 302,
            location: '/sale',
        });
        expect(resolveUrlMapping({ resourceType: 'PRODUCT', resourceId: 'p1' }, localhostOptions)).toEqual({
            type: 'redirect',
            status: 302,
            location: '/p/p1',
        });
        expect(resolveUrlMapping({ statusCode: 302, destinationUrl: './sale' }, localhostOptions)).toEqual({
            type: 'redirect',
            status: 302,
            location: '/sale',
        });
        expect(
            resolveUrlMapping({ statusCode: 302, destinationUrl: 'http://localhost:5173/sale' }, localhostOptions)
        ).toEqual({ type: 'rejected' });
        expect(
            resolveUrlMapping({ statusCode: 302, destinationUrl: ' http://localhost:5173/sale' }, localhostOptions)
        ).toEqual({ type: 'rejected' });
    });

    test.each([
        { statusCode: 308, destinationUrl: '/sale' },
        { statusCode: 302, destinationUrl: '//evil.example/sale' },
        { statusCode: 302, destinationUrl: '\\\\evil.example\\sale' },
        { statusCode: 302, destinationUrl: 'https://user:pass@shop.example/sale' },
        { statusCode: 302, destinationUrl: 'http://shop.example/sale' },
        { statusCode: 302, destinationUrl: 'javascript:alert(1)' },
        { statusCode: 302, destinationUrl: 'data:text/plain,no' },
        { statusCode: 302, destinationUrl: 'https://approved.example.evil.test/sale' },
        { statusCode: 302, destinationUrl: '/bad\u0000path' },
        { statusCode: 302, destinationUrl: 'https://%' },
    ] satisfies UrlMapping[])('rejects an unsafe or looping redirect: $destinationUrl', (mapping) => {
        expect(resolveUrlMapping(mapping, options())).toEqual({ type: 'rejected' });
    });
});

describe('query and ownership policy', () => {
    test('filters copied and mapping query values case-insensitively with mapping values winning', () => {
        const mapping: UrlMapping = {
            statusCode: 302,
            destinationUrl: '/sale?CAMPAIGN=destination&authorization=bad',
            copySourceParams: true,
            additionalUrlParams: 'campaign=additional&SOURCE=email&callback=bad',
        };

        expect(
            resolveUrlMapping(
                mapping,
                options({
                    requestUrl: 'https://shop.example/legacy?Campaign=source&source=search&unknown=no&session=bad',
                })
            )
        ).toEqual({
            type: 'redirect',
            status: 302,
            location: '/sale?campaign=additional&SOURCE=email',
        });
    });

    test('collapses URL-string duplicates to the final value while preserving explicit refinement arrays', () => {
        const mapping: UrlMapping = {
            resourceType: 'CATEGORY',
            resourceId: 'shoes',
            copySourceParams: true,
            additionalUrlParams: 'PAGE=3&page=4',
            refinements: { prefv1: ['blue', 'green'] },
        };

        expect(
            resolveUrlMapping(
                mapping,
                options({ requestUrl: 'https://shop.example/legacy?Page=1&page=2&prefv1=attacker' })
            )
        ).toEqual({
            type: 'redirect',
            status: 302,
            location: '/c/shoes?page=4&prefv1=blue&prefv1=green',
        });
    });

    test.each([
        {
            mapping: { statusCode: 302, destinationUrl: '/sale?Campaign=first&campaign=last' } satisfies UrlMapping,
            requestUrl: undefined,
        },
        {
            mapping: { statusCode: 302, destinationUrl: '/sale', copySourceParams: true } satisfies UrlMapping,
            requestUrl: 'https://shop.example/legacy?Campaign=first&campaign=last',
        },
        {
            mapping: {
                statusCode: 302,
                destinationUrl: '/sale',
                additionalUrlParams: 'Campaign=first&campaign=last',
            } satisfies UrlMapping,
            requestUrl: undefined,
        },
    ])('uses the final case-insensitive scalar value parsed from URL strings', ({ mapping, requestUrl }) => {
        expect(resolveUrlMapping(mapping, options(requestUrl ? { requestUrl } : {}))).toEqual({
            type: 'redirect',
            status: 302,
            location: '/sale?campaign=last',
        });
    });

    test('copies source first so destination and additional mapping values take precedence', () => {
        expect(
            resolveUrlMapping(
                {
                    statusCode: 302,
                    destinationUrl: '/sale?CAMPAIGN=destination',
                    copySourceParams: true,
                    additionalUrlParams: 'campaign=additional',
                },
                options({ requestUrl: 'https://shop.example/legacy?Campaign=source' })
            )
        ).toEqual({ type: 'redirect', status: 302, location: '/sale?campaign=additional' });
    });

    test('compares the original source query with the merged destination query for loop detection', () => {
        expect(
            resolveUrlMapping(
                { statusCode: 302, destinationUrl: '/legacy' },
                options({ requestUrl: 'https://shop.example/legacy?campaign=remove-me' })
            )
        ).toEqual({ type: 'redirect', status: 302, location: '/legacy' });
        expect(
            resolveUrlMapping(
                { statusCode: 302, destinationUrl: '/legacy?campaign=changed' },
                options({ requestUrl: 'https://shop.example/legacy?campaign=source' })
            )
        ).toEqual({ type: 'redirect', status: 302, location: '/legacy?campaign=changed' });
        expect(
            resolveUrlMapping(
                { statusCode: 302, destinationUrl: '/legacy?campaign=source' },
                options({ requestUrl: 'https://shop.example/legacy?campaign=source' })
            )
        ).toEqual({ type: 'rejected' });
    });

    test.each([
        'https://shop.example/legacy?campaign=%',
        'https://shop.example/legacy?%63allback=evil',
        'https://shop.example/legacy?%73ession=evil',
    ])('rejects malformed encoding and encoded sensitive aliases in source query', (requestUrl) => {
        expect(
            resolveUrlMapping(
                { statusCode: 302, destinationUrl: '/sale', copySourceParams: true },
                options({ requestUrl })
            )
        ).toEqual({ type: 'rejected' });
    });

    test.each([
        'callback',
        'session',
        'authorization',
        'access_token',
        '__data',
        'siteId',
        'localeId',
        'usid',
        'sfdc_usid',
        'dwsid',
        'sfdc_dwsid',
        'code_verifier',
        'idp_refresh_token',
    ])('never forwards sensitive %s values even when explicitly allowlisted', (key) => {
        const permissivePolicy = {
            ...policy,
            allowedQueryParameters: { ...policy.allowedQueryParameters, redirect: [key] },
        };
        const mapping = { statusCode: 302, destinationUrl: '/sale', additionalUrlParams: `${key}=secret` };
        expect(resolveUrlMapping(mapping, options({ sitePolicy: permissivePolicy }))).toEqual({
            type: 'redirect',
            status: 302,
            location: '/sale',
        });
    });

    test('fails closed when site query and external-origin policy is absent', () => {
        expect(
            resolveUrlMapping(
                { statusCode: 302, destinationUrl: '/sale', copySourceParams: true },
                options({ sitePolicy: undefined, requestUrl: 'https://shop.example/legacy?campaign=source' })
            )
        ).toEqual({ type: 'redirect', status: 302, location: '/sale' });
        expect(
            resolveUrlMapping(
                { statusCode: 302, destinationUrl: 'https://approved.example/sale' },
                options({ sitePolicy: undefined })
            )
        ).toEqual({ type: 'rejected' });
    });

    test('detects hybrid ownership after prefix stripping and appends its suffix once', () => {
        expect(
            resolveUrlMapping(
                { statusCode: 301, destinationUrl: '/RefArch/en-US/legacy-products/p1?campaign=sale#details' },
                options()
            )
        ).toEqual({
            type: 'hybrid',
            status: 301,
            location: '/RefArch/en-US/legacy-products/p1.html?campaign=sale#details',
        });
        expect(
            resolveUrlMapping({ statusCode: 302, destinationUrl: '/RefArch/en-US/legacy-products/p1.html' }, options())
        ).toEqual({
            type: 'hybrid',
            status: 302,
            location: '/RefArch/en-US/legacy-products/p1.html',
        });
    });
});
