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
import { type ReactElement, Suspense, useState } from 'react';
import { useOutletContext, Await, useLoaderData } from 'react-router';
import type { Route } from './+types/_app.account.overview';
import { AccountOverview, AccountOverviewSkeleton } from '@/components/account/account-overview';
import { Card, CardContent } from '@/components/ui/card';
import ProductRecommendations from '@/components/product-recommendations';
import { ProductRecommendationSkeleton } from '@/components/product/skeletons';
import { SeoMeta } from '@/components/seo-meta';
import { useTranslation } from 'react-i18next';
import type { ShopperCustomers } from '@/scapi';
import { fetchCustomerOrders, type CustomerOrdersResult } from '@/lib/api/order.server';
import { getAuth } from '@/middlewares/auth.server';
import { fetchProductRecommendations } from '@/lib/product/recommendations.server';
import { EINSTEIN_RECOMMENDERS } from '@/lib/product/einstein-recommenders';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import type { Recommendation } from '@/hooks/recommenders/use-recommenders';

type Customer = ShopperCustomers.schemas['Customer'];

type AccountLayoutContext = {
    customer: Promise<Customer | null>;
};

type OverviewLoaderData = {
    ordersPromise: Promise<CustomerOrdersResult>;
    curatedRecommendationsPromise: Promise<Recommendation>;
};

const RECENT_ORDERS_LIMIT = 5;

/**
 * Loader fetches the 5 most recent customer orders for the overview dashboard.
 * Returns a deferred promise so the welcome section renders instantly while orders stream in.
 *
 * Auth is already validated by the parent account layout loader — if this loader
 * runs, the user is authenticated. Falls back to an empty result if customerId
 * is somehow missing (defensive).
 */
export function loader({ context, request }: Route.LoaderArgs): OverviewLoaderData {
    const session = getAuth(context);
    const customerId = session.customerId ?? '';
    const currency = context.get(siteContext)?.currency;

    const ordersPromise = fetchCustomerOrders(context, customerId, {
        offset: 0,
        limit: RECENT_ORDERS_LIMIT,
    });

    // Curated recommendations are identity-only (cookieId/userId, no anchor product),
    // so they fire immediately in parallel with orders.
    const curatedRecommendationsPromise = fetchProductRecommendations(
        { context, request },
        {
            name: EINSTEIN_RECOMMENDERS.EMPTY_SEARCH_RESULTS_MOST_VIEWED,
            ...(currency ? { currency } : {}),
        }
    );

    return { ordersPromise, curatedRecommendationsPromise };
}

/**
 * Account Overview Dashboard Route - Main "My Account" landing page
 *
 * This route renders the Account Overview Dashboard which displays:
 * - Welcome back greeting with customer name
 * - Recent orders (last 5)
 * - Curated product recommendations (using Einstein)
 * - Quick Links to key account sections
 */
export default function AccountOverviewRoute(): ReactElement {
    const { t } = useTranslation('account');
    const { customer: customerPromise } = useOutletContext<AccountLayoutContext>();
    const { ordersPromise, curatedRecommendationsPromise } = useLoaderData<typeof loader>();

    // Pin the recommendations promise so account-mutating revalidations don't re-suspend the recommendation boundary
    const [pinnedCuratedPromise] = useState(() => curatedRecommendationsPromise);

    const curatedTitle = t('overview.curatedForYou.title');
    const recommendationsSkeleton = (
        <Card className="py-0">
            <CardContent className="p-6">
                <ProductRecommendationSkeleton className="max-w-none -mx-6 md:py-0" />
            </CardContent>
        </Card>
    );
    const recommendationsSlot = (
        <Card className="py-0">
            <CardContent className="p-6">
                <ProductRecommendations
                    recommenderName={EINSTEIN_RECOMMENDERS.EMPTY_SEARCH_RESULTS_MOST_VIEWED}
                    recommenderTitle={curatedTitle}
                    titleClassName="text-lg font-semibold text-foreground tracking-tight"
                    subtitle={t('overview.curatedForYou.subtitle')}
                    className="max-w-none -mx-6 md:py-0"
                    data={pinnedCuratedPromise}
                    fallback={
                        <ProductRecommendationSkeleton title={curatedTitle} className="max-w-none -mx-6 md:py-0" />
                    }
                />
            </CardContent>
        </Card>
    );

    return (
        <>
            <SeoMeta title={t('meta.overviewTitle', { defaultValue: 'Account Overview' })} noIndex />
            <Suspense fallback={<AccountOverviewSkeleton recommendationsSlot={recommendationsSkeleton} />}>
                <Await resolve={customerPromise}>
                    {(customer: Customer | null) => (
                        <AccountOverview
                            customer={customer}
                            ordersPromise={ordersPromise}
                            recommendationsSlot={recommendationsSlot}
                        />
                    )}
                </Await>
            </Suspense>
        </>
    );
}
