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
import type { ShopperBasketsV2 } from '@/scapi';
import { findBasketItemForProduct } from './find-basket-item';

const item = (overrides: Partial<ShopperBasketsV2.schemas['ProductItem']>): ShopperBasketsV2.schemas['ProductItem'] =>
    ({
        itemId: 'item-1',
        productId: 'sku-a',
        quantity: 1,
        // A ship-to-home add lands in the default `me` shipment (see action.cart-item-add). Tests that
        // model a recipient or pickup line override this.
        shipmentId: 'me',
        ...overrides,
    }) as ShopperBasketsV2.schemas['ProductItem'];

const basket = (
    productItems: ShopperBasketsV2.schemas['ProductItem'][],
    shipments?: ShopperBasketsV2.schemas['Shipment'][]
): ShopperBasketsV2.schemas['Basket'] => ({ productItems, shipments }) as ShopperBasketsV2.schemas['Basket'];

describe('findBasketItemForProduct', () => {
    test('returns undefined when the basket or product id is unavailable', () => {
        expect(findBasketItemForProduct(undefined, 'sku-a')).toBeUndefined();
        expect(findBasketItemForProduct(basket([]), 'sku-a')).toBeUndefined();
        expect(findBasketItemForProduct(basket([item({})]), undefined)).toBeUndefined();
    });

    test('finds a delivery line for the matching SKU', () => {
        const found = findBasketItemForProduct(
            basket([item({ itemId: 'another-sku', productId: 'sku-b' }), item({ itemId: 'delivery', quantity: 3 })]),
            'sku-a'
        );

        expect(found?.itemId).toBe('delivery');
        expect(found?.quantity).toBe(3);
    });

    test('uses the pickup shipment store to find the selected pickup line', () => {
        const found = findBasketItemForProduct(
            basket(
                [item({ itemId: 'delivery' }), item({ itemId: 'pickup', shipmentId: 'pickup-shipment', quantity: 4 })],
                [{ shipmentId: 'pickup-shipment', c_fromStoreId: 'store-a' }]
            ),
            'sku-a',
            'store-a'
        );

        expect(found?.itemId).toBe('pickup');
        expect(found?.quantity).toBe(4);
    });

    test('does not fall back to a different fulfillment line for an unmatched pickup store', () => {
        const found = findBasketItemForProduct(
            basket(
                [item({ itemId: 'delivery' }), item({ itemId: 'pickup-a', shipmentId: 'pickup-shipment' })],
                [{ shipmentId: 'pickup-shipment', c_fromStoreId: 'store-a' }]
            ),
            'sku-a',
            'store-b'
        );

        expect(found).toBeUndefined();
    });

    test('prefers the default `me` shipment when the SKU is also in another recipient shipment', () => {
        // Multi-address checkout can move a SKU to another recipient's (non-pickup) shipment. A fresh
        // add lands in `me`, so the PDP stepper must target the `me` line, not the other recipient's.
        const found = findBasketItemForProduct(
            basket(
                [
                    item({ itemId: 'recipient-2', shipmentId: 'ship-2', quantity: 5 }),
                    item({ itemId: 'me-line', shipmentId: 'me', quantity: 2 }),
                ],
                [{ shipmentId: 'ship-2' }, { shipmentId: 'me' }]
            ),
            'sku-a'
        );

        expect(found?.itemId).toBe('me-line');
        expect(found?.quantity).toBe(2);
    });

    test('returns undefined when the SKU is only in another recipient shipment, not the default `me`', () => {
        // The normal PDP add lands in `me`, so with no `me` line we must offer a fresh add rather than
        // bind the stepper to another recipient's line (which it would then update or remove).
        const found = findBasketItemForProduct(
            basket(
                [item({ itemId: 'recipient-2', shipmentId: 'ship-2', quantity: 5 })],
                [{ shipmentId: 'ship-2' }, { shipmentId: 'me' }]
            ),
            'sku-a'
        );

        expect(found).toBeUndefined();
    });
});
