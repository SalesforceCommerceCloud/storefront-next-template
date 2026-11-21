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
import AgentEntryForm from '@/components/trusted-agent/entry-form';

const meta = {
    title: 'Authentication/Trusted Agent/Entry Form',
    component: AgentEntryForm,
    tags: ['autodocs', 'a11y', 'taob-entry'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Explicit registered-shopper confirmation before Account Manager authorization, with protected renewal and pending-operation states.',
            },
        },
    },
    args: {
        loginId: 'shopper@example.com',
        nonce: '11111111-1111-4111-8111-111111111111',
        action: '/login/agent',
        returnUrl: '/',
        mode: 'start',
        pending: false,
        failed: false,
        canEnd: false,
    },
    argTypes: {
        loginId: {
            control: 'text',
            description: 'Editable registered-shopper login identifier; email syntax is not required.',
        },
        mode: {
            control: 'radio',
            options: ['start', 'renew'],
            description: 'Starting allows editing; renewal displays the protected current target.',
        },
        pending: { control: 'boolean', description: 'Shows a pending attempt with only the end control.' },
        failed: { control: 'boolean', description: 'Displays a generic authorization failure.' },
        canEnd: { control: 'boolean', description: 'Shows the control for ending an existing assisted context.' },
        nonce: { table: { disable: true } },
        action: { table: { disable: true } },
        returnUrl: { table: { disable: true } },
        error: { table: { disable: true } },
    },
} satisfies Meta<typeof AgentEntryForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
    tags: ['interaction'],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const field = canvas.getByRole<HTMLInputElement>('textbox', { name: 'Act on behalf of' });
        await userEvent.clear(field);
        await userEvent.type(field, 'Registered Shopper+7');
        await expect(field).toHaveValue('Registered Shopper+7');
        await expect(field.validity.valid).toBe(true);
        await userEvent.clear(field);
        await userEvent.click(canvas.getByRole('button', { name: 'Continue' }));
        await expect(field.validity.valueMissing).toBe(true);
    },
};
export const RenewalRequired: Story = { args: { mode: 'renew', canEnd: true } };
export const PendingAuthorization: Story = { args: { pending: true, canEnd: true } };
