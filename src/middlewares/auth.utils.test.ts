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
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getRefreshTokenExpiry,
    MAX_GUEST_REFRESH_TOKEN_EXPIRY,
    MAX_REGISTERED_REFRESH_TOKEN_EXPIRY,
    decodeSLASAccessToken,
    getSLASAccessTokenClaims,
    getCustomerIdFromClaims,
    isRegisteredTokenClaims,
    deriveUserTypeFromClaims,
    isTrackingConsentEnabled,
    getPublicSessionData,
    hasUsableShopperSession,
    updateAuthStorageDataByTokenResponse,
    getAuthRecoveryStage,
    getScapiApiName,
    type AuthStorageData,
} from './auth.utils';
import { buildMockTokenResponse } from '@/test-utils/auth';
import type { SessionData } from '@/lib/api/types';
import type { AppConfig } from '@/types/config';
import { createTestContext } from '@/lib/test-utils';
import { mockBuildConfig, mockSiteObject } from '@/test-utils/config';
import { TrackingConsent } from '@/types/tracking-consent';

describe('auth.utils', () => {
    describe('getAuthRecoveryStage', () => {
        it.each([
            ['1', 1],
            ['2', 2],
            [undefined, 0],
            [null, 0],
            ['', 0],
            ['3', 0],
            ['planted', 0],
        ] as const)('maps guard %s to stage %s', (value, stage) => {
            expect(getAuthRecoveryStage(value)).toBe(stage);
        });
    });

    describe('getScapiApiName', () => {
        it.each([
            [
                'https://x.api.commercecloud.salesforce.com/checkout/shopper-baskets/v2/organizations/o/baskets/1',
                'checkout/shopper-baskets/v2',
            ],
            [
                'https://proxy.example/s/x/dw/shop/product/shopper-products/v1/organizations/o/products/p',
                'product/shopper-products/v1',
            ],
            ['https://x.example/organizations/o/baskets', null],
            ['https://x.example/no/org/segment', null],
            ['', null],
        ])('names %s as %s', (url, name) => {
            expect(getScapiApiName(url)).toBe(name);
        });
    });

    let mockConfig: AppConfig;

    beforeEach(() => {
        // Reset config mocks before each test
        mockConfig = {
            commerce: {
                api: {
                    clientId: '',
                    organizationId: '',
                    siteId: '',
                    shortCode: '',
                    proxy: '',
                    callback: '',
                    privateKeyEnabled: false,
                    guestRefreshTokenExpirySeconds: undefined,
                    registeredRefreshTokenExpirySeconds: undefined,
                },
            },
        } as unknown as AppConfig;
    });

    describe('getRefreshTokenExpiry', () => {
        const API_EXPIRY = 7776000; // 90 days in seconds

        it.each([
            ['not provided', undefined],
            ['explicitly undefined', undefined],
        ])('should return API response value when userType is %s', (_, userType) => {
            const result = getRefreshTokenExpiry(API_EXPIRY, userType);

            expect(result).toBe(API_EXPIRY);
        });

        it.each([
            ['guest', 'guestRefreshTokenExpirySeconds', 'guest' as const, 2592000],
            ['registered', 'registeredRefreshTokenExpirySeconds', 'registered' as const, 7776000],
        ])('should return %s user override when config is set', (_, configKey, userType, customExpiry) => {
            (mockConfig.commerce.api as any)[configKey] = customExpiry;

            const result = getRefreshTokenExpiry(API_EXPIRY, userType, mockConfig);

            expect(result).toBe(customExpiry);
        });

        it.each([
            ['guest', 'guest' as const, MAX_GUEST_REFRESH_TOKEN_EXPIRY],
            ['registered', 'registered' as const, MAX_REGISTERED_REFRESH_TOKEN_EXPIRY],
        ])('should cap API response to maximum for %s when no config override is set', (_, userType, expectedMax) => {
            const result = getRefreshTokenExpiry(API_EXPIRY, userType, mockConfig);

            expect(result).toBe(expectedMax);
        });

        it.each([
            ['guest', 'guest' as const, 'registeredRefreshTokenExpirySeconds', MAX_GUEST_REFRESH_TOKEN_EXPIRY],
            [
                'registered',
                'registered' as const,
                'guestRefreshTokenExpirySeconds',
                MAX_REGISTERED_REFRESH_TOKEN_EXPIRY,
            ],
        ])('should not use wrong user type override for %s', (_, userType, wrongConfigKey, expectedMax) => {
            (mockConfig.commerce.api as any)[wrongConfigKey] = 1000000;

            const result = getRefreshTokenExpiry(API_EXPIRY, userType, mockConfig);

            expect(result).toBe(expectedMax);
        });

        describe('maximum expiry validation', () => {
            it('should cap guest token API response to 30 days maximum', () => {
                const SIXTY_DAYS = 60 * 24 * 60 * 60;
                const result = getRefreshTokenExpiry(SIXTY_DAYS, 'guest', mockConfig);

                expect(result).toBe(MAX_GUEST_REFRESH_TOKEN_EXPIRY);
            });

            it('should cap registered token API response to 90 days maximum', () => {
                const ONE_HUNDRED_EIGHTY_DAYS = 180 * 24 * 60 * 60;
                const result = getRefreshTokenExpiry(ONE_HUNDRED_EIGHTY_DAYS, 'registered', mockConfig);

                expect(result).toBe(MAX_REGISTERED_REFRESH_TOKEN_EXPIRY);
            });

            it('should cap guest token config override to 30 days maximum', () => {
                const SIXTY_DAYS = 60 * 24 * 60 * 60;
                mockConfig.commerce.api.guestRefreshTokenExpirySeconds = SIXTY_DAYS;

                const result = getRefreshTokenExpiry(API_EXPIRY, 'guest', mockConfig);

                expect(result).toBe(MAX_GUEST_REFRESH_TOKEN_EXPIRY);
            });

            it('should cap registered token config override to 90 days maximum', () => {
                const ONE_HUNDRED_EIGHTY_DAYS = 180 * 24 * 60 * 60;
                mockConfig.commerce.api.registeredRefreshTokenExpirySeconds = ONE_HUNDRED_EIGHTY_DAYS;

                const result = getRefreshTokenExpiry(API_EXPIRY, 'registered', mockConfig);

                expect(result).toBe(MAX_REGISTERED_REFRESH_TOKEN_EXPIRY);
            });

            it('should allow valid guest token values under maximum', () => {
                const FIFTEEN_DAYS = 15 * 24 * 60 * 60;
                mockConfig.commerce.api.guestRefreshTokenExpirySeconds = FIFTEEN_DAYS;

                const result = getRefreshTokenExpiry(API_EXPIRY, 'guest', mockConfig);

                expect(result).toBe(FIFTEEN_DAYS);
            });

            it('should allow valid registered token values under maximum', () => {
                const SIXTY_DAYS = 60 * 24 * 60 * 60;
                mockConfig.commerce.api.registeredRefreshTokenExpirySeconds = SIXTY_DAYS;

                const result = getRefreshTokenExpiry(API_EXPIRY, 'registered', mockConfig);

                expect(result).toBe(SIXTY_DAYS);
            });
        });

        describe('edge cases', () => {
            it('should handle zero API expiry', () => {
                const result = getRefreshTokenExpiry(0, 'guest', mockConfig);

                expect(result).toBe(0);
            });

            it('should not cap API expiry when no userType is provided', () => {
                const LARGE_EXPIRY = 999999999;
                const result = getRefreshTokenExpiry(LARGE_EXPIRY);

                expect(result).toBe(LARGE_EXPIRY);
            });

            it('should prioritize config override even when API expiry is zero', () => {
                const CUSTOM_EXPIRY = 5000;
                mockConfig.commerce.api.guestRefreshTokenExpirySeconds = CUSTOM_EXPIRY;

                const result = getRefreshTokenExpiry(0, 'guest', mockConfig);

                expect(result).toBe(CUSTOM_EXPIRY);
            });

            it('should handle undefined config as no override', () => {
                const result = getRefreshTokenExpiry(API_EXPIRY, 'guest', mockConfig);

                expect(result).toBe(MAX_GUEST_REFRESH_TOKEN_EXPIRY); // API response is 90 days, capped to 30 days for guest
            });
        });

        it('should handle both overrides set and use correct one (capped) based on userType', () => {
            const GUEST_OVERRIDE = 5184000; // 60 days (exceeds max)
            const REGISTERED_OVERRIDE = 15552000; // 180 days (exceeds max)
            mockConfig.commerce.api.guestRefreshTokenExpirySeconds = GUEST_OVERRIDE;
            mockConfig.commerce.api.registeredRefreshTokenExpirySeconds = REGISTERED_OVERRIDE;

            const guestResult = getRefreshTokenExpiry(API_EXPIRY, 'guest', mockConfig);
            const registeredResult = getRefreshTokenExpiry(API_EXPIRY, 'registered', mockConfig);

            expect(guestResult).toBe(MAX_GUEST_REFRESH_TOKEN_EXPIRY); // Capped to 30 days
            expect(registeredResult).toBe(MAX_REGISTERED_REFRESH_TOKEN_EXPIRY); // Capped to 90 days
            expect(guestResult).not.toBe(registeredResult);
        });
    });

    describe('SLAS Access Token utilities', () => {
        // Helper to create a test SLAS access token
        const createTestToken = (payload: Record<string, unknown>): string => {
            const header = { alg: 'HS256', typ: 'JWT' };
            const encodeBase64Url = (obj: Record<string, unknown>): string => {
                const json = JSON.stringify(obj);
                const base64 = Buffer.from(json).toString('base64');
                return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            };

            return [encodeBase64Url(header), encodeBase64Url(payload), 'fake-signature'].join('.');
        };

        describe('decodeSLASAccessToken', () => {
            it('should decode a valid SLAS access token', () => {
                const payload = { exp: 1234567890, sub: 'user123', iat: 1234567800 };
                const token = createTestToken(payload);

                const decoded = decodeSLASAccessToken(token);

                expect(decoded.exp).toBe(1234567890);
                expect(decoded.sub).toBe('user123');
                expect(decoded.iat).toBe(1234567800);
            });

            it('should handle tokens with custom claims', () => {
                const payload = {
                    exp: 1234567890,
                    customClaim: 'customValue',
                    nested: { key: 'value' },
                };
                const token = createTestToken(payload);

                const decoded = decodeSLASAccessToken(token);

                expect(decoded.customClaim).toBe('customValue');
                expect(decoded.nested).toEqual({ key: 'value' });
            });

            it('should throw error for empty token', () => {
                expect(() => decodeSLASAccessToken('')).toThrow('Invalid token: must be a non-empty string');
            });

            it('should throw error for null token', () => {
                expect(() => decodeSLASAccessToken(null as unknown as string)).toThrow(
                    'Invalid token: must be a non-empty string'
                );
            });

            it('should throw error for token with wrong number of parts', () => {
                expect(() => decodeSLASAccessToken('invalid.token')).toThrow(
                    'Invalid JWT: must have 3 parts (header.payload.signature)'
                );
                expect(() => decodeSLASAccessToken('too.many.parts.here')).toThrow(
                    'Invalid JWT: must have 3 parts (header.payload.signature)'
                );
            });

            it('should throw error for token with empty payload', () => {
                expect(() => decodeSLASAccessToken('header..signature')).toThrow('Invalid JWT: missing payload');
            });

            it('should throw error for token with invalid base64', () => {
                expect(() => decodeSLASAccessToken('header.invalid!!!.signature')).toThrow('Failed to decode JWT');
            });

            it('should throw error for token with invalid JSON in payload', () => {
                const invalidJson = Buffer.from('not valid json').toString('base64');
                const token = `header.${invalidJson}.signature`;
                expect(() => decodeSLASAccessToken(token)).toThrow('Failed to decode JWT');
            });

            it('should handle base64url encoding with - and _', () => {
                // Create payload that results in + and / in standard base64
                const payload = { exp: 1234567890, data: 'test?>test?>test' };
                const token = createTestToken(payload);

                const decoded = decodeSLASAccessToken(token);

                expect(decoded.exp).toBe(1234567890);
                expect(decoded.data).toBe('test?>test?>test');
            });
        });

        describe('getSLASAccessTokenClaims', () => {
            it('should return expiry timestamp in milliseconds and trackingConsent claim', () => {
                const expSeconds = 1234567890;
                const token = createTestToken({ exp: expSeconds, dnt: true });

                const claims = getSLASAccessTokenClaims(token);

                expect(claims.expiry).toBe(expSeconds * 1000);
                expect(claims.trackingConsent).toBe(TrackingConsent.Declined);
            });

            it('should return null expiry for token without exp claim', () => {
                const token = createTestToken({ sub: 'user123' });

                const claims = getSLASAccessTokenClaims(token);

                expect(claims.expiry).toBeNull();
                expect(claims.trackingConsent).toBeNull();
            });

            it('should return null for all claims for invalid token', () => {
                const claims1 = getSLASAccessTokenClaims('invalid.token');
                const claims2 = getSLASAccessTokenClaims('');

                expect(claims1).toEqual({ expiry: null, trackingConsent: null, gcid: null, rcid: null, usid: null });
                expect(claims2).toEqual({ expiry: null, trackingConsent: null, gcid: null, rcid: null, usid: null });
            });

            it('should handle exp as 0', () => {
                const token = createTestToken({ exp: 0 });

                const claims = getSLASAccessTokenClaims(token);

                expect(claims.expiry).toBe(0);
            });

            it('should handle realistic SLAS token', () => {
                const now = Date.now();
                const expSeconds = Math.floor(now / 1000) + 1800; // 30 minutes
                const token = createTestToken({ exp: expSeconds });

                const claims = getSLASAccessTokenClaims(token);

                expect(claims.expiry).toBe(expSeconds * 1000);
                expect(claims.expiry).toBeGreaterThan(now);
            });

            it('should handle dnt as boolean true (Declined)', () => {
                const token = createTestToken({ exp: 1234567890, dnt: true });

                const claims = getSLASAccessTokenClaims(token);

                expect(claims.trackingConsent).toBe(TrackingConsent.Declined);
            });

            it('should handle dnt as boolean false (Accepted)', () => {
                const token = createTestToken({ exp: 1234567890, dnt: false });

                const claims = getSLASAccessTokenClaims(token);

                expect(claims.trackingConsent).toBe(TrackingConsent.Accepted);
            });

            it('should handle dnt as string "true" (Declined)', () => {
                const token = createTestToken({ exp: 1234567890, dnt: 'true' });

                const claims = getSLASAccessTokenClaims(token);

                expect(claims.trackingConsent).toBe(TrackingConsent.Declined);
            });

            it('should handle dnt as string "1" (Declined)', () => {
                const token = createTestToken({ exp: 1234567890, dnt: '1' });

                const claims = getSLASAccessTokenClaims(token);

                expect(claims.trackingConsent).toBe(TrackingConsent.Declined);
            });

            it('should handle dnt as string "false" (Accepted)', () => {
                const token = createTestToken({ exp: 1234567890, dnt: 'false' });

                const claims = getSLASAccessTokenClaims(token);

                expect(claims.trackingConsent).toBe(TrackingConsent.Accepted);
            });

            it('should handle dnt as string "0" (Accepted)', () => {
                const token = createTestToken({ exp: 1234567890, dnt: '0' });

                const claims = getSLASAccessTokenClaims(token);

                expect(claims.trackingConsent).toBe(TrackingConsent.Accepted);
            });

            it('should return null trackingConsent when dnt claim is missing', () => {
                const token = createTestToken({ exp: 1234567890 });

                const claims = getSLASAccessTokenClaims(token);

                expect(claims.trackingConsent).toBeNull();
            });

            it.each([
                {
                    desc: 'guest (gcid only)',
                    isb: `uido:slas::upn:Guest::uidn:Guest User::gcid:abxHg0w0xGkXoRxKdIwqYYkrk1::chid:${mockSiteObject.id}`,
                    expectedGcid: 'abxHg0w0xGkXoRxKdIwqYYkrk1',
                    expectedRcid: null,
                },
                {
                    desc: 'registered (gcid + rcid)',
                    isb: `uido:ecom::upn:user@example.com::uidn:Test User::gcid:abxHg0w0xGkXoRxKdIwqYYkrk1::rcid:abwuhGmbgXkHkRlehKlaYYlrxG::chid:${mockSiteObject.id}`,
                    expectedGcid: 'abxHg0w0xGkXoRxKdIwqYYkrk1',
                    expectedRcid: 'abwuhGmbgXkHkRlehKlaYYlrxG',
                },
            ])('should extract customer IDs from $desc isb claim', ({ isb, expectedGcid, expectedRcid }) => {
                const token = createTestToken({ exp: 1234567890, isb });
                const claims = getSLASAccessTokenClaims(token);

                expect(claims.gcid).toBe(expectedGcid);
                expect(claims.rcid).toBe(expectedRcid);
            });

            it.each([
                { desc: 'missing', payload: { exp: 1234567890 } },
                { desc: 'not a string', payload: { exp: 1234567890, isb: 12345 } },
                { desc: 'empty string', payload: { exp: 1234567890, isb: '' } },
            ])('should return null gcid and rcid when isb claim is $desc', ({ payload }) => {
                const token = createTestToken(payload);
                const claims = getSLASAccessTokenClaims(token);

                expect(claims.gcid).toBeNull();
                expect(claims.rcid).toBeNull();
            });

            it.each([
                {
                    desc: 'sub with usid segment',
                    sub: 'cc-slas::zzrf_001::scid:083859f2-5d93-4209-b999-a112266d63a0::usid:e8664844-e00e-4850-a56a-9dc44c04df1c',
                    expectedUsid: 'e8664844-e00e-4850-a56a-9dc44c04df1c',
                },
                {
                    desc: 'sub with usid as last segment',
                    sub: 'cc-slas::zzrf_001::usid:plain-usid',
                    expectedUsid: 'plain-usid',
                },
            ])('should extract usid from $desc', ({ sub, expectedUsid }) => {
                const token = createTestToken({ exp: 1234567890, sub });
                const claims = getSLASAccessTokenClaims(token);

                expect(claims.usid).toBe(expectedUsid);
            });

            it.each([
                { desc: 'missing', payload: { exp: 1234567890 } },
                { desc: 'not a string', payload: { exp: 1234567890, sub: 12345 } },
                { desc: 'empty string', payload: { exp: 1234567890, sub: '' } },
                { desc: 'no usid segment', payload: { exp: 1234567890, sub: 'cc-slas::zzrf_001::scid:abc' } },
            ])('should return null usid when sub claim is $desc', ({ payload }) => {
                const token = createTestToken(payload);
                const claims = getSLASAccessTokenClaims(token);

                expect(claims.usid).toBeNull();
            });
        });

        describe('getCustomerIdFromClaims', () => {
            it.each([
                {
                    desc: 'gcid when only gcid is present (guest token)',
                    gcid: 'guest-id',
                    rcid: null,
                    expected: 'guest-id',
                },
                {
                    desc: 'rcid when both are present (registered token)',
                    gcid: 'guest-id',
                    rcid: 'reg-id',
                    expected: 'reg-id',
                },
                {
                    desc: 'null when neither claim is present',
                    gcid: null,
                    rcid: null,
                    expected: null,
                },
            ])('should return $desc', ({ gcid, rcid, expected }) => {
                const claims = { expiry: 1234567890000, trackingConsent: null, gcid, rcid, usid: null };
                expect(getCustomerIdFromClaims(claims)).toBe(expected);
            });
        });

        describe('isRegisteredTokenClaims / deriveUserTypeFromClaims', () => {
            const baseClaims = { expiry: 1234567890000, trackingConsent: null, usid: 'usid-1' };

            it.each<{ desc: string; gcid: string; rcid: string | null; expected: boolean }>([
                { desc: 'rcid present and non-empty', gcid: 'g', rcid: 'r', expected: true },
                { desc: 'rcid is null', gcid: 'g', rcid: null, expected: false },
                { desc: 'rcid is empty string', gcid: 'g', rcid: '', expected: false },
            ])('isRegisteredTokenClaims returns $expected when $desc', ({ gcid, rcid, expected }) => {
                const claims = { ...baseClaims, gcid, rcid };
                expect(isRegisteredTokenClaims(claims)).toBe(expected);
            });

            it('deriveUserTypeFromClaims returns "registered" when rcid is non-empty', () => {
                const claims = { ...baseClaims, gcid: 'g', rcid: 'r' };
                expect(deriveUserTypeFromClaims(claims)).toBe('registered');
            });

            it('deriveUserTypeFromClaims returns "guest" when rcid is missing', () => {
                const claims = { ...baseClaims, gcid: 'g', rcid: null };
                expect(deriveUserTypeFromClaims(claims)).toBe('guest');
            });
        });
    });

    describe('Tracking Consent utilities', () => {
        describe('isTrackingConsentEnabled', () => {
            beforeEach(() => {
                vi.resetModules();
            });

            it('should return true when tracking consent is enabled in config', () => {
                const testConfig = {
                    ...mockBuildConfig.app,
                    engagement: {
                        ...mockBuildConfig.app.engagement,
                        analytics: {
                            ...mockBuildConfig.app.engagement.analytics,
                            trackingConsent: {
                                enabled: true,
                                defaultTrackingConsent: TrackingConsent.Declined,
                            },
                        },
                    },
                };
                const context = createTestContext({ appConfig: testConfig });

                const result = isTrackingConsentEnabled(context);

                expect(result).toBe(true);
            });

            it('should return false when tracking consent is disabled in config', () => {
                const testConfig = {
                    ...mockBuildConfig.app,
                    engagement: {
                        ...mockBuildConfig.app.engagement,
                        analytics: {
                            ...mockBuildConfig.app.engagement.analytics,
                            trackingConsent: {
                                enabled: false,
                                defaultTrackingConsent: TrackingConsent.Declined,
                            },
                        },
                    },
                };
                const context = createTestContext({ appConfig: testConfig });

                const result = isTrackingConsentEnabled(context);

                expect(result).toBe(false);
            });

            it('should return false when tracking consent config is missing', () => {
                const testConfig = {
                    ...mockBuildConfig.app,
                    engagement: {
                        ...mockBuildConfig.app.engagement,
                        analytics: {
                            ...mockBuildConfig.app.engagement.analytics,
                            trackingConsent: undefined,
                        },
                    },
                };
                const context = createTestContext({ appConfig: testConfig });

                const result = isTrackingConsentEnabled(context);

                expect(result).toBe(false);
            });

            it('should return false when engagement config is missing', () => {
                // Override engagement to remove analytics config
                const testConfig = {
                    ...mockBuildConfig.app,
                    engagement: {
                        ...mockBuildConfig.app.engagement,
                        analytics: {} as any,
                    },
                };
                const context = createTestContext({ appConfig: testConfig });

                const result = isTrackingConsentEnabled(context);

                expect(result).toBe(false);
            });
        });
    });

    describe('getPublicSessionData', () => {
        it('should extract only non-sensitive fields from session data', () => {
            const fullSession: SessionData = {
                accessToken: 'secret-access-token',
                refreshToken: 'secret-refresh-token',
                accessTokenExpiry: 1234567890,
                refreshTokenExpiry: 9876543210,
                customerId: 'customer-123',
                userType: 'registered',
                usid: 'usid-456',
                encUserId: 'enc-user-789',
                trackingConsent: TrackingConsent.Accepted,
                codeVerifier: 'secret-code-verifier',
                idpAccessToken: 'secret-idp-token',
                idpAccessTokenExpiry: 1111111111,
                idToken: 'secret-id-token',
                idpRefreshToken: 'secret-idp-refresh-token',
                dwsid: 'secret-dwsid',
            };

            const publicData = getPublicSessionData(fullSession);

            // Should include only these non-sensitive fields
            expect(publicData).toEqual({
                customerId: 'customer-123',
                userType: 'registered',
                usid: 'usid-456',
                encUserId: 'enc-user-789',
                trackingConsent: TrackingConsent.Accepted,
            });

            // Verify sensitive fields are NOT present
            expect(publicData).not.toHaveProperty('accessToken');
            expect(publicData).not.toHaveProperty('refreshToken');
            expect(publicData).not.toHaveProperty('codeVerifier');
            expect(publicData).not.toHaveProperty('idpAccessToken');
            expect(publicData).not.toHaveProperty('idToken');
            expect(publicData).not.toHaveProperty('idpRefreshToken');
            expect(publicData).not.toHaveProperty('dwsid');
        });
    });

    describe('updateAuthStorageDataByTokenResponse', () => {
        const makeStorage = () => new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>();

        it('stores idToken when id_token is present on the response', () => {
            const storage = makeStorage();
            const tokenResponse = buildMockTokenResponse();

            updateAuthStorageDataByTokenResponse(storage, tokenResponse, mockConfig);

            expect(storage.get('idToken')).toBe('id-token-123');
        });

        it('does not store idToken when token response omits id_token', () => {
            const storage = makeStorage();
            const tokenResponse = { ...buildMockTokenResponse(), id_token: undefined as unknown as string };

            updateAuthStorageDataByTokenResponse(storage, tokenResponse, mockConfig);

            expect(storage.has('idToken')).toBe(false);
        });

        it('stores idpRefreshToken when idp_refresh_token is present on the response', () => {
            const storage = makeStorage();
            const tokenResponse = buildMockTokenResponse();

            updateAuthStorageDataByTokenResponse(storage, tokenResponse, mockConfig);

            expect(storage.get('idpRefreshToken')).toBe('idp-refresh-token-789');
        });

        it('does not store idpRefreshToken when token response omits idp_refresh_token', () => {
            const storage = makeStorage();
            const tokenResponse = { ...buildMockTokenResponse(), idp_refresh_token: undefined };

            updateAuthStorageDataByTokenResponse(storage, tokenResponse, mockConfig);

            expect(storage.has('idpRefreshToken')).toBe(false);
        });
    });

    describe('hasUsableShopperSession', () => {
        const inFuture = Date.now() + 60_000;
        const inPast = Date.now() - 60_000;

        it('returns true for a guest with a valid token and customerId', () => {
            const session: SessionData = {
                userType: 'guest',
                customerId: 'guest-1',
                accessToken: 'tok',
                accessTokenExpiry: inFuture,
            };

            expect(hasUsableShopperSession(session)).toBe(true);
        });

        it('returns true for a registered shopper with a valid token and customerId', () => {
            const session: SessionData = {
                userType: 'registered',
                customerId: 'cust-1',
                accessToken: 'tok',
                accessTokenExpiry: inFuture,
            };

            expect(hasUsableShopperSession(session)).toBe(true);
        });

        it('returns false when customerId is missing', () => {
            const session: SessionData = {
                userType: 'registered',
                accessToken: 'tok',
                accessTokenExpiry: inFuture,
            };

            expect(hasUsableShopperSession(session)).toBe(false);
        });

        it('returns false when accessToken is missing', () => {
            const session: SessionData = {
                userType: 'registered',
                customerId: 'cust-1',
                accessTokenExpiry: inFuture,
            };

            expect(hasUsableShopperSession(session)).toBe(false);
        });

        it('returns false when accessTokenExpiry is in the past', () => {
            const session: SessionData = {
                userType: 'registered',
                customerId: 'cust-1',
                accessToken: 'tok',
                accessTokenExpiry: inPast,
            };

            expect(hasUsableShopperSession(session)).toBe(false);
        });

        it('returns false when accessTokenExpiry is undefined', () => {
            const session: SessionData = {
                userType: 'guest',
                customerId: 'guest-1',
                accessToken: 'tok',
            };

            expect(hasUsableShopperSession(session)).toBe(false);
        });
    });
});
