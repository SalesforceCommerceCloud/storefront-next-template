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
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import type { SessionData } from '@/lib/api/types';
import AuthProvider from '@/providers/auth';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import UserActions from './user-actions';

const { t } = getTranslation();

const createTestWrapper = (component: React.ReactElement, session?: SessionData) => {
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: (
                    <AllProvidersWrapper>
                        {session ? <AuthProvider value={session}>{component}</AuthProvider> : component}
                    </AllProvidersWrapper>
                ),
            },
        ],
        { initialEntries: ['/'] }
    );
    return <RouterProvider router={router} />;
};

const guestSession: SessionData = { userType: 'guest' };
const registeredSession: SessionData = { userType: 'registered', customerId: 'test-customer-1' };

describe('UserActions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Guest user', () => {
        // W-23325760: the trigger opens the account menu, so it must be a <button>, not a link.
        // A <Link> renders an <a href> that navigates on activation, changing context when the
        // user meant only to open the menu (WCAG 3.2.2 On Input). The Sign In navigation link
        // lives inside the menu body instead.
        test('renders a Sign In trigger button (not a navigating link) and shows menu on hover', async () => {
            const user = userEvent.setup();
            render(createTestWrapper(<UserActions />, guestSession));

            const trigger = screen.getByTestId('user-account-trigger');
            expect(trigger.tagName).toBe('BUTTON');
            expect(trigger).not.toHaveAttribute('href');
            expect(trigger).toHaveAttribute('aria-label', t('header:signIn'));
            // The trigger itself is not a Sign In link, and there is no account link before opening.
            expect(screen.queryByRole('link', { name: t('header:signIn') })).not.toBeInTheDocument();
            expect(screen.queryByRole('link', { name: /my account/i })).not.toBeInTheDocument();

            await user.hover(trigger);
            await waitFor(() => {
                expect(screen.getByText(t('header:menu.signInForBestExperience'))).toBeInTheDocument();
            });

            // The Sign In navigation link now lives inside the menu body.
            expect(screen.getByRole('link', { name: t('header:signIn') })).toHaveAttribute(
                'href',
                '/global/en-GB/login'
            );
            expect(screen.getByRole('link', { name: t('header:menu.createAccount') })).toHaveAttribute(
                'href',
                '/global/en-GB/signup'
            );
        });

        test('trigger is a menu opener, not a navigating link (WCAG 3.2.2)', () => {
            render(createTestWrapper(<UserActions />, guestSession));

            // The structural guarantee: the trigger is a <button> announcing itself as a dialog
            // opener (aria-haspopup="dialog") with no href, so activating it cannot navigate. A
            // <Link> here rendered an <a href> that changed context on activation.
            const trigger = screen.getByTestId('user-account-trigger');
            expect(trigger.tagName).toBe('BUTTON');
            expect(trigger).not.toHaveAttribute('href');
            expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
        });

        test('menu closes when mouse leaves', async () => {
            const user = userEvent.setup({ delay: null });
            render(createTestWrapper(<UserActions />, guestSession));

            const trigger = screen.getByTestId('user-account-trigger');
            await user.hover(trigger);
            await waitFor(() => {
                expect(screen.getByText(t('header:menu.signInForBestExperience'))).toBeInTheDocument();
            });

            await user.unhover(trigger);
            await waitFor(
                () => {
                    expect(screen.queryByText(t('header:menu.signInForBestExperience'))).not.toBeInTheDocument();
                },
                { timeout: 500 }
            );
        });

        // W-23325760: the trigger must be operable from the keyboard alone (not just mouse hover),
        // and the opened dialog must announce an accessible name matching the trigger (WCAG 4.1.2).
        test('Enter opens the menu dialog with an accessible name via keyboard alone', async () => {
            const user = userEvent.setup();
            render(createTestWrapper(<UserActions />, guestSession));

            const trigger = screen.getByTestId('user-account-trigger');
            trigger.focus();
            await user.keyboard('{Enter}');

            const dialog = await screen.findByRole('dialog', { name: t('header:signIn') });
            expect(dialog).toBeInTheDocument();
        });

        test('Space opens the menu dialog with an accessible name via keyboard alone', async () => {
            const user = userEvent.setup();
            render(createTestWrapper(<UserActions />, guestSession));

            const trigger = screen.getByTestId('user-account-trigger');
            trigger.focus();
            await user.keyboard(' ');

            const dialog = await screen.findByRole('dialog', { name: t('header:signIn') });
            expect(dialog).toBeInTheDocument();
        });
    });

    describe('Authenticated user', () => {
        test('renders an account trigger button and shows menu on hover', async () => {
            const user = userEvent.setup();
            render(createTestWrapper(<UserActions />, registeredSession));

            const trigger = screen.getByTestId('user-account-trigger');
            expect(trigger.tagName).toBe('BUTTON');
            expect(trigger).not.toHaveAttribute('href');
            expect(trigger).toHaveAttribute('aria-label', t('account:myAccount'));
            expect(screen.queryByRole('link', { name: t('header:signIn') })).not.toBeInTheDocument();

            await user.hover(trigger);
            await waitFor(() => {
                expect(screen.getByText(t('header:menu.yourLists'))).toBeInTheDocument();
            });

            // Verify menu content
            expect(screen.getByText(t('header:menu.yourAccount'))).toBeInTheDocument();
            expect(screen.getByRole('link', { name: t('account:navigation.wishlist') })).toHaveAttribute(
                'href',
                '/global/en-GB/account/wishlist'
            );
            expect(screen.getByRole('link', { name: t('account:navigation.overview') })).toHaveAttribute(
                'href',
                '/global/en-GB/account/overview'
            );
            expect(screen.getByRole('link', { name: t('account:navigation.orderHistory') })).toHaveAttribute(
                'href',
                '/global/en-GB/account/orders'
            );
            expect(screen.getByRole('link', { name: t('account:navigation.accountDetails') })).toHaveAttribute(
                'href',
                '/global/en-GB/account'
            );
            expect(screen.getByRole('link', { name: t('header:menu.addressBook') })).toHaveAttribute(
                'href',
                '/global/en-GB/account/addresses'
            );
            expect(screen.getByRole('button', { name: t('account:navigation.logOut') })).toBeInTheDocument();
        });

        test('menu closes when mouse leaves', async () => {
            const user = userEvent.setup({ delay: null });
            render(createTestWrapper(<UserActions />, registeredSession));

            const trigger = screen.getByTestId('user-account-trigger');
            await user.hover(trigger);
            await waitFor(() => {
                expect(screen.getByText(t('header:menu.yourLists'))).toBeInTheDocument();
            });

            await user.unhover(trigger);
            await waitFor(
                () => {
                    expect(screen.queryByText(t('header:menu.yourLists'))).not.toBeInTheDocument();
                },
                { timeout: 500 }
            );
        });

        test('menu stays open when moving from trigger to content', async () => {
            const user = userEvent.setup({ delay: null });
            render(createTestWrapper(<UserActions />, registeredSession));

            const trigger = screen.getByTestId('user-account-trigger');
            await user.hover(trigger);
            await waitFor(() => {
                expect(screen.getByText(t('header:menu.yourLists'))).toBeInTheDocument();
            });

            await user.unhover(trigger);
            const menuContent = screen.getByText(t('header:menu.yourLists')).closest('[data-slot="popover-content"]');
            if (menuContent) await user.hover(menuContent);

            // Menu should still be visible after hovering content
            await waitFor(() => {
                expect(screen.getByText(t('header:menu.yourLists'))).toBeInTheDocument();
            });
        });

        test('Enter opens the menu dialog with an accessible name via keyboard alone', async () => {
            const user = userEvent.setup();
            render(createTestWrapper(<UserActions />, registeredSession));

            const trigger = screen.getByTestId('user-account-trigger');
            trigger.focus();
            await user.keyboard('{Enter}');

            const dialog = await screen.findByRole('dialog', { name: t('account:myAccount') });
            expect(dialog).toBeInTheDocument();
        });
    });

    describe('Edge cases', () => {
        test('renders a Sign In trigger for an undefined session', () => {
            render(createTestWrapper(<UserActions />));
            const trigger = screen.getByTestId('user-account-trigger');
            expect(trigger.tagName).toBe('BUTTON');
            expect(trigger).toHaveAttribute('aria-label', t('header:signIn'));
        });

        test('registered session without customerId still renders the account trigger', () => {
            // Gating is userType-only: under a cached app shell the client restores userType from the
            // hint cookie but never customerId, so a registered userType alone must show My Account.
            render(createTestWrapper(<UserActions />, { userType: 'registered' }));
            const trigger = screen.getByTestId('user-account-trigger');
            expect(trigger).toHaveAttribute('aria-label', t('account:myAccount'));
            expect(screen.queryByRole('link', { name: t('header:signIn') })).not.toBeInTheDocument();
        });
    });
});
