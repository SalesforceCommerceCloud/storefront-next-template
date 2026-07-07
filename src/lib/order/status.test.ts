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
import { describe, test, expect } from 'vitest';
import { formatStatusFallbackLabel, getOrderStatusConfig, getShippingStatusConfig, resolveOrderStatus } from './status';

describe('order-status', () => {
    test('returns correct config for each SCAPI status', () => {
        expect(getOrderStatusConfig('created')?.labelKey).toBe('orders.status.created');

        expect(getOrderStatusConfig('new')?.labelKey).toBe('orders.status.new');

        expect(getOrderStatusConfig('completed')?.labelKey).toBe('orders.status.completed');

        expect(getOrderStatusConfig('cancelled')?.labelKey).toBe('orders.status.cancelled');

        expect(getOrderStatusConfig('replaced')?.labelKey).toBe('orders.status.replaced');

        expect(getOrderStatusConfig('failed')?.labelKey).toBe('orders.status.failed');
    });

    test('normalizes status (lowercase, spaces to underscores)', () => {
        expect(getOrderStatusConfig('COMPLETED')?.labelKey).toBe('orders.status.completed');
        expect(getOrderStatusConfig('REPLACED')?.labelKey).toBe('orders.status.replaced');
    });

    test('returns undefined for non-SCAPI order status strings', () => {
        expect(getOrderStatusConfig('unknown_status')).toBeUndefined();
    });

    test('returns undefined for missing or empty status', () => {
        expect(getOrderStatusConfig(undefined)).toBeUndefined();
        expect(getOrderStatusConfig('')).toBeUndefined();
        expect(getOrderStatusConfig('   ')).toBeUndefined();
    });

    test('assigns icons to appropriate statuses', () => {
        expect(getOrderStatusConfig('completed')?.icon).toBe('check');
        expect(getOrderStatusConfig('cancelled')?.icon).toBe('x');
        expect(getOrderStatusConfig('replaced')?.icon).toBe('check');
        expect(getOrderStatusConfig('failed')?.icon).toBe('x');
        expect(getOrderStatusConfig('created')?.icon).toBeUndefined();
        expect(getOrderStatusConfig('new')?.icon).toBeUndefined();
    });

    test('formats fallback labels consistently', () => {
        expect(formatStatusFallbackLabel('SHIPPED')).toBe('Shipped');
        expect(formatStatusFallbackLabel('not_shipped')).toBe('Not Shipped');
        expect(formatStatusFallbackLabel('Failed')).toBe('Failed');
        expect(formatStatusFallbackLabel('  in_progress  ')).toBe('In Progress');
        expect(formatStatusFallbackLabel('')).toBe('');
        expect(formatStatusFallbackLabel('   ')).toBe('');
        expect(formatStatusFallbackLabel(undefined)).toBe('');
    });

    // The order-status badge is ECOM-first: prefer `order.status`, fall back to
    // `omsData.status` only when ECOM is absent. ECOM is preferred because the badge
    // only understands the 6 SCAPI OrderStatusEnum values (created/new/completed/
    // cancelled/replaced/failed), which is what `order.status` carries; the OMS status
    // is a different vocabulary (Approved/Allocated/Fulfilled/Shipped…) and is only the
    // fallback. Blank/whitespace on either side is treated as absent. (Do not confuse
    // this with the shipment-list mapper, which is OMS-preferred — a separate decision.)
    describe('resolveOrderStatus precedence (ECOM-first, OMS fallback)', () => {
        const cases: Array<[string | undefined, string | undefined, string | undefined, string]> = [
            // ecom,        oms,           expected,      note
            ['new', 'cancelled', 'new', 'ECOM wins when both present'],
            [undefined, 'Approved', 'Approved', 'OMS fallback when ECOM absent'],
            ['completed', undefined, 'completed', 'ECOM present, no OMS'],
            [undefined, undefined, undefined, 'neither set → undefined'],
            ['', 'Fulfilled', 'Fulfilled', 'blank ECOM treated as absent → OMS fallback'],
            ['   ', undefined, undefined, 'whitespace-only ECOM normalized away, no OMS'],
            ['new', '', 'new', 'ECOM present, blank OMS ignored'],
            ['', '', undefined, 'both blank → undefined'],
        ];
        test.each(cases)('order.status=%j, omsData.status=%j → %j (%s)', (ecomStatus, omsStatus, expected) => {
            const order = {
                ...(ecomStatus === undefined ? {} : { status: ecomStatus }),
                ...(omsStatus === undefined ? {} : { omsData: { status: omsStatus } }),
            };
            expect(resolveOrderStatus(order)).toBe(expected);
        });
    });

    describe('shipping status', () => {
        test('returns correct config for each shipping status', () => {
            expect(getShippingStatusConfig('not_shipped')?.labelKey).toBe('orders.shippingStatus.notShipped');
            expect(getShippingStatusConfig('part_shipped')?.labelKey).toBe('orders.shippingStatus.partShipped');
            expect(getShippingStatusConfig('shipped')?.labelKey).toBe('orders.shippingStatus.shipped');
        });

        test('normalizes status (lowercase, spaces to underscores)', () => {
            expect(getShippingStatusConfig('SHIPPED')?.labelKey).toBe('orders.shippingStatus.shipped');
            expect(getShippingStatusConfig('Part Shipped')?.labelKey).toBe('orders.shippingStatus.partShipped');
        });

        test('returns undefined for unknown or empty status', () => {
            expect(getShippingStatusConfig('unknown')).toBeUndefined();
            expect(getShippingStatusConfig(undefined)).toBeUndefined();
            expect(getShippingStatusConfig('')).toBeUndefined();
            expect(getShippingStatusConfig('   ')).toBeUndefined();
        });
    });
});
