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
import type { ReactElement } from 'react';
import { Link } from '@/components/link';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/typography';
import {
    ProductItemVariantImage,
    ProductItemVariantName,
    ProductItemVariantAttributes,
} from '@/components/product-item';
import ProductPrice from '@/components/product-price';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useTranslation } from 'react-i18next';
import type { EnrichedProductItem } from '@/lib/product/product-utils';
import type { ShopperOrders, ShopperProducts } from '@/scapi';
import { routes, routeHref } from '@/route-paths';
import { accountPrimaryButtonClasses } from '@/lib/account-action-styles';
// @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
import { getOrderLineReviewKey } from '@/components/account/order-details/order-line-review-key';
import { UITarget } from '@/targets/ui-target';
import { OrderLineReviewSlot } from '@/extensions/ratings-reviews/components/order-line-review-context';
// @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS

type OrderItem = ShopperOrders.schemas['ProductItem'];

export type ProductDataById = Record<string, ShopperProducts.schemas['Product'] | undefined>;

export type OrderItemsListProps = {
    items: OrderItem[];
    productsById: ProductDataById;
    /** Parent order number; used in fallback line keys when SCAPI omits `itemId` on a line. */
    orderNo?: string;
    /** When set with `onOrderLineReviewSubmitted`, shows Rate & review per shippable line with product data. */
    submittedReviewLineKeys?: ReadonlySet<string>;
    onOrderLineReviewSubmitted?: (lineKey: string) => void;
};

/**
 * Renders a list of order line items with image, name, variant, quantity, price, and Buy Again link.
 * Matches PWA-Kit order details line-item pattern (product row with image, details, price, reorder).
 */
export function OrderItemsList({
    items,
    productsById,
    orderNo,
    submittedReviewLineKeys,
    onOrderLineReviewSubmitted,
}: OrderItemsListProps): ReactElement {
    const { t } = useTranslation('account');
    const { t: tProduct } = useTranslation('product');
    const { currency } = useSite();
    const showLineReviews = submittedReviewLineKeys != null && onOrderLineReviewSubmitted != null;

    if (items.length === 0) {
        return (
            <Typography variant="p" className="text-muted-foreground">
                {t('orders.emptyItemsFallback')}
            </Typography>
        );
    }

    return (
        <ul className="space-y-4">
            {items.map((item, index) => {
                const productData = item.productId ? productsById[item.productId] : undefined;
                const productKey = item.itemId ? `${item.itemId}-${index}` : `${item.productId ?? 'item'}-${index}`;
                const productName = item.productName;
                // @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
                const lineReviewKey = getOrderLineReviewKey(orderNo, item, index);
                const reviewSubmitted = submittedReviewLineKeys?.has(lineReviewKey) ?? false;
                // @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
                const enrichedItem: EnrichedProductItem = { ...productData, ...item } as EnrichedProductItem;
                return (
                    <li key={productKey} data-testid="order-item">
                        <div className="flex flex-col gap-4 rounded-ui border border-muted-foreground/20 bg-card p-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center">
                            <Link
                                to={routeHref(routes.product, { productId: item.productId ?? '' })}
                                className="flex-shrink-0 block"
                                aria-label={
                                    productName
                                        ? tProduct('viewProductAriaLabel', { productName })
                                        : t('orders.productImageLinkFallback')
                                }>
                                <ProductItemVariantImage productItem={enrichedItem} className="h-24 w-24" />
                            </Link>
                            <div className="min-w-0 flex-1 space-y-1">
                                <ProductItemVariantName productItem={enrichedItem} />
                                <ProductItemVariantAttributes productItem={enrichedItem} />
                                <p className="text-xs text-muted-foreground">
                                    {t('orders.quantityLabel', { count: item.quantity ?? 1 })}
                                </p>
                                {showLineReviews && productData ? (
                                    <div className="pt-1">
                                        {/* @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS */}
                                        <OrderLineReviewSlot
                                            product={productData}
                                            lineKey={lineReviewKey}
                                            reviewSubmitted={reviewSubmitted}
                                            onLineReviewSubmitted={onOrderLineReviewSubmitted}>
                                            <UITarget targetId="sfcc.account.orderDetail.lineReview" />
                                        </OrderLineReviewSlot>
                                        {/* @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS */}
                                    </div>
                                ) : null}
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1 sm:self-start">
                                {currency ? (
                                    <ProductPrice
                                        product={item}
                                        currency={currency}
                                        quantity={item.quantity ?? 1}
                                        labelForA11y={productName}
                                    />
                                ) : null}
                                {item.productId && (
                                    <Button
                                        asChild
                                        variant="default"
                                        size="sm"
                                        className={`${accountPrimaryButtonClasses} text-xs`}>
                                        <Link to={routeHref(routes.product, { productId: item.productId })}>
                                            {t('orders.buyAgain')}
                                        </Link>
                                    </Button>
                                )}
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

export default OrderItemsList;
