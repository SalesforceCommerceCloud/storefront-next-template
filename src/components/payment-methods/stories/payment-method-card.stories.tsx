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

import type { ComponentType } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { action } from 'storybook/actions';
import { PaymentMethodCard, type PaymentMethod } from '../payment-method-card';

// ---------------------------------------------------------------------------
// PaymentMethodCard renders a single saved card with Set default / Remove
// actions. Visible variations come from:
//   - the card type (Visa / Mastercard / Amex / Discover — drives icon and
//     display name via lib/payment helpers)
//   - isDefault (primary border + "default" badge + disables Set default)
// ---------------------------------------------------------------------------

type CardType = 'visa' | 'mastercard' | 'amex' | 'discover';

type SyntheticArgs = {
    cardType: CardType;
    isDefault: boolean;
};

const PLAYGROUND_DEFAULTS: SyntheticArgs = {
    cardType: 'visa',
    isDefault: false,
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

function renderCard(args: Partial<SyntheticArgs>) {
    const merged: SyntheticArgs = { ...PLAYGROUND_DEFAULTS, ...args };
    return (
        <PaymentMethodCard
            paymentMethod={{ ...FIXTURE_BY_TYPE[merged.cardType], isDefault: merged.isDefault }}
            onRemove={action('onRemove')}
            onSetDefault={action('onSetDefault')}
        />
    );
}

const meta: Meta<typeof PaymentMethodCard> = {
    title: 'Account/Payment Methods/Payment Method Card',
    component: PaymentMethodCard,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Card displaying a single saved payment method with "Set default" and "Remove" actions.
The Playground story flips between card types (Visa / Mastercard / Amex / Discover —
each renders a different brand icon) and toggles the isDefault flag (primary border,
"default" badge, disabled "Set default" button).
                `,
            },
        },
    },
    tags: ['autodocs'],
    argTypes: {
        paymentMethod: { table: { disable: true } },
        onRemove: { table: { disable: true } },
        onSetDefault: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;
type SyntheticStory = StoryObj<ComponentType<Partial<SyntheticArgs>>>;

/**
 * Playground: Visa, not default. Flip `cardType` to switch the brand icon
 * and display name; flip `isDefault` to surface the primary border + badge.
 */
export const Playground: SyntheticStory = {
    args: PLAYGROUND_DEFAULTS,
    argTypes: {
        cardType: {
            description: 'Card brand — drives the icon and display name via lib/payment helpers.',
            control: 'radio',
            options: ['visa', 'mastercard', 'amex', 'discover'] satisfies CardType[],
            table: { category: 'Synthetic (data shape)' },
        },
        isDefault: {
            description:
                'Mark this card as the customer\'s default — adds the primary border, the "default" badge, and disables the Set default button.',
            control: 'boolean',
        },
    },
    render: renderCard,
};

/**
 * Default card — primary border, "default" badge, disabled "Set default" button.
 */
export const Default: Story = {
    render: () => renderCard({ isDefault: true }),
};
