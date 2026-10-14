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
import { ReorderLineAction } from '../reorder-line-action';
import { ConfigWrapper, mockSiteObject, mockLocale } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import type { ShopperProducts } from '@/scapi';

const inStockProduct: ShopperProducts.schemas['Product'] = {
    id: '701643108633M',
    name: 'Sweater',
    inventory: { id: 'inv-1', orderable: true, stockLevel: 10, ats: 10 },
} as ShopperProducts.schemas['Product'];

const lowStockProduct: ShopperProducts.schemas['Product'] = {
    id: '701643108633M',
    name: 'Sweater',
    inventory: { id: 'inv-1', orderable: true, stockLevel: 1, ats: 1 },
} as ShopperProducts.schemas['Product'];

const outOfStockProduct: ShopperProducts.schemas['Product'] = {
    id: '701643108633M',
    name: 'Sweater',
    inventory: { id: 'inv-1', orderable: false, stockLevel: 0, ats: 0 },
} as ShopperProducts.schemas['Product'];

const orderItem = {
    itemId: 'item-1',
    productId: '701643108633M',
    productName: 'Sweater',
    quantity: 1,
    basePrice: 61.99,
    price: 61.99,
    priceAfterItemDiscount: 61.99,
    shipmentId: 'me',
};

const meta: Meta<typeof ReorderLineAction> = {
    title: 'Account/Orders/Order Details/Reorder Line Action',
    component: ReorderLineAction,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Per-line reorder control on the Order Details items list. Shows an inline add-to-cart when the product is in stock, an out-of-stock label when confirmed unavailable, and an inline add-to-cart (no stock cap) when inventory data is absent.',
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
                        site={mockSiteObject}
                        locale={mockLocale}
                        language={mockSiteObject.defaultLocale}
                        currency={mockSiteObject.defaultCurrency}>
                        <Story />
                    </SiteProvider>
                </ConfigWrapper>
            );

            if (inRouter) return content;

            const router = createMemoryRouter([{ path: '*', element: content }], { initialEntries: ['/'] });
            return <RouterProvider router={router} />;
        },
    ],
    argTypes: {
        item: { control: false },
        productData: { control: false },
    },
};

export default meta;
type Story = StoryObj<typeof ReorderLineAction>;

export const InStock: Story = {
    args: {
        item: orderItem,
        productData: inStockProduct,
    },
};

export const LowStock: Story = {
    args: {
        item: orderItem,
        productData: lowStockProduct,
    },
};

export const OutOfStock: Story = {
    args: {
        item: orderItem,
        productData: outOfStockProduct,
    },
};

export const NoInventoryData: Story = {
    args: {
        item: orderItem,
        productData: undefined,
    },
};
