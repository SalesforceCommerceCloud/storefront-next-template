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
import { loader, shouldRevalidate } from './_app.order-lookup.results.$orderNo';

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

const { mockFetchGuestOrderResult } = vi.hoisted(() => ({ mockFetchGuestOrderResult: vi.fn() }));
vi.mock('@/lib/order/fetch-order.server', () => ({
    fetchGuestOrderResult: mockFetchGuestOrderResult,
}));

const { getConfig } = await import('@salesforce/storefront-next-runtime/config');
const { verifyOrderState } = await import('@/lib/order/session.server');

describe('_app.order-lookup.results.$orderNo loader', () => {
    let mockContext: LoaderContext;
    // No email or order number in the URL — orderNo is a path segment, email comes from cookie
    let mockRequest: Request;

    beforeEach(() => {
        vi.clearAllMocks();
        mockParse.mockReset();
        mockFetchGuestOrderResult.mockReset();
        mockContext = { siteId: 'RefArch', localeId: 'en_US', get: vi.fn() } as unknown as LoaderContext;
        mockRequest = new Request('https://example.com/order-lookup/results/ORDER12345');
    });

    it('should return 404 when feature is disabled', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: false },
        } as never);

        await expect(callLoader({ request: mockRequest, context: mockContext })).rejects.toThrow();

        try {
            await callLoader({ request: mockRequest, context: mockContext });
        } catch (error) {
            expect((error as { init: ResponseInit }).init.status).toBe(404);
        }
    });

    it('should redirect to /order-lookup when the order-state cookie is missing', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true },
        } as never);

        mockParse.mockResolvedValue(null);

        await expect(callLoader({ request: mockRequest, context: mockContext })).rejects.toThrow();

        try {
            await callLoader({ request: mockRequest, context: mockContext });
        } catch (error) {
            expect(error).toHaveProperty('status', 302);
        }
    });

    it('should redirect to /order-lookup when the order-state cookie is invalid', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true },
        } as never);

        mockParse.mockResolvedValueOnce('invalid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue(null);

        await expect(callLoader({ request: mockRequest, context: mockContext })).rejects.toThrow();

        try {
            await callLoader({ request: mockRequest, context: mockContext });
        } catch (error) {
            expect(error).toHaveProperty('status', 302);
        }
    });

    it('should redirect to /order-lookup/verify/:orderNo when the cookie is present but unverified', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true },
        } as never);

        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hashed-ORDER12345',
            issuedAt: Date.now(),
            email: 'shopper@example.com',
            verified: false,
            verifiedCode: null,
            attempts: 0,
        });

        let caught: unknown;
        try {
            await callLoader({ request: mockRequest, context: mockContext });
        } catch (error) {
            caught = error;
        }

        expect(caught).toHaveProperty('status', 302);
        expect((caught as Response).headers.get('Location')).toContain('/order-lookup/verify/ORDER12345');
    });

    it('should return no-cache headers when the order state is verified', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);
        const { hashOrderNumber } = await import('@/lib/order/session.server');

        mockFetchGuestOrderResult.mockResolvedValue({ ok: true, order: { orderNo: 'ORDER12345' }, productsById: {} });
        vi.mocked(hashOrderNumber).mockReturnValue('hashed-ORDER12345');
        mockParse.mockResolvedValueOnce('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hashed-ORDER12345',
            issuedAt: Date.now(),
            email: 'shopper@example.com',
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        const result = await callLoader({ request: mockRequest, context: mockContext });
        const wrapped = result as { init: ResponseInit };
        const headers = new Headers(wrapped.init.headers);

        expect(headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
        expect(headers.get('Pragma')).toBe('no-cache');
        expect(headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    });

    it('should verify the order state with correct siteId and TTL', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);
        const { hashOrderNumber } = await import('@/lib/order/session.server');

        mockFetchGuestOrderResult.mockResolvedValue({ ok: true, order: { orderNo: 'ORDER12345' }, productsById: {} });
        vi.mocked(hashOrderNumber).mockReturnValue('hashed-ORDER12345');
        mockParse.mockResolvedValueOnce('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hashed-ORDER12345',
            issuedAt: Date.now(),
            email: 'shopper@example.com',
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        await callLoader({ request: mockRequest, context: mockContext });

        expect(verifyOrderState).toHaveBeenCalledWith('valid-order-state', 'RefArch', 900);
    });

    it('should return email from the signed cookie — never from the URL', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);
        const { hashOrderNumber } = await import('@/lib/order/session.server');

        mockFetchGuestOrderResult.mockResolvedValue({ ok: true, order: { orderNo: 'ORDER12345' }, productsById: {} });
        vi.mocked(hashOrderNumber).mockReturnValue('hashed-ORDER12345');
        mockParse.mockResolvedValueOnce('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hashed-ORDER12345',
            issuedAt: Date.now(),
            email: 'cookie@example.com',
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        const result = await callLoader({ request: mockRequest, context: mockContext });
        const wrapped = result as { data: { email: string } };

        // Email comes from the cookie, not from a URL query parameter
        expect(wrapped.data.email).toBe('cookie@example.com');
    });

    it('should not fetch the order when the state payload orderNumberHash does not match the requested order (defense-in-depth)', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true },
        } as never);
        const { hashOrderNumber } = await import('@/lib/order/session.server');

        vi.mocked(hashOrderNumber).mockReturnValue('hash-of-order-a');
        mockParse.mockResolvedValueOnce('valid-state-for-b');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash-of-order-b', // mismatched payload
            issuedAt: Date.now(),
            email: 'shopper@example.com',
            verified: true,
            verifiedCode: '654321',
            attempts: 0,
        });

        const result = await callLoader({ request: mockRequest, context: mockContext });
        const wrapped = result as { data: { result: unknown } };

        expect(wrapped.data.result).toBeNull();
        expect(mockFetchGuestOrderResult).not.toHaveBeenCalled();
    });

    it('should keep order A accessible after order B is verified in the same browser session', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);
        const { hashOrderNumber } = await import('@/lib/order/session.server');

        mockFetchGuestOrderResult.mockResolvedValue({ ok: true, order: { orderNo: 'ORDER12345' }, productsById: {} });

        vi.mocked(hashOrderNumber).mockReturnValue('hash-of-order-a');
        mockParse.mockResolvedValueOnce('valid-state-for-a');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash-of-order-a',
            issuedAt: Date.now(),
            email: 'shopper@example.com',
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        const result = await callLoader({ request: mockRequest, context: mockContext });
        const wrapped = result as { data: { result: { ok: boolean } | null } };

        expect(wrapped.data.result?.ok).toBe(true);
        expect(mockFetchGuestOrderResult).toHaveBeenCalledWith(
            expect.objectContaining({ orderNumber: 'ORDER12345', code: '123456' })
        );
    });

    it('should fetch and return the order when the order state matches the current order and is verified', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);
        const { hashOrderNumber } = await import('@/lib/order/session.server');

        mockFetchGuestOrderResult.mockResolvedValue({ ok: true, order: { orderNo: 'ORDER12345' }, productsById: {} });

        vi.mocked(hashOrderNumber).mockReturnValue('hash-of-order-a');
        mockParse.mockResolvedValueOnce('valid-state-for-a');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash-of-order-a',
            issuedAt: Date.now(),
            email: 'shopper@example.com',
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        const result = await callLoader({ request: mockRequest, context: mockContext });
        const wrapped = result as { data: { result: { ok: boolean; order: unknown } | null } };

        expect(wrapped.data.result?.ok).toBe(true);
        expect(wrapped.data.result?.order).toEqual({ orderNo: 'ORDER12345' });
        // The verified access code is passed to the server-side fetch, never returned to the client.
        expect(mockFetchGuestOrderResult).toHaveBeenCalledWith(expect.objectContaining({ code: '123456' }));
    });

    it('should use email from the cookie when auto-fetching the verified order', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);
        const { hashOrderNumber } = await import('@/lib/order/session.server');

        mockFetchGuestOrderResult.mockResolvedValue({ ok: true, order: { orderNo: 'ORDER12345' }, productsById: {} });

        vi.mocked(hashOrderNumber).mockReturnValue('hash-of-order-a');
        mockParse.mockResolvedValueOnce('valid-state-for-a');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash-of-order-a',
            issuedAt: Date.now(),
            email: 'cookie-email@example.com',
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        await callLoader({ request: mockRequest, context: mockContext });

        // Email must come from the cookie, never from a URL parameter
        expect(mockFetchGuestOrderResult).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'cookie-email@example.com' })
        );
    });

    it('should never expose the raw access code in the loader response', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);
        const { hashOrderNumber } = await import('@/lib/order/session.server');

        mockFetchGuestOrderResult.mockResolvedValue({ ok: true, order: { orderNo: 'ORDER12345' }, productsById: {} });

        vi.mocked(hashOrderNumber).mockReturnValue('hash-of-order-a');
        mockParse.mockResolvedValueOnce('valid-state-for-a');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash-of-order-a',
            issuedAt: Date.now(),
            email: 'shopper@example.com',
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        const result = await callLoader({ request: mockRequest, context: mockContext });

        expect(JSON.stringify(result)).not.toContain('123456');
    });
});

describe('_app.order-lookup.results.$orderNo shouldRevalidate', () => {
    it('should return false to prevent loader re-execution', () => {
        expect(shouldRevalidate()).toBe(false);
    });
});
