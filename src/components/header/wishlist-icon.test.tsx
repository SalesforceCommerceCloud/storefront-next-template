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
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import type { SessionData } from '@/lib/api/types';
import AuthProvider from '@/providers/auth';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import WishlistIcon from './wishlist-icon';

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

describe('WishlistIcon', () => {
    test('guest shopper: link points to /wishlist', () => {
        render(createTestWrapper(<WishlistIcon />, guestSession));

        const link = screen.getByRole('link', { name: t('header:wishlist') });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/global/en-GB/wishlist');
    });

    test('registered shopper: link points to /account/wishlist', () => {
        render(createTestWrapper(<WishlistIcon />, registeredSession));

        const link = screen.getByRole('link', { name: t('header:wishlist') });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/global/en-GB/account/wishlist');
    });

    test('registered shopper without customerId: points to /account/wishlist', () => {
        // Gating is userType-only: under a cached app shell the client restores userType from the hint
        // cookie but never customerId, so a registered userType alone routes to the account wishlist.
        render(createTestWrapper(<WishlistIcon />, { userType: 'registered' }));

        const link = screen.getByRole('link', { name: t('header:wishlist') });
        expect(link).toHaveAttribute('href', '/global/en-GB/account/wishlist');
    });

    test('no session: defaults to guest /wishlist', () => {
        render(createTestWrapper(<WishlistIcon />));

        const link = screen.getByRole('link', { name: t('header:wishlist') });
        expect(link).toHaveAttribute('href', '/global/en-GB/wishlist');
    });

    test('renders Heart icon', () => {
        const { container } = render(createTestWrapper(<WishlistIcon />, guestSession));

        const icon = container.querySelector('svg');
        expect(icon).toBeInTheDocument();
        expect(icon).toHaveClass('size-5');
    });
});
