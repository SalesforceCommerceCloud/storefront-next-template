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

import { type ReactElement, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { data, redirect, useLocation, useSearchParams } from 'react-router';
import type { Route } from './+types/_app.order-lookup._index';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getAuth } from '@/middlewares/auth.server';
import { buildUrlFromContext } from '@/lib/url.server';
import { getLogger } from '@/lib/logger.server';
import { RequestCodeForm } from '@/components/order-lookup/request-code-form';
import { SeoMeta } from '@/components/seo-meta';
import { Spinner } from '@/components/spinner';
import { useNavigate } from '@/hooks/use-navigate';

/**
 * Guest Order Lookup entry page loader.
 * - Feature gate: disabled → 404
 * - Authed user → redirect to /account/orders
 * - Guest → render form
 */
export function loader({ context }: Route.LoaderArgs) {
    const logger = getLogger(context);
    const config = getConfig(context);

    logger.debug('OrderLookupEntry: loader starting');

    // Feature gate
    if (config.guestOrderLookup?.enabled !== true) {
        logger.warn('OrderLookupEntry: feature disabled, returning 404');
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Router data() is the correct API for error responses
        throw data({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    }

    // Authed check: if customer has a real (non-guest) session, redirect to /account/orders
    const session = getAuth(context);
    if (session.customerId && session.userType === 'registered') {
        logger.info('OrderLookupEntry: registered customer, redirecting to /account/orders');
        throw redirect(buildUrlFromContext('/account/orders', context));
    }

    // Guest: return empty data
    logger.debug('OrderLookupEntry: guest shopper, rendering form');
    return new Response(null, {
        headers: {
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex, nofollow',
        },
    });
}

/**
 * Guest Order Lookup entry page.
 * Renders RequestCodeForm. On code sent, navigates to /order-lookup/results?order=<n>&email=<e>.
 */
export default function OrderLookupEntryPage(): ReactElement {
    const { t } = useTranslation();
    const navigate = useNavigate();
    // Tracks the moment a code is sent so we can swap RequestCodeForm for a spinner
    // immediately, rather than letting its own success view flash before navigate() away
    // to the results page resolves.
    const [isNavigatingToResults, setIsNavigatingToResults] = useState(false);
    const location = useLocation();

    // Reset the spinner whenever the user navigates back to this page. React Router
    // keeps this component instance alive during SPA navigation so isNavigatingToResults
    // would otherwise stay true and hide the form on re-entry.
    useEffect(() => {
        setIsNavigatingToResults(false);
    }, [location.key]);

    // Read URL search params for optional prefill
    const [searchParams] = useSearchParams();
    const initialOrderNumber = searchParams.get('order') || '';
    const initialEmail = searchParams.get('email') || '';

    const handleCodeSent = ({ email, orderNumber }: { email: string; orderNumber: string }) => {
        setIsNavigatingToResults(true);
        // Navigate to results page with encoded params
        const resultsUrl = `/order-lookup/results?order=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email)}`;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- navigate result intentionally not awaited
        navigate(resultsUrl);
    };

    return (
        <div className="order-lookup-entry-page text-sm">
            <SeoMeta
                title={t('guestOrderLookup.title', { defaultValue: 'Order Lookup' })}
                description={t('guestOrderLookup.description', {
                    defaultValue: 'Enter the order number and email used at checkout.',
                })}
                noIndex
            />

            <main className="container max-w-2xl mx-auto px-4 py-8" aria-labelledby="order-lookup-heading">
                <div className="space-y-6">
                    <div className="space-y-2">
                        <h1 id="order-lookup-heading" className="text-3xl font-bold">
                            {t('guestOrderLookup.title', { defaultValue: 'Order Lookup' })}
                        </h1>
                        <p className="text-muted-foreground">
                            {t('guestOrderLookup.description', {
                                defaultValue: 'Enter the order number and email used at checkout.',
                            })}
                        </p>
                    </div>

                    {isNavigatingToResults ? (
                        <div className="flex flex-col items-center justify-center space-y-4 py-12">
                            <Spinner size="lg" />
                        </div>
                    ) : (
                        <RequestCodeForm
                            initialOrderNumber={initialOrderNumber}
                            initialEmail={initialEmail}
                            onCodeSent={handleCodeSent}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}
