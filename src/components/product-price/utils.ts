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
import type { ShopperBasketsV2, ShopperOrders, ShopperProducts, ShopperSearch } from '@/scapi';
import { getCurrencyFractionDigits } from '@/lib/currency';
import { createLogger } from '@/lib/logger';
import { hasPurchasablePrice, isAvailablePrice } from '@/lib/product/price-utils';

const logger = createLogger();

type ProductType = ShopperProducts.schemas['ProductType'];

type Product =
    | ShopperProducts.schemas['Product']
    | (ShopperBasketsV2.schemas['ProductItem'] & Partial<ShopperProducts.schemas['Product']>)
    | (ShopperOrders.schemas['ProductItem'] & Partial<ShopperProducts.schemas['Product']>)
    | ShopperSearch.schemas['ProductSearchHit'];

// Type for product promotions - based on the commerce SDK structure
interface ProductPromotion {
    promotionalPrice?: number;
    [key: string]: unknown;
}

// Return type for findLowestPrice
interface LowestPriceResult {
    minPrice: number;
    promotion: ProductPromotion | null;
    data: Product;
}

/**
 * @private
 * Find the smallest value by key from a given array
 * @returns {Array} an array of such smallest value and the item containing this value
 * @example
 * const [value, itemContainingValue] = getSmallestValByProperty(array, key)
 */
const getSmallestValByProperty = <T extends Record<string, unknown>>(
    arr: T[] | undefined | null,
    key: keyof T
): [number, T | null] => {
    if (!arr || !arr.length) return [Infinity, null];
    if (!key) {
        throw new Error('Please specify a key.');
    }

    const filtered = arr.filter((item) => {
        const value = item[key];
        return value === 0 || value === '0' ? true : Number(value);
    });

    if (filtered.length === 0) return [Infinity, null];

    return filtered.reduce(
        (prev, item) => {
            const value = item[key];
            const [prevValue] = prev;
            const numValue = Number(value);
            return numValue < prevValue ? [numValue, item] : prev;
        },
        [Infinity, null] as [number, T | null]
    );
};

/**
 * Find the lowest price of a product, across all of its price books and promotions
 * @param {Object} product - product data from the API
 * @returns {Object|undefined} the lowest price for the given product. If it's a promotional price, the promotion will also be returned.
 */
export const findLowestPrice = (product: Product): LowestPriceResult | undefined => {
    if (!product) return undefined;

    // Look at all of the variants, only if it's a master product.
    // i.e. when a shopper has narrowed down to a variant, do not look into other variants
    const isMaster = product.hitType === 'master' || !!(product.type as ProductType | undefined)?.master;
    if (isMaster && !product.variants) {
        logger.warn(
            'Expecting `product.variants` to exist. For more accuracy, please tweak your API request to ask for the variants details.'
        );
    }
    // Skip variants/products whose price is missing for the active currency. SCAPI omits `price`
    // when there is no price-book entry (vs. `0` for a deliberately-free product), so without this
    // filter the master reduce would coalesce `undefined` to 0 and produce a misleading
    // "From $0.00 – $X" range when only some variants are priced.
    const candidates = isMaster && product.variants ? product.variants : [product];
    const array = candidates.filter((data) => {
        if (isAvailablePrice((data as { price?: number }).price)) return true;
        const promotions = (data as { productPromotions?: ProductPromotion[] }).productPromotions || [];
        return promotions.some((p) => isAvailablePrice(p.promotionalPrice));
    });

    const res = array.reduce(
        (prev, data) => {
            const promotions = (data as { productPromotions?: ProductPromotion[] }).productPromotions || [];
            const [smallestPromotionalPrice, promo] = getSmallestValByProperty(promotions, 'promotionalPrice');

            const dataPrice = data.price || 0;
            let salePrice = dataPrice;
            let promotion: ProductPromotion | null = null;

            if (smallestPromotionalPrice !== Infinity && smallestPromotionalPrice < dataPrice) {
                salePrice = smallestPromotionalPrice;
                promotion = promo;
            }

            return salePrice < prev.minPrice ? { minPrice: salePrice, promotion, data } : prev;
        },
        { minPrice: Infinity, promotion: null, data: product } as LowestPriceResult
    );

    return {
        ...res,
        // when minPrice is infinity, meaning there is no variant with lowest price found, we rest the value to 0 as minPrice to be able to use this value on UI
        minPrice: res.minPrice === Infinity ? 0 : res.minPrice,
    };
};

/**
 * Find the highest effective (selling) price among variants for a master product.
 * Used to display price range (min–max) when product.priceMax is not in the response.
 */
function findHighestPrice(product: Product): number | undefined {
    const isMaster = product?.hitType === 'master' || !!(product?.type as ProductType | undefined)?.master;
    if (!isMaster || !product?.variants?.length) return undefined;
    let max = -Infinity;
    for (const data of product.variants) {
        const promotions = (data as { productPromotions?: ProductPromotion[] }).productPromotions || [];
        const [smallestPromo] = getSmallestValByProperty(promotions, 'promotionalPrice');
        const variantPrice = (data as { price?: number }).price;
        // Skip variants without a price for the active currency so the range max isn't dragged
        // down by `?? 0`. Use the promotional price as a fallback if the base price is missing.
        const hasBasePrice = isAvailablePrice(variantPrice);
        const hasPromoPrice = smallestPromo !== Infinity;
        if (!hasBasePrice && !hasPromoPrice) continue;
        const dataPrice = hasBasePrice ? (variantPrice as number) : Infinity;
        const effectivePrice = hasPromoPrice && smallestPromo < dataPrice ? smallestPromo : dataPrice;
        if (effectivePrice > max) max = effectivePrice;
    }
    return max === -Infinity ? undefined : max;
}

/**
 * This function extract the price information of a given product
 * If a product is a master,
 *  currentPrice: get the lowest price (including promotional prices) among variants
 *  listPrice: get the list price of the variant that has lowest price (including promotional price)
 *  maxPrice: the max price in tieredPrices of variant that has lowest price
 * @param {Product} product - product detail object
 * @param {object} opts - options to pass into the function like intl, quantity, and currency
 */
export const getPriceData = (product: Product, opts: { quantity?: number; currency?: string } = {}) => {
    const { quantity = 1, currency = 'USD' } = opts;

    // Check if this is a basket/order line item. We detect on `itemId` rather than the previously
    // co-required `basePrice` (which is optional in the SCAPI ProductItem schema) — but use a
    // `typeof === 'string'` check so an object that merely *declares* `itemId: undefined` (a spread
    // from a basket-shaped fixture, a future BFF correlation decoration on a catalog product, etc.)
    // doesn't take the basket branch and silently flag itself as `hasPrice: true`.
    const isBasketItem = typeof (product as { itemId?: unknown }).itemId === 'string';

    if (isBasketItem) {
        // For basket items, use basket-specific price fields
        const basketItem = product as ShopperBasketsV2.schemas['ProductItem'] | ShopperOrders.schemas['ProductItem'];

        const basePrice = basketItem.basePrice ?? 0;
        const unitPrice = basketItem.price ?? basePrice;
        // priceAfterItemDiscount is the final price after all discounts for the line item
        const discountedPrice = basketItem.priceAfterItemDiscount ?? unitPrice;
        // Calculate per-unit discounted price
        const itemQuantity = basketItem.quantity ?? 1;
        const currentPrice = itemQuantity > 0 ? discountedPrice / itemQuantity : unitPrice;

        // Check tieredPrices for the real list price (same logic as PDP path)
        const tieredPrices = product?.tieredPrices || [];
        const maxTieredPrice = tieredPrices.length
            ? Math.max(...tieredPrices.map((item) => item.price || 0))
            : undefined;
        const listPrice = maxTieredPrice && maxTieredPrice > basePrice ? maxTieredPrice : basePrice;
        const scale = 10 ** getCurrencyFractionDigits(currency);
        const isOnSale =
            Math.round(discountedPrice * scale) < Math.round(listPrice * (itemQuantity > 0 ? itemQuantity : 1) * scale);

        return {
            currentPrice,
            listPrice: isOnSale ? listPrice : undefined,
            pricePerUnit: unitPrice,
            isOnSale,
            isASet: false,
            isMaster: false,
            isRange: false,
            tieredPrice: undefined,
            maxPrice: undefined,
            // Basket/order line items always represent a real purchased item — never flag them as
            // having no price, regardless of currency.
            hasPrice: true,
        };
    }

    const productType = product?.type as ProductType | undefined;
    const isASet = product?.hitType === 'set' || !!productType?.set;
    const isMaster = product?.hitType === 'master' || !!productType?.master;

    // Whether a real price exists for the active currency. Delegated to the shared
    // `hasPurchasablePrice` so the "Price unavailable" display and the add-to-cart gate apply one
    // rule and can never disagree. SCAPI omits `price` when there is no price-book entry for the
    // currency (vs. `0` for a deliberately-free product), so a missing price means "no price",
    // not "free".
    const hasPrice = hasPurchasablePrice(product as ShopperProducts.schemas['Product']);

    let currentPrice: number;
    let variantWithLowestPrice: LowestPriceResult | null = null;

    // grab the variant that has the lowest price (including promotional price)
    if (isMaster) {
        variantWithLowestPrice = findLowestPrice(product) || null;
        currentPrice = variantWithLowestPrice?.minPrice || 0;
    } else {
        currentPrice = findLowestPrice(product)?.minPrice || 0;
    }

    // since the price is the lowest value among price books, each product will have at lease a single item tiered price at quantity 1
    // the highest value of tieredPrices is presumptively the list price
    const tieredPrices = variantWithLowestPrice?.data?.tieredPrices || product?.tieredPrices || [];
    const maxTieredPrice = tieredPrices?.length ? Math.max(...tieredPrices.map((item) => item.price || 0)) : undefined;
    const highestTieredPrice = tieredPrices.find((tier) => tier.price === maxTieredPrice);
    const listPrice = highestTieredPrice?.price;

    // if a product has tieredPrices, get the tiered that has the higher closest quantity to current quantity
    const filteredTiered = tieredPrices.filter((tiered) => (tiered.quantity || 0) <= quantity);
    const closestTieredPrice =
        filteredTiered.length &&
        filteredTiered.reduce((prev, curr) => {
            return Math.abs((curr.quantity || 0) - quantity) < Math.abs((prev.quantity || 0) - quantity) ? curr : prev;
        });

    // Check if product has a price range (priceMax is different from price)
    const hasPriceRange = product?.priceMax && product.priceMax !== product?.price;

    // Use priceMax as listPrice when there's a price range, otherwise use the calculated listPrice
    const finalListPrice = hasPriceRange ? product.priceMax : listPrice;

    // For master with multiple variants: use API priceMax when present, else compute max from variants
    const variantCount = product?.variants?.length ?? 0;
    const computedMaxForMaster =
        isMaster && variantCount > 1 && !product?.priceMax ? findHighestPrice(product) : undefined;
    const maxPrice = product?.priceMax ?? computedMaxForMaster ?? maxTieredPrice;

    return {
        currentPrice,
        listPrice: finalListPrice,
        pricePerUnit: product?.pricePerUnit,
        isOnSale: currentPrice < (finalListPrice || 0),
        isASet,
        isMaster,
        // For a product, set price is the lowest price of its children, so the price should be considered a range
        // For a master product, when it has more than 2 variants, we use the lowest priced variant, so it is  considered a range price
        //      but for master that has one variant, it is not considered range
        // For standard products, if priceMax is different from price, it should be considered a range
        isRange: (isMaster && variantCount > 1) || isASet || hasPriceRange || false,
        tieredPrice: closestTieredPrice && 'price' in closestTieredPrice ? closestTieredPrice.price : undefined,
        maxPrice,
        hasPrice,
    };
};
