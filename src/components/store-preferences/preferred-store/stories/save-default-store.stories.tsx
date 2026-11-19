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
import type { ShopperStores } from '@/scapi';
import { ChooseDefaultStore, SaveCurrentStoreAsDefault } from '../save-default-store';

const activeStore = {
    id: 'store-001',
    name: 'Downtown Store',
    address1: '123 Main Street',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94105',
} as ShopperStores.schemas['Store'];

const meta: Meta<typeof SaveCurrentStoreAsDefault> = {
    title: 'Account/Store Preferences/Save Default Store',
    component: SaveCurrentStoreAsDefault,
    tags: ['autodocs', 'sfdc-ext-store-locator'],
    parameters: {
        layout: 'centered',
        mockRoutes: [
            {
                path: '/action/save-default-store',
                action: () => ({ success: true, preferredStoreId: 'store-001' }),
            },
            {
                path: '/resource/stores',
                loader: () => ({ success: true, stores: { data: [{ ...activeStore, inventoryId: 'inventory-001' }] } }),
            },
        ],
        docs: {
            description: {
                component:
                    'Registered-only controls that save the account default store. They post to the dedicated save action and never change the active store, selection cookie or basket.',
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof SaveCurrentStoreAsDefault>;

/** Saves the current store as the default. */
export const SaveCurrent: Story = {
    args: { activeStore },
};

/** Opens the isolated candidate chooser. */
export const ChooseDifferent: Story = {
    render: () => <ChooseDefaultStore />,
};
