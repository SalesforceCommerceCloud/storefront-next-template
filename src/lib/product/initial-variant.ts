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
import type { ShopperProducts } from '@/scapi';

export function getInitialVariationValues(
    product: ShopperProducts.schemas['Product'],
    explicit: Record<string, string | undefined> = {},
    isChildProduct = false
): Record<string, string> {
    const representedId = (product as { representedProduct?: { id?: string } }).representedProduct?.id;
    const represented =
        !product.variationValues && representedId
            ? product.variants?.find((variant) => variant.productId === representedId)
            : undefined;
    const fallback =
        represented ??
        (isChildProduct && !product.variationValues
            ? (product.variants?.find((variant) => variant.orderable) ?? product.variants?.[0])
            : undefined);
    const values: Record<string, string> = {};
    for (const attribute of product.variationAttributes ?? []) {
        const onlyValue = attribute.values?.length === 1 ? attribute.values[0]?.value : undefined;
        const value =
            explicit[attribute.id] ||
            product.variationValues?.[attribute.id] ||
            fallback?.variationValues?.[attribute.id] ||
            onlyValue;
        if (value) values[attribute.id] = value;
    }
    return values;
}

export function getInitialVariant(
    product: ShopperProducts.schemas['Product'],
    searchParams = new URLSearchParams(),
    isChildProduct = false
): ShopperProducts.schemas['Variant'] | undefined {
    const values = getInitialVariationValues(product, Object.fromEntries(searchParams), isChildProduct);
    const matches =
        product.variants?.filter(
            (variant) =>
                variant.variationValues &&
                Object.keys(values).every((key) => variant.variationValues?.[key] === values[key])
        ) ?? [];
    return matches.length === 1 ? matches[0] : undefined;
}
