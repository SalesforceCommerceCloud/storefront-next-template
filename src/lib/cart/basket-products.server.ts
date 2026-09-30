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
import type { LoaderFunctionArgs } from 'react-router';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';
import { siteContext, type SiteContext } from '@salesforce/storefront-next-runtime/site-context';
import { fetchProductsByIds } from '@/lib/api/products.server';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getSeoSlugExpansion } from '@/lib/seo/scapi-slugs';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { getInventoryIdsFromPickupShipments } from '@/extensions/bopis/lib/basket-utils';
// @sfdc-extension-block-end SFDC_EXT_BOPIS

/**
 * Fetches detailed product information for all items in a shopping basket.
 *
 * Composes `fetchProductsByIds` (which throws `NormalizedApiError` on failure) — does not
 * itself wrap or catch errors. Failures propagate to the caller (the cart loader's
 * `<Await errorElement={<CartLoadError/>}>`).
 *
 * @returns A mapping of basket itemId → product, plus a separate map of bonus productId → product.
 */
export async function fetchProductsInBasket(
    context: LoaderFunctionArgs['context'],
    basket: ShopperBasketsV2.schemas['Basket'] | null
): Promise<{
    productsByItemId: Record<string, ShopperProducts.schemas['Product']>;
    bonusProductsById: Record<string, ShopperProducts.schemas['Product']>;
}> {
    const productItems = basket?.productItems ?? [];

    // Collect all product IDs (parents + bundled children)
    const ids: string[] = [];
    productItems.forEach((item) => {
        if (item.productId) {
            ids.push(item.productId);
        }
        if (item.bundledProductItems && item.bundledProductItems.length > 0) {
            const childProductIds = item.bundledProductItems
                .map((child) => child.productId)
                .filter((id): id is string => Boolean(id));
            ids.push(...childProductIds);
        }
    });

    // Collect bonus product IDs from bonusDiscountLineItems
    const bonusProductIds: string[] = [];
    basket?.bonusDiscountLineItems?.forEach((bonusItem) => {
        bonusItem.bonusProducts?.forEach((bp) => {
            if (bp.productId) {
                bonusProductIds.push(bp.productId);
            }
        });
    });
    ids.push(...bonusProductIds);

    if (!ids.length) {
        return { productsByItemId: {}, bonusProductsById: {} };
    }

    const currency = (context.get(siteContext) as SiteContext).currency;
    const config = getConfig(context);
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    const inventoryIds = getInventoryIdsFromPickupShipments(basket);
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    const productsList = await fetchProductsByIds(context, ids, {
        allImages: true,
        perPricebook: true,
        currency,
        // Scope expansions to only what cart UI consumes. Without an explicit expand, the SCAPI default
        // returns extra blocks (set_products, recommendations, links, options, custom_properties, validation)
        // that the cart never reads.
        expand: [
            'availability',
            'bundled_products',
            'images',
            'prices',
            'promotions',
            ...getSeoSlugExpansion(config.url?.seoRoutes),
            'variations',
        ],
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        ...(inventoryIds.length > 0 ? { inventoryIds } : {}),
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
    });

    const products = productsList.reduce(
        (acc, product) => {
            acc[product.id] = product;
            return acc;
        },
        {} as Record<string, ShopperProducts.schemas['Product']>
    );

    const productsByItemId: Record<string, ShopperProducts.schemas['Product']> = {};
    productItems.forEach((productItem) => {
        if (!productItem.itemId || !productItem.productId || !products[productItem.productId]) {
            return;
        }

        const product = products[productItem.productId];

        if (productItem.bundledProductItems && productItem.bundledProductItems.length > 0) {
            // Reconstruct bundledProducts using basket-line quantities (from bundledProductItems[].quantity)
            // rather than catalog defaults. The basket tracks per-order quantities that may differ from the
            // catalog bundle composition.
            const bundledProducts: ShopperProducts.schemas['BundledProduct'][] = productItem.bundledProductItems
                .map((bundledItem) => {
                    const childProduct = bundledItem.productId ? products[bundledItem.productId] : null;
                    if (!childProduct) return null;
                    return {
                        product: childProduct,
                        quantity: bundledItem.quantity ?? 1,
                    };
                })
                .filter((item): item is ShopperProducts.schemas['BundledProduct'] => item !== null);

            productsByItemId[productItem.itemId] = {
                ...product,
                bundledProducts,
            };
        } else {
            productsByItemId[productItem.itemId] = product;
        }
    });

    const bonusProductsById: Record<string, ShopperProducts.schemas['Product']> = {};
    basket?.bonusDiscountLineItems?.forEach((bonusItem) => {
        bonusItem.bonusProducts?.forEach((bp) => {
            if (bp.productId && products[bp.productId]) {
                bonusProductsById[bp.productId] = products[bp.productId];
            }
        });
    });

    return { productsByItemId, bonusProductsById };
}
