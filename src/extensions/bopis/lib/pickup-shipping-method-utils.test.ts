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
import type { ShopperBasketsV2 } from '@/scapi';
import { getPickupShippingMethodId } from './pickup-shipping-method-utils';

describe('getPickupShippingMethodId', () => {
    describe('flag OFF (default)', () => {
        it('returns exact id match (005)', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [
                    { id: '001', name: 'Ground', price: 5.99 },
                    { id: '005', name: 'Store Pickup', price: 0 },
                ],
            };
            expect(getPickupShippingMethodId(result)).toBe('005');
        });

        it('returns null for currency-suffixed id', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [
                    { id: '001', name: 'Ground', price: 5.99 },
                    { id: '005-usd', name: 'Store Pickup USD', price: 0 },
                ],
            };
            expect(getPickupShippingMethodId(result)).toBeNull();
        });

        it('returns id when c_storePickupEnabled is true', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [
                    { id: '001', name: 'Ground', price: 5.99 },
                    { id: 'custom-pickup', name: 'Custom Pickup', price: 0, c_storePickupEnabled: true },
                ],
            };
            expect(getPickupShippingMethodId(result)).toBe('custom-pickup');
        });

        it('returns null when no pickup method found', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [
                    { id: '001', name: 'Ground', price: 5.99 },
                    { id: '002', name: 'Express', price: 12.99 },
                ],
            };
            expect(getPickupShippingMethodId(result)).toBeNull();
        });

        it('returns null for null result', () => {
            expect(getPickupShippingMethodId(null)).toBeNull();
        });

        it('returns null for undefined result', () => {
            expect(getPickupShippingMethodId(undefined)).toBeNull();
        });

        it('returns null for empty methods array', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [],
            };
            expect(getPickupShippingMethodId(result)).toBeNull();
        });

        it('returns null when only non-pickup methods exist (flag off)', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [
                    { id: '001', name: 'Free Shipping', price: 0 },
                    { id: '002', name: 'Ground', price: 5.99 },
                ],
            };
            expect(getPickupShippingMethodId(result)).toBeNull();
        });
    });

    describe('with pickupCurrencies', () => {
        it('returns exact id match (005)', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [
                    { id: '001', name: 'Ground', price: 5.99 },
                    { id: '005', name: 'Store Pickup', price: 0 },
                ],
            };
            expect(getPickupShippingMethodId(result, { pickupCurrencies: ['USD', 'GBP'] })).toBe('005');
        });

        it('returns currency-suffixed id (005-usd)', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [
                    { id: '001-usd', name: 'Ground USD', price: 5.99 },
                    { id: '005-usd', name: 'Store Pickup USD', price: 0 },
                ],
            };
            expect(getPickupShippingMethodId(result, { pickupCurrencies: ['USD', 'GBP'] })).toBe('005-usd');
        });

        it('returns currency-suffixed id (005-gbp)', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [
                    { id: '001-gbp', name: 'Ground GBP', price: 5.99 },
                    { id: '005-gbp', name: 'Store Pickup GBP', price: 0 },
                ],
            };
            expect(getPickupShippingMethodId(result, { pickupCurrencies: ['USD', 'GBP'] })).toBe('005-gbp');
        });

        it('returns first pickup method when multiple exist', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [
                    { id: '005-usd', name: 'Store Pickup USD', price: 0 },
                    { id: '005-gbp', name: 'Store Pickup GBP', price: 0 },
                ],
            };
            expect(getPickupShippingMethodId(result, { pickupCurrencies: ['USD', 'GBP'] })).toBe('005-usd');
        });

        it('returns id when c_storePickupEnabled is true', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [
                    { id: '001', name: 'Ground', price: 5.99 },
                    { id: 'custom-pickup', name: 'Custom Pickup', price: 0, c_storePickupEnabled: true },
                ],
            };
            expect(getPickupShippingMethodId(result, { pickupCurrencies: ['USD', 'GBP'] })).toBe('custom-pickup');
        });

        it('returns null when no pickup match (no free-shipping fallback)', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [
                    { id: '001', name: 'Ground', price: 5.99 },
                    { id: '002', name: 'Free Shipping', price: 0 },
                ],
            };
            expect(getPickupShippingMethodId(result, { pickupCurrencies: ['USD', 'GBP'] })).toBeNull();
        });

        it('returns the pickup match even when a free non-pickup method is present', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [
                    { id: '002', name: 'Free Shipping', price: 0 },
                    { id: '005-usd', name: 'Store Pickup USD', price: 0 },
                ],
            };
            expect(getPickupShippingMethodId(result, { pickupCurrencies: ['USD', 'GBP'] })).toBe('005-usd');
        });

        it('does not match an unsupported currency suffix (005-eur) and returns null', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [
                    { id: '001', name: 'Ground', price: 5.99 },
                    { id: '005-eur', name: 'Store Pickup EUR', price: 0 },
                ],
            };
            // EUR is not in ['USD', 'GBP'], so 005-eur is not recognized as pickup and there is no fallback
            expect(getPickupShippingMethodId(result, { pickupCurrencies: ['USD', 'GBP'] })).toBeNull();
        });

        it('returns null when no pickup method found', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [
                    { id: '001', name: 'Ground', price: 5.99 },
                    { id: '002', name: 'Express', price: 12.99 },
                ],
            };
            expect(getPickupShippingMethodId(result, { pickupCurrencies: ['USD', 'GBP'] })).toBeNull();
        });

        it('returns null for null result', () => {
            expect(getPickupShippingMethodId(null, { pickupCurrencies: ['USD', 'GBP'] })).toBeNull();
        });

        it('returns null for undefined result', () => {
            expect(getPickupShippingMethodId(undefined, { pickupCurrencies: ['USD', 'GBP'] })).toBeNull();
        });

        it('returns null for empty methods array', () => {
            const result: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
                applicableShippingMethods: [],
            };
            expect(getPickupShippingMethodId(result, { pickupCurrencies: ['USD', 'GBP'] })).toBeNull();
        });
    });
});
