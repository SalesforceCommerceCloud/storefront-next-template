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
import type { ShopperOrders } from '@/scapi';
import { OrderStatusHeader } from '../order-status-header';

const meta: Meta<typeof OrderStatusHeader> = {
    title: 'Account/Orders/Order Details/Order Status Header',
    component: OrderStatusHeader,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Order Details title + order-number + status-badge cascade, shared between the registered-account and guest order-lookup Order Details pages. Badge precedence: cancel (item-level all-cancelled) → return (aggregated from items) → raw status → nothing. An unrecognized/unmapped raw status falls back to a neutral (muted) badge rather than implying success.',
            },
        },
    },
    tags: ['autodocs'],
    // No per-story decorators: the global preview stack (withRouter → StorybookConfigProvider
    // + StorybookSiteProvider + I18nextProvider) already supplies i18n. The component takes
    // its data via the `order` prop.
    argTypes: {
        order: { table: { disable: true } },
        headingRef: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof OrderStatusHeader>;

export const New: Story = {
    args: {
        order: { orderNo: 'INO001', status: 'new' } as Partial<ShopperOrders.schemas['Order']>,
    },
};

export const Completed: Story = {
    args: {
        order: { orderNo: 'INO002', status: 'completed' } as Partial<ShopperOrders.schemas['Order']>,
    },
};

export const Cancelled: Story = {
    args: {
        order: {
            orderNo: 'INO003',
            status: 'new',
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'prod-1',
                    productName: 'Cancelled Product',
                    quantity: 1,
                    priceAfterItemDiscount: 10,
                    omsData: { status: 'canceled', quantityOrdered: 1, quantityCanceled: 1 },
                },
            ],
        } as Partial<ShopperOrders.schemas['Order']>,
    },
};

export const PartialReturn: Story = {
    args: {
        order: {
            orderNo: 'INO004',
            status: 'new',
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'prod-1',
                    productName: 'Returned Product',
                    quantity: 2,
                    priceAfterItemDiscount: 10,
                    omsData: {
                        status: 'returned',
                        quantityOrdered: 2,
                        quantityReturned: 1,
                        quantityReturnInitiated: 1,
                    },
                },
            ],
        } as Partial<ShopperOrders.schemas['Order']>,
    },
};

/** `order.status` is not one of the 6 known SCAPI enum values — falls back to a neutral badge with the raw text. */
export const UnknownStatus: Story = {
    args: {
        order: { orderNo: 'INO005', status: 'on_hold' } as unknown as Partial<ShopperOrders.schemas['Order']>,
    },
};

export const NoStatus: Story = {
    args: {
        order: { orderNo: 'INO006' } as Partial<ShopperOrders.schemas['Order']>,
    },
};
