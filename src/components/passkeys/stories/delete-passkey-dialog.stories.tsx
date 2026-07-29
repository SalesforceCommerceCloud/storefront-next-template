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
import { useState, type ReactElement } from 'react';
import { action } from 'storybook/actions';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { Button } from '@/components/ui/button';
import { DeletePasskeyDialog } from '../delete-passkey-dialog';
import type { PasskeyCredential } from '../passkey-card';

type DeletePasskeyDialogArgs = React.ComponentProps<typeof DeletePasskeyDialog>;

const mockCredential: PasskeyCredential = {
    credentialId: 'cred-1',
    nickName: 'MacBook Pro',
};

function DialogRender(args: DeletePasskeyDialogArgs): ReactElement {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button onClick={() => setOpen(true)}>Open dialog</Button>
            <DeletePasskeyDialog
                {...args}
                open={open}
                onOpenChange={setOpen}
                onConfirm={(credentialId) => {
                    action('confirm-clicked')(credentialId);
                    setOpen(false);
                }}
            />
        </>
    );
}

const meta: Meta<typeof DeletePasskeyDialog> = {
    title: 'ACCOUNT/Passkeys/Delete Passkey Dialog',
    component: DeletePasskeyDialog,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            story: { inline: false, height: '400px' },
            description: {
                component: `
Confirmation dialog shown before removing a registered passkey. Renders \`null\` when no credential is selected.

### Story render pattern
The stories below open with the dialog closed and render an "Open dialog" trigger button, matching the production usage pattern (the parent management page owns the open state) and avoiding the docs-page clipping problem for \`position: fixed\` modals.
                `,
            },
        },
    },
    argTypes: {
        open: { control: false, table: { disable: true } },
        onOpenChange: { control: false, table: { disable: true } },
        onConfirm: { control: false, table: { disable: true } },
        credential: { control: false, table: { disable: true } },
        isLoading: {
            control: 'boolean',
            description:
                'Disables the cancel/confirm buttons and shows the "Removing…" label while the delete request is in flight.',
        },
    },
    args: {
        credential: mockCredential,
        isLoading: false,
    },
    render: (args) => <DialogRender {...args} />,
};

export default meta;
type Story = StoryObj<typeof DeletePasskeyDialog>;

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Standard confirmation for a named passkey. Click the trigger to open.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const trigger = await canvas.findByRole('button', { name: /open dialog/i }, { timeout: 5000 });
        await userEvent.click(trigger);

        const documentBody = within(document.body);
        const dialog = await documentBody.findByRole('dialog', {}, { timeout: 5000 });
        const inDialog = within(dialog);
        await expect(inDialog.getByText(/remove passkey/i)).toBeInTheDocument();
        await expect(inDialog.getByText(/MacBook Pro/i)).toBeInTheDocument();
        await expect(inDialog.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
        await expect(inDialog.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
    },
};

export const UnnamedPasskey: Story = {
    args: {
        credential: { credentialId: 'cred-2' },
    },
    parameters: {
        docs: {
            description: {
                story: 'Falls back to a generic label when the credential has no nickname.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const trigger = await canvas.findByRole('button', { name: /open dialog/i }, { timeout: 5000 });
        await userEvent.click(trigger);

        const documentBody = within(document.body);
        const dialog = await documentBody.findByRole('dialog', {}, { timeout: 5000 });
        const inDialog = within(dialog);
        await expect(inDialog.getByText(/unnamed passkey/i)).toBeInTheDocument();
    },
};

export const Loading: Story = {
    args: {
        isLoading: true,
    },
    parameters: {
        docs: {
            description: {
                story: 'While the delete request is in flight, cancel/confirm are disabled and the confirm button shows a progress label.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const trigger = await canvas.findByRole('button', { name: /open dialog/i }, { timeout: 5000 });
        await userEvent.click(trigger);

        const documentBody = within(document.body);
        const dialog = await documentBody.findByRole('dialog', {}, { timeout: 5000 });
        const inDialog = within(dialog);
        await expect(inDialog.getByRole('button', { name: /^cancel$/i })).toBeDisabled();
        await expect(inDialog.getByRole('button', { name: /removing/i })).toBeDisabled();
    },
};
