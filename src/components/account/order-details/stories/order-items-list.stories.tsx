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
import { createMemoryRouter, RouterProvider, useInRouterContext } from 'react-router';
import { OrderItemsList } from '../order-items-list';
import { ConfigWrapper, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';

const mockSite = mockSiteObject;

const meta: Meta<typeof OrderItemsList> = {
    title: 'Account/Orders/Order Details/Order Items List',
    component: OrderItemsList,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'List of order line items with product name, quantity, price, variation attributes, and Buy Again link.',
            },
        },
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => {
            const inRouter = useInRouterContext();
            const content = (
                <ConfigWrapper>
                    <SiteProvider
                        site={mockSite}
                        locale={mockLocale}
                        language={mockSiteObject.defaultLocale}
                        currency={mockSiteObject.defaultCurrency}>
                        <Story />
                    </SiteProvider>
                </ConfigWrapper>
            );

            if (inRouter) {
                return content;
            }

            const router = createMemoryRouter([{ path: '*', element: content }], {
                initialEntries: ['/'],
            });

            return <RouterProvider router={router} />;
        },
    ],
    argTypes: {
        items: { control: false },
        productsById: { control: false },
    },
};

export default meta;
type Story = StoryObj<typeof OrderItemsList>;

const defaultItems = [
    {
        itemId: 'item-1',
        productId: '701643108633M',
        productName: 'Sweater',
        quantity: 3,
        basePrice: 61.99,
        price: 61.99,
        priceAfterItemDiscount: 61.99,
        shipmentId: 'me',
    },
];

const defaultProductsById = {
    '701643108633M': {
        id: '701643108633M',
        name: 'Sweater',
        imageGroups: [
            {
                viewType: 'small',
                images: [
                    {
                        link: 'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-apparel-m-catalog/default/dw97734cd6/images/large/PG.33330DAN84Q.CHARCWL.PZ.jpg',
                        alt: 'Sweater',
                    },
                ],
            },
        ],
        variationAttributes: [
            { id: 'size', name: 'Size', values: [{ value: 'M', name: 'M' }] },
            { id: 'color', name: 'Color', values: [{ value: 'NAVY', name: 'Navy' }] },
        ],
        variationValues: { size: 'M', color: 'NAVY' },
    },
};

export const Default: Story = {
    args: {
        items: defaultItems,
        productsById: defaultProductsById,
    },
};

export const Empty: Story = {
    args: {
        items: [],
        productsById: {},
    },
};

export const MultipleItems: Story = {
    args: {
        items: [
            {
                itemId: 'item-1',
                productId: 'prod-1',
                productName: 'Product One',
                quantity: 1,
                basePrice: 10,
                price: 10,
                priceAfterItemDiscount: 10,
                shipmentId: 'me',
            },
            {
                itemId: 'item-2',
                productId: 'prod-2',
                productName: 'Product Two',
                quantity: 1,
                basePrice: 20,
                price: 20,
                priceAfterItemDiscount: 20,
                shipmentId: 'me',
            },
        ],
        productsById: {},
    },
};
