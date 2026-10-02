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
import {
    getItemEligibility,
    getRequestedQuantities,
    groupLinesByDelivery,
    validateSelection,
    type ReturnPolicy,
} from './eligibility';
import type { ReturnItem, ReturnableLine } from './types';

const policy: ReturnPolicy = {
    defaultWindowDays: 30,
    nonReturnableCategories: ['swimwear'],
    nonReturnableSkus: ['no-return'],
    exchangeOnlySkus: ['final-sale'],
};

const NOW = new Date('2026-06-30T12:00:00Z');
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const line = (overrides: Partial<ReturnableLine> = {}): ReturnableLine => ({
    lineKey: 'l1',
    sku: 'sku-1',
    name: 'Shirt',
    quantity: 2,
    deliveryId: 'd1',
    deliveredAt: daysAgo(5),
    variationValues: { size: 'M' },
    variationAttributes: [],
    variants: [
        { sku: 'sku-1', variationValues: { size: 'M' }, orderable: true },
        { sku: 'sku-2', variationValues: { size: 'L' }, orderable: true },
    ],
    ...overrides,
});

describe('getItemEligibility', () => {
    it('allows return and exchange inside the default window', () => {
        const result = getItemEligibility(line(), NOW, policy);
        expect(result.status).toBe('eligible');
        expect(result.allowedActions).toEqual(['return', 'exchange']);
    });

    it('treats day 30 as eligible and day 31 as closed', () => {
        expect(getItemEligibility(line({ deliveredAt: daysAgo(30) }), NOW, policy).status).toBe('eligible');
        expect(getItemEligibility(line({ deliveredAt: daysAgo(31) }), NOW, policy).status).toBe('window-closed');
    });

    it('blocks non-returnable categories', () => {
        const result = getItemEligibility(line({ categoryId: 'swimwear' }), NOW, policy);
        expect(result.status).toBe('not-returnable');
        expect(result.allowedActions).toEqual([]);
    });

    it('blocks return and exchange for a non-returnable SKU, whatever its category or window', () => {
        const result = getItemEligibility(line({ sku: 'no-return', categoryId: 'shirts' }), NOW, policy);
        expect(result.status).toBe('not-returnable');
        expect(result.allowedActions).toEqual([]);
    });

    it('offers only exchange for an exchange-only SKU', () => {
        const result = getItemEligibility(line({ sku: 'final-sale' }), NOW, policy);
        expect(result.status).toBe('exchange-only');
        expect(result.allowedActions).toEqual(['exchange']);
    });

    it('lets a SKU rule override a category rule', () => {
        const result = getItemEligibility(line({ sku: 'final-sale', categoryId: 'swimwear' }), NOW, policy);
        expect(result.status).toBe('exchange-only');
    });

    it('lets a category rule override the window', () => {
        const result = getItemEligibility(line({ categoryId: 'swimwear', deliveredAt: daysAgo(90) }), NOW, policy);
        expect(result.status).toBe('not-returnable');
    });

    it('lets a SKU rule override an expired window', () => {
        const result = getItemEligibility(line({ sku: 'final-sale', deliveredAt: daysAgo(90) }), NOW, policy);
        expect(result.status).toBe('exchange-only');
    });

    it('closes the window when the delivery date is missing or invalid', () => {
        expect(getItemEligibility(line({ deliveredAt: undefined }), NOW, policy).status).toBe('window-closed');
        expect(getItemEligibility(line({ deliveredAt: 'not a date' }), NOW, policy).status).toBe('window-closed');
    });
});

describe('date-only delivery dates (saved delivery split)', () => {
    const at = (iso: string) => new Date(iso);
    const onDate = (deliveryDate: string) => line({ deliveredAt: deliveryDate });

    it('keeps the window open through the whole 30th day', () => {
        expect(getItemEligibility(onDate('2026-06-01'), at('2026-07-01T23:59:00Z'), policy).status).toBe('eligible');
        expect(getItemEligibility(onDate('2026-06-01'), at('2026-07-02T00:01:00Z'), policy).status).toBe(
            'window-closed'
        );
    });

    it('reports the last day in the reason', () => {
        const result = getItemEligibility(onDate('2026-06-01'), at('2026-06-10T00:00:00Z'), policy);
        expect(result.reason.values?.date?.slice(0, 10)).toBe('2026-07-01');
    });

    it('treats an impossible date as having no delivery date', () => {
        expect(getItemEligibility(onDate('2026-13-45'), NOW, policy).reason.key).toBe(
            'eligibility.reason.noDeliveryDate'
        );
    });
});

describe('groupLinesByDelivery', () => {
    it('groups by delivery and keeps first-seen order', () => {
        const groups = groupLinesByDelivery([
            line({ lineKey: 'a', deliveryId: 'x' }),
            line({ lineKey: 'b', deliveryId: 'y' }),
            line({ lineKey: 'c', deliveryId: 'x' }),
        ]);
        expect(groups.map((group) => [group.deliveryId, group.lines.map((l) => l.lineKey)])).toEqual([
            ['x', ['a', 'c']],
            ['y', ['b']],
        ]);
    });
});

describe('validateSelection', () => {
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
    const check = (selection: ReturnItem[], lines = [line()], requested = new Map<string, number>()) =>
        validateSelection(selection, lines, requested, NOW, policy);

    it('accepts a valid return', () => {
        expect(check([item()])).toEqual({ ok: true });
    });

    it('accepts a valid exchange to a different variant', () => {
        expect(check([item({ action: 'exchange', replacementSku: 'sku-2' })])).toEqual({ ok: true });
    });

    it('rejects an empty selection', () => {
        expect(check([])).toEqual({ ok: false, error: 'empty' });
    });

    it('rejects unknown and duplicate lines', () => {
        expect(check([item({ lineKey: 'nope' })])).toMatchObject({ error: 'unknown-line' });
        expect(check([item(), item()])).toMatchObject({ error: 'unknown-line' });
    });

    it('rejects bad quantities, including ones already requested', () => {
        expect(check([item({ quantity: 0 })])).toMatchObject({ error: 'invalid-quantity' });
        expect(check([item({ quantity: 1.5 })])).toMatchObject({ error: 'invalid-quantity' });
        expect(check([item({ quantity: 3 })])).toMatchObject({ error: 'quantity-exceeded' });
        expect(check([item({ quantity: 2 })], [line()], new Map([['l1', 1]]))).toMatchObject({
            error: 'quantity-exceeded',
        });
    });

    it('rejects an action the policy does not allow', () => {
        expect(check([item()], [line({ sku: 'final-sale' })])).toMatchObject({ error: 'action-not-allowed' });
    });

    it('rejects a missing reason', () => {
        expect(check([item({ reason: '' as ReturnItem['reason'] })])).toMatchObject({ error: 'missing-reason' });
    });

    it('rejects an exchange to the same, missing or unavailable variant', () => {
        expect(check([item({ action: 'exchange', replacementSku: 'sku-1' })])).toMatchObject({
            error: 'invalid-replacement',
        });
        expect(check([item({ action: 'exchange' })])).toMatchObject({ error: 'invalid-replacement' });
        const unavailable = line({
            variants: [
                { sku: 'sku-1', variationValues: { size: 'M' }, orderable: true },
                { sku: 'sku-2', variationValues: { size: 'L' }, orderable: false },
            ],
        });
        expect(check([item({ action: 'exchange', replacementSku: 'sku-2' })], [unavailable])).toMatchObject({
            error: 'invalid-replacement',
        });
    });
});

describe('getRequestedQuantities', () => {
    it('sums quantities per line across requests', () => {
        const result = getRequestedQuantities([
            { items: [{ lineKey: 'a', quantity: 1 } as ReturnItem] },
            { items: [{ lineKey: 'a', quantity: 2 } as ReturnItem, { lineKey: 'b', quantity: 1 } as ReturnItem] },
        ]);
        expect(result.get('a')).toBe(3);
        expect(result.get('b')).toBe(1);
    });
});
