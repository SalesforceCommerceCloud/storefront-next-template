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
import { describe, it, expect } from 'vitest';
import type { OrderLike } from '@/lib/order-management/types';
import {
    getReturnableItems,
    isOrderOwnedBy,
    buildReturnProductItems,
    type ReturnSelection,
} from '@/lib/order-management/return';

/** Build a mock order whose product items carry the given `omsData` blobs. */
function orderWithItems(items: unknown[]): OrderLike {
    return { orderNo: 'order-1', productItems: items } as unknown as OrderLike;
}

/** A returnable OMS product item (has a positive `quantityAvailableToReturn`). */
function returnable(itemId: string, qty: number, extra: Record<string, unknown> = {}): unknown {
    return { itemId, productName: `Product ${itemId}`, omsData: { quantityAvailableToReturn: qty }, ...extra };
}

describe('getReturnableItems', () => {
    it('returns [] when the order has no product items', () => {
        expect(getReturnableItems({ orderNo: 'o' } as OrderLike)).toEqual([]);
        expect(getReturnableItems(orderWithItems([]))).toEqual([]);
    });

    it('returns [] for ECOM-only items (no omsData → nothing per-item to return)', () => {
        const order = orderWithItems([
            { itemId: 'a', productName: 'A' },
            { itemId: 'b', productName: 'B' },
        ]);
        expect(getReturnableItems(order)).toEqual([]);
    });

    it('drops items with quantityAvailableToReturn === 0', () => {
        const order = orderWithItems([returnable('a', 0)]);
        expect(getReturnableItems(order)).toEqual([]);
    });

    it('returns only the subset with a positive quantityAvailableToReturn', () => {
        const order = orderWithItems([
            returnable('keep-1', 2),
            returnable('drop-zero', 0),
            { itemId: 'drop-ecom', productName: 'ECOM' }, // no omsData
            returnable('keep-2', 1),
        ]);
        const items = getReturnableItems(order);
        expect(items.map((i) => i.itemId)).toEqual(['keep-1', 'keep-2']);
    });

    it('rejects NaN, negative, and non-numeric quantityAvailableToReturn (Number.isFinite + > 0)', () => {
        const order = orderWithItems([
            returnable('nan', Number.NaN),
            returnable('neg', -1),
            { itemId: 'str', productName: 'Str', omsData: { quantityAvailableToReturn: '3' } }, // string, not a number
            returnable('infinity', Number.POSITIVE_INFINITY),
            returnable('good', 1),
        ]);
        const items = getReturnableItems(order);
        expect(items.map((i) => i.itemId)).toEqual(['good']);
    });
});

describe('isOrderOwnedBy', () => {
    const order = { orderNo: 'o', customerInfo: { customerId: 'cust-123' } } as unknown as OrderLike;

    it('returns true when the ids match and both are concrete', () => {
        expect(isOrderOwnedBy(order, 'cust-123')).toBe(true);
    });

    it('returns false when the ids differ', () => {
        expect(isOrderOwnedBy(order, 'someone-else')).toBe(false);
    });

    it('returns false for an undefined/empty shopper customerId (no undefined === undefined pass)', () => {
        expect(isOrderOwnedBy(order, undefined)).toBe(false);
        expect(isOrderOwnedBy(order, '')).toBe(false);
        // guest order with no customerId on either side must NOT be treated as owned
        const guestOrder = { orderNo: 'o' } as unknown as OrderLike;
        expect(isOrderOwnedBy(guestOrder, undefined)).toBe(false);
    });
});

describe('buildReturnProductItems', () => {
    const sel = (over: Partial<ReturnSelection>): ReturnSelection => ({
        itemId: 'i',
        checked: true,
        quantity: 1,
        ...over,
    });

    it('maps checked rows to { itemId, quantity } with quantity as a JS Number', () => {
        const items = buildReturnProductItems([sel({ itemId: 'a', quantity: 2 })]);
        expect(items).toEqual([{ itemId: 'a', quantity: 2 }]);
    });

    it('serializes a string form quantity into a Number (format: double)', () => {
        const items = buildReturnProductItems([sel({ itemId: 'a', quantity: '3' })]);
        expect(items).toEqual([{ itemId: 'a', quantity: 3 }]);
        expect(typeof items[0].quantity).toBe('number');
    });

    it('drops unchecked rows, rows without an itemId, and rows with quantity <= 0', () => {
        const items = buildReturnProductItems([
            sel({ itemId: 'keep', quantity: 1 }),
            sel({ itemId: 'unchecked', checked: false }),
            sel({ itemId: '', quantity: 1 }),
            sel({ itemId: 'zero', quantity: 0 }),
            sel({ itemId: 'neg', quantity: -2 }),
        ]);
        expect(items.map((i) => i.itemId)).toEqual(['keep']);
    });

    it('omits reason when it equals the OMS default reason code', () => {
        const items = buildReturnProductItems([sel({ itemId: 'a', reason: 'DEFAULT' })], 'DEFAULT');
        expect(items).toEqual([{ itemId: 'a', quantity: 1 }]);
        expect(items[0]).not.toHaveProperty('reason');
    });

    it('includes reason when it differs from the OMS default reason code', () => {
        const items = buildReturnProductItems([sel({ itemId: 'a', reason: 'DOES_NOT_FIT' })], 'DEFAULT');
        expect(items).toEqual([{ itemId: 'a', quantity: 1, reason: 'DOES_NOT_FIT' }]);
    });

    it('includes any present reason when no default reason code is provided', () => {
        const items = buildReturnProductItems([sel({ itemId: 'a', reason: 'ANY' })]);
        expect(items).toEqual([{ itemId: 'a', quantity: 1, reason: 'ANY' }]);
    });

    it('omits reason when the row has no reason at all', () => {
        const items = buildReturnProductItems([sel({ itemId: 'a', reason: undefined })], 'DEFAULT');
        expect(items).toEqual([{ itemId: 'a', quantity: 1 }]);
    });

    it('returns [] when no rows are checked', () => {
        expect(buildReturnProductItems([sel({ checked: false })])).toEqual([]);
    });
});
