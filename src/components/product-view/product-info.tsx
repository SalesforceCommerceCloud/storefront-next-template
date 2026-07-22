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

import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import type { ShopperProducts } from '@/scapi';
import ProductQuantityPicker from '@/components/product-quantity-picker';
import { SwatchGroup, Swatch } from '@/components/swatch-group';
import { useVariationAttributes } from '@/hooks/product/use-variation-attributes';
import { useOptionalProductView } from '@/providers/product-view';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { toImageUrl } from '@/lib/images/dynamic-image';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import ProductPrice from '../product-price';
import { isProductSet, isProductBundle } from '@/lib/product/product-utils';
import InventoryMessage, { InventoryStatus } from '../inventory-message';
// @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
import { ProductRatingSummary } from './product-rating-summary';
// @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
import { useCurrentVariant } from '@/hooks/product/use-current-variant';
import { useTranslation } from 'react-i18next';
import { WishlistButton } from '@/components/buttons/wishlist-button';
import { ShareButton } from '@/components/buttons/share-button';
import { UITarget } from '@/targets/ui-target';
// @sfdc-extension-line SFDC_EXT_BOPIS
import DeliveryOptions from '@/extensions/bopis/components/delivery-options/delivery-options';

type ProductInfoBaseProps = {
    product: ShopperProducts.schemas['Product'];
    hideVariantSelection?: boolean;
    /** Layout style: 'full' (default) shows title, description, inventory; 'compact' shows brand, smaller title, sorted attributes */
    variantStyle?: 'full' | 'compact';
    /** When true and mode is 'edit', show quantity picker (e.g. in cart edit modal) */
    showQuantityInEditMode?: boolean;
    /** Optional current variant from parent orchestration (used by controlled modal flows) */
    currentVariantOverride?: ShopperProducts.schemas['Variant'];
    /** Whether selected variant inventory is currently being fetched */
    isVariantInventoryLoading?: boolean;
    /** Hide top-right action icons (wishlist/share) */
    hideActionIcons?: boolean;
    /** Optional action content rendered inline with title in full variant style */
    headerAction?: ReactNode;
    // @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
    /** Disable rating summary interactions (hover popover and review links) */
    disableRatingInteraction?: boolean;
    // @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
};
type ProductInfoUncontrolledProps = ProductInfoBaseProps & {
    /** Mode for swatch interaction: 'uncontrolled' uses URL navigation */
    swatchMode?: 'uncontrolled';
    onAttributeChange?: never;
    variationValues?: never;
};
type ProductInfoControlledProps = ProductInfoBaseProps & {
    /** Mode for swatch interaction: 'controlled' uses callback */
    swatchMode: 'controlled';
    /** Callback when variant attribute changes in controlled mode */
    onAttributeChange: (attributeId: string, value: string) => void;
    /** Controlled variation values for controlled mode (e.g., {color: 'red', size: 'M'}) */
    variationValues: { [key: string]: string };
};
type ProductInfoProps = ProductInfoUncontrolledProps | ProductInfoControlledProps;

const isControlledVariantValueOrderable = ({
    variants,
    currentSelection,
    attributeId,
    attributeValue,
}: {
    variants: ShopperProducts.schemas['Variant'][] | undefined;
    currentSelection: Record<string, string>;
    attributeId: string;
    attributeValue: string;
}): boolean => {
    if (!variants || variants.length === 0) {
        return true;
    }

    const nextSelection = {
        ...currentSelection,
        [attributeId]: attributeValue,
    };

    return variants
        .filter((variant) =>
            Object.entries(nextSelection).every(([key, value]) => variant.variationValues?.[key] === value)
        )
        .some((variant) => variant.orderable);
};

/**
 * ProductInfo component displays product details including title, description, price, variants, and quantity picker
 *
 * Supports two swatch modes:
 * - uncontrolled mode (default): Swatches use URL navigation for variant selection
 * - controlled mode: Swatches use callbacks for controlled variant selection (used in modals)
 *
 * @param props - Component props
 * @param props.product - The product data to display
 * @param props.swatchMode - Swatch interaction mode ('uncontrolled' or 'controlled')
 * @param props.onAttributeChange - Callback for controlled mode variant changes
 * @param props.variationValues - Controlled variation values for controlled mode
 * @returns JSX element with product information display
 */
export default function ProductInfo({
    product,
    swatchMode = 'uncontrolled',
    onAttributeChange,
    variationValues,
    hideVariantSelection = false,
    variantStyle = 'full',
    showQuantityInEditMode = false,
    currentVariantOverride,
    isVariantInventoryLoading = false,
    hideActionIcons = false,
    headerAction,
    // @sfdc-extension-line SFDC_EXT_RATINGS_REVIEWS
    disableRatingInteraction = false,
}: ProductInfoProps): ReactElement {
    const config = useConfig();
    const isProductASet = isProductSet(product);
    const isProductABundle = isProductBundle(product);
    // Use variation attributes hook for URL-aware swatches
    const variationAttributes = useVariationAttributes({ product });
    const urlCurrentVariant = useCurrentVariant({ product });
    const controlledCurrentVariant = useMemo(() => {
        if (swatchMode !== 'controlled') return undefined;
        if (!variationValues) return undefined;

        const potentialVariants =
            product.variants?.filter((variant) =>
                Object.keys(variationValues).every((key) => variant.variationValues?.[key] === variationValues[key])
            ) ?? [];
        return potentialVariants.length === 1 ? potentialVariants[0] : undefined;
    }, [swatchMode, product.variants, variationValues]);
    // For controlled modal flows, prefer explicit override (can include fetched inventory),
    // then controlled selection, then URL-based variant as fallback.
    const currentVariant = currentVariantOverride || controlledCurrentVariant || urlCurrentVariant;
    const productForPrice = useMemo(() => {
        if (!currentVariant) return product;
        // Build a variant-like product shape so ProductPrice does not treat it as master range pricing.
        return {
            ...product,
            ...currentVariant,
            type: { ...(product.type ?? {}), master: false, variant: true },
            variants: undefined,
        } as ShopperProducts.schemas['Product'];
    }, [product, currentVariant]);
    const productForDeliveryOptions = useMemo(() => {
        if (!currentVariant) return product;
        const variantWithInventory = currentVariant as ShopperProducts.schemas['Variant'] & {
            inventory?: ShopperProducts.schemas['Inventory'];
            inventories?: ShopperProducts.schemas['Inventory'][];
        };
        // Preserve the master id for pickup-context bookkeeping while hydrating
        // delivery checks with selected variant inventory.
        return {
            ...product,
            inventory: variantWithInventory.inventory ?? product.inventory,
            inventories: variantWithInventory.inventories ?? product.inventories,
        };
    }, [product, currentVariant]);
    // Get currency from context (automatically derived from locale)
    const { currency } = useSite();
    const productView = useOptionalProductView();
    const [standaloneQuantity, setStandaloneQuantity] = useState(1);
    const quantity = productView?.quantity ?? standaloneQuantity;
    const isOutOfStock = productView?.isOutOfStock ?? product.inventory?.orderable === false;
    const stockLevel = productView?.stockLevel ?? product.inventory?.ats;
    const maxQuantity = productView?.maxQuantity;
    const setQuantity = productView?.setQuantity ?? setStandaloneQuantity;
    const mode = productView?.mode ?? 'add';
    // @sfdc-extension-line SFDC_EXT_BOPIS
    const basketPickupStore = productView?.basketPickupStore;

    const { t } = useTranslation('product');

    const isCompactStyle = variantStyle === 'compact';
    const showQuantity = !isProductASet && !isProductABundle && (mode !== 'edit' || showQuantityInEditMode);

    // In compact mode, sort variation attributes by priority order
    const COMPACT_ATTRIBUTE_ORDER = ['size', 'color'];
    const sortedVariationAttributes = isCompactStyle
        ? [...variationAttributes].sort((a, b) => {
              const aIndex = COMPACT_ATTRIBUTE_ORDER.indexOf(a.id);
              const bIndex = COMPACT_ATTRIBUTE_ORDER.indexOf(b.id);
              // Attributes not in the list sort to the end, preserving original order
              const aPriority = aIndex === -1 ? COMPACT_ATTRIBUTE_ORDER.length : aIndex;
              const bPriority = bIndex === -1 ? COMPACT_ATTRIBUTE_ORDER.length : bIndex;
              return aPriority - bPriority;
          })
        : variationAttributes;
    const selectedVariationValues = useMemo(() => {
        if (swatchMode === 'controlled') {
            return variationValues ?? {};
        }
        return variationAttributes.reduce<Record<string, string>>((acc, attribute) => {
            const selectedValue = attribute.selectedValue?.value;
            if (selectedValue) {
                acc[attribute.id] = selectedValue;
            }
            return acc;
        }, {});
    }, [swatchMode, variationValues, variationAttributes]);
    const shouldHideInventoryForPartialVariantSelection = useMemo(() => {
        const variants = product.variants ?? [];
        const variationAttributeCount = product.variationAttributes?.length ?? 0;
        if (variants.length === 0 || variationAttributeCount <= 1) {
            return false;
        }

        const potentialVariants = variants.filter((variant) =>
            Object.entries(selectedVariationValues).every(([key, value]) => variant.variationValues?.[key] === value)
        );

        // Keep inventory hidden until the shopper narrows selection down to a single variant.
        return potentialVariants.length !== 1;
    }, [product.variants, product.variationAttributes?.length, selectedVariationValues]);
    const inventoryStatusOverride = useMemo(() => {
        if (!isVariantInventoryLoading && !shouldHideInventoryForPartialVariantSelection) {
            return undefined;
        }
        return (
            inventoryProduct: ShopperProducts.schemas['Product'],
            inventoryVariant?: ShopperProducts.schemas['Variant'] | null
        ) => {
            if (shouldHideInventoryForPartialVariantSelection) {
                return InventoryStatus.UNKNOWN;
            }
            const hasVariants = (inventoryProduct.variants?.length ?? 0) > 0;
            const missingVariantInventory =
                (
                    inventoryVariant as
                        | (ShopperProducts.schemas['Variant'] & {
                              inventory?: ShopperProducts.schemas['Inventory'];
                          })
                        | null
                )?.inventory == null;
            // During quick-add variant fetch, hide transient inventory message
            // until selected variant inventory is available.
            if (hasVariants && missingVariantInventory) {
                return InventoryStatus.UNKNOWN;
            }
            return InventoryStatus.IN_STOCK;
        };
    }, [isVariantInventoryLoading, shouldHideInventoryForPartialVariantSelection]);

    return (
        <div className="relative grid gap-4">
            {/* Action icons — top-right */}
            {!isCompactStyle && !hideActionIcons && (
                <div className="absolute top-0 right-0 flex items-center gap-2 z-10">
                    <WishlistButton
                        product={{
                            productId: product.id,
                            productName: product.name,
                            price: product.price,
                            image: product.imageGroups?.[0]?.images?.[0],
                        }}
                        surface="pdp"
                        size="sm"
                        className="!static border border-border bg-background/90 hover:border-muted-foreground/50 hover:bg-background"
                    />
                    <ShareButton
                        product={product}
                        size="sm"
                        className="!static border border-border bg-background/90 hover:bg-background hover:border-muted-foreground/50 [&_svg]:stroke-[2]"
                    />
                </div>
            )}

            {/* Compact style: brand (uppercase) then product name */}
            {isCompactStyle && (
                <>
                    {product.brand && (
                        <p className="text-xs font-normal leading-none uppercase tracking-wide text-secondary-foreground">
                            {product.brand}
                        </p>
                    )}
                    <h2 className="text-3xl font-bold text-card-foreground tracking-tight">{product.name}</h2>
                </>
            )}

            {/* Product Title, SKU, Description */}
            {!isCompactStyle && (
                <div className="flex items-start justify-between gap-4">
                    <div className={`${hideActionIcons ? '' : 'pr-20'} min-w-0`}>
                        {product.brand && (
                            <p className="mb-1 text-xs font-normal leading-none uppercase tracking-wide text-secondary-foreground">
                                {product.brand}
                            </p>
                        )}
                        <h1
                            data-testid="product-title"
                            className="text-3xl font-bold text-card-foreground tracking-tight">
                            {product.name}
                        </h1>
                        {product.id && (
                            <p className="mt-2 text-xs leading-none text-secondary-foreground">
                                {t('sku')} {product.id}
                            </p>
                        )}
                        {product.shortDescription && (
                            <p className="mt-2 text-base font-normal leading-6 text-accent-foreground">
                                {product.shortDescription}
                            </p>
                        )}
                    </div>
                    {headerAction ? <div className="pt-1 shrink-0">{headerAction}</div> : null}
                </div>
            )}
            {/* Rating summary - visible on both mobile and desktop */}
            {/* @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS */}
            {!isCompactStyle && (
                <UITarget targetId="sfcc.pdp.reviews.rating">
                    <ProductRatingSummary interactive={!disableRatingInteraction} />
                </UITarget>
            )}
            {/* @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS */}

            {/* Price - show unit price on PDP */}
            <div className="space-y-3">
                <ProductPrice
                    type="unit"
                    product={productForPrice}
                    quantity={quantity}
                    currency={currency}
                    // Match the purchasability gate: bonus/promo products (allowMissingPrice) render
                    // their price instead of "Price unavailable".
                    allowMissingPrice={productView?.allowMissingPrice}
                    labelForA11y={product?.name}
                    currentPriceProps={{
                        className: 'text-2xl font-bold text-card-foreground leading-[120%] tracking-[-0.6px]',
                    }}
                    promoCalloutProps={{
                        className: 'text-sm [&_span]:mx-0 [&_span]:text-status-positive',
                    }}
                    hidePromo={isCompactStyle}
                    currentPriceOnly={isCompactStyle}
                />
            </div>

            {/* Inventory Status Message - hidden in compact/edit mode */}
            {!isCompactStyle && (
                <UITarget targetId="sfcc.pdp.shipping.deliveryEstimate">
                    <InventoryMessage
                        product={product}
                        currentVariant={currentVariant}
                        lowStockThreshold={config.global.inventory.lowStockThreshold}
                        getInventoryStatus={inventoryStatusOverride}
                    />
                </UITarget>
            )}
            {!isCompactStyle && <UITarget targetId="sfcc.pdp.loyalty.points" />}

            {/* Swatch Groups for Product Variations */}
            {sortedVariationAttributes.map(({ id, name, selectedValue, values }) => {
                // In controlled mode, derive display name from variationValues state
                const controlledValue = variationValues?.[id];
                const controlledDisplayName = controlledValue
                    ? values.find((v) => v.value === controlledValue)?.name || ''
                    : '';

                // When hideVariantSelection is true, only show the selected swatch (read-only)
                const swatchesToShow = hideVariantSelection
                    ? values.filter((v) => v.value === selectedValue?.value)
                    : values;

                const swatches = swatchesToShow.map((value) => {
                    const { href, name: valueName, image, value: swatchValue, orderable } = value;
                    const isOrderableInCurrentSelection =
                        swatchMode === 'controlled'
                            ? isControlledVariantValueOrderable({
                                  variants: product.variants,
                                  currentSelection: variationValues ?? {},
                                  attributeId: id,
                                  attributeValue: swatchValue,
                              })
                            : (orderable ?? true);
                    const swatchImageUrl = (image && toImageUrl({ image, config })) || '';
                    const content = image ? (
                        <>
                            <span
                                data-slot="swatch-dot"
                                className="bg-cover bg-center bg-no-repeat"
                                style={{
                                    width: 'var(--swatch-color-dot, 100%)',
                                    height: 'var(--swatch-color-dot, 100%)',
                                    backgroundColor: valueName?.toLowerCase(),
                                    backgroundImage: swatchImageUrl ? `url(${swatchImageUrl})` : undefined,
                                    border: 'var(--swatch-color-dot-border, none)',
                                }}
                                aria-label={image.alt || valueName}
                            />
                            <span
                                data-slot="swatch-text"
                                className="text-xs font-medium capitalize ml-1"
                                style={{ display: 'var(--swatch-color-label)' }}>
                                {valueName}
                            </span>
                        </>
                    ) : (
                        <span className="text-xs font-medium">{valueName}</span>
                    );

                    return (
                        <Swatch
                            key={swatchValue}
                            href={swatchMode === 'uncontrolled' ? href : undefined}
                            // Disable when not orderable (out of stock)
                            disabled={!isOrderableInCurrentSelection}
                            value={swatchValue}
                            name={valueName}
                            shape={id === 'color' ? 'color' : 'label'}
                            labeled
                            outOfStockSuffix={t('outOfStockSuffix')}>
                            {content}
                        </Swatch>
                    );
                });
                return (
                    <SwatchGroup
                        key={id}
                        value={swatchMode === 'uncontrolled' ? selectedValue?.value : controlledValue}
                        displayName={swatchMode === 'controlled' ? controlledDisplayName : selectedValue?.name || ''}
                        label={name}
                        handleChange={
                            // Disable handleChange when hideVariantSelection is true
                            hideVariantSelection
                                ? undefined
                                : swatchMode === 'controlled'
                                  ? (value) => onAttributeChange?.(id, value)
                                  : undefined
                        }>
                        {swatches}
                    </SwatchGroup>
                );
            })}
            {!isCompactStyle && <UITarget targetId="sfcc.pdp.products.visualization" />}

            {/* @sfdc-extension-block-start SFDC_EXT_BOPIS */}
            {/* Delivery Options - For individual products */}
            {/* Hide for non-pickup items when opened from cart page */}
            {!isOutOfStock && (mode !== 'edit' || basketPickupStore) && !(isProductABundle || isProductASet) && (
                <DeliveryOptions
                    product={productForDeliveryOptions}
                    quantity={quantity}
                    basketPickupStore={basketPickupStore}
                    className="mt-6"
                />
            )}
            {/* @sfdc-extension-block-end SFDC_EXT_BOPIS */}

            {/* Quantity Selector - for non-set/bundle when not edit mode, or when showQuantityInEditMode in edit mode */}
            {showQuantity && (
                <ProductQuantityPicker
                    value={quantity.toString()}
                    onChange={setQuantity}
                    stockLevel={stockLevel}
                    isOutOfStock={isOutOfStock}
                    productName={product.name}
                    maxQuantity={maxQuantity}
                />
            )}

            {/* Product Bundle/Set Notice */}
            {(isProductASet || isProductABundle) && (
                <div className="rounded-ui bg-primary/10 border border-primary p-4">
                    <p className="text-sm text-primary">
                        {isProductASet ? t('productSetNotice') : t('productBundleNotice')}
                    </p>
                </div>
            )}
        </div>
    );
}
