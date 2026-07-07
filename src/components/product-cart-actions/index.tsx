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
import { type ReactElement, Suspense, lazy, startTransition, useState, useEffect } from 'react';
import type { ShopperProducts } from '@/scapi';
import { Button } from '@/components/ui/button';
import { useProductView } from '@/providers/product-view';
import { isProductSet, isProductBundle } from '@/lib/product/product-utils';
import { useCheckAndExecutePendingAction } from '@/hooks/check-and-execute-pending-action';
import { useTranslation } from 'react-i18next';
import { UITarget } from '@/targets/ui-target';

/** @feature-stub Express checkout buttons — remove this import and its JSX below to strip the stub */
const ExpressPayments = lazy(() => import('@/components/checkout/components/express-payments'));

interface ProductCartActionsProps {
    product: ShopperProducts.schemas['Product'];
    /** Called immediately before cart action starts (add or update) - useful for optimistic UI like closing modal */
    onBeforeCartAction?: () => void;
    /** Called after successful cart operation completes (add or update) */
    onCartSuccess?: () => void;
    /** Called if cart operation fails (add or update) */
    onCartError?: (error: unknown) => void;
    /** Called immediately before add to wishlist action starts */
    onBeforeAddToWishlist?: () => void;
    /** Called after successful add to wishlist action completes */
    onAddToWishlistSuccess?: () => void;
    /** Called if add to wishlist operation fails */
    onAddToWishlistError?: (error: unknown) => void;
    /**
     * When provided in add mode, renders a compact two-button layout:
     * "Add to Cart" + "Buy It Now" side by side. Express payments, BNPL,
     * wishlist, and share buttons are hidden in this layout.
     * Typically navigates to the PDP for the full purchase flow.
     */
    onBuyNow?: () => void;
}

export default function ProductCartActions({
    product,
    onBeforeCartAction,
    onCartSuccess,
    onCartError,
    onBeforeAddToWishlist,
    onAddToWishlistSuccess,
    onAddToWishlistError,
    onBuyNow,
}: ProductCartActionsProps): ReactElement {
    const { t } = useTranslation('product');
    const isProductASet = isProductSet(product);
    const isProductABundle = isProductBundle(product);

    // Get shared state from context. currentVariant comes from the SAME source
    // that derives canAddToCart (the provider's controlled/URL variant) so the
    // "select all options" message and the Add-to-Cart enabled state can never
    // disagree — e.g. in the Quick Add modal where the variant is passed in as
    // controlled state and a local useCurrentVariant({ product }) would miss it.
    const {
        mode,
        isAddingToOrUpdatingCart,
        canAddToCart,
        currentVariant,
        isMasterOrVariantProduct,
        handleAddToCart,
        handleUpdateCart,
        handleAddToWishlist,
    } = useProductView();

    const isEditMode = mode === 'edit';
    // Compact layout: shown in add mode when a "Buy It Now" handler is provided (e.g. Quick Add modal).
    // Hides express payments, BNPL, wishlist, and share — shopper goes to PDP for those.
    const isCompactAddMode = !isEditMode && !!onBuyNow;

    // Get product ID for pending action matching
    const productToCheck = isMasterOrVariantProduct ? currentVariant : product;
    const currentProductId = productToCheck?.productId || product.id;

    // Check for pending actions and execute if they match this product
    // This handles actions that were initiated before authentication (e.g., addToWishlist)
    useCheckAndExecutePendingAction({
        actionName: 'addToWishlist',
        shouldExecute: (params) => params.productId === currentProductId,
        onMatch: async () => {
            const productToAdd = isMasterOrVariantProduct ? currentVariant : product;
            // Call before callback
            onBeforeAddToWishlist?.();
            try {
                await handleAddToWishlist(productToAdd as ShopperProducts.schemas['Variant']);
                // Call success callback after API completes
                onAddToWishlistSuccess?.();
            } catch (error) {
                onAddToWishlistError?.(error);
                throw error;
            }
        },
    });

    const onAddOrUpdateToCart = async () => {
        // Keep edit-mode optimistic close behavior, but for add-mode quick-add we
        // wait for success so the mounted hook can emit toast + open mini-cart.
        if (isEditMode) {
            onBeforeCartAction?.();
        }

        try {
            // Use handleUpdateCart in edit mode, handleAddToCart in add mode
            if (isEditMode) {
                await handleUpdateCart();
            } else {
                await handleAddToCart();
            }
            // Call success callback after API completes
            onCartSuccess?.();
        } catch (error) {
            onCartError?.(error);
        }
    };

    // Defer ExpressPayments loading until after initial render to improve Lighthouse performance
    const [shouldLoadExpressPayments, setShouldLoadExpressPayments] = useState(false);

    useEffect(() => {
        // Use startTransition to mark this as non-urgent, allowing initial render to complete first
        startTransition(() => {
            setShouldLoadExpressPayments(true);
        });
    }, []);

    return (
        <div className="mt-6">
            {/* Options Selection Message */}
            {isMasterOrVariantProduct && !currentVariant && !isProductASet && !isProductABundle && (
                <div className="text-destructive font-medium">{t('selectAllOptions')}</div>
            )}
            <UITarget targetId="sfcc.pdp.tax.productMessage" />

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
                {/* Compact layout (Quick Add modal): Add to Cart + Buy It Now side by side */}
                {isCompactAddMode && !isProductASet && !isProductABundle && (
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            onClick={() => void onAddOrUpdateToCart()}
                            disabled={!canAddToCart || isAddingToOrUpdatingCart}
                            className="w-full"
                            size="lg">
                            {isAddingToOrUpdatingCart ? t('addingToCart') : t('addToCart')}
                        </Button>
                        <UITarget targetId="sfcc.quickAdd.payments.expressCheckout">
                            <Button
                                onClick={onBuyNow}
                                disabled={!canAddToCart}
                                variant="outline"
                                className="w-full"
                                size="lg">
                                {t('buyItNow')}
                            </Button>
                        </UITarget>
                    </div>
                )}

                {/* Standard layout: single Add to Cart / Update button */}
                {!isCompactAddMode && !isProductASet && !isProductABundle && (
                    <Button
                        data-testid="add-to-cart"
                        data-slot="add-to-cart-button"
                        onClick={() => void onAddOrUpdateToCart()}
                        disabled={!canAddToCart || isAddingToOrUpdatingCart}
                        className="w-full text-base font-semibold leading-6"
                        size="lg">
                        {isEditMode ? t('updateCart') : isAddingToOrUpdatingCart ? t('addingToCart') : t('addToCart')}
                    </Button>
                )}

                {/* Express Payments — standard layout only, vertical for PDP */}
                {!isCompactAddMode &&
                    !isProductASet &&
                    !isProductABundle &&
                    !isEditMode &&
                    shouldLoadExpressPayments && (
                        <UITarget targetId="sfcc.pdp.payments.expressCheckout">
                            <Suspense fallback={null}>
                                <ExpressPayments
                                    layout="vertical"
                                    separatorPosition="top"
                                    separatorText={t('expressPayments.separatorBuyWith')}
                                    disabled={!canAddToCart}
                                />
                            </Suspense>
                        </UITarget>
                    )}

                <UITarget targetId="sfcc.pdp.after.addToCart" />
                {!isCompactAddMode && !isEditMode && currentProductId && <UITarget targetId="sfcc.pdp.bnpl.message" />}
            </div>
        </div>
    );
}
