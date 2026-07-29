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
import { createContext, type RouterContextProvider } from 'react-router';
import { AuthTokenInvalidError, type ShopperLogin } from '@/scapi';
import type { SessionData as AuthData, PublicSessionData } from '@/lib/api/types';
import {
    clearStorage,
    type StorageErrorData,
    type StorageMetaData,
    unpackStorage,
    updateStorageObject,
} from '@/lib/storage-map';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import type { AppConfig } from '@/types/config';
import { TrackingConsent, booleanToTrackingConsent } from '@/types/tracking-consent';

// Maximum allowed refresh token expiry times (in seconds) per Salesforce Commerce Cloud limits
export const MAX_GUEST_REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days
export const MAX_REGISTERED_REFRESH_TOKEN_EXPIRY = 90 * 24 * 60 * 60; // 90 days

// Cookie names for split auth storage
// These are used on both server and client for auth token management
export const COOKIE_REFRESH_TOKEN_GUEST = 'cc-nx-g'; // Guest user refresh token
export const COOKIE_REFRESH_TOKEN_REGISTERED = 'cc-nx'; // Registered user refresh token
export const COOKIE_ACCESS_TOKEN = 'cc-at'; // Access token
export const COOKIE_USID = 'usid'; // User session ID
export const COOKIE_CUSTOMER_ID = 'customer_id'; // Legacy customer ID — only used for destroy-path cookie deletion
export const COOKIE_ENC_USER_ID = 'enc_user_id'; // Encoded user ID
export const COOKIE_IDP_ACCESS_TOKEN = 'idp_access_token'; // IDP access token (for social login)
// SFNext intentionally diverges from PWA Kit (which sets id_token without HttpOnly) —
// SFNext's convention is HttpOnly for everything except cc-cv.
export const COOKIE_ID_TOKEN = 'id_token'; // OIDC id_token (HttpOnly; expires with access token)
export const COOKIE_IDP_REFRESH_TOKEN = 'idp_refresh_token'; // IDP refresh token (HttpOnly; expires with refresh token)
export const COOKIE_CODE_VERIFIER = 'cc-cv'; // OAuth2 PKCE code verifier (server-only, short-lived)
export const COOKIE_TRACKING_CONSENT = 'dw_dnt'; // Tracking consent preference (cookie value matches TrackingConsent enum)
export const COOKIE_DWSID = 'dwsid'; // Hybrid storefront session ID (for session bridge)
export const COOKIE_AUTH_RECOVERY_GUARD = 'cc-auth-recover'; // Auth recovery loop guard
export const AUTH_TOKEN_INVALID_ERROR = 'AUTH_TOKEN_INVALID';

/**
 * Check if tracking consent feature is enabled in the app configuration.
 * Server-only — reads `engagement.analytics.trackingConsent.enabled` from the
 * router-context-resolved config. The client equivalent is the
 * `useTrackingConsent` hook, which exposes the same flag against `useConfig()`.
 *
 * @param context - Router context from a server loader, action, or middleware.
 * @returns true if tracking consent is enabled, false otherwise
 *
 * @example
 * if (isTrackingConsentEnabled(context)) {
 *   // Handle tracking consent logic
 * }
 */
export function isTrackingConsentEnabled(context: Readonly<RouterContextProvider>): boolean {
    const appConfig = getConfig(context);
    return appConfig.engagement?.analytics?.trackingConsent?.enabled ?? false;
}

/**
 * Extract public (non-sensitive) session data from full session data.
 *
 * This is the SINGLE AUDITED PLACE where the public auth shape is defined.
 * All code that needs to expose session data to the client should use this function
 * to ensure only non-sensitive fields are included.
 *
 * @param session - Full session data from server auth context
 * @returns PublicSessionData containing only non-sensitive fields safe for client exposure
 */
export function getPublicSessionData(session: AuthData): PublicSessionData {
    return {
        userType: session.userType,
        customerId: session.customerId,
        usid: session.usid,
        encUserId: session.encUserId,
        trackingConsent: session.trackingConsent,
    };
}

/**
 * Whether the session can authorize SCAPI shopper-customer reads against the customer's
 * own resources. True for any session (guest or registered) that has a non-empty
 * `customerId` and a still-valid access token. False for sessions missing a token or
 * customerId, or whose token has expired.
 *
 * Use this anywhere a server-side caller needs to decide between "call SCAPI on behalf
 * of this shopper" and "skip the call and return an empty payload". Replaces the older
 * `userType === 'registered'` check, which excluded guests from endpoints that SCAPI
 * itself accepts guest tokens for (product-lists, baskets, etc.).
 */
export function hasUsableShopperSession(
    session: AuthData
): session is AuthData & { customerId: string; accessToken: string; accessTokenExpiry: number } {
    return Boolean(
        session.customerId &&
            session.accessToken &&
            typeof session.accessTokenExpiry === 'number' &&
            session.accessTokenExpiry > Date.now()
    );
}

/**
 * Get refresh token expiry configuration for a specific user type.
 * Returns the final expiry time in seconds, either from environment variables or API response fallback.
 * If userType is not provided, returns the API response value.
 * Validates that overrides don't exceed Commerce Cloud maximum limits:
 * - Guest tokens: 30 days maximum
 * - Registered tokens: 90 days maximum
 *
 * @param apiResponseExpirySeconds - Refresh token expiry in seconds from the Commerce Cloud API response
 * @param userType - Optional user type ('guest' or 'registered') to determine which environment override to use
 * @param appConfig - Optional app config containing refresh token expiry overrides (server-side only)
 * @returns Final refresh token expiry time in seconds
 *
 * @example
 * // No userType provided - uses API response value
 * const expiry = getRefreshTokenExpiry(7776000);
 * // Result: 7776000 (90 days from API)
 *
 * @example
 * // Guest user with no environment override - uses API response
 * const expiry = getRefreshTokenExpiry(7776000, 'guest', appConfig);
 * // Result: 7776000 (from API, no PUBLIC_COMMERCE_API_GUEST_REFRESH_TOKEN_EXPIRY_SECONDS set)
 *
 * @example
 * // Registered user with environment override
 * // PUBLIC_COMMERCE_API_REGISTERED_REFRESH_TOKEN_EXPIRY_SECONDS=2592000
 * const expiry = getRefreshTokenExpiry(7776000, 'registered', appConfig);
 * // Result: 2592000 (30 days from environment override, ignoring API's 90 days)
 *
 * @example
 * // Override exceeding maximum is capped to maximum
 * // PUBLIC_COMMERCE_API_GUEST_REFRESH_TOKEN_EXPIRY_SECONDS=5184000 (60 days)
 * const expiry = getRefreshTokenExpiry(7776000, 'guest', appConfig);
 * // Result: 2592000 (capped to 30 days maximum for guest tokens)
 */
export const getRefreshTokenExpiry = (
    apiResponseExpirySeconds: number,
    userType?: 'guest' | 'registered',
    appConfig?: AppConfig
): number => {
    // If no userType provided, use API response
    if (!userType) {
        return apiResponseExpirySeconds;
    }

    const maxExpiry = userType === 'registered' ? MAX_REGISTERED_REFRESH_TOKEN_EXPIRY : MAX_GUEST_REFRESH_TOKEN_EXPIRY;

    const refreshTokenExpiryOverride = appConfig
        ? userType === 'registered'
            ? appConfig.commerce.api.registeredRefreshTokenExpirySeconds
            : appConfig.commerce.api.guestRefreshTokenExpirySeconds
        : undefined;

    // If config override is set, use it but cap at maximum allowed
    if (refreshTokenExpiryOverride !== undefined) {
        return Math.min(refreshTokenExpiryOverride, maxExpiry);
    }

    // Otherwise, use API response but cap at maximum allowed
    return Math.min(apiResponseExpirySeconds, maxExpiry);
};

export type AuthStorageData = AuthData & StorageMetaData & StorageErrorData;
export const authContext = createContext<{ ref: Promise<AuthData | undefined> }>();
export const authStorageContext = createContext<Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>>();

/**
 * Shared utility to write Commerce API auth information from a given token response into the given storage container.
 *
 * The access-token JWT is the single source of truth for `userType`, `customerId`, `usid`, and
 * `accessTokenExpiry`. All four fields are derived from the same JWT decode so they always travel
 * together — there is no path where one drifts from the other.
 *
 * If the response contains a structurally invalid JWT (missing `isb`/`sub` claims, undecodable),
 * an `AuthTokenInvalidError` is thrown so the caller can route through the recovery flow.
 */
export const updateAuthStorageDataByTokenResponse = (
    storage: Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>,
    tokenResponse: ShopperLogin.schemas['TokenResponse'],
    appConfig?: AppConfig,
    dwsid?: string
): void => {
    const now = Date.now();

    // Transform SLAS API response (snake_case) to internal storage (camelCase)
    storage.set('accessToken', tokenResponse?.access_token);
    storage.set('refreshToken', tokenResponse?.refresh_token);

    // Decode access token once for expiry, userType, customerId, and usid extraction.
    // SLAS always returns a structurally valid JWT — if we can't decode one, treat it as a
    // critical token-integrity failure rather than falling back to top-level fields, which
    // would leave session state inconsistent with the (broken) token.
    if (!tokenResponse?.access_token) {
        throw new AuthTokenInvalidError('SLAS token response is missing the access_token');
    }
    const claims = getSLASAccessTokenClaims(tokenResponse.access_token);
    if (claims.expiry === null) {
        throw new AuthTokenInvalidError('SLAS access token could not be decoded');
    }

    // Derive userType from the JWT (single source of truth). All other fields use the same decode.
    const userType: 'guest' | 'registered' = deriveUserTypeFromClaims(claims);
    storage.set('userType', userType);

    // Get expiry from JWT token itself (source of truth) rather than calculating from expires_in
    storage.set('accessTokenExpiry', claims.expiry);

    // Get final refresh token expiry, capped against the per-userType maximum
    const apiResponseExpirySeconds = Number(tokenResponse.refresh_token_expires_in);
    const refreshTokenExpirySeconds = getRefreshTokenExpiry(apiResponseExpirySeconds, userType, appConfig);
    storage.set('refreshTokenExpiry', now + refreshTokenExpirySeconds * 1_000);

    // Extract customer ID from access token isb claim (source of truth). SLAS guarantees
    // gcid/rcid in the isb claim — if the JWT was decodable but lacks them, the token is
    // structurally broken; throw rather than silently fall back to stale state.
    const customerId = getCustomerIdFromClaims(claims);
    if (!customerId) {
        throw new AuthTokenInvalidError('SLAS access token isb claim is missing the customer ID (gcid/rcid)');
    }
    storage.set('customerId', customerId);

    // Store customer encoded user id if available (for registered users)
    if (tokenResponse?.enc_user_id) {
        storage.set('encUserId', tokenResponse.enc_user_id);
    }

    // Extract usid from access token sub claim (source of truth). Missing usid is a
    // critical token-integrity failure — throw.
    if (!claims.usid) {
        throw new AuthTokenInvalidError('SLAS access token sub claim is missing the usid segment');
    }
    storage.set('usid', claims.usid);

    // Store IDP access token if available (for social login)
    // IDP token doesn't come with its own expiry, so we use the SLAS access token expiry as a reasonable proxy
    // If the SLAS session expires, the IDP token becomes less useful anyway
    if (tokenResponse?.idp_access_token) {
        storage.set('idpAccessToken', tokenResponse.idp_access_token);
        // Use same expiry as SLAS access token for IDP access token
        const idpAccessTokenExpiryValue = storage.get('accessTokenExpiry');
        if (idpAccessTokenExpiryValue && typeof idpAccessTokenExpiryValue === 'number') {
            storage.set('idpAccessTokenExpiry', idpAccessTokenExpiryValue);
        }
    }

    // Store id_token if available (OIDC ID token). Cookie expiry is reused from
    // accessTokenExpiry at write time — matches PWA Kit's process-token-response.js
    // where id_token tracks the access-token JWT exp.
    if (tokenResponse?.id_token) {
        storage.set('idToken', tokenResponse.id_token);
    }

    // Store idp_refresh_token if available (IDP refresh token, social login). Cookie
    // expiry is reused from refreshTokenExpiry at write time — matches PWA Kit, where
    // idp_refresh_token shares the SLAS refresh-token TTL.
    if (tokenResponse?.idp_refresh_token) {
        storage.set('idpRefreshToken', tokenResponse.idp_refresh_token);
    }

    // Store dwsid if available (from Set-Cookie response header, for hybrid storefronts)
    if (dwsid) {
        storage.set('dwsid', dwsid);
    }
};

/**
 * Shared utility to update the internal auth storage.
 */
export const updateAuthStorageData = (
    storage: Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>,
    updater:
        | (ShopperLogin.schemas['TokenResponse'] & { dwsid?: string })
        | ((data: AuthData & StorageErrorData) => AuthData & StorageErrorData),
    appConfig?: AppConfig
) => {
    // Extract/store current storage data
    const publicData = unpackStorage(storage);

    // Preserve tracking consent from cookie (source of truth) before clearing storage
    // Tracking consent cookie must be preserved across token updates to maintain user preference
    const existingTrackingConsent = storage.get('trackingConsent');

    // Unset storage data
    clearStorage(storage, false);

    if (typeof updater === 'function') {
        // Retrieve updated data
        const updated = updater(publicData);

        // Update storage data using an updater method
        if (typeof updated === 'object' && updated !== null) {
            updateStorageObject(storage, updated);
        }
    } else {
        // Update storage data using a `TokenResponse` (may include dwsid from response headers).
        // userType is derived from the JWT inside updateAuthStorageDataByTokenResponse — callers
        // never need to pass it.
        const { dwsid, ...tokenResponse } = updater;
        updateAuthStorageDataByTokenResponse(storage, tokenResponse, appConfig, dwsid);
    }

    // Restore tracking consent from cookie if it existed (cookie is source of truth, not token)
    // This ensures tracking consent cookie persists across token refreshes and login flows
    if (existingTrackingConsent === TrackingConsent.Accepted || existingTrackingConsent === TrackingConsent.Declined) {
        storage.set('trackingConsent', existingTrackingConsent);
    }

    // Mark storage as updated
    storage.set('isUpdated', true);
};

/**
 * Shared helper to update storage and cache with a token response.
 *
 * userType is derived from the JWT by `updateAuthStorageDataByTokenResponse`, so callers
 * never have to thread it through. Used by both the middleware refresh/guest-login path
 * and any other server flow that ingests a SLAS token response.
 */
export const updateStorageAndCache = async (
    context: Readonly<RouterContextProvider>,
    storage: Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>,
    cache: { ref: AuthData | undefined },
    tokenResponse: ShopperLogin.schemas['TokenResponse'] & { dwsid?: string }
): Promise<void> => {
    const promiseCache = context.get(authContext);
    const appConfig = getConfig(context);
    promiseCache.ref = Promise.resolve(tokenResponse).then((response) => {
        const { dwsid, ...tokenData } = response;
        updateAuthStorageDataByTokenResponse(storage, tokenData, appConfig, dwsid);
        cache.ref = unpackStorage<AuthData>(storage);
        storage.set('isUpdated', true);
        return cache.ref;
    });

    await promiseCache.ref;
};

/**
 * Shared utility to make sure that in case the current auth promise reference gets updated while running, the latest
 * promise reference is always resolved/returned.
 *
 * If `authContext` has not been set on the provider (i.e. createAuthPromise was called
 * outside the auth middleware), the supersedence check is skipped and the resolved data
 * is returned directly. This is a test-harness affordance — production code paths must
 * always run inside the middleware, so reaching this branch outside tests indicates a bug.
 * In dev, a warning is logged so the path can't be silently hit.
 */
export const createAuthPromise = (
    context: Readonly<RouterContextProvider>,
    data: AuthData | undefined
): Promise<AuthData | undefined> => {
    const promise = Promise.resolve(data).then(
        (result: AuthData | undefined): AuthData | undefined | Promise<AuthData | undefined> => {
            const promiseRef = context.get(authContext);
            if (promiseRef === undefined) {
                if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
                    // oxlint-disable-next-line no-console
                    console.warn(
                        'createAuthPromise: authContext is not set on the provider. ' +
                            'This is expected in test harnesses; in production code it indicates createAuthPromise ' +
                            'was called outside the auth middleware.'
                    );
                }
                return result;
            }
            if (promise !== promiseRef.ref) {
                return promiseRef.ref;
            }
            return result;
        }
    );
    return promise;
};

/**
 * Decoded payload from SLAS access token
 */
export interface SLASAccessTokenPayload {
    /** Expiration time (Unix timestamp in seconds) */
    exp: number;
    /** Issued at time (Unix timestamp in seconds) */
    iat?: number;
    /** Issuer */
    iss?: string;
    /** Subject (user ID) */
    sub?: string;
    /** Custom claims */
    [key: string]: unknown;
}

/**
 * Decode a SLAS access token payload without verifying the signature
 *
 * SECURITY NOTE: This only decodes the payload, it does NOT verify the signature.
 * Only use this for reading non-sensitive claims like expiry time from SLAS access tokens.
 * Never use decoded data for authorization decisions without proper verification.
 *
 * For external JWT tokens (passwordless login, reset password), use `jose.decodeJwt` with verification.
 *
 * @param token - SLAS access token string
 * @returns Decoded SLAS access token payload
 * @throws Error if token is invalid or cannot be decoded
 */
export function decodeSLASAccessToken(token: string): SLASAccessTokenPayload {
    if (!token || typeof token !== 'string') {
        throw new Error('Invalid token: must be a non-empty string');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid JWT: must have 3 parts (header.payload.signature)');
    }

    try {
        // Decode the payload (second part)
        const payload = parts[1];
        if (!payload) {
            throw new Error('Invalid JWT: missing payload');
        }

        // JWT uses base64url encoding, need to convert to standard base64
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');

        // Decode based on environment
        const decoded =
            typeof window === 'undefined'
                ? Buffer.from(base64, 'base64').toString('utf-8') // Node.js
                : atob(base64); // Browser

        return JSON.parse(decoded) as SLASAccessTokenPayload;
    } catch (error) {
        throw new Error(`Failed to decode JWT: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Extracted claims from a SLAS access token payload
 */
export interface SLASAccessTokenClaims {
    /** Expiry timestamp in milliseconds, or null if token has no exp claim */
    expiry: number | null;
    /** Tracking consent value as TrackingConsent enum, or null if token has no dnt claim */
    trackingConsent: TrackingConsent | null;
    /** Guest customer ID extracted from the isb claim, or null if not present */
    gcid: string | null;
    /** Registered customer ID extracted from the isb claim, or null if not present */
    rcid: string | null;
    /** User session ID extracted from the sub claim, or null if not present */
    usid: string | null;
}

/**
 * Parse the `isb` (identity subject) claim from a SLAS access token payload.
 * The isb claim is a `::` delimited string of key:value pairs containing customer identity info.
 *
 * Guest format:    `uido:slas::upn:Guest::uidn:Guest User::gcid:<id>::chid:<channel>`
 * Registered format: `uido:ecom::upn:<email>::uidn:<name>::gcid:<id>::rcid:<id>::chid:<channel>`
 *
 * @param isb - Raw isb claim string from the token payload
 * @returns Object with gcid, rcid, and upn values, or null for each if not found
 */
function parseIsbClaim(isb: unknown): { gcid: string | null; rcid: string | null; upn: string | null } {
    if (typeof isb !== 'string' || !isb) {
        return { gcid: null, rcid: null, upn: null };
    }

    let gcid: string | null = null;
    let rcid: string | null = null;
    let upn: string | null = null;

    const parts = isb.split('::');
    for (const part of parts) {
        if (part.startsWith('gcid:')) {
            gcid = part.slice(5);
        } else if (part.startsWith('rcid:')) {
            rcid = part.slice(5);
        } else if (part.startsWith('upn:')) {
            upn = part.slice(4);
        }
    }

    return { gcid, rcid, upn };
}

/**
 * Parse the `sub` claim from a SLAS access token payload to extract the `usid` segment.
 * The sub claim is a `::` delimited string of key:value pairs.
 *
 * Example: `cc-slas::zzrf_001::scid:<id>::usid:<id>`
 *
 * SLAS emits at most one `usid:` segment per token, so the first match is returned.
 *
 * @param sub - Raw sub claim string from the token payload
 * @returns Object with usid value, or null if not found
 */
function parseSubClaim(sub: unknown): { usid: string | null } {
    if (typeof sub !== 'string' || !sub) {
        return { usid: null };
    }

    const parts = sub.split('::');
    for (const part of parts) {
        if (part.startsWith('usid:')) {
            return { usid: part.slice(5) };
        }
    }

    return { usid: null };
}

/**
 * Extract claims from a SLAS access token payload.
 * Decodes the token once and returns multiple claims for efficiency.
 *
 * @param token - SLAS access token string
 * @returns Object containing extracted claims (expiry, trackingConsent, gcid, rcid, usid)
 */
export function getSLASAccessTokenClaims(token: string): SLASAccessTokenClaims {
    try {
        const payload: SLASAccessTokenPayload = decodeSLASAccessToken(token);
        const expiry = payload.exp !== undefined ? payload.exp * 1000 : null;

        let trackingConsent: TrackingConsent | null = null;
        const dntValue = payload.dnt;
        if (typeof dntValue === 'boolean') {
            trackingConsent = booleanToTrackingConsent(dntValue);
        } else if (typeof dntValue === 'string') {
            const boolValue = dntValue === 'true' || dntValue === '1';
            trackingConsent = booleanToTrackingConsent(boolValue);
        }

        const { gcid, rcid } = parseIsbClaim(payload.isb);
        const { usid } = parseSubClaim(payload.sub);

        return { expiry, trackingConsent, gcid, rcid, usid };
    } catch {
        return { expiry: null, trackingConsent: null, gcid: null, rcid: null, usid: null };
    }
}

/**
 * Whether decoded SLAS token claims represent a registered shopper.
 *
 * SLAS encodes the shopper identity in the access token's `isb` claim:
 * - Guest tokens carry only `gcid:<id>`
 * - Registered tokens carry both `gcid:<id>` and `rcid:<id>`
 *
 * The presence of a non-empty `rcid` is therefore the single rule that distinguishes the two.
 * This is the only place that rule is encoded — both `deriveUserTypeFromClaims` and any
 * caller that needs to interpret a token use this helper.
 */
export function isRegisteredTokenClaims(claims: SLASAccessTokenClaims): boolean {
    return typeof claims.rcid === 'string' && claims.rcid.length > 0;
}

/**
 * Extract the shopper's login email from a SLAS access token.
 * SLAS encodes it in the `isb` claim as `upn:<email>`.
 * Returns null when the token is absent, malformed, or belongs to a guest.
 */
export function getLoginEmailFromToken(accessToken: string | undefined): string | null {
    if (!accessToken) return null;
    try {
        const payload = decodeSLASAccessToken(accessToken);
        const { upn } = parseIsbClaim(payload.isb);
        return upn && upn !== 'Guest' ? upn : null;
    } catch {
        return null;
    }
}

/**
 * Derive `userType` from decoded SLAS token claims.
 *
 * The JWT is the single source of truth — see {@link isRegisteredTokenClaims} for the rule.
 * Cookie names (`cc-nx` / `cc-nx-g`) carry no authority over user type; they are only used
 * for cold-start ingest when no access token has been issued yet, and as the response-side
 * decision for which refresh-cookie to write or delete.
 */
export function deriveUserTypeFromClaims(claims: SLASAccessTokenClaims): 'guest' | 'registered' {
    return isRegisteredTokenClaims(claims) ? 'registered' : 'guest';
}

/**
 * Select the correct customer ID from decoded token claims.
 *
 * Registered tokens carry both `gcid` and `rcid`; the registered customer ID (`rcid`) is the
 * authoritative customer for the session. Guest tokens carry only `gcid`. Returning
 * `claims.rcid ?? claims.gcid` therefore produces the right customer ID for either user type
 * without needing the caller to disambiguate.
 *
 * @param claims - Decoded SLAS access token claims
 * @returns The customer ID, or null if neither claim is present (a structurally broken token)
 */
export function getCustomerIdFromClaims(claims: SLASAccessTokenClaims): string | null {
    return claims.rcid ?? claims.gcid;
}
