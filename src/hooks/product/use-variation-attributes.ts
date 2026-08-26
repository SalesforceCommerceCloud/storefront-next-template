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
import { useMemo } from 'react';
import { useLocation } from 'react-router';
import { useSelectedVariations } from './use-selected-variations';
import { findImageGroupBy } from '@/lib/product/image-groups-utils';
import { getCustomSwatchImageUrl, parseCustomSwatchImages } from '@/lib/product/custom-swatch-images';
import type { ShopperProducts } from '@/scapi';

const getProductViewSearchParams = (search: string, productId: string) => {
    const allParams = new URLSearchParams(search);
    const productParams = new URLSearchParams(allParams.get(productId) || '');
    return [allParams, productParams] as const;
};

const updateSearchParams = (params: URLSearchParams, newParams: Record<string, string>) => {
    Object.entries(newParams).forEach(([key, value]) => {
        params.set(key, value);
    });
};

const buildVariantValueHref = ({
    pathname,
    existingParams,
    newParams,
    productId,
    isChildProduct,
}: {
    pathname: string;
    existingParams: readonly [URLSearchParams, URLSearchParams];
    newParams: Record<string, string>;
    productId: string;
    isChildProduct: boolean;
}) => {
    const [allParams, productParams] = existingParams;

    // Create copies to avoid mutating the original params
    // Use toString() to ensure we get a proper deep copy that preserves all params including other child products
    const newAllParams = new URLSearchParams(allParams.toString());
    const newProductParams = new URLSearchParams(productParams.toString());

    if (isChildProduct) {
        updateSearchParams(newProductParams, newParams);
        newAllParams.set(productId, newProductParams.toString());
    } else {
        updateSearchParams(newAllParams, newParams);
    }

    return `${pathname}?${newAllParams.toString()}`;
};

/**
 * Determine if a products variant attribute value is orderable without having to
 * load the variant in question, but filtering the list of variants with the
 * passed in attribute values.
 */
const isVariantValueOrderable = (
    product: ShopperProducts.schemas['Product'],
    variationParams: Record<string, string>
): boolean => {
    if (!product.variants) return true;

    return product.variants
        .filter(({ variationValues }) =>
            Object.keys(variationParams).every((key) => variationValues?.[key] === variationParams[key])
        )
        .some(({ orderable }) => orderable);
};

export interface VariationAttribute {
    id: string;
    name: string;
    selectedValue: {
        name?: string;
        value?: string;
    };
    values: Array<{
        name: string;
        value: string;
        orderable?: boolean;
        image?: ShopperProducts.schemas['Image'];
        /**
         * Localized per-option hint shipped by SCAPI on the variation value (e.g. a price-delta
         * like "+US$200"). Already resolved to the request locale, so the PDP renders it verbatim
         * with no currency logic. Absent on values that don't ship one.
         */
        description?: string;
        href: string;
        selected: boolean;
        disabled?: boolean;
    }>;
}

interface UseVariationAttributesParams {
    product: ShopperProducts.schemas['Product'];
    isChildProduct?: boolean;
    masterProduct?: ShopperProducts.schemas['Product'];
    /**
     * Optional override forwarded to {@link useSelectedVariations}. Modal contexts pass their
     * local selection state here so generated `href`s and `selected` flags reflect the local
     * picker instead of the page URL.
     */
    selectionsOverride?: Record<string, string>;
}

/**
 * Use a decorated version of a product variation attributes. This version
 * will have the following additions: which variation attribute is selected,
 * each value will have a product url, the swatch image if there is one, and
 * an updated orderable flag.
 *
 * Each variation attribute includes the currently selected value from URL parameters,
 * available values with generated hrefs, and proper selection state.
 *
 * @param params - Configuration object
 * @param params.product - a product containing variation attributes and optional image groups
 * @param params.isChildProduct - whether this product is a child product (part of set/bundle, default: false)
 * @returns Array of processed variation attributes with URL state and navigation hrefs
 *
 * @example
 * // Basic usage with a suit product
 * const variationAttributes = useVariationAttributes({ product: navySuitProduct });
 * // Returns: [
 * //   {
 * //     id: 'color',
 * //     name: 'Color',
 * //     selectedValue: { name: 'Navy', value: 'NAVYWL' },
 * //     values: [{ name: 'Navy', value: 'NAVYWL', href: '/?color=NAVYWL', selected: true, ... }]
 * //   },
 * //   {
 * //     id: 'size',
 * //     name: 'Size',
 * //     selectedValue: { name: undefined, value: undefined },
 * //     values: [
 * //       { name: '36', value: '036', href: '/?color=NAVYWL&size=036', selected: false, ... },
 * //       { name: '38', value: '038', href: '/?color=NAVYWL&size=038', selected: false, ... }
 * //     ]
 * //   }
 * // ]
 *
 * @example
 * // URL: /?color=NAVYWL&size=040
 * const variationAttributes = useVariationAttributes({ product: navySuitProduct });
 * variationAttributes[0].selectedValue; // { name: 'Navy', value: 'NAVYWL' }
 * variationAttributes[1].selectedValue; // { name: '40', value: '040' }
 */
export const useVariationAttributes = ({
    product,
    isChildProduct = false,
    selectionsOverride,
}: UseVariationAttributesParams): VariationAttribute[] => {
    const location = useLocation();
    const selectedVariations = useSelectedVariations({ product, isChildProduct, selectionsOverride });

    return useMemo(() => {
        if (!product?.variationAttributes || !product?.id) return [];

        const existingParams = getProductViewSearchParams(location.search, product.id);

        // Optional custom master attribute mapping axes → values → swatch image paths, for axes SCAPI
        // does not natively decorate (e.g. size, legStyle). Parsed once; absent on most catalogs.
        const customSwatchImages = parseCustomSwatchImages(
            (product as unknown as { c_swatchImages?: unknown }).c_swatchImages
        );

        return product?.variationAttributes.map((variationAttribute) => {
            const currentValue = selectedVariations[variationAttribute.id || ''];
            const selectedValueObj = variationAttribute.values?.find(({ value }) => value === currentValue);

            return {
                id: variationAttribute.id || '',
                name: variationAttribute.name || '',
                selectedValue: {
                    name: selectedValueObj?.name,
                    value: selectedValueObj?.value,
                },
                values: (variationAttribute.values || []).map((value) => {
                    // Build href using buildVariantValueHref
                    const href = buildVariantValueHref({
                        pathname: location.pathname,
                        existingParams,
                        newParams: { [variationAttribute.id || '']: value.value },
                        productId: product.id || '',
                        isChildProduct,
                    });

                    // Find the swatch image for this variation value on ANY axis (color, size,
                    // fabric, legStyle, …) — data-driven so a catalog can ship image swatches for
                    // whichever attribute carries swatch imagery, not just color.
                    //
                    // Backward-safe guard: `findImageGroupBy` filters out attributes that no
                    // swatch image group represents, and when that leaves the criteria empty its
                    // `.find` matches the FIRST swatch group via a vacuous `[].every()` — which
                    // would wrongly hand (e.g.) a color swatch image to a `size` value on a
                    // color-only catalog. So only accept a group that actually declares THIS
                    // axis; axes with no swatch group resolve to `undefined` → text swatch.
                    let image: ShopperProducts.schemas['Image'] | undefined;
                    if (product.imageGroups) {
                        const imageGroup = findImageGroupBy(product.imageGroups, {
                            viewType: 'swatch',
                            selectedVariationAttributes: {
                                [variationAttribute.id || '']: value.value,
                            },
                        });
                        const matchesAxis = imageGroup?.variationAttributes?.some(
                            (attr) => attr.id === variationAttribute.id
                        );
                        image = matchesAxis ? imageGroup?.images?.[0] : undefined;
                    }

                    // Fall back to the custom `c_swatchImages` map for axes SCAPI doesn't natively
                    // decorate (size, legStyle, …). Synthesize an Image so downstream renders it via
                    // <DynamicImage> exactly like a native swatch. No entry ⇒ image stays undefined ⇒ text.
                    if (!image) {
                        const customUrl = getCustomSwatchImageUrl(
                            customSwatchImages,
                            variationAttribute.id || '',
                            value.value
                        );
                        if (customUrl) {
                            image = { link: customUrl, disBaseLink: customUrl, alt: value.name || value.value };
                        }
                    }

                    // Check if this variation value is orderable by looking at variants
                    const variationParams = {
                        ...selectedVariations,
                        [variationAttribute.id || '']: value.value,
                    };
                    const isOrderable = isVariantValueOrderable(product, variationParams);

                    return {
                        name: value.name || value.value,
                        value: value.value,
                        orderable: isOrderable,
                        disabled: !isOrderable,
                        image,
                        // Localized price-delta / option hint straight from SCAPI (undefined when absent).
                        description: value.description,
                        href,
                        selected: currentValue === value.value,
                    };
                }),
            };
        });
    }, [product, location.pathname, location.search, selectedVariations, isChildProduct]);
};
