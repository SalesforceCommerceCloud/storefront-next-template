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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { createActionArgs, createLoaderArgs } from '@/lib/test-utils';
import ResetPassword, { loader, action } from './_empty.reset-password';
import { resetPasswordWithToken, loginRegisteredUser, updateAuth } from '@/middlewares/auth.server';
import { isPasswordValid } from '@/lib/utils';
import { readPasswordResetEmailCookie } from '@/lib/auth/remembered-email-cookie.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

const { t } = getTranslation();

// Mock the auth middleware
vi.mock('@/middlewares/auth.server', () => ({
    resetPasswordWithToken: vi.fn(),
    loginRegisteredUser: vi.fn(),
    updateAuth: vi.fn(),
}));

// Mock utils
vi.mock('@/lib/utils', async () => {
    const actual = await vi.importActual('@/lib/utils');
    return {
        ...actual,
        isPasswordValid: vi.fn(),
    };
});

vi.mock('@/lib/auth/remembered-email-cookie.server', () => ({
    readPasswordResetEmailCookie: vi.fn(),
    clearPasswordResetEmailCookie: vi.fn(() => Promise.resolve('cc-pwreset-email_Site=; Max-Age=0')),
}));

// Mock PasswordRequirement component to avoid needing to deal with its complexity
vi.mock('@/components/password-requirements', () => ({
    PasswordRequirement: () => null,
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    })),
}));

// Mock buildUrlFromContext to pass-through (avoids needing full context setup)
vi.mock('@/lib/url.server', () => ({
    buildUrlFromContext: vi.fn((to: string) => to),
}));

// Helper to render with createRoutesStub (provides full data router context for Form/Link components)
const renderWithRoutesStub = (loaderData: { token: string; email: string }) => {
    // Wrap the component to pass loaderData as a prop
    const WrappedComponent = () => <ResetPassword loaderData={loaderData} />;
    const Stub = createRoutesStub([
        {
            path: '/',
            Component: WrappedComponent,
        },
    ]);
    return render(
        <AllProvidersWrapper>
            <Stub initialEntries={['/']} />
        </AllProvidersWrapper>
    );
};

// Helper to render with createRoutesStub and real action for full-flow tests
const renderWithAction = (loaderData: { token: string; email: string }) => {
    const WrappedComponent = () => <ResetPassword loaderData={loaderData} />;
    const Stub = createRoutesStub([
        {
            path: '/',
            Component: WrappedComponent,
            action: async ({ request }) =>
                action(createActionArgs(request, mockContext, { pattern: '/reset-password' })),
        },
    ]);
    return render(
        <AllProvidersWrapper>
            <Stub initialEntries={['/']} />
        </AllProvidersWrapper>
    );
};

const mockContext = {
    get: vi.fn(),
    set: vi.fn(),
} as any;

const mockResetPasswordWithToken = vi.mocked(resetPasswordWithToken);
const mockLoginRegisteredUser = vi.mocked(loginRegisteredUser);
const mockUpdateAuth = vi.mocked(updateAuth);
const mockIsPasswordValid = vi.mocked(isPasswordValid);
const mockReadPasswordResetEmailCookie = vi.mocked(readPasswordResetEmailCookie);

describe('reset-password route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('loader', () => {
        it('should use the email remembered when the reset link was requested', async () => {
            mockReadPasswordResetEmailCookie.mockResolvedValue('Shopper+Tag@example.com');
            const mockRequest = new Request('http://localhost/reset-password?token=abc123');
            const result = await loader(createLoaderArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

            expect(result).toEqual({ token: 'abc123', email: 'Shopper+Tag@example.com' });
        });

        it('should return an empty email so the shopper can enter it when none is remembered', async () => {
            mockReadPasswordResetEmailCookie.mockResolvedValue(undefined);
            const mockRequest = new Request('http://localhost/reset-password?token=abc123');
            const result = await loader(createLoaderArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

            expect(result).toEqual({ token: 'abc123', email: '' });
        });

        it('should ignore an email in the link and use the remembered one', async () => {
            mockReadPasswordResetEmailCookie.mockResolvedValue('Shopper+Tag@example.com');
            const mockRequest = new Request('http://localhost/reset-password?token=abc123&email=other@example.com');
            const result = await loader(createLoaderArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

            expect(result).toEqual({ token: 'abc123', email: 'Shopper+Tag@example.com' });
        });

        it('should ignore an email in the link when none is remembered', async () => {
            mockReadPasswordResetEmailCookie.mockResolvedValue(undefined);
            const mockRequest = new Request('http://localhost/reset-password?token=abc123&email=other@example.com');
            const result = await loader(createLoaderArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

            expect(result).toEqual({ token: 'abc123', email: '' });
        });

        it('should redirect to forgot-password when token is missing', async () => {
            const mockRequest = new Request('http://localhost/reset-password?email=test@example.com');
            const result = await loader(createLoaderArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

            expect(result).toBeInstanceOf(Response);
            if (result instanceof Response) {
                expect(result.status).toBe(302);
                expect(result.headers.get('Location')).toBe('/forgot-password');
            }
        });
    });

    describe('action', () => {
        describe('validation errors', () => {
            it('should redirect to forgot-password when token is missing', async () => {
                const formData = new URLSearchParams();
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const result = await action(createActionArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

                expect(result).toBeInstanceOf(Response);
                if (result instanceof Response) {
                    expect(result.status).toBe(302);
                    const location = result.headers.get('Location');
                    // Token is critical - redirect to forgot-password page with generic error
                    expect(location).toBe('/forgot-password');
                }
            });

            it('should return specific error when email is missing', async () => {
                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const result = await action(createActionArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
            });

            it('should return specific error when newPassword is missing', async () => {
                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const result = await action(createActionArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
            });

            it('should return specific error when confirmPassword is missing', async () => {
                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const result = await action(createActionArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
            });

            it('should return specific error when passwords do not match', async () => {
                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Different456!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const result = await action(createActionArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('resetPassword:passwordsMustMatch'),
                });
            });

            it('should return specific error when password is not strong enough', async () => {
                mockIsPasswordValid.mockReturnValue(false);

                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'weak');
                formData.append('confirmPassword', 'weak');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const result = await action(createActionArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

                expect(mockIsPasswordValid).toHaveBeenCalledWith('weak');
                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('signup:passwordNotSecure'),
                });
            });
        });

        describe('successful password reset', () => {
            it('should redirect to login on successful password reset and auto-login with new password', async () => {
                mockIsPasswordValid.mockReturnValue(true);
                mockResetPasswordWithToken.mockResolvedValue({ data: undefined, response: new Response() });
                const mockAuthResponse = {
                    accessToken: 'new-access-token',
                    refreshToken: 'new-refresh-token',
                    usid: 'new-usid',
                    customerId: 'customer-123',
                };
                mockLoginRegisteredUser.mockResolvedValue(mockAuthResponse as any);

                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const result = await action(createActionArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

                expect(mockIsPasswordValid).toHaveBeenCalledWith('Test123!');
                expect(mockResetPasswordWithToken).toHaveBeenCalledWith(mockContext, {
                    email: 'test@example.com',
                    token: 'abc123',
                    newPassword: 'Test123!',
                });

                // Verify auto-login was attempted
                expect(mockLoginRegisteredUser).toHaveBeenCalledWith(mockContext, 'test@example.com', 'Test123!', {
                    skipUsid: true,
                });
                expect(mockUpdateAuth).toHaveBeenCalledWith(mockContext, mockAuthResponse);

                expect(result).toBeInstanceOf(Response);
                if (result instanceof Response) {
                    expect(result.status).toBe(302);
                    const location = result.headers.get('Location');
                    expect(location).toBe('/login');
                    expect(result.headers.get('Set-Cookie')).toContain('cc-pwreset-email_Site=;');
                }
            });
        });

        describe('API errors', () => {
            it('should return invalidToken error when the API reports an invalid token', async () => {
                mockIsPasswordValid.mockReturnValue(true);
                mockResetPasswordWithToken.mockRejectedValue(new Error('Invalid token'));

                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const result = await action(createActionArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

                expect(mockResetPasswordWithToken).toHaveBeenCalled();
                // "Invalid token" matches INVALID_TOKEN_ERROR — shows user-friendly invalid-token message
                expect(result).toEqual({
                    error: t('errors:invalidToken'),
                });
            });
        });

        describe('edge cases', () => {
            it('should redirect to forgot-password when token is empty string', async () => {
                const formData = new URLSearchParams();
                formData.append('token', '');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const result = await action(createActionArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

                expect(result).toBeInstanceOf(Response);
                if (result instanceof Response) {
                    const location = result.headers.get('Location');
                    // Empty token is treated as missing token - redirect with generic error
                    expect(location).toBe('/forgot-password');
                }
            });

            it('should handle empty newPassword with specific error', async () => {
                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', '');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const result = await action(createActionArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
            });

            it('should handle empty confirmPassword with specific error', async () => {
                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', '');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const result = await action(createActionArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
            });

            it('should return error data for validation failure with special characters', async () => {
                const formData = new URLSearchParams();
                formData.append('token', 'abc+123/xyz=');
                formData.append('email', 'test+user@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Different456!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const result = await action(createActionArgs(mockRequest, mockContext, { pattern: '/reset-password' }));

                // Passwords don't match - should return error data
                expect(result).toEqual({
                    error: t('resetPassword:passwordsMustMatch'),
                });
            });
        });
    });

    describe('Component', () => {
        it('should render form with all required elements', () => {
            const loaderData = {
                token: 'test-token-123',
                email: 'test@example.com',
            };

            renderWithRoutesStub(loaderData);

            expect(screen.getByRole('heading', { name: t('resetPassword:title') })).toBeInTheDocument();
            expect(screen.getByLabelText(t('resetPassword:emailLabel'))).toBeInTheDocument();
            expect(screen.getByLabelText(t('resetPassword:newPasswordLabel'))).toBeInTheDocument();
            expect(screen.getByLabelText(t('resetPassword:confirmPasswordLabel'))).toBeInTheDocument();
            expect(screen.getByRole('button', { name: t('resetPassword:resetPasswordButton') })).toBeInTheDocument();
        });

        it('should display error when passwords do not match', async () => {
            const user = userEvent.setup();
            mockIsPasswordValid.mockReturnValue(true);

            const loaderData = {
                token: 'test-token-123',
                email: 'test@example.com',
            };

            renderWithAction(loaderData);

            await user.type(screen.getByLabelText(t('resetPassword:newPasswordLabel')), 'Test123!');
            await user.type(screen.getByLabelText(t('resetPassword:confirmPasswordLabel')), 'Different456!');

            const submitButton = screen.getByRole('button', { name: t('resetPassword:resetPasswordButton') });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(t('resetPassword:passwordsMustMatch'))).toBeInTheDocument();
            });
        });

        // Note: "password not strong enough" validation is tested in action unit tests.
        // Full-flow testing is not possible here because client-side validation in
        // usePasswordValidation hook disables the submit button for weak passwords.

        it('should ask for the email when it is not remembered and submit what the shopper enters', async () => {
            const user = userEvent.setup();
            mockIsPasswordValid.mockReturnValue(true);
            mockResetPasswordWithToken.mockRejectedValue(new Error('Invalid token'));

            renderWithAction({ token: 'test-token-123', email: '' });

            const emailInput = screen.getByLabelText(t('resetPassword:emailLabel'));
            expect(emailInput).toBeEnabled();
            await user.type(emailInput, 'typed@example.com');
            await user.type(screen.getByLabelText(t('resetPassword:newPasswordLabel')), 'Test123!');
            await user.type(screen.getByLabelText(t('resetPassword:confirmPasswordLabel')), 'Test123!');
            await user.click(screen.getByRole('button', { name: t('resetPassword:resetPasswordButton') }));

            await waitFor(() => {
                expect(mockResetPasswordWithToken).toHaveBeenCalledWith(mockContext, {
                    email: 'typed@example.com',
                    token: 'test-token-123',
                    newPassword: 'Test123!',
                });
            });
        });

        it('should display invalidToken error when API reports an invalid token', async () => {
            const user = userEvent.setup();
            mockIsPasswordValid.mockReturnValue(true);
            mockResetPasswordWithToken.mockRejectedValue(new Error('Invalid token'));

            const loaderData = {
                token: 'test-token-123',
                email: 'test@example.com',
            };

            renderWithAction(loaderData);

            await user.type(screen.getByLabelText(t('resetPassword:newPasswordLabel')), 'Test123!');
            await user.type(screen.getByLabelText(t('resetPassword:confirmPasswordLabel')), 'Test123!');

            const submitButton = screen.getByRole('button', { name: t('resetPassword:resetPasswordButton') });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(t('errors:invalidToken'))).toBeInTheDocument();
            });
        });

        it('should not show error on initial render', () => {
            const loaderData = {
                token: 'test-token-123',
                email: 'test@example.com',
            };

            renderWithRoutesStub(loaderData);

            // No error should be visible initially (check for error container class)
            expect(screen.queryByText(/went wrong/i)).not.toBeInTheDocument();
        });
    });
});
