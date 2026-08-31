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

import { type ReactElement, type ReactNode, useMemo, useRef, useState } from 'react';
import type { ShopperProducts } from '@/scapi';
import ProductQuantityPicker from '@/components/product-quantity-picker';
import { SwatchGroup, Swatch, GroupedSwatchGroup, splitGroupedSwatchName } from '@/components/swatch-group';
import { uiConfig } from '@/lib/config.ui';
import { useVariationAttributes } from '@/hooks/product/use-variation-attributes';
import { useOptionalProductView } from '@/providers/product-view';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { toImageUrl } from '@/lib/images/dynamic-image';
import { DynamicImage } from '@/components/dynamic-image';
import CollapsibleSection from '@/components/collapsible-section';
import { SwatchSectionSummary } from '@/components/product-view/swatch-section-summary';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import ProductPrice from '../product-price';
import { isProductSet, isProductBundle } from '@/lib/product/product-utils';
import { getInventoryForResolvedSelection, hasDeferredAvailability } from '@/lib/product/inventory-utils';
import InventoryMessage, { InventoryStatus } from '../inventory-message';
// @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
import { ProductRatingSummary } from './product-rating-summary';
// @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
import { useCurrentVariant } from '@/hooks/product/use-current-variant';
import { useTranslation } from 'react-i18next';
import { WishlistButton } from '@/components/buttons/wishlist-button';
import { ShareButton } from '@/components/buttons/share-button';
import { UITarget } from '@/targets/ui-target';
import DeliveryOptions from '@/components/fulfillment/delivery-options';

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
    /** Optional content rendered directly below the variation-attribute selectors (before delivery/quantity). */
    afterVariations?: ReactNode;
    /** Suppress the built-in delivery-options block (e.g. when a vertical renders its own grouped fulfillment section). */
    hideDeliveryOptions?: boolean;
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
    /** Allow the primary PDP fulfillment picker to host delivery-estimate presentation. */
    enableDeliveryEstimatePresentation?: boolean;
    // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    /** Show the quantity picker (default true). Set false to render quantity elsewhere (e.g. inline with Add-to-Cart). */
    showQuantityPicker?: boolean;
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
    afterVariations,
    hideDeliveryOptions = false,
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // @sfdc-extension-line SFDC_EXT_SHIPPING_DELIVERY
    enableDeliveryEstimatePresentation = false,
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    showQuantityPicker = true,
    // @sfdc-extension-line SFDC_EXT_RATINGS_REVIEWS
    disableRatingInteraction = false,
}: ProductInfoProps): ReactElement {
    const config = useConfig();
    // Axes that render as a grouped/tabbed (categorized) swatch selector. Gated per-vertical via the
    // @/lib/config.ui seam (undefined ⇒ no axis grouped ⇒ every axis renders as today).
    const groupedSwatchAxes = uiConfig.pages.product.groupedSwatchAxes ?? [];
    // Axes whose image swatches render as larger "option cards" (thumb + name + price in one bordered
    // card). Same @/lib/config.ui seam (undefined ⇒ no axis ⇒ compact image tiles as today).
    const imageCardAxes = uiConfig.pages.product.imageCardAxes ?? [];
    // When true, each swatch section is wrapped in a <CollapsibleSection> whose summary shows the
    // selected value's thumbnail + label + name; the section collapses after a value is selected.
    const collapsibleSwatchSections = uiConfig.pages.product.collapsibleSwatchSections ?? false;
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
        if (isVariantInventoryLoading) return { ...product, inventories: undefined };
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
    }, [product, currentVariant, isVariantInventoryLoading]);
    const inventoryForResolvedSelection = getInventoryForResolvedSelection(product, currentVariant);
    const deliveryAvailabilityIsUnknown =
        inventoryForResolvedSelection == null ||
        (typeof inventoryForResolvedSelection.ats !== 'number' && inventoryForResolvedSelection.orderable !== false);
    const hasDeferredAvailabilityForSelection = hasDeferredAvailability(inventoryForResolvedSelection);
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
    const showFulfillmentOptions = mode !== 'edit';

    const { t } = useTranslation('product');

    // Armed when the shopper picks a swatch value in controlled mode. In collapsible-swatch mode a
    // selection remounts the section collapsed (via a changed key), so the just-clicked swatch leaves
    // the DOM; this lets the remounted CollapsibleSection restore focus to its summary instead of
    // dropping focus to <body>. (Uncontrolled/URL mode navigates, so route-level focus handling applies
    // and this stays false.)
    const swatchInteractionRef = useRef(false);
    const selectAttribute = (attributeId: string, value: string) => {
        swatchInteractionRef.current = true;
        onAttributeChange?.(attributeId, value);
    };

    const isCompactStyle = variantStyle === 'compact';
    const showQuantity =
        showQuantityPicker && !isProductASet && !isProductABundle && (mode !== 'edit' || showQuantityInEditMode);

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
                    <div className={`${hideActionIcons ? '' : 'sm:pr-20'} min-w-0`}>
                        {product.brand && (
                            <p className="mb-1 text-xs font-normal leading-none uppercase tracking-wide text-secondary-foreground">
                                {product.brand}
                            </p>
                        )}
                        <h1
                            data-testid="product-title"
                            className="text-3xl font-bold text-card-foreground tracking-tight break-words">
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

            {/* Action icons — top-right, after title in DOM for correct focus order */}
            {!isCompactStyle && !hideActionIcons && (
                <div className="sm:absolute sm:top-0 sm:right-0 flex items-center gap-2 z-10">
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
            {(() => {
                // Furniture groups its collapsible swatch cards in a spaced container
                // (data-slot="swatch-container", space-y-3); other verticals render the sections inline
                // (direct grid children) exactly as before — no wrapper is emitted for them.
                const swatchSections = sortedVariationAttributes.map(({ id, name, selectedValue, values }) => {
                    // In controlled mode, derive display name from variationValues state
                    const controlledValue = variationValues?.[id];
                    const controlledDisplayName = controlledValue
                        ? values.find((v) => v.value === controlledValue)?.name || ''
                        : '';

                    // Optional per-section collapsible (furniture): wrap a rendered swatch section in a
                    // CollapsibleSection whose summary shows the selected value's thumbnail + attribute label
                    // + name. The `key` includes the selected value so a selection change REMOUNTS the section
                    // collapsed (`defaultOpen={!selectedValueId}`) — i.e. it collapses to the summary after a
                    // value is picked, with no controlled-open plumbing. Disabled ⇒ the section renders as today.
                    const shouldCollapse = collapsibleSwatchSections && !hideVariantSelection;
                    const selectedValueId = swatchMode === 'uncontrolled' ? selectedValue?.value : controlledValue;
                    const selectedObj = values.find((v) => v.value === selectedValueId);
                    const collapsibleWrap = (content: ReactNode) =>
                        shouldCollapse ? (
                            <CollapsibleSection
                                key={`${id}-${selectedValueId ?? ''}`}
                                defaultOpen={!selectedValueId}
                                // After a selection remounts this section collapsed, restore focus to the
                                // summary (the clicked swatch is gone). Only armed by a controlled selection.
                                focusSummaryOnMount={swatchInteractionRef.current}
                                // Card look (both states): rounded, bordered, padded — vs the canonical
                                // border-b list default. Furniture-scoped (only passed when collapsing), so
                                // other CollapsibleSection usages are unaffected. `[&>summary]/[&>div]` add the
                                // horizontal padding the default leaves to its parent; `[&[open]>summary:hover]`
                                // suppresses the summary hover fill while expanded (hover only as a
                                // re-open affordance when collapsed, matching the reference).
                                className="overflow-hidden rounded-ui border border-border open:border-primary/60 [&>summary]:px-4 [&>div]:px-4 [&[open]>summary:hover]:bg-transparent"
                                summary={
                                    <SwatchSectionSummary
                                        label={name}
                                        selectedName={selectedObj?.name}
                                        image={selectedObj?.image}
                                    />
                                }>
                                {content}
                            </CollapsibleSection>
                        ) : (
                            content
                        );

                    // Categorized axis (e.g. furniture "fabric"): render the grouped/tabbed selector.
                    // Skipped in the read-only hideVariantSelection mode, which falls through to the
                    // single-swatch path below. Every non-listed axis renders unchanged.
                    if (groupedSwatchAxes.includes(id) && !hideVariantSelection) {
                        const groupedValue = swatchMode === 'uncontrolled' ? selectedValue?.value : controlledValue;
                        const selectedName = values.find((v) => v.value === groupedValue)?.name;
                        const groupedValues = values.map((value) => ({
                            name: value.name,
                            value: value.value,
                            href: value.href,
                            image: value.image,
                            description: value.description,
                            orderable:
                                swatchMode === 'controlled'
                                    ? isControlledVariantValueOrderable({
                                          variants: product.variants,
                                          currentSelection: variationValues ?? {},
                                          attributeId: id,
                                          attributeValue: value.value,
                                      })
                                    : (value.orderable ?? true),
                        }));
                        return collapsibleWrap(
                            <GroupedSwatchGroup
                                key={id}
                                label={name}
                                displayName={selectedName ? splitGroupedSwatchName(selectedName).label : ''}
                                value={groupedValue}
                                values={groupedValues}
                                handleChange={
                                    swatchMode === 'controlled' ? (value) => selectAttribute(id, value) : undefined
                                }
                                useHref={swatchMode === 'uncontrolled'}
                                allLabel={t('swatchFilterAll')}
                                outOfStockSuffix={t('outOfStockSuffix')}
                                hideHeader={shouldCollapse}
                            />
                        );
                    }

                    // Axes listed in `imageCardAxes` (e.g. furniture "size" / "legStyle"): render larger
                    // "option cards" — a 4:3 image thumb stacked above the option name + price, all inside
                    // one bordered, padded card — matching the reference's option cards and staying visually
                    // distinct from the small square fabric swatches. Config-gated + data-gated: only fires
                    // for a listed axis that actually ships swatch imagery, so every other axis
                    // (fashion/cosmetic/footwear sizes) keeps its compact single-swatch row. Skipped in
                    // read-only mode, which falls through to the compact path below.
                    const isImageCardAxis =
                        imageCardAxes.includes(id) && !hideVariantSelection && values.some((v) => v.image);
                    if (isImageCardAxis) {
                        const cardValue = swatchMode === 'uncontrolled' ? selectedValue?.value : controlledValue;
                        const selectedCardName = values.find((v) => v.value === cardValue)?.name;
                        return collapsibleWrap(
                            <div key={id} data-slot="option-card-group" className="flex flex-col gap-3">
                                {!shouldCollapse && (
                                    <div className="flex items-center gap-2 text-base font-semibold leading-6 text-card-foreground">
                                        <span>{name}:</span>
                                        {selectedCardName && <span>{selectedCardName}</span>}
                                    </div>
                                )}
                                <div
                                    role="radiogroup"
                                    aria-label={name}
                                    className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                                    data-slot="option-card-container">
                                    {values.map((value) => {
                                        const selected = value.value === cardValue;
                                        const orderableNow =
                                            swatchMode === 'controlled'
                                                ? isControlledVariantValueOrderable({
                                                      variants: product.variants,
                                                      currentSelection: variationValues ?? {},
                                                      attributeId: id,
                                                      attributeValue: value.value,
                                                  })
                                                : (value.orderable ?? true);
                                        return (
                                            <Swatch
                                                key={value.value}
                                                href={swatchMode === 'uncontrolled' ? value.href : undefined}
                                                handleSelect={
                                                    swatchMode === 'controlled'
                                                        ? (v) => selectAttribute(id, v)
                                                        : undefined
                                                }
                                                disabled={!orderableNow}
                                                value={value.value}
                                                name={value.name}
                                                selected={selected}
                                                isFocusable
                                                shape="imageCard"
                                                outOfStockSuffix={t('outOfStockSuffix')}>
                                                {value.image && (
                                                    <span
                                                        data-slot="option-card-thumb"
                                                        className="relative mb-2 aspect-[4/3] w-full overflow-hidden rounded-ui border border-border bg-muted">
                                                        <DynamicImage
                                                            src={value.image.disBaseLink || value.image.link || ''}
                                                            alt={value.image.alt || value.name}
                                                            widths={[96, 128, 192]}
                                                            className="absolute inset-0 h-full w-full"
                                                            imageProps={{ className: 'h-full w-full object-cover' }}
                                                        />
                                                    </span>
                                                )}
                                                <span
                                                    data-slot="swatch-short-label"
                                                    className="font-medium text-foreground">
                                                    {value.name}
                                                </span>
                                                {value.description && (
                                                    <span
                                                        data-slot="swatch-description"
                                                        className="text-[length:var(--swatch-description-size,0.75rem)] text-muted-foreground">
                                                        {value.description}
                                                    </span>
                                                )}
                                            </Swatch>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    }

                    // When hideVariantSelection is true, only show the selected swatch (read-only)
                    const swatchesToShow = hideVariantSelection
                        ? values.filter((v) => v.value === selectedValue?.value)
                        : values;

                    const swatches = swatchesToShow.map((value) => {
                        const { href, name: valueName, image, value: swatchValue, orderable, description } = value;
                        const isOrderableInCurrentSelection =
                            swatchMode === 'controlled'
                                ? isControlledVariantValueOrderable({
                                      variants: product.variants,
                                      currentSelection: variationValues ?? {},
                                      attributeId: id,
                                      attributeValue: swatchValue,
                                  })
                                : (orderable ?? true);
                        // The color axis keeps its pill-with-dot treatment (backgroundColor + optional
                        // swatch image). Any OTHER axis that ships swatch imagery renders the image as a
                        // DIS-optimized <DynamicImage> tile; axes with no swatch image fall back to text.
                        const isColorAxis = id === 'color';
                        const swatchShape = isColorAxis ? 'color' : image ? 'image' : 'label';
                        const swatchImageUrl = (image && toImageUrl({ image, config })) || '';
                        const content = (
                            <>
                                {image && isColorAxis ? (
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
                                ) : image ? (
                                    <DynamicImage
                                        src={image.disBaseLink || image.link || ''}
                                        alt={image.alt || valueName}
                                        widths={[48, 64, 96]}
                                        className="absolute inset-0 h-full w-full"
                                        imageProps={{ className: 'h-full w-full object-cover' }}
                                    />
                                ) : (
                                    <span className="text-xs font-medium">{valueName}</span>
                                )}
                                {/* Localized per-option description from SCAPI (e.g. a price delta "+US$200"),
                                rendered verbatim inline — no currency logic here. Absent → nothing extra. */}
                                {description && (
                                    <span
                                        data-slot="swatch-description"
                                        className="ml-1 text-[length:var(--swatch-description-size,0.75rem)] text-muted-foreground">
                                        {description}
                                    </span>
                                )}
                            </>
                        );

                        return (
                            <Swatch
                                key={swatchValue}
                                href={swatchMode === 'uncontrolled' ? href : undefined}
                                // Disable when not orderable (out of stock)
                                disabled={!isOrderableInCurrentSelection}
                                value={swatchValue}
                                name={valueName}
                                shape={swatchShape}
                                labeled
                                outOfStockSuffix={t('outOfStockSuffix')}>
                                {content}
                            </Swatch>
                        );
                    });
                    return collapsibleWrap(
                        <SwatchGroup
                            key={id}
                            value={swatchMode === 'uncontrolled' ? selectedValue?.value : controlledValue}
                            displayName={
                                swatchMode === 'controlled' ? controlledDisplayName : selectedValue?.name || ''
                            }
                            label={name}
                            // Inside a collapsible the section summary shows the label, so suppress the
                            // group's own header to avoid a duplicate label.
                            hideHeader={shouldCollapse}
                            handleChange={
                                // Disable handleChange when hideVariantSelection is true
                                hideVariantSelection
                                    ? undefined
                                    : swatchMode === 'controlled'
                                      ? (value) => selectAttribute(id, value)
                                      : undefined
                            }>
                            {swatches}
                        </SwatchGroup>
                    );
                });
                return collapsibleSwatchSections && !hideVariantSelection ? (
                    <div data-slot="swatch-container" className="space-y-3">
                        {swatchSections}
                    </div>
                ) : (
                    swatchSections
                );
            })()}
            {/* Optional content directly below the variation selectors (e.g. furniture "Your Configuration"). */}
            {afterVariations}
            {!isCompactStyle && <UITarget targetId="sfcc.pdp.products.visualization" />}

            {/* Cart item fulfillment changes use the cart-specific control. Furniture supplies its
                own grouped fulfillment block via hideDeliveryOptions. */}
            {!hideDeliveryOptions && showFulfillmentOptions && !(isProductABundle || isProductASet) && (
                <DeliveryOptions
                    product={productForDeliveryOptions}
                    quantity={quantity}
                    deliveryAvailable={deliveryAvailabilityIsUnknown ? true : undefined}
                    instanceId={`${product.id}-pdp-delivery-options`}
                    // @sfdc-extension-block-start SFDC_EXT_BOPIS
                    // @sfdc-extension-line SFDC_EXT_SHIPPING_DELIVERY
                    enableDeliveryEstimatePresentation={enableDeliveryEstimatePresentation}
                    // @sfdc-extension-block-end SFDC_EXT_BOPIS
                    // @sfdc-extension-line SFDC_EXT_BOPIS
                    pickupLocation={basketPickupStore}
                    onSelectionChange={productView?.setFulfillmentSelection}
                    className="mt-6"
                />
            )}

            {/* @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY */}
            {!hasDeferredAvailabilityForSelection && <UITarget targetId="sfcc.pdp.estimatedDelivery" />}
            {/* @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY */}

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
