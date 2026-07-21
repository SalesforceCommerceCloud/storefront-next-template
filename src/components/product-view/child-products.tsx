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
import ProductQuantityPicker from '@/components/product-quantity-picker';
import { Button } from '@/components/ui/button';
import { useProductSetsBundles } from '@/hooks/product/use-product-sets-bundles';
import { useProductActions } from '@/hooks/product/use-product-actions';
import type { ShopperProducts } from '@/scapi';
import { type ReactElement } from 'react';
import { isProductSet, isProductBundle } from '@/lib/product/product-utils';
import { hasPurchasablePrice } from '@/lib/product/price-utils';
import ChildProductCard from './child-product-card';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import DeliveryOptions from '@/extensions/bopis/components/delivery-options/delivery-options';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
// @sfdc-extension-block-end SFDC_EXT_BOPIS
import { useTranslation } from 'react-i18next';

type ChildProductsBaseProps = {
    /** Parent product (must be a set or bundle) */
    parentProduct: ShopperProducts.schemas['Product'];
    /** Called immediately before cart action starts (add or update) - for optimistic UI like closing modal */
    onBeforeCartAction?: () => void;
    /** Callback invoked after successful cart operation (add or update) */
    onCartSuccess?: () => void;
    /** Callback invoked if cart operation fails (add or update) */
    onCartError?: (error: unknown) => void;
    /**
     * Where each child card's swatch selection state lives. Default `'url'` for PDP usage.
     * Set to `'local'` when rendering inside a modal (cart-edit, quick-add) so swatch clicks
     * don't write to the page URL or trigger route revalidation.
     */
    selectionSource?: 'url' | 'local';
};

type ChildProductsAddModeProps = ChildProductsBaseProps & {
    /** Rendering mode: 'add' for PDP */
    mode?: 'add';
    /** Initial bundle quantity (optional in add mode, defaults to 1) */
    initialBundleQuantity?: number;
    /** Cart item ID for update operations (not used in add mode) */
    itemId?: string;
};

type ChildProductsEditModeProps = ChildProductsBaseProps & {
    /** Rendering mode: 'edit' for cart edit modal */
    mode: 'edit';
    /** Initial bundle quantity (required in edit mode) */
    initialBundleQuantity: number;
    /** Cart item ID for update operations (required in edit mode) */
    itemId: string;
};

type ChildProductsProps = ChildProductsAddModeProps | ChildProductsEditModeProps;

/**
 * Manages child product selection and cart operations for product sets and bundles.
 *
 * This component orchestrates:
 * - Grid display of child product cards with variant selection
 * - Bundle-level quantity picker (bundles only)
 * - Selection validation and progress tracking
 * - Cart operations (add set, add bundle, update bundle)
 * - Success/error handling with callbacks
 *
 * **Product Set behavior**:
 * - Each child has its own quantity picker
 * - No bundle-level quantity selector
 * - Button: "Add Set to Cart"
 *
 * **Product Bundle behavior**:
 * - Single quantity picker for entire bundle
 * - All children use bundle quantity
 * - Button: "Add Bundle to Cart" or "Update Cart" (edit mode)
 *
 * **Add mode** (PDP):
 * - Creates new cart items
 * - Uses `handleProductSetAddToCart` or `handleProductBundleAddToCart`
 * - Button: "Add Set/Bundle to Cart"
 *
 * **Edit mode** (Cart modal):
 * - Updates existing cart items
 * - Uses `handleUpdateBundle` (bundles only - sets cannot be edited as a unit)
 * - Button: "Update Cart"
 * - Requires `itemId` and `initialBundleQuantity` props
 *
 * @example Add mode on PDP
 * ```tsx
 * <ChildProducts
 *   parentProduct={bundleProduct}
 *   mode="add"
 * />
 * ```
 *
 * @example Edit mode in cart modal
 * ```tsx
 * <ChildProducts
 *   parentProduct={bundleProduct}
 *   mode="edit"
 *   itemId={cartItem.itemId}
 *   initialBundleQuantity={cartItem.quantity}
 *   onBeforeCartAction={() => closeModal()}
 *   onCartSuccess={() => showSuccessToast()}
 *   onCartError={(error) => showError(error)}
 * />
 * ```
 *
 * @param props - Component props
 * @param props.parentProduct - Parent product (must be a set or bundle)
 * @param props.mode - Rendering mode: 'add' for PDP, 'edit' for cart edit modal
 * @param props.initialBundleQuantity - Initial bundle quantity (required in edit mode)
 * @param props.itemId - Cart item ID for update operations (required in edit mode)
 * @param props.onBeforeCartAction - Called before cart action starts (useful for optimistic UI like closing modal)
 * @param props.onCartSuccess - Called after successful cart operation (add or update)
 * @param props.onCartError - Called if cart operation fails (add or update)
 * @returns Grid of child product cards with cart controls, or null if not a set/bundle
 */
export default function ChildProducts({
    parentProduct,
    mode = 'add',
    initialBundleQuantity,
    itemId,
    onBeforeCartAction,
    onCartSuccess,
    onCartError,
    selectionSource = 'url',
}: ChildProductsProps): ReactElement | null {
    const { t } = useTranslation('product');
    const isProductASet = isProductSet(parentProduct);
    const isProductABundle = isProductBundle(parentProduct);

    // @sfdc-extension-line SFDC_EXT_BOPIS
    const selectedStore = useStoreLocator((state) => state.selectedStoreInfo);

    const {
        isAddingToOrUpdatingCart,
        handleProductSetAddToCart,
        handleProductBundleAddToCart,
        handleUpdateBundle,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        basketPickupStore,
    } = useProductActions({
        product: parentProduct,
        itemId,
    });

    const {
        comboProduct,
        childProductSelection,
        selectedBundleQuantity,
        areAllChildProductsSelected,
        hasUnorderableChildProducts,
        handleChildProductValidation,
        setChildProductSelection,
        setChildProductOrderability,
        setSelectedBundleQuantity,
        selectedChildProductCount,
        totalChildProducts,
        isCompletelyOutOfStock,
        productWithCalculatedInventory,
        effectiveQuantity,
        bundleStockLevel,
        bundleOutOfStock,
    } = useProductSetsBundles({
        product: parentProduct,
        initialBundleQuantity,
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        selectedStoreInventoryId: selectedStore?.inventoryId,
        basketPickupStore,
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
    });

    const childProducts = comboProduct.childProducts || [];

    const handleAddToCart = async () => {
        // Validate all child products are selected
        if (!handleChildProductValidation()) {
            return;
        }

        try {
            onBeforeCartAction?.();
            if (isProductASet) {
                const selectedProducts = Object.values(childProductSelection);
                await handleProductSetAddToCart(selectedProducts);
            } else if (isProductABundle) {
                const selectedProducts = Object.values(childProductSelection);
                await handleProductBundleAddToCart(selectedBundleQuantity, selectedProducts);
            }

            // Call onSuccess callback if operation was successful
            onCartSuccess?.();
        } catch (error) {
            onCartError?.(error);
        }
    };

    const handleUpdate = async () => {
        // Validate all child products are selected
        if (!handleChildProductValidation()) {
            return;
        }

        try {
            onBeforeCartAction?.();
            // For bundles in edit mode, update the bundle with new quantity and/or child variants
            if (isProductABundle) {
                const selectedProducts = Object.values(childProductSelection);
                await handleUpdateBundle(selectedBundleQuantity, selectedProducts);
            }

            // Call onSuccess callback if operation was successful
            onCartSuccess?.();
        } catch (error) {
            onCartError?.(error);
        }
    };

    // Allow add to cart if at least one delivery method is available
    // User can switch delivery options in the UI if their current selection is out of stock.
    // Also require a price for the active currency: a set's price is its lowest child price and a
    // bundle is charged at the parent price, so a missing parent price means no price-book entry
    // for this currency (an explicit 0 is still allowed). For sets, per-child price gating also
    // flows in via hasUnorderableChildProducts (each child card's canAddToCart includes price).
    // Edit mode bypasses the price gate: an item already in the basket must remain editable even
    // if the catalog price is currently missing for the active currency.
    const isEditMode = mode === 'edit';
    const canAddToCart =
        areAllChildProductsSelected &&
        !hasUnorderableChildProducts &&
        !isCompletelyOutOfStock &&
        (isEditMode || hasPurchasablePrice(parentProduct));

    if (!isProductASet && !isProductABundle) {
        return null;
    }
    return (
        <div className="space-y-8">
            {/* Child Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {childProducts.map((childProduct: ShopperProducts.schemas['Product']) => (
                    <ChildProductCard
                        key={childProduct.id}
                        childProduct={childProduct}
                        parentProduct={parentProduct}
                        onSelectionChange={setChildProductSelection}
                        onOrderabilityChange={setChildProductOrderability}
                        selectionSource={selectionSource}
                        isEditMode={isEditMode}
                    />
                ))}
            </div>

            {/* Bundle Quantity Selector (for bundles only) */}
            {isProductABundle && (
                <div className="flex justify-center">
                    <div className="w-64">
                        <ProductQuantityPicker
                            value={selectedBundleQuantity.toString()}
                            onChange={setSelectedBundleQuantity}
                            stockLevel={bundleStockLevel}
                            isOutOfStock={bundleOutOfStock}
                            productName={parentProduct.name}
                            isBundle={isProductABundle}
                        />
                    </div>
                </div>
            )}

            {/* @sfdc-extension-block-start SFDC_EXT_BOPIS */}
            {/* Delivery Options - For both bundles and sets */}
            {/* Hide for non-pickup items when opened from cart page */}
            {(mode !== 'edit' || basketPickupStore) && (
                <div className="flex justify-center">
                    <DeliveryOptions
                        product={productWithCalculatedInventory}
                        quantity={effectiveQuantity}
                        basketPickupStore={basketPickupStore}
                    />
                </div>
            )}
            {/* @sfdc-extension-block-end SFDC_EXT_BOPIS */}

            {/* Progress indicator */}
            <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                <span>
                    {t('selectedOf', { selected: selectedChildProductCount.toString() }).replace(
                        '{total}',
                        totalChildProducts.toString()
                    )}
                </span>
                <div className="w-32 bg-muted rounded-full h-2">
                    <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(selectedChildProductCount / totalChildProducts) * 100}%` }}
                    />
                </div>
            </div>

            {/* Add to Cart / Update Cart Button */}
            <div className="flex justify-center">
                <Button
                    data-testid="add-to-cart"
                    onClick={() => void (mode === 'edit' ? handleUpdate() : handleAddToCart())}
                    disabled={!canAddToCart || isAddingToOrUpdatingCart}
                    size="lg"
                    className="min-w-64">
                    {isAddingToOrUpdatingCart
                        ? mode === 'edit'
                            ? t('updatingCart')
                            : t('adding')
                        : mode === 'edit'
                          ? t('updateCart')
                          : isProductASet
                            ? t('addSetToCart')
                            : t('addBundleToCart')}
                </Button>
            </div>

            {/* Error Messages. role="status" on a persistent container so the prompt is
                announced when it appears/clears as child products are selected. */}
            <div role="status" aria-atomic="true">
                {!areAllChildProductsSelected && (
                    <span className="block text-center text-destructive">{t('selectAllOptionsAbove')}</span>
                )}
            </div>
        </div>
    );
}
