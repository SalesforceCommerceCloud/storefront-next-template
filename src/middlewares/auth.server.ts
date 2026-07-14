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
import {
    createContext,
    type MiddlewareFunction,
    type RouterContextProvider,
    type ActionFunctionArgs,
} from 'react-router';
import { type AuthResponse, AuthTokenInvalidError } from '@/scapi';
import type { SessionData as AuthData } from '@/lib/api/types';
import { clearStorage, type StorageErrorData, unpackStorage } from '@/lib/storage-map';
import {
    authContext,
    authStorageContext,
    type AuthStorageData,
    createAuthPromise,
    updateAuthStorageData,
    updateStorageAndCache,
    getSLASAccessTokenClaims,
    getCustomerIdFromClaims,
    deriveUserTypeFromClaims,
    isTrackingConsentEnabled,
    AUTH_TOKEN_INVALID_ERROR,
    COOKIE_REFRESH_TOKEN_GUEST,
    COOKIE_REFRESH_TOKEN_REGISTERED,
    COOKIE_ACCESS_TOKEN,
    COOKIE_USID,
    COOKIE_CUSTOMER_ID,
    COOKIE_ENC_USER_ID,
    COOKIE_IDP_ACCESS_TOKEN,
    COOKIE_ID_TOKEN,
    COOKIE_IDP_REFRESH_TOKEN,
    COOKIE_CODE_VERIFIER,
    COOKIE_TRACKING_CONSENT,
    COOKIE_DWSID,
    COOKIE_AUTH_RECOVERY_GUARD,
} from '@/middlewares/auth.utils';
import { isAbsoluteURL } from '@/lib/utils';
import { getAppOrigin } from '@/lib/origin';
import { buildUrlFromContext } from '@/lib/url.server';
import { getLogger } from '@/lib/logger.server';
import { createApiClients } from '@/lib/api-clients.server';
import { performanceTimerContext, PERFORMANCE_MARKS } from '@/middlewares/performance-metrics';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { createCookie, getCookieConfig, getCookieNameWithSiteId, parseAllCookies } from '@/lib/cookie-utils.server';
import { getTranslation, getLocale } from '@salesforce/storefront-next-runtime/i18n';
import { TrackingConsent, trackingConsentToBoolean } from '@/types/tracking-consent';
import { SHOPPER_CONTEXT_COOKIE_NAME_BASE, SOURCE_CODE_COOKIE_NAME_BASE } from '@/lib/shopper-context/constants';

/**
 * Sentinel value stored in auth storage when a registered shopper's refresh token fails.
 * The post-handler section reads this and emits a redirect to the login page instead of
 * falling through to guest login.
 */
const SESSION_EXPIRED_REDIRECT = '__session_expired_redirect__';

/**
 * Refresh access token using refresh token.
 * Returns AuthResponse which includes dwsid (automatically extracted from Set-Cookie header by SDK).
 */
export async function refreshAccessToken(
    context: Readonly<RouterContextProvider>,
    refreshToken: string,
    options?: { trackingConsent?: TrackingConsent }
): Promise<AuthResponse> {
    const logger = getLogger(context);
    const clients = createApiClients(context);
    const performanceTimer = context.get(performanceTimerContext);
    performanceTimer?.mark(PERFORMANCE_MARKS.authRefreshAccessToken, 'start');

    // Get tracking consent from options if provided, otherwise read from auth context (populated from cookies by middleware)
    // Only process tracking consent if the feature is enabled in config
    let trackingConsent: TrackingConsent | undefined = options?.trackingConsent;
    if (trackingConsent === undefined && isTrackingConsentEnabled(context)) {
        try {
            const authData = getAuth(context);
            trackingConsent = authData.trackingConsent;
        } catch {
            // If getAuth fails (e.g., middleware not initialized), trackingConsent remains undefined
        }
    }

    logger.debug('Auth: refreshAccessToken starting', {
        hasTrackingConsent: trackingConsent !== undefined,
    });

    try {
        const result = await clients.auth.refreshToken({
            refreshToken,
            // Convert TrackingConsent enum to boolean for SLAS API
            ...(trackingConsent !== undefined && { dnt: trackingConsentToBoolean(trackingConsent) }),
        });
        logger.debug('Auth: refreshAccessToken succeeded');
        return result;
    } catch (error) {
        logger.error('Auth: refreshAccessToken failed', { error });
        throw error;
    } finally {
        performanceTimer?.mark(PERFORMANCE_MARKS.authRefreshAccessToken, 'end');
    }
}

/**
 * Login as guest user.
 * Returns AuthResponse which includes dwsid (automatically extracted from Set-Cookie header by SDK).
 * The SDK handles auth flow selection internally when proxyHost is configured.
 */
export async function loginGuestUser(
    context: Readonly<RouterContextProvider>,
    options?: { usid?: string }
): Promise<AuthResponse> {
    const logger = getLogger(context);
    const clients = createApiClients(context);
    const performanceTimer = context.get(performanceTimerContext);
    const appConfig = getConfig(context);
    const isSlasPrivate = appConfig.commerce.api.privateKeyEnabled;
    const performanceName = isSlasPrivate
        ? PERFORMANCE_MARKS.authLoginGuestUserPrivate
        : PERFORMANCE_MARKS.authLoginGuestUser;
    performanceTimer?.mark(performanceName, 'start');

    logger.debug('Auth: loginGuestUser starting', {
        hasUsid: !!options?.usid,
        isSlasPrivate,
    });

    try {
        // SDK handles auth flow selection internally when proxyHost is configured
        const result = await clients.auth.loginAsGuest({ usid: options?.usid });
        logger.debug('Auth: loginGuestUser succeeded');
        return result;
    } catch (error) {
        logger.error('Auth: loginGuestUser failed', { error });
        throw error;
    } finally {
        performanceTimer?.mark(performanceName, 'end');
    }
}

/**
 * Login as registered user with email and password.
 * Returns AuthResponse which includes dwsid (automatically extracted from Set-Cookie header by SDK).
 */
export async function loginRegisteredUser(
    context: Readonly<RouterContextProvider>,
    email: string,
    password: string,
    options?: { customParameters?: Record<string, unknown>; skipUsid?: boolean }
): Promise<AuthResponse> {
    const logger = getLogger(context);
    const clients = createApiClients(context);
    const performanceTimer = context.get(performanceTimerContext);
    // Skip the session USID when requested (e.g. after an email update where the current
    // USID is tied to the old loginId identity). Omitting it lets SLAS create a fresh session.
    const { usid } = options?.skipUsid ? { usid: undefined } : getAuth(context);

    // Get tracking consent from auth context (populated from cookies by middleware)
    // This ensures existing tracking consent preference from guest session propagates to registered user session
    // Only process tracking consent if the feature is enabled in config
    let trackingConsent: TrackingConsent | undefined;
    if (isTrackingConsentEnabled(context)) {
        try {
            const authData = getAuth(context);
            trackingConsent = authData.trackingConsent;
        } catch {
            // If getAuth fails (e.g., middleware not initialized), trackingConsent remains undefined
        }
    }

    performanceTimer?.mark(PERFORMANCE_MARKS.authLoginRegisteredUser, 'start');

    logger.debug('Auth: loginRegisteredUser starting', {
        hasUsid: !!usid,
        hasTrackingConsent: trackingConsent !== undefined,
    });

    try {
        const result = await clients.auth.loginWithCredentials({
            username: email,
            password,
            usid: usid ? String(usid) : undefined,
            // Convert TrackingConsent enum to boolean for SLAS API
            ...(trackingConsent !== undefined && { dnt: trackingConsentToBoolean(trackingConsent) }),
        });
        logger.debug('Auth: loginRegisteredUser succeeded');
        return result;
    } catch (error) {
        logger.error('Auth: loginRegisteredUser failed', { error });
        throw error;
    } finally {
        performanceTimer?.mark(PERFORMANCE_MARKS.authLoginRegisteredUser, 'end');
    }
}

/**
 * Authorize passwordless login - sends magic link via email
 */
export async function authorizePasswordless(
    context: ActionFunctionArgs['context'],
    parameters: {
        userid: string;
        callbackUri?: string;
        redirectPath?: string;
        registerCustomer?: boolean;
        firstName?: string;
        lastName?: string;
        /**
         * When true, asks SLAS to fail the authorize call (HTTP 400) for shoppers whose
         * email is registered but unverified, instead of the default 200 / no-OTP behavior.
         * The storefront uses this to route unverified shoppers to standard password
         * login up front rather than opening an OTP modal that will never receive a code.
         */
        strictVerify?: boolean;
    }
) {
    const performanceTimer = context.get(performanceTimerContext);
    performanceTimer?.mark(PERFORMANCE_MARKS.authAuthorizePasswordless, 'start');

    const clients = createApiClients(context);
    const session = getAuth(context);
    const userId = parameters.userid;

    const appConfig = getConfig(context);
    const passwordlessCallback = appConfig.features.passwordlessLogin.callbackUri;
    const mode = appConfig.features.passwordlessLogin.mode;

    let baseCallbackUri: string | undefined;

    if (parameters.callbackUri) {
        baseCallbackUri = parameters.callbackUri;
    } else if (passwordlessCallback) {
        baseCallbackUri = isAbsoluteURL(passwordlessCallback)
            ? passwordlessCallback
            : `${getAppOrigin(context)}${passwordlessCallback}`;
    }

    const finalCallbackUri =
        baseCallbackUri && parameters.redirectPath
            ? `${baseCallbackUri}?redirectUrl=${encodeURIComponent(parameters.redirectPath)}`
            : baseCallbackUri;

    const usid = session.usid;

    const locale = getLocale(context);

    const logger = getLogger(context);
    logger.debug('Auth: authorizePasswordless starting', { mode });

    try {
        const result = await clients.auth.passwordless.authorize({
            userId,
            callbackUri: finalCallbackUri,
            usid: usid ? String(usid) : undefined,
            mode,
            ...(locale && { locale }),
            ...(parameters.strictVerify && { strictVerify: true }),
            ...(parameters.registerCustomer && {
                registerCustomer: parameters.registerCustomer,
                firstName: parameters.firstName,
                lastName: parameters.lastName,
                email: userId,
            }),
        });
        logger.debug('Auth: authorizePasswordless succeeded');
        return result;
    } catch (error) {
        logger.error('Auth: authorizePasswordless failed', { error });
        throw error;
    } finally {
        performanceTimer?.mark(PERFORMANCE_MARKS.authAuthorizePasswordless, 'end');
    }
}

/**
 * Request password reset token - sends magic link via email
 */
export async function getPasswordResetToken(
    context: ActionFunctionArgs['context'],
    parameters: {
        email: string;
    }
) {
    const performanceTimer = context.get(performanceTimerContext);
    performanceTimer?.mark(PERFORMANCE_MARKS.authGetPasswordResetToken, 'start');

    const clients = createApiClients(context);
    const appConfig = getConfig(context);
    const resetPasswordCallbackUri = appConfig.features.resetPassword.callbackUri;
    let callbackUri: string | undefined;
    if (resetPasswordCallbackUri) {
        callbackUri = isAbsoluteURL(resetPasswordCallbackUri)
            ? resetPasswordCallbackUri
            : `${getAppOrigin(context)}${resetPasswordCallbackUri}`;
    }

    const mode = appConfig.features.resetPassword.mode;

    const locale = getLocale(context);

    const logger = getLogger(context);
    logger.debug('Auth: getPasswordResetToken starting', { mode });

    try {
        const result = await clients.auth.password.requestReset({
            userId: parameters.email,
            callbackUri,
            mode,
            ...(locale && { locale }),
        });
        logger.debug('Auth: getPasswordResetToken succeeded');
        return result;
    } catch (error) {
        logger.error('Auth: getPasswordResetToken failed', { error });
        throw error;
    } finally {
        performanceTimer?.mark(PERFORMANCE_MARKS.authGetPasswordResetToken, 'end');
    }
}

/**
 * Reset password using token from magic link
 */
export async function resetPasswordWithToken(
    context: ActionFunctionArgs['context'],
    parameters: {
        email: string;
        token: string;
        newPassword: string;
    }
) {
    const performanceTimer = context.get(performanceTimerContext);
    performanceTimer?.mark(PERFORMANCE_MARKS.authResetPasswordWithToken, 'start');

    const logger = getLogger(context);
    const clients = createApiClients(context);

    logger.debug('Auth: resetPasswordWithToken starting');

    try {
        const result = await clients.auth.password.reset({
            userId: parameters.email,
            token: parameters.token,
            newPassword: parameters.newPassword,
        });
        logger.debug('Auth: resetPasswordWithToken succeeded');
        return result;
    } catch (error) {
        logger.error('Auth: resetPasswordWithToken failed', { error });
        throw error;
    } finally {
        performanceTimer?.mark(PERFORMANCE_MARKS.authResetPasswordWithToken, 'end');
    }
}

/**
 * Get passwordless access token using the token from magic link.
 * Returns AuthResponse which includes dwsid (automatically extracted from Set-Cookie header by SDK).
 */
export async function getPasswordLessAccessToken(
    context: Readonly<RouterContextProvider>,
    pwdlessLoginToken: string
): Promise<AuthResponse> {
    const clients = createApiClients(context);
    const performanceTimer = context.get(performanceTimerContext);
    const session = getAuth(context);
    const usid = session.usid;
    performanceTimer?.mark(PERFORMANCE_MARKS.authGetPasswordLessAccessToken, 'start');

    // Get tracking consent from auth context (populated from cookies by middleware)
    // This ensures existing tracking consent preference from guest session propagates to registered user session
    // Only process tracking consent if the feature is enabled in config
    let dnt: boolean | undefined;
    if (isTrackingConsentEnabled(context)) {
        try {
            const authData = getAuth(context);
            if (authData.trackingConsent) {
                dnt = trackingConsentToBoolean(authData.trackingConsent);
            }
        } catch {
            // If getAuth fails (e.g., middleware not initialized), dnt remains undefined
        }
    }

    const logger = getLogger(context);
    logger.debug('Auth: getPasswordLessAccessToken starting', {
        hasUsid: !!usid,
    });

    try {
        const result = await clients.auth.passwordless.exchangeToken({
            pwdlessLoginToken,
            ...(dnt !== undefined && { dnt }),
        });
        logger.debug('Auth: getPasswordLessAccessToken succeeded');
        return result;
    } catch (error) {
        logger.error('Auth: getPasswordLessAccessToken failed', { error });
        throw error;
    } finally {
        performanceTimer?.mark(PERFORMANCE_MARKS.authGetPasswordLessAccessToken, 'end');
    }
}

/**
 * Request OTP code for email verification.
 * Uses the dedicated OTP endpoints (not passwordless login) to verify
 * email ownership without creating a new authentication session.
 */
export async function requestOtp(
    context: ActionFunctionArgs['context'],
    parameters: {
        email: string;
    }
) {
    const performanceTimer = context.get(performanceTimerContext);
    performanceTimer?.mark(PERFORMANCE_MARKS.authRequestOtp, 'start');

    const clients = createApiClients(context);
    const appConfig = getConfig(context);
    const callbackUri = appConfig.features.otpRequest.callbackUri;

    const mode = appConfig.features.otpRequest.mode;

    const locale = getLocale(context);

    const logger = getLogger(context);
    logger.debug('Auth: requestOtp starting', { mode });

    try {
        await clients.auth.otp.request({
            userId: parameters.email,
            email: parameters.email,
            mode,
            ...(callbackUri && { callbackUri }),
            ...(locale && { locale }),
        });
        logger.debug('Auth: requestOtp succeeded');
    } catch (error) {
        logger.error('Auth: requestOtp failed', { error });
        throw error;
    } finally {
        performanceTimer?.mark(PERFORMANCE_MARKS.authRequestOtp, 'end');
    }
}

/**
 * Verify an OTP code for email verification.
 * This validates the code without creating a new authentication session.
 */
export async function verifyOtp(
    context: ActionFunctionArgs['context'],
    parameters: {
        pwdActionToken: string;
        email: string;
    }
) {
    const performanceTimer = context.get(performanceTimerContext);
    performanceTimer?.mark(PERFORMANCE_MARKS.authVerifyOtp, 'start');

    const clients = createApiClients(context);

    const logger = getLogger(context);
    logger.debug('Auth: verifyOtp starting');

    try {
        await clients.auth.otp.verify({
            pwdActionToken: parameters.pwdActionToken,
            userId: parameters.email,
        });
        logger.debug('Auth: verifyOtp succeeded');
    } catch (error) {
        logger.error('Auth: verifyOtp failed', { error });
        throw error;
    } finally {
        performanceTimer?.mark(PERFORMANCE_MARKS.authVerifyOtp, 'end');
    }
}

/**
 * Server-side utility to retrieve/verify the validity of stored Commerce API auth information.
 * Validates access token expiry using the expiry injected from JWT during middleware initialization.
 */
type AuthAction = 'tokenValid' | 'tokenRefreshed' | 'guestLogin';

const retrieveAuthStorageData = async (
    context: Readonly<RouterContextProvider>,
    storage: Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>,
    cache: { ref: AuthData | undefined }
): Promise<AuthAction> => {
    const { t } = getTranslation(context);
    const logger = getLogger(context);

    const accessToken = storage.get('accessToken');
    const accessTokenExpiry = storage.get('accessTokenExpiry');
    const refreshToken = storage.get('refreshToken');
    const performanceTimer = context.get(performanceTimerContext);

    // Check if access token exists and is not expired
    // We use the expiry injected from JWT during middleware initialization for fast comparison
    if (
        accessToken &&
        typeof accessToken === 'string' &&
        accessToken.length &&
        typeof accessTokenExpiry === 'number' &&
        accessTokenExpiry > Date.now()
    ) {
        logger.debug('Auth: access token valid', {
            expiresIn: Math.round((accessTokenExpiry - Date.now()) / 1000),
        });
        return 'tokenValid';
    }
    // Token missing or expired - proceed to refresh flow below

    // If access token missing but refresh token exists, use it to get new access token.
    // The eventual userType is derived from the JWT inside updateAuthStorageDataByTokenResponse;
    // we don't need to know it ahead of time.
    if (typeof refreshToken === 'string' && refreshToken.length) {
        const storedUserType = storage.get('userType');
        logger.debug('Auth: access token expired or missing, refreshing', { storedUserType });
        try {
            // Use refresh token operation and update storage/cache
            performanceTimer?.mark(PERFORMANCE_MARKS.authRefreshToken, 'start');
            const tokenResponse = await refreshAccessToken(context, refreshToken);
            performanceTimer?.mark(PERFORMANCE_MARKS.authRefreshToken, 'end');
            await updateStorageAndCache(context, storage, cache, tokenResponse);
            logger.info('Auth: token refreshed', { userType: storage.get('userType') });
            return 'tokenRefreshed';
        } catch (error) {
            logger.warn('Auth: refresh token failed', { error, storedUserType });
            // Registered shopper whose refresh failed: set a sentinel so the post-handler
            // can redirect to login instead of silently creating a guest session. The guest
            // login below still runs so next() has a valid token and does not crash; the
            // post-handler replaces the response with the redirect before it is returned.
            if (storedUserType === 'registered') {
                storage.set('error', SESSION_EXPIRED_REDIRECT);
                // Fall through so guest login runs and next() has a usable token.
            }
            // Guest refresh failure: fall through to guest login (no sentinel needed).
        }
    }

    // Otherwise, get a new guest token (fallback for users not logged in)
    // Note: Registered users should log in through `/login` action, not here
    const storedUsid = storage.get('usid');
    const hasUsid = typeof storedUsid === 'string' && storedUsid.length > 0;
    logger.debug('Auth: no valid tokens, performing guest login', { hasUsid });
    try {
        const usid = typeof storedUsid === 'string' ? storedUsid : undefined;

        // Use guest login operation and update storage/cache
        performanceTimer?.mark(PERFORMANCE_MARKS.authGuestLogin, 'start');
        const tokenResponse = await loginGuestUser(context, {
            usid: typeof usid === 'string' && usid.length ? usid : undefined,
        });
        performanceTimer?.mark(PERFORMANCE_MARKS.authGuestLogin, 'end');
        await updateStorageAndCache(context, storage, cache, tokenResponse);
        logger.info('Auth: guest session created');
        return 'guestLogin';
    } catch (error) {
        // Final fallback failed. If SLAS issued a structurally invalid token, mark with
        // the recovery sentinel so the post-handler check routes to handleAuthTokenInvalidation.
        logger.error('Auth: guest login failed', { error });
        storage.set(
            'error',
            isAuthTokenInvalidError(error) ? AUTH_TOKEN_INVALID_ERROR : t('errors:guestAccessTokenFailed')
        );
        return 'guestLogin';
    }
};

// Cookie names for split auth storage are imported from auth.utils
// IMPORTANT: Only ONE refresh token cookie should exist at a time
// - cc-nx-g: Guest users (cookie name encodes user type)
// - cc-nx: Registered users (cookie name encodes user type)

/**
 * Type guard for auth-token invalidation errors thrown by the SCAPI client.
 */
const isAuthTokenInvalidError = (error: unknown): error is Error =>
    error instanceof Error && error.name === 'AuthTokenInvalidError';

/**
 * Reset any stale error state and remove access-token related data to force recovery.
 */
const resetRecoveryStorageState = (authStorage: Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>) => {
    authStorage.delete('error');
    authStorage.delete('accessToken');
    authStorage.delete('accessTokenExpiry');
    authStorage.delete('idpAccessToken');
    authStorage.delete('idpAccessTokenExpiry');
};

/**
 * Recover from a 401 by forcing a refresh/guest login and redirecting the request.
 * Returns the redirect response and a flag used to set the recovery guard cookie.
 */
const handleAuthTokenInvalidation = async ({
    request,
    context,
    authStorage,
    authCache,
    hasAuthRecoveryGuard,
    error,
}: {
    request: Request;
    context: Readonly<RouterContextProvider>;
    authStorage: Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>;
    authCache: { ref: AuthData | undefined };
    hasAuthRecoveryGuard: boolean;
    error: unknown;
}): Promise<{ response: Response; authRecoveryTriggered: boolean }> => {
    const logger = getLogger(context);

    // Guard against loops: if we already redirected once, surface the error.
    if (hasAuthRecoveryGuard) {
        logger.error('Auth: token invalidation recovery blocked by guard', { error });
        throw error;
    }

    // Clear stale error/access-token state so refresh/guest flow can run cleanly.
    resetRecoveryStorageState(authStorage);

    // Refresh before redirect so the next request arrives with fresh cookies,
    // and to fail fast if recovery is not possible (avoid a pointless redirect).
    await retrieveAuthStorageData(context, authStorage, authCache).catch(() => {
        // Intentionally empty
    });

    // If recovery failed, rethrow so ErrorBoundary can handle it.
    if (authStorage.has('error')) {
        logger.error('Auth: token invalidation recovery failed', { error });
        throw error;
    }

    logger.info('Auth: token invalidation recovery succeeded, redirecting');

    // Restart the request lifecycle with fresh auth cookies.
    return {
        authRecoveryTriggered: true,
        response: new Response(null, {
            status: 307,
            headers: {
                Location: request.url,
                // Observability only: marks recovery redirect in logs/debugging.
                'x-sfnext-auth-recovery': '1',
            },
        }),
    };
};

const authCacheContext = createContext<{ ref: AuthData | undefined }>();

/**
 * Middleware to retrieve or refresh the Commerce API token and provide it as part of the router `context`.
 *
 * This middleware is tailored for server-side use only! It uses separate cookies to store different parts of the
 * authentication information:
 * - `cc-nx-g`: Guest user refresh token (expires after configured period, browser auto-deletes)
 * - `cc-nx`: Registered user refresh token (expires after configured period, browser auto-deletes)
 * - `cc-at`: Access token (expires after 30 min, browser auto-deletes)
 * - `usid`: User session ID (expires with refresh token). Mirrors the value derived from the access token JWT
 *   `sub` claim. sf-next reads `usid` from the JWT, not from this cookie; the cookie is kept so hybrid
 *   storefronts can forward it to ECOM, which does not parse the access token for `usid`.
 * - `idp_access_token`: IDP access token (for social login, expires with SLAS access token)
 * - `cc-cv`: OAuth2 PKCE code verifier (server-only httpOnly cookie, short-lived, 5 min expiry)
 *
 * `customerId` is NOT persisted as a cookie — it is derived per-request from the SLAS access token JWT
 * `isb` claim (via `gcid`/`rcid`).
 *
 * User type is derived from the access-token JWT (`rcid` present in the `isb` claim → registered,
 * otherwise guest — see `deriveUserTypeFromClaims`), NOT from which refresh token cookie exists.
 * The refresh-cookie name is only consulted as a cold-start fallback when no access token has been
 * issued yet, and as the response-side decision for which refresh cookie to write/delete. Only one
 * refresh token cookie exists at a time - a user cannot be both guest and registered.
 *
 * All cookies use httpOnly: true to prevent client-side JavaScript access (XSS protection).
 * ECOM hybrid storefronts can still read cookies from the incoming request headers server-side.
 *
 * Cookie configuration can be overridden via getCookieConfig using environment variables.
 *
 * Token validation flow:
 * - If access token exists and not expired (checked via JWT decode) → use it
 * - If access token missing/expired but refresh token exists → refresh to get new access token
 * - If both missing → guest login
 * - If the JWT decodes but is missing required claims (`isb` gcid/rcid, or `sub` usid) →
 *   throw `AuthTokenInvalidError` to route through `handleAuthTokenInvalidation`, which
 *   clears auth cookies and emits a 307 redirect with fresh state. SLAS guarantees these
 *   claims; reaching this path indicates a critical token-integrity failure (e.g. a bug
 *   in token issuance) rather than a normal auth lifecycle event.
 *
 * The router context is available in other middlewares, loader and action functions. Use it as root middleware,
 * to ensure the Commerce API context portion becomes available throughout the whole application.
 */
const authMiddleware: MiddlewareFunction<Response> = async ({ request, context }, next) => {
    const logger = getLogger(context);
    logger.debug('Auth middleware: start');
    // Before calling the handler: Load current Commerce API data from incoming cookies, if applicable
    const cookieConfig = getCookieConfig({ httpOnly: true }, context);
    const cookieHeader = request.headers.get('Cookie');

    // Parse cookie header once (not 5 times) for optimal performance
    const allCookies = parseAllCookies(cookieHeader);

    // Extract auth cookies from parsed map (no decoding/JSON parsing)
    const getAuthCookie = (name: string): string | null => {
        const namespacedName = getCookieNameWithSiteId(name, context);
        return allCookies[namespacedName] || null;
    };

    const refreshTokenGuest = getAuthCookie(COOKIE_REFRESH_TOKEN_GUEST);
    const refreshTokenRegistered = getAuthCookie(COOKIE_REFRESH_TOKEN_REGISTERED);
    const accessToken = getAuthCookie(COOKIE_ACCESS_TOKEN);
    const encUserId = getAuthCookie(COOKIE_ENC_USER_ID);
    const idpAccessToken = getAuthCookie(COOKIE_IDP_ACCESS_TOKEN);
    const idToken = getAuthCookie(COOKIE_ID_TOKEN);
    const idpRefreshToken = getAuthCookie(COOKIE_IDP_REFRESH_TOKEN);
    const codeVerifier = getAuthCookie(COOKIE_CODE_VERIFIER);
    const dwsid = getAuthCookie(COOKIE_DWSID);
    const authRecoveryGuard = getAuthCookie(COOKIE_AUTH_RECOVERY_GUARD);
    const hasAuthRecoveryGuard = authRecoveryGuard === '1';
    // Read tracking consent cookie directly as TrackingConsent enum (values match)
    const trackingConsentCookieValue = getAuthCookie(COOKIE_TRACKING_CONSENT);
    let trackingConsent: TrackingConsent | undefined =
        trackingConsentCookieValue === TrackingConsent.Accepted ||
        trackingConsentCookieValue === TrackingConsent.Declined
            ? trackingConsentCookieValue
            : undefined;

    // Read the existing `usid` cookie. The cookie itself is intentionally kept (sf-next no
    // longer reads it for its own auth flow — `usid` is derived from the access token JWT
    // sub claim — but the value must remain available as a cookie so hybrid storefronts can
    // forward it to ECOM, which does not parse the JWT for `usid`).
    // The cookie value is also used as a fallback on the cold-start guest-login path when no
    // access token is present, so SLAS can preserve session continuity.
    const usidCookieValue = getAuthCookie(COOKIE_USID);

    // Track if we need to delete the tracking consent cookie due to mismatch
    let hasTrackingConsentMismatch = false;

    // Create cookie instances for serialization (Set-Cookie headers)
    const refreshTokenGuestCookie = createCookie<string>(COOKIE_REFRESH_TOKEN_GUEST, cookieConfig, context);
    const refreshTokenRegisteredCookie = createCookie<string>(COOKIE_REFRESH_TOKEN_REGISTERED, cookieConfig, context);
    const accessTokenCookie = createCookie<string>(COOKIE_ACCESS_TOKEN, cookieConfig, context);
    // `usid` cookie is written from the JWT-derived value so hybrid storefronts can forward it to ECOM.
    const usidCookie = createCookie<string>(COOKIE_USID, cookieConfig, context);
    // Deletion-only instance: sf-next no longer writes `customerId`, but the destroy path
    // clears any lingering legacy cookie so logged-out browsers don't keep transmitting the
    // real customer ID for up to 30/90 days. Not used in the hot path.
    const customerIdDeletionCookie = createCookie<string>(COOKIE_CUSTOMER_ID, cookieConfig, context);
    const encUserIdCookie = createCookie<string>(COOKIE_ENC_USER_ID, cookieConfig, context);
    const idpAccessTokenCookie = createCookie<string>(COOKIE_IDP_ACCESS_TOKEN, cookieConfig, context);
    const idTokenCookie = createCookie<string>(COOKIE_ID_TOKEN, cookieConfig, context);
    const idpRefreshTokenCookie = createCookie<string>(COOKIE_IDP_REFRESH_TOKEN, cookieConfig, context);
    const dwsidCookie = createCookie<string>(COOKIE_DWSID, cookieConfig, context);
    const authRecoveryCookie = createCookie<string>(COOKIE_AUTH_RECOVERY_GUARD, cookieConfig, context);
    // Code verifier cookie is httpOnly for security (OAuth2 PKCE flow, server-only)
    const codeVerifierCookie = createCookie<string>(
        COOKIE_CODE_VERIFIER,
        getCookieConfig({ httpOnly: true }, context),
        context
    );
    // `dw_dnt` is intentionally NOT httpOnly: the consent banner reads it client-side
    // (app-shell caching requires a client-only decision). Safe because the JWT `dnt`
    // claim is the source of truth — a mismatched cookie is discarded below (see the
    // JWT/cookie cross-check).
    const trackingConsentCookie = createCookie<string>(
        COOKIE_TRACKING_CONSENT,
        getCookieConfig({ httpOnly: false }, context),
        context
    );
    const shopperContextCookie = createCookie<string>(SHOPPER_CONTEXT_COOKIE_NAME_BASE, cookieConfig, context);
    const sourceCodeCookie = createCookie<string>(SOURCE_CODE_COOKIE_NAME_BASE, cookieConfig, context);

    // Decode access token claims once for expiry, tracking consent, customer ID, usid, and userType
    const claims = accessToken ? getSLASAccessTokenClaims(accessToken) : null;
    const claimsAreDecodable = claims !== null && claims.expiry !== null;

    // Determine userType and refresh token.
    //
    // IMPORTANT: the access-token JWT is the single source of truth for `userType`. Cookie names
    // (`cc-nx` / `cc-nx-g`) are only consulted as a cold-start fallback when no access token has
    // been issued yet, and as the response-side decision for which refresh-cookie to write or
    // delete (still keyed off the JWT-derived value).
    //
    // The matching refresh token is selected by the JWT-derived userType; the "other"
    // refresh-cookie, if present, is ignored on read and will be deleted on write below.
    let userType: 'guest' | 'registered';
    if (claimsAreDecodable) {
        userType = deriveUserTypeFromClaims(claims);
    } else if (refreshTokenRegistered) {
        // Cold-start with a registered refresh-cookie but no access token
        userType = 'registered';
    } else {
        // No refresh-cookie or guest cookie — will fallback to guest login
        userType = 'guest';
    }
    const refreshToken: string | null = userType === 'registered' ? refreshTokenRegistered : refreshTokenGuest;

    logger.debug('Auth middleware: cookies parsed', {
        userType,
        userTypeSource: claimsAreDecodable ? 'jwt' : 'cookie',
        hasRefreshToken: !!refreshToken,
        hasAccessToken: !!accessToken,
    });

    // Reconstruct authData from individual cookies
    // Note: expiry times are NOT persisted in cookies - they're derived from JWT tokens at runtime
    // This decodes once during middleware initialization for fast numeric comparison later
    const authData: Partial<AuthStorageData> = {};
    if (refreshToken) authData.refreshToken = refreshToken;

    if (accessToken) {
        authData.accessToken = accessToken;
        if (claims?.expiry) authData.accessTokenExpiry = claims.expiry;

        // Validate tracking consent value from token matches cookie - if they differ, mark cookie for deletion
        // Only validate if tracking consent feature is enabled
        if (isTrackingConsentEnabled(context) && claims?.trackingConsent !== null && trackingConsent !== undefined) {
            if (claims?.trackingConsent !== trackingConsent) {
                logger.info('Auth middleware: tracking consent mismatch detected', {
                    tokenConsent: claims?.trackingConsent,
                    cookieConsent: trackingConsentCookieValue,
                });
                trackingConsent = undefined;
                hasTrackingConsentMismatch = true;
            }
        }
    }
    // Soft-populate usid/customerId from JWT claims. JWT-integrity validation (which throws
    // AuthTokenInvalidError when claims are missing) runs later inside the try/catch around
    // `next()` so it can be routed through handleAuthTokenInvalidation for graceful recovery.
    // Cold-start: when there is no access token at all, fall back to the existing usid
    // cookie value so guest-login can pass it to SLAS for session continuity.
    if (claims?.usid) {
        authData.usid = claims.usid;
    } else if (usidCookieValue) {
        authData.usid = usidCookieValue;
    }
    if (claims) {
        const tokenCustomerId = getCustomerIdFromClaims(claims);
        if (tokenCustomerId) {
            authData.customerId = tokenCustomerId;
        }
    }
    if (encUserId) authData.encUserId = encUserId;
    // Add IDP access token for social login (if present)
    if (idpAccessToken) authData.idpAccessToken = idpAccessToken;
    // Add OIDC id_token (if present)
    if (idToken) authData.idToken = idToken;
    // Add IDP refresh token (if present)
    if (idpRefreshToken) authData.idpRefreshToken = idpRefreshToken;
    // Add code verifier for OAuth2 PKCE flow (if present)
    if (codeVerifier) authData.codeVerifier = codeVerifier;
    // Add dwsid for hybrid storefronts (if present)
    if (dwsid) authData.dwsid = dwsid;
    // Add tracking consent value from cookie (if present and valid)
    // Note: trackingConsent may be undefined if it doesn't match token, which will cause cookie deletion
    if (trackingConsent !== undefined) authData.trackingConsent = trackingConsent;
    // Add userType to in-memory storage (NOT written to cookies)
    authData.userType = userType;

    const authStorage = new Map<keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]>(
        Object.entries(authData) as [keyof AuthStorageData, AuthStorageData[keyof AuthStorageData]][]
    );

    // Mark storage as updated if tracking consent mismatch was detected
    // This ensures the response section runs and writes corrected cookies
    if (hasTrackingConsentMismatch) {
        authStorage.set('isUpdated', true);
    }
    // Mark storage as updated whenever the `usid` cookie is missing or stale relative to
    // the JWT, so the response section can write a fresh cookie. The cookie value is what
    // hybrid storefronts forward to ECOM, so it must not drift from the JWT source of truth.
    if (authData.usid && (!usidCookieValue || usidCookieValue !== authData.usid)) {
        authStorage.set('isUpdated', true);
    }

    // Create auth cache instance per request. On the server it's crucial to not create a singleton cache instance!
    const authCache: { ref: AuthData | undefined } = { ref: authData as AuthData };
    const authPromiseCache: { ref: Promise<AuthData | undefined> } = { ref: Promise.resolve(authData as AuthData) };

    // Write Commerce API data to request `context` to make it available to other middleware, loaders, or actions
    context.set(authContext, authPromiseCache);
    context.set(authStorageContext, authStorage);
    context.set(authCacheContext, authCache);

    // Before calling the handler: Verify existing Commerce API auth data or retrieve new information
    let authAction: AuthAction | undefined;
    await retrieveAuthStorageData(context, authStorage, authCache)
        .then((action) => {
            authAction = action;
        })
        .catch((error) => {
            logger.warn('Auth middleware: retrieveAuthStorageData failed', { error });
        });

    let response: Response;
    let authRecoveryTriggered = false;

    // Execute handler (loader/action/render)
    try {
        // JWT-integrity validation: SLAS guarantees usid in `sub` and gcid/rcid in `isb`.
        // A decoded-but-missing-claim token is a critical token-integrity failure — throw
        // AuthTokenInvalidError so the existing recovery path below clears cookies and
        // emits a 307 redirect with fresh auth state instead of trapping the user in a
        // 500 loop on the malformed cookie.
        //
        // Only validate when the original cookie token survived (`tokenValid`). After a
        // refresh or guest login, the local `claims` is stale — it reflects the OLD cookie
        // — and the just-issued token has already been validated inside
        // `updateAuthStorageDataByTokenResponse`. Re-validating with stale claims would
        // trigger a redundant recovery cycle.
        //
        // When `authAction` is undefined (retrieveAuthStorageData rejected outright, rare),
        // the integrity check is skipped; any downstream SCAPI 401 routes through the
        // existing post-handler recovery via the storage error sentinel.
        if (authAction === 'tokenValid' && claims) {
            if (!claims.usid) {
                logger.error('Auth: SLAS access token sub claim is missing the usid segment');
                throw new AuthTokenInvalidError('SLAS access token sub claim is missing the usid segment');
            }
            if (!getCustomerIdFromClaims(claims)) {
                logger.error('Auth: SLAS access token isb claim is missing the customer ID (gcid/rcid)');
                throw new AuthTokenInvalidError('SLAS access token isb claim is missing the customer ID (gcid/rcid)');
            }
        }
        response = await next();
    } catch (error) {
        // Only handle auth-token invalidation; everything else should bubble.
        if (!isAuthTokenInvalidError(error)) {
            throw error;
        }

        logger.warn('Auth middleware: token invalidation detected, attempting recovery', {
            hasRecoveryGuard: hasAuthRecoveryGuard,
        });

        // Run the recovery flow and build the redirect response.
        const recovery = await handleAuthTokenInvalidation({
            request,
            context,
            authStorage,
            authCache,
            hasAuthRecoveryGuard,
            error,
        });

        // Persist recovery state for response cookie handling below.
        authRecoveryTriggered = recovery.authRecoveryTriggered;
        response = recovery.response;
        logger.debug('Auth middleware: recovery redirect issued');
    }

    const storedAuthError = authStorage.get('error');
    if (storedAuthError === AUTH_TOKEN_INVALID_ERROR) {
        logger.warn('Auth middleware: deferred token invalidation error, attempting recovery', {
            hasRecoveryGuard: hasAuthRecoveryGuard,
        });
        authStorage.delete('error');
        const recovery = await handleAuthTokenInvalidation({
            request,
            context,
            authStorage,
            authCache,
            hasAuthRecoveryGuard,
            error: new AuthTokenInvalidError(),
        });
        authRecoveryTriggered = recovery.authRecoveryTriggered;
        response = recovery.response;
    }

    if (storedAuthError === SESSION_EXPIRED_REDIRECT) {
        // Delete the sentinel before the isDestroyed/error block below so it does not
        // trigger a full cookie clear on what is otherwise a valid guest token.
        authStorage.delete('error');

        if (hasAuthRecoveryGuard) {
            // Guard is already set: a previous session-expired redirect already fired but
            // the session is still broken. Fall through to guest login (already done above)
            // to avoid an infinite redirect loop.
            logger.warn('Auth middleware: registered refresh failure blocked by guard, falling back to guest');
        } else {
            // Redirect the registered shopper to the login page. The request path already
            // carries the site/locale prefix (e.g. /uk/en-GB/checkout), so buildUrlFromContext
            // applies the same prefix to /login and the current path is used as returnUrl.
            const requestPath = new URL(request.url).pathname;
            const loginPath = buildUrlFromContext('/login', context);
            const loginUrl = `${loginPath}?returnUrl=${encodeURIComponent(requestPath)}&error=session_expired`;
            logger.info('Auth middleware: registered refresh failed, redirecting to login', { requestPath });
            authRecoveryTriggered = true;
            response = new Response(null, {
                status: 307,
                headers: { Location: loginUrl },
            });
        }
    }

    // After calling the handler: Write back storage data and cookies, if required
    if (authStorage.has('isDestroyed') || authStorage.has('error')) {
        logger.warn('Auth middleware: session destroyed or errored, clearing all auth cookies', {
            isDestroyed: authStorage.has('isDestroyed'),
            hasError: authStorage.has('error'),
        });
        // Clean up the storage container. That way the information is immediately updated for eventually
        // running middlewares after this one as well.
        clearStorage(authStorage, false);
        authCache.ref = undefined;
        authPromiseCache.ref = createAuthPromise(context, authCache.ref);

        // Destroy all auth cookies (both refresh token cookies to ensure clean state)
        const deleteCookieConfig = getCookieConfig(
            {
                maxAge: undefined,
                expires: new Date(0),
            },
            context
        );
        const deleteHttpOnlyCookieConfig = getCookieConfig(
            {
                httpOnly: true,
                maxAge: undefined,
                expires: new Date(0),
            },
            context
        );

        response.headers.append('Set-Cookie', await refreshTokenGuestCookie.serialize('', deleteCookieConfig));
        response.headers.append('Set-Cookie', await refreshTokenRegisteredCookie.serialize('', deleteCookieConfig));
        response.headers.append('Set-Cookie', await accessTokenCookie.serialize('', deleteCookieConfig));
        response.headers.append('Set-Cookie', await usidCookie.serialize('', deleteCookieConfig));
        // Clear any lingering legacy customerId cookie on logout/error so the browser stops
        // transmitting the real customer ID once the session is destroyed.
        response.headers.append('Set-Cookie', await customerIdDeletionCookie.serialize('', deleteCookieConfig));
        response.headers.append('Set-Cookie', await encUserIdCookie.serialize('', deleteCookieConfig));
        response.headers.append('Set-Cookie', await idpAccessTokenCookie.serialize('', deleteCookieConfig));
        response.headers.append('Set-Cookie', await idTokenCookie.serialize('', deleteCookieConfig));
        response.headers.append('Set-Cookie', await idpRefreshTokenCookie.serialize('', deleteCookieConfig));
        response.headers.append('Set-Cookie', await dwsidCookie.serialize('', deleteCookieConfig));
        response.headers.append('Set-Cookie', await codeVerifierCookie.serialize('', deleteHttpOnlyCookieConfig));
        response.headers.append('Set-Cookie', await trackingConsentCookie.serialize('', deleteCookieConfig));
        response.headers.append('Set-Cookie', await shopperContextCookie.serialize('', deleteHttpOnlyCookieConfig));
        response.headers.append('Set-Cookie', await sourceCodeCookie.serialize('', deleteHttpOnlyCookieConfig));
    } else if (authStorage.has('isUpdated')) {
        logger.debug('Auth middleware: auth storage updated, writing cookies');
        // Clean up storage container metadata
        authStorage.delete('isUpdated');

        // Update the stored data in separate cookies
        const entry = Object.fromEntries(authStorage);
        authCache.ref = entry;
        authPromiseCache.ref = createAuthPromise(context, entry);

        // Get expiry times (calculated from token response) and user type
        const accessTokenExpiryValue = authStorage.get('accessTokenExpiry') as number | undefined;
        const refreshTokenExpiryValue = authStorage.get('refreshTokenExpiry') as number | undefined;
        const userTypeValue = authStorage.get('userType') as 'guest' | 'registered' | undefined;

        // Set refresh token cookie with refresh token expiry
        // Use correct cookie name based on user type (cc-nx-g for guest, cc-nx for registered)
        //
        // NOTE: userType itself is NOT written to cookies - only the refresh token is written
        // to the appropriate cookie name (cc-nx-g or cc-nx). On the next request userType is
        // derived from the access-token JWT (see deriveUserTypeFromClaims); the cookie name is
        // only a cold-start fallback when no access token is present.
        const refreshTokenValue = authStorage.get('refreshToken');
        if (refreshTokenValue && typeof refreshTokenValue === 'string' && refreshTokenExpiryValue && userTypeValue) {
            const refreshTokenCookie =
                userTypeValue === 'guest' ? refreshTokenGuestCookie : refreshTokenRegisteredCookie;

            // Delete the other refresh token cookie to ensure only one exists
            const otherRefreshTokenCookie =
                userTypeValue === 'guest' ? refreshTokenRegisteredCookie : refreshTokenGuestCookie;

            const deleteCookieConfig = getCookieConfig(
                {
                    maxAge: undefined,
                    expires: new Date(0),
                },
                context
            );

            response.headers.append('Set-Cookie', await otherRefreshTokenCookie.serialize('', deleteCookieConfig));

            // Set the correct refresh token cookie
            response.headers.append(
                'Set-Cookie',
                await refreshTokenCookie.serialize(
                    refreshTokenValue,
                    getCookieConfig(
                        {
                            expires: new Date(refreshTokenExpiryValue),
                        },
                        context
                    )
                )
            );
        }

        // Set access token cookie with access token expiry
        const accessTokenValue = authStorage.get('accessToken');
        if (accessTokenValue && typeof accessTokenValue === 'string' && accessTokenExpiryValue) {
            response.headers.append(
                'Set-Cookie',
                await accessTokenCookie.serialize(
                    accessTokenValue,
                    getCookieConfig(
                        {
                            expires: new Date(accessTokenExpiryValue),
                        },
                        context
                    )
                )
            );
        }

        // Set usid cookie. The cookie value mirrors the JWT-derived usid so hybrid storefronts
        // can forward it to ECOM, which does not parse the access token for usid. sf-next
        // reads usid from the JWT, not from this cookie (except as a cold-start continuity
        // fallback). Expiry tracks the refresh token when available; falls back to the
        // access-token expiry on the drift-recovery path where no token refresh occurred.
        const usidValue = authStorage.get('usid');
        const usidCookieExpiry = refreshTokenExpiryValue ?? accessTokenExpiryValue;
        if (usidValue && typeof usidValue === 'string' && usidCookieExpiry) {
            response.headers.append(
                'Set-Cookie',
                await usidCookie.serialize(
                    usidValue,
                    getCookieConfig(
                        {
                            expires: new Date(usidCookieExpiry),
                        },
                        context
                    )
                )
            );
        }

        // Set encUserId cookie with refresh token expiry (same as refresh token)
        const encUserIdValue = authStorage.get('encUserId');
        if (encUserIdValue && typeof encUserIdValue === 'string' && refreshTokenExpiryValue) {
            response.headers.append(
                'Set-Cookie',
                await encUserIdCookie.serialize(
                    encUserIdValue,
                    getCookieConfig(
                        {
                            expires: new Date(refreshTokenExpiryValue),
                        },
                        context
                    )
                )
            );
        }

        // Set IDP access token cookie with access token expiry (for social login)
        const idpAccessTokenValue = authStorage.get('idpAccessToken');
        const idpAccessTokenExpiryValue = authStorage.get('idpAccessTokenExpiry') as number | undefined;
        if (idpAccessTokenValue && typeof idpAccessTokenValue === 'string' && idpAccessTokenExpiryValue) {
            response.headers.append(
                'Set-Cookie',
                await idpAccessTokenCookie.serialize(
                    idpAccessTokenValue,
                    getCookieConfig(
                        {
                            expires: new Date(idpAccessTokenExpiryValue),
                        },
                        context
                    )
                )
            );
        }

        // Set id_token cookie with access-token expiry (OIDC id_token tracks the access-token
        // JWT exp — same rule PWA Kit uses, see process-token-response.js).
        const idTokenValue = authStorage.get('idToken');
        if (idTokenValue && typeof idTokenValue === 'string' && accessTokenExpiryValue) {
            response.headers.append(
                'Set-Cookie',
                await idTokenCookie.serialize(
                    idTokenValue,
                    getCookieConfig(
                        {
                            expires: new Date(accessTokenExpiryValue),
                        },
                        context
                    )
                )
            );
        }

        // Set idp_refresh_token cookie with refresh-token expiry (IDP refresh token shares the
        // SLAS refresh-token TTL — same rule PWA Kit uses).
        const idpRefreshTokenValue = authStorage.get('idpRefreshToken');
        if (idpRefreshTokenValue && typeof idpRefreshTokenValue === 'string' && refreshTokenExpiryValue) {
            response.headers.append(
                'Set-Cookie',
                await idpRefreshTokenCookie.serialize(
                    idpRefreshTokenValue,
                    getCookieConfig(
                        {
                            expires: new Date(refreshTokenExpiryValue),
                        },
                        context
                    )
                )
            );
        }

        // Set dwsid cookie as session cookie (for hybrid storefronts)
        // No explicit expiry - cookie is deleted when browser closes
        const dwsidValue = authStorage.get('dwsid');
        if (dwsidValue && typeof dwsidValue === 'string') {
            response.headers.append(
                'Set-Cookie',
                await dwsidCookie.serialize(dwsidValue, getCookieConfig({}, context))
            );
        }

        // Set code verifier cookie with short expiry (OAuth2 PKCE flow, ephemeral)
        // This cookie is httpOnly for security and has a 5-minute expiry
        const codeVerifierValue = authStorage.get('codeVerifier');
        if (codeVerifierValue && typeof codeVerifierValue === 'string') {
            const codeVerifierExpiry = Date.now() + 5 * 60 * 1_000; // 5 minutes from now
            response.headers.append(
                'Set-Cookie',
                await codeVerifierCookie.serialize(
                    codeVerifierValue,
                    getCookieConfig(
                        {
                            httpOnly: true,
                            expires: new Date(codeVerifierExpiry),
                        },
                        context
                    )
                )
            );
        } else {
            // If codeVerifier was removed from storage (e.g., after successful social login),
            // explicitly delete the cookie immediately rather than waiting for expiry
            response.headers.append(
                'Set-Cookie',
                await codeVerifierCookie.serialize(
                    '',
                    getCookieConfig(
                        {
                            httpOnly: true,
                            maxAge: undefined,
                            expires: new Date(0),
                        },
                        context
                    )
                )
            );
        }

        // Set or delete tracking consent cookie (only if tracking consent feature is enabled)
        // TrackingConsent enum values match cookie format directly ('0' or '1')
        if (isTrackingConsentEnabled(context)) {
            const trackingConsentValue = authStorage.get('trackingConsent');
            if (
                trackingConsentValue === TrackingConsent.Accepted ||
                trackingConsentValue === TrackingConsent.Declined
            ) {
                // Set tracking consent cookie as session cookie (no expiry)
                // Enum value is already in correct format ('0' or '1')
                response.headers.append(
                    'Set-Cookie',
                    await trackingConsentCookie.serialize(
                        trackingConsentValue,
                        getCookieConfig({ httpOnly: false }, context)
                    )
                );
            } else {
                // Delete tracking consent cookie if it was invalidated (e.g., didn't match token)
                // Check if cookie exists in request to avoid unnecessary deletion
                const requestTrackingConsent = getAuthCookie(COOKIE_TRACKING_CONSENT);
                if (requestTrackingConsent) {
                    response.headers.append(
                        'Set-Cookie',
                        await trackingConsentCookie.serialize(
                            '',
                            getCookieConfig(
                                {
                                    maxAge: undefined,
                                    expires: new Date(0),
                                },
                                context
                            )
                        )
                    );
                }
            }
        }
    }

    if (authRecoveryTriggered) {
        response.headers.append(
            'Set-Cookie',
            await authRecoveryCookie.serialize(
                '1',
                getCookieConfig(
                    {
                        maxAge: 30,
                    },
                    context
                )
            )
        );
    }

    if (hasAuthRecoveryGuard) {
        response.headers.append(
            'Set-Cookie',
            await authRecoveryCookie.serialize(
                '',
                getCookieConfig(
                    {
                        maxAge: undefined,
                        expires: new Date(0),
                    },
                    context
                )
            )
        );
        response.headers.set('x-sfnext-auth-recovery-guard', '1');
    }

    logger.debug('Auth middleware: complete', {
        userType: (authStorage.get('userType') as string) ?? 'unknown',
        authAction,
        authRecoveryTriggered,
        hasError: authStorage.has('error'),
        isDestroyed: authStorage.has('isDestroyed'),
    });

    return response;
};

export const getAuth = (context: Readonly<RouterContextProvider>): AuthData & StorageErrorData => {
    const storage = context.get(authStorageContext);
    const cache = context.get(authCacheContext);
    if (!storage || !cache) {
        throw new Error('getAuth must be used within the Commerce API middleware');
    }
    return cache.ref ?? unpackStorage<AuthData>(storage);
};

export const updateAuth = (
    context: Readonly<RouterContextProvider>,
    updater: AuthResponse | ((data: AuthData & StorageErrorData) => AuthData & StorageErrorData)
) => {
    const storage = context.get(authStorageContext);
    const cache = context.get(authCacheContext);
    const promiseCache = context.get(authContext);
    const appConfig = getConfig(context);
    if (!storage || !cache || !promiseCache) {
        throw new Error('updateAuth must be used within the Commerce API middleware');
    }

    // Update storage data
    updateAuthStorageData(storage, updater, appConfig);
    cache.ref = storage.has('error') ? undefined : unpackStorage<AuthData>(storage);
    promiseCache.ref = storage.has('error')
        ? createAuthPromise(context, undefined)
        : createAuthPromise(context, cache.ref);
};

export const destroyAuth = (context: Readonly<RouterContextProvider>): void => {
    const storage = context.get(authStorageContext);
    const cache = context.get(authCacheContext);
    const promiseCache = context.get(authContext);
    if (!storage || !cache || !promiseCache) {
        throw new Error('destroyAuth must be used within the Commerce API middleware');
    }

    // Unset storage data
    clearStorage(storage);
    cache.ref = undefined;
    promiseCache.ref = createAuthPromise(context, cache.ref);

    // Mark storage as destroyed
    storage.set('isDestroyed', true);
};

export const flashAuth = (context: Readonly<RouterContextProvider>, message?: string): void => {
    const storage = context.get(authStorageContext);
    const cache = context.get(authCacheContext);
    const promiseCache = context.get(authContext);
    if (!storage || !cache || !promiseCache) {
        throw new Error('flashAuth must be used within the Commerce API middleware');
    }

    // Unset storage data
    clearStorage(storage);
    cache.ref = undefined;
    promiseCache.ref = createAuthPromise(context, cache.ref);

    // Set the error message
    storage.set('error', message ?? '');
};

/**
 * Clear invalid session and restore a fresh guest session.
 * This is useful when a customer is deleted or session is corrupted.
 * Cookies are deleted via the 'isDestroyed' flag, which triggers
 * the middleware's response section to send Set-Cookie deletion headers.
 */
export const clearInvalidSessionAndRestoreGuest = async (context: Readonly<RouterContextProvider>): Promise<void> => {
    const logger = getLogger(context);
    const { t } = getTranslation();
    const storage = context.get(authStorageContext);
    const cache = context.get(authCacheContext);
    const promiseCache = context.get(authContext);

    if (!storage || !cache || !promiseCache) {
        throw new Error('clearInvalidSessionAndRestoreGuest must be used within auth middleware');
    }

    logger.info('Auth: clearing invalid session and restoring guest');

    // Clear in-memory storage and cache
    clearStorage(storage);
    cache.ref = undefined;

    try {
        // Get new guest session (no usid - start completely fresh)
        const tokenResponse = await loginGuestUser(context, { usid: undefined });
        await updateStorageAndCache(context, storage, cache, tokenResponse);
        promiseCache.ref = createAuthPromise(context, cache.ref);

        // Mark for destruction - triggers cookie deletion in response section
        storage.set('isDestroyed', true);
        logger.info('Auth: guest session restored successfully');
    } catch (error) {
        // If guest login fails, still mark for destruction and set error
        storage.set('isDestroyed', true);
        storage.set('error', t('errors:guestAccessTokenFailed'));
        logger.error('Auth: guest session restore failed', { error });
        throw error;
    }
};

export default authMiddleware;
