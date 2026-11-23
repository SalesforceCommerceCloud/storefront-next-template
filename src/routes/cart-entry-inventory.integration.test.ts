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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { createTestContext } from '@/lib/test-utils';
import { selectedStoreContext } from '@/extensions/store-locator/middlewares/selected-store.server';
import { shoppingContext } from '@/extensions/store-locator/lib/store-selection.server';
import { createFormDataRequest } from '@/test-utils/request-helpers';
import { action as reorder } from './action.cart-reorder';
import { action as bonus } from './action.bonus-product-add';
import type { ShopperBasketsV2 } from '@/scapi';

const state = vi.hoisted(() => ({
    basket: { basketId: 'basket' } as ShopperBasketsV2.schemas['Basket'],
    stock: 3 as number | undefined,
    localEnabled: true,
    orderItems: [{ productId: 'sku', quantity: 2 }],
    availability: vi.fn(),
    add: vi.fn(),
}));
vi.mock('@/middlewares/basket.server', () => ({
    getBasket: () => ({ current: state.basket }),
    updateBasketResource: vi.fn(),
}));
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({
        shopperOrders: { getOrder: () => ({ data: { productItems: state.orderItems } }) },
        shopperBasketsV2: { addItemToBasket: state.add },
        shopperAvailability: { getAvailability: state.availability },
    }),
}));
vi.mock('@/lib/api/products.server', () => ({
    fetchProductsByIds: () => [
        {
            id: 'sku',
            c_localInventoryId: 'list-A',
            inventory: { id: 'list-A', orderable: true, ats: 3, stockLevel: 3 },
            inventories: [{ id: 'list-A', orderable: true, ats: 3, stockLevel: 3 }],
        },
    ],
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@salesforce/storefront-next-runtime/i18n', async (original) => ({
    ...(await original<Record<string, unknown>>()),
    getTranslation: () => ({ t: (key: string) => key }),
}));

function context() {
    const ctx = createTestContext();
    const config = ctx.get(appConfigContext);
    const siteId = ctx.get(siteContext)?.site.id ?? 'RefArchGlobal';
    ctx.set(appConfigContext, {
        ...config,
        features: {
            ...config.features,
            localInventory: { enabled: state.localEnabled, inventoryListsBySite: { [siteId]: ['list-A'] } },
        },
    });
    ctx.set(selectedStoreContext, { id: 'A', inventoryId: 'list-A' });
    ctx.set(shoppingContext, {
        siteId,
        preparingStoreId: 'A',
        inventoryId: 'list-A',
        contextRevision: 'revision-A',
        selectionOrigin: 'explicit',
        committedAt: '2026-11-19T00:00:00Z',
    });
    return ctx;
}

beforeEach(() => {
    vi.clearAllMocks();
    state.stock = 3;
    state.localEnabled = true;
    state.orderItems = [{ productId: 'sku', quantity: 2 }];
    state.basket = {
        basketId: 'basket',
        productItems: [],
        bonusDiscountLineItems: [{ id: 'slot', promotionId: 'promo' }],
    };
    state.add.mockResolvedValue({ data: { basketId: 'basket', productItems: [] } });
    state.availability.mockImplementation(({ params }) => ({
        data: {
            data:
                state.stock === undefined
                    ? []
                    : params.query.productIds.map((id: string) => ({
                          id,
                          inventories: [{ id: 'list-A', stockLevel: state.stock, ats: state.stock, orderable: true }],
                      })),
        },
    }));
});

for (const [name, action] of [
    ['reorder', reorder],
    ['bonus', bonus],
] as const) {
    const invoke = (duplicate = false) => {
        const items = [{ productId: 'sku', quantity: 2, bonusDiscountLineItemId: 'slot', promotionId: 'promo' }];
        if (duplicate) items.push({ ...items[0] });
        const request = createFormDataRequest(
            `https://shop.example.com/action/${name}`,
            'POST',
            name === 'reorder' ? { orderNo: 'order' } : { bonusItems: JSON.stringify(items) }
        );
        return action({ request, context: context(), params: {}, unstable_pattern: `/action/${name}` } as never);
    };
    describe(`${name} preparing-store inventory`, () => {
        it('preflights selected stock and assigns the trusted list before adding', async () => {
            const response = await invoke();
            expect(response.data.success).toBe(true);
            expect(state.availability).toHaveBeenCalledWith({
                params: { query: { productIds: ['sku'], inventoryIds: ['list-A'] } },
            });
            expect(state.add.mock.calls[0][0].body).toEqual([
                expect.objectContaining({ productId: 'sku', quantity: 2, inventoryId: 'list-A' }),
            ]);
        });
        it.each([0, undefined])('rejects unavailable stock %s without a native write', async (stock) => {
            state.stock = stock;
            const response = await invoke();
            expect(response.init?.status).toBe(422);
            expect(response.data.error?.code).toBe('OUT_OF_STOCK');
            expect(state.add).not.toHaveBeenCalled();
        });
        it('aggregates demand with an existing duplicate SKU', async () => {
            state.basket.productItems = [{ itemId: 'existing', productId: 'sku', quantity: 2, inventoryId: 'list-A' }];
            const response = await invoke();
            expect(response.init?.status).toBe(422);
            expect(state.add).not.toHaveBeenCalled();
        });
        it('aggregates duplicate lines within the incoming batch', async () => {
            state.orderItems.push({ productId: 'sku', quantity: 2 });
            const response = await invoke(true);
            expect(response.init?.status).toBe(422);
            expect(state.add).not.toHaveBeenCalled();
        });
        it('does not mistake an inventory API failure for unavailable stock', async () => {
            state.availability.mockRejectedValueOnce(new Error('upstream unavailable'));
            const response = await invoke();
            expect(response.init?.status).toBe(500);
            expect(response.data.error?.code).not.toBe('OUT_OF_STOCK');
            expect(state.add).not.toHaveBeenCalled();
        });
        it('keeps the legacy payload when local inventory is disabled', async () => {
            state.localEnabled = false;
            const response = await invoke();
            expect(response.data.success).toBe(true);
            expect(state.availability).not.toHaveBeenCalled();
            expect(state.add.mock.calls[0][0].body[0]).not.toHaveProperty('inventoryId');
        });
        it('preserves the shared confirmation code for an incompatible basket', async () => {
            state.basket.productItems = [
                { itemId: 'old', productId: 'old-sku', quantity: 1, inventoryId: 'other-list' },
            ];
            const response = await invoke();
            expect(response.init?.status).toBe(409);
            expect(response.data).toMatchObject({
                success: false,
                code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
                error: {
                    code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
                    message: 'routeError:commerceContext.confirmationMessage',
                },
            });
            expect(response.init?.headers).toEqual({ 'Cache-Control': 'private, no-store' });
            expect(state.add).not.toHaveBeenCalled();
        });
    });
}
