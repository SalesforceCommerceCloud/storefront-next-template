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

import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { ShopperProducts } from '@/scapi';
import { useProductActions } from '@/hooks/product/use-product-actions';
import { useCurrentVariant } from '@/hooks/product/use-current-variant';
import { useSelectedVariations } from '@/hooks/product/use-selected-variations';
import type { SelectedFulfillmentOption } from '@/components/fulfillment/types';

interface ProductViewContextValue extends ReturnType<typeof useProductActions> {
    product: ShopperProducts.schemas['Product'];
    mode: 'add' | 'edit';
    /**
     * True while the selected variant's authoritative inventory is still resolving. Two flows set
     * it: the provider hydrates the SKU itself for the client-side size/width path
     * (`useProductActions`), and a controlled caller (footwear colorway overlay) that runs its own
     * fetch passes the flag in. ProductCartActions reads this to keep Add to Cart disabled until
     * the real availability is known.
     */
    isVariantInventoryLoading: boolean;
    /**
     * Mirrors the same conditions the hook uses to bypass the price gate, so price display
     * (ProductInfo → ProductPrice) matches the add/update gate. True when either the explicit
     * `allowMissingPrice` prop is set OR the surface is editing an in-basket line (`itemId`),
     * which the hook already treats as price-gate-bypassed (an in-basket line must remain
     * editable even if its catalog price is currently missing for the active currency).
     */
    allowMissingPrice: boolean;
    /**
     * Client-side variant-attribute selection (e.g. footwear size/width) that resolves to a
     * variant without a URL navigation. The single source both ProductInfo (display) and
     * ProductCartActions (canAddToCart / add-to-cart target) read, so they can't disagree about
     * which variant the shopper picked.
     */
    selectionsOverride: Record<string, string>;
    setSelectionsOverride: (
        updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)
    ) => void;
}

const ProductViewContext = createContext<ProductViewContextValue | null>(null);

interface ProductViewProviderProps {
    product: ShopperProducts.schemas['Product'];
    mode?: 'add' | 'edit';
    // @sfdc-extension-line SFDC_EXT_BOPIS
    /** Clears transient BOPIS state when a PDP deferred item hides fulfillment choices. */
    // @sfdc-extension-line SFDC_EXT_BOPIS
    clearDeferredPickupSelection?: boolean;
    initialQuantity?: number;
    maxQuantity?: number;
    itemId?: string;
    /** Optional: Pass a currentVariant directly (e.g., from controlled modal state) instead of deriving from URL */
    currentVariant?: ShopperProducts.schemas['Variant'];
    /**
     * Variation selection driven by a controlled caller (footwear colorway overlay) rather than the
     * shared client-side override. Exposed to consumers via context; the caller owns variant
     * resolution and inventory hydration itself, so the provider does not hydrate for it.
     */
    selectionsOverride?: Record<string, string>;
    /** Set by a controlled caller that runs its own selected-variant inventory fetch. */
    isVariantInventoryLoading?: boolean;
    /**
     * Allow adding to cart even when the product has no price for the active currency. Use for
     * intentionally-free items priced elsewhere (e.g. promotional bonus products). Defaults to false.
     */
    allowMissingPrice?: boolean;
    initialFulfillmentSelection?: SelectedFulfillmentOption;
}

/**
 * Provider for product view state that manages shared product data, quantity, and actions.
 *
 * This provider helps avoid prop drilling by sharing state like quantity, inventory status,
 * and action handlers (add to cart, add to wishlist) across product view children components.
 *
 * **Usage:**
 * - Wrap product view components (ProductInfo, ProductActions) with this provider
 * - Use `useProductView` hook in child components to access shared state
 * - Set `mode="edit"` for edit mode (e.g cart edit also needs to show product view),
 *      `mode="add"` (default) for product display pages
 *
 * @example
 * ```tsx
 * <ProductViewProvider product={product} mode="edit" initialQuantity={4}>
 *   <ProductInfo />
 *   <ProductCartActions />
 * </ProductViewProvider>
 * ```
 */
const ProductViewProvider = ({
    children,
    product,
    mode = 'add',
    // @sfdc-extension-line SFDC_EXT_BOPIS
    clearDeferredPickupSelection,
    initialQuantity,
    maxQuantity,
    itemId,
    currentVariant: providedCurrentVariant,
    selectionsOverride: providedSelectionsOverride,
    isVariantInventoryLoading: providedIsVariantInventoryLoading = false,
    allowMissingPrice = false,
    initialFulfillmentSelection,
}: PropsWithChildren<ProductViewProviderProps>) => {
    // Client-side size/width override written by an uncontrolled ProductInfo. Reset whenever the
    // product changes so a stale pick can't leak across a client-side PDP-to-PDP navigation that
    // doesn't remount the provider.
    const [localSelectionsOverride, setLocalSelectionsOverride] = useState<Record<string, string>>({});
    useEffect(() => {
        setLocalSelectionsOverride({});
    }, [product.id]);

    // A controlled caller (footwear colorway overlay) can drive selection itself; otherwise the
    // selection is the shared client-side override that uncontrolled ProductInfo writes.
    const selectionsOverride = providedSelectionsOverride ?? localSelectionsOverride;
    const hasSelectionsOverride = Object.keys(selectionsOverride).length > 0;
    // Only the provider's own client-side override drives hydration. When a caller supplies
    // selection (and its own resolved variant), it owns hydration -- don't fire a second fetch.
    const hasLocalOverride = Object.keys(localSelectionsOverride).length > 0;

    // Merge the client-side override on top of URL-derived selections (mirrors ProductInfo's own
    // selectedVariationValues merge) so an attribute the override doesn't cover keeps resolving
    // from the URL.
    const urlSelections = useSelectedVariations({ product });
    const mergedSelections = useMemo(
        () => ({ ...urlSelections, ...selectionsOverride }),
        [urlSelections, selectionsOverride]
    );

    // Use provided variant if available (e.g., from controlled modal state),
    // otherwise derive from URL/override for PDP use case
    const urlBasedCurrentVariant = useCurrentVariant({
        product,
        selectionsOverride: hasSelectionsOverride ? mergedSelections : undefined,
    });
    const currentVariant = providedCurrentVariant || urlBasedCurrentVariant;

    const productActionsData = useProductActions({
        product,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        mode,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        clearDeferredPickupSelection,
        currentVariant,
        initialQuantity,
        maxQuantity,
        itemId,
        allowMissingPrice,
        // When a client-side size/width override is active, the selection resolved a variant without
        // a navigation, so the loader never re-fetched the selected SKU and `product` is still the
        // master. Have the hook hydrate that SKU's authoritative inventory so canAddToCart and
        // quantity validate against the real SKU (and its per-store pickup inventory), not the
        // master. Only footwear writes the local override, so this stays false -- and adds no
        // extra fetch -- for every other vertical and for controlled colorway/modal flows.
        hydrateVariantInventory: hasLocalOverride,
        initialFulfillmentSelection,
    });

    // Loading is true when a controlled caller says so (its own fetch) or the provider's own
    // client-side hydration fetch is still pending.
    const isVariantInventoryLoading = providedIsVariantInventoryLoading || productActionsData.isVariantInventoryLoading;

    return (
        <ProductViewContext.Provider
            value={{
                ...productActionsData,
                product,
                mode,
                isVariantInventoryLoading,
                // Mirror the hook's price-gate bypass conditions so display tracks gate.
                allowMissingPrice: allowMissingPrice || Boolean(itemId),
                selectionsOverride,
                setSelectionsOverride: setLocalSelectionsOverride,
            }}>
            {children}
        </ProductViewContext.Provider>
    );
};

// oxlint-disable-next-line react-refresh/only-export-components
export const useProductView = () => {
    const context = useContext(ProductViewContext);
    if (!context) {
        throw new Error('useProductView must be used within ProductViewProvider');
    }
    return context;
};

// oxlint-disable-next-line react-refresh/only-export-components
export const useOptionalProductView = () => useContext(ProductViewContext);

export default ProductViewProvider;
