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
import { expect, fn, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

import OtpModal from '../otp-modal';

const meta: Meta<typeof OtpModal> = {
    title: 'Authentication/OTP Modal',
    component: OtpModal,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'OTP verification modal shown after a passwordless login request. Auto-advances focus between digit inputs, expands to fit a pasted code longer than the configured length (up to 8 digits), and auto-submits as soon as the visible slots are completely filled (6–8 digits, typed or pasted). Supports a resend-with-cooldown affordance plus an optional "Checkout as Guest" escape hatch.',
            },
        },
    },
    args: {
        isOpen: true,
        email: 'user@example.com',
        // Mirrors production: `_empty.login.tsx` passes `config.auth.otpLength`,
        // which defaults to 6 in `config.server.ts`. The 6/8 radio control
        // still exposes the variant.
        otpLength: 6,
        onSuccess: fn(),
        onClose: fn(),
    },
    argTypes: {
        otpLength: {
            control: { type: 'radio' },
            options: [6, 8],
            description: 'Number of digits in the verification code (6 or 8).',
        },
    },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const body = within(canvasElement.ownerDocument.body);
        const length = args.otpLength ?? 8;

        await expect(body.getByRole('dialog')).toBeInTheDocument();
        await expect(body.getByText('Enter Verification Code')).toBeInTheDocument();

        const inputs = body.getAllByRole('textbox');
        await expect(inputs).toHaveLength(length);
        for (let i = 0; i < length; i++) {
            await expect(inputs[i]).toHaveAttribute('aria-label', `Verification Code ${i + 1} of ${length}`);
        }
        await expect(inputs[0]).toHaveFocus();
    },
};

export const WithGuestCheckout: Story = {
    args: {
        onCheckoutAsGuest: fn(),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const body = within(canvasElement.ownerDocument.body);

        await expect(body.getByRole('button', { name: 'Checkout as Guest' })).toBeInTheDocument();
    },
};

export const WithResendCode: Story = {
    args: {
        onResendCode: fn(async () => {}),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const body = within(canvasElement.ownerDocument.body);

        const resend = body.getByRole('button', { name: 'Resend Code' });
        await expect(resend).toBeInTheDocument();
        await expect(resend).not.toBeDisabled();
    },
};

export const WithError: Story = {
    args: {
        initialError: 'The code you entered is invalid or has expired.',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const body = within(canvasElement.ownerDocument.body);

        await expect(body.getByText('The code you entered is invalid or has expired.')).toBeInTheDocument();
    },
};

export const AutoAdvance: Story = {
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const body = within(canvasElement.ownerDocument.body);
        const length = args.otpLength ?? 8;
        const partial = Array.from({ length: length - 1 }, (_, i) => String(i + 1)).join('');

        const inputs = body.getAllByRole('textbox');
        await expect(inputs[0]).toHaveFocus();

        for (let i = 0; i < partial.length; i++) {
            await userEvent.keyboard(partial[i]);
            await expect(inputs[i + 1]).toHaveFocus();
            await expect(inputs[i]).toHaveValue(partial[i]);
        }
    },
};
