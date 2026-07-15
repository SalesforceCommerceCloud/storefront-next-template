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
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Typography } from '@/components/typography';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import {
    OrderListItem,
    type OrderListItemData,
    type OrderProductItem,
    type PickupLocation,
} from '@/components/account/order-list-item';
import { getOffsetLimitPaginationState } from '@/lib/pagination-utils';
import type { OrderStatusType } from '@/lib/order/status';
import { routes } from '@/route-paths';

/** Re-export for consumers. Single source of truth: @/lib/order/status */
export type { OrderStatusType };

/**
 * Order data structure for display.
 * Extended to support the new OrderListItem component.
 */
export type Order = {
    orderNo: string;
    orderDate: string;
    status: string;
    statusLabel?: string;
    total: number;
    currency?: string;
    itemCount: number;
    productItems?: OrderProductItem[];
    pickupLocation?: PickupLocation;
};

/**
 * Props for the OrderList component.
 */
export type OrderListProps = {
    title: string;
    subtitle?: string;
    orders: Order[];
    emptyMessage?: string;
    /** Maximum number of product thumbnails per order */
    maxThumbnails?: number;
    /** Callback when View Details is clicked */
    onViewDetails?: (orderNo: string) => void;
};

/**
 * Convert Order to OrderListItemData format.
 */
function toOrderListItemData(order: Order): OrderListItemData {
    return {
        orderNo: order.orderNo,
        orderDate: order.orderDate,
        total: order.total,
        currency: order.currency,
        status: order.status,
        statusLabel: order.statusLabel,
        itemCount: order.itemCount,
        productItems: order.productItems,
        pickupLocation: order.pickupLocation,
    };
}

/**
 * Empty state displayed when the customer has no orders.
 */
function OrderListEmpty({ message }: { message?: string }): ReactElement {
    const { t } = useTranslation('account');

    return (
        <Card className="border-border m-0 border-b-0">
            <CardContent className="p-0">
                <div className="py-4 space-y-4 flex flex-col items-center justify-center">
                    <Typography variant="h4" className="text-muted-foreground w-fit">
                        {message || t('orders.empty')}
                    </Typography>
                    <Button asChild>
                        <Link to={routes.home}>{t('orders.continueShopping')}</Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * Page header for the order list with title and optional subtitle.
 * Extracted so the route can render it outside Suspense for instant display.
 */
export function OrderListHeader({ title, subtitle }: { title: string; subtitle?: string }): ReactElement {
    return (
        <Card className="bg-card border-border rounded-b-none border-b-0">
            <CardContent className="px-5">
                <Typography variant="h4" className="text-foreground mb-1.5" tabIndex={0}>
                    {title}
                </Typography>
                {subtitle && (
                    <Typography variant="small" as="p" className="text-sm text-muted-foreground">
                        {subtitle}
                    </Typography>
                )}
            </CardContent>
        </Card>
    );
}

/**
 * Order items body with footer. Renders order cards, empty state, total count, and optional pagination.
 * Designed to be used inside Suspense/Await so the header can render instantly.
 * When total, offset, and limit are provided, shows "X–Y of Z orders" and prev/next links.
 */
export function OrderListBody({
    orders,
    emptyMessage,
    maxThumbnails = 12,
    onViewDetails,
    total: totalCount,
    offset,
    limit,
}: Omit<OrderListProps, 'title' | 'subtitle'> & {
    total?: number;
    offset?: number;
    limit?: number;
}): ReactElement {
    const { t } = useTranslation('account');

    const hasPaginationData = typeof totalCount === 'number' && typeof offset === 'number' && typeof limit === 'number';

    const { safeLimit, startIndex, endIndex, totalPages, hasNext, hasPrevious, nextOffset, prevOffset } =
        hasPaginationData
            ? getOffsetLimitPaginationState({
                  offset: offset ?? 0,
                  limit: limit ?? 10,
                  total: totalCount ?? 0,
                  defaultLimit: 10,
                  currentPageSize: orders.length,
              })
            : {
                  safeLimit: limit ?? 10,
                  startIndex: 1,
                  endIndex: orders.length,
                  totalPages: 1,
                  hasNext: false,
                  hasPrevious: false,
                  nextOffset: 0,
                  prevOffset: 0,
              };

    return (
        <>
            {orders.length === 0 ? (
                <OrderListEmpty message={emptyMessage} />
            ) : (
                <ul role="list" className="space-y-4 m-0 border-x border-t border-border rounded-t-none">
                    {orders.map((order) => (
                        <li key={order.orderNo}>
                            <OrderListItem
                                order={toOrderListItemData(order)}
                                maxThumbnails={maxThumbnails}
                                onViewDetails={onViewDetails}
                            />
                        </li>
                    ))}
                </ul>
            )}
            <div className="p-6 m-0 border-b border-x border-border rounded-b-xl flex flex-row items-center w-full gap-4">
                <Typography
                    variant="small"
                    as="p"
                    className="text-muted-foreground min-w-0 shrink"
                    data-testid="total-orders-text">
                    {hasPaginationData
                        ? totalPages === 1
                            ? t('orders.totalOrders', { count: totalCount })
                            : t('orders.totalOrdersRange', {
                                  start: startIndex,
                                  end: endIndex,
                                  total: totalCount,
                              })
                        : t('orders.totalOrders', { count: orders.length })}
                </Typography>
                {hasPaginationData && (
                    <nav aria-label={t('orders.paginationLabel')} className="ml-auto shrink-0 flex items-center gap-2">
                        {hasPrevious ? (
                            <Link
                                to={`${routes.accountOrders}?offset=${prevOffset}&limit=${safeLimit}`}
                                prefetch="intent"
                                aria-label={t('orders.paginationPrevious')}
                                className={buttonVariants({
                                    variant: 'outline',
                                    size: 'default',
                                    className: 'gap-1.5 px-4 py-2',
                                })}>
                                <ChevronLeftIcon />
                                <span className="hidden sm:inline">{t('orders.paginationPrevious')}</span>
                            </Link>
                        ) : (
                            <span
                                aria-disabled
                                className={buttonVariants({
                                    variant: 'outline',
                                    size: 'default',
                                    className: 'gap-1.5 px-4 py-2 pointer-events-none opacity-50 cursor-not-allowed',
                                })}>
                                <ChevronLeftIcon />
                                <span className="hidden sm:inline">{t('orders.paginationPrevious')}</span>
                            </span>
                        )}
                        {hasNext ? (
                            <Link
                                to={`${routes.accountOrders}?offset=${nextOffset}&limit=${safeLimit}`}
                                prefetch="intent"
                                aria-label={t('orders.paginationNext')}
                                className={buttonVariants({
                                    variant: 'outline',
                                    size: 'default',
                                    className: 'gap-1.5 px-4 py-2',
                                })}>
                                <span className="hidden sm:inline">{t('orders.paginationNext')}</span>
                                <ChevronRightIcon />
                            </Link>
                        ) : (
                            <span
                                aria-disabled
                                className={buttonVariants({
                                    variant: 'outline',
                                    size: 'default',
                                    className: 'gap-1.5 px-4 py-2 pointer-events-none opacity-50 cursor-not-allowed',
                                })}>
                                <span className="hidden sm:inline">{t('orders.paginationNext')}</span>
                                <ChevronRightIcon />
                            </span>
                        )}
                    </nav>
                )}
            </div>
        </>
    );
}

/**
 * Reusable order list component that displays a list of order cards.
 * Composes OrderListHeader + OrderListBody for convenience.
 *
 * @example
 * ```tsx
 * <OrderList
 *   title="Order History"
 *   subtitle="View and track your orders"
 *   orders={orders}
 *   onViewDetails={(orderNo) => navigate(`/orders/${orderNo}`)}
 * />
 * ```
 */
export function OrderList({
    title,
    subtitle,
    orders,
    emptyMessage,
    maxThumbnails = 12,
    onViewDetails,
}: OrderListProps): ReactElement {
    return (
        <div className="space-y-5">
            <OrderListHeader title={title} subtitle={subtitle} />
            <OrderListBody
                orders={orders}
                emptyMessage={emptyMessage}
                maxThumbnails={maxThumbnails}
                onViewDetails={onViewDetails}
            />
        </div>
    );
}

/**
 * Skeleton for order list items. Renders a configurable number of placeholder
 * cards that match the real OrderListItem layout, plus a footer bar.
 * Used as the Suspense fallback on both the order-history page and the
 * account-overview recent-orders section.
 */
export function OrderListSkeleton(): ReactElement {
    return (
        <>
            <div className="space-y-4 m-0 border-x border-t border-border">
                {Array.from({ length: 3 }, (_, i) => (
                    <Card key={i} className="py-0 border-0 border-border">
                        <CardContent className="p-6 space-y-4 border-b border-border animate-pulse">
                            <div className="flex flex-wrap items-start justify-between border-b border-border -mx-6 -mt-6 px-6 pt-3 pb-3 mb-6 bg-muted">
                                <div className="flex flex-wrap gap-x-8 gap-y-2">
                                    <div className="h-10 w-24 bg-muted-foreground/20 rounded-ui" />
                                    <div className="h-10 w-20 bg-muted-foreground/20 rounded-ui" />
                                    <div className="h-10 w-16 bg-muted-foreground/20 rounded-ui" />
                                </div>
                                <div className="h-8 w-24 bg-muted-foreground/20 rounded-full" />
                            </div>
                            <div className="flex gap-2">
                                <div className="w-16 h-16 bg-muted-foreground/20 rounded-lg" />
                                <div className="w-16 h-16 bg-muted-foreground/20 rounded-lg" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
            <div className="p-6 m-0 border-b border-x border-border rounded-b-xl">
                <div className="h-5 w-32 bg-muted-foreground/20 rounded-ui" />
            </div>
        </>
    );
}

// Re-export types from OrderListItem for convenience
export type { OrderProductItem, PickupLocation, OrderListItemData };

export default OrderList;
