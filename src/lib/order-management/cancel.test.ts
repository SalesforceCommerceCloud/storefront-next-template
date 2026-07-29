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
import { canCancelOrder, isCancellable, isOrderCancelled } from './cancel';
import type { OrderLike } from './types';

describe('isCancellable', () => {
    it('returns true when all items are fully cancellable', () => {
        const order: OrderLike = {
            omsData: { orderNumber: 'ORD-123' },
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: { quantityAvailableToCancel: 2, quantityOrdered: 2 },
                },
                {
                    itemId: 'item-2',
                    omsData: { quantityAvailableToCancel: 1, quantityOrdered: 1 },
                },
            ],
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(true);
    });

    it('returns false when some items are partially cancellable', () => {
        const order: OrderLike = {
            omsData: { orderNumber: 'ORD-123' },
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: { quantityAvailableToCancel: 2, quantityOrdered: 2 },
                },
                {
                    itemId: 'item-2',
                    omsData: { quantityAvailableToCancel: 1, quantityOrdered: 3 },
                },
            ],
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(false);
    });

    it('returns false when quantityAvailableToCancel is zero', () => {
        const order: OrderLike = {
            omsData: { orderNumber: 'ORD-123' },
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: { quantityAvailableToCancel: 0, quantityOrdered: 2 },
                },
            ],
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(false);
    });

    it('returns false when quantityOrdered is zero', () => {
        const order: OrderLike = {
            omsData: { orderNumber: 'ORD-123' },
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: { quantityAvailableToCancel: 0, quantityOrdered: 0 },
                },
            ],
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(false);
    });

    it('returns false when quantityAvailableToCancel is not a finite number', () => {
        const order: OrderLike = {
            omsData: { orderNumber: 'ORD-123' },
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: {
                        quantityAvailableToCancel: Infinity,
                        quantityOrdered: 2,
                    } as unknown,
                },
            ],
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(false);
    });

    it('returns false when quantityOrdered is not a finite number', () => {
        const order: OrderLike = {
            omsData: { orderNumber: 'ORD-123' },
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: {
                        quantityAvailableToCancel: 2,
                        quantityOrdered: NaN,
                    } as unknown,
                },
            ],
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(false);
    });

    it('returns false when omsData is missing from order', () => {
        const order: OrderLike = {
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: { quantityAvailableToCancel: 2, quantityOrdered: 2 },
                },
            ],
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(false);
    });

    it('returns false when productItems array is empty', () => {
        const order: OrderLike = {
            omsData: { orderNumber: 'ORD-123' },
            productItems: [],
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(false);
    });

    it('returns false when productItems is undefined', () => {
        const order: OrderLike = {
            omsData: { orderNumber: 'ORD-123' },
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(false);
    });

    it('returns false when item omsData is missing', () => {
        const order: OrderLike = {
            omsData: { orderNumber: 'ORD-123' },
            productItems: [
                {
                    itemId: 'item-1',
                },
            ],
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(false);
    });

    it('returns false when quantityAvailableToCancel is missing', () => {
        const order: OrderLike = {
            omsData: { orderNumber: 'ORD-123' },
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: { quantityOrdered: 2 } as unknown,
                },
            ],
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(false);
    });

    it('returns false when quantityOrdered is missing', () => {
        const order: OrderLike = {
            omsData: { orderNumber: 'ORD-123' },
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: { quantityAvailableToCancel: 2 } as unknown,
                },
            ],
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(false);
    });

    it('returns false when quantities are negative', () => {
        const order: OrderLike = {
            omsData: { orderNumber: 'ORD-123' },
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: { quantityAvailableToCancel: -1, quantityOrdered: -1 },
                },
            ],
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(false);
    });

    it('returns false when available exceeds ordered', () => {
        const order: OrderLike = {
            omsData: { orderNumber: 'ORD-123' },
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: { quantityAvailableToCancel: 3, quantityOrdered: 2 },
                },
            ],
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(false);
    });

    it('returns true for single fully cancellable item', () => {
        const order: OrderLike = {
            omsData: { orderNumber: 'ORD-123' },
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: { quantityAvailableToCancel: 5, quantityOrdered: 5 },
                },
            ],
        } as unknown as OrderLike;

        expect(isCancellable(order)).toBe(true);
    });
});

describe('isOrderCancelled', () => {
    it('returns true when all items have canceled status', () => {
        const order: OrderLike = {
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: { status: 'canceled' },
                },
                {
                    itemId: 'item-2',
                    omsData: { status: 'canceled' },
                },
            ],
        } as unknown as OrderLike;

        expect(isOrderCancelled(order)).toBe(true);
    });

    it('returns false when some items are not canceled', () => {
        const order: OrderLike = {
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: { status: 'canceled' },
                },
                {
                    itemId: 'item-2',
                    omsData: { status: 'shipped' },
                },
            ],
        } as unknown as OrderLike;

        expect(isOrderCancelled(order)).toBe(false);
    });

    it('returns false when productItems array is empty', () => {
        const order: OrderLike = {
            productItems: [],
        } as unknown as OrderLike;

        expect(isOrderCancelled(order)).toBe(false);
    });

    it('returns false when productItems is undefined', () => {
        const order: OrderLike = {} as unknown as OrderLike;

        expect(isOrderCancelled(order)).toBe(false);
    });

    it('returns false when item omsData is missing', () => {
        const order: OrderLike = {
            productItems: [
                {
                    itemId: 'item-1',
                },
            ],
        } as unknown as OrderLike;

        expect(isOrderCancelled(order)).toBe(false);
    });

    it('returns false when status is missing', () => {
        const order: OrderLike = {
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: {},
                },
            ],
        } as unknown as OrderLike;

        expect(isOrderCancelled(order)).toBe(false);
    });

    it('returns true for single canceled item', () => {
        const order: OrderLike = {
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: { status: 'canceled' },
                },
            ],
        } as unknown as OrderLike;

        expect(isOrderCancelled(order)).toBe(true);
    });
});

describe('canCancelOrder', () => {
    const cancellableOrder = {
        omsData: { orderNumber: 'ORD-123' },
        customerInfo: { customerId: 'cust-abc' },
        productItems: [
            {
                itemId: 'item-1',
                omsData: { quantityAvailableToCancel: 2, quantityOrdered: 2 },
            },
        ],
    } as unknown as OrderLike;

    it('returns true when shopper owns the order and all items are cancellable', () => {
        expect(canCancelOrder(cancellableOrder, 'cust-abc')).toBe(true);
    });

    it('returns false when customerId is undefined', () => {
        expect(canCancelOrder(cancellableOrder, undefined)).toBe(false);
    });

    it('returns false when customerId is null', () => {
        expect(canCancelOrder(cancellableOrder, null)).toBe(false);
    });

    it('returns false when customerId is empty string', () => {
        expect(canCancelOrder(cancellableOrder, '')).toBe(false);
    });

    it('returns false when customerId does not match order owner', () => {
        expect(canCancelOrder(cancellableOrder, 'someone-else')).toBe(false);
    });

    it('returns false when order has no customerInfo', () => {
        const order = { ...cancellableOrder, customerInfo: undefined } as unknown as OrderLike;
        expect(canCancelOrder(order, 'cust-abc')).toBe(false);
    });

    it('returns false when ownership matches but order is not cancellable (no omsData)', () => {
        const order = { ...cancellableOrder, omsData: undefined } as unknown as OrderLike;
        expect(canCancelOrder(order, 'cust-abc')).toBe(false);
    });

    it('returns false when ownership matches but items are partially cancellable', () => {
        const order: OrderLike = {
            ...cancellableOrder,
            productItems: [
                {
                    itemId: 'item-1',
                    omsData: { quantityAvailableToCancel: 1, quantityOrdered: 3 },
                },
            ],
        } as unknown as OrderLike;
        expect(canCancelOrder(order, 'cust-abc')).toBe(false);
    });
});
