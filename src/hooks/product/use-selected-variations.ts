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
import { useNavigation, useSearchParams } from 'react-router';
import type { ShopperProducts } from '@/scapi';
import { getInitialVariationValues } from '@/lib/product/initial-variant';

interface UseSelectedVariationsParams {
    product: ShopperProducts.schemas['Product'];
    isChildProduct?: boolean;
    /**
     * Optional override that takes precedence over URL search params. When provided, this hook
     * uses these values as the per-attribute selections instead of reading from `useSearchParams`.
     * Defaults (representedProduct → first orderable variant → single-value attribute) still
     * apply for any attribute the override doesn't supply.
     *
     * Use this in modal contexts where swatch selections must be ephemeral and not pollute the
     * page URL or trigger route revalidation (e.g. cart-edit / quick-add modals containing
     * bundle/set children).
     */
    selectionsOverride?: Record<string, string>;
}

/**
 * Hook to get currently selected variation values, with fallback to product defaults.
 *
 * Selection sources are consulted in priority order:
 *   1. `selectionsOverride` (modal contexts where selections must not touch the URL)
 *   2. The destination URL of an in-flight navigation (`useNavigation().location`) — yields
 *      optimistic readings while a swatch click's nav is settling, so consumers see the
 *      user's choice on the next paint
 *   3. The canonical URL search params (`useSearchParams`)
 *   4. Product defaults (`variationValues` → fallback variant → single-value attributes)
 *
 * @param params - Configuration object
 * @param params.product - Product containing variation attributes and optional default variationValues
 * @param params.isChildProduct - Whether this product is a child product (part of set/bundle, default: false)
 * @returns Object of selected variations with attribute IDs as keys
 *
 * @example
 * // URL: /?color=NAVYWL&size=040&someOtherParam=ignored
 * const product = {
 *   variationAttributes: [
 *     { id: 'color', name: 'Color', values: [...] },
 *     { id: 'size', name: 'Size', values: [...] }
 *   ]
 * }
 *
 * const selections = useSelectedVariations({ product });
 * // Returns: { color: 'NAVYWL', size: '040' }
 * // Note: 'someOtherParam' is ignored because it's not a variation attribute and
 * default val will be used if url param for that attribute does not exist
 *
 * @example
 * // URL: / (no selections, no defaults)
 * const masterProduct = { variationAttributes: [...] }
 * const selections = useSelectedVariations({ product: masterProduct });
 * // Returns: {}
 * // Note: Empty object when no variations are selected and no defaults
 *
 * @example
 * // Child product within a bundle/set with nested URL parameters
 * // URL: /?childProduct456=color%3DRED%26size%3DL&otherParam=value
 * const childProduct = { id: 'childProduct456', variationAttributes: [...] }
 * const selections = useSelectedVariations({ product: childProduct, isChildProduct: true });
 * // Returns: { color: 'RED', size: 'L' }
 * // Note: Extracts and decodes nested parameters for individual products within bundles/sets
 *
 * @example
 * // URL: /?color=NAVY (canonical), navigation in flight to /?color=RED
 * const selections = useSelectedVariations({ product });
 * // Returns: { color: 'RED' }
 * // Note: While the click navigation is pending, the destination's params are preferred so
 * // the swatch's `selected` flag reflects the user's choice immediately.
 */
export const useSelectedVariations = ({
    product,
    isChildProduct = false,
    selectionsOverride,
}: UseSelectedVariationsParams) => {
    const [searchParams] = useSearchParams();
    const navigation = useNavigation();

    return useMemo(() => {
        if (!product?.variationAttributes) return {};

        // Optimistic swatch activation: while a navigation triggered by clicking a swatch is in
        // flight, prefer the destination URL's params over the canonical URL so the clicked
        // swatch reflects as selected on the next paint instead of waiting for the loader chain
        // (color/size click → pid sync → SCAPI roundtrip) to settle. Same pattern the PLP uses
        // for refines — see docs/README-STATE.md "Via useNavigation()" and the precedent in
        // category-refinements/index.tsx. `useNavigation()` is global — it reflects any in-flight
        // navigation, not just swatch clicks. Acceptable trade-off: a cross-page nav (e.g. PDP→PDP
        // via a related-product link) unmounts this hook before the brief deselection paints.
        const pendingSearchParams = navigation.location ? new URLSearchParams(navigation.location.search) : undefined;
        const effectiveSearchParams = pendingSearchParams ?? searchParams;

        // Source for current selections: caller-provided override (modal contexts) or
        // pending-nav-aware URL params (PDP).
        const getSelected = (attributeId: string): string | undefined => {
            if (selectionsOverride) {
                return selectionsOverride[attributeId];
            }
            if (isChildProduct) {
                // For child products (individual products within bundles/sets): params are nested
                // like ?childProductId=color%3DRED%26size%3DL
                const productParamsString = effectiveSearchParams.get(product.id) || '';
                return new URLSearchParams(productParamsString).get(attributeId) || undefined;
            }
            return effectiveSearchParams.get(attributeId) || undefined;
        };

        // For master products that lack their own variationValues (e.g. set/bundle children),
        // fall back to a merchant-configured variant when SCAPI provides one via representedProduct.
        // representedProduct isn't in the typed Product schema (only ShopperSearch hits) but the
        // schema is open so SCAPI may include it. Read defensively via the open extension.
        const explicit = Object.fromEntries(
            product.variationAttributes.map((attribute) => [attribute.id, getSelected(attribute.id)])
        );
        return getInitialVariationValues(product, explicit, isChildProduct);
    }, [product, searchParams, navigation.location, isChildProduct, selectionsOverride]);
};
