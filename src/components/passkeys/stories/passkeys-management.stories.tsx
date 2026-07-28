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
import { expect, within, userEvent, waitFor } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { RouteObject } from 'react-router';
import AuthProvider from '@/providers/auth';
import { PasskeyRegistrationProvider } from '@/providers/passkey-registration';
import type { PublicSessionData } from '@/lib/api/types';
import { PasskeysManagement } from '../passkeys-management';
import type { PasskeyCredential } from '../passkey-card';

// PasskeysManagement reads the shopper's encoded user id via useAuth() (used when opening the
// registration modal) and opens/closes the shared registration modal via
// usePasskeyRegistrationContext(). The global StoryShell decorator doesn't include either — this
// story overrides AuthProvider with a registered session and wraps in the real
// PasskeyRegistrationProvider so "Add Passkey" opens the actual modal.
const registeredSession: PublicSessionData = {
    userType: 'registered',
    customerId: 'storybook-1',
    encUserId: 'enc-user-1',
};

const mockCredentials: PasskeyCredential[] = [
    {
        credentialId: 'cred-1',
        nickName: 'MacBook Pro',
        createdTime: '2026-01-15T10:00:00Z',
        lastUsed: '2026-06-01T09:30:00Z',
        uses: 12,
    },
    {
        credentialId: 'cred-2',
        nickName: 'iPhone',
        createdTime: '2026-03-02T10:00:00Z',
        uses: 0,
    },
];

// Mock routes for the fetcher-driven delete action and the registration modal's fetch() calls.
const mockRoutes: RouteObject[] = [
    {
        path: '/action/passkey-delete-credential',
        action: () => ({ success: true }),
    },
];

const meta: Meta<typeof PasskeysManagement> = {
    title: 'ACCOUNT/Passkeys/Passkeys Management',
    component: PasskeysManagement,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        mockRoutes,
        docs: {
            description: {
                component:
                    'Account passkeys page content: lists registered credentials with a delete action, and an entry point into the shared registration modal.',
            },
        },
    },
    argTypes: {
        credentials: { table: { disable: true } },
    },
    decorators: [
        (Story) => (
            <AuthProvider value={registeredSession}>
                <PasskeyRegistrationProvider>
                    <Story />
                </PasskeyRegistrationProvider>
            </AuthProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        credentials: mockCredentials,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(/your passkeys/i)).toBeInTheDocument();
        await expect(canvas.getByText('MacBook Pro')).toBeInTheDocument();
        await expect(canvas.getByText('iPhone')).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /add passkey/i })).toBeInTheDocument();
    },
};

export const Empty: Story = {
    args: {
        credentials: [],
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(/no saved passkeys/i)).toBeInTheDocument();
    },
};

export const DeleteFlow: Story = {
    args: {
        credentials: mockCredentials,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const deleteButtons = canvas.getAllByRole('button', { name: /delete passkey/i });
        await userEvent.click(deleteButtons[0]);

        const documentBody = within(document.body);
        const dialog = await documentBody.findByRole('dialog', {}, { timeout: 5000 });
        const inDialog = within(dialog);
        await expect(inDialog.getByText(/remove passkey/i)).toBeInTheDocument();

        await userEvent.click(inDialog.getByRole('button', { name: /^remove$/i }));

        await waitFor(async () => {
            await expect(documentBody.queryByRole('dialog')).not.toBeInTheDocument();
        });
    },
};

export const AddPasskeyOpensModal: Story = {
    args: {
        credentials: mockCredentials,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await userEvent.click(canvas.getByRole('button', { name: /add passkey/i }));

        const documentBody = within(document.body);
        const dialog = await documentBody.findByRole('dialog', {}, { timeout: 5000 });
        await expect(within(dialog).getByText(/name your passkey/i)).toBeInTheDocument();
    },
};
