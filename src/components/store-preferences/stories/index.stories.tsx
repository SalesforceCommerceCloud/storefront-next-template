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
import StorePreferences from '..';

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
        loaderData: {
            activeStore: {
                id: 'store-001',
                name: 'Salesforce Foundations - San Francisco',
                address1: '415 Mission Street',
                city: 'San Francisco',
                stateCode: 'CA',
                postalCode: '94105',
                storeHours: 'Open today: 10:00 AM - 8:00 PM',
            },
            activeError: null,
            defaultError: null,
        },
    },
};

export default meta;
type Story = StoryObj<typeof StorePreferences>;

export const Default: Story = {};
