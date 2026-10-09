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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ShopperBasketsV2 } from '@/scapi';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
import { fetchProductsByIds } from '@/lib/api/products.server';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { getInventoryIdsFromPickupShipments } from '@/extensions/bopis/lib/basket-utils';
// @sfdc-extension-block-end SFDC_EXT_BOPIS
import { createTestContext } from '@/lib/test-utils';
import { fetchProductsInBasket } from './basket-products.server';

vi.mock('@/lib/api/products.server', () => ({
    fetchProductsByIds: vi.fn(),
}));

// @sfdc-extension-block-start SFDC_EXT_BOPIS
vi.mock('@/extensions/bopis/lib/basket-utils', () => ({
    getInventoryIdsFromPickupShipments: vi.fn(() => []),
}));
// @sfdc-extension-block-end SFDC_EXT_BOPIS

describe('fetchProductsInBasket', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        vi.mocked(getInventoryIdsFromPickupShipments).mockReturnValue([]);
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
    });

    test('returns empty maps when basket is null', async () => {
        const context = createTestContext({ currency: 'USD' });

        const result = await fetchProductsInBasket(context, null);

        expect(result).toEqual({ productsByItemId: {}, bonusProductsById: {} });
        expect(fetchProductsByIds).not.toHaveBeenCalled();
    });

    test('returns empty maps when basket has no productItems and no bonusDiscountLineItems', async () => {
        const context = createTestContext({ currency: 'USD' });
        const basket = { basketId: 'b1' } as ShopperBasketsV2.schemas['Basket'];

        const result = await fetchProductsInBasket(context, basket);

        expect(result).toEqual({ productsByItemId: {}, bonusProductsById: {} });
        expect(fetchProductsByIds).not.toHaveBeenCalled();
    });

    test('returns productsByItemId keyed by itemId for simple items', async () => {
        const context = createTestContext({ currency: 'USD' });
        const basket = {
            basketId: 'b1',
            productItems: [
                { itemId: 'item-1', productId: 'sku-1', quantity: 1 },
                { itemId: 'item-2', productId: 'sku-2', quantity: 2 },
            ],
        } as ShopperBasketsV2.schemas['Basket'];
        vi.mocked(fetchProductsByIds).mockResolvedValue([
            { id: 'sku-1', name: 'P1' } as any,
            { id: 'sku-2', name: 'P2' } as any,
        ]);

        const result = await fetchProductsInBasket(context, basket);

        expect(result.productsByItemId).toEqual({
            'item-1': { id: 'sku-1', name: 'P1' },
            'item-2': { id: 'sku-2', name: 'P2' },
        });
        expect(result.bonusProductsById).toEqual({});
        expect(fetchProductsByIds).toHaveBeenCalledWith(
            context,
            ['sku-1', 'sku-2'],
            expect.objectContaining({
                allImages: true,
                perPricebook: true,
                currency: 'USD',
                expand: ['availability', 'bundled_products', 'images', 'prices', 'promotions', 'variations'],
            })
        );
    });

    test('reconstructs bundledProducts using basket-line quantities', async () => {
        const context = createTestContext({ currency: 'USD' });
        const basket = {
            basketId: 'b1',
            productItems: [
                {
                    itemId: 'item-bundle',
                    productId: 'bundle-1',
                    quantity: 1,
                    bundledProductItems: [
                        { productId: 'child-1', quantity: 2 },
                        { productId: 'child-2', quantity: 3 },
                    ],
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];
        vi.mocked(fetchProductsByIds).mockResolvedValue([
            { id: 'bundle-1', name: 'Bundle' } as any,
            { id: 'child-1', name: 'Child One' } as any,
            { id: 'child-2', name: 'Child Two' } as any,
        ]);

        const result = await fetchProductsInBasket(context, basket);

        expect(result.productsByItemId['item-bundle']).toMatchObject({
            id: 'bundle-1',
            name: 'Bundle',
            bundledProducts: [
                { product: { id: 'child-1', name: 'Child One' }, quantity: 2 },
                { product: { id: 'child-2', name: 'Child Two' }, quantity: 3 },
            ],
        });
    });

    test('returns separate bonusProductsById map for bonusDiscountLineItems', async () => {
        const context = createTestContext({ currency: 'USD' });
        const basket = {
            basketId: 'b1',
            productItems: [{ itemId: 'item-1', productId: 'sku-1', quantity: 1 }],
            bonusDiscountLineItems: [
                {
                    id: 'bdli-1',
                    promotionId: 'promo-1',
                    bonusProducts: [{ productId: 'bonus-1' }],
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];
        vi.mocked(fetchProductsByIds).mockResolvedValue([
            { id: 'sku-1', name: 'P1' } as any,
            { id: 'bonus-1', name: 'Bonus' } as any,
        ]);

        const result = await fetchProductsInBasket(context, basket);

        expect(result.productsByItemId).toEqual({ 'item-1': { id: 'sku-1', name: 'P1' } });
        expect(result.bonusProductsById).toEqual({ 'bonus-1': { id: 'bonus-1', name: 'Bonus' } });
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    test('passes inventoryIds to fetchProductsByIds when BOPIS pickup shipments are present', async () => {
        const context = createTestContext({ currency: 'USD' });
        const basket = {
            basketId: 'b1',
            productItems: [{ itemId: 'item-1', productId: 'sku-1', quantity: 1 }],
        } as ShopperBasketsV2.schemas['Basket'];
        vi.mocked(getInventoryIdsFromPickupShipments).mockReturnValue(['inv-1']);
        vi.mocked(fetchProductsByIds).mockResolvedValue([{ id: 'sku-1' } as any]);

        await fetchProductsInBasket(context, basket);

        expect(fetchProductsByIds).toHaveBeenCalledWith(
            context,
            ['sku-1'],
            expect.objectContaining({
                inventoryIds: ['inv-1'],
                expand: ['availability', 'bundled_products', 'images', 'prices', 'promotions', 'variations'],
            })
        );
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    test('propagates NormalizedApiError when fetchProductsByIds rejects', async () => {
        const context = createTestContext({ currency: 'USD' });
        const basket = {
            basketId: 'b1',
            productItems: [{ itemId: 'item-1', productId: 'sku-1', quantity: 1 }],
        } as ShopperBasketsV2.schemas['Basket'];
        const apiError = new NormalizedApiError(new TypeError('Network failure'));
        vi.mocked(fetchProductsByIds).mockRejectedValue(apiError);

        await expect(fetchProductsInBasket(context, basket)).rejects.toBe(apiError);
    });
});
