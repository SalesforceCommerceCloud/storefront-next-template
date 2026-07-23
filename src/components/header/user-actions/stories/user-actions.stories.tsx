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
import UserActions from '../user-actions';
import { action } from 'storybook/actions';
import { useEffect, useRef, type ReactNode, type ReactElement } from 'react';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady, SITE_PREFIX } from '@storybook/test-utils';
import AuthProvider from '@/providers/auth';
import { getUserTypeCookieName } from '@/lib/auth/user-type-hint';
import { mockSiteObject } from '@/test-utils/config';
import type { SessionData } from '@/lib/api/types';

// AuthProvider resolves the hint cookie from the siteId prop it is given (see below), so the cookie we
// seed must be namespaced for that same site — the first configured mock site the SiteProvider uses.
const HINT_SITE_ID = mockSiteObject.id;
const USERTYPE_HINT_COOKIE = getUserTypeCookieName(HINT_SITE_ID);

const setUserTypeHintCookie = (value: string) => {
    // The middleware writes the hint as base64(JSON) (read back via the shared `parseCookie`), so the
    // seeded cookie must use the same on-the-wire encoding as a real request.
    document.cookie = `${USERTYPE_HINT_COOKIE}=${btoa(JSON.stringify(value))}; path=/`;
};
const clearUserTypeHintCookie = () => {
    document.cookie = `${USERTYPE_HINT_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
};

function UserActionsStoryHarness({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logNavigate = action('user-actions-navigate');
        const logClick = action('user-actions-click');

        const handleClick = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;

            const link = target.closest('a[href]');
            if (link) {
                const href = link.getAttribute('href') || '';
                const text = link.textContent?.trim() || '';
                event.preventDefault();
                logNavigate({ href, text });
                return;
            }

            const button = target.closest('button');
            if (button) {
                const label = button.textContent?.trim() || button.getAttribute('aria-label') || '';
                event.preventDefault();
                logClick({ label });
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

const meta: Meta<typeof UserActions> = {
    title: 'Layout/Header/User Actions',
    component: UserActions,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
User Actions component that displays authentication-related actions.

### Features:
- Sign In icon button for guests
- Account icon button for authenticated users
- Conditional rendering based on auth state
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <UserActionsStoryHarness>
                <div className="p-8">
                    <Story />
                </div>
            </UserActionsStoryHarness>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof UserActions>;

export const Guest: Story = {
    render: () => (
        <AuthProvider value={guestSession}>
            <UserActions />
        </AuthProvider>
    ),
    parameters: {
        docs: {
            description: {
                story: `
User actions for guest users.

### Features:
- Sign In icon button
- No logout button
            `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Check for Sign In icon button/link
        const signInLink = await canvas.findByRole('link', { name: /sign in/i }, { timeout: 5000 });
        await expect(signInLink).toBeInTheDocument();
        await expect(signInLink).toHaveAttribute('href', `${SITE_PREFIX}/login`);

        // Check that logout button is not present
        const logoutButton = canvas.queryByRole('button', { name: /sign out/i });
        await expect(logoutButton).toBeNull();

        // Click sign in link
        await userEvent.click(signInLink);
    },
};

export const Authenticated: Story = {
    render: () => (
        <AuthProvider value={registeredSession}>
            <UserActions />
        </AuthProvider>
    ),
    parameters: {
        docs: {
            description: {
                story: `
User actions for authenticated users.

### Features:
- Account icon button (links to /account)
- No logout button (moved to account navigation)
            `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Check for account icon button/link
        const accountLink = await canvas.findByRole('link', { name: /my account/i }, { timeout: 5000 });
        await expect(accountLink).toBeInTheDocument();
        await expect(accountLink).toHaveAttribute('href', `${SITE_PREFIX}/account/overview`);

        // Check that logout button is not present (moved to account navigation)
        const logoutButton = canvas.queryByRole('button', { name: /sign out/i });
        await expect(logoutButton).toBeNull();

        // Check that Sign In link is not present
        const signInLink = canvas.queryByRole('link', { name: /sign in/i });
        await expect(signInLink).toBeNull();

        // Click account link
        await userEvent.click(accountLink);
    },
};

/**
 * Simulates a cached app shell: the loader baked in the neutral guest value that the caching layer
 * emits, but this visitor's own `__sfdc_usertype` hint cookie says they are registered. AuthProvider
 * restores `userType` from the cookie post-hydration, so the header shows the account link — without
 * emitting a React hydration-mismatch warning (the useSyncExternalStore server snapshot is null on
 * both server and first client commit, so first paint matches SSR and only then reads the cookie).
 */
export const CachedShellRegisteredHint: Story = {
    render: () => (
        <AuthProvider value={guestSession} siteId={HINT_SITE_ID}>
            <UserActions />
        </AuthProvider>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Neutral guest loader value + a registered hint cookie → restores the account link.',
            },
        },
    },
    beforeEach: () => {
        setUserTypeHintCookie('registered');
        // Restore the shared document.cookie after the story runs so sibling stories are unaffected.
        return () => clearUserTypeHintCookie();
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // The hint cookie wins over the baked-in guest value: the account link is shown.
        const accountLink = await canvas.findByRole('link', { name: /my account/i }, { timeout: 5000 });
        await expect(accountLink).toBeInTheDocument();
        await expect(accountLink).toHaveAttribute('href', `${SITE_PREFIX}/account/overview`);

        // The neutral guest Sign In link must no longer be present.
        await expect(canvas.queryByRole('link', { name: /sign in/i })).toBeNull();
    },
};
