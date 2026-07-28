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

import type {
    AuthConfig,
    AuthNamespace,
    AuthResponse,
    TokenResponse,
    RawTokenResult,
    LoginAsGuestOptions,
    LoginWithCredentialsOptions,
    RefreshTokenOptions,
    LogoutOptions,
    PasswordlessAuthorizeOptions,
    PasswordlessExchangeTokenOptions,
    PasswordRequestResetOptions,
    PasswordResetOptions,
    OtpRequestOptions,
    OtpVerifyOptions,
    SocialGetAuthorizationUrlOptions,
    SocialAuthorizationUrlResult,
    SocialExchangeCodeOptions,
    WebAuthnAuthorizeRegistrationOptions,
    WebAuthnRegistrationStartOptions,
    WebAuthnRegistrationFinishOptions,
    WebAuthnAuthenticationStartOptions,
    WebAuthnAuthenticationFinishOptions,
    WebAuthnPasskeyUserOptions,
    WebAuthnDeletePasskeyCredentialOptions,
} from './types';
import {
    createCodeVerifier,
    generateCodeChallenge,
    getCodeAndUsidFromUrl,
    createBasicAuthHeader,
    extractCookieFromResponse,
} from './utils';

// Content-Type header for form-urlencoded endpoints (required by openapi-fetch for proper serialization)
const FORM_URLENCODED_HEADER = { 'Content-Type': 'application/x-www-form-urlencoded' };

// Cookie name for DemandWare Session ID (used for hybrid storefront session bridge)
const COOKIE_DWSID = 'dwsid';

// Re-export types for convenience
export type { AuthConfig, AuthNamespace, AuthResponse, TokenResponse, PasswordActionMode } from './types';
export type { LoginAsGuestOptions, LoginWithCredentialsOptions, RefreshTokenOptions, LogoutOptions } from './types';
export type { PasswordlessAuthorizeOptions, PasswordlessExchangeTokenOptions } from './types';
export type { PasswordRequestResetOptions, PasswordResetOptions } from './types';
export type { OtpRequestOptions, OtpVerifyOptions } from './types';
export type {
    SocialGetAuthorizationUrlOptions,
    SocialAuthorizationUrlResult,
    SocialExchangeCodeOptions,
} from './types';
export type {
    WebAuthnAuthorizeRegistrationOptions,
    WebAuthnRegistrationStartOptions,
    WebAuthnRegistrationFinishOptions,
    WebAuthnAuthenticationStartOptions,
    WebAuthnAuthenticationFinishOptions,
    WebAuthnPasskeyUserOptions,
    WebAuthnDeletePasskeyCredentialOptions,
    WebAuthnNamespace,
    PublicKeyCredentialJson,
} from './types';

/**
 * Creates the auth helpers namespace.
 *
 * This factory function creates an auth namespace with methods for:
 * - Guest login (public or private SLAS client)
 * - Registered user login with credentials
 * - Token refresh
 * - Logout
 *
 * @param config - Configuration containing the ShopperLogin client and auth parameters
 * @returns The auth namespace with all authentication methods
 *
 * @example
 * ```typescript
 * const auth = createAuthHelpers({
 *   shopperLoginClient: clients.shopperLogin,
 *   clientId: 'your-client-id',
 *   clientSecret: process.env.SLAS_SECRET, // optional, for private client
 *   redirectUri: 'https://example.com/callback',
 *   organizationId: 'f_ecom_xxx',
 *   siteId: 'RefArch',
 * });
 *
 * const tokens = await auth.loginAsGuest();
 * ```
 */
export function createAuthHelpers(config: AuthConfig): AuthNamespace {
    const { shopperLoginClient, clientId, clientSecret, redirectUri, siteId, baseUrl, organizationId, proxyHost } =
        config;

    const isPrivateClient = !!clientSecret;

    /**
     * Adds the dwsid value to TokenResponse (extracted from Set-Cookie header).
     */
    function addDwsidToTokenData(result: RawTokenResult): AuthResponse {
        const dwsid = extractCookieFromResponse(result.response, COOKIE_DWSID);
        return { ...result.data, dwsid };
    }

    /**
     * Guest login using client_credentials grant.
     * Used for private SLAS clients (with clientSecret) and workspace environments.
     * Authorization header is included only when clientSecret is available.
     */
    async function loginGuestClientCredentials(options: LoginAsGuestOptions = {}): Promise<RawTokenResult> {
        const { usid, dnt } = options;

        const result = await shopperLoginClient.getAccessToken({
            params: {
                ...(clientSecret && {
                    header: {
                        Authorization: createBasicAuthHeader(clientId, clientSecret),
                    },
                }),
            },
            headers: FORM_URLENCODED_HEADER,
            body: {
                grant_type: 'client_credentials',
                channel_id: siteId,
                ...(usid && { usid }),
                ...(dnt !== undefined && { dnt: dnt.toString() }),
            },
        });

        return { data: result.data, response: result.response };
    }

    /**
     * Guest login for public SLAS client using PKCE flow.
     */
    async function loginGuestPublic(options: LoginAsGuestOptions = {}): Promise<RawTokenResult> {
        const { usid, dnt } = options;

        // Step 1: Generate PKCE code verifier and challenge
        const codeVerifier = createCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // Step 2: Call authorize endpoint to get authorization code
        // The authorizeCustomer endpoint returns a 303 redirect with code and usid
        // IMPORTANT: Use redirect: 'manual' to prevent fetch from following the redirect
        // Otherwise, fetch would follow the redirect to our callback URL, triggering
        // the auth middleware again and causing an infinite loop
        const authorizeResult = await shopperLoginClient.authorizeCustomer({
            params: {
                query: {
                    client_id: clientId,
                    channel_id: siteId,
                    redirect_uri: redirectUri,
                    response_type: 'code',
                    hint: 'guest',
                    code_challenge: codeChallenge,
                    ...(usid && { usid }),
                },
            },
            redirect: 'manual',
        });

        // Extract code and usid from the Location header (since we used redirect: 'manual')
        const redirectUrl = authorizeResult.response.headers.get('location') || '';
        const { code, usid: returnedUsid } = getCodeAndUsidFromUrl(redirectUrl);

        if (!code) {
            throw new Error('Failed to get authorization code from guest login');
        }

        // Step 3: Exchange authorization code for tokens
        const tokenResult = await shopperLoginClient.getAccessToken({
            params: {},
            headers: FORM_URLENCODED_HEADER,
            body: {
                grant_type: 'authorization_code_pkce',
                client_id: clientId,
                channel_id: siteId,
                code,
                code_verifier: codeVerifier,
                redirect_uri: redirectUri,
                usid: returnedUsid,
                ...(dnt !== undefined && { dnt: dnt.toString() }),
            },
        });

        return { data: tokenResult.data, response: tokenResult.response };
    }

    return {
        /**
         * Login as a guest user.
         * Automatically uses the appropriate flow based on configuration:
         * - Private client or workspace (clientSecret or proxyHost set): client_credentials grant
         * - Public client: PKCE flow
         */
        loginAsGuest: async (options: LoginAsGuestOptions = {}): Promise<AuthResponse> => {
            const result =
                proxyHost || isPrivateClient
                    ? await loginGuestClientCredentials(options)
                    : await loginGuestPublic(options);
            return addDwsidToTokenData(result);
        },

        /**
         * Login with username and password credentials.
         * Uses the B2C registered user login flow with PKCE.
         */
        loginWithCredentials: async (credentials: LoginWithCredentialsOptions): Promise<AuthResponse> => {
            const { username, password, usid, dnt } = credentials;

            // Step 1: Generate PKCE code verifier and challenge
            const codeVerifier = createCodeVerifier();
            const codeChallenge = await generateCodeChallenge(codeVerifier);

            // Step 2: Authenticate customer with username/password
            // This returns a 303 redirect with authorization code
            // IMPORTANT: Use redirect: 'manual' to prevent fetch from following the redirect
            // Note: Authorization goes in params.header (OpenAPI-defined), Content-Type in headers (request-level)
            const authResult = await shopperLoginClient.authenticateCustomer({
                params: {
                    header: {
                        Authorization: `Basic ${btoa(`${username}:${password}`)}`,
                    },
                },
                headers: FORM_URLENCODED_HEADER,
                body: {
                    client_id: clientId,
                    channel_id: siteId,
                    redirect_uri: redirectUri,
                    response_type: 'code',
                    code_challenge: codeChallenge,
                    ...(usid && { usid }),
                },
                redirect: 'manual',
            });

            // Extract code and usid from the Location header (since we used redirect: 'manual')
            const redirectUrl = authResult.response.headers.get('location') || '';
            const { code, usid: returnedUsid } = getCodeAndUsidFromUrl(redirectUrl);

            if (!code) {
                throw new Error('Failed to get authorization code from credentials login');
            }

            // Step 3: Exchange authorization code for tokens
            const tokenBody = {
                grant_type: 'authorization_code_pkce' as const,
                client_id: clientId,
                channel_id: siteId,
                code,
                code_verifier: codeVerifier,
                redirect_uri: redirectUri,
                usid: returnedUsid,
                ...(dnt !== undefined && { dnt: dnt.toString() }),
            };

            // For private client, include client secret in auth header
            if (isPrivateClient && clientSecret) {
                const tokenResult = await shopperLoginClient.getAccessToken({
                    params: {
                        header: {
                            Authorization: createBasicAuthHeader(clientId, clientSecret),
                        },
                    },
                    headers: FORM_URLENCODED_HEADER,
                    body: tokenBody,
                });
                return addDwsidToTokenData({ data: tokenResult.data, response: tokenResult.response });
            }

            // For public client, no auth header needed
            const tokenResult = await shopperLoginClient.getAccessToken({
                params: {},
                headers: FORM_URLENCODED_HEADER,
                body: tokenBody,
            });
            return addDwsidToTokenData({ data: tokenResult.data, response: tokenResult.response });
        },

        /**
         * Refresh an access token using a refresh token.
         */
        refreshToken: async (options: RefreshTokenOptions): Promise<AuthResponse> => {
            const { refreshToken, dnt } = options;

            const body = {
                grant_type: 'refresh_token' as const,
                refresh_token: refreshToken,
                client_id: clientId,
                channel_id: siteId,
                ...(dnt !== undefined && { dnt: dnt.toString() }),
            };

            // For private client, include client secret in auth header
            if (isPrivateClient && clientSecret) {
                const result = await shopperLoginClient.getAccessToken({
                    params: {
                        header: {
                            Authorization: createBasicAuthHeader(clientId, clientSecret),
                        },
                    },
                    headers: FORM_URLENCODED_HEADER,
                    body,
                });
                return addDwsidToTokenData({ data: result.data, response: result.response });
            }

            // For public client, no auth header needed
            const result = await shopperLoginClient.getAccessToken({
                params: {},
                headers: FORM_URLENCODED_HEADER,
                body,
            });
            return addDwsidToTokenData({ data: result.data, response: result.response });
        },

        /**
         * Logout a shopper and revoke tokens.
         */
        logout: async (options: LogoutOptions): Promise<TokenResponse> => {
            const { accessToken, refreshToken } = options;

            const result = await shopperLoginClient.logoutCustomer({
                params: {
                    header: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                    query: {
                        client_id: clientId,
                        channel_id: siteId,
                        refresh_token: refreshToken,
                    },
                },
            });

            return result.data;
        },

        /**
         * Social/IDP login namespace.
         * Provides methods for social login via Google, Facebook, Apple, etc.
         */
        social: {
            getAuthorizationUrl: async (
                options: SocialGetAuthorizationUrlOptions
            ): Promise<SocialAuthorizationUrlResult> => {
                const { hint, redirectUri: overrideRedirectUri, usid } = options;

                // Generate PKCE code verifier and challenge
                const codeVerifier = createCodeVerifier();
                const codeChallenge = await generateCodeChallenge(codeVerifier);

                const effectiveRedirectUri = overrideRedirectUri || redirectUri;

                // Construct the full authorization URL by appending to the baseUrl.
                // The baseUrl may include a proxy path (e.g., '/mobify/proxy/api'), so we use
                // a relative path (no leading /) to ensure proper concatenation.
                const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
                const authorizePath = `shopper/auth/v1/organizations/${organizationId}/oauth2/authorize`;
                const authorizeUrl = new URL(authorizePath, normalizedBaseUrl);

                authorizeUrl.searchParams.set('client_id', clientId);
                authorizeUrl.searchParams.set('channel_id', siteId);
                authorizeUrl.searchParams.set('redirect_uri', effectiveRedirectUri);
                authorizeUrl.searchParams.set('response_type', 'code');
                authorizeUrl.searchParams.set('hint', hint);
                authorizeUrl.searchParams.set('code_challenge', codeChallenge);
                if (usid) {
                    authorizeUrl.searchParams.set('usid', usid);
                }

                return {
                    url: authorizeUrl.toString(),
                    codeVerifier,
                };
            },

            exchangeCode: async (options: SocialExchangeCodeOptions): Promise<AuthResponse> => {
                const { code, codeVerifier, redirectUri: callbackRedirectUri, usid, dnt } = options;

                const tokenBody = {
                    grant_type: 'authorization_code_pkce' as const,
                    client_id: clientId,
                    channel_id: siteId,
                    code,
                    code_verifier: codeVerifier,
                    redirect_uri: callbackRedirectUri,
                    ...(usid && { usid }),
                    ...(dnt !== undefined && { dnt: dnt.toString() }),
                };

                // For private client, include client secret in auth header
                if (isPrivateClient && clientSecret) {
                    const tokenResult = await shopperLoginClient.getAccessToken({
                        params: {
                            header: {
                                Authorization: createBasicAuthHeader(clientId, clientSecret),
                            },
                        },
                        headers: FORM_URLENCODED_HEADER,
                        body: tokenBody,
                    });
                    return addDwsidToTokenData({ data: tokenResult.data, response: tokenResult.response });
                }

                // For public client, no auth header needed
                const tokenResult = await shopperLoginClient.getAccessToken({
                    params: {},
                    headers: FORM_URLENCODED_HEADER,
                    body: tokenBody,
                });
                return addDwsidToTokenData({ data: tokenResult.data, response: tokenResult.response });
            },
        },

        /**
         * Passwordless login namespace.
         * Only available when clientSecret is configured (private SLAS client).
         */
        passwordless: {
            authorize: async (options: PasswordlessAuthorizeOptions) => {
                const {
                    userId,
                    callbackUri,
                    usid,
                    mode = 'email',
                    locale,
                    registerCustomer,
                    lastName,
                    email,
                    firstName,
                    phoneNumber,
                    customerNo,
                    strictVerify,
                } = options;

                if (!clientSecret) {
                    throw new Error('Client secret is required for passwordless login');
                }

                if (mode === 'callback' && !callbackUri) {
                    throw new Error('callbackUri is required for callback mode');
                }

                const requestBody = {
                    user_id: userId,
                    mode,
                    channel_id: siteId,
                    ...(mode === 'callback' && callbackUri && { callback_uri: callbackUri }),
                    ...(usid && { usid }),
                    ...(locale && { locale }),
                    ...(registerCustomer && lastName && { last_name: lastName }),
                    ...(registerCustomer && email && { email }),
                    ...(registerCustomer && firstName && { first_name: firstName }),
                    ...(phoneNumber && { phone_number: phoneNumber }),
                    ...(customerNo && { customer_no: customerNo }),
                };

                const query: Record<string, string> = {};
                if (registerCustomer === true) query.register_customer = 'true';
                if (strictVerify === true) query.strict_verify = 'true';

                return shopperLoginClient.authorizePasswordlessCustomer({
                    params: {
                        header: {
                            Authorization: createBasicAuthHeader(clientId, clientSecret),
                        },
                        ...(Object.keys(query).length > 0 && { query }),
                    },
                    headers: FORM_URLENCODED_HEADER,
                    body: requestBody,
                });
            },

            exchangeToken: async (options: PasswordlessExchangeTokenOptions): Promise<AuthResponse> => {
                const { pwdlessLoginToken, dnt } = options;

                if (!clientSecret) {
                    throw new Error('Client secret is required for passwordless token exchange');
                }

                const codeVerifier = createCodeVerifier();

                const result = await shopperLoginClient.getPasswordLessAccessToken({
                    params: {
                        header: {
                            Authorization: createBasicAuthHeader(clientId, clientSecret),
                        },
                    },
                    headers: FORM_URLENCODED_HEADER,
                    body: {
                        grant_type: 'client_credentials' as const,
                        hint: 'pwdless_login',
                        pwdless_login_token: pwdlessLoginToken,
                        code_verifier: codeVerifier,
                        ...(dnt !== undefined && { dnt: dnt.toString() }),
                    },
                });

                return addDwsidToTokenData({ data: result.data, response: result.response });
            },
        },

        /**
         * Password management namespace.
         */
        password: {
            requestReset: async (options: PasswordRequestResetOptions) => {
                const { userId, callbackUri, mode = 'email', locale, codeChallenge, hint = 'cross_device' } = options;

                if (mode === 'callback' && !callbackUri) {
                    throw new Error('callbackUri is required when mode is "callback"');
                }

                const headers: Record<string, string> = {
                    ...FORM_URLENCODED_HEADER,
                };

                // For private client, include client secret in auth header
                if (isPrivateClient && clientSecret) {
                    headers.Authorization = createBasicAuthHeader(clientId, clientSecret);
                }

                return shopperLoginClient.getPasswordResetToken({
                    params: {},
                    headers,
                    body: {
                        user_id: userId,
                        mode,
                        channel_id: siteId,
                        client_id: clientId,
                        ...(mode === 'callback' && callbackUri && { callback_uri: callbackUri }),
                        hint,
                        ...(locale && { locale }),
                        ...(codeChallenge && { code_challenge: codeChallenge }),
                    },
                });
            },

            reset: async (options: PasswordResetOptions) => {
                const { userId, token, newPassword, codeVerifier, hint = 'cross_device' } = options;

                const requestBody = {
                    client_id: clientId,
                    user_id: userId,
                    pwd_action_token: token,
                    new_password: newPassword,
                    channel_id: siteId,
                    hint,
                    ...(codeVerifier && { code_verifier: codeVerifier }),
                };

                // For private client, include client secret in auth header
                if (isPrivateClient && clientSecret) {
                    return shopperLoginClient.resetPassword({
                        params: {
                            header: {
                                Authorization: createBasicAuthHeader(clientId, clientSecret),
                            },
                        },
                        headers: FORM_URLENCODED_HEADER,
                        body: requestBody,
                    });
                }

                return shopperLoginClient.resetPassword({
                    params: {},
                    headers: FORM_URLENCODED_HEADER,
                    body: requestBody,
                });
            },
        },

        /**
         * OTP (One-Time Password) namespace.
         * Only available when clientSecret is configured (private SLAS client).
         */
        otp: {
            request: async (options: OtpRequestOptions) => {
                const { userId, email, mode, locale, callbackUri } = options;

                if (!clientSecret) {
                    throw new Error('Client secret is required for OTP operations');
                }

                if (mode === 'callback' && !callbackUri) {
                    throw new Error('callbackUri is required when mode is "callback"');
                }

                if (mode === 'email' && !email) {
                    throw new Error('email is required when mode is "email"');
                }

                const requestBody = {
                    client_id: clientId,
                    channel_id: siteId,
                    user_id: userId,
                    ...(email && { email }),
                    mode,
                    ...(locale && { locale }),
                    ...(callbackUri && { callback_uri: callbackUri }),
                };

                return await shopperLoginClient.requestOtp({
                    params: {},
                    headers: FORM_URLENCODED_HEADER,
                    body: requestBody,
                });
            },

            verify: async (options: OtpVerifyOptions) => {
                const { pwdActionToken, userId } = options;

                if (!clientSecret) {
                    throw new Error('Client secret is required for OTP operations');
                }

                return await shopperLoginClient.verifyOtp({
                    params: {},
                    headers: FORM_URLENCODED_HEADER,
                    body: {
                        client_id: clientId,
                        pwd_action_token: pwdActionToken,
                        channel_id: siteId,
                        user_id: userId,
                    },
                });
            },
        },

        /**
         * WebAuthn / passkey namespace.
         * Registration works with either a public or private SLAS client. Authentication
         * (start/finish) requires a clientSecret (private SLAS client) in this client;
         * management (get/delete passkey) authenticates with the shopper's access token.
         * Requires the `sfcc.pwdless_login` scope on the SLAS client.
         */
        webAuthn: {
            authorizeRegistration: async (options: WebAuthnAuthorizeRegistrationOptions) => {
                const { userId, mode, callbackUri, locale } = options;

                if (mode === 'callback' && !callbackUri) {
                    throw new Error('callbackUri is required when mode is "callback"');
                }

                // SLAS passkey registration works with either a public or private client. Only a
                // private client (clientSecret present) sends the Basic auth header; a public
                // client authenticates by client_id in the body alone.
                return shopperLoginClient.authorizeWebauthnRegistration({
                    params: {
                        ...(clientSecret && {
                            header: {
                                Authorization: createBasicAuthHeader(clientId, clientSecret),
                            },
                        }),
                    },
                    headers: FORM_URLENCODED_HEADER,
                    body: {
                        user_id: userId,
                        mode,
                        channel_id: siteId,
                        client_id: clientId,
                        ...(mode === 'callback' && callbackUri && { callback_uri: callbackUri }),
                        ...(locale && { locale }),
                    },
                });
            },

            startRegistration: async (options: WebAuthnRegistrationStartOptions) => {
                const { pwdActionToken, userId, displayName, nickName } = options;

                // Public or private client — only a private client sends the Basic auth header.
                return shopperLoginClient.startWebauthnUserRegistration({
                    params: {
                        ...(clientSecret && {
                            header: {
                                Authorization: createBasicAuthHeader(clientId, clientSecret),
                            },
                        }),
                    },
                    headers: FORM_URLENCODED_HEADER,
                    body: {
                        client_id: clientId,
                        pwd_action_token: pwdActionToken,
                        user_id: userId,
                        channel_id: siteId,
                        ...(displayName && { display_name: displayName }),
                        ...(nickName && { nick_name: nickName }),
                    },
                });
            },

            finishRegistration: async (options: WebAuthnRegistrationFinishOptions) => {
                const { userId, pwdActionToken, credential } = options;

                // Public or private client — only a private client sends the Basic auth header.
                return shopperLoginClient.finishWebauthnUserRegistration({
                    params: {
                        ...(clientSecret && {
                            header: {
                                Authorization: createBasicAuthHeader(clientId, clientSecret),
                            },
                        }),
                    },
                    body: {
                        client_id: clientId,
                        channel_id: siteId,
                        username: userId,
                        pwd_action_token: pwdActionToken,
                        credential,
                    },
                });
            },

            startAuthentication: async (options: WebAuthnAuthenticationStartOptions = {}) => {
                const { userId } = options;

                if (!clientSecret) {
                    throw new Error('Client secret is required for WebAuthn operations');
                }

                return shopperLoginClient.startWebauthnAuthentication({
                    params: {
                        header: {
                            Authorization: createBasicAuthHeader(clientId, clientSecret),
                        },
                    },
                    headers: FORM_URLENCODED_HEADER,
                    body: {
                        client_id: clientId,
                        channel_id: siteId,
                        ...(userId && { user_id: userId }),
                    },
                });
            },

            finishAuthentication: async (options: WebAuthnAuthenticationFinishOptions): Promise<AuthResponse> => {
                const { credential, usid } = options;

                if (!clientSecret) {
                    throw new Error('Client secret is required for WebAuthn operations');
                }

                const result = await shopperLoginClient.finishWebauthnAuthentication({
                    params: {
                        header: {
                            Authorization: createBasicAuthHeader(clientId, clientSecret),
                        },
                    },
                    body: {
                        client_id: clientId,
                        channel_id: siteId,
                        credential,
                        ...(usid && { usid }),
                    },
                });

                if (!result.data.tokenResponse) {
                    throw new Error('WebAuthn authentication did not return a token response');
                }

                return addDwsidToTokenData({ data: result.data.tokenResponse, response: result.response });
            },

            getPasskeyUser: async (options: WebAuthnPasskeyUserOptions) => {
                const { accessToken, loginId } = options;

                return shopperLoginClient.getPasskeyUserByLoginId({
                    params: {
                        path: { loginId },
                        query: { channel_id: siteId },
                        header: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    },
                });
            },

            deletePasskeyUser: async (options: WebAuthnPasskeyUserOptions) => {
                const { accessToken, loginId } = options;

                return shopperLoginClient.deletePasskeyUser({
                    params: {
                        path: { loginId },
                        query: { channel_id: siteId },
                        header: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    },
                });
            },

            deletePasskeyCredential: async (options: WebAuthnDeletePasskeyCredentialOptions) => {
                const { accessToken, loginId, credentialId } = options;

                return shopperLoginClient.deletePasskeyCredential({
                    params: {
                        path: { loginId, credentialId },
                        query: { channel_id: siteId },
                        header: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    },
                });
            },
        },
    };
}
