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
import { resourceRoutes } from '@/route-paths';
import { loader, action } from './resource.ordered-products';

vi.mock('@/lib/api/order.server', () => ({ fetchOrderedProductIds: vi.fn() }));
vi.mock('@/lib/api/products.server', () => ({
    fetchProductsByIds: vi.fn(),
    getDefaultProductExpansions: vi.fn(() => ['availability', 'images', 'prices', 'promotions', 'variations']),
}));
vi.mock('@/lib/product/product-conversion', () => ({
    convertProductToProductSearchHit: vi.fn((p) => ({
        productId: p.id,
        price: p.price ?? 0,
        productName: p.name ?? '',
    })),
}));
vi.mock('@/middlewares/auth.server', () => ({ getAuth: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { fetchOrderedProductIds } from '@/lib/api/order.server';
import { fetchProductsByIds } from '@/lib/api/products.server';
import { getAuth } from '@/middlewares/auth.server';

const DEFAULT_PRODUCTS = [
    { id: 'p1', price: 10, name: 'Apple' },
    { id: 'p2', price: 5, name: 'Banana' },
];

// Simulates fetchProductsByIds restoring input-ID order (as the real implementation does).
const makeFetchByIdsMock =
    (products: Array<{ id: string; [k: string]: unknown }> = DEFAULT_PRODUCTS) =>
    (_ctx: unknown, ids: string[]) => {
        const map = new Map(products.map((p) => [p.id, p]));
        return Promise.resolve(
            ids.flatMap((id) => {
                const p = map.get(id);
                return p ? [p] : [];
            })
        );
    };

const ORIGIN = 'https://example.com';

const buildContext = (currency = 'GBP'): RouterContextProvider => {
    const ctx = new RouterContextProvider();
    ctx.set(siteContext, { currency } as never);
    return ctx;
};

const buildRequest = (params: Record<string, string> = {}, headers: Record<string, string> = {}) => {
    const url = new URL(`${ORIGIN}${resourceRoutes.orderedProducts}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    // Use Referer (no Origin) to match the browser behaviour for same-origin GET fetches.
    // Pass { Origin: '...' } in headers to override when testing cross-origin rejection.
    return new Request(url.toString(), { method: 'GET', headers: { Referer: `${ORIGIN}/buy-it-again`, ...headers } });
};

const invoke = (request: Request, context = buildContext()) => loader({ request, context, params: {} } as never);

describe('resource.ordered-products', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getAuth).mockReturnValue({ customerId: 'c001', userType: 'registered' } as never);
        vi.mocked(fetchOrderedProductIds).mockResolvedValue([
            { id: 'p1', count: 2 },
            { id: 'p2', count: 1 },
        ]);
        vi.mocked(fetchProductsByIds).mockImplementation(makeFetchByIdsMock() as never);
    });

    it('returns 403 for cross-origin GET', async () => {
        const response = await invoke(buildRequest({}, { Origin: 'https://evil.example' }));
        expect(response.status).toBe(403);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(fetchOrderedProductIds).not.toHaveBeenCalled();
    });

    it('returns 403 when neither Origin nor Referer is present', async () => {
        const url = new URL(`${ORIGIN}${resourceRoutes.orderedProducts}`);
        const response = await invoke(new Request(url.toString(), { method: 'GET' }));
        expect(response.status).toBe(403);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(fetchOrderedProductIds).not.toHaveBeenCalled();
    });

    it('returns 401 for guest with no customerId', async () => {
        vi.mocked(getAuth).mockReturnValue({ customerId: undefined, userType: 'guest' } as never);
        const response = await invoke(buildRequest());
        expect(response.status).toBe(401);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(fetchOrderedProductIds).not.toHaveBeenCalled();
    });

    it('returns 401 for guest with a customerId (gcid)', async () => {
        vi.mocked(getAuth).mockReturnValue({ customerId: 'gcid-xxx', userType: 'guest' } as never);
        const response = await invoke(buildRequest());
        expect(response.status).toBe(401);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(fetchOrderedProductIds).not.toHaveBeenCalled();
    });

    it('returns 200 with empty hits when fetchOrderedProductIds returns []', async () => {
        vi.mocked(fetchOrderedProductIds).mockResolvedValue([]);
        const response = await invoke(buildRequest());
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        const body = await response.json();
        expect(body.hits).toEqual([]);
        expect(body.total).toBe(0);
    });

    it('happy path: total is the ordered-ID count, hits are resolved products', async () => {
        // fetchOrderedProductIds returns 3 IDs but one is offline — total stays 3
        vi.mocked(fetchOrderedProductIds).mockResolvedValue([
            { id: 'p1', count: 2 },
            { id: 'p2', count: 1 },
            { id: 'deleted', count: 1 },
        ]);
        const response = await invoke(buildRequest());
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        const body = await response.json();
        expect(body.total).toBe(3);
        expect(body.hits).toHaveLength(2);
        expect(body.sortingOptions).toBeDefined();
        expect(body.selectedSortingOption).toBeDefined();
    });

    it('most-ordered sort: passes IDs in count-desc order to fetchProductsByIds', async () => {
        const products = [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' },
            { id: 'c', name: 'C' },
        ];
        vi.mocked(fetchOrderedProductIds).mockResolvedValue([
            { id: 'a', count: 1 },
            { id: 'b', count: 3 },
            { id: 'c', count: 2 },
        ]);
        vi.mocked(fetchProductsByIds).mockImplementation(makeFetchByIdsMock(products) as never);
        const response = await invoke(buildRequest({ sort: 'most-ordered' }));
        const body = await response.json();
        expect(body.hits.map((h: { productId: string }) => h.productId)).toEqual(['b', 'c', 'a']);
    });

    it('most-recent sort: passes IDs in insertion order to fetchProductsByIds', async () => {
        const products = [
            { id: 'first', name: 'First' },
            { id: 'second', name: 'Second' },
            { id: 'third', name: 'Third' },
        ];
        vi.mocked(fetchOrderedProductIds).mockResolvedValue([
            { id: 'first', count: 1 },
            { id: 'second', count: 3 },
            { id: 'third', count: 2 },
        ]);
        vi.mocked(fetchProductsByIds).mockImplementation(makeFetchByIdsMock(products) as never);
        const response = await invoke(buildRequest({ sort: 'most-recent' }));
        const body = await response.json();
        expect(body.hits.map((h: { productId: string }) => h.productId)).toEqual(['first', 'second', 'third']);
    });

    it('unknown sort falls back to most-ordered (count descending)', async () => {
        const products = [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' },
        ];
        vi.mocked(fetchOrderedProductIds).mockResolvedValue([
            { id: 'a', count: 1 },
            { id: 'b', count: 5 },
        ]);
        vi.mocked(fetchProductsByIds).mockImplementation(makeFetchByIdsMock(products) as never);
        const response = await invoke(buildRequest({ sort: 'nonsense' }));
        const body = await response.json();
        expect(body.hits[0].productId).toBe('b');
    });

    it('clamps limit to 100', async () => {
        const response = await invoke(buildRequest({ limit: '9999' }));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.limit).toBe(100);
    });

    it('applies offset and limit: slices the sorted ID list before fetching', async () => {
        const products = [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' },
            { id: 'c', name: 'C' },
        ];
        vi.mocked(fetchOrderedProductIds).mockResolvedValue([
            { id: 'a', count: 3 },
            { id: 'b', count: 2 },
            { id: 'c', count: 1 },
        ]);
        vi.mocked(fetchProductsByIds).mockImplementation(makeFetchByIdsMock(products) as never);
        // most-ordered → [a, b, c]; offset=1 limit=1 → only 'b' passed to fetchProductsByIds
        const response = await invoke(buildRequest({ offset: '1', limit: '1', sort: 'most-ordered' }));
        const body = await response.json();
        expect(vi.mocked(fetchProductsByIds).mock.calls[0][1]).toEqual(['b']);
        expect(body.hits).toHaveLength(1);
        expect(body.hits[0].productId).toBe('b');
        expect(body.offset).toBe(1);
        expect(body.limit).toBe(1);
    });

    it('passes currency from site context to fetchProductsByIds', async () => {
        await invoke(buildRequest(), buildContext('EUR'));
        expect(fetchProductsByIds).toHaveBeenCalledWith(
            expect.anything(),
            expect.any(Array),
            expect.objectContaining({ currency: 'EUR' })
        );
    });

    it('returns 500 when fetchProductsByIds rejects', async () => {
        vi.mocked(fetchProductsByIds).mockRejectedValue(new Error('SCAPI down'));
        const response = await invoke(buildRequest());
        expect(response.status).toBe(500);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('action() returns 405 with Allow: GET and no-store', () => {
        const response = action();
        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('GET');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
    });
});
