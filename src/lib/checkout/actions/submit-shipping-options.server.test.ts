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
import type { ShopperBasketsV2 } from '@/scapi';
import { mergeShippingOptionsBasketPreservingCustomerInfo } from './submit-shipping-options.server';

describe('mergeShippingOptionsBasketPreservingCustomerInfo', () => {
    it('uses the full updated basket while preserving current customer identity', () => {
        const currentBasket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'current-basket',
            lastModified: '2026-07-10T20:00:00.000Z',
            customerInfo: {
                customerId: 'customer-1',
                customerName: 'Current Customer',
                email: 'shopper@example.com',
                c_loyaltyTier: 'silver',
            },
            adjustedShippingTotalTax: 1.5,
            orderPriceAdjustments: [{ priceAdjustmentId: 'stale-adjustment' }],
            shippingTotalTax: 2,
            c_deliveryEstimate: 'stale',
        };
        const updatedBasket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'current-basket',
            lastModified: '2026-07-10T20:01:00.000Z',
            customerInfo: {
                customerId: 'response-customer',
                customerName: 'Updated Customer',
                customerNo: '000042',
                c_loyaltyTier: 'gold',
            } as unknown as ShopperBasketsV2.schemas['CustomerInfo'],
            adjustedShippingTotalTax: 0,
            orderTotal: 0,
            orderPriceAdjustments: [],
            shippingTotalTax: 0,
            c_deliveryEstimate: null,
            c_shippingResponse: {
                carrier: 'express',
                serviceLevels: ['next-day'],
            },
        };

        const mergedBasket = mergeShippingOptionsBasketPreservingCustomerInfo(currentBasket, updatedBasket);

        expect(mergedBasket).toEqual({
            ...updatedBasket,
            customerInfo: {
                ...currentBasket.customerInfo,
                ...updatedBasket.customerInfo,
                customerId: 'customer-1',
                email: 'shopper@example.com',
            },
        });
    });

    it('restores current customer info when the updated basket omits it', () => {
        const currentBasket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'current-basket',
            customerInfo: {
                customerId: 'customer-1',
                email: 'shopper@example.com',
            },
        };
        const updatedBasket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'current-basket',
            lastModified: '2026-07-10T20:01:00.000Z',
            orderTotal: 25,
        };

        const mergedBasket = mergeShippingOptionsBasketPreservingCustomerInfo(currentBasket, updatedBasket);

        expect(mergedBasket).toEqual({
            ...updatedBasket,
            customerInfo: currentBasket.customerInfo,
        });
    });
});
