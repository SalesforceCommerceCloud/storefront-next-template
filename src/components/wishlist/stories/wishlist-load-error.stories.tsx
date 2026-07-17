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
import { WishlistLoadError } from '../wishlist-load-error';

/**
 * Stories render the component bare, reusing Storybook's preview-provided router.
 * `useRouteError` returns undefined outside an error boundary context — the visible UI
 * (the alert message and the retry link) does not depend on that, only the retryHref
 * prop does. The DEV-only error details branch is exercised by the unit test.
 */
const meta: Meta<typeof WishlistLoadError> = {
    title: 'Account/Wishlist/Wishlist Load Error',
    component: WishlistLoadError,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
In-page fallback for the wishlist route when the loader rethrows a non-auth SCAPI error.
Wired as the route's \`errorElement\`. The retry link uses \`reloadDocument\` so the browser
bypasses any in-memory cached failed loader.

**Variants:**
- Registered route uses \`retryHref="/account/wishlist"\`.
- Public guest route reuses the same component with \`retryHref="/wishlist"\`.

The DEV-only \`NormalizedApiError\` status/message details branch is covered by the unit test
(this story renders outside an error-boundary context, so \`useRouteError\` returns undefined).
                `,
            },
        },
    },
    argTypes: {
        retryHref: {
            description: 'Path the retry link points to',
            control: 'text',
        },
    },
};

export default meta;
type Story = StoryObj<typeof WishlistLoadError>;

export const RegisteredRoute: Story = {
    name: 'Registered route (/account/wishlist)',
    args: { retryHref: '/account/wishlist' },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('alert')).toBeInTheDocument();
        const retry = canvas.getByRole('link', { name: /try again/i });
        await expect(retry.getAttribute('href')).toMatch(/\/account\/wishlist$/);
    },
};

export const GuestRoute: Story = {
    name: 'Guest route (/wishlist)',
    args: { retryHref: '/wishlist' },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const retry = canvas.getByRole('link', { name: /try again/i });
        await expect(retry.getAttribute('href')).toMatch(/\/wishlist$/);
    },
};
