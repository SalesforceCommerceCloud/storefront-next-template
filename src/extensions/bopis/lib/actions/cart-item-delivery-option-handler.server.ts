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
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { createApiClients } from '@/lib/api-clients.server';
import { findOrCreateDeliveryShipment } from '@/extensions/multiship/lib/api/basket.server';
import { findOrCreatePickupShipment } from '@/extensions/bopis/lib/api/shipment.server';
import { createBasketSuccessResponse, type BasketActionResponse } from '@/routes/types/action-responses';
import { data, type RouterContextProvider } from 'react-router';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
import { getLogger } from '@/lib/logger.server';
import { isSiteOutOfStock, isStoreOutOfStock } from '@/lib/product/inventory-utils';
import type { CartItemUpdateData } from '@/lib/cart/basket-schemas';

type DeliveryOptionResponse = ReturnType<typeof data<BasketActionResponse>>;

/**
 * Handles delivery option changes for cart items.
 * Moves shipment or updates delivery option based on provided data.
 * Returns a response if the delivery option is handled, or null to fall back to default handler.
 */
export async function handleCartItemDeliveryOptionChange(
    input: CartItemUpdateData,
    context: Readonly<RouterContextProvider>
): Promise<DeliveryOptionResponse | null> {
    const { itemId, productId, quantity, deliveryOption, storeId, inventoryId } = input;

    if (!deliveryOption) return null;

    try {
        const basketResource = await getBasket(context);
        const freshBasket = basketResource.current;
        if (!freshBasket?.basketId) {
            return data(
                {
                    success: false,
                    error: createActionError({ code: ErrorCode.NOT_FOUND, message: 'Basket ID is required.' }),
                },
                { status: 404 }
            );
        }
        const clients = createApiClients(context);
        let targetShipment;
        if (deliveryOption === 'pickup') {
            if (!storeId || !inventoryId) {
                return data(
                    {
                        success: false,
                        error: createActionError({
                            code: ErrorCode.REQUIRED_FIELD,
                            message: 'Store and inventory ID required for pickup.',
                        }),
                    },
                    { status: 400 }
                );
            }
            targetShipment = await findOrCreatePickupShipment(freshBasket, context, storeId);
        } else if (deliveryOption === 'delivery') {
            targetShipment = await findOrCreateDeliveryShipment(freshBasket, context);
        }
        if (!targetShipment) {
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.OPERATION_FAILED,
                        message: 'Could not find or create target shipment.',
                    }),
                },
                { status: 500 }
            );
        }

        // Reject a write that would exceed available stock before it reaches the basket. SCAPI does not enforce
        // inventory on updateItemInBasket, so an over-quantity line stays in the basket and only fails later at
        // order creation with a generic error. A fulfillment swap is over-stock even at the same quantity: moving a
        // line to pickup at a store that stocks fewer units than the line quantity breaches store stock, and the
        // client dropdown cannot catch it (it renders before a store is selected). Check the pool the swap targets:
        // store inventory for pickup, site ats for delivery.
        const existingItem = freshBasket.productItems?.find((item) => item.itemId === itemId);
        const targetProductId = productId || existingItem?.productId;
        const logger = getLogger(context);
        if (targetProductId) {
            let stockLookupFailed = false;
            let product;
            try {
                const { data: productsData } = await clients.shopperProducts.getProducts({
                    params: {
                        query: {
                            ids: [targetProductId],
                            expand: ['availability'],
                            // A pickup line is bound to a store's inventory, not site ats. Request the store's
                            // inventory record so isStoreOutOfStock can read its stockLevel.
                            ...(deliveryOption === 'pickup' && inventoryId ? { inventoryIds: [inventoryId] } : {}),
                        },
                    },
                });
                product = productsData?.data?.[0];
            } catch (error) {
                // A transient product-service failure must not block a fulfillment change SCAPI would otherwise
                // accept. Fail open: log and fall through to the write. The place-order backstop still catches a
                // genuine out-of-stock at checkout.
                stockLookupFailed = true;
                logger.warn('CartItemDeliveryOption: availability lookup failed, allowing update', {
                    itemId,
                    targetProductId,
                    error,
                });
            }
            const outOfStock =
                deliveryOption === 'pickup'
                    ? isStoreOutOfStock(product, inventoryId, quantity)
                    : isSiteOutOfStock(product, quantity);
            // A missing product document (empty result for a delisted/unknown SKU) is also a reject: we must not
            // write an unchecked quantity that only fails later at order creation. A set/bundle parent carries no
            // top-level inventory block, so isSiteOutOfStock would treat it as out of stock — leave that to SCAPI.
            const isMissingProduct = !stockLookupFailed && !product;
            const isBundleWithoutSiteInventory = deliveryOption === 'delivery' && !!product && !product.inventory;
            if (!stockLookupFailed && (isMissingProduct || (!isBundleWithoutSiteInventory && outOfStock))) {
                logger.info('CartItemDeliveryOption: rejected over-stock fulfillment change', {
                    itemId,
                    targetProductId,
                    quantity,
                    deliveryOption,
                });
                return data(
                    {
                        success: false,
                        error: createActionError({
                            code: ErrorCode.OUT_OF_STOCK,
                            message:
                                deliveryOption === 'pickup'
                                    ? 'Requested quantity exceeds available store stock'
                                    : 'Requested quantity exceeds available stock',
                        }),
                    },
                    { status: 422 }
                );
            }
        }

        await clients.shopperBasketsV2.updateItemInBasket({
            params: { path: { basketId: freshBasket.basketId, itemId } },
            body: {
                quantity,
                productId,
                inventoryId: deliveryOption === 'pickup' ? inventoryId : undefined,
                shipmentId: targetShipment.shipmentId,
            },
        });
        // Refetch basket after mutation
        const basket = await clients.shopperBasketsV2.getBasket({
            params: { path: { basketId: freshBasket.basketId } },
        });
        updateBasketResource(context, basket.data);
        return data(createBasketSuccessResponse(basket.data));
    } catch (error) {
        return data({ success: false, error: createActionError({ error }) }, { status: 500 });
    }
}
