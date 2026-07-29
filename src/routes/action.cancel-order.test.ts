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
import { action as actionImpl } from './action.cancel-order';

const createApiError = (status: number) =>
    new ApiError({
        status,
        statusText: 'Test Error',
        headers: new Headers(),
        body: { type: '', title: '', detail: '' },
        rawBody: JSON.stringify({ type: '' }),
        url: 'https://api.example.com/orders/1/actions/oms-cancel-order',
        method: 'POST',
    });

const action = actionImpl as unknown as (args: {
    request: Request;
    context: never;
    params: object;
}) => Promise<Response>;

const cancelOmsOrderMock = vi.fn();

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({
        shopperOrders: {
            cancelOmsOrder: (...args: unknown[]) => cancelOmsOrderMock(...args),
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
        return new Request('https://example.com/action/cancel-order', { method });
    }
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
        body.set(key, value);
    }
    return new Request('https://example.com/action/cancel-order', {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
};

const run = (fields: Record<string, string>, method = 'POST') =>
    action({ request: buildRequest(fields, method), context: {} as never, params: {} });

beforeEach(() => {
    vi.clearAllMocks();
});

describe('action.cancel-order', () => {
    it('returns 405 for non-POST requests', async () => {
        const response = await run({}, 'GET');
        expect(response.status).toBe(405);
        expect(cancelOmsOrderMock).not.toHaveBeenCalled();
    });

    it('returns 200 { success: true } on a successful cancel', async () => {
        cancelOmsOrderMock.mockResolvedValue({ data: { orderNo: '1' } });
        const response = await run({ orderNo: '1' });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ success: true });
    });

    it('passes reason to the body when provided', async () => {
        cancelOmsOrderMock.mockResolvedValue({ data: {} });
        await run({ orderNo: '1', reason: 'Out of stock' });
        expect(cancelOmsOrderMock).toHaveBeenCalledWith({
            params: { path: { orderNo: '1' } },
            body: { reason: 'Out of stock' },
        });
    });

    it('sends an empty body when reason is not provided', async () => {
        cancelOmsOrderMock.mockResolvedValue({ data: {} });
        await run({ orderNo: '1' });
        expect(cancelOmsOrderMock).toHaveBeenCalledWith({
            params: { path: { orderNo: '1' } },
            body: {},
        });
    });

    it('sends an empty body when reason is an empty string', async () => {
        cancelOmsOrderMock.mockResolvedValue({ data: {} });
        await run({ orderNo: '1', reason: '' });
        expect(cancelOmsOrderMock).toHaveBeenCalledWith({
            params: { path: { orderNo: '1' } },
            body: {},
        });
    });

    describe('local invalid_input guards (no SCAPI call)', () => {
        it('rejects a missing orderNo', async () => {
            const response = await run({});
            expect(response.status).toBe(400);
            await expect(response.json()).resolves.toEqual({
                success: false,
                error: { kind: 'invalid_input', status: 400 },
            });
            expect(cancelOmsOrderMock).not.toHaveBeenCalled();
        });

        it('rejects a blank orderNo', async () => {
            const response = await run({ orderNo: '' });
            expect(response.status).toBe(400);
            await expect(response.json()).resolves.toEqual({
                success: false,
                error: { kind: 'invalid_input', status: 400 },
            });
            expect(cancelOmsOrderMock).not.toHaveBeenCalled();
        });

        it('rejects a whitespace-only orderNo', async () => {
            const response = await run({ orderNo: '   ' });
            expect(response.status).toBe(400);
            await expect(response.json()).resolves.toEqual({
                success: false,
                error: { kind: 'invalid_input', status: 400 },
            });
            expect(cancelOmsOrderMock).not.toHaveBeenCalled();
        });
    });

    describe('SCAPI error classification', () => {
        const cases: Array<[number, string]> = [
            [400, 'invalid_reason'],
            [404, 'not_found'],
            [409, 'not_cancellable'],
            [500, 'transient'],
            [502, 'transient'],
            [503, 'transient'],
        ];

        it.each(cases)('classifies %i as %s', async (status, kind) => {
            cancelOmsOrderMock.mockRejectedValue(createApiError(status));
            const response = await run({ orderNo: '1' });
            expect(response.status).toBe(status);
            await expect(response.json()).resolves.toEqual({ success: false, error: { kind, status } });
        });

        it('classifies a non-ApiError throw as transient with status 500', async () => {
            cancelOmsOrderMock.mockRejectedValue(new Error('network down'));
            const response = await run({ orderNo: '1' });
            expect(response.status).toBe(500);
            await expect(response.json()).resolves.toEqual({
                success: false,
                error: { kind: 'transient', status: 500 },
            });
        });
    });
});
