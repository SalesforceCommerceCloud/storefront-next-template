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
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import AuthorizedPickupPeople from '..';

const meta: Meta<typeof AuthorizedPickupPeople> = {
    title: 'Account/Store Preferences/Authorized Pickup People',
    component: AuthorizedPickupPeople,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Authorized Pickup People section. Displays a list of people authorized to pick up
orders on the customer's behalf, with add/edit/delete (client-side only until APIs exist).
                `,
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof AuthorizedPickupPeople>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Authorised Pickup People')).toBeInTheDocument();
        await expect(
            canvas.getByText('Add people who are authorised to pick up orders on your behalf')
        ).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /Add Person/i })).toBeInTheDocument();
        await expect(canvas.getByText(/Authorised pickup people will need to show a valid ID/)).toBeInTheDocument();
    },
};

export const OpenAddModal: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await userEvent.click(canvas.getByRole('button', { name: /Add Person/i }));

        // Dialog may be portaled to document.body
        const root = document.body;
        const view = within(root);

        await expect(view.getByRole('dialog', { name: 'Add Authorised Person' })).toBeInTheDocument();
        await expect(view.getByPlaceholderText('First Name')).toBeInTheDocument();
        await expect(view.getByPlaceholderText('Last Name')).toBeInTheDocument();
        await expect(view.getByPlaceholderText('email@example.com')).toBeInTheDocument();
        await expect(view.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        await expect(view.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    },
};
