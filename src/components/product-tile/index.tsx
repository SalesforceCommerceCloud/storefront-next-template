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
import {
    type ComponentProps,
    forwardRef,
    memo,
    useState,
    useCallback,
    useMemo,
    useEffect,
    lazy,
    Suspense,
} from 'react';
import { Link } from '@/components/link';

import type { ShopperSearch } from '@/scapi';
import type { ComponentDesignMetadata } from '@salesforce/storefront-next-runtime/design/react';

import { cn } from '@/lib/utils';
import {
    createProductUrl,
    getDecoratedVariationAttributes,
    type DecoratedVariationAttributeValue,
} from '@/lib/product/product-utils';
import { getProductRating } from '@/lib/product/product-utils-plp';
import { isDesktopViewport, useProductTileContext } from './context';
import { DeferredWishlistButton } from './deferred-wishlist-button';
import { PickupIcon } from '@/components/icons';
import { QuickAddButton } from './quick-add-button';
import { ProductTileSwatchesSkeleton } from '@/components/category-skeleton';
import { Component } from '@/lib/decorators/component';
import { AttributeDefinition } from '@/lib/decorators/attribute-definition';
import { RegionDefinition } from '@/lib/decorators/region-definition';
import type { ComponentType } from '@/components/region';
import { ProductImageContainer } from '@/components/product-image';
import ProductPrice from '@/components/product-price';
import { StarRating } from '@/components/product-ratings/star-rating';
import { UITarget } from '@/targets/ui-target';
import { Card } from '@/components/ui/card';
import { loader as loaders } from './loaders';

const LazySwatches = lazy(() => import('./swatches').then((m) => ({ default: m.ProductTileSwatches })));

const PRODUCT_TILE_SELECTABLE_ATTRIBUTE_ID = 'color';
const PRODUCT_TILE_MAX_SWATCHES = 3;

/* v8 ignore start - do not test decorators in unit tests, decorator functionality is tested separately*/
@Component('productTile', {
    name: 'Product Tile',
    description: 'Configurable product tile with customizable styling for images, typography, and hover effects',
    group: 'Content',
})
@RegionDefinition([])
export class ProductTileMetadata {
    @AttributeDefinition({
        id: 'productId',
        name: 'Product',
        description: 'Select a product to render in this tile.',
        type: 'product',
    })
    productId?: string;

    @AttributeDefinition({
        id: 'objectFit',
        name: 'Image Object Fit',
        description: 'How the product image should fit within its container',
        type: 'enum',
        values: ['contain', 'cover', 'fill', 'none', 'scale-down'],
        defaultValue: 'contain',
    })
    objectFit?: string;

    @AttributeDefinition({
        id: 'borderRadius',
        name: 'Border Radius',
        description: 'Corner roundness of the tile card',
        type: 'enum',
        values: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'full'],
        defaultValue: 'xl',
    })
    borderRadius?: string;

    @AttributeDefinition({
        id: 'boxShadow',
        name: 'Box Shadow',
        description: 'Shadow effect for the tile card',
        type: 'enum',
        values: ['none', 'sm', 'md', 'lg', 'xl', '2xl'],
        defaultValue: 'sm',
    })
    boxShadow?: string;

    @AttributeDefinition({
        id: 'padding',
        name: 'Padding',
        description: 'Padding on all sides of the tile',
        type: 'enum',
        values: ['0', '2', '4', '6', '8'],
        defaultValue: '0',
    })
    padding?: string;

    @AttributeDefinition({
        id: 'margin',
        name: 'Margin',
        description: 'Margin on all sides of the tile',
        type: 'enum',
        values: ['0', '2', '4', '6', '8'],
        defaultValue: '0',
    })
    margin?: string;

    @AttributeDefinition({
        id: 'fontWeight',
        name: 'Font Weight',
        description: 'Weight of the product name text',
        type: 'enum',
        values: ['normal', 'medium', 'semibold', 'bold'],
        defaultValue: 'semibold',
    })
    fontWeight?: string;

    @AttributeDefinition({
        id: 'letterSpacing',
        name: 'Letter Spacing',
        description: 'Spacing between letters in product name',
        type: 'enum',
        values: ['tighter', 'tight', 'normal', 'wide', 'wider'],
        defaultValue: 'normal',
    })
    letterSpacing?: string;

    @AttributeDefinition({
        id: 'hoverEffect',
        name: 'Hover Effect',
        description: 'Interactive hover effect for the tile',
        type: 'enum',
        values: ['default', 'scale', 'shadow', 'lift'],
        defaultValue: 'default',
    })
    hoverEffect?: string;
}
/* v8 ignore stop */

const getPageDesignerStyleClasses = ({
    objectFit,
    borderRadius,
    boxShadow,
    padding,
    margin,
    fontWeight,
    letterSpacing,
    hoverEffect,
}: Partial<ProductTileProps>) => {
    const classes: string[] = [];

    if (objectFit) {
        const fitMap = {
            contain: '[&_img]:!object-contain',
            cover: '[&_img]:!object-cover',
            fill: '[&_img]:!object-fill',
            none: '[&_img]:!object-none',
            'scale-down': '[&_img]:!object-scale-down',
        };
        classes.push(fitMap[objectFit]);
    }

    if (borderRadius) {
        const radiusMap: Record<string, string> = {
            none: '!rounded-none',
            xs: '!rounded-xs',
            sm: '!rounded-sm',
            md: '!rounded-md',
            lg: '!rounded-lg',
            xl: '!rounded-xl',
            '2xl': '!rounded-2xl',
            '3xl': '!rounded-3xl',
            '4xl': '!rounded-4xl',
            full: '!rounded-full',
        };
        classes.push(radiusMap[borderRadius] || '!rounded-none');
    }

    if (boxShadow === 'none') {
        classes.push('!shadow-none hover:!shadow-none');
    } else if (boxShadow) {
        const shadowMap = {
            sm: '!shadow-sm hover:!shadow-sm',
            md: '!shadow-md hover:!shadow-md',
            lg: '!shadow-lg hover:!shadow-lg',
            xl: '!shadow-xl hover:!shadow-xl',
            '2xl': '!shadow-2xl hover:!shadow-2xl',
        };
        classes.push(shadowMap[boxShadow]);
    }

    if (padding && padding !== '0') {
        classes.push(`p-${padding}`);
    }

    if (margin && margin !== '0') {
        classes.push(`m-${margin}`);
    }

    if (fontWeight) {
        const weightMap = {
            normal: '[&_a]:!font-normal',
            medium: '[&_a]:!font-medium',
            semibold: '[&_a]:!font-semibold',
            bold: '[&_a]:!font-bold',
        };
        classes.push(weightMap[fontWeight]);
    }

    if (letterSpacing) {
        const spacingMap = {
            tighter: '[&_a]:!tracking-tighter',
            tight: '[&_a]:!tracking-tight',
            normal: '[&_a]:!tracking-normal',
            wide: '[&_a]:!tracking-wide',
            wider: '[&_a]:!tracking-wider',
        };
        classes.push(spacingMap[letterSpacing]);
    }

    if (hoverEffect && hoverEffect !== 'default') {
        const hoverMap = {
            scale: 'hover:!scale-105 !transition-transform !duration-200 hover:!shadow-md',
            shadow: 'hover:!shadow-xl !transition-shadow !duration-200',
            lift: 'hover:!-translate-y-1 hover:!shadow-lg !transition-all !duration-200',
        };
        classes.push(hoverMap[hoverEffect]);
    }

    return classes.join(' ');
};

export interface ProductTileProps extends ComponentProps<'div'> {
    product?: ShopperSearch.schemas['ProductSearchHit'];
    productId?: string;
    maxSwatches?: number;
    handleProductClick?: (product: ShopperSearch.schemas['ProductSearchHit']) => void;
    /** For variant products, filter swatches to only show this variant's color value */
    selectedVariantColorValue?: string | null;
    /** Image aspect ratio (width/height). If provided, calculates height based on viewport width. Defaults to 1 (square) */
    imgAspectRatio?: number;
    /** Show the pickup available indicator icon with tooltip */
    showPickupAvailable?: boolean;
    /** Custom quick add button label */
    quickAddLabel?: string;
    /** Top-level navigation category name shown below swatches (e.g. "Men", "Women") */
    topCategoryName?: string;
    /** Accepted for API compatibility; has no effect */
    showNavigationArrows?: boolean;

    // Page Designer styling props
    objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
    borderRadius?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
    boxShadow?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    padding?: '0' | '2' | '4' | '6' | '8';
    margin?: '0' | '2' | '4' | '6' | '8';
    fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
    letterSpacing?: 'tighter' | 'tight' | 'normal' | 'wide' | 'wider';
    hoverEffect?: 'default' | 'scale' | 'shadow' | 'lift';

    // Page Designer system props (need to be filtered)
    regionId?: string;
    component?: ComponentType;
    componentData?: Record<string, Promise<unknown>>;
    designMetadata?: ComponentDesignMetadata;
    data?: unknown;
}

const ProductTile = memo(
    forwardRef<HTMLDivElement, ProductTileProps>(
        (
            {
                className,
                product: productProp,
                productId: _productId,
                maxSwatches = PRODUCT_TILE_MAX_SWATCHES,
                selectedVariantColorValue,
                handleProductClick,
                imgAspectRatio,
                showPickupAvailable = false,
                quickAddLabel,
                topCategoryName,
                showNavigationArrows: _showNavigationArrows,
                // Page Designer styling props
                objectFit,
                borderRadius,
                boxShadow,
                padding,
                margin,
                fontWeight,
                letterSpacing,
                hoverEffect,
                // Page Designer system props (filter out)
                regionId: _regionId,
                component: _component,
                componentData: _componentData,
                designMetadata: _designMetadata,
                data,
                ...props
            },
            ref
        ) => {
            // Prioritize loader data (Page Designer) over prop (programmatic use)
            const product = (data as ShopperSearch.schemas['ProductSearchHit'] | undefined) || productProp;

            const { config, t, currency, getBadges } = useProductTileContext();

            const productData = useMemo(() => {
                if (!product) return null;
                return {
                    badges: getBadges(product),
                    rating: getProductRating(product),
                };
            }, [product, getBadges]);

            const effectiveImgAspectRatio =
                imgAspectRatio ?? config.global.productListing.defaultProductTileImgAspectRatio;

            const isMasterProd = !!product?.variants;
            const isBundleOrSet = product?.productType?.bundle || product?.productType?.set;
            const representedVariant = isMasterProd
                ? product?.variants?.find((variant) => variant?.productId === product?.representedProduct?.id)
                : undefined;
            const defaultVariantPid = isMasterProd && !isBundleOrSet ? (product?.representedProduct?.id ?? null) : null;

            // use the representedVariant values to get a product for PDP
            const initialVariationValue =
                selectedVariantColorValue !== undefined && selectedVariantColorValue !== null
                    ? selectedVariantColorValue
                    : (representedVariant?.variationValues?.[PRODUCT_TILE_SELECTABLE_ATTRIBUTE_ID] ?? undefined);

            // Local swatch selection state — drives image switching and selected ring on swatches.
            // Initialized from the URL-driven prop; updates when the user clicks a swatch on the tile.
            const [selectedAttributeValue, setSelectedAttributeValue] = useState<string | null>(
                initialVariationValue || null
            );

            useEffect(() => {
                if (selectedVariantColorValue !== undefined && selectedVariantColorValue !== null) {
                    setSelectedAttributeValue(selectedVariantColorValue);
                }
            }, [selectedVariantColorValue]);

            // Pre-seed every quick-add swatch from the tile's represented variant, with the
            // locally-selected color overriding the represented variant's color when set.
            const initialVariantSelections = useMemo<Record<string, string> | undefined>(() => {
                const representedVariantSelections: Record<string, string> = {
                    ...(representedVariant?.variationValues ?? {}),
                };
                if (selectedAttributeValue) {
                    representedVariantSelections[PRODUCT_TILE_SELECTABLE_ATTRIBUTE_ID] = selectedAttributeValue;
                }
                return Object.keys(representedVariantSelections).length > 0 ? representedVariantSelections : undefined;
            }, [representedVariant, selectedAttributeValue]);

            const variationAttributes = useMemo(
                () => (product ? getDecoratedVariationAttributes(product) : []),
                [product]
            );
            const colorAttributes = variationAttributes.filter(({ id }) => PRODUCT_TILE_SELECTABLE_ATTRIBUTE_ID === id);
            const colorValues = (colorAttributes[0]?.values?.slice(0, maxSwatches) ??
                []) as DecoratedVariationAttributeValue[];

            const handleSwatchHover = useCallback(
                (value: string) => {
                    // Read the viewport at hover time rather than subscribing during render: swatch hover is desktop-only,
                    // and a render-time media query would mismatch SSR and force a post-hydration re-render of every tile.
                    if (isDesktopViewport()) {
                        setSelectedAttributeValue(value);
                    }
                },
                [setSelectedAttributeValue]
            );
            const handleClick = useCallback(() => {
                product && handleProductClick?.(product);
            }, [handleProductClick, product]);

            const productUrl = createProductUrl(product?.productId ?? '', null, 'color', defaultVariantPid);
            const productName = product?.productName ?? '';

            const pageDesignerStyles = getPageDesignerStyleClasses({
                objectFit,
                borderRadius,
                boxShadow,
                padding,
                margin,
                fontWeight,
                letterSpacing,
                hoverEffect,
            });

            if (!product) {
                return (
                    <Card
                        ref={ref}
                        className={cn(
                            'product-card group w-full min-w-0 max-w-full overflow-hidden gap-0 py-0',
                            pageDesignerStyles,
                            className
                        )}
                        {...props}>
                        <div className="p-4 text-sm text-muted-foreground">{t('selectProduct')}</div>
                    </Card>
                );
            }

            return (
                <Card
                    ref={ref}
                    className={cn(
                        'product-card group w-full min-w-0 max-w-full cursor-pointer overflow-hidden gap-0 py-0',
                        pageDesignerStyles,
                        className
                    )}
                    {...props}>
                    {/* Image area */}
                    <div className="product-image relative">
                        <div className="relative w-full overflow-hidden">
                            <ProductImageContainer
                                product={product}
                                selectedColorValue={
                                    PRODUCT_TILE_SELECTABLE_ATTRIBUTE_ID === 'color' ? selectedAttributeValue : null
                                }
                                imgAspectRatio={effectiveImgAspectRatio}
                                className="w-full aspect-square [&_img]:object-cover! [&_img]:h-full! [&_img]:max-w-full! [&_img]:mx-auto!"
                                handleProductClick={handleProductClick}
                            />
                            <UITarget targetId="sfcc.plp.shipping.deliveryEstimate" />

                            {/* Clickable product link overlay */}
                            <Link
                                to={productUrl}
                                className="absolute inset-0 z-[1] cursor-pointer"
                                aria-label={`View ${productName}`}
                                onClick={handleClick}
                                tabIndex={-1}
                            />

                            {/* Badges — top-left */}
                            {productData?.badges.hasBadges && (
                                <div className="absolute top-2 left-2 flex flex-col items-start gap-1 z-20">
                                    {productData.badges.badges.map((badge) => (
                                        <span
                                            key={badge.label}
                                            data-slot="badge"
                                            className="px-2 py-1 text-xs font-semibold uppercase inline-block bg-foreground text-background leading-none rounded-ui">
                                            {badge.label}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Action icons — top-right */}
                            <div className="absolute top-2 right-2 flex flex-col items-end gap-2 z-20">
                                {showPickupAvailable && (
                                    <div>
                                        <div className="group/pickup relative" data-testid="pickup-available-indicator">
                                            <div className="w-9 h-9 p-2 bg-muted text-muted-foreground flex items-center justify-center">
                                                <PickupIcon className="w-4 h-4" />
                                            </div>
                                            <div className="absolute right-0 top-full mt-1 z-50 opacity-0 group-hover/pickup:opacity-100 transition-opacity duration-200 pointer-events-none">
                                                <div className="bg-foreground text-background text-xs font-medium px-2 py-1 whitespace-nowrap shadow-lg">
                                                    {t('pickupAvailable')}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <DeferredWishlistButton
                                        product={product}
                                        surface="plp"
                                        size="sm"
                                        tabIndex={-1}
                                        className="relative top-auto right-auto z-20 bg-muted hover:bg-background shadow-sm border-0"
                                    />
                                </div>
                            </div>

                            {/* Hover overlay — subtle dark tint */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-opacity duration-300 pointer-events-none" />

                            {/* Quick Add button */}
                            <div className="absolute bottom-4 left-0 right-0 px-4 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 z-20">
                                <QuickAddButton
                                    productId={product.productId ?? ''}
                                    productName={productName}
                                    selectedColorValue={selectedAttributeValue}
                                    initialVariantSelections={initialVariantSelections}
                                    label={quickAddLabel ?? t('quickAdd')}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Info section */}
                    <div className="relative p-4">
                        {/* Color swatches */}
                        {colorValues.length > 0 && (
                            <div>
                                <Suspense fallback={<ProductTileSwatchesSkeleton count={maxSwatches} />}>
                                    <LazySwatches
                                        colorValues={colorValues}
                                        selectedAttributeValue={selectedAttributeValue}
                                        onSwatchHover={handleSwatchHover}
                                        onSwatchClick={handleClick}
                                        productName={productName}
                                        totalColorCount={colorAttributes[0]?.values?.length ?? colorValues.length}
                                        maxSwatches={maxSwatches}
                                        productHref={productUrl}
                                    />
                                </Suspense>
                            </div>
                        )}

                        {/* Store name */}
                        <p className="text-sm font-normal leading-none text-muted-foreground mb-1">
                            {config.global.branding.name}
                        </p>

                        {/* Top category */}
                        {topCategoryName && (
                            <p className="text-sm font-normal leading-none text-muted-foreground mb-1">
                                {topCategoryName}
                            </p>
                        )}

                        {/* Product name — the single keyboard/SR tab stop for this tile */}
                        <h3 className="text-lg font-semibold leading-[120%] tracking-[-0.45px] text-card-foreground mb-2">
                            <Link
                                to={productUrl}
                                className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                                onClick={handleClick}>
                                {productName}
                            </Link>
                        </h3>

                        {/* SKU */}
                        {product.productId && (
                            <p
                                className="text-sm font-normal leading-none text-muted-foreground mb-1"
                                data-testid="product-tile-sku">
                                {t('sku')} {product.productId}
                            </p>
                        )}

                        {/* Star ratings */}
                        <div className="mb-2">
                            <StarRating
                                rating={productData?.rating.rating ?? 0}
                                reviewCount={productData?.rating.reviewCount ?? 0}
                                starSize="sm"
                                starClassName="text-foreground"
                                showRatingLink
                                ratingLinkTemplate="({count})"
                                ratingLinkClassName="text-xs text-muted-foreground"
                            />
                        </div>
                        <UITarget targetId="sfcc.productCard.reviews.rating" />

                        {/* Price */}
                        <div>
                            <ProductPrice
                                type="unit"
                                product={product}
                                currency={currency ?? config.commerce.sites?.[0]?.defaultCurrency ?? ''}
                                labelForA11y={(product?.productName ?? product?.productId) || ''}
                                currentPriceProps={{
                                    className:
                                        'text-lg font-semibold leading-[120%] tracking-[-0.45px] text-card-foreground',
                                }}
                                listPriceProps={{
                                    className: 'text-muted-foreground text-sm leading-none line-through',
                                }}
                                promoCalloutProps={{
                                    className: 'text-xs text-active-foreground mt-1',
                                }}
                                className="text-sm"
                            />
                        </div>
                        <UITarget targetId="sfcc.productCard.loyalty.points" />
                        <UITarget targetId="sfcc.productCard.bnpl.message" />
                    </div>
                </Card>
            );
        }
    )
);

ProductTile.displayName = 'ProductTile';

// eslint-disable-next-line react-refresh/only-export-components
export const loader = loaders.server;
export { ProductTile };
// eslint-disable-next-line react-refresh/only-export-components
export { ProductTileProvider, useProductTileContext } from './context';
export default ProductTile;
