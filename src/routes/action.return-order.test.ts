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
import { ApiError } from '@/scapi';
import { action as actionImpl } from './action.return-order';

const createApiError = (status: number, type = '') =>
    new ApiError({
        status,
        statusText: 'Test Error',
        headers: new Headers(),
        body: { type, title: '', detail: '' },
        rawBody: JSON.stringify({ type }),
        url: 'https://api.example.com/orders/1/actions/oms-return-order',
        method: 'POST',
    });

const action = actionImpl as unknown as (args: {
    request: Request;
    context: never;
    params: object;
}) => Promise<Response>;

const returnOmsOrderMock = vi.fn();

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({
        shopperOrders: {
            returnOmsOrder: (...args: unknown[]) => returnOmsOrderMock(...args),
        },
    }),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

const buildRequest = (fields: Record<string, string>, method = 'POST'): Request => {
    if (method !== 'POST') {
        return new Request('https://example.com/action/return-order', { method });
    }
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
        body.set(key, value);
    }
    return new Request('https://example.com/action/return-order', {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
};

const items = (overrides?: unknown) =>
    JSON.stringify(overrides ?? [{ itemId: 'item-1', quantity: 2, reason: 'Defect' }]);

const run = (fields: Record<string, string>, method = 'POST') =>
    action({ request: buildRequest(fields, method), context: {} as never, params: {} });

beforeEach(() => {
    vi.clearAllMocks();
});

describe('action.return-order', () => {
    it('returns 405 for non-POST requests', async () => {
        const response = await run({}, 'GET');
        expect(response.status).toBe(405);
        expect(returnOmsOrderMock).not.toHaveBeenCalled();
    });

    it('returns 200 { success: true } on a successful return', async () => {
        returnOmsOrderMock.mockResolvedValue({ data: { orderNo: '1' } });
        const response = await run({ orderNo: '1', productItems: items() });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ success: true });
    });

    it('coerces quantity to a Number in the body sent to SCAPI', async () => {
        returnOmsOrderMock.mockResolvedValue({ data: {} });
        await run({
            orderNo: '1',
            productItems: JSON.stringify([{ itemId: 'item-1', quantity: '3', reason: 'Defect' }]),
        });
        expect(returnOmsOrderMock).toHaveBeenCalledWith({
            params: { path: { orderNo: '1' } },
            body: { productItems: [{ itemId: 'item-1', quantity: 3, reason: 'Defect' }] },
        });
    });

    it('omits reason when not provided in the row', async () => {
        returnOmsOrderMock.mockResolvedValue({ data: {} });
        await run({ orderNo: '1', productItems: JSON.stringify([{ itemId: 'item-1', quantity: 1 }]) });
        expect(returnOmsOrderMock).toHaveBeenCalledWith({
            params: { path: { orderNo: '1' } },
            body: { productItems: [{ itemId: 'item-1', quantity: 1 }] },
        });
    });

    describe('local invalid_input guards (no SCAPI call)', () => {
        it('rejects a missing orderNo', async () => {
            const response = await run({ productItems: items() });
            expect(response.status).toBe(400);
            await expect(response.json()).resolves.toEqual({ success: false, error: { kind: 'invalid_input' } });
            expect(returnOmsOrderMock).not.toHaveBeenCalled();
        });

        it('rejects a missing productItems field', async () => {
            const response = await run({ orderNo: '1' });
            expect(response.status).toBe(400);
            await expect(response.json()).resolves.toEqual({ success: false, error: { kind: 'invalid_input' } });
            expect(returnOmsOrderMock).not.toHaveBeenCalled();
        });

        it('rejects unparseable JSON', async () => {
            const response = await run({ orderNo: '1', productItems: '{not json' });
            expect(response.status).toBe(400);
            await expect(response.json()).resolves.toEqual({ success: false, error: { kind: 'invalid_input' } });
            expect(returnOmsOrderMock).not.toHaveBeenCalled();
        });

        it('rejects an empty array', async () => {
            const response = await run({ orderNo: '1', productItems: '[]' });
            expect(response.status).toBe(400);
            await expect(response.json()).resolves.toEqual({ success: false, error: { kind: 'invalid_input' } });
            expect(returnOmsOrderMock).not.toHaveBeenCalled();
        });

        it('rejects a non-array payload', async () => {
            const response = await run({ orderNo: '1', productItems: '{"itemId":"x"}' });
            expect(response.status).toBe(400);
            await expect(response.json()).resolves.toEqual({ success: false, error: { kind: 'invalid_input' } });
            expect(returnOmsOrderMock).not.toHaveBeenCalled();
        });

        // Per-item shape guards: a well-formed array can still carry rows that
        // can't satisfy the payload. Reject them locally so the reported kind is
        // `invalid_input`, not a misleading `transient` from a downstream SCAPI reject.
        const invalidRows: Array<[string, unknown]> = [
            ['an empty object row', [{}]],
            ['a missing itemId', [{ quantity: 1 }]],
            ['a blank itemId', [{ itemId: '', quantity: 1 }]],
            ['a non-string itemId', [{ itemId: 123, quantity: 1 }]],
            ['a NaN quantity from a garbage string', [{ itemId: 'item-1', quantity: 'abc' }]],
            ['a missing quantity', [{ itemId: 'item-1' }]],
            ['a zero quantity', [{ itemId: 'item-1', quantity: 0 }]],
            ['a negative quantity', [{ itemId: 'item-1', quantity: -2 }]],
            [
                'one bad row among good ones',
                [
                    { itemId: 'item-1', quantity: 1 },
                    { itemId: '', quantity: 2 },
                ],
            ],
        ];

        it.each(invalidRows)('rejects %s', async (_label, payload) => {
            const response = await run({ orderNo: '1', productItems: JSON.stringify(payload) });
            expect(response.status).toBe(400);
            await expect(response.json()).resolves.toEqual({ success: false, error: { kind: 'invalid_input' } });
            expect(returnOmsOrderMock).not.toHaveBeenCalled();
        });
    });

    describe('SCAPI error classification', () => {
        const cases: Array<[number, string, string]> = [
            [400, 'InvalidReasonCode', 'invalid_reason'],
            [400, 'UnknownProductItemIds', 'unknown_items'],
            [400, 'ReturnQuantityExceeded', 'quantity_exceeded'],
            [400, 'OrderReturnFailed', 'transient'],
            [400, '', 'transient'],
            [404, '', 'not_found'],
            [409, 'OrderReturnFailed', 'not_returnable'],
            [500, '', 'transient'],
        ];

        it.each(cases)('classifies %i / "%s" as %s', async (status, type, kind) => {
            returnOmsOrderMock.mockRejectedValue(createApiError(status, type));
            const response = await run({ orderNo: '1', productItems: items() });
            expect(response.status).toBe(status);
            await expect(response.json()).resolves.toEqual({ success: false, error: { kind, status } });
        });

        it('classifies a non-ApiError throw as transient with status 500', async () => {
            returnOmsOrderMock.mockRejectedValue(new Error('network down'));
            const response = await run({ orderNo: '1', productItems: items() });
            expect(response.status).toBe(500);
            await expect(response.json()).resolves.toEqual({
                success: false,
                error: { kind: 'transient', status: 500 },
            });
        });
    });
});
