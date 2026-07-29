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
import { fn, expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { PasskeyCard, type PasskeyCredential } from '../passkey-card';

const mockCredential: PasskeyCredential = {
    credentialId: 'cred-1',
    nickName: 'MacBook Pro',
    createdTime: '2026-01-15T10:00:00Z',
    lastUsed: '2026-06-01T09:30:00Z',
    uses: 12,
};

const meta: Meta<typeof PasskeyCard> = {
    title: 'ACCOUNT/Passkeys/Passkey Card',
    component: PasskeyCard,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Displays a single registered passkey credential: nickname, created/last-used dates, usage count, and a delete action. Shows a "New" badge for credentials registered during the current session.',
            },
        },
    },
    argTypes: {
        credential: { table: { disable: true } },
        onRemove: { table: { disable: true } },
    },
    args: {
        credential: mockCredential,
        onRemove: fn(),
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('MacBook Pro')).toBeInTheDocument();
        await expect(canvas.getByText(/12 uses/i)).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /delete passkey/i })).toBeInTheDocument();
    },
};

export const Unnamed: Story = {
    args: {
        credential: { credentialId: 'cred-2', uses: 0 },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(/unnamed passkey/i)).toBeInTheDocument();
        await expect(canvas.getByText(/not used yet/i)).toBeInTheDocument();
    },
};

export const New: Story = {
    args: {
        credential: { credentialId: 'cred-3', nickName: 'iPhone', uses: 0 },
        isNew: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('iPhone')).toBeInTheDocument();
        await expect(canvas.getByText(/^new$/i)).toBeInTheDocument();
    },
};
