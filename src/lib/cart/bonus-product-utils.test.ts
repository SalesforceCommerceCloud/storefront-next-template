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

/* oxlint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect } from 'vitest';
import type { ShopperBasketsV2 } from '@/scapi';
import {
    buildBonusPromotionMap,
    getAttachedBonusPromotions,
    getPromotionCalloutTextFromProduct,
    getBonusProductCountsForPromotion,
    calculateMaxQuantityForBonusProduct,
    getBonusDiscountSlotsForPromotion,
    type BonusPromotionMap,
    type ProductWithPromotions,
    type ProductsWithPromotionsMap,
} from './bonus-product-utils';

// Mock basket data helper
const createMockBasket = (
    overrides?: Partial<ShopperBasketsV2.schemas['Basket']>
): ShopperBasketsV2.schemas['Basket'] => ({
    basketId: 'test-basket-1',
    productItems: [],
    bonusDiscountLineItems: [],
    productSubTotal: 0,
    productTotal: 0,
    orderTotal: 0,
    ...overrides,
});

// Mock product with promotions helper
const createMockProduct = (overrides?: Partial<ProductWithPromotions>): ProductWithPromotions =>
    ({
        id: 'test-product',
        name: 'Test Product',
        productPromotions: [],
        ...overrides,
    }) as ProductWithPromotions;

describe('getPromotionCalloutTextFromProduct', () => {
    it('returns callout text when product has the promotion', () => {
        const product = createMockProduct({
            productPromotions: [
                {
                    promotionId: 'promo-1',
                    calloutMsg: 'Buy one, get 2 free ties',
                    promotionalPrice: 0,
                },
            ],
        });

        expect(getPromotionCalloutTextFromProduct(product, 'promo-1')).toBe('Buy one, get 2 free ties');
    });

    it('strips HTML tags from callout text', () => {
        const product = createMockProduct({
            productPromotions: [
                {
                    promotionId: 'promo-1',
                    calloutMsg: '<strong>Buy one</strong>, get <em>2 free</em> ties',
                    promotionalPrice: 0,
                },
            ],
        });

        expect(getPromotionCalloutTextFromProduct(product, 'promo-1')).toBe('Buy one, get 2 free ties');
    });

    it('returns null when product is null', () => {
        expect(getPromotionCalloutTextFromProduct(null, 'promo-1')).toBeNull();
    });

    it('returns null when product is undefined', () => {
        expect(getPromotionCalloutTextFromProduct(undefined, 'promo-1')).toBeNull();
    });

    it('returns null when promotionId is null', () => {
        const product = createMockProduct();
        expect(getPromotionCalloutTextFromProduct(product, null)).toBeNull();
    });

    it('returns null when promotionId is undefined', () => {
        const product = createMockProduct();
        expect(getPromotionCalloutTextFromProduct(product, undefined)).toBeNull();
    });

    it('returns null when product has no productPromotions', () => {
        const product = createMockProduct({ productPromotions: [] });
        expect(getPromotionCalloutTextFromProduct(product, 'promo-1')).toBeNull();
    });

    it('returns null when promotion is not in the list', () => {
        const product = createMockProduct({
            productPromotions: [
                {
                    promotionId: 'promo-1',
                    calloutMsg: 'Some promotion',
                    promotionalPrice: 0,
                },
            ],
        });

        expect(getPromotionCalloutTextFromProduct(product, 'promo-2')).toBeNull();
    });

    it('returns null when promotion has no calloutMsg', () => {
        const product = createMockProduct({
            productPromotions: [
                {
                    promotionId: 'promo-1',
                    calloutMsg: '',
                    promotionalPrice: 0,
                },
            ],
        });

        expect(getPromotionCalloutTextFromProduct(product, 'promo-1')).toBeNull();
    });
});

describe('buildBonusPromotionMap', () => {
    it('returns empty map when basket is null', () => {
        const result = buildBonusPromotionMap(null);
        expect(result.size).toBe(0);
    });

    it('returns empty map when basket is undefined', () => {
        const result = buildBonusPromotionMap(undefined);
        expect(result.size).toBe(0);
    });

    it('returns empty map when no bonusDiscountLineItems', () => {
        const basket = createMockBasket({ bonusDiscountLineItems: [] });
        const result = buildBonusPromotionMap(basket);
        expect(result.size).toBe(0);
    });

    it('creates promotion entry with correct capacity', () => {
        const basket = createMockBasket({
            bonusDiscountLineItems: [
                {
                    id: 'bli-1',
                    promotionId: 'promo-1',
                    maxBonusItems: 2,
                },
            ],
            productItems: [],
        });

        const result = buildBonusPromotionMap(basket);

        expect(result.size).toBe(1);
        expect(result.has('promo-1')).toBe(true);

        const promo = result.get('promo-1')!;
        expect(promo.promotionId).toBe('promo-1');
        expect(promo.bonusDiscountLineItemIds).toEqual(['bli-1']);
        expect(promo.maxBonusItems).toBe(2);
        expect(promo.selectedItems).toBe(0);
        expect(promo.remainingCapacity).toBe(2);
        expect(promo.calloutText).toBeNull();
    });

    it('calculates selected items correctly', () => {
        const basket = createMockBasket({
            bonusDiscountLineItems: [
                {
                    id: 'bli-1',
                    promotionId: 'promo-1',
                    maxBonusItems: 3,
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'tie-red',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bli-1',
                    quantity: 1,
                    price: 0,
                },
                {
                    itemId: 'item-2',
                    productId: 'tie-blue',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bli-1',
                    quantity: 1,
                    price: 0,
                },
            ],
        });

        const result = buildBonusPromotionMap(basket);

        const promo = result.get('promo-1')!;
        expect(promo.selectedItems).toBe(2);
        expect(promo.remainingCapacity).toBe(1);
    });

    it('aggregates multiple BLIs with same promotionId', () => {
        const basket = createMockBasket({
            bonusDiscountLineItems: [
                {
                    id: 'bli-1',
                    promotionId: 'promo-1',
                    maxBonusItems: 2,
                },
                {
                    id: 'bli-2',
                    promotionId: 'promo-1',
                    maxBonusItems: 2,
                },
            ],
            productItems: [],
        });

        const result = buildBonusPromotionMap(basket);

        expect(result.size).toBe(1);
        const promo = result.get('promo-1')!;
        expect(promo.bonusDiscountLineItemIds).toEqual(['bli-1', 'bli-2']);
        expect(promo.maxBonusItems).toBe(4);
        expect(promo.remainingCapacity).toBe(4);
    });

    it('skips BLIs with no remaining capacity', () => {
        const basket = createMockBasket({
            bonusDiscountLineItems: [
                {
                    id: 'bli-1',
                    promotionId: 'promo-1',
                    maxBonusItems: 1,
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'tie-red',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bli-1',
                    quantity: 1,
                    price: 0,
                },
            ],
        });

        const result = buildBonusPromotionMap(basket);
        expect(result.size).toBe(0);
    });

    it('handles multiple promotions', () => {
        const basket = createMockBasket({
            bonusDiscountLineItems: [
                {
                    id: 'bli-1',
                    promotionId: 'promo-1',
                    maxBonusItems: 2,
                },
                {
                    id: 'bli-2',
                    promotionId: 'promo-2',
                    maxBonusItems: 1,
                },
            ],
            productItems: [],
        });

        const result = buildBonusPromotionMap(basket);

        expect(result.size).toBe(2);
        expect(result.has('promo-1')).toBe(true);
        expect(result.has('promo-2')).toBe(true);
    });

    it('skips BLI with missing promotionId', () => {
        const basket = createMockBasket({
            bonusDiscountLineItems: [
                {
                    id: 'bli-1',
                    promotionId: undefined,
                    maxBonusItems: 2,
                },
            ],
        });

        const result = buildBonusPromotionMap(basket);
        expect(result.size).toBe(0);
    });
});

describe('getAttachedBonusPromotions', () => {
    const emptyProductsMap: ProductsWithPromotionsMap = {};
    const emptyPromotionMap: BonusPromotionMap = new Map();

    it('returns empty map when basket is null', () => {
        const result = getAttachedBonusPromotions(null, emptyProductsMap, emptyPromotionMap);
        expect(result.size).toBe(0);
    });

    it('returns empty map when basket is undefined', () => {
        const result = getAttachedBonusPromotions(undefined, emptyProductsMap, emptyPromotionMap);
        expect(result.size).toBe(0);
    });

    it('returns empty map when no product items', () => {
        const basket = createMockBasket({ productItems: [] });
        const result = getAttachedBonusPromotions(basket, emptyProductsMap, emptyPromotionMap);
        expect(result.size).toBe(0);
    });

    it('returns empty map when promotion map is empty', () => {
        const basket = createMockBasket({
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'suit-123',
                    bonusProductLineItem: false,
                    quantity: 1,
                    price: 100,
                },
            ],
        });

        const result = getAttachedBonusPromotions(basket, emptyProductsMap, emptyPromotionMap);
        expect(result.size).toBe(0);
    });

    it('skips bonus products', () => {
        const basket = createMockBasket({
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'tie-red',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bli-1',
                    quantity: 1,
                    price: 0,
                },
            ],
        });

        const promotionMap = new Map();
        promotionMap.set('promo-1', {
            promotionId: 'promo-1',
            bonusDiscountLineItemIds: ['bli-1'],
            maxBonusItems: 2,
            selectedItems: 0,
            remainingCapacity: 2,
            calloutText: null,
        });

        const result = getAttachedBonusPromotions(basket, emptyProductsMap, promotionMap);
        expect(result.size).toBe(0);
    });

    it('matches product with bonus promotion from Products API', () => {
        const basket = createMockBasket({
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'suit-123',
                    bonusProductLineItem: false,
                    quantity: 1,
                    price: 100,
                },
            ],
        });

        const productsMap: ProductsWithPromotionsMap = {
            'suit-123': createMockProduct({
                id: 'suit-123',
                productPromotions: [
                    {
                        promotionId: 'promo-1',
                        calloutMsg: 'Buy one suit, get 2 free ties',
                        promotionalPrice: 0,
                    },
                ],
            }),
        };

        const promotionMap = new Map();
        promotionMap.set('promo-1', {
            promotionId: 'promo-1',
            bonusDiscountLineItemIds: ['bli-1'],
            maxBonusItems: 2,
            selectedItems: 0,
            remainingCapacity: 2,
            calloutText: null,
        });

        const result = getAttachedBonusPromotions(basket, productsMap, promotionMap);

        expect(result.size).toBe(1);
        expect(result.has('item-1')).toBe(true);

        const attached = result.get('item-1')!;
        expect(attached.promotionId).toBe('promo-1');
        expect(attached.remainingCapacity).toBe(2);
        expect(attached.calloutText).toBe('Buy one suit, get 2 free ties');
    });

    it('rejects products with different priceAdjustments', () => {
        const basket = createMockBasket({
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'tie-123',
                    bonusProductLineItem: false,
                    priceAdjustments: [
                        {
                            promotionId: 'discount-20',
                            price: -10,
                        },
                    ],
                    quantity: 1,
                    price: 40,
                },
            ],
        });

        const productsMap: ProductsWithPromotionsMap = {
            'tie-123': createMockProduct({
                id: 'tie-123',
                productPromotions: [
                    {
                        promotionId: 'discount-20',
                        calloutMsg: '',
                        promotionalPrice: 0,
                    },
                    {
                        promotionId: 'promo-1',
                        calloutMsg: 'Buy one suit, get 2 free ties',
                        promotionalPrice: 0,
                    },
                ],
            }),
        };

        const promotionMap = new Map();
        promotionMap.set('promo-1', {
            promotionId: 'promo-1',
            bonusDiscountLineItemIds: ['bli-1'],
            maxBonusItems: 2,
            selectedItems: 0,
            remainingCapacity: 2,
            calloutText: null,
        });

        const result = getAttachedBonusPromotions(basket, productsMap, promotionMap);

        // Should not attach because tie has different discount ('discount-20')
        // than the bonus promotion ('promo-1')
        expect(result.size).toBe(0);
    });

    it('accepts products with matching priceAdjustments', () => {
        const basket = createMockBasket({
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'suit-123',
                    bonusProductLineItem: false,
                    priceAdjustments: [
                        {
                            promotionId: 'promo-1',
                            price: 0,
                        },
                    ],
                    quantity: 1,
                    price: 100,
                },
            ],
        });

        const productsMap: ProductsWithPromotionsMap = {
            'suit-123': createMockProduct({
                id: 'suit-123',
                productPromotions: [
                    {
                        promotionId: 'promo-1',
                        calloutMsg: 'Buy one suit, get 2 free ties',
                        promotionalPrice: 0,
                    },
                ],
            }),
        };

        const promotionMap = new Map();
        promotionMap.set('promo-1', {
            promotionId: 'promo-1',
            bonusDiscountLineItemIds: ['bli-1'],
            maxBonusItems: 2,
            selectedItems: 0,
            remainingCapacity: 2,
            calloutText: null,
        });

        const result = getAttachedBonusPromotions(basket, productsMap, promotionMap);

        expect(result.size).toBe(1);
        expect(result.has('item-1')).toBe(true);
    });

    it('handles products with no priceAdjustments (qualifying products)', () => {
        const basket = createMockBasket({
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'suit-123',
                    bonusProductLineItem: false,
                    quantity: 1,
                    price: 100,
                },
            ],
        });

        const productsMap: ProductsWithPromotionsMap = {
            'suit-123': createMockProduct({
                id: 'suit-123',
                productPromotions: [
                    {
                        promotionId: 'promo-1',
                        calloutMsg: 'Buy one suit, get 2 free ties',
                        promotionalPrice: 0,
                    },
                ],
            }),
        };

        const promotionMap = new Map();
        promotionMap.set('promo-1', {
            promotionId: 'promo-1',
            bonusDiscountLineItemIds: ['bli-1'],
            maxBonusItems: 2,
            selectedItems: 0,
            remainingCapacity: 2,
            calloutText: null,
        });

        const result = getAttachedBonusPromotions(basket, productsMap, promotionMap);

        expect(result.size).toBe(1);
        expect(result.has('item-1')).toBe(true);
    });

    it('takes first matching promotion only', () => {
        const basket = createMockBasket({
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'suit-123',
                    bonusProductLineItem: false,
                    quantity: 1,
                    price: 100,
                },
            ],
        });

        const productsMap: ProductsWithPromotionsMap = {
            'suit-123': createMockProduct({
                id: 'suit-123',
                productPromotions: [
                    {
                        promotionId: 'promo-1',
                        calloutMsg: 'Get 2 free ties',
                        promotionalPrice: 0,
                    },
                    {
                        promotionId: 'promo-2',
                        calloutMsg: 'Get 1 free belt',
                        promotionalPrice: 0,
                    },
                ],
            }),
        };

        const promotionMap = new Map();
        promotionMap.set('promo-1', {
            promotionId: 'promo-1',
            bonusDiscountLineItemIds: ['bli-1'],
            maxBonusItems: 2,
            selectedItems: 0,
            remainingCapacity: 2,
            calloutText: null,
        });
        promotionMap.set('promo-2', {
            promotionId: 'promo-2',
            bonusDiscountLineItemIds: ['bli-2'],
            maxBonusItems: 1,
            selectedItems: 0,
            remainingCapacity: 1,
            calloutText: null,
        });

        const result = getAttachedBonusPromotions(basket, productsMap, promotionMap);

        expect(result.size).toBe(1);
        const attached = result.get('item-1')!;
        // Should take first promotion
        expect(attached.promotionId).toBe('promo-1');
        expect(attached.calloutText).toBe('Get 2 free ties');
    });

    it('skips products with no productPromotions in Products API', () => {
        const basket = createMockBasket({
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'luggage-123',
                    bonusProductLineItem: false,
                    quantity: 1,
                    price: 50,
                },
            ],
        });

        const productsMap: ProductsWithPromotionsMap = {
            'luggage-123': createMockProduct({
                id: 'luggage-123',
                productPromotions: [],
            }),
        };

        const promotionMap = new Map();
        promotionMap.set('promo-1', {
            promotionId: 'promo-1',
            bonusDiscountLineItemIds: ['bli-1'],
            maxBonusItems: 2,
            selectedItems: 0,
            remainingCapacity: 2,
            calloutText: null,
        });

        const result = getAttachedBonusPromotions(basket, productsMap, promotionMap);
        expect(result.size).toBe(0);
    });

    it('handles callout text with HTML stripping', () => {
        const basket = createMockBasket({
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'suit-123',
                    bonusProductLineItem: false,
                    quantity: 1,
                    price: 100,
                },
            ],
        });

        const productsMap: ProductsWithPromotionsMap = {
            'suit-123': createMockProduct({
                id: 'suit-123',
                productPromotions: [
                    {
                        promotionId: 'promo-1',
                        calloutMsg: '<strong>Buy one</strong> suit, get <em>2 free</em> ties',
                        promotionalPrice: 0,
                    },
                ],
            }),
        };

        const promotionMap = new Map();
        promotionMap.set('promo-1', {
            promotionId: 'promo-1',
            bonusDiscountLineItemIds: ['bli-1'],
            maxBonusItems: 2,
            selectedItems: 0,
            remainingCapacity: 2,
            calloutText: null,
        });

        const result = getAttachedBonusPromotions(basket, productsMap, promotionMap);

        const attached = result.get('item-1')!;
        expect(attached.calloutText).toBe('Buy one suit, get 2 free ties');
    });
});

describe('getBonusProductCountsForPromotion', () => {
    it('should return zero counts when basket is undefined', () => {
        const result = getBonusProductCountsForPromotion(undefined, 'promo-1');

        expect(result).toEqual({
            selectedBonusItems: 0,
            maxBonusItems: 0,
        });
    });

    it('should return zero counts when promotionId is empty', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'basket-1',
            bonusDiscountLineItems: [],
        };

        const result = getBonusProductCountsForPromotion(basket, '');

        expect(result).toEqual({
            selectedBonusItems: 0,
            maxBonusItems: 0,
        });
    });

    it('should calculate counts for single bonus discount line item', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'basket-1',
            bonusDiscountLineItems: [
                {
                    id: 'bonus-1',
                    promotionId: 'promo-1',
                    maxBonusItems: 3,
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'bonus-product-1',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bonus-1',
                    quantity: 2,
                },
            ],
        };

        const result = getBonusProductCountsForPromotion(basket, 'promo-1');

        expect(result).toEqual({
            selectedBonusItems: 2,
            maxBonusItems: 3,
        });
    });

    it('should sum counts across multiple bonus discount line items for same promotion', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'basket-1',
            bonusDiscountLineItems: [
                {
                    id: 'bonus-1',
                    promotionId: 'promo-1',
                    maxBonusItems: 3,
                },
                {
                    id: 'bonus-2',
                    promotionId: 'promo-1',
                    maxBonusItems: 2,
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'bonus-product-1',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bonus-1',
                    quantity: 2,
                },
                {
                    itemId: 'item-2',
                    productId: 'bonus-product-2',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bonus-2',
                    quantity: 1,
                },
            ],
        };

        const result = getBonusProductCountsForPromotion(basket, 'promo-1');

        expect(result).toEqual({
            selectedBonusItems: 3,
            maxBonusItems: 5,
        });
    });

    it('should ignore bonus items from different promotions', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'basket-1',
            bonusDiscountLineItems: [
                {
                    id: 'bonus-1',
                    promotionId: 'promo-1',
                    maxBonusItems: 3,
                },
                {
                    id: 'bonus-2',
                    promotionId: 'promo-2',
                    maxBonusItems: 2,
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'bonus-product-1',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bonus-1',
                    quantity: 2,
                },
                {
                    itemId: 'item-2',
                    productId: 'bonus-product-2',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bonus-2',
                    quantity: 1,
                },
            ],
        };

        const result = getBonusProductCountsForPromotion(basket, 'promo-1');

        expect(result).toEqual({
            selectedBonusItems: 2,
            maxBonusItems: 3,
        });
    });

    it('should handle basket with no product items', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'basket-1',
            bonusDiscountLineItems: [
                {
                    id: 'bonus-1',
                    promotionId: 'promo-1',
                    maxBonusItems: 3,
                },
            ],
            productItems: [],
        };

        const result = getBonusProductCountsForPromotion(basket, 'promo-1');

        expect(result).toEqual({
            selectedBonusItems: 0,
            maxBonusItems: 3,
        });
    });

    it('should handle undefined maxBonusItems gracefully', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'basket-1',
            bonusDiscountLineItems: [
                {
                    id: 'bonus-1',
                    promotionId: 'promo-1',
                    maxBonusItems: undefined,
                },
            ],
            productItems: [],
        };

        const result = getBonusProductCountsForPromotion(basket, 'promo-1');

        expect(result).toEqual({
            selectedBonusItems: 0,
            maxBonusItems: 0,
        });
    });
});

describe('calculateMaxQuantityForBonusProduct', () => {
    const mockBonusDiscountLineItems: ShopperBasketsV2.schemas['BonusDiscountLineItem'][] = [
        {
            id: 'bonus-slot-1',
            promotionId: 'promo-1',
            maxBonusItems: 5,
            bonusProducts: [
                {
                    productId: 'bonus-product-1',
                    productName: 'Bonus Product 1',
                },
            ],
        },
        {
            id: 'bonus-slot-2',
            promotionId: 'promo-2',
            maxBonusItems: 3,
            bonusProducts: [
                {
                    productId: 'bonus-product-2',
                    productName: 'Bonus Product 2',
                },
            ],
        },
    ];

    it('should return undefined for non-bonus products', () => {
        const productItem: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'regular-product',
            bonusProductLineItem: false,
            quantity: 1,
        };

        const result = calculateMaxQuantityForBonusProduct(productItem, [], mockBonusDiscountLineItems);

        expect(result).toBeUndefined();
    });

    it('should return undefined when bonusDiscountLineItemId is missing', () => {
        const productItem: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'bonus-product',
            bonusProductLineItem: true,
            quantity: 1,
            // bonusDiscountLineItemId is missing
        };

        const result = calculateMaxQuantityForBonusProduct(productItem, [], mockBonusDiscountLineItems);

        expect(result).toBeUndefined();
    });

    it('should return undefined when itemId is missing', () => {
        const productItem: ShopperBasketsV2.schemas['ProductItem'] = {
            // itemId is missing
            productId: 'bonus-product',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 1,
        };

        const result = calculateMaxQuantityForBonusProduct(productItem, [], mockBonusDiscountLineItems);

        expect(result).toBeUndefined();
    });

    it('should return undefined for auto bonus products (no bonusProducts array)', () => {
        const autoBonusDiscountLineItems: ShopperBasketsV2.schemas['BonusDiscountLineItem'][] = [
            {
                id: 'bonus-slot-auto',
                promotionId: 'promo-auto',
                maxBonusItems: 1,
                // No bonusProducts array = auto bonus
            },
        ];

        const productItem: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'auto-bonus-product',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-auto',
            quantity: 1,
        };

        const result = calculateMaxQuantityForBonusProduct(productItem, [], autoBonusDiscountLineItems);

        expect(result).toBeUndefined();
    });

    it('should return undefined when bonusDiscountLineItems is undefined', () => {
        const productItem: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'bonus-product',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 1,
        };

        const result = calculateMaxQuantityForBonusProduct(productItem, [], undefined);

        expect(result).toBeUndefined();
    });

    it('should return undefined when bonus discount line item not found', () => {
        const productItem: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'bonus-product',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'non-existent-slot',
            quantity: 1,
        };

        const result = calculateMaxQuantityForBonusProduct(productItem, [], mockBonusDiscountLineItems);

        expect(result).toBeUndefined();
    });

    it('should return undefined when maxBonusItems is missing from slot', () => {
        const bonusDiscountLineItems: ShopperBasketsV2.schemas['BonusDiscountLineItem'][] = [
            {
                id: 'bonus-slot-1',
                promotionId: 'promo-1',
                maxBonusItems: undefined,
                bonusProducts: [{ productId: 'bonus-product-1', productName: 'Bonus Product 1' }],
            },
        ];

        const productItem: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'bonus-product',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 1,
        };

        const result = calculateMaxQuantityForBonusProduct(productItem, [], bonusDiscountLineItems);

        expect(result).toBeUndefined();
    });

    it('should return max quantity when slot is empty (no other products)', () => {
        const productItem: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'bonus-product-1',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 1,
        };

        const allProductItems = [productItem];

        const result = calculateMaxQuantityForBonusProduct(productItem, allProductItems, mockBonusDiscountLineItems);

        expect(result).toBe(5); // maxBonusItems for slot-1
    });

    it('should calculate max quantity excluding current product', () => {
        const productItem1: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'bonus-product-1',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 2,
        };

        const productItem2: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-2',
            productId: 'bonus-product-2',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 1,
        };

        const allProductItems = [productItem1, productItem2];

        // For productItem1: max = 5 - 1 (item-2) = 4
        const result = calculateMaxQuantityForBonusProduct(productItem1, allProductItems, mockBonusDiscountLineItems);

        expect(result).toBe(4);
    });

    it('should return correct max when multiple products in same slot', () => {
        const productItem1: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'bonus-product-1',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 2,
        };

        const productItem2: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-2',
            productId: 'bonus-product-2',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 2,
        };

        const allProductItems = [productItem1, productItem2];

        // For productItem1: max = 5 - 2 (item-2) = 3
        const result = calculateMaxQuantityForBonusProduct(productItem1, allProductItems, mockBonusDiscountLineItems);

        expect(result).toBe(3);
    });

    it('should return 0 when slot is full from other products', () => {
        const productItem1: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'bonus-product-1',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 1,
        };

        const productItem2: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-2',
            productId: 'bonus-product-2',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 5, // Fills entire slot
        };

        const allProductItems = [productItem1, productItem2];

        // For productItem1: max = 5 - 5 (item-2) = 0
        const result = calculateMaxQuantityForBonusProduct(productItem1, allProductItems, mockBonusDiscountLineItems);

        expect(result).toBe(0);
    });

    it('should return 0 when slot is overfilled (edge case)', () => {
        const productItem1: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'bonus-product-1',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 1,
        };

        const productItem2: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-2',
            productId: 'bonus-product-2',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 10, // Exceeds slot max
        };

        const allProductItems = [productItem1, productItem2];

        // For productItem1: max = Math.max(0, 5 - 10) = 0
        const result = calculateMaxQuantityForBonusProduct(productItem1, allProductItems, mockBonusDiscountLineItems);

        expect(result).toBe(0);
    });

    it('should ignore products from different slots', () => {
        const productItem1: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'bonus-product-1',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 2,
        };

        const productItem2: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-2',
            productId: 'bonus-product-2',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-2', // Different slot
            quantity: 2,
        };

        const allProductItems = [productItem1, productItem2];

        // For productItem1: max = 5 - 0 (no other items in slot-1) = 5
        const result = calculateMaxQuantityForBonusProduct(productItem1, allProductItems, mockBonusDiscountLineItems);

        expect(result).toBe(5);
    });

    it('should handle undefined quantity in other products gracefully', () => {
        const productItem1: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'bonus-product-1',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 1,
        };

        const productItem2: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-2',
            productId: 'bonus-product-2',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: undefined, // Treated as 0
        };

        const allProductItems = [productItem1, productItem2];

        // For productItem1: max = 5 - 0 (item-2 quantity is undefined) = 5
        const result = calculateMaxQuantityForBonusProduct(productItem1, allProductItems, mockBonusDiscountLineItems);

        expect(result).toBe(5);
    });

    it('should handle empty allProductItems array', () => {
        const productItem: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'bonus-product-1',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 1,
        };

        const result = calculateMaxQuantityForBonusProduct(productItem, [], mockBonusDiscountLineItems);

        expect(result).toBe(5); // Full slot available
    });

    it('should correctly handle complex scenario with multiple products and slots', () => {
        const productItem1: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-1',
            productId: 'bonus-product-1',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 1,
        };

        const productItem2: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-2',
            productId: 'bonus-product-2',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 2,
        };

        const productItem3: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-3',
            productId: 'bonus-product-3',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-1',
            quantity: 1,
        };

        const productItem4: ShopperBasketsV2.schemas['ProductItem'] = {
            itemId: 'item-4',
            productId: 'bonus-product-4',
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-slot-2', // Different slot
            quantity: 2,
        };

        const allProductItems = [productItem1, productItem2, productItem3, productItem4];

        // For productItem1 in slot-1: max = 5 - (2 + 1) = 2
        const result = calculateMaxQuantityForBonusProduct(productItem1, allProductItems, mockBonusDiscountLineItems);

        expect(result).toBe(2);
    });
});

describe('getBonusDiscountSlotsForPromotion', () => {
    it('returns empty slots when basket is null', () => {
        expect(getBonusDiscountSlotsForPromotion(null, 'promo-1')).toEqual([]);
    });

    it('returns empty slots when basket is undefined', () => {
        expect(getBonusDiscountSlotsForPromotion(undefined, 'promo-1')).toEqual([]);
    });

    it('returns empty slots when promotionId is null', () => {
        const basket = createMockBasket({
            bonusDiscountLineItems: [{ id: 'bli-1', promotionId: 'promo-1', maxBonusItems: 2 }],
        });
        expect(getBonusDiscountSlotsForPromotion(basket, null)).toEqual([]);
    });

    it('returns empty slots when no bonusDiscountLineItems', () => {
        const basket = createMockBasket({ bonusDiscountLineItems: [] });
        expect(getBonusDiscountSlotsForPromotion(basket, 'promo-1')).toEqual([]);
    });

    it('returns empty slots when no BLI matches the promotion', () => {
        const basket = createMockBasket({
            bonusDiscountLineItems: [{ id: 'bli-1', promotionId: 'promo-other', maxBonusItems: 2 }],
            productItems: [
                // Bonus items linked to a different BLI must not be counted against an empty result.
                {
                    itemId: 'item-1',
                    productId: 'tie-red',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bli-1',
                    quantity: 1,
                    price: 0,
                },
            ],
        });
        expect(getBonusDiscountSlotsForPromotion(basket, 'promo-1')).toEqual([]);
    });

    it('returns the matching slot with no selections when nothing is selected', () => {
        const basket = createMockBasket({
            bonusDiscountLineItems: [{ id: 'bli-1', promotionId: 'promo-1', maxBonusItems: 2 }],
            productItems: [],
        });

        expect(getBonusDiscountSlotsForPromotion(basket, 'promo-1')).toEqual([
            { id: 'bli-1', maxBonusItems: 2, bonusProductsSelected: 0 },
        ]);
    });

    it('accumulates selected bonus product quantities into bonusProductsSelected', () => {
        const basket = createMockBasket({
            bonusDiscountLineItems: [{ id: 'bli-1', promotionId: 'promo-1', maxBonusItems: 3 }],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'tie-red',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bli-1',
                    quantity: 2,
                    price: 0,
                },
            ],
        });

        expect(getBonusDiscountSlotsForPromotion(basket, 'promo-1')).toEqual([
            { id: 'bli-1', maxBonusItems: 3, bonusProductsSelected: 2 },
        ]);
    });

    it('returns one row per BLI when multiple BLIs target the same promotion', () => {
        const basket = createMockBasket({
            bonusDiscountLineItems: [
                { id: 'bli-1', promotionId: 'promo-1', maxBonusItems: 2 },
                { id: 'bli-2', promotionId: 'promo-1', maxBonusItems: 3 },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'tie-red',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bli-2',
                    quantity: 1,
                    price: 0,
                },
            ],
        });

        expect(getBonusDiscountSlotsForPromotion(basket, 'promo-1')).toEqual([
            { id: 'bli-1', maxBonusItems: 2, bonusProductsSelected: 0 },
            { id: 'bli-2', maxBonusItems: 3, bonusProductsSelected: 1 },
        ]);
    });

    it('returns fully-claimed slot rows so the modal can render them', () => {
        const basket = createMockBasket({
            bonusDiscountLineItems: [
                { id: 'bli-1', promotionId: 'promo-1', maxBonusItems: 2 },
                { id: 'bli-2', promotionId: 'promo-1', maxBonusItems: 3 },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'tie-red',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bli-1',
                    quantity: 2,
                    price: 0,
                },
            ],
        });

        const slots = getBonusDiscountSlotsForPromotion(basket, 'promo-1');
        expect(slots).toHaveLength(2);
        expect(slots[0]).toEqual({ id: 'bli-1', maxBonusItems: 2, bonusProductsSelected: 2 });
    });

    it('does not count bonus items linked to BLIs of a different promotion', () => {
        const basket = createMockBasket({
            bonusDiscountLineItems: [
                { id: 'bli-1', promotionId: 'promo-1', maxBonusItems: 2 },
                { id: 'bli-2', promotionId: 'promo-2', maxBonusItems: 1 },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'mug-1',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bli-2',
                    quantity: 1,
                    price: 0,
                },
            ],
        });

        expect(getBonusDiscountSlotsForPromotion(basket, 'promo-1')).toEqual([
            { id: 'bli-1', maxBonusItems: 2, bonusProductsSelected: 0 },
        ]);
    });

    it('ignores non-bonus product items when tallying selections', () => {
        const basket = createMockBasket({
            bonusDiscountLineItems: [{ id: 'bli-1', promotionId: 'promo-1', maxBonusItems: 2 }],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'shirt-1',
                    bonusProductLineItem: false,
                    bonusDiscountLineItemId: 'bli-1',
                    quantity: 5,
                    price: 100,
                },
            ],
        });

        const slots = getBonusDiscountSlotsForPromotion(basket, 'promo-1');
        expect(slots[0].bonusProductsSelected).toBe(0);
    });

    it('reports bonusProductsSelected verbatim when SCAPI over-allocates a slot', () => {
        // Concurrent session updates can briefly leave a basket where a bonus product item's quantity exceeds its
        // slot's maxBonusItems. The helper passes the raw count through; the modal clamps `remainingCapacity` to
        // zero downstream via `Math.max(0, maxBonusItems - bonusProductsSelected)`.
        const basket = createMockBasket({
            bonusDiscountLineItems: [{ id: 'bli-1', promotionId: 'promo-1', maxBonusItems: 2 }],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'mug-1',
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bli-1',
                    quantity: 3,
                    price: 0,
                },
            ],
        });

        expect(getBonusDiscountSlotsForPromotion(basket, 'promo-1')).toEqual([
            { id: 'bli-1', maxBonusItems: 2, bonusProductsSelected: 3 },
        ]);
    });
});
