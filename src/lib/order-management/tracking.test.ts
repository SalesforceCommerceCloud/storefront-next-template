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
import { getOrderTrackingEntries, parseTrackingDate } from '@/lib/order-management/tracking';

/** Build a mock order with the given OMS shipments under `omsData`. */
function orderWithOms(shipments: unknown[]): OrderLike {
    return { orderNo: 'order-1', omsData: { shipments } } as unknown as OrderLike;
}

/** Build a mock order with the given legacy ECOM shipments. */
function orderWithEcom(shipments: unknown[]): OrderLike {
    return { orderNo: 'order-1', shipments } as unknown as OrderLike;
}

describe('getOrderTrackingEntries', () => {
    it('returns OMS entries (all fields) when omsData.shipments is present', () => {
        const order = orderWithOms([
            {
                id: 'shp-1',
                status: 'shipped',
                provider: 'UPS',
                trackingNumber: '1Z999',
                trackingUrl: 'https://ups.com/track?n=1Z999',
                expectedDeliveryDate: '2026-06-20T10:00:00.000Z',
                actualDeliveryDate: '2026-06-19T15:00:00.000Z',
            },
        ]);

        const entries = getOrderTrackingEntries(order);

        expect(entries).toEqual([
            {
                id: 'shp-1',
                status: 'shipped',
                provider: 'UPS',
                trackingNumber: '1Z999',
                trackingUrl: 'https://ups.com/track?n=1Z999',
                expectedDeliveryDate: '2026-06-20T10:00:00.000Z',
                actualDeliveryDate: '2026-06-19T15:00:00.000Z',
            },
        ]);
    });

    it('falls back to ECOM shipments (number + status only) when no OMS shipments', () => {
        const order = orderWithEcom([{ shipmentId: 'me', shippingStatus: 'shipped', trackingNumber: 'ECOM-1' }]);

        const entries = getOrderTrackingEntries(order);

        expect(entries).toEqual([{ id: 'me', status: 'shipped', trackingNumber: 'ECOM-1' }]);
        // provider / trackingUrl / dates are OMS-only and must be absent on ECOM
        expect(entries[0].provider).toBeUndefined();
        expect(entries[0].trackingUrl).toBeUndefined();
        expect(entries[0].expectedDeliveryDate).toBeUndefined();
    });

    it('returns [] when neither OMS nor ECOM shipments are present', () => {
        expect(getOrderTrackingEntries({ orderNo: 'o' } as OrderLike)).toEqual([]);
        expect(getOrderTrackingEntries(orderWithOms([]))).toEqual([]);
        expect(getOrderTrackingEntries(orderWithEcom([]))).toEqual([]);
    });

    it('filters out entries that have no tracking-relevant fields', () => {
        const order = orderWithOms([
            { id: 'empty' }, // no status/provider/number/url → dropped
            { id: 'keep', trackingNumber: 'T-1' },
        ]);

        const entries = getOrderTrackingEntries(order);

        expect(entries).toHaveLength(1);
        expect(entries[0].id).toBe('keep');
    });

    it('uses a positional fallback id only when the OMS shipment has no id', () => {
        const order = orderWithOms([{ trackingNumber: 'T-1' }]);
        expect(getOrderTrackingEntries(order)[0].id).toBe('oms-0');
    });

    it('normalizes whitespace-only string fields to undefined so a blank OMS value does not fake a tracking card', () => {
        // OMS can return "" or a padded string for a field it means as "unset". Left raw,
        // a whitespace-only value is truthy and slips past hasTrackingData / the render gate,
        // producing an empty tracking card or a "Track shipment" action that links nowhere.
        const order = orderWithOms([
            {
                id: 'blank',
                status: '  ',
                provider: '',
                trackingNumber: ' \t ',
                trackingUrl: '   ',
            },
        ]);

        // every tracking field was blank → the entry has no real data → it is dropped entirely
        expect(getOrderTrackingEntries(order)).toEqual([]);
    });

    it('trims surrounding whitespace on kept OMS fields', () => {
        const order = orderWithOms([
            {
                id: 'k',
                status: '  shipped  ',
                provider: ' UPS ',
                trackingNumber: ' 1Z999 ',
                trackingUrl: ' https://ups.com/t ',
            },
        ]);
        const [entry] = getOrderTrackingEntries(order);
        expect(entry.status).toBe('shipped');
        expect(entry.provider).toBe('UPS');
        expect(entry.trackingNumber).toBe('1Z999');
        expect(entry.trackingUrl).toBe('https://ups.com/t');
    });

    it('normalizes blank ECOM fields too (a padded shippingStatus/trackingNumber becomes undefined)', () => {
        const order = orderWithEcom([{ shipmentId: 'e', shippingStatus: '  ', trackingNumber: '  ' }]);
        // both fields blank → entry dropped
        expect(getOrderTrackingEntries(order)).toEqual([]);
    });

    it('keeps a date-only OMS entry (delivery date is tracking-relevant — consistent with the render gate)', () => {
        // A carrier delivery date can be known before a tracking number is generated.
        // The mapper must NOT drop such an entry (it did before the predicates were aligned).
        const order = orderWithOms([{ id: 'd1', expectedDeliveryDate: '2026-06-20T10:00:00.000Z' }]);
        const entries = getOrderTrackingEntries(order);
        expect(entries).toHaveLength(1);
        expect(entries[0].expectedDeliveryDate).toBe('2026-06-20T10:00:00.000Z');
        expect(entries[0].trackingNumber).toBeUndefined();
    });

    // --- behavior-lock: NO positional OMS↔ECOM pairing ---
    it('returns the whole OMS list and never index-pairs it with the ECOM list', () => {
        // This fixture is engineered to FAIL any positional (zip-by-index) join,
        // regardless of merge order:
        //   - The single OMS shipment has NO `id` and NO `status`.
        //   - ECOM index 0 has a distinctive `shipmentId`/`shippingStatus`.
        // A zip that lets ECOM win → leaks `status: 'ecom-only-shipped'` and/or
        //   id 'ecom-A'. A zip that lets OMS win → still pulls the id from ECOM
        //   for the missing OMS id (or leaves status defined from ECOM).
        // The ONLY way every assertion below holds is if entries come purely
        // from the OMS list with NO ECOM field bleeding in by index.
        const order = {
            orderNo: 'order-1',
            omsData: {
                shipments: [{ provider: 'FedEx', trackingNumber: 'OMS-B' }],
            },
            shipments: [
                {
                    shipmentId: 'ecom-A',
                    shippingStatus: 'ecom-only-shipped',
                    trackingNumber: 'ECOM-A',
                },
                { shipmentId: 'ecom-B', shippingStatus: 'shipped', trackingNumber: 'ECOM-B' },
            ],
        } as unknown as OrderLike;

        const entries = getOrderTrackingEntries(order);

        // exactly the OMS list — not 2, not a positional mix
        expect(entries).toHaveLength(1);
        expect(entries[0].trackingNumber).toBe('OMS-B');
        expect(entries[0].provider).toBe('FedEx');
        // id is the OMS positional fallback (`oms-0`), NOT the ECOM shipmentId —
        // proves the id did not come from order.shipments[0]
        expect(entries[0].id).toBe('oms-0');
        // status stays undefined — the ECOM `shippingStatus` did NOT bleed in by index
        expect(entries[0].status).toBeUndefined();
        // no ECOM tracking number leaked in by index
        expect(entries.some((e) => e.trackingNumber?.startsWith('ECOM'))).toBe(false);
    });

    it('does NOT fall back to ECOM when OMS shipments are present but all filtered out (OMS is the source of truth)', () => {
        // OMS present (length > 0) but every entry is empty → returns [] from the
        // OMS branch; it must NOT silently fall back to the ECOM list.
        const order = {
            orderNo: 'order-1',
            omsData: { shipments: [{ id: 'empty-1' }, { id: 'empty-2' }] },
            shipments: [{ shipmentId: 'e', shippingStatus: 'shipped', trackingNumber: 'ECOM-X' }],
        } as unknown as OrderLike;

        expect(getOrderTrackingEntries(order)).toEqual([]);
    });
});

describe('parseTrackingDate (two-layer guard)', () => {
    it('returns null for null — THE load-bearing guard-1 regression line', () => {
        // `null` is the ONLY input that requires guard 1 (`if (!value) return null`).
        // `new Date(null)` is the 1970 epoch (getTime() === 0), NOT an Invalid Date,
        // so an isNaN-only guard would return that epoch Date and the UI would render
        // "Dec 31, 1969". This single assertion fails if guard 1 is removed.
        expect(parseTrackingDate(null)).toBeNull();
        // sanity: confirm the trap exists in the runtime (epoch, not NaN)
        const epoch = new Date(null as unknown as string);
        expect(isNaN(epoch.getTime())).toBe(false);
        expect(epoch.getTime()).toBe(0);
    });

    it('returns null for undefined and empty string (also caught by the falsy guard)', () => {
        expect(parseTrackingDate(undefined)).toBeNull();
        expect(parseTrackingDate('')).toBeNull();
    });

    it('returns null for a truthy-but-unparseable string and never throws (guard 2)', () => {
        expect(() => parseTrackingDate('not-a-date')).not.toThrow();
        expect(parseTrackingDate('not-a-date')).toBeNull();
    });

    it('parses a valid ISO date string', () => {
        const d = parseTrackingDate('2026-06-20T10:00:00.000Z');
        expect(d).toBeInstanceOf(Date);
        expect(d?.toISOString()).toBe('2026-06-20T10:00:00.000Z');
    });
});
