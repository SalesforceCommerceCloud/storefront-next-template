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

import { type ReactElement, useState } from 'react';
import type { Route } from './+types/_app.order-lookup.verify.$orderNo';
import { data, redirect, useLoaderData } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { buildUrlFromContext } from '@/lib/url.server';
import { verifyOrderState, hashOrderNumber, ACCESS_CODE_TTL_SECONDS } from '@/lib/order/session.server';
import { createCookie, getCookieConfig } from '@/lib/cookie-utils.server';
import { getSite } from '@/lib/utils.server';
import { parseOrderNumber } from '@/lib/order/lookup/validation';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@/hooks/use-navigate';
import { VerifyForm } from '@/components/order-lookup/verify-form';
import { Spinner } from '@/components/spinner';
import { routes } from '@/route-paths';

const ORDER_STATE_COOKIE_PREFIX = 'glo_order_';

/**
 * Loader for the /order-lookup/verify/:orderNo page.
 *
 * The orderNo comes from the URL path segment — never from a query parameter.
 * The shopper email is read from the signed `glo_order_<orderHash>` cookie set by
 * `action.order-lookup-request-code.ts`, so it never appears in a URL.
 *
 * - No valid cookie → redirect to /order-lookup (must request a code first)
 * - Cookie present, already verified → redirect to /order-lookup/results/:orderNo
 *   (user landed here after already completing verification — skip straight to results)
 * - Cookie present, unverified → render the OTP entry form
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
    const appConfig = getConfig(context);

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
            if (orderState.verified) {
                // Already verified — send straight to the results page
                throw redirect(
                    buildUrlFromContext(`/order-lookup/results/${encodeURIComponent(orderNumberResult.value)}`, context)
                );
            }

            return data(
                { email: orderState.email ?? '', orderNumber: orderNumberResult.value },
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

    // No valid cookie → user must request a code first
    throw redirect(buildUrlFromContext(routes.orderLookup, context));
}

export function meta() {
    return [{ title: 'Verify Order' }, { name: 'robots', content: 'noindex, nofollow' }];
}

export function shouldRevalidate() {
    return false;
}

export default function OrderLookupVerifyPage(): ReactElement {
    const { t } = useTranslation('orderLookup');
    const navigate = useNavigate();
    const { email, orderNumber } = useLoaderData<typeof loader>();
    const [isNavigatingToResults, setIsNavigatingToResults] = useState(false);

    const handleVerified = ({ orderNumber: verifiedOrderNumber }: { orderNumber: string; email: string }) => {
        setIsNavigatingToResults(true);
        // Navigate to the results page — the loader there will auto-fetch the order using the
        // verified cookie set by action.order-lookup-verify.ts.
        const resultsUrl = `/order-lookup/results/${encodeURIComponent(verifiedOrderNumber)}`;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- navigate result intentionally not awaited
        navigate(resultsUrl);
    };

    const handleCancel = () => {
        // Send user back to the request form with just the order number — email is intentionally
        // omitted from the URL to keep it out of server access logs.
        const entryUrl = `/order-lookup?order=${encodeURIComponent(orderNumber)}`;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- navigate result intentionally not awaited
        navigate(entryUrl);
    };

    if (isNavigatingToResults) {
        return (
            <div className="container mx-auto max-w-md py-8 px-4">
                {/* role="status" + aria-live="polite" ensures screen readers announce the navigation */}
                <div
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    className="flex flex-col items-center justify-center space-y-4 py-12">
                    <Spinner size="lg" />
                    <p className="text-muted-foreground">{t('results.loading')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto max-w-md py-8 px-4">
            <div className="space-y-6">
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold">{t('results.title')}</h1>
                    <p className="text-muted-foreground">{t('results.description', { email })}</p>
                </div>
                <VerifyForm
                    orderNumber={orderNumber}
                    email={email}
                    onVerified={handleVerified}
                    onCancel={handleCancel}
                />
            </div>
        </div>
    );
}
