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

import { type ReactElement, useState, useEffect, useRef } from 'react';
import type { Route } from './+types/_app.order-lookup.results';
import { data, redirect, useFetcher, useLoaderData, useSearchParams } from 'react-router';
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
import { VerifyForm } from '@/components/order-lookup/verify-form';
import { GuestOrderDetails } from '@/components/order-lookup/guest-order-details';
import { GuestOrderActions } from '@/components/order-lookup/guest-order-actions';
import { Spinner } from '@/components/spinner';
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
 * Loader for the /order-lookup/results page.
 * Allows rendering the OTP-entry form when the browser holds a per-order state cookie
 * (`glo_order_<orderHash>`) — its mere presence, regardless of `verified`, grants access to the
 * OTP-entry form for this order. The cookie name itself is scoped to the current order's hash, so
 * a cookie for a different order never disturbs this order's access or vice versa.
 *
 * If the cookie's signed payload has `verified: true` and its `orderNumberHash` matches the
 * current order, fetches the order server-side using the cookie's `verifiedCode` and returns the
 * (redacted) result directly — the access code itself never leaves the server.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
    const appConfig = getConfig(context);

    // Feature gate: 404 if guest order lookup is disabled
    if (!appConfig.guestOrderLookup.enabled) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Router data() is the correct API for error responses
        throw data({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    }

    const { siteId } = getSite(context);
    const cookieHeader = request.headers.get('cookie');

    const url = new URL(request.url);
    const orderNumberResult = parseOrderNumber(url.searchParams.get('order'));

    let hasAccess = false;
    let result: FetchGuestOrderResult | null = null;

    if (orderNumberResult.ok) {
        const orderHash = hashOrderNumber(orderNumberResult.value);

        // Check the per-order state cookie. Its mere presence — even unverified — grants access
        // to the access-code entry form for this order (the browser just requested a code and
        // hasn't entered it yet). The cookie name itself is scoped to this order's hash
        // (`glo_order_<orderHash>`), so state for a different order is never even read here — it
        // lives under its own cookie name and can't clobber this order's cookie.
        const orderStateCookie = createCookie<string>(
            `${ORDER_STATE_COOKIE_PREFIX}${orderHash}`,
            getCookieConfig({ httpOnly: true, path: '/' }, context),
            context
        );
        const orderStateValue = await orderStateCookie.parse(cookieHeader);
        const orderState = orderStateValue && verifyOrderState(orderStateValue, siteId, ACCESS_CODE_TTL_SECONDS);

        if (orderState) {
            hasAccess = true;

            // Auto-fetch only when the state is verified and for the current order.
            // Defense-in-depth: the cookie name is already order-scoped, but also check the
            // signed payload's orderNumberHash — guards against a cookie value being
            // copied/replayed under the wrong per-order cookie name.
            if (orderState.verified && orderState.orderNumberHash === orderHash && orderState.verifiedCode) {
                const emailResult = parseEmail(url.searchParams.get('email'));
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
        }
    }

    if (!hasAccess) {
        throw redirect(buildUrlFromContext(routes.orderLookup, context));
    }

    return data(
        { result },
        {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                Pragma: 'no-cache',
                'X-Robots-Tag': 'noindex, nofollow',
            },
        }
    );
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

/**
 * Results route component. Renders order details directly when the loader already fetched them
 * (browser holds a verified order-state cookie), otherwise renders VerifyForm and fetches the
 * order via the action when the user submits the OTP.
 */
export default function OrderLookupResults(): ReactElement {
    const { t } = useTranslation('orderLookup');
    const navigate = useNavigate();
    const { result: loaderResult } = useLoaderData<typeof loader>();
    const [searchParams] = useSearchParams();
    const fetcher = useFetcher<FetchGuestOrderResult>({ key: 'order-lookup-results-fetch' });
    const [hasVerified, setHasVerified] = useState(!!loaderResult);
    // Fallback focus target for cancel/return dialogs: the order status heading. Used when
    // `cancelSucceeded` hides the Cancel button so the trigger ref is null on dialog close.
    const orderHeadingRef = useRef<HTMLHeadingElement | null>(null);
    // Overrides the active result's order/omsMetaData after a successful cancel/return — this
    // route has no revalidating loader, so `GuestOrderActions` pushes the fresh values it already
    // got back from `/action/order-lookup-cancel`/`-return` up here instead of triggering a re-fetch.
    const [orderOverride, setOrderOverride] = useState<{
        order: Parameters<typeof GuestOrderDetails>[0]['order'];
        omsMetaData: Parameters<typeof GuestOrderActions>[0]['omsMetaData'];
    } | null>(null);

    const orderNumber = searchParams.get('order') ?? '';
    const email = searchParams.get('email') ?? '';

    // Prefer the fetcher's response (manual OTP entry) once available; otherwise fall back to
    // whatever the loader already resolved server-side (auto-verified cookie).
    const activeResult = fetcher.data ?? loaderResult;

    const handleVerified = ({
        orderNumber: verifiedOrderNumber,
        email: verifiedEmail,
    }: {
        orderNumber: string;
        email: string;
    }) => {
        setHasVerified(true);

        // The access code is never sent here — the results-fetch action reads it server-side
        // from the verified order-state cookie set by action.order-lookup-verify.ts.
        const formData = new FormData();
        formData.append('orderNumber', verifiedOrderNumber);
        formData.append('email', verifiedEmail);

        void fetcher.submit(formData, {
            method: 'POST',
            action: '/action/order-lookup-results-fetch',
        });
    };

    const handleRequestNewCode = () => {
        // Send the user back to the request-code form, prefilled with their order number and
        // email, so they can request a fresh code — e.g. after a page refresh dropped their
        // in-flight code, or after repeated failed/expired verification attempts.
        const entryUrl = `/order-lookup?order=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email)}`;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- navigate result intentionally not awaited
        navigate(entryUrl);
    };

    const isLoading = fetcher.state === 'submitting' || fetcher.state === 'loading';

    // Effect to reset hasVerified when fetcher returns error
    useEffect(() => {
        if (fetcher.state === 'idle' && fetcher.data && !fetcher.data.ok) {
            setHasVerified(false);
        }
    }, [fetcher.state, fetcher.data]);

    // Show order details on success
    if (activeResult?.ok && activeResult.order) {
        const order = orderOverride?.order ?? (activeResult.order as Parameters<typeof GuestOrderDetails>[0]['order']);
        const omsMetaData = orderOverride?.omsMetaData ?? activeResult.omsMetaData;
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
                    productsById={activeResult.productsById ?? {}}
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

    // Show spinner while the manual-entry fetcher is submitting
    if (hasVerified && isLoading) {
        return (
            <div className="container mx-auto max-w-md py-8 px-4">
                <div className="flex flex-col items-center justify-center space-y-4 py-12">
                    <Spinner size="lg" />
                    <p className="text-muted-foreground">{t('results.loading')}</p>
                </div>
            </div>
        );
    }

    // Show VerifyForm with optional error banner
    return (
        <div className="container mx-auto max-w-md py-8 px-4">
            <div className="space-y-6">
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold">{t('results.title')}</h1>
                    <p className="text-muted-foreground">{t('results.description', { email })}</p>
                </div>

                {activeResult && !activeResult.ok && (
                    <Alert variant="destructive">
                        <AlertCircle className="size-4" aria-hidden="true" />
                        <AlertDescription>
                            {activeResult.code === 'INVALID_CODE' && t('verify.errors.invalidCode')}
                            {activeResult.code === 'RATE_LIMITED' &&
                                (activeResult.retryAfterSeconds
                                    ? t('verify.errors.rateLimitedWithTime', {
                                          seconds: activeResult.retryAfterSeconds,
                                      })
                                    : t('verify.errors.rateLimited'))}
                            {activeResult.code === 'SCAPI_UNSUPPORTED' && t('verify.errors.scapiUnsupported')}
                            {activeResult.code === 'LOOKUP_FAILED' && t('results.errors.lookupFailed')}
                            {activeResult.code === 'VALIDATION' && t('verify.errors.validation')}
                            {![
                                'INVALID_CODE',
                                'RATE_LIMITED',
                                'SCAPI_UNSUPPORTED',
                                'LOOKUP_FAILED',
                                'VALIDATION',
                            ].includes(activeResult.code ?? '') && activeResult.message}
                        </AlertDescription>
                    </Alert>
                )}

                <VerifyForm
                    orderNumber={orderNumber}
                    email={email}
                    onVerified={handleVerified}
                    onCancel={handleRequestNewCode}
                />
            </div>
        </div>
    );
}
