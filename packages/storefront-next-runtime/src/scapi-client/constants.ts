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
 * Path patterns for SLAS authentication endpoints.
 * These endpoints handle their own authentication (Basic auth, PKCE, etc.)
 * and should NOT have Bearer tokens auto-injected by middleware.
 *
 * Use with URL.pathname.includes() to check if a request targets a SLAS auth endpoint.
 *
 * @example
 * ```typescript
 * const isSlasAuthEndpoint = SLAS_AUTH_ENDPOINTS.some(path => url.pathname.includes(path));
 * if (isSlasAuthEndpoint) {
 *     // Skip Bearer token injection - endpoint handles its own auth
 *     return request;
 * }
 * ```
 */
export const SLAS_AUTH_ENDPOINTS = [
    '/oauth2/token',
    '/oauth2/authorize',
    '/oauth2/logout',
    '/oauth2/login',
    '/oauth2/passwordless',
    '/oauth2/password',
    '/oauth2/session-bridge',
    '/oauth2/trusted-agent',
    '/oauth2/trusted-system',
    '/oauth2/revoke',
    '/oauth2/introspect',
    // WebAuthn/passkey endpoints use Basic auth (clientId:clientSecret), not Bearer.
    // Bearer injection must be skipped so the endpoint-level Basic auth header is not overwritten.
    // A 401 from these endpoints means invalid OTP/credential, not a revoked access token.
    '/oauth2/webauthn',
] as const;
