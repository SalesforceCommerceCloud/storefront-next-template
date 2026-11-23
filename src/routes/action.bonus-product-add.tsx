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
import { getLocalInventoryContext } from '@/lib/product/local-inventory.server';
import { assertLocalBasketStock } from '@/lib/cart/local-inventory.server';
import { BasketAction, createBasketAction } from '@/lib/cart/basket-action.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { bonusProductAddSchema } from '@/lib/cart/basket-schemas';
import { ErrorCode } from '@/lib/error-codes';

/**
 * Server action to add bonus products to the cart (supports multiple slots).
 *
 * Key difference from regular addToCart: includes `bonusDiscountLineItemId` parameter
 * to associate items with specific promotional slots.
 *
 * When multiple bonus discount line items exist for the same promotion (e.g., 2 qualifying
 * items in cart create 2 slots), this action distributes the requested quantity across
 * available slots. Validates each bonusDiscountLineItemId exists in the basket and that
 * promotion IDs match before calling the Commerce API.
 */
export const action = createBasketAction(
    {
        method: 'POST',
        action: BasketAction.BonusProductAdd,
        parse: (fd) => ({ bonusItems: fd.get('bonusItems')?.toString() || '' }),
    },
    async ({ input, basketId, basket, context, clients, logger }) => {
        const validationResult = bonusProductAddSchema.safeParse(input);

        if (!validationResult.success) {
            logger.warn('BonusProductAdd: validation failed', { issues: validationResult.error.issues });
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

        const { bonusItems } = validationResult.data;

        // Validate all bonusDiscountLineItemIds exist in basket
        for (const item of bonusItems) {
            const bonusDiscountItem = basket.bonusDiscountLineItems?.find(
                (bdItem) => bdItem.id === item.bonusDiscountLineItemId
            );

            if (!bonusDiscountItem) {
                logger.warn('BonusProductAdd: invalid bonus discount line item ID', {
                    bonusDiscountLineItemId: item.bonusDiscountLineItemId,
                });
                return data(
                    {
                        success: false,
                        error: createActionError({
                            code: ErrorCode.INVALID_INPUT,
                            message: `Invalid bonus discount line item ID: ${item.bonusDiscountLineItemId}. The promotion may have expired or changed.`,
                        }),
                    },
                    { status: 400 }
                );
            }

            // Validate promotionId matches (sanity check)
            if (bonusDiscountItem.promotionId !== item.promotionId) {
                logger.warn('BonusProductAdd: promotion ID mismatch', {
                    expected: bonusDiscountItem.promotionId,
                    received: item.promotionId,
                });
                return data(
                    {
                        success: false,
                        error: createActionError({
                            code: ErrorCode.INVALID_INPUT,
                            message: 'Promotion ID mismatch. Please refresh the page and try again.',
                        }),
                    },
                    { status: 400 }
                );
            }
        }

        const local = getLocalInventoryContext(context);
        // Build request body for SCAPI - each item becomes an entry in the array
        const requestBody = bonusItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            bonusDiscountLineItemId: item.bonusDiscountLineItemId,
            ...(local ? { inventoryId: local.inventoryId } : {}),
        }));
        await assertLocalBasketStock(context, basket, [...(basket.productItems ?? []), ...requestBody]);

        const { data: updatedBasket } = await clients.shopperBasketsV2.addItemToBasket({
            params: {
                path: { basketId },
            },
            body: requestBody,
        });
        return updatedBasket;
    }
);
