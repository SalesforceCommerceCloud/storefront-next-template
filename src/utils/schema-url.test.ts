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
import { describe, it, expect } from 'vitest';
import { buildSchemaUrl, buildProductSchemaUrl, buildCategorySchemaUrl } from './schema-url';

describe('buildSchemaUrl', () => {
    const origin = 'https://example.com';

    it('should preserve site/locale prefix from category page', () => {
        const url = buildSchemaUrl({
            origin,
            currentPageUrl: 'https://example.com/global/en-GB/c/womens',
            path: '/p/12345',
        });

        expect(url).toBe('https://example.com/global/en-GB/p/12345');
    });

    it('should preserve site/locale prefix from product page', () => {
        const url = buildSchemaUrl({
            origin,
            currentPageUrl: 'https://example.com/global/en-GB/p/12345',
            path: '/c/womens',
        });

        expect(url).toBe('https://example.com/global/en-GB/c/womens');
    });

    it('should handle single segment prefix (locale only)', () => {
        const url = buildSchemaUrl({
            origin,
            currentPageUrl: 'https://example.com/en-US/c/mens',
            path: '/p/67890',
        });

        expect(url).toBe('https://example.com/en-US/p/67890');
    });

    it('should handle no prefix (root level)', () => {
        const url = buildSchemaUrl({
            origin,
            currentPageUrl: 'https://example.com/c/accessories',
            path: '/p/11111',
        });

        expect(url).toBe('https://example.com/p/11111');
    });

    it('should handle path without leading slash', () => {
        const url = buildSchemaUrl({
            origin,
            currentPageUrl: 'https://example.com/global/en-GB/c/womens',
            path: 'p/12345',
        });

        expect(url).toBe('https://example.com/global/en-GB/p/12345');
    });

    it('should handle search pages', () => {
        const url = buildSchemaUrl({
            origin,
            currentPageUrl: 'https://example.com/global/en-GB/search?q=shoes',
            path: '/p/99999',
        });

        expect(url).toBe('https://example.com/global/en-GB/p/99999');
    });

    it('should return undefined if origin is missing', () => {
        const url = buildSchemaUrl({
            origin: '',
            currentPageUrl: 'https://example.com/c/test',
            path: '/p/123',
        });

        expect(url).toBeUndefined();
    });

    it('should return undefined if path is missing', () => {
        const url = buildSchemaUrl({
            origin,
            currentPageUrl: 'https://example.com/c/test',
            path: '',
        });

        expect(url).toBeUndefined();
    });

    it('should handle malformed currentPageUrl gracefully', () => {
        const url = buildSchemaUrl({
            origin,
            currentPageUrl: 'not-a-valid-url',
            path: '/p/123',
        });

        expect(url).toBe('https://example.com/p/123');
    });

    it('should preserve query parameters in path', () => {
        const url = buildSchemaUrl({
            origin,
            currentPageUrl: 'https://example.com/global/en-GB/c/womens',
            path: '/p/12345?pid=variant1',
        });

        expect(url).toBe('https://example.com/global/en-GB/p/12345?pid=variant1');
    });
});

describe('buildProductSchemaUrl', () => {
    const origin = 'https://example.com';

    it('should build product URL with site/locale prefix', () => {
        const url = buildProductSchemaUrl({
            productId: '12345',
            origin,
            currentPageUrl: 'https://example.com/global/en-GB/c/womens',
        });

        expect(url).toBe('https://example.com/global/en-GB/p/12345');
    });

    it('should build product URL without prefix', () => {
        const url = buildProductSchemaUrl({
            productId: '67890',
            origin,
            currentPageUrl: 'https://example.com/c/mens',
        });

        expect(url).toBe('https://example.com/p/67890');
    });

    it('should return undefined if productId is missing', () => {
        const url = buildProductSchemaUrl({
            productId: undefined,
            origin,
            currentPageUrl: 'https://example.com/c/test',
        });

        expect(url).toBeUndefined();
    });

    it('should return undefined if productId is empty string', () => {
        const url = buildProductSchemaUrl({
            productId: '',
            origin,
            currentPageUrl: 'https://example.com/c/test',
        });

        expect(url).toBeUndefined();
    });

    it('should handle product URL from product page context', () => {
        const url = buildProductSchemaUrl({
            productId: '99999',
            origin,
            currentPageUrl: 'https://example.com/global/en-GB/p/88888',
        });

        expect(url).toBe('https://example.com/global/en-GB/p/99999');
    });

    it('uses the active site product prefix and slug', () => {
        const url = buildProductSchemaUrl({
            productId: '99999',
            slug: 'modern-shirt',
            origin,
            currentPageUrl: 'https://example.com/global/en-GB/c/mens',
            seoUrlContext: {
                siteId: 'RefArch',
                seoRoutes: {
                    RefArch: {
                        product: { prefix: 'p' },
                        category: { prefix: 'c', mode: 'id-suffix' },
                    },
                },
            },
        });

        expect(url).toBe('https://example.com/global/en-GB/p/modern-shirt/99999');
    });

    it('preserves the resolved outer prefix when it shares the product route prefix', () => {
        const url = buildProductSchemaUrl({
            productId: '99999',
            slug: 'modern-shirt',
            origin,
            currentPageUrl: 'https://example.com/shop/en-US/shop/current-shirt/88888',
            seoUrlContext: {
                siteId: 'RefArch',
                urlPrefix: '/shop/:localeId',
                seoRoutes: {
                    RefArch: {
                        product: { prefix: 'shop' },
                        category: { prefix: 'c', mode: 'id-suffix' },
                    },
                },
            },
        });

        expect(url).toBe('https://example.com/shop/en-US/shop/modern-shirt/99999');
    });
});

describe('buildCategorySchemaUrl', () => {
    const origin = 'https://example.com';

    it('should build category URL with site/locale prefix', () => {
        const url = buildCategorySchemaUrl({
            categoryId: 'womens-clothing',
            origin,
            currentPageUrl: 'https://example.com/global/en-GB/c/womens',
        });

        expect(url).toBe('https://example.com/global/en-GB/c/womens-clothing');
    });

    it('should build category URL without prefix', () => {
        const url = buildCategorySchemaUrl({
            categoryId: 'mens-shoes',
            origin,
            currentPageUrl: 'https://example.com/p/12345',
        });

        expect(url).toBe('https://example.com/c/mens-shoes');
    });

    it('should return undefined if categoryId is missing', () => {
        const url = buildCategorySchemaUrl({
            categoryId: undefined,
            origin,
            currentPageUrl: 'https://example.com/p/test',
        });

        expect(url).toBeUndefined();
    });

    it('should return undefined if categoryId is empty string', () => {
        const url = buildCategorySchemaUrl({
            categoryId: '',
            origin,
            currentPageUrl: 'https://example.com/p/test',
        });

        expect(url).toBeUndefined();
    });

    it('should handle category URL from search page context', () => {
        const url = buildCategorySchemaUrl({
            categoryId: 'accessories',
            origin,
            currentPageUrl: 'https://example.com/global/en-GB/search?q=bags',
        });

        expect(url).toBe('https://example.com/global/en-GB/c/accessories');
    });

    it('uses the active site category prefix for an ID-suffix URL', () => {
        const url = buildCategorySchemaUrl({
            categoryId: 'womens-clothing',
            origin,
            currentPageUrl: 'https://example.com/global/en-GB/c/dresses',
            seoUrlContext: {
                siteId: 'RefArch',
                seoRoutes: {
                    RefArch: {
                        product: { prefix: 'p' },
                        category: { prefix: 'c', mode: 'id-suffix' },
                    },
                },
            },
        });

        expect(url).toBe('https://example.com/global/en-GB/c/womens-clothing');
    });

    it('preserves the resolved outer prefix when it shares the category route prefix', () => {
        const url = buildCategorySchemaUrl({
            categoryId: 'womens-clothing',
            origin,
            currentPageUrl: 'https://example.com/shop/en-US/shop/dresses',
            seoUrlContext: {
                siteId: 'RefArch',
                urlPrefix: '/shop/:localeId',
                seoRoutes: {
                    RefArch: {
                        product: { prefix: 'p' },
                        category: { prefix: 'shop', mode: 'id-suffix' },
                    },
                },
            },
        });

        expect(url).toBe('https://example.com/shop/en-US/shop/womens-clothing');
    });

    it('does not invent a slug-only category URL when authoritative slugs are unavailable', () => {
        const url = buildCategorySchemaUrl({
            categoryId: 'internal-id',
            origin,
            currentPageUrl: 'https://example.com/global/en-GB/catalog/mens/clothing',
            seoUrlContext: {
                siteId: 'RefArch',
                seoRoutes: {
                    RefArch: {
                        product: { prefix: 'p' },
                        category: { prefix: 'catalog', mode: 'slug-path' },
                    },
                },
            },
        });

        expect(url).toBeUndefined();
    });
});
