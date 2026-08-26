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
import { createHmac } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    computeTurnstileCookieValue,
    isTurnstileSessionVerifiedForEmail,
    normalizeTurnstileEmail,
    turnstileCookieMatchesEmail,
} from './cookie-match.server';

const TEST_HMAC_KEY = Buffer.alloc(32, 0x42);
const SITE_KEY = '1x00000000000000000000AA';
const EMAIL = 'Shopper@Example.COM';

vi.mock('@/lib/turnstile/hmac.server', () => ({
    getTurnstileHmacKey: vi.fn(),
}));

function expectedCookie(email: string, siteKey = SITE_KEY): string {
    return createHmac('sha256', TEST_HMAC_KEY).update(`${siteKey}:${email.trim().toLowerCase()}`).digest('hex');
}

describe('cookie-match.server', () => {
    let mockGetTurnstileHmacKey: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        const hmac = await import('@/lib/turnstile/hmac.server');
        mockGetTurnstileHmacKey = vi.mocked(hmac.getTurnstileHmacKey);
        mockGetTurnstileHmacKey.mockReturnValue(TEST_HMAC_KEY);
    });

    describe('normalizeTurnstileEmail', () => {
        it('trims and lowercases', () => {
            expect(normalizeTurnstileEmail('  A@B.C  ')).toBe('a@b.c');
        });
    });

    describe('computeTurnstileCookieValue / turnstileCookieMatchesEmail', () => {
        it('returns true when cookie HMAC matches email + siteKey', () => {
            const value = computeTurnstileCookieValue(EMAIL, SITE_KEY);
            expect(value).toBe(expectedCookie(EMAIL));
            expect(value).not.toBeNull();
            if (value == null) return;
            expect(turnstileCookieMatchesEmail(value, EMAIL, SITE_KEY)).toBe(true);
            // Case / whitespace in the check email still matches
            expect(turnstileCookieMatchesEmail(value, '  shopper@example.com ', SITE_KEY)).toBe(true);
        });

        it('returns false for a different email (no enumeration beyond mismatch)', () => {
            const value = computeTurnstileCookieValue(EMAIL, SITE_KEY);
            expect(value).not.toBeNull();
            if (value == null) return;
            expect(turnstileCookieMatchesEmail(value, 'other@example.com', SITE_KEY)).toBe(false);
        });

        it('returns false for a different siteKey', () => {
            const value = computeTurnstileCookieValue(EMAIL, SITE_KEY);
            expect(value).not.toBeNull();
            if (value == null) return;
            expect(turnstileCookieMatchesEmail(value, EMAIL, '2x00000000000000000000AB')).toBe(false);
        });

        it('returns false for empty / wrong-length cookie values without throwing', () => {
            expect(turnstileCookieMatchesEmail('', EMAIL, SITE_KEY)).toBe(false);
            expect(turnstileCookieMatchesEmail('short', EMAIL, SITE_KEY)).toBe(false);
            expect(turnstileCookieMatchesEmail('1'.repeat(64), EMAIL, SITE_KEY)).toBe(false);
        });

        it('returns null / false when HMAC key cannot be derived', () => {
            mockGetTurnstileHmacKey.mockReturnValue(null);
            expect(computeTurnstileCookieValue(EMAIL, SITE_KEY)).toBeNull();
            expect(turnstileCookieMatchesEmail('a'.repeat(64), EMAIL, SITE_KEY)).toBe(false);
        });
    });

    describe('isTurnstileSessionVerifiedForEmail', () => {
        const cookieName = 'cc-tv_TestSite';

        it('returns true when namespaced cookie matches email', () => {
            const value = expectedCookie(EMAIL);
            const request = new Request('https://store.example.com/resource/turnstile-session', {
                headers: { cookie: `${cookieName}=${value}` },
            });
            expect(
                isTurnstileSessionVerifiedForEmail({
                    request,
                    email: EMAIL,
                    siteKey: SITE_KEY,
                    turnstileCookieName: cookieName,
                })
            ).toBe(true);
        });

        it('returns false when cookie is absent', () => {
            const request = new Request('https://store.example.com/resource/turnstile-session');
            expect(
                isTurnstileSessionVerifiedForEmail({
                    request,
                    email: EMAIL,
                    siteKey: SITE_KEY,
                    turnstileCookieName: cookieName,
                })
            ).toBe(false);
        });

        it('returns false when cookie is for a different email', () => {
            const value = expectedCookie(EMAIL);
            const request = new Request('https://store.example.com/resource/turnstile-session', {
                headers: { cookie: `${cookieName}=${value}` },
            });
            expect(
                isTurnstileSessionVerifiedForEmail({
                    request,
                    email: 'other@example.com',
                    siteKey: SITE_KEY,
                    turnstileCookieName: cookieName,
                })
            ).toBe(false);
        });

        it('returns false for a different site namespace (no cross-site leak)', () => {
            const value = expectedCookie(EMAIL);
            const request = new Request('https://store.example.com/resource/turnstile-session', {
                headers: { cookie: `cc-tv_OtherSite=${value}` },
            });
            expect(
                isTurnstileSessionVerifiedForEmail({
                    request,
                    email: EMAIL,
                    siteKey: SITE_KEY,
                    turnstileCookieName: cookieName,
                })
            ).toBe(false);
        });

        it('returns false for empty email / siteKey / cookie name without probing directories', () => {
            const value = expectedCookie(EMAIL);
            const request = new Request('https://store.example.com/resource/turnstile-session', {
                headers: { cookie: `${cookieName}=${value}` },
            });
            expect(
                isTurnstileSessionVerifiedForEmail({
                    request,
                    email: '',
                    siteKey: SITE_KEY,
                    turnstileCookieName: cookieName,
                })
            ).toBe(false);
            expect(
                isTurnstileSessionVerifiedForEmail({
                    request,
                    email: EMAIL,
                    siteKey: '',
                    turnstileCookieName: cookieName,
                })
            ).toBe(false);
            expect(
                isTurnstileSessionVerifiedForEmail({
                    request,
                    email: EMAIL,
                    siteKey: SITE_KEY,
                    turnstileCookieName: '',
                })
            ).toBe(false);
        });
    });
});
