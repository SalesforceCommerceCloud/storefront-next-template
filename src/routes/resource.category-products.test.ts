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
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { resourceRoutes } from '@/route-paths';
import { fetchSearchProducts } from '@/lib/api/search.server';
import { getLocalInventoryContext } from '@/lib/product/local-inventory.server';
import { LocalInventoryError } from '@/lib/product/local-inventory-error';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
import { loader, action } from './resource.category-products';

vi.mock('@/lib/product/local-inventory.server', async (original) => ({
    ...(await original<Record<string, unknown>>()),
    getLocalInventoryContext: vi.fn(() => null),
}));

vi.mock('@/lib/api/search.server', () => ({
    fetchSearchProducts: vi.fn(),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const ORIGIN = 'https://example.com';

const buildContext = (currency?: string): RouterContextProvider => {
    const ctx = new RouterContextProvider();
    ctx.set(appConfigContext, mockConfig);
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
    // Use Referer (no Origin) to match the browser behaviour for same-origin GET fetches.
    // Pass { Origin: '...' } in headers to override when testing cross-origin rejection.
    new Request(buildUrl(params), { method: 'GET', headers: { Referer: `${ORIGIN}/category/womens`, ...headers } });

const invoke = (request: Request, context = buildContext('GBP')) =>
    // The loader only uses request + context; params aren't read.
    loader({ request, context, params: {} } as never);

describe('resource.category-products', () => {
    it('preserves inventory service errors as 503 rather than reporting a server defect', async () => {
        vi.mocked(fetchSearchProducts).mockRejectedValueOnce(new LocalInventoryError('LOCAL_INVENTORY_INDEX_STALE'));
        const response = await invoke(buildRequest({ refine: ['cgid=root', 'orderable_only=true'] }));
        expect(response.status).toBe(503);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.text()).toBe('Internal Error');
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getLocalInventoryContext).mockReturnValue(null);
    });

    it('rejects cross-origin GETs', async () => {
        const request = buildRequest({ refine: 'cgid=womens' }, { Origin: 'https://evil.example' });
        const response = await invoke(request);
        expect(response.status).toBe(403);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(fetchSearchProducts).not.toHaveBeenCalled();
    });

    it('returns 403 when neither Origin nor Referer is present', async () => {
        const response = await invoke(new Request(buildUrl({ refine: 'cgid=womens' }), { method: 'GET' }));
        expect(response.status).toBe(403);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(fetchSearchProducts).not.toHaveBeenCalled();
    });

    it('returns 400 when no refine is provided', async () => {
        const response = await invoke(buildRequest({ offset: '24', limit: '24' }));
        expect(response.status).toBe(400);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(fetchSearchProducts).not.toHaveBeenCalled();
    });

    it('returns 400 when category refinements are missing or conflict', async () => {
        const missingCategory = await invoke(buildRequest({ refine: 'c_color=blue' }));
        const conflictingCategories = await invoke(buildRequest({ refine: ['cgid=womens', 'cgslug=womens/shoes'] }));

        expect(missingCategory.status).toBe(400);
        expect(missingCategory.headers.get('Cache-Control')).toBe('no-store');
        expect(conflictingCategories.status).toBe(400);
        expect(conflictingCategories.headers.get('Cache-Control')).toBe('no-store');
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
        expect(response.headers.get('Cache-Control')).toBe('no-store');
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
        expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('rejects non-GET methods', () => {
        const response = action();
        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('GET');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
    });
});

describe('category window source-store guard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getLocalInventoryContext).mockReturnValue({ storeId: 'B', inventoryId: 'list-B' });
        vi.mocked(fetchSearchProducts).mockResolvedValue({
            hits: [{ productId: 'milk' }],
            total: 10,
            offset: 2,
        } as never);
    });
    const localContext = () => {
        const ctx = buildContext('GBP');
        ctx.set(appConfigContext, {
            ...mockConfig,
            features: { ...mockConfig.features, localInventory: { enabled: true } },
        } as typeof mockConfig);
        return ctx;
    };

    const staleRequests: Record<string, string | string[]>[] = [
        { inventoryStore: 'A', refine: ['cgid=root'] },
        { refine: ['cgid=root', 'ilids=list-A'] },
        { inventoryStore: 'B', refine: ['cgid=root', 'ilids=list-A'] },
        { inventoryStore: '', refine: ['cgid=root'] },
        { refine: ['cgid=root'] },
    ];
    it.each(staleRequests)('rejects a stale or ambiguous next-page request %j', async (params) => {
        const response = await invoke(buildRequest({ offset: '2', ...params }), localContext());
        expect(response.status).toBe(409);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.json()).toEqual({
            code: 'STORE_INVENTORY_CHANGED',
            ...(typeof params.inventoryStore === 'string' && { inventoryStore: params.inventoryStore }),
        });
        expect(fetchSearchProducts).not.toHaveBeenCalled();
    });

    it('rejects old-store requests after the selected store is cleared', async () => {
        vi.mocked(getLocalInventoryContext).mockReturnValue(null);
        const response = await invoke(
            buildRequest({ offset: '2', inventoryStore: 'A', refine: ['cgid=root', 'ilids=list-A'] }),
            localContext()
        );
        expect(response.status).toBe(409);
        expect(fetchSearchProducts).not.toHaveBeenCalled();
    });

    it.each(['B', ''])('returns the source marker for a current-store window %j', async (inventoryStore) => {
        if (!inventoryStore) vi.mocked(getLocalInventoryContext).mockReturnValue(null);
        const response = await invoke(
            buildRequest({ offset: '2', inventoryStore, refine: ['cgid=root'] }),
            localContext()
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ inventoryStore, hits: [{ productId: 'milk' }] });
    });

    it('allows the carousel first window to refresh into the committed store', async () => {
        const response = await invoke(buildRequest({ refine: ['cgid=root'] }), localContext());
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ inventoryStore: 'B' });
    });
});
