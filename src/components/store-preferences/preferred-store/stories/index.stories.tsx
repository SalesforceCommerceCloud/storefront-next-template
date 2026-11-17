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
import { AppToaster } from '@/components/toast';
import type { ShopperStores } from '@/scapi';
import PreferredStore from '..';

const { t } = getTranslation();

const meta: Meta<typeof PreferredStore> = {
    title: 'Account/Store Preferences/Preferred Store',
    component: PreferredStore,
    tags: ['autodocs', 'sfdc-ext-store-locator'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Preferred Store for Pickup section. Displays the user's preferred store for BOPIS orders.
If the Store Selector extension is installed, provides a "Change store" button.
                `,
            },
        },
        loaderData: {
            preferredStore: {
                id: 'store-001',
                name: 'Downtown Store',
                address1: '123 Main Street',
                city: 'San Francisco',
                stateCode: 'CA',
                postalCode: '94105',
                storeHours: '10:00 AM - 8:00 PM',
            } as ShopperStores.schemas['Store'],
            error: null,
        },
    },
};

export default meta;
type Story = StoryObj<typeof PreferredStore>;

/**
 * Default story showing a selected store with full details
 */
export const WithStoreSelected: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Selected-store state with the configured store, address, and expandable store hours.',
            },
        },
    },
};

/**
 * Story showing empty state when no store is selected
 */
export const NoStoreSelected: Story = {
    parameters: {
        loaderData: {
            preferredStore: null,
            error: null,
        },
    },
};

export const SavedStoreUnavailable: Story = {
    parameters: {
        loaderData: { preferredStore: null, preferredStoreId: 'other-site-store', error: null },
    },
};

/**
 * Story with long store name and address to test layout
 */
export const WithLongStoreNameAndAddress: Story = {
    parameters: {
        loaderData: {
            preferredStore: {
                id: 'store-002',
                name: 'Salesforce Foundations - San Francisco Technology and Innovation Center',
                address1: '415 Mission Street, Suite 300, Technology and Innovation District',
                city: 'San Francisco',
                stateCode: 'CA',
                postalCode: '94105-2130',
                storeHours: '<p>Monday-Friday: 9:00 AM - 9:00 PM</p><p>Saturday-Sunday: 10:00 AM - 8:00 PM</p>',
            } as ShopperStores.schemas['Store'],
            error: null,
        },
    },
};

/**
 * Story showing store without hours
 */
export const WithoutStoreHours: Story = {
    parameters: {
        loaderData: {
            preferredStore: {
                id: 'store-003',
                name: 'Westfield Mall Store',
                address1: '865 Market Street',
                city: 'San Francisco',
                stateCode: 'CA',
                postalCode: '94103',
            } as ShopperStores.schemas['Store'],
            error: null,
        },
    },
};

/**
 * Story showing the lookup error instead of an empty or stale preference.
 */
export const LookupError: Story = {
    tags: ['interaction'],
    render: () => (
        <>
            <AppToaster />
            <PreferredStore />
        </>
    ),
    parameters: {
        snapshot: false,
        docs: {
            description: {
                story: 'Failed lookup state is not reported as an empty or stale preference.',
            },
        },
        loaderData: {
            preferredStore: null,
            error: 'Failed to load store details. Please try again later.',
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Preferred Store for Pickup')).toBeInTheDocument();
        await expect(
            canvas.queryByText(t('account:storePreferences.preferredStore.noStoreSelected'))
        ).not.toBeInTheDocument();
        await expect(canvas.getByText('Failed to load store details. Please try again later.')).toBeInTheDocument();
    },
};
