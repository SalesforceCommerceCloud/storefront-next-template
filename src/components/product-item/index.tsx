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

// React
import { useMemo, type ReactElement, type ReactNode } from 'react';

// React Router
import { Link } from '@/components/link';

// Commerce SDK
import type { ShopperBasketsV2, ShopperProducts, ShopperPromotions } from '@/scapi';

// Components
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/spinner';
import { Typography } from '@/components/typography';
import HtmlFragment from '@/components/html-fragment';
import CartQuantityPicker from '@/components/cart/cart-quantity-picker';
import BundledProductItems from './bundled-product-items';
import ProductPrice from '../product-price';
import { getPriceData } from '../product-price/utils';

// Hooks
import { useItemFetcherLoading } from '@/hooks/use-item-fetcher';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { uiConfig } from '@/lib/config.ui';

// Utils
import { formatCurrency } from '@/lib/currency';
import { findImageGroupBy } from '@/lib/product/image-groups-utils';
import { createProductUrl, getDisplayVariationValues, type EnrichedProductItem } from '@/lib/product/product-utils';
// @sfdc-extension-line SFDC_EXT_BOPIS
import { getEffectiveStockLevel } from '@/lib/product/inventory-utils';
import { cn } from '@/lib/utils';
import { toImageUrl } from '@/lib/images/dynamic-image';
import { useTranslation } from 'react-i18next';
import { UITarget } from '@/targets/ui-target';

/**
 * ProductItemVariantImage component that renders product images with fallback
 *
 * @param props - Component props
 * @param props.product - Product data containing image information
 * @param props.className - Optional CSS class name
 * @returns JSX element with product image or placeholder
 */
export function ProductItemVariantImage({
    productItem,
    className = '',
}: {
    productItem: EnrichedProductItem;
    className?: string;
    width?: string;
}): ReactElement {
    const config = useConfig();
    const { t: tProduct } = useTranslation('product');

    if (!productItem) {
        return (
            <div className={cn('bg-muted flex-shrink-0 w-16', className)}>
                <div className="w-full h-full bg-muted" />
            </div>
        );
    }

    // Find the 'small' images in the variant's image groups based on variationValues and pick the first one
    const imageGroup = findImageGroupBy(productItem?.imageGroups, {
        viewType: 'small',
        selectedVariationAttributes: productItem?.variationValues,
    });
    const image = imageGroup?.images?.[0];
    const imageAltFallback = productItem?.productName || productItem?.name || tProduct('imageAlt') || 'Product Image';
    const optimizedImageUrl = toImageUrl({ image, config }) || '';

    return (
        <div
            data-slot="product-item-image"
            className={cn(
                'bg-muted flex-shrink-0 flex items-center justify-center aspect-square overflow-hidden rounded-ui',
                className
            )}>
            {image && optimizedImageUrl ? (
                <img
                    src={optimizedImageUrl}
                    alt={image?.alt || imageAltFallback}
                    className="h-full w-full object-contain"
                />
            ) : (
                <div className="w-full h-full bg-muted" />
            )}
        </div>
    );
}

/**
 * ProductItemVariantName component that renders product name as a link
 *
 * @param props - Component props
 * @param props.productItem - Product data containing name and ID information
 * @param props.showBonusBadge - When true (default), renders the "Bonus Product" badge for bonus line items
 * @returns JSX element with product name link
 */
export function ProductItemVariantName({
    productItem,
    showBonusBadge = true,
}: {
    productItem: EnrichedProductItem;
    showBonusBadge?: boolean;
}): ReactElement {
    const { t: tCart } = useTranslation('cart');
    const { t: tProduct } = useTranslation('product');
    if (!productItem) {
        return <div className="text-sm font-medium">{tCart('product.defaultName') || 'Product Name'}</div>;
    }

    const productId = productItem?.master?.masterId || productItem?.id;
    const productName = productItem?.productName || productItem?.name || tCart('product.defaultName') || 'Product Name';

    const isBonusProduct = Boolean(productItem?.bonusProductLineItem);
    return (
        <div className="mb-2 md:mb-4 flex items-start gap-2 min-w-0">
            {showBonusBadge && isBonusProduct && (
                <Badge variant="default" className="" role="status" aria-label={tProduct('bonusProductAriaLabel')}>
                    {tProduct('bonusProduct')}
                </Badge>
            )}
            <Typography
                variant="h2"
                className="text-xl font-semibold leading-7 tracking-[-0.5px] text-card-foreground min-w-0 flex-1">
                <Link
                    to={createProductUrl(productId)}
                    className="hover:text-primary block break-words"
                    title={productName}>
                    {productName}
                </Link>
            </Typography>
        </div>
    );
}

/**
 * ProductItemVariantAttributes component that displays product variation attributes
 *
 * @param props - Component props
 * @param props.product - Product data containing variation information
 * @param props.displayVariant - Display variant to control quantity display
 * @param props.promotions - Promotions data by ID
 * @returns JSX element with variation attributes or fallback
 */
export function ProductItemVariantAttributes({
    productItem,
    displayVariant = 'default',
    promotions: _promotions,
}: {
    productItem: EnrichedProductItem;
    displayVariant?: 'default' | 'summary';
    promotions?: Record<string, ShopperPromotions.schemas['Promotion']>;
}): ReactElement {
    const { t } = useTranslation('cart');
    // Memoize expensive calculations
    const displayVariationValues = useMemo(
        () => getDisplayVariationValues(productItem?.variationAttributes, productItem?.variationValues),
        [productItem?.variationAttributes, productItem?.variationValues]
    );

    return (
        <div>
            {/* Quantity - only show in summary variant */}
            {displayVariant === 'summary' && (
                <div className="text-sm text-muted-foreground">
                    {t('attributes.quantity')} {productItem.quantity || 1}
                </div>
            )}

            {/* Variation Attributes */}
            {Object.keys(displayVariationValues).length > 0 && (
                <ul role="list" className="text-sm font-normal leading-5 text-muted-foreground space-y-1 mb-1">
                    {Object.entries(displayVariationValues).map(([name, value]) => (
                        <li key={name}>
                            {name}: {value}
                        </li>
                    ))}
                </ul>
            )}

            {/* Promotions Info - shown in summary variant only, moved to right column for default */}
            {displayVariant === 'summary' && <ProductItemPromotions productItem={productItem} />}
        </div>
    );
}

/**
 * ProductItemPromotions component that displays promotion info for a product item
 */
export function ProductItemPromotions({
    productItem,
    className,
    /** Full-width row with badge aligned to the end (cart line / price column). */
    alignEnd = false,
}: {
    productItem: EnrichedProductItem;
    className?: string;
    alignEnd?: boolean;
}): ReactElement | null {
    const { t: tMiniCart, i18n } = useTranslation('miniCart');
    const { currency } = useSite();

    const isBonusProduct = Boolean(productItem?.bonusProductLineItem);
    if (isBonusProduct) return null;

    const { listPrice, currentPrice } = getPriceData(productItem);
    if (!listPrice) return null;
    const discount = (listPrice - currentPrice) * (productItem?.quantity ?? 1);
    if (discount <= 0) return null;

    const badge = (
        <Badge
            className={cn(
                'h-auto min-h-0 border-0 bg-muted px-1.5 py-0.5 text-xs font-semibold leading-4 text-secondary-foreground whitespace-normal break-words',
                className
            )}>
            {tMiniCart('saved', {
                amount: formatCurrency(discount, i18n.language, currency),
            })}
        </Badge>
    );

    if (alignEnd) {
        return <div className="flex w-full justify-end">{badge}</div>;
    }

    return badge;
}

/**
 * Props for the ProductItem component
 *
 * @interface ProductItemProps
 * @property {Product | undefined} product - Combined basket item and product data
 * @property {'default' | 'summary'} [displayVariant] - Display variant: 'default' for full, 'summary' for compact
 * @property {Record<string, ShopperPromotions.schemas['Promotion']>} [promotions] - Promotions data by ID
 * @property {function} [primaryAction] - Render prop function to create primary actions
 * @property {function} [secondaryActions] - Render prop function to create secondary actions
 * @property {function} [deliveryActions] - Render prop for per-line fulfillment (e.g. BOPIS pickup/delivery dropdown)
 * @property {ReactNode} [lineItemExtra] - Optional pre-rendered content for the end of the cart line right column (e.g. gift checkbox)
 */
interface ProductItemProps {
    productItem: EnrichedProductItem | undefined;
    displayVariant?: 'default' | 'summary';
    promotions?: Record<string, ShopperPromotions.schemas['Promotion']>;
    primaryAction?: (productItem: EnrichedProductItem) => ReactElement | undefined;
    secondaryActions?: (productItem: EnrichedProductItem) => ReactElement | undefined;
    deliveryActions?: (productItem: EnrichedProductItem) => ReactElement | undefined;
    /** Pre-rendered extra content at the end of the cart line right column (e.g. gift checkbox) */
    lineItemExtra?: ReactNode;
    bonusDiscountLineItems?: ShopperBasketsV2.schemas['BonusDiscountLineItem'][];
    maxBonusQuantity?: number;
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    /** Whether this item is a pickup item (affects stock level calculation) */
    isPickup?: boolean;
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
}

/**
 * ProductItem component that displays individual product information in cart or summary views
 *
 * This component handles:
 * - Product image display with fallback
 * - Product name as clickable link
 * - Variation attributes display
 * - Price formatting and display
 * - Primary and secondary actions
 * - Responsive layout for mobile/desktop
 * - Summary and default display variants
 * - Loading states with skeleton overlay
 *
 * @param props - Component props
 * @returns JSX element representing the product item
 */
function ProductItem({
    productItem,
    displayVariant = 'default',
    promotions,
    primaryAction,
    secondaryActions,
    deliveryActions,
    bonusDiscountLineItems,
    maxBonusQuantity,
    lineItemExtra,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    isPickup = false,
}: ProductItemProps): ReactElement {
    // Track loading state for all fetchers related to this item
    const isItemFetcherLoading = useItemFetcherLoading(productItem?.itemId);
    // Get currency from context (automatically derived from locale)
    const { currency } = useSite();
    const { t, i18n } = useTranslation();
    const config = useConfig();
    const showLineItemDescription = config.pages.cart?.showLineItemDescription ?? false;
    // Per-vertical line-item display flags (default variant only). Resolved via the
    // @/lib/config.ui seam — cosmetic overlays these to pare the cart tile down.
    const { showLineItemVariantAttributes, showLineItemListPrice, showLineItemPromoBadge, showLineItemBonusBadge } =
        uiConfig.pages.cart;

    // Check if this is a bonus product
    const isBonusProduct = Boolean(productItem?.bonusProductLineItem);

    // Determine if this is a choice-based bonus product by checking bonusDiscountLineItems
    // Must be called before any early returns (React Hooks rules)
    const isChoiceBasedBonusProduct = useMemo(() => {
        if (!productItem || !isBonusProduct || !productItem.bonusDiscountLineItemId || !bonusDiscountLineItems) {
            return false;
        }
        const matchingLineItem = bonusDiscountLineItems.find((item) => item.id === productItem.bonusDiscountLineItemId);
        // Choice-based bonus products have a bonusProducts array in the discount line item
        return Boolean(matchingLineItem?.bonusProducts && matchingLineItem.bonusProducts.length > 0);
    }, [productItem, isBonusProduct, bonusDiscountLineItems]);

    const isAutoBonusProduct = isBonusProduct && !isChoiceBasedBonusProduct;

    // Determine stock level: site-level ATS by default, store-specific for pickup items
    let stockLevel = productItem?.inventory?.ats;
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    if (isPickup && productItem) {
        stockLevel = getEffectiveStockLevel({
            product: productItem as unknown as ShopperProducts.schemas['Product'],
            isPickup: true,
            storeInventoryId: productItem.inventoryId,
        });
    }
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    if (!productItem || typeof productItem !== 'object') {
        return <div data-testid="product-item-error">Product data not available</div>;
    }

    // Summary variant - compact display for product summary.
    // NOTE: the showLineItem* UI-config flags (variant attributes, list price, promo badge, bonus badge)
    // are intentionally scoped to the DEFAULT variant below — they are NOT applied here. The summary tile
    // (order summaries / checkout) keeps showing all of these regardless of vertical. Don't "consistency-fix"
    // them onto this path without a deliberate decision.
    if (displayVariant === 'summary') {
        return (
            <div
                className="grid md:grid-cols-[112px_1fr] grid-cols-[72px_1fr] gap-4"
                data-testid={`sf-product-item-summary-${productItem?.productId || productItem?.id}`}>
                <div className="flex items-center justify-center">
                    <ProductItemVariantImage productItem={productItem} className="w-16" />
                </div>
                <div className="flex-1 space-y-1 min-w-0">
                    <ProductItemVariantName productItem={productItem} />
                    {productItem.bundledProducts && productItem.bundledProducts.length > 0 && (
                        <BundledProductItems bundledProducts={productItem.bundledProducts} />
                    )}
                    <ProductItemVariantAttributes
                        productItem={productItem}
                        displayVariant={displayVariant}
                        promotions={promotions}
                    />
                    <ProductPrice
                        type="unit"
                        product={productItem as ShopperProducts.schemas['Product']}
                        currency={currency}
                        labelForA11y={productItem?.productName}
                        currentPriceProps={{
                            className: 'text-card-foreground text-right font-semibold text-sm leading-none relative',
                        }}
                        listPriceProps={{
                            className: 'text-muted-foreground text-right text-sm leading-none relative',
                        }}
                        className="text-sm"
                    />
                </div>
            </div>
        );
    }
    const lineItemExtraContent = !isAutoBonusProduct ? lineItemExtra : undefined;

    // Default variant - full product item with card styling
    return (
        <div className="relative" data-testid={`sf-product-item-${productItem?.productId || productItem?.id}`}>
            <div className="bg-card text-card-foreground border-0 ">
                <div className="px-3 py-4 md:px-6 md:py-7 relative overflow-hidden">
                    <div className="grid md:grid-cols-[140px_1fr] grid-cols-[72px_1fr] gap-5 min-w-0">
                        <div className="flex-shrink-0 flex items-start justify-center">
                            {/* Product Image */}
                            <ProductItemVariantImage productItem={productItem} className="md:w-32 w-16" />
                        </div>

                        {/* Product Details */}
                        <div className="flex-1 space-y-3 min-w-0">
                            <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-2 md:gap-x-6 md:gap-y-1 min-w-0">
                                <div className="min-w-0">
                                    <div className="md:hidden float-right ml-2">{deliveryActions?.(productItem)}</div>
                                    <ProductItemVariantName
                                        productItem={productItem}
                                        showBonusBadge={showLineItemBonusBadge}
                                    />
                                    {productItem.bundledProducts && (
                                        <BundledProductItems bundledProducts={productItem.bundledProducts} />
                                    )}
                                    {showLineItemVariantAttributes && (
                                        <ProductItemVariantAttributes
                                            productItem={productItem}
                                            displayVariant={displayVariant}
                                            promotions={promotions}
                                        />
                                    )}
                                    {showLineItemDescription && productItem.shortDescription ? (
                                        <Typography variant="muted" as="p" className="text-sm mt-2">
                                            {productItem.shortDescription}
                                        </Typography>
                                    ) : null}
                                    {showLineItemDescription &&
                                    !productItem.shortDescription &&
                                    productItem.longDescription ? (
                                        <HtmlFragment
                                            content={productItem.longDescription}
                                            contentType="plain-text"
                                            className="text-sm text-muted-foreground mt-2 leading-relaxed"
                                        />
                                    ) : null}

                                    {!isAutoBonusProduct && secondaryActions && (
                                        <div className="mt-2">{secondaryActions(productItem)}</div>
                                    )}

                                    <UITarget targetId="sfcc.cart.tax.lineItemMessage" />
                                </div>
                                <div className="flex min-w-0 flex-shrink-0 flex-col items-end gap-2 md:gap-4 md:row-span-2">
                                    <div className="hidden w-full shrink-0 justify-end md:flex">
                                        {deliveryActions?.(productItem)}
                                    </div>

                                    <div className="flex w-full max-w-full shrink-0 flex-col items-end gap-2 md:gap-3">
                                        <div className="text-right" data-testid="desktop-product-price">
                                            <div className="inline-flex flex-col items-end font-semibold text-base">
                                                {(productItem.priceAfterItemDiscount ?? productItem.price ?? 0) ===
                                                0 ? (
                                                    <span className="text-xl font-semibold text-status-positive">
                                                        {t('miniCart:free')}
                                                    </span>
                                                ) : (
                                                    <ProductPrice
                                                        type="total"
                                                        product={productItem as ShopperProducts.schemas['Product']}
                                                        quantity={productItem.quantity ?? 1}
                                                        currency={currency}
                                                        labelForA11y={productItem?.productName}
                                                        hidePromo
                                                        currentPriceOnly={!showLineItemListPrice}
                                                        className="flex flex-row flex-row-reverse flex-wrap items-baseline justify-end gap-2"
                                                        currentPriceProps={{
                                                            className:
                                                                'text-xl font-bold leading-[120%] tracking-[-0.6px] text-card-foreground text-right relative',
                                                        }}
                                                        listPriceProps={{
                                                            className:
                                                                'text-xl font-normal leading-[120%] tracking-[-0.6px] text-card-foreground text-right line-through relative',
                                                        }}
                                                        afterPriceContent={
                                                            <UITarget targetId="sfcc.cart.shipping.deliveryEstimate" />
                                                        }
                                                    />
                                                )}
                                            </div>
                                            {(productItem.quantity ?? 1) > 1 && (
                                                <div className="text-right text-muted-foreground text-sm">
                                                    {formatCurrency(
                                                        (productItem.priceAfterItemDiscount ?? productItem.price ?? 0) /
                                                            (productItem.quantity ?? 1),
                                                        i18n.language,
                                                        currency
                                                    )}{' '}
                                                    each
                                                </div>
                                            )}
                                        </div>
                                        {showLineItemPromoBadge && (
                                            <ProductItemPromotions productItem={productItem} alignEnd />
                                        )}
                                    </div>

                                    <div className="flex shrink-0 justify-end">
                                        <CartQuantityPicker
                                            value={String(productItem.quantity)}
                                            itemId={productItem.itemId || ''}
                                            stockLevel={stockLevel}
                                            max={isBonusProduct ? maxBonusQuantity : undefined}
                                            disabled={isAutoBonusProduct}
                                        />
                                    </div>

                                    {lineItemExtraContent && (
                                        <div className="flex w-full min-w-0 shrink-0 justify-end">
                                            {lineItemExtraContent}
                                        </div>
                                    )}
                                </div>
                                {!isAutoBonusProduct && primaryAction && (
                                    <div className="min-w-0 md:col-start-1 md:row-start-2">
                                        <div data-testid="mobile-primary-action">{primaryAction(productItem)}</div>
                                    </div>
                                )}
                            </div>

                            {/* Inventory Message */}
                            {Boolean(productItem?.showInventoryMessage) && (
                                <div className="text-destructive font-semibold text-sm break-words">
                                    {productItem?.inventoryMessage as string}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Loading Spinner Overlay */}
                    {isItemFetcherLoading && (
                        <div
                            className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 pointer-events-none flex items-center justify-center"
                            data-testid={`sf-product-item-loading-${productItem.productId || productItem.id}`}>
                            <Spinner size="lg" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ProductItem;
