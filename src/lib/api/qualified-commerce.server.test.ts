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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '@/lib/test-utils';
import { fetchProductById, fetchProductsByIds } from './products.server';
import { fetchSearchProducts } from './search.server';
import { calculateBasket } from './basket.server';

const { getProduct, getProducts, productSearch, updateBasket, getBasket } = vi.hoisted(() => ({
    getProduct: vi.fn(),
    getProducts: vi.fn(),
    productSearch: vi.fn(),
    updateBasket: vi.fn(),
    getBasket: vi.fn(),
}));
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({
        shopperProducts: { getProduct, getProducts },
        shopperSearch: { productSearch },
        shopperBasketsV2: { updateBasket, getBasket },
    }),
}));

beforeEach(() => vi.clearAllMocks());

describe('qualified commerce result consumption (native responses are test doubles)', () => {
    it.each([
        'USD',
        'GBP',
    ])('uses resolved %s for product and search reads when callers omit currency', async (currency) => {
        const context = createTestContext({ currency });
        getProduct.mockResolvedValue({ data: { id: 'sku', price: 12 } });
        getProducts.mockResolvedValue({ data: { data: [{ id: 'sku', price: 12 }] } });
        productSearch.mockResolvedValue({ data: { hits: [{ productId: 'sku', price: 12 }], total: 1 } });
        await fetchProductById(context, 'sku');
        await fetchProductById(context, 'sku', { currency: undefined });
        await fetchProductsByIds(context, ['sku']);
        await fetchProductsByIds(context, ['sku'], { currency: undefined });
        await fetchSearchProducts(context, {});
        await fetchSearchProducts(context, { currency: undefined });
        for (const call of [getProduct, getProducts, productSearch]) {
            expect(call).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: expect.objectContaining({
                        query: expect.objectContaining({ currency }),
                    }),
                })
            );
        }
    });

    it.each([
        ['higher', 16],
        ['lower', 4],
        ['fallback', 10],
        ['no-store', 11],
        ['no-price', undefined],
    ] as const)('preserves the supplied native %s result without a storefront fallback', async (_case, price) => {
        const context = createTestContext({ currency: 'GBP' });
        const product = {
            id: 'sku',
            ...(price === undefined ? {} : { price }),
            productPromotions: [{ promotionId: 'individual' }, { promotionId: 'group' }, { promotionId: 'all-store' }],
        };
        getProduct.mockResolvedValue({ data: product });
        expect(await fetchProductById(context, 'sku', { currency: 'USD' })).toBe(product);
        expect(getProduct.mock.calls[0][0].params.query.currency).toBe('USD');
    });

    it('consumes the entire native calculated basket and never uses GET as calculation', async () => {
        const context = createTestContext({ currency: 'GBP' });
        const basket = {
            basketId: 'basket',
            currency: 'GBP',
            orderTotal: 18.5,
            taxTotal: 1.5,
            shippingTotal: 2,
            couponItems: [{ code: 'MEMBER', valid: true }],
            productItems: [
                { itemId: 'line', productId: 'sku', basePrice: 10, priceAfterItemDiscount: 15, quantity: 2 },
            ],
            bonusDiscountLineItems: [{ id: 'gift' }],
            orderPriceAdjustments: [{ promotionId: 'threshold', price: -1 }],
            shipments: [{ shipmentId: 'shipping', shippingTotal: 2 }],
        };
        updateBasket.mockResolvedValue({ data: basket });
        expect(await calculateBasket(context, 'basket', 'GBP')).toBe(basket);
        expect(updateBasket).toHaveBeenCalledWith({
            params: { path: { basketId: 'basket' } },
            body: { currency: 'GBP' },
        });
        expect(getBasket).not.toHaveBeenCalled();
    });
});
