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
import { data } from 'react-router';
import { BasketAction, createBasketAction } from '@/lib/cart/basket-action.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
import { updateBasketResource } from '@/middlewares/basket.server';
import { fetchProductsByIds } from '@/lib/api/products.server';
import { getEffectiveStockLevel, hasDeferredAvailability } from '@/lib/product/inventory-utils';
import type { ReorderActionResponse, AdjustedOrderItem, SkippedOrderItem } from '@/routes/types/action-responses';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';

export type ReorderQuantityMode = 'exact' | 'available';

/**
 * Server action for reordering a previous order by order number.
 *
 * Fetches the original order, checks real-time inventory for each line item,
 * and adds all orderable items to the basket in one SCAPI call.
 * Items that can't be fulfilled are returned in `skippedItems`; items added at
 * a reduced quantity (when `quantityMode=available`) are returned in `adjustedItems`.
 */
export const action = createBasketAction(
    {
        method: 'POST',
        action: BasketAction.CartReorder,
        parse: (fd) => {
            const rawOrderNo = fd.get('orderNo');
            const rawMode = fd.get('quantityMode');
            const orderNo = typeof rawOrderNo === 'string' ? rawOrderNo : '';
            const quantityMode: ReorderQuantityMode =
                rawMode === 'exact' || rawMode === 'available' ? rawMode : 'exact';
            return { orderNo, quantityMode };
        },
    },
    async ({ input, basketId, context, clients, logger }) => {
        const { orderNo, quantityMode } = input;

        if (!orderNo) {
            return data(
                {
                    success: false,
                    error: createActionError({ code: ErrorCode.REQUIRED_FIELD, message: 'orderNo is required' }),
                },
                { status: 400 }
            );
        }

        // 1. Fetch the original order
        const { data: order } = await clients.shopperOrders.getOrder({
            params: { path: { orderNo } },
        });

        const productItems = order?.productItems ?? [];
        if (productItems.length === 0) {
            return data<ReorderActionResponse>({ success: true, skippedItems: [] });
        }

        // 2. Fetch real-time product data with availability
        const productIds = productItems
            .map((item) => item.productId)
            .filter((id): id is string => typeof id === 'string');
        const products = await fetchProductsByIds(context, productIds, { expand: ['availability'] });
        const productsById: Record<string, ShopperProducts.schemas['Product']> = Object.fromEntries(
            products.map((p) => [p.id, p])
        );

        // 3. Partition items into orderable / skipped / adjusted
        const skippedItems: SkippedOrderItem[] = [];
        const adjustedItems: AdjustedOrderItem[] = [];
        const payload: ShopperBasketsV2.schemas['ProductItem'][] = [];

        for (const item of productItems) {
            const productId = item.productId;
            if (!productId) continue;

            const requestedQuantity = item.quantity ?? 1;
            const productName = item.productName ?? undefined;
            const product = productsById[productId];

            if (!product) {
                skippedItems.push({ productId, productName, requestedQuantity, reason: ErrorCode.NOT_FOUND });
                continue;
            }

            if (!product.inventory?.orderable) {
                skippedItems.push({ productId, productName, requestedQuantity, reason: ErrorCode.NOT_ORDERABLE });
                continue;
            }

            const stockLevel = getEffectiveStockLevel({ product, isPickup: false, variant: null });
            const deferred = hasDeferredAvailability(product.inventory);

            if (stockLevel <= 0 && !deferred) {
                skippedItems.push({ productId, productName, requestedQuantity, reason: ErrorCode.OUT_OF_STOCK });
                continue;
            }

            if (!deferred && stockLevel < requestedQuantity) {
                if (quantityMode === 'exact') {
                    skippedItems.push({
                        productId,
                        productName,
                        requestedQuantity,
                        reason: ErrorCode.INSUFFICIENT_QUANTITY,
                    });
                    continue;
                }
                adjustedItems.push({ productId, productName, requestedQuantity, addedQuantity: stockLevel });
                payload.push({ productId, quantity: stockLevel, shipmentId: 'me' });
                continue;
            }

            payload.push({ productId, quantity: requestedQuantity, shipmentId: 'me' });
        }

        // If every line was skipped, return without touching the basket
        if (payload.length === 0) {
            return data<ReorderActionResponse>({ success: true, skippedItems, adjustedItems });
        }

        // 4. Add all orderable items in one SCAPI call
        const { data: updatedBasket } = await clients.shopperBasketsV2.addItemToBasket({
            params: { path: { basketId } },
            body: payload,
        });

        // 5. Sync basket resource manually — factory auto-update is bypassed by the data() escape hatch
        updateBasketResource(context, updatedBasket);
        logger.info('CartReorder: items added', {
            addedItemCount: payload.length,
            skippedItemCount: skippedItems.length,
        });

        return data<ReorderActionResponse>({ success: true, basket: updatedBasket, skippedItems, adjustedItems });
    }
);
