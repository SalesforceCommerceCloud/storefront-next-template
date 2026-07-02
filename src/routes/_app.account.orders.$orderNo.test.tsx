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
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ShopperOrders, ShopperProducts } from '@/scapi';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

const { t } = getTranslation();

const mockOrder: ShopperOrders.schemas['Order'] = {
    orderNo: 'INO001',
    status: 'new',
    productItems: [],
};

const mockProductsById: Record<string, ShopperProducts.schemas['Product'] | undefined> = {
    '701643108633M': {
        id: '701643108633M',
        name: 'First Product',
    } as ShopperProducts.schemas['Product'],
};

vi.mock('@/lib/api/order.server', () => ({
    fetchOrderWithProducts: vi.fn(),
}));

vi.mock('@/components/account/order-details', () => ({
    default: ({ order, productsById }: { order: any; productsById: any }) => (
        <div data-testid="order-details">
            <span data-testid="order-no">{order?.orderNo}</span>
            <span data-testid="products-count">{Object.keys(productsById || {}).length}</span>
        </div>
    ),
}));

vi.mock('@/components/order-skeleton', () => ({
    default: () => <div data-testid="order-skeleton">Loading order...</div>,
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

import OrderDetailsPage, { loader, ErrorBoundary } from './_app.account.orders.$orderNo';
import { fetchOrderWithProducts } from '@/lib/api/order.server';

function createOrderDetailsRouter(orderNo: string) {
    vi.mocked(fetchOrderWithProducts).mockImplementation((_context, orderNoParam) => ({
        orderDataPromise: Promise.resolve({
            order: { ...mockOrder, orderNo: orderNoParam },
            productsById: mockProductsById,
        }),
        orderPromise: Promise.resolve({ ...mockOrder, orderNo: orderNoParam }),
    }));
    return createMemoryRouter(
        [
            {
                path: '/account/orders/:orderNo',
                element: <OrderDetailsPage />,
                // Route-typed loader needs cast for createMemoryRouter's generic LoaderFunction signature
                loader: loader as any,
            },
        ],
        { initialEntries: [`/account/orders/${orderNo}`] }
    );
}

function createRouterWithRejectingLoader(orderNo: string) {
    let rejectOrderData: (err: Error) => void;
    const orderDataPromise = new Promise<never>((_, reject) => {
        rejectOrderData = reject;
    });
    // Add a catch handler to prevent unhandled promise rejection during test cleanup
    orderDataPromise.catch(() => {});
    vi.mocked(fetchOrderWithProducts).mockImplementation(() => {
        setTimeout(() => rejectOrderData(new Error('Order not found')), 0);
        return {
            orderDataPromise,
            orderPromise: new Promise<never>(() => {}),
        };
    });
    return createMemoryRouter(
        [
            {
                path: '/account/orders/:orderNo',
                element: <OrderDetailsPage />,
                // Route-typed loader needs cast for createMemoryRouter's generic LoaderFunction signature
                loader: loader as any,
            },
        ],
        { initialEntries: [`/account/orders/${orderNo}`] }
    );
}

describe('Order Details Route (_app.account.orders.$orderNo)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('loader', () => {
        test('throws redirect when orderNo is missing or undefined', () => {
            expect(() => loader({ context: {} as any, params: {} } as any)).toThrow();
            expect(() => loader({ context: {} as any, params: { orderNo: undefined } } as any)).toThrow();
        });

        test('returns orderData promise from fetchOrderWithProducts', async () => {
            vi.mocked(fetchOrderWithProducts).mockReturnValue({
                orderDataPromise: Promise.resolve({
                    order: { ...mockOrder, orderNo: 'ORD-123' },
                    productsById: mockProductsById,
                }),
                orderPromise: Promise.resolve({ ...mockOrder, orderNo: 'ORD-123' }),
            });
            const result = loader({ context: {} as any, params: { orderNo: 'ORD-123' } } as any);

            expect(result).toHaveProperty('orderData');
            expect(result.orderData).toBeInstanceOf(Promise);

            const data = await result.orderData;
            expect(data.order).toBeDefined();
            expect(data.order.orderNo).toBe('ORD-123');
            expect(data.productsById).toEqual(mockProductsById);

            vi.mocked(fetchOrderWithProducts).mockReturnValue({
                orderDataPromise: Promise.resolve({
                    order: { ...mockOrder, orderNo: 'CUSTOM-456' },
                    productsById: mockProductsById,
                }),
                orderPromise: Promise.resolve({ ...mockOrder, orderNo: 'CUSTOM-456' }),
            });
            const result2 = loader({ context: {} as any, params: { orderNo: 'CUSTOM-456' } } as any);
            const data2 = await result2.orderData;
            expect(data2.order.orderNo).toBe('CUSTOM-456');
        });
    });

    describe('ErrorBoundary', () => {
        test('renders order not found card and back link', () => {
            const router = createMemoryRouter([{ path: '/', element: <ErrorBoundary /> }], { initialEntries: ['/'] });
            render(
                <AllProvidersWrapper>
                    <RouterProvider router={router} />
                </AllProvidersWrapper>
            );

            expect(screen.getByText(t('account:orders.orderNotFound'))).toBeInTheDocument();
            expect(screen.getByText(t('account:orders.orderNotFoundDescription'))).toBeInTheDocument();
            const backLink = screen.getByRole('link', {
                name: t('account:orders.backToOrderHistory'),
            });
            expect(backLink).toHaveAttribute('href', '/global/en-GB/account/orders');
        });
    });

    describe('OrderDetailsPage', () => {
        test('renders OrderDetails with resolved data', async () => {
            const router = createOrderDetailsRouter('INO001');
            render(
                <AllProvidersWrapper>
                    <RouterProvider router={router} />
                </AllProvidersWrapper>
            );

            await screen.findByTestId('order-details');
            expect(screen.getByTestId('order-no')).toHaveTextContent('INO001');
            expect(screen.getByTestId('products-count')).toBeInTheDocument();
        });

        test('shows order not found card when orderData promise rejects (Await errorElement)', async () => {
            const router = createRouterWithRejectingLoader('BAD-ORDER');
            const { unmount } = render(
                <AllProvidersWrapper>
                    <RouterProvider router={router} />
                </AllProvidersWrapper>
            );

            await screen.findByText(t('account:orders.orderNotFound'), {}, { timeout: 2000 });
            const errorSection = screen.getByTestId('order-not-found');
            expect(errorSection).toHaveTextContent(t('account:orders.orderNotFound'));
            expect(errorSection).toHaveTextContent(t('account:orders.orderNotFoundDescription'));
            const backLink = within(errorSection).getByRole('link', {
                name: t('account:orders.backToOrderHistory'),
            });
            expect(backLink).toHaveAttribute('href', '/global/en-GB/account/orders');

            // Ensure proper cleanup before test completes
            unmount();
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        test('a resolved success renders the order content and does NOT route to the error card', async () => {
            // A no-`omsData` success and the SOM-not-connected case map to THE SAME
            // route behavior: at this layer the route has no `omsData` branch — a
            // successfully-resolved order always renders via the Await resolve path,
            // and only a *rejected* orderData promise routes to the not-found / error
            // card (locked by the reject test above). So the durable guarantee to
            // verify here is: success → content renders, error card absent. The
            // OMS-vs-ECOM *rendering* itself lives in the order-details component
            // (mocked out in this route test) and is verified in its own tests.
            // `productsById: {}` covers the products-degraded variant too.
            vi.mocked(fetchOrderWithProducts).mockImplementation((_context, orderNoParam) => ({
                orderDataPromise: Promise.resolve({
                    order: { ...mockOrder, orderNo: orderNoParam },
                    productsById: {},
                }),
                orderPromise: Promise.resolve({ ...mockOrder, orderNo: orderNoParam }),
            }));
            const router = createMemoryRouter(
                [{ path: '/account/orders/:orderNo', element: <OrderDetailsPage />, loader: loader as any }],
                { initialEntries: ['/account/orders/ECOM-1'] }
            );
            render(
                <AllProvidersWrapper>
                    <RouterProvider router={router} />
                </AllProvidersWrapper>
            );

            await screen.findByTestId('order-details');
            expect(screen.getByTestId('order-no')).toHaveTextContent('ECOM-1');
            // the error / not-found card must NOT be present on a successful resolve
            expect(screen.queryByTestId('order-not-found')).not.toBeInTheDocument();
        });
    });
});
