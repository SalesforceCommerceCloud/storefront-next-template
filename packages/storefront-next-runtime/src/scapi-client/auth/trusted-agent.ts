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
import { decodeJwt } from 'jose';
import { ApiError } from '../ApiError';
import type { ShopperLogin } from '../types';
import type { TrustedAgentConfig, TrustedAgentHelpers, TrustedAgentIdentity } from './types';
import { createCodeVerifier, generateCodeChallenge, extractCookieFromResponse } from './utils';

/** Safe to log: contains no callback URL, login, code, token, or upstream response body. */
export class TrustedAgentError extends Error {
    constructor(
        public readonly stage: 'configuration' | 'authorize' | 'exchange' | 'claims',
        public readonly status?: number
    ) {
        super(`Trusted agent ${stage} failed`);
        this.name = 'TrustedAgentError';
    }
}

/** Validate without rewriting the registered login identifier. */
export function validateTrustedAgentLogin(loginId: string): void {
    if (
        typeof loginId !== 'string' ||
        !loginId.trim() ||
        loginId.trim().toLowerCase() === 'guest' ||
        loginId.length > 512 ||
        [...loginId].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    ) {
        throw new TrustedAgentError('authorize');
    }
}

function segment(value: unknown, key: string): string {
    if (typeof value !== 'string') throw new TrustedAgentError('claims');
    const matches = value.split('::').filter((part) => part.startsWith(`${key}:`));
    if (matches.length !== 1 || !matches[0].slice(key.length + 1)) throw new TrustedAgentError('claims');
    return matches[0].slice(key.length + 1);
}

/**
 * Parse and cross-check SLAS identity segments. This does NOT verify a signature.
 * Only use with a token from a successful server exchange or authenticated cookie provenance.
 * Expiry is returned even when elapsed so protected sessions can retain recovery identity.
 */
export function parseTrustedAgentToken(
    token: string,
    expected: Pick<TrustedAgentConfig, 'clientId' | 'siteId' | 'organizationId'> & {
        loginId: string;
        usid?: string;
        agentId?: string;
    }
): TrustedAgentIdentity {
    try {
        const claims = decodeJwt(token);
        const loginId = segment(claims.isb, 'upn');
        const customerId = segment(claims.isb, 'rcid');
        const agentId = segment(claims.isb, 'agent');
        const usid = segment(claims.sub, 'usid');
        // The tenant is the unlabelled SLAS subject prefix; identity fields are named segments.
        const tenantPrefix = `cc-slas::${expected.organizationId.replace(/^f_ecom_/, '')}::`;
        const tenantMatches = typeof claims.sub === 'string' && claims.sub.startsWith(tenantPrefix);
        const clientAndSiteMatch =
            segment(claims.sub, 'scid') === expected.clientId &&
            segment(claims.isb, 'chid') === expected.siteId &&
            segment(claims.isb, 'uido') === 'ecom';
        const shopperMatches = loginId === expected.loginId && loginId.trim().toLowerCase() !== 'guest';
        const renewalMatches =
            (expected.usid === undefined || usid === expected.usid) &&
            (expected.agentId === undefined || agentId === expected.agentId);
        const expiresAt = claims.exp;
        const expiryIsValid = typeof expiresAt === 'number' && Number.isSafeInteger(expiresAt) && expiresAt > 0;
        const privacyDeclined = claims.dnt === true || claims.dnt === 'true' || claims.dnt === '1';
        if (!tenantMatches || !clientAndSiteMatch || !shopperMatches || !renewalMatches || !privacyDeclined) {
            throw new TrustedAgentError('claims');
        }
        if (!expiryIsValid || expiresAt === undefined) throw new TrustedAgentError('claims');
        return { loginId, customerId, agentId, usid, tokenExpiresAt: expiresAt * 1000 };
    } catch (error) {
        if (error instanceof TrustedAgentError) throw error;
        throw new TrustedAgentError('claims');
    }
}

/**
 * Registered TAOB protocol for server-side callers. Uses the configured SDK transport,
 * including custom clients/proxies; never follows the human's Account Manager navigation.
 * Keep the verifier, code, and exchange response on the server.
 */
export function createTrustedAgentHelpers(config: TrustedAgentConfig): TrustedAgentHelpers {
    const { shopperLoginClient, clientId, organizationId, siteId, redirectUri } = config;
    const callback = URL.parse(redirectUri);
    if (
        !clientId ||
        !organizationId.startsWith('f_ecom_') ||
        !siteId ||
        !callback ||
        callback.username ||
        callback.password ||
        callback.hash ||
        (callback.protocol !== 'https:' && !(callback.protocol === 'http:' && callback.hostname === 'localhost'))
    ) {
        throw new TrustedAgentError('configuration');
    }

    return {
        async authorizeRegistered({ loginId, codeVerifier: preparedVerifier }) {
            validateTrustedAgentLogin(loginId);
            const codeVerifier = preparedVerifier ?? createCodeVerifier();
            if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) throw new TrustedAgentError('authorize');
            const codeChallenge = await generateCodeChallenge(codeVerifier);
            try {
                const result = await shopperLoginClient.getTrustedAgentAuthorizationToken({
                    params: {
                        query: {
                            client_id: clientId,
                            channel_id: siteId,
                            login_id: loginId,
                            idp_origin: 'ecom',
                            redirect_uri: redirectUri,
                            response_type: 'code',
                            code_challenge: codeChallenge,
                        },
                    },
                    redirect: 'manual',
                });
                const location = result.response.headers.get('location');
                const navigation = location ? URL.parse(location) : null;
                if (
                    result.response.status !== 303 ||
                    !navigation ||
                    navigation.protocol !== 'https:' ||
                    navigation.username ||
                    navigation.password
                ) {
                    throw new TrustedAgentError('authorize');
                }
                return { authorizationUrl: navigation.href, codeVerifier };
            } catch (error) {
                if (error instanceof TrustedAgentError) throw error;
                throw new TrustedAgentError('authorize', error instanceof ApiError ? error.status : undefined);
            }
        },
        async exchangeCode({ loginId, code, codeVerifier, state, usid, agentId }) {
            validateTrustedAgentLogin(loginId);
            if (!code || /[\r\n]/.test(code) || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
                throw new TrustedAgentError('exchange');
            }
            try {
                // The upstream schema omits redirect_uri although the PWA Kit protocol sends it.
                // Local intersection isolates this adaptation without modifying generated types.
                const body: ShopperLogin.schemas['TrustedAgentTokenRequest'] & { redirect_uri: string } = {
                    client_id: clientId,
                    channel_id: siteId,
                    grant_type: 'client_credentials',
                    login_id: loginId,
                    idp_origin: 'ecom',
                    code_verifier: codeVerifier,
                    redirect_uri: redirectUri,
                    dnt: 'true',
                    ...(state !== undefined && { state }),
                    ...(usid !== undefined && { usid }),
                };
                const result = await shopperLoginClient.getTrustedAgentAccessToken({
                    params: { header: { Authorization: `Bearer ${code}` } },
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body,
                    redirect: 'manual',
                });
                // The generated TokenResponse requires refresh fields that TAOB never returns.
                // Normalize only the fields this flow uses; do not fabricate an AuthResponse.
                const data = result.data;
                if (!data?.access_token || data.token_type?.toLowerCase() !== 'bearer')
                    throw new TrustedAgentError('exchange');
                const identity = parseTrustedAgentToken(data.access_token, {
                    clientId,
                    siteId,
                    organizationId,
                    loginId,
                    usid,
                    agentId,
                });
                if (
                    identity.tokenExpiresAt <= Date.now() ||
                    data.customer_id !== identity.customerId ||
                    data.usid !== identity.usid
                ) {
                    throw new TrustedAgentError('claims');
                }
                return {
                    accessToken: data.access_token,
                    identity,
                    dwsid: extractCookieFromResponse(result.response, 'dwsid'),
                };
            } catch (error) {
                if (error instanceof TrustedAgentError) throw error;
                throw new TrustedAgentError('exchange', error instanceof ApiError ? error.status : undefined);
            }
        },
    };
}
