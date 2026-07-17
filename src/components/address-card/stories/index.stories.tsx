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
import { allModes } from '../../../../.storybook/modes';
import { action } from 'storybook/actions';
import AddressCard from '../index';
import type { ShopperCustomers } from '@/scapi';

// ---------------------------------------------------------------------------
// AddressCard renders a single CustomerAddress in a card with up to three
// actions (Edit / Set default / Remove) and a loading-spinner overlay while
// a remove or set-default action is in flight. Visible variations come from:
//   - which of the three on* handlers are wired (CardFooter renders only when
//     at least one is set; each button renders only if its handler is set)
//   - isPreferred — primary border + "default" badge + disables Set default
//   - isRemoving / isSettingDefault — spinner overlay
//   - the address shape itself (US vs UK, with/without phone, address2,
//     state/region code)
// All of these fold into Controls so designers can reach every supported
// state from a single bookmarkable URL.
// ---------------------------------------------------------------------------

type Country = 'US' | 'GB';

type SyntheticArgs = {
    isPreferred: boolean;
    isRemoving: boolean;
    isSettingDefault: boolean;
    withEditAction: boolean;
    withRemoveAction: boolean;
    withSetDefaultAction: boolean;
    country: Country;
    withPhone: boolean;
    withAddress2: boolean;
    withRegionCode: boolean;
};

const PLAYGROUND_DEFAULTS: SyntheticArgs = {
    isPreferred: false,
    isRemoving: false,
    isSettingDefault: false,
    withEditAction: true,
    withRemoveAction: true,
    withSetDefaultAction: true,
    country: 'US',
    withPhone: true,
    withAddress2: true,
    withRegionCode: true,
};

function buildAddress(args: SyntheticArgs): ShopperCustomers.schemas['CustomerAddress'] {
    const isUS = args.country === 'US';
    return {
        addressId: isUS ? 'address-us-1' : 'address-gb-1',
        firstName: isUS ? 'John' : 'David',
        lastName: isUS ? 'Doe' : 'Taylor',
        address1: isUS ? '123 Main Street' : '10 Downing Street',
        ...(args.withAddress2 && isUS ? { address2: 'Apt 4B' } : {}),
        city: isUS ? 'New York' : 'London',
        ...(args.withRegionCode && isUS ? { stateCode: 'NY' } : {}),
        postalCode: isUS ? '10001' : 'SW1A 2AA',
        countryCode: isUS ? 'US' : 'GB',
        ...(args.withPhone ? { phone: isUS ? '555-123-4567' : '+44 20 1234 5678' } : {}),
        preferred: args.isPreferred,
    } as ShopperCustomers.schemas['CustomerAddress'];
}

function renderCard(args: Partial<SyntheticArgs>) {
    const merged: SyntheticArgs = { ...PLAYGROUND_DEFAULTS, ...args };
    return (
        <AddressCard
            address={buildAddress(merged)}
            isPreferred={merged.isPreferred}
            isRemoving={merged.isRemoving}
            isSettingDefault={merged.isSettingDefault}
            onEdit={merged.withEditAction ? action('onEdit') : undefined}
            onRemove={merged.withRemoveAction ? action('onRemove') : undefined}
            onSetDefault={merged.withSetDefaultAction ? action('onSetDefault') : undefined}
        />
    );
}

const meta: Meta<typeof AddressCard> = {
    title: 'Account/Addresses/Address Card',
    component: AddressCard,
    parameters: {
        layout: 'padded',
        chromatic: {
            modes: {
                mobile: allModes.mobile,
                desktop: allModes.desktop,
            },
        },
        docs: {
            description: {
                component: `
The Address Card component displays a single customer address with edit, remove, and
"set default" actions. It wraps the AddressDisplay component in a card layout and surfaces
a loading-spinner overlay while a remove or set-default action is in flight.

The Playground story exposes the visible behavior of every prop through designer-friendly
toggles. Real props (\`isPreferred\`, \`isRemoving\`, \`isSettingDefault\`) are surfaced
directly. Synthetic toggles wire up the corresponding \`on*\` handler or mutate the
\`address\` fixture so designers can reach the states the component supports without
writing JSON.
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <div className="p-8 max-w-2xl">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        // Real props that aren't part of the synthetic-driven render get hidden
        // entirely — Playground supplies them via the synthetic args below.
        address: { table: { disable: true } },
        onEdit: { table: { disable: true } },
        onRemove: { table: { disable: true } },
        onSetDefault: { table: { disable: true } },
    },
    tags: ['autodocs', 'interaction'],
};

export default meta;
type Story = StoryObj<typeof meta>;
type SyntheticStory = StoryObj<ComponentType<Partial<SyntheticArgs>>>;

/**
 * Default playground: full US address with all three actions wired and no spinner.
 * Designers can flip individual toggles to reach minimal-fields, UK address,
 * preferred, loading, or "no actions" states.
 */
export const Playground: SyntheticStory = {
    args: PLAYGROUND_DEFAULTS,
    argTypes: {
        // Real props with visible deltas — exposed directly.
        isPreferred: {
            description: 'Adds a primary border and the "default" badge.',
            control: 'boolean',
        },
        isRemoving: {
            description:
                'Shows a loading-spinner overlay while a remove action is in flight (also disables the Remove button).',
            control: 'boolean',
        },
        isSettingDefault: {
            description:
                'Shows a loading-spinner overlay while a set-default action is in flight (also disables the Set default button).',
            control: 'boolean',
        },
        // Synthetic actions — drive whether each on* handler is passed.
        withEditAction: {
            description: 'Wire up the Edit button by passing onEdit.',
            control: 'boolean',
            table: { category: 'Synthetic (actions)' },
        },
        withRemoveAction: {
            description: 'Wire up the Remove button by passing onRemove.',
            control: 'boolean',
            table: { category: 'Synthetic (actions)' },
        },
        withSetDefaultAction: {
            description: 'Wire up the Set default button by passing onSetDefault.',
            control: 'boolean',
            table: { category: 'Synthetic (actions)' },
        },
        // Synthetic data shape — drive what the address fixture looks like.
        country: {
            description:
                'Switches the address fixture between a US shape and a UK shape. UK addresses have no state/region code.',
            control: 'radio',
            options: ['US', 'GB'] satisfies Country[],
            table: { category: 'Synthetic (data shape)' },
        },
        withPhone: {
            description: 'Include a phone number on the address.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        withAddress2: {
            description: 'Include the address2 line (US-only; ignored for UK).',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        withRegionCode: {
            description: 'Include the state/region code (US-only; ignored for UK).',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: renderCard,
};

/**
 * Preferred address — primary border + "default" badge.
 * The Set default button is rendered but disabled because it's already the default.
 */
export const Preferred: Story = {
    render: () => renderCard({ isPreferred: true }),
};

/**
 * Remove action in flight — loading-spinner overlay.
 */
export const Removing: Story = {
    render: () => renderCard({ isRemoving: true }),
};

/**
 * Set-default action in flight — loading-spinner overlay.
 */
export const SettingDefault: Story = {
    render: () => renderCard({ isSettingDefault: true }),
};
