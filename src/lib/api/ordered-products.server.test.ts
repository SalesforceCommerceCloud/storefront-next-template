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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { fetchOrderedProducts } from './ordered-products.server';

vi.mock('./order.server', () => ({ fetchOrderedProductIds: vi.fn() }));
vi.mock('./products.server', () => ({
    fetchProductsByIds: vi.fn(),
    getDefaultProductExpansions: vi.fn(() => ['availability', 'images', 'prices']),
}));
vi.mock('@/lib/product/product-conversion', () => ({
    convertProductToProductSearchHit: vi.fn((p) => ({
        productId: p.id,
        productName: p.name ?? '',
        price: p.price ?? 0,
    })),
}));

import { fetchOrderedProductIds } from './order.server';
import { fetchProductsByIds } from './products.server';

const buildContext = (currency = 'USD'): RouterContextProvider => {
    const ctx = new RouterContextProvider();
    ctx.set(siteContext, { currency } as never);
    return ctx;
};

// Three products in insertion order: a(count=1), b(count=3), c(count=2)
const ORDERED_IDS = [
    { id: 'a', count: 1 },
    { id: 'b', count: 3 },
    { id: 'c', count: 2 },
];
const PRODUCTS = [
    { id: 'a', name: 'Carrot', price: 3 },
    { id: 'b', name: 'Apple', price: 1 },
    { id: 'c', name: 'Banana', price: 2 },
];

// Simulates fetchProductsByIds restoring input-ID order (as the real implementation does).
const mockFetchByIds = (_ctx: unknown, ids: string[]) => {
    const map = new Map(PRODUCTS.map((p) => [p.id, p]));
    return Promise.resolve(
        ids.flatMap((id) => {
            const p = map.get(id);
            return p ? [p] : [];
        })
    );
};

describe('fetchOrderedProducts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fetchOrderedProductIds).mockResolvedValue(ORDERED_IDS);
        vi.mocked(fetchProductsByIds).mockImplementation(mockFetchByIds as never);
    });

    it('skips fetchProductsByIds and returns empty result when there are no ordered IDs', async () => {
        vi.mocked(fetchOrderedProductIds).mockResolvedValue([]);
        const result = await fetchOrderedProducts(buildContext(), 'c001');
        expect(fetchProductsByIds).not.toHaveBeenCalled();
        expect(result.hits).toEqual([]);
        expect(result.total).toBe(0);
    });

    it('total is the ordered-ID count from order history', async () => {
        // total = orderedItems.length, not resolved product count
        const result = await fetchOrderedProducts(buildContext(), 'c001');
        expect(result.total).toBe(ORDERED_IDS.length);
    });

    it('passes currency from site context to fetchProductsByIds', async () => {
        await fetchOrderedProducts(buildContext('EUR'), 'c001');
        expect(fetchProductsByIds).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ currency: 'EUR' })
        );
    });

    it('passes customerId to fetchOrderedProductIds', async () => {
        await fetchOrderedProducts(buildContext(), 'shopper-42');
        expect(fetchOrderedProductIds).toHaveBeenCalledWith(expect.anything(), 'shopper-42');
    });

    it('slices the sorted ID list before fetching — only page IDs are passed to fetchProductsByIds', async () => {
        // most-ordered: b(3) > c(2) > a(1); offset=1, limit=1 → slice=['c']
        await fetchOrderedProducts(buildContext(), 'c001', { offset: 1, limit: 1, sort: 'most-ordered' });
        const calledIds = vi.mocked(fetchProductsByIds).mock.calls[0][1];
        expect(calledIds).toEqual(['c']);
    });

    it('applies offset and limit to the result', async () => {
        const result = await fetchOrderedProducts(buildContext(), 'c001', {
            offset: 1,
            limit: 1,
            sort: 'most-ordered',
        });
        expect(result.hits).toHaveLength(1);
        expect(result.hits[0].productId).toBe('c');
        expect(result.offset).toBe(1);
        expect(result.limit).toBe(1);
    });

    it.each([
        {
            sort: 'most-ordered',
            expectedIds: ['b', 'c', 'a'], // count: b=3, c=2, a=1
        },
        {
            sort: 'most-recent',
            expectedIds: ['a', 'b', 'c'], // insertion order preserved
        },
    ])('sort=$sort passes correct ID order to fetchProductsByIds', async ({ sort, expectedIds }) => {
        await fetchOrderedProducts(buildContext(), 'c001', { sort });
        const calledIds = vi.mocked(fetchProductsByIds).mock.calls[0][1];
        expect(calledIds).toEqual(expectedIds);
    });

    it('sort result matches selectedSortingOption', async () => {
        const result = await fetchOrderedProducts(buildContext(), 'c001', { sort: 'most-recent' });
        expect(result.selectedSortingOption).toBe('most-recent');
    });

    it('unknown sort falls back to most-ordered (count descending)', async () => {
        await fetchOrderedProducts(buildContext(), 'c001', { sort: 'nonsense' });
        const calledIds = vi.mocked(fetchProductsByIds).mock.calls[0][1];
        expect(calledIds).toEqual(['b', 'c', 'a']);
    });
});
