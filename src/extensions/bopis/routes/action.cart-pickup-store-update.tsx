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
// React Router
import type { Route } from './+types/action.cart-pickup-store-update';
import { data } from 'react-router';

// Middlewares
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';

// Utils
import { createApiClients } from '@/lib/api-clients.server';
import { fetchProductsByIds } from '@/lib/api/products.server';
import { createBasketSuccessResponse, type BasketActionResponse } from '@/routes/types/action-responses';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
import { siteContext, type SiteContext } from '@salesforce/storefront-next-runtime/site-context';

import { updateShipmentForPickup } from '@/extensions/bopis/lib/api/shipment.server';
import { isStoreOutOfStock } from '@/lib/product/inventory-utils';
import { getPickupShipment, getPickupProductItemsForStore } from '@/extensions/bopis/lib/basket-utils';
import { pickupStoreUpdateSchema, parsePickupStoreUpdateFromFormData } from '@/lib/cart/basket-schemas';

/**
 * Server action for changing the pickup store for all pickup items in the basket.
 *
 * This action handles changing the pickup store for all items currently set for store pickup.
 * It performs the following operations:
 * - Validates the request method (PATCH only)
 * - Extracts store information from form data
 * - Validates inventory availability at the new store BEFORE updating the basket
 * - Updates the shipment with the new store ID (only if validation passes)
 * - Updates all pickup items in the basket with the new inventory ID
 * - Returns standardized success/error response
 *
 * Inventory validation:
 * - Fetches product data with the new store's inventory ID
 * - Checks if all pickup items (including bundle children) are in stock at the new store
 * - Returns an error if any items are out of stock, preventing basket update
 *
 * Used by the pickup store info card component when user changes the pickup store.
 *
 * @returns Promise resolving to BasketActionResponse
 * @returns success - Boolean indicating if the operation was successful
 * @returns basket - Updated basket object (on success)
 * @returns error - Error message string (on failure, including out-of-stock validation errors)
 *
 * @throws Response with 405 status if request method is not PATCH
 * @throws Error if form data validation fails (invalid storeId or inventoryId)
 * @throws Error if no basket is found in the session
 * @throws Error if any items are out of stock at the selected store
 */
export async function action({
    request,
    context,
}: Route.ActionArgs): Promise<ReturnType<typeof data<BasketActionResponse>>> {
    if (request.method !== 'PATCH') {
        return data(
            {
                success: false,
                error: createActionError({ code: ErrorCode.METHOD_NOT_ALLOWED, message: 'Method not allowed' }),
            },
            { status: 405 }
        );
    }

    const basketResource = await getBasket(context);
    const basket = basketResource.current;
    const basketId = basket?.basketId ?? basketResource.snapshot?.basketId;

    if (!basketId) {
        return data(
            { success: false, error: createActionError({ code: ErrorCode.NOT_FOUND, message: 'No basket found' }) },
            { status: 404 }
        );
    }

    let originalStoreId = '';
    let pickupShipmentId = '';
    let shipmentUpdated = false;

    try {
        const formData = await request.formData();

        // Parse and validate form data for pickup store update
        const rawData = parsePickupStoreUpdateFromFormData(formData);
        const validationResult = pickupStoreUpdateSchema.safeParse(rawData);

        if (!validationResult.success) {
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.REQUIRED_FIELD,
                        message: validationResult.error.issues[0]?.message || 'Store ID and inventory ID are required',
                    }),
                },
                { status: 400 }
            );
        }

        // Extract the validated fields
        const { storeId, inventoryId, storeName } = validationResult.data;

        const clients = createApiClients(context);
        if (!basket) {
            return data(
                { success: false, error: createActionError({ code: ErrorCode.NOT_FOUND, message: 'No basket found' }) },
                { status: 404 }
            );
        }

        // Capture the original store ID from the first pickup shipment for potential rollback
        // Validate that there's an existing pickup store before allowing change
        const pickupShipment = getPickupShipment(basket);
        if (!pickupShipment?.shipmentId || !pickupShipment?.c_fromStoreId) {
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.NOT_FOUND,
                        message: 'No pickup shipment found. Cannot change pickup store.',
                    }),
                },
                { status: 404 }
            );
        }
        originalStoreId = pickupShipment.c_fromStoreId as string;
        pickupShipmentId = pickupShipment.shipmentId;

        // Get pickup items from the current basket that belong to the original store
        // Since a basket has a single store pickup shipment, get items for that store
        const currentPickupItems = getPickupProductItemsForStore(basket, originalStoreId);

        // Validate inventory availability before updating
        if (currentPickupItems && currentPickupItems.length > 0) {
            // Collect all product IDs (parent products only - bundles have their own inventory)
            const productIds = currentPickupItems
                .map((item) => item.productId)
                .filter((id): id is string => Boolean(id));

            const currency = (context.get(siteContext) as SiteContext).currency;

            // Fetch products with the new store's inventory ID to validate availability.
            // fetchProductsByIds dedupes the IDs and batches them under SCAPI's 24-ID getProducts
            // limit, so pickup baskets with more than 24 distinct products still validate.
            const productsArray = await fetchProductsByIds(context, productIds, {
                allImages: true,
                perPricebook: true,
                inventoryIds: [inventoryId], // Include new store's inventory
                ...(currency ? { currency } : {}),
            });
            if (productsArray.length > 0) {
                const productsMap = new Map(productsArray.map((product) => [product.id, product]));

                // Validate each pickup item's inventory.
                // isStoreOutOfStock handles all product types:
                // - Regular items: checks product's own inventory
                // - Product sets: automatically checks all setProducts
                // - Bundles: checks bundle product's own inventory (bundle has its own inventory)
                const outOfStockItems: string[] = [];
                for (const item of currentPickupItems) {
                    if (!item.productId) continue;

                    const product = productsMap.get(item.productId);
                    const quantity = item.quantity || 1;

                    if (!product) {
                        outOfStockItems.push(item.productId);
                        continue;
                    }

                    if (isStoreOutOfStock(product, inventoryId, quantity)) {
                        outOfStockItems.push(item.productId);
                    }
                }

                // If any items are out of stock, return error
                if (outOfStockItems.length > 0) {
                    // Use store name from form data, fall back to storeId if not provided
                    const displayStoreName = storeName || storeId;
                    return data(
                        {
                            success: false,
                            error: createActionError({
                                code: ErrorCode.OUT_OF_STOCK,
                                message: `Some items are out of stock at ${displayStoreName}`,
                            }),
                        },
                        { status: 422 }
                    );
                }
            }
        }

        // All items are in stock - proceed with the update
        // Update the pickup shipment with the new store ID (use actual shipment ID, not 'me')
        let updatedBasket = await updateShipmentForPickup(context, basketId, pickupShipmentId, storeId);
        shipmentUpdated = true;

        // Get pickup items from the updated basket for the new store
        const pickupItems = getPickupProductItemsForStore(updatedBasket, storeId);

        // Update all pickup items with the new inventory ID
        // Note: If any item is missing itemId, the API call will fail with a 400 error.
        if (pickupItems && pickupItems.length > 0) {
            const itemsToUpdate = pickupItems.map((item) => ({
                itemId: item.itemId,
                productId: item.productId,
                quantity: item.quantity,
                inventoryId,
            }));

            if (itemsToUpdate.length > 0) {
                // This may fail if the inventory check is stale, but we will handle that in the catch block
                await clients.shopperBasketsV2.updateItemsInBasket({
                    params: {
                        path: { basketId },
                    },
                    body: itemsToUpdate,
                });

                // Get the updated basket after items update
                const { data: refreshedBasket } = await clients.shopperBasketsV2.getBasket({
                    params: {
                        path: { basketId },
                    },
                });
                updatedBasket = refreshedBasket;
            }
        }

        // Update the basket cache to reflect the changes
        updateBasketResource(context, updatedBasket);

        return data(createBasketSuccessResponse(updatedBasket));
    } catch (error) {
        // Rollback shipment update if it was already updated
        if (shipmentUpdated && originalStoreId && pickupShipmentId) {
            try {
                await updateShipmentForPickup(context, basketId, pickupShipmentId, originalStoreId);
            } catch {
                // Silently handle rollback error - original error is more important
                // Rollback failure doesn't affect the user-facing error response
            }
        }

        return data({ success: false, error: createActionError({ error }) }, { status: 500 });
    }
}
