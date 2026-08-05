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
import type { RouterContextProvider } from 'react-router';
import { requestOrderAccessCode, guestOrderLookup, cancelGuestOrder, returnGuestOrder } from './scapi.server';
import { ApiError } from '@/scapi';
import { ErrorCode } from '@/lib/error-codes';
import { createApiClients } from '@/lib/api-clients.server';

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(),
}));

describe('requestOrderAccessCode', () => {
    const mockShopperOrders = {
        requestOrderAccessCode: vi.fn(),
    };

    const mockContext = {} as unknown as RouterContextProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createApiClients).mockReturnValue({
            shopperOrders: mockShopperOrders,
        } as unknown as ReturnType<typeof createApiClients>);
    });

    it('throws SCAPI_UNSUPPORTED when method is missing (pre-26.8)', async () => {
        vi.mocked(createApiClients).mockReturnValue({
            shopperOrders: {},
        } as unknown as ReturnType<typeof createApiClients>);
        const contextWithoutMethod = {} as unknown as RouterContextProvider;

        await expect(
            requestOrderAccessCode({
                orderNo: 'ORDER-123',
                email: 'test@example.com',
                context: contextWithoutMethod,
            })
        ).rejects.toThrow('Guest order lookup requires SCAPI v26.8 or later');

        await expect(
            requestOrderAccessCode({
                orderNo: 'ORDER-123',
                email: 'test@example.com',
                context: contextWithoutMethod,
            })
        ).rejects.toMatchObject({ code: ErrorCode.SCAPI_UNSUPPORTED });
    });

    it('returns success on 2xx response', async () => {
        vi.mocked(mockShopperOrders.requestOrderAccessCode).mockResolvedValue({
            response: new Response(null, { status: 204 }),
            data: undefined,
        });

        const result = await requestOrderAccessCode({
            orderNo: 'ORDER-123',
            email: 'test@example.com',
            context: mockContext,
        });

        expect(result).toEqual({ ok: true });
        expect(mockShopperOrders.requestOrderAccessCode).toHaveBeenCalledWith({
            params: { path: { orderNo: 'ORDER-123' } },
            body: { email: 'test@example.com' },
        });
    });

    it('maps non-2xx response to REQUEST_CODE_FAILED', async () => {
        const headers = new Headers({ 'x-request-id': 'req-abc' });
        vi.mocked(mockShopperOrders.requestOrderAccessCode).mockResolvedValue({
            response: new Response(null, { status: 400, headers }),
            data: undefined,
        });

        const result = await requestOrderAccessCode({
            orderNo: 'ORDER-123',
            email: 'test@example.com',
            context: mockContext,
        });

        expect(result).toEqual({
            code: 'REQUEST_CODE_FAILED',
            status: 400,
            message: 'Failed to request order access code',
            requestId: 'req-abc',
        });
    });

    it('handles ApiError exceptions', async () => {
        const headers = new Headers({ 'x-request-id': 'req-xyz' });
        const apiError = new ApiError({
            url: 'https://api.example.com/orders/ORDER-123/actions/request-access-code',
            method: 'POST',
            status: 500,
            statusText: 'Internal Server Error',
            headers,
            body: { type: '', title: '', detail: '' },
            rawBody: '',
        });

        vi.mocked(mockShopperOrders.requestOrderAccessCode).mockRejectedValue(apiError);

        const result = await requestOrderAccessCode({
            orderNo: 'ORDER-123',
            email: 'test@example.com',
            context: mockContext,
        });

        expect(result).toEqual({
            code: 'REQUEST_CODE_FAILED',
            status: 500,
            message: 'Failed to request order access code',
            requestId: 'req-xyz',
        });
    });

    it('handles unknown exceptions', async () => {
        vi.mocked(mockShopperOrders.requestOrderAccessCode).mockRejectedValue(new Error('Network error'));

        const result = await requestOrderAccessCode({
            orderNo: 'ORDER-123',
            email: 'test@example.com',
            context: mockContext,
        });

        expect(result).toEqual({
            code: 'REQUEST_CODE_FAILED',
            status: 500,
            message: 'Network error',
        });
    });
});

describe('guestOrderLookup', () => {
    const mockShopperOrders = {
        guestOrderLookup: vi.fn(),
    };

    const mockContext = {} as unknown as RouterContextProvider;

    const mockOrder = {
        orderNo: 'ORDER-123',
        creationDate: '2026-07-01T00:00:00.000Z',
        customerInfo: {
            email: 'customer@example.com',
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createApiClients).mockReturnValue({
            shopperOrders: mockShopperOrders,
        } as unknown as ReturnType<typeof createApiClients>);
    });

    it('throws SCAPI_UNSUPPORTED when method is missing (pre-26.8)', async () => {
        vi.mocked(createApiClients).mockReturnValue({
            shopperOrders: {},
        } as unknown as ReturnType<typeof createApiClients>);
        const contextWithoutMethod = {} as unknown as RouterContextProvider;

        await expect(
            guestOrderLookup({
                orderNo: 'ORDER-123',
                email: 'test@example.com',
                accessCode: '123456',
                context: contextWithoutMethod,
            })
        ).rejects.toThrow('Guest order lookup requires SCAPI v26.8 or later');

        await expect(
            guestOrderLookup({
                orderNo: 'ORDER-123',
                email: 'test@example.com',
                accessCode: '123456',
                context: contextWithoutMethod,
            })
        ).rejects.toMatchObject({ code: ErrorCode.SCAPI_UNSUPPORTED });
    });

    it('returns success with order on 2xx response', async () => {
        vi.mocked(mockShopperOrders.guestOrderLookup).mockResolvedValue({
            response: new Response(JSON.stringify(mockOrder), { status: 200 }),
            data: mockOrder,
        });

        const result = await guestOrderLookup({
            orderNo: 'ORDER-123',
            email: 'customer@example.com',
            accessCode: '123456',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: true,
            order: mockOrder,
        });
        expect(mockShopperOrders.guestOrderLookup).toHaveBeenCalledWith({
            params: {
                path: { orderNo: 'ORDER-123' },
                query: { expand: ['oms', 'oms_shipments'] },
            },
            body: {
                email: 'customer@example.com',
                orderViewCode: '123456',
            },
        });
    });

    it('maps 403 response to INVALID_CODE', async () => {
        const headers = new Headers({ 'x-request-id': 'req-forbidden' });
        vi.mocked(mockShopperOrders.guestOrderLookup).mockResolvedValue({
            response: new Response(null, { status: 403, headers }),
            data: undefined,
        });

        const result = await guestOrderLookup({
            orderNo: 'ORDER-123',
            email: 'customer@example.com',
            accessCode: 'wrong-code',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'INVALID_CODE',
            status: 403,
            requestId: 'req-forbidden',
        });
    });

    it('maps 401 response to INVALID_CODE', async () => {
        const headers = new Headers({ 'x-request-id': 'req-unauthorized' });
        vi.mocked(mockShopperOrders.guestOrderLookup).mockResolvedValue({
            response: new Response(null, { status: 401, headers }),
            data: undefined,
        });

        const result = await guestOrderLookup({
            orderNo: 'ORDER-123',
            email: 'customer@example.com',
            accessCode: 'expired-code',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'INVALID_CODE',
            status: 401,
            requestId: 'req-unauthorized',
        });
    });

    it('maps 429 response to RATE_LIMITED with retry-after', async () => {
        const headers = new Headers({
            'x-request-id': 'req-throttled',
            'retry-after': '60',
        });
        vi.mocked(mockShopperOrders.guestOrderLookup).mockResolvedValue({
            response: new Response(null, { status: 429, headers }),
            data: undefined,
        });

        const result = await guestOrderLookup({
            orderNo: 'ORDER-123',
            email: 'customer@example.com',
            accessCode: '123456',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: ErrorCode.RATE_LIMITED,
            status: 429,
            retryAfterSeconds: 60,
            requestId: 'req-throttled',
        });
    });

    it('parses an HTTP-date retry-after header into seconds', async () => {
        const futureDate = new Date(Date.now() + 30_000).toUTCString();
        const headers = new Headers({
            'x-request-id': 'req-throttled-date',
            'retry-after': futureDate,
        });
        vi.mocked(mockShopperOrders.guestOrderLookup).mockResolvedValue({
            response: new Response(null, { status: 429, headers }),
            data: undefined,
        });

        const result = await guestOrderLookup({
            orderNo: 'ORDER-123',
            email: 'customer@example.com',
            accessCode: '123456',
            context: mockContext,
        });

        expect(result.ok).toBe(false);
        expect((result as { retryAfterSeconds?: number }).retryAfterSeconds).toBeCloseTo(30, -1);
    });

    it('omits retryAfterSeconds for an unparseable retry-after header', async () => {
        const headers = new Headers({
            'x-request-id': 'req-throttled-bad',
            'retry-after': 'not-a-valid-value',
        });
        vi.mocked(mockShopperOrders.guestOrderLookup).mockResolvedValue({
            response: new Response(null, { status: 429, headers }),
            data: undefined,
        });

        const result = await guestOrderLookup({
            orderNo: 'ORDER-123',
            email: 'customer@example.com',
            accessCode: '123456',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: ErrorCode.RATE_LIMITED,
            status: 429,
            requestId: 'req-throttled-bad',
        });
    });

    it('maps other 4xx/5xx to LOOKUP_FAILED', async () => {
        const headers = new Headers({ 'x-request-id': 'req-error' });
        vi.mocked(mockShopperOrders.guestOrderLookup).mockResolvedValue({
            response: new Response(null, { status: 500, headers }),
            data: undefined,
        });

        const result = await guestOrderLookup({
            orderNo: 'ORDER-123',
            email: 'customer@example.com',
            accessCode: '123456',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'LOOKUP_FAILED',
            status: 500,
            requestId: 'req-error',
        });
    });

    it('handles ApiError with 403', async () => {
        const headers = new Headers({ 'x-request-id': 'req-api-forbidden' });
        const apiError = new ApiError({
            url: 'https://api.example.com/orders/ORDER-123/lookup',
            method: 'POST',
            status: 403,
            statusText: 'Forbidden',
            headers,
            body: { type: '', title: '', detail: '' },
            rawBody: '',
        });

        vi.mocked(mockShopperOrders.guestOrderLookup).mockRejectedValue(apiError);

        const result = await guestOrderLookup({
            orderNo: 'ORDER-123',
            email: 'customer@example.com',
            accessCode: 'bad-code',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'INVALID_CODE',
            status: 403,
            requestId: 'req-api-forbidden',
        });
    });

    it('handles ApiError with 429', async () => {
        const headers = new Headers({ 'x-request-id': 'req-api-throttled', 'retry-after': '15' });
        const apiError = new ApiError({
            url: 'https://api.example.com/orders/ORDER-123/lookup',
            method: 'POST',
            status: 429,
            statusText: 'Too Many Requests',
            headers,
            body: { type: '', title: '', detail: '' },
            rawBody: '',
        });

        vi.mocked(mockShopperOrders.guestOrderLookup).mockRejectedValue(apiError);

        const result = await guestOrderLookup({
            orderNo: 'ORDER-123',
            email: 'customer@example.com',
            accessCode: '123456',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: ErrorCode.RATE_LIMITED,
            status: 429,
            retryAfterSeconds: 15,
            requestId: 'req-api-throttled',
        });
    });

    it('handles unknown exceptions', async () => {
        vi.mocked(mockShopperOrders.guestOrderLookup).mockRejectedValue(new Error('Connection timeout'));

        const result = await guestOrderLookup({
            orderNo: 'ORDER-123',
            email: 'customer@example.com',
            accessCode: '123456',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'LOOKUP_FAILED',
            status: 500,
            message: 'Connection timeout',
        });
    });
});

describe('cancelGuestOrder', () => {
    const mockShopperOrders = {
        cancelOmsOrder: vi.fn(),
    };

    const mockContext = {} as unknown as RouterContextProvider;

    const mockOrder = {
        orderNo: 'ORDER-123',
        status: 'cancelled',
        creationDate: '2026-07-01T00:00:00.000Z',
        customerInfo: {
            email: 'customer@example.com',
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createApiClients).mockReturnValue({
            shopperOrders: mockShopperOrders,
        } as unknown as ReturnType<typeof createApiClients>);
    });

    it('throws SCAPI_UNSUPPORTED when method is missing (pre-26.8)', async () => {
        vi.mocked(createApiClients).mockReturnValue({
            shopperOrders: {},
        } as unknown as ReturnType<typeof createApiClients>);
        const contextWithoutMethod = {} as unknown as RouterContextProvider;

        await expect(
            cancelGuestOrder({
                orderNo: 'ORDER-123',
                context: contextWithoutMethod,
            })
        ).rejects.toThrow('Guest order cancellation requires SCAPI v26.8 or later');

        await expect(
            cancelGuestOrder({
                orderNo: 'ORDER-123',
                context: contextWithoutMethod,
            })
        ).rejects.toMatchObject({ code: ErrorCode.SCAPI_UNSUPPORTED });
    });

    it('returns success with order on 2xx response', async () => {
        vi.mocked(mockShopperOrders.cancelOmsOrder).mockResolvedValue({
            response: new Response(JSON.stringify(mockOrder), { status: 200 }),
            data: mockOrder,
        });

        const result = await cancelGuestOrder({
            orderNo: 'ORDER-123',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: true,
            order: mockOrder,
        });
        expect(mockShopperOrders.cancelOmsOrder).toHaveBeenCalledWith({
            params: { path: { orderNo: 'ORDER-123' } },
            body: {},
        });
    });

    it('forwards an optional reason in the request body', async () => {
        vi.mocked(mockShopperOrders.cancelOmsOrder).mockResolvedValue({
            response: new Response(JSON.stringify(mockOrder), { status: 200 }),
            data: mockOrder,
        });

        await cancelGuestOrder({
            orderNo: 'ORDER-123',
            reason: 'Changed my mind',
            context: mockContext,
        });

        expect(mockShopperOrders.cancelOmsOrder).toHaveBeenCalledWith({
            params: { path: { orderNo: 'ORDER-123' } },
            body: { reason: 'Changed my mind' },
        });
    });

    it('maps 400 response to CANCEL_INVALID_REASON', async () => {
        const headers = new Headers({ 'x-request-id': 'req-bad-reason' });
        vi.mocked(mockShopperOrders.cancelOmsOrder).mockResolvedValue({
            response: new Response(null, { status: 400, headers }),
            data: undefined,
        });

        const result = await cancelGuestOrder({
            orderNo: 'ORDER-123',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'CANCEL_INVALID_REASON',
            status: 400,
            requestId: 'req-bad-reason',
        });
    });

    it('maps 404 response to LOOKUP_FAILED', async () => {
        const headers = new Headers({ 'x-request-id': 'req-not-found' });
        vi.mocked(mockShopperOrders.cancelOmsOrder).mockResolvedValue({
            response: new Response(null, { status: 404, headers }),
            data: undefined,
        });

        const result = await cancelGuestOrder({
            orderNo: 'ORDER-123',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'LOOKUP_FAILED',
            status: 404,
            requestId: 'req-not-found',
        });
    });

    it('maps 409 response to CANCEL_CONFLICT', async () => {
        const headers = new Headers({ 'x-request-id': 'req-conflict' });
        vi.mocked(mockShopperOrders.cancelOmsOrder).mockResolvedValue({
            response: new Response(null, { status: 409, headers }),
            data: undefined,
        });

        const result = await cancelGuestOrder({
            orderNo: 'ORDER-123',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'CANCEL_CONFLICT',
            status: 409,
            requestId: 'req-conflict',
        });
    });

    it('maps other 4xx/5xx to CANCEL_FAILED', async () => {
        const headers = new Headers({ 'x-request-id': 'req-error' });
        vi.mocked(mockShopperOrders.cancelOmsOrder).mockResolvedValue({
            response: new Response(null, { status: 500, headers }),
            data: undefined,
        });

        const result = await cancelGuestOrder({
            orderNo: 'ORDER-123',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'CANCEL_FAILED',
            status: 500,
            requestId: 'req-error',
        });
    });

    it('handles ApiError with 400', async () => {
        const headers = new Headers({ 'x-request-id': 'req-api-bad-reason' });
        const apiError = new ApiError({
            url: 'https://api.example.com/orders/ORDER-123/actions/oms-cancel-order',
            method: 'POST',
            status: 400,
            statusText: 'Bad Request',
            headers,
            body: { type: '', title: '', detail: '' },
            rawBody: '',
        });

        vi.mocked(mockShopperOrders.cancelOmsOrder).mockRejectedValue(apiError);

        const result = await cancelGuestOrder({
            orderNo: 'ORDER-123',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'CANCEL_INVALID_REASON',
            status: 400,
            requestId: 'req-api-bad-reason',
        });
    });

    it('handles ApiError with 404', async () => {
        const headers = new Headers({ 'x-request-id': 'req-api-not-found' });
        const apiError = new ApiError({
            url: 'https://api.example.com/orders/ORDER-123/actions/oms-cancel-order',
            method: 'POST',
            status: 404,
            statusText: 'Not Found',
            headers,
            body: { type: '', title: '', detail: '' },
            rawBody: '',
        });

        vi.mocked(mockShopperOrders.cancelOmsOrder).mockRejectedValue(apiError);

        const result = await cancelGuestOrder({
            orderNo: 'ORDER-123',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'LOOKUP_FAILED',
            status: 404,
            requestId: 'req-api-not-found',
        });
    });

    it('handles ApiError with 409', async () => {
        const headers = new Headers({ 'x-request-id': 'req-api-conflict' });
        const apiError = new ApiError({
            url: 'https://api.example.com/orders/ORDER-123/actions/oms-cancel-order',
            method: 'POST',
            status: 409,
            statusText: 'Conflict',
            headers,
            body: { type: '', title: '', detail: '' },
            rawBody: '',
        });

        vi.mocked(mockShopperOrders.cancelOmsOrder).mockRejectedValue(apiError);

        const result = await cancelGuestOrder({
            orderNo: 'ORDER-123',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'CANCEL_CONFLICT',
            status: 409,
            requestId: 'req-api-conflict',
        });
    });

    it('handles ApiError with other status', async () => {
        const headers = new Headers({ 'x-request-id': 'req-api-error' });
        const apiError = new ApiError({
            url: 'https://api.example.com/orders/ORDER-123/actions/oms-cancel-order',
            method: 'POST',
            status: 500,
            statusText: 'Internal Server Error',
            headers,
            body: { type: '', title: '', detail: '' },
            rawBody: '',
        });

        vi.mocked(mockShopperOrders.cancelOmsOrder).mockRejectedValue(apiError);

        const result = await cancelGuestOrder({
            orderNo: 'ORDER-123',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'CANCEL_FAILED',
            status: 500,
            requestId: 'req-api-error',
        });
    });

    it('handles unknown exceptions', async () => {
        vi.mocked(mockShopperOrders.cancelOmsOrder).mockRejectedValue(new Error('Connection timeout'));

        const result = await cancelGuestOrder({
            orderNo: 'ORDER-123',
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'CANCEL_FAILED',
            status: 500,
            message: 'Connection timeout',
        });
    });
});

describe('returnGuestOrder', () => {
    const mockShopperOrders = {
        returnOmsOrder: vi.fn(),
    };

    const mockContext = {} as unknown as RouterContextProvider;

    const mockOrder = {
        orderNo: 'ORDER-123',
        status: 'completed',
        creationDate: '2026-07-01T00:00:00.000Z',
        customerInfo: {
            email: 'customer@example.com',
        },
    };

    const mockProductItems = [{ itemId: 'item-1', quantity: 1 }];

    function apiErrorFor(status: number, type: string, requestId: string): ApiError {
        return new ApiError({
            url: 'https://api.example.com/orders/ORDER-123/actions/oms-return-order',
            method: 'POST',
            status,
            statusText: 'Error',
            headers: new Headers({ 'x-request-id': requestId }),
            body: { type, title: '', detail: '' },
            rawBody: '',
        });
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createApiClients).mockReturnValue({
            shopperOrders: mockShopperOrders,
        } as unknown as ReturnType<typeof createApiClients>);
    });

    it('throws SCAPI_UNSUPPORTED when method is missing (pre-26.8)', async () => {
        vi.mocked(createApiClients).mockReturnValue({
            shopperOrders: {},
        } as unknown as ReturnType<typeof createApiClients>);
        const contextWithoutMethod = {} as unknown as RouterContextProvider;

        await expect(
            returnGuestOrder({
                orderNo: 'ORDER-123',
                productItems: mockProductItems,
                context: contextWithoutMethod,
            })
        ).rejects.toThrow('Guest order return requires SCAPI v26.8 or later');

        await expect(
            returnGuestOrder({
                orderNo: 'ORDER-123',
                productItems: mockProductItems,
                context: contextWithoutMethod,
            })
        ).rejects.toMatchObject({ code: ErrorCode.SCAPI_UNSUPPORTED });
    });

    it('returns success with order on 2xx response', async () => {
        vi.mocked(mockShopperOrders.returnOmsOrder).mockResolvedValue({
            response: new Response(JSON.stringify(mockOrder), { status: 200 }),
            data: mockOrder,
        });

        const result = await returnGuestOrder({
            orderNo: 'ORDER-123',
            productItems: mockProductItems,
            context: mockContext,
        });

        expect(result).toEqual({
            ok: true,
            order: mockOrder,
        });
        expect(mockShopperOrders.returnOmsOrder).toHaveBeenCalledWith({
            params: { path: { orderNo: 'ORDER-123' } },
            body: { productItems: mockProductItems },
        });
    });

    it('returns RETURN_FAILED when no data is returned on success', async () => {
        vi.mocked(mockShopperOrders.returnOmsOrder).mockResolvedValue({
            response: new Response(null, { status: 200 }),
            data: undefined,
        });

        const result = await returnGuestOrder({
            orderNo: 'ORDER-123',
            productItems: mockProductItems,
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'RETURN_FAILED',
            status: 200,
            message: 'No order data returned',
        });
    });

    it('maps ApiError 400 InvalidReasonCode to RETURN_INVALID_REASON', async () => {
        vi.mocked(mockShopperOrders.returnOmsOrder).mockRejectedValue(
            apiErrorFor(400, 'InvalidReasonCode', 'req-invalid-reason')
        );

        const result = await returnGuestOrder({
            orderNo: 'ORDER-123',
            productItems: mockProductItems,
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'RETURN_INVALID_REASON',
            status: 400,
            requestId: 'req-invalid-reason',
        });
    });

    it('maps ApiError 400 UnknownProductItemIds to RETURN_UNKNOWN_ITEMS', async () => {
        vi.mocked(mockShopperOrders.returnOmsOrder).mockRejectedValue(
            apiErrorFor(400, 'UnknownProductItemIds', 'req-unknown-items')
        );

        const result = await returnGuestOrder({
            orderNo: 'ORDER-123',
            productItems: mockProductItems,
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'RETURN_UNKNOWN_ITEMS',
            status: 400,
            requestId: 'req-unknown-items',
        });
    });

    it('maps ApiError 400 ReturnQuantityExceeded to RETURN_QUANTITY_EXCEEDED', async () => {
        vi.mocked(mockShopperOrders.returnOmsOrder).mockRejectedValue(
            apiErrorFor(400, 'ReturnQuantityExceeded', 'req-qty-exceeded')
        );

        const result = await returnGuestOrder({
            orderNo: 'ORDER-123',
            productItems: mockProductItems,
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'RETURN_QUANTITY_EXCEEDED',
            status: 400,
            requestId: 'req-qty-exceeded',
        });
    });

    it('maps ApiError 400 with an unrecognized sub-code to RETURN_FAILED (transient)', async () => {
        vi.mocked(mockShopperOrders.returnOmsOrder).mockRejectedValue(
            apiErrorFor(400, 'OrderReturnFailed', 'req-unrecognized')
        );

        const result = await returnGuestOrder({
            orderNo: 'ORDER-123',
            productItems: mockProductItems,
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'RETURN_FAILED',
            status: 400,
            requestId: 'req-unrecognized',
        });
    });

    it('maps ApiError 404 to LOOKUP_FAILED', async () => {
        vi.mocked(mockShopperOrders.returnOmsOrder).mockRejectedValue(apiErrorFor(404, '', 'req-not-found'));

        const result = await returnGuestOrder({
            orderNo: 'ORDER-123',
            productItems: mockProductItems,
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'LOOKUP_FAILED',
            status: 404,
            requestId: 'req-not-found',
        });
    });

    it('maps ApiError 409 to RETURN_CONFLICT', async () => {
        vi.mocked(mockShopperOrders.returnOmsOrder).mockRejectedValue(apiErrorFor(409, '', 'req-conflict'));

        const result = await returnGuestOrder({
            orderNo: 'ORDER-123',
            productItems: mockProductItems,
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'RETURN_CONFLICT',
            status: 409,
            requestId: 'req-conflict',
        });
    });

    it('maps ApiError with other status to RETURN_FAILED', async () => {
        vi.mocked(mockShopperOrders.returnOmsOrder).mockRejectedValue(apiErrorFor(500, '', 'req-error'));

        const result = await returnGuestOrder({
            orderNo: 'ORDER-123',
            productItems: mockProductItems,
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'RETURN_FAILED',
            status: 500,
            requestId: 'req-error',
        });
    });

    it('handles unknown exceptions', async () => {
        vi.mocked(mockShopperOrders.returnOmsOrder).mockRejectedValue(new Error('Connection timeout'));

        const result = await returnGuestOrder({
            orderNo: 'ORDER-123',
            productItems: mockProductItems,
            context: mockContext,
        });

        expect(result).toEqual({
            ok: false,
            code: 'RETURN_FAILED',
            status: 500,
            message: 'Connection timeout',
        });
    });
});
