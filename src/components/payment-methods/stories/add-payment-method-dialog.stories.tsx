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

import { useState, type ComponentType } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { action } from 'storybook/actions';
import type { ShopperCustomers } from '@/scapi';
import { AddPaymentMethodDialog } from '../add-payment-method-dialog';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// AddPaymentMethodDialog — modal for entering a new credit card and either
// reusing a saved billing address or filling in a new one. Visible variations
// come from:
//   - open / closed
//   - whether `addresses` is non-empty (controls the "Use saved address"
//     dropdown branch)
//   - isLoading (spinner + disabled CTAs)
// Per Pattern 11 the Playground opens via a trigger button so designers see
// the realistic mounted-on-demand surface.
// ---------------------------------------------------------------------------

const SAMPLE_ADDRESSES: ShopperCustomers.schemas['CustomerAddress'][] = [
    {
        addressId: 'address-1',
        firstName: 'John',
        lastName: 'Doe',
        address1: '123 Main Street',
        city: 'New York',
        stateCode: 'NY',
        postalCode: '10001',
        countryCode: 'US',
    },
    {
        addressId: 'address-2',
        firstName: 'Jane',
        lastName: 'Smith',
        address1: '456 Oak Avenue',
        city: 'Seattle',
        stateCode: 'WA',
        postalCode: '98101',
        countryCode: 'US',
    },
];

type AddressCount = 0 | 1 | 2;

type SyntheticArgs = {
    addressCount: AddressCount;
    loading: boolean;
};

const PLAYGROUND_DEFAULTS: SyntheticArgs = {
    addressCount: 2,
    loading: false,
};

function PlaygroundHarness(args: Partial<SyntheticArgs>) {
    const merged: SyntheticArgs = { ...PLAYGROUND_DEFAULTS, ...args };
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button onClick={() => setOpen(true)} variant="outline">
                Add payment method
            </Button>
            <AddPaymentMethodDialog
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    action('onOpenChange')(next);
                }}
                onSubmitForm={action('onSubmitForm')}
                addresses={SAMPLE_ADDRESSES.slice(0, merged.addressCount)}
                isLoading={merged.loading}
            />
        </>
    );
}

const meta: Meta<typeof AddPaymentMethodDialog> = {
    title: 'Account/Payment Methods/Add Payment Method Dialog',
    component: AddPaymentMethodDialog,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
Modal for adding a credit card. Provides a "Use saved address" dropdown when the customer
has saved addresses, otherwise renders the billing-address form fields directly. Submits
card data via FormData to a route action; the parent component decides what to do with it.
                `,
            },
        },
    },
    tags: ['autodocs'],
    argTypes: {
        open: { table: { disable: true } },
        onOpenChange: { table: { disable: true } },
        onSubmitForm: { table: { disable: true } },
        addresses: { table: { disable: true } },
        isLoading: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;
type SyntheticStory = StoryObj<ComponentType<Partial<SyntheticArgs>>>;

/**
 * Closed-by-default Playground with a trigger button. Open the dialog and
 * adjust `addressCount` to flip between the saved-address-dropdown branch
 * (≥1) and the no-saved-addresses branch (0). Toggle `loading` to see the
 * submitting state.
 */
export const Playground: SyntheticStory = {
    args: PLAYGROUND_DEFAULTS,
    argTypes: {
        addressCount: {
            description:
                'Number of saved addresses on the customer. 0 hides the "Use saved address" dropdown and shows the billing-address form by default.',
            control: 'select',
            options: [0, 1, 2],
            table: { category: 'Synthetic (data shape)' },
        },
        loading: {
            description: 'Surface the isLoading state — disabled CTAs while the parent submits.',
            control: 'boolean',
        },
    },
    render: PlaygroundHarness,
};

/**
 * Opened with no saved addresses — the "Use saved address" dropdown is hidden
 * and the billing-address form is exposed directly.
 */
export const WhenOpenedNoAddresses: Story = {
    render: () => (
        <AddPaymentMethodDialog
            open={true}
            onOpenChange={action('onOpenChange')}
            onSubmitForm={action('onSubmitForm')}
            addresses={[]}
        />
    ),
};
