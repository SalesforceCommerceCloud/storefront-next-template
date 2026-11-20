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
 * Find the lowest native qualified product/variant price, including returned promotional prices
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
    const array = candidates.filter((data) => isAvailablePrice((data as { price?: number }).price));

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
        // Match the purchase gate and range minimum: promotion metadata alone
        // cannot make an otherwise unpriced variant purchasable.
        if (!isAvailablePrice(variantPrice)) continue;
        const hasPromoPrice = smallestPromo !== Infinity;
        const dataPrice = variantPrice;
        const effectivePrice = hasPromoPrice && smallestPromo < dataPrice ? smallestPromo : dataPrice;
        if (effectivePrice > max) max = effectivePrice;
    }
    return max === -Infinity ? undefined : max;
}

/**
 * This function extract the price information of a given product
 * If a product is a master,
 *  currentPrice: get the lowest price (including promotional prices) among variants
 *  listPrice: the native base price when a native promotional price is lower
 *  maxPrice: native priceMax, or a display range across qualified variant prices
 * @param {Product} product - product detail object
 * @param {object} opts - options for currency-aware comparison
 */
export const getPriceData = (product: Product, opts: { currency?: string } = {}) => {
    const { currency = 'USD' } = opts;

    // Check if this is a basket/order line item. We detect on `itemId` rather than the previously
    // co-required `basePrice` (which is optional in the SCAPI ProductItem schema) — but use a
    // `typeof === 'string'` check so an object that merely *declares* `itemId: undefined` (a spread
    // from a basket-shaped fixture, a future BFF correlation decoration on a catalog product, etc.)
    // doesn't take the basket branch and silently flag itself as `hasPrice: true`.
    const isBasketItem = typeof (product as { itemId?: unknown }).itemId === 'string';

    if (isBasketItem) {
        // For basket items, use basket-specific price fields
        const basketItem = product as ShopperBasketsV2.schemas['ProductItem'] | ShopperOrders.schemas['ProductItem'];

        // basePrice is per unit; price and priceAfterItemDiscount are line amounts.
        // Catalog book/tier data cannot override a calculated basket amount.
        const itemQuantity = basketItem.quantity ?? 1;
        const basePrice = basketItem.basePrice;
        const linePrice = basketItem.price ?? (basePrice == null ? undefined : basePrice * itemQuantity);
        const discountedPrice = basketItem.priceAfterItemDiscount ?? linePrice;
        const hasPrice = isAvailablePrice(discountedPrice) && Number.isFinite(itemQuantity) && itemQuantity > 0;
        const currentPrice = hasPrice ? discountedPrice / itemQuantity : 0;
        const listPrice = basePrice;
        const scale = 10 ** getCurrencyFractionDigits(currency);
        const isOnSale =
            hasPrice &&
            isAvailablePrice(listPrice) &&
            Math.round(discountedPrice * scale) < Math.round(listPrice * itemQuantity * scale);

        return {
            currentPrice,
            listPrice: isOnSale ? listPrice : undefined,
            pricePerUnit: basePrice,
            isOnSale,
            isASet: false,
            isMaster: false,
            isRange: false,
            tieredPrice: undefined,
            maxPrice: undefined,
            hasPrice,
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

    // Native base and promotional amounts are already qualified by Ecom. Per-book/tier
    // arrays are not a list-price contract and must not supply storefront precedence.
    const nativeBasePrice = variantWithLowestPrice?.data?.price ?? product?.price;
    const listPrice = isAvailablePrice(nativeBasePrice) && currentPrice < nativeBasePrice ? nativeBasePrice : undefined;
    const hasPriceRange =
        isAvailablePrice(product?.priceMax) && isAvailablePrice(product?.price) && product.priceMax > product.price;

    // For master with multiple variants: use API priceMax when present, else compute max from variants
    const variantCount = product?.variants?.length ?? 0;
    const computedMaxForMaster =
        isMaster && variantCount > 1 && !product?.priceMax ? findHighestPrice(product) : undefined;
    const maxPrice = product?.priceMax ?? computedMaxForMaster;

    return {
        currentPrice,
        listPrice,
        pricePerUnit: product?.pricePerUnit,
        isOnSale: hasPrice && listPrice !== undefined,
        isASet,
        isMaster,
        // For a product, set price is the lowest price of its children, so the price should be considered a range
        // For a master product, when it has more than 2 variants, we use the lowest priced variant, so it is  considered a range price
        //      but for master that has one variant, it is not considered range
        // For standard products, if priceMax is different from price, it should be considered a range
        isRange: (isMaster && variantCount > 1) || isASet || hasPriceRange || false,
        tieredPrice: undefined,
        maxPrice,
        hasPrice,
    };
};
