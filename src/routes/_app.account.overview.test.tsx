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

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { isValidElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { createTestContext, createLoaderArgs } from '@/lib/test-utils';
import { loader } from './_app.account.overview';
import type { Route } from './+types/_app.account.overview';

let capturedOverviewProps: { customer?: any; ordersPromise?: any; recommendationsSlot?: any } = {};

vi.mock('@/components/account/account-overview', () => ({
    AccountOverview: (props: { customer?: any; ordersPromise?: any; recommendationsSlot?: any }) => {
        capturedOverviewProps = props;
        return <div data-testid="account-overview" />;
    },
    AccountOverviewSkeleton: () => <div data-testid="account-overview-skeleton" />,
}));

vi.mock('@/components/seo-meta', () => ({
    SeoMeta: ({ title, noIndex }: { title: string; noIndex?: boolean }) => (
        <div data-testid="seo-meta" data-title={title} data-no-index={String(noIndex)} />
    ),
}));

const mockFetchCustomerOrders = vi.fn();

vi.mock('@/lib/api/order.server', () => ({
    fetchCustomerOrders: (...args: any[]) => mockFetchCustomerOrders(...args),
}));

const mockFetchEnrichedRecommendations = vi.fn();

vi.mock('@/lib/product/recommendations.server', () => ({
    fetchProductRecommendations: (...args: any[]) => mockFetchEnrichedRecommendations(...args),
}));

vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(() => ({ customerId: 'cust-123' })),
}));

vi.mock('@/lib/wishlist/fetch-initial-state.server', () => ({
    fetchWishlistInitialState: vi.fn(() => Promise.resolve({ customerId: null, productIds: new Set() })),
}));

const mockCustomer = {
    customerId: 'cust-123',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
};

const mockOrdersResult = {
    orders: [
        { orderNo: 'ORD-001', orderDate: '2026-04-10', status: 'completed', total: 125, itemCount: 2 },
        { orderNo: 'ORD-002', orderDate: '2026-04-08', status: 'new', total: 89.99, itemCount: 1 },
    ],
    total: 2,
    offset: 0,
    limit: 5,
};

describe('Account Overview page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        capturedOverviewProps = {};
        mockFetchCustomerOrders.mockReturnValue(Promise.resolve(mockOrdersResult));
        mockFetchEnrichedRecommendations.mockReturnValue(Promise.resolve({ recs: [] }));
    });

    describe('loader', () => {
        test('fetches the 5 most recent orders for the authenticated customer', async () => {
            const context = createTestContext();
            const args = createLoaderArgs<Route.LoaderArgs>(new Request('http://localhost/account/overview'), context, {
                pattern: '/account/overview',
            });

            const result = loader(args);

            expect(result.ordersPromise).toBeDefined();
            expect(mockFetchCustomerOrders).toHaveBeenCalledTimes(1);
            expect(mockFetchCustomerOrders).toHaveBeenCalledWith(context, 'cust-123', {
                offset: 0,
                limit: 5,
            });

            const orders = await result.ordersPromise;
            expect(orders).toEqual(mockOrdersResult);
        });

        test('defers curated recommendations promise (EMPTY_SEARCH_RESULTS_MOST_VIEWED)', async () => {
            const context = createTestContext({ currency: 'USD' });
            const request = new Request('http://localhost/account/overview');
            const args = createLoaderArgs<Route.LoaderArgs>(request, context, {
                pattern: '/account/overview',
            });

            const result = loader(args);

            expect(result.curatedRecommendationsPromise).toBeInstanceOf(Promise);
            await result.curatedRecommendationsPromise;
            expect(mockFetchEnrichedRecommendations).toHaveBeenCalledTimes(1);
            const [firstArg, opts] = mockFetchEnrichedRecommendations.mock.calls[0] as [
                unknown,
                { name: string; currency?: string; products?: unknown[] },
            ];
            expect(firstArg).toMatchObject({ context, request });
            expect(opts.name).toBe('products-in-all-categories');
            expect(opts.currency).toBe('USD');
            expect(opts.products).toBeUndefined();
        });
    });

    describe('component', () => {
        async function renderRoute(customerPromise: Promise<any>) {
            const AccountOverviewRoute = (await import('./_app.account.overview')).default;

            const router = createMemoryRouter(
                [
                    {
                        path: '/account',
                        element: <Outlet context={{ customer: customerPromise }} />,
                        children: [
                            {
                                index: true,
                                element: <AccountOverviewRoute />,
                                loader: () => ({
                                    ordersPromise: Promise.resolve(mockOrdersResult),
                                    wishlistInitialState: Promise.resolve({
                                        customerId: null,
                                        productIds: new Set(),
                                    }),
                                    curatedRecommendationsPromise: Promise.resolve({ recs: [] }),
                                }),
                            },
                        ],
                    },
                ],
                { initialEntries: ['/account'] }
            );

            return render(
                <AllProvidersWrapper>
                    <RouterProvider router={router} />
                </AllProvidersWrapper>
            );
        }

        test('shows the account dashboard with customer and orders data once loaded', async () => {
            await renderRoute(Promise.resolve(mockCustomer));

            await waitFor(() => {
                expect(screen.getByTestId('account-overview')).toBeInTheDocument();
            });

            expect(capturedOverviewProps.customer).toEqual(mockCustomer);
            expect(capturedOverviewProps.ordersPromise).toBeDefined();
            // Recommendations are passed via slot composition rather than a promise prop —
            // the route owns the recommender selection, title, and card chrome.
            expect(isValidElement(capturedOverviewProps.recommendationsSlot)).toBe(true);
        });

        test('shows the account dashboard for a guest with no customer data', async () => {
            await renderRoute(Promise.resolve(null));

            await waitFor(() => {
                expect(screen.getByTestId('account-overview')).toBeInTheDocument();
            });

            expect(capturedOverviewProps.customer).toBeNull();
            expect(capturedOverviewProps.ordersPromise).toBeDefined();
        });

        test('shows a loading skeleton while customer data is being fetched', async () => {
            const pendingPromise = new Promise<any>(() => {});
            await renderRoute(pendingPromise);

            await waitFor(() => {
                expect(screen.getByTestId('account-overview-skeleton')).toBeInTheDocument();
            });
            expect(screen.queryByTestId('account-overview')).not.toBeInTheDocument();
        });

        test('sets the page title to Account Overview and hides from search engines', async () => {
            await renderRoute(Promise.resolve(mockCustomer));

            await waitFor(() => {
                expect(screen.getByTestId('seo-meta')).toBeInTheDocument();
            });

            const seoMeta = screen.getByTestId('seo-meta');
            expect(seoMeta).toHaveAttribute('data-title', 'Account Overview');
            expect(seoMeta).toHaveAttribute('data-no-index', 'true');
        });
    });
});
