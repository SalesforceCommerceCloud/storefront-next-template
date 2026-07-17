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
import { Title, Description, Controls } from '@storybook/addon-docs/blocks';
import { expect, within } from 'storybook/test';
import { action } from 'storybook/actions';
import { waitForStorybookReady } from '@storybook/test-utils';
import { SavedAddressesList } from '../saved-addresses-list';
import type { AddressBookItem } from '@/lib/customer/profile-utils';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

const addresses: AddressBookItem[] = [
    {
        id: 'addr-1',
        firstName: 'Jane',
        lastName: 'Doe',
        address1: '123 Main St',
        address2: 'Apt 4',
        city: 'San Francisco',
        stateCode: 'CA',
        postalCode: '94102',
        countryCode: 'US',
        preferred: true,
    },
    {
        id: 'addr-2',
        firstName: 'Bob',
        lastName: 'Smith',
        address1: '456 Oak Ave',
        city: 'Boston',
        stateCode: 'MA',
        postalCode: '02101',
        countryCode: 'US',
        preferred: false,
    },
    {
        id: 'addr-3',
        firstName: 'Alice',
        lastName: 'Johnson',
        address1: '789 Pine Rd',
        city: 'Portland',
        stateCode: 'OR',
        postalCode: '97201',
        countryCode: 'US',
        preferred: false,
    },
    {
        id: 'addr-4',
        firstName: 'Charlie',
        lastName: 'Brown',
        address1: '321 Elm Blvd',
        city: 'Denver',
        stateCode: 'CO',
        postalCode: '80202',
        countryCode: 'US',
        preferred: false,
    },
    {
        id: 'addr-5',
        firstName: 'Diana',
        lastName: 'Prince',
        address1: '555 Cedar Ln',
        city: 'Seattle',
        stateCode: 'WA',
        postalCode: '98101',
        countryCode: 'US',
        preferred: false,
    },
];

const meta: Meta<typeof SavedAddressesList> = {
    title: 'Checkout/Address/Saved Addresses List',
    component: SavedAddressesList,
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Displays multiple saved addresses as selectable radio cards in the Shipping Address checkout stage. Shows up to `maxVisible` (default 3) addresses with a "View All" control to expand the list.',
            },
            page: () => (
                <>
                    <Title />
                    <Description />
                    <Controls />
                </>
            ),
        },
    },
    tags: ['autodocs', 'interaction'],
    argTypes: {
        addresses: {
            description: 'List of saved addresses to display',
        },
        maxVisible: {
            control: 'number',
            description: 'Max number of addresses shown before "View All" (default 3)',
        },
        value: {
            control: 'text',
            description: 'Currently selected address id (controlled)',
        },
        onValueChange: {
            description: 'Callback when selection changes',
        },
        onAddNewAddress: {
            description: 'Called when "Add New Address" is clicked; when provided, the button is shown in the list',
        },
        onEditAddress: {
            description:
                'Called with the address id when "Edit Address" is clicked; when provided, the link is shown below each address card',
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultView: Story = {
    args: {
        addresses: addresses.slice(1, 3).map((a) => ({ ...a, preferred: false })),
        onValueChange: action('onValueChange'),
    },
    parameters: {
        docs: {
            description: {
                story: 'No preferred address — the first address in the list is auto-selected as the default.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const radios = canvas.getAllByRole('radio');
        await expect(radios.length).toBe(2);

        // First address is auto-selected when none is preferred
        await expect(radios[0]).toBeChecked();
        await expect(radios[1]).not.toBeChecked();
    },
};

export const WithDefaultAddressSelected: Story = {
    args: {
        addresses: addresses.slice(0, 3),
        onValueChange: action('onValueChange'),
    },
    parameters: {
        docs: {
            description: {
                story: 'The preferred address is automatically selected by default.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const preferredRadio = canvas.getByRole('radio', { name: /jane doe/i });
        await expect(preferredRadio).toBeChecked();
    },
};

export const WithNonDefaultAddressSelected: Story = {
    args: {
        addresses: addresses.slice(0, 3),
        value: 'addr-2',
        onValueChange: action('onValueChange'),
    },
    parameters: {
        docs: {
            description: {
                story: 'Selection controlled externally via the `value` prop, overriding the default preferred address.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const selectedRadio = canvas.getByRole('radio', { name: /bob smith/i });
        await expect(selectedRadio).toBeChecked();

        const preferredRadio = canvas.getByRole('radio', { name: /jane doe/i });
        await expect(preferredRadio).not.toBeChecked();
    },
};

export const WithViewAll: Story = {
    args: {
        addresses,
        maxVisible: 3,
        onValueChange: action('onValueChange'),
    },
    parameters: {
        docs: {
            description: {
                story: 'When more addresses than `maxVisible` exist, a "View All" button appears. Only the first 3 are shown initially.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Only maxVisible addresses shown, with View All button
        const radios = canvas.getAllByRole('radio');
        await expect(radios.length).toBe(3);

        await expect(canvas.getByRole('button', { name: /view all/i })).toBeInTheDocument();
    },
};

export const WithAddNewAddress: Story = {
    args: {
        addresses: addresses.slice(0, 2),
        onValueChange: action('onValueChange'),
        onAddNewAddress: action('onAddNewAddress'),
    },
    parameters: {
        docs: {
            description: {
                story: 'When `onAddNewAddress` is provided, an "Add New Address" button appears below the list.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const addButton = canvas.getByRole('button', { name: /add new address/i });
        await expect(addButton).toBeInTheDocument();
    },
};

export const WithEditAddress: Story = {
    args: {
        addresses: addresses.slice(0, 3),
        onValueChange: action('onValueChange'),
        onEditAddress: action('onEditAddress'),
    },
    parameters: {
        docs: {
            description: {
                story: 'When `onEditAddress` is provided, an "Edit Address" link appears below each address card.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const editLinks = canvas.getAllByRole('button', { name: /edit address/i });
        await expect(editLinks.length).toBe(3);
    },
};

export const SingleAddress: Story = {
    args: {
        addresses: [addresses[0]],
        onValueChange: action('onValueChange'),
    },
    parameters: {
        docs: {
            description: {
                story: 'Only one saved address — no "View All" button is shown.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const radios = canvas.getAllByRole('radio');
        await expect(radios.length).toBe(1);

        await expect(canvas.queryByRole('button', { name: /view all/i })).toBeNull();
    },
};
