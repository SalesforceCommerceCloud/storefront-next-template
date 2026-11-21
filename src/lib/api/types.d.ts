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
import type { TrackingConsent } from '@/types/tracking-consent';
import type { ActingAgent } from '@/lib/auth/trusted-agent/types';

export type SessionData = {
    authMode?: 'shopper' | 'trusted-agent';
    actingAgent?: ActingAgent;
    /** Private provenance for accepting credentials across local authentication transitions. */
    authGeneration?: string;
    accessToken?: string;
    accessTokenExpiry?: number;
    refreshToken?: string;
    refreshTokenExpiry?: number;

    customerId?: string;
    userType?: 'guest' | 'registered';
    usid?: string;
    encUserId?: string;

    // social login - OAuth2 PKCE code verifier (server-side only, ephemeral)
    codeVerifier?: string;

    // IDP tokens (for social login)
    idpAccessToken?: string;
    idpAccessTokenExpiry?: number;
    // OIDC id_token (server-only; never serialized to the client via PublicSessionData).
    // Cookie expiry is reused from accessTokenExpiry at write time (matches PWA Kit's
    // process-token-response.js, where id_token tracks the access-token JWT exp).
    idToken?: string;
    // IDP refresh token (server-only; never serialized to the client via PublicSessionData).
    // Cookie expiry is reused from refreshTokenExpiry at write time (matches PWA Kit, where
    // idp_refresh_token shares the SLAS refresh-token TTL).
    idpRefreshToken?: string;

    // hybrid
    dwsid?: string;

    /**
     * Tracking consent preference using TrackingConsent enum.
     * - TrackingConsent.Accepted ('0') = tracking allowed
     * - TrackingConsent.Declined ('1') = tracking declined
     * Optional - only present when tracking consent feature is enabled in config.
     * @optional
     */
    trackingConsent?: TrackingConsent;
};

/**
 * Public (non-sensitive) session data that can be safely exposed to the client.
 * This type is used for data that can be safely serialized and sent to the client.
 * It excludes sensitive fields like accessToken, refreshToken, and codeVerifier.
 *
 * Derived from SessionData using Pick to ensure type safety - if the underlying
 * fields change in SessionData, PublicSessionData will automatically stay in sync.
 *
 * Used by:
 * - Root loader to return auth data to client components
 * - AuthProvider to provide user info context
 * - Components that need user info without access to tokens
 */
export type PublicSessionData = Pick<
    SessionData,
    'customerId' | 'userType' | 'usid' | 'encUserId' | 'trackingConsent' | 'authMode' | 'actingAgent'
> & { authContextVersion?: string };

export type CustomQueryParameters = {
    [key in `c_${string}`]: string | number | boolean | string[] | number[];
};
