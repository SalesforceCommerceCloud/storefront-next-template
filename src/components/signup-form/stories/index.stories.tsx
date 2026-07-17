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
import SignupForm from '../index';

const meta: Meta<typeof SignupForm> = {
    title: 'Authentication/Signup Form',
    component: SignupForm,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'New-account form. Renders a destructive error banner when `error` is supplied. With `isPasswordless`, password fields are collapsed behind a "Create account with password" toggle and the form submits as passwordless by default.',
            },
        },
    },
    argTypes: {
        error: {
            control: 'text',
            description: 'Server-side registration error rendered above the form.',
        },
        isPasswordless: {
            control: 'boolean',
            description: 'When true, password fields are hidden behind a toggle so the form can submit passwordless.',
        },
    },
    args: {
        isPasswordless: false,
    },
    decorators: [
        (Story) => (
            <div className="p-8 max-w-md">
                <form>
                    <Story />
                </form>
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

        await expect(canvas.getByLabelText(/first name/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/last name/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/^email/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/^password/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/confirm password/i)).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    },
};

export const WithError: Story = {
    args: {
        error: 'Email address is already registered. Please use a different email or try logging in.',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(/email address is already registered/i)).toBeInTheDocument();
    },
};

export const PasswordlessMode: Story = {
    args: {
        isPasswordless: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.queryByLabelText(/^password/i)).toBeNull();
        await expect(canvas.queryByLabelText(/confirm password/i)).toBeNull();
        await expect(canvas.getByRole('button', { name: /continue/i })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /create account with password/i })).toBeInTheDocument();
    },
};

export const ConfirmPasswordMismatch: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await userEvent.type(canvas.getByLabelText(/^password/i), 'SecurePass123!');
        await userEvent.type(canvas.getByLabelText(/confirm password/i), 'DifferentPass456!');

        const confirmInput = canvas.getByLabelText(/confirm password/i);
        await expect(confirmInput).toHaveAttribute('aria-invalid', 'true');
        await expect(canvas.getByText(/passwords don't match/i)).toBeInTheDocument();
    },
};
