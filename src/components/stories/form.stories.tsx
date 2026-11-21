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
import { Form } from '../form';
import { AuthContext } from '@/providers/auth';
import { AUTH_CONTEXT_QUERY } from '@/lib/auth/context-binding';

const meta: Meta<typeof Form> = {
    title: 'Core/Actions/Form',
    component: Form,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Drop-in replacement for the React Router `Form` that stamps the current auth context version onto mutating submissions, so the server can reject a submit made under a stale shopper or agent context.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
};

export default meta;
type Story = StoryObj<typeof Form>;

export const MutationWithoutAuthContext: Story = {
    render: () => (
        <Form method="post" action="/update-settings" aria-label="settings">
            <button type="submit">Save</button>
        </Form>
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const form = within(canvasElement).getByRole('form', { name: 'settings' });
        await expect(form).toHaveAttribute('action', '/update-settings');
    },
};

export const MutationBoundToAuthContext: Story = {
    render: () => (
        <AuthContext.Provider value={{ authContextVersion: 'v1' } as never}>
            <Form method="post" action="/update-settings" aria-label="settings">
                <button type="submit">Save</button>
            </Form>
        </AuthContext.Provider>
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const form = within(canvasElement).getByRole('form', { name: 'settings' });
        await expect(form.getAttribute('action')).toContain(`${AUTH_CONTEXT_QUERY}=v1`);
    },
};

export const GetFormIsNeverBound: Story = {
    render: () => (
        <AuthContext.Provider value={{ authContextVersion: 'v1' } as never}>
            <Form method="get" action="/search" aria-label="search">
                <button type="submit">Search</button>
            </Form>
        </AuthContext.Provider>
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const form = within(canvasElement).getByRole('form', { name: 'search' });
        await expect(form).toHaveAttribute('action', '/search');
    },
};
