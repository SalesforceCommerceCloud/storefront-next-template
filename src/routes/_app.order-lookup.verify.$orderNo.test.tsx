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
import { loader, shouldRevalidate } from './_app.order-lookup.verify.$orderNo';

type LoaderContext = Parameters<typeof loader>[0]['context'];
type LoaderArgs = Parameters<typeof loader>[0];

function callLoader(args: { request: Request; context: LoaderContext; params?: Record<string, string> }) {
    return loader({
        request: args.request,
        context: args.context,
        params: args.params ?? { orderNo: 'ORDER12345' },
    } as unknown as LoaderArgs);
}

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(),
}));

vi.mock('@/lib/url.server', () => ({
    buildUrlFromContext: vi.fn((path: string) => path),
}));

vi.mock('@/lib/order/session.server', () => ({
    verifyOrderState: vi.fn(),
    hashOrderNumber: vi.fn((orderNumber: string) => `hashed-${orderNumber}`),
    ACCESS_CODE_TTL_SECONDS: 900,
}));

const mockParse = vi.fn();
vi.mock('@/lib/cookie-utils.server', () => ({
    createCookie: vi.fn(() => ({
        parse: mockParse,
        serialize: vi.fn(),
    })),
    getCookieConfig: vi.fn((config: unknown) => config),
}));

vi.mock('@/lib/utils.server', () => ({
    getSite: vi.fn(() => ({ siteId: 'RefArch', locale: 'en_US' })),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

const { getConfig } = await import('@salesforce/storefront-next-runtime/config');
const { verifyOrderState } = await import('@/lib/order/session.server');

describe('_app.order-lookup.verify.$orderNo loader', () => {
    let mockContext: LoaderContext;
    let mockRequest: Request;

    beforeEach(() => {
        vi.clearAllMocks();
        mockParse.mockReset();
        mockContext = { siteId: 'RefArch', localeId: 'en_US', get: vi.fn() } as unknown as LoaderContext;
        mockRequest = new Request('https://example.com/order-lookup/verify/ORDER12345');
    });

    it('should return 404 when feature is disabled', async () => {
        vi.mocked(getConfig).mockReturnValue({ guestOrderLookup: { enabled: false } } as never);

        await expect(callLoader({ request: mockRequest, context: mockContext })).rejects.toThrow();

        try {
            await callLoader({ request: mockRequest, context: mockContext });
        } catch (error) {
            expect((error as { init: ResponseInit }).init.status).toBe(404);
        }
    });

    it('should redirect to /order-lookup when no order-state cookie is present', async () => {
        vi.mocked(getConfig).mockReturnValue({ guestOrderLookup: { enabled: true } } as never);
        mockParse.mockResolvedValue(null);

        await expect(callLoader({ request: mockRequest, context: mockContext })).rejects.toThrow();

        try {
            await callLoader({ request: mockRequest, context: mockContext });
        } catch (error) {
            expect(error).toHaveProperty('status', 302);
            expect((error as Response).headers.get('Location')).toContain('/order-lookup');
            expect((error as Response).headers.get('Location')).not.toContain('/verify');
            expect((error as Response).headers.get('Location')).not.toContain('/results');
        }
    });

    it('should redirect to /order-lookup when the order-state cookie is invalid', async () => {
        vi.mocked(getConfig).mockReturnValue({ guestOrderLookup: { enabled: true } } as never);
        mockParse.mockResolvedValue('invalid-state');
        vi.mocked(verifyOrderState).mockReturnValue(null);

        await expect(callLoader({ request: mockRequest, context: mockContext })).rejects.toThrow();

        try {
            await callLoader({ request: mockRequest, context: mockContext });
        } catch (error) {
            expect(error).toHaveProperty('status', 302);
        }
    });

    it('should redirect to /order-lookup/results/:orderNo when already verified', async () => {
        vi.mocked(getConfig).mockReturnValue({ guestOrderLookup: { enabled: true } } as never);
        mockParse.mockResolvedValue('valid-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hashed-ORDER12345',
            issuedAt: Date.now(),
            email: 'shopper@example.com',
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        await expect(callLoader({ request: mockRequest, context: mockContext })).rejects.toThrow();

        try {
            await callLoader({ request: mockRequest, context: mockContext });
        } catch (error) {
            expect(error).toHaveProperty('status', 302);
            expect((error as Response).headers.get('Location')).toContain('/order-lookup/results/ORDER12345');
        }
    });

    it('should render the verify form when cookie is present and unverified', async () => {
        vi.mocked(getConfig).mockReturnValue({ guestOrderLookup: { enabled: true } } as never);
        mockParse.mockResolvedValue('valid-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hashed-ORDER12345',
            issuedAt: Date.now(),
            email: 'shopper@example.com',
            verified: false,
            verifiedCode: null,
            attempts: 0,
        });

        const result = await callLoader({ request: mockRequest, context: mockContext });
        const wrapped = result as { data: { email: string; orderNumber: string }; init: ResponseInit };

        expect(wrapped.data.email).toBe('shopper@example.com');
        expect(wrapped.data.orderNumber).toBe('ORDER12345');
    });

    it('should return no-cache headers', async () => {
        vi.mocked(getConfig).mockReturnValue({ guestOrderLookup: { enabled: true } } as never);
        mockParse.mockResolvedValue('valid-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hashed-ORDER12345',
            issuedAt: Date.now(),
            email: 'shopper@example.com',
            verified: false,
            verifiedCode: null,
            attempts: 0,
        });

        const result = await callLoader({ request: mockRequest, context: mockContext });
        const wrapped = result as { init: ResponseInit };
        const headers = new Headers(wrapped.init.headers);

        expect(headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
        expect(headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    });

    it('should return email from the signed cookie — never from the URL', async () => {
        vi.mocked(getConfig).mockReturnValue({ guestOrderLookup: { enabled: true } } as never);
        mockParse.mockResolvedValue('valid-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hashed-ORDER12345',
            issuedAt: Date.now(),
            email: 'cookie@example.com',
            verified: false,
            verifiedCode: null,
            attempts: 0,
        });

        const result = await callLoader({ request: mockRequest, context: mockContext });
        const wrapped = result as { data: { email: string } };

        expect(wrapped.data.email).toBe('cookie@example.com');
    });
});

describe('_app.order-lookup.verify.$orderNo shouldRevalidate', () => {
    it('should return false to prevent loader re-execution', () => {
        expect(shouldRevalidate()).toBe(false);
    });
});
