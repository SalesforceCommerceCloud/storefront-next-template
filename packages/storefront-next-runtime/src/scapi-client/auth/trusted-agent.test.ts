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
// @vitest-environment node
import { inspect } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { createCommerceApiClients } from '../createClients';
import { createTrustedAgentHelpers, parseTrustedAgentToken, TrustedAgentError } from './trusted-agent';
import { generateCodeChallenge } from './utils';

const config = {
    clientId: 'taob-client',
    organizationId: 'f_ecom_test_001',
    siteId: 'RefArch',
    redirectUri: 'https://store.example/login/agent/callback',
};
const loginId = 'Support Shopper+é &?=@example.com';
const codeVerifier = 'v'.repeat(64);

function token(overrides: Record<string, unknown> = {}) {
    const claims = {
        sub: 'cc-slas::test_001::usid:session-1::scid:taob-client',
        isb: `agent:agent-1::chid:RefArch::rcid:customer-1::upn:${loginId}::uido:ecom`,
        exp: Math.floor(Date.now() / 1000) + 900,
        dnt: true,
        ...overrides,
    };
    return `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
}

function setup(fetch = vi.fn<typeof globalThis.fetch>()) {
    const clients = createCommerceApiClients({
        ...config,
        baseUrl: 'https://scapi.example/proxy',
        fetch,
        clientSecret: 'ordinary-secret',
    });
    return {
        fetch,
        clients,
        helpers: createTrustedAgentHelpers({ ...config, shopperLoginClient: clients.shopperLogin }),
    };
}

describe('registered TAOB protocol', () => {
    it('uses a server-prepared verifier so the transaction can be committed before external authorization', async () => {
        const { fetch, helpers } = setup();
        fetch.mockResolvedValueOnce(
            new Response(null, { status: 303, headers: { Location: 'https://account.example/authorize' } })
        );
        const authorization = await helpers.authorizeRegistered({ loginId, codeVerifier });
        expect(authorization.codeVerifier).toBe(codeVerifier);
        expect(new URL((fetch.mock.calls[0][0] as Request).url).searchParams.get('code_challenge')).toBe(
            await generateCodeChallenge(codeVerifier)
        );
        await expect(helpers.authorizeRegistered({ loginId, codeVerifier: 'invalid' })).rejects.toThrow(
            TrustedAgentError
        );
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('does not turn an unexpected commerce redirect into a successful operation', async () => {
        const { fetch, clients } = setup();
        fetch.mockResolvedValueOnce(
            new Response(null, { status: 303, headers: { Location: 'https://unexpected.example' } })
        );
        await expect(
            clients.shopperProducts.getProduct({ params: { path: { id: 'product' } }, redirect: 'manual' })
        ).rejects.toMatchObject({ name: 'ApiError', status: 303 });
    });
    it('uses the configured SDK transport, safely encodes identifiers, and returns manual AM navigation with real PKCE', async () => {
        const { fetch, helpers } = setup();
        fetch.mockResolvedValueOnce(
            new Response(null, {
                status: 303,
                headers: { Location: 'https://account.example/authorize?state=provider' },
            })
        );
        const result = await helpers.authorizeRegistered({ loginId });
        const request = fetch.mock.calls[0][0] as Request;
        const url = new URL(request.url);
        expect(url.origin).toBe('https://scapi.example');
        expect(url.pathname).toBe(
            '/proxy/shopper/auth/v1/organizations/f_ecom_test_001/oauth2/trusted-agent/authorize'
        );
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
            client_id: config.clientId,
            channel_id: config.siteId,
            login_id: loginId,
            redirect_uri: config.redirectUri,
            idp_origin: 'ecom',
            response_type: 'code',
            code_challenge: await generateCodeChallenge(result.codeVerifier),
        });
        expect(url.searchParams.has('state')).toBe(false);
        expect(request.redirect).toBe('manual');
        expect(request.headers.has('Authorization')).toBe(false);
        expect(request.headers.has('_sfdc_client_auth')).toBe(false);
        expect(result.authorizationUrl).toBe('https://account.example/authorize?state=provider');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('exchanges code-as-Bearer with DNT/state/renewal USID and no refresh fabrication', async () => {
        const { fetch, helpers } = setup();
        const accessToken = token();
        fetch.mockResolvedValueOnce(
            Response.json(
                { access_token: accessToken, token_type: 'Bearer', usid: 'session-1', customer_id: 'customer-1' },
                { headers: { 'Set-Cookie': 'dwsid=new-session; HttpOnly; Secure' } }
            )
        );
        const result = await helpers.exchangeCode({
            loginId,
            code: 'am-code',
            codeVerifier,
            state: 'provider-state',
            usid: 'session-1',
            agentId: 'agent-1',
        });
        const request = fetch.mock.calls[0][0] as Request;
        expect(request.headers.get('Authorization')).toBe('Bearer am-code');
        expect(request.headers.has('_sfdc_client_auth')).toBe(false);
        expect(request.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
        expect(Object.fromEntries(new URLSearchParams(await request.text()))).toEqual({
            client_id: config.clientId,
            channel_id: config.siteId,
            grant_type: 'client_credentials',
            redirect_uri: config.redirectUri,
            login_id: loginId,
            idp_origin: 'ecom',
            code_verifier: codeVerifier,
            dnt: 'true',
            state: 'provider-state',
            usid: 'session-1',
        });
        expect(result).toEqual({
            accessToken,
            identity: {
                loginId,
                customerId: 'customer-1',
                agentId: 'agent-1',
                usid: 'session-1',
                tokenExpiresAt: expect.any(Number),
            },
            dwsid: 'new-session',
        });
        expect(result).not.toHaveProperty('refresh_token');
    });

    it.each([
        '',
        ' ',
        'guest',
        ' Guest ',
        'GUEST',
        'bad\nlogin',
    ])('rejects reserved/empty login %j before any request', async (invalid) => {
        const { fetch, helpers } = setup();
        await expect(helpers.authorizeRegistered({ loginId: invalid })).rejects.toBeInstanceOf(TrustedAgentError);
        await expect(helpers.exchangeCode({ loginId: invalid, code: 'code', codeVerifier })).rejects.toBeInstanceOf(
            TrustedAgentError
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([400, 401, 403, 500])('sanitizes upstream %i errors without guest recovery', async (status) => {
        const { fetch, helpers } = setup();
        fetch.mockImplementationOnce((request) => {
            const response = Response.json(
                { detail: `PII ${loginId} secret-code`, type: 'denied', title: 'Denied' },
                { status }
            );
            Object.defineProperty(response, 'url', {
                value: request instanceof Request ? request.url : String(request),
            });
            return Promise.resolve(response);
        });
        const error = await helpers
            .exchangeCode({ loginId, code: 'secret-code', codeVerifier })
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(TrustedAgentError);
        expect(error).toMatchObject({ stage: 'exchange', status });
        expect(error).not.toHaveProperty('cause');
        expect(JSON.stringify(error)).not.toContain(loginId);
        expect(String(error)).not.toContain('secret-code');
        expect(inspect(error)).not.toContain(loginId);
        expect(inspect(error)).not.toContain('secret-code');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each([
        'authorize',
        'exchange',
    ] as const)('preserves an already sanitized error from %s without replacing its stage, status, or instance', async (operation) => {
        const { fetch, helpers } = setup();
        const failure = new TrustedAgentError('claims', 403);
        fetch.mockRejectedValueOnce(failure);
        const result =
            operation === 'authorize'
                ? helpers.authorizeRegistered({ loginId })
                : helpers.exchangeCode({ loginId, code: 'code', codeVerifier });
        await expect(result).rejects.toBe(failure);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each([
        { name: 'invalid token claims', fields: { access_token: token({ dnt: false }) } },
        { name: 'malformed token', fields: { access_token: 'not-a-jwt' } },
        { name: 'expired token', fields: { access_token: token({ exp: 100 }) } },
        { name: 'response customer mismatch', fields: { customer_id: 'other-customer' } },
        { name: 'response USID mismatch', fields: { usid: 'other-session' } },
    ])('retains the claims stage after an exchange returns $name', async ({ fields }) => {
        const { fetch, helpers } = setup();
        fetch.mockResolvedValueOnce(
            Response.json({
                access_token: token(),
                token_type: 'Bearer',
                usid: 'session-1',
                customer_id: 'customer-1',
                ...fields,
            })
        );
        const failure = await helpers
            .exchangeCode({ loginId, code: 'secret-code', codeVerifier })
            .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(TrustedAgentError);
        expect(failure).toMatchObject({ stage: 'claims' });
        expect(failure).not.toHaveProperty('cause');
        expect(inspect(failure)).not.toContain(loginId);
        expect(inspect(failure)).not.toContain('secret-code');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('sanitizes unknown transport errors without retaining sensitive messages through a cause', async () => {
        const { fetch, helpers } = setup();
        fetch.mockRejectedValueOnce(new Error(`Transport failed for ${loginId}: secret-code`));
        const failure = await helpers
            .exchangeCode({ loginId, code: 'secret-code', codeVerifier })
            .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(TrustedAgentError);
        expect(failure).toMatchObject({ stage: 'exchange' });
        expect(failure).not.toHaveProperty('cause');
        expect(inspect(failure)).not.toContain(loginId);
        expect(inspect(failure)).not.toContain('secret-code');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each([
        undefined,
        'javascript:alert(1)',
        'http://account.example/login',
    ])('rejects missing/unsafe AM navigation %s', async (location) => {
        const { fetch, helpers } = setup();
        fetch.mockResolvedValueOnce(
            new Response(null, { status: 303, headers: location ? { Location: location } : {} })
        );
        await expect(helpers.authorizeRegistered({ loginId })).rejects.toBeInstanceOf(TrustedAgentError);
    });

    it.each([
        { isb: 'uido:slas::upn:Guest::gcid:guest::chid:RefArch::agent:agent-1' },
        { isb: `uido:ecom::upn:${loginId}::rcid:customer-1::chid:wrong::agent:agent-1` },
        { isb: `uido:ecom::upn:wrong::rcid:customer-1::chid:RefArch::agent:agent-1` },
        { sub: 'cc-slas::wrong::scid:taob-client::usid:session-1' },
        { sub: 'cc-slas::test_001::scid:wrong::usid:session-1' },
        { sub: 'cc-slas::test_001::scid:taob-client::usid:session-1::usid:session-2' },
        { dnt: false },
        { exp: 'tomorrow' },
    ])('rejects a mismatched/ambiguous claim contract %j', (claims) => {
        expect(() => parseTrustedAgentToken(token(claims), { ...config, loginId })).toThrow(TrustedAgentError);
    });

    it("accepts the string '1' that SLAS returns for the dnt claim", () => {
        expect(() => parseTrustedAgentToken(token({ dnt: '1' }), { ...config, loginId })).not.toThrow();
    });

    it('checks renewal actor and USID and returns expired identity only for protected restoration', async () => {
        expect(() => parseTrustedAgentToken(token(), { ...config, loginId, agentId: 'different' })).toThrow(
            expect.objectContaining({ name: 'TrustedAgentError', stage: 'claims' })
        );
        expect(() => parseTrustedAgentToken(token(), { ...config, loginId, usid: 'different' })).toThrow(
            expect.objectContaining({ name: 'TrustedAgentError', stage: 'claims' })
        );
        expect(
            parseTrustedAgentToken(token(), { ...config, loginId, agentId: 'agent-1', usid: 'session-1' })
        ).toMatchObject({ agentId: 'agent-1', usid: 'session-1' });
        const expired = token({ exp: 100 });
        expect(parseTrustedAgentToken(expired, { ...config, loginId }).tokenExpiresAt).toBe(100000);
        const { fetch, helpers } = setup();
        fetch.mockResolvedValueOnce(
            Response.json({ access_token: expired, token_type: 'Bearer', customer_id: 'customer-1', usid: 'session-1' })
        );
        await expect(helpers.exchangeCode({ loginId, code: 'code', codeVerifier })).rejects.toMatchObject({
            name: 'TrustedAgentError',
            stage: 'claims',
        });
    });
});
