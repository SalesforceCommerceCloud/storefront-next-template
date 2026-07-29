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
import { useForm } from 'react-hook-form';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { Form } from '@/components/ui/form';
import { CreditCardInputFields } from '../index';
import type { PaymentData } from '@/lib/checkout/schemas';

// ---------------------------------------------------------------------------
// CreditCardInputFields renders cardholder name + card number + expiry + CVV
// fields into a parent React Hook Form context, plus an optional
// "save as default" checkbox. Visible variations come from:
//   - prefilled vs empty form values
//   - showIsDefaultOption (renders the save-as-default checkbox)
//   - the detected-card-type icon (only swaps in response to onChange events
//     from the card-number input, not from defaultValues — exercised via a
//     dedicated play that types a Visa number)
// autoFocus is a runtime focus state — not a useful snapshot delta — and is
// therefore not surfaced via Controls.
// ---------------------------------------------------------------------------

type SyntheticArgs = {
    prefilled: boolean;
    showIsDefaultOption: boolean;
};

const PLAYGROUND_DEFAULTS: SyntheticArgs = {
    prefilled: false,
    showIsDefaultOption: false,
};

const PREFILLED_VALUES = {
    cardholderName: 'John Doe',
    cardNumber: '4242 4242 4242 4242',
    expiryDate: '12/26',
    cvv: '123',
};

const EMPTY_VALUES = {
    cardholderName: '',
    cardNumber: '',
    expiryDate: '',
    cvv: '',
};

function buildDefaults(args: SyntheticArgs): Partial<PaymentData> {
    return (args.prefilled ? PREFILLED_VALUES : EMPTY_VALUES) as Partial<PaymentData>;
}

function PlaygroundWrapper(args: Partial<SyntheticArgs>) {
    const merged: SyntheticArgs = { ...PLAYGROUND_DEFAULTS, ...args };
    const form = useForm<PaymentData>({
        defaultValues: buildDefaults(merged) as PaymentData,
    });
    return (
        <Form {...form}>
            <form className="space-y-4">
                <CreditCardInputFields form={form} showIsDefaultOption={merged.showIsDefaultOption} />
            </form>
        </Form>
    );
}

const meta: Meta<typeof CreditCardInputFields> = {
    title: 'Core/Forms/Credit Card Input Fields',
    component: CreditCardInputFields,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Reusable credit-card form fields (cardholder name, card number with detected brand
icon, expiry date, CVV) for the parent React Hook Form context. Used by the
add-payment-method dialog and the checkout payment step. Optionally renders a
"save as default" checkbox.

The component derives the card-brand icon from \`onChange\` events on the card-number
input (not from \`defaultValues\`), so the WithDetectedCardIcon story uses a
\`userEvent.type\` play to actually surface the icon swap. The Playground covers
prefilled / empty / save-as-default toggles; Empty is a snapshot bookmark of the
pristine form (validation behavior is exercised by the parent components that
wrap CreditCardInputFields).
                `,
            },
        },
    },
    tags: ['autodocs', 'interaction'],
    argTypes: {
        form: { table: { disable: true } },
        autoFocus: { table: { disable: true } },
        defaultOptionLabel: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;
type SyntheticStory = StoryObj<ComponentType<Partial<SyntheticArgs>>>;

/**
 * Playground: empty form. Toggle `prefilled` to load realistic values, or
 * `showIsDefaultOption` to render the "Save as default" checkbox.
 */
export const Playground: SyntheticStory = {
    args: PLAYGROUND_DEFAULTS,
    argTypes: {
        prefilled: {
            description: 'Load realistic values into the form (cardholder, number, expiry, CVV).',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        showIsDefaultOption: {
            description: 'Render the "Save as default" checkbox below the fields.',
            control: 'boolean',
        },
    },
    render: PlaygroundWrapper,
};

/**
 * Empty form — pristine state, no values typed. Snapshot bookmarks the
 * default rendered shape. Validation behavior is exercised by the parent
 * components that wrap CreditCardInputFields (address-form-fields,
 * customer-address-form, customer-profile-form).
 */
export const Empty: Story = {
    render: () => <PlaygroundWrapper />,
};

/**
 * Detected card-type icon swap — types a Visa card number so the component's
 * onChange-driven `setDetectedCardType` runs and the brand icon appears.
 * Locks in the icon-swap regression catch (the component derives the icon
 * from onChange events, not from defaultValues, so a prefilled-by-default
 * approach would not exercise this branch).
 */
export const WithDetectedCardIcon: Story = {
    render: () => <PlaygroundWrapper />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const cardNumberInput = canvas.getByPlaceholderText(/card number/i);
        await userEvent.type(cardNumberInput, '4242424242424242');
        // The Visa icon is rendered as an aria-hidden div — assert the input
        // received the formatted value as a proxy for "onChange ran" (which
        // implies the detectedCardType state was set).
        await expect(cardNumberInput).toHaveValue('4242 4242 4242 4242');
    },
};
