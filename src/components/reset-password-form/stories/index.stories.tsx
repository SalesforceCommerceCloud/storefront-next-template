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
import { allModes } from '../../../../.storybook/modes';
import { ResetPasswordForm } from '../index';

const meta: Meta<typeof ResetPasswordForm> = {
    title: 'Authentication/Reset Password Form',
    component: ResetPasswordForm,
    tags: ['autodocs', 'interaction'],
    parameters: {
        chromatic: { modes: { desktop: allModes.desktop } },
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Token-driven password reset. Renders the email read-only with new + confirm password fields and a live `PasswordRequirement` checklist. The `error` prop covers both invalid-credential and expired-link server responses.',
            },
        },
    },
    argTypes: {
        error: {
            control: 'text',
            description: 'Server-side error rendered above the form (e.g. expired or invalid token).',
        },
        // Pattern 10: token is piped into a hidden form input — no visible effect.
        token: { table: { disable: true } },
        email: {
            control: 'text',
            description: 'Email associated with the reset link; rendered read-only at the top of the form.',
        },
    },
    args: {
        token: 'reset-token-12345',
        email: 'user@example.com',
    },
    decorators: [
        (Story) => (
            <div className="p-8 max-w-md">
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

        const emailInput = canvas.getByLabelText(/^email/i);
        await expect(emailInput).toBeDisabled();
        await expect(emailInput).toHaveValue('user@example.com');
        await expect(canvas.getByLabelText(/^new password/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/confirm password/i)).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
    },
};

export const ExpiredLink: Story = {
    args: {
        error: 'Invalid or expired reset token. Please request a new password reset.',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(/invalid or expired reset token/i)).toBeInTheDocument();
    },
};

export const ConfirmPasswordMismatch: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await userEvent.type(canvas.getByLabelText(/^new password/i), 'NewSecurePass123!');
        await userEvent.type(canvas.getByLabelText(/confirm password/i), 'DifferentPassword123!');

        const confirmInput = canvas.getByLabelText(/confirm password/i);
        await expect(confirmInput).toHaveAttribute('aria-invalid', 'true');
        await expect(canvas.getByText(/passwords must match/i)).toBeInTheDocument();
    },
};
