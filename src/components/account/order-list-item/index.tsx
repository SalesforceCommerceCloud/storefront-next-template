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

import type { ReactElement, ReactNode } from 'react';
import { Link } from '@/components/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Typography } from '@/components/typography';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, MapPin, X } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { cn } from '@/lib/utils';
import {
    ORDER_STATUS_BADGE_CLASS,
    formatStatusFallbackLabel,
    getOrderReturnStatusConfig,
    getOrderStatusConfig,
    type OrderReturnStatusType,
} from '@/lib/order/status';
import { routes, routeHref } from '@/route-paths';

const BADGE_BASE_CLASSES = 'shrink-0 font-semibold border-0 py-1 w-fit';
const ON_MUTED_CAPTION_CLASS = 'text-xs font-normal text-muted-foreground';
const ORDER_HEADER_LABEL_CLASS = 'text-xs font-medium text-muted-foreground';

/**
 * Product item in an order for thumbnail display.
 */
export interface OrderProductItem {
    productId: string;
    quantity: number;
    imageUrl?: string;
    imageAlt?: string;
    /** Display name from catalog or SCAPI line item when available */
    productName?: string;
}

/**
 * Pickup location information.
 */
export interface PickupLocation {
    name: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
}

/**
 * Order data structure for the list item display.
 */
export interface OrderListItemData {
    orderNo: string;
    orderDate: string;
    total: number;
    currency?: string;
    status: string;
    statusLabel?: string;
    /** Derived order-level cancel status; takes priority over return, fulfillment, and raw status badges. */
    cancelStatus?: 'cancelled';
    /**
     * Derived order-level return status (aggregated from item-level omsData). When
     * set, the status badge shows the informational return label instead of the raw
     * `status`, which stays stale after a return. See `getOrderReturnStatus`.
     */
    returnStatus?: OrderReturnStatusType;
    itemCount: number;
    productItems?: OrderProductItem[];
    pickupLocation?: PickupLocation;
}

/**
 * Props for the OrderListItem component.
 */
export interface OrderListItemProps {
    order: OrderListItemData;
    /** Maximum number of product thumbnails to show before "+X" indicator */
    maxThumbnails?: number;
    /** Callback when View Details is clicked */
    onViewDetails?: (orderNo: string) => void;
    /** Custom class name */
    className?: string;
}

/**
 * Format a date string for display using the current locale.
 */
function formatOrderDate(dateString: string, locale: string, invalidDateLabel: string): string {
    try {
        const date = new Date(dateString);
        // Check if date is invalid
        if (isNaN(date.getTime())) {
            return invalidDateLabel;
        }
        return date.toLocaleDateString(locale, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    } catch {
        return invalidDateLabel;
    }
}

/**
 * Cancel status → Return status → known SCAPI status → raw fallback label.
 * Mirrors PWA Kit's `OrderStatusBadge` precedence — the raw `status` field already
 * falls back through `Order.status ?? Order.omsData?.status` in the loader.
 */
function OrderStatusBadge({
    status,
    label,
    cancelStatus,
    returnStatus,
}: {
    status: string;
    label?: string;
    cancelStatus?: 'cancelled';
    returnStatus?: OrderReturnStatusType;
}): ReactNode {
    const { t } = useTranslation('account');
    if (cancelStatus) {
        return (
            <Badge
                data-testid="order-cancel-status-badge"
                className={cn(
                    BADGE_BASE_CLASSES,
                    'border-transparent bg-status-critical/20 text-status-critical-foreground'
                )}>
                <X data-testid="order-status-icon" className="mr-1 inline size-3.5" aria-hidden />
                {t('orders.status.cancelled')}
            </Badge>
        );
    }
    const returnConfig = getOrderReturnStatusConfig(returnStatus);
    if (returnConfig) {
        return (
            <Badge data-testid="order-return-status-badge" className={cn(BADGE_BASE_CLASSES, returnConfig.className)}>
                {t(returnConfig.labelKey)}
            </Badge>
        );
    }
    const config = getOrderStatusConfig(status);
    const raw = label?.trim() || formatStatusFallbackLabel(status);
    if (config) {
        const Icon = config.icon === 'check' ? Check : config.icon === 'x' ? X : null;
        return (
            <Badge data-testid="order-status-badge" className={cn(BADGE_BASE_CLASSES, config.className)}>
                {Icon ? <Icon data-testid="order-status-icon" className="mr-1 size-3.5" aria-hidden /> : null}
                {label ?? t(config.labelKey)}
            </Badge>
        );
    }
    if (!raw) {
        return null;
    }
    return (
        <Badge data-testid="order-status-badge" className={cn(BADGE_BASE_CLASSES, ORDER_STATUS_BADGE_CLASS.success)}>
            {raw}
        </Badge>
    );
}

/**
 * Product thumbnail component with quantity badge.
 */
function ProductThumbnail({ item }: { item: OrderProductItem }): ReactElement {
    return (
        <div className="relative">
            <div className="w-16 h-16 overflow-hidden rounded-ui bg-muted border border-border">
                {item.imageUrl ? (
                    <img
                        src={item.imageUrl}
                        alt={item.imageAlt || ''}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full bg-muted" />
                )}
            </div>
            {item.quantity > 1 && (
                <span
                    className="absolute -top-1 -right-1 flex min-w-4 h-4 items-center justify-center border-2 border-background bg-primary px-0.5 text-[10px] font-bold text-primary-foreground"
                    aria-label={`Quantity: ${item.quantity}`}>
                    {item.quantity}
                </span>
            )}
        </div>
    );
}

/**
 * Overflow indicator for additional products.
 */
function OverflowIndicator({ count }: { count: number }): ReactElement {
    return (
        <div className="w-16 h-16 bg-muted border border-border rounded-ui flex items-center justify-center">
            <Typography variant="small" as="span" className="text-muted-foreground">
                +{count}
            </Typography>
        </div>
    );
}

/**
 * Pickup location card component.
 */
function PickupLocationCard({ location }: { location: PickupLocation }): ReactElement {
    const { t } = useTranslation('account');
    const fullAddress = `${location.address}, ${location.city}, ${location.state} ${location.postalCode}`;

    return (
        <Card className="rounded-ui bg-muted border-border p-0 ">
            <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                    <MapPin className="size-4 text-muted-foreground" aria-hidden />
                    <Typography variant="small" as="span" className="font-semibold text-foreground">
                        {t('orders.pickupLocation')}
                    </Typography>
                </div>

                <div className="space-y-1 pl-6">
                    <div>
                        <Typography variant="small" as="p" className={ON_MUTED_CAPTION_CLASS}>
                            {t('orders.location')}
                        </Typography>
                        <Typography variant="small" as="p" className="text-foreground">
                            {location.name}
                        </Typography>
                    </div>

                    <div>
                        <Typography variant="small" as="p" className={ON_MUTED_CAPTION_CLASS}>
                            {t('orders.address')}
                        </Typography>
                        <Typography variant="small" as="p" className="text-foreground font-normal">
                            {fullAddress}
                        </Typography>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * OrderListItem component displays a single order in a card format.
 *
 * Features:
 * - Order date, total, and item count in header
 * - Status badge with color coding
 * - Product thumbnail gallery with quantity badges
 * - Optional pickup location details
 * - View details link and download receipt button
 *
 * @example
 * ```tsx
 * <OrderListItem
 *   order={{
 *     orderNo: 'ORD-001',
 *     orderDate: '2024-09-14T10:30:00Z',
 *     total: 48.38,
 *     status: 'ready_for_pickup',
 *     itemCount: 2,
 *     productItems: [
 *       { productId: '1', quantity: 1, imageUrl: '/img/shirt.jpg', imageAlt: 'Shirt' },
 *       { productId: '2', quantity: 2, imageUrl: '/img/pants.jpg', imageAlt: 'Pants' },
 *     ],
 *     pickupLocation: {
 *       name: 'Salesforce Foundations San Francisco',
 *       address: '415 Mission Street',
 *       city: 'San Francisco',
 *       state: 'CA',
 *       postalCode: '94105',
 *     },
 *   }}
 *   onViewDetails={(orderNo) => navigate(`/account/orders/${orderNo}`)}
 * />
 * ```
 */
export function OrderListItem({
    order,
    maxThumbnails = 12,
    onViewDetails,
    className,
}: OrderListItemProps): ReactElement {
    const { t, i18n } = useTranslation('account');
    const invalidDateLabel = t('orders.invalidDate');
    const { currency: siteCurrency } = useSite();

    const productItems = order.productItems ?? [];
    const visibleProducts = productItems.slice(0, maxThumbnails);
    const overflowCount = productItems.length - maxThumbnails;

    const orderDetailsUrl = routeHref(routes.accountOrderDetail, { orderNo: order.orderNo });

    return (
        <Link
            to={orderDetailsUrl}
            className={cn('block transition-opacity hover:opacity-95 m-0', className)}
            onClick={() => onViewDetails?.(order.orderNo)}>
            <Card className="order-list-item-card py-0 border-0 border-border border-b border-separator hover:bg-transparent">
                <CardContent className="p-6 space-y-4 border-b border-separator">
                    {/* Header: Order ID, Date, Total, Items + Status */}
                    <div className="flex flex-wrap items-start justify-between -mx-6 -mt-6 px-6 pt-3 pb-3 mb-6 border-b border-separator bg-muted">
                        <div className="flex flex-wrap gap-x-8 gap-y-2">
                            <div className="space-y-2">
                                <Typography variant="small" as="p" className={ORDER_HEADER_LABEL_CLASS}>
                                    {t('orders.tableHeaders.orderNumber')}
                                </Typography>
                                <Typography variant="small" as="p" className="text-foreground font-medium">
                                    {order.orderNo.startsWith('#') ? order.orderNo : `#${order.orderNo}`}
                                </Typography>
                            </div>
                            <div className="space-y-2">
                                <Typography variant="small" as="p" className={ORDER_HEADER_LABEL_CLASS}>
                                    {t('orders.orderDate')}
                                </Typography>
                                <Typography variant="small" as="p" className="text-foreground">
                                    {formatOrderDate(order.orderDate, i18n.language, invalidDateLabel)}
                                </Typography>
                            </div>
                            <div className="space-y-2">
                                <Typography variant="small" as="p" className={ORDER_HEADER_LABEL_CLASS}>
                                    {t('orders.total')}
                                </Typography>
                                <Typography variant="small" as="p" className="text-foreground">
                                    {formatCurrency(order.total, i18n.language, order.currency ?? siteCurrency)}
                                </Typography>
                            </div>
                            <div className="space-y-2">
                                <Typography variant="small" as="p" className={ORDER_HEADER_LABEL_CLASS}>
                                    {t('orders.items', { count: order.itemCount })}
                                </Typography>
                                <Typography variant="small" as="p" className="text-foreground font-semibold">
                                    {order.itemCount}
                                </Typography>
                            </div>
                        </div>

                        <OrderStatusBadge
                            status={order.status}
                            label={order.statusLabel}
                            cancelStatus={order.cancelStatus}
                            returnStatus={order.returnStatus}
                        />
                    </div>

                    {/* Product Thumbnails */}
                    {productItems.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {visibleProducts.map((item, idx) => (
                                // eslint-disable-next-line react/no-array-index-key -- same productId can appear in multiple line items
                                <ProductThumbnail key={`${item.productId}-${idx}`} item={item} />
                            ))}
                            {overflowCount > 0 && <OverflowIndicator count={overflowCount} />}
                        </div>
                    )}

                    {/* Pickup Location (if exists) */}
                    {order.pickupLocation && <PickupLocationCard location={order.pickupLocation} />}

                    {/* Footer: View Details Link */}
                    <div className="pt-2">
                        <Typography
                            variant="small"
                            as="span"
                            className="inline-flex items-center gap-1 text-foreground hover:underline">
                            {t('orders.viewOrderDetails', 'View Order Details')}
                            <ChevronRight className="size-4" />
                        </Typography>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}

export default OrderListItem;
