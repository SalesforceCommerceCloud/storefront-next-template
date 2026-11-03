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
import { ApiError } from '@/scapi';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
import { loader, action } from './resource.last-order';

function makeNormalizedApiError(status: number): NormalizedApiError {
    const apiError = new ApiError({
        status,
        statusText: 'Error',
        headers: new Headers(),
        body: { type: 'about:blank', title: 'Error', detail: 'error' },
        rawBody: '',
        url: 'https://example.com/api',
        method: 'GET',
    });
    return new NormalizedApiError(apiError);
}

vi.mock('@/lib/api/order.server', () => ({ fetchLastOrder: vi.fn() }));
vi.mock('@/middlewares/auth.server', () => ({ getAuth: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { fetchLastOrder } from '@/lib/api/order.server';
import { getAuth } from '@/middlewares/auth.server';

const ORIGIN = 'https://example.com';

const buildContext = (): RouterContextProvider => {
    const ctx = new RouterContextProvider();
    ctx.set(siteContext, { currency: 'USD' } as never);
    return ctx;
};

const buildRequest = (headers: Record<string, string> = {}) => {
    const url = new URL(`${ORIGIN}${resourceRoutes.lastOrder}`);
    return new Request(url.toString(), { method: 'GET', headers: { Referer: `${ORIGIN}/`, ...headers } });
};

const invoke = (request: Request, context = buildContext()) => loader({ request, context, params: {} } as never);

const MOCK_ORDER = {
    orderNo: 'ORD-001',
    orderDate: '2026-09-01T10:00:00Z',
    status: 'completed',
    total: 50,
    currency: 'USD',
    itemCount: 3,
    productItems: [],
};

describe('resource.last-order', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getAuth).mockReturnValue({ customerId: 'c001', userType: 'registered' } as never);
        vi.mocked(fetchLastOrder).mockResolvedValue(MOCK_ORDER as never);
    });

    it('returns 403 for cross-origin GET', async () => {
        const response = await invoke(buildRequest({ Origin: 'https://evil.example' }));
        expect(response.status).toBe(403);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(fetchLastOrder).not.toHaveBeenCalled();
    });

    it('returns 403 when neither Origin nor Referer is present', async () => {
        const url = new URL(`${ORIGIN}${resourceRoutes.lastOrder}`);
        const response = await invoke(new Request(url.toString(), { method: 'GET' }));
        expect(response.status).toBe(403);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(fetchLastOrder).not.toHaveBeenCalled();
    });

    it('returns 401 for guest with no customerId', async () => {
        vi.mocked(getAuth).mockReturnValue({ customerId: undefined, userType: 'guest' } as never);
        const response = await invoke(buildRequest());
        expect(response.status).toBe(401);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(fetchLastOrder).not.toHaveBeenCalled();
    });

    it('returns 401 for registered-guest (guest with a customerId)', async () => {
        vi.mocked(getAuth).mockReturnValue({ customerId: 'gcid-xxx', userType: 'guest' } as never);
        const response = await invoke(buildRequest());
        expect(response.status).toBe(401);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(fetchLastOrder).not.toHaveBeenCalled();
    });

    it('returns 200 with order: null when shopper has no order history', async () => {
        vi.mocked(fetchLastOrder).mockResolvedValue(null);
        const response = await invoke(buildRequest());
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        const body = await response.json();
        expect(body.order).toBeNull();
    });

    it('happy path: returns 200 with the order', async () => {
        const response = await invoke(buildRequest());
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        const body = await response.json();
        expect(body.order).toMatchObject({ orderNo: 'ORD-001' });
    });

    it('returns 500 when fetchLastOrder throws a generic error', async () => {
        vi.mocked(fetchLastOrder).mockRejectedValue(new Error('SCAPI down'));
        const response = await invoke(buildRequest());
        expect(response.status).toBe(500);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('propagates NormalizedApiError status on SCAPI failure', async () => {
        const scapiError = makeNormalizedApiError(503);
        vi.mocked(fetchLastOrder).mockRejectedValue(scapiError);
        const response = await invoke(buildRequest());
        expect(response.status).toBe(503);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('action() returns 405 with Allow: GET and no-store', () => {
        const response = action();
        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('GET');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
    });
});
