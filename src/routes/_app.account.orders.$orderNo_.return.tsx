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
import { Await, redirect, useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import type { Route } from './+types/_app.account.orders.$orderNo_.return';
import { Link } from '@/components/link';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Typography } from '@/components/typography';
import { SeoMeta } from '@/components/seo-meta';
import { ReturnForm } from '@/components/returns';
import { loadReturnPage, type ReturnPageData } from '@/lib/returns/return-page.server';
import { buildUrlFromContext } from '@/lib/url.server';
import { getLogger } from '@/lib/logger.server';
import { getAuth } from '@/middlewares/auth.server';
import { routes, routeHref } from '@/route-paths';

type ReturnPageLoaderData = {
    orderNo: string;
    page: Promise<ReturnPageData>;
};

/**
 * Return / exchange form at /account/orders/:orderNo/return.
 *
 * The order is fetched by the server loader and returned as one deferred promise (the form needs all of it, so it
 * gets one Suspense boundary). Saved return data is browser-only and is read by the form itself.
 */
export function loader({ context, params }: Route.LoaderArgs): ReturnPageLoaderData {
    const logger = getLogger(context);
    const session = getAuth(context);
    if (!session.customerId) {
        logger.warn('ReturnPage: no customerId, redirecting to login');
        throw redirect(buildUrlFromContext(routes.login, context));
    }
    const { orderNo } = params;
    if (!orderNo) throw redirect(buildUrlFromContext(routes.accountOrders, context));

    return { orderNo, page: loadReturnPage(context, orderNo) };
}

function ReturnFormSkeleton(): ReactElement {
    return (
        <Card aria-hidden data-testid="return-form-skeleton">
            <CardContent className="space-y-6 p-6">
                {[0, 1].map((row) => (
                    <div key={row} className="flex items-start gap-3">
                        <Skeleton className="mt-1 size-4" />
                        <Skeleton className="size-16" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-1/2" />
                            <Skeleton className="h-3 w-3/4" />
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

function ReturnLoadError(): ReactElement {
    const { t } = useTranslation('returns');
    return (
        <Typography variant="p" className="text-muted-foreground" role="alert">
            {t('form.loadError')}
        </Typography>
    );
}

export default function ReturnPage(): ReactElement {
    const { t } = useTranslation('returns');
    const { orderNo, page } = useLoaderData<typeof loader>();

    return (
        <div className="w-full section-container pt-0 pb-8 space-y-6">
            <SeoMeta title={t('form.pageTitle')} noIndex />
            <Link
                to={routeHref(routes.accountOrderDetail, { orderNo })}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-3.5 shrink-0" aria-hidden />
                {t('form.backToOrder')}
            </Link>
            <div className="space-y-1">
                <Typography variant="h3" as="h1">
                    {t('form.title')}
                </Typography>
                <Typography variant="muted" as="p">
                    {t('form.subtitle', { orderNo })}
                </Typography>
            </div>
            <Suspense fallback={<ReturnFormSkeleton />}>
                <Await resolve={page} errorElement={<ReturnLoadError />}>
                    {(data) => <ReturnForm orderNo={data.orderNo} lines={data.lines} now={data.now} />}
                </Await>
            </Suspense>
        </div>
    );
}
