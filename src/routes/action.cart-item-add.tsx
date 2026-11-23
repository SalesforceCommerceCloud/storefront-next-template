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
// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { selectedStoreContext } from '@/extensions/store-locator/middlewares/selected-store.server';
import { parsePendingAdd } from '@/extensions/store-locator/lib/pending-add';
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
import { getLocalInventoryContext } from '@/lib/product/local-inventory.server';
import { assertLocalBasketStock } from '@/lib/cart/local-inventory.server';
import { BasketAction, createBasketAction } from '@/lib/cart/basket-action.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { findOrCreatePickupShipment } from '@/extensions/bopis/lib/api/shipment.server';
import { getStoreInventoryId } from '@/extensions/bopis/lib/api/stores.server';
import { rejectUnconfirmedStoreChange } from '@/extensions/bopis/lib/actions/store-context-guard.server';
import { validateDeliveryOptionCompatibility } from '@/extensions/bopis/lib/product-actions';
// @sfdc-extension-block-end SFDC_EXT_BOPIS

/**
 * Server action to add a single item to the cart.
 */
export const action = createBasketAction(
    {
        method: 'POST',
        action: BasketAction.CartItemAdd,
        parse: (fd) => {
            const raw = fd.get('productItem') as string | null;
            return raw
                ? (JSON.parse(raw) as {
                      productId: string;
                      quantity: number;
                      optionItems?: Array<{ optionId: string; optionValueId: string }>;
                      inventoryId?: string | null;
                      storeId?: string | null;
                  })
                : null;
        },
    },
    // Basket/context are shared by local inventory, Store Locator and BOPIS.
    async ({ input, basket, context, basketId, clients, logger }) => {
        if (!input) {
            logger.warn('CartItemAdd: missing productItem in form data');
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.REQUIRED_FIELD,
                        message: 'productItem missing from form data',
                    }),
                },
                { status: 400 }
            );
        }

        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        const entryEnabled = getConfig(context).features.storeEntry?.enabled;
        if (entryEnabled) {
            const selection = context.get(selectedStoreContext);
            const validIntent = parsePendingAdd(input);
            if (!validIntent || !selection?.fulfillmentMode || !selection.inventoryId) {
                return data(
                    {
                        success: false,
                        error: createActionError({
                            code: ErrorCode.INVALID_INPUT,
                            message: 'Choose a store and fulfillment mode before adding items',
                        }),
                    },
                    { status: 422 }
                );
            }
            input = {
                ...validIntent,
                storeId: selection.fulfillmentMode === 'pickup' ? selection.id : null,
                inventoryId: selection.fulfillmentMode === 'pickup' ? selection.inventoryId : null,
            };
        }
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

        logger.debug('CartItemAdd: starting addToCart', {
            productId: input.productId,
            quantity: input.quantity,
        });

        const localInventoryId = getLocalInventoryContext(context)?.inventoryId;
        const fulfillment = {
            shipmentId: 'me',
            inventoryId: undefined as string | undefined,
        };

        await assertLocalBasketStock(context, basket, [
            ...(basket.productItems ?? []),
            { productId: input.productId, quantity: input.quantity },
        ]);

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        const storeId = input.storeId?.trim();
        const requestedInventoryId = input.inventoryId?.trim();
        const hasPickupIdentifiers = input.storeId != null || input.inventoryId != null;
        if (hasPickupIdentifiers && (!storeId || !requestedInventoryId)) {
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.INVALID_INPUT,
                        message: 'Pickup fulfillment requires both storeId and inventoryId',
                    }),
                },
                { status: 400 }
            );
        }
        if (storeId) {
            const confirmationRequired = rejectUnconfirmedStoreChange(context, storeId);
            if (confirmationRequired) return confirmationRequired;
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
            fulfillment.inventoryId = await getStoreInventoryId(context, storeId);
            if (!fulfillment.inventoryId || fulfillment.inventoryId !== requestedInventoryId) {
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
        }
        if (storeId && fulfillment.inventoryId) {
            const pickupShipment = await findOrCreatePickupShipment(basket, context, storeId);
            fulfillment.shipmentId = pickupShipment.shipmentId;
        }
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        const payload = {
            productId: input.productId,
            quantity: input.quantity,
            ...(input.optionItems ? { optionItems: input.optionItems } : {}),
            ...(localInventoryId
                ? { inventoryId: localInventoryId }
                : fulfillment.inventoryId
                  ? { inventoryId: fulfillment.inventoryId }
                  : {}),
            shipmentId: fulfillment.shipmentId,
        };
        const { data: updatedBasket } = await clients.shopperBasketsV2.addItemToBasket({
            params: { path: { basketId } },
            body: [payload],
        });
        return updatedBasket;
    }
);
