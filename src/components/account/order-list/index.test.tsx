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
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, test, expect } from 'vitest';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { mockAltSiteObject } from '@/test-utils/config';
import { OrderList, OrderListHeader, OrderListBody, type Order } from './index';

const { t } = getTranslation();

vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => {
    const actual = await importOriginal<object>();
    return {
        ...actual,
        useSite: vi.fn(() => ({
            site: { id: mockAltSiteObject.id, defaultLocale: mockAltSiteObject.defaultLocale },
            language: mockAltSiteObject.defaultLocale,
            currency: mockAltSiteObject.defaultCurrency,
        })),
    };
});

// Mock the Link component from @/components/link
vi.mock('@/components/link', () => ({
    Link: ({ children, to, onClick }: { children: React.ReactNode; to: string; onClick?: () => void }) => (
        <a href={to} onClick={onClick}>
            {children}
        </a>
    ),
}));

const testOrders: Order[] = [
    {
        orderNo: 'ORD001',
        orderDate: '2024-09-14T10:30:00Z',
        status: 'completed',
        statusLabel: 'Completed',
        total: 150.0,
        itemCount: 2,
        productItems: [
            { productId: 'prod-1', quantity: 1, imageUrl: '/images/item1.jpg', imageAlt: 'Item 1' },
            { productId: 'prod-2', quantity: 1, imageUrl: '/images/item2.jpg', imageAlt: 'Item 2' },
        ],
    },
    {
        orderNo: 'ORD002',
        orderDate: '2024-09-12T14:00:00Z',
        status: 'new',
        statusLabel: 'New',
        total: 75.5,
        itemCount: 1,
        productItems: [{ productId: 'prod-3', quantity: 1, imageUrl: '/images/item3.jpg', imageAlt: 'Item 3' }],
    },
    {
        orderNo: 'ORD003',
        orderDate: '2024-09-08T11:30:00Z',
        status: 'cancelled',
        statusLabel: 'Cancelled',
        total: 200.0,
        itemCount: 3,
        productItems: [
            { productId: 'prod-4', quantity: 2, imageUrl: '/images/item4.jpg', imageAlt: 'Item 4' },
            { productId: 'prod-5', quantity: 1, imageUrl: '/images/item5.jpg', imageAlt: 'Item 5' },
        ],
    },
];

describe('OrderList Component', () => {
    const renderOrderList = (props: Partial<React.ComponentProps<typeof OrderList>> = {}) => {
        const defaultProps = {
            title: 'Order History',
            orders: testOrders,
        };
        return render(<OrderList {...defaultProps} {...props} />);
    };

    describe('Header Rendering', () => {
        test('renders title', () => {
            renderOrderList({ title: 'My Orders' });
            expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('My Orders');
        });

        test('renders subtitle when provided', () => {
            renderOrderList({ subtitle: 'View your order history' });
            expect(screen.getByText('View your order history')).toBeInTheDocument();
        });

        test('does not render subtitle when not provided', () => {
            renderOrderList({ subtitle: undefined });
            expect(screen.queryByText('View your order history')).not.toBeInTheDocument();
        });
    });

    describe('Order Cards', () => {
        test('renders all orders', () => {
            renderOrderList();
            // Check for status labels which are unique to each order
            expect(screen.getByText('Completed')).toBeInTheDocument();
            expect(screen.getByText('New')).toBeInTheDocument();
            expect(screen.getByText('Cancelled')).toBeInTheDocument();
        });

        test('renders order totals correctly', () => {
            renderOrderList();
            expect(screen.getByText('$150.00')).toBeInTheDocument();
            expect(screen.getByText('$75.50')).toBeInTheDocument();
            expect(screen.getByText('$200.00')).toBeInTheDocument();
        });

        test('renders View Order Details link for each order', () => {
            renderOrderList();
            const viewDetailsLinks = screen.getAllByText('View Order Details');
            expect(viewDetailsLinks).toHaveLength(testOrders.length);
        });
    });

    describe('Status Badge', () => {
        test('renders completed status with success styling', () => {
            renderOrderList({
                orders: [
                    {
                        orderNo: 'ORD001',
                        orderDate: '2024-09-14T10:30:00Z',
                        status: 'completed',
                        statusLabel: 'Completed',
                        total: 100,
                        itemCount: 1,
                        productItems: [{ productId: 'prod-1', quantity: 1 }],
                    },
                ],
            });
            const badge = screen.getByText('Completed').closest('span');
            expect(badge).toHaveClass('bg-status-positive');
        });

        test('renders cancelled status with destructive styling', () => {
            renderOrderList({
                orders: [
                    {
                        orderNo: 'ORD001',
                        orderDate: '2024-09-08T11:30:00Z',
                        status: 'cancelled',
                        statusLabel: 'Cancelled',
                        total: 100,
                        itemCount: 1,
                        productItems: [{ productId: 'prod-1', quantity: 1 }],
                    },
                ],
            });
            const badge = screen.getByText('Cancelled').closest('span');
            expect(badge).toHaveClass('bg-status-critical/20');
        });

        test('renders new status with pickup styling', () => {
            renderOrderList({
                orders: [
                    {
                        orderNo: 'ORD001',
                        orderDate: '2024-09-12T14:00:00Z',
                        status: 'new',
                        statusLabel: 'New',
                        total: 100,
                        itemCount: 1,
                        productItems: [{ productId: 'prod-1', quantity: 1 }],
                    },
                ],
            });
            const badge = screen.getByText('New').closest('span');
            expect(badge).toHaveClass('bg-info');
        });
    });

    describe('Empty State', () => {
        test('renders empty message when no orders', () => {
            renderOrderList({ orders: [] });
            expect(screen.getByText(t('account:orders.empty'))).toBeInTheDocument();
        });

        test('renders Continue Shopping button in empty state', () => {
            renderOrderList({ orders: [] });
            const link = screen.getByRole('link', { name: 'Continue Shopping' });
            expect(link).toBeInTheDocument();
            expect(link).toHaveAttribute('href', '/');
        });

        test('renders custom empty message when provided', () => {
            renderOrderList({ orders: [], emptyMessage: 'Custom empty message' });
            expect(screen.getByText('Custom empty message')).toBeInTheDocument();
        });

        test('does not render order cards when no orders', () => {
            renderOrderList({ orders: [] });
            expect(screen.queryByText('View Order Details')).not.toBeInTheDocument();
        });
    });

    describe('Interactions', () => {
        test('calls onViewDetails when View Order Details is clicked', async () => {
            const user = userEvent.setup();
            const mockOnViewDetails = vi.fn();
            renderOrderList({ onViewDetails: mockOnViewDetails });

            const viewDetailsLinks = screen.getAllByText('View Order Details');
            await user.click(viewDetailsLinks[0]);

            expect(mockOnViewDetails).toHaveBeenCalledTimes(1);
            expect(mockOnViewDetails).toHaveBeenCalledWith('ORD001');
        });
    });

    describe('Product Thumbnails', () => {
        test('renders product images for each order', () => {
            renderOrderList();
            const images = screen.getAllByRole('img');
            // Each order should have its product images rendered
            expect(images.length).toBeGreaterThan(0);
        });
    });

    describe('Pickup Location', () => {
        test('renders pickup location when provided', () => {
            const orderWithPickup: Order = {
                orderNo: 'ORD001',
                orderDate: '2024-09-14T10:30:00Z',
                status: 'created',
                statusLabel: 'Created',
                total: 50.0,
                itemCount: 1,
                productItems: [{ productId: 'prod-1', quantity: 1 }],
                pickupLocation: {
                    name: 'Test Store',
                    address: '123 Main St',
                    city: 'San Francisco',
                    state: 'CA',
                    postalCode: '94105',
                },
            };

            renderOrderList({ orders: [orderWithPickup] });

            expect(screen.getByText('Pickup Location')).toBeInTheDocument();
            expect(screen.getByText('Test Store')).toBeInTheDocument();
            expect(screen.getByText('123 Main St, San Francisco, CA 94105')).toBeInTheDocument();
        });

        test('does not render pickup section when not provided', () => {
            renderOrderList();
            expect(screen.queryByText('Pickup Location')).not.toBeInTheDocument();
        });
    });
});

describe('OrderListHeader Component', () => {
    test('renders title', () => {
        render(<OrderListHeader title="My Orders" />);
        expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('My Orders');
    });

    test('renders subtitle when provided', () => {
        render(<OrderListHeader title="My Orders" subtitle="Track your purchases" />);
        expect(screen.getByText('Track your purchases')).toBeInTheDocument();
    });

    test('does not render subtitle when not provided', () => {
        render(<OrderListHeader title="My Orders" />);
        expect(screen.queryByText('Track your purchases')).not.toBeInTheDocument();
    });

    test('title is focusable for accessibility', () => {
        render(<OrderListHeader title="My Orders" />);
        const heading = screen.getByRole('heading', { level: 4 });
        expect(heading).toHaveAttribute('tabindex', '0');
    });
});

describe('OrderListBody Component', () => {
    test('renders order items', () => {
        render(<OrderListBody orders={testOrders} />);
        expect(screen.getByText('Completed')).toBeInTheDocument();
        expect(screen.getByText('New')).toBeInTheDocument();
        expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });

    test('renders empty state when no orders', () => {
        render(<OrderListBody orders={[]} />);
        expect(screen.getByText(t('account:orders.empty'))).toBeInTheDocument();
    });

    test('renders custom empty message', () => {
        render(<OrderListBody orders={[]} emptyMessage="Nothing here yet!" />);
        expect(screen.getByText('Nothing here yet!')).toBeInTheDocument();
    });

    test('renders total orders footer', () => {
        render(<OrderListBody orders={testOrders} />);
        expect(screen.getByText('Viewing 3 orders')).toBeInTheDocument();
    });

    test('renders zero orders count for empty list', () => {
        render(<OrderListBody orders={[]} />);
        expect(screen.getByText('Viewing 0 orders')).toBeInTheDocument();
    });

    test('renders pagination range and controls when total exceeds limit', () => {
        render(<OrderListBody orders={testOrders} total={25} offset={0} limit={10} />);
        expect(screen.getByText('Viewing 1–3 of 25 orders')).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: /order history pagination/i })).toBeInTheDocument();
        const nextLink = screen.getByRole('link', { name: /next/i });
        expect(nextLink).toHaveAttribute('href', '/account/orders?offset=10&limit=10');
        expect(screen.getByText('Previous page')).toBeInTheDocument();
    });

    test('renders "Viewing X orders" and disabled Previous/Next when single page', () => {
        render(<OrderListBody orders={testOrders} total={5} offset={0} limit={10} />);
        expect(screen.getByText('Viewing 5 orders')).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: /order history pagination/i })).toBeInTheDocument();
        expect(screen.getByText('Previous page')).toBeInTheDocument();
        expect(screen.getByText('Next page')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /previous/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /next/i })).not.toBeInTheDocument();
    });

    test('calls onViewDetails callback', async () => {
        const user = userEvent.setup();
        const mockOnViewDetails = vi.fn();
        render(<OrderListBody orders={testOrders} onViewDetails={mockOnViewDetails} />);

        const viewDetailsLinks = screen.getAllByText('View Order Details');
        await user.click(viewDetailsLinks[0]);

        expect(mockOnViewDetails).toHaveBeenCalledTimes(1);
        expect(mockOnViewDetails).toHaveBeenCalledWith('ORD001');
    });

    test('does not render header elements', () => {
        render(<OrderListBody orders={testOrders} />);
        expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument();
    });

    describe('Semantic list markup', () => {
        test('renders orders in a ul with role="list"', () => {
            render(<OrderListBody orders={testOrders} />);

            const list = screen.getByRole('list');
            expect(list).toBeInTheDocument();
            expect(list.tagName).toBe('UL');
        });

        test('renders each order in a li element', () => {
            render(<OrderListBody orders={testOrders} />);

            const list = screen.getByRole('list');
            const listItems = list.querySelectorAll('li');
            expect(listItems).toHaveLength(3);
        });

        test('does not render list when orders is empty', () => {
            render(<OrderListBody orders={[]} />);

            expect(screen.queryByRole('list')).not.toBeInTheDocument();
        });
    });
});
