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
import { expect, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import StandardLoginForm from '../standard-login-form';

const meta: Meta<typeof StandardLoginForm> = {
    title: 'AUTHENTICATION/Standard Login Form',
    component: StandardLoginForm,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Email + password login form. Renders a server-side error banner when `error` is supplied; conditionally shows a "Log in without password" link when `isPasswordlessEnabled`.',
            },
        },
    },
    argTypes: {
        error: {
            control: 'text',
            description: 'Server-side authentication error rendered in a destructive banner above the form.',
        },
        isPasswordlessEnabled: {
            control: 'boolean',
            description: 'When true, shows the "Log in without password" link below the submit button.',
        },
    },
    args: {
        isPasswordlessEnabled: true,
    },
    decorators: [
        (Story) => (
            <div className="w-full max-w-md p-6 bg-background border rounded-none">
                <h1 className="text-2xl font-bold text-foreground mb-1">Sign in to your account</h1>
                <p className="text-sm text-muted-foreground mb-6">Enter your credentials to access your account</p>
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByLabelText(/email/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/password/i)).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
        await expect(canvas.getByRole('link', { name: 'Log in without password' })).toBeInTheDocument();
        await expect(canvas.getByRole('link', { name: 'Forgot your password?' })).toBeInTheDocument();
        await expect(canvas.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
    },
};

export const WithError: Story = {
    args: {
        error: 'Invalid email or password. Please try again.',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Invalid email or password. Please try again.')).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
    },
};

export const PasswordlessDisabled: Story = {
    args: {
        isPasswordlessEnabled: false,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.queryByRole('link', { name: 'Log in without password' })).toBeNull();
        await expect(canvas.getByRole('link', { name: 'Forgot your password?' })).toBeInTheDocument();
        await expect(canvas.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
    },
};

/**
 * Form-fill archetype. Types a valid email + password into the two required
 * fields and asserts the values land and the submit button is enabled — the
 * happy-path state a real shopper reaches just before submitting. Typing is
 * the safe interaction here: it drives no network, no navigation, and no
 * route action (submit itself is exercised only in the validation story below,
 * where HTML5 constraints block it).
 */
export const FilledCredentials: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const emailInput = canvas.getByLabelText<HTMLInputElement>(/email/i);
        const passwordInput = canvas.getByLabelText<HTMLInputElement>(/password/i);

        await userEvent.type(emailInput, 'shopper@example.com');
        await userEvent.type(passwordInput, 'SecurePass123!');

        await expect(emailInput).toHaveValue('shopper@example.com');
        await expect(passwordInput).toHaveValue('SecurePass123!');
        // A valid email satisfies the native constraint on the `type="email"` field.
        await expect(emailInput.validity.valid).toBe(true);
        await expect(canvas.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
    },
};

/**
 * Error-state archetype. The email field is `type="email"` + `required`, so an
 * invalid address fails native HTML5 constraint validation. Clicking submit
 * blocks the form at the browser level — the input reports itself `:invalid`
 * with a `typeMismatch`, and no route action ever runs (safe: no navigation,
 * no mutation). Mirrors the footer newsletter `InvalidEmailValidation` story.
 */
export const InvalidEmailValidation: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const emailInput = canvas.getByLabelText<HTMLInputElement>(/email/i);
        const submitButton = canvas.getByRole('button', { name: /sign in/i });

        await userEvent.type(emailInput, 'not-an-email');
        await userEvent.click(submitButton);

        // The browser fails constraint validation on the email input, so submission
        // is blocked before any route action fires.
        await expect(emailInput.validity.valid).toBe(false);
        await expect(emailInput.validity.typeMismatch).toBe(true);
        await expect(emailInput.validationMessage.length).toBeGreaterThan(0);
    },
};
