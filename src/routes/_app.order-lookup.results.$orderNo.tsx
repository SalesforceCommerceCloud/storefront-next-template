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

import { type ReactElement, useRef, useState } from 'react';
import type { Route } from './+types/_app.order-lookup.results.$orderNo';
import { data, redirect, useLoaderData } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { buildUrlFromContext } from '@/lib/url.server';
import { verifyOrderState, hashOrderNumber, ACCESS_CODE_TTL_SECONDS } from '@/lib/order/session.server';
import { createCookie, getCookieConfig } from '@/lib/cookie-utils.server';
import { getSite } from '@/lib/utils.server';
import { getLogger } from '@/lib/logger.server';
import { parseOrderNumber, parseEmail } from '@/lib/order/lookup/validation';
import { fetchGuestOrderResult, type FetchGuestOrderResult } from '@/lib/order/fetch-order.server';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@/hooks/use-navigate';
import { GuestOrderDetails } from '@/components/order-lookup/guest-order-details';
import { GuestOrderActions } from '@/components/order-lookup/guest-order-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
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

const ORDER_STATE_COOKIE_PREFIX = 'glo_order_';

/**
 * Loader for the /order-lookup/results/:orderNo page.
 *
 * The orderNo comes from the URL path segment — never from a query parameter.
 * The shopper email is read from the signed `glo_order_<orderHash>` cookie set by
 * `action.order-lookup-request-code.ts`, so it never appears in a URL (and therefore
 * never in server access logs, browser history, or Referer headers).
 *
 * This route requires a verified order-state cookie:
 * - No cookie or expired cookie → redirect to /order-lookup
 * - Cookie present but unverified → redirect to /order-lookup/verify/:orderNo
 * - Cookie verified → auto-fetch the order server-side using the stored access code
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
    const appConfig = getConfig(context);

    // Feature gate: 404 if guest order lookup is disabled
    if (!appConfig.guestOrderLookup.enabled) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Router data() is the correct API for error responses
        throw data({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    }

    const { siteId } = getSite(context);
    const cookieHeader = request.headers.get('cookie');
    const orderNumberResult = parseOrderNumber(params.orderNo);

    if (orderNumberResult.ok) {
        const orderHash = hashOrderNumber(orderNumberResult.value);
        const orderStateCookie = createCookie<string>(
            `${ORDER_STATE_COOKIE_PREFIX}${orderHash}`,
            getCookieConfig({ httpOnly: true, path: '/' }, context),
            context
        );
        const orderStateValue = await orderStateCookie.parse(cookieHeader);
        const orderState = orderStateValue && verifyOrderState(orderStateValue, siteId, ACCESS_CODE_TTL_SECONDS);

        if (orderState) {
            if (!orderState.verified) {
                // Cookie present but not yet verified — send to the verify step
                throw redirect(
                    buildUrlFromContext(`/order-lookup/verify/${encodeURIComponent(orderNumberResult.value)}`, context)
                );
            }

            // Email is stored in the cookie payload — never in the URL — to prevent PII
            // from appearing in server access logs, browser history, and Referer headers.
            const email = orderState.email ?? '';

            let result: FetchGuestOrderResult | null = null;

            // Defense-in-depth: the cookie name is already order-scoped, but also verify the
            // signed payload's orderNumberHash — guards against a cookie value being
            // copied/replayed under the wrong per-order cookie name.
            if (orderState.orderNumberHash === orderHash && orderState.verifiedCode) {
                const emailResult = parseEmail(email);
                if (emailResult.ok) {
                    result = await fetchGuestOrderResult({
                        orderNumber: orderNumberResult.value,
                        email: emailResult.value,
                        code: orderState.verifiedCode,
                        allowedFields: appConfig.guestOrderLookup.allowedFields || [],
                        context,
                        logger: getLogger(context),
                        actionName: 'results-loader',
                    });
                }
            }

            return data(
                { result, email, orderNumber: orderNumberResult.value },
                {
                    headers: {
                        'Cache-Control': 'no-store, no-cache, must-revalidate',
                        Pragma: 'no-cache',
                        'X-Robots-Tag': 'noindex, nofollow',
                    },
                }
            );
        }
    }

    throw redirect(buildUrlFromContext(routes.orderLookup, context));
}

export function meta() {
    return [{ title: 'Order Lookup' }, { name: 'robots', content: 'noindex, nofollow' }];
}

/**
 * Prevent loader re-execution on revalidation — this route has no dynamic data.
 */
export function shouldRevalidate() {
    return false;
}

export default function OrderLookupResults(): ReactElement {
    const { t } = useTranslation('orderLookup');
    const navigate = useNavigate();
    const { result, email, orderNumber } = useLoaderData<typeof loader>();
    const orderHeadingRef = useRef<HTMLHeadingElement | null>(null);
    // Overrides the active result's order/omsMetaData after a successful cancel/return — this
    // route has no revalidating loader, so `GuestOrderActions` pushes the fresh values it already
    // got back from `/action/order-lookup-cancel`/`-return` up here instead of triggering a re-fetch.
    const [orderOverride, setOrderOverride] = useState<{
        order: Parameters<typeof GuestOrderDetails>[0]['order'];
        omsMetaData: Parameters<typeof GuestOrderActions>[0]['omsMetaData'];
    } | null>(null);

    const handleStartOver = () => {
        // Send the user back to the request-code form, prefilled with only the order number —
        // email is intentionally omitted from the URL to keep it out of server access logs.
        const entryUrl = `/order-lookup?order=${encodeURIComponent(orderNumber)}`;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- navigate result intentionally not awaited
        navigate(entryUrl);
    };

    if (result?.ok && result.order) {
        const order = orderOverride?.order ?? (result.order as Parameters<typeof GuestOrderDetails>[0]['order']);
        const omsMetaData = orderOverride?.omsMetaData ?? result.omsMetaData;
        const orderNo = order.orderNo;
        return (
            <div className="section-container py-8 space-y-4">
                <Breadcrumb className="mb-5">
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link to={routes.home}>{t('results.breadcrumb.home')}</Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link to={routes.orderLookup}>{t('results.breadcrumb.orderLookup')}</Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>{orderNo ? `#${orderNo}` : ''}</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
                <GuestOrderDetails
                    order={order}
                    productsById={result.productsById ?? {}}
                    headingRef={orderHeadingRef}
                    actions={
                        omsMetaData && (
                            <GuestOrderActions
                                order={order}
                                omsMetaData={omsMetaData}
                                orderNumber={orderNumber}
                                email={email}
                                onOrderUpdated={(updatedOrder, updatedOmsMetaData) =>
                                    setOrderOverride({ order: updatedOrder, omsMetaData: updatedOmsMetaData })
                                }
                                headingFallbackRef={orderHeadingRef}
                            />
                        )
                    }
                />
            </div>
        );
    }

    // Order fetch failed — show an error with a link to start over
    return (
        <div className="container mx-auto max-w-md py-8 px-4">
            <div className="space-y-6">
                {(!result || !result.ok) && (
                    <Alert variant="destructive">
                        <AlertCircle className="size-4" aria-hidden="true" />
                        <AlertDescription>
                            {!result && t('results.errors.lookupFailed')}
                            {result?.code === 'RATE_LIMITED' &&
                                (result.retryAfterSeconds
                                    ? t('verify.errors.rateLimitedWithTime', { seconds: result.retryAfterSeconds })
                                    : t('verify.errors.rateLimited'))}
                            {result?.code === 'SCAPI_UNSUPPORTED' && t('verify.errors.scapiUnsupported')}
                            {result &&
                                result.code !== 'RATE_LIMITED' &&
                                result.code !== 'SCAPI_UNSUPPORTED' &&
                                t('results.errors.lookupFailed')}
                        </AlertDescription>
                    </Alert>
                )}
                <button
                    type="button"
                    onClick={handleStartOver}
                    className="text-sm underline hover:no-underline text-muted-foreground">
                    {t('results.startOver')}
                </button>
            </div>
        </div>
    );
}
