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
            activeStore: {
                id: 'store-001',
                name: 'Downtown Store',
                address1: '123 Main Street',
                city: 'San Francisco',
                stateCode: 'CA',
                postalCode: '94105',
                storeHours: '10:00 AM - 8:00 PM',
            } as ShopperStores.schemas['Store'],
            activeError: null,
            defaultError: null,
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
            activeStore: null,
            activeError: null,
            defaultError: null,
        },
    },
};

export const SavedStoreUnavailable: Story = {
    parameters: {
        loaderData: {
            activeStore: null,
            defaultStore: null,
            defaultStoreId: 'other-site-store',
            activeError: null,
            defaultError: null,
        },
    },
};

/**
 * Story with long store name and address to test layout
 */
export const WithLongStoreNameAndAddress: Story = {
    parameters: {
        loaderData: {
            activeStore: {
                id: 'store-002',
                name: 'Salesforce Foundations - San Francisco Technology and Innovation Center',
                address1: '415 Mission Street, Suite 300, Technology and Innovation District',
                city: 'San Francisco',
                stateCode: 'CA',
                postalCode: '94105-2130',
                storeHours: '<p>Monday-Friday: 9:00 AM - 9:00 PM</p><p>Saturday-Sunday: 10:00 AM - 8:00 PM</p>',
            } as ShopperStores.schemas['Store'],
            activeError: null,
            defaultError: null,
        },
    },
};

/**
 * Story showing store without hours
 */
export const WithoutStoreHours: Story = {
    parameters: {
        loaderData: {
            activeStore: {
                id: 'store-003',
                name: 'Westfield Mall Store',
                address1: '865 Market Street',
                city: 'San Francisco',
                stateCode: 'CA',
                postalCode: '94103',
            } as ShopperStores.schemas['Store'],
            activeError: null,
            defaultError: null,
        },
    },
};

const downtown = {
    id: 'store-001',
    name: 'Downtown Store',
    address1: '123 Main Street',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94105',
    storeHours: '10:00 AM - 8:00 PM',
} as ShopperStores.schemas['Store'];
const uptown = {
    id: 'store-004',
    name: 'Uptown Store',
    address1: '9 Hill Road',
    city: 'Oakland',
    stateCode: 'CA',
    postalCode: '94607',
} as ShopperStores.schemas['Store'];

/**
 * The saved default and the current store are different stores; both are shown and the
 * current store can be saved as the default.
 */
export const DefaultDiffersFromActive: Story = {
    parameters: {
        loaderData: {
            activeStore: downtown,
            defaultStore: uptown,
            defaultStoreId: 'store-004',
            activeError: null,
            defaultError: null,
        },
    },
};

/** A current store exists but no default has been saved; the active store is not shown as the default. */
export const NoDefaultSaved: Story = {
    parameters: {
        loaderData: {
            activeStore: downtown,
            defaultStore: null,
            defaultStoreId: null,
            activeError: null,
            defaultError: null,
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
            activeStore: null,
            activeError: 'Failed to load store details. Please try again later.',
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Preferred Store for Pickup')).toBeInTheDocument();
        await expect(
            canvas.queryByText(t('account:storePreferences.preferredStore.noStoreSelected'))
        ).not.toBeInTheDocument();
        // Shown in the current-store section and announced by the error toast.
        await expect(
            canvas.getAllByText('Failed to load store details. Please try again later.').length
        ).toBeGreaterThan(0);
    },
};
