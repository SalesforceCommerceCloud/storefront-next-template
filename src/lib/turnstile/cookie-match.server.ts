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

/**
 * Server-only helpers for matching the Turnstile session cookie (`cc-tv_*`) to an email.
 *
 * Answers only: "does THIS request's cookie HMAC-match THIS email?" — never whether
 * an email exists in the commerce system (anti-enumeration).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getTurnstileHmacKey } from '@/lib/turnstile/hmac.server';
import { parseAllCookies } from '@/lib/cookie-utils.server';

/** Normalize an email address for HMAC binding: trim whitespace and lowercase. */
export function normalizeTurnstileEmail(email: string): string {
    return email.trim().toLowerCase();
}

/**
 * Compute the HMAC-bound cookie value for a verified email + Cloudflare siteKey pair.
 * Returns null if the HMAC key cannot be derived (missing secret).
 */
export function computeTurnstileCookieValue(email: string, siteKey: string): string | null {
    try {
        const hmacKey = getTurnstileHmacKey(siteKey);
        if (!hmacKey) return null;
        return createHmac('sha256', hmacKey)
            .update(`${siteKey}:${normalizeTurnstileEmail(email)}`)
            .digest('hex');
    } catch {
        return null;
    }
}

/**
 * Check whether a cookie value matches the HMAC-bound value for the given email and siteKey.
 * Returns true only on an exact timing-safe match. Returns false on any mismatch.
 */
export function turnstileCookieMatchesEmail(cookieValue: string, email: string, siteKey: string): boolean {
    const expected = computeTurnstileCookieValue(email, siteKey);
    if (!expected) return false;
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(cookieValue, 'utf8');
    // timingSafeEqual requires equal-length Buffers; guard length mismatch to avoid throw.
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
}

export interface IsTurnstileSessionVerifiedForEmailOptions {
    request: Request;
    email: string;
    siteKey: string;
    /**
     * Fully-resolved cookie name including site namespacing
     * (e.g. `cc-tv_RefArch` from `getCookieNameWithSiteId`).
     */
    turnstileCookieName: string;
}

/**
 * Returns whether the request's `cc-tv_*` cookie HMAC-matches the given email + siteKey.
 *
 * Does not consult customer directories or SLAS — only cookie ↔ email match for this
 * request. Missing cookie, wrong email, wrong site key, or HMAC failure all return false.
 */
export function isTurnstileSessionVerifiedForEmail({
    request,
    email,
    siteKey,
    turnstileCookieName,
}: IsTurnstileSessionVerifiedForEmailOptions): boolean {
    if (!email || !siteKey || !turnstileCookieName) return false;

    const cookies = parseAllCookies(request.headers.get('cookie'));
    const cookieRawValue = cookies[turnstileCookieName];
    if (!cookieRawValue) return false;

    return turnstileCookieMatchesEmail(cookieRawValue, email, siteKey);
}
