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
import { action, type CancelOrderResponse } from './action.order-lookup-cancel';
import { ErrorCode } from '@/lib/error-codes';

type ActionContext = Parameters<typeof action>[0]['context'];
type ActionArgs = Parameters<typeof action>[0];
type DataResult = { init?: ResponseInit; data: CancelOrderResponse };

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
    cancelGuestOrder: vi.fn(),
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
}));

const { getConfig } = await import('@salesforce/storefront-next-runtime/config');
const { parseOrderNumber, parseEmail } = await import('@/lib/order/lookup/validation');
const { cancelGuestOrder } = await import('@/lib/order/scapi.server');
const { verifyOrderState, hashOrderNumber } = await import('@/lib/order/session.server');
const { redactOrder } = await import('@/lib/order/redact');

function callAction(args: { request: Request; context: ActionContext; params?: Record<string, string> }) {
    return action({ request: args.request, context: args.context, params: args.params ?? {} } as unknown as ActionArgs);
}

describe('action.order-lookup-cancel', () => {
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

        return new Request('https://example.com/action/order-lookup-cancel', {
            method: 'POST',
            body: formData,
        });
    }

    it('should return 405 when method is not POST', async () => {
        mockRequest = new Request('https://example.com/action/order-lookup-cancel', { method: 'GET' });

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(405);
        expect(result.data).toEqual({
            success: false,
            error: { kind: 'transient', status: 405 },
        });
    });

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
            success: false,
            error: { kind: 'not_found', status: 404 },
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

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        mockParse.mockResolvedValue(null);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(401);
        expect(result.data).toEqual({
            success: false,
            error: { kind: 'not_found', status: 401 },
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
            success: false,
            error: { kind: 'not_found', status: 401 },
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
            success: false,
            error: { kind: 'not_found', status: 401 },
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

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: false, error: 'Invalid format' } as never);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(400);
        expect(result.data).toEqual({
            success: false,
            error: { kind: 'invalid_input', status: 400 },
        });
    });

    it('should return 401 when the order state payload orderNumberHash does not match the requested order (defense-in-depth)', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(hashOrderNumber).mockReturnValue('hash123');
        mockParse.mockResolvedValue('valid-order-state');
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
            success: false,
            error: { kind: 'not_found', status: 401 },
        });
        // Must not have called cancelGuestOrder — the mismatch must be rejected before SCAPI call
        expect(cancelGuestOrder).not.toHaveBeenCalled();
    });

    it('should return 400 when email validation fails', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'invalid-email',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(hashOrderNumber).mockReturnValue('hash123');
        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseEmail).mockReturnValue({ ok: false, error: 'Invalid format' } as never);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(400);
        expect(result.data).toEqual({
            success: false,
            error: { kind: 'invalid_input', status: 400 },
        });
    });

    it('should return redacted order on success with Cache-Control: no-store', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        const mockOrder = {
            orderNo: '12345',
            status: 'cancelled',
            customerInfo: { email: 'test@example.com' },
        };

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: ['orderNo', 'customerInfo.email'] },
        } as never);

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(hashOrderNumber).mockReturnValue('hash123');
        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseEmail).mockReturnValue({ ok: true, value: 'test@example.com' } as never);

        vi.mocked(cancelGuestOrder).mockResolvedValue({
            ok: true,
            order: mockOrder,
        } as never);

        vi.mocked(redactOrder).mockReturnValue(mockOrder as never);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;
        const headers = new Headers(result.init?.headers);

        expect(headers.get('Cache-Control')).toBe('no-store');
        expect(result.data).toEqual({
            success: true,
            order: mockOrder,
            omsMetaData: mockOmsMetaData,
        });

        expect(cancelGuestOrder).toHaveBeenCalledWith({
            orderNo: '12345',
            reason: undefined,
            context: mockContext,
        });
        expect(redactOrder).toHaveBeenCalledWith(mockOrder, ['orderNo', 'customerInfo.email']);
    });

    it('should return 409 for CANCEL_CONFLICT', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(hashOrderNumber).mockReturnValue('hash123');
        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseEmail).mockReturnValue({ ok: true, value: 'test@example.com' } as never);

        vi.mocked(cancelGuestOrder).mockResolvedValue({
            ok: false,
            code: 'CANCEL_CONFLICT',
            status: 409,
        } as never);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(409);
        expect(result.data).toEqual({
            success: false,
            error: { kind: 'not_cancellable', status: 409 },
        });
    });

    it('should return 400 for CANCEL_INVALID_REASON', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(hashOrderNumber).mockReturnValue('hash123');
        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseEmail).mockReturnValue({ ok: true, value: 'test@example.com' } as never);

        vi.mocked(cancelGuestOrder).mockResolvedValue({
            ok: false,
            code: 'CANCEL_INVALID_REASON',
            status: 400,
        } as never);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(400);
        expect(result.data).toEqual({
            success: false,
            error: { kind: 'invalid_reason', status: 400 },
        });
    });

    it('should return 404 for LOOKUP_FAILED without leaking existence details', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(hashOrderNumber).mockReturnValue('hash123');
        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseEmail).mockReturnValue({ ok: true, value: 'test@example.com' } as never);

        vi.mocked(cancelGuestOrder).mockResolvedValue({
            ok: false,
            code: 'LOOKUP_FAILED',
            status: 404,
        } as never);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(404);
        expect(result.data).toEqual({
            success: false,
            error: { kind: 'not_found', status: 404 },
        });
    });

    it('should return 500 for generic CANCEL_FAILED', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(hashOrderNumber).mockReturnValue('hash123');
        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseEmail).mockReturnValue({ ok: true, value: 'test@example.com' } as never);

        vi.mocked(cancelGuestOrder).mockResolvedValue({
            ok: false,
            code: 'CANCEL_FAILED',
            status: 500,
        } as never);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(500);
        expect(result.data).toEqual({
            success: false,
            error: { kind: 'transient', status: 500 },
        });
    });

    it('should return 501 when SCAPI_UNSUPPORTED is thrown by wrapper', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(hashOrderNumber).mockReturnValue('hash123');
        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseEmail).mockReturnValue({ ok: true, value: 'test@example.com' } as never);

        const error = new Error('SCAPI method not supported');
        Object.assign(error, { code: ErrorCode.SCAPI_UNSUPPORTED });
        vi.mocked(cancelGuestOrder).mockRejectedValue(error);

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(501);
        expect(result.data).toEqual({
            success: false,
            error: { kind: 'transient', status: 501 },
        });
    });

    it('should return 500 for unknown thrown errors', async () => {
        mockRequest = createFormRequest({
            orderNumber: '12345',
            email: 'test@example.com',
        });

        vi.mocked(getConfig).mockReturnValue({
            guestOrderLookup: { enabled: true, allowedFields: [] },
        } as never);

        vi.mocked(parseOrderNumber).mockReturnValue({ ok: true, value: '12345' } as never);
        vi.mocked(hashOrderNumber).mockReturnValue('hash123');
        mockParse.mockResolvedValue('valid-order-state');
        vi.mocked(verifyOrderState).mockReturnValue({
            siteId: 'RefArch',
            orderNumberHash: 'hash123',
            issuedAt: Date.now(),
            verified: true,
            verifiedCode: '123456',
            attempts: 0,
        });

        vi.mocked(parseEmail).mockReturnValue({ ok: true, value: 'test@example.com' } as never);

        vi.mocked(cancelGuestOrder).mockRejectedValue(new Error('Network error'));

        const result = (await callAction({ request: mockRequest, context: mockContext })) as DataResult;

        expect(result.init?.status).toBe(500);
        expect(result.data).toEqual({
            success: false,
            error: { kind: 'transient', status: 500 },
        });
    });
});
