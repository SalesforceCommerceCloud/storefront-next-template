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
import DynamicImage from '@/components/dynamic-image';
import { cn } from '@/lib/utils';
import { Link } from '@/components/link';
import { Button } from '@/components/ui/button';
import type { Order } from '@/components/account/order-list';
import { useTranslation } from 'react-i18next';
import { routes, routeHref } from '@/route-paths';
import { formatCurrency } from '@/lib/currency';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';

export { MAX_VISIBLE_TILES } from './constants';
import { MAX_VISIBLE_TILES } from './constants';

export interface LastOrderCardProps {
    order: Order;
    /** Compact stacks content and uses fluid thumbnails for narrow merchandising slots. */
    variant?: 'default' | 'compact';
    /** Called when "Add all to cart" is clicked — wired to useReorder by the page. */
    onAddAllToCart?: () => void;
    /** Shows a loading state on the primary CTA while the reorder action is in flight. */
    isAddingToCart?: boolean;
}

export function LastOrderCard({
    order,
    onAddAllToCart,
    isAddingToCart = false,
    variant = 'default',
}: LastOrderCardProps): ReactElement {
    const { t, i18n } = useTranslation('account');
    const { currency: siteCurrency } = useSite();

    const compact = variant === 'compact';
    const tileSize = compact ? 'aspect-square w-full max-w-16' : 'size-16 sm:size-20 md:size-24';
    const productItems = order.productItems ?? [];
    const visibleItems = productItems.slice(0, MAX_VISIBLE_TILES);
    const overflowCount = productItems.length - MAX_VISIBLE_TILES;

    const orderDetailUrl = routeHref(routes.accountOrderDetail, { orderNo: order.orderNo });

    const orderDate = new Date(order.orderDate);
    const placedLabel = isNaN(orderDate.getTime())
        ? t('orders.invalidDate')
        : new Intl.DateTimeFormat(i18n.language, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
          }).format(orderDate);

    const formattedTotal = formatCurrency(order.total, i18n.language, order.currency ?? siteCurrency);

    return (
        <div
            data-slot="last-order-card"
            data-variant={variant}
            className={cn(
                'overflow-hidden rounded-ui bg-separator text-foreground',
                compact && 'h-full @container/last-order'
            )}>
            <div
                className={cn(
                    'flex flex-col gap-6 p-6 md:p-8',
                    compact
                        ? 'grid grid-cols-1 @xl/last-order:grid-cols-2 items-center'
                        : 'md:flex-row md:items-center md:justify-between'
                )}>
                {/* Left: label, heading, meta, description, CTAs */}
                <div className="max-w-md">
                    <p className="text-sm font-medium text-muted-foreground">{t('lastOrderCard.label')}</p>
                    <h2 className={cn('mt-2 font-semibold tracking-tight', compact ? 'text-2xl' : 'text-3xl')}>
                        {t('lastOrderCard.heading', { orderNo: order.orderNo })}
                    </h2>
                    <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
                        <time dateTime={order.orderDate}>{placedLabel}</time>
                        <span aria-hidden="true">·</span>
                        <span>{t('lastOrderCard.itemCount', { count: order.itemCount })}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-foreground">{formattedTotal}</span>
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{t('lastOrderCard.description')}</p>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <Button
                            type="button"
                            onClick={onAddAllToCart}
                            disabled={isAddingToCart}
                            aria-busy={isAddingToCart}>
                            {isAddingToCart ? t('lastOrderCard.addingToCart') : t('lastOrderCard.addAllToCart')}
                        </Button>
                        <Button variant="outline" asChild>
                            <Link to={orderDetailUrl}>{t('lastOrderCard.viewInMyAccount')}</Link>
                        </Button>
                    </div>
                </div>

                {/* Right: 2×5 product image grid (up to 9 tiles + optional overflow) */}
                {visibleItems.length > 0 && (
                    <ul className={cn('grid grid-cols-5 gap-2', compact ? 'w-full max-w-sm' : 'md:justify-self-end')}>
                        {visibleItems.map((item, index) => (
                            // oxlint-disable-next-line react/no-array-index-key -- same productId can appear in multiple line items
                            <li key={`${item.productId}-${index}`}>
                                {item.imageUrl ? (
                                    <DynamicImage
                                        src={item.imageUrl}
                                        widths={[64, 96, 128, 192]}
                                        imageProps={{ className: 'size-full object-contain' }}
                                        alt={item.imageAlt ?? item.productName ?? ''}
                                        className={cn('rounded-ui bg-background p-1.5', tileSize)}
                                        loading="lazy"
                                    />
                                ) : (
                                    <div
                                        className={cn(
                                            'flex items-center justify-center rounded-ui bg-background text-xs text-muted-foreground',
                                            tileSize
                                        )}>
                                        ?
                                    </div>
                                )}
                            </li>
                        ))}
                        {overflowCount > 0 && (
                            <li>
                                <span
                                    className={cn(
                                        'flex items-center justify-center rounded-ui bg-primary text-sm font-semibold text-primary-foreground',
                                        tileSize
                                    )}>
                                    {t('lastOrderCard.overflow', { count: overflowCount })}
                                </span>
                            </li>
                        )}
                    </ul>
                )}
            </div>
        </div>
    );
}

export { LastOrderCardSkeleton } from './skeleton';

export default LastOrderCard;
