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

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RETURN_POLICY, getItemEligibility, validateSelection } from './eligibility';
import { advanceStatusRecord } from './returns-codec';
import { getFinalStatus, getMockTrackingNo, getStatusSteps } from './return-store';
import { RETURN_REASONS, type ReturnItem, type ReturnableLine } from './types';

/**
 * The Returns custom API re-runs the rules on the server with `returns-core.js`, a plain ES5 copy of the TypeScript
 * rules. Two copies can drift, so this test runs the same cases through both and fails when they disagree.
 */
const CARTRIDGE = resolve(__dirname, '../../../cartridges/app_storefrontnext_base/cartridge/scripts/returns');
// The file is plain CommonJS for SFCC, but this package is an ES module, so run the source as a CommonJS module.
const cartridgeModule: { exports: Record<string, unknown> } = { exports: {} };
runInNewContext(readFileSync(resolve(CARTRIDGE, 'returns-core.js'), 'utf-8'), {
    module: cartridgeModule,
    exports: cartridgeModule.exports,
});
const core = cartridgeModule.exports as Record<string, (...args: never[]) => unknown> & { REASONS: string[] };

const policy = RETURN_POLICY;
const NOW = new Date('2026-10-01T12:00:00Z');
const dayMs = 86_400_000;

describe('cartridge policy file', () => {
    it('is identical to the storefront policy', () => {
        const cartridgePolicy = JSON.parse(readFileSync(resolve(CARTRIDGE, 'return-policy.json'), 'utf-8'));
        expect(cartridgePolicy).toEqual(policy);
    });

    it('uses the same reason list', () => {
        expect(core.REASONS).toEqual(RETURN_REASONS.map((reason) => reason.id));
    });
});

const skus = ['plain-sku', ...policy.nonReturnableSkus, ...policy.exchangeOnlySkus];
const categories = [undefined, 'shirts', ...policy.nonReturnableCategories];
const delivered = [
    undefined,
    'garbage',
    '2026-13-45',
    '2026-10-01',
    '2026-09-01', // day 30 of the window ends 2026-10-01 (date-only)
    '2026-08-31',
    new Date(NOW.getTime() - 29 * dayMs).toISOString(),
    new Date(NOW.getTime() - 30 * dayMs).toISOString(),
    new Date(NOW.getTime() - 31 * dayMs).toISOString(),
];

describe('item eligibility parity', () => {
    for (const sku of skus) {
        for (const categoryId of categories) {
            for (const deliveredAt of delivered) {
                it(`${sku} | ${categoryId} | ${deliveredAt}`, () => {
                    const line = { sku, categoryId, deliveredAt };
                    const ts = getItemEligibility(line, NOW, policy);
                    const js = core.getItemEligibility(line as never, NOW.getTime() as never, policy as never) as {
                        status: string;
                        allowedActions: string[];
                    };
                    expect(js.status).toBe(ts.status);
                    expect(js.allowedActions).toEqual([...ts.allowedActions]);
                });
            }
        }
    }
});

const variants = [
    { sku: 'v-m', variationValues: { size: 'M' }, orderable: true },
    { sku: 'v-l', variationValues: { size: 'L' }, orderable: true },
    { sku: 'v-xl', variationValues: { size: 'XL' }, orderable: false },
];
const line = (overrides: Partial<ReturnableLine> = {}): ReturnableLine => ({
    lineKey: 'l1',
    sku: 'v-m',
    name: 'Polo',
    quantity: 2,
    deliveryId: 'D1',
    deliveredAt: '2026-09-25',
    variationValues: { size: 'M' },
    variationAttributes: [],
    variants,
    ...overrides,
});
const item = (overrides: Partial<ReturnItem> = {}): ReturnItem => ({
    lineKey: 'l1',
    sku: 'v-m',
    name: 'Polo',
    quantity: 1,
    orderedQuantity: 2,
    action: 'return',
    reason: 'too-small',
    ...overrides,
});

describe('selection validation parity', () => {
    const cases: [string, ReturnItem[], ReturnableLine[], Record<string, number>][] = [
        ['valid return', [item()], [line()], {}],
        ['valid exchange', [item({ action: 'exchange', replacementSku: 'v-l' })], [line()], {}],
        ['empty', [], [line()], {}],
        ['unknown line', [item({ lineKey: 'zzz' })], [line()], {}],
        ['duplicate line', [item(), item()], [line()], {}],
        ['zero quantity', [item({ quantity: 0 })], [line()], {}],
        ['fractional quantity', [item({ quantity: 1.5 })], [line()], {}],
        ['too many', [item({ quantity: 3 })], [line()], {}],
        ['too many after earlier return', [item({ quantity: 2 })], [line()], { l1: 1 }],
        ['not returnable sku', [item()], [line({ sku: policy.nonReturnableSkus[0] })], {}],
        ['exchange-only, return asked', [item()], [line({ sku: policy.exchangeOnlySkus[0] })], {}],
        ['window closed', [item()], [line({ deliveredAt: '2026-01-01' })], {}],
        ['bad reason', [item({ reason: 'nope' as never })], [line()], {}],
        ['exchange without replacement', [item({ action: 'exchange' })], [line()], {}],
        ['exchange to same sku', [item({ action: 'exchange', replacementSku: 'v-m' })], [line()], {}],
        ['exchange to unorderable', [item({ action: 'exchange', replacementSku: 'v-xl' })], [line()], {}],
        ['exchange to unknown sku', [item({ action: 'exchange', replacementSku: 'other' })], [line()], {}],
    ];

    it.each(cases)('%s', (_name, items, lines, requested) => {
        const ts = validateSelection(items, lines, new Map(Object.entries(requested)), NOW, policy);
        // The server receives only { itemId, quantity, action, reason, replacementSku } and the order's lines.
        const serverItems = items.map(({ lineKey, quantity, action, reason, replacementSku }) => ({
            itemId: lineKey,
            quantity,
            action,
            reason,
            replacementSku,
        }));
        const serverLines = lines.map(({ lineKey, sku, quantity, categoryId, deliveredAt, variants: all }) => ({
            lineKey,
            sku,
            quantity,
            categoryId,
            deliveredAt,
            variants: all.map(({ sku: variantSku, orderable }) => ({ sku: variantSku, orderable })),
        }));
        const js = core.validateSelection(
            serverItems as never,
            serverLines as never,
            requested as never,
            NOW.getTime() as never,
            policy as never
        ) as { ok: boolean; error?: string };
        expect(js.ok).toBe(ts.ok);
        if (!ts.ok) expect(js.error).toBe(ts.error);
    });
});

describe('status flow parity', () => {
    const itemsReturn = [{ action: 'return' }] as never;
    const itemsExchange = [{ action: 'return' }, { action: 'exchange' }] as never;

    it('has the same steps and final status', () => {
        for (const items of [itemsReturn, itemsExchange]) {
            expect(core.getStatusSteps(items)).toEqual(getStatusSteps({ items }));
            expect(core.getFinalStatus(items)).toBe(getFinalStatus({ items }));
        }
    });

    it('makes the same tracking number from an RMA number', () => {
        for (const rma of ['RMA-104233', 'RMA-000001', 'RMA-999999', 'RMA-1759320000000']) {
            expect(core.getMockTrackingNo(rma as never)).toBe(getMockTrackingNo(rma));
        }
    });

    it('advances a record the same way, step by step, to the same end', () => {
        const record = {
            rmaNo: 'RMA-104233',
            status: 'submitted',
            items: [{ action: 'exchange' }],
            history: [],
            trackingNo: null,
        };
        let ts = record as never;
        let js = record as never;
        for (let i = 0; i < 6; i += 1) {
            ts = advanceStatusRecord(ts, undefined, `2026-10-0${i + 1}T00:00:00Z`) as never;
            js = core.advanceRecord(js as never, undefined as never, `2026-10-0${i + 1}T00:00:00Z` as never) as never;
            expect(js).toEqual(ts);
        }
        expect((js as { status: string }).status).toBe('exchange_shipped');
    });
});
