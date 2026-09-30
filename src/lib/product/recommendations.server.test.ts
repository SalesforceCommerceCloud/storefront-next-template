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
import { createTestContext } from '@/lib/test-utils';
import config from '@/config/server';

const createSeoContext = () =>
    createTestContext({
        appConfig: {
            url: {
                ...config.app.url,
                seoRoutes: {
                    [config.app.defaultSiteId]: {
                        product: { prefix: 'p' },
                        category: { prefix: 'c', mode: 'id-suffix' },
                    },
                },
            },
        },
    });

vi.mock('./recommendations-einstein.server', () => ({
    getEinsteinRecommendations: vi.fn(),
}));
vi.mock('@/lib/api/products.server', () => ({
    fetchProductsByIds: vi.fn(),
    getDefaultProductExpansions: vi.fn((...additional: string[]) => [
        'availability',
        'images',
        'prices',
        'variations',
        ...additional,
    ]),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

describe('fetchProductRecommendations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('forwards name/products/args/signal to the Einstein server function and enriches', async () => {
        const { getEinsteinRecommendations } = await import('./recommendations-einstein.server');
        const { fetchProductsByIds } = await import('@/lib/api/products.server');
        (getEinsteinRecommendations as ReturnType<typeof vi.fn>).mockResolvedValue({ recs: [{ id: 'p-1' }] });
        (fetchProductsByIds as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'p-1', name: 'Test' }]);

        const { fetchProductRecommendations } = await import('./recommendations.server');
        const request = new Request('http://localhost/');
        const result = await fetchProductRecommendations(
            { context: createSeoContext(), request },
            { name: 'home-top-revenue-for-category', products: undefined, currency: 'USD', args: { limit: 8 } }
        );

        expect(getEinsteinRecommendations).toHaveBeenCalledWith({
            context: {},
            request,
            name: 'home-top-revenue-for-category',
            products: undefined,
            args: { limit: 8 },
            signal: request.signal,
        });
        expect(fetchProductsByIds).toHaveBeenCalledWith(
            {},
            ['p-1'],
            expect.objectContaining({
                currency: 'USD',
                allImages: true,
                expand: ['availability', 'images', 'prices', 'variations', 'slug'],
            })
        );
        expect(result.recs?.[0]).toMatchObject({ productId: 'p-1', productName: 'Test' });
        expect(result.recs?.[0]).not.toHaveProperty('id');
    });

    it('returns {} silently on AbortError', async () => {
        const { getEinsteinRecommendations } = await import('./recommendations-einstein.server');
        (getEinsteinRecommendations as ReturnType<typeof vi.fn>).mockRejectedValue(
            new DOMException('aborted', 'AbortError')
        );
        const { fetchProductRecommendations } = await import('./recommendations.server');
        const result = await fetchProductRecommendations(
            { context: createTestContext(), request: new Request('http://localhost/') },
            { name: 'x' }
        );
        expect(result).toEqual({});
    });

    it('returns {} silently on TimeoutError', async () => {
        const { getEinsteinRecommendations } = await import('./recommendations-einstein.server');
        (getEinsteinRecommendations as ReturnType<typeof vi.fn>).mockRejectedValue(
            Object.assign(new Error('timeout'), { name: 'TimeoutError' })
        );
        const { fetchProductRecommendations } = await import('./recommendations.server');
        const result = await fetchProductRecommendations(
            { context: createTestContext(), request: new Request('http://localhost/') },
            { name: 'x' }
        );
        expect(result).toEqual({});
    });

    it('returns {} on unexpected errors', async () => {
        const { getEinsteinRecommendations } = await import('./recommendations-einstein.server');
        (getEinsteinRecommendations as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
        const { fetchProductRecommendations } = await import('./recommendations.server');
        const result = await fetchProductRecommendations(
            { context: createTestContext(), request: new Request('http://localhost/') },
            { name: 'x' }
        );
        expect(result).toEqual({});
    });

    it.each([
        ['AbortError', new DOMException('aborted', 'AbortError')],
        ['TimeoutError', Object.assign(new Error('timeout'), { name: 'TimeoutError' })],
        ['unexpected error', new Error('boom')],
    ])('returns {} silently when product enrichment fails with %s', async (_label, thrown) => {
        const { getEinsteinRecommendations } = await import('./recommendations-einstein.server');
        const { fetchProductsByIds } = await import('@/lib/api/products.server');
        (getEinsteinRecommendations as ReturnType<typeof vi.fn>).mockResolvedValue({ recs: [{ id: 'p-1' }] });
        (fetchProductsByIds as ReturnType<typeof vi.fn>).mockRejectedValue(thrown);

        const { fetchProductRecommendations } = await import('./recommendations.server');
        const result = await fetchProductRecommendations(
            { context: createTestContext(), request: new Request('http://localhost/') },
            { name: 'x' }
        );
        expect(result).toEqual({});
    });

    it('does not enrich when the recs array is empty', async () => {
        const { getEinsteinRecommendations } = await import('./recommendations-einstein.server');
        const { fetchProductsByIds } = await import('@/lib/api/products.server');
        (getEinsteinRecommendations as ReturnType<typeof vi.fn>).mockResolvedValue({ recs: [] });
        const { fetchProductRecommendations } = await import('./recommendations.server');
        await fetchProductRecommendations(
            { context: createTestContext(), request: new Request('http://localhost/') },
            { name: 'x' }
        );
        expect(fetchProductsByIds).not.toHaveBeenCalled();
    });

    it('filters out raw recs without an id before fetching products and excludes them from the result', async () => {
        const { getEinsteinRecommendations } = await import('./recommendations-einstein.server');
        const { fetchProductsByIds } = await import('@/lib/api/products.server');
        (getEinsteinRecommendations as ReturnType<typeof vi.fn>).mockResolvedValue({
            // Mix valid IDs with falsy/missing IDs that the helper must drop before
            // calling SCAPI and before enriching the result.
            recs: [{ id: 'p-1' }, { id: '' }, { id: undefined }, {}, { id: 'p-2' }],
        });
        (fetchProductsByIds as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'p-1', name: 'One' },
            { id: 'p-2', name: 'Two' },
        ]);

        const { fetchProductRecommendations } = await import('./recommendations.server');
        const result = await fetchProductRecommendations(
            { context: createTestContext(), request: new Request('http://localhost/') },
            { name: 'x' }
        );

        expect(fetchProductsByIds).toHaveBeenCalledWith(
            {},
            ['p-1', 'p-2'],
            expect.objectContaining({
                allImages: true,
                expand: ['availability', 'images', 'prices', 'variations'],
            })
        );
        expect(result.recs).toHaveLength(2);
        expect(result.recs?.map((r) => r.productId)).toEqual(['p-1', 'p-2']);
    });

    it('omits currency from product fetch options when not provided', async () => {
        const { getEinsteinRecommendations } = await import('./recommendations-einstein.server');
        const { fetchProductsByIds } = await import('@/lib/api/products.server');
        (getEinsteinRecommendations as ReturnType<typeof vi.fn>).mockResolvedValue({ recs: [{ id: 'p-1' }] });
        (fetchProductsByIds as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'p-1' }]);
        const { fetchProductRecommendations } = await import('./recommendations.server');
        await fetchProductRecommendations(
            { context: createTestContext(), request: new Request('http://localhost/') },
            { name: 'x' }
        );
        const call = (fetchProductsByIds as ReturnType<typeof vi.fn>).mock.calls.at(-1);
        expect(call?.[2]).not.toHaveProperty('currency');
    });
});
