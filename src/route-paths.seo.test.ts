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
import type { SeoRoutesConfig } from '@salesforce/storefront-next-runtime/config';
import {
    createCategoryNavigationUrl,
    createCategoryUrl,
    createCategoryUrlFromLegacyPath,
    createProductUrl,
    type CategoryUrlInput,
} from '@/route-paths';

const seoRoutes = {
    RefArch: {
        product: { prefix: 'p' },
        category: { prefix: 'c', mode: 'id-suffix' },
    },
    SlugStore: {
        product: { prefix: 'products' },
        category: { prefix: 'catalog', mode: 'slug-path' },
    },
} satisfies SeoRoutesConfig;

describe('SEO URL builders', () => {
    test('uses the reference product and category splat prefixes when SEO routes are not configured', () => {
        const context = { siteId: 'Unconfigured' };

        expect(createProductUrl({ productId: 'product 1', slug: 'ignored-slug' }, context)).toBe('/p/product%201');
        expect(createCategoryUrl({ categoryId: 'category 1', slugSegments: [] }, context)).toBe('/c/category%201');
    });

    test('rewrites an authored legacy category path to the reference category prefix without SEO configuration', () => {
        expect(
            createCategoryUrlFromLegacyPath('/category/mens/clothing?color=blue#results', {
                siteId: 'Unconfigured',
            })
        ).toBe('/c/clothing?color=blue#results');
    });

    test('rejects an active site omitted from configured SEO routes', () => {
        const context = { siteId: 'Unconfigured', seoRoutes };

        expect(() => createProductUrl({ productId: 'product-1' }, context)).toThrow(
            'SEO routes are configured, but site "Unconfigured" has no SEO route configuration'
        );
        expect(() => createCategoryUrl({ categoryId: 'category-1', slugSegments: [] }, context)).toThrow(
            'SEO routes are configured, but site "Unconfigured" has no SEO route configuration'
        );
    });

    test('builds an ID-suffix product URL from explicit slug segments', () => {
        const context = { siteId: 'RefArch', seoRoutes };

        expect(
            createProductUrl(
                {
                    productId: 'dress/01.html',
                    slugSegments: ['women & girls', 'summer/dresses'],
                    searchParams: new URLSearchParams({ color: 'blue sky', pid: 'variant/01' }),
                },
                context
            )
        ).toBe('/p/women%20%26%20girls/summer%2Fdresses/dress%2F01.html?color=blue+sky&pid=variant%2F01');
    });

    test('allows a configured product URL without decorative slugs', () => {
        expect(createProductUrl({ productId: '123' }, { siteId: 'SlugStore', seoRoutes })).toBe('/products/123');
    });

    test('preserves the complete category hierarchy for ID-suffix mode', () => {
        expect(
            createCategoryUrl(
                { categoryId: 'day-moisturiser', slugSegments: ['skincare', 'moisturisers'] },
                { siteId: 'RefArch', seoRoutes }
            )
        ).toBe('/c/skincare/moisturisers/day-moisturiser');
    });

    test('builds a slug-only category URL without appending the category ID', () => {
        expect(
            createCategoryUrl(
                { categoryId: 'internal-category-id', slugSegments: ['mens', 'clothing'] },
                { siteId: 'SlugStore', seoRoutes }
            )
        ).toBe('/catalog/mens/clothing');
    });

    test('builds category navigation from the route grammar and preserves only non-category filters', () => {
        const searchParams = new URLSearchParams();
        searchParams.append('refine', 'cgid=mens');
        searchParams.append('refine', 'cgslug=mens');
        searchParams.append('refine', 'c_color=blue');
        searchParams.set('sort', 'best-matches');
        searchParams.set('offset', '24');
        searchParams.set('page', '2');

        const destination = createCategoryNavigationUrl(
            { categoryId: 'shirts-id', slugSegments: ['mens', 'clothing', 'shirts'], searchParams },
            { siteId: 'RefArch', seoRoutes }
        );

        expect(destination).toBe('/c/mens/clothing/shirts/shirts-id?sort=best-matches&refine=c_color%3Dblue');
    });

    test('uses the authoritative category slug in slug-path mode', () => {
        expect(
            createCategoryNavigationUrl(
                { categoryId: 'internal-id', slugSegments: ['mens', 'clothing'] },
                { siteId: 'SlugStore', seoRoutes }
            )
        ).toBe('/catalog/mens/clothing');
        expect(
            createCategoryNavigationUrl({ categoryId: 'internal-id' }, { siteId: 'SlugStore', seoRoutes })
        ).toBeUndefined();
    });

    test('does not treat an authored legacy category path as authoritative slug data', () => {
        expect(
            createCategoryUrlFromLegacyPath('/category/skincare/moisturisers', { siteId: 'RefArch', seoRoutes })
        ).toBe('/c/moisturisers');
        expect(createCategoryUrlFromLegacyPath('/category/mens/clothing', { siteId: 'SlugStore', seoRoutes })).toBe(
            '/search?refine=cgid%3Dclothing'
        );
    });

    test('does not rewrite external or non-category authored destinations', () => {
        const context = { siteId: 'RefArch', seoRoutes };

        expect(createCategoryUrlFromLegacyPath('https://example.com/category/womens', context)).toBe(
            'https://example.com/category/womens'
        );
        expect(createCategoryUrlFromLegacyPath('/about-us', context)).toBe('/about-us');
    });

    test('preserves query, hash, and encoded path-segment boundaries', () => {
        expect(
            createCategoryUrlFromLegacyPath('/category/women%2Fgirls?color=blue#results', {
                siteId: 'SlugStore',
                seoRoutes,
            })
        ).toBe('/search?color=blue&refine=cgid%3Dwomen%2Fgirls#results');
    });

    test('replaces stale category refinements when degrading a legacy category path to search', () => {
        expect(
            createCategoryUrlFromLegacyPath(
                '/category/womens?refine=cgid%3Dold&refine=color%3Dred&refine=cgslug%3Dold-path',
                { siteId: 'SlugStore', seoRoutes }
            )
        ).toBe('/search?refine=color%3Dred&refine=cgid%3Dwomens');
    });

    test('normalizes a trailing slash before mapping an ID-suffix category path', () => {
        expect(
            createCategoryUrlFromLegacyPath('/category/skincare/moisturisers/?color=blue#results', {
                siteId: 'RefArch',
                seoRoutes,
            })
        ).toBe('/c/moisturisers?color=blue#results');
    });

    test('normalizes a trailing slash before mapping a slug-path category path', () => {
        expect(
            createCategoryUrlFromLegacyPath('/category/mens/clothing/', {
                siteId: 'SlugStore',
                seoRoutes,
            })
        ).toBe('/search?refine=cgid%3Dclothing');
    });

    test('leaves malformed encoded authored paths unchanged', () => {
        const path = '/category/invalid%path';
        expect(createCategoryUrlFromLegacyPath(path, { siteId: 'RefArch', seoRoutes })).toBe(path);
    });

    test('requires explicit category hierarchy when SEO routes are configured', () => {
        expect(() =>
            createCategoryUrl({ categoryId: 'day-moisturiser' } as CategoryUrlInput, { siteId: 'RefArch', seoRoutes })
        ).toThrow('Category slug segments are required when SEO routes are configured');
    });

    test('rejects an empty slug path in category slug-path mode', () => {
        expect(() =>
            createCategoryUrl(
                { categoryId: 'internal-category-id', slugSegments: [] },
                { siteId: 'SlugStore', seoRoutes }
            )
        ).toThrow('Category slug-path mode requires at least one slug segment');
    });

    test('returns a non-navigation target when an authoritative identifier is absent', () => {
        expect(createProductUrl({}, { siteId: 'RefArch', seoRoutes })).toBe('#');
        expect(createCategoryUrl({ slugSegments: [] }, { siteId: 'Unconfigured' })).toBe('#');
    });

    test('preserves the reference category root path for an explicitly empty category ID', () => {
        expect(createCategoryUrl({ categoryId: '', slugSegments: [] }, { siteId: 'Unconfigured' })).toBe('/c/');
    });

    test('rejects empty path segments instead of emitting ambiguous double slashes', () => {
        expect(() =>
            createCategoryUrl({ categoryId: '123', slugSegments: ['valid', ''] }, { siteId: 'RefArch', seoRoutes })
        ).toThrow('URL path segments must not be empty');
    });

    test('encodes Unicode and reserved punctuation in each path segment', () => {
        expect(
            createProductUrl({ productId: "café%'!()*", slug: "women's picks" }, { siteId: 'RefArch', seoRoutes })
        ).toBe('/p/women%27s%20picks/caf%C3%A9%25%27%21%28%29%2A');
    });
});
