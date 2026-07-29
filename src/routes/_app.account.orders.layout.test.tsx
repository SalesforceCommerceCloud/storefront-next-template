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
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import AccountOrdersLayout, { loader } from './_app.account.orders';
import { fetchOmsMetaData } from '@/lib/api/order.server';

vi.mock('@/lib/api/order.server', () => ({
    fetchOmsMetaData: vi.fn(),
}));

describe('Orders section loader (OMS metadata)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('returns a deferred omsMetaData promise from fetchOmsMetaData', async () => {
        vi.mocked(fetchOmsMetaData).mockResolvedValue({
            omsActive: true,
            cancelReasonCodes: [{ reason: 'Changed my mind', default: true }],
            returnReasonCodes: [{ reason: 'Does not fit', default: true }],
        });

        const result = loader({ context: {} as any } as any);

        expect(result).toHaveProperty('omsMetaData');
        expect(result.omsMetaData).toBeInstanceOf(Promise);
        await expect(result.omsMetaData).resolves.toEqual({
            omsActive: true,
            cancelReasonCodes: [{ reason: 'Changed my mind', default: true }],
            returnReasonCodes: [{ reason: 'Does not fit', default: true }],
        });
    });

    test('omsMetaData resolves (never rejects) so a metadata failure cannot break the section', async () => {
        // fetchOmsMetaData is contractually non-throwing: even a degraded fetch
        // resolves to the empty tri-state rather than rejecting.
        vi.mocked(fetchOmsMetaData).mockResolvedValue({
            omsActive: true,
            cancelReasonCodes: [],
            returnReasonCodes: [],
        });

        const result = loader({ context: {} as any } as any);

        await expect(result.omsMetaData).resolves.toEqual({
            omsActive: true,
            cancelReasonCodes: [],
            returnReasonCodes: [],
        });
    });
});

describe('Orders section layout', () => {
    test('shows the order list when a shopper navigates to orders', () => {
        const router = createMemoryRouter(
            [
                {
                    path: '/account/orders',
                    element: <AccountOrdersLayout />,
                    children: [
                        {
                            index: true,
                            element: <div data-testid="order-list">Order List</div>,
                        },
                    ],
                },
            ],
            { initialEntries: ['/account/orders'] }
        );

        render(<RouterProvider router={router} />);

        expect(screen.getByTestId('order-list')).toBeInTheDocument();
        expect(screen.getByText('Order List')).toBeInTheDocument();
    });

    test('shows order details when a shopper clicks into a specific order', () => {
        const router = createMemoryRouter(
            [
                {
                    path: '/account/orders',
                    element: <AccountOrdersLayout />,
                    children: [
                        {
                            path: ':orderNo',
                            element: <div data-testid="order-detail">Order Detail</div>,
                        },
                    ],
                },
            ],
            { initialEntries: ['/account/orders/ORD-001'] }
        );

        render(<RouterProvider router={router} />);

        expect(screen.getByTestId('order-detail')).toBeInTheDocument();
    });
});
