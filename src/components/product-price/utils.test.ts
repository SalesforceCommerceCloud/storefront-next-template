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
import { describe, expect, test } from 'vitest';
import type { ShopperProducts } from '@/scapi';
import { getPriceData } from './utils';

type Product = ShopperProducts.schemas['Product'];

describe('getPriceData hasPrice', () => {
    test('standard product with a positive price', () => {
        const result = getPriceData({ id: 'p1', type: { item: true }, price: 29.99 } as Product);
        expect(result.hasPrice).toBe(true);
        expect(result.currentPrice).toBe(29.99);
    });

    test('standard product with an explicit 0 price still has a price', () => {
        const result = getPriceData({ id: 'p1', type: { item: true }, price: 0 } as Product);
        expect(result.hasPrice).toBe(true);
        expect(result.currentPrice).toBe(0);
    });

    test('standard product with no price for the currency has no price (not free)', () => {
        const result = getPriceData({ id: 'p1', type: { item: true } } as Product);
        expect(result.hasPrice).toBe(false);
        // currentPrice still coalesces to 0 for arithmetic safety — callers gate on hasPrice.
        expect(result.currentPrice).toBe(0);
    });

    test('master with at least one priced variant has a price', () => {
        const result = getPriceData({
            id: 'm1',
            type: { master: true },
            variants: [{ productId: 'v1' }, { productId: 'v2', price: 25 }],
        } as Product);
        expect(result.hasPrice).toBe(true);
    });

    test('master with mixed priced/unpriced variants reports the priced floor (not 0)', () => {
        // Regression: findLowestPrice used to coalesce undefined to 0 and the unpriced variant won
        // the reduce, producing 'From $0.00' for a master that's actually purchasable from $25.
        const result = getPriceData({
            id: 'm1',
            type: { master: true },
            variants: [{ productId: 'v1' }, { productId: 'v2', price: 25 }, { productId: 'v3', price: 50 }],
        } as Product);
        expect(result.hasPrice).toBe(true);
        expect(result.currentPrice).toBe(25);
    });

    test('master with mixed priced/unpriced variants ignores unpriced when computing the range max', () => {
        const result = getPriceData({
            id: 'm1',
            type: { master: true },
            variants: [{ productId: 'v1' }, { productId: 'v2', price: 25 }, { productId: 'v3', price: 50 }],
        } as Product);
        expect(result.maxPrice).toBe(50);
    });

    test('master with no priced variants has no price', () => {
        const result = getPriceData({
            id: 'm1',
            type: { master: true },
            variants: [{ productId: 'v1' }, { productId: 'v2' }],
        } as Product);
        expect(result.hasPrice).toBe(false);
    });

    test('set has a price only when its (lowest-child) price is present', () => {
        expect(getPriceData({ id: 's1', type: { set: true }, price: 49 } as Product).hasPrice).toBe(true);
        expect(getPriceData({ id: 's1', type: { set: true } } as Product).hasPrice).toBe(false);
    });

    test('basket line items always report hasPrice true, even at 0', () => {
        const basketItem = {
            itemId: 'i1',
            basePrice: 0,
            price: 0,
            quantity: 1,
        } as unknown as Product;
        expect(getPriceData(basketItem).hasPrice).toBe(true);
    });

    test('objects with `itemId: undefined` are NOT treated as basket items', () => {
        // Defensive: a spread or BFF decoration that adds `itemId: undefined` to a catalog
        // product shouldn't silently route through the basket branch (which would force
        // hasPrice:true and hide a real "Price unavailable" state).
        const productWithUndefinedItemId = {
            id: 'p1',
            type: { item: true },
            itemId: undefined,
        } as unknown as Product;
        expect(getPriceData(productWithUndefinedItemId).hasPrice).toBe(false);
    });

    test('basket line items without basePrice still take the basket path (not "Price unavailable")', () => {
        // basePrice is optional in the SCAPI ProductItem schema; an order/basket line that omits
        // it must still be treated as a real purchased item (hasPrice:true), not judged by the
        // catalog rule and rendered as "Price unavailable".
        const basketItem = {
            itemId: 'i2',
            priceAfterItemDiscount: 10,
            quantity: 1,
        } as unknown as Product;
        const result = getPriceData(basketItem);
        expect(result.hasPrice).toBe(true);
        expect(result.currentPrice).toBe(10);
    });

    test('does not treat currency-equivalent derived unit and list prices as a sale', () => {
        const basketItem = {
            itemId: 'i3',
            basePrice: 34.99,
            price: 174.95,
            priceAfterItemDiscount: 174.95,
            quantity: 5,
        } as unknown as Product;

        const result = getPriceData(basketItem, { currency: 'USD' });

        expect(result.currentPrice).toBe(34.989999999999995);
        expect(result.isOnSale).toBe(false);
        expect(result.listPrice).toBeUndefined();
    });

    test('defaults to USD precision when the caller does not provide a currency', () => {
        const basketItem = {
            itemId: 'i-default-currency',
            basePrice: 34.99,
            priceAfterItemDiscount: 174.95,
            quantity: 5,
        } as unknown as Product;

        expect(getPriceData(basketItem).isOnSale).toBe(false);
    });

    test('retains a discount that differs at the currency precision', () => {
        const basketItem = {
            itemId: 'i4',
            basePrice: 34.99,
            price: 174.9,
            priceAfterItemDiscount: 174.9,
            quantity: 5,
        } as unknown as Product;

        const result = getPriceData(basketItem, { currency: 'USD' });

        expect(result.isOnSale).toBe(true);
        expect(result.listPrice).toBe(34.99);
    });

    test('uses the active currency fraction digits for basket total comparisons', () => {
        const basketItem = {
            itemId: 'i5',
            basePrice: 100,
            price: 99.9,
            priceAfterItemDiscount: 99.9,
            quantity: 1,
        } as unknown as Product;

        expect(getPriceData(basketItem, { currency: 'JPY' }).isOnSale).toBe(false);
        expect(getPriceData(basketItem, { currency: 'USD' }).isOnSale).toBe(true);
    });

    test('retains a zero-decimal discount visible in the basket total', () => {
        const basketItem = {
            itemId: 'i6',
            basePrice: 100,
            price: 999,
            priceAfterItemDiscount: 999,
            quantity: 10,
        } as unknown as Product;

        const result = getPriceData(basketItem, { currency: 'JPY' });

        expect(result.currentPrice).toBe(99.9);
        expect(result.isOnSale).toBe(true);
        expect(result.listPrice).toBe(100);
    });
});
