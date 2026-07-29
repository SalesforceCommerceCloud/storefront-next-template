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
import { useState, type ComponentType } from 'react';
import { RemoveAddressConfirmationDialog } from '../index';
import { Button } from '@/components/ui/button';
import { action } from 'storybook/actions';
import type { ShopperCustomers } from '@/scapi';

// ---------------------------------------------------------------------------
// RemoveAddressConfirmationDialog wraps a Dialog around an address card with
// a destructive "Remove" CTA. The dialog encapsulates its own SCAPI fetcher,
// so the only externally-visible toggles are `open` and the address shape
// (specifically `preferred`, which drives the "removing your default
// address" warning banner). Per Pattern 11 the Playground is
// closed-by-default with a trigger button so designers see the realistic
// trigger surface, not an always-open dialog at story load.
// ---------------------------------------------------------------------------

const SAMPLE_ADDRESS: ShopperCustomers.schemas['CustomerAddress'] = {
    addressId: 'home-address',
    firstName: 'John',
    lastName: 'Doe',
    address1: '123 Main Street',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94105',
    countryCode: 'US',
    preferred: false,
};

type SyntheticArgs = {
    preferred: boolean;
};

const PLAYGROUND_DEFAULTS: SyntheticArgs = { preferred: false };

function PlaygroundHarness(args: Partial<SyntheticArgs>) {
    const merged: SyntheticArgs = { ...PLAYGROUND_DEFAULTS, ...args };
    const [open, setOpen] = useState(false);
    const address: ShopperCustomers.schemas['CustomerAddress'] = {
        ...SAMPLE_ADDRESS,
        preferred: merged.preferred,
    };
    return (
        <>
            <Button onClick={() => setOpen(true)} variant="outline">
                Remove address
            </Button>
            <RemoveAddressConfirmationDialog
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    action('onOpenChange')(next);
                }}
                address={address}
                customerId="customer-123"
                onSuccess={action('onSuccess')}
            />
        </>
    );
}

const meta: Meta<typeof RemoveAddressConfirmationDialog> = {
    title: 'Account/Addresses/Remove Address Confirmation Dialog',
    component: RemoveAddressConfirmationDialog,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
Confirmation dialog for removing customer addresses with an integrated SCAPI fetcher.
The dialog encapsulates its own remove-fetcher, so external toggles are limited to
\`open\` and the address shape. Toggling \`preferred\` on surfaces the "default address"
warning banner. The submitting state isn't surfaceable from a static story because
the fetcher state is internal — clicking Remove fires a real SCAPI call.
                `,
            },
        },
    },
    tags: ['autodocs', 'interaction'],
    argTypes: {
        open: { table: { disable: true } },
        onOpenChange: { table: { disable: true } },
        address: { table: { disable: true } },
        customerId: { table: { disable: true } },
        onSuccess: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;
type SyntheticStory = StoryObj<ComponentType<Partial<SyntheticArgs>>>;

/**
 * Closed-by-default Playground with a trigger button. Click "Remove address"
 * to open the dialog; flip `preferred` on to surface the warning banner.
 */
export const Playground: SyntheticStory = {
    args: PLAYGROUND_DEFAULTS,
    argTypes: {
        preferred: {
            description:
                'Mark the address as the customer\'s default. When on, the dialog renders the "removing your default address" warning banner.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: PlaygroundHarness,
};

/**
 * Dialog opened on a preferred (default) address — visible delta is the
 * AlertTriangle warning banner explaining the consequence of removing the
 * customer's default.
 *
 * Snapshot opted out: Radix Dialog portals to `document.body`, so the
 * composeStories snapshot harness (which captures `container.firstChild`)
 * would record `null`. The visual is verified interactively in Storybook
 * and by the interaction test runner.
 */
export const WhenOpenedPreferred: Story = {
    parameters: { snapshot: false },
    render: () => (
        <RemoveAddressConfirmationDialog
            open={true}
            onOpenChange={action('onOpenChange')}
            address={{ ...SAMPLE_ADDRESS, preferred: true }}
            customerId="customer-123"
            onSuccess={action('onSuccess')}
        />
    ),
};
