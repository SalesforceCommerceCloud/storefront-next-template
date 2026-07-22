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
import { action } from 'storybook/actions';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockLocale, mockSiteObject } from '@/test-utils/config';
import { OrderListItem, type OrderListItemData } from '../index';
import heroNewArrivals from '/images/hero-02.webp';

const baseOrder: OrderListItemData = {
    orderNo: 'ORD-2024-001',
    orderDate: '2024-09-14T10:30:00Z',
    total: 48.38,
    currency: mockSiteObject.defaultCurrency,
    status: 'ready_for_pickup',
    statusLabel: 'Ready for Pickup',
    itemCount: 2,
    productItems: [
        { productId: 'prod-1', quantity: 1, imageUrl: heroNewArrivals, imageAlt: 'Classic White Shirt' },
        { productId: 'prod-2', quantity: 2, imageUrl: heroNewArrivals, imageAlt: 'Blue Dress Pants' },
    ],
};

const meta: Meta<typeof OrderListItem> = {
    title: 'Account/Orders/Order List Item',
    component: OrderListItem,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Single row in the order history list: status badge, order number / date, product thumbnails (with "+N" overflow when more than `maxThumbnails`), total, optional pickup location, and View Order Details link.',
            },
        },
    },
    argTypes: {
        order: { control: 'object' },
        maxThumbnails: { control: { type: 'number', min: 1, max: 20 } },
    },
    args: {
        order: baseOrder,
        onViewDetails: action('onViewDetails'),
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

export const Default: Story = {};

export const WithPickupLocation: Story = {
    args: {
        order: {
            ...baseOrder,
            pickupLocation: {
                name: 'Salesforce Foundations San Francisco',
                address: '415 Mission Street',
                city: 'San Francisco',
                state: 'CA',
                postalCode: '94105',
            },
        },
    },
};

// Derived return status overrides the raw status badge with an informational label.
export const WithReturnStatus: Story = {
    args: {
        order: {
            ...baseOrder,
            status: 'completed',
            statusLabel: 'Completed',
            returnStatus: 'PARTIAL_RETURN_COMPLETE',
        },
    },
};

// 18 items + maxThumbnails: 12 → "+6" overflow indicator
export const WithThumbnailOverflow: Story = {
    args: {
        order: {
            ...baseOrder,
            status: 'delivered',
            statusLabel: 'Delivered',
            itemCount: 18,
            productItems: Array.from({ length: 18 }, (_, i) => ({
                productId: `prod-${i}`,
                quantity: i % 3 === 0 ? 2 : 1,
                imageUrl: heroNewArrivals,
                imageAlt: `Product ${i + 1}`,
            })),
        },
        maxThumbnails: 12,
    },
};
