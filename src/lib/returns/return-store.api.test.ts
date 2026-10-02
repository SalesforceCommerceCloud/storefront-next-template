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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    advanceStatus,
    createReturn,
    getReturnsSnapshot,
    listReturns,
    resetReturnStoreForTests,
    subscribeToReturns,
} from './return-store';
import type { ReturnItem, ReturnRequest } from './types';

const item = (overrides: Partial<ReturnItem> = {}): ReturnItem => ({
    lineKey: 'l1',
    sku: 'sku-1',
    name: 'Polo',
    quantity: 1,
    orderedQuantity: 2,
    action: 'return',
    reason: 'too-small',
    ...overrides,
});

const request = (overrides: Partial<ReturnRequest> = {}): ReturnRequest => ({
    rmaNo: 'RMA-1',
    orderNo: 'O1',
    createdAt: '2026-10-01T00:00:00Z',
    status: 'submitted',
    history: [{ status: 'submitted', at: '2026-10-01T00:00:00Z' }],
    items: [item({ name: 'l1' })],
    ...overrides,
});

const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Subscribes the way the hook does, so the first load starts. */
const open = (listener = vi.fn()) => ({ listener, unsubscribe: subscribeToReturns(listener, 'api') });

describe('return-store (api backend)', () => {
    beforeEach(() => {
        resetReturnStoreForTests();
        window.localStorage.clear();
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    it('is not ready until the first load finishes, then shows what the server sent', async () => {
        fetchMock.mockImplementation(() => json({ returns: [request()] }));
        expect(getReturnsSnapshot('api').ready).toBe(false);

        const { listener, unsubscribe } = open();
        await flush();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('/resource/returns');
        expect(getReturnsSnapshot('api')).toMatchObject({ ready: true, returns: [{ rmaNo: 'RMA-1' }] });
        expect(listener).toHaveBeenCalled();
        unsubscribe();
    });

    it('does not read the browser store in api mode', async () => {
        window.localStorage.setItem('returns:v1', JSON.stringify([request({ rmaNo: 'LOCAL' })]));
        fetchMock.mockImplementation(() => json({ returns: [] }));
        const { unsubscribe } = open();
        await flush();
        expect(getReturnsSnapshot('api').returns).toEqual([]);
        unsubscribe();
    });

    it('loads once for many subscribers, and keeps the same snapshot object until data changes', async () => {
        fetchMock.mockImplementation(() => json({ returns: [request()] }));
        const a = open();
        const b = open();
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const snapshot = getReturnsSnapshot('api');
        expect(getReturnsSnapshot('api')).toBe(snapshot);
        a.unsubscribe();
        b.unsubscribe();
    });

    it('shows an empty list, not a skeleton forever, when the load fails, and retries on the next subscriber', async () => {
        fetchMock.mockImplementationOnce(() => json({ error: 'unavailable' }, 502));
        const first = open();
        await flush();
        expect(getReturnsSnapshot('api')).toMatchObject({ ready: true, returns: [] });
        first.unsubscribe();

        fetchMock.mockImplementation(() => json({ returns: [request()] }));
        const second = open();
        await flush();
        expect(getReturnsSnapshot('api').returns).toHaveLength(1);
        second.unsubscribe();
    });

    it('createReturn posts the selection with its idempotency key and adds the result', async () => {
        fetchMock.mockImplementation((url) =>
            url === '/resource/returns'
                ? json({ returns: [] })
                : json({ return: request({ rmaNo: 'RMA-9', items: [item({ name: 'l1' })] }) }, 201)
        );
        const { unsubscribe } = open();
        await flush();

        const created = await createReturn({ orderNo: 'O1', items: [item()], clientRequestId: 'req-1' });

        const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
        expect(url).toBe('/action/return-create');
        expect(JSON.parse(String(init?.body))).toMatchObject({ orderNo: 'O1', clientRequestId: 'req-1' });
        expect(created.rmaNo).toBe('RMA-9');
        expect(created.items[0].name).toBe('Polo'); // display name kept from what the shopper saw
        expect(getReturnsSnapshot('api').returns.map((r) => r.rmaNo)).toEqual(['RMA-9']);
        unsubscribe();
    });

    it('createReturn rejects when the server refuses, and saves nothing', async () => {
        fetchMock.mockImplementation((url) =>
            url === '/resource/returns' ? json({ returns: [] }) : json({ error: 'quantity-exceeded' }, 409)
        );
        const { unsubscribe } = open();
        await flush();
        await expect(createReturn({ orderNo: 'O1', items: [item()] })).rejects.toThrow(/409/);
        expect(getReturnsSnapshot('api').returns).toEqual([]);
        unsubscribe();
    });

    it('advanceStatus sends the status it saw and updates from the reply', async () => {
        const advanced = request({
            status: 'approved',
            history: [
                { status: 'submitted', at: 'a' },
                { status: 'approved', at: 'b' },
            ],
        });
        fetchMock.mockImplementation((url) =>
            url === '/resource/returns' ? json({ returns: [request()] }) : json({ return: advanced })
        );
        const { unsubscribe } = open();
        await flush();

        const result = await advanceStatus('RMA-1', 'submitted');

        const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
        expect(url).toBe('/action/return-advance');
        expect(JSON.parse(String(init?.body))).toEqual({ orderNo: 'O1', rmaNo: 'RMA-1', expectedStatus: 'submitted' });
        expect(result?.status).toBe('approved');
        expect(getReturnsSnapshot('api').returns[0].status).toBe('approved');
        unsubscribe();
    });

    it('never lets a slow, older reply overwrite a newer status (longest history wins)', async () => {
        const at = (n: number) => ({ status: 'submitted' as const, at: String(n) });
        const newerRecord = request({ status: 'received', history: [at(1), at(2), at(3)] });
        const olderRecord = request({ status: 'approved', history: [at(1), at(2)] });
        let call = 0;
        fetchMock.mockImplementation((url) => {
            if (url === '/resource/returns') return json({ returns: [request()] });
            call += 1;
            return json({ return: call === 1 ? newerRecord : olderRecord });
        });
        const { unsubscribe } = open();
        await flush();

        await advanceStatus('RMA-1', 'submitted'); // newer reply arrives first
        await advanceStatus('RMA-1', 'submitted'); // an older reply arrives last
        expect(getReturnsSnapshot('api').returns[0].status).toBe('received');
        unsubscribe();
    });

    it('advanceStatus on an unknown return does not call the server', async () => {
        fetchMock.mockImplementation(() => json({ returns: [] }));
        const { unsubscribe } = open();
        await flush();
        fetchMock.mockClear();
        expect(await advanceStatus('RMA-NOPE')).toBeUndefined();
        expect(fetchMock).not.toHaveBeenCalled();
        unsubscribe();
    });

    it('reads work through the async API in api mode', async () => {
        fetchMock.mockImplementation(() => json({ returns: [request()] }));
        const { unsubscribe } = open();
        await flush();
        expect((await listReturns()).map((r) => r.rmaNo)).toEqual(['RMA-1']);
        unsubscribe();
    });
});
