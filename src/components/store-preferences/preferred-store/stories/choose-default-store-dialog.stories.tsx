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
import ChooseDefaultStoreDialog from '../choose-default-store-dialog';

const meta: Meta<typeof ChooseDefaultStoreDialog> = {
    title: 'Account/Store Preferences/Choose Default Store Dialog',
    component: ChooseDefaultStoreDialog,
    tags: ['autodocs', 'sfdc-ext-store-locator'],
    parameters: {
        layout: 'centered',
        mockRoutes: [
            {
                path: '/resource/stores',
                loader: () => ({
                    success: true,
                    stores: {
                        data: [
                            {
                                id: 'store-001',
                                name: 'Downtown Store',
                                address1: '123 Main Street',
                                city: 'San Francisco',
                                stateCode: 'CA',
                                postalCode: '94105',
                                inventoryId: 'inventory-001',
                            },
                        ],
                    },
                }),
            },
        ],
        docs: {
            description: {
                component:
                    'Lazy-loaded chooser dialog with its own store search. The candidate is saved as the account default and never selected.',
            },
        },
    },
    args: { open: true, onOpenChange: () => {}, save: () => {}, pending: false, blocked: false, result: undefined },
};

export default meta;
type Story = StoryObj<typeof ChooseDefaultStoreDialog>;

/** Open dialog before any search. */
export const Default: Story = {};

/** A save is in flight: the Save button is disabled and progress is announced. */
export const Saving: Story = {
    args: { pending: true, blocked: true },
};

/** The last save failed: the alert region reports it and the shopper can retry. */
export const SaveFailed: Story = {
    args: { result: { success: false, code: 'DEFAULT_SAVE_FAILED' } },
};
