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
import { createRoutesStub } from 'react-router';
import { createActionArgs, createLoaderArgs, ROUTE_PATTERN } from '@/lib/test-utils/loader-action-args';
import Login, { loader, action } from './_empty.login';
import type { Route } from './+types/_empty.login';
import { render, screen, waitFor } from '@testing-library/react';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import userEvent from '@testing-library/user-event';
import { getAuth, authorizePasswordless, getPasswordLessAccessToken, updateAuth } from '@/middlewares/auth.server';
import { getLoginPreferencesLazy } from '@salesforce/storefront-next-runtime/data-store';
import { loginRegisteredUser } from '@/lib/api/auth/standard-login.server';
import { authorizeIDP } from '@/lib/api/auth/social-login.server';
import { mergeBasket } from '@/lib/api/basket.server';
import { getCustomer } from '@/lib/api/customer.server';
import { createApiClients } from '@/lib/api-clients.server';
import { updateBasketResource } from '@/middlewares/basket.server';
import { isAbsoluteURL, extractResponseError } from '@/lib/utils';
import { getAppOrigin } from '@/lib/origin';
import { buildUrlFromContext } from '@/lib/url.server';

vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(),
    authorizePasswordless: vi.fn(),
    getPasswordLessAccessToken: vi.fn(),
    updateAuth: vi.fn(),
}));

vi.mock('@/lib/api/auth/standard-login.server', () => ({
    loginRegisteredUser: vi.fn(),
}));

vi.mock('@/lib/api/auth/social-login.server', () => ({
    authorizeIDP: vi.fn(),
}));

vi.mock('@/lib/api/basket.server', () => ({
    mergeBasket: vi.fn(),
}));

vi.mock('@/lib/api/customer.server', () => ({
    getCustomer: vi.fn(),
}));

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(() => ({
        shopperBasketsV2: {
            updateCustomerForBasket: vi.fn(),
        },
    })),
}));

vi.mock('@/lib/api/wishlist.server', () => ({
    captureGuestWishlistSnapshot: vi.fn(),
    mergeWishlist: vi.fn(),
    appendWishlistMergeFlag: vi.fn((target: string) => target),
}));

vi.mock('@/middlewares/basket.server', () => ({
    updateBasketResource: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

// Mock buildUrlFromContext to pass-through by default so existing assertions on bare paths
// continue to hold. Individual tests can override the mock to verify that the wrap is in
// place and producing site/locale-prefixed URLs.
vi.mock('@/lib/url.server', () => ({
    buildUrlFromContext: vi.fn((to: string) => to),
}));

vi.mock('@/lib/utils', () => ({
    isPasswordlessLoginEnabled: false,
    isAbsoluteURL: vi.fn((url: string) => /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url)),
    getSafeReturnUrl: vi.fn((url: string | null | undefined, fallback = '/') =>
        !url || /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url) ? fallback : url
    ),
    extractResponseError: vi.fn((err?: unknown) => ({
        responseMessage: err instanceof Error ? err.message : 'error',
    })),
    cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/origin', () => ({
    getAppOrigin: vi.fn(),
}));

// Mock passwordless form since we're focusing on standard login full-flow tests
vi.mock('@/components/login/passwordless-login-form', () => ({
    __esModule: true,
    default: () => <div data-testid="passwordless-form" />,
}));
vi.mock('@/components/buttons/social-login-buttons', () => ({
    __esModule: true,
    SocialLoginButtons: () => <div data-testid="social-buttons" />,
}));

vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>();
    return {
        ...actual,
        getConfig: vi.fn(() => ({
            auth: {
                otpLength: 6,
            },
            features: {
                passwordlessLogin: {
                    landingUri: '/passwordless-login-landing',
                    callbackUri: '/passwordless-login-callback',
                },
                socialLogin: {
                    enabled: true,
                    callbackUri: '/social-callback',
                    providers: ['Apple', 'Google'],
                },
            },
            commerce: {
                api: {
                    privateKeyEnabled: false,
                },
            },
        })),
    };
});

// Default: empty prefs ({}), so emailVerificationEnabled is undefined and passwordless is
// effectively disabled. Existing tests rely on this default to land in 'password' mode.
// The login route reads prefs through the local `@/lib/login-preferences.server` wrapper,
// which awaits `getLoginPreferencesLazy` — so that is the export the tests drive.
vi.mock('@salesforce/storefront-next-runtime/data-store', () => ({
    getLoginPreferencesLazy: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({
    getTranslation: vi.fn(() => ({
        t: vi.fn((key: string) => {
            if (key === 'errors:genericTryAgain') {
                return 'An error occurred. Please try again.';
            }
            return key;
        }),
    })),
}));

// Get mocked functions
const mockGetPasswordLessAccessToken = vi.mocked(getPasswordLessAccessToken);
const mockUpdateAuth = vi.mocked(updateAuth);
const mockGetAuth = vi.mocked(getAuth);
const mockLoginRegisteredUser = vi.mocked(loginRegisteredUser);
const mockAuthorizeIDP = vi.mocked(authorizeIDP);
const mockAuthorizePasswordless = vi.mocked(authorizePasswordless);
const mockMergeBasket = vi.mocked(mergeBasket);
const mockGetCustomer = vi.mocked(getCustomer);
const mockCreateApiClients = vi.mocked(createApiClients);
const mockUpdateBasketResource = vi.mocked(updateBasketResource);
const mockGetAppOrigin = vi.mocked(getAppOrigin);
const mockIsAbsoluteURL = vi.mocked(isAbsoluteURL);
const mockExtractResponseError = vi.mocked(extractResponseError);
const mockBuildUrlFromContext = vi.mocked(buildUrlFromContext);
const mockGetLoginPreferences = vi.mocked(getLoginPreferencesLazy);

describe('Login Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAppOrigin.mockReturnValue('http://localhost:5173');
        mockIsAbsoluteURL.mockImplementation((url: string) => /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url));
        mockExtractResponseError.mockResolvedValue({ responseMessage: 'error' } as any);
        // Default: pass-through. Tests that exercise the site/locale prefix override this.
        mockBuildUrlFromContext.mockImplementation((to: string) => to);
        // Default: passwordless disabled. Tests that need passwordless override this.
        mockGetLoginPreferences.mockResolvedValue({});
        // Default: no active basket (reconciliation is a no-op when no basket).
        mockGetCustomer.mockResolvedValue({ email: 'customer@example.com', login: 'customer@example.com' } as any);
        mockCreateApiClients.mockReturnValue({
            shopperBasketsV2: {
                updateCustomerForBasket: vi.fn().mockResolvedValue({
                    data: { basketId: 'basket-1', customerInfo: { email: 'customer@example.com' } },
                }),
            },
        } as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('loader', () => {
        it('should redirect to home if user is already logged in', async () => {
            mockGetAuth.mockReturnValue({
                accessToken: 'valid-token',
                accessTokenExpiry: Date.now() + 10000,
                userType: 'registered',
                customerId: 'customer-123',
            });

            const mockRequest = new Request('http://localhost:5173/login');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await loader(
                createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toHaveProperty('status', 302);
            expect(result).toHaveProperty('headers');
            if (result instanceof Response) {
                expect(result.headers.get('Location')).toBe('/');
            }
        });

        it('should redirect to returnUrl if user is already logged in and returnUrl is provided', async () => {
            mockGetAuth.mockReturnValue({
                accessToken: 'valid-token',
                accessTokenExpiry: Date.now() + 10000,
                userType: 'registered',
                customerId: 'customer-123',
            });

            const mockRequest = new Request('http://localhost:5173/login?returnUrl=/product/123');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await loader(
                createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toHaveProperty('status', 302);
            if (result instanceof Response) {
                expect(result.headers.get('Location')).toBe('/product/123');
            }
        });

        it('should redirect to / instead of external returnUrl (open redirect prevention)', async () => {
            mockGetAuth.mockReturnValue({
                accessToken: 'valid-token',
                accessTokenExpiry: Date.now() + 10000,
                userType: 'registered',
                customerId: 'customer-123',
            });

            const mockRequest = new Request('http://localhost:5173/login?returnUrl=https://evil.com');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await loader(createLoaderArgs(mockRequest, mockContext, { pattern: '/login' }));

            expect(result).toHaveProperty('status', 302);
            if (result instanceof Response) {
                expect(result.headers.get('Location')).toBe('/');
                expect(result.headers.get('Location')).not.toContain('evil.com');
            }
        });

        it('applies site/locale prefix to home redirect when already authenticated with no returnUrl', async () => {
            // Mock buildUrlFromContext to apply a representative '/global/en-GB' prefix.
            // buildUrlFromContext returns '/' as-is for the home path (cookie-driven), so we
            // assert the wrap is *called* with '/' rather than expecting a prefixed location.
            mockBuildUrlFromContext.mockImplementation((to: string) => (to === '/' ? '/' : `/global/en-GB${to}`));
            mockGetAuth.mockReturnValue({
                accessToken: 'valid-token',
                accessTokenExpiry: Date.now() + 10000,
                userType: 'registered',
                customerId: 'customer-123',
            });

            const mockRequest = new Request('http://localhost:5173/login');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await loader(
                createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(mockBuildUrlFromContext).toHaveBeenCalledWith('/', mockContext);
            if (result instanceof Response) {
                expect(result.headers.get('Location')).toBe('/');
            }
        });

        it('applies site/locale prefix to returnUrl on already-authenticated redirect', async () => {
            mockBuildUrlFromContext.mockImplementation((to: string) => (to === '/' ? '/' : `/global/en-GB${to}`));
            mockGetAuth.mockReturnValue({
                accessToken: 'valid-token',
                accessTokenExpiry: Date.now() + 10000,
                userType: 'registered',
                customerId: 'customer-123',
            });

            const mockRequest = new Request('http://localhost:5173/login?returnUrl=/wishlist');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await loader(
                createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(mockBuildUrlFromContext).toHaveBeenCalledWith('/wishlist', mockContext);
            if (result instanceof Response) {
                expect(result.headers.get('Location')).toBe('/global/en-GB/wishlist');
            }
        });

        it('should return loader data for guest user', async () => {
            mockGetAuth.mockReturnValue({
                userType: 'guest',
            });

            const mockRequest = new Request('http://localhost:5173/login');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await loader(
                createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            // Check if result is not a Response (redirect)
            if (!(result instanceof Response)) {
                expect(result).toHaveProperty('mode');
                expect(result.mode).toBe('password');
            }
        });

        it('should parse passwordless sent state from URL', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });

            const mockRequest = new Request('http://localhost:5173/login?passwordless=sent&email=test@example.com');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await loader(
                createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            if (!(result instanceof Response)) {
                expect(result.passwordlessSent).toBe(true);
                expect(result.email).toBe('test@example.com');
            }
        });

        it('translates session_expired error code to the localized message', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });

            const mockRequest = new Request('http://localhost:5173/login?error=session_expired');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await loader(
                createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            if (!(result instanceof Response)) {
                expect(result.error).toBe('errors:api.unauthorized');
            }
        });

        it('passes through unrecognized error codes unchanged', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });

            const mockRequest = new Request('http://localhost:5173/login?error=some_other_error');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await loader(
                createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            if (!(result instanceof Response)) {
                expect(result.error).toBe('some_other_error');
            }
        });

        it('honors ?mode=passwordless when the email-verification permission is enabled', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });
            mockGetLoginPreferences.mockResolvedValueOnce({ emailVerificationEnabled: true });

            const mockRequest = new Request('http://localhost:5173/login?mode=passwordless');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await loader(
                createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            if (!(result instanceof Response)) {
                expect(result.mode).toBe('passwordless');
            }
        });

        it('forces password mode when ?mode=passwordless is set but the permission is disabled', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });
            mockGetLoginPreferences.mockResolvedValueOnce({ emailVerificationEnabled: false });

            const mockRequest = new Request('http://localhost:5173/login?mode=passwordless');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await loader(
                createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            if (!(result instanceof Response)) {
                expect(result.mode).toBe('password');
            }
        });

        it('honors ?otp=true when the email-verification permission is enabled', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });
            mockGetLoginPreferences.mockResolvedValueOnce({ emailVerificationEnabled: true });

            const mockRequest = new Request('http://localhost:5173/login?otp=true');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await loader(
                createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            if (!(result instanceof Response)) {
                expect(result.showOTPForm).toBe(true);
            }
        });

        it('suppresses ?otp=true when the email-verification permission is disabled', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });
            mockGetLoginPreferences.mockResolvedValueOnce({ emailVerificationEnabled: false });

            const mockRequest = new Request('http://localhost:5173/login?otp=true');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await loader(
                createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            if (!(result instanceof Response)) {
                expect(result.showOTPForm).toBe(false);
            }
        });

        it('should include isSocialLoginEnabled in loader data', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });

            const mockRequest = new Request('http://localhost:5173/login');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await loader(
                createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            if (!(result instanceof Response)) {
                expect(result.isSocialLoginEnabled).toBe(true);
            }
        });

        describe('Auto-verification with email link', () => {
            it('should auto-verify token and merge basket when email and token are in URL', async () => {
                mockGetAuth.mockReturnValue({ userType: 'guest' });
                mockGetPasswordLessAccessToken.mockResolvedValue({
                    access_token: 'new-token',
                    id_token: 'id-token',
                    refresh_token: 'new-refresh',
                    token_type: 'Bearer',
                    expires_in: 1800,
                    refresh_token_expires_in: 86400,
                    usid: 'test-usid',
                    customer_id: 'customer-123',
                    enc_user_id: 'enc-user-123',
                    idp_access_token: 'idp-token',
                } as any);
                mockUpdateAuth.mockImplementation(() => {});
                mockMergeBasket.mockResolvedValue(undefined);

                const mockRequest = new Request(
                    'http://localhost:5173/login?email=test@example.com&token=otp-token-123'
                );
                const mockContext = { get: vi.fn(), set: vi.fn() };
                const result = await loader(
                    createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, {
                        pattern: ROUTE_PATTERN,
                    })
                );

                expect(mockGetPasswordLessAccessToken).toHaveBeenCalledWith(mockContext, 'otp-token-123');
                expect(mockUpdateAuth).toHaveBeenCalled();
                expect(mockMergeBasket).toHaveBeenCalledWith(mockContext);

                if (!(result instanceof Response) && 'redirectTo' in result) {
                    expect(result.redirectTo).toBe('/account');
                }
            });

            it('should continue login even if basket merge fails', async () => {
                mockGetAuth.mockReturnValue({ userType: 'guest' });
                mockGetPasswordLessAccessToken.mockResolvedValue({
                    access_token: 'new-token',
                    id_token: 'id-token',
                    refresh_token: 'new-refresh',
                    token_type: 'Bearer',
                    expires_in: 1800,
                    refresh_token_expires_in: 86400,
                    usid: 'test-usid',
                    customer_id: 'customer-123',
                    enc_user_id: 'enc-user-123',
                    idp_access_token: 'idp-token',
                } as any);
                mockUpdateAuth.mockImplementation(() => {});
                mockMergeBasket.mockRejectedValue(new Error('Basket merge failed'));

                const mockRequest = new Request(
                    'http://localhost:5173/login?email=test@example.com&token=otp-token-123'
                );
                const mockContext = { get: vi.fn(), set: vi.fn() };
                const result = await loader(
                    createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, {
                        pattern: ROUTE_PATTERN,
                    })
                );

                expect(mockGetPasswordLessAccessToken).toHaveBeenCalledWith(mockContext, 'otp-token-123');
                expect(mockMergeBasket).toHaveBeenCalledWith(mockContext);

                // Should still redirect successfully despite basket merge failure
                if (!(result instanceof Response) && 'redirectTo' in result) {
                    expect(result.redirectTo).toBe('/account');
                }
            });

            it('should show OTP form with error when token verification fails (permission enabled)', async () => {
                mockGetAuth.mockReturnValue({ userType: 'guest' });
                mockGetLoginPreferences.mockResolvedValueOnce({ emailVerificationEnabled: true });
                mockGetPasswordLessAccessToken.mockRejectedValue(new Error('Invalid token'));

                const mockRequest = new Request(
                    'http://localhost:5173/login?email=test@example.com&token=invalid-token&otp=true'
                );
                const mockContext = { get: vi.fn(), set: vi.fn() };
                const result = await loader(
                    createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, {
                        pattern: ROUTE_PATTERN,
                    })
                );

                expect(mockGetPasswordLessAccessToken).toHaveBeenCalledWith(mockContext, 'invalid-token');
                expect(mockMergeBasket).not.toHaveBeenCalled();

                if (!(result instanceof Response) && 'error' in result) {
                    expect(result.error).toBeDefined();
                    if ('showOTPForm' in result) {
                        expect(result.showOTPForm).toBe(true);
                    }
                    if ('email' in result) {
                        expect(result.email).toBe('test@example.com');
                    }
                }
            });

            it('suppresses the OTP form on auto-verify failure when the permission is disabled', async () => {
                mockGetAuth.mockReturnValue({ userType: 'guest' });
                mockGetLoginPreferences.mockResolvedValueOnce({ emailVerificationEnabled: false });
                mockGetPasswordLessAccessToken.mockRejectedValue(new Error('Invalid token'));

                const mockRequest = new Request(
                    'http://localhost:5173/login?email=test@example.com&token=invalid-token&otp=true'
                );
                const mockContext = { get: vi.fn(), set: vi.fn() };
                const result = await loader(
                    createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, {
                        pattern: ROUTE_PATTERN,
                    })
                );

                if (!(result instanceof Response) && 'showOTPForm' in result) {
                    expect(result.showOTPForm).toBe(false);
                }
            });

            it('should redirect to returnUrl after successful auto-verification', async () => {
                mockGetAuth.mockReturnValue({ userType: 'guest' });
                mockGetPasswordLessAccessToken.mockResolvedValue({
                    access_token: 'new-token',
                    id_token: 'id-token',
                    refresh_token: 'new-refresh',
                    token_type: 'Bearer',
                    expires_in: 1800,
                    refresh_token_expires_in: 86400,
                    usid: 'test-usid',
                    customer_id: 'customer-123',
                    enc_user_id: 'enc-user-123',
                    idp_access_token: 'idp-token',
                } as any);
                mockUpdateAuth.mockImplementation(() => {});
                mockMergeBasket.mockResolvedValue(undefined);

                const mockRequest = new Request(
                    'http://localhost:5173/login?email=test@example.com&token=otp-token-123&returnUrl=/checkout'
                );
                const mockContext = { get: vi.fn(), set: vi.fn() };
                const result = await loader(
                    createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, {
                        pattern: ROUTE_PATTERN,
                    })
                );

                expect(mockMergeBasket).toHaveBeenCalledWith(mockContext);

                if (!(result instanceof Response) && 'redirectTo' in result) {
                    expect(result.redirectTo).toBe('/checkout');
                }
            });

            it('should use legacy otpCode parameter if token is not present', async () => {
                mockGetAuth.mockReturnValue({ userType: 'guest' });
                mockGetPasswordLessAccessToken.mockResolvedValue({
                    access_token: 'new-token',
                    id_token: 'id-token',
                    refresh_token: 'new-refresh',
                    token_type: 'Bearer',
                    expires_in: 1800,
                    refresh_token_expires_in: 86400,
                    usid: 'test-usid',
                    customer_id: 'customer-123',
                    enc_user_id: 'enc-user-123',
                    idp_access_token: 'idp-token',
                } as any);
                mockUpdateAuth.mockImplementation(() => {});
                mockMergeBasket.mockResolvedValue(undefined);

                const mockRequest = new Request(
                    'http://localhost:5173/login?email=test@example.com&otpCode=legacy-otp-123'
                );
                const mockContext = { get: vi.fn(), set: vi.fn() };
                const result = await loader(
                    createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, {
                        pattern: ROUTE_PATTERN,
                    })
                );

                expect(mockGetPasswordLessAccessToken).toHaveBeenCalledWith(mockContext, 'legacy-otp-123');
                expect(mockMergeBasket).toHaveBeenCalledWith(mockContext);

                if (!(result instanceof Response) && 'redirectTo' in result) {
                    expect(result.redirectTo).toBe('/account');
                }
            });
        });

        describe('guestWishlistCount', () => {
            it('returns the snapshot item count for a guest with saved items', async () => {
                mockGetAuth.mockReturnValue({ userType: 'guest' });
                const { captureGuestWishlistSnapshot } = await import('@/lib/api/wishlist.server');
                vi.mocked(captureGuestWishlistSnapshot).mockResolvedValue({
                    guestCustomerId: 'gcid-1',
                    guestListId: 'list-1',
                    items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as any,
                });

                const mockRequest = new Request('http://localhost:5173/login');
                const mockContext = { get: vi.fn(), set: vi.fn() };
                const result = await loader(
                    createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
                );

                if (!(result instanceof Response)) {
                    expect(result.guestWishlistCount).toBe(3);
                }
            });

            it('returns 0 when the snapshot is null (no list / empty list / non-guest)', async () => {
                mockGetAuth.mockReturnValue({ userType: 'guest' });
                const { captureGuestWishlistSnapshot } = await import('@/lib/api/wishlist.server');
                vi.mocked(captureGuestWishlistSnapshot).mockResolvedValue(null);

                const mockRequest = new Request('http://localhost:5173/login');
                const mockContext = { get: vi.fn(), set: vi.fn() };
                const result = await loader(
                    createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
                );

                if (!(result instanceof Response)) {
                    expect(result.guestWishlistCount).toBe(0);
                }
            });

            it('returns 0 on the auto-verify error path even when snapshot has items', async () => {
                mockGetAuth.mockReturnValue({ userType: 'guest' });
                const { captureGuestWishlistSnapshot } = await import('@/lib/api/wishlist.server');
                vi.mocked(captureGuestWishlistSnapshot).mockResolvedValue({
                    guestCustomerId: 'gcid-1',
                    guestListId: 'list-1',
                    items: [{ id: 'a' }, { id: 'b' }] as any,
                });
                // Auto-verify path throws → loader falls into the error-return branch.
                mockGetPasswordLessAccessToken.mockRejectedValue(new Error('verify failed'));

                const mockRequest = new Request('http://localhost:5173/login?email=foo@example.com&token=abc');
                const mockContext = { get: vi.fn(), set: vi.fn() };
                const result = await loader(
                    createLoaderArgs<Route.LoaderArgs>(mockRequest, mockContext, { pattern: '/login' })
                );

                // The error-return path includes the guest wishlist count from the pre-swap snapshot.
                if (!(result instanceof Response)) {
                    expect(result.guestWishlistCount).toBe(2);
                }
            });
        });
    });

    describe('action - Standard Login', () => {
        it('should handle successful standard login', async () => {
            // Mock getAuth to return registered user auth after successful login
            mockGetAuth.mockReturnValue({
                userType: 'registered',
                customerId: 'test-customer-123',
                accessToken: 'test-token',
            });
            mockLoginRegisteredUser.mockResolvedValue({ success: true });
            const mergedBasket = { basketId: 'basket-1' } as any;
            mockMergeBasket.mockResolvedValue(mergedBasket);

            const formData = new URLSearchParams();
            formData.append('email', 'test@example.com');
            formData.append('password', 'password123');
            formData.append('loginMode', 'password');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toBeInstanceOf(Response);
            expect((result as Response).status).toBe(302);
            expect((result as Response).headers.get('Location')).toBe('/');
            expect(mockLoginRegisteredUser).toHaveBeenCalledWith(
                mockContext,
                {
                    email: 'test@example.com',
                    password: 'password123',
                },
                { skipUsid: false }
            );
            expect(mockMergeBasket).toHaveBeenCalledWith(mockContext);
            expect(mockUpdateBasketResource).toHaveBeenCalledWith(mockContext, mergedBasket);
        });

        it('should redirect to returnUrl on successful login', async () => {
            mockGetAuth.mockReturnValue({
                userType: 'registered',
                customerId: 'test-customer-123',
                accessToken: 'test-token',
            });
            mockLoginRegisteredUser.mockResolvedValue({ success: true });
            const mergedBasket = { basketId: 'basket-1' } as any;
            mockMergeBasket.mockResolvedValue(mergedBasket);

            const formData = new URLSearchParams();
            formData.append('email', 'test@example.com');
            formData.append('password', 'password123');
            formData.append('loginMode', 'password');
            formData.append('returnUrl', '/product/123');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toBeInstanceOf(Response);
            expect((result as Response).status).toBe(302);
            expect((result as Response).headers.get('Location')).toBe('/product/123');
        });

        it('should not redirect to external returnUrl on successful login (open redirect prevention)', async () => {
            mockGetAuth.mockReturnValue({
                userType: 'registered',
                customerId: 'test-customer-123',
                accessToken: 'test-token',
            });
            mockLoginRegisteredUser.mockResolvedValue({ success: true });
            const mergedBasket = { basketId: 'basket-1' } as any;
            mockMergeBasket.mockResolvedValue(mergedBasket);

            const formData = new URLSearchParams();
            formData.append('email', 'test@example.com');
            formData.append('password', 'password123');
            formData.append('loginMode', 'password');
            formData.append('returnUrl', 'https://evil.com');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(createActionArgs(mockRequest, mockContext, { pattern: '/login' }));

            expect(result).toBeInstanceOf(Response);
            expect((result as Response).status).toBe(302);
            expect((result as Response).headers.get('Location')).toBe('/');
        });

        it('applies site/locale prefix to returnUrl on successful standard login', async () => {
            mockBuildUrlFromContext.mockImplementation((to: string) => (to === '/' ? '/' : `/global/en-GB${to}`));
            mockGetAuth.mockReturnValue({
                userType: 'registered',
                customerId: 'test-customer-123',
                accessToken: 'test-token',
            });
            mockLoginRegisteredUser.mockResolvedValue({ success: true });
            mockMergeBasket.mockResolvedValue({ basketId: 'basket-1' } as any);

            const formData = new URLSearchParams();
            formData.append('email', 'test@example.com');
            formData.append('password', 'password123');
            formData.append('loginMode', 'password');
            formData.append('returnUrl', '/wishlist');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(mockBuildUrlFromContext).toHaveBeenCalledWith('/wishlist', mockContext);
            expect(result).toBeInstanceOf(Response);
            expect((result as Response).headers.get('Location')).toBe('/global/en-GB/wishlist');
        });

        it('applies site/locale prefix to home redirect on successful standard login with no returnUrl', async () => {
            mockBuildUrlFromContext.mockImplementation((to: string) => (to === '/' ? '/' : `/global/en-GB${to}`));
            mockGetAuth.mockReturnValue({
                userType: 'registered',
                customerId: 'test-customer-123',
                accessToken: 'test-token',
            });
            mockLoginRegisteredUser.mockResolvedValue({ success: true });
            mockMergeBasket.mockResolvedValue({ basketId: 'basket-1' } as any);

            const formData = new URLSearchParams();
            formData.append('email', 'test@example.com');
            formData.append('password', 'password123');
            formData.append('loginMode', 'password');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            // Home redirect path stays cookie-driven — buildUrlFromContext is not called for the
            // bare `redirect('/')` branch (line 336 of _empty.login.tsx).
            expect((result as Response).headers.get('Location')).toBe('/');
        });

        it('applies site/locale prefix to returnUrl + action params on successful standard login', async () => {
            mockBuildUrlFromContext.mockImplementation((to: string) => (to === '/' ? '/' : `/global/en-GB${to}`));
            mockGetAuth.mockReturnValue({
                userType: 'registered',
                customerId: 'test-customer-123',
                accessToken: 'test-token',
            });
            mockLoginRegisteredUser.mockResolvedValue({ success: true });
            mockMergeBasket.mockResolvedValue({ basketId: 'basket-1' } as any);

            const formData = new URLSearchParams();
            formData.append('email', 'test@example.com');
            formData.append('password', 'password123');
            formData.append('loginMode', 'password');
            formData.append('returnUrl', '/wishlist');
            formData.append('action', 'addToCart');
            formData.append('actionParams', '{"productId":"123"}');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            const location = (result as Response).headers.get('Location') ?? '';
            expect(location.startsWith('/global/en-GB/wishlist')).toBe(true);
            expect(location).toContain('action=addToCart');
            expect(location).toContain('actionParams=');
        });

        it('should preserve action and actionParams in returnUrl on successful login', async () => {
            mockGetAuth.mockReturnValue({
                userType: 'registered',
                customerId: 'test-customer-123',
                accessToken: 'test-token',
            });
            mockLoginRegisteredUser.mockResolvedValue({ success: true });
            const mergedBasket = { basketId: 'basket-1' } as any;
            mockMergeBasket.mockResolvedValue(mergedBasket);

            const formData = new URLSearchParams();
            formData.append('email', 'test@example.com');
            formData.append('password', 'password123');
            formData.append('loginMode', 'password');
            formData.append('returnUrl', '/product/123');
            formData.append('action', 'addToCart');
            formData.append('actionParams', '{"productId":"123"}');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toBeInstanceOf(Response);
            const location = (result as Response).headers.get('Location') ?? '';
            expect(location).toContain('/product/123');
            expect(location).toContain('action=addToCart');
            expect(location).toContain('actionParams=');
        });

        it('should continue login even if basket merge fails', async () => {
            mockGetAuth.mockReturnValue({
                userType: 'registered',
                customerId: 'test-customer-123',
                accessToken: 'test-token',
            });
            mockLoginRegisteredUser.mockResolvedValue({ success: true });
            mockMergeBasket.mockRejectedValue(new Error('merge failed'));

            const formData = new URLSearchParams();
            formData.append('email', 'test@example.com');
            formData.append('password', 'password123');
            formData.append('loginMode', 'password');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toBeInstanceOf(Response);
            expect((result as Response).status).toBe(302);
            expect((result as Response).headers.get('Location')).toBe('/');
            expect(mockMergeBasket).toHaveBeenCalledWith(mockContext);
            expect(mockUpdateBasketResource).not.toHaveBeenCalled();
        });

        it('should return error on failed login', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });
            mockLoginRegisteredUser.mockResolvedValue({ success: false });

            const formData = new URLSearchParams();
            formData.append('email', 'test@example.com');
            formData.append('password', 'wrong-password');
            formData.append('loginMode', 'password');
            formData.append('returnUrl', '/product/123');
            formData.append('action', 'addToCart');
            formData.append('actionParams', '{"productId":"123"}');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toHaveProperty('error', 'An error occurred. Please try again.');
        });

        it('should return error on failed standard login', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });
            mockLoginRegisteredUser.mockResolvedValue({ success: false });

            const formData = new URLSearchParams();
            formData.append('email', 'test@example.com');
            formData.append('password', 'wrong-password');
            formData.append('loginMode', 'password');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toHaveProperty('error', 'An error occurred. Please try again.');
        });

        it('should require both email and password for standard login', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });

            const formData = new URLSearchParams();
            formData.append('email', 'test@example.com');
            // Missing password

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toHaveProperty('error', 'An error occurred. Please try again.');
            expect(mockLoginRegisteredUser).not.toHaveBeenCalled();
        });

        it('reconciles basket email to customer email when they differ after login', async () => {
            const mockUpdateCustomerForBasket = vi.fn().mockResolvedValue({
                data: { basketId: 'basket-1', customerInfo: { email: 'customer@x.com' } },
            });
            mockCreateApiClients.mockReturnValue({
                shopperBasketsV2: { updateCustomerForBasket: mockUpdateCustomerForBasket },
            } as any);
            mockGetAuth.mockReturnValue({
                userType: 'registered',
                customerId: 'cust-123',
                accessToken: 'token',
            });
            mockLoginRegisteredUser.mockResolvedValue({ success: true });
            mockMergeBasket.mockResolvedValue({
                basketId: 'basket-1',
                customerInfo: { email: 'guest@x.com' },
            } as any);
            mockGetCustomer.mockResolvedValue({ email: 'customer@x.com' } as any);

            const formData = new URLSearchParams();
            formData.append('email', 'customer@x.com');
            formData.append('password', 'password123');
            formData.append('loginMode', 'password');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toBeInstanceOf(Response);
            expect((result as Response).status).toBe(302);
            expect(mockUpdateCustomerForBasket).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: { email: 'customer@x.com' },
                })
            );
        });

        it('skips basket email reconciliation when no active basket exists after login', async () => {
            const mockUpdateCustomerForBasket = vi.fn();
            mockCreateApiClients.mockReturnValue({
                shopperBasketsV2: { updateCustomerForBasket: mockUpdateCustomerForBasket },
            } as any);
            mockGetAuth.mockReturnValue({
                userType: 'registered',
                customerId: 'cust-123',
                accessToken: 'token',
            });
            mockLoginRegisteredUser.mockResolvedValue({ success: true });
            // mergeBasket returns undefined - no active basket
            mockMergeBasket.mockResolvedValue(undefined);

            const formData = new URLSearchParams();
            formData.append('email', 'customer@x.com');
            formData.append('password', 'password123');
            formData.append('loginMode', 'password');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toBeInstanceOf(Response);
            expect((result as Response).status).toBe(302);
            expect(mockUpdateCustomerForBasket).not.toHaveBeenCalled();
        });

        it('does not fail login when basket email reconciliation throws', async () => {
            mockCreateApiClients.mockReturnValue({
                shopperBasketsV2: {
                    updateCustomerForBasket: vi.fn().mockRejectedValue(new Error('SCAPI error')),
                },
            } as any);
            mockGetAuth.mockReturnValue({
                userType: 'registered',
                customerId: 'cust-123',
                accessToken: 'token',
            });
            mockLoginRegisteredUser.mockResolvedValue({ success: true });
            mockMergeBasket.mockResolvedValue({
                basketId: 'basket-1',
                customerInfo: { email: 'guest@x.com' },
            } as any);
            mockGetCustomer.mockResolvedValue({ email: 'customer@x.com' } as any);

            const formData = new URLSearchParams();
            formData.append('email', 'customer@x.com');
            formData.append('password', 'password123');
            formData.append('loginMode', 'password');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            // Login succeeds despite reconciliation error
            expect(result).toBeInstanceOf(Response);
            expect((result as Response).status).toBe(302);
        });
    });

    describe('action - Social Login', () => {
        it('should handle successful social login authorization', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });
            mockAuthorizeIDP.mockResolvedValue({
                success: true,
                redirectUrl:
                    'http://localhost:5173/mobify/proxy/api/shopper/auth/v1/organizations/test/oauth2/authorize',
            });

            const formData = new URLSearchParams();
            formData.append('loginMode', 'social');
            formData.append('provider', 'Google');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toBeInstanceOf(Response);
            expect((result as Response).status).toBe(302);
            expect((result as Response).headers.get('Location')).toContain('oauth2/authorize');
            expect(mockAuthorizeIDP).toHaveBeenCalledWith(mockContext, {
                hint: 'Google',
                redirectURI: 'http://localhost:5173/social-callback',
            });
        });

        it('should pass provider hint as-is for social login', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });
            mockAuthorizeIDP.mockResolvedValue({
                success: true,
                redirectUrl: 'http://example.com/oauth',
            });

            const formData = new URLSearchParams();
            formData.append('loginMode', 'social');
            formData.append('provider', 'Google');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, {
                    pattern: ROUTE_PATTERN,
                })
            );

            expect(mockAuthorizeIDP).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    hint: 'Google',
                })
            );
        });

        it('should require provider for social login', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });

            const formData = new URLSearchParams();
            formData.append('loginMode', 'social');
            // Missing provider

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toHaveProperty('error', 'An error occurred. Please try again.');
            expect(mockAuthorizeIDP).not.toHaveBeenCalled();
        });

        it('should return error on failed social authorization', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });
            mockAuthorizeIDP.mockResolvedValue({ success: false });

            const formData = new URLSearchParams();
            formData.append('loginMode', 'social');
            formData.append('provider', 'Google');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toHaveProperty('error', 'An error occurred. Please try again.');
        });
    });

    describe('action - Passwordless Login', () => {
        it('should handle successful passwordless authorization', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });
            mockAuthorizePasswordless.mockResolvedValue(undefined as any);

            const formData = new URLSearchParams();
            formData.append('loginMode', 'passwordless');
            formData.append('email', 'test@example.com');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).not.toBeInstanceOf(Response);
            const data = result as { success: boolean; showOTPForm?: boolean; email?: string };
            expect(data.success).toBe(true);
            expect(data.showOTPForm).toBe(true);
            expect(data.email).toBe('test@example.com');
            expect(mockAuthorizePasswordless).toHaveBeenCalledWith(
                mockContext,
                expect.objectContaining({
                    userid: 'test@example.com',
                })
            );
        });

        it('should require email for passwordless login', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });

            const formData = new URLSearchParams();
            formData.append('loginMode', 'passwordless');
            // Missing email

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toHaveProperty('error', 'An error occurred. Please try again.');
            expect(mockAuthorizePasswordless).not.toHaveBeenCalled();
        });

        it('should not pass external returnUrl to authorizePasswordless (open redirect prevention)', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });
            mockAuthorizePasswordless.mockResolvedValue(undefined as any);

            const formData = new URLSearchParams();
            formData.append('loginMode', 'passwordless');
            formData.append('email', 'test@example.com');

            const mockRequest = new Request('http://localhost:5173/login?returnUrl=https://evil.com', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(createActionArgs(mockRequest, mockContext, { pattern: '/login' }));

            expect(result).toHaveProperty('success', true);
            // finalRedirectPath passed to authorizePasswordless must not contain evil.com
            expect(mockAuthorizePasswordless).toHaveBeenCalledWith(
                mockContext,
                expect.objectContaining({
                    redirectPath: expect.not.stringContaining('evil.com'),
                })
            );
        });

        it('should return error on passwordless failure', async () => {
            mockGetAuth.mockReturnValue({ userType: 'guest' });
            const error = new Error('failed to authorize');
            mockAuthorizePasswordless.mockRejectedValue(error);

            const formData = new URLSearchParams();
            formData.append('loginMode', 'passwordless');
            formData.append('email', 'test@example.com');

            const mockRequest = new Request('http://localhost:5173/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const result = await action(
                createActionArgs<Route.ActionArgs>(mockRequest, mockContext, { pattern: '/login' })
            );

            expect(result).toHaveProperty('error', 'An error occurred. Please try again.');
            expect(mockAuthorizePasswordless).toHaveBeenCalledWith(
                mockContext,
                expect.objectContaining({
                    userid: 'test@example.com',
                })
            );
        });
    });

    describe('component', () => {
        // Helper to render with createRoutesStub and real action for full-flow tests
        const renderWithAction = (loaderData: Parameters<typeof Login>[0]['loaderData']) => {
            const WrappedComponent = () => <Login loaderData={loaderData} />;
            const actionContext = { get: vi.fn(), set: vi.fn() } as any;
            // Form submits to the site/locale-prefixed login path produced by buildUrl
            // (StandardLoginForm resolves `/login` against the active site context).
            const Stub = createRoutesStub([
                {
                    path: '/global/en-GB/login',
                    Component: WrappedComponent,
                    // Route-typed action needs cast for createRoutesStub's generic args
                    action: async ({ request }) =>
                        action(
                            createActionArgs<Route.ActionArgs>(request, actionContext, {
                                pattern: ROUTE_PATTERN,
                            })
                        ),
                },
            ]);
            return render(
                <AllProvidersWrapper>
                    <Stub initialEntries={['/global/en-GB/login']} />
                </AllProvidersWrapper>
            );
        };

        it('renders standard login form with all required elements', () => {
            renderWithAction({
                passwordlessSent: false,
                email: undefined,
                mode: 'password',
                isPasswordlessLoginEnabled: false,
                isSocialLoginEnabled: true,
                pageUrl: 'http://localhost/login',
                guestWishlistCount: 0,
            });

            expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/password/i)).toBeInTheDocument();

            expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
            expect(screen.getByTestId('social-buttons')).toBeInTheDocument();
        });

        it('displays error when login fails', async () => {
            const user = userEvent.setup();
            mockGetAuth.mockReturnValue({ userType: 'guest' });
            mockLoginRegisteredUser.mockResolvedValue({ success: false });

            renderWithAction({
                passwordlessSent: false,
                email: undefined,
                mode: 'password',
                isPasswordlessLoginEnabled: false,
                isSocialLoginEnabled: true,
                pageUrl: 'http://localhost/login',
                guestWishlistCount: 0,
            });

            await user.type(screen.getByLabelText(/email/i), 'test@example.com');
            await user.type(screen.getByLabelText(/password/i), 'wrongpassword');

            const submitButton = screen.getByRole('button', { name: /sign in/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText('An error occurred. Please try again.')).toBeInTheDocument();
            });
        });

        it('renders PasswordlessLoginForm when mode is passwordless', () => {
            renderWithAction({
                passwordlessSent: false,
                email: undefined,
                mode: 'passwordless',
                isPasswordlessLoginEnabled: true,
                isSocialLoginEnabled: true,
                pageUrl: 'http://localhost/login',
                guestWishlistCount: 0,
            });

            expect(screen.getByTestId('passwordless-form')).toBeInTheDocument();
            expect(screen.getByTestId('social-buttons')).toBeInTheDocument();
        });

        it('hides social login buttons when social login is disabled', () => {
            renderWithAction({
                passwordlessSent: false,
                email: undefined,
                mode: 'password',
                isPasswordlessLoginEnabled: false,
                isSocialLoginEnabled: false,
                pageUrl: 'http://localhost/login',
                guestWishlistCount: 0,
            });

            expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
            expect(screen.queryByTestId('social-buttons')).not.toBeInTheDocument();
        });

        it('displays the localized session-expired message above the form when error is set', () => {
            renderWithAction({
                error: 'errors:api.unauthorized',
                passwordlessSent: false,
                email: undefined,
                mode: 'password',
                isPasswordlessLoginEnabled: false,
                isSocialLoginEnabled: false,
                pageUrl: 'http://localhost/login',
                guestWishlistCount: 0,
            });

            expect(screen.getByText('errors:api.unauthorized')).toBeInTheDocument();
            // The message appears above the form inputs.
            const errorEl = screen.getByText('errors:api.unauthorized');
            const emailInput = screen.getByLabelText(/email/i);
            expect(errorEl.compareDocumentPosition(emailInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        });

        it('should not show error on initial render', () => {
            renderWithAction({
                passwordlessSent: false,
                email: undefined,
                mode: 'password',
                isPasswordlessLoginEnabled: false,
                isSocialLoginEnabled: true,
                pageUrl: 'http://localhost/login',
                guestWishlistCount: 0,
            });

            expect(screen.queryByText('An error occurred. Please try again.')).not.toBeInTheDocument();
        });
    });
});
