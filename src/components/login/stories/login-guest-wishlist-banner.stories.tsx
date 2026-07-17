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
import { LoginGuestWishlistBanner } from '../login-guest-wishlist-banner';

const meta: Meta<typeof LoginGuestWishlistBanner> = {
    title: 'Authentication/Login Guest Wishlist Banner',
    component: LoginGuestWishlistBanner,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Sign-in nudge rendered above the login form when a guest has saved wishlist items. Reuses the Alert primitive and the existing `account:wishlist.guestEmptySignInPrompt` string. Renders nothing when count is 0.',
            },
        },
    },
    argTypes: {
        count: {
            description: 'Number of items in the guest wishlist',
            control: { type: 'number', min: 0 },
        },
    },
};

export default meta;
type Story = StoryObj<typeof LoginGuestWishlistBanner>;

export const Empty: Story = {
    name: 'Empty (count = 0, banner hidden)',
    args: { count: 0 },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.queryByRole('alert')).toBeNull();
    },
};

export const Visible: Story = {
    name: 'Visible (count > 0)',
    args: { count: 3 },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('alert')).toBeInTheDocument();
        await expect(canvas.getByText('Sign in to see saved items from your account.')).toBeInTheDocument();
    },
};
