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

import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';
import { getEffectiveStockLevel, isInStock } from '@/lib/product/inventory-utils';
import { isBonusProduct } from '@/lib/product/product-utils';
import { useMemo } from 'react';

/**
 * Represents a cart item with inventory issues
 */
export interface CartInventoryIssue {
    itemId: string;
    productId: string;
    productName: string;
    requestedQuantity: number;
    availableStock: number;
    isPickup: boolean;
    storeId?: string;
}

/**
 * Result of cart-wide inventory validation
 */
export interface CartInventoryValidationResult {
    hasInventoryIssues: boolean;
    itemsExceedingInventory: CartInventoryIssue[];
    totalItemsWithIssues: number;
}

/**
 * Validates all cart items against available inventory (ATS for site, stockLevel for BOPIS).
 *
 * Validation rules:
 * - Regular items: quantity must not exceed available stock
 * - Bonus products: excluded from validation (promotion-controlled)
 * - Bundle products: validates parent bundle inventory
 * - Set products: assumes pre-calculated inventory from loader
 * - BOPIS items: validates against store inventory (inventoryId from shipment)
 *
 * @param basket - Shopping basket with product items and shipments
 * @param productsByItemId - Map of itemId to Product data (includes inventory)
 * @returns Validation result with issues list and summary
 *
 * @example
 * const result = validateCartInventory(basket, productsByItemId);
 * if (result.hasInventoryIssues) {
 *   console.log(`${result.totalItemsWithIssues} items exceed inventory`);
 *   result.itemsExceedingInventory.forEach(issue => {
 *     console.log(`${issue.productName}: requested ${issue.requestedQuantity}, available ${issue.availableStock}`);
 *   });
 * }
 */
export function validateCartInventory(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined,
    productsByItemId: Record<string, ShopperProducts.schemas['Product']>
): CartInventoryValidationResult {
    const issues: CartInventoryIssue[] = [];

    // Early return if no basket or product items
    if (!basket?.productItems || basket.productItems.length === 0) {
        return {
            hasInventoryIssues: false,
            itemsExceedingInventory: [],
            totalItemsWithIssues: 0,
        };
    }

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // Build map of pickup shipments (shipmentId → storeId)
    const pickupShipments = new Map<string, string>();
    if (basket.shipments) {
        basket.shipments.forEach((shipment) => {
            if (shipment.shipmentId && shipment.c_fromStoreId) {
                pickupShipments.set(shipment.shipmentId, shipment.c_fromStoreId as string);
            }
        });
    }
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    // Validate each product item
    basket.productItems.forEach((item) => {
        // Skip bonus products (controlled by maxBonusItems)
        if (isBonusProduct(item)) {
            return;
        }

        // Skip if missing required fields
        if (!item.itemId || !item.productId || !item.quantity) {
            return;
        }

        // Get product data
        const product = productsByItemId[item.itemId];
        if (!product) {
            return; // Can't validate without product data
        }

        // Determine if this is a pickup item (defaults to false when BOPIS is disabled)
        const fulfillment = {
            isPickup: false,
            storeId: undefined as string | undefined,
            storeInventoryId: undefined as string | undefined,
        };
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        fulfillment.isPickup = Boolean(item.shipmentId && pickupShipments.has(item.shipmentId));
        fulfillment.storeId = item.shipmentId ? pickupShipments.get(item.shipmentId) : undefined;
        fulfillment.storeInventoryId = fulfillment.isPickup ? item.inventoryId : undefined;
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        // Check if item is in stock for requested quantity
        const inStock = isInStock({
            product,
            isPickup: fulfillment.isPickup,
            // @sfdc-extension-line SFDC_EXT_BOPIS
            storeInventoryId: fulfillment.storeInventoryId,
            quantity: item.quantity,
            variant: null,
        });

        if (!inStock) {
            // Get available stock level
            const availableStock = getEffectiveStockLevel({
                product,
                isPickup: fulfillment.isPickup,
                // @sfdc-extension-line SFDC_EXT_BOPIS
                storeInventoryId: fulfillment.storeInventoryId,
                variant: null,
            });

            issues.push({
                itemId: item.itemId,
                productId: item.productId,
                productName: item.productName || product.name || 'Unknown Product',
                requestedQuantity: item.quantity,
                availableStock,
                isPickup: fulfillment.isPickup,
                // @sfdc-extension-line SFDC_EXT_BOPIS
                storeId: fulfillment.storeId,
            });
        }
    });

    return {
        hasInventoryIssues: issues.length > 0,
        itemsExceedingInventory: issues,
        totalItemsWithIssues: issues.length,
    };
}

/**
 * React hook that validates cart inventory with memoization.
 * Recalculates only when basket or productsByItemId changes.
 *
 * @param basket - Shopping basket
 * @param productsByItemId - Product details map
 * @returns Memoized validation result
 *
 * @example
 * function CartContent({ basket, productsByItemId }) {
 *   const inventoryValidation = useCartInventoryValidation(basket, productsByItemId);
 *
 *   return (
 *     <Button disabled={inventoryValidation.hasInventoryIssues}>
 *       Continue to Checkout
 *     </Button>
 *   );
 * }
 */
export function useCartInventoryValidation(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined,
    productsByItemId: Record<string, ShopperProducts.schemas['Product']>
): CartInventoryValidationResult {
    return useMemo(() => validateCartInventory(basket, productsByItemId), [basket, productsByItemId]);
}
