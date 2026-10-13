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
    createCategoryUrlFromScapiCategory,
    getCategorySlugSegments,
    getSeoSlugExpansion,
    isSafeSlugSegment,
} from './scapi-slugs';

const seoRoutes = {
    IdStore: {
        product: { prefix: 'p' },
        category: { prefix: 'c', mode: 'id-suffix' },
    },
    SlugStore: {
        product: { prefix: 'products' },
        category: { prefix: 'catalog', mode: 'slug-path' },
    },
} satisfies SeoRoutesConfig;

describe('SCAPI slug normalization', () => {
    test('accepts encodable slug segments and rejects dot or malformed Unicode segments', () => {
        expect(isSafeSlugSegment('current café')).toBe(true);
        expect(isSafeSlugSegment('women%2Fgirls')).toBe(true);
        expect(isSafeSlugSegment('.')).toBe(false);
        expect(isSafeSlugSegment('..')).toBe(false);
        expect(isSafeSlugSegment('\uD800')).toBe(false);
    });

    test('requests slug data only when SEO routes are configured', () => {
        expect(getSeoSlugExpansion()).toEqual([]);
        expect(getSeoSlugExpansion(seoRoutes)).toEqual(['slug']);
    });

    test('preserves every authoritative category hierarchy segment', () => {
        expect(getCategorySlugSegments({ slug: 'women/clothing/dresses' })).toEqual(['women', 'clothing', 'dresses']);
    });

    test('normalizes Unicode to NFC without decoding reserved characters', () => {
        expect(getCategorySlugSegments({ slug: 'cafe\u0301/women%2Fgirls' })).toEqual(['café', 'women%2Fgirls']);
    });

    test.each([
        undefined,
        '',
        '   ',
        'women/   /dresses',
        '/women/dresses',
        'women/dresses/',
        'women//dresses',
        'women/./dresses',
        'women/../dresses',
        '\uD800',
        'women/\uD800/dresses',
    ])('rejects a missing or malformed category slug path: %s', (slug) => {
        expect(getCategorySlugSegments({ slug })).toBeUndefined();
    });

    test('builds either category grammar from the same authoritative SCAPI slug', () => {
        const category = { id: 'internal-id', slug: 'women/clothing/dresses' };

        expect(createCategoryUrlFromScapiCategory(category, { siteId: 'IdStore', seoRoutes })).toBe(
            '/c/women/clothing/dresses/internal-id'
        );
        expect(createCategoryUrlFromScapiCategory(category, { siteId: 'SlugStore', seoRoutes })).toBe(
            '/catalog/women/clothing/dresses'
        );
    });

    test('keeps ID-suffix categories usable without a slug but refuses to invent a slug path', () => {
        const category = { id: 'internal-id' };

        expect(createCategoryUrlFromScapiCategory(category, { siteId: 'IdStore', seoRoutes })).toBe('/c/internal-id');
        expect(createCategoryUrlFromScapiCategory(category, { siteId: 'SlugStore', seoRoutes })).toBeUndefined();
    });

    test('does not emit a placeholder destination when an ID-based category has no ID', () => {
        expect(createCategoryUrlFromScapiCategory({ slug: 'women' }, { siteId: 'IdStore', seoRoutes })).toBeUndefined();
    });
});
