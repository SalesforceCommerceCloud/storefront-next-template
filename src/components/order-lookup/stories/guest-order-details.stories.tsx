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
import type { ShopperOrders, ShopperProducts } from '@/scapi';
import { GuestOrderDetails } from '../guest-order-details';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { ConfigWrapper, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';

const { t } = getTranslation();

function productFixture(
    id: string,
    name: string,
    imageGroups: ShopperProducts.schemas['Product']['imageGroups'] = []
): ShopperProducts.schemas['Product'] {
    return {
        id,
        name,
        imageGroups,
        variationAttributes: [],
        variationValues: {},
    } as ShopperProducts.schemas['Product'];
}

const redactedOrder: Partial<ShopperOrders.schemas['Order']> = {
    orderNo: 'GLO001',
    status: 'new',
    orderTotal: 71.38,
    productSubTotal: 61.99,
    productTotal: 61.99,
    productItems: [
        {
            itemId: '0066d7441cdaf6f93a64ca7a74',
            productId: '701643108633M',
            productName: 'First Product',
            quantity: 1,
            basePrice: 61.99,
            price: 61.99,
            priceAfterItemDiscount: 61.99,
            shipmentId: 'me',
        },
    ],
    shipments: [
        {
            shipmentId: 'me',
            shipmentNo: '00002503',
            shippingAddress: {
                address1: '2030 Market street 8th st',
                city: 'Seattle',
                countryCode: 'US',
                firstName: 'John',
                fullName: 'John Snow',
                lastName: 'Snow',
                postalCode: '98121',
                stateCode: 'WA',
            },
            shippingMethod: { id: '001', name: 'Ground', price: 5.99 },
        },
    ],
};

const productsById: Record<string, ShopperProducts.schemas['Product'] | undefined> = {
    '701643108633M': productFixture('701643108633M', 'First Product', [
        { viewType: 'small', images: [{ link: 'https://example.com/product.jpg', alt: 'First Product' }] },
    ]),
};

const meta: Meta<typeof GuestOrderDetails> = {
    title: 'ORDER-LOOKUP/Guest Order Details',
    component: GuestOrderDetails,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Guest order details component for displaying a redacted order from the guest order lookup flow. Renders only fields present on the order object — absent fields are omitted (no placeholders). This is defence-in-depth: the server has already redacted per config.guestOrderLookup.allowedFields.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
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
    argTypes: {
        order: { table: { disable: true } },
        productsById: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof GuestOrderDetails>;

export const Default: Story = {
    args: {
        order: redactedOrder,
        productsById,
    },
    parameters: {
        docs: {
            description: {
                story: 'Redacted order with all allowed fields populated. Shows order number, status, items, shipping address, and totals.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('heading', { level: 1 })).toBeInTheDocument();
        await expect(canvas.getByTestId('order-number')).toHaveTextContent('GLO001');
        await expect(canvas.getByTestId('order-status-badge')).toHaveTextContent(t('account:orders.status.new'));
        await expect(canvas.getByText('First Product')).toBeInTheDocument();
    },
};

export const MinimalFields: Story = {
    args: {
        order: {
            orderNo: 'GLO002',
            status: 'completed',
            orderTotal: 50.0,
        },
        productsById: {},
    },
    parameters: {
        docs: {
            description: {
                story: 'Minimal redacted order with only order number, status, and total. No items, no shipments, no payment methods — all optional sections are omitted.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('order-number')).toHaveTextContent('GLO002');
        await expect(canvas.getByTestId('order-status-badge')).toHaveTextContent(t('account:orders.status.completed'));
        // Items section should not render
        await expect(canvas.queryByText(t('account:orders.itemsOrdered'))).not.toBeInTheDocument();
        // Order summary should still render with total
        await expect(canvas.getByText(t('account:orders.orderSummary'))).toBeInTheDocument();
    },
};

export const WithPaymentMethod: Story = {
    args: {
        order: {
            ...redactedOrder,
            paymentInstruments: [
                {
                    paymentInstrumentId: 'pay-guest-1',
                    paymentCard: { cardType: 'Visa', numberLastDigits: '4242' },
                },
            ],
        },
        productsById,
    },
    parameters: {
        docs: {
            description: {
                story: 'Order with payment method included. Shows masked card ending digits in the order summary column.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText(t('account:orders.paymentMethod'))).toBeInTheDocument();
        const expected = t('account:orders.paymentMethodEndingIn', {
            cardType: 'Visa',
            lastDigits: '4242',
        });
        await expect(canvas.getByText(expected)).toBeInTheDocument();
    },
};

export const MultipleShipments: Story = {
    args: {
        order: {
            orderNo: 'GLO003',
            status: 'new',
            orderTotal: 30,
            productSubTotal: 30,
            productTotal: 30,
            productItems: [
                {
                    itemId: 'item-a1',
                    productId: 'prod-a',
                    productName: 'Product for Alice',
                    quantity: 1,
                    priceAfterItemDiscount: 10,
                    shipmentId: 'ship-a',
                },
                {
                    itemId: 'item-b1',
                    productId: 'prod-b',
                    productName: 'Product for Bob',
                    quantity: 1,
                    priceAfterItemDiscount: 20,
                    shipmentId: 'ship-b',
                },
            ],
            shipments: [
                {
                    shipmentId: 'ship-a',
                    shipmentNo: '00002501',
                    shippingAddress: { firstName: 'Alice', lastName: 'Smith', fullName: 'Alice Smith' },
                },
                {
                    shipmentId: 'ship-b',
                    shipmentNo: '00002502',
                    shippingAddress: { firstName: 'Bob', lastName: 'Jones', fullName: 'Bob Jones' },
                },
            ],
        },
        productsById: {
            'prod-a': productFixture('prod-a', 'Product for Alice'),
            'prod-b': productFixture('prod-b', 'Product for Bob'),
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Two shipments with different shipping addresses. Shows how multiple shipments are grouped and displayed.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('order-status-badge')).toHaveTextContent(t('account:orders.status.new'));
        await expect(canvas.getByText('Product for Alice')).toBeInTheDocument();
        await expect(canvas.getByText('Product for Bob')).toBeInTheDocument();
    },
};
