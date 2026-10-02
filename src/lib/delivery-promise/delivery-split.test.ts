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
    DELIVERY_SPLIT_VERSION,
    buildDeliverySplit,
    findDeliveryForItem,
    hasDeliveryData,
    parseDeliverySplit,
    serializeDeliverySplit,
} from './index';

const TODAY = new Date(2026, 9, 1); // 1 Oct 2026, local
// DU-879242 ships from Batumi, DU-879251 from Tbilisi (see data/simplified_city_management.json).
const batumiItem = { itemId: 'a1', productId: 'DU-879242-M', quantity: 1 };
const tbilisiItem = { itemId: 'b2', productId: 'DU-879251-S', quantity: 2 };
const options = { today: TODAY, trackingSeed: 'basket-1', hasDeliveryData };

describe('buildDeliverySplit', () => {
    it('splits a Batumi shopper mixed basket into one delivery per hub', () => {
        const split = buildDeliverySplit([batumiItem, tbilisiItem], 'BUS', options);
        expect(split?.version).toBe(DELIVERY_SPLIT_VERSION);
        expect(split?.shopperCityId).toBe('BUS');
        expect(split?.deliveries).toHaveLength(2);
        expect(split?.deliveries.map((d) => d.id)).toEqual(['D1', 'D2']);
        expect(split?.deliveries.map((d) => d.hubId).sort()).toEqual(['HUB-BUS', 'HUB-TBS']);
        for (const delivery of split?.deliveries ?? []) {
            expect(delivery.deliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(delivery.trackingNumber).toBeTruthy();
            expect(delivery.leadTimeDays).toBeGreaterThanOrEqual(0);
        }
        expect(split?.deliveries.flatMap((d) => d.items.map((i) => i.itemId)).sort()).toEqual(['a1', 'b2']);
    });

    it('is not affected by the shopper changing city later, because it is data, not a calculation', () => {
        const original = buildDeliverySplit([batumiItem, tbilisiItem], 'BUS', options);
        if (!original) throw new Error('expected a split');
        const saved = serializeDeliverySplit(original);
        // A new calculation for a Tbilisi shopper would differ; the saved record does not.
        const recalculated = buildDeliverySplit([batumiItem, tbilisiItem], 'TBS', options);
        expect(JSON.stringify(recalculated)).not.toBe(saved);
        expect(parseDeliverySplit(saved)?.shopperCityId).toBe('BUS');
    });

    it('is stable for the same basket, including tracking numbers', () => {
        const a = buildDeliverySplit([batumiItem, tbilisiItem], 'BUS', options);
        const b = buildDeliverySplit([batumiItem, tbilisiItem], 'BUS', options);
        expect(a).toEqual(b);
    });

    it('skips lines with no hub data and returns null when nothing is left', () => {
        const unknown = { itemId: 'z9', productId: 'NOT-IN-INVENTORY', quantity: 1 };
        expect(buildDeliverySplit([batumiItem, unknown], 'BUS', options)?.deliveries[0].items).toHaveLength(1);
        expect(buildDeliverySplit([unknown], 'BUS', options)).toBeNull();
        expect(buildDeliverySplit([], 'BUS', options)).toBeNull();
    });

    it('falls back to the default city for an unknown city id', () => {
        expect(buildDeliverySplit([batumiItem], 'NOPE', options)?.shopperCityId).toBe('TBS');
    });
});

describe('parseDeliverySplit', () => {
    const split = buildDeliverySplit([batumiItem, tbilisiItem], 'BUS', options);
    if (!split) throw new Error('expected a split');

    it('round-trips through JSON', () => {
        expect(parseDeliverySplit(serializeDeliverySplit(split))).toEqual(split);
    });

    it('accepts an already parsed object', () => {
        expect(parseDeliverySplit(JSON.parse(serializeDeliverySplit(split)))).toEqual(split);
    });

    it.each([undefined, null, '', '   ', '{not json', '[]', '{}', 42])('returns null for %p', (value) => {
        expect(parseDeliverySplit(value)).toBeNull();
    });

    it('returns null for an unknown version, so a future format never crashes an old page', () => {
        expect(parseDeliverySplit({ ...split, version: 2 })).toBeNull();
    });

    it('returns null when a delivery or item is malformed', () => {
        expect(
            parseDeliverySplit({ ...split, deliveries: [{ ...split.deliveries[0], deliveryDate: 'tomorrow' }] })
        ).toBeNull();
        expect(
            parseDeliverySplit({
                ...split,
                deliveries: [{ ...split.deliveries[0], items: [{ itemId: 'a', productId: 'p', quantity: 0 }] }],
            })
        ).toBeNull();
        expect(parseDeliverySplit({ ...split, deliveries: [] })).toBeNull();
    });
});

describe('findDeliveryForItem', () => {
    it('finds the delivery that holds a line', () => {
        const split = buildDeliverySplit([batumiItem, tbilisiItem], 'BUS', options);
        expect(findDeliveryForItem(split, 'a1')?.hubId).toBe('HUB-BUS');
        expect(findDeliveryForItem(split, 'b2')?.hubId).toBe('HUB-TBS');
        expect(findDeliveryForItem(split, 'missing')).toBeUndefined();
        expect(findDeliveryForItem(null, 'a1')).toBeUndefined();
    });
});
