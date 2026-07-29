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

import { type ReactElement, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Await, useLoaderData, redirect } from 'react-router';
import { routes, routeHref } from '@/route-paths';
import type { Route } from './+types/_app.account.orders._index';
import { useNavigate } from '@/hooks/use-navigate';
import { OrderListHeader, OrderListBody, OrderListSkeleton } from '@/components/account/order-list';
import {
    fetchCustomerOrders,
    DEFAULT_ORDERS_OFFSET,
    DEFAULT_ORDERS_LIMIT,
    type CustomerOrdersResult,
} from '@/lib/api/order.server';
import { Card, CardContent } from '@/components/ui/card';
import { Typography } from '@/components/typography';
import { SeoMeta } from '@/components/seo-meta';
import { buildUrlFromContext } from '@/lib/url.server';
import { getLogger } from '@/lib/logger.server';
import { getAuth } from '@/middlewares/auth.server';
import { UITarget } from '@/targets/ui-target';

type OrderListLoaderData = {
    ordersPromise: Promise<CustomerOrdersResult>;
};

/**
 * Loader fetches all customer orders via SCAPI getCustomerOrders endpoint.
 * Returns a deferred promise for streaming/suspense support.
 */
export function loader({ context, request }: Route.LoaderArgs): OrderListLoaderData {
    const logger = getLogger(context);
    logger.debug('OrderList: loader starting');

    // Get customer ID from auth session
    const session = getAuth(context);
    if (!session.customerId) {
        logger.warn('OrderList: no customerId, redirecting to login');
        throw redirect(buildUrlFromContext('/login', context));
    }

    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get('offset') ?? String(DEFAULT_ORDERS_OFFSET));
    const limit = parseInt(searchParams.get('limit') ?? String(DEFAULT_ORDERS_LIMIT));

    // Fetch orders asynchronously (deferred for streaming)
    const ordersPromise = fetchCustomerOrders(context, session.customerId, { offset, limit });

    return {
        ordersPromise,
    };
}

/**
 * Error state for order list.
 */
function OrderListError(): ReactElement {
    const { t } = useTranslation('account');
    return (
        <Card className="border-border">
            <CardContent className="p-12 text-center space-y-4">
                <Typography variant="p" className="text-muted-foreground">
                    {t('orders.errorDescription')}
                </Typography>
            </CardContent>
        </Card>
    );
}

/**
 * Order list page – renders at /account/orders.
 * Order details at /account/orders/:orderNo.
 */
export default function OrderListPage(): ReactElement {
    const { t } = useTranslation('account');
    const navigate = useNavigate();
    const loaderData = useLoaderData<typeof loader>();

    const handleViewDetails = (orderNo: string) => {
        // oxlint-disable-next-line @typescript-eslint/no-floating-promises -- navigate() result intentionally not awaited
        navigate(routeHref(routes.accountOrderDetail, { orderNo }));
    };

    return (
        <div className="order-history-page text-sm space-y-0">
            <SeoMeta title={t('meta.orderHistoryTitle', { defaultValue: 'Order History' })} noIndex />
            <OrderListHeader title={t('navigation.orderHistory')} subtitle={t('orders.subtitle')} />
            <Suspense fallback={<OrderListSkeleton />}>
                <Await resolve={loaderData.ordersPromise} errorElement={<OrderListError />}>
                    {(result) => (
                        <OrderListBody
                            orders={result.orders}
                            total={result.total}
                            offset={result.offset}
                            limit={result.limit}
                            onViewDetails={handleViewDetails}
                        />
                    )}
                </Await>
            </Suspense>
            <UITarget targetId="sfcc.myAccount.orders.tracking" />
        </div>
    );
}
