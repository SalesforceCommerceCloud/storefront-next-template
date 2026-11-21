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
import { type ReactElement, type ReactNode, Suspense, useMemo, useEffect, useRef } from 'react';
import { Await } from 'react-router';
import { useAuthFetcher as useFetcher } from '@/hooks/use-auth-fetcher';
import type { ShopperBasketsV2, ShopperProducts, ShopperSearch } from '@/scapi';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/toast';
import { useBasketUpdater } from '@/providers/basket';
import type { BasketActionResponse } from '@/routes/types/action-responses';
import { getBonusProductCountsForPromotion } from '@/lib/cart/bonus-product-utils';
import { requiresVariantSelection, getPrimaryProductImageUrl, isRuleBasedPromotion } from '@/lib/product/product-utils';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { toImageUrl } from '@/lib/images/dynamic-image';
import { formatCurrency } from '@/lib/currency';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { getPriceData } from '@/components/product-price/utils';
import { resourceRoutes } from '@/route-paths';

interface BonusProductSelectionProps {
    bonusDiscountLineItem: ShopperBasketsV2.schemas['BonusDiscountLineItem'];
    bonusProductsById: Record<string, ShopperProducts.schemas['Product']>;
    basket: ShopperBasketsV2.schemas['Basket'];
    promotionName?: string;
    /**
     * The full promotion behind this bonus offer (`name` + `calloutMsg`). Canonical does not use it — it
     * renders `promotionName` (the pre-merged `calloutMsg || name`) — but vertical overrides may want the
     * raw fields (e.g. cosmetic uses `name` for the title and `calloutMsg` for its max-reached notice).
     */
    promotion?: { name?: string; calloutMsg?: string };
    /**
     * Loader-deferred map of `promotionId → ProductSearchHit[]` for rule-based bonus promotions.
     *
     * Promise reference is intentionally NOT pinned at the cart route — every cart-mutating revalidation produces a
     * fresh reference so rule-based search results stay aligned with the live basket. The component must therefore keep
     * its outer shell mounted across those re-suspensions so the `useFetcher` toast handler below survives. The
     * `<Await>` is mounted inside a child `<Suspense>` so only the carousel content re-suspends; the outer component
     * (and its fetcher state) does not.
     */
    ruleBasedBonusProductsPromise?: Promise<Record<string, ShopperSearch.schemas['ProductSearchHit'][]>>;
    onProductSelect: (productId: string, productName: string, requiresModal: boolean) => void;
}

export default function BonusProductSelection({
    bonusDiscountLineItem,
    bonusProductsById,
    basket,
    promotionName,
    ruleBasedBonusProductsPromise,
    onProductSelect,
}: BonusProductSelectionProps): ReactElement {
    const addToCartFetcher = useFetcher();
    const { addToast } = useToast();
    const updateBasket = useBasketUpdater();
    const { t, i18n } = useTranslation();
    const config = useConfig();
    const { currency } = useSite();

    // Track processed fetcher data to prevent duplicate toasts
    const processedDataRef = useRef<typeof addToCartFetcher.data>(null);

    // Check if this is a rule-based promotion
    const isRuleBased = isRuleBasedPromotion(bonusDiscountLineItem);

    // Calculate selection counts
    const { selectedBonusItems, maxBonusItems } = getBonusProductCountsForPromotion(
        basket,
        bonusDiscountLineItem.promotionId || ''
    );

    // Build title
    const titleText = promotionName || t('cart:bonusProducts.defaultTitle');
    const titleSuffix = t('cart:bonusProducts.selectionCount', {
        selected: selectedBonusItems,
        max: maxBonusItems,
    });

    // List-based products are derived purely from props that come with the (already-resolved) basket,
    // so they're computed once at the outer component and reused across rule-based re-suspensions.
    const listBasedProducts = useMemo<DisplayProduct[]>(
        () =>
            bonusDiscountLineItem.bonusProducts
                ?.map((productLink) => {
                    const product = bonusProductsById[productLink.productId];
                    if (!product) return null;

                    return {
                        productId: productLink.productId,
                        productName: productLink.productName || product.name || 'Product',
                        imageAlt:
                            product.imageGroups?.[0]?.images?.[0]?.alt || productLink.productName || product.name || '',
                        imageUrl: getPrimaryProductImageUrl(product, 'large', product.variationValues),
                        product,
                    };
                })
                .filter((item): item is DisplayProduct => item !== null) || [],
        [bonusDiscountLineItem.bonusProducts, bonusProductsById]
    );

    // Handle direct add-to-cart result
    // Only process new responses to prevent duplicate toasts on re-renders
    useEffect(() => {
        if (addToCartFetcher.state === 'idle' && addToCartFetcher.data) {
            // Only process if this is new data we haven't seen before
            if (processedDataRef.current !== addToCartFetcher.data) {
                processedDataRef.current = addToCartFetcher.data;

                if (addToCartFetcher.data.success) {
                    // Publish the new revision so useBasket() consumers stay in sync, matching the other basket
                    // mutation handlers. Dedups by `lastModified`. Shape-safe: no basket read or mutation sets
                    // `expand`, so every response carries the SCAPI default and can't down-shape provider consumers.
                    const responseBasket = (addToCartFetcher.data as BasketActionResponse).basket;
                    if (responseBasket) {
                        updateBasket(responseBasket);
                    }
                } else {
                    addToast(
                        t('product:bonusProducts.failedToAdd', {
                            error: addToCartFetcher.data.error?.message || t('product:unknownError'),
                        }),
                        'error'
                    );
                }
            }
        }
    }, [addToCartFetcher.state, addToCartFetcher.data, addToast, t, updateBasket]);

    const handleSelectProduct = (
        productId: string,
        productName: string,
        product: ShopperProducts.schemas['Product']
    ) => {
        const needsModal = requiresVariantSelection(product);

        if (needsModal) {
            // Open modal for variant selection
            onProductSelect(productId, productName, true);
        } else {
            // Validate required IDs before submission
            if (!bonusDiscountLineItem.id || !bonusDiscountLineItem.promotionId) {
                addToast(
                    t('product:bonusProducts.failedToAdd', {
                        error: t('product:bonusProducts.missingRequiredInfo'),
                    }),
                    'error'
                );
                return;
            }

            // Direct add to cart for standard products
            const bonusItems = [
                {
                    productId,
                    quantity: 1,
                    bonusDiscountLineItemId: bonusDiscountLineItem.id,
                    promotionId: bonusDiscountLineItem.promotionId,
                },
            ];

            const formData = new FormData();
            formData.append('bonusItems', JSON.stringify(bonusItems));

            void addToCartFetcher.submit(formData, {
                method: 'POST',
                action: resourceRoutes.bonusProductAdd,
            });
        }
    };

    // The carousel body (which merges list + rule-based products) is the only subtree that depends on the rule-based
    // promise. Wrap just that subtree in <Suspense>/<Await>-via-`use()` so the outer shell — and the `addToCartFetcher`
    // it owns — stays mounted across loader revalidations that produce a fresh promise reference.
    const bonusPromotionId = bonusDiscountLineItem.promotionId;
    const carouselBody =
        isRuleBased && ruleBasedBonusProductsPromise && bonusPromotionId ? (
            <Suspense fallback={<BonusCarouselSkeleton />}>
                <RuleBasedBonusCarousel
                    promise={ruleBasedBonusProductsPromise}
                    promotionId={bonusPromotionId}
                    listBasedProducts={listBasedProducts}
                    renderItem={renderCarouselItem}
                />
            </Suspense>
        ) : (
            <BonusCarousel items={listBasedProducts} renderItem={renderCarouselItem} />
        );

    return (
        <section
            aria-label="Bonus Product Bundle"
            className="w-full overflow-hidden rounded-ui border border-border bg-[var(--bg-input-30)] p-4">
            <h3 className="text-base leading-6 text-card-foreground font-sans pb-3">
                <span className="font-semibold">{titleText}</span>
                <span className="font-normal">{titleSuffix}</span>
            </h3>
            {carouselBody}
        </section>
    );

    function renderCarouselItem(item: DisplayProduct): ReactElement {
        return (
            <CarouselItem key={item.productId} className="basis-[220px] pl-3">
                <article
                    className="flex h-[329px] flex-col justify-between items-start border border-border bg-background"
                    aria-label="Bonus bundle product card">
                    {/* Image */}
                    <div className="flex flex-col items-start self-stretch">
                        <div className="px-4 py-3 self-stretch">
                            <div className="bg-muted/30 border border-border overflow-hidden">
                                <div className="h-36 w-full relative">
                                    {item.imageUrl ? (
                                        <img
                                            src={toImageUrl({ src: item.imageUrl, config }) ?? item.imageUrl}
                                            alt={
                                                item.imageAlt ||
                                                item.productName ||
                                                t('common:productImageAlt') ||
                                                'Product Image'
                                            }
                                            loading="lazy"
                                            className="absolute inset-0 h-full w-full object-cover"
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center bg-muted">
                                            <span className="text-muted-foreground text-sm">
                                                {t('common:noImageAvailable')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Product name and badge with price */}
                        <div className="px-4 pb-2 flex items-start justify-between gap-1.5 self-stretch">
                            <p className="text-sm font-semibold leading-tight text-card-foreground line-clamp-2">
                                {item.productName}
                            </p>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <Badge className="bg-primary text-primary-foreground font-semibold text-xs">
                                    {t('cart:bonusProducts.freeBadge')}
                                </Badge>
                                {(() => {
                                    const { currentPrice, hasPrice } = getPriceData(item.product);
                                    return hasPrice && currentPrice > 0 ? (
                                        <span className="text-sm text-muted-foreground line-through">
                                            {formatCurrency(currentPrice, i18n.language, currency)}
                                        </span>
                                    ) : null;
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Select button */}
                    <div className="px-4 pb-3 self-stretch">
                        <Button
                            className="w-full h-9"
                            onClick={() => handleSelectProduct(item.productId, item.productName, item.product)}
                            disabled={addToCartFetcher.state === 'submitting' || selectedBonusItems >= maxBonusItems}>
                            {addToCartFetcher.state === 'submitting' ? 'Adding...' : 'Select'}
                        </Button>
                    </div>
                </article>
            </CarouselItem>
        );
    }
}

type DisplayProduct = {
    productId: string;
    productName: string;
    imageAlt: string;
    imageUrl: string | undefined;
    product: ShopperProducts.schemas['Product'];
};

function BonusCarousel({
    items,
    renderItem,
}: {
    items: DisplayProduct[];
    renderItem: (item: DisplayProduct) => ReactNode;
}): ReactElement {
    return (
        <Carousel opts={{ align: 'start' }} className="w-full">
            <div className="relative">
                <CarouselContent className="-ml-3 justify-start">{items.map(renderItem)}</CarouselContent>
                <CarouselPrevious className="absolute left-0 top-1/2 -translate-y-1/2 size-8 rounded-full border border-border" />
                <CarouselNext className="absolute right-0 top-1/2 -translate-y-1/2 size-8 rounded-full border border-border" />
            </div>
        </Carousel>
    );
}

/**
 * Inner subtree that consumes the rule-based bonus product promise.
 *
 * The cart loader's `ruleBasedBonusProductsPromise` is intentionally NOT pinned at the route
 * level — its results depend on the live basket, so a cart mutation must produce a fresh
 * promise. The enclosing `<Suspense>` re-suspends back to the skeleton on each new promise,
 * but only this subtree unmounts — the parent `<BonusProductSelection>` (and the
 * `addToCartFetcher` it owns) stays mounted, so any in-flight bonus-add submission survives.
 */
function RuleBasedBonusCarousel({
    promise,
    promotionId,
    listBasedProducts,
    renderItem,
}: {
    promise: Promise<Record<string, ShopperSearch.schemas['ProductSearchHit'][]>>;
    promotionId: string;
    listBasedProducts: DisplayProduct[];
    renderItem: (item: DisplayProduct) => ReactNode;
}): ReactElement {
    return (
        <Await resolve={promise} errorElement={<BonusCarousel items={listBasedProducts} renderItem={renderItem} />}>
            {(ruleBasedByPromotionId: Record<string, ShopperSearch.schemas['ProductSearchHit'][]>) => {
                const hits = ruleBasedByPromotionId[promotionId] ?? [];
                const ruleBased = hits
                    .filter((hit) => hit.productId || hit.id)
                    .map<DisplayProduct>((hit) => {
                        const productId = (hit.productId || hit.id) as string;
                        return {
                            productId,
                            productName: hit.productName || 'Product',
                            imageAlt: hit.image?.alt || hit.productName || '',
                            imageUrl: hit.image?.disBaseLink ?? hit.image?.link ?? '',
                            product: hit as unknown as ShopperProducts.schemas['Product'],
                        };
                    });

                const all = [...listBasedProducts, ...ruleBased];
                // Deduplicate by productId — list-based wins because it appears first.
                const items = all.filter(
                    (item, index, self) => index === self.findIndex((p) => p.productId === item.productId)
                );
                return <BonusCarousel items={items} renderItem={renderItem} />;
            }}
        </Await>
    );
}

/**
 * Fixed-height skeleton matching the carousel's resolved layout (one card row at 329px). Reserves space so the carousel
 * doesn't cause CLS when it streams in below the fold but within the initial viewport on small carts.
 */
function BonusCarouselSkeleton(): ReactElement {
    return (
        <div className="relative" aria-hidden="true">
            <div className="-ml-3 flex">
                {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="basis-[220px] pl-3 shrink-0">
                        <Skeleton className="h-[329px] w-[208px]" />
                    </div>
                ))}
            </div>
        </div>
    );
}
