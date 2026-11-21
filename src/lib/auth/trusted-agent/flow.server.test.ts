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
import { parseTrustedAgentToken, type TrustedAgentResponse } from '@/scapi';
import authMiddleware, { destroyAuth, getAuth, updateAuth } from '@/middlewares/auth.server';
import { buildMockTokenResponse } from '@/test-utils/auth';
import { performanceTimerContext } from '@/middlewares/performance-metrics';
import { restoreAuthGeneration } from '@/lib/auth/auth-generation.server';
import createBasketMiddleware from '@/middlewares/basket.server';
import { mockConfig, mockSiteObject } from '@/test-utils/config';
import {
    restoreTrustedAgentState,
    setTrustedAgentTransaction,
    establishTrustedAgentState,
    persistTrustedAgentState,
    updateTrustedAgentLogin,
} from '@/lib/auth/trusted-agent/session.server';
import {
    completeTrustedAgentAuthorization,
    loadTrustedAgentEntry,
    submitTrustedAgentEntry,
    loadTrustedAgentCompletion,
    authorizeTrustedAgentTransaction,
} from '@/lib/auth/trusted-agent/flow.server';

const exchangeCode = vi.hoisted(() => vi.fn());
const authorizeRegistered = vi.hoisted(() => vi.fn());
const ordinaryAuth = vi.hoisted(() => ({ loginAsGuest: vi.fn(), refreshToken: vi.fn() }));
vi.mock('@/lib/api-clients.server', () => ({
    createTrustedAgentClient: () => ({ exchangeCode, authorizeRegistered }),
    createApiClients: () => ({ auth: ordinaryAuth }),
}));
vi.mock('@/lib/origin', () => ({ getAppOrigin: () => 'https://store.example' }));
vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({ getTranslation: () => ({ t: (key: string) => key }) }));

const settings = { organizationId: 'f_ecom_test_001', clientId: 'taob-client', siteId: mockSiteObject.id };
const loginId = 'shopper@example.com';

function makeContext() {
    const context = new RouterContextProvider();
    const config = structuredClone(mockConfig);
    config.url = { ...config.url, prefix: '' };
    config.commerce.api.organizationId = settings.organizationId;
    config.features.trustedAgent = { enabled: true, clientId: settings.clientId, callbackUri: '/login/agent/callback' };
    context.set(appConfigContext, config);
    context.set(performanceTimerContext, undefined);
    context.set(siteContext, {
        site: mockSiteObject,
        locale: mockSiteObject.supportedLocales[0],
        currency: mockSiteObject.defaultCurrency,
        siteCookie: createCookie('site'),
        localeCookie: createCookie('locale'),
        currencyCookie: createCookie('currency'),
    });
    return context;
}

function result(): TrustedAgentResponse {
    const accessToken = `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(
        JSON.stringify({
            exp: Math.floor(Date.now() / 1000) + 900,
            dnt: true,
            sub: 'cc-slas::test_001::scid:taob-client::usid:session-1',
            isb: `uido:ecom::upn:${loginId}::rcid:customer-1::chid:${settings.siteId}::agent:agent-1`,
        })
    ).toString('base64url')}.signature`;
    return { accessToken, identity: parseTrustedAgentToken(accessToken, { ...settings, loginId }) };
}

function applyCookies(jar: Map<string, string>, response: Response, persistent?: Set<string>) {
    for (const header of response.headers.getSetCookie()) {
        const pair = header.split(';')[0];
        const equals = pair.indexOf('=');
        const name = pair.slice(0, equals);
        if (header.includes('Expires=Thu, 01 Jan 1970')) jar.delete(name);
        else jar.set(name, pair.slice(equals + 1));
        if (header.includes('Expires=') && !header.includes('Expires=Thu, 01 Jan 1970')) persistent?.add(name);
        else persistent?.delete(name);
    }
}

function request(path: string, jar: Map<string, string>, method = 'GET', init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set('Cookie', [...jar].map(([key, value]) => `${key}=${value}`).join('; '));
    return new Request(`https://store.example${path}`, {
        ...init,
        method,
        headers,
    });
}

async function run(req: Request, context: RouterContextProvider, next: () => Promise<Response>): Promise<Response> {
    if (new URL(req.url).pathname === '/logout') {
        const probe = await restoreAuthGeneration(req, makeContext());
        const headers = new Headers(req.headers);
        if (probe.current) headers.set('x-sfnext-auth-context', probe.current.id);
        req = new Request(req, { headers });
    }
    return (await authMiddleware(
        { request: req, context, params: {}, pattern: '/', url: new URL(req.url) },
        async () =>
            (await createBasketMiddleware()(
                { request: req, context, params: {}, pattern: '/', url: new URL(req.url) },
                next
            )) as Response
    )) as Response;
}

beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
    vi.stubEnv('TAOB_COOKIE_KEYS', JSON.stringify([{ id: 'test', key: Buffer.alloc(32, 1).toString('base64url') }]));
    exchangeCode.mockReset();
    authorizeRegistered
        .mockReset()
        .mockImplementation(({ codeVerifier }: { codeVerifier: string }) =>
            Promise.resolve({ authorizationUrl: 'https://account.example/authorize', codeVerifier })
        );
    ordinaryAuth.loginAsGuest.mockReset().mockResolvedValue({
        ...buildMockTokenResponse({ accessToken: { customerId: 'fresh-guest', usid: 'fresh-usid' } }),
        refresh_token: 'fresh-guest-refresh',
    });
    ordinaryAuth.refreshToken.mockReset();
});

function toResponse(payload: Response | { data: unknown; init: ResponseInit | null }): Response {
    return payload instanceof Response ? payload : Response.json(payload.data, payload.init ?? {});
}
async function form(jar: Map<string, string>, path = '/login/agent') {
    const context = makeContext();
    const req = request(path, jar);
    const response = await run(req, context, async () => toResponse(await loadTrustedAgentEntry(req, context)));
    applyCookies(jar, response);
    return {
        response,
        value:
            response.status === 200
                ? ((await response.clone().json()) as {
                      nonce: string;
                      loginId: string;
                      mode: string;
                      canEnd: boolean;
                      returnUrl: string;
                  })
                : undefined,
    };
}
async function confirm(
    jar: Map<string, string>,
    nonce: string,
    values: Record<string, string> = {},
    origin = 'https://store.example',
    extraHeaders: Record<string, string> = {}
) {
    const context = makeContext();
    const req = request('/login/agent', jar, 'POST', {
        headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...extraHeaders },
        body: new URLSearchParams({ nonce, intent: 'start', loginId, ...values }).toString(),
    });
    const response = await run(req, context, async () => toResponse(await submitTrustedAgentEntry(req, context)));
    applyCookies(jar, response);
    return response;
}

async function authorize(jar: Map<string, string>) {
    const context = makeContext();
    const req = request('/login/agent/authorize', jar);
    const response = await run(req, context, () => authorizeTrustedAgentTransaction(req, context));
    applyCookies(jar, response);
    return response;
}

describe('trusted-agent entry and callback contracts', () => {
    it('offers to end agent mode only while an authorized or recoverable session exists', async () => {
        const jar = new Map<string, string>();
        expect((await form(jar)).value?.canEnd).toBe(false);

        const context = makeContext();
        await restoreTrustedAgentState(request('/login/agent', jar), context);
        await establishTrustedAgentState(context, result());
        const response = new Response();
        await persistTrustedAgentState(context, response);
        applyCookies(jar, response);
        expect((await form(jar)).value?.canEnd).toBe(true);
    });

    it('uses only an authoritative same-customer login change and requires fresh editable target confirmation', async () => {
        const jar = new Map<string, string>();
        const context = makeContext();
        await restoreTrustedAgentState(request('/login/agent', jar), context);
        await establishTrustedAgentState(context, result());
        updateTrustedAgentLogin(context, 'different-customer', 'wrong@example.com');
        updateTrustedAgentLogin(context, 'customer-1', 'changed@example.com');
        const response = new Response();
        await persistTrustedAgentState(context, response);
        applyCookies(jar, response);
        const loaded = await form(jar);
        expect(loaded.value).toMatchObject({ mode: 'start', loginId: 'changed@example.com' });
        if (!loaded.value) throw new Error('Missing confirmation');
        await expect(confirm(jar, loaded.value.nonce, { intent: 'renew' })).rejects.toMatchObject({ status: 409 });
        expect(exchangeCode).not.toHaveBeenCalled();
        const started = await confirm(jar, loaded.value.nonce, { loginId: 'edited@example.com' });
        expect(started.status).toBe(303);
        await authorize(jar);
        expect(authorizeRegistered).toHaveBeenCalledWith(expect.objectContaining({ loginId: 'edited@example.com' }));
    });
    it('cleans a prefill URL without replacing auth, preserves edited login syntax, and requires confirmation', async () => {
        const jar = new Map<string, string>();
        const launch = await form(jar, '/login/agent?loginId=Mixed%2BUser%40example.com');
        expect(launch.response.status).toBe(303);
        expect(launch.response.headers.get('Location')).toBe('/login/agent');
        expect(authorizeRegistered).not.toHaveBeenCalled();
        expect([...jar.keys()].some((name) => name.startsWith('cc-auth-fence-'))).toBe(false);
        const loaded = await form(jar);
        expect(loaded.value?.loginId).toBe('Mixed+User@example.com');
        if (!loaded.value) throw new Error('Missing entry form');
        const response = await confirm(jar, loaded.value.nonce, { loginId: 'Edited User+id@example.com' });
        expect(response.status).toBe(303);
        expect(response.headers.get('Location')).toBe('/login/agent/authorize');
        expect(authorizeRegistered).not.toHaveBeenCalled();
        expect((await authorize(jar)).headers.get('Location')).toBe('https://account.example/authorize');
        expect(authorizeRegistered).toHaveBeenCalledWith({
            loginId: 'Edited User+id@example.com',
            codeVerifier: expect.stringMatching(/^[A-Za-z0-9._~-]{43,128}$/),
        });
    });

    it('accepts the null Origin a no-referrer page produces only when the browser reports same-origin', async () => {
        const jar = new Map<string, string>();
        const loaded = await form(jar);
        if (!loaded.value) throw new Error('Missing entry form');
        await expect(
            confirm(jar, loaded.value.nonce, {}, 'null', { 'Sec-Fetch-Site': 'cross-site' })
        ).rejects.toMatchObject({ status: 403 });
        await expect(confirm(jar, loaded.value.nonce, {}, 'null')).rejects.toMatchObject({ status: 403 });
        const response = await confirm(jar, loaded.value.nonce, {}, 'null', { 'Sec-Fetch-Site': 'same-origin' });
        expect(response.status).toBe(303);
    });

    it('rejects cross-origin, wrong-nonce, duplicate-login, and guest confirmations without starting authorization', async () => {
        const jar = new Map<string, string>();
        const loaded = await form(jar);
        if (!loaded.value) throw new Error('Missing entry form');
        await expect(confirm(jar, loaded.value.nonce, {}, 'https://other.example')).rejects.toMatchObject({
            status: 403,
        });
        await expect(confirm(jar, crypto.randomUUID())).rejects.toMatchObject({ status: 403 });
        const invalid = await confirm(jar, loaded.value.nonce, { loginId: 'Guest' });
        expect(invalid.status).toBe(400);
        const duplicateContext = makeContext();
        const duplicate = request('/login/agent', jar, 'POST', {
            headers: { Origin: 'https://store.example' },
            body: new URLSearchParams([
                ['nonce', loaded.value.nonce],
                ['intent', 'start'],
                ['loginId', loginId],
                ['loginId', 'other-shopper'],
            ]).toString(),
        });
        const duplicateResult = await run(duplicate, duplicateContext, async () =>
            toResponse(await submitTrustedAgentEntry(duplicate, duplicateContext))
        );
        expect(duplicateResult.status).toBe(400);
        expect(authorizeRegistered).not.toHaveBeenCalled();
    });

    it.each([
        '/.//evil.example/path',
        '//evil.example',
        '/\\evil.example',
    ])('falls back to the home page for the unsafe returnUrl %s', async (returnUrl) => {
        const jar = new Map<string, string>();
        const loaded = await form(jar, `/login/agent?returnUrl=${encodeURIComponent(returnUrl)}`);
        expect(loaded.value?.returnUrl).toBe('/');
    });

    it('exchanges a protected transaction once, removes the code URL, and completes via full navigation without exposing credentials', async () => {
        const jar = new Map<string, string>();
        const loaded = await form(jar, '/login/agent?returnUrl=/cart');
        if (!loaded.value) throw new Error('Missing entry form');
        await confirm(jar, loaded.value.nonce);
        await authorize(jar);
        const accepted = result();
        exchangeCode.mockResolvedValueOnce(accepted);
        const context = makeContext();
        const callbackRequest = request('/login/agent/callback?code=one-time-code&state=provider-state', jar);
        const response = await run(callbackRequest, context, () =>
            completeTrustedAgentAuthorization(callbackRequest, context)
        );
        applyCookies(jar, response);
        expect(response.headers.get('Location')).toBe('/login/agent/complete');
        expect(await response.text()).not.toContain(accepted.accessToken);
        expect(exchangeCode).toHaveBeenCalledWith({
            loginId,
            code: 'one-time-code',
            codeVerifier: authorizeRegistered.mock.calls[0][0].codeVerifier,
            state: 'provider-state',
        });
        const completedContext = makeContext();
        const completedRequest = request('/login/agent/complete', jar);
        const completed = await run(completedRequest, completedContext, async () =>
            toResponse(await loadTrustedAgentCompletion(completedRequest, completedContext))
        );
        expect(completed.headers.get('Location')).toBe('/cart');
        const replayContext = makeContext();
        const replayRequest = request('/login/agent/callback?code=one-time-code', jar);
        await run(replayRequest, replayContext, () => completeTrustedAgentAuthorization(replayRequest, replayContext));
        expect(exchangeCode).toHaveBeenCalledTimes(1);
    });

    it('keeps the launch prefill when the relaunch arrives with a stale blocking marker', async () => {
        const jar = new Map<string, string>([[`cc-taob-session_${mockSiteObject.id}`, 'blocked']]);
        const launch = await form(jar, '/login/agent?loginId=Shopper%40example.com');
        expect(launch.response.status).toBe(303);
        const loaded = await form(jar);
        expect(loaded.value?.loginId).toBe('Shopper@example.com');
    });

    it('ends a popup through the completion page when SLAS rejects the login at authorize', async () => {
        const jar = new Map<string, string>();
        const loaded = await form(jar);
        if (!loaded.value) throw new Error('Missing entry form');
        await confirm(jar, loaded.value.nonce, { popup: 'true' });
        authorizeRegistered.mockRejectedValueOnce(new Error('unknown login'));
        const rejected = await authorize(jar);
        expect(rejected.headers.get('Location')).toBe('/login/agent/complete');
        const completionContext = makeContext();
        const completionRequest = request('/login/agent/complete', jar);
        const completion = await run(completionRequest, completionContext, async () =>
            toResponse(await loadTrustedAgentCompletion(completionRequest, completionContext))
        );
        expect(await completion.json()).toMatchObject({
            correlation: loaded.value.nonce,
            status: 'error',
            destination: '/login/agent?error=authorization_failed',
        });
    });

    it('keeps the in-page failure redirect when SLAS rejects the login outside a popup', async () => {
        const jar = new Map<string, string>();
        const loaded = await form(jar);
        if (!loaded.value) throw new Error('Missing entry form');
        await confirm(jar, loaded.value.nonce);
        authorizeRegistered.mockRejectedValueOnce(new Error('unknown login'));
        expect((await authorize(jar)).headers.get('Location')).toBe('/login/agent?error=authorization_failed');
    });

    it('fails closed when a callback exchange outlives the authorization transaction', async () => {
        const jar = new Map<string, string>();
        const loaded = await form(jar);
        if (!loaded.value) throw new Error('Missing entry form');
        await confirm(jar, loaded.value.nonce);
        const now = Date.now();
        exchangeCode.mockImplementationOnce(() => {
            vi.spyOn(Date, 'now').mockReturnValue(now + 301000);
            return Promise.resolve(result());
        });
        const context = makeContext();
        const req = request('/login/agent/callback?code=expired', jar);
        const response = await run(req, context, () => completeTrustedAgentAuthorization(req, context));
        applyCookies(jar, response);
        expect((await restoreTrustedAgentState(request('/cart', jar), makeContext())).lifecycle.mode).toBe('blocked');
        vi.restoreAllMocks();
    });
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('trusted-agent lifecycle ordering', () => {
    it.each([
        'pending',
        'ended',
    ])('never resumes a prior registered shopper from a delayed refresh in %s mode, including a restored browser', async (mode) => {
        const jar = new Map<string, string>();
        const persistent = new Set<string>();
        const initial = makeContext();
        const previous = {
            ...buildMockTokenResponse({
                accessToken: { customerId: 'prior-shopper', rcid: 'prior-shopper', usid: 'prior-usid' },
            }),
            refresh_token: 'prior-refresh',
        };
        applyCookies(
            jar,
            await run(request('/cart', jar), initial, () => {
                updateAuth(initial, previous);
                return Promise.resolve(new Response('Signed in'));
            }),
            persistent
        );
        jar.delete(`cc-at_${settings.siteId}`);
        let finishRefresh: ((value: typeof previous) => void) | undefined;
        ordinaryAuth.refreshToken.mockImplementation(
            () =>
                new Promise<typeof previous>((resolve) => {
                    finishRefresh = resolve;
                })
        );
        const oldRequest = run(request('/cart', jar), makeContext(), () =>
            Promise.resolve(new Response('Old request'))
        );
        await vi.waitFor(() => expect(ordinaryAuth.refreshToken).toHaveBeenCalledOnce());
        const startContext = makeContext();
        applyCookies(
            jar,
            await run(request('/login/agent', jar), startContext, () => {
                setTrustedAgentTransaction(startContext, {
                    loginId,
                    codeVerifier: 'v'.repeat(64),
                    redirectUri: 'https://store.example/login/agent/callback',
                    nonce: crypto.randomUUID(),
                    contextVersion: 'pending-context',
                    createdAt: Date.now(),
                });
                return Promise.resolve(new Response('Started'));
            }),
            persistent
        );
        if (mode === 'ended') {
            const end = makeContext();
            applyCookies(
                jar,
                await run(request('/logout', jar, 'POST'), end, () => {
                    destroyAuth(end);
                    return Promise.resolve(new Response('Ended'));
                }),
                persistent
            );
        }
        if (!finishRefresh) throw new Error('Refresh did not start');
        finishRefresh({ ...previous, refresh_token: 'late-registered-refresh' });
        applyCookies(jar, await oldRequest, persistent);
        // A restored browser retains Expires-bearing credentials/fences but may lose session cookies.
        const restoredJar = new Map([...jar].filter(([name]) => persistent.has(name)));
        const nextContext = makeContext();
        const handler = vi.fn(() => Promise.resolve(new Response('Next page')));
        const response = await run(request('/cart', restoredJar), nextContext, handler);
        expect(ordinaryAuth.refreshToken).toHaveBeenCalledTimes(1);
        expect(getAuth(nextContext).customerId).not.toBe('prior-shopper');
        expect(getAuth(nextContext).usid).not.toBe('prior-usid');
        if (mode === 'pending') {
            expect(response.status).toBe(401);
            expect(handler).not.toHaveBeenCalled();
            expect(getAuth(nextContext).authMode).toBe('trusted-agent');
        } else {
            expect(response.status).toBe(200);
            expect(getAuth(nextContext).userType).toBe('guest');
        }
    });
    it('does not restore assisted authentication when a callback completes after logout', async () => {
        const jar = new Map<string, string>();
        const startContext = makeContext();
        const started = await run(request('/login/agent', jar), startContext, () => {
            setTrustedAgentTransaction(startContext, {
                loginId,
                codeVerifier: 'v'.repeat(64),
                redirectUri: 'https://store.example/login/agent/callback',
                nonce: crypto.randomUUID(),
                contextVersion: 'pending-context',
                createdAt: Date.now(),
            });
            return Promise.resolve(new Response('Started'));
        });
        applyCookies(jar, started);

        let finishExchange: ((value: TrustedAgentResponse) => void) | undefined;
        exchangeCode.mockImplementation(
            () =>
                new Promise<TrustedAgentResponse>((resolve) => {
                    finishExchange = resolve;
                })
        );
        const callbackContext = makeContext();
        const callbackRequest = request('/login/agent/callback?code=authorized-code', jar);
        const callback = run(callbackRequest, callbackContext, () =>
            completeTrustedAgentAuthorization(callbackRequest, callbackContext)
        );
        await vi.waitFor(() => expect(exchangeCode).toHaveBeenCalledOnce());

        const logoutContext = makeContext();
        const ended = await run(request('/logout', jar, 'POST'), logoutContext, () => {
            destroyAuth(logoutContext);
            return Promise.resolve(new Response('Ended'));
        });
        applyCookies(jar, ended);
        expect((await restoreTrustedAgentState(request('/cart', jar), makeContext())).lifecycle.mode).toBe('none');

        if (!finishExchange) throw new Error('Callback exchange did not start');
        finishExchange(result());
        applyCookies(jar, await callback);
        const finalState = await restoreTrustedAgentState(request('/cart', jar), makeContext());
        expect(finalState.lifecycle.mode).toBe('none');
    });
});
