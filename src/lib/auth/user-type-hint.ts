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
import type { PublicSessionData } from '@/lib/api/types';
import { parseCookie } from '@/lib/cookie';

// Shared between the hints middleware (server) and AuthProvider (client). Kept in a neutral module
// (no .server suffix, no server-only imports) to avoid a server → client import cycle — the same
// arrangement as the basket cookie helper (`@/lib/basket/cookie`).
//
// This cookie carries the guest/registered flag ONLY. It is JS-readable (httpOnly:false) so the
// client can restore the header auth state and wishlist-icon path after a shared, non-personalized
// app-shell HTML document is served from cache (where the loader-baked `userType` is frozen). It
// NEVER carries a token, `usid`, `customerId`, or `encUserId` — see the App Shell Caching LLD §8.
export const USERTYPE_COOKIE_NAME = '__sfdc_usertype';

// The only values the writer ever emits. A JS-readable cookie is user-editable, so a tampered value
// (anything other than these two) must be rejected on read and never reach an auth branch.
export type UserType = NonNullable<PublicSessionData['userType']>;

const VALID_USER_TYPES: readonly UserType[] = ['guest', 'registered'];

/**
 * Validates that an arbitrary value is a well-formed `userType` hint.
 *
 * Returns the value as a {@link UserType} when it is exactly `'guest'` or `'registered'`; returns
 * `null` for everything else (wrong type, empty string, tampered value, etc.). Mirrors
 * `validateBasketSnapshot` — the single choke point both the server writer and the client reader run
 * untrusted input through, so a malformed or tampered cookie can never surface in the UI or flip a
 * branch regardless of which code path read it.
 */
export function validateUserType(value: unknown): UserType | null {
    return typeof value === 'string' && (VALID_USER_TYPES as readonly string[]).includes(value)
        ? (value as UserType)
        : null;
}

/**
 * On-the-wire cookie name for the current site.
 *
 * The hint is written through the template cookie helpers (`lib/cookie-utils.server.ts`), which
 * auto-namespace every non-excluded cookie as `${name}_${siteId}` (e.g. `__sfdc_usertype_RefArch`).
 * The client reader must rebuild the same name to find it; `AuthProvider` receives `siteId` as an
 * explicit prop (the raw `site.id`, not the alias) so it matches the name the middleware wrote.
 *
 * @param siteId - The resolved site id for the current request/render.
 */
export function getUserTypeCookieName(siteId: string): string {
    return `${USERTYPE_COOKIE_NAME}_${siteId}`;
}

/**
 * Extracts the validated `userType` hint from a raw `Cookie` header string.
 *
 * Reads through the shared {@link parseCookie} helper — the same base64(JSON) decode used by the
 * currency and basket companion cookies — then narrows the decoded value through
 * {@link validateUserType}. Returns `null` when the cookie is absent, undecodable, or tampered. This
 * is deliberately the same shape as `parseCurrencyCookie`: the hint is just another cached-shell
 * companion cookie, so it uses the common reader rather than a bespoke one.
 *
 * @param cookieHeader - `document.cookie` on the client, or the request `Cookie` header on the server.
 * @param siteId - The resolved site id used to build the namespaced cookie name.
 */
export function parseUserTypeCookie(cookieHeader: string, siteId: string): UserType | null {
    if (!cookieHeader || !siteId) {
        return null;
    }
    return validateUserType(parseCookie(cookieHeader, getUserTypeCookieName(siteId)));
}
