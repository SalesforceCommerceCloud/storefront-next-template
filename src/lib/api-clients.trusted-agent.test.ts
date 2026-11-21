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
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterContextProvider, createCookie } from 'react-router';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { parseTrustedAgentToken, AuthTokenInvalidError } from '@/scapi';
import { createApiClients, createTrustedAgentClient } from '@/lib/api-clients.server';
import { authContext, authStorageContext } from '@/middlewares/auth.utils';
import authMiddleware, { getAuth, updateTrustedAgentSession } from '@/middlewares/auth.server';
import { mockConfig, mockSiteObject } from '@/test-utils/config';
import { createMaintenance, maintenanceContext } from '@/lib/maintenance';

vi.mock('@/lib/origin', () => ({ getAppOrigin: () => 'https://store.example' }));
// A merchant override must be the actual transport used by the dedicated TAOB helper.
vi.mock('@/scapi/custom-clients', () => ({
    customClients: [
        {
            key: 'shopperLogin',
            basePath: '/merchant-auth',
            locale: false,
            orgPrefix: false,
            ops: {
                getTrustedAgentAuthorizationToken: {
                    m: 'GET',
                    b: '/organizations/{organizationId}/oauth2',
                    s: '/trusted-agent/authorize',
                },
                getTrustedAgentAccessToken: {
                    m: 'POST',
                    b: '/organizations/{organizationId}/oauth2',
                    s: '/trusted-agent/token',
                },
            },
        },
    ],
}));

const fetchMock = vi.fn<typeof fetch>();
const settings = { organizationId: 'f_ecom_test_001', clientId: 'dedicated-taob', siteId: mockSiteObject.id };
const loginId = 'shopper@example.com';

function makeContext() {
    const context = new RouterContextProvider();
    const config = structuredClone(mockConfig);
    config.commerce.api.organizationId = settings.organizationId;
    config.features.trustedAgent = { enabled: true, clientId: settings.clientId, callbackUri: '/login/agent/callback' };
    config.url = { ...config.url, prefix: '' };
    context.set(appConfigContext, config);
    context.set(siteContext, {
        site: mockSiteObject,
        locale: mockSiteObject.supportedLocales[0],
        currency: mockSiteObject.defaultCurrency,
        siteCookie: createCookie('site'),
        localeCookie: createCookie('locale'),
        currencyCookie: createCookie('currency'),
    });
    context.set(maintenanceContext, createMaintenance());
    context.set(authStorageContext, new Map());
    context.set(authContext, {
        ref: Promise.resolve({ accessToken: 'previous-shopper-token', dwsid: 'previous-dwsid' }),
    });
    return context;
}

function makeResult() {
    const accessToken = `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900, dnt: true, sub: 'cc-slas::test_001::scid:dedicated-taob::usid:session-1', isb: `uido:ecom::upn:${loginId}::rcid:customer-1::chid:${settings.siteId}::agent:agent-1` })).toString('base64url')}.signature`;
    return { accessToken, identity: parseTrustedAgentToken(accessToken, { ...settings, loginId }) };
}

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
    vi.stubEnv('TAOB_COOKIE_KEYS', JSON.stringify([{ id: 'test', key: Buffer.alloc(32, 1).toString('base64url') }]));
    vi.stubEnv('COMMERCE_API_SLAS_SECRET', 'ordinary-secret');
    fetchMock.mockReset();
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('trusted agent SCAPI integration', () => {
    it('honors the final custom ShopperLogin client and neither inherits shopper Bearer nor private client credentials', async () => {
        const context = makeContext();
        fetchMock.mockResolvedValueOnce(
            new Response(null, { status: 303, headers: { Location: 'https://account.example/login' } })
        );
        const authorization = await createTrustedAgentClient(context).authorizeRegistered({ loginId });
        const authorizeRequest = fetchMock.mock.calls[0][0] as Request;
        expect(authorizeRequest.url).toContain(
            '/merchant-auth/organizations/f_ecom_test_001/oauth2/trusted-agent/authorize'
        );
        expect(new URL(authorizeRequest.url).searchParams.get('client_id')).toBe('dedicated-taob');
        expect(authorizeRequest.headers.has('Authorization')).toBe(false);
        expect(authorizeRequest.headers.has('_sfdc_client_auth')).toBe(false);
        expect(authorizeRequest.headers.has('sfdc_dwsid')).toBe(false);
        const result = makeResult();
        fetchMock.mockResolvedValueOnce(
            Response.json({
                access_token: result.accessToken,
                token_type: 'Bearer',
                customer_id: 'customer-1',
                usid: 'session-1',
            })
        );
        expect(
            (
                await createTrustedAgentClient(context).exchangeCode({
                    loginId,
                    code: 'am-code',
                    codeVerifier: authorization.codeVerifier,
                })
            ).accessToken
        ).toBe(result.accessToken);
        const tokenRequest = fetchMock.mock.calls[1][0] as Request;
        expect(tokenRequest.headers.get('Authorization')).toBe('Bearer am-code');
        expect(tokenRequest.headers.has('_sfdc_client_auth')).toBe(false);
        expect(tokenRequest.headers.has('sfdc_dwsid')).toBe(false);
    });

    it('injects the same TAOB identity returned by getAuth and blocks further commerce after a wrapped 401', async () => {
        const context = makeContext();
        const result = makeResult();
        const request = new Request('https://store.example/login/agent/callback');
        fetchMock.mockResolvedValueOnce(Response.json({ id: 'product-1' }));
        // A real Response URL lets the SDK distinguish a commerce 401 from an auth-endpoint failure.
        const rejected = Response.json({ error: 'invalid' }, { status: 401 });
        Object.defineProperty(rejected, 'url', {
            value: 'https://scapi.example/product/shopper-products/v1/products/product-1',
        });
        fetchMock.mockResolvedValueOnce(rejected);
        const response = await authMiddleware(
            { context, request, params: {}, pattern: '/', url: new URL(request.url) },
            async () => {
                await updateTrustedAgentSession(context, result);
                const clients = createApiClients(context);
                await clients.shopperProducts.getProduct({ params: { path: { id: 'product-1' } } });
                expect((fetchMock.mock.calls[0][0] as Request).headers.get('Authorization')).toBe(
                    `Bearer ${getAuth(context).accessToken}`
                );
                await expect(
                    clients.shopperProducts.getProduct({ params: { path: { id: 'product-2' } } })
                ).rejects.toBeInstanceOf(AuthTokenInvalidError);
                expect(getAuth(context).accessToken).toBeUndefined();
                expect(await context.get(authContext).ref).toEqual(getAuth(context));
                await expect(
                    clients.shopperProducts.getProduct({ params: { path: { id: 'product-3' } } })
                ).rejects.toBeInstanceOf(AuthTokenInvalidError);
                // A route-specific error wrapper must not hide invalidation from root middleware.
                return Response.json({ error: 'wrapped-commerce-error' }, { status: 400 });
            }
        );
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect((response as Response).headers.get('x-sfnext-auth-error')).toBe('TAOB_REAUTH_REQUIRED');
        expect(getAuth(context).actingAgent?.status).toBe('reauth-required');
        expect(getAuth(context).accessToken).toBeUndefined();
        expect(await context.get(authContext).ref).toEqual(getAuth(context));
    });
});
