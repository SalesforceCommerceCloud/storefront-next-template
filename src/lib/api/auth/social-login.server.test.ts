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
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { authorizeIDP, loginIDPUser, handleSocialLoginLanding } from './social-login.server';
import { getAuth, updateAuth } from '@/middlewares/auth.server';
import { isTrackingConsentEnabled } from '@/middlewares/auth.utils';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { mergeBasket } from '@/lib/api/basket.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { TrackingConsent } from '@/types/tracking-consent';

const { t } = getTranslation();

// Mock createApiClients to return mocked auth.social namespace
const mockAuthSocial = {
    getAuthorizationUrl: vi.fn(),
    exchangeCode: vi.fn(),
};

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(() => ({
        auth: {
            social: mockAuthSocial,
        },
    })),
}));

vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(() => ({ usid: 'session-usid', codeVerifier: 'stored-code-verifier' })),
    updateAuth: vi.fn(),
}));

vi.mock('@/middlewares/auth.utils', () => ({
    isTrackingConsentEnabled: vi.fn(() => false),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(() => ({
        commerce: {
            api: {
                privateKeyEnabled: false,
            },
        },
    })),
}));

vi.mock('@/lib/utils', () => ({
    getErrorMessage: vi.fn((err?: any) => (err && err.message) || 'An error occurred'),
    getBasePath: vi.fn(() => ''),
    isAbsoluteURL: vi.fn((url: string) => url.startsWith('http')),
}));

vi.mock('@/lib/origin', () => ({
    getAppOrigin: vi.fn(() => 'https://example.com'),
}));

const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => mockLogger),
}));

const mockIsTrackingConsentEnabled = vi.mocked(isTrackingConsentEnabled);

/**
 * Creates a mock AuthResponse (token data with dwsid included).
 * This matches the SDK's new simplified API that extracts dwsid internally.
 */
function getMockAuthResponse(tokenResponse: Record<string, unknown>, dwsid?: string) {
    return {
        ...tokenResponse,
        dwsid,
    };
}

describe('Social Login', () => {
    const mockContext = {} as unknown as ActionFunctionArgs['context'];
    const auth = {
        getAuth: vi.mocked(getAuth),
        updateAuth: vi.mocked(updateAuth),
    };
    const cfg = { getConfig: vi.mocked(getConfig) };

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset mocks
        mockAuthSocial.getAuthorizationUrl.mockReset();
        mockAuthSocial.exchangeCode.mockReset();
        // default config
        cfg.getConfig.mockReturnValue({
            commerce: { api: { privateKeyEnabled: false, callback: '/callback' } },
        } as any);
        // default auth session
        auth.getAuth.mockReturnValue({ usid: 'session-usid', codeVerifier: 'stored-code-verifier' } as any);
        // default tracking consent disabled
        mockIsTrackingConsentEnabled.mockReturnValue(false);
    });

    afterEach(() => {
        delete (process as any).env.COMMERCE_API_SLAS_SECRET;
    });

    describe('authorizeIDP', () => {
        it('calls helper with correct args and updates session (public client)', async () => {
            const expectedUrl = 'https://slas/idp/auth-url';
            const expectedVerifier = 'code-verifier-123';
            mockAuthSocial.getAuthorizationUrl.mockResolvedValue({ url: expectedUrl, codeVerifier: expectedVerifier });

            const result = await authorizeIDP(mockContext, {
                hint: 'Google',
                redirectURI: 'https://example.com/social-callback',
            });

            // helper called with composed args
            expect(mockAuthSocial.getAuthorizationUrl).toHaveBeenCalledWith({
                hint: 'Google',
                redirectUri: 'https://example.com/social-callback',
                usid: 'session-usid',
            });

            // session updated with codeVerifier
            expect(auth.updateAuth).toHaveBeenCalledWith(mockContext, expect.any(Function));

            expect(result).toEqual({ success: true, redirectUrl: expectedUrl });
        });

        it('returns error when redirectURI is missing', async () => {
            const result = await authorizeIDP(mockContext, { hint: 'Google' });

            expect(result).toEqual({
                success: false,
                error: 'redirectURI is required for social login authorization',
            });
            expect(mockAuthSocial.getAuthorizationUrl).not.toHaveBeenCalled();
        });

        it('passes explicit redirectURI and privateClient=true when configured', async () => {
            cfg.getConfig.mockReturnValue({
                commerce: { api: { privateKeyEnabled: true, callback: '/callback' } },
            } as any);
            mockAuthSocial.getAuthorizationUrl.mockResolvedValue({ url: 'x', codeVerifier: 'y' });

            const result = await authorizeIDP(mockContext, {
                hint: 'Apple',
                redirectURI: 'https://app.example/social-callback',
                usid: 'param-usid',
            });

            // Note: privateClient is now handled internally by createApiClients
            expect(mockAuthSocial.getAuthorizationUrl).toHaveBeenCalledWith({
                hint: 'Apple',
                redirectUri: 'https://app.example/social-callback',
                usid: 'param-usid',
            });

            expect(result.success).toBe(true);
        });

        it('handles errors and returns error message', async () => {
            const err = new Error('boom');
            mockAuthSocial.getAuthorizationUrl.mockRejectedValue(err);

            const result = await authorizeIDP(mockContext, {
                hint: 'Google',
                redirectURI: 'https://example.com/social-callback',
            });

            expect(result).toEqual({ success: false, error: 'boom' });
        });
    });

    describe('loginIDPUser', () => {
        it('calls helper with correct args (public client, no clientSecret)', async () => {
            mockAuthSocial.exchangeCode.mockResolvedValue(
                getMockAuthResponse({ accessToken: 'at', refreshToken: 'rt' }, 'social-dwsid')
            );

            const result = await loginIDPUser(mockContext, {
                code: 'auth-code',
                redirectURI: 'https://app.example/social-callback',
            });

            expect(mockAuthSocial.exchangeCode).toHaveBeenCalledWith({
                code: 'auth-code',
                codeVerifier: 'stored-code-verifier',
                redirectUri: 'https://app.example/social-callback',
                usid: 'session-usid',
            });

            // Single updateAuth call: tokens saved (which also wipes the code verifier from
            // storage) and userType derives from the JWT inside updateAuth — no follow-up call.
            expect(auth.updateAuth).toHaveBeenCalledTimes(1);
            expect(auth.updateAuth).toHaveBeenCalledWith(mockContext, expect.objectContaining({ accessToken: 'at' }));
            expect(result).toEqual({ success: true });
        });

        it('includes clientSecret when privateKeyEnabled=true', async () => {
            cfg.getConfig.mockReturnValue({
                commerce: { api: { privateKeyEnabled: true, callback: '/callback' } },
            } as any);
            (process as any).env.COMMERCE_API_SLAS_SECRET = 'super-secret';
            mockAuthSocial.exchangeCode.mockResolvedValue(getMockAuthResponse({ accessToken: 'at' }));

            await loginIDPUser(mockContext, {
                code: 'auth-code',
                redirectURI: 'https://app.example/social-callback',
                usid: 'explicit-usid',
            });

            // Note: clientSecret is now handled internally by createApiClients
            expect(mockAuthSocial.exchangeCode).toHaveBeenCalledWith({
                code: 'auth-code',
                codeVerifier: 'stored-code-verifier',
                redirectUri: 'https://app.example/social-callback',
                usid: 'explicit-usid',
            });
        });

        it('includes DNT value when feature is enabled and trackingConsent exists in auth context', async () => {
            auth.getAuth.mockReturnValue({
                usid: 'session-usid',
                codeVerifier: 'stored-code-verifier',
                trackingConsent: TrackingConsent.Declined, // Enum value representing 'do not track'
            } as any);
            mockIsTrackingConsentEnabled.mockReturnValue(true);
            mockAuthSocial.exchangeCode.mockResolvedValue(getMockAuthResponse({ accessToken: 'at' }));

            await loginIDPUser(mockContext, {
                code: 'auth-code',
                redirectURI: 'https://app.example/social-callback',
            });

            expect(mockAuthSocial.exchangeCode).toHaveBeenCalledWith({
                code: 'auth-code',
                codeVerifier: 'stored-code-verifier',
                redirectUri: 'https://app.example/social-callback',
                usid: 'session-usid',
                dnt: true, // Converted from TrackingConsent.Declined to boolean
            });
        });

        it('does not include DNT when feature is disabled', async () => {
            auth.getAuth.mockReturnValue({
                usid: 'session-usid',
                codeVerifier: 'stored-code-verifier',
                trackingConsent: TrackingConsent.Declined, // Enum value
            } as any);
            mockIsTrackingConsentEnabled.mockReturnValue(false);
            mockAuthSocial.exchangeCode.mockResolvedValue(getMockAuthResponse({ accessToken: 'at' }));

            await loginIDPUser(mockContext, {
                code: 'auth-code',
                redirectURI: 'https://app.example/social-callback',
            });

            expect(mockAuthSocial.exchangeCode).toHaveBeenCalledWith({
                code: 'auth-code',
                codeVerifier: 'stored-code-verifier',
                redirectUri: 'https://app.example/social-callback',
                usid: 'session-usid',
                // No dnt parameter when feature is disabled
            });
        });

        it('does not include DNT when it does not exist in auth context', async () => {
            auth.getAuth.mockReturnValue({
                usid: 'session-usid',
                codeVerifier: 'stored-code-verifier',
                // No trackingConsent property
            } as any);
            mockIsTrackingConsentEnabled.mockReturnValue(true);
            mockAuthSocial.exchangeCode.mockResolvedValue(getMockAuthResponse({ accessToken: 'at' }));

            await loginIDPUser(mockContext, {
                code: 'auth-code',
                redirectURI: 'https://app.example/social-callback',
            });

            expect(mockAuthSocial.exchangeCode).toHaveBeenCalledWith({
                code: 'auth-code',
                codeVerifier: 'stored-code-verifier',
                redirectUri: 'https://app.example/social-callback',
                usid: 'session-usid',
                // No dnt parameter when trackingConsent is not set
            });
        });

        it('uses DNT value false when trackingConsent is Accepted', async () => {
            auth.getAuth.mockReturnValue({
                usid: 'session-usid',
                codeVerifier: 'stored-code-verifier',
                trackingConsent: TrackingConsent.Accepted, // Enum value representing tracking accepted
            } as any);
            mockIsTrackingConsentEnabled.mockReturnValue(true);
            mockAuthSocial.exchangeCode.mockResolvedValue(getMockAuthResponse({ accessToken: 'at' }));

            await loginIDPUser(mockContext, {
                code: 'auth-code',
                redirectURI: 'https://app.example/social-callback',
            });

            expect(mockAuthSocial.exchangeCode).toHaveBeenCalledWith({
                code: 'auth-code',
                codeVerifier: 'stored-code-verifier',
                redirectUri: 'https://app.example/social-callback',
                usid: 'session-usid',
                dnt: false, // Converted from TrackingConsent.Accepted to boolean
            });
        });

        it('handles missing codeVerifier and returns failure', async () => {
            auth.getAuth.mockReturnValue({ usid: 'session-usid', codeVerifier: undefined } as any);

            const result = await loginIDPUser(mockContext, {
                code: 'auth-code',
                redirectURI: 'https://app.example/social-callback',
            });

            expect(result).toEqual({ success: false, error: expect.any(String) });
            expect(mockAuthSocial.exchangeCode).not.toHaveBeenCalled();
        });

        it('handles helper error and returns error message', async () => {
            mockAuthSocial.exchangeCode.mockRejectedValue(new Error('login failed'));

            const result = await loginIDPUser(mockContext, {
                code: 'auth-code',
                redirectURI: 'https://app.example/social-callback',
            });

            expect(result).toEqual({ success: false, error: 'login failed' });
        });
    });
});

vi.mock('@/lib/api/basket.server', () => ({
    mergeBasket: vi.fn(),
}));

vi.mock('@/lib/api/wishlist.server', () => ({
    captureGuestWishlistSnapshot: vi.fn().mockResolvedValue(null),
    mergeWishlist: vi.fn().mockResolvedValue({
        merged: 0,
        skipped: 0,
        failed: 0,
        mergedProductIds: [],
        skippedProductIds: [],
        failedProductIds: [],
    }),
    appendWishlistMergeFlag: vi.fn((_context: any, url: string) => ({ url, setCookie: '' })),
}));

const mockMergeBasket = vi.mocked(mergeBasket);
const mockGetConfig = vi.mocked(getConfig);
const mockGetAuth = vi.mocked(getAuth);

describe('handleSocialLoginCallback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuthSocial.getAuthorizationUrl.mockReset();
        mockAuthSocial.exchangeCode.mockReset();
        mockAuthSocial.exchangeCode.mockResolvedValue(
            getMockAuthResponse({ accessToken: 'at', refreshToken: 'rt' }, 'social-callback-dwsid')
        );
        mockGetAuth.mockReturnValue({ usid: 'session-usid', codeVerifier: 'stored-code-verifier' } as any);

        // Default config mock
        mockGetConfig.mockReturnValue({
            commerce: {
                api: {
                    privateKeyEnabled: false,
                    callback: '/callback',
                },
            },
            features: {
                socialLogin: {
                    enabled: true,
                    callbackUri: '/social-callback',
                    providers: [],
                },
            },
        } as any);
    });

    describe('Successful Login Flow', () => {
        it('should handle successful login with code and usid', async () => {
            mockMergeBasket.mockResolvedValue({
                basketId: 'merged-basket-123',
                productItems: [{ productId: 'test-product' }],
            } as any);

            const mockRequest = new Request(
                'http://localhost:5173/social-callback?code=auth_code_123&usid=user_session_id'
            );
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const args: LoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: mockContext,
            } as any;

            const result = await handleSocialLoginLanding(args);

            expect(mockAuthSocial.exchangeCode).toHaveBeenCalledTimes(1);
            const loginCall = mockAuthSocial.exchangeCode.mock.calls[0]?.[0];
            expect(loginCall).toMatchObject({
                code: 'auth_code_123',
                codeVerifier: 'stored-code-verifier',
                usid: 'user_session_id',
                redirectUri: 'https://example.com/social-callback',
            });
            expect(mockMergeBasket).toHaveBeenCalledWith(mockContext);
            expect(result).toBeInstanceOf(Response);
            expect(result.status).toBe(302);
            expect(result.headers.get('Location')).toBe('/');
        });

        it('should handle successful login without usid parameter', async () => {
            mockMergeBasket.mockResolvedValue({
                basketId: 'merged-basket-123',
            } as any);

            const mockRequest = new Request('http://localhost:5173/social-callback?code=auth_code_123');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const args: LoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: mockContext,
            } as any;

            const result = await handleSocialLoginLanding(args);

            expect(mockAuthSocial.exchangeCode).toHaveBeenCalledTimes(1);
            const loginCall = mockAuthSocial.exchangeCode.mock.calls[0]?.[0];
            expect(loginCall).toMatchObject({
                code: 'auth_code_123',
                usid: 'session-usid',
                redirectUri: 'https://example.com/social-callback',
            });
            expect(result.status).toBe(302);
            expect(result.headers.get('Location')).toBe('/');
        });

        it('should handle basket merge errors gracefully and still redirect', async () => {
            mockMergeBasket.mockRejectedValue(new Error('Basket merge failed'));

            const mockRequest = new Request('http://localhost:5173/social-callback?code=auth_code_123');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const args: LoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: mockContext,
            } as any;

            const result = await handleSocialLoginLanding(args);

            expect(mockMergeBasket).toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledWith('SocialLogin: basket merge failed', {
                error: expect.any(Error),
            });
            // Should still redirect to home despite basket merge failure
            expect(result.status).toBe(302);
            expect(result.headers.get('Location')).toBe('/');
        });

        it('should use config callbackUri for redirectURI construction', async () => {
            mockGetConfig.mockReturnValue({
                commerce: {
                    api: {
                        privateKeyEnabled: false,
                    },
                },
                features: {
                    socialLogin: {
                        enabled: true,
                        callbackUri: '/custom-callback',
                        providers: [],
                    },
                },
            } as any);

            mockMergeBasket.mockResolvedValue({ basketId: 'test' } as any);

            const mockRequest = new Request('http://localhost:5173/custom-callback?code=test');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const args: LoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: mockContext,
            } as any;

            await handleSocialLoginLanding(args);

            const loginCall = mockAuthSocial.exchangeCode.mock.calls[0]?.[0];
            expect(loginCall).toMatchObject({
                code: 'test',
                usid: 'session-usid',
                redirectUri: 'https://example.com/custom-callback',
            });
        });
    });

    describe('Failed Login', () => {
        it('should redirect to login with error param on failed IDP login', async () => {
            mockAuthSocial.exchangeCode.mockRejectedValue(new Error('Invalid code'));

            const mockRequest = new Request('http://localhost:5173/social-callback?code=invalid_code');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const args: LoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: mockContext,
            } as any;

            const result = await handleSocialLoginLanding(args);

            expect(mockAuthSocial.exchangeCode).toHaveBeenCalled();
            expect(mockMergeBasket).not.toHaveBeenCalled();
            expect(result.status).toBe(302);
            // Should redirect with error in URL parameter
            const location = result.headers.get('Location');
            expect(location).toContain('/login?error=');
        });
    });

    describe('Error Handling', () => {
        it('should redirect to login with error param on error from social provider', async () => {
            const mockRequest = new Request('http://localhost:5173/social-callback?error=access_denied');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const args: LoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: mockContext,
            } as any;

            const result = await handleSocialLoginLanding(args);

            expect(result).toBeInstanceOf(Response);
            expect(result.status).toBe(302);
            // Should redirect with error in URL parameter
            const location = result.headers.get('Location');
            expect(location).toContain('/login?error=');
            expect(location).toBeTruthy();
            expect(decodeURIComponent(location as string)).toContain(t('socialCallback:socialError'));
        });

        it('should redirect to login with error param when no code or error provided', async () => {
            const mockRequest = new Request('http://localhost:5173/social-callback');
            const mockContext = { get: vi.fn(), set: vi.fn() };
            const args: LoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: mockContext,
            } as any;

            const result = await handleSocialLoginLanding(args);

            expect(mockAuthSocial.exchangeCode).not.toHaveBeenCalled();
            expect(mockMergeBasket).not.toHaveBeenCalled();
            expect(result.status).toBe(302);
            // Should redirect with error in URL parameter
            const location = result.headers.get('Location');
            expect(location).toContain('/login?error=');
        });
    });
});
