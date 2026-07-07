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
import { Await, redirect, useLoaderData, useParams } from 'react-router';
import type { Route } from './+types/_app.account.orders.$orderNo';
import { Link } from '@/components/link';
import { routes } from '@/route-paths';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/typography';
import { ChevronLeft } from 'lucide-react';
import OrderDetails, { type ProductDataById } from '@/components/account/order-details';
import OrderSkeleton from '@/components/order-skeleton';
import { SeoMeta } from '@/components/seo-meta';
import { useTranslation } from 'react-i18next';
import type { ShopperOrders } from '@/scapi';
import { fetchOrderWithProducts } from '@/lib/api/order.server';
import { buildUrlFromContext } from '@/lib/url.server';
import { getLogger } from '@/lib/logger.server';
// @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
import { getWriteReviewForm, type WriteReviewFormData } from '@/extensions/ratings-reviews/lib/api/reviews.server';
import { WriteReviewFormProvider } from '@/extensions/ratings-reviews/context/write-review-form-context';
// @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS

type OrderDetailsLoaderData = {
    order: ShopperOrders.schemas['Order'];
    productsById: ProductDataById;
};

type OrderDetailsPageLoaderData = {
    orderData: Promise<OrderDetailsLoaderData>;
    // @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
    writeReviewForm: Promise<WriteReviewFormData>;
    // @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
};

/** Loader fetches order and product details via SCAPI (getOrder + getProducts). */
export function loader({ context, params }: Route.LoaderArgs): OrderDetailsPageLoaderData {
    const { orderNo } = params;
    const logger = getLogger(context);
    logger.debug('OrderDetail: loader starting', { orderNo });

    if (!orderNo) {
        logger.warn('OrderDetail: missing orderNo param, redirecting to order list');
        throw redirect(buildUrlFromContext(routes.accountOrders, context));
    }

    const { orderDataPromise } = fetchOrderWithProducts(context, orderNo);

    return {
        orderData: orderDataPromise,
        // @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
        // Form config for per-line "Rate & Review" — one config per order is sufficient.
        writeReviewForm: getWriteReviewForm(orderNo),
        // @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
    };
}

/** Shared UI for order not found / load error. Used by ErrorBoundary and Await errorElement. */
function OrderNotFoundCard() {
    const { t } = useTranslation('account');
    return (
        <Card className="">
            <CardHeader>
                <CardTitle className="text-center">{t('orders.orderNotFound')}</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
                <Typography variant="p" align="center" className="text-muted-foreground">
                    {t('orders.orderNotFoundDescription')}
                </Typography>
                <Button asChild>
                    <Link to={routes.accountOrders}>{t('orders.backToOrderHistory')}</Link>
                </Button>
            </CardContent>
        </Card>
    );
}

export function ErrorBoundary() {
    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-4xl mx-auto section-container py-8">
                <OrderNotFoundCard />
            </div>
        </div>
    );
}

/** Order details at /account/orders/:orderNo – uses OrderDetails component. */
export default function OrderDetailsPage(): ReactElement {
    const { t } = useTranslation('account');
    const { orderNo } = useParams();
    const loaderData = useLoaderData<typeof loader>();

    let content: ReactElement = (
        <div className="w-full section-container pt-0 pb-8">
            <SeoMeta title={t('meta.orderDetailsTitle', { defaultValue: 'Order Details' })} noIndex />
            <Breadcrumb className="mb-5">
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                            <Link to={routes.account}>{t('myAccount')}</Link>
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                            <Link to={routes.accountOrders}>{t('navigation.orderHistory')}</Link>
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage>{orderNo ? `#${orderNo}` : ''}</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>
            <Link
                to={routes.accountOrders}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-5">
                <ChevronLeft className="size-3.5 shrink-0" aria-hidden />
                {t('orders.backToOrderHistory')}
            </Link>
            <Suspense fallback={<OrderSkeleton />}>
                <Await
                    resolve={loaderData.orderData}
                    errorElement={
                        <div className="px-4 py-8" data-testid="order-not-found">
                            <OrderNotFoundCard />
                        </div>
                    }>
                    {(data) => <OrderDetails order={data.order} productsById={data.productsById} />}
                </Await>
            </Suspense>
        </div>
    );

    // @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
    content = (
        <WriteReviewFormProvider writeReviewFormPromise={loaderData.writeReviewForm}>{content}</WriteReviewFormProvider>
    );
    // @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS

    return content;
}
