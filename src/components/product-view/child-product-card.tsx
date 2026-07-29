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
import ImageGallery from '@/components/image-gallery';
import ProductQuantityPicker from '@/components/product-quantity-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SwatchGroup, Swatch } from '@/components/swatch-group';
import { useCurrentVariant } from '@/hooks/product/use-current-variant';
import { useSelectedVariations } from '@/hooks/product/use-selected-variations';
import { useVariationAttributes } from '@/hooks/product/use-variation-attributes';
import { useProductImages } from '@/hooks/product/use-product-images';
import { useProductActions } from '@/hooks/product/use-product-actions';
import ProductPrice from '@/components/product-price';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import type { ShopperProducts } from '@/scapi';
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import { isProductSet, isStandardProduct } from '@/lib/product/product-utils';
// @sfdc-extension-line SFDC_EXT_BOPIS
import DeliveryOptions from '@/extensions/bopis/components/delivery-options/delivery-options';
import { useTranslation } from 'react-i18next';

/**
 * Card cell inside `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`. The card is rendered on PDP
 * (`section-container`) and inside `cart-item-modal` (`sm:max-w-4xl`); worst-case cell width is ~420 at `md`
 * on PDP. The `lg`-3-col case (~292 PDP, ~218 in modal) and the `base` mobile case both stay below 420, so a
 * single `md` cap covers them all. Thumbnails are `grid-cols-4` of the cell → ~80 at `base`, ~96 at `md+`.
 */
const GALLERY_WIDTHS = {
    main: { base: 360, md: 420 },
    thumbnail: { base: 80, md: 96 },
} as const;

interface ProductSelectionValues {
    product: ShopperProducts.schemas['Product'];
    variant?: ShopperProducts.schemas['Variant'];
    quantity: number;
}

interface ChildProductCardProps {
    /** Child product from the parent set or bundle */
    childProduct: ShopperProducts.schemas['Product'];
    /** Parent product (set or bundle) containing this child */
    parentProduct: ShopperProducts.schemas['Product'];
    /** Callback to notify parent component of selection changes (variant, quantity) */
    onSelectionChange: (productId: string, selection: ProductSelectionValues) => void;
    /** Callback to notify parent component of orderability changes (stock, orderable status) */
    onOrderabilityChange?: (productId: string, orderability: { isOrderable: boolean; errorMessage?: string }) => void;
    /**
     * Where swatch selection state lives:
     * - `'url'` (default, PDP usage): swatch clicks update URL search params; selection is shareable
     *   and routes can react via `useSearchParams`/loaders.
     * - `'local'` (modal usage): swatch clicks mutate component-local state only. Use this when the
     *   card is rendered inside a modal so selections don't pollute the page URL or trigger
     *   route revalidation on every click.
     */
    selectionSource?: 'url' | 'local';
    /**
     * True when the parent ChildProducts is in edit mode (cart-edit modal). In edit mode the
     * per-child price gate is bypassed so a child whose catalog price went missing for the active
     * currency doesn't block the parent's Update button via `hasUnorderableChildProducts`.
     */
    isEditMode?: boolean;
}

/**
 * Displays a child product card within a product set or bundle, with variant selection and quantity control.
 *
 * This component provides:
 * - Product image gallery with variant-specific images
 * - Interactive variant selection (color, size, etc.) with swatches
 * - Quantity picker (for sets only - bundles use parent quantity)
 * - Real-time selection validation and stock checks
 * - Individual "Add to Cart" button (for sets only)
 * - Automatic parent notification on selection changes
 *
 * Swatch behavior depends on `selectionSource`:
 * - `'url'` (PDP): swatches render as `<NavLink href={swatchHref}>` so the URL is the source of truth.
 * - `'local'` (modal): swatches render as buttons; clicks mutate component-local state via
 *   `selectionsOverride` plumbed into `useSelectedVariations` / `useCurrentVariant` /
 *   `useVariationAttributes`.
 *
 * @example PDP usage (default)
 * ```tsx
 * <ChildProductCard
 *   childProduct={childProduct}
 *   parentProduct={parentProduct}
 *   onSelectionChange={setChildProductSelection}
 * />
 * ```
 *
 * @example Modal usage (cart-edit / quick-add)
 * ```tsx
 * <ChildProductCard
 *   childProduct={childProduct}
 *   parentProduct={parentProduct}
 *   onSelectionChange={setChildProductSelection}
 *   selectionSource="local"
 * />
 * ```
 *
 * @param props - Component props
 * @returns Card component with product details, variant selection, and cart controls
 */
export default function ChildProductCard({
    childProduct: product,
    parentProduct,
    onSelectionChange,
    onOrderabilityChange,
    selectionSource = 'url',
    isEditMode = false,
}: ChildProductCardProps): ReactElement {
    const { t } = useTranslation('product');
    const isParentProductASet = isProductSet(parentProduct);
    const { currency } = useSite();

    // Local selection state for modal usage. Starts empty — `useSelectedVariations` already
    // applies the same fallback chain (representedProduct → first orderable → single-value
    // attributes) for child products, so an empty override yields the merchant defaults. In
    // 'url' mode this state is unused; the URL is the source of truth.
    const [localSelections, setLocalSelections] = useState<Record<string, string>>({});
    const selectionsOverride = selectionSource === 'local' ? localSelections : undefined;

    // Get current variant for UI display and parent communication
    const currentVariant = useCurrentVariant({
        product,
        isChildProduct: true,
        selectionsOverride,
    });

    const selectedAttributes = useSelectedVariations({
        product,
        isChildProduct: true,
        selectionsOverride,
    });
    const { galleryImages } = useProductImages({
        product,
        selectedAttributes,
    });

    // Use product actions hook for individual product cart operations
    const {
        isAddingToOrUpdatingCart: isAddingChildOrUpdatingToCart,
        canAddToCart: canAddChildToCart,
        stockLevel,
        isOutOfStock,
        handleAddToCart: handleAddChildToCart,
        quantity,
        setQuantity,
    } = useProductActions({
        product,
        isChildProduct: true,
        currentVariant,
        // Set children are added as individual lines at their own price, so they normally must have
        // one — except in edit mode, where the line is already in the basket and shouldn't be
        // blocked by a now-missing catalog price (mirrors the hook's itemId bypass for variants).
        // Bundle children are charged at the parent bundle price, so don't block them on a missing
        // child price — the bundle-level gate checks the parent's price instead.
        allowMissingPrice: !isParentProductASet || isEditMode,
    });

    const variationAttributes = useVariationAttributes({
        product,
        isChildProduct: true,
        selectionsOverride,
    });

    const handleSwatchChange = useCallback((attributeId: string, value: string) => {
        setLocalSelections((prev) => {
            if (prev[attributeId] === value) return prev;
            return { ...prev, [attributeId]: value };
        });
    }, []);

    // Track previous selection to prevent infinite loops
    // This tracks what we last notified parent about, not just "previous render"
    const prevSelectionRef = useRef<{
        variantId?: string;
        quantity: number;
    } | null>(null);
    const isStandard = isStandardProduct(product);

    // Auto-select standard products
    useEffect(() => {
        // Only notify if this is first selection OR quantity changed
        if (isStandard && (!prevSelectionRef.current || prevSelectionRef.current.quantity !== quantity)) {
            onSelectionChange(product.id, {
                product,
                quantity,
            });

            prevSelectionRef.current = {
                quantity,
            };
        }
    }, [isStandard, product, quantity, onSelectionChange]);

    // Update parent when selection changes (variant or quantity)
    // For sets: we need to track quantity changes even without variant selection
    // to calculate parent inventory correctly based on child quantities
    useEffect(() => {
        if (currentVariant) {
            const newSelection = {
                variantId: currentVariant.productId,
                quantity,
            };

            // Only notify parent if selection actually changed
            // This is to avoid infinite loop because the childProduct is a new object reference every time it is rendered
            if (
                !prevSelectionRef.current ||
                prevSelectionRef.current.variantId !== newSelection.variantId ||
                prevSelectionRef.current.quantity !== newSelection.quantity
            ) {
                onSelectionChange(product.id, {
                    product,
                    variant: currentVariant,
                    quantity,
                });

                prevSelectionRef.current = newSelection;
            }
        } else if (isParentProductASet) {
            // For sets: track quantity changes even without variant selection
            // This allows parent to calculate inventory based on child quantities
            const newSelection = {
                quantity,
            };

            if (!prevSelectionRef.current || prevSelectionRef.current.quantity !== newSelection.quantity) {
                onSelectionChange(product.id, {
                    product,
                    quantity,
                });

                prevSelectionRef.current = newSelection;
            }
        }
    }, [currentVariant, quantity, onSelectionChange, product, isParentProductASet]);

    // Report orderability status to parent
    useEffect(() => {
        if (onOrderabilityChange) {
            onOrderabilityChange(product.id, {
                isOrderable: canAddChildToCart,
                errorMessage: !canAddChildToCart ? t('selectAllOptions') : undefined,
            });
        }
    }, [canAddChildToCart, product.id, onOrderabilityChange, t]);

    return (
        <Card className="h-full" data-testid="child-product">
            <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-card-foreground tracking-tight">{product?.name}</CardTitle>
                <ProductPrice
                    type="unit"
                    product={currentVariant || product}
                    currency={currency}
                    labelForA11y={product?.name}
                    quantity={quantity}
                    // Match the purchasability gate above so display and gate apply the same rule:
                    // bundle children are charged at the parent price, and set children in edit
                    // mode (an in-basket line) shouldn't be flagged as "Price unavailable" if the
                    // catalog price has since gone missing for the active currency.
                    allowMissingPrice={!isParentProductASet || isEditMode}
                    currentPriceProps={{
                        className: 'text-lg font-bold text-card-foreground tracking-tight',
                    }}
                />
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Product Image */}
                <div className="aspect-square">
                    <ImageGallery
                        key={product.id}
                        images={galleryImages}
                        eager={false}
                        productName={product.name}
                        widths={GALLERY_WIDTHS}
                    />
                </div>

                {/* Variant Selection.
                    URL mode: swatches render as <NavLink> (href set) — clicks navigate, the URL is
                    the single source of truth, and the page is shareable.
                    Local mode: swatches render as <button> with handleSelect → mutate component-
                    local state only. No URL writes, no route revalidation. */}
                {variationAttributes.map(({ id, name, selectedValue, values }) => {
                    const swatches = values.map((value) => {
                        const { href, name: valueName, image, value: swatchValue, orderable } = value;
                        const content = image ? (
                            <div
                                data-slot="swatch-dot"
                                className="w-full h-full bg-cover bg-center bg-no-repeat"
                                style={{ backgroundImage: `url(${image.link})` }}
                                aria-label={image.alt || valueName}
                            />
                        ) : (
                            <span className="text-xs font-medium">{valueName}</span>
                        );

                        return (
                            <Swatch
                                key={swatchValue}
                                href={selectionSource === 'url' ? href : undefined}
                                disabled={!orderable}
                                value={swatchValue}
                                name={valueName}
                                shape={id === 'color' ? 'color' : 'label'}
                                outOfStockSuffix={t('outOfStockSuffix')}>
                                {content}
                            </Swatch>
                        );
                    });

                    return (
                        <SwatchGroup
                            key={id}
                            value={selectedValue?.value}
                            displayName={selectedValue?.name || ''}
                            label={name}
                            handleChange={
                                selectionSource === 'local' ? (value) => handleSwatchChange(id, value) : undefined
                            }>
                            {swatches}
                        </SwatchGroup>
                    );
                })}

                {/* Quantity for Product Sets */}
                {isParentProductASet && (
                    <ProductQuantityPicker
                        value={quantity.toString()}
                        onChange={setQuantity}
                        stockLevel={stockLevel}
                        isOutOfStock={isOutOfStock}
                        productName={product?.name}
                    />
                )}

                {/* Selection Status */}
                <div className="text-center text-sm">
                    {currentVariant || isStandard ? (
                        <span className="text-primary font-medium">{t('selected')}</span>
                    ) : (
                        <span className="text-muted-foreground">{t('selectOptionsAbove')}</span>
                    )}
                </div>

                {/* @sfdc-extension-block-start SFDC_EXT_BOPIS */}
                {/* Delivery Options - Only for Product Sets (not Bundles) */}
                {isParentProductASet && <DeliveryOptions product={product} quantity={quantity} className="mt-6" />}
                {/* @sfdc-extension-block-end SFDC_EXT_BOPIS */}

                {/* Individual Add to Cart Button */}
                {isParentProductASet && (
                    <Button
                        data-testid="add-to-cart"
                        onClick={() => void handleAddChildToCart()}
                        disabled={!canAddChildToCart || isAddingChildOrUpdatingToCart}
                        size="sm"
                        className="w-full">
                        {isAddingChildOrUpdatingToCart ? t('addingToCart') : t('addToCart')}
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}

export type { ChildProductCardProps, ProductSelectionValues };
