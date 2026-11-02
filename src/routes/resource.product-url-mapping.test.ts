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
import { getUrlMapping } from '@/lib/api/shopper-seo.server';
import { resourceRoutes } from '@/route-paths';
import { action, loader } from './resource.product-url-mapping';

vi.mock('@/lib/api/shopper-seo.server', () => ({
    getUrlMapping: vi.fn(),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const mockGetUrlMapping = vi.mocked(getUrlMapping);

const ORIGIN = 'https://example.com';
const SEGMENT = 'en_US/dipsea-tie-headband-2040793A5H.html';

const buildRequest = (urlSegment: string | undefined, origin = ORIGIN) => {
    const url = new URL(`${ORIGIN}${resourceRoutes.productUrlMapping}`);
    if (urlSegment !== undefined) url.searchParams.set('urlSegment', urlSegment);
    return new Request(url, { method: 'GET', headers: { Origin: origin } });
};

const callLoader = (request: Request) => loader({ request, context: new RouterContextProvider() } as never);

describe('resource.product-url-mapping', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the product a URL segment maps to', async () => {
        mockGetUrlMapping.mockResolvedValue({ resourceType: 'PRODUCT', resourceId: '2040793A5H' } as never);
        const res = await callLoader(buildRequest(SEGMENT));

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ productId: '2040793A5H' });
        expect(mockGetUrlMapping).toHaveBeenCalledWith(expect.anything(), SEGMENT);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it.each([
        ['maps to a category', { resourceType: 'CATEGORY', resourceId: 'womens' }],
        ['maps to nothing', null],
    ])('returns no product when the segment %s', async (_label, mapping) => {
        mockGetUrlMapping.mockResolvedValue(mapping as never);
        const res = await callLoader(buildRequest(SEGMENT));

        expect(await res.json()).toEqual({ productId: null });
    });

    it('returns 502, not "no product", when the lookup fails', async () => {
        mockGetUrlMapping.mockRejectedValue(new Error('Bad Gateway'));
        const res = await callLoader(buildRequest(SEGMENT));

        expect(res.status).toBe(502);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it('returns 400 when urlSegment is missing or blank', async () => {
        expect((await callLoader(buildRequest(undefined))).status).toBe(400);
        expect((await callLoader(buildRequest('  '))).status).toBe(400);
        expect(mockGetUrlMapping).not.toHaveBeenCalled();
    });

    it('returns 403 cross-origin', async () => {
        const res = await callLoader(buildRequest(SEGMENT, 'https://attacker.com'));

        expect(res.status).toBe(403);
        expect(mockGetUrlMapping).not.toHaveBeenCalled();
    });

    it('returns 405 on POST', () => {
        expect(action().status).toBe(405);
    });
});
