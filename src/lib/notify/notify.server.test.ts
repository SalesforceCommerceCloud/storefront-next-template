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
import { validateSlasCallbackToken } from './notify.server';

// Hoist mock fns so they can be referenced inside vi.mock factories
const { mockCreateLocalJWKSet, mockJwtVerify, mockGetConfig } = vi.hoisted(() => ({
    mockCreateLocalJWKSet: vi.fn(),
    mockJwtVerify: vi.fn(),
    mockGetConfig: vi.fn(),
}));

vi.mock('jose', () => ({
    createLocalJWKSet: mockCreateLocalJWKSet,
    jwtVerify: mockJwtVerify,
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: mockGetConfig,
}));

const mockContext = {} as RouterContextProvider;

/** Fake JWKS key set object returned by createLocalJWKSet. Opaque to the test — just needs to be referentially stable. */
const MOCK_KEYSET = Symbol('keyset');

function makeConfig(organizationId = 'f_ecom_zzrf_001', shortCode = 'kv7kzm78') {
    return { commerce: { api: { organizationId, shortCode } } };
}

describe('validateSlasCallbackToken', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: use preloaded JWKS so no tests make real network requests
        vi.stubEnv('SLAS_JWKS_JSON', JSON.stringify({ keys: [{ kid: 'default', kty: 'RSA' }] }));
        mockGetConfig.mockReturnValue(makeConfig());
        mockCreateLocalJWKSet.mockReturnValue(MOCK_KEYSET);
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

        it('fetches JWKS from SLAS endpoint when env var is absent', async () => {
            vi.stubEnv('SLAS_JWKS_JSON', ''); // override the beforeEach default
            const fetchedKeys = { keys: [{ kid: 'remote-key', kty: 'RSA' }] };
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(fetchedKeys),
                text: vi.fn(),
            });
            vi.stubGlobal('fetch', fetchMock);

            await validateSlasCallbackToken(mockContext, 'any-token');

            expect(fetchMock).toHaveBeenCalledOnce();
            const [url] = fetchMock.mock.calls[0];
            expect(url).toContain('kv7kzm78.api.commercecloud.salesforce.com');
            expect(url).toContain('f_ecom_zzrf_001');
            expect(url).toContain('oauth2/jwks');
            expect(mockCreateLocalJWKSet).toHaveBeenCalledWith(fetchedKeys);
        });

        it('throws when JWKS network fetch returns a non-200 response', async () => {
            vi.stubEnv('SLAS_JWKS_JSON', ''); // override the beforeEach default
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue({
                    ok: false,
                    status: 403,
                    statusText: 'Forbidden',
                    text: vi.fn().mockResolvedValue('Cloudflare blocked'),
                })
            );

            await expect(validateSlasCallbackToken(mockContext, 'any-token')).rejects.toThrow(/JWKS fetch failed: 403/);
        });

        it('throws when shortCode is missing and no SLAS_JWKS_JSON is set', async () => {
            vi.stubEnv('SLAS_JWKS_JSON', ''); // override the beforeEach default
            mockGetConfig.mockReturnValue(makeConfig('f_ecom_zzrf_001', ''));

            await expect(validateSlasCallbackToken(mockContext, 'any-token')).rejects.toThrow(/shortCode is required/);
        });
    });
});
