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
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { findOrCreatePickupShipment } from '@/extensions/bopis/lib/api/shipment.server';
import { getStoreInventoryId } from '@/extensions/bopis/lib/api/stores.server';
import { validateDeliveryOptionCompatibility } from '@/extensions/bopis/lib/product-actions';
// @sfdc-extension-block-end SFDC_EXT_BOPIS

/**
 * Server action to add multiple items to the cart (for product sets).
 */
export const action = createBasketAction(
    {
        method: 'POST',
        action: BasketAction.CartSetAdd,
        parse: (fd) => {
            const raw = fd.get('productItems') as string | null;
            return raw
                ? (JSON.parse(raw) as {
                      productId: string;
                      quantity: number;
                      inventoryId?: string | null;
                      storeId?: string | null;
                  }[])
                : null;
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
            logger.warn('CartSetAdd: missing productItems in form data');
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.REQUIRED_FIELD,
                        message: 'productItems missing from form data',
                    }),
                },
                { status: 400 }
            );
        }

        logger.debug('CartSetAdd: starting addMultipleItemsToCart', { itemCount: input.length });

        const fulfillment = { shipmentId: 'me' };

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        const fulfillmentItems = input.map((item) => ({
            storeId: item.storeId?.trim(),
            inventoryId: item.inventoryId?.trim(),
            hasPickupIdentifiers: item.storeId != null || item.inventoryId != null,
        }));
        const hasIncompletePickupItem = fulfillmentItems.some(
            (item) => item.hasPickupIdentifiers && (!item.storeId || !item.inventoryId)
        );
        const pickupItems = fulfillmentItems.filter((item) => item.storeId && item.inventoryId);

        if (hasIncompletePickupItem || (pickupItems.length > 0 && pickupItems.length !== input.length)) {
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.INVALID_INPUT,
                        message: 'Set items must all use delivery or all use pickup fulfillment',
                    }),
                },
                { status: 400 }
            );
        }

        const firstPickupItem = pickupItems[0];
        if (
            firstPickupItem &&
            pickupItems.some(
                (item) => item.storeId !== firstPickupItem.storeId || item.inventoryId !== firstPickupItem.inventoryId
            )
        ) {
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.CONFLICT,
                        message: 'Pickup identifiers must be consistent across all set items',
                    }),
                },
                { status: 409 }
            );
        }

        const pickupStoreId = firstPickupItem?.storeId;
        const pickupInventoryId = firstPickupItem?.inventoryId;
        const deliveryValidation = validateDeliveryOptionCompatibility(basket, pickupStoreId, context);
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
        if (pickupStoreId && pickupInventoryId) {
            const storeInventoryId = await getStoreInventoryId(context, pickupStoreId);
            if (!storeInventoryId || storeInventoryId !== pickupInventoryId) {
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
            const pickupShipment = await findOrCreatePickupShipment(basket, context, pickupStoreId);
            fulfillment.shipmentId = pickupShipment.shipmentId;
        }
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        const { data: updatedBasket } = await clients.shopperBasketsV2.addItemToBasket({
            params: {
                path: { basketId },
            },
            body: input.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                // @sfdc-extension-block-start SFDC_EXT_BOPIS
                ...(pickupInventoryId ? { inventoryId: pickupInventoryId } : {}),
                // @sfdc-extension-block-end SFDC_EXT_BOPIS
                shipmentId: fulfillment.shipmentId,
            })),
        });
        return updatedBasket;
    }
);
