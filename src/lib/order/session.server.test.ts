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
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { signOrderState, verifyOrderState, hashOrderNumber, type GuestOrderState } from './session.server';

describe('guest-order-lookup-order-state', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('hashOrderNumber', () => {
        test('produces deterministic base64url hash', () => {
            const orderNumber = '123456789';
            const hash1 = hashOrderNumber(orderNumber);
            const hash2 = hashOrderNumber(orderNumber);

            expect(hash1).toBe(hash2);
            expect(hash1).toBeTruthy();
            // base64url: no +, /, or = chars
            expect(hash1).not.toMatch(/[+/=]/);
        });

        test('produces different hashes for different order numbers', () => {
            const hash1 = hashOrderNumber('ORDER-001');
            const hash2 = hashOrderNumber('ORDER-002');
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('signOrderState + verifyOrderState roundtrip', () => {
        test('roundtrips successfully with GUEST_ORDER_LOOKUP_COOKIE_SECRET', () => {
            process.env.GUEST_ORDER_LOOKUP_COOKIE_SECRET = 'test-secret-32-chars-minimum!!';

            const payload: GuestOrderState = {
                siteId: 'RefArch',
                orderNumberHash: hashOrderNumber('ORDER-123'),
                issuedAt: Date.now(),
                verified: false,
                verifiedCode: null,
                attempts: 0,
            };

            const signed = signOrderState(payload);
            const verified = verifyOrderState(signed, 'RefArch', 3600);

            expect(verified).toEqual(payload);
        });

        test('roundtrips successfully with CLIENT_SECRET fallback', () => {
            process.env.CLIENT_SECRET = 'client-secret-fallback-value';

            const payload: GuestOrderState = {
                siteId: 'SiteGenesis',
                orderNumberHash: hashOrderNumber('ORDER-456'),
                issuedAt: Date.now(),
                verified: true,
                verifiedCode: '123456',
                attempts: 0,
            };

            const signed = signOrderState(payload);
            const verified = verifyOrderState(signed, 'SiteGenesis', 3600);

            expect(verified).toEqual(payload);
        });
    });

    describe('tamper detection', () => {
        beforeEach(() => {
            process.env.GUEST_ORDER_LOOKUP_COOKIE_SECRET = 'test-secret-32-chars-minimum!!';
        });

        test('detects payload tampering', () => {
            const payload: GuestOrderState = {
                siteId: 'RefArch',
                orderNumberHash: hashOrderNumber('ORDER-789'),
                issuedAt: Date.now(),
                verified: false,
                verifiedCode: null,
                attempts: 0,
            };

            const signed = signOrderState(payload);
            const [, signature] = signed.split('.');

            // Tamper: change siteId in payload
            const tamperedPayload = { ...payload, siteId: 'Malicious' };
            const tamperedBase64 = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
            const tamperedSigned = `${tamperedBase64}.${signature}`;

            const verified = verifyOrderState(tamperedSigned, 'RefArch', 3600);
            expect(verified).toBeNull();
        });

        test('detects signature tampering', () => {
            const payload: GuestOrderState = {
                siteId: 'RefArch',
                orderNumberHash: hashOrderNumber('ORDER-789'),
                issuedAt: Date.now(),
                verified: false,
                verifiedCode: null,
                attempts: 0,
            };

            const signed = signOrderState(payload);
            const [payloadBase64] = signed.split('.');

            // Tamper: replace signature with garbage
            const tamperedSigned = `${payloadBase64}.tampered-signature`;

            const verified = verifyOrderState(tamperedSigned, 'RefArch', 3600);
            expect(verified).toBeNull();
        });

        test('rejects malformed cookie value (no dot separator)', () => {
            const verified = verifyOrderState('no-dot-separator', 'RefArch', 3600);
            expect(verified).toBeNull();
        });

        test('rejects invalid base64url payload', () => {
            const signed = 'invalid!!!.dGVzdA'; // invalid base64url
            const verified = verifyOrderState(signed, 'RefArch', 3600);
            expect(verified).toBeNull();
        });

        test('rejects invalid JSON in payload', () => {
            const invalidJson = Buffer.from('not-json').toString('base64url');
            const signed = `${invalidJson}.dGVzdA`;
            const verified = verifyOrderState(signed, 'RefArch', 3600);
            expect(verified).toBeNull();
        });
    });

    describe('cross-siteId replay defense', () => {
        beforeEach(() => {
            process.env.GUEST_ORDER_LOOKUP_COOKIE_SECRET = 'test-secret-32-chars-minimum!!';
        });

        test('rejects when expectedSiteId differs from payload siteId', () => {
            const payload: GuestOrderState = {
                siteId: 'SiteA',
                orderNumberHash: hashOrderNumber('ORDER-001'),
                issuedAt: Date.now(),
                verified: false,
                verifiedCode: null,
                attempts: 0,
            };

            const signed = signOrderState(payload);

            // Try to verify for a different site
            const verified = verifyOrderState(signed, 'SiteB', 3600);
            expect(verified).toBeNull();
        });

        test('accepts when expectedSiteId matches payload siteId', () => {
            const payload: GuestOrderState = {
                siteId: 'SiteA',
                orderNumberHash: hashOrderNumber('ORDER-001'),
                issuedAt: Date.now(),
                verified: false,
                verifiedCode: null,
                attempts: 0,
            };

            const signed = signOrderState(payload);
            const verified = verifyOrderState(signed, 'SiteA', 3600);
            expect(verified).toEqual(payload);
        });
    });

    describe('TTL expiry', () => {
        beforeEach(() => {
            process.env.GUEST_ORDER_LOOKUP_COOKIE_SECRET = 'test-secret-32-chars-minimum!!';
        });

        test('rejects expired state', () => {
            const payload: GuestOrderState = {
                siteId: 'RefArch',
                orderNumberHash: hashOrderNumber('ORDER-EXPIRED'),
                issuedAt: Date.now() - 7200 * 1000, // 2 hours ago
                verified: false,
                verifiedCode: null,
                attempts: 0,
            };

            const signed = signOrderState(payload);

            // TTL is 1 hour (3600 seconds)
            const verified = verifyOrderState(signed, 'RefArch', 3600);
            expect(verified).toBeNull();
        });

        test('accepts non-expired state', () => {
            const payload: GuestOrderState = {
                siteId: 'RefArch',
                orderNumberHash: hashOrderNumber('ORDER-VALID'),
                issuedAt: Date.now() - 1800 * 1000, // 30 minutes ago
                verified: false,
                verifiedCode: null,
                attempts: 0,
            };

            const signed = signOrderState(payload);

            // TTL is 1 hour (3600 seconds)
            const verified = verifyOrderState(signed, 'RefArch', 3600);
            expect(verified).toEqual(payload);
        });

        test('accepts state at exact TTL boundary', () => {
            const ttlSeconds = 3600;
            const now = Date.now();
            const payload: GuestOrderState = {
                siteId: 'RefArch',
                orderNumberHash: hashOrderNumber('ORDER-BOUNDARY'),
                issuedAt: now - ttlSeconds * 1000,
                verified: false,
                verifiedCode: null,
                attempts: 0,
            };

            const signed = signOrderState(payload);

            // Freeze the clock at `now` so verification sees exactly ttlSeconds
            // elapsed, rather than whatever real time passed while signing.
            vi.useFakeTimers();
            vi.setSystemTime(now);
            const verified = verifyOrderState(signed, 'RefArch', ttlSeconds);
            vi.useRealTimers();

            // At exact boundary: should still be valid (<=, not <)
            expect(verified).toEqual(payload);
        });

        test('rejects state just past TTL boundary', () => {
            const ttlSeconds = 3600;
            const payload: GuestOrderState = {
                siteId: 'RefArch',
                orderNumberHash: hashOrderNumber('ORDER-PAST'),
                issuedAt: Date.now() - (ttlSeconds * 1000 + 1),
                verified: false,
                verifiedCode: null,
                attempts: 0,
            };

            const signed = signOrderState(payload);
            const verified = verifyOrderState(signed, 'RefArch', ttlSeconds);
            expect(verified).toBeNull();
        });
    });

    describe('missing environment variables', () => {
        test('throws when neither GUEST_ORDER_LOOKUP_COOKIE_SECRET nor CLIENT_SECRET is set', () => {
            delete process.env.GUEST_ORDER_LOOKUP_COOKIE_SECRET;
            delete process.env.CLIENT_SECRET;

            const payload: GuestOrderState = {
                siteId: 'RefArch',
                orderNumberHash: hashOrderNumber('ORDER-NO-SECRET'),
                issuedAt: Date.now(),
                verified: false,
                verifiedCode: null,
                attempts: 0,
            };

            expect(() => signOrderState(payload)).toThrow(
                'GUEST_ORDER_LOOKUP_COOKIE_SECRET or CLIENT_SECRET must be set'
            );
        });

        test('returns null during verify when secret is missing', () => {
            // Sign with secret present
            process.env.GUEST_ORDER_LOOKUP_COOKIE_SECRET = 'test-secret-32-chars-minimum!!';
            const payload: GuestOrderState = {
                siteId: 'RefArch',
                orderNumberHash: hashOrderNumber('ORDER-123'),
                issuedAt: Date.now(),
                verified: false,
                verifiedCode: null,
                attempts: 0,
            };
            const signed = signOrderState(payload);

            // Verify with secret absent
            delete process.env.GUEST_ORDER_LOOKUP_COOKIE_SECRET;
            delete process.env.CLIENT_SECRET;

            const verified = verifyOrderState(signed, 'RefArch', 3600);
            expect(verified).toBeNull();
        });
    });

    describe('CLIENT_SECRET fallback', () => {
        test('uses CLIENT_SECRET when GUEST_ORDER_LOOKUP_COOKIE_SECRET is unset', () => {
            delete process.env.GUEST_ORDER_LOOKUP_COOKIE_SECRET;
            process.env.CLIENT_SECRET = 'fallback-client-secret-value';

            const payload: GuestOrderState = {
                siteId: 'RefArch',
                orderNumberHash: hashOrderNumber('ORDER-FALLBACK'),
                issuedAt: Date.now(),
                verified: false,
                verifiedCode: null,
                attempts: 0,
            };

            const signed = signOrderState(payload);
            const verified = verifyOrderState(signed, 'RefArch', 3600);

            expect(verified).toEqual(payload);
        });

        test('prefers GUEST_ORDER_LOOKUP_COOKIE_SECRET over CLIENT_SECRET', () => {
            process.env.GUEST_ORDER_LOOKUP_COOKIE_SECRET = 'primary-secret';
            process.env.CLIENT_SECRET = 'fallback-secret';

            const payload: GuestOrderState = {
                siteId: 'RefArch',
                orderNumberHash: hashOrderNumber('ORDER-PREFER'),
                issuedAt: Date.now(),
                verified: false,
                verifiedCode: null,
                attempts: 0,
            };

            const signed = signOrderState(payload);

            // Verify with primary secret should succeed
            const verified1 = verifyOrderState(signed, 'RefArch', 3600);
            expect(verified1).toEqual(payload);

            // Now switch to fallback secret only — should fail
            delete process.env.GUEST_ORDER_LOOKUP_COOKIE_SECRET;
            const verified2 = verifyOrderState(signed, 'RefArch', 3600);
            expect(verified2).toBeNull();
        });
    });
});
