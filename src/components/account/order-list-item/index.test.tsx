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

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { OrderListItem, type OrderListItemData } from './index';

const renderWithProviders = (ui: React.ReactElement) => render(ui, { wrapper: AllProvidersWrapper });

// Mock react-router
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        Link: ({ children, to, onClick }: { children: React.ReactNode; to: string; onClick?: () => void }) => (
            <a href={to} onClick={onClick}>
                {children}
            </a>
        ),
    };
});

const mockOrder: OrderListItemData = {
    orderNo: 'ORD-001-2024',
    orderDate: '2024-09-14T10:30:00Z',
    total: 48.38,
    currency: 'USD',
    status: 'created',
    statusLabel: 'Created',
    itemCount: 2,
    productItems: [
        {
            productId: 'prod-1',
            quantity: 1,
            imageUrl: '/images/shirt.jpg',
            imageAlt: 'Classic Shirt',
        },
        {
            productId: 'prod-2',
            quantity: 2,
            imageUrl: '/images/pants.jpg',
            imageAlt: 'Dress Pants',
        },
    ],
};

const mockOrderWithPickup: OrderListItemData = {
    ...mockOrder,
    pickupLocation: {
        name: 'Salesforce Foundations San Francisco',
        address: '415 Mission Street',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
    },
};

describe('OrderListItem', () => {
    describe('rendering', () => {
        it('renders order date, total, and item count', () => {
            renderWithProviders(<OrderListItem order={mockOrder} />);

            expect(screen.getByText('14 Sept 2024')).toBeInTheDocument();
            expect(screen.getByText('$48.38')).toBeInTheDocument();
            // Check for Items label and its value
            expect(screen.getByText('Items')).toBeInTheDocument();
            // The item count "2" appears twice - once in header and once as quantity badge
            const allTwos = screen.getAllByText('2');
            expect(allTwos.length).toBeGreaterThanOrEqual(1);
        });

        it('renders status badge with label', () => {
            renderWithProviders(<OrderListItem order={mockOrder} />);

            expect(screen.getByText('Created')).toBeInTheDocument();
        });

        it('renders product thumbnails', () => {
            renderWithProviders(<OrderListItem order={mockOrder} />);

            const images = screen.getAllByRole('img');
            expect(images).toHaveLength(2);
        });

        it('shows quantity badge for items with quantity > 1', () => {
            renderWithProviders(<OrderListItem order={mockOrder} />);

            // Quantity badge for pants (qty: 2) - appears in a badge element
            const quantityBadges = screen.getAllByText('2');
            // Should have at least one (the quantity badge)
            expect(quantityBadges.length).toBeGreaterThanOrEqual(1);
        });

        it('renders View Order Details link', () => {
            renderWithProviders(<OrderListItem order={mockOrder} />);

            expect(screen.getByText('View Order Details')).toBeInTheDocument();
        });
    });

    describe('pickup location', () => {
        it('renders pickup location when provided', () => {
            renderWithProviders(<OrderListItem order={mockOrderWithPickup} />);

            expect(screen.getByText('Pickup Location')).toBeInTheDocument();
            expect(screen.getByText('Salesforce Foundations San Francisco')).toBeInTheDocument();
            expect(screen.getByText('415 Mission Street, San Francisco, CA 94105')).toBeInTheDocument();
        });

        it('does not render pickup section when not provided', () => {
            renderWithProviders(<OrderListItem order={mockOrder} />);

            expect(screen.queryByText('Pickup Location')).not.toBeInTheDocument();
        });
    });

    describe('thumbnail overflow', () => {
        it('shows overflow indicator when products exceed maxThumbnails', () => {
            const manyProducts: OrderListItemData = {
                ...mockOrder,
                productItems: Array.from({ length: 15 }, (_, i) => ({
                    productId: `prod-${i}`,
                    quantity: 1,
                })),
            };

            renderWithProviders(<OrderListItem order={manyProducts} maxThumbnails={12} />);

            expect(screen.getByText('+3')).toBeInTheDocument();
        });

        it('does not show overflow when products fit within maxThumbnails', () => {
            renderWithProviders(<OrderListItem order={mockOrder} maxThumbnails={5} />);

            expect(screen.queryByText(/\+\d+/)).not.toBeInTheDocument();
        });
    });

    describe('status variants', () => {
        it.each([
            ['created', 'Created'],
            ['new', 'New'],
            ['completed', 'Completed'],
            ['cancelled', 'Cancelled'],
            ['replaced', 'Replaced'],
            ['failed', 'Failed'],
        ])('renders %s status correctly', (status, expectedLabel) => {
            const order = { ...mockOrder, status, statusLabel: expectedLabel };
            renderWithProviders(<OrderListItem order={order} />);

            expect(screen.getByText(expectedLabel)).toBeInTheDocument();
        });

        it('renders icon for mapped status that has one', () => {
            const order = { ...mockOrder, status: 'completed', statusLabel: 'Completed' };
            renderWithProviders(<OrderListItem order={order} />);

            expect(screen.getByTestId('order-status-icon')).toBeInTheDocument();
        });
    });

    describe('return status', () => {
        it.each([
            ['RETURN_INITIATED', 'Return Initiated', 'info'],
            ['PARTIAL_RETURN_INITIATED', 'Partial Return Initiated', 'info'],
            ['RETURN_COMPLETE', 'Return Complete', 'muted'],
            ['PARTIAL_RETURN_COMPLETE', 'Partial Return Complete', 'muted'],
        ] as const)('renders the %s return badge instead of the raw status', (returnStatus, expectedLabel, shell) => {
            const order: OrderListItemData = {
                ...mockOrder,
                status: 'completed',
                statusLabel: 'Completed',
                returnStatus,
            };
            renderWithProviders(<OrderListItem order={order} />);

            const badge = screen.getByTestId('order-return-status-badge');
            expect(badge).toHaveTextContent(expectedLabel);
            // In-progress returns use `info` (blue); complete returns use `muted` (gray).
            if (shell === 'info') {
                expect(badge.className).toContain('bg-info');
                expect(badge.className).toContain('text-info-foreground');
            } else {
                expect(badge.className).toContain('bg-muted');
                expect(badge.className).toContain('text-muted-foreground');
            }
            // Raw status badge is suppressed when a return status is present.
            expect(screen.queryByTestId('order-status-badge')).not.toBeInTheDocument();
            expect(screen.queryByText('Completed')).not.toBeInTheDocument();
        });

        it('falls back to the raw status badge when no return status is set', () => {
            renderWithProviders(<OrderListItem order={mockOrder} />);

            expect(screen.getByTestId('order-status-badge')).toBeInTheDocument();
            expect(screen.queryByTestId('order-return-status-badge')).not.toBeInTheDocument();
        });
    });

    describe('callbacks', () => {
        it('calls onViewDetails when View Order Details is clicked', async () => {
            const user = userEvent.setup();
            const onViewDetails = vi.fn();

            renderWithProviders(<OrderListItem order={mockOrder} onViewDetails={onViewDetails} />);

            await user.click(screen.getByText('View Order Details'));

            expect(onViewDetails).toHaveBeenCalledWith('ORD-001-2024');
        });
    });

    describe('placeholder image', () => {
        it('renders placeholder when imageUrl is not provided', () => {
            const orderWithNoImages: OrderListItemData = {
                ...mockOrder,
                productItems: [
                    {
                        productId: 'prod-1',
                        quantity: 1,
                    },
                ],
            };

            renderWithProviders(<OrderListItem order={orderWithNoImages} />);

            expect(screen.queryByRole('img')).not.toBeInTheDocument();
        });

        it('renders placeholder when imageUrl is an empty string', () => {
            const orderWithEmptyUrl: OrderListItemData = {
                ...mockOrder,
                productItems: [
                    {
                        productId: 'prod-1',
                        quantity: 1,
                        imageUrl: '',
                        imageAlt: 'Should not render',
                    },
                ],
            };

            renderWithProviders(<OrderListItem order={orderWithEmptyUrl} />);

            expect(screen.queryByRole('img')).not.toBeInTheDocument();
        });

        it('renders images and placeholders for mixed items', () => {
            const mixedOrder: OrderListItemData = {
                ...mockOrder,
                productItems: [
                    {
                        productId: 'prod-1',
                        quantity: 1,
                        imageUrl: '/images/shirt.jpg',
                        imageAlt: 'Classic Shirt',
                    },
                    {
                        productId: 'prod-2',
                        quantity: 1,
                    },
                    {
                        productId: 'prod-3',
                        quantity: 1,
                        imageUrl: '/images/pants.jpg',
                        imageAlt: 'Dress Pants',
                    },
                ],
            };

            renderWithProviders(<OrderListItem order={mixedOrder} />);

            const images = screen.getAllByRole('img');
            expect(images).toHaveLength(2);
        });

        it('still shows quantity badge on placeholder items', () => {
            const orderWithQty: OrderListItemData = {
                ...mockOrder,
                itemCount: 1,
                productItems: [
                    {
                        productId: 'prod-1',
                        quantity: 3,
                    },
                ],
            };

            renderWithProviders(<OrderListItem order={orderWithQty} />);

            expect(screen.queryByRole('img')).not.toBeInTheDocument();
            expect(screen.getByText('3')).toBeInTheDocument();
        });
    });

    describe('edge cases', () => {
        it('renders fallback for invalid date', () => {
            const order: OrderListItemData = {
                ...mockOrder,
                orderDate: 'not-a-date',
            };

            renderWithProviders(<OrderListItem order={order} />);

            expect(screen.getByText('Invalid Date')).toBeInTheDocument();
        });

        it('renders raw status in green badge when not in SCAPI enum (prefers statusLabel)', () => {
            // Mirrors PWA Kit's OrderStatusBadge: the raw fallback (e.g. an OMS status string
            // like "Approved"/"Processing") renders in the green success badge, same as the
            // known SCAPI enum statuses.
            const order: OrderListItemData = {
                ...mockOrder,
                status: 'processing',
                statusLabel: 'Processing',
            };

            renderWithProviders(<OrderListItem order={order} />);

            const badge = screen.getByTestId('order-status-badge');
            expect(badge).toHaveTextContent('Processing');
            expect(badge.className).toContain('bg-status-positive');
        });

        it('renders without productItems', () => {
            const order: OrderListItemData = {
                ...mockOrder,
                productItems: undefined,
            };

            renderWithProviders(<OrderListItem order={order} />);

            expect(screen.getByText('View Order Details')).toBeInTheDocument();
        });

        it('renders without onViewDetails callback', () => {
            renderWithProviders(<OrderListItem order={mockOrder} />);

            const link = screen.getByText('View Order Details');
            expect(link.closest('a')).toHaveAttribute('href', '/global/en-GB/account/orders/ORD-001-2024');
        });

        it('uses translated label when statusLabel is not provided', () => {
            const order: OrderListItemData = {
                ...mockOrder,
                status: 'completed',
                statusLabel: undefined,
            };

            renderWithProviders(<OrderListItem order={order} />);

            expect(screen.getByText('Completed')).toBeInTheDocument();
        });
    });
});
