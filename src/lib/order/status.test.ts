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
import {
    formatStatusFallbackLabel,
    getOrderCancelStatusConfig,
    getOrderFulfillmentStatus,
    getOrderFulfillmentStatusConfig,
    getOrderReturnStatus,
    getOrderReturnStatusConfig,
    getOrderStatusConfig,
    getShippingStatusConfig,
    resolveOrderStatus,
} from './status';

const item = (status?: string) => ({ omsData: status === undefined ? undefined : { status } });

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

    test('assigns PWA-aligned badge classes to each SCAPI status', () => {
        // Green (success) for non-cancelled, non-return states — including `created`/`new` which
        // PWA Kit renders as green. Distinguished from `completed`/`replaced` by the absence of
        // the check icon, not by color.
        expect(getOrderStatusConfig('created')?.className).toContain('bg-status-positive');
        expect(getOrderStatusConfig('new')?.className).toContain('bg-status-positive');
        expect(getOrderStatusConfig('completed')?.className).toContain('bg-status-positive');
        expect(getOrderStatusConfig('replaced')?.className).toContain('bg-status-positive');
        // Red (critical) for cancelled + failed. `failed` diverges from PWA (which greens it) —
        // SFN keeps the red-with-x styling because `failed` is a genuine terminal error state.
        expect(getOrderStatusConfig('cancelled')?.className).toContain('bg-status-critical');
        expect(getOrderStatusConfig('failed')?.className).toContain('bg-status-critical');
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

    describe('return status', () => {
        test('all items returned → RETURN_COMPLETE', () => {
            expect(getOrderReturnStatus({ productItems: [item('returned'), item('returned')] })).toBe(
                'RETURN_COMPLETE'
            );
        });

        test('some (not all) items returned → PARTIAL_RETURN_COMPLETE', () => {
            expect(getOrderReturnStatus({ productItems: [item('returned'), item('ordered')] })).toBe(
                'PARTIAL_RETURN_COMPLETE'
            );
        });

        test('returned outranks initiated (mixed returned + initiated) → PARTIAL_RETURN_COMPLETE', () => {
            expect(getOrderReturnStatus({ productItems: [item('returned'), item('return_initiated')] })).toBe(
                'PARTIAL_RETURN_COMPLETE'
            );
        });

        test('all items initiated (none returned) → RETURN_INITIATED', () => {
            expect(getOrderReturnStatus({ productItems: [item('return_initiated'), item('return_initiated')] })).toBe(
                'RETURN_INITIATED'
            );
        });

        test('some items initiated, none returned → PARTIAL_RETURN_INITIATED', () => {
            expect(getOrderReturnStatus({ productItems: [item('return_initiated'), item('ordered')] })).toBe(
                'PARTIAL_RETURN_INITIATED'
            );
        });

        test('no returned or initiated items → undefined (fall back to raw status)', () => {
            expect(getOrderReturnStatus({ productItems: [item('ordered'), item('fulfilled')] })).toBeUndefined();
        });

        test('empty productItems → undefined', () => {
            expect(getOrderReturnStatus({ productItems: [] })).toBeUndefined();
            expect(getOrderReturnStatus({})).toBeUndefined();
        });

        test('items with absent omsData count as "other"', () => {
            expect(getOrderReturnStatus({ productItems: [item(), item()] })).toBeUndefined();
            expect(getOrderReturnStatus({ productItems: [item('returned'), item()] })).toBe('PARTIAL_RETURN_COMPLETE');
        });

        test('unknown item status counts as "other"', () => {
            expect(getOrderReturnStatus({ productItems: [item('some_future_state')] })).toBeUndefined();
        });

        test('status matching is case/whitespace-insensitive', () => {
            expect(getOrderReturnStatus({ productItems: [item('  RETURNED  ')] })).toBe('RETURN_COMPLETE');
            expect(getOrderReturnStatus({ productItems: [item('Return_Initiated')] })).toBe('RETURN_INITIATED');
        });

        // Per-unit aggregation: a single line with quantity > 1 can report a partial return.
        const qtyItem = (
            status: string,
            q: {
                quantityOrdered?: number;
                quantityCanceled?: number;
                quantityReturned?: number;
                quantityReturnInitiated?: number;
            }
        ) => ({ omsData: { status, ...q } });

        test('single line, all units returned → RETURN_COMPLETE', () => {
            expect(
                getOrderReturnStatus({
                    productItems: [qtyItem('returned', { quantityOrdered: 3, quantityReturned: 3 })],
                })
            ).toBe('RETURN_COMPLETE');
        });

        test('single line, some units returned (rest untouched) → PARTIAL_RETURN_COMPLETE', () => {
            expect(
                getOrderReturnStatus({
                    productItems: [qtyItem('ordered', { quantityOrdered: 3, quantityReturned: 1 })],
                })
            ).toBe('PARTIAL_RETURN_COMPLETE');
        });

        test('single line, all units return-initiated → RETURN_INITIATED', () => {
            expect(
                getOrderReturnStatus({
                    productItems: [qtyItem('return_initiated', { quantityOrdered: 3, quantityReturnInitiated: 3 })],
                })
            ).toBe('RETURN_INITIATED');
        });

        test('single line, some units return-initiated → PARTIAL_RETURN_INITIATED', () => {
            expect(
                getOrderReturnStatus({
                    productItems: [qtyItem('ordered', { quantityOrdered: 3, quantityReturnInitiated: 1 })],
                })
            ).toBe('PARTIAL_RETURN_INITIATED');
        });

        test('quantityReturnInitiated is cumulative: 1 returned + 1 in-flight of 3 → PARTIAL_RETURN_COMPLETE', () => {
            // returnInitiated=2 already counts the 1 returned, so in-flight = 2 - 1 = 1, remaining = 1.
            expect(
                getOrderReturnStatus({
                    productItems: [
                        qtyItem('ordered', {
                            quantityOrdered: 3,
                            quantityReturnInitiated: 2,
                            quantityReturned: 1,
                        }),
                    ],
                })
            ).toBe('PARTIAL_RETURN_COMPLETE');
        });

        test('cancelled units are excluded from the active total → RETURN_COMPLETE', () => {
            // 3 ordered, 1 cancelled, 2 returned: active = 2, all returned.
            expect(
                getOrderReturnStatus({
                    productItems: [
                        qtyItem('returned', {
                            quantityOrdered: 3,
                            quantityCanceled: 1,
                            quantityReturned: 2,
                        }),
                    ],
                })
            ).toBe('RETURN_COMPLETE');
        });

        test('quantities present but no returns → undefined', () => {
            expect(
                getOrderReturnStatus({
                    productItems: [qtyItem('ordered', { quantityOrdered: 2 })],
                })
            ).toBeUndefined();
        });

        test('mixes quantity line with status-only line', () => {
            // One fully-returned multi-qty line + one untouched status-only line → partial.
            expect(
                getOrderReturnStatus({
                    productItems: [qtyItem('returned', { quantityOrdered: 2, quantityReturned: 2 }), item('ordered')],
                })
            ).toBe('PARTIAL_RETURN_COMPLETE');
        });

        test('getOrderReturnStatusConfig maps each status to the right label + shell (info for in-progress, muted for complete)', () => {
            expect(getOrderReturnStatusConfig('RETURN_INITIATED')?.labelKey).toBe('orders.returnStatus.initiated');
            expect(getOrderReturnStatusConfig('PARTIAL_RETURN_INITIATED')?.labelKey).toBe(
                'orders.returnStatus.partialInitiated'
            );
            expect(getOrderReturnStatusConfig('RETURN_COMPLETE')?.labelKey).toBe('orders.returnStatus.complete');
            expect(getOrderReturnStatusConfig('PARTIAL_RETURN_COMPLETE')?.labelKey).toBe(
                'orders.returnStatus.partialComplete'
            );
            // No return state renders with an icon (unlike `completed`/`cancelled`/`failed`/`replaced`).
            for (const status of [
                'RETURN_INITIATED',
                'PARTIAL_RETURN_INITIATED',
                'RETURN_COMPLETE',
                'PARTIAL_RETURN_COMPLETE',
            ] as const) {
                expect(getOrderReturnStatusConfig(status)?.icon).toBeUndefined();
            }
            // In-progress returns use the `info` (blue) shell so shoppers can distinguish an
            // in-flight return from one that has fully settled.
            for (const status of ['RETURN_INITIATED', 'PARTIAL_RETURN_INITIATED'] as const) {
                expect(getOrderReturnStatusConfig(status)?.className).toContain('bg-info');
                expect(getOrderReturnStatusConfig(status)?.className).toContain('text-info-foreground');
            }
            // Complete returns use the neutral `muted` (gray) shell — the return has fully settled.
            for (const status of ['RETURN_COMPLETE', 'PARTIAL_RETURN_COMPLETE'] as const) {
                expect(getOrderReturnStatusConfig(status)?.className).toContain('bg-muted');
                expect(getOrderReturnStatusConfig(status)?.className).toContain('text-muted-foreground');
            }
        });

        test('getOrderReturnStatusConfig passes undefined through', () => {
            expect(getOrderReturnStatusConfig(undefined)).toBeUndefined();
        });
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

    describe('cancel status', () => {
        test('returns cancelled badge when all items have canceled status', () => {
            const config = getOrderCancelStatusConfig({
                productItems: [{ omsData: { status: 'canceled' } }, { omsData: { status: 'canceled' } }],
            });
            expect(config?.labelKey).toBe('orders.status.cancelled');
            expect(config?.icon).toBe('x');
            expect(config?.className).toContain('critical');
        });

        test('returns undefined when not all items are canceled', () => {
            expect(
                getOrderCancelStatusConfig({
                    productItems: [{ omsData: { status: 'canceled' } }, { omsData: { status: 'shipped' } }],
                })
            ).toBeUndefined();
        });

        test('returns undefined when productItems is empty', () => {
            expect(getOrderCancelStatusConfig({ productItems: [] })).toBeUndefined();
        });

        test('returns undefined when productItems is missing', () => {
            expect(getOrderCancelStatusConfig({})).toBeUndefined();
        });

        test('returns undefined when omsData is missing on an item', () => {
            expect(
                getOrderCancelStatusConfig({
                    productItems: [{ omsData: { status: 'canceled' } }, {}],
                })
            ).toBeUndefined();
        });
    });

    describe('fulfillment display status', () => {
        // Mirrors the PWA Kit `getOrderDisplayStatus` matrix (see
        // packages/template-retail-react-app/app/utils/order-status-utils.js).

        test('all items ordered/created/approved → ORDERED', () => {
            for (const raw of ['ordered', 'created', 'approved', 'new', 'open', 'placed']) {
                expect(getOrderFulfillmentStatus({ productItems: [item(raw), item(raw)] })).toBe('ORDERED');
            }
        });

        test('all items in_progress/processing/allocated/fulfilled → IN_PROGRESS', () => {
            for (const raw of ['in_progress', 'processing', 'allocated', 'fulfilled']) {
                expect(getOrderFulfillmentStatus({ productItems: [item(raw)] })).toBe('IN_PROGRESS');
            }
        });

        test('all items shipped → SHIPPED', () => {
            expect(getOrderFulfillmentStatus({ productItems: [item('shipped'), item('shipped')] })).toBe('SHIPPED');
        });

        test('some (not all) items shipped → PARTIALLY_SHIPPED', () => {
            expect(getOrderFulfillmentStatus({ productItems: [item('shipped'), item('ordered')] })).toBe(
                'PARTIALLY_SHIPPED'
            );
        });

        test('all items delivered → DELIVERED', () => {
            expect(getOrderFulfillmentStatus({ productItems: [item('delivered'), item('delivered')] })).toBe(
                'DELIVERED'
            );
        });

        test('some (not all) items delivered → PART_ORDER_DELIVERED', () => {
            expect(getOrderFulfillmentStatus({ productItems: [item('delivered'), item('shipped')] })).toBe(
                'PART_ORDER_DELIVERED'
            );
        });

        test('cancelled units drop out of the active set', () => {
            // One cancelled + one delivered → DELIVERED (cancelled is excluded).
            expect(getOrderFulfillmentStatus({ productItems: [item('canceled'), item('delivered')] })).toBe(
                'DELIVERED'
            );
        });

        test('all items cancelled → undefined (cancel derivation handles this)', () => {
            expect(getOrderFulfillmentStatus({ productItems: [item('canceled'), item('cancelled')] })).toBeUndefined();
        });

        test('unknown status counts as in-progress (someUnknown branch)', () => {
            expect(getOrderFulfillmentStatus({ productItems: [item('some_future_state')] })).toBe('IN_PROGRESS');
        });

        test('empty productItems → undefined', () => {
            expect(getOrderFulfillmentStatus({ productItems: [] })).toBeUndefined();
            expect(getOrderFulfillmentStatus({})).toBeUndefined();
        });

        test('missing omsData yields undefined (no items carry a status)', () => {
            expect(getOrderFulfillmentStatus({ productItems: [item(), item()] })).toBeUndefined();
        });

        test('case-insensitive normalization', () => {
            expect(getOrderFulfillmentStatus({ productItems: [item('  SHIPPED  ')] })).toBe('SHIPPED');
            expect(getOrderFulfillmentStatus({ productItems: [item('Approved')] })).toBe('ORDERED');
        });

        test('per-unit expansion: shipped 1 of 2 → PARTIALLY_SHIPPED', () => {
            // Line with quantityOrdered=2, one shipped remaining, one already returned.
            expect(
                getOrderFulfillmentStatus({
                    productItems: [
                        {
                            omsData: {
                                status: 'shipped',
                                quantityOrdered: 2,
                                quantityReturnInitiated: 1,
                                quantityReturned: 1,
                            },
                        },
                        { omsData: { status: 'ordered', quantityOrdered: 1 } },
                    ],
                })
            ).toBe('PARTIALLY_SHIPPED');
        });

        test('return-initiated units drop out of fulfillment aggregation', () => {
            // Line with 2 units, both return-initiated → no active fulfillment units → undefined.
            expect(
                getOrderFulfillmentStatus({
                    productItems: [
                        {
                            omsData: {
                                status: 'shipped',
                                quantityOrdered: 2,
                                quantityReturnInitiated: 2,
                            },
                        },
                    ],
                })
            ).toBeUndefined();
        });

        test('getOrderFulfillmentStatusConfig maps each status to a label and green shell', () => {
            expect(getOrderFulfillmentStatusConfig('ORDERED')?.labelKey).toBe('orders.fulfillmentStatus.ordered');
            expect(getOrderFulfillmentStatusConfig('IN_PROGRESS')?.labelKey).toBe(
                'orders.fulfillmentStatus.inProgress'
            );
            expect(getOrderFulfillmentStatusConfig('PARTIALLY_SHIPPED')?.labelKey).toBe(
                'orders.fulfillmentStatus.partiallyShipped'
            );
            expect(getOrderFulfillmentStatusConfig('SHIPPED')?.labelKey).toBe('orders.fulfillmentStatus.shipped');
            expect(getOrderFulfillmentStatusConfig('PART_ORDER_DELIVERED')?.labelKey).toBe(
                'orders.fulfillmentStatus.partOrderDelivered'
            );
            expect(getOrderFulfillmentStatusConfig('DELIVERED')?.labelKey).toBe('orders.fulfillmentStatus.delivered');
            // All fulfillment states render in the green (success) shell to match PWA Kit.
            for (const status of [
                'ORDERED',
                'IN_PROGRESS',
                'PARTIALLY_SHIPPED',
                'SHIPPED',
                'PART_ORDER_DELIVERED',
                'DELIVERED',
            ] as const) {
                expect(getOrderFulfillmentStatusConfig(status)?.className).toContain('bg-status-positive');
            }
            // Only DELIVERED carries a check icon.
            expect(getOrderFulfillmentStatusConfig('DELIVERED')?.icon).toBe('check');
            expect(getOrderFulfillmentStatusConfig('SHIPPED')?.icon).toBeUndefined();
            expect(getOrderFulfillmentStatusConfig('ORDERED')?.icon).toBeUndefined();
        });

        test('getOrderFulfillmentStatusConfig passes undefined through', () => {
            expect(getOrderFulfillmentStatusConfig(undefined)).toBeUndefined();
        });
    });
});
