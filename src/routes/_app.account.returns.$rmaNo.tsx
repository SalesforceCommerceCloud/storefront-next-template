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

import { type ReactElement } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Link } from '@/components/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Typography } from '@/components/typography';
import { SeoMeta } from '@/components/seo-meta';
import { ReturnTimeline } from '@/components/returns';
import { useReturnByRma } from '@/hooks/use-returns';
import { advanceStatus, isFinalStatus } from '@/lib/returns/return-store';
import { routes, routeHref } from '@/route-paths';

/** Presenter-only switch: the "Advance status" button shows only on `?demo=1`. URL state, so it works before hydration. */
const DEMO_PARAM = 'demo';

function TrackingSkeleton(): ReactElement {
    return (
        <div className="space-y-4" aria-hidden data-testid="return-tracking-skeleton">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-40 w-full" />
        </div>
    );
}

/**
 * Return confirmation and tracking at /account/returns/:rmaNo.
 * Returns are saved in this browser, so the page renders a skeleton until the store has been read.
 */
export default function ReturnTrackingPage(): ReactElement {
    const { t, i18n } = useTranslation('returns');
    const { rmaNo } = useParams();
    const [searchParams] = useSearchParams();
    const { ready, request } = useReturnByRma(rmaNo);
    const presenterMode = searchParams.get(DEMO_PARAM) === '1';

    let content: ReactElement;
    if (!ready) {
        content = <TrackingSkeleton />;
    } else if (!request) {
        content = (
            <Card>
                <CardHeader>
                    <CardTitle>{t('tracking.notFoundTitle')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Typography variant="muted" as="p">
                        {t('tracking.notFoundDescription')}
                    </Typography>
                    <Button asChild>
                        <Link to={routes.accountOrders}>{t('tracking.backToOrders')}</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    } else {
        const createdAt = new Date(request.createdAt);
        content = (
            <div className="space-y-6">
                <Card>
                    <CardContent className="grid gap-4 p-6 sm:grid-cols-3">
                        <div>
                            <Typography variant="muted" as="p">
                                {t('tracking.rmaNumber')}
                            </Typography>
                            <Typography variant="large" as="p" data-testid="rma-number">
                                {request.rmaNo}
                            </Typography>
                        </div>
                        <div>
                            <Typography variant="muted" as="p">
                                {t('tracking.order')}
                            </Typography>
                            <Link
                                to={routeHref(routes.accountOrderDetail, { orderNo: request.orderNo })}
                                className="text-sm font-semibold underline">
                                #{request.orderNo}
                            </Link>
                        </div>
                        <div>
                            <Typography variant="muted" as="p">
                                {t('tracking.submittedOn')}
                            </Typography>
                            <Typography variant="large" as="p">
                                {Number.isNaN(createdAt.getTime())
                                    ? ''
                                    : new Intl.DateTimeFormat(i18n.language, {
                                          dateStyle: 'medium',
                                          timeZone: 'UTC',
                                      }).format(createdAt)}
                            </Typography>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">{t('tracking.timeline')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <ReturnTimeline request={request} />
                        {request.trackingNo && (
                            <div data-testid="tracking-number">
                                <Typography variant="muted" as="p">
                                    {t('tracking.trackingNumber')}
                                </Typography>
                                <Typography variant="large" as="p">
                                    {request.trackingNo}
                                </Typography>
                            </div>
                        )}
                        {presenterMode && !isFinalStatus(request) && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                data-testid="advance-status"
                                // Passing the status this screen shows makes a stale double click a no-op.
                                onClick={() => void advanceStatus(request.rmaNo, request.status)}>
                                {t('tracking.advance')}
                            </Button>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">{t('tracking.items')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="divide-y divide-border">
                            {request.items.map((item) => (
                                <li key={item.lineKey} className="space-y-0.5 py-3 text-sm">
                                    <p className="font-medium">
                                        {t('tracking.itemLine', { name: item.name, quantity: item.quantity })}
                                    </p>
                                    <p className="text-muted-foreground">
                                        {item.action === 'exchange'
                                            ? t('tracking.actionExchange', {
                                                  replacement: item.replacementLabel ?? item.replacementSku,
                                              })
                                            : t('tracking.actionReturn')}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="w-full section-container pt-0 pb-8 space-y-6">
            <SeoMeta title={t('tracking.pageTitle')} noIndex />
            <Typography variant="h3" as="h1">
                {t('tracking.title')}
            </Typography>
            {content}
        </div>
    );
}
