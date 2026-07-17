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
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { Button } from '@/components/ui/button';
import LoginModal from '../login-modal';

function ModalWithTrigger(args: Omit<React.ComponentProps<typeof LoginModal>, 'isOpen' | 'onOpenChange'>) {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <>
            <Button onClick={() => setIsOpen(true)}>Open Login Modal</Button>
            <LoginModal {...args} isOpen={isOpen} onOpenChange={setIsOpen} onSuccess={() => setIsOpen(false)} />
        </>
    );
}

const meta: Meta<typeof LoginModal> = {
    title: 'Authentication/Login Modal',
    component: LoginModal,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Authentication modal wrapping `StandardLoginForm` / `PasswordlessLoginForm` with optional social-login buttons. Renders an OTP verification modal over itself when the action returns `showOTPForm`. Stories render a closed-by-default trigger button so the dialog content does not clip the docs preview iframe (overlay portals to `document.body`).',
            },
        },
    },
    argTypes: {
        mode: {
            control: 'radio',
            options: ['password', 'passwordless'],
            description: 'Initial login mode shown when the modal opens.',
        },
        isPasswordlessEnabled: {
            control: 'boolean',
            description: 'Whether the toggle link between password and passwordless modes is shown.',
        },
        isSocialLoginEnabled: {
            control: 'boolean',
            description: 'Whether OAuth social-login buttons are rendered below the form.',
        },
        // Pattern 10: hide controls that don't change the canvas. `otpLength`
        // only matters AFTER passwordless email submission opens the OTP
        // modal (downstream, not reachable from this story); `returnUrl` is
        // a hidden form input the action consumes — neither has a visible effect.
        otpLength: { table: { disable: true } },
        returnUrl: { table: { disable: true } },
    },
    args: {
        mode: 'password',
        isPasswordlessEnabled: true,
        isSocialLoginEnabled: false,
        otpLength: 8,
        returnUrl: '/',
    },
    render: (args) => <ModalWithTrigger {...args} />,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const body = within(canvasElement.ownerDocument.body);

        await userEvent.click(canvas.getByRole('button', { name: 'Open Login Modal' }));

        const dialog = await body.findByRole('dialog');
        await expect(dialog).toBeInTheDocument();
        await expect(body.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    },
};

export const WithSocialLogin: Story = {
    args: {
        isSocialLoginEnabled: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const body = within(canvasElement.ownerDocument.body);

        await userEvent.click(canvas.getByRole('button', { name: 'Open Login Modal' }));

        await body.findByRole('dialog');
        // Social-login buttons are gated by `isSocialLoginEnabled` AND
        // `config.features.socialLogin.providers`. Storybook mockConfig
        // ships ['Apple', 'Google'] so both buttons should render.
        await expect(body.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
        await expect(body.getByRole('button', { name: /continue with apple/i })).toBeInTheDocument();
    },
};
