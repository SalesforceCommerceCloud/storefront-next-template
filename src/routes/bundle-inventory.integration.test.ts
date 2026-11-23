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
import type { ShopperBasketsV2 } from '@/scapi';
import { action as add } from './action.cart-bundle-add';
import { action as updateBundle } from './action.cart-bundle-update';
import { action as updateItem } from './action.cart-item-update';

const state = vi.hoisted(() => ({
    basket: { basketId: 'basket' } as ShopperBasketsV2.schemas['Basket'],
    stock: 3.3,
    enabled: true,
    availability: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    updateItem: vi.fn(),
}));
vi.mock('@/middlewares/basket.server', () => ({
    getBasket: () => ({ current: state.basket }),
    updateBasketResource: vi.fn(),
}));
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({
        shopperBasketsV2: {
            addItemToBasket: state.add,
            updateItemsInBasket: state.update,
            updateItemInBasket: state.updateItem,
        },
        shopperAvailability: { getAvailability: state.availability },
    }),
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
            localInventory: { enabled: state.enabled, inventoryListsBySite: { [siteId]: ['list-A'] } },
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
    state.stock = 3.3;
    state.enabled = true;
    state.basket = { basketId: 'basket', productItems: [] };
    for (const write of [state.add, state.update, state.updateItem]) {
        write.mockResolvedValue({ data: { basketId: 'basket', productItems: [] } });
    }
    state.availability.mockImplementation(({ params }) => ({
        data: {
            data: params.query.productIds.map((id: string) => ({
                id,
                inventories: [
                    {
                        id: 'list-A',
                        stockLevel: id === 'bundle' ? 99 : state.stock,
                        ats: id === 'bundle' ? 99 : state.stock,
                        orderable: true,
                    },
                ],
            })),
        },
    }));
});

for (const operation of ['add', 'bundle-update', 'item-update'] as const) {
    const write = () =>
        operation === 'add' ? state.add : operation === 'bundle-update' ? state.update : state.updateItem;
    function invoke(parentQuantity = 1, childQuantity = 1.1) {
        if (operation !== 'add') {
            state.basket.productItems = [
                {
                    itemId: 'parent',
                    productId: 'bundle',
                    quantity: parentQuantity,
                    inventoryId: 'list-A',
                    bundledProductItems: [{ itemId: 'child', productId: 'variant', quantity: childQuantity }],
                },
                ...(state.basket.productItems ?? []),
            ];
        }
        const fields: Record<string, string> =
            operation === 'add'
                ? {
                      bundleItem: JSON.stringify({ productId: 'bundle', quantity: 3 }),
                      childSelections: JSON.stringify([
                          { product: { id: 'master' }, variant: { productId: 'variant' }, quantity: childQuantity },
                      ]),
                  }
                : operation === 'bundle-update'
                  ? { items: JSON.stringify([{ itemId: 'parent', quantity: 3 }]) }
                  : { itemId: 'parent', quantity: '3' };
        const action = operation === 'add' ? add : operation === 'bundle-update' ? updateBundle : updateItem;
        const request = createFormDataRequest(
            'https://shop.example.com/action/bundle',
            operation === 'add' ? 'POST' : 'PATCH',
            fields
        );
        return action({ request, context: context(), params: {} } as never);
    }
    describe(`${operation} component stock`, () => {
        it('accepts exact fractional variant stock without binary rounding', async () => {
            const response = await invoke();
            expect(response.data.success).toBe(true);
            expect(write()).toHaveBeenCalledOnce();
            expect(state.availability).toHaveBeenCalledWith({
                params: { query: { productIds: ['bundle', 'variant'], inventoryIds: ['list-A'] } },
            });
        });
        it('rejects genuinely insufficient stock before writing', async () => {
            state.stock = 3.2999999999999994;
            const response = await invoke();
            expect(response.init?.status).toBe(422);
            expect(response.data.error?.code).toBe('OUT_OF_STOCK');
            expect(write()).not.toHaveBeenCalled();
        });
        it('shares the component budget with an existing option line', async () => {
            state.basket.productItems = [
                {
                    itemId: 'other',
                    productId: 'variant',
                    quantity: 0.1,
                    inventoryId: 'list-A',
                    optionItems: [{ optionId: 'wrap', optionValueId: 'yes' }],
                },
            ];
            const response = await invoke();
            expect(response.init?.status).toBe(422);
            expect(write()).not.toHaveBeenCalled();
        });
        if (operation !== 'add') {
            it('preserves fractional parent quantities while rescaling', async () => {
                state.stock = 2;
                const insufficient = await invoke(0.5, 0.55);
                expect(insufficient.init?.status).toBe(422);
                expect(write()).not.toHaveBeenCalled();
                state.stock = 3.3;
                state.basket.productItems = [];
                const response = await invoke(0.5, 0.55);
                expect(response.data.success).toBe(true);
                expect(write()).toHaveBeenCalledOnce();
            });
            it.each([
                0,
                -1,
                NaN,
                Infinity,
            ])('rejects invalid existing parent quantity %s without writing', async (quantity) => {
                const response = await invoke(quantity);
                expect(response.init?.status).toBe(400);
                expect(response.data.error?.code).toBe('INVALID_INPUT');
                expect(state.availability).not.toHaveBeenCalled();
                expect(write()).not.toHaveBeenCalled();
            });
        }
        it('does not introduce stock reads when local inventory is disabled', async () => {
            state.enabled = false;
            if (operation === 'item-update')
                state.basket.productItems = [{ itemId: 'other', productId: 'sku', quantity: 1 }];
            const response = await invoke(3, 3.3);
            expect(response.data.success).toBe(true);
            expect(state.availability).not.toHaveBeenCalled();
        });
    });
}
