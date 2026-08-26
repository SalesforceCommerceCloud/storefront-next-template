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

type VariantWithInventory = ShopperProducts.schemas['Variant'] & {
    inventory?: ShopperProducts.schemas['Inventory'];
};

/**
 * Returns inventory for a resolved product selection without treating master
 * inventory as a substitute while a variant is unresolved or still loading.
 */
export function getInventoryForResolvedSelection(
    product: ShopperProducts.schemas['Product'] | null | undefined,
    currentVariant?: VariantWithInventory | null
): ShopperProducts.schemas['Inventory'] | undefined {
    if (product?.type?.master && !currentVariant) return undefined;
    return currentVariant ? currentVariant.inventory : product?.inventory;
}

/**
 * Returns whether inventory represents a deferred-availability item that has
 * an explicit zero-or-lower available-to-sell count.
 */
export function hasDeferredAvailability(inventory: ShopperProducts.schemas['Inventory'] | null | undefined): boolean {
    return (
        typeof inventory?.ats === 'number' &&
        inventory.ats <= 0 &&
        Boolean(inventory.preorderable || inventory.backorderable)
    );
}

/**
 * Represents a selected child product with its variant and quantity
 */
export interface ChildProductSelection {
    product: ShopperProducts.schemas['Product'];
    variant?: ShopperProducts.schemas['Variant'];
    quantity: number;
}

// @sfdc-extension-block-start SFDC_EXT_BOPIS
/**
 * Gets inventory data for a specific store by inventory ID.
 * Searches the product.inventories array for an inventory object matching the given inventory ID.
 *
 * @param product - The product containing inventory data in its inventories array
 * @param inventoryId - The inventory ID of the selected store to find
 * @returns Store-specific inventory data, or null if not found, product is undefined, inventoryId is undefined, or product.inventories is undefined/empty
 */
export function getStoreInventoryById(
    product: { inventories?: ShopperProducts.schemas['Inventory'][] } | undefined | null,
    inventoryId: string | undefined
): ShopperProducts.schemas['Inventory'] | null {
    if (!inventoryId || !product?.inventories) {
        return null;
    }
    return product.inventories.find((inv) => inv.id === inventoryId) || null;
}
// @sfdc-extension-block-end SFDC_EXT_BOPIS

// @sfdc-extension-block-start SFDC_EXT_BOPIS
/**
 * Returns whether the selected store is out of stock for the given product and quantity.
 *
 * A product is considered out of stock if:
 * - It is not orderable, OR
 * - The stock level is less than the requested quantity
 *
 * Sets/Bundles Inventory Pre-calculation (PWA Kit approach):
 * - For sets: Calculate how many complete sets can be made from child inventory
 *   Formula: availableSets = Math.floor(childStockLevel / childQuantity) for each child, use minimum
 *   Example: If set requires 2x shirts (stock=10) and 1x pants (stock=3), you can make min(10/2, 3/1) = 3 complete sets
 * - For bundles: Use bundle's own inventory directly (no calculation needed)
 * - This pre-calculation should be done BEFORE calling this function
 *
 * @param product - The product to check store inventory for (with pre-calculated inventory for sets)
 * @param selectedStoreInventoryId - The inventory ID of the selected store (must be provided for store inventory check)
 * @param quantity - The quantity to check availability for (default: 1)
 * @returns true if product is out of stock at the store, false if in stock or if product/selectedStoreInventoryId is undefined
 */
export function isStoreOutOfStock(
    product: ShopperProducts.schemas['Product'] | undefined,
    selectedStoreInventoryId: string | undefined,
    quantity: number = 1
): boolean {
    if (!product || !selectedStoreInventoryId) {
        return false;
    }

    // Check product inventory (already calculated for sets/bundles)
    const storeInventory = getStoreInventoryById(product, selectedStoreInventoryId);
    const stockLevel = storeInventory?.stockLevel ?? 0;
    return !storeInventory || !storeInventory.orderable || stockLevel < quantity;
}
// @sfdc-extension-block-end SFDC_EXT_BOPIS

/**
 * Returns whether the site-level inventory is out of stock for the given product and quantity.
 *
 * A product is considered out of stock if:
 * - It is not orderable, OR
 * - The available to sell (ats) is less than the requested quantity
 *
 * Sets/Bundles Inventory Pre-calculation (PWA Kit approach):
 * - For sets: Calculate how many complete sets can be made from child inventory
 *   Formula: availableSets = Math.floor(childStockLevel / childQuantity) for each child, use minimum
 *   Example: If set requires 2x shirts (stock=10) and 1x pants (stock=3), you can make min(10/2, 3/1) = 3 complete sets
 * - For bundles: Use bundle's own inventory directly (no calculation needed)
 * - This pre-calculation should be done BEFORE calling this function
 *
 * Variant precedence:
 * - If variant is provided, variant.inventory takes precedence over product.inventory for site inventory
 * - Returns true if no inventory is found (neither variant.inventory nor product.inventory)
 *
 * @param product - The product to check site inventory for (with pre-calculated inventory for sets)
 * @param quantity - The quantity to check availability for (default: 1)
 * @param variant - Optional variant to use for site inventory (takes precedence over product.inventory)
 * @returns true if product is out of stock at site level, false if in stock or if product is undefined
 */
export function isSiteOutOfStock(
    product: ShopperProducts.schemas['Product'] | undefined,
    quantity: number = 1,
    variant?: ShopperProducts.schemas['Variant'] | null
): boolean {
    if (!product) {
        return false;
    }

    // Site inventory: variant takes precedence over product (already calculated for sets/bundles)
    // Note: TypeScript Variant schema doesn't include inventory, but it exists at runtime (proven by PWA Kit)
    const inventory = (variant as { inventory?: ShopperProducts.schemas['Inventory'] })?.inventory || product.inventory;
    if (!inventory) return true;

    const ats = inventory.ats ?? 0;
    const orderable = inventory.orderable ?? false;
    return ats < quantity || !orderable;
}

/**
 * Gets the effective inventory object considering both store and site inventory.
 *
 * Selection logic:
 * - If isPickup is true and storeInventoryId is provided: returns store inventory from product.inventories array
 * - Otherwise: returns site inventory (variant.inventory takes precedence over product.inventory if variant is provided)
 *
 * @param product - The product containing inventory data
 * @param isPickup - Whether store pickup is selected (true) or delivery is selected (false)
 * @param storeInventoryId - The inventory ID of the selected store (required when isPickup is true)
 * @param variant - Optional variant to use for site inventory (takes precedence over product.inventory when isPickup is false)
 * @returns Inventory object if found, or null if not found or if product is undefined
 */
export function getEffectiveInventory(params: {
    product: ShopperProducts.schemas['Product'];
    isPickup?: boolean;
    storeInventoryId?: string;
    variant?: ShopperProducts.schemas['Variant'] | null;
}): ShopperProducts.schemas['Inventory'] | null {
    const { product, isPickup, storeInventoryId, variant } = params;
    if (!product) return null;

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    if (isPickup && storeInventoryId) {
        // A locally selected PDP variant can carry newer store availability than its master product.
        const variantInventories = (variant as unknown as { inventories?: ShopperProducts.schemas['Inventory'][] })
            ?.inventories;
        return (
            getStoreInventoryById({ inventories: variantInventories }, storeInventoryId) ??
            getStoreInventoryById(product, storeInventoryId)
        );
    }
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    // Site inventory: variant takes precedence over product
    // Note: TypeScript Variant schema doesn't include inventory, but it exists at runtime (proven by PWA Kit)
    return (variant as { inventory?: ShopperProducts.schemas['Inventory'] })?.inventory || product.inventory || null;
}

/**
 * Gets the effective stock level considering both store and site inventory.
 *
 * Selection logic:
 * - If isPickup is true and storeInventoryId is provided: returns store inventory stockLevel from product.inventories array
 * - Otherwise: returns site inventory ats (available to sell)
 * - Variant precedence: when using site inventory, variant.inventory takes precedence over product.inventory
 *
 * Sets/Bundles Inventory Pre-calculation (PWA Kit approach):
 * - For sets: Calculate how many complete sets can be made from child inventory
 *   Formula: availableSets = Math.floor(childStockLevel / childQuantity) for each child, use minimum
 *   Example: If set requires 2x shirts (stock=10) and 1x pants (stock=3), you can make min(10/2, 3/1) = 3 complete sets
 * - For bundles: Use bundle's own inventory directly (no calculation needed)
 * - This pre-calculation should be done BEFORE calling this function
 *
 * @param product - The product to get stock level for (with pre-calculated inventory for sets)
 * @param isPickup - Whether store pickup is selected (true) or delivery is selected (false)
 * @param storeInventoryId - The inventory ID of the selected store (required when isPickup is true)
 * @param variant - Optional variant to use for site inventory (takes precedence over product.inventory when isPickup is false)
 * @returns The stock level number (0 if product is undefined, inventory not found, or stock level is unavailable)
 */
export function getEffectiveStockLevel(params: {
    product: ShopperProducts.schemas['Product'];
    isPickup?: boolean;
    storeInventoryId?: string;
    variant?: ShopperProducts.schemas['Variant'] | null;
}): number {
    const { product, variant } = params;
    if (!product) return 0;

    // Use helper function (inventory already calculated for sets/bundles)
    const inventory = getEffectiveInventory({
        product,
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        isPickup: params.isPickup,
        storeInventoryId: params.storeInventoryId,
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
        variant,
    });
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    if (params.isPickup && params.storeInventoryId) {
        return inventory?.stockLevel ?? 0;
    }
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    return inventory?.ats ?? 0;
}

/**
 * Checks if product is in stock considering both store and site inventory.
 *
 * A product is considered in stock if:
 * - It is orderable, AND
 * - The stock level is greater than or equal to the requested quantity
 *
 * Selection logic:
 * - If isPickup is true and storeInventoryId is provided: checks store inventory (from product.inventories array)
 * - Otherwise: checks site inventory
 * - Variant precedence: when using site inventory, variant.inventory takes precedence over product.inventory
 *
 * Sets/Bundles Inventory Pre-calculation (PWA Kit approach):
 * - For sets: Calculate how many complete sets can be made from child inventory
 *   Formula: availableSets = Math.floor(childStockLevel / childQuantity) for each child, use minimum
 *   Example: If set requires 2x shirts (stock=10) and 1x pants (stock=3), you can make min(10/2, 3/1) = 3 complete sets
 * - For bundles: Use bundle's own inventory directly (no calculation needed)
 * - This pre-calculation should be done BEFORE calling this function
 *
 * Implementation note: This function reuses isStoreOutOfStock and isSiteOutOfStock for consistency,
 * where isInStock = !isOutOfStock.
 *
 * @param product - The product to check inventory for (with pre-calculated inventory for sets)
 * @param isPickup - Whether store pickup is selected (true) or delivery is selected (false)
 * @param storeInventoryId - The inventory ID of the selected store (required when isPickup is true)
 * @param quantity - The quantity to check availability for (default: 1)
 * @param variant - Optional variant to use for site inventory (takes precedence over product.inventory when isPickup is false)
 * @returns true if product is orderable and has sufficient stock, false if out of stock or if product is undefined
 */
export function isInStock(params: {
    product?: ShopperProducts.schemas['Product'];
    isPickup?: boolean;
    storeInventoryId?: string;
    quantity: number;
    variant?: ShopperProducts.schemas['Variant'] | null;
}): boolean {
    const { product, isPickup, storeInventoryId, quantity = 1, variant } = params;
    if (!product) return false;

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    if (isPickup && storeInventoryId) {
        const inventory = getEffectiveInventory({ product, isPickup, storeInventoryId, variant });
        const stockLevel = inventory?.stockLevel ?? 0;
        return Boolean(inventory?.orderable && stockLevel >= quantity);
    }
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    return !isSiteOutOfStock(product, quantity, variant);
}
