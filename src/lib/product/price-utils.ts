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

/**
 * Whether a single price value is usable for purchase.
 *
 * SCAPI omits `price` (leaves it `undefined`) when a product has no price-book entry for the
 * active currency, but returns `0` for a product whose price is deliberately zero. This helper
 * keeps that distinction: only a finite number — including an explicit `0` — counts as a usable
 * price. `undefined`, `null`, `Infinity`, and `NaN` are treated as "no price".
 *
 * @param price - The raw price value from SCAPI.
 * @returns true if the price is a finite number (including 0), false otherwise.
 */
export function isAvailablePrice(price: number | null | undefined): price is number {
    return typeof price === 'number' && Number.isFinite(price);
}

/**
 * Whether the effective price for the active currency is available, so the product can be
 * purchased. Distinguishes a missing price (no price-book entry for the currency) from an
 * explicit price of `0` — the latter is purchasable.
 *
 * Resolution order:
 * - a selected variant → that variant's own price;
 * - a master with no variant selected → true if any variant has an available price;
 * - standard / bundle / set products → the product's own price (for a set this is the lowest
 *   child price, which SCAPI omits only when no child is priced).
 *
 * Master detection accepts both `type.master` (full product) and `hitType === 'master'` (search
 * hit) so the same rule serves catalog products and search hits — this is the shared source of
 * truth behind both the add-to-cart gate and the "Price unavailable" display.
 *
 * @param product - The product to check.
 * @param currentVariant - The currently selected variant, if any.
 * @returns true if there is a usable price for purchase, false otherwise.
 */
export function hasPurchasablePrice(
    product: ShopperProducts.schemas['Product'] | null | undefined,
    currentVariant?: ShopperProducts.schemas['Variant'] | null
): boolean {
    if (currentVariant) {
        return isAvailablePrice(currentVariant.price);
    }

    const isMaster =
        !!product?.type?.master || (product as { hitType?: string } | null | undefined)?.hitType === 'master';
    if (isMaster && product?.variants?.length) {
        // When variants ARE expanded, they're the authoritative answer. A master.price fallback
        // here would create a misleading affirmative — the gate would pass with no variant
        // selected (master.price set, variants unpriced) and then flip to disabled the moment the
        // shopper picks any variant. The variant-level rule is what survives selection.
        return product.variants.some((variant) => isAvailablePrice(variant.price));
    }

    // For a master with no variants array, or any non-master product, fall back to the product's
    // own price. SCAPI documents a master's `price` as the minimum of related child products, so
    // for search hits / partial projections that don't carry expanded variants this is still the
    // authoritative signal.
    return isAvailablePrice(product?.price);
}
