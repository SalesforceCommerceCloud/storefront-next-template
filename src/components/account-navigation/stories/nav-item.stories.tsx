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
import { waitForStorybookReady, SITE_PREFIX } from '@storybook/test-utils';
import { LogOut, User } from 'lucide-react';
import { AccountNavItem } from '../index';

const meta: Meta<typeof AccountNavItem> = {
    title: 'Account/Navigation/Nav Item',
    component: AccountNavItem,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Single account-navigation entry. Renders a `NavLink` for `path` items, a disabled `Button` when `disabled: true`, or a `<Form method="post">` submit button when `action` is set.',
            },
        },
    },
    argTypes: {
        isMobile: {
            control: 'boolean',
            description: 'Mobile drawer variant uses a bordered cell instead of the desktop list row.',
        },
    },
    args: {
        isMobile: false,
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        item: { path: '/account', icon: User, label: 'Account Details' },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByRole('link', { name: 'Account Details' })).toHaveAttribute(
            'href',
            `${SITE_PREFIX}/account`
        );
    },
};

export const Disabled: Story = {
    args: {
        item: { path: '/account/addresses', icon: User, label: 'Addresses', disabled: true },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByRole('button', { name: 'Addresses' })).toBeDisabled();
        await expect(canvas.queryByRole('link')).toBeNull();
    },
};

export const Logout: Story = {
    args: {
        item: { path: '', icon: LogOut, label: 'Log Out', action: '/logout', method: 'post' },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const button = canvas.getByRole('button', { name: 'Log Out' });
        await expect(button).toHaveAttribute('type', 'submit');
        const form = button.closest('form');
        await expect(form).toHaveAttribute('action', `${SITE_PREFIX}/logout`);
        await expect(form).toHaveAttribute('method', 'post');
        await expect(canvas.queryByRole('link')).toBeNull();
    },
};
