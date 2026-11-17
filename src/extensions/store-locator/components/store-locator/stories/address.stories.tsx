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
import StoreAddress from '../address';
import type { ShopperStores } from '@/scapi';

const createMockStore = (
    storeId: string,
    inventoryId: string,
    overrides: Partial<ShopperStores.schemas['Store']> = {}
): ShopperStores.schemas['Store'] => ({
    id: storeId,
    inventoryId,
    name: 'Test Store',
    address1: '123 Main St',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94102',
    countryCode: 'US',
    ...overrides,
});

const mockStore: ShopperStores.schemas['Store'] = createMockStore('store-1', 'inventory-1', {
    name: 'Downtown Store',
    address1: '123 Main Street',
    address2: 'Suite 100',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94102',
    countryCode: 'US',
});

const meta: Meta<typeof StoreAddress> = {
    title: 'Extensions/Store Locator/Store Address',
    component: StoreAddress,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The StoreAddress component renders a store address in an i18n-friendly way.

## Features

- **i18n Support**: Field order and separators come from UI strings for localization
- **Flexible Formatting**: Supports both multiline and single-line formats
- **Store Name Option**: Can include store name inline with address

## Usage

This component is used within StoreDetails to display store address information.
                `,
            },
        },
    },
    argTypes: {
        store: {
            description: 'Store object containing address information',
            control: 'object',
        },
        multiline: {
            description: 'Whether to show each address line on separate lines',
            control: 'boolean',
        },
        includeStoreName: {
            description: 'Include store name inline with first address line',
            control: 'boolean',
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        store: mockStore,
        multiline: true,
        includeStoreName: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Default store address display showing:
- Multiline format with each address line on separate lines
- Full address information
- No store name included

This is the default multiline format.
                `,
            },
        },
    },
};

export const SingleLine: Story = {
    args: {
        store: mockStore,
        multiline: false,
        includeStoreName: false,
    },
    parameters: {
        docs: {
            description: {
                story: `
Store address in single-line format. Shows:
- All address information on one line
- Compact display

This format is useful for constrained spaces.
                `,
            },
        },
    },
};

export const WithStoreName: Story = {
    args: {
        store: mockStore,
        multiline: true,
        includeStoreName: true,
    },
    parameters: {
        docs: {
            description: {
                story: `
Store address with store name included inline. Shows:
- Store name followed by address
- Format: "Store Name - Address Line 1"
- Useful for compact displays

This format is commonly used in checkout/BOPIS flows.
                `,
            },
        },
    },
};
