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
import { LastOrderCard } from '../index';
import type { Order } from '@/components/account/order-list';
import { ConfigWrapper, mockSiteObject, mockLocale } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';

const PRODUCT_IDS = [
    'banana',
    'eggs',
    'milk',
    'carrots',
    'bread',
    'yogurt',
    'cheese',
    'cup',
    'salad',
    'oats',
    'butter',
    'tomatoes',
    'pasta',
    'rice',
    'flour',
    'sugar',
    'oil',
    'vinegar',
    'pepper',
    'onion',
];

function makeItems(count: number): Order['productItems'] {
    return PRODUCT_IDS.slice(0, count).map((id) => ({
        productId: id,
        quantity: 1,
        productName: id.charAt(0).toUpperCase() + id.slice(1),
        imageUrl: undefined,
        imageAlt: id,
    }));
}

const twentyOneItemOrder: Order = {
    orderNo: 'GN0001842',
    orderDate: '2026-09-18T10:00:00Z',
    status: 'completed',
    total: 88.29,
    currency: mockSiteObject.defaultCurrency,
    itemCount: 21,
    productItems: makeItems(20),
};

const fewItemOrder: Order = {
    ...twentyOneItemOrder,
    orderNo: 'GN0001500',
    orderDate: '2026-08-01T09:00:00Z',
    total: 14.5,
    itemCount: 4,
    productItems: makeItems(4),
};

const meta: Meta<typeof LastOrderCard> = {
    title: 'Account/Orders/Last Order Card',
    component: LastOrderCard,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    "Displays the shopper's most recent order: order number, date/item count/total, a product image grid (up to 9 tiles + overflow count), and CTAs to add all items to cart or view the order detail.",
            },
        },
    },
    decorators: [
        (Story) => (
            <ConfigWrapper>
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <Story />
                </SiteProvider>
            </ConfigWrapper>
        ),
    ],
    args: {
        onAddAllToCart: () => {},
    },
};

export default meta;
type Story = StoryObj<typeof LastOrderCard>;

/** Twenty-one line items: nine image tiles visible, +11 overflow. */
export const Default: Story = {
    args: {
        order: twentyOneItemOrder,
    },
};

/** Four line items: grid fills partially with no overflow tile. */
export const FewItems: Story = {
    args: {
        order: fewItemOrder,
    },
};

/** Primary CTA shows a loading state while the reorder action is in flight. */
export const Reordering: Story = {
    args: {
        order: twentyOneItemOrder,
        isAddingToCart: true,
    },
};
