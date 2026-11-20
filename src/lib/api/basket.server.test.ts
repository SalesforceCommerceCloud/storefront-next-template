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
import { describe, test, expect, beforeEach } from 'vitest';
import { getBasketCurrency } from './basket.server';
import type { ShopperBasketsV2 } from '@/scapi';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';

const createMockContext = (defaultCurrency = 'USD', currency?: string) =>
    ({
        get: (key: unknown) => {
            if (key === siteContext) {
                return { site: { defaultCurrency }, currency };
            }
            return undefined;
        },
    }) as any;

describe('getBasketCurrency', () => {
    let mockContext: ReturnType<typeof createMockContext>;

    beforeEach(() => {
        mockContext = createMockContext('USD');
    });

    test('should return basket currency when available', () => {
        const basket: Partial<ShopperBasketsV2.schemas['Basket']> = {
            basketId: 'test-basket',
            currency: 'EUR',
        };

        const result = getBasketCurrency(mockContext, basket);

        expect(result).toBe('EUR');
    });

    test('should return site currency when basket has no currency', () => {
        const eurContext = createMockContext('EUR');

        const basket: Partial<ShopperBasketsV2.schemas['Basket']> = {
            basketId: 'test-basket',
            // currency is undefined
        };

        const result = getBasketCurrency(eurContext, basket);

        expect(result).toBe('EUR');
    });

    test('should return USD fallback when basket has no currency', () => {
        // Uses default config from beforeEach (USD)
        const basket: Partial<ShopperBasketsV2.schemas['Basket']> = {
            basketId: 'test-basket',
            // currency is undefined
        };

        const result = getBasketCurrency(mockContext, basket);

        expect(result).toBe('USD');
    });

    test('should return USD fallback when basket is undefined', () => {
        const result = getBasketCurrency(mockContext, undefined);

        expect(result).toBe('USD');
    });

    test('should handle empty string currency', () => {
        const basket: Partial<ShopperBasketsV2.schemas['Basket']> = {
            basketId: 'test-basket',
            currency: '',
        };

        const result = getBasketCurrency(mockContext, basket);

        expect(result).toBe('USD');
    });

    test('should handle various currency codes', () => {
        const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

        currencies.forEach((currency) => {
            const basket: Partial<ShopperBasketsV2.schemas['Basket']> = {
                basketId: 'test-basket',
                currency,
            };

            const result = getBasketCurrency(mockContext, basket);

            expect(result).toBe(currency);
        });
    });
});

test('prefers the basket currency, then active currency, then site default', () => {
    const context = createMockContext('USD', 'GBP');
    expect(getBasketCurrency(context, { currency: 'EUR' })).toBe('EUR');
    expect(getBasketCurrency(context, {})).toBe('GBP');
    expect(getBasketCurrency(createMockContext('USD'), {})).toBe('USD');
});
