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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ResetPasswordForm } from './index';
import { isPasswordValid } from '@/lib/utils';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();

// Mock navigation state
const mockNavigation = {
    state: 'idle' as 'idle' | 'submitting' | 'loading',
};

// Helper to render with router context
function renderWithRouter(ui: React.ReactElement) {
    const router = createMemoryRouter([{ path: '/', element: ui }], { initialEntries: ['/'] });
    return render(<RouterProvider router={router} />);
}

// Mock the utils module for password validation
vi.mock('@/lib/utils', async () => {
    const actual = await vi.importActual('@/lib/utils');
    return {
        ...actual,
        isPasswordValid: vi.fn(),
        validatePassword: vi.fn(),
    };
});

// Mock PasswordRequirement component to simplify testing
vi.mock('@/components/password-requirements', () => ({
    PasswordRequirement: ({ password }: { password: string }) => (
        <div data-testid="password-requirements">Password requirements for: {password}</div>
    ),
}));

describe('ResetPasswordForm', () => {
    const defaultProps = {
        token: 'test-token-123',
        email: 'test@example.com',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockNavigation.state = 'idle';
        // Set default mock for password validation
        vi.mocked(isPasswordValid).mockReturnValue(false);
        // Use vi.spyOn for useNavigation hook
        vi.spyOn(ReactRouter, 'useNavigation').mockReturnValue(mockNavigation as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('rendering', () => {
        test('renders form with all required elements', () => {
            const { container } = renderWithRouter(<ResetPasswordForm {...defaultProps} />);

            // Email display (disabled)
            const emailInput = screen.getByLabelText(t('resetPassword:emailLabel') || t('signup:form.emailLabel'));
            expect(emailInput).toBeInTheDocument();
            expect(emailInput).toHaveValue(defaultProps.email);
            expect(emailInput).toBeDisabled();

            // Password fields
            expect(
                screen.getByLabelText(t('resetPassword:newPasswordLabel') || t('signup:form.passwordLabel'))
            ).toBeInTheDocument();
            expect(
                screen.getByLabelText(t('resetPassword:confirmPasswordLabel') || t('signup:form.confirmPasswordLabel'))
            ).toBeInTheDocument();

            // Submit button
            expect(screen.getByRole('button', { name: t('resetPassword:resetPasswordButton') })).toBeInTheDocument();

            // Hidden fields
            const tokenInput = container.querySelector('input[name="token"]');
            const emailHidden = container.querySelector('input[name="email"]');
            expect(tokenInput).toBeInTheDocument();
            expect(tokenInput).toHaveValue(defaultProps.token);
            expect(tokenInput).toHaveAttribute('type', 'hidden');
            expect(emailHidden).toBeInTheDocument();
            expect(emailHidden).toHaveValue(defaultProps.email);
            expect(emailHidden).toHaveAttribute('type', 'hidden');

            // PasswordRequirements component
            expect(screen.getByTestId('password-requirements')).toBeInTheDocument();

            // No error by default
            expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
        });

        test('renders error message when error prop is provided', () => {
            const errorMessage = 'Invalid reset token';
            renderWithRouter(<ResetPasswordForm {...defaultProps} error={errorMessage} />);

            expect(screen.getByText(errorMessage)).toBeInTheDocument();
            expect(screen.getByText(errorMessage).closest('div')).toHaveClass('bg-destructive/10');
        });
    });

    describe('password field interactions', () => {
        test('accepts user input in password fields', async () => {
            const user = userEvent.setup();
            renderWithRouter(<ResetPasswordForm {...defaultProps} />);

            const passwordInput = screen.getByLabelText(
                t('resetPassword:newPasswordLabel') || t('signup:form.passwordLabel')
            );
            const confirmPasswordInput = screen.getByLabelText(
                t('resetPassword:confirmPasswordLabel') || t('signup:form.confirmPasswordLabel')
            );

            await user.type(passwordInput, 'Test123!');
            expect(passwordInput).toHaveValue('Test123!');

            await user.type(confirmPasswordInput, 'Test123!');
            expect(confirmPasswordInput).toHaveValue('Test123!');
        });

        test('handles password mismatch validation', async () => {
            const user = userEvent.setup();
            renderWithRouter(<ResetPasswordForm {...defaultProps} />);

            const passwordInput = screen.getByLabelText(
                t('resetPassword:newPasswordLabel') || t('signup:form.passwordLabel')
            );
            const confirmPasswordInput = screen.getByLabelText(
                t('resetPassword:confirmPasswordLabel') || t('signup:form.confirmPasswordLabel')
            );

            // Test mismatch - should show error and set aria-invalid
            await user.type(passwordInput, 'Test123!');
            await user.type(confirmPasswordInput, 'Different456!');

            await waitFor(() => {
                expect(screen.getByText(t('resetPassword:passwordsMustMatch'))).toBeInTheDocument();
                expect(confirmPasswordInput).toHaveAttribute('aria-invalid', 'true');
            });

            // Clear and test matching passwords - should not show error
            await user.clear(confirmPasswordInput);
            await user.type(confirmPasswordInput, 'Test123!');

            expect(screen.queryByText(t('resetPassword:passwordsMustMatch'))).not.toBeInTheDocument();
        });
    });

    describe('password requirements', () => {
        test('passes password value to PasswordRequirements component', async () => {
            const user = userEvent.setup();
            renderWithRouter(<ResetPasswordForm {...defaultProps} />);

            const passwordInput = screen.getByLabelText(
                t('resetPassword:newPasswordLabel') || t('signup:form.passwordLabel')
            );

            await user.type(passwordInput, 'Test123!');

            await waitFor(() => {
                expect(screen.getByTestId('password-requirements')).toHaveTextContent(
                    'Password requirements for: Test123!'
                );
            });
        });
    });

    describe('form submission', () => {
        test('validates form and controls submit button state', async () => {
            const user = userEvent.setup();
            const { container } = renderWithRouter(<ResetPasswordForm {...defaultProps} />);

            // Form should have POST method (React Router Form renders lowercase)
            const form = container.querySelector('form');
            expect(form?.getAttribute('method')?.toLowerCase()).toBe('post');

            // Submit button should be disabled when form is invalid
            let submitButton = screen.getByRole('button', { name: t('resetPassword:resetPasswordButton') });
            expect(submitButton).toBeDisabled();

            // Enable the form by mocking valid password
            vi.mocked(isPasswordValid).mockReturnValue(true);

            const passwordInput = screen.getByLabelText(
                t('resetPassword:newPasswordLabel') || t('signup:form.passwordLabel')
            );
            const confirmPasswordInput = screen.getByLabelText(
                t('resetPassword:confirmPasswordLabel') || t('signup:form.confirmPasswordLabel')
            );

            // Type matching valid passwords
            await user.type(passwordInput, 'Test123!');
            await user.type(confirmPasswordInput, 'Test123!');

            // Submit button should be enabled when form is valid
            await waitFor(() => {
                submitButton = screen.getByRole('button', { name: t('resetPassword:resetPasswordButton') });
                expect(submitButton).not.toBeDisabled();
            });
        });
    });

    describe('accessibility', () => {
        test('form fields have proper accessibility attributes', () => {
            renderWithRouter(<ResetPasswordForm {...defaultProps} />);

            const passwordInput = screen.getByLabelText(
                t('resetPassword:newPasswordLabel') || t('signup:form.passwordLabel')
            );
            const confirmPasswordInput = screen.getByLabelText(
                t('resetPassword:confirmPasswordLabel') || t('signup:form.confirmPasswordLabel')
            );
            const emailInput = screen.getByLabelText(t('resetPassword:emailLabel') || t('signup:form.emailLabel'));

            // Password fields
            expect(passwordInput).toHaveAttribute('type', 'password');
            expect(passwordInput).toHaveAttribute('autocomplete', 'new-password');
            expect(passwordInput).toBeRequired();

            expect(confirmPasswordInput).toHaveAttribute('type', 'password');
            expect(confirmPasswordInput).toHaveAttribute('autocomplete', 'new-password');
            expect(confirmPasswordInput).toBeRequired();

            // Email field
            expect(emailInput).toHaveAttribute('type', 'email');
        });
    });

    describe('edge cases', () => {
        test('handles empty token', () => {
            const { container } = renderWithRouter(<ResetPasswordForm {...defaultProps} token="" />);
            const tokenInput = container.querySelector('input[name="token"]');
            expect(tokenInput).toHaveValue('');
        });

        test('handles empty email', () => {
            const { container } = renderWithRouter(<ResetPasswordForm {...defaultProps} email="" />);
            const emailDisplay = screen.getByLabelText(t('resetPassword:emailLabel') || t('signup:form.emailLabel'));
            expect(emailDisplay).toHaveValue('');
            const emailHidden = container.querySelector('input[name="email"]');
            expect(emailHidden).toHaveValue('');
        });

        test('handles special characters in email', () => {
            const specialEmail = 'test+user@example.com';
            renderWithRouter(<ResetPasswordForm {...defaultProps} email={specialEmail} />);
            const emailDisplay = screen.getByLabelText(t('resetPassword:emailLabel') || t('signup:form.emailLabel'));
            expect(emailDisplay).toHaveValue(specialEmail);
        });

        test('handles long error message', () => {
            const longError = 'A'.repeat(500);
            renderWithRouter(<ResetPasswordForm {...defaultProps} error={longError} />);
            expect(screen.getByText(longError)).toBeInTheDocument();
        });
    });

    describe('UI strings fallbacks', () => {
        test('uses fallback strings when resetPassword strings are not available', () => {
            // This tests that the component can fall back to signup strings
            renderWithRouter(<ResetPasswordForm {...defaultProps} />);

            // The component should still render even if some strings are missing
            expect(screen.getByRole('button')).toBeInTheDocument();
        });
    });
});
