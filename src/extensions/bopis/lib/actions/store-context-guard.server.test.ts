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
import { beforeEach, expect, it, vi } from 'vitest';
import { RouterContextProvider, type ActionFunctionArgs } from 'react-router';
import { rejectUnconfirmedStoreChange } from './store-context-guard.server';
import { selectedStoreContext } from '@/extensions/store-locator/middlewares/selected-store.server';
import { action as addItem } from '@/routes/action.cart-item-add';
import { action as addSet } from '@/routes/action.cart-set-add';
import { action as addBundle } from '@/routes/action.cart-bundle-add';
import { action as updateItem } from '@/routes/action.cart-item-update';
import { createApiClients } from '@/lib/api-clients.server';
import { getBasket } from '@/middlewares/basket.server';
import { findOrCreatePickupShipment } from '@/extensions/bopis/lib/api/shipment.server';
import { getStoreInventoryId } from '@/extensions/bopis/lib/api/stores.server';

const mode = vi.hoisted(() => ({ enabled: true, storeSelectionEnabled: true }));
vi.mock('@salesforce/storefront-next-runtime/config', async (original) => ({
    ...(await original<typeof import('@salesforce/storefront-next-runtime/config')>()),
    getConfig: () => ({ features: { shopperContext: mode } }),
}));
vi.mock('@/middlewares/auth.server', () => ({ getAuth: () => ({ customerId: 'customer-a' }) }));
vi.mock('@/middlewares/basket.server', () => ({ getBasket: vi.fn(), updateBasketResource: vi.fn() }));
vi.mock('@/lib/api-clients.server', () => ({ createApiClients: vi.fn() }));
vi.mock('@/extensions/bopis/lib/api/shipment.server', () => ({
    findOrCreatePickupShipment: vi.fn(),
    PickupShipmentStoreConflictError: class extends Error {},
}));
vi.mock('@/extensions/bopis/lib/api/stores.server', () => ({ getStoreInventoryId: vi.fn() }));
const logger = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => logger }));
const update = vi.fn(),
    add = vi.fn(),
    products = vi.fn();
let context: RouterContextProvider;
const basket = {
    basketId: 'basket-a',
    productItems: [{ itemId: 'item-a', productId: 'sku', quantity: 1, shipmentId: 'me' }],
    shipments: [{ shipmentId: 'me' }],
};
beforeEach(() => {
    vi.clearAllMocks();
    mode.enabled = true;
    mode.storeSelectionEnabled = true;
    context = new RouterContextProvider();
    context.set(selectedStoreContext, { id: 'A', inventoryId: 'inventory-a' });
    vi.mocked(getBasket).mockResolvedValue({ current: basket, snapshot: null, hydrated: true });
    vi.mocked(createApiClients).mockReturnValue({
        shopperBasketsV2: { updateItemInBasket: update, addItemToBasket: add },
        shopperProducts: { getProducts: products },
    } as unknown as ReturnType<typeof createApiClients>);
});
const args = (request: Request): ActionFunctionArgs => ({
    request,
    context,
    params: {},
    url: new URL(request.url),
    pattern: '/action/test',
});
const item = { productId: 'sku', quantity: 1, storeId: 'B', inventoryId: 'inventory-b' };
const endpoints = [
    {
        name: 'item pickup change',
        action: updateItem,
        method: 'PATCH',
        fields: { itemId: 'item-a', quantity: '1', deliveryOption: 'pickup', storeId: 'B', inventoryId: 'inventory-b' },
    },
    {
        name: 'item delivery change',
        action: updateItem,
        method: 'PATCH',
        fields: { itemId: 'item-a', quantity: '1', deliveryOption: 'delivery' },
    },
    { name: 'pickup single add', action: addItem, method: 'POST', fields: { productItem: JSON.stringify(item) } },
    { name: 'pickup set add', action: addSet, method: 'POST', fields: { productItems: JSON.stringify([item]) } },
    {
        name: 'pickup bundle add',
        action: addBundle,
        method: 'POST',
        fields: { bundleItem: JSON.stringify(item), childSelections: '[]' },
    },
];
it.each(endpoints)('blocks $name before basket writes under native store A', async ({ action, method, fields }) => {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) if (value !== undefined) body.set(key, value);
    const request = new Request('https://example.com/action/test', { method, body });
    const result = await action(args(request));
    expect(result.init?.status).toBe(409);
    expect(result.data).toMatchObject({ success: false, code: 'STORE_CHANGE_CONFIRMATION_REQUIRED' });
    expect(update).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(products).not.toHaveBeenCalled();
    expect(findOrCreatePickupShipment).not.toHaveBeenCalled();
    expect(context.get(selectedStoreContext)?.id).toBe('A');
    expect(logger.warn).toHaveBeenCalledWith(
        'Native fulfillment change requires confirmation',
        expect.objectContaining({
            actor: 'customer-a',
            action: 'change_fulfillment',
            outcome: 'denied',
            timestamp: expect.any(String),
        })
    );
});
it('permits adding pickup at the already committed store after inventory validation', async () => {
    vi.mocked(getStoreInventoryId).mockResolvedValue('inventory-a');
    vi.mocked(findOrCreatePickupShipment).mockResolvedValue({ shipmentId: 'pickup' });
    add.mockResolvedValue({ data: basket });
    const body = new FormData();
    body.set('productItem', JSON.stringify({ ...item, storeId: 'A', inventoryId: 'inventory-a' }));
    const result = await addItem(
        args(new Request('https://example.com/action/cart-item-add', { method: 'POST', body }))
    );
    expect(result.data.success).toBe(true);
    expect(add).toHaveBeenCalledWith(
        expect.objectContaining({
            body: [expect.objectContaining({ inventoryId: 'inventory-a', shipmentId: 'pickup' })],
        })
    );
});
it('leaves legacy fulfillment changes available when native context is disabled', () => {
    mode.enabled = false;
    expect(rejectUnconfirmedStoreChange(context)).toBeNull();
    expect(rejectUnconfirmedStoreChange(context, 'B')).toBeNull();
});

it('keeps legacy fulfillment available when generic Shopper Context alone is enabled', () => {
    mode.storeSelectionEnabled = false;
    expect(rejectUnconfirmedStoreChange(context)).toBeNull();
});
it('rejects a pickup add without a committed native store', () => {
    context.set(selectedStoreContext, null);
    expect(rejectUnconfirmedStoreChange(context, 'B')?.init?.status).toBe(409);
});
