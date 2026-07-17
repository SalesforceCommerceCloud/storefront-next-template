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
import { lazy, Suspense, type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import type { action as wishlistRemoveAction } from '@/routes/action.wishlist-remove';
import { Link } from '@/components/link';
import type { ShopperCustomers, ShopperProducts } from '@/scapi';
import { useTranslation } from 'react-i18next';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { findImageGroupBy } from '@/lib/product/image-groups-utils';
import { toImageUrl } from '@/lib/images/dynamic-image';
import { createProductUrl, getDisplayVariationValues, requiresVariantSelection } from '@/lib/product/product-utils';
import { isAvailablePrice } from '@/lib/product/price-utils';
import { useToast } from '@/components/toast';
import { useAnalytics } from '@/hooks/use-analytics';
import InventoryMessage from '@/components/inventory-message';
import ProductPrice from '@/components/product-price';
import { Button } from '@/components/ui/button';
import { useProductActions } from '@/hooks/product/use-product-actions';
import { useDeferredUnmount } from '@/hooks/use-deferred-unmount';
import { resourceRoutes } from '@/route-paths';

// Lazy-load the modal so it only enters the bundle when a shopper actually opens it
const CartItemModal = lazy(() =>
    import('@/components/cart-item-modal').then((module) => ({ default: module.CartItemModal }))
);

type Product = ShopperProducts.schemas['Product'];
type CustomerProductListItem = ShopperCustomers.schemas['CustomerProductListItem'];

const CTA_BUTTON_CLASS = 'w-full md:w-auto md:min-w-28';

interface WishlistListItemProps {
    product: Product;
    wishlistItem: CustomerProductListItem;
    onRemove: (itemId: string) => void;
}

/**
 * WishlistListItem — horizontal card row for a single wishlist product.
 *
 * Layout: [Image | Name + Variants + Stock + Remove | Price]
 */
export function WishlistListItem({ product, wishlistItem, onRemove }: WishlistListItemProps): ReactElement {
    const { t } = useTranslation('product');
    const config = useConfig();
    const { currency } = useSite();
    const { addToast } = useToast();
    const { trackWishlistItemRemoved } = useAnalytics();
    const removeFetcher = useFetcher<typeof wishlistRemoveAction>();
    const hasHandledRemoveResponse = useRef(false);

    // When SCAPI returns the product by its variant ID, the product itself has type.variant = true
    // and carries variationValues — the user explicitly chose this variant before saving.
    // For master products, we search the variants array to find the specific variant that was saved.
    // Resolved variant attributes are shown when either:
    //   a) the product IS a variant (type.variant = true), or
    //   b) the stored productId matches a specific variant inside the master's variants array.
    const isProductVariant = Boolean(product.type?.variant);
    const matchedVariant = !isProductVariant
        ? product.variants?.find((v) => v.productId === wishlistItem.productId)
        : undefined;

    // Determine the current variant to pass to useProductActions:
    // - If product IS a variant, build a minimal Variant object from the product's fields
    // - If product is a master, use the matched variant (or undefined if not found)
    const currentVariant: ShopperProducts.schemas['Variant'] | undefined = isProductVariant
        ? {
              productId: product.id ?? '',
              price: product.price,
              orderable: product.inventory?.orderable,
              variationValues: product.variationValues as Record<string, string> | undefined,
          }
        : matchedVariant;

    // Use the product actions hook for cart operations.
    // `skipInventoryValidation` keeps canAddToCart permissive for wishlist rows; the orderability
    // of the selection is surfaced separately via `isOrderable` so we can render a disabled
    // "Out of stock" button for items that can't currently be ordered.
    const { handleAddToCart, isAddingToOrUpdatingCart, canAddToCart, isOrderable } = useProductActions({
        product,
        currentVariant,
        initialQuantity: 1,
        skipInventoryValidation: true,
    });
    const isSpecificVariant = isProductVariant || Boolean(matchedVariant);
    const needsVariantSelection = !isSpecificVariant && requiresVariantSelection(product);
    // Variant resolved && not orderable (e.g., out of stock).
    const isResolvedVariantOutOfStock = isSpecificVariant && !isOrderable;

    // Variation values used for image group selection:
    // – for variant products returned directly by SCAPI, use the product's own variationValues
    // – for master products, use the matched variant's variationValues (or empty if not found)
    const variationValues = isProductVariant
        ? ((product.variationValues as Record<string, string> | undefined) ?? {})
        : ((matchedVariant?.variationValues as Record<string, string> | undefined) ?? {});

    // Display-friendly attribute name→value pairs (e.g. { Color: 'Blue', Size: 'M' })
    const displayVariationValues = isSpecificVariant
        ? getDisplayVariationValues(product.variationAttributes, variationValues)
        : {};

    // Resolve the correct product image for this variant
    const imageGroup = findImageGroupBy(product.imageGroups ?? [], {
        viewType: 'small',
        selectedVariationAttributes: variationValues,
    });
    const image = imageGroup?.images?.[0];
    const optimizedImageUrl = toImageUrl({ image, config });

    // PDP link — navigates to the master product; includes variation params when a specific
    // variant is known (either a variant product or a matched variant) so the PDP pre-selects
    // the right attributes on arrival. variationValues is already resolved for both cases above.
    const masterId = product.master?.masterId ?? (product.id as string | undefined);
    let pdpUrl = createProductUrl(masterId);
    if (isSpecificVariant && Object.keys(variationValues).length > 0) {
        const params = new URLSearchParams(variationValues);
        pdpUrl = `${pdpUrl}?${params.toString()}`;
    }

    // Handle remove action response
    useEffect(() => {
        if (removeFetcher.state === 'idle' && removeFetcher.data && !hasHandledRemoveResponse.current) {
            const result = removeFetcher.data;
            if (result?.success) {
                hasHandledRemoveResponse.current = true;
                addToast(t('removedFromWishlist'), 'success');

                // Emit analytics event on successful remove
                const productId = wishlistItem.productId;
                if (productId) {
                    void trackWishlistItemRemoved({
                        surface: 'wishlist-page',
                        productId,
                    });
                }

                if (wishlistItem.id) {
                    onRemove(wishlistItem.id);
                }
            } else if (result?.success === false || result?.error) {
                hasHandledRemoveResponse.current = true;
                addToast(t('failedToRemoveFromWishlist'), 'error');
            }
        }
        if (removeFetcher.state === 'submitting') {
            hasHandledRemoveResponse.current = false;
        }
    }, [
        removeFetcher.state,
        removeFetcher.data,
        addToast,
        onRemove,
        wishlistItem.id,
        wishlistItem.productId,
        t,
        trackWishlistItemRemoved,
    ]);

    const handleRemove = () => {
        if (removeFetcher.state !== 'idle' || !wishlistItem.id) return;
        void removeFetcher.submit(
            { itemId: wishlistItem.id },
            { method: 'POST', action: resourceRoutes.wishlistRemove }
        );
    };

    const isRemoving = removeFetcher.state !== 'idle';

    // Variant-selection modal state. When a master product is saved to the wishlist without a
    // specific variant chosen, we open the same CartItemModal the PDP quick-add uses so the
    // shopper can pick size/color and add to cart without leaving the wishlist.
    // `open` drives visibility; `useDeferredUnmount` keeps the subtree mounted briefly after
    // close for the Radix exit animation, then unmounts it so the modal's SCAPI product/variant
    // fetchers deregister from the registry instead of re-running on every context mutation.
    const [isSelectOptionsModalOpen, setIsSelectOptionsModalOpen] = useState(false);
    const isSelectOptionsModalMounted = useDeferredUnmount(isSelectOptionsModalOpen);
    const handleOpenSelectOptions = useCallback(() => {
        setIsSelectOptionsModalOpen(true);
    }, []);

    return (
        <div data-testid={`wishlist-item-${wishlistItem.id}`}>
            <div className="flex gap-4 p-4 rounded-ui border border-border bg-card">
                {/* Product Image */}
                <Link to={pdpUrl} className="flex-shrink-0 self-start" aria-label={product.name}>
                    <div className="w-20 h-20 md:w-28 md:h-28 rounded-ui overflow-hidden bg-muted flex items-center justify-center">
                        {optimizedImageUrl ? (
                            <img
                                src={optimizedImageUrl}
                                alt={image?.alt ?? product.name ?? ''}
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <div className="w-full h-full bg-muted" />
                        )}
                    </div>
                </Link>

                {/* Product Details */}
                <div className="flex flex-1 flex-col md:flex-row gap-4 min-w-0">
                    {/* Name + Variants + Stock + Remove */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                        <Link
                            to={pdpUrl}
                            className="text-base font-medium text-foreground hover:text-primary line-clamp-2 block">
                            {product.name}
                        </Link>

                        {/* Variant Attributes */}
                        {isSpecificVariant && Object.keys(displayVariationValues).length > 0 && (
                            <div className="text-sm text-muted-foreground space-y-0.5">
                                {Object.entries(displayVariationValues).map(([name, value]) => (
                                    <div key={name}>
                                        {name}: {value}
                                    </div>
                                ))}
                            </div>
                        )}
                        {needsVariantSelection && product.variationAttributes && (
                            <div className="text-sm space-y-0.5">
                                {product.variationAttributes.map((attr) => (
                                    <div key={attr.id} className="text-warning">
                                        {attr.name}: {t('selectVariantPlaceholder')}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Stock Status */}
                        <InventoryMessage
                            product={product}
                            currentVariant={matchedVariant ?? null}
                            className="text-xs px-2 py-0.5"
                        />

                        {/* Remove button */}
                        <button
                            type="button"
                            onClick={handleRemove}
                            disabled={isRemoving}
                            className="block text-sm text-muted-foreground hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2 cursor-pointer"
                            aria-label={t('removeFromWishlist')}>
                            {t('remove')}
                        </button>
                    </div>

                    {/* Price — display tracks the gate's view of the saved selection.
                        Default: render the master so PromoCallout / range / lowest-priced-variant
                        stay correct (variants don't carry productPromotions on getProduct, so
                        passing the variant would silently drop promo callouts).
                        Exception: when a specific variant was saved AND that variant has no price
                        for the active currency, render the variant directly so the price area
                        renders "Price unavailable" instead of the master's misleading-but-real
                        lowest-priced fallback. The gate evaluates the saved variant via
                        useProductActions(currentVariant) above, so this keeps display + gate in
                        agreement on the same row. */}
                    <div className="flex flex-col gap-2 flex-shrink-0 md:items-end md:text-right">
                        <ProductPrice
                            type="unit"
                            product={
                                currentVariant && !isAvailablePrice(currentVariant.price)
                                    ? (currentVariant as unknown as Product)
                                    : product
                            }
                            currency={currency}
                        />
                        {isResolvedVariantOutOfStock ? (
                            <Button type="button" disabled size="sm" variant="default" className={CTA_BUTTON_CLASS}>
                                {t('outOfStockLabel')}
                            </Button>
                        ) : needsVariantSelection ? (
                            <Button
                                type="button"
                                onClick={handleOpenSelectOptions}
                                size="sm"
                                variant="outline"
                                className={CTA_BUTTON_CLASS}>
                                {t('selectOptions')}
                            </Button>
                        ) : (
                            <>
                                <Button
                                    onClick={() => void handleAddToCart()}
                                    disabled={!canAddToCart || isAddingToOrUpdatingCart}
                                    size="sm"
                                    variant="default"
                                    className={CTA_BUTTON_CLASS}
                                    // When this branch is reached with !canAddToCart, inventory is
                                    // already excluded (skipInventoryValidation: true) and a variant
                                    // is selected (otherwise needsVariantSelection above would have
                                    // matched), so the only remaining reason is no price for the
                                    // active currency. Surface that to assistive tech and on hover.
                                    aria-describedby={
                                        !canAddToCart && !isAddingToOrUpdatingCart
                                            ? `wishlist-cta-reason-${wishlistItem.id ?? product.id}`
                                            : undefined
                                    }
                                    title={
                                        !canAddToCart && !isAddingToOrUpdatingCart ? t('price.unavailable') : undefined
                                    }>
                                    {isAddingToOrUpdatingCart ? t('addingToCart') : t('addToCart')}
                                </Button>
                                {!canAddToCart && !isAddingToOrUpdatingCart ? (
                                    <span
                                        id={`wishlist-cta-reason-${wishlistItem.id ?? product.id}`}
                                        className="sr-only">
                                        {t('price.unavailable')}
                                    </span>
                                ) : null}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Variant-selection modal
             * Reuses the PDP quick-add modal flow. Lazy loads.
             * Uses master product id to load all variation attributes and inventory. */}
            {isSelectOptionsModalMounted && masterId && (
                <Suspense fallback={null}>
                    <CartItemModal
                        productId={masterId}
                        open={isSelectOptionsModalOpen}
                        onOpenChange={setIsSelectOptionsModalOpen}
                    />
                </Suspense>
            )}
        </div>
    );
}

export default WishlistListItem;
