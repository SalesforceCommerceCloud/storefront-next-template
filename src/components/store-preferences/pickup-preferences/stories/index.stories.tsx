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
import PickupPreferences from '..';

const meta: Meta<typeof PickupPreferences> = {
    title: 'Account/Store Preferences/Pickup Preferences',
    component: PickupPreferences,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Pickup Preferences section. Displays and edits pickup notification and store
preferences with view/edit modes. Fully mocked (no backend).
                `,
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof PickupPreferences>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Pickup Preferences')).toBeInTheDocument();
        await expect(canvas.getByText('Manage your pickup notification and store preferences')).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
        await expect(canvas.getByText('Auto-select preferred store')).toBeInTheDocument();
        await expect(canvas.getByText('Automatically use your preferred store for pickup orders')).toBeInTheDocument();
        await expect(canvas.getByText('Pickup notifications')).toBeInTheDocument();
        await expect(canvas.getByText('Get notified when your order is ready for pickup')).toBeInTheDocument();
        await expect(canvas.getByText('Store events & promotions')).toBeInTheDocument();
        await expect(
            canvas.getByText('Receive updates about events and promotions at your preferred store')
        ).toBeInTheDocument();
    },
};

export const EditMode: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await userEvent.click(canvas.getByRole('button', { name: 'Edit' }));

        await expect(canvas.getByRole('button', { name: 'Save' })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    },
};
