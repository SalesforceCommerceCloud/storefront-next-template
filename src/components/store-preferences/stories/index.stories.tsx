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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import StorePreferences from '..';

const { t } = getTranslation();

const meta: Meta<typeof StorePreferences> = {
    title: 'Account/Store Preferences',
    component: StorePreferences,
    tags: ['autodocs', 'sfdc-ext-store-locator'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Store Preferences page for My Account. Displays the Store Preferences header and
Preferred Store for Pickup section where users can view and change their preferred in-store pickup location.
                `,
            },
        },
        reactRouter: {
            loader: () => ({
                preferredStore: {
                    id: 'store-001',
                    name: 'Salesforce Foundations - San Francisco',
                    address1: '415 Mission Street',
                    city: 'San Francisco',
                    stateCode: 'CA',
                    postalCode: '94105',
                    storeHours: 'Open today: 10:00 AM - 8:00 PM',
                },
                error: null,
            }),
        },
    },
};

export default meta;
type Story = StoryObj<typeof StorePreferences>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByRole('heading', { level: 1, name: 'Store Preferences' })).toBeInTheDocument();
        await expect(canvas.getByText(t('account:storePreferences.subtitle'))).toBeInTheDocument();

        // Conditional assertions for store-locator extension content
        const preferredStoreHeading = canvas.queryByText('Preferred Store for Pickup');
        if (preferredStoreHeading) {
            await expect(preferredStoreHeading).toBeInTheDocument();
            await expect(
                canvas.getByText('Select your preferred store for in-store pickup orders')
            ).toBeInTheDocument();

            const changeStoreButton = canvas.queryByRole('button', { name: 'Change store' });
            if (changeStoreButton) {
                await expect(changeStoreButton).toBeInTheDocument();
            }

            const storeName = canvas.queryByText('Salesforce Foundations - San Francisco');
            if (storeName) {
                await expect(storeName).toBeInTheDocument();
                await expect(canvas.getByText('415 Mission Street, San Francisco, CA 94105')).toBeInTheDocument();
                await expect(canvas.getByText('Open today: 10:00 AM - 8:00 PM')).toBeInTheDocument();
            }
        }

        await expect(canvas.getByText('Pickup Preferences')).toBeInTheDocument();
        await expect(canvas.getByText('Manage your pickup notification and store preferences')).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    },
};
