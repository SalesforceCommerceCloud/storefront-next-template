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
import Signup from '../signup';

const meta: Meta<typeof Signup> = {
    title: 'Layout/Footer/Signup',
    component: Signup,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Footer signup component for newsletter subscription. Renders an email input + Subscribe button; on submit calls `window.alert` with the entered email.',
            },
        },
    },
    decorators: [
        (Story) => (
            <div className="max-w-md">
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof Signup>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        const emailInput = canvas.getByPlaceholderText(/your email/i);
        const subscribeButton = canvas.getByRole('button', { name: /subscribe/i });
        await expect(emailInput).toBeInTheDocument();
        await expect(subscribeButton).toBeInTheDocument();

        const alertSpy = fn();
        const originalAlert = window.alert;
        window.alert = alertSpy;

        try {
            await userEvent.type(emailInput, 'shopper@example.com');
            await userEvent.click(subscribeButton);

            await expect(alertSpy).toHaveBeenCalledTimes(1);
            await expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('shopper@example.com'));
        } finally {
            window.alert = originalAlert;
        }
    },
};

/**
 * Validation path: the email field is `type="email"`, so an invalid address
 * fails native HTML5 constraint validation. Submitting blocks the form — the
 * `alert` never fires — and the input reports itself as `:invalid`.
 */
export const InvalidEmailValidation: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        const emailInput = canvas.getByPlaceholderText<HTMLInputElement>(/your email/i);
        const subscribeButton = canvas.getByRole('button', { name: /subscribe/i });

        const alertSpy = fn();
        const originalAlert = window.alert;
        window.alert = alertSpy;

        try {
            await userEvent.type(emailInput, 'not-an-email');
            await userEvent.click(subscribeButton);

            // The browser fails constraint validation on the email input...
            await expect(emailInput.validity.valid).toBe(false);
            await expect(emailInput.validity.typeMismatch).toBe(true);
            await expect(emailInput.validationMessage.length).toBeGreaterThan(0);

            // ...so submission is blocked and the signup handler never alerts.
            await expect(alertSpy).not.toHaveBeenCalled();
        } finally {
            window.alert = originalAlert;
        }
    },
};
