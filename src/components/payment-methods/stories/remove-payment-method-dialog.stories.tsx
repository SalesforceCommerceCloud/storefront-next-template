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
import { RemovePaymentMethodDialog } from '../remove-payment-method-dialog';
import type { PaymentMethod } from '../payment-method-card';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// RemovePaymentMethodDialog — confirmation modal before deleting a saved
// card. Visible variations come from:
//   - open / closed
//   - paymentMethod.isDefault (renders the AlertTriangle warning banner)
//   - paymentMethod.type (drives the icon)
//   - isLoading (disabled buttons)
// Per Pattern 11 the Playground opens via a trigger button.
// ---------------------------------------------------------------------------

type CardType = 'visa' | 'mastercard' | 'amex' | 'discover';

type SyntheticArgs = {
    cardType: CardType;
    isDefault: boolean;
    isLoading: boolean;
};

const PLAYGROUND_DEFAULTS: SyntheticArgs = {
    cardType: 'visa',
    isDefault: false,
    isLoading: false,
};

const FIXTURE_BY_TYPE: Record<CardType, PaymentMethod> = {
    visa: {
        id: 'pmc-visa',
        type: 'visa',
        last4: '4242',
        expiryMonth: '12',
        expiryYear: '2026',
        cardholderName: 'John Doe',
        isDefault: false,
    },
    mastercard: {
        id: 'pmc-mc',
        type: 'mastercard',
        last4: '5555',
        expiryMonth: '06',
        expiryYear: '2027',
        cardholderName: 'Jane Smith',
        isDefault: false,
    },
    amex: {
        id: 'pmc-amex',
        type: 'amex',
        last4: '1009',
        expiryMonth: '09',
        expiryYear: '2028',
        cardholderName: 'Sam Lee',
        isDefault: false,
    },
    discover: {
        id: 'pmc-disc',
        type: 'discover',
        last4: '6011',
        expiryMonth: '03',
        expiryYear: '2029',
        cardholderName: 'Riya Patel',
        isDefault: false,
    },
};

function buildPaymentMethod(args: SyntheticArgs): PaymentMethod {
    return { ...FIXTURE_BY_TYPE[args.cardType], isDefault: args.isDefault };
}

function PlaygroundHarness(args: Partial<SyntheticArgs>) {
    const merged: SyntheticArgs = { ...PLAYGROUND_DEFAULTS, ...args };
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button onClick={() => setOpen(true)} variant="outline">
                Remove payment method
            </Button>
            <RemovePaymentMethodDialog
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    action('onOpenChange')(next);
                }}
                paymentMethod={buildPaymentMethod(merged)}
                onConfirm={action('onConfirm')}
                isLoading={merged.isLoading}
            />
        </>
    );
}

const meta: Meta<typeof RemovePaymentMethodDialog> = {
    title: 'Account/Payment Methods/Remove Payment Method Dialog',
    component: RemovePaymentMethodDialog,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
Confirmation modal before deleting a saved card. Renders an AlertTriangle warning banner
when the card being removed is the customer's default. Returns null when paymentMethod
is null. The Playground opens via a trigger button (Pattern 11) and surfaces the
isDefault, cardType, and isLoading branches.
                `,
            },
        },
    },
    tags: ['autodocs'],
    argTypes: {
        open: { table: { disable: true } },
        onOpenChange: { table: { disable: true } },
        paymentMethod: { table: { disable: true } },
        onConfirm: { table: { disable: true } },
        isLoading: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;
type SyntheticStory = StoryObj<ComponentType<Partial<SyntheticArgs>>>;

/**
 * Closed-by-default Playground. Click the trigger to open; flip `isDefault`
 * to surface the warning banner; flip `cardType` for icon variants;
 * flip `isLoading` for the disabled-buttons state.
 */
export const Playground: SyntheticStory = {
    args: PLAYGROUND_DEFAULTS,
    argTypes: {
        cardType: {
            description: 'Card brand — drives the icon and display name.',
            control: 'radio',
            options: ['visa', 'mastercard', 'amex', 'discover'] satisfies CardType[],
            table: { category: 'Synthetic (data shape)' },
        },
        isDefault: {
            description: 'Mark the card as the default — adds the AlertTriangle warning banner.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        isLoading: {
            description: 'Disable both Cancel and Remove buttons (parent is submitting).',
            control: 'boolean',
        },
    },
    render: PlaygroundHarness,
};

/**
 * Opened on the default card — visible delta is the AlertTriangle warning
 * banner explaining the consequence of removing the default.
 */
export const WhenOpenedDefault: Story = {
    render: () => (
        <RemovePaymentMethodDialog
            open={true}
            onOpenChange={action('onOpenChange')}
            paymentMethod={buildPaymentMethod({ ...PLAYGROUND_DEFAULTS, isDefault: true })}
            onConfirm={action('onConfirm')}
        />
    ),
};
