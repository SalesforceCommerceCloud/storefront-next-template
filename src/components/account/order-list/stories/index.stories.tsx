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
import { action } from 'storybook/actions';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { OrderList, type Order } from '../index';
import heroNewArrivals from '/images/hero-02.webp';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { getSitePrefix, mockLocale, mockSiteObject } from '@/test-utils/config';

const { t } = getTranslation();

const testOrders: Order[] = [
    {
        orderNo: 'INV001',
        orderDate: '2024-09-14T10:30:00Z',
        status: 'created',
        statusLabel: 'Created',
        total: 48.38,
        itemCount: 2,
        productItems: [
            { productId: 'prod-1', imageAlt: 'Classic Shirt', quantity: 1, imageUrl: heroNewArrivals },
            { productId: 'prod-2', imageAlt: 'Dress Pants', quantity: 2, imageUrl: heroNewArrivals },
        ],
        pickupLocation: {
            name: 'Salesforce Foundations San Francisco',
            address: '415 Mission Street',
            city: 'San Francisco',
            state: 'CA',
            postalCode: '94105',
        },
    },
    {
        orderNo: 'INV002',
        orderDate: '2024-09-12T14:00:00Z',
        status: 'new',
        statusLabel: 'New',
        total: 43.0,
        itemCount: 1,
        productItems: [{ productId: 'prod-3', imageAlt: 'Summer Dress', quantity: 2, imageUrl: heroNewArrivals }],
    },
    {
        orderNo: 'INV003',
        orderDate: '2024-09-08T11:30:00Z',
        status: 'cancelled',
        statusLabel: 'Cancelled',
        total: 95.92,
        itemCount: 2,
        productItems: [
            { productId: 'prod-8', imageAlt: 'Cancelled Item 1', quantity: 2, imageUrl: heroNewArrivals },
            { productId: 'prod-9', imageAlt: 'Cancelled Item 2', quantity: 3, imageUrl: heroNewArrivals },
        ],
    },
];

const meta: Meta<typeof OrderList> = {
    title: 'Account/Orders/Order List',
    component: OrderList,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Customer-orders list with product thumbnails, status badges, optional pickup-location card, View Order Details link, and a Continue Shopping CTA when the list is empty.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
    argTypes: {
        title: { control: 'text' },
        subtitle: { control: 'text' },
        orders: { table: { disable: true } },
        emptyMessage: { control: 'text' },
        maxThumbnails: { control: { type: 'number', min: 1, max: 20 } },
        onViewDetails: { action: 'viewDetails' },
    },
    args: {
        title: 'Order History',
        subtitle: 'View and track your orders',
        onViewDetails: action('viewDetails'),
    },
    decorators: [
        (Story) => (
            <SiteProvider
                site={mockSiteObject}
                locale={mockLocale}
                language={mockSiteObject.defaultLocale}
                currency={mockSiteObject.defaultCurrency}>
                <Story />
            </SiteProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: { orders: testOrders },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByRole('heading', { name: 'Order History' })).toBeInTheDocument();
        await expect(canvas.getByText('View and track your orders')).toBeInTheDocument();
        await expect(canvas.getAllByText('View Order Details')).toHaveLength(testOrders.length);
    },
};

// An order carrying a derived returnStatus renders the informational return badge
// (threaded through toOrderListItemData → OrderListItem) instead of the raw status.
export const WithReturnStatus: Story = {
    args: {
        orders: [
            { ...testOrders[0], status: 'completed', statusLabel: 'Completed', returnStatus: 'RETURN_COMPLETE' },
            { ...testOrders[1], returnStatus: 'PARTIAL_RETURN_INITIATED' },
        ],
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const badges = canvas.getAllByTestId('order-return-status-badge');
        await expect(badges).toHaveLength(2);
        await expect(badges[0]).toHaveTextContent(t('account:orders.returnStatus.complete'));
        await expect(badges[1]).toHaveTextContent(t('account:orders.returnStatus.partialInitiated'));
    },
};

export const EmptyState: Story = {
    args: { orders: [] },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(t('account:orders.empty'))).toBeInTheDocument();
        const continueShoppingLink = canvas.getByRole('link', { name: 'Continue Shopping' });
        await expect(continueShoppingLink).toHaveAttribute('href', `${getSitePrefix()}/`);
        await expect(canvas.queryAllByText('View Order Details')).toHaveLength(0);
    },
};
