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

import { describe, test, expect } from 'vitest';
import { decodeFinalRawSegment, resolveCategoryRoute, resolveProductRoute } from './url-resolution.server';
import type { SeoRoutesConfig } from '@salesforce/storefront-next-runtime/config';

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
    },
    SlugStore: {
        product: { prefix: 'product' },
        category: { prefix: 'catalog', mode: 'slug-path' },
    },
};

describe('resolveProductRoute', () => {
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
