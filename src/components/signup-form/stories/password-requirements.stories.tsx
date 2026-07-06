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
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { PasswordRequirement } from '@/components/password-requirements';

const meta: Meta<typeof PasswordRequirement> = {
    title: 'AUTHENTICATION/Password Requirements',
    component: PasswordRequirement,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Real-time password rule checklist. Each of the 5 rules (length 8+, uppercase, lowercase, digit, special char) renders with a check or X based on the live `password` value.',
            },
        },
    },
    argTypes: {
        password: {
            control: 'text',
            description: 'The password string evaluated against the 5 built-in rules.',
        },
    },
    args: {
        password: '',
    },
    decorators: [
        (Story) => (
            <div className="w-full max-w-md p-6 bg-background border rounded-none">
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
    args: { password: '' },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getAllByTestId('x-icon')).toHaveLength(5);
        await expect(canvas.queryByTestId('check-icon')).toBeNull();
    },
};

export const Partial: Story = {
    args: { password: 'lower1' },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // lowercase + number → 2 met, length / uppercase / special → 3 unmet
        await expect(canvas.getAllByTestId('check-icon')).toHaveLength(2);
        await expect(canvas.getAllByTestId('x-icon')).toHaveLength(3);
    },
};

export const AllMet: Story = {
    args: { password: 'SecurePass123!' },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getAllByTestId('check-icon')).toHaveLength(5);
        await expect(canvas.queryByTestId('x-icon')).toBeNull();
    },
};

/**
 * Live-validation archetype. The component is prop-driven, so a small
 * controlled harness feeds the typed value straight into `password` —
 * mirroring the real callsite (`useWatch` → `<PasswordRequirement />`).
 * Typing is the safe interaction: each rule's check/X flips as a pure
 * function of the current value, with no network, navigation, or submit.
 * Starts empty (5 X-icons) and types a fully-valid password one character
 * at a time; by the end every rule is satisfied (5 check-icons, 0 X-icons).
 */
export const LiveTypingValidation: Story = {
    render: () => {
        const ControlledRequirements = () => {
            const [password, setPassword] = useState('');
            return (
                <div className="space-y-4">
                    <input
                        type="text"
                        aria-label="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full border px-3 py-2 rounded-none"
                    />
                    <PasswordRequirement password={password} />
                </div>
            );
        };
        return <ControlledRequirements />;
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // At rest the field is empty → every rule unmet.
        await expect(canvas.getAllByTestId('x-icon')).toHaveLength(5);
        await expect(canvas.queryByTestId('check-icon')).toBeNull();

        // Type a password that satisfies all 5 rules; each keystroke re-validates.
        const input = canvas.getByRole('textbox', { name: /password/i });
        await userEvent.type(input, 'SecurePass123!');

        // Once fully typed, every rule is met.
        await expect(canvas.getAllByTestId('check-icon')).toHaveLength(5);
        await expect(canvas.queryByTestId('x-icon')).toBeNull();
    },
};
