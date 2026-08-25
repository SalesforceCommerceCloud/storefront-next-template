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
import type { ShopperProducts } from '@/scapi';
import { data } from 'react-router';
import { BasketAction, createBasketAction } from '@/lib/cart/basket-action.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { findOrCreatePickupShipment } from '@/extensions/bopis/lib/api/shipment.server';
import { getStoreInventoryId } from '@/extensions/bopis/lib/api/stores.server';
import { validateDeliveryOptionCompatibility } from '@/extensions/bopis/lib/product-actions';
// @sfdc-extension-block-end SFDC_EXT_BOPIS

/**
 * Product selection values structure matching client-side ProductSelectionValues
 */
type ProductSelectionValues = {
    product: ShopperProducts.schemas['Product'];
    variant?: ShopperProducts.schemas['Variant'];
    quantity: number;
};

/**
 * Server action to add a product bundle to the cart.
 *
 * This is a multi-step operation:
 * 1. Add the bundle parent item with bundled product items
 * 2. Update child items with correct variant selections
 * 3. Refresh the basket to get the final state
 */
export const action = createBasketAction(
    {
        method: 'POST',
        action: BasketAction.CartBundleAdd,
        parse: (fd) => {
            const bundleItemRaw = fd.get('bundleItem') as string | null;
            const childSelectionsRaw = fd.get('childSelections') as string | null;
            if (!bundleItemRaw || !childSelectionsRaw) return null;
            return {
                bundleItem: JSON.parse(bundleItemRaw) as {
                    productId: string;
                    quantity: number;
                    inventoryId?: string | null;
                    storeId?: string | null;
                },
                childSelections: JSON.parse(childSelectionsRaw) as ProductSelectionValues[],
            };
        },
    },
    async ({
        input,
        basketId,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        basket,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        context,
        clients,
        logger,
    }) => {
        if (!input) {
            logger.warn('CartBundleAdd: missing bundle data in form data');
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.REQUIRED_FIELD,
                        message: 'Bundle data missing from form data',
                    }),
                },
                { status: 400 }
            );
        }

        const { bundleItem, childSelections } = input;

        logger.debug('CartBundleAdd: starting addBundleToCart', {
            productId: bundleItem.productId,
            quantity: bundleItem.quantity,
            childCount: childSelections.length,
        });

        const fulfillment = {
            shipmentId: 'me',
            inventoryId: undefined as string | undefined,
        };

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        const storeId = bundleItem.storeId?.trim();
        const requestedInventoryId = bundleItem.inventoryId?.trim();
        const hasPickupIdentifiers = bundleItem.storeId != null || bundleItem.inventoryId != null;
        if (hasPickupIdentifiers && (!storeId || !requestedInventoryId)) {
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.INVALID_INPUT,
                        message: 'Bundle pickup fulfillment requires both storeId and inventoryId',
                    }),
                },
                { status: 400 }
            );
        }

        const deliveryValidation = validateDeliveryOptionCompatibility(basket, storeId, context);
        if (!deliveryValidation.valid) {
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.CONFLICT,
                        message: deliveryValidation.errorMessage,
                    }),
                },
                { status: 409 }
            );
        }
        if (storeId && requestedInventoryId) {
            const storeInventoryId = await getStoreInventoryId(context, storeId);
            if (!storeInventoryId || storeInventoryId !== requestedInventoryId) {
                return data(
                    {
                        success: false,
                        error: createActionError({
                            code: ErrorCode.INVALID_INPUT,
                            message: 'Pickup store and inventory do not match',
                        }),
                    },
                    { status: 400 }
                );
            }
            fulfillment.inventoryId = storeInventoryId;
        }
        if (storeId && fulfillment.inventoryId) {
            const pickupShipment = await findOrCreatePickupShipment(basket, context, storeId);
            fulfillment.shipmentId = pickupShipment.shipmentId;
        }
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        // Extract productId and quantity from ProductSelectionValues structure for API call
        // Prefer variant.productId if variant exists, otherwise use product.id
        const bundledProductItems = childSelections.map((selection) => ({
            productId: selection.variant?.productId || selection.product.id,
            quantity: selection.quantity,
        }));

        // Add bundle to basket with bundled product items
        const { data: initialBasket } = await clients.shopperBasketsV2.addItemToBasket({
            params: {
                path: { basketId },
            },
            body: [
                {
                    productId: bundleItem.productId,
                    quantity: bundleItem.quantity,
                    // @sfdc-extension-line SFDC_EXT_BOPIS
                    ...(fulfillment.inventoryId ? { inventoryId: fulfillment.inventoryId } : {}),
                    shipmentId: fulfillment.shipmentId,
                    bundledProductItems,
                },
            ],
        });

        let updatedBasket = initialBasket;

        // If there are child selections, we may need to update them
        if (childSelections.length > 0) {
            // Get the basket item we just added
            const addedItem = updatedBasket.productItems?.find((item) => item.productId === bundleItem.productId);

            if (addedItem?.bundledProductItems) {
                // Update the bundled product items with correct variant selections
                // Match by product ID instead of array index to handle correct ordering
                const itemsToUpdate = addedItem.bundledProductItems.map((bundledItem) => {
                    // Find the corresponding selection by matching product ID
                    const matchingSelection = childSelections.find(
                        (selection) =>
                            selection.variant?.productId === bundledItem.productId ||
                            selection.product.id === bundledItem.productId
                    );

                    // Extract productId from the full structure (prefer variant.productId if variant exists)
                    const selectedProductId = matchingSelection?.variant?.productId || matchingSelection?.product.id;

                    return {
                        itemId: bundledItem.itemId,
                        productId: selectedProductId || bundledItem.productId,
                        quantity: matchingSelection?.quantity || bundledItem.quantity,
                        // @sfdc-extension-line SFDC_EXT_BOPIS
                        ...(fulfillment.inventoryId ? { inventoryId: fulfillment.inventoryId } : {}),
                        shipmentId: fulfillment.shipmentId,
                    };
                });

                await clients.shopperBasketsV2.updateItemsInBasket({
                    params: {
                        path: { basketId },
                    },
                    body: itemsToUpdate,
                });

                // Get the updated basket after child items update
                const { data: refreshedBasket } = await clients.shopperBasketsV2.getBasket({
                    params: {
                        path: { basketId },
                    },
                });
                updatedBasket = refreshedBasket;
            }
        }

        return updatedBasket;
    }
);
