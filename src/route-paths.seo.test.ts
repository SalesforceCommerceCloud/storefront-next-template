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
    test('preserves legacy paths when SEO routes are not configured', () => {
        const context = { siteId: 'Unconfigured' };

        expect(createProductUrl({ productId: 'product 1', slugSegments: ['ignored-slug'] }, context)).toBe(
            '/product/product%201'
        );
        expect(createCategoryUrl({ categoryId: 'category 1', slugSegments: [] }, context)).toBe(
            '/category/category%201'
        );
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

    test('maps an authored legacy category path to each configured category grammar', () => {
        expect(
            createCategoryUrlFromLegacyPath('/category/skincare/moisturisers', { siteId: 'RefArch', seoRoutes })
        ).toBe('/c/skincare/moisturisers');
        expect(createCategoryUrlFromLegacyPath('/category/mens/clothing', { siteId: 'SlugStore', seoRoutes })).toBe(
            '/catalog/mens/clothing'
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
        ).toBe('/catalog/women%2Fgirls?color=blue#results');
    });

    test('normalizes a trailing slash before mapping an ID-suffix category path', () => {
        expect(
            createCategoryUrlFromLegacyPath('/category/skincare/moisturisers/?color=blue#results', {
                siteId: 'RefArch',
                seoRoutes,
            })
        ).toBe('/c/skincare/moisturisers?color=blue#results');
    });

    test('normalizes a trailing slash before mapping a slug-path category path', () => {
        expect(
            createCategoryUrlFromLegacyPath('/category/mens/clothing/', {
                siteId: 'SlugStore',
                seoRoutes,
            })
        ).toBe('/catalog/mens/clothing');
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

    test('preserves the legacy category root path for an explicitly empty category ID', () => {
        expect(createCategoryUrl({ categoryId: '', slugSegments: [] }, { siteId: 'Unconfigured' })).toBe('/category/');
    });

    test('rejects empty path segments instead of emitting ambiguous double slashes', () => {
        expect(() =>
            createProductUrl({ productId: '123', slugSegments: ['valid', ''] }, { siteId: 'RefArch', seoRoutes })
        ).toThrow('URL path segments must not be empty');
    });

    test('encodes Unicode and reserved punctuation in each path segment', () => {
        expect(
            createProductUrl(
                { productId: "café%'!()*", slugSegments: ["women's picks"] },
                { siteId: 'RefArch', seoRoutes }
            )
        ).toBe('/p/women%27s%20picks/caf%C3%A9%25%27%21%28%29%2A');
    });
});
