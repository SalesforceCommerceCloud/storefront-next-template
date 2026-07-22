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
import { Button } from '@/components/ui/button';
import type { Order } from '@/components/account/order-list';
import { useTranslation } from 'react-i18next';
import { formatStatusFallbackLabel, getOrderReturnStatusConfig, getOrderStatusConfig } from '@/lib/order/status';
import { routes, routeHref } from '@/route-paths';

const MAX_THUMBNAILS = 2;

export type RateRecentPurchasesCardProps = {
    order: Order;
};

function buildProductTitleLine(order: Order): string {
    const items = order.productItems ?? [];
    const names = items.map((i) => i.productName?.trim()).filter((n): n is string => Boolean(n && n.length > 0));
    if (names.length > 0) {
        return names.join(', ');
    }
    return '';
}

export function RateRecentPurchasesCard({ order }: RateRecentPurchasesCardProps): ReactElement {
    const { t } = useTranslation('account');
    const productItems = order.productItems ?? [];
    const thumbs = productItems.slice(0, MAX_THUMBNAILS);
    const titleLine = buildProductTitleLine(order);
    // A derived return status wins over the raw order status so the caption stays
    // consistent with the order-history list and detail badges after a return.
    const returnStatusConfig = getOrderReturnStatusConfig(order.returnStatus);
    const orderStatusConfig = getOrderStatusConfig(order.status);
    const statusLabel = returnStatusConfig
        ? t(returnStatusConfig.labelKey)
        : orderStatusConfig
          ? t(orderStatusConfig.labelKey)
          : formatStatusFallbackLabel(order.status);
    const orderDetailsUrl = routeHref(routes.accountOrderDetail, { orderNo: order.orderNo });

    return (
        <Card className="py-0">
            <CardContent className="p-6">
                <div className="space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">
                            {t('overview.rateRecentPurchases.title')}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            {t('overview.rateRecentPurchases.subtitle')}
                        </p>
                    </div>
                    {/* Inner region: thumbnails + copy + CTA — matches Recent Orders thumbnail treatment */}
                    <div className="rounded-ui border border-border p-4 sm:p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                                {thumbs.length > 0 ? (
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                        {thumbs.map((item) => (
                                            <Link
                                                key={item.productId}
                                                to={routeHref(routes.product, { productId: item.productId })}
                                                className="relative block">
                                                <div className="h-16 w-16 overflow-hidden border border-border bg-muted">
                                                    {item.imageUrl ? (
                                                        <img
                                                            src={item.imageUrl}
                                                            alt={item.imageAlt ?? ''}
                                                            className="h-full w-full object-cover"
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                                            {t('orders.productPlaceholderInitial')}
                                                        </div>
                                                    )}
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="min-w-0 flex-1 space-y-1 text-left">
                                    {titleLine ? (
                                        <p className="text-sm font-medium text-foreground line-clamp-4">{titleLine}</p>
                                    ) : null}
                                    <p className="text-xs text-muted-foreground">
                                        {t('overview.rateRecentPurchases.orderCaption', {
                                            orderNo: order.orderNo.startsWith('#')
                                                ? order.orderNo
                                                : `#${order.orderNo}`,
                                            status: statusLabel,
                                        })}
                                    </p>
                                </div>
                            </div>
                            <div className="flex w-full shrink-0 justify-end sm:w-auto sm:self-center">
                                <Button
                                    asChild
                                    variant="default"
                                    size="default"
                                    className="min-w-[10.5rem] bg-foreground text-background hover:bg-foreground/90">
                                    <Link to={orderDetailsUrl}>{t('overview.rateRecentPurchases.cta')}</Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
