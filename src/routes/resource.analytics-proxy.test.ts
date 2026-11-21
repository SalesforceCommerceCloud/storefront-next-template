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
import { loader, action } from './resource.analytics-proxy';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getAuth } from '@/middlewares/auth.server';
import { mockAltSiteObject } from '@/test-utils/config';
import { resourceRoutes } from '@/route-paths';

vi.mock('@salesforce/storefront-next-runtime/config');
vi.mock('@/middlewares/auth.server');

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

const mockGetConfig = vi.mocked(getConfig);
const mockGetAuth = vi.mocked(getAuth);

const ACTIVE_DATA_HOST = 'https://zzrf-001.dx.commercecloud.salesforce.com';
const ANALYTICS_URL = `${ACTIVE_DATA_HOST}/on/demandware.store/Sites-${mockAltSiteObject.id}-Site/${mockAltSiteObject.defaultLocale}/__Analytics-Start?dwac=0.123`;

function createArgs(method: string, targetUrl?: string) {
    const params = targetUrl ? `?url=${encodeURIComponent(targetUrl)}` : '';
    return {
        request: new Request(`http://localhost${resourceRoutes.analyticsProxy}${params}`, { method }),
        url: new URL(`http://localhost${resourceRoutes.analyticsProxy}${params}`),
        params: {},
        context: new RouterContextProvider(),
        pattern: resourceRoutes.analyticsProxy,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReturnValue({
        engagement: { adapters: { activeData: { host: ACTIVE_DATA_HOST } } },
    } as never);
    mockGetAuth.mockReturnValue({ dwsid: 'existing-dwsid' } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
});

describe('resource.analytics-proxy', () => {
    it('suppresses assisted analytics before sending any request or exporting dwsid', async () => {
        mockGetAuth.mockReturnValue({ authMode: 'trusted-agent', dwsid: 'assisted-session' });
        expect((await action(createArgs('POST', ANALYTICS_URL))).status).toBe(204);
        expect(fetch).not.toHaveBeenCalled();
    });
    it('should return 400 when url parameter is missing', async () => {
        const response = await loader(createArgs('GET'));
        expect(response.status).toBe(400);
    });

    it('should return 500 when Active Data host is not configured', async () => {
        mockGetConfig.mockReturnValue({ engagement: {} } as never);
        const response = await loader(createArgs('GET', ANALYTICS_URL));
        expect(response.status).toBe(500);
    });

    it('should return 400 when url parameter is malformed', async () => {
        const response = await loader(createArgs('GET', 'not-a-valid-url'));
        expect(response.status).toBe(400);
    });

    it('should return 403 when target URL hostname does not match configured host', async () => {
        const response = await loader(createArgs('GET', 'https://evil.com/steal'));
        expect(response.status).toBe(403);
    });

    it('should forward dwsid cookie to ECOM and return response status', async () => {
        const response = await loader(createArgs('GET', ANALYTICS_URL));

        expect(response.status).toBe(200);
        expect(fetch).toHaveBeenCalledWith(
            ANALYTICS_URL,
            expect.objectContaining({
                method: 'GET',
                headers: { Cookie: 'dwsid=existing-dwsid' },
            })
        );
    });

    it('should handle POST requests via action (sendBeacon)', async () => {
        const response = await action(createArgs('POST', ANALYTICS_URL));

        expect(response.status).toBe(200);
        expect(fetch).toHaveBeenCalledWith(ANALYTICS_URL, expect.objectContaining({ method: 'POST' }));
    });

    it('should rewrite Set-Cookie domain from ECOM to storefront hostname', async () => {
        const ecomCookie = 'dwsid=abc123; Path=/; Domain=zzrf-001.dx.commercecloud.salesforce.com; Secure; HttpOnly';
        const mockResponse = new Response(null, { status: 200 });
        Object.defineProperty(mockResponse.headers, 'getSetCookie', {
            value: () => [ecomCookie],
        });
        vi.mocked(fetch).mockResolvedValue(mockResponse);

        const response = await loader(createArgs('GET', ANALYTICS_URL));

        const setCookie = response.headers.get('Set-Cookie');
        expect(setCookie).toContain('Domain=localhost');
        expect(setCookie).not.toContain('zzrf-001.dx.commercecloud.salesforce.com');
        expect(setCookie).toContain('dwsid=abc123');
    });

    it('should forward Set-Cookie without domain unchanged', async () => {
        const ecomCookie = 'dwsid=abc123; Path=/; Secure; HttpOnly';
        const mockResponse = new Response(null, { status: 200 });
        Object.defineProperty(mockResponse.headers, 'getSetCookie', {
            value: () => [ecomCookie],
        });
        vi.mocked(fetch).mockResolvedValue(mockResponse);

        const response = await loader(createArgs('GET', ANALYTICS_URL));

        const setCookie = response.headers.get('Set-Cookie');
        expect(setCookie).toBe(ecomCookie);
    });

    it('should return no Set-Cookie when ECOM returns none', async () => {
        const mockResponse = new Response(null, { status: 200 });
        Object.defineProperty(mockResponse.headers, 'getSetCookie', {
            value: () => [],
        });
        vi.mocked(fetch).mockResolvedValue(mockResponse);

        const response = await loader(createArgs('GET', ANALYTICS_URL));

        expect(response.headers.get('Set-Cookie')).toBeNull();
    });

    it('should proceed without dwsid when auth is not available', async () => {
        mockGetAuth.mockImplementation(() => {
            throw new Error('not initialized');
        });

        const response = await loader(createArgs('GET', ANALYTICS_URL));

        expect(response.status).toBe(200);
        expect(fetch).toHaveBeenCalledWith(ANALYTICS_URL, expect.objectContaining({ headers: {} }));
    });

    it('should return 502 when upstream fetch fails', async () => {
        vi.mocked(fetch).mockRejectedValue(new Error('network error'));

        const response = await loader(createArgs('GET', ANALYTICS_URL));

        expect(response.status).toBe(502);
    });
});
