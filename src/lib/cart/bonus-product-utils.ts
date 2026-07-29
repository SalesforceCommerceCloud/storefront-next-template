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

/**
 * Utility functions for bonus product selection in cart
 * Based on PWA Kit patterns from template-retail-react-app/app/utils/bonus-product/
 */

import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';
import { isBonusProduct, getBonusProductType } from '@/lib/product/product-utils';

/**
 * Product promotion data from SCAPI Products API
 */
export interface ProductPromotion {
    promotionId?: string;
    calloutMsg?: string;
}

/**
 * Product with promotion data
 */
export type ProductWithPromotions = ShopperProducts.schemas['Product'] & {
    productPromotions?: ProductPromotion[];
};

/**
 * Map of product ID to product data with promotions
 */
export type ProductsWithPromotionsMap = Record<string, ProductWithPromotions>;

/**
 * Bonus promotion information with capacity and metadata
 */
export type BonusPromotionInfo = {
    promotionId: string;
    bonusDiscountLineItemIds: string[]; // All BLI IDs with this promotionId
    maxBonusItems: number; // Sum across all BLIs
    selectedItems: number; // Count of already-selected bonus products
    remainingCapacity: number; // maxBonusItems - selectedItems
    calloutText: string | null; // Promotion message for display
};

/**
 * Map of promotionId to bonus promotion information
 */
export type BonusPromotionMap = Map<string, BonusPromotionInfo>;

/**
 * Map of itemId to attached bonus promotion information
 */
export type AttachedBonusPromotionsMap = Map<string, BonusPromotionInfo>;

/**
 * Get promotion callout text from product with promotions data
 * Extracts the callout message for a specific promotion and strips HTML tags
 *
 * Based on PWA Kit's getPromotionCalloutText utility function
 *
 * @param product - Product data with productPromotions array
 * @param promotionId - The promotion ID to get callout text for
 * @returns Promotion callout text with HTML stripped, or null if not available
 *
 * @example
 * const callout = getPromotionCalloutTextFromProduct(productData, 'promo-123');
 * // "Buy one Classic Fit Shirt, get 2 free ties"
 */
export function getPromotionCalloutTextFromProduct(
    product: ProductWithPromotions | null | undefined,
    promotionId: string | null | undefined
): string | null {
    if (!product?.productPromotions || !promotionId) {
        return null;
    }

    const promo = product.productPromotions.find((p) => p.promotionId === promotionId);
    if (!promo?.calloutMsg) {
        return null;
    }

    // Strip HTML tags and return plain text
    return promo.calloutMsg.replace(/<[^>]*>/g, '');
}

/**
 * Build a map of active bonus promotions with remaining capacity
 *
 * This function aggregates bonusDiscountLineItems by promotionId and calculates
 * remaining capacity by counting already-selected bonus products.
 *
 * @param basket - The shopping basket
 * @returns Map of promotionId to BonusPromotionInfo
 *
 * @example
 * const promotionMap = buildBonusPromotionMap(basket);
 * const promoInfo = promotionMap.get('ChoiceOfBonusProdect-ProductLevel');
 * // { promotionId: 'ChoiceOfBonusProdect-ProductLevel', maxBonusItems: 2, selectedItems: 0, remainingCapacity: 2, ... }
 */
export function buildBonusPromotionMap(
    basket: ShopperBasketsV2.schemas['Basket'] | null | undefined
): BonusPromotionMap {
    const promotionMap = new Map<string, BonusPromotionInfo>();

    // Guard: no basket or no bonus opportunities
    if (!basket?.bonusDiscountLineItems?.length) {
        return promotionMap;
    }

    // Loop through bonusDiscountLineItems and aggregate by promotionId
    for (const bli of basket.bonusDiscountLineItems) {
        const promotionId = bli.promotionId;

        if (!promotionId) continue;

        // Calculate how many bonus products are already selected for this specific BLI
        const selectedForThisBLI =
            basket.productItems
                ?.filter((item) => item.bonusProductLineItem === true && item.bonusDiscountLineItemId === bli.id)
                .reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

        // Calculate remaining capacity for this BLI
        const maxForThisBLI = bli.maxBonusItems || 0;
        const remainingForThisBLI = maxForThisBLI - selectedForThisBLI;

        // Skip if no remaining capacity
        if (remainingForThisBLI <= 0) {
            continue;
        }

        // Aggregate into the map
        const existing = promotionMap.get(promotionId);
        if (existing) {
            // Promotion already exists - aggregate
            existing.bonusDiscountLineItemIds.push(bli.id || '');
            existing.maxBonusItems += maxForThisBLI;
            existing.selectedItems += selectedForThisBLI;
            existing.remainingCapacity += remainingForThisBLI;
        } else {
            // New promotion - create entry
            promotionMap.set(promotionId, {
                promotionId,
                bonusDiscountLineItemIds: [bli.id || ''],
                maxBonusItems: maxForThisBLI,
                selectedItems: selectedForThisBLI,
                remainingCapacity: remainingForThisBLI,
                calloutText: null, // Populated later during matching
            });
        }
    }

    return promotionMap;
}

/**
 * Get attached bonus promotions for each cart item based on priceAdjustments
 *
 * For each cart item:
 * - Check if it has priceAdjustments
 * - For each priceAdjustment, check if promotionId is in promotionMap (is bonus promo)
 * - If capacity > 0, add to result map with callout text
 * - Take FIRST bonus promotion with capacity > 0
 *
 * @param basket - Shopping basket
 * @param productsWithPromotions - For getting callout text only
 * @param promotionMap - Map of active bonus promotions with capacity
 * @returns Map of itemId → BonusPromotionInfo (only items with cards)
 *
 * @example
 * const attachedPromotions = getAttachedBonusPromotions(basket, productsWithPromotions, promotionMap);
 * const promoInfo = attachedPromotions.get('item-123');
 * // { promotionId: 'ChoiceOfBonusProdect-ProductLevel', maxBonusItems: 2, remainingCapacity: 2, calloutText: '...' }
 */
export function getAttachedBonusPromotions(
    basket: ShopperBasketsV2.schemas['Basket'] | null | undefined,
    productsWithPromotions: ProductsWithPromotionsMap,
    promotionMap: BonusPromotionMap
): AttachedBonusPromotionsMap {
    const result = new Map<string, BonusPromotionInfo>();

    // Guard: no basket or no promotions with capacity
    if (!basket?.productItems?.length || promotionMap.size === 0) {
        return result;
    }

    // Loop through cart items and check Products API promotions
    for (const item of basket.productItems) {
        const productId = item.productId;

        // Skip bonus products
        if (item.bonusProductLineItem === true) {
            continue;
        }

        if (!productId) {
            continue;
        }

        // Get product promotions from Products API
        const product = productsWithPromotions[productId];
        if (!product?.productPromotions?.length) {
            continue;
        }

        // Get basket priceAdjustments for validation
        const basketPromotionIds =
            item.priceAdjustments?.map((pa) => pa.promotionId).filter((id): id is string => !!id) || [];

        // Check each product promotion to see if it's a bonus promotion with capacity
        let matchedPromotionId: string | null = null;
        for (const promo of product.productPromotions) {
            const promotionId = promo.promotionId;
            if (!promotionId) continue;

            // Is this a bonus product promotion with capacity?
            if (!promotionMap.has(promotionId)) {
                continue;
            }

            // Validation: If product has priceAdjustments, the bonus promotion should either:
            // 1. Be IN the priceAdjustments (product is getting discount from this bonus promo)
            // 2. OR product should have NO priceAdjustments (qualifying product with no discount)
            // This prevents showing cards on products purchased with DIFFERENT discounts
            if (basketPromotionIds.length > 0 && !basketPromotionIds.includes(promotionId)) {
                continue;
            }

            // Take first matching bonus promo only
            matchedPromotionId = promotionId;
            break;
        }

        if (!matchedPromotionId) {
            continue;
        }

        // Get promotion info with capacity
        // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion
        const promoInfo = promotionMap.get(matchedPromotionId)!;

        // Get callout text from product promotions (product already fetched above)
        const calloutText = getPromotionCalloutTextFromProduct(product, matchedPromotionId);

        // Add to result with callout text
        const promoWithCallout: BonusPromotionInfo = {
            ...promoInfo,
            calloutText,
        };

        if (item.itemId) {
            result.set(item.itemId, promoWithCallout);
        }
    }

    return result;
}

/**
 * Per-BLI selection row for one promotion.
 *
 * Mirrors the `bonusDiscountSlots` prop of `BonusProductModal`: one entry per `BonusDiscountLineItem`,
 * carrying the slot's max allowance and how many bonus picks the shopper has already claimed in it.
 */
type BonusDiscountSlot = {
    id: string;
    maxBonusItems: number;
    bonusProductsSelected: number;
};

/**
 * Compute the per-BLI slot list for one promotion in two linear walks.
 *
 * Pass 1 collects only the BLIs targeting `promotionId` (most baskets have ≤2) and indexes them by id for the second
 * pass. Pass 2 walks `productItems` once; bonus product items hit the slot map in O(1) and accumulate into the slot's
 * `bonusProductsSelected`. When the promotion has no matching BLIs, pass 2 is skipped entirely.
 *
 * Doing this inline in JSX runs an N×M nested filter over `productItems` × `bonusDiscountLineItems` every render the
 * modal is open. Memoizing this helper on `[basket, promotionId]` keeps the work out of the hot render path.
 *
 * @param basket - Shopping basket
 * @param promotionId - Promotion to query (typically `selectedBonusProduct.promotionId`)
 * @returns Per-BLI slot rows for the promotion. Empty when the basket has no matching BLIs.
 */
export function getBonusDiscountSlotsForPromotion(
    basket: ShopperBasketsV2.schemas['Basket'] | null | undefined,
    promotionId: string | null | undefined
): BonusDiscountSlot[] {
    if (!basket?.bonusDiscountLineItems?.length || !promotionId) {
        return [];
    }

    // Pass 1: collect slots for the target promotion only and index by BLI id for O(1) lookup in pass 2. BLIs without
    // an `id` are skipped — the modal looks up the active slot by id (and the add-to-cart action requires one), so an
    // id-less BLI cannot drive the modal regardless.
    const slots: BonusDiscountSlot[] = [];
    const slotById = new Map<string, BonusDiscountSlot>();
    for (const bli of basket.bonusDiscountLineItems) {
        if (bli.promotionId !== promotionId || !bli.id) {
            continue;
        }
        const slot: BonusDiscountSlot = { id: bli.id, maxBonusItems: bli.maxBonusItems || 0, bonusProductsSelected: 0 };
        slots.push(slot);
        slotById.set(bli.id, slot);
    }

    // Promotion has no BLIs in this basket — skip the productItems walk entirely.
    if (slots.length === 0) {
        return slots;
    }

    // Pass 2: walk productItems once; bonus items hit the slot map directly. Mutate the slot row in place. Items not
    // targeting our slots are rejected in O(1).
    if (basket.productItems) {
        for (const productItem of basket.productItems) {
            if (!productItem.bonusProductLineItem) {
                continue;
            }
            const bliId = productItem.bonusDiscountLineItemId;
            if (!bliId) {
                continue;
            }
            const slot = slotById.get(bliId);
            if (!slot) {
                continue;
            }
            slot.bonusProductsSelected += productItem.quantity || 0;
        }
    }

    return slots;
}

/**
 * Calculate bonus product counts for a specific promotion from basket data.
 *
 * This function counts how many bonus products have been selected for a promotion
 * by looking at basket.productItems (NOT bonusDiscountLineItems.bonusProducts).
 *
 * Based on PWA Kit's getBonusProductCountsForPromotion implementation.
 *
 * @param basket - The current basket/cart object
 * @param promotionId - The promotion ID to calculate counts for
 * @returns Object with selectedBonusItems and maxBonusItems counts
 */
export function getBonusProductCountsForPromotion(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined,
    promotionId: string
): { selectedBonusItems: number; maxBonusItems: number } {
    if (!basket || !promotionId) {
        return { selectedBonusItems: 0, maxBonusItems: 0 };
    }

    // Find all bonus discount line items for this promotion
    const promotionBonusItems = basket.bonusDiscountLineItems?.filter((item) => item.promotionId === promotionId) || [];

    // Sum up max items for this promotion
    const maxBonusItems = promotionBonusItems.reduce((sum, item) => sum + (item.maxBonusItems || 0), 0);

    // Get all bonusDiscountLineItemIds for this promotion
    const promotionBonusLineItemIds = promotionBonusItems.map((item) => item.id).filter(Boolean);

    // Count selected items for this promotion by looking at basket.productItems
    // Filter for items that are:
    // 1. Marked as bonus products (bonusProductLineItem: true)
    // 2. Linked to this promotion's bonusDiscountLineItemIds
    const selectedBonusItems = (basket.productItems || [])
        .filter(
            (item) =>
                item.bonusProductLineItem && promotionBonusLineItemIds.includes(item.bonusDiscountLineItemId || '')
        )
        .reduce((sum, item) => sum + (item.quantity || 0), 0);

    return { selectedBonusItems, maxBonusItems };
}

/**
 * Calculate the maximum quantity allowed for a specific bonus product item.
 *
 * This function handles the complex logic for determining how many more units
 * of a bonus product can be added to the cart, considering:
 * - The max items allowed in the bonus discount slot
 * - Other bonus products already selected in the same slot
 * - Whether the bonus product is choice-based or auto-added
 *
 * Only applies to choice-based bonus products (not auto-added ones).
 *
 * @param productItem - The specific bonus product item to calculate max quantity for
 * @param allProductItems - All product items currently in the basket
 * @param bonusDiscountLineItems - Bonus discount line items from the basket
 * @returns Maximum quantity allowed for this product, or undefined if not a choice-based bonus product
 *
 * @example
 * ```typescript
 * const maxQty = calculateMaxQuantityForBonusProduct(
 *   productItem,
 *   basket.productItems,
 *   basket.bonusDiscountLineItems
 * );
 * // Returns: 3 (if slot allows 5 items and 2 are already selected)
 * ```
 */
export function calculateMaxQuantityForBonusProduct(
    productItem: ShopperBasketsV2.schemas['ProductItem'],
    allProductItems: ShopperBasketsV2.schemas['ProductItem'][],
    bonusDiscountLineItems?: ShopperBasketsV2.schemas['BonusDiscountLineItem'][]
): number | undefined {
    // Early returns for non-bonus or invalid products
    if (!isBonusProduct(productItem) || !productItem.bonusDiscountLineItemId || !productItem.itemId) {
        return undefined;
    }

    // Only calculate max for choice-based bonus products
    const bonusProductType = getBonusProductType(productItem, bonusDiscountLineItems);
    if (bonusProductType !== 'choice') {
        return undefined;
    }

    // Find the bonus discount line item for this product
    const bonusDiscountLineItem = bonusDiscountLineItems?.find(
        (item) => item.id === productItem.bonusDiscountLineItemId
    );

    if (!bonusDiscountLineItem?.maxBonusItems) {
        return undefined;
    }

    // Count already selected bonus products in this slot (excluding current product)
    const alreadySelectedQuantity = allProductItems
        .filter(
            (item) =>
                item.bonusDiscountLineItemId === productItem.bonusDiscountLineItemId &&
                item.itemId !== productItem.itemId
        )
        .reduce((sum, item) => sum + (item.quantity || 0), 0);

    // Calculate available max quantity
    const maxQuantity = Math.max(0, bonusDiscountLineItem.maxBonusItems - alreadySelectedQuantity);

    return maxQuantity;
}
