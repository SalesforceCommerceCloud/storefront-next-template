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

import type { ShopperProducts, ShopperSearch } from '@/scapi';

/**
 * Converts a ShopperProducts.schemas['Product'] to ShopperSearch.schemas['ProductSearchHit'] format
 * This allows ProductTile and ProductGrid components to work with Product objects from wishlist
 *
 * @param product - The product to convert
 */
export function convertProductToProductSearchHit(
    product: ShopperProducts.schemas['Product']
): ShopperSearch.schemas['ProductSearchHit'] {
    // Get the first image group's first image for the main image
    const firstImageGroup = product.imageGroups?.[0];
    const firstImage = firstImageGroup?.images?.[0];
    const productId = (product.id || product.productId || '') as string;
    const productName = (product.name || product.productName || '') as string;
    const productPrice = product.price ?? product.priceMax ?? 0;
    const converted: ShopperSearch.schemas['ProductSearchHit'] = {
        productId,
        productName,
        slug: product.slug,
        price: productPrice,
        currency: product.currency,
        image: firstImage
            ? {
                  disBaseLink: firstImage.disBaseLink || firstImage.link || '',
                  link: firstImage.disBaseLink || firstImage.link || '',
                  alt: firstImage.alt || product.name || '',
              }
            : undefined,
        imageGroups: product.imageGroups,
        variationAttributes: product.variationAttributes,
        variants: product.variationAttributes
            ? product.variationAttributes.map((attr) => ({
                  productId,
                  variationValues: attr.values?.reduce(
                      (acc, val) => {
                          if (attr.id && val.value) {
                              acc[attr.id] = val.value;
                          }
                          return acc;
                      },
                      {} as Record<string, string>
                  ),
              }))
            : undefined,
        inStock:
            product.inventory?.ats !== undefined ? product.inventory.ats > 0 : (product.inventory?.orderable ?? true),
        // Additional properties that ProductSearchHit might have
        promotions: [],
        customProperties: product.customProperties,
    };

    return converted;
}
