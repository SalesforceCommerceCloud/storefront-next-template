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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { ApiError } from '@/scapi';
import { advanceReturnViaApi, createReturnViaApi, fetchCustomerReturns } from './returns-api.server';

const getCustomerOrders = vi.fn();
const createReturn = vi.fn();
const advanceReturn = vi.fn();
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({ shopperCustomers: { getCustomerOrders }, returns: { createReturn, advanceReturn } }),
}));
const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
vi.mock('@/lib/logger.server', () => ({ getLogger: () => logger }));

const context = new RouterContextProvider();
const record = {
    rmaNo: 'RMA-1',
    status: 'submitted',
    items: [{ itemId: 'a1', quantity: 1, action: 'return', reason: 'too-small' }],
    history: [{ status: 'submitted', at: '2026-10-01T00:00:00Z' }],
    trackingNo: null,
};
const apiError = (status: number, title = 'rejected') =>
    new ApiError({
        status,
        statusText: 'x',
        headers: new Headers(),
        body: { type: '', title, detail: '' },
        rawBody: '',
        url: 'http://x',
        method: 'POST',
    });

beforeEach(() => {
    vi.clearAllMocks();
});

describe('fetchCustomerReturns', () => {
    it('reads c_returns from each order and joins the order lines', async () => {
        getCustomerOrders.mockResolvedValue({
            data: {
                data: [
                    {
                        orderNo: 'O1',
                        c_returns: JSON.stringify({ version: 1, returns: [record] }),
                        productItems: [{ itemId: 'a1', productId: 'DU-1', productName: 'Polo', quantity: 3 }],
                    },
                    { orderNo: 'O2', productItems: [] }, // no returns
                    { orderNo: 'O3', c_returns: '{broken', productItems: [] }, // damaged value is ignored
                ],
            },
        });

        const returns = await fetchCustomerReturns(context, 'cust-1');

        expect(returns).toHaveLength(1);
        expect(returns[0]).toMatchObject({
            rmaNo: 'RMA-1',
            orderNo: 'O1',
            items: [{ name: 'Polo', orderedQuantity: 3, sku: 'DU-1' }],
        });
        expect(getCustomerOrders.mock.calls[0][0].params.path.customerId).toBe('cust-1');
    });

    it('returns an empty list when there are no orders', async () => {
        getCustomerOrders.mockResolvedValue({ data: {} });
        expect(await fetchCustomerReturns(context, 'cust-1')).toEqual([]);
    });
});

describe('createReturnViaApi / advanceReturnViaApi', () => {
    const body = { items: [{ itemId: 'a1', quantity: 1, action: 'return' as const, reason: 'too-small' as const }] };

    it('returns the created return', async () => {
        createReturn.mockResolvedValue({ data: record });
        const result = await createReturnViaApi(context, 'O1', body);
        expect(result).toMatchObject({ ok: true, value: { rmaNo: 'RMA-1', orderNo: 'O1' } });
        expect(createReturn.mock.calls[0][0]).toMatchObject({ params: { path: { orderNo: 'O1' } }, body });
    });

    it.each([400, 404, 409])('passes a %s from the server rules through', async (status) => {
        createReturn.mockRejectedValue(apiError(status, 'quantity-exceeded'));
        expect(await createReturnViaApi(context, 'O1', body)).toEqual({
            ok: false,
            status,
            error: 'quantity-exceeded',
        });
    });

    it('turns a server failure or a network error into a 502 without leaking details', async () => {
        createReturn.mockRejectedValue(apiError(500, 'secret detail'));
        expect(await createReturnViaApi(context, 'O1', body)).toEqual({ ok: false, status: 502, error: 'unavailable' });
        createReturn.mockRejectedValue(new Error('ECONNRESET'));
        expect(await createReturnViaApi(context, 'O1', body)).toEqual({ ok: false, status: 502, error: 'unavailable' });
    });

    it('treats a record it cannot read as a failure instead of passing junk on', async () => {
        createReturn.mockResolvedValue({ data: { nope: true } });
        expect(await createReturnViaApi(context, 'O1', body)).toMatchObject({ ok: false, status: 502 });
    });

    it('advances a return', async () => {
        advanceReturn.mockResolvedValue({
            data: { ...record, status: 'approved', history: [...record.history, { status: 'approved', at: 'x' }] },
        });
        const result = await advanceReturnViaApi(context, 'O1', 'RMA-1', 'submitted');
        expect(result).toMatchObject({ ok: true, value: { status: 'approved' } });
        expect(advanceReturn.mock.calls[0][0]).toMatchObject({
            params: { path: { orderNo: 'O1', rmaNo: 'RMA-1' } },
            body: { expectedStatus: 'submitted' },
        });
    });
});
