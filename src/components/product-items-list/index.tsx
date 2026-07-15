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
import { useMemo, type ReactElement } from 'react';

// Commerce SDK
import type { ShopperBasketsV2, ShopperProducts, ShopperPromotions } from '@/scapi';

// Components
import ProductItem from '@/components/product-item';
import SelectBonusProductsCard from '@/components/cart/select-bonus-products-card';
import { Card } from '@/components/ui/card';

// Utils
import {
    buildBonusPromotionMap,
    getAttachedBonusPromotions,
    calculateMaxQuantityForBonusProduct,
} from '@/lib/cart/bonus-product-utils';
import type { EnrichedProductItem } from '@/lib/product/product-utils';

/**
 * Spacing constants for different display variants
 *
 * These constants define the vertical spacing between product items
 * based on the display variant to ensure consistent visual hierarchy.
 */
/** Spacing for default variant (full product cards) */
const DEFAULT_SPACING = 'space-y-4';
/** Spacing for summary variant (compact list view) */
const SUMMARY_SPACING = 'space-y-5';

/**
 * Props for the ProductItemsList component
 *
 * @interface ProductItemsListProps
 * @property {ShopperBasketsV2.schemas['ProductItem'][] | undefined} productItems - Array of product items from the basket
 * @property {Record<string, ShopperProducts.schemas['Product']>} [productsByItemId] - Item ID to product mapping for enhanced product data
 * @property {Record<string, ShopperPromotions.schemas['Promotion']>} [promotions] - Promotions by ID for displaying promotion information
 * @property {ShopperBasketsV2.schemas['BonusDiscountLineItem'][]} [bonusDiscountLineItems] - Bonus discount line items from basket to determine if bonus product is choice-based
 * @property {'default' | 'summary'} [variant='default'] - Display variant: 'default' for full product cards, 'summary' for compact list view
 * @property {function} [primaryAction] - Optional render prop function to generate primary action buttons for each product
 * @property {function} [secondaryActions] - Optional render prop function to generate secondary action buttons for each product
 * @property {function} [deliveryActions] - Optional render prop (e.g. cart pickup/delivery selector per line)
 * @property {function} [lineItemExtra] - Optional render prop for extra content at the end of each line’s right column (e.g. gift)
 */
interface ProductItemsListProps {
    /** Array of product items from the basket */
    productItems: ShopperBasketsV2.schemas['ProductItem'][] | undefined;
    /** Required item ID to product mapping for enhanced product data */
    productsByItemId: Record<string, ShopperProducts.schemas['Product']>;
    /** Optional promotions by ID for displaying promotion information */
    promotions?: Record<string, ShopperPromotions.schemas['Promotion']>;
    /** Optional bonus discount line items from basket to determine if bonus product is choice-based */
    bonusDiscountLineItems?: ShopperBasketsV2.schemas['BonusDiscountLineItem'][];
    /** Display variant: 'default' for full product cards, 'summary' for compact list view */
    variant?: 'default' | 'summary';
    /**
     * Optional render prop function to generate primary action buttons for each product
     * @param product - Combined product data (basket item + product details)
     * @returns React element for primary action or undefined
     */
    primaryAction?: (product: EnrichedProductItem) => ReactElement | undefined;
    /**
     * Optional render prop function to generate secondary action buttons for each product
     * @param product - Combined product data (basket item + product details)
     * @returns React element for secondary actions or undefined
     */
    secondaryActions?: (product: EnrichedProductItem) => ReactElement | undefined;
    /** Optional per-line fulfillment UI (e.g. BOPIS pickup vs delivery dropdown on cart) */
    deliveryActions?: (product: EnrichedProductItem) => ReactElement | undefined;
    /** Optional extra UI at the end of the cart line right column (e.g. gift checkbox) */
    lineItemExtra?: (product: EnrichedProductItem) => ReactElement | undefined;
    /** Optional basket for bonus product selection */
    basket?: ShopperBasketsV2.schemas['Basket'];
    /** Callback when user clicks select bonus products button */
    onSelectBonusProducts?: () => void;
    /**
     * If true, each product item is wrapped in its own Card, creating
     * individual tiles instead of a single stacked list.
     */
    separateCards?: boolean;
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    /** Whether items in this list are pickup items (affects stock level calculation) */
    isPickup?: boolean;
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
}

/**
 * ProductItemsList component that renders a list of product items
 *
 * This component handles:
 * - Rendering multiple product items with consistent spacing
 * - Combining basket item data with product details
 * - Supporting different display variants (default/summary)
 * - Applying primary and secondary actions to items via render props
 * - Handling empty or undefined product items gracefully
 * - Performance optimization with memoization
 *
 * @param props - Component props
 * @returns JSX element containing the list of product items
 *
 * @example
 * ```tsx
 * // Basic usage with default variant
 * <ProductItemsList
 *   productItems={basketItems}
 *   productsByItemId={productsByItemId}
 * />
 * ```
 *
 * @example
 * ```tsx
 * // Summary variant for compact display
 * <ProductItemsList
 *   productItems={basketItems}
 *   variant="summary"
 *   productsByItemId={productsByItemId}
 * />
 * ```
 *
 * @example
 * ```tsx
 * // With primary and secondary actions
 * <ProductItemsList
 *   productItems={basketItems}
 *   productsByItemId={productsByItemId}
 *   promotions={promotions}
 *   primaryAction={(product) => (
 *     <button onClick={() => handleUpdate(product)}>
 *       Update Item
 *     </button>
 *   )}
 *   secondaryActions={(product) => (
 *     <button onClick={() => handleRemove(product)}>
 *       Remove Item
 *     </button>
 *   )}
 * />
 * ```
 */
export default function ProductItemsList({
    productItems,
    productsByItemId,
    promotions,
    bonusDiscountLineItems,
    variant = 'default',
    primaryAction,
    secondaryActions,
    deliveryActions,
    lineItemExtra,
    basket,
    onSelectBonusProducts,
    separateCards = false,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    isPickup = false,
}: ProductItemsListProps): ReactElement {
    /**
     * Build bonus promotion map and get attached promotions
     * This determines which cart items should show bonus product selection cards
     */
    const attachedPromotions = useMemo(() => {
        if (!basket) return new Map();
        const promotionMap = buildBonusPromotionMap(basket);
        return getAttachedBonusPromotions(basket, productsByItemId, promotionMap);
    }, [basket, productsByItemId]);

    /**
     * Calculate max quantities for choice-based bonus products at the basket level
     * This avoids redundant calculations in each ProductItem component
     *
     * Uses the extracted utility function for cleaner, testable logic
     * Map structure: itemId -> maxQuantity
     */
    const bonusProductMaxQuantities = useMemo(() => {
        if (!productItems) {
            return new Map<string, number>();
        }

        const maxQuantities = new Map<string, number>();

        // Calculate max quantity for each bonus product using utility function
        productItems.forEach((productItem) => {
            if (!productItem.itemId) return;

            const maxQuantity = calculateMaxQuantityForBonusProduct(productItem, productItems, bonusDiscountLineItems);

            if (maxQuantity !== undefined) {
                maxQuantities.set(productItem.itemId, maxQuantity);
            }
        });

        return maxQuantities;
    }, [bonusDiscountLineItems, productItems]);

    /**
     * Memoized list of ProductItem components with combined data
     *
     * This memoization prevents unnecessary re-renders when data props haven't changed.
     * Function props (primaryAction, secondaryActions) are excluded from dependencies
     * to avoid re-computation when parent components re-render with new function references.
     * Each product item combines basket data with product details for enhanced display.
     */
    const memoizedItems = useMemo(() => {
        return (productItems || []).map((productItem, index) => {
            // Combine basket item with product data following reference logic
            const productData = productItem?.itemId ? productsByItemId?.[productItem.itemId] : undefined;

            /**
             * Basket item data enriched with product details
             * @type {EnrichedProductItem & { isProductUnavailable: boolean }}
             */
            const enrichedProductItem = {
                ...(productData || {}),
                ...productItem,
                isProductUnavailable: !productData,
                price: productItem.price ?? 0,
                quantity: productItem.quantity ?? 1,
                // Explicitly preserve basket-specific properties that might be overwritten
                bonusProductLineItem: productItem.bonusProductLineItem,
                bonusDiscountLineItemId: productItem.bonusDiscountLineItemId,
            };

            // Check if this item has an attached bonus promotion card
            const bonusPromo = productItem.itemId ? attachedPromotions.get(productItem.itemId) : undefined;

            // Get max quantity for this bonus product if it exists
            const maxQuantity = productItem.itemId ? bonusProductMaxQuantities.get(productItem.itemId) : undefined;

            const currentProductItem = (
                <>
                    <ProductItem
                        productItem={enrichedProductItem}
                        primaryAction={primaryAction}
                        secondaryActions={secondaryActions}
                        deliveryActions={deliveryActions}
                        lineItemExtra={lineItemExtra?.(enrichedProductItem)}
                        displayVariant={variant}
                        promotions={promotions}
                        bonusDiscountLineItems={bonusDiscountLineItems}
                        maxBonusQuantity={maxQuantity}
                        // @sfdc-extension-line SFDC_EXT_BOPIS
                        isPickup={isPickup}
                    />

                    {/* Render bonus product selection card if eligible */}
                    {bonusPromo && (
                        <div className="mt-3">
                            <SelectBonusProductsCard promotion={bonusPromo} onSelectClick={onSelectBonusProducts} />
                        </div>
                    )}
                </>
            );

            if (separateCards) {
                return (
                    <li key={productItem.itemId || `item-${index}`}>
                        <Card>{currentProductItem}</Card>
                    </li>
                );
            }

            return (
                <li
                    key={productItem.itemId || `item-${index}`}
                    className="border-b border-muted-foreground/10 last:border-b-0">
                    {currentProductItem}
                </li>
            );
        });
        // Intentionally exclude primaryAction and secondaryActions from dependencies
        // to prevent re-computation when parent components re-render with new function references
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        productItems,
        productsByItemId,
        promotions,
        bonusDiscountLineItems,
        variant,
        attachedPromotions,
        bonusProductMaxQuantities,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        isPickup,
    ]);

    return (
        <ul role="list" className={variant === 'summary' ? SUMMARY_SPACING : DEFAULT_SPACING}>
            {memoizedItems}
        </ul>
    );
}
