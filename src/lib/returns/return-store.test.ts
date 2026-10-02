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
    RETURNS_STORAGE_KEY,
    advanceStatus,
    createReturn,
    getMockTrackingNo,
    getReturn,
    getReturnForOrder,
    getReturnsServerSnapshot,
    getReturnsSnapshot,
    listReturns,
    resetReturnStoreForTests,
    subscribeToReturns,
} from './return-store';
import type { ReturnItem } from './types';

const item = (overrides: Partial<ReturnItem> = {}): ReturnItem => ({
    lineKey: 'l1',
    sku: 'sku-1',
    name: 'Shirt',
    quantity: 1,
    orderedQuantity: 2,
    action: 'return',
    reason: 'too-small',
    ...overrides,
});

describe('return-store', () => {
    beforeEach(() => {
        window.localStorage.clear();
        resetReturnStoreForTests();
    });
    afterEach(() => vi.restoreAllMocks());

    it('creates a submitted request with an RMA number and persists it', async () => {
        const created = await createReturn({ orderNo: 'O1', items: [item()] });
        expect(created.rmaNo).toMatch(/^RMA-\d+$/);
        expect(created.status).toBe('submitted');
        expect(created.history).toHaveLength(1);

        resetReturnStoreForTests(); // simulate a page refresh
        expect(await getReturn(created.rmaNo)).toMatchObject({ orderNo: 'O1' });
        expect((await getReturnForOrder('O1'))?.rmaNo).toBe(created.rmaNo);
    });

    it('rejects an empty request and quantities above what is left, using the stored data', async () => {
        await expect(createReturn({ orderNo: 'O1', items: [] })).rejects.toThrow();
        await createReturn({ orderNo: 'O1', items: [item({ quantity: 2 })] });
        await expect(createReturn({ orderNo: 'O1', items: [item({ quantity: 1 })] })).rejects.toThrow(/exceeds/);
        // The same line key on another order is a different line.
        await expect(createReturn({ orderNo: 'O2', items: [item({ quantity: 1 })] })).resolves.toBeDefined();
    });

    it('generates unique RMA numbers', async () => {
        const created = await Promise.all(
            Array.from({ length: 20 }, () =>
                createReturn({ orderNo: 'O', items: [item({ lineKey: crypto.randomUUID(), quantity: 1 })] })
            )
        );
        expect(new Set(created.map((request) => request.rmaNo)).size).toBe(20);
    });

    it('walks a return to Refunded and stops', async () => {
        const { rmaNo } = await createReturn({ orderNo: 'O1', items: [item()] });
        const statuses: string[] = [];
        for (let i = 0; i < 6; i += 1) statuses.push((await advanceStatus(rmaNo))?.status ?? 'missing');
        expect(statuses).toEqual(['approved', 'received', 'refunded', 'refunded', 'refunded', 'refunded']);
        expect((await getReturn(rmaNo))?.trackingNo).toBeUndefined();
        expect((await getReturn(rmaNo))?.history.map((entry) => entry.status)).toEqual([
            'submitted',
            'approved',
            'received',
            'refunded',
        ]);
    });

    it('walks an exchange to Exchange shipped and adds a stable tracking number', async () => {
        const { rmaNo } = await createReturn({
            orderNo: 'O1',
            items: [item({ action: 'exchange', replacementSku: 'sku-2' })],
        });
        await advanceStatus(rmaNo);
        await advanceStatus(rmaNo);
        const shipped = await advanceStatus(rmaNo);
        expect(shipped?.status).toBe('exchange_shipped');
        expect(shipped?.trackingNo).toBe(getMockTrackingNo(rmaNo));
        expect((await advanceStatus(rmaNo))?.trackingNo).toBe(shipped?.trackingNo);
    });

    it('ends a mixed request at Exchange shipped', async () => {
        const { rmaNo } = await createReturn({
            orderNo: 'O1',
            items: [item(), item({ lineKey: 'l2', action: 'exchange', replacementSku: 'sku-2' })],
        });
        let last;
        for (let i = 0; i < 5; i += 1) last = await advanceStatus(rmaNo);
        expect(last?.status).toBe('exchange_shipped');
    });

    it('turns a stale double click into a no-op instead of skipping a step', async () => {
        const { rmaNo } = await createReturn({ orderNo: 'O1', items: [item()] });
        const [first, second] = await Promise.all([
            advanceStatus(rmaNo, 'submitted'),
            advanceStatus(rmaNo, 'submitted'),
        ]);
        expect(first?.status).toBe('approved');
        expect(second?.status).toBe('approved');
        expect((await getReturn(rmaNo))?.history).toHaveLength(2);
    });

    it('returns undefined when advancing an unknown request', async () => {
        expect(await advanceStatus('RMA-0')).toBeUndefined();
    });

    it('ignores corrupt stored data', async () => {
        window.localStorage.setItem(RETURNS_STORAGE_KEY, '{not json');
        expect(await listReturns()).toEqual([]);
        window.localStorage.setItem(RETURNS_STORAGE_KEY, JSON.stringify([{ nope: true }, 5]));
        resetReturnStoreForTests();
        expect(await listReturns()).toEqual([]);
    });

    it('keeps working in memory when localStorage throws', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        const { rmaNo } = await createReturn({ orderNo: 'O1', items: [item()] });
        expect((await getReturn(rmaNo))?.orderNo).toBe('O1');
    });

    describe('snapshots (useSyncExternalStore contract)', () => {
        it('returns the same object until the data changes', async () => {
            const a = getReturnsSnapshot();
            expect(getReturnsSnapshot()).toBe(a);
            expect(a.ready).toBe(true);
            await createReturn({ orderNo: 'O1', items: [item()] });
            const b = getReturnsSnapshot();
            expect(b).not.toBe(a);
            expect(getReturnsSnapshot()).toBe(b);
        });

        it('serves one constant, not-ready snapshot on the server', () => {
            expect(getReturnsServerSnapshot()).toBe(getReturnsServerSnapshot());
            expect(getReturnsServerSnapshot().ready).toBe(false);
        });

        it('notifies subscribers once per change and stops after unsubscribe', async () => {
            const listener = vi.fn();
            const unsubscribe = subscribeToReturns(listener);
            await createReturn({ orderNo: 'O1', items: [item()] });
            expect(listener).toHaveBeenCalledTimes(1);
            unsubscribe();
            await createReturn({ orderNo: 'O1', items: [item({ lineKey: 'l9', quantity: 1 })] });
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('picks up a change made in another tab', () => {
            const listener = vi.fn();
            const unsubscribe = subscribeToReturns(listener);
            const before = getReturnsSnapshot();
            const foreign = JSON.stringify([
                { rmaNo: 'RMA-1', orderNo: 'O9', status: 'submitted', history: [], items: [], createdAt: '' },
            ]);
            window.localStorage.setItem(RETURNS_STORAGE_KEY, foreign);
            window.dispatchEvent(new StorageEvent('storage', { key: RETURNS_STORAGE_KEY, newValue: foreign }));
            expect(listener).toHaveBeenCalledTimes(1);
            expect(getReturnsSnapshot()).not.toBe(before);
            expect(getReturnsSnapshot().returns[0].rmaNo).toBe('RMA-1');
            unsubscribe();
        });
    });
});
