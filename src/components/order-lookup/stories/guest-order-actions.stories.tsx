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
import { expect, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import type { ShopperOrders } from '@/scapi';
import type { OrderLike } from '@/lib/order-management/types';
import type { OmsMetaDataResult } from '@/lib/api/order.server';
import { GuestOrderActions } from '../guest-order-actions';

const { t } = getTranslation();

const mockOrder: Partial<OrderLike> = {
    orderNo: 'ORDER-001',
    omsData: {},
    productItems: [
        {
            itemId: 'item-1',
            productId: 'prod-1',
            productName: 'First Product',
            quantity: 2,
            omsData: {
                status: 'ordered',
                quantityAvailableToReturn: 2,
                quantityAvailableToCancel: 2,
                quantityOrdered: 2,
            },
        },
    ] as unknown as ShopperOrders.schemas['Order']['productItems'],
};

const notCancellableOrder: Partial<OrderLike> = {
    ...mockOrder,
    productItems: [
        {
            ...(mockOrder.productItems as Array<Record<string, unknown>>)[0],
            omsData: {
                status: 'ordered',
                quantityAvailableToReturn: 0,
                quantityAvailableToCancel: 0,
                quantityOrdered: 2,
            },
        },
    ] as unknown as ShopperOrders.schemas['Order']['productItems'],
};

const mockOmsMetaData: OmsMetaDataResult = {
    omsActive: true,
    cancelReasonCodes: [{ reason: 'Changed my mind', default: true }],
    returnReasonCodes: [{ reason: 'Does not fit', default: true }],
};

const meta: Meta<typeof GuestOrderActions> = {
    title: 'Order Lookup/Guest Order Actions',
    component: GuestOrderActions,
    parameters: {
        layout: 'padded',
        // The Return/Cancel dialogs post to the guest-specific actions via useFetcher — the
        // default Storybook mock route table doesn't include these paths (see
        // .storybook/decorators/mock-routes.ts).
        mockRoutes: [
            { path: '/action/order-lookup-return', action: async () => ({ success: true }) },
            { path: '/action/order-lookup-cancel', action: async () => ({ success: true }) },
        ],
        docs: {
            description: {
                component:
                    'Cancel/return entry points for the guest order lookup results page. Reuses the registered-customer CancelOrderDialog/ReturnOrderDialog, posting to the guest-specific server actions with `orderNumber`/`email` fields instead of relying on session ownership. Renders nothing when OMS is inactive.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
    argTypes: {
        order: { table: { disable: true } },
        omsMetaData: { table: { disable: true } },
        orderNumber: { table: { disable: true } },
        email: { table: { disable: true } },
        onOrderUpdated: { table: { disable: true } },
    },
    args: {
        order: mockOrder,
        omsMetaData: mockOmsMetaData,
        orderNumber: 'ORDER-001',
        email: 'guest@example.com',
        onOrderUpdated: action('order-updated'),
    },
};

export default meta;
type Story = StoryObj<typeof GuestOrderActions>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const returnButton = canvas.getByRole('button', { name: t('account:orders.returnItems') });
        const cancelButton = canvas.getByRole('button', { name: t('account:orders.cancelOrder') });
        await expect(returnButton).not.toHaveAttribute('aria-disabled');
        await expect(cancelButton).not.toHaveAttribute('aria-disabled');
    },
};

export const NotCancellable: Story = {
    args: {
        order: notCancellableOrder,
    },
    parameters: {
        docs: {
            description: {
                story: 'When the order has nothing left to return or cancel, both actions render disabled with an accessible reason.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const returnButton = canvas.getByRole('button', { name: t('account:orders.returnItems') });
        const cancelButton = canvas.getByRole('button', { name: t('account:orders.cancelOrder') });
        await expect(returnButton).toHaveAttribute('aria-disabled', 'true');
        await expect(cancelButton).toHaveAttribute('aria-disabled', 'true');
    },
};

export const OmsInactive: Story = {
    args: {
        omsMetaData: { ...mockOmsMetaData, omsActive: false },
    },
    parameters: {
        docs: {
            description: {
                story: 'Renders nothing when OMS metadata reports the OMS integration as inactive.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-section="guest-order-actions"]')).not.toBeInTheDocument();
    },
};

export const CancelDialogOpen: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await userEvent.click(canvas.getByRole('button', { name: t('account:orders.cancelOrder') }));

        const documentBody = within(document.body);
        await expect(
            await documentBody.findByText(t('account:orders.cancelDialogTitle', { orderNo: 'ORDER-001' }))
        ).toBeInTheDocument();
    },
};

export const ReturnDialogOpen: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await userEvent.click(canvas.getByRole('button', { name: t('account:orders.returnItems') }));

        const documentBody = within(document.body);
        await expect(
            await documentBody.findByText(t('account:orders.returnDialogTitle', { orderNo: 'ORDER-001' }))
        ).toBeInTheDocument();
    },
};
