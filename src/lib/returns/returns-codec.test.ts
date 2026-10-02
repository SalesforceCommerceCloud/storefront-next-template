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

import { describe, expect, it } from 'vitest';
import { advanceStatusRecord, parseStoredReturns, toReturnRequest, type StoredReturn } from './returns-codec';

const stored = (overrides: Partial<StoredReturn> = {}): StoredReturn => ({
    rmaNo: 'RMA-104233',
    status: 'approved',
    items: [{ itemId: 'abc123', quantity: 1, action: 'exchange', reason: 'too-small', replacementSku: 'DU-879242-S' }],
    history: [
        { status: 'submitted', at: '2026-10-09T10:12:00Z' },
        { status: 'approved', at: '2026-10-09T10:15:00Z' },
    ],
    trackingNo: null,
    ...overrides,
});
const wrap = (...returns: unknown[]) => JSON.stringify({ version: 1, returns });

describe('parseStoredReturns', () => {
    it('reads the agreed c_returns shape', () => {
        expect(parseStoredReturns(wrap(stored()))).toEqual([stored()]);
    });

    it('accepts a parsed object as well as a string', () => {
        expect(parseStoredReturns(JSON.parse(wrap(stored())))).toEqual([stored()]);
    });

    it.each([
        undefined,
        null,
        '',
        '  ',
        '{nope',
        '[]',
        '{}',
        7,
        JSON.stringify({ version: 2, returns: [stored()] }),
    ])('returns an empty list for %p', (value) => {
        expect(parseStoredReturns(value)).toEqual([]);
    });

    it('drops a damaged entry but keeps the good ones', () => {
        const bad = [
            { ...stored(), rmaNo: '' },
            { ...stored(), status: 'teleported' },
            { ...stored(), items: [] },
            { ...stored(), items: [{ itemId: 'a', quantity: 0, action: 'return', reason: 'too-small' }] },
            { ...stored(), items: [{ itemId: 'a', quantity: 1, action: 'burn', reason: 'too-small' }] },
            { ...stored(), items: [{ itemId: 'a', quantity: 1, action: 'return', reason: 'SIZE' }] },
            { ...stored(), history: [] },
            null,
            'text',
        ];
        expect(parseStoredReturns(wrap(...bad, stored({ rmaNo: 'RMA-1' })))).toEqual([stored({ rmaNo: 'RMA-1' })]);
    });

    it('normalises a missing tracking number to null and keeps a clientRequestId', () => {
        const withoutTracking: Partial<StoredReturn> = stored();
        delete withoutTracking.trackingNo;
        const [parsed] = parseStoredReturns(wrap({ ...withoutTracking, clientRequestId: 'req-1' }));
        expect(parsed.trackingNo).toBeNull();
        expect(parsed.clientRequestId).toBe('req-1');
    });
});

describe('toReturnRequest', () => {
    const lines = [{ itemId: 'abc123', productId: 'DU-879242-XS', productName: 'Polo', quantity: 2 }];

    it('joins the saved return with the order line', () => {
        const request = toReturnRequest('O1', stored(), lines);
        expect(request).toMatchObject({
            rmaNo: 'RMA-104233',
            orderNo: 'O1',
            createdAt: '2026-10-09T10:12:00Z',
            status: 'approved',
            items: [
                {
                    lineKey: 'abc123',
                    sku: 'DU-879242-XS',
                    name: 'Polo',
                    quantity: 1,
                    orderedQuantity: 2,
                    action: 'exchange',
                    replacementSku: 'DU-879242-S',
                },
            ],
        });
        expect(request.trackingNo).toBeUndefined();
    });

    it('carries the tracking number once there is one', () => {
        expect(toReturnRequest('O1', stored({ trackingNo: '1Z0000000001DEMO' }), lines).trackingNo).toBe(
            '1Z0000000001DEMO'
        );
    });

    it('still renders when the order line is gone', () => {
        const [item] = toReturnRequest('O1', stored(), []).items;
        expect(item.name).toBe('abc123');
        expect(item.orderedQuantity).toBe(1);
    });
});

describe('advanceStatusRecord', () => {
    it('moves one step and records it', () => {
        const next = advanceStatusRecord(stored(), 'approved', '2026-10-10T00:00:00Z');
        expect(next.status).toBe('received');
        expect(next.history.at(-1)).toEqual({ status: 'received', at: '2026-10-10T00:00:00Z' });
    });

    it('does nothing when the caller saw an older status (double click)', () => {
        const record = stored();
        expect(advanceStatusRecord(record, 'submitted', 'now')).toBe(record);
    });

    it('does nothing once final, and ships an exchange with a tracking number', () => {
        let record = stored({ status: 'received' });
        record = advanceStatusRecord(record, undefined, 'now');
        expect(record.status).toBe('exchange_shipped');
        expect(record.trackingNo).toMatch(/^1Z\d{10}DEMO$/);
        expect(advanceStatusRecord(record, undefined, 'later')).toBe(record);
    });
});
