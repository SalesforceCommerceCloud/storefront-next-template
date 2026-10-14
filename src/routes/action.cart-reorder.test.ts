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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { action } from './action.cart-reorder';
import { createActionArgs, ROUTE_PATTERN } from '@/lib/test-utils';
import { resourceRoutes } from '@/route-paths';
import { createFormDataRequest } from '@/test-utils/request-helpers';
import type { ReorderActionResponse } from '@/routes/types/action-responses';

vi.mock('@/middlewares/basket.server');
vi.mock('@/lib/api/products.server');
vi.mock('@/lib/api-clients.server');
vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>();
    return { ...actual, getConfig: vi.fn().mockReturnValue({}) };
});
vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({ getTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { fetchProductsByIds } from '@/lib/api/products.server';
import { createApiClients } from '@/lib/api-clients.server';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';

const getOrder = vi.fn();
const addItemToBasket = vi.fn();

const mockClients = {
    shopperOrders: { getOrder },
    shopperBasketsV2: { addItemToBasket },
};

const buildRequest = (fields: Record<string, string>) =>
    createFormDataRequest(`http://localhost${resourceRoutes.cartReorder}`, 'POST', fields);

const run = async (fields: Record<string, string>) => {
    const result = await action(createActionArgs(buildRequest(fields), {} as never, { pattern: ROUTE_PATTERN }));
    return { ...result, data: result.data as ReorderActionResponse };
};

const makeProduct = (
    productId: string,
    opts: { ats?: number; preorderable?: boolean; backorderable?: boolean; orderable?: boolean } = {}
) => ({
    id: productId,
    inventory: {
        ats: opts.ats ?? 10,
        stockLevel: opts.ats ?? 10,
        orderable: opts.orderable ?? true,
        preorderable: opts.preorderable ?? false,
        backorderable: opts.backorderable ?? false,
    },
});

const makeOrderData = (...items: { productId: string; quantity: number; productName?: string }[]) => ({
    data: {
        productItems: items.map((i) => ({ productId: i.productId, quantity: i.quantity, productName: i.productName })),
    },
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBasket).mockResolvedValue({
        current: { basketId: 'basket-1', productItems: [] },
        snapshot: null,
    } as any);
    vi.mocked(updateBasketResource).mockImplementation(() => {});
    vi.mocked(createApiClients).mockReturnValue(mockClients as any);
    addItemToBasket.mockResolvedValue({ data: { basketId: 'basket-1', productItems: [] } });
});

describe('action.cart-reorder — deferred availability (backorder / preorder)', () => {
    it('adds a backorderable item at zero ATS with its full requested quantity (exact mode)', async () => {
        getOrder.mockResolvedValue(makeOrderData({ productId: 'sku-1', quantity: 2 }));
        vi.mocked(fetchProductsByIds).mockResolvedValue([makeProduct('sku-1', { ats: 0, backorderable: true })] as any);

        const result = await run({ orderNo: 'ORDER-1', quantityMode: 'exact' });

        expect(result.data.success).toBe(true);
        expect(result.data.skippedItems).toHaveLength(0);
        expect(addItemToBasket).toHaveBeenCalledWith(
            expect.objectContaining({ body: [{ productId: 'sku-1', quantity: 2, shipmentId: 'me' }] })
        );
    });

    it('adds a preorderable item at zero ATS with its full requested quantity (available mode)', async () => {
        getOrder.mockResolvedValue(makeOrderData({ productId: 'sku-2', quantity: 3 }));
        vi.mocked(fetchProductsByIds).mockResolvedValue([makeProduct('sku-2', { ats: 0, preorderable: true })] as any);

        const result = await run({ orderNo: 'ORDER-2', quantityMode: 'available' });

        expect(result.data.success).toBe(true);
        expect(result.data.skippedItems).toHaveLength(0);
        expect(result.data.adjustedItems).toHaveLength(0);
        expect(addItemToBasket).toHaveBeenCalledWith(
            expect.objectContaining({ body: [{ productId: 'sku-2', quantity: 3, shipmentId: 'me' }] })
        );
    });

    it('adds a backorderable item at negative ATS with its full requested quantity', async () => {
        getOrder.mockResolvedValue(makeOrderData({ productId: 'sku-3', quantity: 1 }));
        vi.mocked(fetchProductsByIds).mockResolvedValue([
            makeProduct('sku-3', { ats: -5, backorderable: true }),
        ] as any);

        const result = await run({ orderNo: 'ORDER-3', quantityMode: 'exact' });

        expect(result.data.success).toBe(true);
        expect(result.data.skippedItems).toHaveLength(0);
        expect(addItemToBasket).toHaveBeenCalledWith(
            expect.objectContaining({ body: [{ productId: 'sku-3', quantity: 1, shipmentId: 'me' }] })
        );
    });

    it('skips a non-deferred item at zero ATS as OUT_OF_STOCK', async () => {
        getOrder.mockResolvedValue(makeOrderData({ productId: 'sku-4', quantity: 1 }));
        vi.mocked(fetchProductsByIds).mockResolvedValue([makeProduct('sku-4', { ats: 0 })] as any);

        const result = await run({ orderNo: 'ORDER-4', quantityMode: 'exact' });

        expect(result.data.success).toBe(true);
        expect(result.data.skippedItems).toHaveLength(1);
        expect(result.data.skippedItems?.at(0)?.reason).toBe('OUT_OF_STOCK');
        expect(addItemToBasket).not.toHaveBeenCalled();
    });

    it('skips a non-deferred item at negative ATS as OUT_OF_STOCK', async () => {
        getOrder.mockResolvedValue(makeOrderData({ productId: 'sku-5', quantity: 1 }));
        vi.mocked(fetchProductsByIds).mockResolvedValue([makeProduct('sku-5', { ats: -2 })] as any);

        const result = await run({ orderNo: 'ORDER-5', quantityMode: 'available' });

        expect(result.data.success).toBe(true);
        expect(result.data.skippedItems).toHaveLength(1);
        expect(result.data.skippedItems?.at(0)?.reason).toBe('OUT_OF_STOCK');
        expect(addItemToBasket).not.toHaveBeenCalled();
    });
});

describe('action.cart-reorder — quantity modes (non-deferred items)', () => {
    it('skips an item with insufficient stock in exact mode', async () => {
        getOrder.mockResolvedValue(makeOrderData({ productId: 'sku-6', quantity: 5 }));
        vi.mocked(fetchProductsByIds).mockResolvedValue([makeProduct('sku-6', { ats: 3 })] as any);

        const result = await run({ orderNo: 'ORDER-6', quantityMode: 'exact' });

        expect(result.data.success).toBe(true);
        expect(result.data.skippedItems).toHaveLength(1);
        expect(result.data.skippedItems?.at(0)?.reason).toBe('INSUFFICIENT_QUANTITY');
        expect(addItemToBasket).not.toHaveBeenCalled();
    });

    it('adjusts quantity to available stock in available mode', async () => {
        getOrder.mockResolvedValue(makeOrderData({ productId: 'sku-7', quantity: 5 }));
        vi.mocked(fetchProductsByIds).mockResolvedValue([makeProduct('sku-7', { ats: 3 })] as any);

        const result = await run({ orderNo: 'ORDER-7', quantityMode: 'available' });

        expect(result.data.success).toBe(true);
        expect(result.data.adjustedItems).toHaveLength(1);
        expect(result.data.adjustedItems?.at(0)?.addedQuantity).toBe(3);
        expect(addItemToBasket).toHaveBeenCalledWith(
            expect.objectContaining({ body: [{ productId: 'sku-7', quantity: 3, shipmentId: 'me' }] })
        );
    });

    it('adds a fully-available item at its requested quantity', async () => {
        getOrder.mockResolvedValue(makeOrderData({ productId: 'sku-8', quantity: 2 }));
        vi.mocked(fetchProductsByIds).mockResolvedValue([makeProduct('sku-8', { ats: 10 })] as any);

        const result = await run({ orderNo: 'ORDER-8', quantityMode: 'exact' });

        expect(result.data.success).toBe(true);
        expect(result.data.skippedItems).toHaveLength(0);
        expect(addItemToBasket).toHaveBeenCalledWith(
            expect.objectContaining({ body: [{ productId: 'sku-8', quantity: 2, shipmentId: 'me' }] })
        );
    });
});
