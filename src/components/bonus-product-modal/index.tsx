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
import { useState, useEffect, useMemo, useCallback, type ReactElement } from 'react';
import type { ShopperProducts } from '@/scapi';
import { useFetcher } from 'react-router';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useScapiFetcher } from '@/hooks/use-scapi-fetcher';
import { useProductImages } from '@/hooks/product/use-product-images';
import { useToast } from '@/components/toast';
import { useBasketUpdater } from '@/providers/basket';
import ProductViewProvider, { useProductView } from '@/providers/product-view';
import ImageGallery from '@/components/image-gallery';
import ProductInfo from '@/components/product-view/product-info';
import { computeInitialVariationValues } from '@/lib/product/initial-variation-values';
import { resourceRoutes } from '@/route-paths';

export interface BonusDiscountSlot {
    id: string;
    maxBonusItems: number;
    bonusProductsSelected?: number;
}

export interface BonusProductModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    productId: string;
    productName: string;
    promotionId: string;
    bonusDiscountLineItemId: string;
    bonusDiscountSlots: BonusDiscountSlot[];
}

const BONUS_MODAL_CONTENT_MAX_HEIGHT = 600;

/**
 * `DialogContent w-full lg:max-w-4xl` (~848) with `lg:grid-cols-2 lg:gap-8` → gallery is the full inner column
 * below `lg` and ~408 wide at `lg+`. Tight fit would be 410/232; we deliberately round `lg` main up to 420
 * (cart-modal, child-card) and `md` thumb up to 240 (PDP) so a session that hops between surfaces shares DIS
 * cache entries instead of fetching three near-identical variants. ~3% over-supply, no visible difference.
 */
const GALLERY_WIDTHS = {
    main: { base: '100vw', lg: 420 },
    thumbnail: { base: 144, sm: 176, md: 240, lg: 96 },
} as const;

export function BonusProductModal({
    open,
    onOpenChange,
    productId,
    productName,
    promotionId,
    bonusDiscountLineItemId,
    bonusDiscountSlots,
}: BonusProductModalProps): ReactElement {
    const { t } = useTranslation();
    const addToCartFetcher = useFetcher();
    const { addToast } = useToast();
    const updateBasket = useBasketUpdater();

    const [isAddingToCart, setIsAddingToCart] = useState(false);
    const [variationValues, setVariationValues] = useState<Record<string, string>>({});

    const fetcher = useScapiFetcher('shopperProducts', 'getProduct', {
        params: {
            path: { id: productId },
            query: {
                allImages: true,
            },
        },
    });

    // Auto-load when the modal opens and we don't yet have data. Gated on `!fetcher.errors`
    // to avoid hammering SCAPI on a sticky error — at the cost that a transient failure won't
    // auto-retry on reopen (user must click the Retry button). Per-open-session retry is
    // tracked as a follow-up.
    useEffect(() => {
        if (open && fetcher.state === 'idle' && !fetcher.success && !fetcher.errors) {
            void fetcher.load();
        }
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [open, fetcher.state, fetcher.success, fetcher.errors]);

    // Derive the current product from fetcher.data. useScapiFetcher keys the fetcher on the
    // encoded productId, so when productId changes mid-session the fetcher resets and this
    // becomes null until the new fetch resolves — no manual stale-state tracking needed.
    const currentProduct: ShopperProducts.schemas['Product'] | null = fetcher.data ?? null;
    const isLockedToVariant = Boolean(currentProduct?.type?.variant);

    // Seed variationValues whenever a new product loads (productId switch or first open). The
    // user can mutate variationValues via swatch clicks afterward, so this can't be derived.
    // Note: stale selections from a previous open session may leak into the next reopen for
    // the same productId — tracked as a follow-up.
    useEffect(() => {
        if (currentProduct) {
            setVariationValues(computeInitialVariationValues(currentProduct));
        } else {
            setVariationValues({});
        }
    }, [currentProduct?.id]); // oxlint-disable-line react-hooks/exhaustive-deps

    // Close on success; show error toast on failure. Success toast is intentionally suppressed —
    // the cart updates in the background and the modal closing is the user-visible confirmation.
    useEffect(() => {
        if (!isAddingToCart) {
            return;
        }

        if (addToCartFetcher.state === 'idle' && addToCartFetcher.data) {
            if (addToCartFetcher.data.success && addToCartFetcher.data.basket) {
                // Publish the new revision so useBasket() consumers stay in sync, matching the other basket
                // mutation handlers. Dedups by `lastModified`. Shape-safe: no basket read or mutation sets
                // `expand`, so every response carries the SCAPI default and can't down-shape provider consumers.
                updateBasket(addToCartFetcher.data.basket);
                setIsAddingToCart(false);
                onOpenChange(false);
            } else if (addToCartFetcher.data.success === false) {
                setIsAddingToCart(false);
                const errorMessage = t('product:failedToAddToCart', {
                    error: addToCartFetcher.data.error?.message || 'Unknown error',
                });
                addToast(errorMessage, 'error');
            }
        }
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [isAddingToCart, addToCartFetcher.state, addToCartFetcher.data, updateBasket]);

    const matchingVariant = useMemo(() => {
        if (!currentProduct?.variants) return undefined;

        const potentialVariants = currentProduct.variants.filter(
            (variant: { variationValues?: Record<string, string> }) => {
                return (
                    variant.variationValues &&
                    Object.keys(variationValues).every((key) => variant.variationValues?.[key] === variationValues[key])
                );
            }
        );

        return potentialVariants.length === 1 ? potentialVariants[0] : undefined;
    }, [currentProduct?.variants, variationValues]);

    const currentSlot = bonusDiscountSlots.find((slot) => slot.id === bonusDiscountLineItemId);
    const alreadySelectedCount = currentSlot?.bonusProductsSelected || 0;
    const totalAllowedCount = currentSlot?.maxBonusItems || 0;
    const remainingCapacity = Math.max(0, totalAllowedCount - alreadySelectedCount);

    const handleAttributeChange = useCallback((attributeId: string, value: string) => {
        setVariationValues((prev) => {
            if (prev[attributeId] === value) {
                return prev;
            }
            return { ...prev, [attributeId]: value };
        });
    }, []);

    const handleAddToCart = useCallback(
        (selectedQuantity: number) => {
            if (!currentProduct?.id) {
                return;
            }

            const productIdToAdd = currentProduct.type?.variant
                ? currentProduct.id
                : matchingVariant?.productId || currentProduct.id;

            if (!currentSlot?.id) {
                addToast(t('cart:bonusProducts.noSlotError'), 'error');
                return;
            }

            const bonusItems = [
                {
                    productId: productIdToAdd,
                    quantity: selectedQuantity,
                    bonusDiscountLineItemId: currentSlot.id,
                    promotionId,
                },
            ];

            const formData = new FormData();
            formData.append('bonusItems', JSON.stringify(bonusItems));

            setIsAddingToCart(true);

            void addToCartFetcher.submit(formData, {
                method: 'POST',
                action: resourceRoutes.bonusProductAdd,
            });
        },
        // oxlint-disable-next-line react-hooks/exhaustive-deps
        [
            currentProduct?.id,
            currentProduct?.type,
            bonusDiscountSlots,
            promotionId,
            addToCartFetcher,
            addToast,
            matchingVariant,
            t,
        ]
    );

    const safeProduct = currentProduct || ({} as ShopperProducts.schemas['Product']);
    const { galleryImages } = useProductImages({
        product: safeProduct,
        selectedAttributes: variationValues,
    });

    const AddToCartButton = ({ className }: { className?: string }) => {
        const { quantity, canAddToCart, isMasterOrVariantProduct } = useProductView();

        const isDisabled =
            addToCartFetcher.state === 'submitting' ||
            !currentProduct ||
            remainingCapacity === 0 ||
            quantity === 0 ||
            (isMasterOrVariantProduct && !matchingVariant && !currentProduct?.type?.variant) ||
            !canAddToCart;

        return (
            <Button onClick={() => handleAddToCart(quantity)} disabled={isDisabled} size="lg" className={className}>
                {addToCartFetcher.state === 'submitting' ? t('product:addingToCart') : t('product:addToCart')}
            </Button>
        );
    };
    const isLoading = !currentProduct && fetcher.state !== 'idle';
    const fetcherErrored = !currentProduct && fetcher.state === 'idle' && !fetcher.success && fetcher.errors != null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex flex-col w-full h-screen max-w-none lg:max-w-4xl lg:max-h-[90vh] lg:h-auto lg:overflow-y-auto"
                showCloseButton
                aria-describedby={undefined}>
                <DialogHeader className="shrink-0">
                    <DialogTitle>
                        {currentProduct?.name || productName}
                        {t('cart:bonusProducts.selectionCount', {
                            selected: alreadySelectedCount,
                            max: totalAllowedCount,
                        })}
                    </DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center p-8">
                        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                    </div>
                ) : fetcherErrored ? (
                    <div className="flex flex-col items-center justify-center p-8 gap-4">
                        <p className="text-destructive text-center">{t('cart:bonusProducts.loadError')}</p>
                        <Button
                            onClick={() => {
                                void fetcher.load();
                            }}
                            variant="outline">
                            {t('cart:bonusProducts.retry')}
                        </Button>
                    </div>
                ) : currentProduct ? (
                    <ProductViewProvider
                        product={currentProduct}
                        mode="add"
                        initialQuantity={1}
                        maxQuantity={remainingCapacity}
                        currentVariant={matchingVariant}
                        // Bonus products are promotional and intentionally free — their price comes
                        // from the promotion, not a price book, so don't block them on a missing price.
                        allowMissingPrice>
                        {/* Scrollable content area */}
                        <div className="flex-1 overflow-y-auto min-h-0 lg:overflow-visible lg:flex-none">
                            <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
                                <div className="lg:order-1">
                                    <ImageGallery
                                        images={galleryImages}
                                        eager={false}
                                        productName={currentProduct.name}
                                        widths={GALLERY_WIDTHS}
                                    />
                                </div>
                                <div className="lg:order-2">
                                    <div
                                        className="lg:border lg:border-gray-200 lg:p-6 lg:overflow-y-auto"
                                        style={{ maxHeight: `${BONUS_MODAL_CONTENT_MAX_HEIGHT}px` }}>
                                        <ProductInfo
                                            product={currentProduct}
                                            swatchMode="controlled"
                                            onAttributeChange={handleAttributeChange}
                                            variationValues={variationValues}
                                            hideVariantSelection={isLockedToVariant}
                                        />
                                        <div className="text-destructive text-sm mt-2">
                                            {t('cart:bonusProducts.selectUpTo', { count: remainingCapacity })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Desktop button - below both columns, aligned right */}
                            <div className="hidden lg:flex lg:justify-end lg:mt-6">
                                <AddToCartButton className="w-full lg:w-auto" />
                            </div>
                        </div>

                        {/* Sticky button area - only on mobile, outside scrollable area */}
                        <div className="shrink-0 bg-background border-t px-4 py-4 lg:hidden flex flex-col gap-2">
                            <AddToCartButton className="w-full" />
                            <Button
                                variant="outline"
                                className="w-full bg-muted hover:bg-muted/80"
                                onClick={() => onOpenChange(false)}>
                                {t('cart:bonusProducts.backToCart')}
                            </Button>
                        </div>
                    </ProductViewProvider>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
