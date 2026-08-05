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
import { action, type FetchOrderResponse } from './action.order-lookup-results-fetch';
import { ErrorCode } from '@/lib/error-codes';

type ActionContext = Parameters<typeof action>[0]['context'];
type ActionArgs = Parameters<typeof action>[0];
type DataResult = { init?: ResponseInit; data: FetchOrderResponse };

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    })),
}));

vi.mock('@/lib/order/lookup/validation', () => ({
    parseOrderNumber: vi.fn(),
    parseEmail: vi.fn(),
}));

vi.mock('@/lib/order/scapi.server', () => ({
    guestOrderLookup: vi.fn(),
}));

vi.mock('@/lib/turnstile/log-redact.server', () => ({
    redactEmailForLog: vi.fn((email: string) => `${email[0]}***@example.com`),
}));

vi.mock('@/lib/order/session.server', () => ({
    verifyOrderState: vi.fn(),
    hashOrderNumber: vi.fn(),
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

vi.mock('@/lib/order/redact', () => ({
    redactOrder: vi.fn((order: unknown) => order),
}));

const mockOmsMetaData = { omsActive: true, cancelReasonCodes: [], returnReasonCodes: [] };
vi.mock('@/lib/api/order.server', () => ({
    fetchOmsMetaData: vi.fn(() => Promise.resolve(mockOmsMetaData)),
    fetchGuestOrderProducts: vi.fn(() => Promise.resolve({})),
}));

const { getConfig } = await import('@salesforce/storefront-next-runtime/config');
const { parseOrderNumber, parseEmail } = await import('@/lib/order/lookup/validation');
const { guestOrderLookup } = await import('@/lib/order/scapi.server');
const { verifyOrderState, hashOrderNumber } = await import('@/lib/order/session.server');
const { redactOrder } = await import('@/lib/order/redact');
const { fetchGuestOrderProducts } = await import('@/lib/api/order.server');

function callAction(args: { request: Request; context: ActionContext; params?: Record<string, string> }) {
    return action({ request: args.request, context: args.context, params: args.params ?? {} } as unknown as ActionArgs);
}

describe('action.order-lookup-results-fetch', () => {
    let mockContext: ActionContext;
    let mockRequest: Request;

    beforeEach(() => {
        vi.clearAllMocks();
        mockParse.mockReset();
        vi.mocked(hashOrderNumber).mockReturnValue('hash123');
        mockContext = { siteId: 'RefArch', localeId: 'en_US', get: vi.fn() } as unknown as ActionContext;
    });

    function createFormRequest(data: Record<string, string>): Request {
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => {
            formData.append(key, value);
        });

        return new Request('https://example.com/action/order-lookup-results-fetch', {
            method: 'POST',
            body: formData,
        });
    }

    it('should return 404 when feature is disabled', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: false },
        } as never);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(404);
        expect(result.data).toEqual({
            ok: false,
            code: ErrorCode.NOT_FOUND,
            message: 'Not found',
        });
    });

    it('should return 401 when order-state cookie is missing', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true },
        } as never);

        // Order number must parse successfully before the per-order cookie name can be built.
        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        mockParse.mockResolvedValue(null);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(401);
        expect(result.data).toEqual({
            ok: false,
            code: ErrorCode.NOT_AUTHORIZED,
            message: 'Unauthorized',
        });
    });

    it('should look up the order-state cookie under the per-order cookie name', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true },
        } as never);

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(hashOrderNumber).mockReturnValue('hash123');
        mockParse.mockResolvedValue(null);

        const { createCookie } = await import('@/lib/cookie-utils.server');

        await callAction({ request: mockRequest, context: mockContext });

        expect(createCookie).toHaveBeenCalledWith('glo_order_hash123', expect.anything(), mockContext);
    });

    it('should return 401 when order state is invalid', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true },
        } as never);

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        mockParse.mockResolvedValue('invalid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue(null);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(401);
        expect(result.data).toEqual({
            ok: false,
            code: ErrorCode.NOT_AUTHORIZED,
            message: 'Unauthorized',
        });
    });

    it('should return 401 when order-state cookie exists but is not yet verified', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true },
        } as never);

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(hashOrderNumber).mockReturnValue('hash123');
        mockParse.mockResolvedValue('valid-order-state');
        // The cookie signature/siteId/TTL all check out, but the OTP has not been verified yet —
        // the same cookie name is now written (unverified) right after the code is requested, so
        // mere presence of a valid signed cookie is no longer sufficient to authorize data access.
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: false,
            verifiedCode: null,
            attempts: 0,
        });

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(401);
        expect(result.data).toEqual({
            ok: false,
            code: ErrorCode.NOT_AUTHORIZED,
            message: 'Unauthorized',
        });
    });

    it('should return 401 when order state is for different siteId', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true },
        } as never);

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        mockParse.mockResolvedValue('valid-order-state');
        // verifyOrderState returns null for cross-site replays
        vi.mocked(verifyOrderState).mockReturnValue(null);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(401);
        expect((result.data as { ok: boolean }).ok).toBe(false);
    });

    it('should return 401 when the order state payload orderNumberHash does not match the requested order (defense-in-depth)', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true },
        } as never);

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(hashOrderNumber).mockReturnValue('hash123');
        mockParse.mockResolvedValue('valid-order-state');
        // Signature/siteId/TTL all check out and the state is verified, but the signed payload's
        // own orderNumberHash was issued for a different order than the one the cookie name
        // claims — the defense-in-depth check must still reject this.
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'a-different-order-hash',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(401);
        expect(result.data).toEqual({
            ok: false,
            code: ErrorCode.NOT_AUTHORIZED,
            message: 'Unauthorized',
        });
    });

    it('should return 400 when order number validation fails', async () => {
        mockRequest = createFormRequest({
            orderNumber: 'invalid',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: false, error: 'Invalid format' } as never);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(400);
        expect(result.data).toEqual({
            ok: false,
            code: 'VALIDATION',
            message: 'Invalid order number format',
        });
    });

    it('should return 400 when email validation fails', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'invalid-email',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(parseEmail).mockReturnValue({ ok: false, error: 'Invalid format' } as never);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(400);
        expect(result.data).toEqual({
            ok: false,
            code: 'VALIDATION',
            message: 'Invalid email format',
        });
    });

    it('should return 401 (NOT_AUTHORIZED) when the order-state cookie has no verifiedCode', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(hashOrderNumber).mockReturnValue('hash123');
        // Verified, but no verifiedCode captured — shouldn't be reachable in practice (verify
        // always sets verifiedCode alongside verified: true), but the action must not proceed to
        // SCAPI with a missing code.
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: null,
            attempts: 0,
        });

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(401);
        expect(result.data).toEqual({
            ok: false,
            code: ErrorCode.NOT_AUTHORIZED,
            message: 'Unauthorized',
        });
        expect(guestOrderLookup).not.toHaveBeenCalled();
    });

    it('should return redacted order on success with Cache-Control: no-store', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        const mockOrder = {
            orderNo: '12345',
            customerInfo: { email: 'test@example.com' },
        };

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: ['orderNo', 'customerInfo.email'] },
        } as never);

        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(parseEmail).mockReturnValue({ ok: true, value: 'test@example.com' } as never);

        vi.mocked(guestOrderLookup).mockResolvedValue({
            ok: true,
            order: mockOrder,
        } as never);

        vi.mocked(redactOrder).mockReturnValue(mockOrder);
        vi.mocked(fetchGuestOrderProducts).mockResolvedValue({});

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;
        const headers = new Headers(result.init?.headers);

        expect(headers.get('Cache-Control')).toBe('no-store');
        expect(result.data).toEqual({
            ok: true,
            order: mockOrder,
            omsMetaData: mockOmsMetaData,
            productsById: {},
        });

        expect(redactOrder).toHaveBeenCalledWith(mockOrder, ['orderNo', 'customerInfo.email']);
        // The code passed to SCAPI comes from the verified order-state cookie, never a
        // client-submitted form field.
        expect(guestOrderLookup).toHaveBeenCalledWith(
            expect.objectContaining({ orderNo: '12345', accessCode: '123456' })
        );
    });

    it('should fetch product data only for productItems that survived redaction', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        const rawOrder = {
            orderNo: '12345',
            customerInfo: { email: 'test@example.com' },
            productItems: [{ productId: 'raw-only-product' }],
        };

        const redactedOrderWithProducts = {
            orderNo: '12345',
            productItems: [{ productId: 'product-1' }, { productId: 'product-2' }],
        };

        const mockProductsById = {
            'product-1': { id: 'product-1', name: 'Product One' },
            'product-2': { id: 'product-2', name: 'Product Two' },
        };

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: {
                enabled: true,
                allowedFields: ['orderNo', 'productItems'],
            },
        } as never);

        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(parseEmail).mockReturnValue({ ok: true, value: 'test@example.com' } as never);

        vi.mocked(guestOrderLookup).mockResolvedValue({
            ok: true,
            order: rawOrder,
        } as never);

        vi.mocked(redactOrder).mockReturnValue(redactedOrderWithProducts as never);
        vi.mocked(fetchGuestOrderProducts).mockResolvedValue(mockProductsById as never);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        // Product fetch is driven by the redacted order's productIds, never the raw order's.
        expect(fetchGuestOrderProducts).toHaveBeenCalledWith(mockContext, ['product-1', 'product-2']);
        expect(result.data).toEqual({
            ok: true,
            order: redactedOrderWithProducts,
            omsMetaData: mockOmsMetaData,
            productsById: mockProductsById,
        });
    });

    it('should return INVALID_CODE for both a stale verifiedCode and no-such-order (enumeration defense)', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(parseEmail).mockReturnValue({ ok: true, value: 'test@example.com' } as never);

        vi.mocked(guestOrderLookup).mockResolvedValue({
            code: 'INVALID_CODE',
            status: 401,
        } as never);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(400);
        expect(result.data).toEqual({
            ok: false,
            code: 'INVALID_CODE',
            message: 'Invalid code',
        });
    });

    it('should return RATE_LIMITED with retryAfterSeconds', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(parseEmail).mockReturnValue({ ok: true, value: 'test@example.com' } as never);

        vi.mocked(guestOrderLookup).mockResolvedValue({
            code: ErrorCode.RATE_LIMITED,
            status: 429,
            retryAfterSeconds: 60,
        } as never);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(429);
        expect(result.data).toEqual({
            ok: false,
            code: ErrorCode.RATE_LIMITED,
            retryAfterSeconds: 60,
            message: 'Too many requests, please try again later',
        });
    });

    it('should return SCAPI_UNSUPPORTED when thrown by wrapper', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(parseEmail).mockReturnValue({ ok: true, value: 'test@example.com' } as never);

        const error = new Error('SCAPI method not supported');
        Object.assign(error, { code: ErrorCode.SCAPI_UNSUPPORTED });
        vi.mocked(guestOrderLookup).mockRejectedValue(error);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(501);
        expect(result.data).toEqual({
            ok: false,
            code: ErrorCode.SCAPI_UNSUPPORTED,
            message: 'Order lookup requires a newer API version',
        });
    });

    it('should return generic LOOKUP_FAILED for unknown errors', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(parseEmail).mockReturnValue({ ok: true, value: 'test@example.com' } as never);

        vi.mocked(guestOrderLookup).mockRejectedValue(new Error('Network error'));

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(500);
        expect(result.data).toEqual({
            ok: false,
            code: 'LOOKUP_FAILED',
            message: 'Unable to retrieve order',
        });
    });

    it('should never include OTP in response body', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        const mockOrder = {
            orderNo: '12345',
            customerInfo: { email: 'test@example.com' },
        };

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: ['orderNo'] },
        } as never);

        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(parseEmail).mockReturnValue({ ok: true, value: 'test@example.com' } as never);

        vi.mocked(guestOrderLookup).mockResolvedValue({
            ok: true,
            order: mockOrder,
        } as never);

        vi.mocked(redactOrder).mockReturnValue(mockOrder);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;
        const jsonString = JSON.stringify(result.data);

        // Verify OTP never appears in response
        expect(jsonString).not.toContain('123456');
    });
});
