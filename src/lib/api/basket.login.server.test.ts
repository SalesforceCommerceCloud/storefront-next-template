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
import { RouterContextProvider } from 'react-router';
import { mergeBasket } from './basket.server';
import { createApiClients } from '@/lib/api-clients.server';
import { updateBasketResource } from '@/middlewares/basket.server';

vi.mock('@/lib/api-clients.server', () => ({ createApiClients: vi.fn() }));
vi.mock('@/middlewares/basket.server', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/middlewares/basket.server')>()),
    updateBasketResource: vi.fn(),
}));
const transfer = vi.fn();
const calculate = vi.fn();
beforeEach(() => {
    vi.clearAllMocks();
    transfer.mockResolvedValue({
        data: { basketId: 'existing-basket', currency: 'GBP', productItems: [{ itemId: 'compatible-line' }] },
    });
    calculate.mockResolvedValue({
        data: {
            basketId: 'existing-basket',
            currency: 'GBP',
            orderTotal: 24,
            productItems: [{ itemId: 'compatible-line' }],
        },
    });
    vi.mocked(createApiClients).mockReturnValue({
        shopperBasketsV2: { transferBasket: transfer, updateBasket: calculate },
    } as unknown as ReturnType<typeof createApiClients>);
});

describe('basket transfer after login', () => {
    it('retains merge behavior and IDs while publishing recalculated qualification', async () => {
        const ctx = new RouterContextProvider();
        const basket = await mergeBasket(ctx);
        expect(transfer).toHaveBeenCalledWith({ params: { query: { merge: true, populateCustomerDetails: true } } });
        expect(calculate).toHaveBeenCalledWith({
            params: { path: { basketId: 'existing-basket' } },
            body: { currency: 'GBP' },
        });
        expect(basket?.productItems?.[0].itemId).toBe('compatible-line');
        expect(updateBasketResource).toHaveBeenCalledWith(ctx, basket);
    });
    it('does not create or calculate a basket when transfer has no content', async () => {
        transfer.mockResolvedValueOnce({ data: undefined });
        expect(await mergeBasket(new RouterContextProvider())).toBeUndefined();
        expect(calculate).not.toHaveBeenCalled();
        expect(updateBasketResource).not.toHaveBeenCalled();
    });
    it('surfaces failed qualification without publishing the transferred stale totals', async () => {
        calculate.mockRejectedValueOnce(new Error('calculation failed'));
        await expect(mergeBasket(new RouterContextProvider())).rejects.toMatchObject({
            code: 'BASKET_QUALIFICATION_UNAVAILABLE',
            status: 503,
        });
        expect(updateBasketResource).not.toHaveBeenCalled();
    });
});
