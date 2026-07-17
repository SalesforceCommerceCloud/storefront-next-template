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
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { PostOrderRegistration } from '../post-order-registration';

const meta: Meta<typeof PostOrderRegistration> = {
    title: 'Checkout/Registration/Post Order Registration',
    component: PostOrderRegistration,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Inline registration card shown on the order confirmation page for guest shoppers when email verification is disabled.
Allows the shopper to create an account using their order email and a new password.

## Features

- **Pre-filled email**: The order email is pre-filled and disabled — the shopper cannot change it
- **Password validation**: Real-time password strength feedback via \`PasswordRequirement\`
- **Confirm password**: Mismatch error shown when passwords differ
- **Disabled submit**: Submit button is disabled until both passwords meet requirements and match
- **Submitting state**: Button label changes to "Creating Account..." and is disabled during submission
- **Success state**: Replaces the form with a confirmation card showing a check icon and success message
- **Error state**: Shows an error banner above the form when registration fails
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
            <div className="max-w-2xl mx-auto p-6">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        email: {
            control: 'text',
            description: 'Order email address — pre-filled and disabled in the form',
        },
        firstName: {
            control: 'text',
            description: 'Customer first name — passed as a hidden field',
        },
        lastName: {
            control: 'text',
            description: 'Customer last name — passed as a hidden field',
        },
        orderNo: {
            control: 'text',
            description: 'Order number — passed as a hidden field when provided',
        },
        defaultSuccess: {
            control: 'boolean',
            description:
                'Initial success state — used in Storybook to show the confirmation view without triggering fetcher logic',
            table: { defaultValue: { summary: 'false' } },
        },
        defaultError: {
            control: 'text',
            description:
                'Initial error message — used in Storybook to show the error state without triggering fetcher logic',
        },
        defaultSubmitting: {
            control: 'boolean',
            description:
                'Initial submitting state — used in Storybook to show the creating account state without triggering fetcher logic',
            table: { defaultValue: { summary: 'false' } },
        },
        defaultPassword: {
            control: 'text',
            description: 'Initial password value — used in Storybook to pre-fill the password field',
        },
        defaultConfirmPassword: {
            control: 'text',
            description: 'Initial confirm password value — used in Storybook to pre-fill the confirm password field',
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const defaultArgs = {
    email: 'jane.doe@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    orderNo: '00012345',
};

export const Default: Story = {
    args: defaultArgs,
    parameters: {
        docs: {
            description: {
                story: 'Default state — email pre-filled and disabled, password fields empty, submit button disabled until passwords are valid.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const emailInput = canvas.getByLabelText(/email/i);
        await expect(emailInput).toHaveValue('jane.doe@example.com');
        await expect(emailInput).toBeDisabled();

        await expect(canvas.getByLabelText(/^password/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/confirm password/i)).toBeInTheDocument();

        const submitButton = canvas.getByRole('button', { name: /create account/i });
        await expect(submitButton).toBeDisabled();
    },
};

export const WithValidPasswords: Story = {
    args: defaultArgs,
    parameters: {
        docs: {
            description: {
                story: 'Both password fields filled with matching valid passwords — submit button becomes enabled.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const passwordInput = canvas.getByLabelText(/^password/i);
        const confirmInput = canvas.getByLabelText(/confirm password/i);

        await userEvent.type(passwordInput, 'StrongPass1!');
        await userEvent.type(confirmInput, 'StrongPass1!');

        const submitButton = canvas.getByRole('button', { name: /create account/i });
        await expect(submitButton).toBeEnabled();
    },
};

export const WithInvalidPassword: Story = {
    args: defaultArgs,
    parameters: {
        docs: {
            description: {
                story: 'A password that fails strength requirements is typed — the `PasswordRequirement` list shows which rules are not yet met and the submit button remains disabled.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const passwordInput = canvas.getByLabelText(/^password/i);
        await userEvent.type(passwordInput, 'weakpassword');

        // Requirements not met — submit stays disabled
        const submitButton = canvas.getByRole('button', { name: /create account/i });
        await expect(submitButton).toBeDisabled();

        // Unmet requirements are flagged
        const failedRequirements = canvas.getAllByTestId('x-icon');
        await expect(failedRequirements.length).toBeGreaterThan(0);
    },
};

export const WithPasswordMismatch: Story = {
    args: defaultArgs,
    parameters: {
        docs: {
            description: {
                story: 'Passwords are filled but do not match — a mismatch error message is shown below the confirm field.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const passwordInput = canvas.getByLabelText(/^password/i);
        const confirmInput = canvas.getByLabelText(/confirm password/i);

        await userEvent.type(passwordInput, 'StrongPass1!');
        await userEvent.type(confirmInput, 'DifferentPass1!');

        await expect(canvas.getByText(/passwords do not match/i)).toBeInTheDocument();
    },
};

export const SubmittingState: Story = {
    args: {
        ...defaultArgs,
        defaultSubmitting: true,
        defaultPassword: 'StrongPass1!',
        defaultConfirmPassword: 'StrongPass1!',
    },
    parameters: {
        docs: {
            description: {
                story: 'While the registration request is in flight — submit button shows "Creating Account..." and is disabled.',
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

        // Password fields are pre-filled
        await expect(canvas.getByLabelText(/^password/i)).toHaveValue('StrongPass1!');
        await expect(canvas.getByLabelText(/confirm password/i)).toHaveValue('StrongPass1!');

        const submitButton = canvas.getByRole('button', { name: /creating account/i });
        await expect(submitButton).toBeDisabled();
    },
};

export const WithError: Story = {
    args: { ...defaultArgs, defaultError: 'An account already exists for this email address.' },
    parameters: {
        docs: {
            description: {
                story: 'Registration failed — an error banner is shown above the form.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(/an account already exists/i)).toBeInTheDocument();

        // Form fields are still visible so the user can try again
        await expect(canvas.getByLabelText(/email/i)).toBeInTheDocument();
    },
};

export const SuccessState: Story = {
    args: { ...defaultArgs, defaultSuccess: true },
    parameters: {
        docs: {
            description: {
                story: 'Registration succeeded — the form is replaced by a confirmation card with a check icon and success message.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Form replaced by confirmation
        await expect(canvas.queryByRole('textbox')).toBeNull();

        await expect(canvas.getByText(/account created/i)).toBeInTheDocument();
        await expect(canvas.getByText(/jane\.doe@example\.com/i)).toBeInTheDocument();
    },
};
