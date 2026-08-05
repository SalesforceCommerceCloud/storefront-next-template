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
import { type ReactElement, type RefObject } from 'react';
import { Check, Hash, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import type { ShopperOrders } from '@/scapi';
import {
    formatStatusFallbackLabel,
    getOrderCancelStatusConfig,
    getOrderReturnStatus,
    getOrderReturnStatusConfig,
    getOrderStatusConfig,
    resolveOrderStatus,
} from '@/lib/order/status';
import { cn } from '@/lib/utils';
import { BADGE_BASE_CLASSES } from './order-badge-shared';

export type OrderStatusHeaderProps = {
    order: Partial<ShopperOrders.schemas['Order']>;
    /**
     * Fallback focus target for cancel/return dialogs when their trigger button unmounts while
     * the dialog is open. Owned by the caller so it stays outside any Suspense boundary around
     * the cancel/return actions.
     */
    headingRef?: RefObject<HTMLHeadingElement | null>;
};

/**
 * Order Details title + order-number + status-badge cascade, shared between the
 * registered-account and guest order-lookup Order Details pages. Badge precedence:
 * cancel (item-level all-cancelled) → return (aggregated from items) → raw status → nothing.
 *
 * The raw-status badge uses the shared `resolveOrderStatus` (ECOM-first, OMS as fallback) so
 * this badge and the order-history list badge can never disagree for the same order. An
 * unrecognized/unmapped raw status falls back to a neutral (muted) shell rather than implying
 * success.
 */
export function OrderStatusHeader({ order, headingRef }: OrderStatusHeaderProps): ReactElement {
    const { t } = useTranslation('account');
    const orderNo = order.orderNo ?? '';

    const cancelStatusConfig = getOrderCancelStatusConfig(order);
    const returnStatusConfig = !cancelStatusConfig
        ? getOrderReturnStatusConfig(getOrderReturnStatus(order))
        : undefined;
    const orderStatus = resolveOrderStatus(order);
    const orderStatusConfig = getOrderStatusConfig(orderStatus);
    const orderStatusLabelFallback = formatStatusFallbackLabel(orderStatus);
    const showOrderStatusBadge =
        cancelStatusConfig || returnStatusConfig || orderStatusConfig || orderStatusLabelFallback;
    const OrderStatusIcon = orderStatusConfig?.icon === 'check' ? Check : orderStatusConfig?.icon === 'x' ? X : null;

    return (
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
            <div>
                <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
                    {t('orders.orderDetailsPageTitle')}
                </h1>
                {orderNo && (
                    <p
                        className="mt-1 flex items-center gap-0 text-base font-medium text-muted-foreground"
                        data-testid="order-number">
                        <Hash className="size-4 shrink-0" aria-hidden={true} />
                        <span>{orderNo}</span>
                    </p>
                )}
            </div>
            {cancelStatusConfig ? (
                <Badge
                    data-testid="order-cancel-status-badge"
                    className={cn(BADGE_BASE_CLASSES, cancelStatusConfig.className)}>
                    <X data-testid="order-status-icon" className="mr-1 inline size-3.5" aria-hidden={true} />
                    {t(cancelStatusConfig.labelKey)}
                </Badge>
            ) : returnStatusConfig ? (
                <Badge
                    data-testid="order-return-status-badge"
                    className={cn(BADGE_BASE_CLASSES, returnStatusConfig.className)}>
                    {t(returnStatusConfig.labelKey)}
                </Badge>
            ) : showOrderStatusBadge ? (
                <Badge
                    data-testid="order-status-badge"
                    className={cn(
                        BADGE_BASE_CLASSES,
                        orderStatusConfig?.className ?? 'border-transparent bg-muted text-muted-foreground'
                    )}>
                    {OrderStatusIcon ? (
                        <OrderStatusIcon
                            data-testid="order-status-icon"
                            className="mr-1 inline size-3.5"
                            aria-hidden={true}
                        />
                    ) : null}
                    {orderStatusConfig ? t(orderStatusConfig.labelKey) : orderStatusLabelFallback}
                </Badge>
            ) : null}
        </div>
    );
}

export default OrderStatusHeader;
