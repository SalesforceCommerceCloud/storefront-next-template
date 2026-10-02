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
import type { ActionFunctionArgs } from 'react-router';
import { parseDeliverySplit } from '@/lib/delivery-promise';
import { readShopperCityId, saveDeliverySplitToBasket } from './delivery-split.server';

const updateBasket = vi.fn();
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({ shopperBasketsV2: { updateBasket } }),
}));
const updateBasketResource = vi.fn();
vi.mock('@/middlewares/basket.server', () => ({
    updateBasketResource: (...args: unknown[]) => updateBasketResource(...args),
}));
const warn = vi.fn();
vi.mock('@/lib/logger.server', () => ({ getLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }) }));

const context = {} as ActionFunctionArgs['context'];
const requestWith = (cookie?: string) =>
    new Request('http://localhost/action/place-order', { headers: cookie ? { Cookie: cookie } : {} });

const basket = {
    basketId: 'basket-1',
    productItems: [
        { itemId: 'a1', productId: 'DU-879242-M', quantity: 1 }, // Batumi hub
        { itemId: 'b2', productId: 'DU-879251-S', quantity: 2 }, // Tbilisi hub
        { itemId: 'g3', productId: 'DU-879251-S', quantity: 1, bonusProductLineItem: true },
        { itemId: 'u4', productId: 'NOT-IN-INVENTORY', quantity: 1 },
    ],
};

describe('readShopperCityId', () => {
    it('reads a known city from the cookie', () => {
        expect(readShopperCityId(requestWith('a=1; sf_shopper_city=BUS; b=2'))).toBe('BUS');
    });
    it('ignores unknown cities, missing cookies and bad encoding', () => {
        expect(readShopperCityId(requestWith('sf_shopper_city=NOPE'))).toBeUndefined();
        expect(readShopperCityId(requestWith())).toBeUndefined();
        expect(readShopperCityId(requestWith('sf_shopper_city=%E0%A4%A'))).toBeUndefined();
    });
});

describe('saveDeliverySplitToBasket', () => {
    beforeEach(() => {
        updateBasket.mockReset();
        updateBasketResource.mockReset();
        warn.mockReset();
    });

    it('writes c_deliverySplit on the basket with one delivery per hub, skipping bonus and unknown lines', async () => {
        const updated = { ...basket, c_deliverySplit: 'saved' };
        updateBasket.mockResolvedValue({ data: updated });

        const result = await saveDeliverySplitToBasket(context, requestWith('sf_shopper_city=BUS'), basket);

        expect(updateBasket).toHaveBeenCalledTimes(1);
        const call = updateBasket.mock.calls[0][0];
        expect(call.params.path.basketId).toBe('basket-1');
        const split = parseDeliverySplit(call.body.c_deliverySplit);
        expect(split?.shopperCityId).toBe('BUS');
        expect(split?.deliveries).toHaveLength(2);
        expect(split?.deliveries.flatMap((d) => d.items.map((i) => i.itemId)).sort()).toEqual(['a1', 'b2']);
        expect(updateBasketResource).toHaveBeenCalledWith(context, updated);
        expect(result).toBe(updated);
    });

    it('does not call SFCC when no line has a delivery promise', async () => {
        const noHubData = {
            basketId: 'basket-2',
            productItems: [{ itemId: 'u', productId: 'NOT-IN-INVENTORY', quantity: 1 }],
        };
        expect(await saveDeliverySplitToBasket(context, requestWith(), noHubData)).toBe(noHubData);
        expect(updateBasket).not.toHaveBeenCalled();
    });

    it('never blocks checkout: a failed write is logged and the basket is returned unchanged', async () => {
        updateBasket.mockRejectedValue(new Error('SCAPI down'));
        const result = await saveDeliverySplitToBasket(context, requestWith(), basket);
        expect(result).toBe(basket);
        expect(updateBasketResource).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
    });
});
