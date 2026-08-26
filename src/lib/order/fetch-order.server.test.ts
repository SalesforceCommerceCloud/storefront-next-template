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
import { fetchGuestOrderResult } from './fetch-order.server';
import { ErrorCode } from '@/lib/error-codes';

vi.mock('./scapi.server', () => ({
    guestOrderLookup: vi.fn(),
}));

vi.mock('./redact', () => ({
    redactOrder: vi.fn((order: unknown) => order),
}));

vi.mock('@/lib/api/order.server', () => ({
    fetchGuestOrderProducts: vi.fn(() => Promise.resolve({})),
    fetchOmsMetaData: vi.fn(() => Promise.resolve({ omsActive: false, cancelReasonCodes: [], returnReasonCodes: [] })),
}));

vi.mock('@/lib/turnstile/log-redact.server', () => ({
    redactEmailForLog: vi.fn((email: string) => `${email[0]}***@example.com`),
}));

const { guestOrderLookup } = await import('./scapi.server');
const { redactOrder } = await import('./redact');
const { fetchGuestOrderProducts, fetchOmsMetaData } = await import('@/lib/api/order.server');

function baseArgs(overrides: Partial<Parameters<typeof fetchGuestOrderResult>[0]> = {}) {
    return {
        orderNumber: 'ORDER12345',
        email: 'test@example.com',
        code: '123456',
        allowedFields: [],
        context: {} as never,
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        actionName: 'test',
        ...overrides,
    };
}

describe('fetchGuestOrderResult', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the redacted order and products on success', async () => {
        vi.mocked(guestOrderLookup).mockResolvedValue({
            ok: true,
            order: { orderNo: 'ORDER12345', productItems: [{ productId: 'p1' }] },
        } as never);
        vi.mocked(fetchGuestOrderProducts).mockResolvedValue({ p1: { id: 'p1' } } as never);

        const result = await fetchGuestOrderResult(baseArgs());

        expect(result).toEqual({
            ok: true,
            order: { orderNo: 'ORDER12345', productItems: [{ productId: 'p1' }] },
            omsMetaData: { omsActive: false, cancelReasonCodes: [], returnReasonCodes: [] },
            productsById: { p1: { id: 'p1' } },
        });
        expect(redactOrder).toHaveBeenCalledWith({ orderNo: 'ORDER12345', productItems: [{ productId: 'p1' }] }, []);
        expect(fetchGuestOrderProducts).toHaveBeenCalledWith(expect.anything(), ['p1']);
        expect(fetchOmsMetaData).toHaveBeenCalledWith(expect.anything());
    });

    it('only fetches products for productItems that survived redaction', async () => {
        vi.mocked(guestOrderLookup).mockResolvedValue({
            ok: true,
            order: { orderNo: 'ORDER12345', productItems: [{ productId: 'p1' }, { productId: 'p2' }] },
        } as never);
        vi.mocked(redactOrder).mockReturnValue({ productItems: [{ productId: 'p1' }] } as never);
        vi.mocked(fetchGuestOrderProducts).mockResolvedValue({} as never);

        await fetchGuestOrderResult(baseArgs());

        expect(fetchGuestOrderProducts).toHaveBeenCalledWith(expect.anything(), ['p1']);
    });

    it('maps INVALID_CODE from the SCAPI wrapper', async () => {
        vi.mocked(guestOrderLookup).mockResolvedValue({ ok: false, code: 'INVALID_CODE' } as never);

        const result = await fetchGuestOrderResult(baseArgs());

        expect(result).toEqual({ ok: false, code: 'INVALID_CODE', message: 'Invalid code' });
    });

    it('maps RATE_LIMITED with retryAfterSeconds from the SCAPI wrapper', async () => {
        vi.mocked(guestOrderLookup).mockResolvedValue({
            ok: false,
            code: ErrorCode.RATE_LIMITED,
            retryAfterSeconds: 42,
        } as never);

        const result = await fetchGuestOrderResult(baseArgs());

        expect(result).toEqual({
            ok: false,
            code: ErrorCode.RATE_LIMITED,
            retryAfterSeconds: 42,
            message: 'Too many requests, please try again later',
        });
    });

    it('maps a generic SCAPI wrapper error to LOOKUP_FAILED without leaking details', async () => {
        vi.mocked(guestOrderLookup).mockResolvedValue({
            ok: false,
            code: 'SOME_OTHER_ERROR',
            status: 500,
            requestId: 'req-1',
        } as never);

        const result = await fetchGuestOrderResult(baseArgs());

        expect(result).toEqual({ ok: false, code: 'LOOKUP_FAILED', message: 'Unable to retrieve order' });
    });

    it('maps a thrown SCAPI_UNSUPPORTED error', async () => {
        vi.mocked(guestOrderLookup).mockRejectedValue({ code: ErrorCode.SCAPI_UNSUPPORTED });

        const result = await fetchGuestOrderResult(baseArgs());

        expect(result).toEqual({
            ok: false,
            code: ErrorCode.SCAPI_UNSUPPORTED,
            message: 'Order lookup requires a newer API version',
        });
    });

    it('maps an unknown thrown error to LOOKUP_FAILED without leaking details', async () => {
        vi.mocked(guestOrderLookup).mockRejectedValue(new Error('unexpected boom'));

        const result = await fetchGuestOrderResult(baseArgs());

        expect(result).toEqual({ ok: false, code: 'LOOKUP_FAILED', message: 'Unable to retrieve order' });
    });
});
