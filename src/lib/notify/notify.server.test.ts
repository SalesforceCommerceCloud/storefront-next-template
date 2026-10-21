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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import { AuthTokenInvalidError } from '@/scapi';
import {
    _resetJwksCacheForTest,
    _resetNotifyTokenCacheForTest,
    sendNotification,
    validateSlasCallbackToken,
} from './notify.server';

// Hoist mock fns so they can be referenced inside vi.mock factories
const {
    mockCreateLocalJWKSet,
    mockCreateRemoteJWKSet,
    mockJwtVerify,
    mockGetConfig,
    mockGetAccessToken,
    mockNotify,
    mockCreateApiClients,
} = vi.hoisted(() => {
    const getAccessToken = vi.fn();
    const notify = vi.fn();
    const createApiClients = vi.fn(() => ({
        shopperLogin: { getAccessToken },
        notifications: { notify },
    }));
    return {
        mockCreateLocalJWKSet: vi.fn(),
        mockCreateRemoteJWKSet: vi.fn(),
        mockJwtVerify: vi.fn(),
        mockGetConfig: vi.fn(),
        mockGetAccessToken: getAccessToken,
        mockNotify: notify,
        mockCreateApiClients: createApiClients,
    };
});

vi.mock('jose', () => ({
    createLocalJWKSet: mockCreateLocalJWKSet,
    createRemoteJWKSet: mockCreateRemoteJWKSet,
    jwtVerify: mockJwtVerify,
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: mockGetConfig,
}));

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: mockCreateApiClients,
}));

const mockContext = {} as RouterContextProvider;

function makeSendNotifContext(siteId = 'RefArch'): RouterContextProvider {
    return { get: vi.fn().mockReturnValue({ site: { id: siteId } }) } as unknown as RouterContextProvider;
}

function makeNotifyConfig(notifyClientId = 'notify-client-id') {
    return {
        commerce: {
            api: {
                organizationId: 'f_ecom_zzrf_001',
                notifyClientId,
            },
        },
        i18n: { fallbackLng: 'en-US' },
    };
}

function makeTokenResponse(accessToken = 'notify-access-token', expiresIn = 1800) {
    return { data: { access_token: accessToken, expires_in: expiresIn } };
}

/** Fake JWKS key set object returned by createLocalJWKSet. Opaque to the test — just needs to be referentially stable. */
const MOCK_KEYSET = Symbol('keyset');

function makeConfig(organizationId = 'f_ecom_zzrf_001', shortCode = 'kv7kzm78') {
    return { commerce: { api: { organizationId, shortCode } } };
}

describe('sendNotification / token cache', () => {
    const payload = { type: 'otp' as const, recipient: 'user@example.com', data: { token: '123456' } };

    beforeEach(() => {
        vi.clearAllMocks();
        _resetNotifyTokenCacheForTest();
        vi.stubEnv('COMMERCE_API_SLAS_NOTIFY_SECRET', 'test-secret');
        mockGetConfig.mockReturnValue(makeNotifyConfig());
        mockGetAccessToken.mockResolvedValue(makeTokenResponse());
        mockNotify.mockResolvedValue({ data: { success: true } });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('fetches a token on cache miss and reuses it on the next call', async () => {
        const ctx = makeSendNotifContext();
        await sendNotification(ctx, payload);
        await sendNotification(ctx, payload);

        expect(mockGetAccessToken).toHaveBeenCalledOnce();
        expect(mockNotify).toHaveBeenCalledTimes(2);
    });

    it('uses separate cache entries for different siteIds', async () => {
        await sendNotification(makeSendNotifContext('SiteA'), payload);
        await sendNotification(makeSendNotifContext('SiteB'), payload);

        // Two different sites → two separate token fetches
        expect(mockGetAccessToken).toHaveBeenCalledTimes(2);
    });

    it('does not pass path.organizationId to getAccessToken', async () => {
        await sendNotification(makeSendNotifContext(), payload);

        const callArgs = mockGetAccessToken.mock.calls[0][0] as { params?: { path?: unknown } };
        expect(callArgs.params?.path).toBeUndefined();
    });

    it('invalidates the token cache on 401 and retries', async () => {
        const ctx = makeSendNotifContext();

        // Prime the cache
        await sendNotification(ctx, payload);
        expect(mockGetAccessToken).toHaveBeenCalledOnce();

        // Simulate a 401: the SDK always throws AuthTokenInvalidError on non-SLAS 401s
        const unauthorized = new AuthTokenInvalidError();
        mockNotify.mockRejectedValueOnce(unauthorized).mockResolvedValueOnce({ data: { success: true } });

        await sendNotification(ctx, payload);

        // Should have fetched a fresh token for the retry
        expect(mockGetAccessToken).toHaveBeenCalledTimes(2);
    });

    it('throws when notifyClientId is not configured', async () => {
        mockGetConfig.mockReturnValue({
            commerce: { api: { organizationId: 'f_ecom_zzrf_001' } },
            i18n: { fallbackLng: 'en-US' },
        });

        await expect(sendNotification(makeSendNotifContext(), payload)).rejects.toThrow(
            /Notify client is not configured/
        );
    });

    it('throws when COMMERCE_API_SLAS_NOTIFY_SECRET is not set', async () => {
        vi.stubEnv('COMMERCE_API_SLAS_NOTIFY_SECRET', '');

        await expect(sendNotification(makeSendNotifContext(), payload)).rejects.toThrow(
            /Notify client secret is not configured/
        );
    });
});

describe('validateSlasCallbackToken', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetJwksCacheForTest();
        // Default: use preloaded JWKS so no tests make real network requests
        vi.stubEnv('SLAS_JWKS_JSON', JSON.stringify({ keys: [{ kid: 'default', kty: 'RSA' }] }));
        mockGetConfig.mockReturnValue(makeConfig());
        mockCreateLocalJWKSet.mockReturnValue(MOCK_KEYSET);
        mockCreateRemoteJWKSet.mockReturnValue(MOCK_KEYSET);
        // Default happy-path JWT payload — production SLAS uses hyphens in the subdomain
        mockJwtVerify.mockResolvedValue({
            payload: { iss: 'https://zzrf-001.dx.commercecloud.salesforce.com/something' },
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    describe('tenant ID extraction', () => {
        it('extracts tenant ID from URL-format issuer (HTTPS authority segment, hyphens)', async () => {
            // Real SLAS production issuers use hyphens: "zzrf-001.dx.commercecloud.salesforce.com"
            // configTenantId is "zzrf_001" (underscores); normalization bridges the two forms.
            mockJwtVerify.mockResolvedValue({
                payload: { iss: 'https://zzrf-001.dx.commercecloud.salesforce.com/shopper/auth' },
            });
            const result = await validateSlasCallbackToken(mockContext, 'any-token');
            expect(result.iss).toBe('https://zzrf-001.dx.commercecloud.salesforce.com/shopper/auth');
        });

        it('accepts hyphenated production issuer matching underscore-format org ID', async () => {
            // "zzrf-001" (hyphens, from SLAS) should match "zzrf_001" (underscores, from organizationId)
            mockJwtVerify.mockResolvedValue({
                payload: { iss: 'https://zzrf-001.dx.commercecloud.salesforce.com/shopper/auth' },
            });
            const result = await validateSlasCallbackToken(mockContext, 'any-token');
            expect(result.iss).toContain('zzrf-001');
        });

        it('extracts tenant ID from path-format issuer (slas/dev/<tenant>)', async () => {
            // Path-format issuers have no "//", so the regex fallback uses the last path segment
            mockGetConfig.mockReturnValue(makeConfig('f_ecom_zysg_001', 'abc12345'));
            mockJwtVerify.mockResolvedValue({ payload: { iss: 'slas/dev/zysg_001' } });

            const result = await validateSlasCallbackToken(mockContext, 'any-token');
            expect(result.iss).toBe('slas/dev/zysg_001');
        });
    });

    describe('tenant ID validation', () => {
        it('throws when token tenant ID does not match configured org ID', async () => {
            mockJwtVerify.mockResolvedValue({ payload: { iss: 'https://other-tenant/auth' } });

            await expect(validateSlasCallbackToken(mockContext, 'any-token')).rejects.toThrow(
                /tenant ID in your configuration.*does not match/
            );
        });

        it('throws when issuer claim is missing from the verified token payload', async () => {
            mockJwtVerify.mockResolvedValue({ payload: {} });

            await expect(validateSlasCallbackToken(mockContext, 'any-token')).rejects.toThrow(
                /missing or invalid issuer claim/
            );
        });
    });

    describe('JWT verification errors', () => {
        it('wraps jose verification errors in a SLAS Token Validation Error', async () => {
            mockJwtVerify.mockRejectedValue(new Error('JWSSignatureVerificationFailed'));

            await expect(validateSlasCallbackToken(mockContext, 'bad-token')).rejects.toThrow(
                /SLAS Token Validation Error.*JWSSignatureVerificationFailed/
            );
        });

        it('throws when config is not available', async () => {
            mockGetConfig.mockReturnValue(null);

            await expect(validateSlasCallbackToken(mockContext, 'any-token')).rejects.toThrow(
                /Runtime configuration not found/
            );
        });
    });

    describe('JWKS key set loading', () => {
        it('uses preloaded JWKS when SLAS_JWKS_JSON env var is set', async () => {
            const jwks = { keys: [{ kid: 'key1', kty: 'RSA', n: 'abc', e: 'AQAB' }] };
            vi.stubEnv('SLAS_JWKS_JSON', JSON.stringify(jwks));

            await validateSlasCallbackToken(mockContext, 'any-token');

            // createLocalJWKSet receives the parsed JWKS — proves the env var path was taken, not a network fetch
            expect(mockCreateLocalJWKSet).toHaveBeenCalledWith(jwks);
        });

        it('creates a RemoteJWKSet for the correct SLAS JWKS URI when env var is absent', async () => {
            vi.stubEnv('SLAS_JWKS_JSON', ''); // override the beforeEach default

            await validateSlasCallbackToken(mockContext, 'any-token');

            expect(mockCreateRemoteJWKSet).toHaveBeenCalledOnce();
            const [url] = mockCreateRemoteJWKSet.mock.calls[0];
            expect(url.toString()).toContain('kv7kzm78.api.commercecloud.salesforce.com');
            expect(url.toString()).toContain('f_ecom_zzrf_001');
            expect(url.toString()).toContain('oauth2/jwks');
        });

        it('reuses the cached RemoteJWKSet across calls for the same URI', async () => {
            vi.stubEnv('SLAS_JWKS_JSON', ''); // override the beforeEach default

            await validateSlasCallbackToken(mockContext, 'any-token');
            await validateSlasCallbackToken(mockContext, 'any-token');

            // createRemoteJWKSet should only be called once — the second call uses the cached instance
            expect(mockCreateRemoteJWKSet).toHaveBeenCalledOnce();
        });

        it('throws when shortCode is missing and no SLAS_JWKS_JSON is set', async () => {
            vi.stubEnv('SLAS_JWKS_JSON', ''); // override the beforeEach default
            mockGetConfig.mockReturnValue(makeConfig('f_ecom_zzrf_001', ''));

            await expect(validateSlasCallbackToken(mockContext, 'any-token')).rejects.toThrow(/shortCode is required/);
        });
    });
});
