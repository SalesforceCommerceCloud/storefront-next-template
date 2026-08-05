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
 * Guest Order Lookup per-order state cookie signing and verification.
 *
 * Uses HMAC-SHA-256 to sign the whole per-order state payload (siteId, order number hash,
 * verification status, the verified OTP, and the failed-attempt counter) so a single cookie
 * can carry everything the guest order lookup flow needs to know about one order, without the
 * server persisting anything.
 *
 * The signing/verification functions here are generic over the cookie value — callers store the
 * signed state under a per-order cookie name (`glo_order_<orderHash>`, see
 * action.order-lookup-request-code.ts, action.order-lookup-verify.ts, and
 * action.order-lookup-results-fetch.ts) so looking up multiple orders in the same browser
 * session keeps each order's state independently valid. The payload's `orderNumberHash` field
 * still exists as defense-in-depth (checked alongside the cookie name at each call site) — even
 * though the cookie name already enforces scoping, it guards against a signed state value being
 * copied to the wrong per-order cookie name.
 *
 * Environment variables:
 * - `GUEST_ORDER_LOOKUP_COOKIE_SECRET` (optional) — Signing key for the order-state cookie.
 *   If unset, falls back to CLIENT_SECRET.
 * - `CLIENT_SECRET` (required if GUEST_ORDER_LOOKUP_COOKIE_SECRET is unset) — SCAPI client
 *   secret, also used as the signing key fallback.
 *
 * Wire format: `<base64url(json-payload)>.<base64url(hmac-sha256-of-payload)>`
 */

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

export type GuestOrderState = {
    siteId: string;
    orderNumberHash: string; // sha256(orderNumber), base64url — never plaintext
    issuedAt: number; // unix ms — when the cookie was created/refreshed (code requested or verified)
    verified: boolean; // true once access-code verify succeeds
    verifiedCode: string | null; // the raw access code, only set once verified === true
    attempts: number; // failed access-code verification attempts
};

/**
 * How long a guest order lookup access code stays valid — enforced by SCAPI itself
 * (`requestOrderAccessCode`/`guestOrderLookup`), not configurable via any request parameter.
 * Callers use this to size the signed order-state cookie's `maxAge` and expiry check to match.
 */
export const ACCESS_CODE_TTL_SECONDS = 15 * 60;

/**
 * Thrown by {@link signOrderState} when no signing secret is configured. Callers should catch
 * this specifically and return a diagnosable config error — the underlying cause (a missing
 * env var) is otherwise indistinguishable from a generic action failure.
 */
export class GuestOrderLookupSigningSecretMissingError extends Error {
    constructor() {
        super('GUEST_ORDER_LOOKUP_COOKIE_SECRET or CLIENT_SECRET must be set');
        this.name = 'GuestOrderLookupSigningSecretMissingError';
    }
}

/**
 * Returns the signing secret for guest order lookup state cookies.
 * Falls back to CLIENT_SECRET if GUEST_ORDER_LOOKUP_COOKIE_SECRET is unset.
 *
 * @throws {GuestOrderLookupSigningSecretMissingError} if neither GUEST_ORDER_LOOKUP_COOKIE_SECRET
 *   nor CLIENT_SECRET is set
 */
function getSecret(): string {
    const secret = process.env.GUEST_ORDER_LOOKUP_COOKIE_SECRET || process.env.CLIENT_SECRET;
    if (!secret) {
        throw new GuestOrderLookupSigningSecretMissingError();
    }
    return secret;
}

/**
 * Computes HMAC-SHA-256 of the payload using the signing secret.
 */
function sign(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * Hashes an order number with SHA-256 and returns base64url encoding.
 * Used to avoid storing plaintext order numbers in the order-state cookie.
 *
 * @param orderNumber - The order number to hash
 * @returns Base64url-encoded SHA-256 hash
 */
export function hashOrderNumber(orderNumber: string): string {
    return createHash('sha256').update(orderNumber).digest('base64url');
}

/**
 * Signs a guest order state payload and returns the signed cookie value.
 *
 * Wire format: `<base64url(json-payload)>.<base64url(hmac-sha256-of-payload)>`
 *
 * @param payload - The order state to sign
 * @returns Signed cookie value
 * @throws {Error} if signing secret is not configured
 */
export function signOrderState(payload: GuestOrderState): string {
    const secret = getSecret();
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = sign(payloadBase64, secret);
    return `${payloadBase64}.${signature}`;
}

/**
 * Verifies a signed guest order state cookie and returns the payload if valid.
 *
 * Rejects when:
 * - Signature mismatch (constant-time compare)
 * - `expectedSiteId !== payload.siteId` (cross-siteId replay defense)
 * - `Date.now() - payload.issuedAt > ttlSeconds * 1000` (expiry)
 *
 * @param cookieValue - The signed cookie value from the request
 * @param expectedSiteId - The siteId for which the order state must be valid (replay defense)
 * @param ttlSeconds - Maximum age in seconds
 * @returns The verified payload, or null if verification fails
 */
export function verifyOrderState(
    cookieValue: string,
    expectedSiteId: string,
    ttlSeconds: number
): GuestOrderState | null {
    const dotIndex = cookieValue.lastIndexOf('.');
    if (dotIndex === -1) return null;

    const payloadBase64 = cookieValue.slice(0, dotIndex);
    const signature = cookieValue.slice(dotIndex + 1);

    let secret: string;
    try {
        secret = getSecret();
    } catch {
        return null;
    }

    const expectedSignature = sign(payloadBase64, secret);
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);

    // Constant-time comparison to prevent timing attacks
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        return null;
    }

    let payload: GuestOrderState;
    try {
        payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf-8'));
    } catch {
        return null;
    }

    // Cross-siteId replay defense
    if (payload.siteId !== expectedSiteId) {
        return null;
    }

    // TTL expiry check
    if (Date.now() - payload.issuedAt > ttlSeconds * 1000) {
        return null;
    }

    return payload;
}
