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
import { render, screen, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import OrderListPage, { loader } from './_app.account.orders._index';
import { fetchCustomerOrders } from '@/lib/api/order.server';
import { getAuth } from '@/middlewares/auth.server';
import type { Order } from '@/components/account/order-list';
import { createTestContext, ROUTE_PATTERN } from '@/lib/test-utils';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

const { t } = getTranslation();

vi.mock('@/lib/api/order.server', () => ({
    fetchCustomerOrders: vi.fn(),
    DEFAULT_ORDERS_OFFSET: 0,
    DEFAULT_ORDERS_LIMIT: 10,
}));

vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

const mockGetAuth = vi.mocked(getAuth);

const mockOrders: Order[] = [
    {
        orderNo: 'ORD-2024-001',
        orderDate: '2024-09-14T10:30:00Z',
        status: 'created',
        statusLabel: 'Created',
        total: 48.38,
        currency: 'USD',
        itemCount: 2,
        productItems: [
            {
                productId: 'prod-1',
                quantity: 1,
                imageUrl: '/images/shirt.jpg',
            },
            {
                productId: 'prod-2',
                quantity: 2,
                imageUrl: '/images/pants.jpg',
            },
        ],
    },
    {
        orderNo: 'ORD-2024-002',
        orderDate: '2024-09-12T14:00:00Z',
        status: 'new',
        statusLabel: 'New',
        total: 43.0,
        currency: 'USD',
        itemCount: 1,
        productItems: [
            {
                productId: 'prod-3',
                quantity: 2,
                imageUrl: '/images/dress.jpg',
            },
        ],
    },
    {
        orderNo: 'ORD-2024-003',
        orderDate: '2024-09-10T08:00:00Z',
        status: 'completed',
        statusLabel: 'Completed',
        total: 95.92,
        currency: 'USD',
        itemCount: 2,
        productItems: [],
    },
];

describe('AccountOrders Page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAuth.mockReturnValue({ customerId: 'customer-123' } as ReturnType<typeof getAuth>);
    });

    const renderAccountOrders = async (ordersData: Order[] = mockOrders) => {
        vi.mocked(fetchCustomerOrders).mockResolvedValue({
            orders: ordersData,
            total: ordersData.length,
            offset: 0,
            limit: 10,
        });

        const router = createMemoryRouter(
            [
                {
                    path: '/',
                    element: <OrderListPage />,
                    // Route-typed loader needs cast for createMemoryRouter's generic LoaderFunction signature
                    loader: loader as any,
                },
            ],
            {
                initialEntries: ['/'],
            }
        );

        const result = render(
            <AllProvidersWrapper>
                <RouterProvider router={router} />
            </AllProvidersWrapper>
        );

        // Wait for the Await promise to resolve and actual content to render.
        // The skeleton also has an h3 so we need to wait for data-specific content.
        if (ordersData.length > 0) {
            await waitFor(() => {
                expect(screen.getAllByText('View Order Details').length).toBeGreaterThan(0);
            });
        } else {
            await waitFor(() => {
                expect(screen.getByText(t('account:orders.empty'))).toBeInTheDocument();
            });
        }

        return result;
    };

    describe('loader', () => {
        test('fetches orders for authenticated customer', () => {
            const context = createTestContext();
            vi.mocked(fetchCustomerOrders).mockResolvedValue({
                orders: mockOrders,
                total: mockOrders.length,
                offset: 0,
                limit: 10,
            });

            const result = loader({
                context,
                params: { siteId: 'test-site', localeId: 'en-US' },
                request: new Request('http://localhost'),
                url: new URL('http://localhost'),
                pattern: ROUTE_PATTERN,
            });

            expect(fetchCustomerOrders).toHaveBeenCalledWith(context, 'customer-123', {
                offset: 0,
                limit: 10,
            });
            expect(result).toHaveProperty('ordersPromise');
        });

        test('redirects to login when customerId is missing', () => {
            mockGetAuth.mockReturnValue({ customerId: undefined } as ReturnType<typeof getAuth>);
            const context = createTestContext();

            expect(() =>
                loader({
                    context,
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    request: new Request('http://localhost'),
                    url: new URL('http://localhost'),
                    pattern: ROUTE_PATTERN,
                })
            ).toThrow();
        });
    });

    describe('Page Content', () => {
        test('renders Order History title', async () => {
            await renderAccountOrders();
            expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(t('account:navigation.orderHistory'));
        });

        test('renders subtitle', async () => {
            await renderAccountOrders();
            expect(screen.getByText(t('account:orders.subtitle'))).toBeInTheDocument();
        });

        test('renders orders from API', async () => {
            await renderAccountOrders();

            // Check for order links
            const orderLinks = screen.getAllByRole('link');
            const orderHrefs = orderLinks.map((link) => link.getAttribute('href'));

            expect(orderHrefs).toContain('/global/en-GB/account/orders/ORD-2024-001');
            expect(orderHrefs).toContain('/global/en-GB/account/orders/ORD-2024-002');
            expect(orderHrefs).toContain('/global/en-GB/account/orders/ORD-2024-003');
        });

        test('renders View Details buttons', async () => {
            await renderAccountOrders();
            const viewDetailsLinks = screen.getAllByText('View Order Details');
            expect(viewDetailsLinks).toHaveLength(3);
        });

        test('renders empty state when no orders', async () => {
            await renderAccountOrders([]);
            expect(screen.getByText(t('account:orders.empty'))).toBeInTheDocument();
        });
    });

    describe('Order Status Display', () => {
        test('renders created status badge', async () => {
            await renderAccountOrders();
            const createdBadge = screen.getByText('Created').closest('span');
            expect(createdBadge).toHaveClass('bg-status-positive');
        });

        test('renders new status badge', async () => {
            await renderAccountOrders();
            const newBadge = screen.getByText('New').closest('span');
            expect(newBadge).toHaveClass('bg-status-positive');
        });

        test('renders completed status badge', async () => {
            await renderAccountOrders();
            const completedBadge = screen.getByText('Completed').closest('span');
            expect(completedBadge).toHaveClass('bg-status-positive');
        });
    });

    describe('Loading State', () => {
        test('shows loading skeleton while fetching orders', async () => {
            // Mock a delayed response
            vi.mocked(fetchCustomerOrders).mockImplementation(
                () =>
                    new Promise((resolve) =>
                        setTimeout(
                            () =>
                                resolve({
                                    orders: mockOrders,
                                    total: mockOrders.length,
                                    offset: 0,
                                    limit: 10,
                                }),
                            200
                        )
                    )
            );

            const router = createMemoryRouter(
                [
                    {
                        path: '/',
                        element: <OrderListPage />,
                        // Route-typed loader needs cast for createMemoryRouter's generic LoaderFunction signature
                        loader: loader as any,
                    },
                ],
                {
                    initialEntries: ['/'],
                }
            );

            render(
                <AllProvidersWrapper>
                    <RouterProvider router={router} />
                </AllProvidersWrapper>
            );

            // Wait for skeleton to appear (router needs a tick to render)
            await waitFor(() => {
                expect(screen.getByText('Order History')).toBeInTheDocument();
            });
            const skeletonCards = screen.getAllByRole('generic').filter((el) => el.classList.contains('animate-pulse'));
            expect(skeletonCards.length).toBeGreaterThan(0);

            // Wait for orders to load
            await waitFor(() => {
                expect(screen.getAllByText('View Order Details').length).toBeGreaterThan(0);
            });
        });
    });

    describe('Error State', () => {
        test('shows error message when orders fail to load', async () => {
            vi.mocked(fetchCustomerOrders).mockRejectedValue(new Error('API error'));

            const router = createMemoryRouter(
                [
                    {
                        path: '/',
                        element: <OrderListPage />,
                        // Route-typed loader needs cast for createMemoryRouter's generic LoaderFunction signature
                        loader: loader as any,
                    },
                ],
                {
                    initialEntries: ['/'],
                }
            );

            render(
                <AllProvidersWrapper>
                    <RouterProvider router={router} />
                </AllProvidersWrapper>
            );

            await waitFor(() => {
                expect(screen.getByText(t('account:orders.errorDescription'))).toBeInTheDocument();
            });
        });
    });
});
