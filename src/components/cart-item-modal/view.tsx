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
import { useCallback, type ReactElement } from 'react';
import type { ShopperProducts } from '@/scapi';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Link } from '@/components/link';
import ImageGallery, { type GalleryImage } from '@/components/image-gallery';
import ProductInfo from '@/components/product-view/product-info';
import ProductCartActions from '@/components/product-cart-actions';
import ProductViewProvider from '@/providers/product-view';
import ChildProducts from '@/components/product-view/child-products';
import { useTranslation } from 'react-i18next';
import { ProductProvider } from '@/providers/product-context';
// @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
import { ProductReviewsProvider } from '@/extensions/ratings-reviews/providers/product-reviews-context';
// @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS

/**
 * `DialogContent sm:max-w-4xl` (~848) with `md:grid-cols-2` → gallery is the full inner column below `md` and
 * ~412 wide at `md+`. 420 gives DIS a hair of headroom. Thumbnails use the fixed-CSS horizontal strip, so no
 * thumbnail override is needed.
 */
const GALLERY_WIDTHS = { main: { base: '100vw', md: 420 } } as const;

interface CartItemModalViewProps {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    dialogTitle: string;
    isLoading: boolean;
    hasError: boolean;
    onRetry?: () => void;
    retryLabel: string;
    loadingLabel: string;
    loadErrorLabel: string;
    mode: 'add' | 'edit';
    currentProduct: ShopperProducts.schemas['Product'] | null;
    initialQuantity: number;
    itemId?: string;
    matchingVariant?: ShopperProducts.schemas['Variant'];
    isVariantInventoryLoading?: boolean;
    variationValues: Record<string, string>;
    onAttributeChange: (attributeId: string, value: string) => void;
    galleryImages: GalleryImage[];
    isProductASet: boolean;
    isProductABundle: boolean;
    onBeforeCartAction: () => void;
    onBuyNow?: () => void;
    viewDetailsHref?: string;
}

export function CartItemModalView({
    open,
    onOpenChange,
    dialogTitle,
    isLoading,
    hasError,
    onRetry,
    retryLabel,
    loadingLabel,
    loadErrorLabel,
    mode,
    currentProduct,
    initialQuantity,
    itemId,
    matchingVariant,
    isVariantInventoryLoading = false,
    variationValues,
    onAttributeChange,
    galleryImages,
    isProductASet,
    isProductABundle,
    onBeforeCartAction,
    onBuyNow,
    viewDetailsHref,
}: CartItemModalViewProps): ReactElement {
    const { t } = useTranslation(['account']);
    const handleDialogOpenChange = useCallback(
        (isOpen: boolean) => {
            onOpenChange?.(isOpen);
        },
        [onOpenChange]
    );
    const handleViewDetailsClick = useCallback(() => {
        onOpenChange?.(false);
    }, [onOpenChange]);
    const hasFixedQuickAddActions = mode === 'add' && Boolean(onBuyNow) && !isProductASet && !isProductABundle;

    return (
        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <DialogContent
                className={
                    hasFixedQuickAddActions
                        ? 'flex max-h-[calc(100dvh-var(--header-height,0px)-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl'
                        : 'max-h-[calc(100dvh-var(--header-height,0px)-1.5rem)] overflow-y-auto p-4 sm:p-5 md:p-6 sm:max-w-4xl'
                }
                showCloseButton>
                <DialogHeader className="sr-only">
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription>
                        Review product details, choose options, and add the item to your cart.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center gap-3 p-8">
                        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                        <p className="text-sm text-muted-foreground">{loadingLabel}</p>
                    </div>
                ) : hasError ? (
                    <div className="flex flex-col items-center justify-center p-8 gap-4">
                        <p className="text-destructive text-center">{loadErrorLabel}</p>
                        <Button onClick={onRetry} variant="outline">
                            {retryLabel}
                        </Button>
                    </div>
                ) : currentProduct ? (
                    <>
                        <ProductProvider product={currentProduct}>
                            {/* @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS */}
                            <ProductReviewsProvider>
                                {/* @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS */}
                                <ProductViewProvider
                                    product={currentProduct}
                                    mode={mode}
                                    initialQuantity={initialQuantity}
                                    itemId={itemId}
                                    currentVariant={matchingVariant}>
                                    <div
                                        data-slot={hasFixedQuickAddActions ? 'quick-add-details' : undefined}
                                        role={hasFixedQuickAddActions ? 'region' : undefined}
                                        aria-label={hasFixedQuickAddActions ? dialogTitle : undefined}
                                        className={
                                            hasFixedQuickAddActions
                                                ? 'flex-1 min-h-0 overflow-y-auto p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5 md:p-6'
                                                : undefined
                                        }
                                        tabIndex={hasFixedQuickAddActions ? 0 : undefined}>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                            <div className="order-1">
                                                <ImageGallery
                                                    key={currentProduct.id}
                                                    images={galleryImages}
                                                    eager={!isProductASet && !isProductABundle}
                                                    showNavigationArrows
                                                    horizontalThumbnails
                                                    productName={currentProduct.name}
                                                    widths={GALLERY_WIDTHS}
                                                />
                                            </div>
                                            <div className="order-2 flex flex-col self-start">
                                                <ProductInfo
                                                    product={currentProduct}
                                                    swatchMode="controlled"
                                                    onAttributeChange={onAttributeChange}
                                                    variationValues={variationValues}
                                                    currentVariantOverride={matchingVariant}
                                                    isVariantInventoryLoading={isVariantInventoryLoading}
                                                    variantStyle="full"
                                                    hideActionIcons
                                                    // @sfdc-extension-line SFDC_EXT_RATINGS_REVIEWS
                                                    disableRatingInteraction={mode === 'add'}
                                                    headerAction={
                                                        mode === 'add' && viewDetailsHref ? (
                                                            <Link
                                                                to={viewDetailsHref}
                                                                className="text-sm font-semibold underline"
                                                                onClick={handleViewDetailsClick}>
                                                                {t('account:orders.viewDetails')}
                                                            </Link>
                                                        ) : undefined
                                                    }
                                                    showQuantityInEditMode={mode === 'edit'}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div
                                        data-slot={hasFixedQuickAddActions ? 'quick-add-actions' : undefined}
                                        className={
                                            hasFixedQuickAddActions
                                                ? 'shrink-0 border-t bg-background px-4 pt-0 pb-4 sm:px-5 md:px-6'
                                                : 'flex flex-col gap-4'
                                        }>
                                        {!hasFixedQuickAddActions && <hr className="border-border border-t-2" />}
                                        <ProductCartActions
                                            product={currentProduct}
                                            onBeforeCartAction={onBeforeCartAction}
                                            onCartSuccess={mode === 'add' ? onBeforeCartAction : undefined}
                                            onBuyNow={mode === 'add' ? onBuyNow : undefined}
                                        />
                                    </div>
                                </ProductViewProvider>
                                {/* Both branches render inside the cart modal — selectionSource="local" so child
                                        swatch clicks stay in component state and don't pollute the cart URL or
                                        trigger _app.cart loader revalidation. */}
                                {(isProductASet || isProductABundle) &&
                                    (mode === 'edit' && itemId ? (
                                        <ChildProducts
                                            parentProduct={currentProduct}
                                            mode="edit"
                                            itemId={itemId}
                                            initialBundleQuantity={initialQuantity}
                                            onBeforeCartAction={onBeforeCartAction}
                                            selectionSource="local"
                                        />
                                    ) : (
                                        <ChildProducts
                                            parentProduct={currentProduct}
                                            mode="add"
                                            initialBundleQuantity={initialQuantity}
                                            onCartSuccess={onBeforeCartAction}
                                            selectionSource="local"
                                        />
                                    ))}
                                {/* @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS */}
                            </ProductReviewsProvider>
                            {/* @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS */}
                        </ProductProvider>
                    </>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
