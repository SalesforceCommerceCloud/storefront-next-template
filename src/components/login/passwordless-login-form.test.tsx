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
import PasswordlessLoginForm from './passwordless-login-form';

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

describe('PasswordlessLoginForm', () => {
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
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} />);

            // Email field
            const emailInput = screen.getByLabelText(t('login:emailLabel'));
            expect(emailInput).toBeInTheDocument();
            expect(emailInput).toHaveAttribute('type', 'email');
            expect(emailInput).toHaveAttribute('name', 'email');

            // Submit button
            const submitButton = screen.getByRole('button', { name: t('login:sendLoginLink') });
            expect(submitButton).toBeInTheDocument();
            expect(submitButton.tagName).toBe('BUTTON');

            // Forgot password link
            const forgotPasswordLink = screen.getByRole('link', { name: t('login:forgotPassword') });
            expect(forgotPasswordLink).toBeInTheDocument();
            expect(forgotPasswordLink).toHaveAttribute('href', '/global/en-GB/forgot-password');

            // No error message by default
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });

        test('renders hidden fields correctly', () => {
            // Test without redirectPath
            const { container } = renderWithRouter(<PasswordlessLoginForm {...defaultProps} />);

            // loginMode is always present
            const loginModeInput = container.querySelector('input[name="loginMode"]');
            expect(loginModeInput).toBeInTheDocument();
            expect(loginModeInput).toHaveAttribute('type', 'hidden');
            expect(loginModeInput).toHaveValue('passwordless');

            // redirectPath is not present when not provided
            let redirectPathInput = container.querySelector('input[name="redirectPath"]');
            expect(redirectPathInput).not.toBeInTheDocument();

            // Test with redirectPath
            const redirectPath = '/account';
            const { container: containerWithRedirect } = renderWithRouter(
                <PasswordlessLoginForm {...defaultProps} redirectPath={redirectPath} />
            );

            // redirectPath is present when provided
            redirectPathInput = containerWithRedirect.querySelector('input[name="redirectPath"]');
            expect(redirectPathInput).toBeInTheDocument();
            expect(redirectPathInput).toHaveAttribute('type', 'hidden');
            expect(redirectPathInput).toHaveValue(redirectPath);
        });

        test('renders error message when error prop is provided', () => {
            const errorMessage = 'Failed to send login link';
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} error={errorMessage} />);

            const errorElement = screen.getByText(errorMessage);
            expect(errorElement).toBeInTheDocument();
            expect(errorElement.closest('div')).toHaveClass('bg-destructive/10');
        });
    });

    describe('passwordless mode toggle', () => {
        test('renders password login link when passwordless is enabled', () => {
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} isPasswordlessEnabled={true} />);

            const passwordLoginLink = screen.getByRole('link', { name: t('login:loginWithPassword') });
            expect(passwordLoginLink).toBeInTheDocument();
            expect(passwordLoginLink).toHaveAttribute('href', '/global/en-GB/login?mode=password');
        });

        test('preserves returnUrl and pending action params when switching mode', () => {
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} isPasswordlessEnabled={true} />, [
                '/login?returnUrl=%2Fsearch%3Fq%3Dshoe&action=addToWishlist&actionParams=%7B%22productId%22%3A%22abc%22%7D',
            ]);

            const passwordLoginLink = screen.getByRole('link', { name: t('login:loginWithPassword') });
            expect(passwordLoginLink).toHaveAttribute(
                'href',
                '/global/en-GB/login?returnUrl=%2Fsearch%3Fq%3Dshoe&action=addToWishlist&actionParams=%7B%22productId%22%3A%22abc%22%7D&mode=password'
            );
        });

        test('does not render password login link when passwordless is disabled', () => {
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} isPasswordlessEnabled={false} />);

            const passwordLoginLink = screen.queryByRole('link', { name: t('login:loginWithPassword') });
            expect(passwordLoginLink).not.toBeInTheDocument();
        });
    });

    describe('email field interactions', () => {
        test('email field has correct attributes and accepts user input', async () => {
            const user = userEvent.setup();
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} />);

            const emailInput = screen.getByLabelText(t('login:emailLabel'));

            // Check attributes
            expect(emailInput).toHaveAttribute('placeholder', t('login:emailPlaceholder'));
            expect(emailInput).toBeRequired();

            // Test user input
            await user.type(emailInput, 'test@example.com');
            expect(emailInput).toHaveValue('test@example.com');
        });
    });

    describe('form submission', () => {
        test('form has correct method and can be submitted with valid email', async () => {
            const user = userEvent.setup();
            const { container } = renderWithRouter(<PasswordlessLoginForm {...defaultProps} />);

            const form = container.querySelector('form');
            expect(form).toHaveAttribute('method', 'post');
            expect(form).toBeInTheDocument();

            // Fill in email and verify form data is ready for submission
            const emailInput = screen.getByLabelText(t('login:emailLabel'));
            await user.type(emailInput, 'test@example.com');
            expect(emailInput).toHaveValue('test@example.com');
        });
    });

    describe('accessibility', () => {
        test('email field has proper accessibility attributes', () => {
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} />);

            const emailInput = screen.getByLabelText(t('login:emailLabel'));
            expect(emailInput).toHaveAttribute('autocomplete', 'username webauthn');
            expect(emailInput).toHaveAttribute('id', 'email');

            const emailLabel = screen.getByText(t('login:emailLabel'));
            expect(emailLabel.tagName).toBe('LABEL');
            expect(emailLabel).toHaveAttribute('for', 'email');
        });

        test('links have descriptive text', () => {
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} />);

            const forgotPasswordLink = screen.getByRole('link', { name: t('login:forgotPassword') });
            expect(forgotPasswordLink).toHaveTextContent(t('login:forgotPassword'));

            const passwordLoginLink = screen.getByRole('link', { name: t('login:loginWithPassword') });
            expect(passwordLoginLink).toHaveTextContent(t('login:loginWithPassword'));
        });
    });

    describe('edge cases', () => {
        test('handles special characters in email', async () => {
            const user = userEvent.setup();
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} />);

            const emailInput = screen.getByLabelText(t('login:emailLabel'));
            const specialEmail = 'test+user@example.com';

            await user.type(emailInput, specialEmail);

            expect(emailInput).toHaveValue(specialEmail);
        });

        test('handles empty or undefined redirectPath gracefully', () => {
            // Test with empty string
            const { container: containerEmpty } = renderWithRouter(
                <PasswordlessLoginForm {...defaultProps} redirectPath="" />
            );
            let redirectPathInput = containerEmpty.querySelector('input[name="redirectPath"]');
            expect(redirectPathInput).not.toBeInTheDocument();

            // Test with undefined
            const { container: containerUndefined } = renderWithRouter(
                <PasswordlessLoginForm {...defaultProps} redirectPath={undefined} />
            );
            redirectPathInput = containerUndefined.querySelector('input[name="redirectPath"]');
            expect(redirectPathInput).not.toBeInTheDocument();
        });

        test('handles long error message', () => {
            const longError = 'A'.repeat(200);
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} error={longError} />);
            expect(screen.getByText(longError)).toBeInTheDocument();
        });

        test('handles undefined error', () => {
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} error={undefined} />);
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });
    });

    describe('props combinations', () => {
        test('renders correctly with all props provided', () => {
            renderWithRouter(
                <PasswordlessLoginForm error="Test error" isPasswordlessEnabled={true} redirectPath="/account/orders" />
            );

            expect(screen.getByText('Test error')).toBeInTheDocument();
            expect(screen.getByRole('link', { name: t('login:loginWithPassword') })).toBeInTheDocument();
            expect(screen.getByLabelText(t('login:emailLabel'))).toBeInTheDocument();
        });

        test('renders correctly with minimal props', () => {
            renderWithRouter(<PasswordlessLoginForm isPasswordlessEnabled={false} />);

            expect(screen.getByLabelText(t('login:emailLabel'))).toBeInTheDocument();
            expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).toBeInTheDocument();
            expect(screen.queryByRole('link', { name: t('login:loginWithPassword') })).not.toBeInTheDocument();
        });
    });
});
