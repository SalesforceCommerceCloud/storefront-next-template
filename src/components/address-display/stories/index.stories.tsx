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
import type { ComponentType } from 'react';
import AddressDisplay from '../index';
import type { ShopperCustomers } from '@/scapi';

// ---------------------------------------------------------------------------
// AddressDisplay renders address1 + a derived location-line built from
// postalCode, city, stateCode | stateName, countryCode | countryName, plus
// (optionally) the customer's name and a "default" badge. The component does
// NOT render `address2` despite it being part of the prop type, so we don't
// expose a toggle for it. Visible variations come from:
//   - showName (toggles the name+badge row)
//   - isPreferred (adds the badge)
//   - whether each location-line field is present in the address fixture
//   - the country (US/CA hit the named-state/named-country branches; other
//     codes fall back to the raw code)
// ---------------------------------------------------------------------------

type Country = 'US' | 'CA' | 'GB';

type SyntheticArgs = {
    showName: boolean;
    isPreferred: boolean;
    country: Country;
    withPostalCode: boolean;
    withCity: boolean;
    withStateCode: boolean;
    withCountryCode: boolean;
};

const PLAYGROUND_DEFAULTS: SyntheticArgs = {
    showName: true,
    isPreferred: false,
    country: 'US',
    withPostalCode: true,
    withCity: true,
    withStateCode: true,
    withCountryCode: true,
};

function buildAddress(args: SyntheticArgs): ShopperCustomers.schemas['CustomerAddress'] {
    const byCountry: Record<Country, ShopperCustomers.schemas['CustomerAddress']> = {
        US: {
            firstName: 'Gurpreet',
            lastName: 'Saini',
            address1: '123 Main St',
            city: 'South Jordan',
            stateCode: 'UT',
            postalCode: '84095',
            countryCode: 'US',
            phone: '1233211234',
        } as ShopperCustomers.schemas['CustomerAddress'],
        CA: {
            firstName: 'Avery',
            lastName: 'Tremblay',
            address1: '500 Rue Sainte-Catherine',
            city: 'Montréal',
            stateCode: 'QC',
            postalCode: 'H3B 1B5',
            countryCode: 'CA',
        } as ShopperCustomers.schemas['CustomerAddress'],
        GB: {
            firstName: 'David',
            lastName: 'Taylor',
            address1: '10 Downing Street',
            city: 'London',
            postalCode: 'SW1A 2AA',
            countryCode: 'GB',
        } as ShopperCustomers.schemas['CustomerAddress'],
    };

    const base = { ...byCountry[args.country] } as Partial<ShopperCustomers.schemas['CustomerAddress']>;
    if (!args.withPostalCode) delete base.postalCode;
    if (!args.withCity) delete base.city;
    if (!args.withStateCode) delete base.stateCode;
    if (!args.withCountryCode) delete base.countryCode;
    return base as ShopperCustomers.schemas['CustomerAddress'];
}

function renderDisplay(args: Partial<SyntheticArgs>) {
    const merged: SyntheticArgs = { ...PLAYGROUND_DEFAULTS, ...args };
    return (
        <AddressDisplay address={buildAddress(merged)} showName={merged.showName} isPreferred={merged.isPreferred} />
    );
}

const meta: Meta<typeof AddressDisplay> = {
    title: 'Core/Data Display/Address Display',
    component: AddressDisplay,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
Formatted address renderer for OrderAddress / CustomerAddress shapes from the Commerce SDK.
Renders \`address1\` + a derived location line (postalCode, city, state, country) and
optionally the customer's name with a "default" badge.

The Playground story exposes the visible behavior of every prop through designer-friendly
toggles. Real props (\`showName\`, \`isPreferred\`) are surfaced directly; synthetic toggles
mutate the address fixture so designers can reach US/CA/international and partial-address
states without writing JSON.
                `,
            },
        },
    },
    argTypes: {
        address: { table: { disable: true } },
    },
    tags: ['autodocs', 'interaction'],
};

export default meta;
type Story = StoryObj<typeof meta>;
type SyntheticStory = StoryObj<ComponentType<Partial<SyntheticArgs>>>;

/**
 * Playground: full US address with name shown and not preferred.
 * Designers can flip toggles to reach Canadian / UK / partial / no-name /
 * preferred states.
 */
export const Playground: SyntheticStory = {
    args: PLAYGROUND_DEFAULTS,
    argTypes: {
        showName: {
            description: 'Render the name + badge row above the address lines.',
            control: 'boolean',
        },
        isPreferred: {
            description: 'Add the "default" badge next to the name.',
            control: 'boolean',
        },
        country: {
            description:
                'Switches the address fixture between US, CA, and GB. US/CA hit the named-state/country branches; GB falls back to the raw code.',
            control: 'radio',
            options: ['US', 'CA', 'GB'] satisfies Country[],
            table: { category: 'Synthetic (data shape)' },
        },
        withPostalCode: {
            description: 'Include the postal code in the address fixture.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        withCity: {
            description: 'Include the city in the address fixture.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        withStateCode: {
            description: 'Include the state/region code in the address fixture.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        withCountryCode: {
            description: 'Include the country code in the address fixture.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: renderDisplay,
};

/**
 * Empty/missing address — fallback "No address provided" message.
 */
export const NoAddress: Story = {
    render: () => <AddressDisplay address={null as unknown as ShopperCustomers.schemas['CustomerAddress']} />,
};
