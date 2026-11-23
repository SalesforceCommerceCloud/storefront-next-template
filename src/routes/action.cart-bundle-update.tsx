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
import { scaleInventoryQuantity } from '@/scapi';
import { getLocalInventoryContext } from '@/lib/product/local-inventory.server';
import { assertLocalBasketStock } from '@/lib/cart/local-inventory.server';
import { BasketAction, createBasketAction } from '@/lib/cart/basket-action.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';

/**
 * Server action for updating multiple items in a bundle.
 *
 * This action handles updating a bundle and its child products in the basket.
 * It can update parent bundle quantity, child product variants (e.g., changing
 * color, size of bundled items), or both simultaneously.
 *
 * Used by cart edit modal for updating bundle items.
 */
export const action = createBasketAction(
    {
        method: 'PATCH',
        action: BasketAction.CartBundleUpdate,
        parse: (fd) => {
            const raw = fd.get('items')?.toString();
            return raw ? (JSON.parse(raw) as { itemId: string; quantity: number; productId?: string }[]) : null;
        },
    },
    async ({ input, basket, context, basketId, clients, logger }) => {
        if (!input) {
            logger.warn('CartBundleUpdate: missing items data in form data');
            return data(
                {
                    success: false,
                    error: createActionError({ code: ErrorCode.REQUIRED_FIELD, message: 'Items data is required' }),
                },
                { status: 400 }
            );
        }

        if (input.length === 0) {
            logger.warn('CartBundleUpdate: items must be a non-empty array');
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.INVALID_INPUT,
                        message: 'Items must be a non-empty array',
                    }),
                },
                { status: 400 }
            );
        }

        for (const item of input) {
            if (!item.itemId || !Number.isFinite(item.quantity) || item.quantity <= 0) {
                logger.warn('CartBundleUpdate: invalid item data', { itemId: item.itemId, quantity: item.quantity });
                return data(
                    {
                        success: false,
                        error: createActionError({
                            code: ErrorCode.INVALID_INPUT,
                            message: 'Each item must have valid itemId and quantity',
                        }),
                    },
                    { status: 400 }
                );
            }
        }

        if (getLocalInventoryContext(context)) {
            const nextItems = (basket.productItems ?? []).map((item) => {
                const change = input.find((entry) => entry.itemId === item.itemId);
                const quantity = change?.quantity ?? item.quantity ?? 1;
                return {
                    ...item,
                    ...change,
                    bundledProductItems: item.bundledProductItems?.map((child) => {
                        const childChange = input.find((entry) => entry.itemId === child.itemId);
                        return {
                            ...child,
                            ...childChange,
                            quantity:
                                childChange?.quantity ??
                                scaleInventoryQuantity(child.quantity ?? 0, quantity, item.quantity ?? 0),
                        };
                    }),
                };
            });
            await assertLocalBasketStock(context, basket, nextItems);
        }

        logger.debug('CartBundleUpdate: updating items', { itemCount: input.length, basketId });

        const { data: updatedBasket } = await clients.shopperBasketsV2.updateItemsInBasket({
            params: {
                path: { basketId },
            },
            body: input,
        });
        return updatedBasket;
    }
);
