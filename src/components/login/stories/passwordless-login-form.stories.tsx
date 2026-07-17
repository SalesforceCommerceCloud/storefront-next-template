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
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import PasswordlessLoginForm from '../passwordless-login-form';

const meta: Meta<typeof PasswordlessLoginForm> = {
    title: 'Authentication/Passwordless Login Form',
    component: PasswordlessLoginForm,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Email-only login form that triggers a magic-link / OTP flow on submit. Renders a server-side error banner when `error` is supplied; conditionally shows a "Log in with password" link when `isPasswordlessEnabled`.',
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
            description: 'When true, shows the "Log in with password" link below the submit button.',
        },
    },
    args: {
        isPasswordlessEnabled: true,
    },
    decorators: [
        (Story) => (
            <div className="w-full max-w-md p-6 bg-background border rounded-none">
                <h1 className="text-2xl font-bold text-foreground mb-1">Sign in to your account</h1>
                <p className="text-sm text-muted-foreground mb-6">Enter your email to receive a login link</p>
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
        await expect(canvas.queryByLabelText(/password/i)).toBeNull();
        await expect(canvas.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
        await expect(canvas.getByRole('link', { name: 'Log in with password' })).toBeInTheDocument();
        await expect(canvas.getByRole('link', { name: 'Forgot your password?' })).toBeInTheDocument();
    },
};

export const WithError: Story = {
    args: {
        error: 'Invalid email address. Please try again.',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Invalid email address. Please try again.')).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
    },
};

export const PasswordlessDisabled: Story = {
    args: {
        isPasswordlessEnabled: false,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.queryByRole('link', { name: 'Log in with password' })).toBeNull();
        await expect(canvas.getByRole('link', { name: 'Forgot your password?' })).toBeInTheDocument();
    },
};
