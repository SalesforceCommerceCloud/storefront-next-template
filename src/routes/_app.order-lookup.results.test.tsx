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
import { loader, shouldRevalidate } from './_app.order-lookup.results';

type LoaderContext = Parameters<typeof loader>[0]['context'];
type LoaderArgs = Parameters<typeof loader>[0];

function callLoader(args: { request: Request; context: LoaderContext }) {
    return loader({ request: args.request, context: args.context } as unknown as LoaderArgs);
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

describe('_app.order-lookup.results loader', () => {
    let mockContext: LoaderContext;
    let mockRequest: Request;

    beforeEach(() => {
        vi.clearAllMocks();
        mockParse.mockReset();
        mockFetchGuestOrderResult.mockReset();
        mockContext = { siteId: 'RefArch', localeId: 'en_US', get: vi.fn() } as unknown as LoaderContext;
        mockRequest = new Request('https://example.com/order-lookup/results?order=ORDER12345&email=test@example.com');
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

        // Cookie is present but invalid (bad signature/expired/etc.) → no access, redirect.
        mockParse.mockResolvedValueOnce('invalid-order-state'); // glo_order_<hash> — present but invalid
        vi.mocked(verifyOrderState).mockReturnValue(null);

        await expect(callLoader({ request: mockRequest, context: mockContext })).rejects.toThrow();

        try {
            await callLoader({ request: mockRequest, context: mockContext });
        } catch (error) {
            expect(error).toHaveProperty('status', 302);
        }
    });

    it('should return no-cache headers when the order state is valid', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true },
        } as never);

        // Cookie is present and valid, unverified is still enough for access to the page.
        mockParse.mockResolvedValueOnce('valid-order-state'); // glo_order_<hash> — present
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hashed-ORDER12345', // matches the current order (see hashOrderNumber mock)
            issuedAt: Date.now(),
            verified: false,
            verifiedCode: null,
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
            guestOrderLookup: { enabled: true },
        } as never);

        mockParse.mockResolvedValueOnce('valid-order-state'); // glo_order_<hash> — present
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hashed-ORDER12345', // matches the current order (see hashOrderNumber mock)
            issuedAt: Date.now(),
            verified: false,
            verifiedCode: null,
            attempts: 0,
        });

        await callLoader({ request: mockRequest, context: mockContext });

        expect(verifyOrderState).toHaveBeenCalledWith('valid-order-state', 'RefArch', 900);
    });

    it('should allow rendering when the order-state cookie is present but unverified (grants OTP-form access only)', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true },
        } as never);
        const request = new Request(
            'https://example.com/order-lookup/results?order=ORDER123456&email=test@example.com'
        );

        mockParse.mockResolvedValueOnce('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hashed-ORDER123456',
            issuedAt: Date.now(),
            verified: false,
            verifiedCode: null,
            attempts: 0,
        });

        const result = await callLoader({ request, context: mockContext });
        const wrapped = result as { init: ResponseInit; data: { result: unknown } };
        const headers = new Headers(wrapped.init.headers);

        expect(headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
        // Unverified: access to the page is granted, but no fetch result for auto-display.
        expect(wrapped.data.result).toBeNull();
        expect(mockFetchGuestOrderResult).not.toHaveBeenCalled();
    });

    it('should not fetch the order when the state payload orderNumberHash does not match the requested order (defense-in-depth)', async () => {
        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true },
        } as never);
        const { hashOrderNumber } = await import('@/lib/order/session.server');

        // The cookie is read under the current order's own cookie name (glo_order_<hash>),
        // but its signed payload claims a different orderNumberHash — e.g. a cookie value copied
        // to the wrong per-order cookie name. Access is still granted (cookie is validly signed),
        // but the order fetch is denied because of the hash mismatch.
        vi.mocked(hashOrderNumber).mockReturnValue('hash-of-order-a');
        mockParse.mockResolvedValueOnce('valid-state-for-b');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash-of-order-b', // mismatched payload
            issuedAt: Date.now(),
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

        // Order A's cookie (glo_order_<hash-of-order-a>) is independent of whatever happened to
        // order B's cookie — verifying order B never touches order A's cookie name.
        vi.mocked(hashOrderNumber).mockReturnValue('hash-of-order-a');
        mockParse.mockResolvedValueOnce('valid-state-for-a'); // glo_order_<hash-of-order-a> — present
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash-of-order-a',
            issuedAt: Date.now(),
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
        mockParse.mockResolvedValueOnce('valid-state-for-a'); // glo_order_<hash> — present
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash-of-order-a', // matches current order
            issuedAt: Date.now(),
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
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        const result = await callLoader({ request: mockRequest, context: mockContext });

        expect(JSON.stringify(result)).not.toContain('123456');
    });
});

describe('_app.order-lookup.results shouldRevalidate', () => {
    it('should return false to prevent loader re-execution', () => {
        expect(shouldRevalidate()).toBe(false);
    });
});
