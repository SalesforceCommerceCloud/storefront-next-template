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
import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { ShopperProducts } from '@/scapi';
import { fetchProductsByIds } from '@/lib/api/products.server';
import { resolveSwatchProductImages } from './swatch-products.server';

vi.mock('@/lib/api/products.server', () => ({
    fetchProductsByIds: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const mockFetchProductsByIds = vi.mocked(fetchProductsByIds);
const context = {} as Parameters<typeof resolveSwatchProductImages>[0];

// Pre-constructed so the mock's rejected promise isn't created inline (avoids vitest attributing an
// unhandled-rejection artifact to the test body); the helper catches it either way.
const scapiError = new Error('SCAPI down');

/** A swatch-product whose `small` image group carries the tile at `url` (as `disBaseLink`). */
function swatchProduct(id: string, url: string): ShopperProducts.schemas['Product'] {
    return {
        id,
        imageGroups: [{ viewType: 'small', images: [{ link: url, disBaseLink: url }] }],
    } as unknown as ShopperProducts.schemas['Product'];
}

/** A product carrying the given (raw) `c_swatchProductIds` value plus any extra fields. */
function master(swatchProductIds: unknown, extra: Record<string, unknown> = {}): ShopperProducts.schemas['Product'] {
    return {
        id: 'MASTER',
        c_swatchProductIds: swatchProductIds,
        ...extra,
    } as unknown as ShopperProducts.schemas['Product'];
}

const swatchImagesOf = (product: ShopperProducts.schemas['Product']) =>
    (product as unknown as { c_swatchImages?: unknown }).c_swatchImages;

describe('resolveSwatchProductImages', () => {
    beforeEach(() => vi.clearAllMocks());

    test('no-ops (no fetch, no mutation) when c_swatchProductIds is absent', async () => {
        const product = master(undefined);
        delete (product as Record<string, unknown>).c_swatchProductIds;

        await resolveSwatchProductImages(context, product);

        expect(mockFetchProductsByIds).not.toHaveBeenCalled();
        expect(swatchImagesOf(product)).toBeUndefined();
    });

    test('resolves a JSON-string map into c_swatchImages (one images-only batched fetch)', async () => {
        mockFetchProductsByIds.mockResolvedValue([
            swatchProduct('S1', 'https://dis/loveseat'),
            swatchProduct('S2', 'https://dis/metal'),
        ]);
        const product = master(JSON.stringify({ size: { loveseat: 'S1' }, legStyle: { metal: 'S2' } }));

        await resolveSwatchProductImages(context, product);

        expect(mockFetchProductsByIds).toHaveBeenCalledTimes(1);
        expect(mockFetchProductsByIds).toHaveBeenCalledWith(context, ['S1', 'S2'], { allImages: true });
        expect(swatchImagesOf(product)).toEqual({
            size: { loveseat: 'https://dis/loveseat' },
            legStyle: { metal: 'https://dis/metal' },
        });
    });

    test('accepts an already-parsed object map', async () => {
        mockFetchProductsByIds.mockResolvedValue([swatchProduct('S1', 'https://dis/loveseat')]);
        const product = master({ size: { loveseat: 'S1' } });

        await resolveSwatchProductImages(context, product);

        expect(swatchImagesOf(product)).toEqual({ size: { loveseat: 'https://dis/loveseat' } });
    });

    test('dedupes ids shared across axes/values into a single fetch', async () => {
        mockFetchProductsByIds.mockResolvedValue([swatchProduct('S1', 'https://dis/tile')]);
        const product = master({ size: { loveseat: 'S1' }, legStyle: { metal: 'S1' } });

        await resolveSwatchProductImages(context, product);

        expect(mockFetchProductsByIds).toHaveBeenCalledWith(context, ['S1'], { allImages: true });
        expect(swatchImagesOf(product)).toEqual({
            size: { loveseat: 'https://dis/tile' },
            legStyle: { metal: 'https://dis/tile' },
        });
    });

    test('omits values whose swatch product returned no image', async () => {
        mockFetchProductsByIds.mockResolvedValue([
            swatchProduct('S1', 'https://dis/loveseat'),
            { id: 'S2' } as ShopperProducts.schemas['Product'], // no imageGroups
        ]);
        const product = master({ size: { loveseat: 'S1', sectional: 'S2' } });

        await resolveSwatchProductImages(context, product);

        expect(swatchImagesOf(product)).toEqual({ size: { loveseat: 'https://dis/loveseat' } });
    });

    test('merges onto an existing c_swatchImages map (existing entries preserved)', async () => {
        mockFetchProductsByIds.mockResolvedValue([swatchProduct('S1', 'https://dis/loveseat')]);
        const product = master({ size: { loveseat: 'S1' } }, { c_swatchImages: { color: { red: 'images/red.webp' } } });

        await resolveSwatchProductImages(context, product);

        expect(swatchImagesOf(product)).toEqual({
            color: { red: 'images/red.webp' },
            size: { loveseat: 'https://dis/loveseat' },
        });
    });

    test('degrades to a no-op (never throws, no mutation) when the fetch fails', async () => {
        mockFetchProductsByIds.mockRejectedValue(scapiError);
        const product = master({ size: { loveseat: 'S1' } });

        await resolveSwatchProductImages(context, product);

        expect(swatchImagesOf(product)).toBeUndefined();
    });

    test.each([
        ['non-JSON string', 'not json'],
        ['a JSON array', JSON.stringify(['S1'])],
        ['axes that are not string maps', JSON.stringify({ size: 'FNXT-SWATCH' })],
    ])('no-ops on malformed c_swatchProductIds (%s)', async (_label, raw) => {
        const product = master(raw);

        await resolveSwatchProductImages(context, product);

        expect(mockFetchProductsByIds).not.toHaveBeenCalled();
        expect(swatchImagesOf(product)).toBeUndefined();
    });
});
