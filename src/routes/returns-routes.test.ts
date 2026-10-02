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
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getAuth } from '@/middlewares/auth.server';
import { advanceReturnViaApi, createReturnViaApi, fetchCustomerReturns } from '@/lib/returns/returns-api.server';
import { loader as listLoader } from './resource.returns';
import { action as createAction } from './action.return-create';
import { action as advanceAction } from './action.return-advance';

vi.mock('@salesforce/storefront-next-runtime/config', () => ({ getConfig: vi.fn() }));
vi.mock('@/middlewares/auth.server', () => ({ getAuth: vi.fn() }));
vi.mock('@/lib/returns/returns-api.server', () => ({
    fetchCustomerReturns: vi.fn(),
    createReturnViaApi: vi.fn(),
    advanceReturnViaApi: vi.fn(),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const context = new RouterContextProvider();
const registered = { userType: 'registered', customerId: 'cust-1' };

const post = (body: unknown, method = 'POST') =>
    ({
        context,
        request: new Request('http://localhost/action/x', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: typeof body === 'string' ? body : JSON.stringify(body),
        }),
    }) as never;

const validCreate = {
    orderNo: 'O1',
    clientRequestId: 'req-1',
    items: [{ lineKey: 'a1', quantity: 1, action: 'return', reason: 'too-small', name: 'ignored', sku: 'ignored' }],
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockReturnValue({ features: { returnsCustomApi: true } } as never);
    vi.mocked(getAuth).mockReturnValue(registered as never);
});

describe('GET /resource/returns', () => {
    it('is a 404 while the custom API switch is off', async () => {
        vi.mocked(getConfig).mockReturnValue({ features: { returnsCustomApi: false } } as never);
        await expect(listLoader({ context } as never)).rejects.toMatchObject({ status: 404 });
    });

    it('gives guests an empty list without calling SFCC', async () => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest' } as never);
        const response = await listLoader({ context } as never);
        expect(await response.json()).toEqual({ returns: [] });
        expect(fetchCustomerReturns).not.toHaveBeenCalled();
    });

    it('returns the shopper returns, uncached', async () => {
        vi.mocked(fetchCustomerReturns).mockResolvedValue([{ rmaNo: 'RMA-1' }] as never);
        const response = await listLoader({ context } as never);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.json()).toEqual({ returns: [{ rmaNo: 'RMA-1' }] });
        expect(fetchCustomerReturns).toHaveBeenCalledWith(context, 'cust-1');
    });

    it('answers 502 when SFCC fails', async () => {
        vi.mocked(fetchCustomerReturns).mockRejectedValue(new Error('down'));
        expect((await listLoader({ context } as never)).status).toBe(502);
    });
});

describe('POST /action/return-create', () => {
    it('rejects other methods, a switched-off feature and guests', async () => {
        expect((await createAction(post(validCreate, 'PUT'))).status).toBe(405);
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest' } as never);
        expect((await createAction(post(validCreate))).status).toBe(401);
        vi.mocked(getConfig).mockReturnValue({ features: { returnsCustomApi: false } } as never);
        await expect(createAction(post(validCreate))).rejects.toMatchObject({ status: 404 });
    });

    it.each([
        ['not json', '{nope'],
        ['no order', { items: validCreate.items }],
        ['no items', { orderNo: 'O1', items: [] }],
        ['bad action', { orderNo: 'O1', items: [{ lineKey: 'a', quantity: 1, action: 'burn', reason: 'too-small' }] }],
        ['bad reason', { orderNo: 'O1', items: [{ lineKey: 'a', quantity: 1, action: 'return', reason: 'SIZE' }] }],
        [
            'text quantity',
            { orderNo: 'O1', items: [{ lineKey: 'a', quantity: '1', action: 'return', reason: 'too-small' }] },
        ],
    ])('answers 400 for %s, without calling the API', async (_name, body) => {
        expect((await createAction(post(body))).status).toBe(400);
        expect(createReturnViaApi).not.toHaveBeenCalled();
    });

    it('sends only the fields the API accepts and returns the created return', async () => {
        vi.mocked(createReturnViaApi).mockResolvedValue({ ok: true, value: { rmaNo: 'RMA-1' } as never });
        const response = await createAction(post(validCreate));

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({ return: { rmaNo: 'RMA-1' } });
        expect(createReturnViaApi).toHaveBeenCalledWith(context, 'O1', {
            clientRequestId: 'req-1',
            items: [{ itemId: 'a1', quantity: 1, action: 'return', reason: 'too-small' }],
        });
    });

    it('passes the API refusal status through', async () => {
        vi.mocked(createReturnViaApi).mockResolvedValue({ ok: false, status: 409, error: 'quantity-exceeded' });
        const response = await createAction(post(validCreate));
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'quantity-exceeded' });
    });
});

describe('POST /action/return-advance', () => {
    const valid = { orderNo: 'O1', rmaNo: 'RMA-1', expectedStatus: 'submitted' };

    it('rejects guests and bad input', async () => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest' } as never);
        expect((await advanceAction(post(valid))).status).toBe(401);
        vi.mocked(getAuth).mockReturnValue(registered as never);
        expect((await advanceAction(post({ ...valid, rmaNo: '' }))).status).toBe(400);
        expect((await advanceAction(post({ ...valid, expectedStatus: 'teleported' }))).status).toBe(400);
        expect((await advanceAction(post('{nope'))).status).toBe(400);
        expect(advanceReturnViaApi).not.toHaveBeenCalled();
    });

    it('advances and returns the updated return', async () => {
        vi.mocked(advanceReturnViaApi).mockResolvedValue({
            ok: true,
            value: { rmaNo: 'RMA-1', status: 'approved' } as never,
        });
        const response = await advanceAction(post(valid));
        expect(response.status).toBe(200);
        expect(advanceReturnViaApi).toHaveBeenCalledWith(context, 'O1', 'RMA-1', 'submitted');
    });

    it('allows an advance without expectedStatus and passes a 404 through', async () => {
        vi.mocked(advanceReturnViaApi).mockResolvedValue({ ok: false, status: 404, error: 'return-not-found' });
        const response = await advanceAction(post({ orderNo: 'O1', rmaNo: 'RMA-1' }));
        expect(response.status).toBe(404);
        expect(advanceReturnViaApi).toHaveBeenCalledWith(context, 'O1', 'RMA-1', undefined);
    });
});
