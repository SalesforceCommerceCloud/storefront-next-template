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

import type { Client } from 'openapi-fetch';
import type { ShopperLogin } from '../types';
import type { ProxyClient } from '../proxy-types';
import type { operations as shopperLoginOps } from '../generated/auth-v1.operations';

/** WebAuthn credential as returned by the browser's navigator.credentials API. */
export type PublicKeyCredentialJson = ShopperLogin.schemas['PublicKeyCredentialJson'];

/**
 * Re-export TokenResponse from the generated SLAS types for convenience.
 * This is the base response structure from SLAS token endpoints.
 */
export type TokenResponse = ShopperLogin.schemas['TokenResponse'];

/**
 * Authentication response returned by all auth methods.
 *
 * Extends TokenResponse with the dwsid (DemandWare Session ID) which is
 * automatically extracted from the Set-Cookie response header. The dwsid
 * is used by hybrid storefronts for session management.
 */
export type AuthResponse = TokenResponse & {
    /** DemandWare Session ID extracted from Set-Cookie header (for hybrid storefronts) */
    dwsid?: string;
};

/**
 * Raw token result from SLAS API before processing.
 * Contains the parsed token data and the raw HTTP Response for header extraction.
 * @internal
 */
export interface RawTokenResult {
    /** Parsed token response data */
    data: TokenResponse;
    /** Raw fetch Response for accessing headers (e.g., Set-Cookie) */
    response: Response;
}

/**
 * The ShopperLogin client type used internally by auth helpers.
 */
export type ShopperLoginClient = ProxyClient<Client<ShopperLogin.endpoints>, typeof shopperLoginOps>;

/**
 * Configuration required to create auth helpers.
 *
 * These parameters are provided at client creation time and are used
 * by all auth methods automatically.
 */
export interface AuthConfig {
    /** The configured ShopperLogin client instance */
    shopperLoginClient: ShopperLoginClient;
    /** SLAS client ID */
    clientId: string;
    /** SLAS client secret (required for private client operations) */
    clientSecret?: string;
    /** OAuth redirect URI - must be registered in SLAS */
    redirectUri: string;
    /** Commerce Cloud organization ID */
    organizationId: string;
    /** Commerce Cloud site ID (channel ID) */
    siteId: string;
    /** Base URL for Commerce API (e.g., 'https://{shortCode}.api.commercecloud.salesforce.com') */
    baseUrl: string;
    /** Direct SCAPI proxy URL for workspace environments. When set, guest login uses client_credentials grant directly. */
    proxyHost?: string;
}

/**
 * Options for guest login.
 */
export interface LoginAsGuestOptions {
    /** Unique Shopper Identifier to link to a previous session */
    usid?: string;
    /** Enable Do Not Track for the user */
    dnt?: boolean;
}

/**
 * Options for registered user login with credentials.
 */
export interface LoginWithCredentialsOptions {
    /** User's email/username */
    username: string;
    /** User's password */
    password: string;
    /** Unique Shopper Identifier to link to a previous session */
    usid?: string;
    /** Enable Do Not Track for the user */
    dnt?: boolean;
}

/**
 * Options for refreshing an access token.
 */
export interface RefreshTokenOptions {
    /** The refresh token to exchange for a new access token */
    refreshToken: string;
    /** Enable Do Not Track for the user */
    dnt?: boolean;
}

/**
 * Options for logging out a user.
 */
export interface LogoutOptions {
    /** The current access token */
    accessToken: string;
    /** The current refresh token */
    refreshToken: string;
}

/**
 * Delivery modes for passwordless login and password reset.
 * - 'callback': SLAS calls your callback URL with the token (requires Marketing Cloud for email)
 * - 'sms': SLAS sends an SMS with the code directly
 * - 'email': SLAS sends an email with the OTP code directly (no Marketing Cloud needed)
 */
export type PasswordActionMode = 'callback' | 'sms' | 'email';

/**
 * Options for initiating passwordless login.
 */
export interface PasswordlessAuthorizeOptions {
    /** User identifier (email or phone) */
    userId: string;
    /** Callback URI for the magic link (required for 'callback' mode) */
    callbackUri?: string;
    /** Unique Shopper Identifier to link to a previous session */
    usid?: string;
    /** Method to receive OTP */
    mode: PasswordActionMode;
    /** Locale of the template */
    locale?: string;
    /** When true, creates a new customer profile if one doesn't exist */
    registerCustomer?: boolean;
    /** User's last name (required when registerCustomer is true) */
    lastName?: string;
    /** User's email address (required when registerCustomer is true and userId is not an email) */
    email?: string;
    /** User's first name (optional when registerCustomer is true) */
    firstName?: string;
    /** User's phone number (optional when registerCustomer is true) */
    phoneNumber?: string;
    /** Customer number to assign (optional when registerCustomer is true) */
    customerNo?: string;
    /**
     * When true, sends `strict_verify=true` as a query parameter to SLAS.
     * SLAS will return HTTP 400 for shoppers whose email is registered but unverified.
     * The default behavior (without this flag) is HTTP 200 with an OTP sent to the
     * unverified email — useful for the verify-and-sign-in flow on the login page,
     * but undesirable on checkout where we route unverified shoppers to standard
     * password login up front.
     */
    strictVerify?: boolean;
}

/**
 * Options for exchanging a passwordless login token for access tokens.
 */
export interface PasswordlessExchangeTokenOptions {
    /** The passwordless login token from the magic link */
    pwdlessLoginToken: string;
    /** Enable Do Not Track for the user */
    dnt?: boolean;
}

/**
 * Options for requesting a password reset.
 */
export interface PasswordRequestResetOptions {
    /** User's email address */
    userId: string;
    /** Callback URI for the password reset link */
    callbackUri?: string;
    /** Locale of the template */
    locale?: string;
    /** Method to receive OTP */
    mode: PasswordActionMode;
    /** PKCE code challenge (required when hint is not cross_device) */
    codeChallenge?: string;
    /** Hint for password action. If not provided, 'cross_device' is sent by default. */
    hint?: string;
}
/**
 * Options for resetting a password with a token.
 */
export interface PasswordResetOptions {
    /** User's email address */
    userId: string;
    /** Password reset token from the magic link */
    token: string;
    /** New password to set */
    newPassword: string;
    /** PKCE code verifier (required when hint is not cross_device) */
    codeVerifier?: string;
    /** Hint for password action. If not provided, 'cross_device' is sent by default. */
    hint?: string;
}

/**
 * Options for requesting an OTP code.
 */
export interface OtpRequestOptions {
    /** User login ID (email or phone) */
    userId: string;
    /** Recipient email address (required when mode is 'email') */
    email?: string;
    /** Method to receive OTP */
    mode: PasswordActionMode;
    /** Locale of the template (e.g., 'en-us') */
    locale?: string;
    /** Callback URI (required when mode is 'callback') */
    callbackUri?: string;
}

/**
 * Options for verifying an OTP code.
 */
export interface OtpVerifyOptions {
    /** The OTP code received by the user (6-8 digit numeric) */
    pwdActionToken: string;
    /** User login ID (email or phone) */
    userId: string;
}

/**
 * Options for getting a social login authorization URL.
 */
export interface SocialGetAuthorizationUrlOptions {
    /**
     * The identity provider hint (e.g., 'google', 'facebook', 'apple').
     * This determines which social login provider to redirect to.
     */
    hint: string;
    /** Override the default redirect URI for this request */
    redirectUri?: string;
    /** Unique Shopper Identifier to link to a previous session */
    usid?: string;
}

/**
 * Result from getAuthorizationUrl containing the redirect URL and code verifier.
 */
export interface SocialAuthorizationUrlResult {
    /** The URL to redirect the user to for social login */
    url: string;
    /**
     * The PKCE code verifier that must be stored and passed to exchangeCode().
     * Store this securely (e.g., in an httpOnly cookie) until the user returns.
     */
    codeVerifier: string;
}

/**
 * Options for exchanging a social login authorization code for tokens.
 */
export interface SocialExchangeCodeOptions {
    /** The authorization code from the social provider callback */
    code: string;
    /** The PKCE code verifier from getAuthorizationUrl() */
    codeVerifier: string;
    /** The redirect URI that was used for authorization (must match) */
    redirectUri: string;
    /** Unique Shopper Identifier to link to a previous session */
    usid?: string;
    /** Enable Do Not Track for the user */
    dnt?: boolean;
}

/**
 * Options for authorizing WebAuthn registration.
 * Sends a TOTP to the user via the specified channel to verify identity before passkey creation.
 */
export interface WebAuthnAuthorizeRegistrationOptions {
    /** Shopper's email address — used as the SLAS login identifier (e.g. `'shopper@example.com'`). Obtain from the shopper's profile via Shopper Customers API. */
    userId: string;
    /** Delivery mode for the verification code */
    mode: PasswordActionMode;
    /** Callback URI (required when mode is 'callback') */
    callbackUri?: string;
    /** Locale for the verification message */
    locale?: string;
}

/**
 * Options for starting WebAuthn registration.
 */
export interface WebAuthnRegistrationStartOptions {
    /** The OTP/TOTP received by the user */
    pwdActionToken: string;
    /** Shopper's email address — used as the SLAS login identifier (e.g. `'shopper@example.com'`). Must match the `userId` passed to `authorizeRegistration`. */
    userId: string;
    /** Display name for the passkey (e.g. user's full name) */
    displayName?: string;
    /** Nickname for the passkey device (e.g. "My iPhone") */
    nickName?: string;
}

/**
 * Options for finishing WebAuthn registration.
 * The credential is the JSON response from the browser's WebAuthn API.
 */
export interface WebAuthnRegistrationFinishOptions {
    /** Shopper's email address — used as the SLAS login identifier (e.g. `'shopper@example.com'`). Must match the `userId` passed to `authorizeRegistration` and `startRegistration`. */
    userId: string;
    /** The OTP token used in startRegistration */
    pwdActionToken: string;
    /** Serialized PublicKeyCredential from navigator.credentials.create() */
    credential: PublicKeyCredentialJson;
}

/**
 * Options for starting WebAuthn authentication.
 */
export interface WebAuthnAuthenticationStartOptions {
    /** Shopper's email address (SLAS login identifier). When omitted, a discoverable-credential (usernameless) flow is used and the authenticator selects the credential. */
    userId?: string;
}

/**
 * Options for finishing WebAuthn authentication.
 * The credential is the JSON response from the browser's WebAuthn API.
 */
export interface WebAuthnAuthenticationFinishOptions {
    /** Serialized PublicKeyCredential from navigator.credentials.get() */
    credential: PublicKeyCredentialJson;
    /** Optional USID to carry over from the current guest session */
    usid?: string;
}

/**
 * Options for retrieving or deleting passkey user data.
 */
export interface WebAuthnPasskeyUserOptions {
    /** Shopper access token */
    accessToken: string;
    /** Shopper's email address — used as the SLAS login identifier (e.g. `'shopper@example.com'`). Obtain from the shopper's profile via Shopper Customers API. */
    loginId: string;
}

/**
 * Options for deleting a specific passkey credential.
 */
export interface WebAuthnDeletePasskeyCredentialOptions {
    /** Shopper access token */
    accessToken: string;
    /** Shopper's email address — used as the SLAS login identifier (e.g. `'shopper@example.com'`). Obtain from the shopper's profile via Shopper Customers API. */
    loginId: string;
    /** The credential ID to delete */
    credentialId: string;
}

/**
 * WebAuthn / passkey namespace.
 * Works with either a public or private SLAS client — a private client (clientSecret present)
 * sends the Basic auth header, a public client identifies via client_id in the request body.
 * Requires the `sfcc.pwdless_login` scope on the SLAS client.
 */
export interface WebAuthnNamespace {
    /**
     * Step 1 of passkey registration: authorize the user by sending them a TOTP.
     *
     * @param options - User ID and delivery mode
     */
    authorizeRegistration(
        options: WebAuthnAuthorizeRegistrationOptions
    ): ReturnType<ShopperLoginClient['authorizeWebauthnRegistration']>;

    /**
     * Step 2 of passkey registration: start registration and get credential creation options.
     * Pass the returned options to `navigator.credentials.create()`.
     *
     * @param options - TOTP and user details
     */
    startRegistration(
        options: WebAuthnRegistrationStartOptions
    ): ReturnType<ShopperLoginClient['startWebauthnUserRegistration']>;

    /**
     * Step 3 of passkey registration: finish registration by submitting the authenticator response.
     *
     * @param options - Credential from `navigator.credentials.create()`
     */
    finishRegistration(
        options: WebAuthnRegistrationFinishOptions
    ): ReturnType<ShopperLoginClient['finishWebauthnUserRegistration']>;

    /**
     * Step 1 of passkey authentication: get credential request options.
     * Pass the returned options to `navigator.credentials.get()`.
     *
     * @param options - Optional user ID (omit for discoverable-credential flow)
     */
    startAuthentication(
        options?: WebAuthnAuthenticationStartOptions
    ): ReturnType<ShopperLoginClient['startWebauthnAuthentication']>;

    /**
     * Step 2 of passkey authentication: verify the assertion and get tokens.
     *
     * @param options - Credential from `navigator.credentials.get()`
     * @returns Promise resolving to AuthResponse with access tokens and dwsid
     */
    finishAuthentication(options: WebAuthnAuthenticationFinishOptions): Promise<AuthResponse>;

    /**
     * Retrieve passkey user information and all registered credentials.
     * Requires a valid shopper access token.
     *
     * @param options - Access token and login ID
     */
    getPasskeyUser(options: WebAuthnPasskeyUserOptions): ReturnType<ShopperLoginClient['getPasskeyUserByLoginId']>;

    /**
     * Delete a passkey user and all associated credentials.
     * Requires a valid shopper access token.
     *
     * @param options - Access token and login ID
     */
    deletePasskeyUser(options: WebAuthnPasskeyUserOptions): ReturnType<ShopperLoginClient['deletePasskeyUser']>;

    /**
     * Delete a specific passkey credential for a user.
     * Requires a valid shopper access token.
     *
     * @param options - Access token, login ID, and credential ID
     */
    deletePasskeyCredential(
        options: WebAuthnDeletePasskeyCredentialOptions
    ): ReturnType<ShopperLoginClient['deletePasskeyCredential']>;
}

/**
 * Social/IDP login namespace.
 * Provides methods for social login via identity providers (Google, Facebook, Apple, etc.).
 */
export interface SocialNamespace {
    /**
     * Get the authorization URL for social login.
     *
     * Generates a PKCE code verifier and returns the URL to redirect the user to.
     * The code verifier must be stored securely and passed to exchangeCode() after
     * the user returns from the social provider.
     *
     * @param options - The IDP hint and optional parameters
     * @returns Promise resolving to the authorization URL and code verifier
     *
     * @example
     * ```typescript
     * const { url, codeVerifier } = await clients.auth.social.getAuthorizationUrl({
     *   hint: 'google',
     * });
     * // Store codeVerifier in httpOnly cookie
     * // Redirect user to url
     * ```
     */
    getAuthorizationUrl(options: SocialGetAuthorizationUrlOptions): Promise<SocialAuthorizationUrlResult>;

    /**
     * Exchange an authorization code from a social provider for access tokens.
     *
     * Called after the user returns from the social provider with an authorization code.
     * Requires the code verifier that was returned from getAuthorizationUrl().
     *
     * @param options - The authorization code, code verifier, and redirect URI
     * @returns Promise resolving to AuthResponse with access tokens and dwsid
     *
     * @example
     * ```typescript
     * const tokens = await clients.auth.social.exchangeCode({
     *   code: callbackParams.code,
     *   codeVerifier: storedCodeVerifier,
     *   redirectUri: 'https://example.com/social-callback',
     * });
     * console.log(tokens.access_token, tokens.dwsid);
     * ```
     */
    exchangeCode(options: SocialExchangeCodeOptions): Promise<AuthResponse>;
}

/**
 * Passwordless login namespace.
 * Only available when clientSecret is configured (private SLAS client).
 */
export interface PasswordlessNamespace {
    /**
     * Initiate passwordless login by sending a magic link to the user.
     *
     * @param options - User identifier and callback configuration
     * @returns Promise resolving to the API response (inferred from ShopperLogin client)
     */
    authorize(options: PasswordlessAuthorizeOptions): ReturnType<ShopperLoginClient['authorizePasswordlessCustomer']>;

    /**
     * Exchange a passwordless login token for access tokens.
     *
     * @param options - The passwordless token and optional parameters
     * @returns Promise resolving to AuthResponse with access tokens and dwsid
     */
    exchangeToken(options: PasswordlessExchangeTokenOptions): Promise<AuthResponse>;
}

/**
 * Password management namespace.
 */
export interface PasswordNamespace {
    /**
     * Request a password reset token to be sent to the user's email.
     *
     * @param options - User email and callback URI
     * @returns Promise resolving to the API response (inferred from ShopperLogin client)
     */
    requestReset(options: PasswordRequestResetOptions): ReturnType<ShopperLoginClient['getPasswordResetToken']>;

    /**
     * Reset a user's password using a reset token.
     *
     * @param options - Email, reset token, and new password
     * @returns Promise resolving to the API response (inferred from ShopperLogin client)
     */
    reset(options: PasswordResetOptions): ReturnType<ShopperLoginClient['resetPassword']>;
}

/**
 * OTP (One-Time Password) namespace.
 * Only available when clientSecret is configured (private SLAS client).
 */
export interface OtpNamespace {
    /**
     * Request an OTP code to be sent to the user.
     *
     * @param options - User identifier, mode, and delivery settings
     * @returns Promise resolving to void (202 Accepted, no body)
     */
    request(options: OtpRequestOptions): ReturnType<ShopperLoginClient['requestOtp']>;

    /**
     * Verify an OTP code.
     *
     * @param options - User identifier and OTP code
     * @returns Promise resolving to void (204 No Content, no body)
     */
    verify(options: OtpVerifyOptions): ReturnType<ShopperLoginClient['verifyOtp']>;
}

/**
 * Core authentication namespace.
 *
 * Provides methods for authentication operations:
 * - Guest login (public or private client)
 * - Registered user login with credentials
 * - Token refresh
 * - Logout
 * - Passwordless login (via `passwordless` sub-namespace)
 * - Password reset (via `password` sub-namespace)
 *
 * All methods that complete login return an AuthResponse containing access_token, refresh_token,
 * and dwsid (automatically extracted from the Set-Cookie response header for hybrid storefronts).
 */
export interface AuthNamespace {
    /**
     * Login as a guest user.
     *
     * For public SLAS clients, uses PKCE (Proof Key for Code Exchange) flow.
     * For private SLAS clients (with clientSecret), uses client_credentials grant.
     *
     * @param options - Optional parameters for guest login
     * @returns Promise resolving to AuthResponse with access tokens and dwsid
     *
     * @example
     * ```typescript
     * // Simple guest login
     * const tokens = await clients.auth.loginAsGuest();
     * console.log(tokens.access_token, tokens.dwsid);
     *
     * // With session linking
     * const tokens = await clients.auth.loginAsGuest({ usid: 'previous-session-id' });
     * ```
     */
    loginAsGuest(options?: LoginAsGuestOptions): Promise<AuthResponse>;

    /**
     * Login with username and password credentials.
     *
     * Uses the B2C registered user login flow with PKCE.
     * For private SLAS clients, the client secret is used for enhanced security.
     *
     * @param credentials - User credentials and optional parameters
     * @returns Promise resolving to AuthResponse with access tokens and dwsid
     *
     * @example
     * ```typescript
     * const tokens = await clients.auth.loginWithCredentials({
     *   username: 'user@example.com',
     *   password: 'password123'
     * });
     * console.log(tokens.access_token, tokens.dwsid);
     * ```
     */
    loginWithCredentials(credentials: LoginWithCredentialsOptions): Promise<AuthResponse>;

    /**
     * Refresh an access token using a refresh token.
     *
     * Use this to obtain a new access token when the current one expires.
     * The refresh token has a longer lifetime (typically 30 days).
     *
     * @param options - The refresh token and optional parameters
     * @returns Promise resolving to AuthResponse with new tokens and dwsid
     *
     * @example
     * ```typescript
     * const newTokens = await clients.auth.refreshToken({
     *   refreshToken: storedRefreshToken
     * });
     * console.log(newTokens.access_token, newTokens.dwsid);
     * ```
     */
    refreshToken(options: RefreshTokenOptions): Promise<AuthResponse>;

    /**
     * Logout a shopper and revoke tokens.
     *
     * Revokes both the access token and refresh token.
     * After logout, the tokens can no longer be used.
     *
     * @param options - The access and refresh tokens to revoke
     * @returns Promise resolving to TokenResponse
     *
     * @example
     * ```typescript
     * await clients.auth.logout({
     *   accessToken: currentAccessToken,
     *   refreshToken: currentRefreshToken
     * });
     * ```
     */
    logout(options: LogoutOptions): Promise<TokenResponse>;

    /**
     * Social/IDP login namespace.
     * Provides methods for social login via Google, Facebook, Apple, etc.
     *
     * @example
     * ```typescript
     * // Step 1: Get authorization URL and redirect user
     * const { url, codeVerifier } = await clients.auth.social.getAuthorizationUrl({
     *   hint: 'google',
     * });
     * // Store codeVerifier securely, then redirect user to url
     *
     * // Step 2: After user returns, exchange code for tokens
     * const tokens = await clients.auth.social.exchangeCode({
     *   code: callbackParams.code,
     *   codeVerifier: storedCodeVerifier,
     *   redirectUri: 'https://example.com/social-callback',
     * });
     * console.log(tokens.access_token, tokens.dwsid);
     * ```
     */
    social: SocialNamespace;

    /**
     * Passwordless login namespace.
     * Only available when clientSecret is configured (private SLAS client).
     *
     * @example
     * ```typescript
     * // Send magic link
     * await clients.auth.passwordless.authorize({
     *   userId: 'user@example.com',
     *   callbackUri: 'https://example.com/passwordless-callback',
     *   mode: 'callback'
     * });
     *
     * // Exchange token from magic link
     * const tokens = await clients.auth.passwordless.exchangeToken({
     *   pwdlessLoginToken: tokenFromUrl
     * });
     * console.log(tokens.access_token, tokens.dwsid);
     * ```
     */
    passwordless: PasswordlessNamespace;

    /**
     * Password management namespace.
     *
     * @example
     * ```typescript
     * // Request password reset
     * await clients.auth.password.requestReset({
     *   userId: 'user@example.com',
     *   callbackUri: 'https://example.com/reset-password'
     * });
     *
     * // Reset password with token
     * await clients.auth.password.reset({
     *   userId: 'user@example.com',
     *   token: tokenFromUrl,
     *   newPassword: 'newSecurePassword123'
     * });
     * ```
     */
    password: PasswordNamespace;

    /**
     * OTP (One-Time Password) namespace.
     * Only available when clientSecret is configured (private SLAS client).
     *
     * @example
     * ```typescript
     * // Request OTP code
     * await clients.auth.otp.request({
     *   userId: 'user@example.com',
     *   email: 'user@example.com',
     *   usid: 'session-id',
     *   mode: 'email'
     * });
     *
     * // Verify OTP code
     * await clients.auth.otp.verify({
     *   userId: 'user@example.com',
     *   pwdActionToken: '12345678'
     * });
     * ```
     */
    otp: OtpNamespace;

    /**
     * WebAuthn / passkey namespace.
     * Registration and authentication (start/finish) both work with either a public or
     * private SLAS client — only a private client (clientSecret present) sends the Basic
     * auth header, while a public client identifies via client_id in the request body;
     * management (get/delete passkey) authenticates with the shopper's access token.
     * Requires the `sfcc.pwdless_login` scope on the SLAS client.
     *
     * @example
     * ```typescript
     * // Registration flow
     * await clients.auth.webAuthn.authorizeRegistration({
     *   userId: 'user@example.com',
     *   mode: 'email',
     * });
     * const options = await clients.auth.webAuthn.startRegistration({
     *   pwdActionToken: '12345678',
     *   userId: 'user@example.com',
     * });
     * const credential = await navigator.credentials.create({ publicKey: options.data });
     * await clients.auth.webAuthn.finishRegistration({ userId: 'user@example.com', credential });
     *
     * // Authentication flow
     * const challengeOptions = await clients.auth.webAuthn.startAuthentication({
     *   userId: 'user@example.com',
     * });
     * const assertion = await navigator.credentials.get({ publicKey: challengeOptions.data });
     * const tokens = await clients.auth.webAuthn.finishAuthentication({ credential: assertion });
     * ```
     */
    webAuthn: WebAuthnNamespace;
}
