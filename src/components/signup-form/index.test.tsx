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
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode, ComponentProps } from 'react';
import { SignupForm } from './form';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

// Type definitions for mock components
interface MockButtonProps extends ComponentProps<'button'> {
    children: ReactNode;
    disabled?: boolean;
    variant?: string;
    type?: 'button' | 'submit' | 'reset';
}

interface MockInputProps extends ComponentProps<'input'> {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// Mock UI components
vi.mock('@/components/ui/input', () => ({
    Input: (props: MockInputProps) => <input {...props} />,
}));

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, disabled, variant, type, ...props }: MockButtonProps) => (
        <button disabled={disabled} data-variant={variant} type={type} {...props}>
            {children}
        </button>
    ),
}));

vi.mock('@/components/password-requirements', () => ({
    PasswordRequirement: ({ password }: { password: string }) => (
        <div data-testid="password-requirement">Password Requirements for: {password}</div>
    ),
}));

const mockIsPasswordValid = vi.fn();

vi.mock('@/lib/utils', () => ({
    isPasswordValid: (...args: unknown[]) => mockIsPasswordValid(...args),
}));

describe('SignupForm', () => {
    const { t } = getTranslation();

    beforeEach(() => {
        vi.clearAllMocks();
        mockIsPasswordValid.mockReturnValue(true);
    });

    describe('rendering', () => {
        it('should render all form fields', () => {
            render(<SignupForm />);

            expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
        });

        it('should render form inputs with correct attributes', () => {
            render(<SignupForm />);

            const firstNameInput = screen.getByLabelText(/first name/i);
            const lastNameInput = screen.getByLabelText(/last name/i);
            const emailInput = screen.getByLabelText(/email/i);
            const passwordInput = screen.getByLabelText(/^password/i);
            const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

            expect(firstNameInput).toHaveAttribute('name', 'firstName');
            expect(firstNameInput).toHaveAttribute('type', 'text');
            expect(firstNameInput).toHaveAttribute('autoComplete', 'given-name');

            expect(lastNameInput).toHaveAttribute('name', 'lastName');
            expect(lastNameInput).toHaveAttribute('type', 'text');
            expect(lastNameInput).toHaveAttribute('autoComplete', 'family-name');

            expect(emailInput).toHaveAttribute('name', 'email');
            expect(emailInput).toHaveAttribute('type', 'email');
            expect(emailInput).toHaveAttribute('autoComplete', 'email');

            expect(passwordInput).toHaveAttribute('name', 'password');
            expect(passwordInput).toHaveAttribute('type', 'password');
            expect(passwordInput).toHaveAttribute('autoComplete', 'new-password');

            expect(confirmPasswordInput).toHaveAttribute('name', 'confirmPassword');
            expect(confirmPasswordInput).toHaveAttribute('type', 'password');
            expect(confirmPasswordInput).toHaveAttribute('autoComplete', 'new-password');
        });

        it('should render submit button', () => {
            render(<SignupForm />);

            const submitButton = screen.getByRole('button', { name: /create account/i });
            expect(submitButton).toBeInTheDocument();
            expect(submitButton).toHaveAttribute('type', 'submit');
        });

        it('should render PasswordRequirement component', () => {
            render(<SignupForm />);

            expect(screen.getByTestId('password-requirement')).toBeInTheDocument();
        });
    });

    describe('passwordless mode', () => {
        it('should render passwordless registrationform', () => {
            render(<SignupForm isPasswordless />);

            expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/email/i)).toBeInTheDocument();

            expect(screen.queryByLabelText(/^password/i)).not.toBeInTheDocument();
            expect(screen.queryByLabelText(/confirm password/i)).not.toBeInTheDocument();
            expect(screen.queryByTestId('password-requirement')).not.toBeInTheDocument();

            expect(screen.getByRole('button', { name: t('signup:form.continueButton') })).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: t('signup:form.createAccountWithPassword') })
            ).toBeInTheDocument();
        });

        it('should enable submit button immediately when isPasswordless is true', () => {
            render(<SignupForm isPasswordless />);

            const submitButton = screen.getByRole('button', { name: t('signup:form.continueButton') });
            expect(submitButton).not.toBeDisabled();
            expect(submitButton).toHaveAttribute('data-variant', 'default');
        });

        it('should show password fields when "Create account with a password" is clicked', () => {
            render(<SignupForm isPasswordless />);

            fireEvent.click(screen.getByRole('button', { name: t('signup:form.createAccountWithPassword') }));

            expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: t('signup:form.createAccountButton') })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: t('signup:form.continueWithoutPassword') })).toBeInTheDocument();
        });

        it('should hide password fields when "Continue without a password" is clicked', () => {
            render(<SignupForm isPasswordless />);

            fireEvent.click(screen.getByRole('button', { name: t('signup:form.createAccountWithPassword') }));
            expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: t('signup:form.continueWithoutPassword') }));
            expect(screen.queryByLabelText(/^password/i)).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: t('signup:form.continueButton') })).toBeInTheDocument();
        });

        it('should set registrationMode hidden input to "passwordless" by default', () => {
            const { container } = render(<SignupForm isPasswordless />);

            const hiddenInput = container.querySelector('input[name="registrationMode"]');
            expect(hiddenInput).toHaveValue('passwordless');
        });

        it('should set registrationMode hidden input to "password" when password form is shown', () => {
            const { container } = render(<SignupForm isPasswordless />);

            fireEvent.click(screen.getByRole('button', { name: t('signup:form.createAccountWithPassword') }));

            const hiddenInput = container.querySelector('input[name="registrationMode"]');
            expect(hiddenInput).toHaveValue('password');
        });

        it('should not render registrationMode hidden input when isPasswordless is false', () => {
            const { container } = render(<SignupForm />);

            const hiddenInput = container.querySelector('input[name="registrationMode"]');
            expect(hiddenInput).not.toBeInTheDocument();
        });
    });

    describe('error display', () => {
        it('should display error message when error prop is provided', () => {
            const errorMessage = 'This is an error message';
            render(<SignupForm error={errorMessage} />);

            expect(screen.getByText(errorMessage)).toBeInTheDocument();
            expect(screen.getByText(errorMessage).closest('div')).toHaveClass('bg-destructive/10');
        });

        it('should not display error message when error prop is not provided', () => {
            render(<SignupForm />);

            expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
        });
    });

    describe('password validation', () => {
        it('should validate password and update PasswordRequirement', () => {
            render(<SignupForm />);

            const passwordInput = screen.getByLabelText(/^password/i);
            fireEvent.change(passwordInput, { target: { value: 'TestPass123!' } });

            const passwordRequirement = screen.getByTestId('password-requirement');
            expect(passwordRequirement.textContent).toContain('TestPass123!');
        });

        it('should not show password mismatch error initially', () => {
            render(<SignupForm />);

            expect(screen.queryByText(t('signup:passwordsDoNotMatch'))).not.toBeInTheDocument();
        });

        it('should show password mismatch error when passwords do not match', () => {
            render(<SignupForm />);

            const passwordInput = screen.getByLabelText(/^password/i);
            const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

            fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
            fireEvent.change(confirmPasswordInput, { target: { value: 'Different123!' } });

            expect(screen.getByText(t('signup:passwordsDoNotMatch'))).toBeInTheDocument();
        });

        it('should hide password mismatch error when passwords match again', () => {
            render(<SignupForm />);

            const passwordInput = screen.getByLabelText(/^password/i);
            const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

            fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
            fireEvent.change(confirmPasswordInput, { target: { value: 'Different123!' } });

            expect(screen.getByText(t('signup:passwordsDoNotMatch'))).toBeInTheDocument();

            fireEvent.change(confirmPasswordInput, { target: { value: 'Password123!' } });

            expect(screen.queryByText(t('signup:passwordsDoNotMatch'))).not.toBeInTheDocument();
        });

        it('should set aria-invalid when passwords do not match', () => {
            render(<SignupForm />);

            const passwordInput = screen.getByLabelText(/^password/i);
            const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

            fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
            fireEvent.change(confirmPasswordInput, { target: { value: 'Different123!' } });

            expect(confirmPasswordInput).toHaveAttribute('aria-invalid', 'true');
        });
    });

    describe('form validation', () => {
        it('should disable submit button when password is invalid', () => {
            mockIsPasswordValid.mockReturnValue(false);
            render(<SignupForm />);

            const passwordInput = screen.getByLabelText(/^password/i);
            const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
            const submitButton = screen.getByRole('button', { name: /create account/i });

            fireEvent.change(passwordInput, { target: { value: 'invalid' } });
            fireEvent.change(confirmPasswordInput, { target: { value: 'invalid' } });

            expect(submitButton).toBeDisabled();
        });

        it('should enable submit button when all fields are valid', () => {
            mockIsPasswordValid.mockReturnValue(true);
            render(<SignupForm />);

            const passwordInput = screen.getByLabelText(/^password/i);
            const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
            const submitButton = screen.getByRole('button', { name: /create account/i });

            fireEvent.change(passwordInput, { target: { value: 'ValidPass123!' } });
            fireEvent.change(confirmPasswordInput, { target: { value: 'ValidPass123!' } });

            expect(submitButton).not.toBeDisabled();
        });

        it('should disable submit button when passwords do not match', () => {
            mockIsPasswordValid.mockReturnValue(true);
            render(<SignupForm />);

            const passwordInput = screen.getByLabelText(/^password/i);
            const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
            const submitButton = screen.getByRole('button', { name: /create account/i });

            fireEvent.change(passwordInput, { target: { value: 'ValidPass123!' } });
            fireEvent.change(confirmPasswordInput, { target: { value: 'Different123!' } });

            expect(submitButton).toBeDisabled();
        });

        it('should disable submit button when password is empty', () => {
            mockIsPasswordValid.mockReturnValue(true);
            render(<SignupForm />);

            const submitButton = screen.getByRole('button', { name: /create account/i });

            expect(submitButton).toBeDisabled();
        });

        it('should change button variant based on form validity', () => {
            mockIsPasswordValid.mockReturnValue(true);
            render(<SignupForm />);

            const passwordInput = screen.getByLabelText(/^password/i);
            const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
            const submitButton = screen.getByRole('button', { name: /create account/i });

            // Initially disabled (secondary variant)
            expect(submitButton).toHaveAttribute('data-variant', 'secondary');

            fireEvent.change(passwordInput, { target: { value: 'ValidPass123!' } });
            fireEvent.change(confirmPasswordInput, { target: { value: 'ValidPass123!' } });

            // Should switch to default variant when valid
            expect(submitButton).toHaveAttribute('data-variant', 'default');
        });
    });

    describe('input interactions', () => {
        it('should update password value on change', () => {
            render(<SignupForm />);

            const passwordInput = screen.getByLabelText(/^password/i);
            fireEvent.change(passwordInput, { target: { value: 'NewPassword123!' } });

            expect(passwordInput).toHaveValue('NewPassword123!');
        });

        it('should update confirm password value on change', () => {
            render(<SignupForm />);

            const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
            fireEvent.change(confirmPasswordInput, { target: { value: 'NewPassword123!' } });

            expect(confirmPasswordInput).toHaveValue('NewPassword123!');
        });

        it('should maintain state across multiple changes', () => {
            render(<SignupForm />);

            const passwordInput = screen.getByLabelText(/^password/i);

            fireEvent.change(passwordInput, { target: { value: 'Pass1' } });
            expect(passwordInput).toHaveValue('Pass1');

            fireEvent.change(passwordInput, { target: { value: 'Pass2' } });
            expect(passwordInput).toHaveValue('Pass2');

            fireEvent.change(passwordInput, { target: { value: 'Pass3' } });
            expect(passwordInput).toHaveValue('Pass3');
        });
    });

    describe('edge cases', () => {
        it('should handle empty password input', () => {
            render(<SignupForm />);

            const passwordInput = screen.getByLabelText(/^password/i);
            fireEvent.change(passwordInput, { target: { value: '' } });

            expect(passwordInput).toHaveValue('');
            expect(screen.getByTestId('password-requirement')).toBeInTheDocument();
        });

        it('should handle special characters in password', () => {
            render(<SignupForm />);

            const passwordInput = screen.getByLabelText(/^password/i);
            const specialPassword = 'P@ssw0rd!#$%^&*()';

            fireEvent.change(passwordInput, { target: { value: specialPassword } });

            expect(passwordInput).toHaveValue(specialPassword);
        });

        it('should handle very long passwords', () => {
            render(<SignupForm />);

            const passwordInput = screen.getByLabelText(/^password/i);
            const longPassword = `${'A'.repeat(100)}1!`;

            fireEvent.change(passwordInput, { target: { value: longPassword } });

            expect(passwordInput).toHaveValue(longPassword);
        });
    });
});
