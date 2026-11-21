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
import { AuthTokenInvalidError, parseTrustedAgentToken } from '@/scapi';
import authMiddleware, {
    getAuth,
    updateAuth,
    updateTrustedAgentSession,
    destroyAuth,
    clearInvalidSessionAndRestoreGuest,
} from '@/middlewares/auth.server';
import {
    authContext,
    authStorageContext,
    AUTH_TOKEN_INVALID_ERROR,
    getPublicSessionData,
} from '@/middlewares/auth.utils';
import {
    restoreTrustedAgentState,
    establishTrustedAgentState,
    persistTrustedAgentState,
    getTrustedAgentSessionData,
    setTrustedAgentTransaction,
    isTrustedAgentLifecycleRequest,
    readTrustedAgentLaunch,
} from '@/lib/auth/trusted-agent/session.server';
import {
    getTrustedAgentCookieCodec,
    serializeTrustedAgentCookie,
    TAOB_COOKIES,
} from '@/lib/auth/trusted-agent/cookies.server';
import { mockConfig, mockSiteObject } from '@/test-utils/config';
import { buildMockTokenResponse } from '@/test-utils/auth';
import { TrackingConsent } from '@/types/tracking-consent';
import { restoreAuthGeneration } from '@/lib/auth/auth-generation.server';
import { performanceTimerContext } from '@/middlewares/performance-metrics';

const ordinaryAuth = vi.hoisted(() => ({ loginAsGuest: vi.fn(), refreshToken: vi.fn() }));
vi.mock('@/lib/api-clients.server', () => ({ createApiClients: () => ({ auth: ordinaryAuth }) }));
vi.mock('@/lib/origin', () => ({ getAppOrigin: () => 'https://store.example' }));
vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({ getTranslation: () => ({ t: (key: string) => key }) }));

const settings = { organizationId: 'f_ecom_test_001', clientId: 'taob-client', siteId: mockSiteObject.id };
const loginId = 'shopper@example.com';
function makeContext(enabled = true) {
    const context = new RouterContextProvider();
    const config = structuredClone(mockConfig);
    config.commerce.api.organizationId = settings.organizationId;
    config.features.trustedAgent = { enabled, clientId: settings.clientId, callbackUri: '/login/agent/callback' };
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
    return { context, config };
}
function makeToken(exp = Math.floor(Date.now() / 1000) + 900, customerId = 'customer-1') {
    return `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify({ exp, dnt: true, sub: 'cc-slas::test_001::scid:taob-client::usid:session-1', isb: `uido:ecom::upn:${loginId}::rcid:${customerId}::chid:${settings.siteId}::agent:agent-1` })).toString('base64url')}.signature`;
}
function makeResult() {
    const accessToken = makeToken();
    return { accessToken, identity: parseTrustedAgentToken(accessToken, { ...settings, loginId }), dwsid: 'new-dwsid' };
}
const cookieName = (name: string) => `${name}_${settings.siteId}`;
const request = (path = '/cart', cookie = '', init: RequestInit = {}) =>
    new Request(`https://store.example${path}`, { ...init, headers: { Cookie: cookie, ...init.headers } });
const cookieHeader = (response: Response) =>
    response.headers
        .getSetCookie()
        .filter((entry) => !entry.includes('Expires=Thu, 01 Jan 1970'))
        .map((entry) => entry.split(';')[0])
        .join('; ');

async function activeCookies() {
    const { context } = makeContext();
    await restoreTrustedAgentState(request('/login/agent'), context);
    await establishTrustedAgentState(context, makeResult(), 'version-1');
    const response = new Response();
    await persistTrustedAgentState(context, response);
    return cookieHeader(response);
}
async function run(
    context: RouterContextProvider,
    req: Request,
    next = vi.fn(() => Promise.resolve(new Response('OK')))
) {
    const response = await authMiddleware(
        { context, request: req, params: {}, pattern: '/', url: new URL(req.url) },
        next
    );
    return { response: response as Response, next };
}

beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    // jose checks typed-array identity; TextEncoder/WebCrypto use Node's realm in jsdom.
    vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
    vi.stubEnv(
        'TAOB_COOKIE_KEYS',
        JSON.stringify([{ id: 'test-key', key: Buffer.alloc(32, 1).toString('base64url') }])
    );
    vi.clearAllMocks();
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('trusted agent auth middleware', () => {
    it.each([
        undefined,
        'previous-ordinary-context',
        'previous-assisted-shopper',
    ])('rejects stale order work (%s) before dispatch without retrying or changing identity', async (version) => {
        const cookies = await activeCookies();
        const { context } = makeContext();
        const { response, next } = await run(
            context,
            request('/action/place-order', cookies, {
                method: 'POST',
                ...(version && { headers: { 'x-sfnext-auth-context': version } }),
            })
        );
        expect(response.status).toBe(409);
        expect(next).not.toHaveBeenCalled();
        expect(getAuth(context).customerId).toBe('customer-1');
        expect(ordinaryAuth.loginAsGuest).not.toHaveBeenCalled();
        expect(ordinaryAuth.refreshToken).not.toHaveBeenCalled();
    });

    it('allows a current-context profile mutation through the ordinary backend verification path', async () => {
        const cookies = await activeCookies();
        const generation = await restoreAuthGeneration(request('/cart', cookies), makeContext().context);
        const { context } = makeContext();
        const { response, next } = await run(
            context,
            request('/resource/api/client/profile', cookies, {
                method: 'POST',
                headers: { 'x-sfnext-auth-context': generation.current?.id ?? '' },
            })
        );
        expect(response.status).toBe(200);
        expect(next).toHaveBeenCalledOnce();
        expect(getAuth(context).actingAgent?.agentId).toBe('agent-1');
    });

    it('selects protected TAOB ahead of old ordinary cookies and publishes matching synchronous/promise identity', async () => {
        const cookies = await activeCookies();
        const { context } = makeContext();
        const { response } = await run(
            context,
            request('/cart', `${cookies}; ${cookieName('cc-at')}=old; ${cookieName('cc-nx')}=old`),
            vi.fn(async () => {
                const auth = getAuth(context);
                expect(auth).toMatchObject({
                    authMode: 'trusted-agent',
                    userType: 'registered',
                    customerId: 'customer-1',
                    usid: 'session-1',
                    trackingConsent: TrackingConsent.Declined,
                    dwsid: 'new-dwsid',
                    actingAgent: { agentId: 'agent-1', contextVersion: 'version-1', status: 'active' },
                });
                expect(await context.get(authContext).ref).toEqual(auth);
                expect(auth.refreshToken).toBeUndefined();
                return new Response('OK');
            })
        );
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(ordinaryAuth.loginAsGuest).not.toHaveBeenCalled();
        expect(ordinaryAuth.refreshToken).not.toHaveBeenCalled();
    });

    it('writes only dedicated credentials, deletes all previous local identity/context/basket references, and strips secrets from public data', async () => {
        const { context } = makeContext();
        const result = makeResult();
        const { response } = await run(
            context,
            request('/login/agent/callback'),
            vi.fn(async () => {
                await updateTrustedAgentSession(context, result, 'version-2');
                const data = getPublicSessionData(getAuth(context));
                expect(data.actingAgent?.contextVersion).toBe('version-2');
                expect(JSON.stringify(data)).not.toContain(result.accessToken);
                expect(data.actingAgent?.loginId).toBe(loginId);
                expect(JSON.stringify({ ...data, actingAgent: undefined })).not.toContain(loginId);
                expect(data).not.toHaveProperty('refreshToken');
                return new Response('Complete');
            })
        );
        const headers = response.headers.getSetCookie();
        const at = headers.find((header) => header.startsWith(`${cookieName(TAOB_COOKIES.accessToken)}=`));
        expect(at).toContain(result.accessToken);
        expect(at).toContain('HttpOnly');
        expect(at).toContain('Secure');
        expect(at).toContain('SameSite=Lax');
        const metadata = headers.find((header) => header.startsWith(`${cookieName(TAOB_COOKIES.session)}=`));
        expect(metadata).not.toContain('Expires=');
        expect(metadata).not.toContain(loginId);
        for (const name of [
            'cc-at',
            'cc-nx',
            'cc-nx-g',
            'usid',
            'enc_user_id',
            'id_token',
            'idp_access_token',
            'idp_refresh_token',
            'cc-cv',
            'storefront-next-context',
            'dwsourcecode',
        ]) {
            expect(headers.find((header) => header.startsWith(`${cookieName(name)}=`))).toContain(
                'Expires=Thu, 01 Jan 1970'
            );
        }
        expect(headers.find((header) => header.startsWith('__sfdc_basket='))).toContain('Expires=Thu, 01 Jan 1970');
        expect(headers.find((header) => header.startsWith('dw_attribution='))).toContain('Expires=Thu, 01 Jan 1970');
        expect(headers.find((header) => header.startsWith(`${cookieName('__sfdc_usertype')}=`))).toContain(
            'Expires=Thu, 01 Jan 1970'
        );
    });

    it.each([
        '/cart',
        '/cart.data',
        '/resource/scapi/shopperOrders/createOrder',
    ])('blocks expired/missing credentials before dispatch on %s without refresh/guest or replay', async (path) => {
        const cookies = await activeCookies();
        const metadataOnly = cookies
            .split('; ')
            .filter((part) => !part.startsWith(cookieName(TAOB_COOKIES.accessToken)))
            .join('; ');
        const { context } = makeContext();
        const { response, next } = await run(
            context,
            request(
                path,
                metadataOnly,
                path.includes('resource')
                    ? { method: 'POST' }
                    : { headers: { Accept: path.endsWith('.data') ? '*/*' : 'text/html' } }
            )
        );
        expect(next).not.toHaveBeenCalled();
        expect(response.status).toBe(path === '/cart' ? 303 : 401);
        expect(response.headers.get('x-sfnext-auth-error')).toBe('TAOB_REAUTH_REQUIRED');
        expect(getAuth(context).authMode).toBe('trusted-agent');
        expect(getAuth(context).actingAgent?.status).toBe('reauth-required');
        expect(getAuth(context).accessToken).toBeUndefined();
        expect(ordinaryAuth.loginAsGuest).not.toHaveBeenCalled();
        expect(ordinaryAuth.refreshToken).not.toHaveBeenCalled();
    });

    it.each([
        'tampered',
        'duplicate',
        'orphan-token',
        'wrong-token',
    ])('blocks %s state despite valid ordinary refresh cookies', async (variant) => {
        let cookies = await activeCookies();
        if (variant === 'tampered') cookies = `${cookieName(TAOB_COOKIES.session)}=tampered`;
        if (variant === 'duplicate') cookies += `; ${cookieName(TAOB_COOKIES.session)}=`;
        if (variant === 'orphan-token') cookies = `${cookieName(TAOB_COOKIES.accessToken)}=${makeToken()}`;
        if (variant === 'wrong-token') cookies = cookies.replace(makeToken(), makeToken(undefined, 'other-customer'));
        const { context } = makeContext();
        const { response, next } = await run(
            context,
            request('/cart', `${cookies}; ${cookieName('cc-nx')}=valid-ordinary-refresh`)
        );
        expect(response.status).toBe(401);
        expect(next).not.toHaveBeenCalled();
        expect(cookieHeader(response)).toContain(`${cookieName(TAOB_COOKIES.session)}=blocked`);
        expect(ordinaryAuth.refreshToken).not.toHaveBeenCalled();
    });

    it('retains recognizable recovery after real token expiry rather than creating a guest', async () => {
        const cookies = await activeCookies();
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now + 901000);
        try {
            const { context } = makeContext();
            const { next, response } = await run(context, request('/checkout', cookies, { method: 'POST' }));
            expect(next).not.toHaveBeenCalled();
            expect(response.status).toBe(401);
            expect(getAuth(context).actingAgent?.status).toBe('reauth-required');
        } finally {
            vi.restoreAllMocks();
        }
    });

    it.each([
        'thrown',
        'wrapped',
        'wrapped-throw',
    ])('handles %s 401 without resubmitting the order and preserves returned failure information', async (variant) => {
        const cookies = await activeCookies();
        const { context } = makeContext();
        const next = vi.fn(() => {
            if (variant === 'thrown') throw new AuthTokenInvalidError();
            context.get(authStorageContext).set('error', AUTH_TOKEN_INVALID_ERROR);
            if (variant === 'wrapped-throw') throw new Error('wrapped failure');
            return Promise.resolve(
                Response.json({ error: 'ORDER_OUTCOME_UNKNOWN', reference: 'reconcile' }, { status: 502 })
            );
        });
        const generation = await restoreAuthGeneration(request('/cart', cookies), makeContext().context);
        const { response } = await run(
            context,
            request('/action/place-order', cookies, {
                method: 'POST',
                headers: { 'x-sfnext-auth-context': generation.current?.id ?? '' },
            }),
            next
        );
        expect(next).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(variant === 'wrapped' ? 502 : 401);
        expect(response.headers.get('Location')).toBeNull();
        expect(response.headers.get('x-sfnext-auth-error')).toBe('TAOB_REAUTH_REQUIRED');
        if (variant === 'wrapped')
            expect(await response.json()).toEqual({ error: 'ORDER_OUTCOME_UNKNOWN', reference: 'reconcile' });
        expect(ordinaryAuth.loginAsGuest).not.toHaveBeenCalled();
        expect(ordinaryAuth.refreshToken).not.toHaveBeenCalled();
    });

    it('keeps lifecycle/logout reachable when disabled with residual state and clears all assisted cookies on end', async () => {
        const cookies = await activeCookies();
        const blocked = makeContext(false);
        expect((await run(blocked.context, request('/cart', cookies))).response.status).toBe(401);
        const { context } = makeContext(false);
        const { response, next } = await run(
            context,
            request('/logout', cookies, {
                method: 'POST',
                headers: {
                    'x-sfnext-auth-context':
                        (await restoreAuthGeneration(request('/cart', cookies), makeContext(false).context)).current
                            ?.id ?? '',
                },
            }),
            vi.fn(() => {
                destroyAuth(context);
                return Promise.resolve(new Response('Ended'));
            })
        );
        expect(next).toHaveBeenCalledTimes(1);
        expect(getAuth(context).authMode).toBeUndefined();
        for (const name of Object.values(TAOB_COOKIES))
            expect(
                response.headers.getSetCookie().find((header) => header.startsWith(`${cookieName(name)}=`))
            ).toContain('Expires=Thu, 01 Jan 1970');
    });

    it('prevents ordinary auth writers and explicit guest recovery from stripping assisted identity', async () => {
        const cookies = await activeCookies();
        const { context } = makeContext();
        await run(
            context,
            request('/cart', cookies),
            vi.fn(async () => {
                expect(() => updateAuth(context, buildMockTokenResponse())).toThrow();
                await clearInvalidSessionAndRestoreGuest(context);
                expect(getAuth(context).authMode).toBe('trusted-agent');
                expect(getAuth(context).accessToken).toBeUndefined();
                return new Response('Blocked');
            })
        );
        expect(ordinaryAuth.loginAsGuest).not.toHaveBeenCalled();
    });
});

describe('protected TAOB cookies', () => {
    it('protects pending authorization and captures the prior context while publishing tokenless identity together', async () => {
        const cookies = await activeCookies();
        const { context } = makeContext();
        const { response } = await run(
            context,
            request('/login/agent', cookies),
            vi.fn(async () => {
                setTrustedAgentTransaction(context, {
                    loginId,
                    codeVerifier: 'v'.repeat(64),
                    redirectUri: 'https://store.example/login/agent/callback',
                    nonce: 'nonce',
                    contextVersion: 'next-version',
                    createdAt: Date.now(),
                });
                expect(getAuth(context).authMode).toBe('trusted-agent');
                expect(getAuth(context).accessToken).toBeUndefined();
                expect(await context.get(authContext).ref).toEqual(getAuth(context));
                expect(JSON.stringify(getPublicSessionData(getAuth(context)))).not.toContain(loginId);
                return new Response('Authorize');
            })
        );
        const nextContext = makeContext().context;
        const restored = await restoreTrustedAgentState(
            request('/login/agent/callback', cookieHeader(response)),
            nextContext
        );
        expect(restored.lifecycle).toMatchObject({
            mode: 'pending',
            transaction: {
                expectedPriorContextVersion: 'version-1',
                contextVersion: 'next-version',
                loginId,
                nonce: 'nonce',
            },
        });
    });

    it('preserves ordinary authentication for a launch hint and decrypts the bounded prefill separately', async () => {
        const { context } = makeContext();
        const codec = getTrustedAgentCookieCodec(context);
        const hint = await codec.seal({ loginId, createdAt: Date.now() }, 'launch');
        const req = request('/cart', `${cookieName(TAOB_COOKIES.launch)}=${hint}`);
        expect((await restoreTrustedAgentState(req, context)).lifecycle.mode).toBe('none');
        expect(getTrustedAgentSessionData(context)).toEqual({});
        expect(await readTrustedAgentLaunch(req, context)).toBe(loginId);
    });

    it('binds metadata to client, tenant, site, and public origin', async () => {
        const cookies = await activeCookies();
        const { context, config } = makeContext();
        config.features.trustedAgent = {
            enabled: true,
            clientId: 'other-client',
            callbackUri: '/login/agent/callback',
        };
        expect((await restoreTrustedAgentState(request('/cart', cookies), context)).lifecycle.mode).toBe('blocked');
        const codec = getTrustedAgentCookieCodec(makeContext().context);
        const sealed = await codec.seal({}, 'session');
        await expect(codec.open(sealed, 'transaction')).rejects.toThrow();
    });

    it('enforces transaction age and retains a blocking marker after an abandoned transaction', async () => {
        const { context } = makeContext();
        await restoreTrustedAgentState(request('/login/agent'), context);
        setTrustedAgentTransaction(context, {
            loginId,
            codeVerifier: 'v'.repeat(64),
            redirectUri: 'https://store.example/login/agent/callback',
            nonce: 'nonce',
            contextVersion: 'version',
            createdAt: Date.now() - 301000,
        });
        const response = new Response();
        await persistTrustedAgentState(context, response);
        const nextContext = makeContext().context;
        expect(
            (await restoreTrustedAgentState(request('/cart', cookieHeader(response)), nextContext)).lifecycle.mode
        ).toBe('blocked');
    });

    it('rejects oversized cookies and honors the same configured scope for writes/deletion', async () => {
        const { context, config } = makeContext();
        config.cookies = { domain: '.store.example' };
        const write = await serializeTrustedAgentCookie(TAOB_COOKIES.session, 'safe', context);
        const deletion = await serializeTrustedAgentCookie(TAOB_COOKIES.session, '', context, new Date(0));
        expect(write).toContain('Domain=.store.example');
        expect(deletion).toContain('Domain=.store.example');
        expect(write).toContain('Path=/');
        await expect(serializeTrustedAgentCookie(TAOB_COOKIES.session, 'x'.repeat(4096), context)).rejects.toThrow();
    });

    it('classifies exact site/locale lifecycle paths, including data requests, without exempting lookalikes', () => {
        const { context, config } = makeContext();
        config.url = { ...config.url, prefix: '/:siteId/:localeId' };
        const prefix = `/${mockSiteObject.alias ?? mockSiteObject.id}/${mockSiteObject.supportedLocales[0].id}`;
        expect(isTrustedAgentLifecycleRequest(request(`${prefix}/login/agent.data`), context)).toBe(true);
        expect(isTrustedAgentLifecycleRequest(request(`${prefix}/login/agent/callback`), context)).toBe(true);
        expect(isTrustedAgentLifecycleRequest(request(`${prefix}/login/agent/other`), context)).toBe(false);
        expect(isTrustedAgentLifecycleRequest(request(`${prefix}/logout`), context)).toBe(false);
        expect(isTrustedAgentLifecycleRequest(request(`${prefix}/logout.data`), context, true)).toBe(true);
    });
});

describe('unreadable auth generation recovery', () => {
    const rotatedKeyRing = JSON.stringify([{ id: 'rotated-key', key: Buffer.alloc(32, 2).toString('base64url') }]);

    /** A browser keeps only the last Set-Cookie per name. */
    const browserCookies = (response: Response) =>
        [
            ...new Map(
                cookieHeader(response)
                    .split('; ')
                    .map((pair) => [pair.split('=')[0], pair] as const)
            ).values(),
        ].join('; ');
    function ordinaryContext(enabled = true) {
        const { context } = makeContext(enabled);
        context.set(performanceTimerContext, { mark: vi.fn() } as never);
        return context;
    }
    async function ordinaryShopperCookies() {
        ordinaryAuth.loginAsGuest.mockResolvedValue(buildMockTokenResponse());
        const { response } = await run(ordinaryContext(), request('/cart'));
        const cookies = browserCookies(response);
        expect(cookies).toContain('cc-auth-fence-');
        ordinaryAuth.loginAsGuest.mockClear();
        return cookies;
    }
    const expiredNames = (response: Response) =>
        response.headers
            .getSetCookie()
            .filter((entry) => entry.includes('Expires=Thu, 01 Jan 1970'))
            .map((entry) => entry.split('=')[0]);

    it('serves an ordinary shopper as a fresh guest after the sealing key leaves the ring', async () => {
        const cookies = await ordinaryShopperCookies();
        vi.stubEnv('TAOB_COOKIE_KEYS', rotatedKeyRing);
        const { response, next } = await run(ordinaryContext(), request('/cart', cookies));
        expect(response.status).toBe(200);
        expect(next).toHaveBeenCalledOnce();
        expect(ordinaryAuth.loginAsGuest).toHaveBeenCalledOnce();
        expect(cookieHeader(response)).toContain('cc-auth-fence-0-');
        const followUp = await run(ordinaryContext(), request('/cart', browserCookies(response)));
        expect(followUp.response.status).toBe(200);
        expect(ordinaryAuth.loginAsGuest).toHaveBeenCalledOnce();
    });

    it('keeps an ordinary shopper signed in and clears the leftover cookies when the feature is rolled back', async () => {
        const cookies = await ordinaryShopperCookies();
        vi.stubEnv('TAOB_COOKIE_KEYS', '');
        const { response, next } = await run(ordinaryContext(false), request('/cart', cookies));
        expect(response.status).toBe(200);
        expect(next).toHaveBeenCalledOnce();
        expect(expiredNames(response).some((name) => name.startsWith('cc-auth-fence-'))).toBe(true);
        expect(expiredNames(response).some((name) => name.startsWith('cc-auth-provenance'))).toBe(true);
    });

    it('still sends an agent session sealed with a removed key to the agent entry route', async () => {
        const cookies = await activeCookies();
        vi.stubEnv('TAOB_COOKIE_KEYS', rotatedKeyRing);
        const { response } = await run(
            makeContext().context,
            request('/cart', cookies, { headers: { Accept: 'text/html' } })
        );
        expect(response.status).toBe(303);
        expect(response.headers.get('Location')).toContain('/login/agent');
    });
});
