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

/**
 * useVariationMedia Hook Tests
 *
 * Covers the generic `c_variationMedia` mechanism: most-specific match selection, fallback on
 * partial/absent/invalid data, the version-borrow resolver, and multi-axis matching.
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useVariationMedia, resolveVariationMediaUrl, parseVariationMedia } from './use-variation-media';
import type { ShopperProducts } from '@/scapi';

// A standard SFCC raw-static link the hook borrows its version prefix from.
const STANDARD_LINK =
    'https://example.com/on/demandware.static/-/Sites-luxury-catalog/default/dw520c5db8/images/products/watch.png';
const VERSION_PREFIX = 'https://example.com/on/demandware.static/-/Sites-luxury-catalog/default/dw520c5db8/';

const createProduct = (
    variationMedia?: unknown,
    standardLink: string | undefined = STANDARD_LINK
): ShopperProducts.schemas['Product'] =>
    ({
        id: 'test-product-id',
        name: 'Test Product',
        imageGroups: standardLink
            ? [{ viewType: 'large', images: [{ link: standardLink, alt: 'Standard' }] }]
            : [{ viewType: 'large', images: [] }],
        ...(variationMedia !== undefined ? { c_variationMedia: variationMedia } : {}),
    }) as unknown as ShopperProducts.schemas['Product'];

describe('resolveVariationMediaUrl', () => {
    it('borrows the version prefix from a standard link and appends the relative path', () => {
        expect(resolveVariationMediaUrl(STANDARD_LINK, 'images/products/watch-white.webp')).toBe(
            `${VERSION_PREFIX}images/products/watch-white.webp`
        );
    });

    it('strips a leading slash on the relative path so the join is clean', () => {
        expect(resolveVariationMediaUrl(STANDARD_LINK, '/images/products/watch-white.webp')).toBe(
            `${VERSION_PREFIX}images/products/watch-white.webp`
        );
    });

    it('returns undefined for a DIS-transformed link (no borrowable version segment)', () => {
        const disLink = 'https://example.com/dw/image/v2/LUXURY_CATALOG/on/demandware.static/watch.png?sw=800';
        expect(resolveVariationMediaUrl(disLink, 'images/products/watch-white.webp')).toBeUndefined();
    });

    it('returns undefined when the standard link is absent or the path is empty', () => {
        expect(resolveVariationMediaUrl(undefined, 'images/products/x.webp')).toBeUndefined();
        expect(resolveVariationMediaUrl(STANDARD_LINK, '')).toBeUndefined();
        expect(resolveVariationMediaUrl(STANDARD_LINK, '   ')).toBeUndefined();
    });
});

describe('parseVariationMedia', () => {
    it('parses a JSON string', () => {
        const raw = JSON.stringify({
            large: [{ match: { dialColor: 'black' }, images: [{ path: 'images/products/a.webp' }] }],
        });
        expect(parseVariationMedia(raw)).toEqual({
            large: [{ match: { dialColor: 'black' }, images: [{ path: 'images/products/a.webp' }] }],
        });
    });

    it('accepts an already-parsed object', () => {
        const obj = {
            large: [{ match: { dialColor: 'black' }, images: [{ path: 'images/products/a.webp', alt: 'Black' }] }],
        };
        expect(parseVariationMedia(obj)).toEqual(obj);
    });

    it('returns undefined for missing / invalid input', () => {
        expect(parseVariationMedia(undefined)).toBeUndefined();
        expect(parseVariationMedia('')).toBeUndefined();
        expect(parseVariationMedia('{not json')).toBeUndefined();
        expect(parseVariationMedia(42)).toBeUndefined();
        expect(parseVariationMedia([])).toBeUndefined();
    });

    it('drops malformed entries and unsafe keys', () => {
        const raw = {
            __proto__: [{ match: { a: 'b' }, images: [{ path: 'x.webp' }] }],
            large: [
                { match: { dialColor: 'black' }, images: [{ path: 'ok.webp' }] },
                { match: 'not-an-object', images: [{ path: 'bad.webp' }] },
                { match: { dialColor: 'white' }, images: [] },
            ],
        };
        const parsed = parseVariationMedia(raw);
        expect(parsed).toEqual({
            large: [{ match: { dialColor: 'black' }, images: [{ path: 'ok.webp' }] }],
        });
        expect(Object.hasOwn(parsed ?? {}, '__proto__')).toBe(false);
    });

    it('drops prototype-pollution keys from a JSON string (the real SCAPI shape)', () => {
        // SCAPI surfaces c_variationMedia as a JSON STRING, so __proto__ becomes an OWN enumerable key
        // (JSON.parse defines the property rather than invoking the proto setter) — the guard must skip
        // it at BOTH the viewType level and inside a `match` object.
        const parsed = parseVariationMedia(
            '{"__proto__":[{"match":{"a":"b"},"images":[{"path":"x.webp"}]}],' +
                '"large":[{"match":{"__proto__":"y","dialColor":"black"},"images":[{"path":"ok.webp"}]}]}'
        );
        expect(Object.hasOwn(parsed ?? {}, '__proto__')).toBe(false);
        expect(parsed?.large?.[0]?.match).toEqual({ dialColor: 'black' });
        expect(Object.hasOwn(parsed?.large?.[0]?.match ?? {}, '__proto__')).toBe(false);
    });
});

describe('useVariationMedia', () => {
    it('returns empty when the product has no c_variationMedia', () => {
        const { result } = renderHook(() =>
            useVariationMedia({ product: createProduct(), selectedAttributes: { dialColor: 'black' } })
        );
        expect(result.current.imagesByViewType).toEqual({});
    });

    it('returns empty when c_variationMedia is invalid JSON', () => {
        const { result } = renderHook(() =>
            useVariationMedia({ product: createProduct('{not json'), selectedAttributes: { dialColor: 'black' } })
        );
        expect(result.current.imagesByViewType).toEqual({});
    });

    it('resolves matched images to absolute versioned URLs', () => {
        const media = {
            large: [
                { match: { dialColor: 'white' }, images: [{ path: 'images/products/watch-white.webp', alt: 'W' }] },
            ],
        };
        const { result } = renderHook(() =>
            useVariationMedia({ product: createProduct(media), selectedAttributes: { dialColor: 'white' } })
        );
        expect(result.current.imagesByViewType.large).toEqual([
            {
                link: `${VERSION_PREFIX}images/products/watch-white.webp`,
                disBaseLink: `${VERSION_PREFIX}images/products/watch-white.webp`,
                alt: 'W',
            },
        ]);
    });

    it('chooses the most-specific matching entry (more match keys wins)', () => {
        const media = {
            large: [
                { match: { dialColor: 'white' }, images: [{ path: 'images/products/generic-white.webp' }] },
                {
                    match: { dialColor: 'white', bandType: 'leather_black' },
                    images: [{ path: 'images/products/white-leather-black.webp' }],
                },
            ],
        };
        const { result } = renderHook(() =>
            useVariationMedia({
                product: createProduct(media),
                selectedAttributes: { dialColor: 'white', bandType: 'leather_black' },
            })
        );
        expect(result.current.imagesByViewType.large?.[0].link).toBe(
            `${VERSION_PREFIX}images/products/white-leather-black.webp`
        );
    });

    it('falls back to the less-specific entry when the specific one is not fully satisfied', () => {
        const media = {
            large: [
                { match: { dialColor: 'white' }, images: [{ path: 'images/products/generic-white.webp' }] },
                {
                    match: { dialColor: 'white', bandType: 'leather_black' },
                    images: [{ path: 'images/products/white-leather-black.webp' }],
                },
            ],
        };
        const { result } = renderHook(() =>
            useVariationMedia({
                product: createProduct(media),
                selectedAttributes: { dialColor: 'white', bandType: 'leather_brown' },
            })
        );
        expect(result.current.imagesByViewType.large?.[0].link).toBe(
            `${VERSION_PREFIX}images/products/generic-white.webp`
        );
    });

    it('matches on multiple axes (2+ keys) only when every key is satisfied', () => {
        const media = {
            large: [
                {
                    match: { dialColor: 'black', bandType: 'leather_brown', caseSize: '40' },
                    images: [{ path: 'images/products/black-brown-40.webp' }],
                },
            ],
        };
        // All three axes match → resolved.
        const matched = renderHook(() =>
            useVariationMedia({
                product: createProduct(media),
                selectedAttributes: { dialColor: 'black', bandType: 'leather_brown', caseSize: '40' },
            })
        );
        expect(matched.result.current.imagesByViewType.large?.[0].link).toBe(
            `${VERSION_PREFIX}images/products/black-brown-40.webp`
        );

        // One axis differs → no match → empty.
        const missed = renderHook(() =>
            useVariationMedia({
                product: createProduct(media),
                selectedAttributes: { dialColor: 'black', bandType: 'leather_brown', caseSize: '42' },
            })
        );
        expect(missed.result.current.imagesByViewType).toEqual({});
    });

    it('returns empty when no entry matches the selection', () => {
        const media = {
            large: [{ match: { dialColor: 'white' }, images: [{ path: 'images/products/white.webp' }] }],
        };
        const { result } = renderHook(() =>
            useVariationMedia({ product: createProduct(media), selectedAttributes: { dialColor: 'black' } })
        );
        expect(result.current.imagesByViewType).toEqual({});
    });

    it('returns empty when the product has only DIS-transformed links to borrow from', () => {
        const disLink = 'https://example.com/dw/image/v2/LUXURY/on/demandware.static/watch.png?sw=800';
        const media = {
            large: [{ match: { dialColor: 'white' }, images: [{ path: 'images/products/white.webp' }] }],
        };
        const { result } = renderHook(() =>
            useVariationMedia({
                product: createProduct(media, disLink),
                selectedAttributes: { dialColor: 'white' },
            })
        );
        expect(result.current.imagesByViewType).toEqual({});
    });

    it('keys results by viewType so each gallery view resolves independently', () => {
        const media = {
            large: [{ match: { dialColor: 'white' }, images: [{ path: 'images/products/white-large.webp' }] }],
            swatch: [{ match: { dialColor: 'white' }, images: [{ path: 'images/products/white-swatch.webp' }] }],
        };
        const { result } = renderHook(() =>
            useVariationMedia({ product: createProduct(media), selectedAttributes: { dialColor: 'white' } })
        );
        expect(result.current.imagesByViewType.large?.[0].link).toBe(
            `${VERSION_PREFIX}images/products/white-large.webp`
        );
        expect(result.current.imagesByViewType.swatch?.[0].link).toBe(
            `${VERSION_PREFIX}images/products/white-swatch.webp`
        );
    });
});
