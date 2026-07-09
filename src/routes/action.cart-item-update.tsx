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
import { cartItemUpdateSchema } from '@/lib/cart/basket-schemas';
import { ErrorCode } from '@/lib/error-codes';
import { isSiteOutOfStock } from '@/lib/product/inventory-utils';

// @sfdc-extension-line SFDC_EXT_BOPIS
import { handleCartItemDeliveryOptionChange } from '@/extensions/bopis/lib/actions/cart-item-delivery-option-handler.server';

/** Builds the 422 out-of-stock response the guard returns when a write would breach available stock. */
const rejectOutOfStock = (message: string) =>
    data(
        {
            success: false,
            error: createActionError({ code: ErrorCode.OUT_OF_STOCK, message }),
        },
        { status: 422 }
    );

/**
 * Server action for updating a cart item (variant and/or quantity).
 *
 * This action can update:
 * - Product variant (e.g., changing color, size)
 * - Quantity
 * - Both variant and quantity
 *
 * Used by cart edit modal and cart components for updating cart items.
 */
export const action = createBasketAction(
    {
        method: 'PATCH',
        action: BasketAction.CartItemUpdate,
        parse: (fd) => ({
            itemId: fd.get('itemId')?.toString() || '',
            productId: fd.get('productId')?.toString() || undefined,
            quantity: fd.get('quantity')?.toString() || '',
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            deliveryOption: fd.get('deliveryOption')?.toString() || undefined,
            storeId: fd.get('storeId')?.toString() || undefined,
            inventoryId: fd.get('inventoryId')?.toString() || undefined,
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
        }),
    },
    async ({ input, basket, basketId, context, clients, logger }) => {
        const validationResult = cartItemUpdateSchema.safeParse(input);

        if (!validationResult.success) {
            logger.warn('CartItemUpdate: validation failed', { issues: validationResult.error.issues });
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.INVALID_INPUT,
                        message: validationResult.error.issues[0]?.message || 'Invalid form data',
                    }),
                },
                { status: 400 }
            );
        }

        const { itemId, productId, quantity } = validationResult.data;

        logger.debug('CartItemUpdate: updating item', { itemId, productId, quantity, basketId });

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        const response = await handleCartItemDeliveryOptionChange(validationResult.data, context);
        if (response) {
            return response;
        }
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        // Reject a write that would exceed available stock before it reaches the basket. SCAPI does not enforce
        // inventory on updateItemInBasket, so an over-quantity item stays in the basket and only fails later at order
        // creation with a generic error. We check availability on a quantity increase OR a variant swap: switching to
        // a different, out-of-stock variant at the same quantity breaches stock just as much as raising the quantity.
        // A pure decrease or no-op on the same variant can never breach stock, so it skips the lookup.
        const existingItem = basket.productItems?.find((item) => item.itemId === itemId);
        const targetProductId = productId || existingItem?.productId;
        const isVariantSwap = !!productId && productId !== existingItem?.productId;
        const isQuantityIncrease = quantity > (existingItem?.quantity ?? 0);
        if (existingItem && targetProductId && (isQuantityIncrease || isVariantSwap)) {
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            // A pickup line is bound to a store's inventory, not site ATS. The minicart stepper submits only
            // itemId + quantity (no deliveryOption), so the delivery-option handler above falls through to here.
            // Check the store's stock for a pickup line instead of site availability.
            const pickupInventoryId = existingItem.inventoryId;
            if (pickupInventoryId) {
                let pickupLookupFailed = false;
                let storeInventory;
                try {
                    const { data: pickupData } = await clients.shopperProducts.getProducts({
                        params: {
                            query: {
                                ids: [targetProductId],
                                inventoryIds: [pickupInventoryId],
                                expand: ['availability'],
                            },
                        },
                    });
                    storeInventory = pickupData?.data?.[0]?.inventories?.find((inv) => inv.id === pickupInventoryId);
                } catch (error) {
                    // A transient product-service failure must not block a pickup edit that SCAPI would otherwise
                    // accept. Fail open: log and fall through to the write. The place-order backstop still catches a
                    // genuine out-of-stock at checkout.
                    pickupLookupFailed = true;
                    logger.warn('CartItemUpdate: pickup availability lookup failed, allowing update', {
                        itemId,
                        targetProductId,
                        error,
                    });
                }
                // On a successful lookup, a missing store-inventory record means the store does not stock this line —
                // reject. On a failed lookup we have no signal, so we do not reject here.
                if (
                    !pickupLookupFailed &&
                    (!storeInventory || !storeInventory.orderable || (storeInventory.stockLevel ?? 0) < quantity)
                ) {
                    logger.info('CartItemUpdate: rejected over-quantity pickup increase', {
                        itemId,
                        targetProductId,
                        quantity,
                    });
                    return rejectOutOfStock('Requested quantity exceeds available store stock');
                }
            }
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
            // Check site availability. A pickup line (identified by its inventoryId) is bound to store stock,
            // not site ATS, so the site check does not apply to it.
            if (!existingItem.inventoryId) {
                let product;
                let siteLookupFailed = false;
                try {
                    const { data: productsData } = await clients.shopperProducts.getProducts({
                        params: { query: { ids: [targetProductId], expand: ['availability'] } },
                    });
                    product = productsData?.data?.[0];
                } catch (error) {
                    // A transient product-service failure must not block a cart edit that SCAPI would otherwise
                    // accept. Fail open: log and fall through to the write. The place-order backstop still catches a
                    // genuine out-of-stock at checkout.
                    siteLookupFailed = true;
                    logger.warn('CartItemUpdate: site availability lookup failed, allowing update', {
                        itemId,
                        targetProductId,
                        error,
                    });
                }
                // Reject when the product document is missing (empty result for a delisted/unknown SKU) or when its
                // site inventory shows insufficient stock. A product with no top-level `inventory` block (a set or
                // bundle, whose stock lives on its children) is left to SCAPI — isSiteOutOfStock would otherwise
                // reject it, and we do not resolve child inventory here.
                const isMissingProduct = !siteLookupFailed && !product;
                const hasSiteInventory = !!product?.inventory;
                if (isMissingProduct || (hasSiteInventory && isSiteOutOfStock(product, quantity))) {
                    logger.info('CartItemUpdate: rejected over-quantity increase', {
                        itemId,
                        targetProductId,
                        quantity,
                    });
                    return rejectOutOfStock('Requested quantity exceeds available stock');
                }
            }
        }

        const updateBody: { quantity: number; productId?: string } = { quantity };
        if (productId) {
            updateBody.productId = productId;
        }

        const { data: updatedBasket } = await clients.shopperBasketsV2.updateItemInBasket({
            params: {
                path: {
                    basketId,
                    itemId,
                },
            },
            body: updateBody,
        });
        return updatedBasket;
    }
);
