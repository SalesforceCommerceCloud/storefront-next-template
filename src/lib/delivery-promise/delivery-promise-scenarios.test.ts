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
import { describe, expect, it, vi } from 'vitest';

// The delivery-promise brief's six stock scenarios, on top of the real cities/routes/bands.
vi.mock('../../../data/simplified_city_management.json', async () => {
    const actual = await vi.importActual<{ default: Record<string, unknown> }>(
        '../../../data/simplified_city_management.json'
    );
    return {
        default: {
            ...actual.default,
            inventory: [
                { productId: 'P1', stock: { 'HUB-TBS': 12, 'HUB-BUS': 6, 'HUB-KUT': 4 } },
                { productId: 'P2', stock: { 'HUB-TBS': 8, 'HUB-BUS': 0, 'HUB-KUT': 0 } },
                { productId: 'P3', stock: { 'HUB-TBS': 0, 'HUB-BUS': 5, 'HUB-KUT': 0 } },
                { productId: 'P4', stock: { 'HUB-TBS': 0, 'HUB-BUS': 0, 'HUB-KUT': 3 } },
                { productId: 'P5', stock: { 'HUB-TBS': 2, 'HUB-BUS': 0, 'HUB-KUT': 7 } },
                { productId: 'P6', stock: { 'HUB-TBS': 0, 'HUB-BUS': 0, 'HUB-KUT': 0 } },
            ],
        },
    };
});

const { buildDeliveries, calculateDeliveryDate } = await import('./index');

const today = new Date(2026, 0, 5);
const TBILISI = 'TBS';
const BATUMI = 'BUS';
const line = (productId: string, quantity = 1) => ({ productId, quantity });

describe('delivery promise brief scenarios', () => {
    it('same-city delivery: Batumi shopper, Batumi stock -> 10 km, 1 day', () => {
        expect(calculateDeliveryDate({ cityId: BATUMI, productId: 'P3', quantity: 1, today })).toMatchObject({
            locationId: 'HUB-BUS',
            distanceKm: 10,
            transitDays: 1,
            inStock: true,
        });
    });

    it('delivery from another city: Batumi shopper, Tbilisi-only product -> 370 km, 4 days', () => {
        expect(calculateDeliveryDate({ cityId: BATUMI, productId: 'P2', quantity: 1, today })).toMatchObject({
            locationId: 'HUB-TBS',
            distanceKm: 370,
            transitDays: 4,
        });
    });

    it('nearest hub wins when the own city is out of stock (Kutaisi 150 km, not Tbilisi 370 km)', () => {
        expect(calculateDeliveryDate({ cityId: BATUMI, productId: 'P5', quantity: 1, today })).toMatchObject({
            locationId: 'HUB-KUT',
            distanceKm: 150,
            transitDays: 2,
        });
    });

    it('nearest hub with stock wins when several have it (own city first)', () => {
        expect(calculateDeliveryDate({ cityId: TBILISI, productId: 'P1', quantity: 1, today }).locationId).toBe(
            'HUB-TBS'
        );
    });

    it('out of stock everywhere -> unavailable', () => {
        expect(calculateDeliveryDate({ cityId: TBILISI, productId: 'P6', quantity: 1, today }).inStock).toBe(false);
    });

    it('not enough quantity in the own city falls back to another hub (2 in Tbilisi, 3 wanted -> Kutaisi)', () => {
        expect(calculateDeliveryDate({ cityId: TBILISI, productId: 'P5', quantity: 3, today })).toMatchObject({
            locationId: 'HUB-KUT',
            inStock: true,
        });
        expect(calculateDeliveryDate({ cityId: TBILISI, productId: 'P5', quantity: 2, today }).locationId).toBe(
            'HUB-TBS'
        );
    });

    it('one order splits into deliveries: Batumi shopper, products 2 and 3 -> Tbilisi (4 days) + Batumi (1 day)', () => {
        const deliveries = buildDeliveries([line('P2'), line('P3')], BATUMI, { today });
        expect(deliveries.map((d) => [d.locationId, d.transitDays])).toEqual([
            ['HUB-TBS', 4],
            ['HUB-BUS', 1],
        ]);
    });

    it('items from the same hub are grouped: Tbilisi shopper, products 1 and 2 -> one delivery', () => {
        const deliveries = buildDeliveries([line('P1'), line('P2')], TBILISI, { today });
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0].items).toHaveLength(2);
    });

    it('each delivery gets its own tracking number with its hub prefix', () => {
        const [first, second] = buildDeliveries([line('P2'), line('P3')], BATUMI, { today, trackingSeed: 'ORD-1' });
        expect(first.trackingNumber).toMatch(/^DRS-TBS-\d{8}$/);
        expect(second.trackingNumber).toMatch(/^DRS-BUS-\d{8}$/);
    });

    it('every city x product combination resolves with a date and a known distance', () => {
        for (const cityId of [TBILISI, BATUMI, 'KUT']) {
            for (const productId of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
                const promise = calculateDeliveryDate({ cityId, productId, quantity: 1, today });
                expect(Number.isFinite(promise.distanceKm)).toBe(true);
                expect(promise.deliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            }
        }
    });
});
