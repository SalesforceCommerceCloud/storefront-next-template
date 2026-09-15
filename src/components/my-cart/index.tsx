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
import { useMemo, type ReactElement } from 'react';
import { Link } from '@/components/link';
import { Truck } from 'lucide-react';

// Commerce SDK
import type { ShopperBasketsV2, ShopperProducts, ShopperPromotions } from '@/scapi';

// Components
import { UITarget } from '@/targets/ui-target';
import ProductPrice from '@/components/product-price';
import { getPriceData } from '@/components/product-price/utils';
import { useTranslation } from 'react-i18next';

// Hooks
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useConfig } from '@salesforce/storefront-next-runtime/config';

// Utils
import { formatCurrency } from '@/lib/currency';
import { findImageGroupBy } from '@/lib/product/image-groups-utils';
import { createProductUrl, getDisplayVariationValues } from '@/lib/product/product-utils';
import { toImageUrl } from '@/lib/images/dynamic-image';

/**
 * Props for the MyCart component
 *
 * @interface MyCartProps
 * @property {ShopperBasketsV2.schemas['Basket']} basket
 * @property {Record<string, ShopperProducts.schemas['Product']>} [productMap]
 * @property {Record<string, ShopperPromotions.schemas['Promotion']>} [promotions]
 */
interface MyCartProps {
    basket: ShopperBasketsV2.schemas['Basket'];
    productMap?: Record<string, ShopperProducts.schemas['Product']>;
    promotions?: Record<string, ShopperPromotions.schemas['Promotion']>;
}

/**
 * MyCart component that displays cart items in a collapsible accordion
 *
 * This component renders:
 * - A collapsible accordion showing item count
 * - Product items in individual cards
 * - Product image, name, attributes, and price with savings
 *
 * Used on checkout page to display cart items separately from order summary
 *
 * @param props - Component props
 * @returns JSX element representing the my cart component
 */
export default function MyCart({ basket, productMap = {} }: MyCartProps): ReactElement {
    const { t } = useTranslation('checkout');
    const { t: tCart } = useTranslation('cart');
    const { i18n } = useTranslation();
    const { currency } = useSite();
    const config = useConfig();

    const productItems = useMemo(() => {
        return (basket?.productItems || []).map((item, index) => {
            const productData = item.itemId ? productMap[item.itemId] : undefined;
            const productName = item.productName || productData?.name || 'Product';
            const productId = productData?.master?.masterId || productData?.id || item.productId;

            // Combine basket item with product data
            const enrichedProduct = {
                ...productData,
                ...item,
            } as ShopperProducts.schemas['Product'] & ShopperBasketsV2.schemas['ProductItem'];

            // Get product image
            const imageGroup = findImageGroupBy(productData?.imageGroups, {
                viewType: 'small',
                selectedVariationAttributes: productData?.variationValues,
            });
            const image = imageGroup?.images?.[0];
            const imageUrl = toImageUrl({ image, config }) || '';

            // Get variation attributes from product API data (basket items don't carry variation metadata)
            const displayVariationValues = getDisplayVariationValues(
                productData?.variationAttributes,
                productData?.variationValues
            );

            const quantity = item.quantity ?? 1;

            // Calculate savings using getPriceData (same logic as ProductPrice component)
            const priceData = getPriceData(enrichedProduct, { quantity, currency });
            const savings =
                priceData.isOnSale && priceData.listPrice
                    ? (priceData.listPrice - priceData.currentPrice) * quantity
                    : 0;
            const hasSavings = savings > 0;

            return (
                <div key={item.itemId || `item-${index}`} data-testid={`my-cart-item-${item.productId ?? index}`}>
                    <div className="flex items-start gap-3 md:gap-4">
                        {/* Column 1: Product Image */}
                        <div className="flex-shrink-0">
                            <div className="w-16 h-16 md:w-20 md:h-20 bg-muted overflow-hidden flex items-center justify-center">
                                {imageUrl ? (
                                    <img
                                        src={imageUrl}
                                        alt={image?.alt || productName}
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-muted" />
                                )}
                            </div>
                        </div>

                        {/* Column 2: Product Info (name, variants, price, qty) */}
                        <div className="flex-1 min-w-0">
                            <Link
                                to={createProductUrl(productId)}
                                className="text-sm font-semibold text-foreground hover:text-primary">
                                {productName}
                            </Link>

                            <div className="mt-1 space-y-0.5 text-xs">
                                {Object.entries(displayVariationValues).map(([name, value]) => (
                                    <div key={name}>
                                        {name}: {value}
                                    </div>
                                ))}
                            </div>

                            <div className="mt-1">
                                <ProductPrice
                                    product={enrichedProduct}
                                    currency={currency}
                                    type="total"
                                    quantity={quantity}
                                    labelForA11y={productName}
                                    currentPriceProps={{
                                        className: 'text-sm font-semibold text-foreground',
                                    }}
                                    listPriceProps={{
                                        className: 'text-sm text-muted-foreground line-through',
                                    }}
                                    hidePromo
                                />
                                {quantity > 1 && (
                                    <div className="text-xs">
                                        {formatCurrency(
                                            (item.priceAfterItemDiscount ?? item.price ?? 0) / quantity,
                                            i18n.language,
                                            currency
                                        )}{' '}
                                        each
                                    </div>
                                )}
                            </div>

                            <div className="mt-0.5 text-xs">
                                {tCart('attributes.quantity')} {quantity}
                            </div>
                        </div>

                        {/* Column 3: Tags (delivery, savings) */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-xs bg-muted px-1.5 py-0.5 flex items-center gap-1">
                                <Truck className="size-3" />
                                {t('myCart.delivery')}
                            </span>
                            {hasSavings && (
                                <span className="text-xs font-medium bg-muted px-1.5 py-0.5">
                                    {t('myCart.saved', {
                                        amount: formatCurrency(savings, i18n.language, currency),
                                    })}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            );
        });
    }, [basket?.productItems, productMap, currency, i18n.language, config, t, tCart]);

    return (
        <div className="w-full">
            <UITarget targetId="sfcc.myCart.header.before" />
            <div
                data-testid="my-cart-toggle"
                className="divide-y divide-border -mx-[var(--cart-divider-extend,0px)] [&>*]:px-4 [&>*]:py-5 md:[&>*]:px-[var(--cart-divider-extend,0px)] md:[&>*]:py-6">
                {productItems}
            </div>
        </div>
    );
}
