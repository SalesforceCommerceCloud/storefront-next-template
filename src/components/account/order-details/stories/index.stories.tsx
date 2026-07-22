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
import { expect, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { ShopperOrders, ShopperProducts } from '@/scapi';
import { OrderDetails } from '../index';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { ConfigWrapper, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import type { OmsMetaDataResult } from '@/lib/api/order.server';
import AuthProvider from '@/providers/auth';
import type { PublicSessionData } from '@/lib/api/types';

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

const order: ShopperOrders.schemas['Order'] = {
    orderNo: 'INO001',
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
            trackingNumber: '1234567890',
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

const meta: Meta<typeof OrderDetails> = {
    title: 'Account/Orders/Order Details',
    component: OrderDetails,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Order details: order number with a decorative `#` prefix, **order status** badge (`getOrderStatusConfig` / `data-testid="order-status-badge"`, unknown values as raw text in a neutral badge), per-shipment **shipping status** (`getShippingStatusConfig` / `data-testid="shipping-status-badge"`, same raw fallback when not in the SCAPI enum), shipment rows showing only the shipment label (recipient names appear in the shipping address card only), line items, tracking and address cards, optional **payment methods** in the summary column, and order totals. In the app, data is loaded via `fetchOrderWithProducts` (SCAPI getOrder + getProducts); stories use inline mock data with the same shape.',
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
type Story = StoryObj<typeof OrderDetails>;

export const Default: Story = {
    args: {
        order,
        productsById,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('heading', { level: 1 })).toBeInTheDocument();
        await expect(canvas.getByTestId('order-number')).toHaveTextContent('INO001');
        await expect(canvas.getByTestId('order-status-badge')).toHaveTextContent(t('account:orders.status.new'));
        await expect(canvas.queryByTestId('shipping-status-badge')).not.toBeInTheDocument();
        await expect(canvas.getByText('First Product')).toBeInTheDocument();
    },
};

const orderMultipleShipments: ShopperOrders.schemas['Order'] = {
    orderNo: 'INV002',
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
};

const productsByIdMultiple: Record<string, ShopperProducts.schemas['Product'] | undefined> = {
    'prod-a': productFixture('prod-a', 'Product for Alice'),
    'prod-b': productFixture('prod-b', 'Product for Bob'),
};

export const MultipleShipments: Story = {
    args: {
        order: orderMultipleShipments,
        productsById: productsByIdMultiple,
    },
    parameters: {
        docs: {
            description: {
                story: 'Two shipments with different shipping addresses (Alice Smith, Bob Jones). Names appear only in each shipment’s **Shipping address** card, not on the shipment title row.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('order-status-badge')).toHaveTextContent(t('account:orders.status.new'));
        await expect(canvas.queryByTestId('shipping-status-badge')).not.toBeInTheDocument();
    },
};

export const CompletedStatus: Story = {
    args: {
        order: { ...order, status: 'completed' },
        productsById,
    },
    parameters: {
        docs: {
            description: {
                story: 'Order with status `completed` — **order status** badge uses success styling (green).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('order-status-badge')).toHaveTextContent(t('account:orders.status.completed'));
    },
};

export const ReplacedStatus: Story = {
    args: {
        order: { ...order, status: 'replaced' },
        productsById,
    },
    parameters: {
        docs: {
            description: {
                story: 'Order with status `replaced` — **order status** badge uses success styling (green).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('order-status-badge')).toHaveTextContent(t('account:orders.status.replaced'));
    },
};

export const WithReturnStatus: Story = {
    args: {
        order: {
            ...order,
            status: 'completed',
            productItems: order.productItems?.map((item) => ({
                ...item,
                omsData: { status: 'returned' },
            })),
        },
        productsById,
    },
    parameters: {
        docs: {
            description: {
                story: 'All items have `omsData.status: "returned"` — the derived **return status** badge ("Return Complete", informational blue, `data-testid="order-return-status-badge"`) replaces the raw order-status badge.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('order-return-status-badge')).toHaveTextContent(
            t('account:orders.returnStatus.complete')
        );
        await expect(canvas.queryByTestId('order-status-badge')).not.toBeInTheDocument();
    },
};

export const WithShippingStatus: Story = {
    args: {
        order: {
            ...order,
            shipments: order.shipments?.map((s, i) => (i === 0 ? { ...s, shippingStatus: 'shipped' as const } : s)),
        },
        productsById,
    },
    parameters: {
        docs: {
            description: {
                story: 'First shipment has `shippingStatus: "shipped"` — **shipping status** badge on the shipment row (success / green). Order status badge unchanged.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('order-status-badge')).toHaveTextContent(t('account:orders.status.new'));
        await expect(canvas.getByTestId('shipping-status-badge')).toHaveTextContent(
            t('account:orders.shippingStatus.shipped')
        );
    },
};

const orderWithPayment: ShopperOrders.schemas['Order'] = {
    ...order,
    paymentInstruments: [
        {
            paymentInstrumentId: 'pay-story-1',
            paymentCard: { cardType: 'Visa', numberLastDigits: '4242' },
        },
    ],
};

export const WithPaymentMethod: Story = {
    args: {
        order: orderWithPayment,
        productsById,
    },
    parameters: {
        docs: {
            description: {
                story: 'Order summary column includes **Payment method** when `paymentInstruments` include card last digits.',
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

export const CancelledOrder: Story = {
    args: {
        order: {
            ...order,
            productItems: order.productItems?.map((item) => ({
                ...item,
                omsData: { status: 'canceled' },
            })),
        },
        productsById,
    },
    parameters: {
        docs: {
            description: {
                story: 'All items have `omsData.status: "canceled"` — the derived **cancel status** badge ("Cancelled", destructive styling, `data-testid="order-cancel-status-badge"`) replaces the raw order-status badge.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('order-cancel-status-badge')).toBeInTheDocument();
        await expect(canvas.queryByTestId('order-status-badge')).not.toBeInTheDocument();
    },
};

const cancellableOmsOrder: ShopperOrders.schemas['Order'] = {
    ...order,
    customerInfo: { customerId: 'cust-story-123', email: 'test@example.com' },
    omsData: {},
    productItems: order.productItems?.map((item) => ({
        ...item,
        omsData: { quantityAvailableToCancel: 1, quantityOrdered: 1 },
    })),
};

const omsMetaDataResolved: Promise<OmsMetaDataResult> = Promise.resolve({
    omsActive: true,
    cancelReasonCodes: [
        { reason: 'Changed my mind', default: true },
        { reason: 'Found better price', default: false },
    ],
    returnReasonCodes: [],
});

export const WithCancelButton: Story = {
    args: {
        order: cancellableOmsOrder,
        productsById,
        omsMetaData: omsMetaDataResolved,
    },
    decorators: [
        (Story) => (
            <ConfigWrapper>
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <AuthProvider value={{ customerId: 'cust-story-123', userType: 'registered' } as PublicSessionData}>
                        <Story />
                    </AuthProvider>
                </SiteProvider>
            </ConfigWrapper>
        ),
    ],
    parameters: {
        docs: {
            description: {
                story: 'OMS-active order with all items fully cancellable — **Cancel Order** button is rendered and enabled. Requires auth context (registered shopper who owns the order).',
            },
        },
        mockRoutes: [
            {
                path: '/action/cancel-order',
                action: async () => ({ success: true }),
            },
        ],
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const cancelButton = await canvas.findByRole('button', { name: t('account:orders.cancelOrder') });
        await expect(cancelButton).toBeInTheDocument();
        await expect(cancelButton).not.toHaveAttribute('aria-disabled', 'true');
    },
};

export const WithCancelButtonDisabled: Story = {
    args: {
        order: {
            ...cancellableOmsOrder,
            productItems: order.productItems?.map((item) => ({
                ...item,
                omsData: { quantityAvailableToCancel: 0, quantityOrdered: 1 },
            })),
        },
        productsById,
        omsMetaData: omsMetaDataResolved,
    },
    decorators: [
        (Story) => (
            <ConfigWrapper>
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <AuthProvider value={{ customerId: 'cust-story-123', userType: 'registered' } as PublicSessionData}>
                        <Story />
                    </AuthProvider>
                </SiteProvider>
            </ConfigWrapper>
        ),
    ],
    parameters: {
        docs: {
            description: {
                story: 'OMS-active order where items are NOT fully cancellable — the **Cancel Order** button renders **disabled** (aria-disabled) rather than being hidden, matching PWA Kit. A visually-hidden reason is linked via `aria-describedby`.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const cancelButton = await canvas.findByRole('button', { name: t('account:orders.cancelOrder') });
        await expect(cancelButton).toHaveAttribute('aria-disabled', 'true');
        await expect(canvas.getByText(t('account:orders.cancelUnavailable'))).toBeInTheDocument();
    },
};

// Two OMS shipments, each with an externalizable carrier link → the top
// "Track Shipment" action becomes a dropdown of both. Covers the dropdown branch
// that no other story exercised.
const orderTwoCarrierLinks: ShopperOrders.schemas['Order'] = {
    ...order,
    orderNo: 'INO002',
    omsData: {
        shipments: [
            { id: 'oms-1', trackingNumber: 'UPS-111', trackingUrl: 'www.ups.com/track/111' },
            { id: 'oms-2', trackingNumber: 'FEDEX-222', trackingUrl: 'www.fedex.com/track/222' },
        ],
    },
} as ShopperOrders.schemas['Order'];

export const TrackShipmentDropdown: Story = {
    args: {
        order: orderTwoCarrierLinks,
        productsById,
    },
    parameters: {
        a11y: {
            config: {
                rules: [
                    // The play test opens the dropdown and leaves it open. Radix intentionally sets
                    // aria-hidden="true" on the rest of the page (order-actions row, product links)
                    // while the menu is open to trap focus — correct behavior, but axe's
                    // aria-hidden-focus rule flags the now-hidden focusable content. Same precedent
                    // as the Share Button and Address Modal stories.
                    { id: 'aria-hidden-focus', enabled: false },
                ],
            },
        },
        docs: {
            description: {
                story: 'Two shipments with externalizable carrier links → the top **Track Shipment** action renders as a dropdown, one option per tracking number (each opens the carrier in a new tab).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const trigger = canvas.getByTestId('order-actions-track');
        await expect(trigger).toBeEnabled();
        await expect(trigger).toHaveTextContent(t('account:orders.actions.trackShipment'));

        // Open the menu and assert each option deep-links to its carrier in a new tab.
        // The menu content is portalled to <body>, so query the whole document, not canvas.
        await userEvent.click(trigger);
        const body = within(canvasElement.ownerDocument.body);
        const options = await body.findAllByTestId('order-actions-track-option');
        await expect(options).toHaveLength(2);
        // ensureExternalUrl normalizes the scheme-less carrier hosts to absolute https URLs.
        await expect(options[0]).toHaveAttribute('href', 'https://www.ups.com/track/111');
        await expect(options[1]).toHaveAttribute('href', 'https://www.fedex.com/track/222');
        for (const option of options) {
            await expect(option).toHaveAttribute('target', '_blank');
            await expect(option).toHaveAttribute('rel', 'noopener noreferrer');
        }
        // Options are labeled by tracking number, with the "new tab" affordance in the aria-label.
        await expect(options[0]).toHaveTextContent(
            t('account:orders.actions.trackNumber', { trackingNumber: 'UPS-111' })
        );
        await expect(options[0]).toHaveAccessibleName(
            t('account:orders.actions.trackNumberNewTab', { trackingNumber: 'UPS-111' })
        );
    },
};

// One OMS shipment whose ONLY tracking field is a relative/unsafe URL that
// `ensureExternalUrl` rejects: displayable (so it isn't dropped by the mapper) but not
// card-visible (no number/provider/date), so the in-page tracking section never mounts
// and there is no valid carrier href. There is no usable Track Shipment target, so the
// action renders nothing and the order-actions row collapses (empty:hidden) — an enabled
// button here would deep-link to a `#order-tracking` anchor that scrolls nowhere.
// Regression fixture for the review finding on this PR.
const orderUnsafeUrlOnly: ShopperOrders.schemas['Order'] = {
    ...order,
    orderNo: 'INO003',
    omsData: {
        shipments: [{ id: 'oms-unsafe', trackingUrl: '/internal/relative/path' }],
    },
} as ShopperOrders.schemas['Order'];

export const TrackShipmentHiddenUnsafeUrl: Story = {
    args: {
        order: orderUnsafeUrlOnly,
        productsById,
    },
    parameters: {
        docs: {
            description: {
                story: 'A shipment whose only tracking field is an unsafe/relative URL (rejected by `ensureExternalUrl`). There is no externalizable carrier link and no tracking section to anchor to, so the top **Track Shipment** action renders nothing and the order-actions row collapses — rather than linking to an anchor that never mounts.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.queryByTestId('order-actions-track')).not.toBeInTheDocument();
    },
};
