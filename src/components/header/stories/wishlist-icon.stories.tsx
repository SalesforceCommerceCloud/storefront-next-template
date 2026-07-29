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
import WishlistIcon from '../wishlist-icon';
import { action } from 'storybook/actions';
import { useEffect, useRef, type ReactNode, type ReactElement } from 'react';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady, SITE_PREFIX } from '@storybook/test-utils';
import AuthProvider from '@/providers/auth';
import type { SessionData } from '@/lib/api/types';

function WishlistIconStoryHarness({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logNavigate = action('wishlist-icon-navigate');

        const handleClick = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;

            const link = target.closest('a[href]');
            if (link) {
                const href = link.getAttribute('href') || '';
                const label = link.getAttribute('aria-label') || link.textContent?.trim() || '';
                event.preventDefault();
                logNavigate({ href, label });
            }
        };

        root.addEventListener('click', handleClick, true);

        return () => {
            root.removeEventListener('click', handleClick, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const guestSession: SessionData = {
    userType: 'guest',
};

const registeredSession: SessionData = {
    userType: 'registered',
    customerId: 'test-customer-1',
};

const meta: Meta<typeof WishlistIcon> = {
    title: 'Layout/Header/Wishlist Icon',
    component: WishlistIcon,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
Wishlist heart icon that lives in the header utility row. Routes to the public guest wishlist page or the account wishlist page depending on auth state.

### Features:
- Heart icon (Lucide)
- Guest shoppers land on /wishlist
- Registered shoppers land on /account/wishlist
- Localized aria-label
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <WishlistIconStoryHarness>
                <div className="p-8">
                    <Story />
                </div>
            </WishlistIconStoryHarness>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof WishlistIcon>;

export const Guest: Story = {
    render: () => (
        <AuthProvider value={guestSession}>
            <WishlistIcon />
        </AuthProvider>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Wishlist icon for a guest shopper. Click navigates to the public guest wishlist page.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const link = await canvas.findByRole('link', { name: /wishlist/i }, { timeout: 5000 });
        await expect(link).toBeInTheDocument();
        await expect(link).toHaveAttribute('href', `${SITE_PREFIX}/wishlist`);

        await userEvent.click(link);
    },
};

export const Registered: Story = {
    render: () => (
        <AuthProvider value={registeredSession}>
            <WishlistIcon />
        </AuthProvider>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Wishlist icon for a signed-in shopper. Click navigates to the account wishlist page.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const link = await canvas.findByRole('link', { name: /wishlist/i }, { timeout: 5000 });
        await expect(link).toBeInTheDocument();
        await expect(link).toHaveAttribute('href', `${SITE_PREFIX}/account/wishlist`);

        await userEvent.click(link);
    },
};
