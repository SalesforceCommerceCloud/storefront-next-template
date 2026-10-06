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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { getUrlMapping } from '@/lib/api/shopper-seo.server';
import { ApiError } from '@/scapi';
import { attemptRouteSeoFallback } from './route-fallback.server';

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));

const config = {
    hybrid: { enabled: true, legacyRoutes: [] as Array<string | { pattern: string; suffix?: string }> },
    seoFallback: {
        sites: {
            RefArch: {
                redirectOrigins: [],
                allowedQueryParameters: { product: ['color'], category: [], redirect: [] },
                contentOwned: false,
            },
        },
    },
    url: {
        prefix: '/:siteId/:localeId',
        seoRoutes: { RefArch: { product: { prefix: 'p' }, category: { prefix: 'c', mode: 'id-suffix' } } },
    },
    localeAliasMap: { 'en-US': 'en' },
};

vi.mock('@salesforce/storefront-next-runtime/config', () => ({ getConfig: vi.fn(() => config) }));
vi.mock('@/lib/api/shopper-seo.server', () => ({ getUrlMapping: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({ getLogger: vi.fn(() => ({ warn: mockWarn })) }));
vi.mock('@/lib/origin', () => ({ getAppOrigin: vi.fn(() => 'https://shop.example') }));

describe('attemptRouteSeoFallback', () => {
    const activeSite = {
        site: { id: 'RefArch', alias: 'global' },
        locale: { id: 'en-US', alias: 'en' },
    };
    const context = {
        get: vi.fn((key) => (key === siteContext ? activeSite : undefined)),
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
        config.hybrid.enabled = true;
        config.hybrid.legacyRoutes = [];
    });

    test('reapplies the resolved site and locale prefix to resource redirects', async () => {
        vi.mocked(getUrlMapping).mockResolvedValue({
            resourceType: 'PRODUCT',
            resourceId: 'p1',
            destinationUrl: '/global/en/women/p1?color=blue#details',
        });

        const response = await attemptRouteSeoFallback(
            context,
            new Request('https://internal.example/global/en/legacy?color=source')
        );

        expect(response?.status).toBe(302);
        expect(response?.headers.get('Location')).toBe('/global/en/p/women/p1?color=blue#details');
        expect(response?.headers.get('X-Remix-Reload-Document')).toBe('true');
    });

    test('skips fallback for hybrid-owned route paths', async () => {
        config.hybrid.legacyRoutes = [{ pattern: '/product/:id', suffix: '.html' }];

        const response = await attemptRouteSeoFallback(
            context,
            new Request('https://internal.example/global/en/product/legacy')
        );

        expect(response).toBeUndefined();
        expect(getUrlMapping).not.toHaveBeenCalled();
    });

    test('ignores configured legacy routes when hybrid mode is disabled', async () => {
        config.hybrid.enabled = false;
        config.hybrid.legacyRoutes = [{ pattern: '/product/:id', suffix: '.html' }];
        vi.mocked(getUrlMapping).mockResolvedValue(null);

        await attemptRouteSeoFallback(context, new Request('https://internal.example/global/en/product/legacy'));

        expect(getUrlMapping).toHaveBeenCalledOnce();
    });

    test('retains the original 404 path for malformed percent encoding', async () => {
        const response = await attemptRouteSeoFallback(
            context,
            new Request('https://internal.example/global/en/bad%2')
        );

        expect(response).toBeUndefined();
        expect(getUrlMapping).not.toHaveBeenCalled();
    });

    test('sanitizes Shopper SEO ApiError details on deterministic route fallback', async () => {
        const failure = new ApiError({
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers(),
            body: { type: 'upstream-error', title: 'Unavailable', detail: 'private upstream diagnostic' },
            rawBody: '{"detail":"private upstream diagnostic"}',
            url: 'https://api.example.test/url-mapping?token=private',
            method: 'GET',
        });
        vi.mocked(getUrlMapping).mockRejectedValue(failure);

        const error = await attemptRouteSeoFallback(
            context,
            new Request('https://internal.example/global/en/product/missing')
        ).catch((reason: unknown) => reason);

        expect(error).not.toBe(failure);
        expect(error).toBeInstanceOf(Response);
        expect((error as Response).status).toBe(502);
        expect(await (error as Response).text()).toBe('Bad Gateway');
        expect(mockWarn).toHaveBeenCalledWith('RouteSeoFallback: Shopper SEO fallback failed', {
            outcome: 'error',
        });
    });
});
