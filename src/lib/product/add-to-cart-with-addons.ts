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
import type { useProductActions } from '@/hooks/product/use-product-actions';

type ProductActions = ReturnType<typeof useProductActions>;

/**
 * An extra product to batch with the main product on Add-to-Cart (e.g. a furniture service add-on).
 * Generic — no domain-specific knowledge.
 */
export interface AdditionalItem {
    productId: string;
    quantity: number;
    price?: number;
}

interface AddToCartWithAddonsParams {
    product: ShopperProducts.schemas['Product'];
    /** The resolved variant (undefined/null until the shopper narrows the selection to one). */
    currentVariant?: ShopperProducts.schemas['Variant'] | null;
    quantity: number;
    /** Selected add-ons (e.g. service add-ons). Empty → a plain single-product add. */
    additionalItems: AdditionalItem[];
    handleAddToCart: ProductActions['handleAddToCart'];
    handleProductSetAddToCart: ProductActions['handleProductSetAddToCart'];
}

/**
 * Add the product to cart, batching any selected add-ons as separate line items via the product-set
 * path. Single source of truth shared by `ProductCartActions` (the main PDP button) and the furniture
 * `ProductBottomBar`, so their add-to-cart behavior can't drift.
 *
 * Contract: the product-set add path reads ONLY `id` and `price` off each add-on's product (see
 * `handleProductSetAddToCart` in `use-product-actions.ts` — it maps to `productId`/`price`), so we
 * synthesize a minimal stub rather than fetch the full Product. If that path ever starts reading
 * other fields, this cast must be revisited.
 */
export async function addToCartWithAddons({
    product,
    currentVariant,
    quantity,
    additionalItems,
    handleAddToCart,
    handleProductSetAddToCart,
}: AddToCartWithAddonsParams): Promise<void> {
    if (additionalItems.length > 0) {
        await handleProductSetAddToCart([
            { product, variant: currentVariant ?? undefined, quantity },
            ...additionalItems.map((item) => ({
                product: { id: item.productId, price: item.price } as ShopperProducts.schemas['Product'],
                quantity: item.quantity,
            })),
        ]);
    } else {
        await handleAddToCart();
    }
}
