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
import { render, screen } from '@testing-library/react';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();
import ForgotPassword, { loader, action } from './_empty.forgot-password';
import { getAuth, getPasswordResetToken } from '@/middlewares/auth.server';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

// Mock dependencies
vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(),
    getPasswordResetToken: vi.fn(),
}));

// Mock buildUrlFromContext to pass-through (avoids needing full context setup)
vi.mock('@/lib/url.server', () => ({
    buildUrlFromContext: vi.fn((to: string) => to),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    })),
}));

// Mock the form component
vi.mock('@/components/forgot-password-form', () => ({
    ForgotPasswordForm: ({ error }: { error?: string }) => (
        <div data-testid="forgot-password-form">
            {error && <div data-testid="form-error">{error}</div>}
            <input type="email" name="email" aria-label="Email" />
            <button type="submit">Send Reset Link</button>
        </div>
    ),
}));

// Helper to render with router
const renderWithRouter = (component: React.ReactElement) => {
    return render(
        <AllProvidersWrapper>
            <MemoryRouter>{component}</MemoryRouter>
        </AllProvidersWrapper>
    );
};

describe('forgot-password route', () => {
    const mockContext = {} as never;

    beforeEach(() => {
        vi.clearAllMocks();
        // Use vi.spyOn to mock useActionData while keeping real router exports
        vi.spyOn(ReactRouter, 'useActionData').mockReturnValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('loader', () => {
        it('should redirect to login when user is registered', () => {
            const mockGetAuth = vi.mocked(getAuth);
            mockGetAuth.mockReturnValue({
                userType: 'registered',
                access_token: 'token123',
            } as ReturnType<typeof getAuth>);

            const mockRequest = new Request('http://localhost/forgot-password');
            const args = {
                request: mockRequest,
                url: new URL(mockRequest.url),
                params: { siteId: 'test-site', localeId: 'en-US' },
                context: mockContext,
                pattern: 'forgot-password',
            };

            const result = loader(args);

            expect(result).toBeInstanceOf(Response);
            if (result instanceof Response) {
                expect(result.status).toBe(302);
                expect(result.headers.get('Location')).toBe('/login');
            }
        });

        it('should return void when user is guest', () => {
            const mockGetAuth = vi.mocked(getAuth);
            mockGetAuth.mockReturnValue({
                userType: 'guest',
            } as ReturnType<typeof getAuth>);

            const mockRequest = new Request('http://localhost/forgot-password');
            const args = {
                request: mockRequest,
                url: new URL(mockRequest.url),
                params: { siteId: 'test-site', localeId: 'en-US' },
                context: mockContext,
                pattern: 'forgot-password',
            };

            const result = loader(args);

            expect(result).toBeUndefined();
        });

        it('should return void when user is not authenticated', () => {
            const mockGetAuth = vi.mocked(getAuth);
            mockGetAuth.mockReturnValue({
                userType: undefined,
            } as ReturnType<typeof getAuth>);

            const mockRequest = new Request('http://localhost/forgot-password');
            const args = {
                request: mockRequest,
                url: new URL(mockRequest.url),
                params: { siteId: 'test-site', localeId: 'en-US' },
                context: mockContext,
                pattern: 'forgot-password',
            };

            const result = loader(args);

            expect(result).toBeUndefined();
        });
    });

    describe('action', () => {
        describe('validation', () => {
            it('should return error when email is missing', async () => {
                const formData = new URLSearchParams();

                const mockRequest = new Request('http://localhost/forgot-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args = {
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'forgot-password',
                };

                const result = await action(args);

                expect(result).toEqual({
                    error: t('resetPassword:emailRequired'),
                });
            });

            it('should return error when email is empty string', async () => {
                const formData = new URLSearchParams();
                formData.append('email', '');

                const mockRequest = new Request('http://localhost/forgot-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args = {
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'forgot-password',
                };

                const result = await action(args);

                expect(result).toEqual({
                    error: t('resetPassword:emailRequired'),
                });
            });
        });

        describe('successful password reset request', () => {
            it('should return success with email when reset token is sent', async () => {
                const mockGetPasswordResetToken = vi.mocked(getPasswordResetToken);
                mockGetPasswordResetToken.mockResolvedValue({ data: undefined, response: Response.json({}) });

                const formData = new URLSearchParams();
                formData.append('email', 'test@example.com');

                const mockRequest = new Request('http://localhost/forgot-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args = {
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'forgot-password',
                };

                const result = await action(args);

                expect(mockGetPasswordResetToken).toHaveBeenCalledWith(mockContext, {
                    email: 'test@example.com',
                });
                expect(result).toEqual({
                    success: true,
                    email: 'test@example.com',
                });
            });

            it('should handle email with special characters', async () => {
                const mockGetPasswordResetToken = vi.mocked(getPasswordResetToken);
                mockGetPasswordResetToken.mockResolvedValue({ data: undefined, response: Response.json({}) });

                const formData = new URLSearchParams();
                formData.append('email', 'test+user@example.com');

                const mockRequest = new Request('http://localhost/forgot-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args = {
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'forgot-password',
                };

                const result = await action(args);

                expect(mockGetPasswordResetToken).toHaveBeenCalledWith(mockContext, {
                    email: 'test+user@example.com',
                });
                expect(result).toEqual({
                    success: true,
                    email: 'test+user@example.com',
                });
            });
        });

        describe('API errors', () => {
            it('should return generic error when getPasswordResetToken fails', async () => {
                const mockGetPasswordResetToken = vi.mocked(getPasswordResetToken);
                mockGetPasswordResetToken.mockRejectedValue(new Error('API Error'));

                const formData = new URLSearchParams();
                formData.append('email', 'test@example.com');

                const mockRequest = new Request('http://localhost/forgot-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args = {
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'forgot-password',
                };

                const result = await action(args);

                expect(mockGetPasswordResetToken).toHaveBeenCalledWith(mockContext, {
                    email: 'test@example.com',
                });
                // Should show generic error, not the actual API error
                expect(result).toEqual({
                    error: t('errors:genericTryAgain'),
                });
            });

            it('should return generic error for non-existent email (security)', async () => {
                const mockGetPasswordResetToken = vi.mocked(getPasswordResetToken);
                mockGetPasswordResetToken.mockRejectedValue(new Error('Email not found'));

                const formData = new URLSearchParams();
                formData.append('email', 'nonexistent@example.com');

                const mockRequest = new Request('http://localhost/forgot-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args = {
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'forgot-password',
                };

                const result = await action(args);

                // Should not reveal that email doesn't exist (security best practice)
                expect(result).toEqual({
                    error: t('errors:genericTryAgain'),
                });
            });

            it('should return generic error when Marketing Cloud fails', async () => {
                const mockGetPasswordResetToken = vi.mocked(getPasswordResetToken);
                mockGetPasswordResetToken.mockRejectedValue(new Error('Marketing Cloud API Error'));

                const formData = new URLSearchParams();
                formData.append('email', 'test@example.com');

                const mockRequest = new Request('http://localhost/forgot-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args = {
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'forgot-password',
                };

                const result = await action(args);

                // Should not expose Marketing Cloud error details
                expect(result).toEqual({
                    error: t('errors:genericTryAgain'),
                });
            });
        });

        describe('edge cases', () => {
            it('should handle whitespace-only email', async () => {
                const formData = new URLSearchParams();
                formData.append('email', '   ');

                const mockRequest = new Request('http://localhost/forgot-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args = {
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'forgot-password',
                };

                await action(args);

                // Whitespace-only email should still call the API (let it validate)
                expect(getPasswordResetToken).toHaveBeenCalledWith(mockContext, {
                    email: '   ',
                });
            });

            it('should handle very long email', async () => {
                const mockGetPasswordResetToken = vi.mocked(getPasswordResetToken);
                mockGetPasswordResetToken.mockResolvedValue({ data: undefined, response: Response.json({}) });

                const longEmail = `${'a'.repeat(100)}@example.com`;
                const formData = new URLSearchParams();
                formData.append('email', longEmail);

                const mockRequest = new Request('http://localhost/forgot-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args = {
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'forgot-password',
                };

                const result = await action(args);

                expect(result).toEqual({
                    success: true,
                    email: longEmail,
                });
            });

            it('should handle email with unicode characters', async () => {
                const mockGetPasswordResetToken = vi.mocked(getPasswordResetToken);
                mockGetPasswordResetToken.mockResolvedValue({ data: undefined, response: Response.json({}) });

                const unicodeEmail = 'test@例え.jp';
                const formData = new URLSearchParams();
                formData.append('email', unicodeEmail);

                const mockRequest = new Request('http://localhost/forgot-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args = {
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'forgot-password',
                };

                const result = await action(args);

                expect(result).toEqual({
                    success: true,
                    email: unicodeEmail,
                });
            });
        });
    });

    describe('Route Component', () => {
        let mockUseActionData: ReturnType<typeof vi.fn>;

        beforeEach(async () => {
            const reactRouter = await import('react-router');
            mockUseActionData = vi.mocked(reactRouter.useActionData);
        });

        describe('initial form state', () => {
            it('should render the form when no action data', () => {
                mockUseActionData.mockReturnValue(undefined);

                renderWithRouter(<ForgotPassword />);

                expect(screen.getByTestId('forgot-password-form')).toBeInTheDocument();
            });

            it('should render title and subtitle', () => {
                mockUseActionData.mockReturnValue(undefined);

                renderWithRouter(<ForgotPassword />);

                expect(screen.getByText(t('resetPassword:title'))).toBeInTheDocument();
                expect(screen.getByText(t('resetPassword:subtitle'))).toBeInTheDocument();
            });

            it('should pass error to form component when action returns error', () => {
                const errorMessage = 'Email is required';
                mockUseActionData.mockReturnValue({
                    error: errorMessage,
                });

                renderWithRouter(<ForgotPassword />);

                expect(screen.getByTestId('form-error')).toHaveTextContent(errorMessage);
            });
        });

        describe('success state', () => {
            it('should display success message when email is sent', () => {
                mockUseActionData.mockReturnValue({
                    success: true,
                    email: 'test@example.com',
                });

                renderWithRouter(<ForgotPassword />);

                expect(screen.getByText(t('resetPassword:checkEmailTitle'))).toBeInTheDocument();
                expect(
                    screen.getByText(t('resetPassword:checkEmailDescription', { email: 'test@example.com' }))
                ).toBeInTheDocument();
            });

            it('should display back to sign in button on success', () => {
                mockUseActionData.mockReturnValue({
                    success: true,
                    email: 'test@example.com',
                });

                renderWithRouter(<ForgotPassword />);

                const backButton = screen.getByRole('button', { name: t('resetPassword:backToSignIn') });
                expect(backButton).toBeInTheDocument();

                // Button should be wrapped in a Link to /login
                const linkElement = backButton.closest('a');
                expect(linkElement).toHaveAttribute('href', '/global/en-GB/login');
            });

            it('should not display the form on success', () => {
                mockUseActionData.mockReturnValue({
                    success: true,
                    email: 'test@example.com',
                });

                renderWithRouter(<ForgotPassword />);

                // Form component should not be rendered
                expect(screen.queryByTestId('forgot-password-form')).not.toBeInTheDocument();
            });

            it('should display email in success message', () => {
                const testEmail = 'user@example.com';
                mockUseActionData.mockReturnValue({
                    success: true,
                    email: testEmail,
                });

                renderWithRouter(<ForgotPassword />);

                expect(
                    screen.getByText(t('resetPassword:checkEmailDescription', { email: testEmail }))
                ).toBeInTheDocument();
            });

            it('should handle email with special characters in success message', () => {
                const testEmail = 'test+user@example.com';
                mockUseActionData.mockReturnValue({
                    success: true,
                    email: testEmail,
                });

                renderWithRouter(<ForgotPassword />);

                expect(
                    screen.getByText(t('resetPassword:checkEmailDescription', { email: testEmail }))
                ).toBeInTheDocument();
            });

            it('should not render success state without email', () => {
                mockUseActionData.mockReturnValue({
                    success: true,
                    email: undefined,
                });

                renderWithRouter(<ForgotPassword />);

                // Should render form instead of success message
                expect(screen.getByTestId('forgot-password-form')).toBeInTheDocument();
                expect(screen.queryByText(t('resetPassword:checkEmailTitle'))).not.toBeInTheDocument();
            });
        });
    });
});
