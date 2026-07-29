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
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import StandardLoginForm from './standard-login-form';

// Mock navigation state
const mockNavigation = {
    state: 'idle' as 'idle' | 'submitting' | 'loading',
};

// Helper to render with router context
function renderWithRouter(ui: React.ReactElement, initialEntries: string[] = ['/']) {
    const router = createMemoryRouter([{ path: '*', element: <AllProvidersWrapper>{ui}</AllProvidersWrapper> }], {
        initialEntries,
    });
    return render(<RouterProvider router={router} />);
}

describe('StandardLoginForm', () => {
    const defaultProps = {
        isPasswordlessEnabled: true,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockNavigation.state = 'idle';
        // Use vi.spyOn for useNavigation hook
        vi.spyOn(ReactRouter, 'useNavigation').mockReturnValue(mockNavigation as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('rendering', () => {
        test('renders form with all required elements', () => {
            const { container } = renderWithRouter(<StandardLoginForm {...defaultProps} />);

            // Email field
            const emailInput = screen.getByLabelText(t('login:emailLabel'));
            expect(emailInput).toBeInTheDocument();
            expect(emailInput).toHaveAttribute('type', 'email');
            expect(emailInput).toHaveAttribute('name', 'email');
            expect(emailInput).toHaveAttribute('id', 'email');
            expect(emailInput).toHaveAttribute('placeholder', t('login:emailPlaceholder'));
            expect(emailInput).toHaveAttribute('autocomplete', 'username webauthn');
            expect(emailInput).toBeRequired();

            // Password field
            const passwordInput = screen.getByLabelText(t('login:passwordLabel'));
            expect(passwordInput).toBeInTheDocument();
            expect(passwordInput).toHaveAttribute('type', 'password');
            expect(passwordInput).toHaveAttribute('name', 'password');
            expect(passwordInput).toHaveAttribute('id', 'password');
            expect(passwordInput).toHaveAttribute('placeholder', t('login:passwordPlaceholder'));
            expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
            expect(passwordInput).toBeRequired();

            // Submit button
            const submitButton = screen.getByRole('button', { name: t('login:signIn') });
            expect(submitButton).toBeInTheDocument();

            // Links
            const forgotPasswordLink = screen.getByRole('link', { name: t('login:forgotPassword') });
            expect(forgotPasswordLink).toBeInTheDocument();
            expect(forgotPasswordLink).toHaveAttribute('href', '/global/en-GB/forgot-password');
            expect(forgotPasswordLink).toHaveClass('text-primary', 'hover:text-primary/80');

            const signUpLink = screen.getByRole('link', { name: t('login:signUp') });
            expect(signUpLink).toBeInTheDocument();
            expect(signUpLink).toHaveAttribute('href', '/global/en-GB/signup');

            const passwordlessLink = screen.getByRole('link', { name: t('login:loginWithoutPassword') });
            expect(passwordlessLink).toBeInTheDocument();
            expect(passwordlessLink).toHaveAttribute('href', '/global/en-GB/login?mode=passwordless');
            expect(passwordlessLink).toHaveClass('text-primary', 'hover:text-primary/80');

            // Hidden loginMode field
            const loginModeInput = container.querySelector('input[name="loginMode"]');
            expect(loginModeInput).toBeInTheDocument();
            expect(loginModeInput).toHaveValue('password');
            expect(loginModeInput).toHaveAttribute('type', 'hidden');

            // Form structure
            const form = container.querySelector('form');
            expect(form).toHaveAttribute('method', 'post');
            expect(form).toHaveClass('space-y-6');

            // No error by default
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });

        test('renders error message when error prop is provided', () => {
            const errorMessage = 'Invalid credentials';
            renderWithRouter(<StandardLoginForm {...defaultProps} error={errorMessage} />);

            const errorElement = screen.getByText(errorMessage);
            expect(errorElement).toBeInTheDocument();
            expect(errorElement.closest('div')).toHaveClass(
                'bg-destructive/10',
                'border',
                'border-destructive/20',
                'text-destructive'
            );
        });
    });

    describe('form field interactions', () => {
        test('accepts user input in email and password fields', async () => {
            const user = userEvent.setup();
            renderWithRouter(<StandardLoginForm {...defaultProps} />);

            const emailInput = screen.getByLabelText(t('login:emailLabel'));
            const passwordInput = screen.getByLabelText(t('login:passwordLabel'));

            // Type in email field
            await user.type(emailInput, 'test@example.com');
            expect(emailInput).toHaveValue('test@example.com');

            // Type in password field
            await user.type(passwordInput, 'SecurePass123!');
            expect(passwordInput).toHaveValue('SecurePass123!');

            // Test special characters in email
            await user.clear(emailInput);
            const specialEmail = 'test+user@example.com';
            await user.type(emailInput, specialEmail);
            expect(emailInput).toHaveValue(specialEmail);
        });
    });

    describe('passwordless mode toggle', () => {
        test('renders passwordless login link when enabled', () => {
            renderWithRouter(<StandardLoginForm isPasswordlessEnabled={true} />);
            const passwordlessLink = screen.getByRole('link', {
                name: t('login:loginWithoutPassword'),
            });
            expect(passwordlessLink).toBeInTheDocument();
            expect(passwordlessLink).toHaveAttribute('href', '/global/en-GB/login?mode=passwordless');
        });

        test('preserves returnUrl and pending action params when switching mode', () => {
            renderWithRouter(<StandardLoginForm isPasswordlessEnabled={true} />, [
                '/login?returnUrl=%2Fproduct%2F123&action=addToWishlist&actionParams=%7B%22productId%22%3A%22123%22%7D',
            ]);
            const passwordlessLink = screen.getByRole('link', {
                name: t('login:loginWithoutPassword'),
            });
            expect(passwordlessLink).toHaveAttribute(
                'href',
                '/global/en-GB/login?returnUrl=%2Fproduct%2F123&action=addToWishlist&actionParams=%7B%22productId%22%3A%22123%22%7D&mode=passwordless'
            );
        });

        test('does not render passwordless login link when disabled', () => {
            renderWithRouter(<StandardLoginForm isPasswordlessEnabled={false} />);
            const passwordlessLink = screen.queryByRole('link', { name: t('login:loginWithoutPassword') });
            expect(passwordlessLink).not.toBeInTheDocument();
        });
    });

    describe('checkout as guest', () => {
        test('renders Checkout as Guest button when onCheckoutAsGuest is provided', () => {
            renderWithRouter(<StandardLoginForm {...defaultProps} onCheckoutAsGuest={vi.fn()} />);

            const guestButton = screen.getByRole('button', { name: t('login:checkoutAsGuest') });
            expect(guestButton).toBeInTheDocument();
        });

        test('does not render Checkout as Guest button when onCheckoutAsGuest is not provided', () => {
            renderWithRouter(<StandardLoginForm {...defaultProps} />);

            expect(screen.queryByRole('button', { name: t('login:checkoutAsGuest') })).not.toBeInTheDocument();
        });

        test('calls onCheckoutAsGuest when button is clicked', async () => {
            const user = userEvent.setup();
            const onCheckoutAsGuest = vi.fn();
            renderWithRouter(<StandardLoginForm {...defaultProps} onCheckoutAsGuest={onCheckoutAsGuest} />);

            await user.click(screen.getByRole('button', { name: t('login:checkoutAsGuest') }));

            expect(onCheckoutAsGuest).toHaveBeenCalledTimes(1);
        });
    });

    describe('edge cases', () => {
        test('handles long error message', () => {
            const longError = 'A'.repeat(200);
            renderWithRouter(<StandardLoginForm {...defaultProps} error={longError} />);
            expect(screen.getByText(longError)).toBeInTheDocument();
        });

        test('handles undefined error', () => {
            renderWithRouter(<StandardLoginForm {...defaultProps} error={undefined} />);
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });
    });
});
