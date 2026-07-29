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
import { allModes } from '../../../../.storybook/modes';
import { ForgotPasswordForm } from '../index';

const meta: Meta<typeof ForgotPasswordForm> = {
    title: 'Authentication/Forgot Password Form',
    component: ForgotPasswordForm,
    tags: ['autodocs', 'interaction'],
    parameters: {
        chromatic: { modes: { desktop: allModes.desktop } },
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Email-only form that triggers a password-reset email on submit. Renders a destructive error banner when `error` is supplied; always shows a "Go back to login" link.',
            },
        },
    },
    argTypes: {
        error: {
            control: 'text',
            description: 'Server-side error rendered in a destructive banner above the form.',
        },
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

        await expect(canvas.getByLabelText(/email/i)).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /reset/i })).toBeInTheDocument();
        await expect(canvas.getByRole('link', { name: /go back to login/i })).toBeInTheDocument();
    },
};

export const WithError: Story = {
    args: {
        error: 'Email address not found. Please try again.',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(/email address not found/i)).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /reset/i })).not.toBeDisabled();
    },
};
