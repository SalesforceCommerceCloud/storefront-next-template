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

import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { AccountOverview, AccountOverviewSkeleton } from '../index';
import type { CustomerOrdersResult } from '@/lib/api/order.server';
import heroNewArrivals from '/images/hero-02.webp';

const mockCustomer = {
    customerId: 'test-customer-123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    login: 'john.doe@example.com',
};

const mockOrders: CustomerOrdersResult = {
    orders: [
        {
            orderNo: 'INV001',
            orderDate: '2024-09-14T10:30:00Z',
            status: 'ready_for_pickup',
            statusLabel: 'Ready for Pickup',
            total: 250.0,
            currency: 'GBP',
            itemCount: 4,
            productItems: [
                { productId: 'prod-1', quantity: 1, imageUrl: heroNewArrivals, imageAlt: 'Classic White Shirt' },
                { productId: 'prod-2', quantity: 1, imageUrl: heroNewArrivals, imageAlt: 'Blue Dress Pants' },
                { productId: 'prod-3', quantity: 1, imageUrl: heroNewArrivals, imageAlt: 'Silk Scarf' },
                { productId: 'prod-4', quantity: 1, imageUrl: heroNewArrivals, imageAlt: 'Leather Handbag' },
            ],
            pickupLocation: {
                name: 'Market Street San Francisco',
                address: '415 Mission Street',
                city: 'San Francisco',
                state: 'CA',
                postalCode: '94105',
            },
        },
        {
            orderNo: 'INV002',
            orderDate: '2024-09-10T14:00:00Z',
            status: 'completed',
            statusLabel: 'Completed',
            total: 89.99,
            currency: 'GBP',
            itemCount: 1,
            productItems: [{ productId: 'prod-5', quantity: 1, imageUrl: heroNewArrivals, imageAlt: 'Running Shoes' }],
        },
    ],
    total: 2,
    offset: 0,
    limit: 5,
};

const emptyOrders: CustomerOrdersResult = { orders: [], total: 0, offset: 0, limit: 5 };

// A registered customer who never set a first name — exercises the
// `firstName || t('overview.defaultName')` fallback to the generic greeting.
const mockCustomerNoFirstName = {
    customerId: 'no-first-name-456',
    lastName: 'Doe',
    email: 'no.name@example.com',
    login: 'no.name@example.com',
};

const meta: Meta<typeof AccountOverview> = {
    title: 'ACCOUNT/Account Overview',
    component: AccountOverview,
    // skip-a11y: ProductRecommendations needs provider context the a11y runner can't set up.
    tags: ['autodocs', 'skip-a11y', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Main /account landing page. Renders a personalized welcome, deferred Recent Orders (Suspense + Await), Curated For You recommendations, and a Quick Links grid to the four sub-pages. Production gates the route to `userType === "registered"` in `_app.account.tsx`, so `customer` is always populated.',
            },
        },
    },
    decorators: [
        (Story) => (
            <AllProvidersWrapper>
                <Story />
            </AllProvidersWrapper>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        customer: mockCustomer,
        ordersPromise: Promise.resolve(mockOrders),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(/Welcome back, John!/i)).toBeInTheDocument();
        await expect(await canvas.findByText(/Recent Orders/i)).toBeInTheDocument();
        await expect(await canvas.findByText('#INV001')).toBeInTheDocument();

        // The four Quick Links each route to a distinct account sub-page. The
        // SiteProvider prefixes hrefs with the locale, so match the path suffix
        // with an anchored regex (`/account` and `/account/orders` overlap).
        await expect(canvas.getByRole('link', { name: /Account Details/i }).getAttribute('href')).toMatch(/\/account$/);
        await expect(canvas.getByRole('link', { name: /Manage Addresses/i }).getAttribute('href')).toMatch(
            /\/account\/addresses$/
        );
        await expect(canvas.getByRole('link', { name: /Payment Methods/i }).getAttribute('href')).toMatch(
            /\/account\/payment-methods$/
        );
        await expect(canvas.getByRole('link', { name: /Order History/i }).getAttribute('href')).toMatch(
            /\/account\/orders$/
        );

        // With orders present, the "Rate Your Recent Purchases" card renders
        // below the list (keyed off `result.orders.length > 0`).
        await expect(await canvas.findByRole('heading', { name: /Rate Your Recent Purchases/i })).toBeInTheDocument();
    },
};

export const EmptyOrders: Story = {
    args: {
        customer: mockCustomer,
        ordersPromise: Promise.resolve(emptyOrders),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(/Welcome back, John!/i)).toBeInTheDocument();
        await expect(await canvas.findByText(/Recent Orders/i)).toBeInTheDocument();
        await expect(await canvas.findByRole('link', { name: /View All/i })).toBeInTheDocument();
        await expect(canvas.queryByText(/^#/)).not.toBeInTheDocument();
        await expect(canvas.getByText(/Quick Links/i)).toBeInTheDocument();

        // No orders → the "Rate Your Recent Purchases" card must not render.
        await expect(canvas.queryByRole('heading', { name: /Rate Your Recent Purchases/i })).not.toBeInTheDocument();
    },
};

/**
 * Registered customer without a first name. The welcome greeting falls back to
 * the generic `overview.defaultName` ("there") rather than a personalized name,
 * so the heading reads "Welcome back, there!". (The route is gated to registered
 * users, so this is a named-omission case, not an unauthenticated guest.)
 */
export const NoFirstNameFallback: Story = {
    args: {
        customer: mockCustomerNoFirstName,
        ordersPromise: Promise.resolve(emptyOrders),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(/Welcome back, there!/i)).toBeInTheDocument();
    },
};

export const LoadingSkeleton: StoryObj<typeof AccountOverviewSkeleton> = {
    render: () => <AccountOverviewSkeleton />,
    // Pure presentational wireframe — no text or interactive elements to
    // assert on. Snapshot coverage is the verification for skeleton stories.
    tags: ['!interaction'],
};
