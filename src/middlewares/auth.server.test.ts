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
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { RouterContextProvider } from 'react-router';
import type { SessionData as AuthData } from '@/lib/api/types';
import { type AuthStorageData, AUTH_TOKEN_INVALID_ERROR, authStorageContext } from '@/middlewares/auth.utils';
import { performanceTimerContext } from '@/middlewares/performance-metrics';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { siteContext, type SiteContext } from '@salesforce/storefront-next-runtime/site-context';
import type { AppConfig } from '@/types/config';
import { getSitePrefix, mockAltSiteObject, mockConfig, mockSiteObject } from '@/test-utils/config';
import { buildMockAccessToken, buildMockTokenResponse } from '@/test-utils/auth';
import { TrackingConsent } from '@/types/tracking-consent';
import authMiddleware, {
    refreshAccessToken,
    loginGuestUser,
    loginRegisteredUser,
    authorizePasswordless,
    getPasswordResetToken,
    requestOtp,
    verifyOtp,
    resetPasswordWithToken,
    getPasswordLessAccessToken,
    getAuth,
    updateAuth,
    destroyAuth,
    flashAuth,
    clearInvalidSessionAndRestoreGuest,
} from './auth.server';
import type { ShopperLogin } from '@/scapi';

const mockLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
};

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => mockLogger),
    loggerContext: {},
}));

// Mock createApiClients to return mocked auth namespace
const mockAuth = {
    refreshToken: vi.fn(),
    loginAsGuest: vi.fn(),
    loginWithCredentials: vi.fn(),
    passwordless: {
        authorize: vi.fn(),
        exchangeToken: vi.fn(),
    },
    password: {
        requestReset: vi.fn(),
        reset: vi.fn(),
    },
    otp: {
        request: vi.fn(),
        verify: vi.fn(),
    },
};

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(() => ({
        auth: mockAuth,
    })),
}));

// Mock cookie-utils
vi.mock('@/lib/cookie-utils.server', () => ({
    createCookie: vi.fn(),
    getCookieConfig: vi.fn((overrides = {}) => ({
        httpOnly: false,
        secure: true,
        sameSite: 'lax' as const,
        path: '/',
        ...overrides,
    })),
    getCookieNameWithSiteId: vi.fn((name: string) => name),
    parseAllCookies: vi.fn(),
}));

// Mock performance metrics
const mockPerformanceTimer = {
    mark: vi.fn(),
};

vi.mock('@/middlewares/performance-metrics', () => ({
    performanceTimerContext: Symbol('performanceTimerContext'),
    PERFORMANCE_MARKS: {
        authRefreshAccessToken: 'authRefreshAccessToken',
        authLoginGuestUser: 'authLoginGuestUser',
        authLoginGuestUserPrivate: 'authLoginGuestUserPrivate',
        authLoginRegisteredUser: 'authLoginRegisteredUser',
        authAuthorizePasswordless: 'authAuthorizePasswordless',
        authGetPasswordResetToken: 'authGetPasswordResetToken',
        authRequestOtp: 'authRequestOtp',
        authVerifyOtp: 'authVerifyOtp',
        authResetPasswordWithToken: 'authResetPasswordWithToken',
        authGetPasswordLessAccessToken: 'authGetPasswordLessAccessToken',
        authRefreshToken: 'authRefreshToken',
        authGuestLogin: 'authGuestLogin',
    },
}));

vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({
    getTranslation: vi.fn(() => ({
        t: (key: string) => key,
    })),
    getLocale: vi.fn(() => mockAltSiteObject.defaultLocale),
    mockI18nContext: vi.fn(),
}));

// Mock utils
vi.mock('@/lib/utils', () => ({
    extractResponseError: vi.fn().mockResolvedValue({
        responseMessage: 'Default error message',
        status_code: '500',
    }),
    isAbsoluteURL: vi.fn((url: string) => url.startsWith('http')),
    stringToBase64: vi.fn((str: string) => Buffer.from(str).toString('base64')),
}));

vi.mock('@/lib/origin', () => ({
    getAppOrigin: vi.fn(() => 'https://example.com'),
}));

// Use the shared `buildMockTokenResponse` helper so fixtures stay in sync with the
// middleware's JWT-validation expectations. Wrapped here as a zero-arg function for
// test ergonomics (matches the previous local helper signature).
function getMockTokenResponse(): ShopperLogin.schemas['TokenResponse'] {
    return buildMockTokenResponse();
}

/**
 * Creates a mock AuthResponse (token data with dwsid included).
 * This matches the SDK's new simplified API that extracts dwsid internally.
 */
function getMockAuthResponse(tokenResponse?: ShopperLogin.schemas['TokenResponse'], dwsid?: string) {
    return {
        ...(tokenResponse ?? getMockTokenResponse()),
        dwsid,
    };
}

function createAuthTokenInvalidError() {
    const error = new Error('Access token is invalid or revoked');
    error.name = 'AuthTokenInvalidError';
    return error;
}

function mockContext(
    data: AuthStorageData = {},
    isSlasPrivate = false
): {
    provider: RouterContextProvider;
    storage: Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>;
    appConfig: AppConfig;
} {
    const provider = new RouterContextProvider();
    const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>(
        Object.entries(data) as [keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]][]
    );

    // Create mock app config
    // Use structuredClone to create a deep copy of the mockConfig object to prevent test pollution
    const appConfig: AppConfig = structuredClone(mockConfig);

    // Override commerce.api.privateKeyEnabled after cloning
    appConfig.commerce.api.privateKeyEnabled = isSlasPrivate;

    // Mock provider.get to return storage, performance timer, i18next, or appConfig based on context key
    vi.spyOn(provider, 'get').mockImplementation((key) => {
        if (key === performanceTimerContext) {
            return mockPerformanceTimer;
        }
        if (key === appConfigContext) {
            return appConfig;
        }
        return storage;
    });

    return {
        provider,
        storage,
        appConfig,
    };
}

function getMockAuthData(): AuthData {
    return {
        accessToken: 'access_token',
        accessTokenExpiry: Date.now() + 1_000,
        refreshToken: 'refresh_token',
        refreshTokenExpiry: Date.now() + 10_000,
        userType: 'guest',
        usid: 'usid',
        customerId: 'customer_id',
        codeVerifier: 'codeVerifier',
        dwsid: 'dwsid',
        idpAccessToken: 'idp_access_token',
        idToken: 'id_token',
        idpRefreshToken: 'idp_refresh_token',
        trackingConsent: TrackingConsent.Declined,
    };
}

function getMockRegisteredAuthData(): AuthData {
    return {
        accessToken: 'access_token',
        accessTokenExpiry: Date.now() + 1_000,
        refreshToken: 'refresh_token',
        refreshTokenExpiry: Date.now() + 10_000,
        userType: 'registered',
        usid: 'usid',
        customerId: 'customer_id',
        codeVerifier: 'codeVerifier',
        dwsid: 'dwsid',
        idpAccessToken: 'idp_access_token',
        idToken: 'id_token',
        idpRefreshToken: 'idp_refresh_token',
        trackingConsent: TrackingConsent.Declined,
    };
}

describe('auth middleware (server)', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Set required environment variables
        vi.stubEnv('COMMERCE_API_SLAS_SECRET', 'test-secret');

        // Reset mock implementations
        mockAuth.refreshToken.mockReset();
        mockAuth.loginAsGuest.mockReset();
        mockAuth.loginWithCredentials.mockReset();
        mockAuth.passwordless.authorize.mockReset();
        mockAuth.passwordless.exchangeToken.mockReset();
        mockAuth.password.requestReset.mockReset();
        mockAuth.password.reset.mockReset();
        mockAuth.otp.request.mockReset();
        mockAuth.otp.verify.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
    });
    describe('getAuth()', () => {
        test('should retrieve auth data from context', () => {
            const data = getMockAuthData();
            const { provider } = mockContext(data);

            const result = getAuth(provider);

            expect(result).toEqual(data);
        });

        test('should return empty object for empty storage', () => {
            const { provider } = mockContext();

            const result = getAuth(provider);

            expect(result).toEqual({});
        });
    });

    describe('updateAuth()', () => {
        test('should update storage and mark as updated', () => {
            const data = getMockAuthData();
            const { provider, storage } = mockContext(data);

            const tokenResponse = getMockTokenResponse();
            updateAuth(provider, tokenResponse);

            expect(storage.get('accessToken')).toBe(tokenResponse.access_token);
            expect(storage.get('isUpdated')).toBe(true);
        });

        test('post-login session state matches registered token claims (in-request, no second call)', () => {
            // Acceptance criterion (bug-fix proof): after updateAuth() with a registered token
            // response, getAuth(context).customerId must equal the JWT's rcid (NOT the previous
            // guest gcid) and userType must be 'registered' — within the same request, before
            // any post-login basket/wishlist/customer SCAPI call. Prior to this refactor a
            // follow-up `updateAuth(s => ({ ...s, userType: 'registered' }))` call was needed
            // to flip userType, and crucially that follow-up did NOT re-derive customerId, so
            // session.customerId stayed stuck on the guest gcid for the rest of the request.
            const guestData = getMockAuthData();
            guestData.customerId = 'guest-cust-1';
            guestData.userType = 'guest';
            const { provider, storage } = mockContext(guestData);

            const registeredTokenResponse = buildMockTokenResponse({
                accessToken: { customerId: 'guest-cust-1', rcid: 'reg-cust-1', usid: 'usid-2' },
                customer_id: 'reg-cust-1',
                usid: 'usid-2',
            });

            updateAuth(provider, registeredTokenResponse);

            expect(storage.get('userType')).toBe('registered');
            expect(storage.get('customerId')).toBe('reg-cust-1');
            expect(storage.get('usid')).toBe('usid-2');
        });
    });

    describe('destroyAuth()', () => {
        test('should mark storage as destroyed', () => {
            const data = getMockAuthData();
            const { provider, storage } = mockContext(data);

            destroyAuth(provider);

            expect(storage.get('isDestroyed')).toBe(true);
        });
    });

    describe('flashAuth()', () => {
        test('should set error message in storage', () => {
            const data = getMockAuthData();
            const { provider, storage } = mockContext(data);

            flashAuth(provider, 'Authentication failed');

            expect(storage.get('error')).toBe('Authentication failed');
        });

        test('should use empty string when no message provided', () => {
            const data = getMockAuthData();
            const { provider, storage } = mockContext(data);

            flashAuth(provider);

            expect(storage.get('error')).toBe('');
        });
    });
    describe('refreshAccessToken', () => {
        it('should refresh access token successfully', async () => {
            const { provider } = mockContext();
            const mockTokenResponse = getMockTokenResponse();
            const refreshToken = 'refresh-token-456';

            mockAuth.refreshToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse, 'test-dwsid'));

            const result = await refreshAccessToken(provider, refreshToken);

            expect(mockAuth.refreshToken).toHaveBeenCalledWith({
                refreshToken,
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: 'test-dwsid' });
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: refreshAccessToken starting', {
                hasTrackingConsent: false,
            });
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: refreshAccessToken succeeded');
        });

        it('should include client secret when SLAS is private', async () => {
            const { provider } = mockContext({}, true);
            const mockTokenResponse = getMockTokenResponse();
            const refreshToken = 'refresh-token-456';

            mockAuth.refreshToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await refreshAccessToken(provider, refreshToken);

            // Note: clientSecret is now handled internally by createApiClients
            expect(mockAuth.refreshToken).toHaveBeenCalledWith({
                refreshToken,
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it('should handle refresh token failure', async () => {
            const { provider } = mockContext();
            const refreshToken = 'invalid-refresh-token';
            const mockError = new Error('Invalid refresh token');

            mockAuth.refreshToken.mockRejectedValue(mockError);

            await expect(refreshAccessToken(provider, refreshToken)).rejects.toThrow('Invalid refresh token');
            expect(mockLogger.error).toHaveBeenCalledWith('Auth: refreshAccessToken failed', {
                error: mockError,
            });
        });

        it('should include DNT value when provided in options', async () => {
            const { provider } = mockContext();
            const mockTokenResponse = getMockTokenResponse();
            const refreshToken = 'refresh-token-456';

            mockAuth.refreshToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await refreshAccessToken(provider, refreshToken, {
                trackingConsent: TrackingConsent.Declined,
            });

            expect(mockAuth.refreshToken).toHaveBeenCalledWith({
                refreshToken,
                dnt: true, // TrackingConsent.Declined converts to true
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it('should include DNT value from auth context when feature is enabled and not provided in options', async () => {
            const authData = getMockAuthData();
            authData.trackingConsent = TrackingConsent.Declined; // DNT enabled (TrackingConsent enum)
            const { provider, appConfig } = mockContext(authData);
            // Enable tracking consent feature
            appConfig.engagement = {
                ...appConfig.engagement,
                analytics: {
                    ...appConfig.engagement.analytics,
                    trackingConsent: {
                        enabled: true,
                        defaultTrackingConsent: TrackingConsent.Accepted,
                    },
                },
            };

            const mockTokenResponse = getMockTokenResponse();
            const refreshToken = 'refresh-token-456';

            mockAuth.refreshToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await refreshAccessToken(provider, refreshToken);

            expect(mockAuth.refreshToken).toHaveBeenCalledWith({
                refreshToken,
                dnt: true, // TrackingConsent.Declined converts to true
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it('should prioritize DNT from options over auth context', async () => {
            const authData = getMockAuthData();
            authData.trackingConsent = TrackingConsent.Declined; // DNT enabled in context
            const { provider, appConfig } = mockContext(authData);
            // Enable tracking consent feature
            appConfig.engagement = {
                ...appConfig.engagement,
                analytics: {
                    ...appConfig.engagement.analytics,
                    trackingConsent: {
                        enabled: true,
                        defaultTrackingConsent: TrackingConsent.Accepted,
                    },
                },
            };

            const mockTokenResponse = getMockTokenResponse();
            const refreshToken = 'refresh-token-456';

            mockAuth.refreshToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            // Pass Accepted in options, should override context value
            const result = await refreshAccessToken(provider, refreshToken, {
                trackingConsent: TrackingConsent.Accepted,
            });

            expect(mockAuth.refreshToken).toHaveBeenCalledWith({
                refreshToken,
                dnt: false, // TrackingConsent.Accepted converts to false
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it('should not include DNT when feature is disabled', async () => {
            const authData = getMockAuthData();
            authData.trackingConsent = TrackingConsent.Declined;
            const { provider, appConfig } = mockContext(authData);
            // Ensure tracking consent is disabled
            appConfig.engagement = {
                ...appConfig.engagement,
                analytics: {
                    ...appConfig.engagement.analytics,
                    trackingConsent: undefined,
                },
            };

            const mockTokenResponse = getMockTokenResponse();
            const refreshToken = 'refresh-token-456';

            mockAuth.refreshToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await refreshAccessToken(provider, refreshToken);

            expect(mockAuth.refreshToken).toHaveBeenCalledWith({
                refreshToken,
                // No dnt parameter when feature is disabled
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });
    });

    describe('loginGuestUser', () => {
        it('should login guest user without usid', async () => {
            const { provider } = mockContext();
            const mockTokenResponse = getMockTokenResponse();

            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse, 'guest-dwsid'));

            const result = await loginGuestUser(provider);

            expect(mockAuth.loginAsGuest).toHaveBeenCalledWith({
                usid: undefined,
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: 'guest-dwsid' });
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: loginGuestUser starting', {
                hasUsid: false,
                isSlasPrivate: false,
            });
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: loginGuestUser succeeded');
        });

        it('should login guest user with usid', async () => {
            const { provider } = mockContext();
            const mockTokenResponse = getMockTokenResponse();
            const usid = 'existing-usid';

            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await loginGuestUser(provider, { usid });

            expect(mockAuth.loginAsGuest).toHaveBeenCalledWith({
                usid,
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it('should use loginGuestUserPrivate when SLAS is private', async () => {
            const { provider } = mockContext({}, true);
            const mockTokenResponse = getMockTokenResponse();

            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await loginGuestUser(provider);

            // Note: private vs public client is now handled internally by createApiClients
            expect(mockAuth.loginAsGuest).toHaveBeenCalledWith({
                usid: undefined,
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it('should handle guest login failure', async () => {
            const { provider } = mockContext();
            const mockError = new Error('Guest login failed');

            mockAuth.loginAsGuest.mockRejectedValue(mockError);

            await expect(loginGuestUser(provider)).rejects.toThrow('Guest login failed');
            expect(mockLogger.error).toHaveBeenCalledWith('Auth: loginGuestUser failed', {
                error: mockError,
            });
        });
    });

    describe('loginRegisteredUser', () => {
        it('should login registered user successfully', async () => {
            const authData = getMockRegisteredAuthData();
            // Remove trackingConsent so dnt is not included by default
            delete authData.trackingConsent;
            const { provider } = mockContext(authData);
            const mockTokenResponse = getMockTokenResponse();
            const email = 'test@example.com';
            const password = 'password123';

            mockAuth.loginWithCredentials.mockResolvedValue(getMockAuthResponse(mockTokenResponse, 'registered-dwsid'));

            const result = await loginRegisteredUser(provider, email, password);

            expect(mockAuth.loginWithCredentials).toHaveBeenCalledWith({
                username: email,
                password,
                usid: 'usid',
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: 'registered-dwsid' });
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: loginRegisteredUser starting', {
                hasUsid: true,
                hasTrackingConsent: false,
            });
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: loginRegisteredUser succeeded');
        });

        it('should login registered user with custom parameters', async () => {
            const authData = getMockRegisteredAuthData();
            // Remove trackingConsent so dnt is not included by default
            delete authData.trackingConsent;
            const { provider } = mockContext(authData);
            const mockTokenResponse = getMockTokenResponse();
            const email = 'test@example.com';
            const password = 'password123';
            const customParameters = { c_customField: 'value' };

            mockAuth.loginWithCredentials.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await loginRegisteredUser(provider, email, password, { customParameters });

            // Note: customParameters are no longer passed to the new auth namespace
            expect(mockAuth.loginWithCredentials).toHaveBeenCalledWith({
                username: email,
                password,
                usid: 'usid',
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it('should include client secret when SLAS is private', async () => {
            const authData = getMockRegisteredAuthData();
            // Remove trackingConsent so dnt is not included by default
            delete authData.trackingConsent;
            const { provider } = mockContext(authData, true);
            const mockTokenResponse = getMockTokenResponse();
            const email = 'test@example.com';
            const password = 'password123';

            mockAuth.loginWithCredentials.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await loginRegisteredUser(provider, email, password);

            // Note: clientSecret is now handled internally by createApiClients
            expect(mockAuth.loginWithCredentials).toHaveBeenCalledWith({
                username: email,
                password,
                usid: 'usid',
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it('should handle login failure with invalid credentials', async () => {
            const { provider } = mockContext();
            const email = 'test@example.com';
            const password = 'wrong-password';
            const mockError = new Error('Invalid credentials');

            mockAuth.loginWithCredentials.mockRejectedValue(mockError);

            await expect(loginRegisteredUser(provider, email, password)).rejects.toThrow('Invalid credentials');
            expect(mockLogger.error).toHaveBeenCalledWith('Auth: loginRegisteredUser failed', {
                error: mockError,
            });
        });

        it('should include DNT value when feature is enabled and DNT exists in auth context', async () => {
            const authData = getMockRegisteredAuthData();
            authData.trackingConsent = TrackingConsent.Declined; // DNT enabled (TrackingConsent enum)
            const { provider, appConfig } = mockContext(authData);
            // Enable tracking consent feature
            appConfig.engagement = {
                ...appConfig.engagement,
                analytics: {
                    ...appConfig.engagement.analytics,
                    trackingConsent: {
                        enabled: true,
                        defaultTrackingConsent: TrackingConsent.Accepted,
                    },
                },
            };

            const mockTokenResponse = getMockTokenResponse();
            const email = 'test@example.com';
            const password = 'password123';

            mockAuth.loginWithCredentials.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await loginRegisteredUser(provider, email, password);

            expect(mockAuth.loginWithCredentials).toHaveBeenCalledWith({
                username: email,
                password,
                usid: 'usid',
                dnt: true, // TrackingConsent.Declined converts to true
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it('should not include DNT when feature is disabled', async () => {
            const authData = getMockRegisteredAuthData();
            authData.trackingConsent = TrackingConsent.Declined;
            const { provider, appConfig } = mockContext(authData);
            // Ensure tracking consent is disabled
            appConfig.engagement = {
                ...appConfig.engagement,
                analytics: {
                    ...appConfig.engagement.analytics,
                    trackingConsent: undefined,
                },
            };

            const mockTokenResponse = getMockTokenResponse();
            const email = 'test@example.com';
            const password = 'password123';

            mockAuth.loginWithCredentials.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await loginRegisteredUser(provider, email, password);

            expect(mockAuth.loginWithCredentials).toHaveBeenCalledWith({
                username: email,
                password,
                usid: 'usid',
                // No dnt parameter when feature is disabled
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it('should use DNT value false when provided', async () => {
            const authData = getMockRegisteredAuthData();
            authData.trackingConsent = TrackingConsent.Accepted; // DNT set to false (tracking accepted)
            const { provider, appConfig } = mockContext(authData);
            // Enable tracking consent feature
            appConfig.engagement = {
                ...appConfig.engagement,
                analytics: {
                    ...appConfig.engagement.analytics,
                    trackingConsent: {
                        enabled: true,
                        defaultTrackingConsent: TrackingConsent.Accepted,
                    },
                },
            };

            const mockTokenResponse = getMockTokenResponse();
            const email = 'test@example.com';
            const password = 'password123';

            mockAuth.loginWithCredentials.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await loginRegisteredUser(provider, email, password);

            expect(mockAuth.loginWithCredentials).toHaveBeenCalledWith({
                username: email,
                password,
                usid: 'usid',
                dnt: false, // TrackingConsent.Accepted converts to false
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it.each([
            {
                label: 'skipUsid=true omits usid so SLAS issues a fresh session',
                skipUsid: true,
                expectedUsid: undefined,
            },
            {
                label: 'skipUsid=false passes existing usid to preserve session',
                skipUsid: false,
                expectedUsid: 'usid',
            },
        ])('$label', async ({ skipUsid, expectedUsid }) => {
            const authData = getMockRegisteredAuthData();
            delete authData.trackingConsent;
            const { provider } = mockContext(authData);
            const mockTokenResponse = getMockTokenResponse();

            mockAuth.loginWithCredentials.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            await loginRegisteredUser(provider, 'test@example.com', 'password123', { skipUsid });

            expect(mockAuth.loginWithCredentials).toHaveBeenCalledWith(expect.objectContaining({ usid: expectedUsid }));
        });
    });

    describe('authorizePasswordless', () => {
        it('should authorize passwordless login successfully', async () => {
            const { provider } = mockContext(getMockAuthData());
            const userid = 'test@example.com';

            const mockResponse = {
                data: 'success',
                response: new Response(null, { status: 200 }),
            };

            mockAuth.passwordless.authorize.mockResolvedValue(mockResponse);

            const result = await authorizePasswordless(provider, {
                userid,
            });

            expect(result).toBe(mockResponse);
            expect(result.response.status).toBe(200);
            expect(mockAuth.passwordless.authorize).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: userid,
                    usid: 'usid',
                    callbackUri: expect.any(String),
                    locale: mockAltSiteObject.defaultLocale,
                })
            );
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: authorizePasswordless starting', {
                mode: 'email',
            });
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: authorizePasswordless succeeded');
        });

        it('should authorize passwordless with redirect path', async () => {
            const { provider } = mockContext();
            const userid = 'test@example.com';
            const redirectPath = '/dashboard';

            const mockResponse = {
                data: 'success',
                response: new Response(null, { status: 200 }),
            };

            mockAuth.passwordless.authorize.mockResolvedValue(mockResponse);

            const result = await authorizePasswordless(provider, {
                userid,
                redirectPath,
            });

            expect(result).toBe(mockResponse);
            expect(result.response.status).toBe(200);
            expect(mockAuth.passwordless.authorize).toHaveBeenCalledWith(
                expect.objectContaining({
                    callbackUri: expect.stringContaining('redirectUrl=%2Fdashboard'),
                })
            );
        });

        it('should throw error on passwordless authorization failure', async () => {
            const { provider } = mockContext();
            const userid = 'test@example.com';
            const mockError = new Error('Authorization failed');

            mockAuth.passwordless.authorize.mockRejectedValue(mockError);

            await expect(authorizePasswordless(provider, { userid })).rejects.toThrow('Authorization failed');
            expect(mockLogger.error).toHaveBeenCalledWith('Auth: authorizePasswordless failed', {
                error: mockError,
            });
        });

        it('should return response with non-200 status', async () => {
            const { provider } = mockContext();
            const userid = 'test@example.com';

            const mockResponse = {
                data: 'error',
                response: new Response(JSON.stringify({ message: 'Bad request' }), { status: 400 }),
            };

            mockAuth.passwordless.authorize.mockResolvedValue(mockResponse);

            const result = await authorizePasswordless(provider, { userid });

            expect(result.response.status).toBe(400);
        });

        it('should pass registration fields when registerCustomer is true', async () => {
            const { provider } = mockContext(getMockAuthData());
            const mockResponse = {
                data: 'success',
                response: new Response(null, { status: 200 }),
            };

            mockAuth.passwordless.authorize.mockResolvedValue(mockResponse);

            await authorizePasswordless(provider, {
                userid: 'test@example.com',
                registerCustomer: true,
                firstName: 'John',
                lastName: 'Doe',
            });

            expect(mockAuth.passwordless.authorize).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'test@example.com',
                    registerCustomer: true,
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'test@example.com',
                })
            );
        });

        it('should not include registration fields when registerCustomer is not set', async () => {
            const { provider } = mockContext(getMockAuthData());
            const mockResponse = {
                data: 'success',
                response: new Response(null, { status: 200 }),
            };

            mockAuth.passwordless.authorize.mockResolvedValue(mockResponse);

            await authorizePasswordless(provider, {
                userid: 'test@example.com',
                firstName: 'John',
                lastName: 'Doe',
            });

            expect(mockAuth.passwordless.authorize).toHaveBeenCalledWith(
                expect.not.objectContaining({
                    registerCustomer: expect.anything(),
                    firstName: expect.anything(),
                    lastName: expect.anything(),
                    email: expect.anything(),
                })
            );
        });
    });

    describe('getPasswordLessAccessToken', () => {
        it('should get passwordless access token successfully', async () => {
            const authData = getMockAuthData();
            // Remove trackingConsent so dnt is not included by default
            delete authData.trackingConsent;
            const { provider } = mockContext(authData);
            const mockTokenResponse = getMockTokenResponse();
            const token = 'passwordless-token-123';

            mockAuth.passwordless.exchangeToken.mockResolvedValue(
                getMockAuthResponse(mockTokenResponse, 'pwdless-dwsid')
            );

            const result = await getPasswordLessAccessToken(provider, token);

            expect(mockAuth.passwordless.exchangeToken).toHaveBeenCalledWith({
                pwdlessLoginToken: token,
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: 'pwdless-dwsid' });
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: getPasswordLessAccessToken starting', {
                hasUsid: true,
            });
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: getPasswordLessAccessToken succeeded');
        });

        it('should include DNT value when feature is enabled and DNT exists in auth context', async () => {
            const authData = getMockAuthData();
            authData.trackingConsent = TrackingConsent.Declined; // DNT enabled (TrackingConsent enum)
            const { provider, appConfig } = mockContext(authData);
            // Enable tracking consent feature
            appConfig.engagement = {
                ...appConfig.engagement,
                analytics: {
                    ...appConfig.engagement.analytics,
                    trackingConsent: {
                        enabled: true,
                        defaultTrackingConsent: TrackingConsent.Accepted,
                    },
                },
            };

            const mockTokenResponse = getMockTokenResponse();
            const token = 'passwordless-token-123';

            mockAuth.passwordless.exchangeToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await getPasswordLessAccessToken(provider, token);

            expect(mockAuth.passwordless.exchangeToken).toHaveBeenCalledWith({
                pwdlessLoginToken: token,
                dnt: true, // TrackingConsent.Declined converts to true
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it('should not include DNT when feature is disabled', async () => {
            const authData = getMockAuthData();
            authData.trackingConsent = TrackingConsent.Declined;
            const { provider, appConfig } = mockContext(authData);
            // Ensure tracking consent is disabled
            appConfig.engagement = {
                ...appConfig.engagement,
                analytics: {
                    ...appConfig.engagement.analytics,
                    trackingConsent: undefined,
                },
            };

            const mockTokenResponse = getMockTokenResponse();
            const token = 'passwordless-token-123';

            mockAuth.passwordless.exchangeToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await getPasswordLessAccessToken(provider, token);

            expect(mockAuth.passwordless.exchangeToken).toHaveBeenCalledWith({
                pwdlessLoginToken: token,
                // No dnt parameter when feature is disabled
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it('should not include DNT when it does not exist in auth context', async () => {
            const authData = getMockAuthData();
            delete authData.trackingConsent; // No tracking consent value
            const { provider, appConfig } = mockContext(authData);
            // Enable tracking consent feature
            appConfig.engagement = {
                ...appConfig.engagement,
                analytics: {
                    ...appConfig.engagement.analytics,
                    trackingConsent: {
                        enabled: true,
                        defaultTrackingConsent: TrackingConsent.Accepted,
                    },
                },
            };

            const mockTokenResponse = getMockTokenResponse();
            const token = 'passwordless-token-123';

            mockAuth.passwordless.exchangeToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await getPasswordLessAccessToken(provider, token);

            expect(mockAuth.passwordless.exchangeToken).toHaveBeenCalledWith({
                pwdlessLoginToken: token,
                // No dnt parameter when trackingConsent is not set
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it('should use DNT value false when trackingConsent is Accepted', async () => {
            const authData = getMockAuthData();
            authData.trackingConsent = TrackingConsent.Accepted; // DNT disabled (tracking accepted)
            const { provider, appConfig } = mockContext(authData);
            // Enable tracking consent feature
            appConfig.engagement = {
                ...appConfig.engagement,
                analytics: {
                    ...appConfig.engagement.analytics,
                    trackingConsent: {
                        enabled: true,
                        defaultTrackingConsent: TrackingConsent.Accepted,
                    },
                },
            };

            const mockTokenResponse = getMockTokenResponse();
            const token = 'passwordless-token-123';

            mockAuth.passwordless.exchangeToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const result = await getPasswordLessAccessToken(provider, token);

            expect(mockAuth.passwordless.exchangeToken).toHaveBeenCalledWith({
                pwdlessLoginToken: token,
                dnt: false, // TrackingConsent.Accepted converts to false
            });
            expect(result).toEqual({ ...mockTokenResponse, dwsid: undefined });
        });

        it('should handle invalid passwordless token', async () => {
            const { provider } = mockContext(getMockAuthData());
            const token = 'invalid-token';
            const mockError = new Error('Invalid token');

            mockAuth.passwordless.exchangeToken.mockRejectedValue(mockError);

            await expect(getPasswordLessAccessToken(provider, token)).rejects.toThrow('Invalid token');
            expect(mockLogger.error).toHaveBeenCalledWith('Auth: getPasswordLessAccessToken failed', {
                error: mockError,
            });
        });
    });

    describe('getPasswordResetToken', () => {
        it('should request password reset token successfully with public SLAS', async () => {
            const { provider } = mockContext({}, false);
            const email = 'test@example.com';

            mockAuth.password.requestReset.mockResolvedValue(undefined);

            await getPasswordResetToken(provider, { email });

            expect(mockAuth.password.requestReset).toHaveBeenCalledWith({
                userId: email,
                callbackUri: 'https://example.com/reset-password-callback',
                mode: 'email',
                locale: mockAltSiteObject.defaultLocale,
            });

            // Verify performance timer was called
            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authGetPasswordResetToken', 'start');
            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authGetPasswordResetToken', 'end');
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: getPasswordResetToken starting', { mode: 'email' });
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: getPasswordResetToken succeeded');
        });

        it('should request password reset token with private SLAS and include authorization header', async () => {
            const { provider } = mockContext({}, true);
            const email = 'test@example.com';

            mockAuth.password.requestReset.mockResolvedValue(undefined);

            await getPasswordResetToken(provider, { email });

            // Note: Authorization header is now handled internally by createApiClients
            expect(mockAuth.password.requestReset).toHaveBeenCalledWith({
                userId: email,
                callbackUri: 'https://example.com/reset-password-callback',
                mode: 'email',
                locale: mockAltSiteObject.defaultLocale,
            });
        });

        it('should request password reset token with callback mode', async () => {
            const { provider, appConfig } = mockContext({}, false);
            appConfig.features.resetPassword.mode = 'callback';
            const email = 'test@example.com';

            mockAuth.password.requestReset.mockResolvedValue(undefined);

            await getPasswordResetToken(provider, { email });

            expect(mockAuth.password.requestReset).toHaveBeenCalledWith({
                userId: email,
                callbackUri: 'https://example.com/reset-password-callback',
                mode: 'callback',
                locale: mockAltSiteObject.defaultLocale,
            });
        });

        it('should handle absolute callback URI', async () => {
            const { provider, appConfig } = mockContext({}, false);
            appConfig.features.resetPassword.callbackUri = 'https://custom-domain.com/reset';
            const email = 'test@example.com';

            mockAuth.password.requestReset.mockResolvedValue(undefined);

            await getPasswordResetToken(provider, { email });

            expect(mockAuth.password.requestReset).toHaveBeenCalledWith({
                userId: email,
                callbackUri: 'https://custom-domain.com/reset',
                mode: 'email',
                locale: mockAltSiteObject.defaultLocale,
            });
        });

        it('should handle undefined callback URI', async () => {
            const { provider, appConfig } = mockContext({}, false);
            delete appConfig.features.resetPassword.callbackUri;
            const email = 'test@example.com';

            mockAuth.password.requestReset.mockResolvedValue(undefined);

            await getPasswordResetToken(provider, { email });
            // When callbackUri is undefined, it should be passed as undefined to requestReset
            expect(mockAuth.password.requestReset).toHaveBeenCalledWith({
                userId: email,
                callbackUri: undefined,
                mode: 'email',
                locale: mockAltSiteObject.defaultLocale,
            });
        });

        it('should handle relative callback URI and prepend app origin', async () => {
            const { provider, appConfig } = mockContext({}, false);
            appConfig.features.resetPassword.callbackUri = '/reset-password';
            const email = 'test@example.com';

            mockAuth.password.requestReset.mockResolvedValue(undefined);

            await getPasswordResetToken(provider, { email });

            expect(mockAuth.password.requestReset).toHaveBeenCalledWith({
                userId: email,
                callbackUri: 'https://example.com/reset-password',
                mode: 'email',
                locale: mockAltSiteObject.defaultLocale,
            });
        });

        it('should handle password reset token request failure', async () => {
            const { provider } = mockContext({}, false);
            const email = 'test@example.com';
            const mockError = new Error('Failed to send reset email');

            mockAuth.password.requestReset.mockRejectedValue(mockError);

            await expect(getPasswordResetToken(provider, { email })).rejects.toThrow('Failed to send reset email');
            expect(mockLogger.error).toHaveBeenCalledWith('Auth: getPasswordResetToken failed', {
                error: mockError,
            });
        });

        it('should call performance timer even on failure', async () => {
            const { provider } = mockContext({}, false);
            const email = 'test@example.com';
            const mockError = new Error('Failed to send reset email');

            mockAuth.password.requestReset.mockRejectedValue(mockError);

            await expect(getPasswordResetToken(provider, { email })).rejects.toThrow();

            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authGetPasswordResetToken', 'start');
            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authGetPasswordResetToken', 'end');
        });
    });

    describe('requestOtp', () => {
        it('should request OTP successfully with default config', async () => {
            const { provider } = mockContext({}, false);
            const email = 'test@example.com';

            mockAuth.otp.request.mockResolvedValue(undefined);

            await requestOtp(provider, { email });

            expect(mockAuth.otp.request).toHaveBeenCalledWith({
                userId: email,
                email,
                mode: 'email',
                locale: mockAltSiteObject.defaultLocale,
            });

            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authRequestOtp', 'start');
            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authRequestOtp', 'end');
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: requestOtp starting', { mode: 'email' });
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: requestOtp succeeded');
        });

        it('should use mode from config', async () => {
            const { provider, appConfig } = mockContext({}, false);
            appConfig.features.otpRequest.mode = 'callback';

            mockAuth.otp.request.mockResolvedValue(undefined);

            await requestOtp(provider, { email: 'test@example.com' });

            expect(mockAuth.otp.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    mode: 'callback',
                })
            );
        });

        it('should pass callbackUri to SLAS', async () => {
            const { provider, appConfig } = mockContext({}, false);
            appConfig.features.otpRequest.callbackUri = 'https://custom-domain.com/otp-callback';

            mockAuth.otp.request.mockResolvedValue(undefined);

            await requestOtp(provider, { email: 'test@example.com' });

            expect(mockAuth.otp.request).toHaveBeenCalledWith(
                expect.objectContaining({ callbackUri: 'https://custom-domain.com/otp-callback' })
            );
        });

        it('should omit callbackUri when not configured', async () => {
            const { provider, appConfig } = mockContext({}, false);
            delete appConfig.features.otpRequest.callbackUri;

            mockAuth.otp.request.mockResolvedValue(undefined);

            await requestOtp(provider, { email: 'test@example.com' });

            expect(mockAuth.otp.request).toHaveBeenCalledWith(
                expect.not.objectContaining({ callbackUri: expect.anything() })
            );
        });

        it('should omit locale when not configured', async () => {
            const { getLocale } = await import('@salesforce/storefront-next-runtime/i18n');
            vi.mocked(getLocale).mockReturnValueOnce('');

            const { provider } = mockContext({}, false);

            mockAuth.otp.request.mockResolvedValue(undefined);

            await requestOtp(provider, { email: 'test@example.com' });

            expect(mockAuth.otp.request).toHaveBeenCalledWith(
                expect.not.objectContaining({ locale: expect.anything() })
            );
        });

        it('should handle OTP request failure and still call performance timer', async () => {
            const { provider } = mockContext({}, false);
            const mockError = new Error('OTP service unavailable');

            mockAuth.otp.request.mockRejectedValue(mockError);

            await expect(requestOtp(provider, { email: 'test@example.com' })).rejects.toThrow(
                'OTP service unavailable'
            );
            expect(mockLogger.error).toHaveBeenCalledWith('Auth: requestOtp failed', {
                error: mockError,
            });
            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authRequestOtp', 'start');
            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authRequestOtp', 'end');
        });
    });

    describe('verifyOtp', () => {
        it('should verify OTP successfully', async () => {
            const { provider } = mockContext({}, false);

            mockAuth.otp.verify.mockResolvedValue(undefined);

            await verifyOtp(provider, { pwdActionToken: '12345678', email: 'test@example.com' });

            expect(mockAuth.otp.verify).toHaveBeenCalledWith({
                pwdActionToken: '12345678',
                userId: 'test@example.com',
            });

            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authVerifyOtp', 'start');
            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authVerifyOtp', 'end');
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: verifyOtp starting');
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: verifyOtp succeeded');
        });

        it('should handle OTP verification failure and still call performance timer', async () => {
            const { provider } = mockContext({}, false);
            const mockError = new Error('Invalid OTP');

            mockAuth.otp.verify.mockRejectedValue(mockError);

            await expect(
                verifyOtp(provider, { pwdActionToken: '00000000', email: 'test@example.com' })
            ).rejects.toThrow('Invalid OTP');
            expect(mockLogger.error).toHaveBeenCalledWith('Auth: verifyOtp failed', {
                error: mockError,
            });
            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authVerifyOtp', 'start');
            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authVerifyOtp', 'end');
        });
    });

    describe('resetPasswordWithToken', () => {
        it('should reset password successfully with public SLAS', async () => {
            const { provider } = mockContext({}, false);
            const email = 'test@example.com';
            const token = 'reset-token-123';
            const newPassword = 'NewSecurePassword123!';

            mockAuth.password.reset.mockResolvedValue(undefined);

            await resetPasswordWithToken(provider, { email, token, newPassword });

            expect(mockAuth.password.reset).toHaveBeenCalledWith({
                userId: email,
                token,
                newPassword,
            });

            // Verify performance timer was called
            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authResetPasswordWithToken', 'start');
            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authResetPasswordWithToken', 'end');
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: resetPasswordWithToken starting');
            expect(mockLogger.debug).toHaveBeenCalledWith('Auth: resetPasswordWithToken succeeded');
        });

        it('should reset password with private SLAS and include authorization header', async () => {
            const { provider } = mockContext({}, true);
            const email = 'test@example.com';
            const token = 'reset-token-123';
            const newPassword = 'NewSecurePassword123!';

            mockAuth.password.reset.mockResolvedValue(undefined);

            await resetPasswordWithToken(provider, { email, token, newPassword });

            // Note: Authorization header is now handled internally by createApiClients
            expect(mockAuth.password.reset).toHaveBeenCalledWith({
                userId: email,
                token,
                newPassword,
            });
        });

        it('should encode client credentials correctly for private SLAS', async () => {
            const { provider } = mockContext({}, true);
            const email = 'test@example.com';
            const token = 'reset-token-123';
            const newPassword = 'NewSecurePassword123!';

            mockAuth.password.reset.mockResolvedValue(undefined);

            await resetPasswordWithToken(provider, { email, token, newPassword });

            // Note: Client credential encoding is now handled internally by createApiClients
            expect(mockAuth.password.reset).toHaveBeenCalledWith({
                userId: email,
                token,
                newPassword,
            });
        });

        it('should handle password reset failure with invalid token', async () => {
            const { provider } = mockContext({}, false);
            const email = 'test@example.com';
            const token = 'invalid-token';
            const newPassword = 'NewSecurePassword123!';
            const mockError = new Error('Invalid or expired token');

            mockAuth.password.reset.mockRejectedValue(mockError);

            await expect(resetPasswordWithToken(provider, { email, token, newPassword })).rejects.toThrow(
                'Invalid or expired token'
            );
            expect(mockLogger.error).toHaveBeenCalledWith('Auth: resetPasswordWithToken failed', {
                error: mockError,
            });
        });

        it('should handle password reset failure due to weak password', async () => {
            const { provider } = mockContext({}, false);
            const email = 'test@example.com';
            const token = 'reset-token-123';
            const newPassword = 'weak';
            const mockError = new Error('Password does not meet requirements');

            mockAuth.password.reset.mockRejectedValue(mockError);

            await expect(resetPasswordWithToken(provider, { email, token, newPassword })).rejects.toThrow(
                'Password does not meet requirements'
            );
        });

        it('should call performance timer even on failure', async () => {
            const { provider } = mockContext({}, false);
            const email = 'test@example.com';
            const token = 'reset-token-123';
            const newPassword = 'NewSecurePassword123!';
            const mockError = new Error('Reset failed');

            mockAuth.password.reset.mockRejectedValue(mockError);

            await expect(resetPasswordWithToken(provider, { email, token, newPassword })).rejects.toThrow();

            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authResetPasswordWithToken', 'start');
            expect(mockPerformanceTimer.mark).toHaveBeenCalledWith('authResetPasswordWithToken', 'end');
        });

        it('should handle all parameters correctly', async () => {
            const { provider } = mockContext({}, false);
            const email = 'user+test@example.com'; // Email with special chars
            const token = 'token-with-special-chars_123==';
            const newPassword = 'P@ssw0rd!2024#Complex';

            mockAuth.password.reset.mockResolvedValue(undefined);

            await resetPasswordWithToken(provider, { email, token, newPassword });

            expect(mockAuth.password.reset).toHaveBeenCalledWith({
                userId: email,
                token,
                newPassword,
            });
        });
    });

    describe('authMiddleware', () => {
        let mockParseAllCookies: any;
        let mockCreateCookie: any;
        let mockGetCookieConfig: any;
        let mockgetCookieNameWithSiteId: any;

        beforeEach(async () => {
            // Get mocked modules
            const cookieUtils = await import('@/lib/cookie-utils.server');

            mockParseAllCookies = cookieUtils.parseAllCookies;
            mockCreateCookie = cookieUtils.createCookie;
            mockGetCookieConfig = cookieUtils.getCookieConfig;
            mockgetCookieNameWithSiteId = cookieUtils.getCookieNameWithSiteId;

            // Default mock implementations
            mockParseAllCookies.mockReturnValue({});
            mockgetCookieNameWithSiteId.mockImplementation((name: string) => name);
            mockGetCookieConfig.mockImplementation((overrides = {}) => ({
                httpOnly: false,
                secure: true,
                sameSite: 'lax' as const,
                path: '/',
                ...overrides,
            }));

            // Mock createCookie to return a cookie object with serialize method
            mockCreateCookie.mockImplementation(() => ({
                serialize: vi.fn().mockResolvedValue('Set-Cookie: mock=value'),
            }));
        });

        it('should parse cookies and reconstruct auth data from separate cookies', async () => {
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            // Create valid JWT with expiry
            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800; // 30 min from now
            const mockAccessToken = buildMockAccessToken({ exp });

            // Mock parseAllCookies to return split cookies
            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
                'cc-at': mockAccessToken,
            });

            const request = new Request('https://example.com/test', {
                headers: {
                    Cookie: 'cc-nx-g=guest-refresh-token; cc-at=access-token',
                },
            });

            const context = new RouterContextProvider();
            const appConfig = { ...mockConfig };
            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return appConfig;
                return undefined;
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // Verify parseAllCookies was called
            expect(mockParseAllCookies).toHaveBeenCalledWith('cc-nx-g=guest-refresh-token; cc-at=access-token');

            // Verify next was called
            expect(next).toHaveBeenCalled();
        });

        it('should derive userType=guest from a guest-shaped JWT (gcid only)', async () => {
            // JWT-shaped guest token returned by guest login → userType derived from claims.
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            // Cold start: only the guest refresh-cookie present; ingest will fall back to
            // guest login, and updateAuthStorageDataByTokenResponse will set userType from the
            // (guest-shaped) JWT.
            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
            });

            const request = new Request('https://example.com/test', {
                headers: {
                    Cookie: 'cc-nx-g=guest-refresh-token',
                },
            });

            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                // Return storage when asked for authStorageContext
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    // Copy entries from the middleware's storage to our test storage
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            expect(storage.get('userType')).toBe('guest');
        });

        it('should derive userType=registered from a registered-shaped JWT (gcid+rcid)', async () => {
            // The access-token JWT is the source of truth — having the cc-nx cookie alone is
            // not sufficient. Build a registered-shaped JWT and verify userType derives from it.
            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800;
            const mockAccessToken = buildMockAccessToken({ exp, rcid: 'reg-cust-1' });

            mockParseAllCookies.mockReturnValue({
                'cc-nx': 'registered-refresh-token',
                'cc-at': mockAccessToken,
            });

            const request = new Request('https://example.com/test', {
                headers: {
                    Cookie: 'cc-nx=registered-refresh-token; cc-at=access-token',
                },
            });

            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            expect(storage.get('userType')).toBe('registered');
            expect(storage.get('customerId')).toBe('reg-cust-1');
        });

        it('should extract access token expiry from JWT during middleware initialization', async () => {
            // Create JWT with specific expiry
            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800; // 30 min from now
            const mockAccessToken = buildMockAccessToken({ exp });

            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
                'cc-at': mockAccessToken,
            });

            const request = new Request('https://example.com/test', {
                headers: {
                    Cookie: `cc-nx-g=guest-refresh-token; cc-at=${mockAccessToken}`,
                },
            });

            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // Verify accessTokenExpiry was set from JWT
            const expiry = storage.get('accessTokenExpiry');
            expect(expiry).toBeDefined();
            expect(typeof expiry).toBe('number');
            expect(expiry).toBe(exp * 1000); // Should be in milliseconds
        });

        it('should destroy all 14 cookies when isDestroyed is set', async () => {
            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
            });

            // Mock guest login for when middleware falls back to guest auth
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/test');

            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();
            storage.set('isDestroyed', true);

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            // Bidirectional sync: copy authStorage entries to test storage AND copy test
            // storage entries (e.g. preset `isDestroyed`) back into authStorage so the
            // middleware's destroy-block check (`authStorage.has('isDestroyed')`) sees it.
            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                    storage.forEach((v, k) => value.set(k, v));
                }
            });

            const mockSerialize = vi.fn().mockResolvedValue('Set-Cookie: mock=deleted');
            mockCreateCookie.mockReturnValue({
                serialize: mockSerialize,
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // Verify all 14 cookies were deleted:
            // cc-nx-g, cc-nx, cc-at, usid, customerId (legacy cleanup), encUserId, cc-idp-at,
            // id_token, idp_refresh_token, dwsid, cc-cv, tc, storefront-next-context_*, dwsourcecode_*
            expect(mockSerialize).toHaveBeenCalledTimes(14);
            expect(mockSerialize).toHaveBeenCalledWith(
                '',
                expect.objectContaining({
                    expires: expect.any(Date),
                    maxAge: undefined,
                })
            );
        });

        it('should set separate cookies when auth tokens are refreshed including IDP tokens', async () => {
            // Create expired JWT to trigger refresh flow
            const now = Math.floor(Date.now() / 1000);
            const exp = now - 100; // Expired token
            const expiredAccessToken = buildMockAccessToken({ exp });

            // Mock cookies with expired access token but valid refresh token
            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'old-refresh-token',
                'cc-at': expiredAccessToken,
            });

            const request = new Request('https://example.com/test');

            const context = new RouterContextProvider();
            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return new Map();
            });

            const mockSerialize = vi.fn().mockResolvedValue('Set-Cookie: mock=value');
            mockCreateCookie.mockReturnValue({
                serialize: mockSerialize,
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            // Mock token response to control what gets written after refresh
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.refreshToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse, 'refresh-dwsid'));

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            expect(mockSerialize).toHaveBeenCalled();
            expect(mockSerialize.mock.calls.length).toBeGreaterThanOrEqual(4);

            expect(mockSerialize).toHaveBeenCalledWith(mockTokenResponse.access_token, expect.any(Object));
            expect(mockSerialize).toHaveBeenCalledWith('idp-access-token-123', expect.any(Object));
            expect(mockSerialize).toHaveBeenCalledWith('id-token-123', expect.any(Object));
            expect(mockSerialize).toHaveBeenCalledWith('idp-refresh-token-789', expect.any(Object));
            expect(mockSerialize).toHaveBeenCalledWith('refresh-dwsid', expect.any(Object));
        });

        it('should delete other refresh token cookie when switching user types', async () => {
            mockParseAllCookies.mockReturnValue({});

            // Mock guest login for when middleware falls back to guest auth
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/test');

            const now = Date.now();
            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();
            storage.set('isUpdated', true);
            storage.set('userType', 'registered'); // Switching from guest to registered
            storage.set('refreshToken', 'registered-refresh-token');
            storage.set('refreshTokenExpiry', now + 3600000);
            storage.set('accessToken', 'access-token');
            storage.set('accessTokenExpiry', now + 1800000);

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            const mockSerialize = vi.fn().mockResolvedValue('Set-Cookie: mock=value');
            mockCreateCookie.mockReturnValue({
                serialize: mockSerialize,
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // Verify the "other" refresh token cookie (guest in this case) was deleted
            // One call should be to delete the guest cookie with empty string
            const deleteCallsWithEmptyString = mockSerialize.mock.calls.filter(
                (call) => call[0] === '' && call[1]?.expires instanceof Date
            );
            expect(deleteCallsWithEmptyString.length).toBeGreaterThan(0);
        });

        it('should handle error in storage and destroy cookies', async () => {
            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
            });

            // Mock guest login for when middleware falls back to guest auth
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/test');

            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();
            storage.set('error', 'Authentication error');

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            // Bidirectional sync so the preset `error` key is visible to the middleware's
            // local authStorage (which the destroy-block check reads).
            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                    storage.forEach((v, k) => value.set(k, v));
                }
            });

            const mockSerialize = vi.fn().mockResolvedValue('Set-Cookie: mock=deleted');
            mockCreateCookie.mockReturnValue({
                serialize: mockSerialize,
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // Verify all 14 cookies were deleted due to error
            // cc-nx-g, cc-nx, cc-at, usid, customerId (legacy cleanup), encUserId, cc-idp-at,
            // id_token, idp_refresh_token, dwsid, cc-cv, tc, storefront-next-context_*, dwsourcecode_*
            expect(mockSerialize).toHaveBeenCalledTimes(14);
        });

        it('should use getCookieNameWithSiteId to get cookie names', async () => {
            mockParseAllCookies.mockReturnValue({});
            mockgetCookieNameWithSiteId.mockImplementation((name: string) => `namespace_${name}`);

            // Mock guest login for when middleware falls back to guest auth
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/test', {
                headers: {
                    Cookie: 'namespace_cc-nx-g=guest-token',
                },
            });

            const context = new RouterContextProvider();
            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return new Map();
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // Verify getCookieNameWithSiteId was called for each cookie that the middleware
            // reads from the request. `customerId` is intentionally absent: the middleware
            // no longer reads it; its namespacing only happens inside the (mocked here)
            // createCookie call for the destroy-path deletion-only instance.
            expect(mockgetCookieNameWithSiteId).toHaveBeenCalledWith('cc-nx-g', context);
            expect(mockgetCookieNameWithSiteId).toHaveBeenCalledWith('cc-nx', context);
            expect(mockgetCookieNameWithSiteId).toHaveBeenCalledWith('cc-at', context);
            expect(mockgetCookieNameWithSiteId).toHaveBeenCalledWith('usid', context);
            expect(mockgetCookieNameWithSiteId).toHaveBeenCalledWith('enc_user_id', context);
            expect(mockgetCookieNameWithSiteId).toHaveBeenCalledWith('idp_access_token', context);
            expect(mockgetCookieNameWithSiteId).toHaveBeenCalledWith('id_token', context);
            expect(mockgetCookieNameWithSiteId).toHaveBeenCalledWith('idp_refresh_token', context);
            expect(mockgetCookieNameWithSiteId).toHaveBeenCalledWith('cc-cv', context);
        });

        it('should handle missing cookies gracefully', async () => {
            // No cookies present
            mockParseAllCookies.mockReturnValue({});

            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/test');

            const context = new RouterContextProvider();
            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return new Map();
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // Should fall back to guest login when no cookies present
            expect(mockAuth.loginAsGuest).toHaveBeenCalled();
            expect(next).toHaveBeenCalled();
        });

        it('should pick the registered refresh-cookie on cold start when both refresh-cookies exist', async () => {
            // Cold start (no access token, can't decode JWT) → cookie-name fallback. The
            // registered cookie wins, refresh runs against it, and the refreshed JWT (registered
            // shape) sets the final userType.
            mockParseAllCookies.mockReturnValue({
                'cc-nx': 'registered-refresh-token',
                'cc-nx-g': 'guest-refresh-token',
            });

            const mockTokenResponse = buildMockTokenResponse({ accessToken: { rcid: 'reg-cust-1' } });
            mockAuth.refreshToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/test', {
                headers: {
                    Cookie: 'cc-nx=registered-refresh-token; cc-nx-g=guest-refresh-token',
                },
            });

            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // Refresh ran against the registered refresh-cookie; final JWT is registered-shaped
            expect(mockAuth.refreshToken).toHaveBeenCalledWith(
                expect.objectContaining({ refreshToken: 'registered-refresh-token' })
            );
            expect(storage.get('userType')).toBe('registered');
        });

        it('should read and reconstruct IDP access token from cookies', async () => {
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            // Create valid JWT with expiry
            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800;
            const mockAccessToken = buildMockAccessToken({ exp });

            // Mock cookies including IDP access token
            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
                'cc-at': mockAccessToken,
                idp_access_token: 'idp-access-token',
            });

            const request = new Request('https://example.com/test', {
                headers: {
                    Cookie: 'cc-nx-g=guest-refresh-token; cc-at=access-token; idp_access_token=idp-access-token',
                },
            });

            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // Verify IDP access token was reconstructed from cookies
            expect(storage.get('idpAccessToken')).toBe('idp-access-token');
        });

        it('should read and reconstruct id_token from cookies', async () => {
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800;
            const mockAccessToken = buildMockAccessToken({ exp });

            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
                'cc-at': mockAccessToken,
                id_token: 'id-token-from-cookie',
            });

            const request = new Request('https://example.com/test', {
                headers: {
                    Cookie: 'cc-nx-g=guest-refresh-token; cc-at=access-token; id_token=id-token-from-cookie',
                },
            });

            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            expect(storage.get('idToken')).toBe('id-token-from-cookie');
        });

        it('should read and reconstruct idp_refresh_token from cookies', async () => {
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800;
            const mockAccessToken = buildMockAccessToken({ exp });

            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
                'cc-at': mockAccessToken,
                idp_refresh_token: 'idp-refresh-token-from-cookie',
            });

            const request = new Request('https://example.com/test', {
                headers: {
                    Cookie: 'cc-nx-g=guest-refresh-token; cc-at=access-token; idp_refresh_token=idp-refresh-token-from-cookie',
                },
            });

            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            expect(storage.get('idpRefreshToken')).toBe('idp-refresh-token-from-cookie');
        });

        it('should read and reconstruct code verifier from cookie', async () => {
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            // Create valid JWT with expiry
            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800;
            const mockAccessToken = buildMockAccessToken({ exp });

            // Mock cookies including code verifier
            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
                'cc-at': mockAccessToken,
                'cc-cv': 'code-verifier-abc123',
            });

            const request = new Request('https://example.com/test', {
                headers: {
                    Cookie: 'cc-nx-g=guest-refresh-token; cc-at=access-token; cc-cv=code-verifier-abc123',
                },
            });

            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // Verify code verifier was reconstructed from cookie
            expect(storage.get('codeVerifier')).toBe('code-verifier-abc123');
        });

        it('should delete code verifier cookie when not present in storage', async () => {
            mockParseAllCookies.mockReturnValue({});

            // Mock guest login for when middleware falls back to guest auth
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/test');

            const now = Date.now();
            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();
            storage.set('isUpdated', true);
            storage.set('userType', 'guest');
            storage.set('refreshToken', 'refresh-token');
            storage.set('refreshTokenExpiry', now + 3600000);
            storage.set('accessToken', 'access-token');
            storage.set('accessTokenExpiry', now + 1800000);
            // Note: codeVerifier is NOT in storage (e.g., after successful social login)

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            const mockSerialize = vi.fn().mockResolvedValue('Set-Cookie: mock=deleted');
            mockCreateCookie.mockReturnValue({
                serialize: mockSerialize,
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // Verify code verifier cookie was deleted (empty string with expired date)
            const deleteCodeVerifierCalls = mockSerialize.mock.calls.filter(
                (call) => call[0] === '' && call[1]?.httpOnly === true && call[1]?.expires instanceof Date
            );
            expect(deleteCodeVerifierCalls.length).toBeGreaterThan(0);
        });

        it('should recover and redirect when AuthTokenInvalidError is thrown', async () => {
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.refreshToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            // Create valid JWT with expiry
            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800;
            const mockAccessToken = buildMockAccessToken({ exp });

            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
                'cc-at': mockAccessToken,
            });

            const request = new Request('https://example.com/test', {
                headers: {
                    Cookie: `cc-nx-g=guest-refresh-token; cc-at=${mockAccessToken}`,
                },
            });

            const context = new RouterContextProvider();
            const appConfig = { ...mockConfig };
            const originalGet = context.get.bind(context);
            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return appConfig;
                return originalGet(key);
            });

            const serializeCalls: Array<[string, unknown]> = [];
            mockCreateCookie.mockImplementation(() => ({
                serialize: vi.fn().mockImplementation((value, options) => {
                    serializeCalls.push([value, options]);
                    return Promise.resolve('Set-Cookie: mock=value');
                }),
            }));

            const next = vi.fn().mockRejectedValue(createAuthTokenInvalidError());

            const response = (await authMiddleware(
                { request, context, params: {}, pattern: '/', url: new URL(request.url) },
                next
            )) as Response;

            expect(response.status).toBe(307);
            expect(response.headers.get('Location')).toBe('https://example.com/test');
            expect(response.headers.get('x-sfnext-auth-recovery')).toBe('1');
            expect(mockAuth.refreshToken).toHaveBeenCalled();
            expect(serializeCalls.some(([value]) => value === '1')).toBe(true);
        });

        it('should clear stale error before recovery refresh', async () => {
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.refreshToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            // Create valid JWT with expiry
            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800;
            const mockAccessToken = buildMockAccessToken({ exp });

            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
                'cc-at': mockAccessToken,
            });

            const request = new Request('https://example.com/test', {
                headers: {
                    Cookie: `cc-nx-g=guest-refresh-token; cc-at=${mockAccessToken}`,
                },
            });

            const context = new RouterContextProvider();
            const originalGet = context.get.bind(context);
            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return originalGet(key);
            });

            let authStorageRef: Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]> | undefined;
            const originalSet = context.set.bind(context);
            vi.spyOn(context, 'set').mockImplementation((key, value) => {
                if (key === authStorageContext && value instanceof Map) {
                    authStorageRef = value;
                }
                return originalSet(key, value);
            });

            const next = vi.fn().mockImplementation(() => {
                authStorageRef?.set('error', 'stale-error');
                throw createAuthTokenInvalidError();
            });

            const response = (await authMiddleware(
                { request, context, params: {}, pattern: '/', url: new URL(request.url) },
                next
            )) as Response;

            expect(response.status).toBe(307);
            expect(mockAuth.refreshToken).toHaveBeenCalledTimes(1);
        });

        it('should not redirect again when recovery guard is present', async () => {
            mockParseAllCookies.mockReturnValue({
                'cc-auth-recover': '1',
            });

            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(getMockTokenResponse()));

            const request = new Request('https://example.com/test', {
                headers: {
                    Cookie: 'cc-auth-recover=1',
                },
            });

            const context = new RouterContextProvider();
            const originalGet = context.get.bind(context);
            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return originalGet(key);
            });

            const next = vi.fn().mockRejectedValue(createAuthTokenInvalidError());

            await expect(
                authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next)
            ).rejects.toThrow('Access token is invalid or revoked');
        });

        it('should recover when authStorage error sentinel is set after next()', async () => {
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.refreshToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/test');
            const context = new RouterContextProvider();
            let authStorageRef: Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]> | undefined;

            const originalGet = context.get.bind(context);
            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return originalGet(key);
            });

            const originalSet = context.set.bind(context);
            vi.spyOn(context, 'set').mockImplementation((key, value) => {
                if (key === authStorageContext && value instanceof Map) {
                    authStorageRef = value;
                }
                return originalSet(key, value);
            });

            const next = vi.fn().mockImplementation(() => {
                authStorageRef?.set('error', AUTH_TOKEN_INVALID_ERROR);
                return new Response('OK');
            });

            const response = (await authMiddleware(
                { request, context, params: {}, pattern: '/', url: new URL(request.url) },
                next
            )) as Response;

            expect(response.status).toBe(307);
            expect(mockAuth.loginAsGuest).toHaveBeenCalled();
        });

        it('should clear the guard cookie and set recovery guard header after redirect', async () => {
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));
            mockParseAllCookies.mockReturnValue({
                'cc-auth-recover': '1',
            });

            const request = new Request('https://example.com/test', {
                headers: {
                    Cookie: 'cc-auth-recover=1',
                },
            });

            const context = new RouterContextProvider();
            const originalGet = context.get.bind(context);
            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return originalGet(key);
            });

            const mockSerialize = vi.fn().mockResolvedValue('Set-Cookie: mock=value');
            mockCreateCookie.mockReturnValue({
                serialize: mockSerialize,
            });

            const next = vi.fn().mockResolvedValue(new Response('OK'));

            const response = (await authMiddleware(
                { request, context, params: {}, pattern: '/', url: new URL(request.url) },
                next
            )) as Response;

            expect(response.headers.get('x-sfnext-auth-recovery-guard')).toBe('1');
            const deleteCalls = mockSerialize.mock.calls.filter(
                (call) => call[0] === '' && call[1]?.expires instanceof Date
            );
            expect(deleteCalls.length).toBeGreaterThan(0);
        });

        it.each([
            {
                userType: 'guest' as const,
                refreshTokenCookie: 'cc-nx-g',
                isb: `uido:slas::upn:Guest::uidn:Guest User::gcid:token-guest-id::chid:${mockSiteObject.id}`,
                sub: 'cc-slas::zzrf_001::scid:scid-123::usid:token-usid-guest',
                expectedCustomerId: 'token-guest-id',
                expectedUsid: 'token-usid-guest',
            },
            {
                userType: 'registered' as const,
                refreshTokenCookie: 'cc-nx',
                isb: `uido:ecom::upn:user@example.com::uidn:Test User::gcid:guest-id::rcid:registered-id::chid:${mockSiteObject.id}`,
                sub: 'cc-slas::zzrf_001::scid:scid-456::usid:token-usid-registered',
                expectedCustomerId: 'registered-id',
                expectedUsid: 'token-usid-registered',
            },
        ])(
            'should derive customerId and usid from JWT claims for $userType user without any usid/customerId cookies',
            async ({ refreshTokenCookie, isb, sub, expectedCustomerId, expectedUsid }) => {
                const now = Math.floor(Date.now() / 1000);
                const exp = now + 1800;
                const mockAccessToken = `header.${btoa(JSON.stringify({ exp, isb, sub }))}.signature`;

                mockParseAllCookies.mockReturnValue({
                    [refreshTokenCookie]: 'refresh-token',
                    'cc-at': mockAccessToken,
                });

                const request = new Request('https://example.com/test');
                const context = new RouterContextProvider();
                const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

                vi.spyOn(context, 'get').mockImplementation((key) => {
                    if (key === performanceTimerContext) return mockPerformanceTimer;
                    if (key === appConfigContext) return mockConfig;
                    return storage;
                });

                vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                    if (typeof value === 'object' && value instanceof Map) {
                        value.forEach((v, k) => storage.set(k, v));
                    }
                });

                const mockSerialize = vi.fn().mockResolvedValue('Set-Cookie: mock=value');
                mockCreateCookie.mockReturnValue({ serialize: mockSerialize });

                const mockResponse = new Response('OK');
                const next = vi.fn().mockResolvedValue(mockResponse);

                await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

                expect(storage.get('customerId')).toBe(expectedCustomerId);
                expect(storage.get('usid')).toBe(expectedUsid);
            }
        );

        it('should ignore an existing customerId cookie and not emit a deletion for it', async () => {
            // The customerId cookie is no longer set or actively cleared by the middleware.
            // Browsers that still hold one will let it expire naturally. The middleware must
            // not be triggered into the response-write path solely because the cookie is present.
            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800;
            const isb = `uido:slas::upn:Guest::uidn:Guest User::gcid:fresh-id::chid:${mockSiteObject.id}`;
            const sub = 'cc-slas::zzrf_001::scid:scid-x::usid:fresh-usid';
            const mockAccessToken = `header.${btoa(JSON.stringify({ exp, isb, sub }))}.signature`;

            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
                'cc-at': mockAccessToken,
                usid: 'fresh-usid',
                customerId: 'stale-customer-id',
            });

            const request = new Request('https://example.com/test');
            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            const mockSerialize = vi.fn().mockResolvedValue('Set-Cookie: mock=value');
            mockCreateCookie.mockReturnValue({ serialize: mockSerialize });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // JWT-derived values still land in storage; cookie value is ignored
            expect(storage.get('customerId')).toBe('fresh-id');
            expect(storage.get('usid')).toBe('fresh-usid');

            // No Set-Cookie should be emitted in this hot path: storage was not marked updated
            // (no token refresh, no tracking-consent mismatch, usid cookie already present).
            expect(mockSerialize).not.toHaveBeenCalled();
        });

        it('should refresh the usid cookie when its value drifts from the JWT', async () => {
            // Defensive: if a browser somehow ends up with a stale `usid` cookie that no
            // longer matches the JWT-derived value, the response section must run and
            // overwrite the cookie so the value forwarded to ECOM stays in sync.
            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800;
            const isb = `uido:slas::upn:Guest::uidn:Guest User::gcid:gcid-x::chid:${mockSiteObject.id}`;
            const sub = 'cc-slas::zzrf_001::scid:scid-x::usid:fresh-usid';
            const mockAccessToken = `header.${btoa(JSON.stringify({ exp, isb, sub }))}.signature`;

            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
                'cc-at': mockAccessToken,
                usid: 'stale-usid',
            });

            const request = new Request('https://example.com/test');
            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            const mockSerialize = vi.fn().mockResolvedValue('Set-Cookie: mock=value');
            mockCreateCookie.mockReturnValue({ serialize: mockSerialize });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // JWT value wins, and the cookie is rewritten to match
            expect(storage.get('usid')).toBe('fresh-usid');
            expect(mockSerialize).toHaveBeenCalledWith('fresh-usid', expect.any(Object));
        });

        it('should write the usid cookie with refresh-token expiry when storage is updated', async () => {
            // Cold-start guest login → updateStorageAndCache sets isUpdated. The middleware must
            // emit a Set-Cookie for `usid` so hybrid storefronts can forward it to ECOM.
            mockParseAllCookies.mockReturnValue({});

            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/test');
            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            const mockSerialize = vi.fn().mockResolvedValue('Set-Cookie: mock=value');
            mockCreateCookie.mockReturnValue({ serialize: mockSerialize });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // The middleware should have asked the cookie helper to namespace `usid`
            expect(mockgetCookieNameWithSiteId).toHaveBeenCalledWith('usid', context);
            // And serialize the JWT-derived usid value
            expect(mockSerialize).toHaveBeenCalledWith(mockTokenResponse.usid, expect.any(Object));
        });

        it('should route through recovery when JWT isb claim is missing the customer ID', async () => {
            // SLAS guarantees gcid/rcid in the isb claim. A decoded-but-missing-claim token
            // is a critical token-integrity failure: the middleware must route through
            // handleAuthTokenInvalidation so the user gets a clean redirect with fresh
            // cookies rather than being trapped in a 500 loop on the malformed cookie.
            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800;
            const sub = 'cc-slas::zzrf_001::scid:scid-x::usid:fresh-usid';
            // Token is valid but missing the `isb` claim.
            const mockAccessToken = `header.${btoa(JSON.stringify({ exp, sub }))}.signature`;

            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
                'cc-at': mockAccessToken,
            });

            // Recovery path needs a working refresh+login flow. Both return a valid token.
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.refreshToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/test');
            const context = new RouterContextProvider();
            // Use originalGet as fallback so handleAuthTokenInvalidation can read the
            // contexts the middleware sets via context.set(authContext, ...).
            const originalGet = context.get.bind(context);
            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return originalGet(key);
            });

            const mockSerialize = vi.fn().mockResolvedValue('Set-Cookie: mock=value');
            mockCreateCookie.mockReturnValue({ serialize: mockSerialize });

            const next = vi.fn().mockResolvedValue(new Response('OK'));

            const response = (await authMiddleware(
                { request, context, params: {}, pattern: '/', url: new URL(request.url) },
                next
            )) as Response;

            // Recovery emits a 307 redirect with the recovery marker header
            expect(response.status).toBe(307);
            expect(response.headers.get('Location')).toBe('https://example.com/test');
            expect(response.headers.get('x-sfnext-auth-recovery')).toBe('1');
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Auth: SLAS access token isb claim is missing the customer ID (gcid/rcid)'
            );
        });

        it('should route through recovery when JWT sub claim is missing usid', async () => {
            // Same recovery semantics as the missing-isb case — the user must not be trapped.
            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800;
            const isb = `uido:slas::upn:Guest::uidn:Guest User::gcid:gcid-x::chid:${mockSiteObject.id}`;
            // Token is valid but missing the `sub` claim entirely.
            const mockAccessToken = `header.${btoa(JSON.stringify({ exp, isb }))}.signature`;

            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
                'cc-at': mockAccessToken,
            });

            const mockTokenResponse = getMockTokenResponse();
            mockAuth.refreshToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/test');
            const context = new RouterContextProvider();
            const originalGet = context.get.bind(context);
            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return originalGet(key);
            });

            const mockSerialize = vi.fn().mockResolvedValue('Set-Cookie: mock=value');
            mockCreateCookie.mockReturnValue({ serialize: mockSerialize });

            const next = vi.fn().mockResolvedValue(new Response('OK'));

            const response = (await authMiddleware(
                { request, context, params: {}, pattern: '/', url: new URL(request.url) },
                next
            )) as Response;

            expect(response.status).toBe(307);
            expect(response.headers.get('Location')).toBe('https://example.com/test');
            expect(response.headers.get('x-sfnext-auth-recovery')).toBe('1');
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Auth: SLAS access token sub claim is missing the usid segment'
            );
        });

        it('should skip the JWT integrity check when the access token was refreshed', async () => {
            // The original cc-at is BOTH expired (so retrieveAuthStorageData runs the
            // refresh path) AND malformed (no usid in `sub`). After refresh, the local
            // `claims` variable still points at the old malformed token, but the integrity
            // check must be gated on `authAction === 'tokenValid'` — refreshed tokens were
            // already validated inside updateAuthStorageDataByTokenResponse. Without the
            // gate, we'd trigger a redundant recovery cycle every request despite a fresh
            // valid session.
            const now = Math.floor(Date.now() / 1000);
            const expiredExp = now - 100;
            // Token is expired AND missing the usid segment in `sub`.
            const malformedExpiredAccessToken = `header.${btoa(
                JSON.stringify({
                    exp: expiredExp,
                    isb: `uido:slas::upn:Guest::uidn:Guest User::gcid:gcid-old::chid:${mockSiteObject.id}`,
                    sub: 'cc-slas::zzrf_001::scid:scid-x',
                })
            )}.signature`;

            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
                'cc-at': malformedExpiredAccessToken,
            });

            // Refresh returns a fresh, structurally valid token.
            const mockTokenResponse = getMockTokenResponse();
            mockAuth.refreshToken.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/test');
            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                    storage.forEach((v, k) => value.set(k, v));
                }
            });

            const next = vi.fn().mockResolvedValue(new Response('OK'));

            const response = (await authMiddleware(
                { request, context, params: {}, pattern: '/', url: new URL(request.url) },
                next
            )) as Response;

            // Normal flow: next() ran, no recovery redirect emitted.
            expect(next).toHaveBeenCalled();
            expect(response.status).toBe(200);
            expect(response.headers.get('x-sfnext-auth-recovery')).toBeNull();
            // Refresh path was exercised; integrity-check error log must NOT have fired.
            expect(mockAuth.refreshToken).toHaveBeenCalled();
            expect(mockLogger.error).not.toHaveBeenCalledWith(
                expect.stringContaining('SLAS access token sub claim is missing')
            );
            expect(mockLogger.error).not.toHaveBeenCalledWith(
                expect.stringContaining('SLAS access token isb claim is missing')
            );
        });

        it('should fall back to the usid cookie value when no access token is present', async () => {
            // Cold-start safety net: when there is no access token (so no JWT to derive usid
            // from), the existing `usid` cookie value is forwarded to SLAS via loginGuestUser
            // to preserve session continuity. Distinct from the JWT-malformed throw paths
            // above — those decode the token successfully but find missing claims.
            mockParseAllCookies.mockReturnValue({
                usid: 'usid-continuity-value',
            });

            const mockTokenResponse = getMockTokenResponse();
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/test');
            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // The middleware must have invoked guest login with the preserved usid for continuity
            expect(mockAuth.loginAsGuest).toHaveBeenCalledWith(
                expect.objectContaining({ usid: 'usid-continuity-value' })
            );
        });

        it('should redirect registered shopper to login when refresh token fails and no guard is set', async () => {
            // Cold-start with a registered refresh cookie but no valid access token.
            // Refresh fails (SLAS 400) → middleware must redirect to /login?...&error=session_expired
            // instead of silently falling through to guest login.
            mockParseAllCookies.mockReturnValue({
                'cc-nx': 'registered-refresh-token',
            });

            const mockTokenResponse = getMockTokenResponse();
            mockAuth.refreshToken.mockRejectedValue(new Error('SLAS 400: invalid refresh token'));
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/en-US/checkout', {
                headers: {
                    Cookie: 'cc-nx=registered-refresh-token',
                },
            });

            const context = new RouterContextProvider();
            const originalGet = context.get.bind(context);
            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return originalGet(key);
            });

            const serializeCalls: Array<[string, unknown]> = [];
            mockCreateCookie.mockImplementation(() => ({
                serialize: vi.fn().mockImplementation((value, options) => {
                    serializeCalls.push([value, options]);
                    return Promise.resolve('Set-Cookie: mock=value');
                }),
            }));

            const next = vi.fn().mockResolvedValue(new Response('OK'));

            const response = (await authMiddleware(
                { request, context, params: {}, pattern: '/', url: new URL(request.url) },
                next
            )) as Response;

            expect(response.status).toBe(307);
            const location = response.headers.get('Location');
            expect(location).toContain('/login');
            expect(location).toContain('error=session_expired');
            expect(location).toContain('returnUrl=');
            expect(location).toContain(encodeURIComponent('/en-US/checkout'));
            // Guard cookie must be set to prevent a redirect loop on the next request.
            expect(serializeCalls.some(([value]) => value === '1')).toBe(true);
        });

        it('should fall through to guest login when registered refresh fails and guard is already set', async () => {
            // Same setup as above but with the recovery guard cookie already present.
            // The middleware must NOT redirect again - it falls through to the guest session
            // that was created by the fallback guest login.
            mockParseAllCookies.mockReturnValue({
                'cc-nx': 'registered-refresh-token',
                'cc-auth-recover': '1',
            });

            const mockTokenResponse = getMockTokenResponse();
            mockAuth.refreshToken.mockRejectedValue(new Error('SLAS 400: invalid refresh token'));
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const request = new Request('https://example.com/en-US/checkout', {
                headers: {
                    Cookie: 'cc-nx=registered-refresh-token; cc-auth-recover=1',
                },
            });

            const context = new RouterContextProvider();
            const originalGet = context.get.bind(context);
            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                return originalGet(key);
            });

            const mockSerialize = vi.fn().mockResolvedValue('Set-Cookie: mock=value');
            mockCreateCookie.mockReturnValue({ serialize: mockSerialize });

            const next = vi.fn().mockResolvedValue(new Response('OK'));

            const response = (await authMiddleware(
                { request, context, params: {}, pattern: '/', url: new URL(request.url) },
                next
            )) as Response;

            // No redirect - falls through to the guest session.
            expect(response.status).toBe(200);
            expect(next).toHaveBeenCalled();
            expect(mockAuth.loginAsGuest).toHaveBeenCalled();
        });

        it('applies the site/locale prefix to the login redirect path', async () => {
            // Regression guard for the buildUrlFromContext call: a populated siteContext must
            // produce a prefixed login path (e.g. /RefArchGlobal/en-GB/login), not a bare
            // /login. This exercises the real buildUrlFromContext, so swapping it for a literal
            // '/login' would fail here.
            mockParseAllCookies.mockReturnValue({
                'cc-nx': 'registered-refresh-token',
            });

            const mockTokenResponse = getMockTokenResponse();
            mockAuth.refreshToken.mockRejectedValue(new Error('SLAS 400: invalid refresh token'));
            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            const requestPath = `${getSitePrefix()}/checkout`;
            const request = new Request(`https://example.com${requestPath}`, {
                headers: {
                    Cookie: 'cc-nx=registered-refresh-token',
                },
            });

            const context = new RouterContextProvider();
            const originalGet = context.get.bind(context);
            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) return mockConfig;
                // Populate site context so buildUrlFromContext applies the URL prefix instead
                // of returning the bare path.
                if (key === siteContext) {
                    return {
                        site: { id: mockSiteObject.id },
                        locale: { id: mockSiteObject.defaultLocale },
                    } as unknown as SiteContext;
                }
                return originalGet(key);
            });

            mockCreateCookie.mockImplementation(() => ({
                serialize: vi.fn().mockResolvedValue('Set-Cookie: mock=value'),
            }));

            const next = vi.fn().mockResolvedValue(new Response('OK'));

            const response = (await authMiddleware(
                { request, context, params: {}, pattern: '/', url: new URL(request.url) },
                next
            )) as Response;

            expect(response.status).toBe(307);
            const location = response.headers.get('Location');
            // The login path itself carries the prefix - this is what buildUrlFromContext adds.
            expect(location?.startsWith(`${getSitePrefix()}/login`)).toBe(true);
            expect(location).toContain('error=session_expired');
            expect(location).toContain(encodeURIComponent(requestPath));
        });

        it('should serialize dw_dnt cookie with httpOnly:false for client-side consent banner', async () => {
            // W-23424582: The tracking-consent banner must read `dw_dnt` in the browser.
            // This test verifies getCookieConfig is called with httpOnly:false when creating
            // and serializing the tracking consent cookie.
            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800;
            const sub = 'cc-slas::zzrf_001::scid:scid-x::usid:fresh-usid';
            const isb = 'gcid:gcid-x';
            // Token with dnt=true (TrackingConsent.Declined)
            const mockAccessToken = `header.${btoa(JSON.stringify({ exp, sub, isb, dnt: true }))}.signature`;

            mockParseAllCookies.mockReturnValue({
                'cc-nx-g': 'guest-refresh-token',
                'cc-at': mockAccessToken,
                dw_dnt: '1', // Tracking consent declined cookie
            });

            const request = new Request('https://example.com/test');
            const context = new RouterContextProvider();
            const storage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

            vi.spyOn(context, 'get').mockImplementation((key) => {
                if (key === performanceTimerContext) return mockPerformanceTimer;
                if (key === appConfigContext) {
                    // Enable tracking consent feature
                    return {
                        ...mockConfig,
                        engagement: {
                            ...mockConfig.engagement,
                            analytics: {
                                ...mockConfig.engagement.analytics,
                                trackingConsent: {
                                    enabled: true,
                                    defaultTrackingConsent: TrackingConsent.Accepted,
                                },
                            },
                        },
                    };
                }
                return storage;
            });

            vi.spyOn(context, 'set').mockImplementation((_key, value) => {
                if (typeof value === 'object' && value instanceof Map) {
                    value.forEach((v, k) => storage.set(k, v));
                }
            });

            // Track all getCookieConfig calls
            mockGetCookieConfig.mockClear();

            const mockSerialize = vi.fn().mockResolvedValue('mock-cookie');
            mockCreateCookie.mockReturnValue({ serialize: mockSerialize });

            const mockResponse = new Response('OK');
            const next = vi.fn().mockResolvedValue(mockResponse);

            await authMiddleware({ request, context, params: {}, pattern: '/', url: new URL(request.url) }, next);

            // Verify getCookieConfig was called with httpOnly:false for the tracking consent cookie
            // (both at create-time and serialize-time)
            const trackingConsentConfigCalls = mockGetCookieConfig.mock.calls.filter(
                (call: [{ httpOnly?: boolean }?, ...unknown[]]) => call[0]?.httpOnly === false
            );
            expect(trackingConsentConfigCalls.length).toBeGreaterThan(0);
        });

        it('should emit dw_dnt Set-Cookie header WITHOUT HttpOnly attribute', async () => {
            // W-23424582: Real serialization test — verifies the actual Set-Cookie header
            // lacks HttpOnly. Uses unmocked createCookie/serialize to exercise real path.
            // Positive control: access token cookie DOES have HttpOnly.

            // Temporarily unmock cookie-utils to use real implementation
            vi.doUnmock('@/lib/cookie-utils.server');
            const realCookieUtils = await import('@/lib/cookie-utils.server');

            const now = Math.floor(Date.now() / 1000);
            const exp = now + 1800;
            const sub = 'cc-slas::zzrf_001::scid:scid-x::usid:fresh-usid';
            const isb = 'gcid:gcid-x';
            const mockAccessToken = `header.${btoa(JSON.stringify({ exp, sub, isb, dnt: true }))}.signature`;

            const testContext = new RouterContextProvider();
            const siteId = 'RefArch';

            vi.spyOn(testContext, 'get').mockImplementation((key) => {
                if (key === siteContext) {
                    return { site: { id: siteId }, locale: { id: 'en-US' } };
                }
                if (key === appConfigContext) {
                    return mockConfig;
                }
                return undefined;
            });

            // Test 1: dw_dnt cookie serialized with httpOnly:false
            const trackingConsentCookie = realCookieUtils.createCookie<string>(
                'dw_dnt',
                realCookieUtils.getCookieConfig({ httpOnly: false }, testContext),
                testContext
            );
            const trackingConsentHeader = await trackingConsentCookie.serialize('1');

            expect(trackingConsentHeader).toMatch(/^dw_dnt/);
            expect(trackingConsentHeader).not.toMatch(/HttpOnly/i);

            // Test 2 (positive control): access token cookie DOES have HttpOnly
            const accessTokenCookie = realCookieUtils.createCookie<string>(
                'cc-at',
                realCookieUtils.getCookieConfig({ httpOnly: true }, testContext),
                testContext
            );
            const accessTokenHeader = await accessTokenCookie.serialize(mockAccessToken);

            expect(accessTokenHeader).toMatch(/^cc-at/);
            expect(accessTokenHeader).toMatch(/HttpOnly/i);

            // Re-mock for subsequent tests
            vi.doMock('@/lib/cookie-utils.server', () => ({
                createCookie: vi.fn(),
                getCookieConfig: vi.fn((overrides = {}) => ({
                    httpOnly: false,
                    secure: true,
                    sameSite: 'lax' as const,
                    path: '/',
                    ...overrides,
                })),
                getCookieNameWithSiteId: vi.fn((name: string) => name),
                parseAllCookies: vi.fn(),
            }));
        });
    });

    describe('clearInvalidSessionAndRestoreGuest', () => {
        it('should log info on successful guest session restore', async () => {
            const data = getMockAuthData();
            const { provider } = mockContext(data);
            const mockTokenResponse = getMockTokenResponse();

            mockAuth.loginAsGuest.mockResolvedValue(getMockAuthResponse(mockTokenResponse));

            await clearInvalidSessionAndRestoreGuest(provider);

            expect(mockLogger.info).toHaveBeenCalledWith('Auth: clearing invalid session and restoring guest');
            expect(mockLogger.info).toHaveBeenCalledWith('Auth: guest session restored successfully');
        });

        it('should log error on guest session restore failure', async () => {
            const data = getMockAuthData();
            const { provider } = mockContext(data);
            const mockError = new Error('Guest login failed');

            mockAuth.loginAsGuest.mockRejectedValue(mockError);

            await expect(clearInvalidSessionAndRestoreGuest(provider)).rejects.toThrow('Guest login failed');
            expect(mockLogger.info).toHaveBeenCalledWith('Auth: clearing invalid session and restoring guest');
            expect(mockLogger.error).toHaveBeenCalledWith('Auth: guest session restore failed', {
                error: mockError,
            });
        });
    });
});
