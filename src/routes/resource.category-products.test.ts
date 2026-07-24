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
import { fetchSearchProducts } from '@/lib/api/search.server';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
import { loader, action } from './resource.category-products';

vi.mock('@/lib/api/search.server', () => ({
    fetchSearchProducts: vi.fn(),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const ORIGIN = 'https://example.com';

const buildContext = (currency?: string): RouterContextProvider => {
    const ctx = new RouterContextProvider();
    if (currency !== undefined) {
        ctx.set(siteContext, { currency } as never);
    }
    return ctx;
};

const buildUrl = (params: Record<string, string | string[]> = {}) => {
    const url = new URL(`${ORIGIN}${resourceRoutes.categoryProducts}`);
    for (const [k, v] of Object.entries(params)) {
        if (Array.isArray(v)) {
            for (const item of v) url.searchParams.append(k, item);
        } else {
            url.searchParams.set(k, v);
        }
    }
    return url.toString();
};

const buildRequest = (params: Record<string, string | string[]> = {}, headers: Record<string, string> = {}) =>
    new Request(buildUrl(params), { method: 'GET', headers: { Origin: ORIGIN, ...headers } });

const invoke = (request: Request, context = buildContext('GBP')) =>
    // The loader only uses request + context; params aren't read.
    loader({ request, context, params: {} } as never);

describe('resource.category-products', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rejects cross-origin GETs', async () => {
        const request = buildRequest({ refine: 'cgid=womens' }, { Origin: 'https://evil.example' });
        const response = await invoke(request);
        expect(response.status).toBe(403);
        expect(fetchSearchProducts).not.toHaveBeenCalled();
    });

    it('returns 400 when no refine is provided', async () => {
        const response = await invoke(buildRequest({ offset: '24', limit: '24' }));
        expect(response.status).toBe(400);
        expect(fetchSearchProducts).not.toHaveBeenCalled();
    });

    it('fetches with the parsed offset/limit/sort/refine and returns hits + total', async () => {
        vi.mocked(fetchSearchProducts).mockResolvedValue({
            hits: [{ productId: 'p1' }, { productId: 'p2' }],
            total: 218,
            offset: 24,
        } as never);

        const response = await invoke(
            buildRequest({ offset: '24', limit: '24', sort: 'best-matches', refine: ['cgid=womens', 'c_color=blue'] })
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({ hits: [{ productId: 'p1' }, { productId: 'p2' }], total: 218, offset: 24, limit: 24 });

        expect(fetchSearchProducts).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                offset: 24,
                limit: 24,
                sort: 'best-matches',
                refine: ['cgid=womens', 'c_color=blue'],
                currency: 'GBP',
            })
        );
    });

    it('clamps the limit to a safe maximum', async () => {
        vi.mocked(fetchSearchProducts).mockResolvedValue({ hits: [], total: 0, offset: 0 } as never);
        await invoke(buildRequest({ limit: '9999', refine: 'cgid=womens' }));
        expect(fetchSearchProducts).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ limit: 100 }));
    });

    it('prefers the explicit currency query param over site context', async () => {
        vi.mocked(fetchSearchProducts).mockResolvedValue({ hits: [], total: 0, offset: 0 } as never);
        await invoke(buildRequest({ refine: 'cgid=womens', currency: 'USD' }), buildContext('GBP'));
        expect(fetchSearchProducts).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ currency: 'USD' })
        );
    });

    it('propagates the upstream status on a NormalizedApiError', async () => {
        vi.mocked(fetchSearchProducts).mockRejectedValue(
            Object.assign(Object.create(NormalizedApiError.prototype), { status: 404, message: 'nope' })
        );
        const response = await invoke(buildRequest({ refine: 'cgid=womens' }));
        expect(response.status).toBe(404);
    });

    it('rejects non-GET methods', () => {
        const response = action();
        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('GET');
    });
});
