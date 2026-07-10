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
import { describe, expect, it } from 'vitest';
import {
    buildUrl,
    parseSearchConfig,
    extractPrefixParams,
    decomposeUrl,
    resolvePrefix,
    stripPathPrefix,
    extractPrefixParamValues,
} from './build-url';

describe('parseSearchConfig', () => {
    it('preserves :param placeholders for a single param with leading ?', () => {
        expect(parseSearchConfig('?lng=:localeId')).toEqual({ lng: ':localeId' });
    });

    it('preserves :param placeholders without leading ?', () => {
        expect(parseSearchConfig('lng=:localeId')).toEqual({ lng: ':localeId' });
    });

    it('preserves :param placeholders for multiple params', () => {
        expect(parseSearchConfig('?lng=:localeId&site=:siteId')).toEqual({
            lng: ':localeId',
            site: ':siteId',
        });
    });

    it('preserves literal (non-param) values', () => {
        expect(parseSearchConfig('?mode=dark')).toEqual({ mode: 'dark' });
    });

    it('returns empty object for empty string', () => {
        expect(parseSearchConfig('')).toEqual({});
    });

    it('returns empty object for just ?', () => {
        expect(parseSearchConfig('?')).toEqual({});
    });
});

describe('extractPrefixParams', () => {
    it('extracts single param', () => {
        expect(extractPrefixParams('/:siteId')).toEqual(['siteId']);
    });

    it('extracts multiple params', () => {
        expect(extractPrefixParams('/:siteId/:localeId')).toEqual(['siteId', 'localeId']);
    });

    it('returns empty array for no params', () => {
        expect(extractPrefixParams('/')).toEqual([]);
    });

    it('returns empty array for empty string', () => {
        expect(extractPrefixParams('')).toEqual([]);
    });
});

describe('decomposeUrl', () => {
    it('decomposes a plain pathname', () => {
        expect(decomposeUrl('/product/123')).toEqual({ pathname: '/product/123', search: '', hash: '' });
    });

    it('decomposes pathname with search', () => {
        expect(decomposeUrl('/product/123?color=red')).toEqual({
            pathname: '/product/123',
            search: 'color=red',
            hash: '',
        });
    });

    it('decomposes pathname with hash', () => {
        expect(decomposeUrl('/product/123#details')).toEqual({
            pathname: '/product/123',
            search: '',
            hash: '#details',
        });
    });

    it('decomposes pathname with search and hash', () => {
        expect(decomposeUrl('/product/123?color=red#details')).toEqual({
            pathname: '/product/123',
            search: 'color=red',
            hash: '#details',
        });
    });

    it('handles root path', () => {
        expect(decomposeUrl('/')).toEqual({ pathname: '/', search: '', hash: '' });
    });

    it('handles empty string', () => {
        expect(decomposeUrl('')).toEqual({ pathname: '', search: '', hash: '' });
    });
});

describe('resolvePrefix', () => {
    it('resolves a single param', () => {
        expect(resolvePrefix({ prefix: '/:siteId', params: { siteId: 'global' } })).toBe('/global');
    });

    it('resolves multiple params', () => {
        expect(resolvePrefix({ prefix: '/:siteId/:localeId', params: { siteId: 'global', localeId: 'en-GB' } })).toBe(
            '/global/en-GB'
        );
    });

    it('leaves unmatched params as-is', () => {
        expect(resolvePrefix({ prefix: '/:siteId/:localeId', params: { siteId: 'global' } })).toBe('/global/:localeId');
    });

    it('returns prefix unchanged when no params match', () => {
        expect(resolvePrefix({ prefix: '/:siteId', params: {} })).toBe('/:siteId');
    });
});

describe('stripPathPrefix', () => {
    describe('pattern prefix (placeholder segments)', () => {
        it('strips /:siteId/:localeId', () => {
            expect(stripPathPrefix({ pathname: '/global/en-GB/checkout', prefix: '/:siteId/:localeId' })).toBe(
                '/checkout'
            );
            expect(stripPathPrefix({ pathname: '/us/en-US/product/123', prefix: '/:siteId/:localeId' })).toBe(
                '/product/123'
            );
            expect(stripPathPrefix({ pathname: '/global/it-IT/category/womens', prefix: '/:siteId/:localeId' })).toBe(
                '/category/womens'
            );
        });

        it('strips /:localeId/:siteId (reversed order)', () => {
            expect(stripPathPrefix({ pathname: '/en-GB/global/x', prefix: '/:localeId/:siteId' })).toBe('/x');
        });

        it('strips /:localeId', () => {
            expect(stripPathPrefix({ pathname: '/en-GB/checkout', prefix: '/:localeId' })).toBe('/checkout');
            expect(stripPathPrefix({ pathname: '/en-US/product/123', prefix: '/:localeId' })).toBe('/product/123');
        });

        it('strips /:siteId', () => {
            expect(stripPathPrefix({ pathname: '/global/checkout', prefix: '/:siteId' })).toBe('/checkout');
        });
    });

    describe('resolved prefix (literal segments)', () => {
        it('strips a matching resolved prefix', () => {
            expect(stripPathPrefix({ pathname: '/global/en-GB/product/123', prefix: '/global/en-GB' })).toBe(
                '/product/123'
            );
        });

        it('returns pathname unchanged when literal prefix does not match', () => {
            expect(stripPathPrefix({ pathname: '/product/123', prefix: '/global/en-GB' })).toBe('/product/123');
        });

        it('does not strip a partial segment match', () => {
            expect(stripPathPrefix({ pathname: '/global/en-GB-extra/page', prefix: '/global/en-GB' })).toBe(
                '/global/en-GB-extra/page'
            );
        });
    });

    describe('mixed prefix (literals + placeholders)', () => {
        it('strips a basePath-style prefix (/shop/:localeId)', () => {
            expect(stripPathPrefix({ pathname: '/shop/en-GB/x', prefix: '/shop/:localeId' })).toBe('/x');
        });

        it('returns pathname unchanged when literal segment in mixed prefix does not match', () => {
            expect(stripPathPrefix({ pathname: '/store/en-GB/x', prefix: '/shop/:localeId' })).toBe('/store/en-GB/x');
        });

        it('strips locale + literal (/:locale/something)', () => {
            expect(stripPathPrefix({ pathname: '/en-GB/something/product/123', prefix: '/:locale/something' })).toBe(
                '/product/123'
            );
        });

        it('returns pathname unchanged when literal in mixed prefix does not match', () => {
            expect(stripPathPrefix({ pathname: '/en-GB/other/x', prefix: '/:locale/something' })).toBe(
                '/en-GB/other/x'
            );
        });
    });

    describe('edge cases', () => {
        it('returns "" when pathname equals a pattern prefix exactly', () => {
            expect(stripPathPrefix({ pathname: '/global/en-GB', prefix: '/:siteId/:localeId' })).toBe('');
        });

        it('returns "" when pathname equals a resolved prefix exactly', () => {
            expect(stripPathPrefix({ pathname: '/global/en-GB', prefix: '/global/en-GB' })).toBe('');
        });

        it('returns pathname unchanged when shorter than the prefix', () => {
            expect(stripPathPrefix({ pathname: '/checkout', prefix: '/:siteId/:localeId' })).toBe('/checkout');
            expect(stripPathPrefix({ pathname: '/', prefix: '/:siteId/:localeId' })).toBe('/');
            expect(stripPathPrefix({ pathname: '/global', prefix: '/:siteId/:localeId' })).toBe('/global');
        });

        it('returns pathname unchanged when prefix is empty', () => {
            expect(stripPathPrefix({ pathname: '/checkout', prefix: '' })).toBe('/checkout');
            expect(stripPathPrefix({ pathname: '/global/en-GB/checkout', prefix: '' })).toBe('/global/en-GB/checkout');
        });

        it('returns pathname unchanged when prefix is "/"', () => {
            expect(stripPathPrefix({ pathname: '/checkout', prefix: '/' })).toBe('/checkout');
        });
    });
});

describe('extractPrefixParamValues', () => {
    it('captures siteId + localeId from a /:siteId/:localeId prefix', () => {
        expect(extractPrefixParamValues({ pathname: '/global/en-GB/cart', prefix: '/:siteId/:localeId' })).toEqual({
            siteId: 'global',
            localeId: 'en-GB',
        });
    });

    it('captures a single locale alias from a /:localeId prefix', () => {
        expect(extractPrefixParamValues({ pathname: '/uk/cart', prefix: '/:localeId' })).toEqual({ localeId: 'uk' });
    });

    it('captures the placeholder from a mixed (literal + placeholder) prefix', () => {
        expect(extractPrefixParamValues({ pathname: '/shop/uk/x', prefix: '/shop/:localeId' })).toEqual({
            localeId: 'uk',
        });
    });

    it('captures when the pathname equals the prefix exactly (no remainder)', () => {
        expect(extractPrefixParamValues({ pathname: '/global/en-GB', prefix: '/:siteId/:localeId' })).toEqual({
            siteId: 'global',
            localeId: 'en-GB',
        });
    });

    it('returns {} when the path has fewer segments than the prefix', () => {
        expect(extractPrefixParamValues({ pathname: '/cart', prefix: '/:siteId/:localeId' })).toEqual({});
        expect(extractPrefixParamValues({ pathname: '/global', prefix: '/:siteId/:localeId' })).toEqual({});
    });

    it('returns {} when a literal segment does not match', () => {
        expect(extractPrefixParamValues({ pathname: '/store/uk/x', prefix: '/shop/:localeId' })).toEqual({});
    });

    it('returns {} for an empty or root prefix', () => {
        expect(extractPrefixParamValues({ pathname: '/cart', prefix: '' })).toEqual({});
        expect(extractPrefixParamValues({ pathname: '/cart', prefix: '/' })).toEqual({});
    });

    it('round-trips with stripPathPrefix: bare path + captured params reconstruct the input', () => {
        const pathname = '/global/en-GB/product/123';
        const prefix = '/:siteId/:localeId';
        const params = extractPrefixParamValues({ pathname, prefix });
        const bare = stripPathPrefix({ pathname, prefix });
        expect(`/${params.siteId}/${params.localeId}${bare}`).toBe(pathname);
    });
});

describe('buildUrl', () => {
    describe('pass-through cases', () => {
        it('returns to unchanged when no urlConfig', () => {
            expect(buildUrl({ to: '/product/123', params: {} })).toBe('/product/123');
        });

        it('returns empty string unchanged', () => {
            expect(buildUrl({ to: '', urlConfig: { prefix: '/:siteId' }, params: { siteId: 'global' } })).toBe('');
        });

        it('returns hash-only unchanged', () => {
            expect(buildUrl({ to: '#', urlConfig: { prefix: '/:siteId' }, params: { siteId: 'global' } })).toBe('#');
        });

        it('returns http URLs unchanged', () => {
            expect(
                buildUrl({
                    to: 'http://example.com/page',
                    urlConfig: { prefix: '/:siteId' },
                    params: { siteId: 'global' },
                })
            ).toBe('http://example.com/page');
        });

        it('returns protocol-relative URLs unchanged', () => {
            expect(
                buildUrl({
                    to: '//example.com/page',
                    urlConfig: { prefix: '/:siteId' },
                    params: { siteId: 'global' },
                })
            ).toBe('//example.com/page');
        });

        it('returns https URLs unchanged', () => {
            expect(
                buildUrl({
                    to: 'https://example.com/page',
                    urlConfig: { prefix: '/:siteId' },
                    params: { siteId: 'global' },
                })
            ).toBe('https://example.com/page');
        });

        it('returns mailto: links unchanged', () => {
            expect(
                buildUrl({
                    to: 'mailto:sales@example.com',
                    urlConfig: { prefix: '/:siteId' },
                    params: { siteId: 'global' },
                })
            ).toBe('mailto:sales@example.com');
        });

        it('returns tel: links unchanged', () => {
            expect(
                buildUrl({
                    to: 'tel:+18005551234',
                    urlConfig: { prefix: '/:siteId' },
                    params: { siteId: 'global' },
                })
            ).toBe('tel:+18005551234');
        });

        it('returns to unchanged when prefix is /', () => {
            expect(buildUrl({ to: '/product/123', urlConfig: { prefix: '/' }, params: {} })).toBe('/product/123');
        });
    });

    describe('scheme-less external links', () => {
        it('normalizes a bare external domain to https (no site prefix)', () => {
            expect(
                buildUrl({
                    to: 'www.google.com',
                    urlConfig: { prefix: '/:siteId/:localeId' },
                    params: { siteId: 'MarketStreet', localeId: 'en-GB' },
                })
            ).toBe('https://www.google.com');
        });

        it('normalizes a bare external domain with a path to https', () => {
            expect(
                buildUrl({
                    to: 'example.com/products?ref=1',
                    urlConfig: { prefix: '/:siteId' },
                    params: { siteId: 'global' },
                })
            ).toBe('https://example.com/products?ref=1');
        });

        it('does not treat a rooted app path with a dot as external', () => {
            expect(
                buildUrl({
                    to: '/assets/sitemap.xml',
                    urlConfig: { prefix: '/:siteId' },
                    params: { siteId: 'global' },
                })
            ).toBe('/global/assets/sitemap.xml');
        });

        // Relative-path links must stay internal — they must NOT be turned into `https://./sibling`.
        // (The exact prefixed form is buildUrl's existing relative-path behavior, orthogonal to the
        // external-link fix; what matters here is that classifyExternal returns 'internal'.)
        it('treats a relative "./sibling" path as internal, not a domain', () => {
            const result = buildUrl({
                to: './sibling',
                urlConfig: { prefix: '/:siteId' },
                params: { siteId: 'global' },
            });
            expect(result).not.toMatch(/^https?:\/\//);
            expect(result).toBe('/global./sibling');
        });

        it('treats a relative "../parent" path as internal, not a domain', () => {
            const result = buildUrl({
                to: '../parent',
                urlConfig: { prefix: '/:siteId' },
                params: { siteId: 'global' },
            });
            expect(result).not.toMatch(/^https?:\/\//);
            expect(result).toBe('/global../parent');
        });
    });

    describe('prefix only', () => {
        it('prepends single param prefix', () => {
            expect(
                buildUrl({
                    to: '/product/123',
                    urlConfig: { prefix: '/:siteId' },
                    params: { siteId: 'global' },
                })
            ).toBe('/global/product/123');
        });

        it('prepends multi-param prefix', () => {
            expect(
                buildUrl({
                    to: '/product/123',
                    urlConfig: { prefix: '/:siteId/:localeId' },
                    params: { siteId: 'global', localeId: 'en-GB' },
                })
            ).toBe('/global/en-GB/product/123');
        });

        it('handles root path', () => {
            expect(
                buildUrl({
                    to: '/',
                    urlConfig: { prefix: '/:siteId' },
                    params: { siteId: 'global' },
                })
            ).toBe('/global/');
        });
    });

    describe('search only', () => {
        it('appends single search param', () => {
            expect(
                buildUrl({
                    to: '/product/123',
                    urlConfig: { search: '?lng=:localeId' },
                    params: { localeId: 'en-GB' },
                })
            ).toBe('/product/123?lng=en-GB');
        });

        it('appends multiple search params', () => {
            expect(
                buildUrl({
                    to: '/product/123',
                    urlConfig: { search: '?lng=:localeId&site=:siteId' },
                    params: { localeId: 'en-GB', siteId: 'global' },
                })
            ).toBe('/product/123?lng=en-GB&site=global');
        });

        it('does not append search param when value is missing', () => {
            expect(
                buildUrl({
                    to: '/product/123',
                    urlConfig: { search: '?lng=:localeId' },
                    params: {},
                })
            ).toBe('/product/123');
        });
    });

    describe('prefix + search combined', () => {
        it('applies both prefix and search', () => {
            expect(
                buildUrl({
                    to: '/product/123',
                    urlConfig: { prefix: '/:siteId', search: '?lng=:localeId' },
                    params: { siteId: 'global', localeId: 'en-GB' },
                })
            ).toBe('/global/product/123?lng=en-GB');
        });
    });

    describe('existing query params', () => {
        it('merges with existing query params', () => {
            expect(
                buildUrl({
                    to: '/product/123?color=red',
                    urlConfig: { search: '?lng=:localeId' },
                    params: { localeId: 'en-GB' },
                })
            ).toBe('/product/123?color=red&lng=en-GB');
        });

        it('overrides existing query param with config value', () => {
            expect(
                buildUrl({
                    to: '/product/123?lng=de-DE',
                    urlConfig: { search: '?lng=:localeId' },
                    params: { localeId: 'en-GB' },
                })
            ).toBe('/product/123?lng=en-GB');
        });

        it('preserves duplicate keys not related to site context config', () => {
            expect(
                buildUrl({
                    to: '/api/search?refine=color:blue&refine=size:M',
                    urlConfig: { search: '?lng=:localeId' },
                    params: { localeId: 'en-GB' },
                })
            ).toBe('/api/search?refine=color%3Ablue&refine=size%3AM&lng=en-GB');
        });
    });

    describe('hash handling', () => {
        it('preserves hash', () => {
            expect(
                buildUrl({
                    to: '/product/123#details',
                    urlConfig: { prefix: '/:siteId' },
                    params: { siteId: 'global' },
                })
            ).toBe('/global/product/123#details');
        });

        it('preserves hash with search params', () => {
            expect(
                buildUrl({
                    to: '/product/123?color=red#details',
                    urlConfig: { prefix: '/:siteId', search: '?lng=:localeId' },
                    params: { siteId: 'global', localeId: 'en-GB' },
                })
            ).toBe('/global/product/123?color=red&lng=en-GB#details');
        });
    });

    describe('idempotency', () => {
        it('does not double-prefix an already-prefixed path', () => {
            expect(
                buildUrl({
                    to: '/global/en-GB/product/123',
                    urlConfig: { prefix: '/:siteId/:localeId' },
                    params: { siteId: 'global', localeId: 'en-GB' },
                })
            ).toBe('/global/en-GB/product/123');
        });

        it('does not double-prefix when path equals the resolved prefix', () => {
            expect(
                buildUrl({
                    to: '/global/en-GB',
                    urlConfig: { prefix: '/:siteId/:localeId' },
                    params: { siteId: 'global', localeId: 'en-GB' },
                })
            ).toBe('/global/en-GB');
        });

        it('still prefixes a path that only partially matches', () => {
            expect(
                buildUrl({
                    to: '/global/en-GBextra/product/123',
                    urlConfig: { prefix: '/:siteId/:localeId' },
                    params: { siteId: 'global', localeId: 'en-GB' },
                })
            ).toBe('/global/en-GB/global/en-GBextra/product/123');
        });
    });
});
