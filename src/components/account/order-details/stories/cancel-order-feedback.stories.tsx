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
import { expect, userEvent, within, waitFor } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { ShopperOrders, ShopperProducts } from '@/scapi';
import { OrderDetails } from '../index';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { ConfigWrapper, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import AuthProvider from '@/providers/auth';
import type { PublicSessionData } from '@/lib/api/types';
import type { OmsMetaDataResult } from '@/lib/api/order.server';

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
    orderNo: '00166274',
    status: 'new',
    orderTotal: 71.38,
    productSubTotal: 61.99,
    productTotal: 61.99,
    customerInfo: { customerId: 'cust-feedback-123', email: 'test@example.com' },
    omsData: {},
    productItems: [
        {
            itemId: 'item-1',
            productId: 'prod-1',
            productName: 'Cancel Test Product',
            quantity: 1,
            basePrice: 61.99,
            price: 61.99,
            priceAfterItemDiscount: 61.99,
            shipmentId: 'me',
            omsData: { quantityAvailableToCancel: 1, quantityOrdered: 1 },
        },
    ],
    shipments: [
        {
            shipmentId: 'me',
            shipmentNo: '00002503',
            shippingAddress: {
                address1: '2030 Market street',
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
    'prod-1': productFixture('prod-1', 'Cancel Test Product', [
        { viewType: 'small', images: [{ link: 'https://example.com/product.jpg', alt: 'Cancel Test Product' }] },
    ]),
};

const omsMetaData: Promise<OmsMetaDataResult> = Promise.resolve({
    omsActive: true,
    cancelReasonCodes: [
        { reason: 'Changed my mind', default: true },
        { reason: 'Found better price', default: false },
    ],
    returnReasonCodes: [],
});

const meta: Meta<typeof OrderDetails> = {
    title: 'ACCOUNT/Cancel Order Feedback',
    component: OrderDetails,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Cancel order feedback alerts shown on the Order Details page after the cancel action settles. Each story exercises a different API response: success (200), not-found (404), conflict (409), and transient error (500).',
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
                    <AuthProvider
                        value={{ customerId: 'cust-feedback-123', userType: 'registered' } as PublicSessionData}>
                        <Story />
                    </AuthProvider>
                </SiteProvider>
            </ConfigWrapper>
        ),
    ],
    argTypes: {
        order: { table: { disable: true } },
        productsById: { table: { disable: true } },
        omsMetaData: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof OrderDetails>;

async function openDialogAndConfirm(canvasElement: HTMLElement) {
    await waitForStorybookReady(canvasElement);
    const canvas = within(canvasElement);

    const cancelButton = await canvas.findByRole('button', { name: t('account:orders.cancelOrder') });
    await userEvent.click(cancelButton);

    const documentBody = within(document.body);
    const confirmButton = await documentBody.findByRole('button', { name: t('account:orders.cancelConfirm') });
    await userEvent.click(confirmButton);
}

export const SuccessFeedback: Story = {
    args: {
        order,
        productsById,
        omsMetaData,
    },
    parameters: {
        mockRoutes: [
            {
                path: '/action/cancel-order',
                action: async () => ({ success: true }),
            },
        ],
    },
    play: async ({ canvasElement }) => {
        await openDialogAndConfirm(canvasElement);

        const canvas = within(canvasElement);
        await waitFor(() => expect(canvas.getByTestId('cancel-order-feedback')).toBeInTheDocument(), { timeout: 2000 });
        await expect(canvas.getByText(t('account:orders.cancelSuccessTitle'))).toBeInTheDocument();
        await expect(canvas.getByText(t('account:orders.cancelSuccessDescription'))).toBeInTheDocument();

        // After success the Cancel button stays visible but disabled (PWA parity), not removed.
        const cancelButton = canvas.getByRole('button', { name: t('account:orders.cancelOrder') });
        await expect(cancelButton).toHaveAttribute('aria-disabled', 'true');
    },
};

export const ErrorNotFound: Story = {
    args: {
        order,
        productsById,
        omsMetaData,
    },
    parameters: {
        docs: {
            description: {
                story: 'API returns 404 — terminal error. Cancel button stays visible but disabled.',
            },
        },
        mockRoutes: [
            {
                path: '/action/cancel-order',
                action: async () => ({
                    success: false,
                    error: { kind: 'not_found', status: 404 },
                }),
            },
        ],
    },
    play: async ({ canvasElement }) => {
        await openDialogAndConfirm(canvasElement);

        const canvas = within(canvasElement);
        await waitFor(() => expect(canvas.getByTestId('cancel-order-feedback')).toBeInTheDocument(), { timeout: 2000 });
        await expect(canvas.getByText(t('account:orders.cancelErrorNotFoundTitle'))).toBeInTheDocument();
        await expect(canvas.getByText(t('account:orders.cancelErrorNotFoundDescription'))).toBeInTheDocument();

        // Terminal — button stays visible but disabled (PWA parity)
        const cancelButton = canvas.getByRole('button', { name: t('account:orders.cancelOrder') });
        await expect(cancelButton).toHaveAttribute('aria-disabled', 'true');
    },
};

export const ErrorConflict: Story = {
    args: {
        order,
        productsById,
        omsMetaData,
    },
    parameters: {
        docs: {
            description: {
                story: 'API returns 409 — order already being processed. Terminal error, cancel button stays visible but disabled.',
            },
        },
        mockRoutes: [
            {
                path: '/action/cancel-order',
                action: async () => ({
                    success: false,
                    error: { kind: 'not_cancellable', status: 409 },
                }),
            },
        ],
    },
    play: async ({ canvasElement }) => {
        await openDialogAndConfirm(canvasElement);

        const canvas = within(canvasElement);
        await waitFor(() => expect(canvas.getByTestId('cancel-order-feedback')).toBeInTheDocument(), { timeout: 2000 });
        await expect(canvas.getByText(t('account:orders.cancelErrorConflictTitle'))).toBeInTheDocument();
        await expect(canvas.getByText(t('account:orders.cancelErrorConflictDescription'))).toBeInTheDocument();

        // Terminal — button stays visible but disabled (PWA parity)
        const cancelButton = canvas.getByRole('button', { name: t('account:orders.cancelOrder') });
        await expect(cancelButton).toHaveAttribute('aria-disabled', 'true');
    },
};

export const ErrorTransient: Story = {
    args: {
        order,
        productsById,
        omsMetaData,
    },
    parameters: {
        docs: {
            description: {
                story: 'API returns 500 — transient error. Cancel button remains enabled for retry.',
            },
        },
        mockRoutes: [
            {
                path: '/action/cancel-order',
                action: async () => ({
                    success: false,
                    error: { kind: 'transient', status: 500 },
                }),
            },
        ],
    },
    play: async ({ canvasElement }) => {
        await openDialogAndConfirm(canvasElement);

        const canvas = within(canvasElement);
        await waitFor(() => expect(canvas.getByTestId('cancel-order-feedback')).toBeInTheDocument(), { timeout: 2000 });
        await expect(canvas.getByText(t('account:orders.cancelErrorGenericTitle'))).toBeInTheDocument();
        await expect(canvas.getByText(t('account:orders.cancelErrorGenericDescription'))).toBeInTheDocument();

        // Transient — button stays enabled for retry
        const cancelButton = canvas.getByRole('button', { name: t('account:orders.cancelOrder') });
        await expect(cancelButton).not.toHaveAttribute('aria-disabled', 'true');
    },
};
