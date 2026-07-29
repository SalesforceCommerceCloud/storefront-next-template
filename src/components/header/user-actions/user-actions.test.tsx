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
        test('renders Sign In link and shows menu on hover', async () => {
            const user = userEvent.setup();
            render(createTestWrapper(<UserActions />, guestSession));

            const triggerLink = screen.getByRole('link', { name: t('header:signIn') });
            expect(triggerLink).toBeInTheDocument();
            expect(triggerLink).toHaveAttribute('href', '/global/en-GB/login');
            expect(screen.queryByRole('link', { name: /my account/i })).not.toBeInTheDocument();

            await user.hover(triggerLink);
            await waitFor(() => {
                expect(screen.getByText(t('header:menu.signInForBestExperience'))).toBeInTheDocument();
            });

            // After menu opens, there are two "Sign In" links - trigger and menu button
            const signInLinks = screen.getAllByRole('link', { name: t('header:signIn') });
            expect(signInLinks.length).toBeGreaterThanOrEqual(1);
            expect(signInLinks[0]).toHaveAttribute('href', '/global/en-GB/login');
            expect(screen.getByRole('link', { name: t('header:menu.createAccount') })).toHaveAttribute(
                'href',
                '/global/en-GB/signup'
            );
        });

        test('menu closes when mouse leaves', async () => {
            const user = userEvent.setup({ delay: null });
            render(createTestWrapper(<UserActions />, guestSession));

            const link = screen.getByRole('link', { name: t('header:signIn') });
            await user.hover(link);
            await waitFor(() => {
                expect(screen.getByText(t('header:menu.signInForBestExperience'))).toBeInTheDocument();
            });

            await user.unhover(link);
            await waitFor(
                () => {
                    expect(screen.queryByText(t('header:menu.signInForBestExperience'))).not.toBeInTheDocument();
                },
                { timeout: 500 }
            );
        });
    });

    describe('Authenticated user', () => {
        test('renders account link and shows menu on hover', async () => {
            const user = userEvent.setup();
            render(createTestWrapper(<UserActions />, registeredSession));

            const link = screen.getByRole('link', { name: t('account:myAccount') });
            expect(link).toBeInTheDocument();
            expect(link).toHaveAttribute('href', '/global/en-GB/account/overview');
            expect(screen.queryByRole('link', { name: t('header:signIn') })).not.toBeInTheDocument();

            await user.hover(link);
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

            const link = screen.getByRole('link', { name: t('account:myAccount') });
            await user.hover(link);
            await waitFor(() => {
                expect(screen.getByText(t('header:menu.yourLists'))).toBeInTheDocument();
            });

            await user.unhover(link);
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

            const link = screen.getByRole('link', { name: t('account:myAccount') });
            await user.hover(link);
            await waitFor(() => {
                expect(screen.getByText(t('header:menu.yourLists'))).toBeInTheDocument();
            });

            await user.unhover(link);
            const menuContent = screen.getByText(t('header:menu.yourLists')).closest('[data-slot="popover-content"]');
            if (menuContent) await user.hover(menuContent);

            // Menu should still be visible after hovering content
            await waitFor(() => {
                expect(screen.getByText(t('header:menu.yourLists'))).toBeInTheDocument();
            });
        });
    });

    describe('Edge cases', () => {
        test('renders Sign In for an undefined session', () => {
            render(createTestWrapper(<UserActions />));
            expect(screen.getByRole('link', { name: t('header:signIn') })).toBeInTheDocument();
        });

        test('registered session without customerId still renders the account link', () => {
            // Gating is userType-only: under a cached app shell the client restores userType from the
            // hint cookie but never customerId, so a registered userType alone must show My Account.
            render(createTestWrapper(<UserActions />, { userType: 'registered' }));
            expect(screen.getByRole('link', { name: t('account:myAccount') })).toBeInTheDocument();
            expect(screen.queryByRole('link', { name: t('header:signIn') })).not.toBeInTheDocument();
        });
    });
});
