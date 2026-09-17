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
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { ApiError, defaultQuerySerializer } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { performanceTimerContext } from '@/middlewares/performance-metrics';
import { getUrlMapping } from './shopper-seo.server';

const { mockConfig, mockGetUrlMapping } = vi.hoisted(() => ({
    mockConfig: {
        commerce: {
            api: {
                shortCode: 'test-code',
                organizationId: 'f_ecom_test_001',
            },
        },
    },
    mockGetUrlMapping: vi.fn(),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(() => mockConfig),
}));

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(() => ({
        shopperSeo: { getUrlMapping: mockGetUrlMapping },
    })),
}));

const API_PATH = '/site/shopper-seo/v1/organizations/f_ecom_test_001/url-mapping';
const DIRECT_BASE_URL = 'https://test-code.api.commercecloud.salesforce.com';
const PROXY_BASE_URL = 'https://scapi-proxy.example.test';
const PERFORMANCE_MARK = 'apiCall.ShopperSeo.getUrlMapping';

function createContext(siteId: string | null = 'RefArch', localeId: string | null = 'en-US') {
    const context = new RouterContextProvider();
    context.set(siteContext, {
        site: siteId ? { id: siteId } : undefined,
        locale: localeId ? { id: localeId } : undefined,
    } as never);
    const performanceTimer = { mark: vi.fn() };
    context.set(performanceTimerContext, performanceTimer as never);
    return { context, performanceTimer };
}

function endpointUrl(baseUrl: string, urlSegment: string): string {
    const query = defaultQuerySerializer({
        siteId: 'RefArch',
        locale: 'en-US',
        urlSegment,
        personalized: 'none',
    });
    return `${baseUrl}${API_PATH}?${query}`;
}

function segmentForLength(baseUrl: string, length: number): string {
    const emptyLength = endpointUrl(baseUrl, '').length;
    return 'a'.repeat(length - emptyLength);
}

function apiError(status: number): ApiError {
    return new ApiError({
        status,
        statusText: 'Error',
        headers: new Headers(),
        body: { type: 'error', title: 'Error', detail: 'Request failed' },
        rawBody: '',
        url: 'https://api.example.test/url-mapping',
        method: 'GET',
    });
}

describe('getUrlMapping', () => {
    const originalProxyHost = process.env.SCAPI_PROXY_HOST;
    const mockCreateApiClients = vi.mocked(createApiClients);

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.SCAPI_PROXY_HOST;
        mockGetUrlMapping.mockResolvedValue({ data: { resourceType: 'PRODUCT', resourceId: 'product-1' } });
    });

    afterEach(() => {
        if (originalProxyHost === undefined) delete process.env.SCAPI_PROXY_HOST;
        else process.env.SCAPI_PROXY_HOST = originalProxyHost;
    });

    test('calls Shopper SEO once with active site and locale and returns its data', async () => {
        const { context } = createContext();

        const result = await getUrlMapping(context, 'legacy/path');

        expect(mockGetUrlMapping).toHaveBeenCalledTimes(1);
        expect(mockGetUrlMapping).toHaveBeenCalledWith({
            params: {
                query: {
                    urlSegment: 'legacy/path',
                    siteId: 'RefArch',
                    locale: 'en-US',
                    personalized: 'none',
                },
            },
        });
        expect(result).toEqual({ resourceType: 'PRODUCT', resourceId: 'product-1' });
    });

    test('records only a fixed low-cardinality performance mark', async () => {
        const { context, performanceTimer } = createContext();

        await getUrlMapping(context, 'private/raw/path');

        expect(performanceTimer.mark).toHaveBeenNthCalledWith(1, PERFORMANCE_MARK, 'start');
        expect(performanceTimer.mark).toHaveBeenNthCalledWith(2, PERFORMANCE_MARK, 'end');
        expect(performanceTimer.mark.mock.calls.flat()).not.toContain('private/raw/path');
    });

    test.each([
        ['direct SCAPI', DIRECT_BASE_URL, false],
        ['SCAPI proxy', PROXY_BASE_URL, true],
    ])('accepts a fully serialized %s endpoint of 2047 characters', async (_label, baseUrl, useProxy) => {
        if (useProxy) process.env.SCAPI_PROXY_HOST = baseUrl;
        const { context } = createContext();
        const urlSegment = segmentForLength(baseUrl, 2047);

        expect(endpointUrl(baseUrl, urlSegment)).toHaveLength(2047);
        await expect(getUrlMapping(context, urlSegment)).resolves.toEqual({
            resourceType: 'PRODUCT',
            resourceId: 'product-1',
        });
        expect(mockGetUrlMapping).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['direct SCAPI', DIRECT_BASE_URL, false],
        ['SCAPI proxy', PROXY_BASE_URL, true],
    ])('treats a fully serialized %s endpoint of 2048 characters as a mapping miss', async (_label, baseUrl, useProxy) => {
        if (useProxy) process.env.SCAPI_PROXY_HOST = baseUrl;
        const { context } = createContext();
        const urlSegment = segmentForLength(baseUrl, 2048);

        expect(endpointUrl(baseUrl, urlSegment)).toHaveLength(2048);
        await expect(getUrlMapping(context, urlSegment)).resolves.toBeNull();
        expect(mockCreateApiClients).not.toHaveBeenCalled();
        expect(mockGetUrlMapping).not.toHaveBeenCalled();
    });

    test.each([
        ['site', null, 'en-US'],
        ['locale', 'RefArch', null],
    ])('rejects missing %s context before client creation', async (_label, siteId, localeId) => {
        const { context } = createContext(siteId, localeId);

        await expect(getUrlMapping(context, 'legacy/path')).rejects.toThrow(/context not initialized/i);
        expect(mockCreateApiClients).not.toHaveBeenCalled();
    });

    test('returns null for a Shopper SEO 404', async () => {
        const { context } = createContext();
        mockGetUrlMapping.mockRejectedValue(apiError(404));

        await expect(getUrlMapping(context, 'missing')).resolves.toBeNull();
        expect(mockGetUrlMapping).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['400', apiError(400)],
        ['401', apiError(401)],
        ['403', apiError(403)],
        ['429', apiError(429)],
        ['500', apiError(500)],
        ['network', new TypeError('Network failed')],
        ['timeout', new DOMException('Timed out', 'TimeoutError')],
    ])('rethrows %s errors unchanged without retrying', async (_label, error) => {
        const { context } = createContext();
        mockGetUrlMapping.mockRejectedValue(error);

        await expect(getUrlMapping(context, 'legacy/path')).rejects.toBe(error);
        expect(mockGetUrlMapping).toHaveBeenCalledTimes(1);
    });
});
