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
vi.mock('@/lib/auth/remembered-email-cookie.server', () => ({
    serializePasswordResetEmailCookie: vi.fn((_context: unknown, email: string) =>
        Promise.resolve(`cc-pwreset-email_Site=${encodeURIComponent(email)}; HttpOnly`)
    ),
}));

// The response-time floor is covered in its own tests; here it would only slow every case by a second.
vi.mock('@/lib/auth/response-time-floor.server', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/auth/response-time-floor.server')>()),
    withMinimumDuration: vi.fn(<T,>(_minMs: number, work: () => Promise<T>) => work()),
}));

// Successful requests return data() so they can set the remembered-email cookie
const getActionData = (result: unknown) =>
    result && typeof result === 'object' && 'data' in result ? (result as { data: unknown }).data : result;

vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(),
    getPasswordResetToken: vi.fn(),
}));

// Mock buildUrlFromContext to pass-through (avoids needing full context setup)
vi.mock('@/lib/url.server', () => ({
    buildUrlFromContext: vi.fn((to: string) => to),
}));

const mockLogger = vi.hoisted(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => mockLogger),
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
                expect(getActionData(result)).toEqual({
                    success: true,
                    email: 'test@example.com',
                });
                // Remembers the email for the reset page, since the reset link doesn't carry it
                const init = (result as { init?: ResponseInit }).init;
                expect(new Headers(init?.headers).get('Set-Cookie')).toBe(
                    'cc-pwreset-email_Site=test%40example.com; HttpOnly'
                );
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
                expect(getActionData(result)).toEqual({
                    success: true,
                    email: 'test+user@example.com',
                });
            });
        });

        describe('account enumeration', () => {
            const submit = async (email: string) => {
                const mockRequest = new Request('http://localhost/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ email }).toString(),
                });
                return action({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'forgot-password',
                });
            };

            const setCookieOf = (result: unknown) =>
                new Headers((result as { init?: ResponseInit }).init?.headers).get('Set-Cookie');

            // Every way the send can end for an account that is not (or cannot be) reset
            const suppressedFailures: Array<[string, Error]> = [
                ['unknown account', new Error('Email not found')],
                ['generic API error', new Error('API Error')],
                ['Marketing Cloud failure', new Error('Marketing Cloud API Error')],
                ['network failure', new Error('Network timeout')],
                ['invalid token style error', new Error('Invalid authentication token provided.')],
                ['rate limit', new Error('Too many password reset requests. Please try again later.')],
                ['monthly quota', new Error('Monthly quota exceeded for password resets')],
            ];

            it.each(
                suppressedFailures
            )('returns the same response and Set-Cookie as a successful send for %s', async (_label, failure) => {
                const email = 'someone@example.com';

                vi.mocked(getPasswordResetToken).mockResolvedValueOnce({
                    data: undefined,
                    response: Response.json({}),
                });
                const known = await submit(email);

                vi.mocked(getPasswordResetToken).mockRejectedValueOnce(failure);
                const suppressed = await submit(email);

                expect(getActionData(suppressed)).toEqual(getActionData(known));
                expect(getActionData(suppressed)).toEqual({ success: true, email });
                expect(setCookieOf(suppressed)).toBe('cc-pwreset-email_Site=someone%40example.com; HttpOnly');
                expect(setCookieOf(suppressed)).toBe(setCookieOf(known));
            });

            it('does not surface any error to the client when the send fails', async () => {
                vi.mocked(getPasswordResetToken).mockRejectedValueOnce(new Error('Email not found'));

                const result = await submit('nonexistent@example.com');

                expect(getActionData(result)).not.toHaveProperty('error');
            });

            it('still logs the suppressed failure server-side', async () => {
                const failure = new Error('Email not found');
                vi.mocked(getPasswordResetToken).mockRejectedValueOnce(failure);

                await submit('nonexistent@example.com');

                expect(mockLogger.error).toHaveBeenCalledWith(
                    expect.stringContaining('ForgotPassword'),
                    expect.objectContaining({ error: failure })
                );
            });

            it('never puts the raw email in a log line', async () => {
                vi.mocked(getPasswordResetToken).mockRejectedValueOnce(new Error('Email not found'));

                await submit('nonexistent@example.com');

                const logged = JSON.stringify([...mockLogger.info.mock.calls, ...mockLogger.error.mock.calls]);
                expect(logged).not.toContain('nonexistent@example.com');
            });

            it.each([
                ['no callback_uri is registered', 'No callback_uri is registered for this client'],
                ['callback_uri mismatch', "Callback_uri doesn't match the registered value"],
            ])('still surfaces feature-unavailable (%s) because it is a client-level configuration check', async (_l, msg) => {
                vi.mocked(getPasswordResetToken).mockRejectedValueOnce(new Error(msg));

                const result = await submit('someone@example.com');

                expect(getActionData(result)).toEqual({ error: t('errors:featureUnavailable') });
                // No remembered-email cookie for a request that could not be sent for any account
                expect(setCookieOf(result)).toBeNull();
            });
        });

        describe('response time', () => {
            const submit = async (formData: URLSearchParams) => {
                const mockRequest = new Request('http://localhost/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData.toString(),
                });
                return action({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'forgot-password',
                });
            };

            it('runs known and unknown email outcomes inside the response-time floor', async () => {
                const { withMinimumDuration, PASSWORD_RESET_MIN_RESPONSE_MS } = await import(
                    '@/lib/auth/response-time-floor.server'
                );
                vi.mocked(withMinimumDuration).mockClear();

                vi.mocked(getPasswordResetToken).mockResolvedValueOnce(undefined as any);
                await submit(new URLSearchParams({ email: 'known@example.com' }));
                vi.mocked(getPasswordResetToken).mockRejectedValueOnce(new Error('Email not found'));
                await submit(new URLSearchParams({ email: 'unknown@example.com' }));

                expect(withMinimumDuration).toHaveBeenCalledTimes(2);
                expect(withMinimumDuration).toHaveBeenCalledWith(PASSWORD_RESET_MIN_RESPONSE_MS, expect.any(Function));
            });

            it('does not pad a request with no email (it reveals nothing about any account)', async () => {
                const { withMinimumDuration } = await import('@/lib/auth/response-time-floor.server');
                vi.mocked(withMinimumDuration).mockClear();

                await submit(new URLSearchParams({}));

                expect(withMinimumDuration).not.toHaveBeenCalled();
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

                expect(getActionData(result)).toEqual({
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

                expect(getActionData(result)).toEqual({
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
