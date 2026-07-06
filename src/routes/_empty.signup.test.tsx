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
import Signup, { loader, action } from './_empty.signup';
import { registerCustomer } from '@/lib/api/auth/register.server';
import { isPasswordValid } from '@/lib/utils';
import { getAuth, authorizePasswordless, requestOtp } from '@/middlewares/auth.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { createTestContext } from '@/lib/test-utils';
import { getLoginPreferences } from '@/lib/login-preferences.server';
import type { Route } from '../+types/root';

const { t } = getTranslation();

// Mock the auth API
vi.mock('@/lib/api/auth/register.server', () => ({
    registerCustomer: vi.fn(),
}));

// Mock utils
vi.mock('@/lib/utils', async () => {
    const actual = await vi.importActual('@/lib/utils');
    return {
        ...actual,
        isPasswordValid: vi.fn(),
    };
});

// Mock auth middleware
vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(),
    authorizePasswordless: vi.fn(),
    requestOtp: vi.fn(),
}));

vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>();
    return {
        ...actual,
        getConfig: vi.fn(),
    };
});

vi.mock('@/lib/login-preferences.server', () => ({
    getLoginPreferences: vi.fn(),
}));

vi.mock('@/middlewares/auth.utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/middlewares/auth.utils')>();
    return {
        ...actual,
        isTrackingConsentEnabled: vi.fn(() => false),
    };
});

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    })),
}));

// Mock OTP modal to expose props for assertion
vi.mock('@/components/login/otp-modal', () => ({
    __esModule: true,
    default: ({
        isOpen,
        onClose,
        onResendCode,
        verifyActionUrl,
    }: {
        isOpen: boolean;
        onClose: () => void;
        onResendCode?: () => Promise<void>;
        verifyActionUrl?: string;
    }) =>
        isOpen ? (
            <div data-testid="otp-modal" data-verify-action-url={verifyActionUrl}>
                <button onClick={onClose}>Close</button>
                {onResendCode && <button onClick={() => void onResendCode()}>Resend</button>}
            </div>
        ) : null,
}));

// Mock PasswordRequirement component to avoid needing to deal with its complexity
vi.mock('@/components/password-requirements', () => ({
    PasswordRequirement: () => null,
}));

const mockNavigate = vi.fn();
vi.mock('@/hooks/use-navigate', () => ({
    useNavigate: () => mockNavigate,
}));

const defaultLoaderData = {
    showOTPModal: false,
    email: '',
    firstName: '',
    lastName: '',
    returnUrl: '/',
    isPasswordlessEnabled: false,
    otpLength: 6,
    registrationMode: '',
};

// Helper to render with createRoutesStub (provides full data router context for Form/Link components)
const renderWithRoutesStub = (
    loaderData: {
        showOTPModal: boolean;
        email: string;
        firstName: string;
        lastName: string;
        returnUrl: string;
        isPasswordlessEnabled: boolean;
        otpLength: number;
        registrationMode: string;
    } = defaultLoaderData
) => {
    const WrappedComponent = () => <Signup loaderData={loaderData} />;
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

const mockRegisterCustomer = vi.mocked(registerCustomer);
const mockIsPasswordValid = vi.mocked(isPasswordValid);
const mockGetAuth = vi.mocked(getAuth);
const mockGetConfig = vi.mocked(getConfig);
const mockGetLoginPreferences = vi.mocked(getLoginPreferences);

describe('signup route', () => {
    const mockContext = createTestContext();

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetConfig.mockReturnValue({
            commerce: { api: { privateKeyEnabled: false } },
            features: { passwordlessLogin: { mode: 'email' } },
            auth: { otpLength: 6 },
        } as any);
        mockGetLoginPreferences.mockResolvedValue({ emailVerificationEnabled: false });
        mockNavigate.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('loader', () => {
        it('should redirect to home when user is already registered', async () => {
            mockGetAuth.mockReturnValue({
                userType: 'registered',
            } as any);

            const mockRequest = new Request('http://localhost/signup');
            const args = {
                request: mockRequest,
                url: new URL(mockRequest.url),
                params: { siteId: 'test-site', localeId: 'en-US' },
                context: mockContext,
                pattern: 'signup',
            };

            const result = await loader(args);

            expect(mockGetAuth).toHaveBeenCalledWith(mockContext);
            expect(result).toBeInstanceOf(Response);
            if (result instanceof Response) {
                expect(result.status).toBe(302);
                expect(result.headers.get('Location')).toBe('/');
            }
        });

        it('should return loader data when user is not registered', async () => {
            mockGetAuth.mockReturnValue({
                userType: 'guest',
            } as any);
            const mockRequest = new Request('http://localhost/signup');
            const args = {
                request: mockRequest,
                url: new URL(mockRequest.url),
                params: { siteId: 'test-site', localeId: 'en-US' },
                context: mockContext,
                pattern: 'signup',
            };

            const result = await loader(args);

            expect(result).toMatchObject({
                showOTPModal: false,
                email: '',
                firstName: '',
                lastName: '',
                returnUrl: '/',
                isPasswordlessEnabled: false,
                otpLength: 6,
                registrationMode: '',
            });
        });

        it('should not redirect when registered user has otp=true in URL', async () => {
            mockGetAuth.mockReturnValue({ userType: 'registered' } as any);

            const mockRequest = new Request('http://localhost/signup?otp=true');
            const args = {
                request: mockRequest,
                url: new URL(mockRequest.url),
                params: { siteId: 'test-site', localeId: 'en-US' },
                context: mockContext,
                pattern: 'signup',
            };

            const result = await loader(args);

            // Returns a loader data object instead of a redirect response
            expect(result).not.toBeInstanceOf(Response);
            expect(result).toMatchObject({
                showOTPModal: true,
            });
        });

        it('should read firstName, lastName, email, and returnUrl from URL params', async () => {
            const mockRequest = new Request(
                'http://localhost/signup?otp=true&email=test%40example.com&firstName=Jane&lastName=Smith&returnUrl=%2Fcheckout'
            );
            const args = {
                request: mockRequest,
                url: new URL(mockRequest.url),
                params: { siteId: 'test-site', localeId: 'en-US' },
                context: mockContext,
                pattern: 'signup',
            };

            const result = await loader(args);

            expect(result).toMatchObject({
                showOTPModal: true,
                email: 'test@example.com',
                firstName: 'Jane',
                lastName: 'Smith',
                returnUrl: '/checkout',
            });
        });

        it('should read registrationMode from URL params', async () => {
            mockGetAuth.mockReturnValue({ userType: 'registered' } as any);

            const mockRequest = new Request(
                'http://localhost/signup?otp=true&email=test%40example.com&registrationMode=password'
            );
            const args = {
                request: mockRequest,
                url: new URL(mockRequest.url),
                params: { siteId: 'test-site', localeId: 'en-US' },
                context: mockContext,
                pattern: 'signup',
            };

            const result = await loader(args);

            expect(result).toMatchObject({
                registrationMode: 'password',
            });
        });

        it('should set isPasswordlessEnabled true when emailVerificationEnabled is true in login preferences', async () => {
            mockGetAuth.mockReturnValue({
                userType: 'guest',
            } as any);
            mockGetLoginPreferences.mockResolvedValue({ emailVerificationEnabled: true });

            const mockRequest = new Request('http://localhost/signup');
            const args = {
                request: mockRequest,
                url: new URL(mockRequest.url),
                params: { siteId: 'test-site', localeId: 'en-US' },
                context: mockContext,
                pattern: 'signup',
            };

            const result = await loader(args);

            expect(mockGetAuth).toHaveBeenCalledWith(mockContext);
            expect(result).toMatchObject({ isPasswordlessEnabled: true });
        });
    });

    describe('action', () => {
        beforeEach(() => {
            mockGetAuth.mockReturnValue({
                userType: 'guest',
                customerId: 'test-customer-123',
            } as any);
        });

        describe('validation errors', () => {
            it('should return error when firstName is missing', async () => {
                const formData = new URLSearchParams();
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('password', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/signup', {
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
                    pattern: 'signup',
                };

                const result = await action(args);

                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
                expect(mockRegisterCustomer).not.toHaveBeenCalled();
            });

            it('should return error when lastName is missing', async () => {
                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('email', 'test@example.com');
                formData.append('password', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/signup', {
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
                    pattern: 'signup',
                };

                const result = await action(args);

                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
                expect(mockRegisterCustomer).not.toHaveBeenCalled();
            });

            it('should return error when email is missing', async () => {
                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('password', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/signup', {
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
                    pattern: 'signup',
                };

                const result = await action(args);

                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
                expect(mockRegisterCustomer).not.toHaveBeenCalled();
            });

            it('should return error when password is missing', async () => {
                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/signup', {
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
                    pattern: 'signup',
                };

                const result = await action(args);

                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
                expect(mockRegisterCustomer).not.toHaveBeenCalled();
            });

            it('should return error when confirmPassword is missing', async () => {
                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('password', 'Test123!');

                const mockRequest = new Request('http://localhost/signup', {
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
                    pattern: 'signup',
                };

                const result = await action(args);

                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
                expect(mockRegisterCustomer).not.toHaveBeenCalled();
            });

            it('should return error when passwords do not match', async () => {
                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('password', 'Test123!');
                formData.append('confirmPassword', 'Different123!');

                const mockRequest = new Request('http://localhost/signup', {
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
                    pattern: 'signup',
                };

                const result = await action(args);

                expect(result).toEqual({
                    error: t('signup:passwordsDoNotMatch'),
                });
                expect(mockRegisterCustomer).not.toHaveBeenCalled();
            });

            it('should return error when password is not secure', async () => {
                mockIsPasswordValid.mockReturnValue(false);

                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('password', 'weak');
                formData.append('confirmPassword', 'weak');

                const mockRequest = new Request('http://localhost/signup', {
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
                    pattern: 'signup',
                };

                const result = await action(args);

                expect(mockIsPasswordValid).toHaveBeenCalledWith('weak');
                expect(result).toEqual({
                    error: t('signup:passwordNotSecure'),
                });
                expect(mockRegisterCustomer).not.toHaveBeenCalled();
            });
        });

        describe('successful registration', () => {
            it('should redirect to home on successful registration', async () => {
                mockIsPasswordValid.mockReturnValue(true);
                mockRegisterCustomer.mockResolvedValue({ success: true } as any);

                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('password', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/signup', {
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
                    pattern: 'signup',
                };

                const result = await action(args);

                expect(mockIsPasswordValid).toHaveBeenCalledWith('Test123!');
                expect(mockRegisterCustomer).toHaveBeenCalledWith(mockContext, {
                    customer: {
                        firstName: 'John',
                        lastName: 'Doe',
                        login: 'test@example.com',
                        email: 'test@example.com',
                    },
                    password: 'Test123!',
                });
                expect(result).toBeInstanceOf(Response);
                if (result instanceof Response) {
                    expect(result.status).toBe(302);
                    expect(result.headers.get('Location')).toBe('/');
                }
            });

            it('should redirect to returnUrl when provided on successful registration', async () => {
                mockIsPasswordValid.mockReturnValue(true);
                mockRegisterCustomer.mockResolvedValue({ success: true } as any);

                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('password', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/signup?returnUrl=/checkout', {
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
                    pattern: 'signup',
                };

                const result = await action(args);

                expect(mockRegisterCustomer).toHaveBeenCalled();
                expect(result).toBeInstanceOf(Response);
                if (result instanceof Response) {
                    expect(result.status).toBe(302);
                    expect(result.headers.get('Location')).toBe('/checkout');
                }
            });

            it('should not redirect to external returnUrl on successful registration (open redirect prevention)', async () => {
                mockIsPasswordValid.mockReturnValue(true);
                mockRegisterCustomer.mockResolvedValue({ success: true } as any);

                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('password', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/signup?returnUrl=https://evil.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData.toString(),
                });

                const args = {
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'signup',
                };

                const result = await action(args);

                expect(result).toBeInstanceOf(Response);
                if (result instanceof Response) {
                    const location = result.headers.get('Location') ?? '';
                    expect(location).not.toContain('evil.com');
                    expect(result.headers.get('Location')).toBe('/');
                }
            });
        });

        describe('failed registration', () => {
            it('should return error on registration failure', async () => {
                mockIsPasswordValid.mockReturnValue(true);
                mockRegisterCustomer.mockResolvedValue({ success: false, error: 'Email already exists' } as any);

                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('password', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/signup', {
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
                    pattern: 'signup',
                };

                const result = await action(args);

                expect(mockRegisterCustomer).toHaveBeenCalled();
                expect(result).toEqual({
                    error: 'Email already exists',
                });
            });

            it('should return generic error when registration fails without specific error', async () => {
                mockIsPasswordValid.mockReturnValue(true);
                mockRegisterCustomer.mockResolvedValue({ success: false } as any);

                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('password', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/signup', {
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
                    pattern: 'signup',
                };

                const result = await action(args);

                expect(result).toEqual({
                    error: t('errors:genericTryAgain'),
                });
            });
        });

        describe('passwordless registration enabled', () => {
            const mockAuthorizePasswordless = vi.mocked(authorizePasswordless);
            const mockRequestOtp = vi.mocked(requestOtp);

            beforeEach(() => {
                mockGetConfig.mockReturnValue({
                    features: { passwordlessLogin: { mode: 'email' } },
                } as any);
                mockGetLoginPreferences.mockResolvedValue({ emailVerificationEnabled: true });
                mockRequestOtp.mockResolvedValue(undefined);
            });

            it('should call passwordless authorize with registerCustomer: true', async () => {
                mockAuthorizePasswordless.mockResolvedValue(undefined as any);

                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('registrationMode', 'passwordless');

                const mockRequest = new Request('http://localhost/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData.toString(),
                });

                const args = {
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'signup',
                };

                await action(args);

                expect(mockAuthorizePasswordless).toHaveBeenCalledWith(
                    mockContext,
                    expect.objectContaining({
                        userid: 'test@example.com',
                        registerCustomer: true,
                        firstName: 'John',
                        lastName: 'Doe',
                    })
                );
            });

            it('should redirect back to the same page with expected query params', async () => {
                mockAuthorizePasswordless.mockResolvedValue(undefined as any);

                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('registrationMode', 'passwordless');

                const mockRequest = new Request('http://localhost/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData.toString(),
                });

                const result = await action({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'signup',
                });

                expect(result).toBeInstanceOf(Response);
                if (result instanceof Response) {
                    const location = result.headers.get('Location');
                    const url = new URL(location as string, 'http://localhost');
                    expect(url.pathname).toBe('/signup');
                    expect(url.searchParams.get('otp')).toBe('true');
                    expect(url.searchParams.get('email')).toBe('test@example.com');
                    expect(url.searchParams.get('firstName')).toBe('John');
                    expect(url.searchParams.get('lastName')).toBe('Doe');
                    expect(url.searchParams.get('returnUrl')).toBe('/');
                    expect(url.searchParams.get('registrationMode')).toBe('passwordless');
                }
            });

            it('should include returnUrl in redirect when provided', async () => {
                mockAuthorizePasswordless.mockResolvedValue(undefined as any);

                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('registrationMode', 'passwordless');

                const mockRequest = new Request('http://localhost/signup?returnUrl=%2Fcheckout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData.toString(),
                });

                const result = await action({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'signup',
                });

                expect(result).toBeInstanceOf(Response);
                if (result instanceof Response) {
                    const location = result.headers.get('Location');
                    const url = new URL(location as string, 'http://localhost');
                    expect(url.searchParams.get('returnUrl')).toBe('/checkout');
                }
            });

            it('should return error when required fields are missing in passwordless mode', async () => {
                const formData = new URLSearchParams();
                formData.append('email', 'test@example.com');
                formData.append('registrationMode', 'passwordless');

                const mockRequest = new Request('http://localhost/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData.toString(),
                });

                const result = await action({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'signup',
                });

                expect(result).toEqual({ error: t('signup:allFieldsRequired') });
                expect(mockAuthorizePasswordless).not.toHaveBeenCalled();
            });

            it('should return error when passwordless authorize throws', async () => {
                mockAuthorizePasswordless.mockRejectedValue(new Error('API Error 404: Not Found'));

                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('registrationMode', 'passwordless');

                const mockRequest = new Request('http://localhost/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData.toString(),
                });

                const result = await action({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'signup',
                });

                expect(result).toHaveProperty('error');
                expect(mockAuthorizePasswordless).toHaveBeenCalled();
            });

            it('should redirect to OTP page for password registration', async () => {
                mockIsPasswordValid.mockReturnValue(true);
                mockRegisterCustomer.mockResolvedValue({ success: true } as any);

                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('password', 'Test123!');
                formData.append('confirmPassword', 'Test123!');
                formData.append('registrationMode', 'password');

                const mockRequest = new Request('http://localhost/signup?returnUrl=/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData.toString(),
                });

                const result = await action({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'signup',
                });

                expect(mockAuthorizePasswordless).not.toHaveBeenCalled();
                expect(mockRegisterCustomer).toHaveBeenCalledWith(mockContext, {
                    customer: {
                        firstName: 'John',
                        lastName: 'Doe',
                        login: 'test@example.com',
                        email: 'test@example.com',
                    },
                    password: 'Test123!',
                });
                expect(mockRequestOtp).toHaveBeenCalledWith(mockContext, { email: 'test@example.com' });
                expect(result).toBeInstanceOf(Response);
                if (result instanceof Response) {
                    const location = result.headers.get('Location');
                    const url = new URL(location as string, 'http://localhost');
                    expect(url.searchParams.get('otp')).toBe('true');
                    expect(url.searchParams.get('email')).toBe('test@example.com');
                    expect(url.searchParams.get('returnUrl')).toBe('/checkout');
                    expect(url.searchParams.get('registrationMode')).toBe('password');
                }
            });

            it('should redirect to returnUrl when OTP request fails after password registration', async () => {
                mockIsPasswordValid.mockReturnValue(true);
                mockRegisterCustomer.mockResolvedValue({ success: true } as any);
                mockRequestOtp.mockRejectedValue(new Error('OTP service unavailable'));

                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('password', 'Test123!');
                formData.append('confirmPassword', 'Test123!');
                formData.append('registrationMode', 'password');

                const mockRequest = new Request('http://localhost/signup?returnUrl=/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData.toString(),
                });

                const result = await action({
                    request: mockRequest,
                    url: new URL(mockRequest.url),
                    params: { siteId: 'test-site', localeId: 'en-US' },
                    context: mockContext,
                    pattern: 'signup',
                });

                expect(mockRegisterCustomer).toHaveBeenCalled();
                expect(mockRequestOtp).toHaveBeenCalled();
                expect(result).toBeInstanceOf(Response);
                if (result instanceof Response) {
                    expect(result.status).toBe(302);
                    expect(result.headers.get('Location')).toBe('/checkout');
                }
            });
        });

        describe('edge cases', () => {
            it('should handle empty string fields as missing', async () => {
                const formData = new URLSearchParams();
                formData.append('firstName', '');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('password', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/signup', {
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
                    pattern: 'signup',
                };

                const result = await action(args);

                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
            });

            it('should handle special characters in email', async () => {
                mockIsPasswordValid.mockReturnValue(true);
                mockRegisterCustomer.mockResolvedValue({ success: true } as any);

                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test+user@example.com');
                formData.append('password', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/signup', {
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
                    pattern: 'signup',
                };

                await action(args);

                expect(mockRegisterCustomer).toHaveBeenCalledWith(mockContext, {
                    customer: {
                        firstName: 'John',
                        lastName: 'Doe',
                        login: 'test+user@example.com',
                        email: 'test+user@example.com',
                    },
                    password: 'Test123!',
                });
            });

            it('should handle special characters in names', async () => {
                mockIsPasswordValid.mockReturnValue(true);
                mockRegisterCustomer.mockResolvedValue({ success: true } as any);

                const formData = new URLSearchParams();
                formData.append('firstName', "O'Brien");
                formData.append('lastName', 'de la Cruz');
                formData.append('email', 'test@example.com');
                formData.append('password', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/signup', {
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
                    pattern: 'signup',
                };

                await action(args);

                expect(mockRegisterCustomer).toHaveBeenCalledWith(mockContext, {
                    customer: {
                        firstName: "O'Brien",
                        lastName: 'de la Cruz',
                        login: 'test@example.com',
                        email: 'test@example.com',
                    },
                    password: 'Test123!',
                });
            });

            it('should not trim whitespace from passwords', async () => {
                // Passwords with whitespace should not match if one has spaces
                const formData = new URLSearchParams();
                formData.append('firstName', 'John');
                formData.append('lastName', 'Doe');
                formData.append('email', 'test@example.com');
                formData.append('password', ' Test123! ');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/signup', {
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
                    pattern: 'signup',
                };

                const result = await action(args);

                expect(result).toEqual({
                    error: t('signup:passwordsDoNotMatch'),
                });
            });
        });
    });

    describe('Component', () => {
        beforeEach(() => {
            // For component tests, ensure user is not already registered
            mockGetAuth.mockReturnValue({
                userType: 'guest',
                customerId: 'test-customer-123',
            } as any);
        });

        it('should render form with all required elements', () => {
            renderWithRoutesStub();

            // Title and subtitle
            expect(screen.getByText(t('signup:title'))).toBeInTheDocument();
            expect(screen.getByText(t('signup:subtitle'))).toBeInTheDocument();

            // Form fields
            expect(screen.getByLabelText(t('signup:form.firstNameLabel'))).toBeInTheDocument();
            expect(screen.getByLabelText(t('signup:form.lastNameLabel'))).toBeInTheDocument();
            expect(screen.getByLabelText(t('signup:form.emailLabel'))).toBeInTheDocument();
            expect(screen.getByLabelText(t('signup:form.passwordLabel'))).toBeInTheDocument();
            expect(screen.getByLabelText(t('signup:form.confirmPasswordLabel'))).toBeInTheDocument();

            // Submit button
            expect(screen.getByRole('button', { name: t('signup:form.createAccountButton') })).toBeInTheDocument();

            // Sign in link
            expect(screen.getByText(/Have an account?/i)).toBeInTheDocument();
            expect(screen.getByText(t('signup:signIn'))).toBeInTheDocument();
            const signInLink = screen.getByText(t('signup:signIn')).closest('a');
            expect(signInLink).toHaveAttribute('href', '/global/en-GB/login');
        });

        it('should display error when form submission fails', async () => {
            const user = userEvent.setup();
            const errorMessage = 'Email already exists';
            mockIsPasswordValid.mockReturnValue(true);
            mockRegisterCustomer.mockResolvedValue({ success: false, error: errorMessage } as any);

            const WrappedComponent = () => <Signup loaderData={defaultLoaderData} />;
            const Stub = createRoutesStub([
                {
                    path: '/',
                    Component: WrappedComponent,
                    action: async ({ request }) =>
                        action({
                            request,
                            params: { siteId: 'test-site', localeId: 'en-US' },
                            context: mockContext,
                        } as any),
                },
            ]);
            render(
                <AllProvidersWrapper>
                    <Stub initialEntries={['/']} />
                </AllProvidersWrapper>
            );

            // Fill out the form
            await user.type(screen.getByLabelText(t('signup:form.firstNameLabel')), 'John');
            await user.type(screen.getByLabelText(t('signup:form.lastNameLabel')), 'Doe');
            await user.type(screen.getByLabelText(t('signup:form.emailLabel')), 'test@example.com');
            await user.type(screen.getByLabelText(t('signup:form.passwordLabel')), 'Test123!');
            await user.type(screen.getByLabelText(t('signup:form.confirmPasswordLabel')), 'Test123!');

            // Submit the form
            const submitButton = screen.getByRole('button', { name: t('signup:form.createAccountButton') });
            await user.click(submitButton);

            // Wait for error to appear
            await waitFor(() => {
                expect(screen.getByText(errorMessage)).toBeInTheDocument();
            });
        });

        it('should display validation error when passwords do not match', async () => {
            const user = userEvent.setup();
            mockIsPasswordValid.mockReturnValue(true);

            const WrappedSignup = () => <Signup loaderData={defaultLoaderData} />;
            const Stub = createRoutesStub([
                {
                    path: '/',
                    Component: WrappedSignup,
                    action: async ({ request }) =>
                        action({
                            request,
                            params: { siteId: 'test-site', localeId: 'en-US' },
                            context: mockContext,
                        } as any),
                },
            ]);
            render(
                <AllProvidersWrapper>
                    <Stub initialEntries={['/']} />
                </AllProvidersWrapper>
            );

            // Fill out the form with mismatched passwords
            await user.type(screen.getByLabelText(t('signup:form.firstNameLabel')), 'John');
            await user.type(screen.getByLabelText(t('signup:form.lastNameLabel')), 'Doe');
            await user.type(screen.getByLabelText(t('signup:form.emailLabel')), 'test@example.com');
            await user.type(screen.getByLabelText(t('signup:form.passwordLabel')), 'Test123!');
            await user.type(screen.getByLabelText(t('signup:form.confirmPasswordLabel')), 'Different123!');

            // Submit the form
            const submitButton = screen.getByRole('button', { name: t('signup:form.createAccountButton') });
            await user.click(submitButton);

            // Wait for error to appear
            await waitFor(() => {
                expect(screen.getByText(t('signup:passwordsDoNotMatch'))).toBeInTheDocument();
            });
        });

        it('should not show error on initial render', () => {
            renderWithRoutesStub();

            // No error should be visible initially
            expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
        });

        describe('OTP modal', () => {
            it('should not show OTP modal on initial render', () => {
                renderWithRoutesStub();

                expect(screen.queryByTestId('otp-modal')).not.toBeInTheDocument();
            });

            it('should show OTP modal when loader returns showOTPModal:true', async () => {
                renderWithRoutesStub({ ...defaultLoaderData, showOTPModal: true });

                await waitFor(() => {
                    expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
                });
            });

            it('should navigate to returnUrl when OTP modal is closed', async () => {
                const user = userEvent.setup();

                renderWithRoutesStub({ ...defaultLoaderData, showOTPModal: true, returnUrl: '/checkout' });

                await waitFor(() => {
                    expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
                });

                await user.click(screen.getByRole('button', { name: 'Close' }));

                expect(mockNavigate).toHaveBeenCalledWith('/checkout');
            });

            it('should navigate to /signup instead of returnUrl when OTP modal is closed in passwordless mode', async () => {
                const user = userEvent.setup();

                renderWithRoutesStub({
                    ...defaultLoaderData,
                    showOTPModal: true,
                    returnUrl: '/checkout',
                    isPasswordlessEnabled: true,
                    registrationMode: 'passwordless',
                });

                await waitFor(() => {
                    expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
                });

                await user.click(screen.getByRole('button', { name: 'Close' }));

                expect(mockNavigate).toHaveBeenCalledWith('/signup');
            });

            it('should pass /action/otp-verify URL to OTP modal for password registration', async () => {
                renderWithRoutesStub({
                    ...defaultLoaderData,
                    showOTPModal: true,
                    registrationMode: 'password',
                });

                await waitFor(() => {
                    expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
                });

                expect(screen.getByTestId('otp-modal')).toHaveAttribute('data-verify-action-url', '/action/otp-verify');
            });

            it('should pass /action/verify-passwordless-otp URL to OTP modal for passwordless registration', async () => {
                renderWithRoutesStub({
                    ...defaultLoaderData,
                    showOTPModal: true,
                    registrationMode: 'passwordless',
                });

                await waitFor(() => {
                    expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
                });

                expect(screen.getByTestId('otp-modal')).toHaveAttribute(
                    'data-verify-action-url',
                    '/action/verify-passwordless-otp'
                );
            });

            it('should resend OTP via /action/otp-request for password registration', async () => {
                const user = userEvent.setup();
                const otpRequestAction = vi.fn(() => Response.json({ success: true }));

                const loaderData = {
                    ...defaultLoaderData,
                    showOTPModal: true,
                    email: 'test@example.com',
                    registrationMode: 'password',
                };
                const WrappedComponent = () => <Signup loaderData={loaderData} />;
                const Stub = createRoutesStub([
                    {
                        path: '/',
                        Component: WrappedComponent,
                    },
                    {
                        path: '/action/otp-request',
                        action: otpRequestAction,
                    },
                ]);
                render(
                    <AllProvidersWrapper>
                        <Stub initialEntries={['/']} />
                    </AllProvidersWrapper>
                );

                await waitFor(() => {
                    expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
                });

                await user.click(screen.getByRole('button', { name: 'Resend' }));

                await waitFor(() => {
                    expect(otpRequestAction).toHaveBeenCalled();
                });

                const actionArgs = (otpRequestAction.mock.calls as any)[0][0] as Route.ActionArgs;
                const formData = await actionArgs.request.formData();
                expect(formData.get('email')).toBe('test@example.com');
            });

            it('should resend OTP via POST to current page for passwordless registration', async () => {
                const user = userEvent.setup();
                const signupAction = vi.fn(() => Response.json({ success: true }));

                const loaderData = {
                    ...defaultLoaderData,
                    showOTPModal: true,
                    email: 'test@example.com',
                    firstName: 'John',
                    lastName: 'Doe',
                    registrationMode: 'passwordless',
                };
                const WrappedComponent = () => <Signup loaderData={loaderData} />;
                const Stub = createRoutesStub([
                    {
                        path: '/',
                        Component: WrappedComponent,
                        action: signupAction,
                    },
                ]);
                render(
                    <AllProvidersWrapper>
                        <Stub initialEntries={['/']} />
                    </AllProvidersWrapper>
                );

                await waitFor(() => {
                    expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
                });

                await user.click(screen.getByRole('button', { name: 'Resend' }));

                await waitFor(() => {
                    expect(signupAction).toHaveBeenCalled();
                });

                const actionArgs = (signupAction.mock.calls as any)[0][0] as Route.ActionArgs;
                const formData = await actionArgs.request.formData();
                expect(formData.get('email')).toBe('test@example.com');
                expect(formData.get('firstName')).toBe('John');
                expect(formData.get('lastName')).toBe('Doe');
                expect(formData.get('registrationMode')).toBe('passwordless');
            });
        });
    });
});
