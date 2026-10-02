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
import { beforeEach, describe, expect, it } from 'vitest';
import {
    changeLocation,
    EMPTY_CART_FULFILLMENT_STATE,
    groupByLocation,
    parseCartFulfillmentState,
    reconcileWithBasket,
    removeItem,
    resolveCartItems,
    updateQuantity,
    upsertItem,
} from './cart-fulfillment';
import {
    getDefaultLocation,
    getLocationAvailability,
    getMasterProductId,
    sortLocationsByPreference,
    toCartFulfillment,
} from './availability';
import { buildFulfillmentPayload } from './payload';
import {
    CART_FULFILLMENT_STORAGE_KEY,
    getCartFulfillmentSnapshot,
    updateCartFulfillmentState,
    writeCartFulfillmentState,
} from './storage';
import { getSelectedLocation, setSelectedLocationId } from './selected-location';
import { recordAddedItemFulfillment } from './record-added-item';
import type { CartFulfillment, CartFulfillmentItem, LocationAvailability } from './types';

const tbilisi: CartFulfillment = {
    locationId: 'LOC-001',
    city: 'Tbilisi',
    postalCode: '0105',
    stockLevel: 15,
    distance: 8,
    distanceUnit: 'KM',
    leadTime: 2,
    leadTimeUnit: 'DAYS',
};
const batumi: CartFulfillment = { ...tbilisi, locationId: 'LOC-002', city: 'Batumi', postalCode: '6000', leadTime: 3 };

const item = (productId: string, fulfillment: CartFulfillment, quantity = 1): CartFulfillmentItem => ({
    productId,
    productName: `Name ${productId}`,
    sku: productId,
    quantity,
    fulfillment,
});

describe('cart fulfillment state transitions', () => {
    it('adds, updates quantity, changes location and removes', () => {
        let state = upsertItem(EMPTY_CART_FULFILLMENT_STATE, item('A', tbilisi));
        state = upsertItem(state, item('B', batumi));
        expect(state.cartItems.map((i) => i.productId)).toEqual(['A', 'B']);

        state = updateQuantity(state, 'A', 3);
        expect(state.cartItems[0].quantity).toBe(3);

        state = changeLocation(state, 'A', batumi);
        expect(state.cartItems[0].fulfillment.city).toBe('Batumi');

        state = removeItem(state, 'A');
        expect(state.cartItems.map((i) => i.productId)).toEqual(['B']);
    });

    it('replaces an existing product instead of duplicating it', () => {
        let state = upsertItem(EMPTY_CART_FULFILLMENT_STATE, item('A', tbilisi, 1));
        state = upsertItem(state, item('A', batumi, 2));
        expect(state.cartItems).toHaveLength(1);
        expect(state.cartItems[0]).toMatchObject({ quantity: 2, fulfillment: { city: 'Batumi' } });
    });

    it('removes an item when the quantity drops to zero', () => {
        const state = upsertItem(EMPTY_CART_FULFILLMENT_STATE, item('A', tbilisi));
        expect(updateQuantity(state, 'A', 0).cartItems).toEqual([]);
    });

    it('returns the same state reference when removing an unknown product', () => {
        const state = upsertItem(EMPTY_CART_FULFILLMENT_STATE, item('A', tbilisi));
        expect(removeItem(state, 'missing')).toBe(state);
    });
});

describe('groupByLocation', () => {
    it('groups A,D under Tbilisi, B under Batumi, keeping first-seen order', () => {
        const groups = groupByLocation([item('A', tbilisi), item('B', batumi), item('D', tbilisi)]);
        expect(groups.map((g) => [g.city, g.items.map((i) => i.productId)])).toEqual([
            ['Tbilisi', ['A', 'D']],
            ['Batumi', ['B']],
        ]);
    });
});

describe('reconcileWithBasket', () => {
    const known = 'DU-893268-34'; // variant of a product that has fulfillment data

    it('drops products no longer in the basket and syncs quantities', () => {
        const state = upsertItem(EMPTY_CART_FULFILLMENT_STATE, item(known, tbilisi, 1));
        const removed = reconcileWithBasket(state, []);
        expect(removed.cartItems).toEqual([]);

        const bumped = reconcileWithBasket(state, [{ productId: known, productName: 'X', quantity: 4 }]);
        expect(bumped.cartItems[0].quantity).toBe(4);
    });

    it('adds an entry (default location) for a basket line without one', () => {
        const next = reconcileWithBasket(EMPTY_CART_FULFILLMENT_STATE, [
            { productId: known, productName: 'X', quantity: 2 },
        ]);
        expect(next.cartItems).toHaveLength(1);
        expect(next.cartItems[0].fulfillment.locationId).toBe(getDefaultLocation(known)?.fulfillmentLocationId);
    });

    it('ignores basket lines that have no fulfillment data', () => {
        const next = reconcileWithBasket(EMPTY_CART_FULFILLMENT_STATE, [
            { productId: 'UNKNOWN-1', productName: 'X', quantity: 1 },
        ]);
        expect(next).toBe(EMPTY_CART_FULFILLMENT_STATE);
    });

    it('returns the same reference when nothing changed', () => {
        const lines = [{ productId: known, productName: 'X', quantity: 2 }];
        const once = reconcileWithBasket(EMPTY_CART_FULFILLMENT_STATE, lines);
        expect(reconcileWithBasket(once, lines)).toBe(once);
    });

    it('keeps the stored location while taking name and quantity from the basket', () => {
        const state = upsertItem(EMPTY_CART_FULFILLMENT_STATE, item(known, batumi, 1));
        const [resolved] = resolveCartItems([{ productId: known, productName: 'Live name', quantity: 3 }], state);
        expect(resolved).toMatchObject({ productName: 'Live name', quantity: 3, fulfillment: { city: 'Batumi' } });
    });
});

describe('parseCartFulfillmentState', () => {
    it('returns empty for null, garbage and wrong shapes', () => {
        expect(parseCartFulfillmentState(null)).toBe(EMPTY_CART_FULFILLMENT_STATE);
        expect(parseCartFulfillmentState('not json')).toBe(EMPTY_CART_FULFILLMENT_STATE);
        expect(parseCartFulfillmentState('{"cartItems":"x"}')).toBe(EMPTY_CART_FULFILLMENT_STATE);
    });

    it('drops invalid entries and keeps valid ones', () => {
        const raw = JSON.stringify({ cartItems: [item('A', tbilisi), { productId: 'bad' }, null] });
        expect(parseCartFulfillmentState(raw).cartItems.map((i) => i.productId)).toEqual(['A']);
    });
});

describe('availability data', () => {
    it('resolves master and variant ids to the same product', () => {
        expect(getMasterProductId('DU-893268')).toBe('DU-893268');
        expect(getMasterProductId('DU-893268-34')).toBe('DU-893268');
        expect(getMasterProductId('nope')).toBeUndefined();
        expect(getLocationAvailability('DU-893268-34').length).toBeGreaterThan(0);
    });

    it('sorts in-stock first, then shortest lead time, then closest', () => {
        const base: LocationAvailability = {
            fulfillmentLocationId: 'x',
            city: 'x',
            postalCode: '0',
            stockLevel: 5,
            distance: 10,
            distanceUnit: 'KM',
            leadTime: 3,
            leadTimeUnit: 'DAYS',
        };
        const sorted = sortLocationsByPreference([
            { ...base, city: 'out', stockLevel: 0, leadTime: null },
            { ...base, city: 'slow', leadTime: 4 },
            { ...base, city: 'fast', leadTime: 2 },
        ]);
        expect(sorted.map((l) => l.city)).toEqual(['fast', 'slow', 'out']);
    });

    it('maps a location to the cart fulfillment block', () => {
        const location = getDefaultLocation('DU-893268');
        expect(location).toBeDefined();
        expect(toCartFulfillment(location as LocationAvailability)).toMatchObject({
            locationId: location?.fulfillmentLocationId,
            leadTimeUnit: 'DAYS',
        });
    });
});

describe('scapi payload', () => {
    it('builds one entry per item with its own fulfillment block', () => {
        const payload = buildFulfillmentPayload('ORD-1001', [item('A', tbilisi), item('B', batumi, 2)]);
        expect(payload).toEqual({
            orderId: 'ORD-1001',
            items: [
                { productId: 'A', sku: 'A', quantity: 1, fulfillment: tbilisi },
                { productId: 'B', sku: 'B', quantity: 2, fulfillment: batumi },
            ],
        });
    });
});

describe('browser storage', () => {
    beforeEach(() => {
        window.localStorage.clear();
        writeCartFulfillmentState(EMPTY_CART_FULFILLMENT_STATE);
    });

    it('persists JSON in localStorage and removes the key when empty', () => {
        writeCartFulfillmentState(upsertItem(EMPTY_CART_FULFILLMENT_STATE, item('A', tbilisi)));
        expect(JSON.parse(window.localStorage.getItem(CART_FULFILLMENT_STORAGE_KEY) ?? '{}').cartItems).toHaveLength(1);
        expect(getCartFulfillmentSnapshot().cartItems[0].productId).toBe('A');

        updateCartFulfillmentState((state) => removeItem(state, 'A'));
        expect(window.localStorage.getItem(CART_FULFILLMENT_STORAGE_KEY)).toBeNull();
    });

    it('returns a stable snapshot reference while the stored string is unchanged', () => {
        writeCartFulfillmentState(upsertItem(EMPTY_CART_FULFILLMENT_STATE, item('A', tbilisi)));
        expect(getCartFulfillmentSnapshot()).toBe(getCartFulfillmentSnapshot());
    });

    it('recordAddedItemFulfillment stores the selected location with the basket quantity', () => {
        const productId = 'DU-893268-34';
        const other = getLocationAvailability(productId)[0];
        setSelectedLocationId(productId, other.fulfillmentLocationId);
        expect(getSelectedLocation(productId)?.fulfillmentLocationId).toBe(other.fulfillmentLocationId);

        recordAddedItemFulfillment({ productItems: [{ productId, productName: 'Pullover', quantity: 2 }] }, productId);
        expect(getCartFulfillmentSnapshot().cartItems[0]).toMatchObject({
            productId,
            quantity: 2,
            fulfillment: { locationId: other.fulfillmentLocationId },
        });
    });

    it('recordAddedItemFulfillment ignores products without fulfillment data', () => {
        recordAddedItemFulfillment({ productItems: [{ productId: 'UNKNOWN', quantity: 1 }] }, 'UNKNOWN');
        expect(getCartFulfillmentSnapshot().cartItems).toEqual([]);
    });
});
