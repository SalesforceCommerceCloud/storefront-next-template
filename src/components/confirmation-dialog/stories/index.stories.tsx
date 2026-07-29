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
import { ConfirmationDialog } from '../index';
import { action } from 'storybook/actions';
import { useState, type ReactElement } from 'react';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { Button } from '@/components/ui/button';

type ConfirmationDialogArgs = React.ComponentProps<typeof ConfirmationDialog>;

function DialogRender(args: ConfirmationDialogArgs): ReactElement {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button onClick={() => setOpen(true)}>Open dialog</Button>
            <ConfirmationDialog
                {...args}
                open={open}
                onOpenChange={setOpen}
                onCancel={() => {
                    action('cancel-clicked')();
                    setOpen(false);
                }}
                onConfirm={() => {
                    action('confirm-clicked')();
                    setOpen(false);
                }}
            />
        </>
    );
}

const meta: Meta<typeof ConfirmationDialog> = {
    title: 'Core/Overlays/Confirmation Dialog',
    component: ConfirmationDialog,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            story: { inline: false, height: '600px' },
            description: {
                component: `
A reusable confirmation dialog component built on top of AlertDialog. Provides a consistent confirmation pattern across the application.

### Features:
- Customizable title and description
- Configurable button text
- Callback handlers for confirm and cancel

### Story render pattern
The stories below open with the dialog closed and render an "Open dialog" trigger button. This matches the production usage pattern (a parent component owns the open state and toggles it on user interaction) and avoids the docs-page rendering problem where a \`position: fixed\` modal opened inline gets clipped by the preview block.
                `,
            },
        },
    },
    // Args are bound to the component's real props so Storybook Controls drive
    // the canvas: edit `title`, `description`, or button text and the dialog
    // content updates live. Hidden controls are listed below.
    argTypes: {
        title: {
            control: 'text',
            description: 'Dialog title',
            table: { type: { summary: 'string' } },
        },
        description: {
            control: 'text',
            description: 'Dialog description',
            table: { type: { summary: 'string' } },
        },
        cancelButtonText: {
            control: 'text',
            description: 'Cancel button text',
            table: { type: { summary: 'string' } },
        },
        confirmButtonText: {
            control: 'text',
            description: 'Confirm button text',
            table: { type: { summary: 'string' } },
        },
        // Hidden: open state and callbacks are owned by the story trigger;
        // className is utility-class noise (Designer-Friendly Input Rule);
        // confirmButtonDisabled is an edge state without a story-level
        // demonstration; aria labels don't visibly affect the canvas.
        open: { control: false, table: { disable: true } },
        onOpenChange: { control: false, table: { disable: true } },
        onCancel: { control: false, table: { disable: true } },
        onConfirm: { control: false, table: { disable: true } },
        className: { control: false, table: { disable: true } },
        confirmButtonDisabled: { control: false, table: { disable: true } },
        cancelButtonAriaLabel: { control: false, table: { disable: true } },
        confirmButtonAriaLabel: { control: false, table: { disable: true } },
    },
    args: {
        title: 'Delete Item',
        description: 'Are you sure you want to delete this item? This action cannot be undone.',
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Delete',
    },
    render: (args) => <DialogRender {...args} />,
};

export default meta;
type Story = StoryObj<typeof ConfirmationDialog>;

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Standard delete-confirmation dialog. Click the trigger to open.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const trigger = await canvas.findByRole('button', { name: /open dialog/i }, { timeout: 5000 });
        await userEvent.click(trigger);

        const documentBody = within(document.body);
        const dialog = await documentBody.findByRole('alertdialog', {}, { timeout: 5000 });
        const inDialog = within(dialog);
        await expect(inDialog.getByRole('heading', { name: /delete item/i })).toBeInTheDocument();
        await expect(inDialog.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
        await expect(inDialog.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    },
};

export const LongContent: Story = {
    args: {
        title: 'Delete Account',
        description:
            'You are about to delete this account. This is irreversible. ' +
            'All your saved addresses, payment methods, order history, wishlists, and personal preferences will be permanently removed. ' +
            'Any in-progress orders will be cancelled and refunds will be processed within 5–7 business days. ' +
            'Subscriptions tied to this account will be terminated at the end of the current billing cycle. ' +
            'Reward points, store credit, and gift card balances will be forfeited and cannot be restored. ' +
            'If you have questions, contact support before continuing — once confirmed, this action cannot be undone.',
        cancelButtonText: 'Keep Account',
        confirmButtonText: 'Delete Account',
    },
    parameters: {
        docs: {
            description: {
                story: 'Long descriptive copy renders without breaking the dialog layout. Click the trigger to open.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const trigger = await canvas.findByRole('button', { name: /open dialog/i }, { timeout: 5000 });
        await userEvent.click(trigger);

        const documentBody = within(document.body);
        const dialog = await documentBody.findByRole('alertdialog', {}, { timeout: 5000 });
        const inDialog = within(dialog);
        await expect(inDialog.getByRole('heading', { name: /delete account/i })).toBeInTheDocument();
        await expect(inDialog.getByText(/cannot be undone/i)).toBeInTheDocument();
        await expect(inDialog.getByRole('button', { name: /keep account/i })).toBeInTheDocument();
        await expect(inDialog.getByRole('button', { name: /delete account/i })).toBeInTheDocument();
    },
};
