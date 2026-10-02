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
import type { ShopperOrders, ShopperProducts } from '@/scapi';
import { getItemEligibility, groupLinesByDelivery } from './eligibility';
import { buildReturnableLines, getOrderDeliveredAt } from './order-lines';

type Order = ShopperOrders.schemas['Order'];

const split = {
    version: 1,
    shopperCityId: 'BUS',
    deliveries: [
        {
            id: 'D1',
            hubId: 'HUB-BUS',
            city: 'Batumi',
            distanceKm: 20,
            leadTimeDays: 1,
            deliveryDate: '2026-09-10',
            trackingNumber: 'DRS-BUS-00000001',
            items: [{ itemId: 'a1', productId: 'DU-879125-M', quantity: 1 }],
        },
        {
            id: 'D2',
            hubId: 'HUB-TBS',
            city: 'Tbilisi',
            distanceKm: 370,
            leadTimeDays: 4,
            deliveryDate: '2026-09-25',
            trackingNumber: 'DRS-TBS-00000002',
            items: [{ itemId: 'b2', productId: 'DU-879251-S', quantity: 2 }],
        },
    ],
};

const order = (overrides: Record<string, unknown> = {}): Order =>
    ({
        orderNo: 'O1',
        creationDate: '2026-09-01T10:00:00.000Z',
        productItems: [
            { itemId: 'a1', productId: 'DU-879125-M', quantity: 1, shipmentId: 'me', productName: 'Polo' },
            { itemId: 'b2', productId: 'DU-879251-S', quantity: 2, shipmentId: 'me', productName: 'Shirt' },
        ],
        ...overrides,
    }) as unknown as Order;

const products = {} as Record<string, ShopperProducts.schemas['Product'] | undefined>;

describe('buildReturnableLines with a saved delivery split', () => {
    const lines = buildReturnableLines(order({ c_deliverySplit: JSON.stringify(split) }), products, {});

    it('groups lines by the saved delivery id instead of the single SFCC shipment', () => {
        expect(lines.map((line) => line.deliveryId)).toEqual(['D1', 'D2']);
        expect(groupLinesByDelivery(lines).map((group) => group.deliveryId)).toEqual(['D1', 'D2']);
        expect(lines.map((line) => line.deliveryCity)).toEqual(['Batumi', 'Tbilisi']);
    });

    it('starts each line window on its own delivery date, not the order date', () => {
        expect(lines.map((line) => line.deliveredAt)).toEqual(['2026-09-10', '2026-09-25']);
    });

    it('lets each delivery close its window on its own day (30 days after delivery)', () => {
        // Window ends the whole day of 2026-10-10 for D1 and 2026-10-25 for D2.
        const onOct10 = new Date('2026-10-10T20:00:00Z');
        const onOct11 = new Date('2026-10-11T00:30:00Z');
        expect(getItemEligibility(lines[0], onOct10).status).toBe('eligible');
        expect(getItemEligibility(lines[0], onOct11).status).toBe('window-closed');
        expect(getItemEligibility(lines[1], onOct11).status).toBe('eligible');
        expect(getItemEligibility(lines[1], new Date('2026-10-26T00:30:00Z')).status).toBe('window-closed');
    });
});

describe('buildReturnableLines without a saved split (older orders)', () => {
    it.each([
        undefined,
        '',
        'not json',
        JSON.stringify({ version: 9 }),
    ])('falls back to shipment and order date for %p', (raw) => {
        const lines = buildReturnableLines(order({ c_deliverySplit: raw }), products, {});
        expect(lines.map((line) => line.deliveryId)).toEqual(['me', 'me']);
        expect(lines.every((line) => line.deliveryCity === undefined)).toBe(true);
        expect(lines.every((line) => line.deliveredAt === '2026-09-01T10:00:00.000Z')).toBe(true);
    });

    it('prefers the latest OMS delivery date over the order date', () => {
        const withOms = order({
            omsData: {
                shipments: [
                    { actualDeliveryDate: '2026-09-05T00:00:00Z' },
                    { actualDeliveryDate: '2026-09-07T00:00:00Z' },
                ],
            },
        });
        expect(getOrderDeliveredAt(withOms)).toBe('2026-09-07T00:00:00.000Z');
    });

    it('uses order-level values for a line the split does not mention', () => {
        const partial = { ...split, deliveries: [split.deliveries[0]] };
        const lines = buildReturnableLines(order({ c_deliverySplit: JSON.stringify(partial) }), products, {});
        expect(lines.map((line) => line.deliveryId)).toEqual(['D1', 'me']);
        expect(lines[1].deliveredAt).toBe('2026-09-01T10:00:00.000Z');
    });
});
