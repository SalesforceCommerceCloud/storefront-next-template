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
import type { OrderLike } from '@/lib/order-management/types';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/toast';
import { ReturnOrderDialog } from '../return-order-dialog';

const { t } = getTranslation();

const mockOrder: OrderLike = {
    orderNo: 'INO001',
    productItems: [
        {
            itemId: 'item-1',
            productId: 'prod-1',
            productName: 'First Product',
            quantity: 2,
            omsData: { quantityAvailableToReturn: 2 },
        },
        {
            itemId: 'item-2',
            productId: 'prod-2',
            productName: 'Second Product',
            quantity: 1,
            omsData: { quantityAvailableToReturn: 0 },
        },
    ] as unknown as ShopperOrders.schemas['Order']['productItems'],
};

const returnReasonCodes: ShopperOrders.schemas['OmsReasonCode'][] = [
    { reason: 'Does not fit', default: true },
    { reason: 'Changed my mind', default: false },
];

/** Drives the review view to Submit, so error/success stories land on the post-submit state. */
async function openAndSubmit(canvasElement: HTMLElement): Promise<ReturnType<typeof within>> {
    await waitForStorybookReady(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /open return dialog/i }));

    const documentBody = within(document.body);
    await documentBody.findByText(t('account:orders.returnDialogTitle', { orderNo: 'INO001' }));
    await userEvent.click(documentBody.getByRole('checkbox'));
    await userEvent.click(documentBody.getByRole('button', { name: t('account:orders.returnReviewButton') }));
    await documentBody.findByText(t('account:orders.returnReviewTitle'));
    await userEvent.click(documentBody.getByRole('button', { name: t('account:orders.returnSubmitButton') }));
    return documentBody;
}

/** Wrapper managing local `open` state so the dialog can be opened/closed from the canvas. */
function ReturnOrderDialogWrapper({
    reasonCodes = returnReasonCodes,
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
            <Button onClick={() => handleOpenChange(true)}>Open Return Dialog</Button>
            <ReturnOrderDialog
                order={mockOrder}
                returnReasonCodes={reasonCodes}
                open={open}
                onOpenChange={handleOpenChange}
            />
            {/* sonner queues toasts without a mounted <Toaster>; mount one so the success story can assert it. */}
            <Toaster />
        </>
    );
}

const meta: Meta<typeof ReturnOrderDialog> = {
    title: 'ACCOUNT/Return Order Dialog',
    component: ReturnOrderDialog,
    parameters: {
        layout: 'centered',
        // The dialog's "Submit return" posts to this action via useFetcher — the default
        // Storybook mock route table doesn't include it (see .storybook/decorators/mock-routes.ts).
        mockRoutes: [
            {
                path: '/action/return-order',
                action: async () => ({ success: true }),
            },
        ],
        docs: {
            description: {
                component:
                    'Single-dialog return flow with a local `select`/`review` view swap (no remount, so focus stays trapped across the transition). Renders only items with `quantityAvailableToReturn > 0`. When `returnReasonCodes` is empty (a degraded OMS metadata fetch) the selection view shows an informational error banner (no retry button, matching PWA Kit) instead of the reason select.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
    argTypes: {
        order: { table: { disable: true } },
        returnReasonCodes: { table: { disable: true } },
        open: { table: { disable: true } },
        onOpenChange: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof ReturnOrderDialog>;

export const Selection: Story = {
    render: () => <ReturnOrderDialogWrapper />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await userEvent.click(canvas.getByRole('button', { name: /open return dialog/i }));

        const documentBody = within(document.body);
        await expect(
            await documentBody.findByText(t('account:orders.returnDialogTitle', { orderNo: 'INO001' }))
        ).toBeInTheDocument();

        // Only the returnable item (quantityAvailableToReturn: 2) renders — the fully-returned
        // second item is excluded entirely.
        await expect(documentBody.getByText('First Product')).toBeInTheDocument();
        await expect(documentBody.queryByText('Second Product')).not.toBeInTheDocument();

        const reviewButton = documentBody.getByRole('button', { name: t('account:orders.returnReviewButton') });
        await expect(reviewButton).toBeDisabled();

        // Checking the row reveals the quantity stepper and reason select, with the default
        // reason pre-selected, and enables "Review return".
        await userEvent.click(documentBody.getByRole('checkbox'));
        await expect(documentBody.getByLabelText(t('account:orders.returnQuantityLabel'))).toHaveValue(1);
        await expect(documentBody.getByRole('combobox')).toHaveValue('Does not fit');
        await expect(reviewButton).not.toBeDisabled();
    },
};

export const SelectionMobile: Story = {
    render: () => <ReturnOrderDialogWrapper />,
    parameters: {
        // Drives Chromatic/interactive-iframe width so the mobile bottom-sheet Drawer shell renders
        // (below `md`, matching PWA Kit `return-items-modal`). NOTE: the interaction/a11y test runner
        // does NOT resize the page from this param, so under test this story exercises the same
        // shell-agnostic flow as `Selection`; the Dialog↔Drawer swap itself is covered deterministically
        // by the unit test (which mocks `matchMedia`).
        viewport: { defaultViewport: 'mobile1' },
        docs: {
            description: {
                story: 'Below the `md` breakpoint the return flow presents as a full-height bottom-sheet `Drawer` (matching PWA Kit `return-items-modal`) instead of the centered `Dialog`. Same view content and state — only the shell changes.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByRole('button', { name: /open return dialog/i }));

        const documentBody = within(document.body);
        await expect(
            await documentBody.findByText(t('account:orders.returnDialogTitle', { orderNo: 'INO001' }))
        ).toBeInTheDocument();

        // The select controls behave identically regardless of which shell wraps them.
        await userEvent.click(documentBody.getByRole('checkbox'));
        await expect(documentBody.getByLabelText(t('account:orders.returnQuantityLabel'))).toHaveValue(1);
        await expect(
            documentBody.getByRole('button', { name: t('account:orders.returnReviewButton') })
        ).not.toBeDisabled();
    },
};

export const Review: Story = {
    render: () => <ReturnOrderDialogWrapper />,
    parameters: {
        docs: {
            description: {
                story: 'Reached by selecting a returnable item and clicking "Review return" — confirms the selected quantity and reason before submission.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByRole('button', { name: /open return dialog/i }));

        const documentBody = within(document.body);
        await documentBody.findByText(t('account:orders.returnDialogTitle', { orderNo: 'INO001' }));

        await userEvent.click(documentBody.getByRole('checkbox'));
        await userEvent.click(documentBody.getByRole('button', { name: t('account:orders.returnReviewButton') }));

        await expect(await documentBody.findByText(t('account:orders.returnReviewTitle'))).toBeInTheDocument();
        await expect(
            documentBody.getByText(t('account:orders.returnReviewQuantity', { count: 1 }))
        ).toBeInTheDocument();
        await expect(
            documentBody.getByText(t('account:orders.returnReviewReason', { reason: 'Does not fit' }))
        ).toBeInTheDocument();

        const submitButton = documentBody.getByRole('button', { name: t('account:orders.returnSubmitButton') });
        await expect(submitButton).toBeEnabled();

        // Back returns to the selection view with the choice preserved.
        await userEvent.click(documentBody.getByRole('button', { name: t('account:orders.returnBackButton') }));
        await expect(documentBody.getByLabelText(t('account:orders.returnQuantityLabel'))).toHaveValue(1);
    },
};

export const ReasonsUnavailable: Story = {
    render: () => <ReturnOrderDialogWrapper reasonCodes={[]} />,
    parameters: {
        docs: {
            description: {
                story: 'Degraded OMS metadata fetch (`returnReasonCodes: []`) — the reason select is hidden and "Review return" stays enabled. The SCAPI `reason` field is optional, so the server applies its default reason code when absent (see `buildReturnPayload`).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByRole('button', { name: /open return dialog/i }));

        const documentBody = within(document.body);
        await documentBody.findByText(t('account:orders.returnDialogTitle', { orderNo: 'INO001' }));

        const reviewButton = documentBody.getByRole('button', { name: t('account:orders.returnReviewButton') });
        await expect(reviewButton).toBeDisabled();

        await userEvent.click(documentBody.getByRole('checkbox'));
        // No destructive banner rendered; the reason combobox is omitted entirely.
        await expect(documentBody.queryByRole('alert')).not.toBeInTheDocument();
        await expect(documentBody.queryByRole('combobox')).not.toBeInTheDocument();
        // Review return is enabled — the shopper can advance and submit without a reason.
        await expect(reviewButton).toBeEnabled();
    },
};

export const SubmitSuccess: Story = {
    render: () => <ReturnOrderDialogWrapper />,
    parameters: {
        docs: {
            description: {
                story: 'Successful return (action returns `{ success: true }`) — the dialog closes and a success toast is shown ("Return submitted"). The order loader revalidates automatically so the returned item leaves the list.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const documentBody = await openAndSubmit(canvasElement);
        // On success the dialog closes; the success toast surfaces the confirmation copy.
        await expect(await documentBody.findByText(t('account:orders.returnSuccessTitle'))).toBeInTheDocument();
    },
};

export const RecoverableError: Story = {
    render: () => <ReturnOrderDialogWrapper />,
    parameters: {
        mockRoutes: [
            {
                path: '/action/return-order',
                action: async () =>
                    new Response(
                        JSON.stringify({ success: false, error: { kind: 'quantity_exceeded', status: 400 } }),
                        {
                            status: 400,
                            headers: { 'Content-Type': 'application/json' },
                        }
                    ),
            },
        ],
        docs: {
            description: {
                story: 'Recoverable 400 (`ReturnQuantityExceeded`) — the shopper is sent back to the selection view with a contextual banner so they can adjust the quantity and retry.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const documentBody = await openAndSubmit(canvasElement);
        // Recoverable-400 returns the shopper to selection with the banner.
        await expect(await documentBody.findByTestId('return-recoverable-error')).toHaveTextContent(
            t('account:orders.returnError400QuantityMessage')
        );
        await expect(
            documentBody.getByText(t('account:orders.returnDialogTitle', { orderNo: 'INO001' }))
        ).toBeInTheDocument();
    },
};

export const TerminalError: Story = {
    render: () => <ReturnOrderDialogWrapper />,
    parameters: {
        mockRoutes: [
            {
                path: '/action/return-order',
                action: async () =>
                    new Response(JSON.stringify({ success: false, error: { kind: 'not_returnable', status: 409 } }), {
                        status: 409,
                        headers: { 'Content-Type': 'application/json' },
                    }),
            },
        ],
        docs: {
            description: {
                story: 'Terminal 409 (`OrderReturnFailed`) — the order can no longer be returned. The review banner stays and "Submit return" is disabled; retrying is pointless.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const documentBody = await openAndSubmit(canvasElement);
        await expect(await documentBody.findByTestId('return-submit-error')).toHaveTextContent(
            t('account:orders.returnError409Message')
        );
        await expect(documentBody.getByRole('button', { name: t('account:orders.returnSubmitButton') })).toBeDisabled();
    },
};
