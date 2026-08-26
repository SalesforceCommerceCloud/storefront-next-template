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

const { t } = getTranslation();

// Components
import CartEmpty from './cart-empty';

// Use createMemoryRouter (data mode) instead of MemoryRouter (declarative mode)
// since the app uses React Router's framework mode which shares core APIs with data mode
const renderWithRouter = (ui: React.ReactElement, session?: SessionData) => {
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: (
                    <AllProvidersWrapper>
                        {session ? <AuthProvider value={session}>{ui}</AuthProvider> : ui}
                    </AllProvidersWrapper>
                ),
            },
        ],
        { initialEntries: ['/'] }
    );
    return render(<RouterProvider router={router} />);
};

describe('CartEmpty', () => {
    describe('Basic Rendering', () => {
        test('renders empty cart with all required elements', () => {
            renderWithRouter(<CartEmpty />);

            // Check for container with correct test id
            const container = screen.getByTestId('sf-cart-empty');
            expect(container).toBeInTheDocument();

            // Check for shopping bag icon
            const bagIcon = document.querySelector('[data-testid="sf-cart-empty"] svg');
            expect(bagIcon).toBeInTheDocument();

            // Check for empty cart title
            expect(screen.getByText(t('cart:empty.title'))).toBeInTheDocument();

            // Check for guest message
            expect(screen.getByText(t('cart:empty.guestMessage'))).toBeInTheDocument();
            expect(screen.queryByText(t('cart:empty.registeredMessage'))).not.toBeInTheDocument();

            // Check for start shopping button
            expect(screen.getByText(t('cart:empty.continueShopping'))).toBeInTheDocument();
        });

        test('shows registered guidance instead of guest sign-in guidance for a registered shopper', () => {
            renderWithRouter(<CartEmpty />, { userType: 'registered' });

            expect(screen.getByText(t('cart:empty.registeredMessage'))).toBeInTheDocument();
            expect(screen.queryByText(t('cart:empty.guestMessage'))).not.toBeInTheDocument();
            expect(screen.getByText(t('cart:empty.title'))).toBeInTheDocument();
            expect(screen.getByText(t('cart:empty.continueShopping'))).toBeInTheDocument();
        });
    });

    describe('Action Buttons', () => {
        test('start shopping button links to home page', () => {
            renderWithRouter(<CartEmpty />);

            const startShoppingLink = screen.getByText(t('cart:empty.continueShopping')).closest('a');
            expect(startShoppingLink).toHaveAttribute('href', '/global/en-GB/');
        });
    });
});
