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
import RegisterCustomerSelection from '../register-customer-selection';
import { action } from 'storybook/actions';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

const meta: Meta<typeof RegisterCustomerSelection> = {
    title: 'Checkout/Registration/Register Customer Selection',
    component: RegisterCustomerSelection,
    tags: ['autodocs', 'interaction'],
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'padded',
        docs: {
            description: {
                component: `
A component that allows customers to opt-in to creating an account during checkout for faster future checkouts.

## Features

- **Checkbox Selection**: Toggle to create account or continue as guest
- **OTP Verification**: On opt-in, submits the customer's email and opens an OTP modal to verify identity
- **Sending State**: While the verification code is being sent, shows a status message and disables the checkbox
- **Account Created State**: After successful OTP verification, replaces the checkbox with a confirmation banner and "Verified" badge
- **Turnstile Support**: Optionally gated by Cloudflare Turnstile when enabled in config
                `,
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
    decorators: [
        (Story) => (
            <div className="w-full max-w-2xl mx-auto p-6">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        onSaved: {
            description:
                'Called with `true` after successful OTP verification, or `false` when the customer unchecks the checkbox or closes the OTP modal.',
            table: {
                type: { summary: '(shouldCreateAccount: boolean) => void | undefined' },
            },
        },
        onRegistrationSuccess: {
            description: 'Called after OTP verification succeeds — use to trigger post-registration side effects',
            table: {
                type: { summary: '() => void | undefined' },
            },
        },
        savePaymentToProfile: {
            control: 'boolean',
            description:
                'Whether the customer opted to save their payment method — passed through to registration logic',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        showToast: {
            description:
                'Optional toast callback — pass to display success/error notifications without bundling a toast library in this component',
            table: {
                type: {
                    summary:
                        '(message: string, type: "success" | "error", options?: { duration?: number }) => void | undefined',
                },
            },
        },
        defaultChecked: {
            control: 'boolean',
            description:
                'Initial checked state — used in Storybook to show the expanded description without triggering fetcher logic',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        defaultAccountCreated: {
            control: 'boolean',
            description:
                'Initial account created state — used in Storybook to show the confirmation banner without triggering OTP logic',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        defaultSubmitting: {
            control: 'boolean',
            description: 'Initial submitting state — used in Storybook to show the sending verification code state',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof RegisterCustomerSelection>;

export const Default: Story = {
    args: {},
    parameters: {
        docs: {
            description: {
                story: 'Default state — checkbox is unchecked, customer will continue as guest.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const checkbox = await canvas.findByRole('checkbox', {}, { timeout: 5000 });
        await expect(checkbox).toBeInTheDocument();
        await expect(checkbox).not.toBeChecked();

        const label = await canvas.findByText(/save for future use/i, {}, { timeout: 5000 });
        await expect(label).toBeInTheDocument();

        const description = await canvas.findByText(/create an account for a faster checkout/i, {}, { timeout: 5000 });
        await expect(description).toBeInTheDocument();
    },
};

export const Checked: Story = {
    args: { onSaved: action('account-creation-selected'), defaultChecked: true },
    parameters: {
        docs: {
            description: {
                story: 'Checked state — checkbox is selected and the expanded description is visible.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const checkbox = await canvas.findByRole('checkbox', {}, { timeout: 5000 });
        await expect(checkbox).toBeInTheDocument();
        await expect(checkbox).toBeChecked();

        // Expanded description is visible when checked
        await expect(canvas.getByText(/when you place your order, we create an account/i)).toBeInTheDocument();
    },
};

export const SendingVerificationCode: Story = {
    args: { defaultSubmitting: true },
    parameters: {
        docs: {
            description: {
                story: 'Checkbox is checked and the verification code is being sent — shows "Sending verification code..." text and the checkbox is disabled.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const checkbox = await canvas.findByRole('checkbox', {}, { timeout: 5000 });
        await expect(checkbox).toBeChecked();
        await expect(checkbox).toBeDisabled();

        await expect(canvas.getByText(/sending verification code/i)).toBeInTheDocument();
    },
};

export const AccountCreated: Story = {
    args: { defaultAccountCreated: true },
    parameters: {
        docs: {
            description: {
                story: 'Account successfully created after OTP verification — the checkbox is replaced by a confirmation banner with a "Verified" badge.',
            },
        },
        a11y: {
            config: {
                rules: [{ id: 'color-contrast', enabled: false }],
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // No checkbox — replaced by confirmation banner
        await expect(canvas.queryByRole('checkbox')).toBeNull();

        await expect(canvas.getByText('Verified')).toBeInTheDocument();
    },
};
