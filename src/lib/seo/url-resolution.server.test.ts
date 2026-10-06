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

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    decodeFinalRawSegment,
    resolveCategoryRoute,
    resolveContentRoute,
    resolveProductRoute,
} from './url-resolution.server';
import type { SeoRoutesConfig } from '@salesforce/storefront-next-runtime/config';
import { createProductUrl } from '@/route-paths';

const idFor = (path: string) => decodeFinalRawSegment(new URL(`https://example.com${path}`));

describe('decodeFinalRawSegment', () => {
    test('resolves the same ID from the ID-only and multi-level-slug forms', () => {
        expect(idFor('/en-US/p/PROD-123')).toBe('PROD-123');
        expect(idFor('/en-US/p/mens/shirts/blue-oxford/PROD-123')).toBe('PROD-123');
    });

    test('keeps a final .html as part of the ID', () => {
        expect(idFor('/en-US/p/some-slug/PROD-123.html')).toBe('PROD-123.html');
    });

    test('decodes the segment only after isolating it', () => {
        // The raw segment is read from the URL and decoded last, so percent-encoded
        // characters survive into the ID rather than mis-splitting the path.
        expect(idFor('/en-US/p/PROD%20123')).toBe('PROD 123');
    });

    test('ignores query params when isolating the final segment', () => {
        expect(idFor('/en-US/p/slug/PROD-123?pid=variant-9')).toBe('PROD-123');
    });

    test('tolerates one or more trailing slashes', () => {
        expect(idFor('/en-US/p/slug/PROD-123/')).toBe('PROD-123');
        expect(idFor('/en-US/p/slug/PROD-123//')).toBe('PROD-123');
    });

    test('falls back to the raw segment when percent-encoding is malformed', () => {
        // A lone % is invalid input at the URL boundary; the raw segment is returned so the
        // downstream product lookup 404s cleanly instead of throwing from decodeURIComponent.
        expect(idFor('/en-US/p/PROD%ZZ')).toBe('PROD%ZZ');
    });

    test('resolves an empty ID for a bare alias prefix with no resource segment', () => {
        // The alias route is mounted at `{prefix}/*`, so the bare prefix matches with an empty
        // splat. Returning '' lets the lookup 404 rather than resolving the prefix ('p') as an ID.
        const bareFor = (path: string, aliasSplat: string) =>
            decodeFinalRawSegment(new URL(`https://example.com${path}`), { '*': aliasSplat });
        expect(bareFor('/en-US/p', '')).toBe('');
        expect(bareFor('/en-US/p/', '')).toBe('');
        expect(bareFor('/en-US/p//', '/')).toBe('');
    });

    test('resolves the ID when the alias splat carries a resource segment', () => {
        const withSplat = (path: string, aliasSplat: string) =>
            decodeFinalRawSegment(new URL(`https://example.com${path}`), { '*': aliasSplat });
        expect(withSplat('/en-US/p/PROD-123', 'PROD-123')).toBe('PROD-123');
        expect(withSplat('/en-US/p/mens/shirts/PROD-123', 'mens/shirts/PROD-123')).toBe('PROD-123');
    });
});

const seoRoutes: SeoRoutesConfig = {
    RefArch: {
        product: { prefix: 'p' },
        category: { prefix: 'c', mode: 'id-suffix' },
        content: { prefix: 'cms' },
    },
    SlugStore: {
        product: { prefix: 'product' },
        category: { prefix: 'catalog', mode: 'slug-path' },
        content: { prefix: 'stories' },
    },
};

describe('resolveProductRoute', () => {
    test('round-trips a configured product ID ending in .html', () => {
        const context = { siteId: 'RefArch', seoRoutes };
        const productPath = createProductUrl({ productId: 'prod-A01.html' }, context);

        expect(productPath).toBe('/p/prod-A01.html.html');
        expect(
            resolveProductRoute({
                url: new URL(`https://example.com/RefArch/en-US${productPath}`),
                params: { '*': productPath.slice('/p/'.length) },
                urlPrefix: '/:siteId/:localeId',
                ...context,
            })
        ).toEqual({ productId: 'prod-A01.html' });
    });

    test('accepts only the active site product prefix and reads the final raw ID segment', () => {
        expect(
            resolveProductRoute({
                url: new URL('https://example.com/RefArch/en-US/p/mens/PROD%2F123'),
                params: { '*': 'mens/PROD/123' },
                urlPrefix: '/:siteId/:localeId',
                siteId: 'RefArch',
                seoRoutes,
            })
        ).toEqual({ productId: 'PROD/123' });

        expect(
            resolveProductRoute({
                url: new URL('https://example.com/RefArch/en-US/product/PROD-123'),
                params: { '*': 'PROD-123' },
                urlPrefix: '/:siteId/:localeId',
                siteId: 'RefArch',
                seoRoutes,
            })
        ).toBeNull();
    });

    test('removes one Commerce-generated .html suffix before product lookup', () => {
        expect(
            resolveProductRoute({
                url: new URL('https://example.com/RefArch/en-US/p/men/PROD-123.html'),
                params: { '*': 'men/PROD-123.html' },
                urlPrefix: '/:siteId/:localeId',
                siteId: 'RefArch',
                seoRoutes,
            })
        ).toEqual({ productId: 'PROD-123' });
    });
});

describe('resolveContentRoute', () => {
    test.each([
        ['/RefArch/en-US/cms/content/about', { type: 'content', resourceId: 'about', slugSegments: [] }],
        [
            '/RefArch/en-US/cms/page/campaigns/spring/landing.html',
            { type: 'page', resourceId: 'landing', slugSegments: ['campaigns', 'spring'] },
        ],
        [
            '/RefArch/en-US/cms/content/stories/our%20history',
            { type: 'content', resourceId: 'our history', slugSegments: ['stories'] },
        ],
        [
            '/RefArch/en-US/CMS/CONTENT/stories/about',
            { type: 'content', resourceId: 'about', slugSegments: ['stories'] },
        ],
    ])('resolves %s using the explicit resource discriminator', (pathname, expected) => {
        expect(
            resolveContentRoute({
                url: new URL(`https://example.com${pathname}`),
                urlPrefix: '/:siteId/:localeId',
                siteId: 'RefArch',
                seoRoutes,
            })
        ).toEqual(expected);
    });

    test.each([
        '/RefArch/en-US/stories/content/about',
        '/RefArch/en-US/cms/asset/about',
        '/RefArch/en-US/cms/content',
        '/RefArch/en-US/cms/page/',
        '/RefArch/en-US/cms/content//about',
        '/RefArch/en-US/cms/content/about%ZZ',
    ])('rejects a path outside the active site content grammar: %s', (pathname) => {
        expect(
            resolveContentRoute({
                url: new URL(`https://example.com${pathname}`),
                urlPrefix: '/:siteId/:localeId',
                siteId: 'RefArch',
                seoRoutes,
            })
        ).toBeNull();
    });
});

describe('resolveCategoryRoute', () => {
    test('resolves an ID-suffix route to one authoritative cgid refinement', () => {
        expect(
            resolveCategoryRoute({
                url: new URL('https://example.com/RefArch/en-US/c/womens/shoes/womens-shoes'),
                params: { '*': 'womens/shoes/womens-shoes' },
                urlPrefix: '/:siteId/:localeId',
                siteId: 'RefArch',
                seoRoutes,
            })
        ).toEqual({
            categoryLookup: 'womens-shoes',
            routeRefinement: 'cgid=womens-shoes',
            slugPath: undefined,
        });
    });

    test('preserves the complete decoded hierarchy for slug-path lookup and search', () => {
        expect(
            resolveCategoryRoute({
                url: new URL('https://example.com/SlugStore/en-US/catalog/skin%20care/moisturisers/day'),
                params: { '*': 'skin care/moisturisers/day' },
                urlPrefix: '/:siteId/:localeId',
                siteId: 'SlugStore',
                seoRoutes,
            })
        ).toEqual({
            categoryLookup: 'skin care/moisturisers/day',
            routeRefinement: 'cgslug=skin care/moisturisers/day',
            slugPath: 'skin care/moisturisers/day',
        });
    });

    test('rejects a category alias owned by another configured site', () => {
        expect(
            resolveCategoryRoute({
                url: new URL('https://example.com/RefArch/en-US/catalog/womens/shoes'),
                params: { '*': 'womens/shoes' },
                urlPrefix: '/:siteId/:localeId',
                siteId: 'RefArch',
                seoRoutes,
            })
        ).toBeNull();
    });

    test('rejects empty segments inside a deterministic path', () => {
        expect(
            resolveCategoryRoute({
                url: new URL('https://example.com/SlugStore/en-US/catalog/womens//shoes'),
                urlPrefix: '/:siteId/:localeId',
                siteId: 'SlugStore',
                seoRoutes,
            })
        ).toBeNull();
    });
});

describe('configured SEO routes with an MRT base path', () => {
    beforeEach(() => {
        vi.stubGlobal('window', undefined);
        vi.stubEnv('MRT_ENV_BASE_PATH', '/shop');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    test('resolves a product route after the base path', () => {
        expect(
            resolveProductRoute({
                url: new URL('https://example.com/shop/RefArch/en-US/p/mens/PROD-123.html'),
                params: { '*': 'mens/PROD-123.html' },
                urlPrefix: '/:siteId/:localeId',
                siteId: 'RefArch',
                seoRoutes,
            })
        ).toEqual({ productId: 'PROD-123' });
    });

    test('resolves a category route after the base path', () => {
        expect(
            resolveCategoryRoute({
                url: new URL('https://example.com/shop/RefArch/en-US/c/womens/womens-shoes'),
                params: { '*': 'womens/womens-shoes' },
                urlPrefix: '/:siteId/:localeId',
                siteId: 'RefArch',
                seoRoutes,
            })
        ).toEqual({
            categoryLookup: 'womens-shoes',
            routeRefinement: 'cgid=womens-shoes',
        });
    });

    test('resolves a content route after the base path', () => {
        expect(
            resolveContentRoute({
                url: new URL('https://example.com/shop/RefArch/en-US/cms/page/about'),
                params: { '*': 'page/about' },
                urlPrefix: '/:siteId/:localeId',
                siteId: 'RefArch',
                seoRoutes,
            })
        ).toEqual({
            type: 'page',
            resourceId: 'about',
            slugSegments: [],
        });
    });
});
