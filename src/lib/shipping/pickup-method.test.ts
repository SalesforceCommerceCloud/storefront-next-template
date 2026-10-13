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
import {
    PICKUP_SHIPPING_METHOD_ID,
    isPickupShippingMethod,
    type PickupCompatibleShippingMethod,
} from './pickup-method';

describe('PICKUP_SHIPPING_METHOD_ID', () => {
    it('is defined as "005"', () => {
        expect(PICKUP_SHIPPING_METHOD_ID).toBe('005');
    });
});

describe('isPickupShippingMethod', () => {
    describe('flag OFF (default)', () => {
        it('returns true for exact id match (005)', () => {
            const method: PickupCompatibleShippingMethod = {
                id: '005',
            };
            expect(isPickupShippingMethod(method)).toBe(true);
        });

        it('returns false for currency-suffixed id', () => {
            const method: PickupCompatibleShippingMethod = {
                id: '005-usd',
            };
            expect(isPickupShippingMethod(method)).toBe(false);
        });

        it('returns true when c_storePickupEnabled is true', () => {
            const method: PickupCompatibleShippingMethod = {
                id: 'custom-pickup',
                c_storePickupEnabled: true,
            };
            expect(isPickupShippingMethod(method)).toBe(true);
        });

        it('returns false for non-pickup method', () => {
            const method: PickupCompatibleShippingMethod = {
                id: '001',
            };
            expect(isPickupShippingMethod(method)).toBe(false);
        });

        it('returns false when id is undefined', () => {
            const method: PickupCompatibleShippingMethod = {};
            expect(isPickupShippingMethod(method)).toBe(false);
        });
    });

    describe('with pickupCurrencies', () => {
        it('returns true for exact id match (005)', () => {
            const method: PickupCompatibleShippingMethod = {
                id: '005',
            };
            expect(isPickupShippingMethod(method, { pickupCurrencies: ['USD', 'GBP'] })).toBe(true);
        });

        it('returns true for currency-suffixed id (005-usd) when USD is supported', () => {
            const method: PickupCompatibleShippingMethod = {
                id: '005-usd',
            };
            expect(isPickupShippingMethod(method, { pickupCurrencies: ['USD', 'GBP'] })).toBe(true);
        });

        it('returns true for currency-suffixed id (005-gbp) when GBP is supported', () => {
            const method: PickupCompatibleShippingMethod = {
                id: '005-gbp',
            };
            expect(isPickupShippingMethod(method, { pickupCurrencies: ['USD', 'GBP'] })).toBe(true);
        });

        it('returns false for unsupported currency suffix (005-eur)', () => {
            const method: PickupCompatibleShippingMethod = {
                id: '005-eur',
            };
            expect(isPickupShippingMethod(method, { pickupCurrencies: ['USD', 'GBP'] })).toBe(false);
        });

        it('returns true when c_storePickupEnabled is true', () => {
            const method: PickupCompatibleShippingMethod = {
                id: 'custom-pickup',
                c_storePickupEnabled: true,
            };
            expect(isPickupShippingMethod(method, { pickupCurrencies: ['USD', 'GBP'] })).toBe(true);
        });

        it('returns false for non-pickup currency-suffixed method', () => {
            const method: PickupCompatibleShippingMethod = {
                id: '001-usd',
            };
            expect(isPickupShippingMethod(method, { pickupCurrencies: ['USD', 'GBP'] })).toBe(false);
        });

        it('handles case-insensitive currency matching (005-USD matches USD)', () => {
            const method: PickupCompatibleShippingMethod = {
                id: '005-usd',
            };
            expect(isPickupShippingMethod(method, { pickupCurrencies: ['USD', 'GBP'] })).toBe(true);
        });

        it('returns false when id is undefined', () => {
            const method: PickupCompatibleShippingMethod = {};
            expect(isPickupShippingMethod(method, { pickupCurrencies: ['USD', 'GBP'] })).toBe(false);
        });
    });

    describe('structural typing', () => {
        it('accepts ShopperBasketsV2 ShippingMethod shape', () => {
            const method = {
                id: '005',
                name: 'Store Pickup',
                price: 0,
            };
            expect(isPickupShippingMethod(method)).toBe(true);
        });

        it('accepts ShopperProducts ProductShippingMethod shape', () => {
            const method = {
                id: '005',
                name: 'Store Pickup',
                description: 'Pick up at store',
                shippingMethodId: '005',
            };
            expect(isPickupShippingMethod(method)).toBe(true);
        });

        it('accepts minimal shape with just id', () => {
            const method = { id: '005' };
            expect(isPickupShippingMethod(method)).toBe(true);
        });

        it('accepts minimal shape with just c_storePickupEnabled', () => {
            const method = { c_storePickupEnabled: true };
            expect(isPickupShippingMethod(method)).toBe(true);
        });
    });
});
