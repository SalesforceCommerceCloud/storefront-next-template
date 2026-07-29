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
import { useState, type ReactElement } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import type { ShopperOrders } from '@/scapi';
import { Button } from '@/components/ui/button';
import CancelOrderDialog from '../cancel-order-dialog';

const { t } = getTranslation();

const cancelReasonCodes: ShopperOrders.schemas['OmsReasonCode'][] = [
    { reason: 'Item price too high', default: false },
    { reason: 'Changed my mind', default: true },
    { reason: 'No longer needed', default: false },
];

function CancelOrderDialogWrapper({
    reasonCodes = cancelReasonCodes,
}: {
    reasonCodes?: ShopperOrders.schemas['OmsReasonCode'][];
}): ReactElement {
    const [open, setOpen] = useState(false);
    const logOpen = action('dialog-open');
    const logClose = action('dialog-close');

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (next) {
            logOpen();
        } else {
            logClose();
        }
    };

    return (
        <>
            <Button onClick={() => handleOpenChange(true)}>Open Cancel Dialog</Button>
            <CancelOrderDialog
                orderNo="00166274"
                cancelReasonCodes={reasonCodes}
                open={open}
                onOpenChange={handleOpenChange}
            />
        </>
    );
}

const meta: Meta<typeof CancelOrderDialog> = {
    title: 'ACCOUNT/Cancel Order Dialog',
    component: CancelOrderDialog,
    parameters: {
        layout: 'centered',
        mockRoutes: [
            {
                path: '/action/cancel-order',
                action: async () => ({ success: true }),
            },
        ],
        docs: {
            description: {
                component:
                    'Cancel order confirmation dialog. Pre-selects the default reason from OMS metadata. When `cancelReasonCodes` is empty (degraded OMS metadata fetch) the reason dropdown is hidden and the user can confirm cancellation without a reason.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
    argTypes: {
        orderNo: { table: { disable: true } },
        cancelReasonCodes: { table: { disable: true } },
        open: { table: { disable: true } },
        onOpenChange: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof CancelOrderDialog>;

export const WithReasons: Story = {
    render: () => <CancelOrderDialogWrapper />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await userEvent.click(canvas.getByRole('button', { name: /open cancel dialog/i }));

        const documentBody = within(document.body);
        await expect(
            await documentBody.findByText(t('account:orders.cancelDialogTitle', { orderNo: '00166274' }))
        ).toBeInTheDocument();

        // Default reason pre-selected
        const select = documentBody.getByRole('combobox');
        await expect(select).toHaveValue('Changed my mind');

        // Both action buttons visible
        await expect(
            documentBody.getByRole('button', { name: t('account:orders.cancelKeepOrder') })
        ).toBeInTheDocument();
        await expect(documentBody.getByRole('button', { name: t('account:orders.cancelConfirm') })).toBeInTheDocument();
    },
};

export const WithoutReasons: Story = {
    render: () => <CancelOrderDialogWrapper reasonCodes={[]} />,
    parameters: {
        docs: {
            description: {
                story: 'Degraded state when OMS metadata fetch fails — reason dropdown hidden, user can still confirm cancellation.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await userEvent.click(canvas.getByRole('button', { name: /open cancel dialog/i }));

        const documentBody = within(document.body);
        await expect(
            await documentBody.findByText(t('account:orders.cancelDialogTitle', { orderNo: '00166274' }))
        ).toBeInTheDocument();

        // No reason dropdown
        await expect(documentBody.queryByRole('combobox')).not.toBeInTheDocument();
        await expect(documentBody.getByText(t('account:orders.cancelDialogSubtitleNoReasons'))).toBeInTheDocument();

        // Confirm button still available
        await expect(documentBody.getByRole('button', { name: t('account:orders.cancelConfirm') })).toBeEnabled();
    },
};
