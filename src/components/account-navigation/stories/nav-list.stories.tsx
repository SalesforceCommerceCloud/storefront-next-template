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
import { Heart, LogOut, MapPin, ShoppingBag, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { AccountNavList, type AccountNavItemData } from '../index';

const baseItems: AccountNavItemData[] = [
    { path: '/account', icon: User, label: 'Account Details' },
    { path: '/account/wishlist', icon: Heart, label: 'Wishlist' },
    { path: '/account/orders', icon: ShoppingBag, label: 'Orders' },
    { path: '/account/addresses', icon: MapPin, label: 'Addresses' },
];

const meta: Meta<typeof AccountNavList> = {
    title: 'Account/Navigation/Nav List',
    component: AccountNavList,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Sidebar list of `AccountNavItem`s used by `_app.account.tsx` for both the desktop drawer and the mobile sheet. Items rendered as `NavLink` (path), disabled `Button` (`disabled: true`), or `<Form method="post">` button (`action`).',
            },
        },
    },
    argTypes: {
        isMobile: {
            control: 'boolean',
            description: 'Switches each item to the mobile-bordered layout used in the account sheet.',
        },
        items: { table: { disable: true } },
    },
    args: {
        isMobile: false,
        items: baseItems,
    },
    // Mirror `_app.account.tsx` framing so stories show the same chrome a real
    // user sees: mobile lives inside a Card with p-4, desktop is a bare sidebar
    // column. Both wrap items in `<nav className="space-y-1">` for vertical gaps.
    decorators: [
        (Story, ctx) =>
            ctx.args.isMobile ? (
                <Card className="bg-muted/30 rounded-none shadow-none max-w-md">
                    <CardContent className="p-4">
                        <h2 className="text-sm font-semibold text-foreground mb-4">My Account</h2>
                        <nav className="space-y-1">
                            <Story />
                        </nav>
                    </CardContent>
                </Card>
            ) : (
                <div className="max-w-xs space-y-4">
                    <h2 className="text-2xl font-semibold text-foreground">My Account</h2>
                    <nav className="space-y-1">
                        <Story />
                    </nav>
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

        const links = canvas.getAllByRole('link');
        await expect(links).toHaveLength(4);
        await expect(canvas.getByRole('link', { name: 'Account Details' })).toHaveAttribute(
            'href',
            `${SITE_PREFIX}/account`
        );
        await expect(canvas.getByRole('link', { name: 'Wishlist' })).toHaveAttribute(
            'href',
            `${SITE_PREFIX}/account/wishlist`
        );
    },
};

export const MobileView: Story = {
    args: { isMobile: true },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getAllByRole('link')).toHaveLength(4);
    },
};

export const WithDisabledItem: Story = {
    args: {
        items: [
            ...baseItems.slice(0, 3),
            { path: '/account/addresses', icon: MapPin, label: 'Addresses', disabled: true },
        ],
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByRole('button', { name: 'Addresses' })).toBeDisabled();
        await expect(canvas.getAllByRole('link')).toHaveLength(3);
    },
};

// Mirrors the second `<AccountNavList items={[logoutItem]} />` call in
// `_app.account.tsx` — production always renders logout in its own dedicated
// list, never mixed with nav links. The form-submit branch is unit-covered by
// `nav-item.stories.tsx → Logout`; this story exists to show the production
// composition (single-item logout list) the route actually renders.
export const LogoutOnly: Story = {
    args: {
        items: [{ path: '', icon: LogOut, label: 'Log Out', action: '/logout', method: 'post' }],
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const logoutButton = canvas.getByRole('button', { name: 'Log Out' });
        await expect(logoutButton).toHaveAttribute('type', 'submit');
        const form = logoutButton.closest('form');
        await expect(form).toHaveAttribute('action', `${SITE_PREFIX}/logout`);
        await expect(form).toHaveAttribute('method', 'post');
        await expect(canvas.queryByRole('link')).toBeNull();
    },
};
