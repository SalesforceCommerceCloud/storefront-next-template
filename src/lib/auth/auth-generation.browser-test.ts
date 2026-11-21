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
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { RouterContextProvider, createCookie } from 'react-router';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { parseTrustedAgentToken, type AuthResponse, type TrustedAgentResponse } from '@/scapi';
import { mockConfig, mockSiteObject } from '@/test-utils/config';
import { buildMockTokenResponse } from '@/test-utils/auth';
import { performanceTimerContext } from '@/middlewares/performance-metrics';
import { getPublicSessionData } from '@/middlewares/auth.utils';
import authMiddleware, { getAuth, destroyAuth, updateAuth } from '@/middlewares/auth.server';
import { setTrustedAgentTransaction } from '@/lib/auth/trusted-agent/session.server';
import { completeTrustedAgentAuthorization, loadTrustedAgentCompletion } from '@/lib/auth/trusted-agent/flow.server';

const mocks = vi.hoisted(() => ({ origin: '', guest: vi.fn(), refresh: vi.fn(), exchange: vi.fn() }));
vi.mock('@/lib/origin', () => ({ getAppOrigin: () => mocks.origin }));
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({ auth: { loginAsGuest: mocks.guest, refreshToken: mocks.refresh } }),
    createTrustedAgentClient: () => ({ exchangeCode: mocks.exchange }),
}));
vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({ getTranslation: () => ({ t: (key: string) => key }) }));

let browser: Browser;
let browserContext: BrowserContext;
let server: Server;
let releaseRefresh: ((value: AuthResponse) => void) | undefined;
let releaseExchange: ((value: TrustedAgentResponse) => void) | undefined;
const serverErrors: unknown[] = [];
const placeOrder = vi.fn();
const settings = { organizationId: 'f_ecom_test_001', clientId: 'taob-client', siteId: mockSiteObject.id };
const previous = {
    ...buildMockTokenResponse({
        accessToken: { customerId: 'prior-shopper', rcid: 'prior-shopper', usid: 'prior-usid' },
    }),
    refresh_token: 'prior-refresh',
};
const fresh = {
    ...buildMockTokenResponse({ accessToken: { customerId: 'fresh-guest', usid: 'fresh-usid' } }),
    refresh_token: 'fresh-refresh',
};

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

function assistedResult(): TrustedAgentResponse {
    const accessToken = `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900, dnt: true, sub: 'cc-slas::test_001::scid:taob-client::usid:assisted-usid', isb: `uido:ecom::upn:shopper@example.com::rcid:assisted-shopper::chid:${settings.siteId}::agent:agent-1` })).toString('base64url')}.signature`;
    return {
        accessToken,
        identity: parseTrustedAgentToken(accessToken, { ...settings, loginId: 'shopper@example.com' }),
    };
}

/** Real HTTP/Set-Cookie around the production middleware; only SLAS transport is replaced. */
async function handle(incoming: IncomingMessage, outgoing: ServerResponse) {
    try {
        // Static assets bypass application middleware in the actual storefront as well.
        if (incoming.url === '/favicon.ico') {
            outgoing.statusCode = 204;
            outgoing.end();
            return;
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers))
            if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(',') : value);
        const chunks: Buffer[] = [];
        for await (const chunk of incoming)
            if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
            else if (Buffer.isBuffer(chunk)) chunks.push(chunk);
        const request = new Request(`${mocks.origin}${incoming.url}`, {
            method: incoming.method,
            headers,
            ...(!['GET', 'HEAD'].includes(incoming.method ?? 'GET') && { body: Buffer.concat(chunks).toString() }),
        });
        const context = makeContext();
        const pathname = new URL(request.url).pathname;
        const response = (await authMiddleware(
            { request, context, params: {}, pattern: '/', url: new URL(request.url) },
            async () => {
                if (pathname === '/test/sign-in') {
                    updateAuth(context, previous);
                    return Response.json({ signedIn: true });
                }
                if (pathname === '/login/agent' && request.method === 'POST') {
                    setTrustedAgentTransaction(context, {
                        loginId: 'shopper@example.com',
                        codeVerifier: 'v'.repeat(64),
                        redirectUri: `${mocks.origin}/login/agent/callback`,
                        nonce: crypto.randomUUID(),
                        contextVersion: crypto.randomUUID(),
                        createdAt: Date.now(),
                    });
                    return Response.json({ pending: true });
                }
                if (pathname === '/login/agent/callback') return completeTrustedAgentAuthorization(request, context);
                if (pathname === '/login/agent/complete') {
                    const completion = await loadTrustedAgentCompletion(request, context);
                    return completion instanceof Response
                        ? completion
                        : Response.json(completion.data, completion.init ?? {});
                }
                if (pathname === '/logout') {
                    destroyAuth(context);
                    return Response.json({ ended: true });
                }
                if (pathname === '/action/place-order') {
                    placeOrder(getAuth(context).customerId);
                    return Response.json({ success: true });
                }
                const auth = getAuth(context);
                return Response.json(getPublicSessionData(auth));
            }
        )) as Response;
        outgoing.statusCode = response.status;
        response.headers.forEach((value, name) => {
            if (name !== 'set-cookie') outgoing.setHeader(name, value);
        });
        outgoing.setHeader('Set-Cookie', response.headers.getSetCookie());
        outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
        serverErrors.push(error);
        outgoing.statusCode = 500;
        outgoing.end('Test server failure');
    }
}

/** @env {string} [PLAYWRIGHT_CHANNEL] Optional installed browser channel; example: `chrome`. Defaults to Playwright Chromium. */
beforeAll(async () => {
    browser = await chromium.launch({
        headless: true,
        ...(process.env.PLAYWRIGHT_CHANNEL && { channel: process.env.PLAYWRIGHT_CHANNEL }),
    });
});
beforeEach(async () => {
    vi.stubEnv('TAOB_COOKIE_KEYS', JSON.stringify([{ id: 'test', key: Buffer.alloc(32, 1).toString('base64url') }]));
    serverErrors.length = 0;
    placeOrder.mockReset();
    releaseRefresh = undefined;
    releaseExchange = undefined;
    mocks.guest.mockReset().mockResolvedValue(fresh);
    mocks.refresh.mockReset().mockImplementation(
        () =>
            new Promise<AuthResponse>((resolve) => {
                releaseRefresh = resolve;
            })
    );
    mocks.exchange.mockReset().mockImplementation(
        () =>
            new Promise<TrustedAgentResponse>((resolve) => {
                releaseExchange = resolve;
            })
    );
    server = createServer((req, res) => {
        void handle(req, res);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing HTTP test address');
    mocks.origin = `http://127.0.0.1:${address.port}`;
    browserContext = await browser.newContext();
});
afterEach(async () => {
    releaseRefresh?.(previous);
    releaseExchange?.(assistedResult());
    await browserContext.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.unstubAllEnvs();
    expect(serverErrors).toEqual([]);
});
afterAll(async () => {
    await browser?.close();
});

describe('real-browser authentication response ordering', () => {
    async function logout() {
        const snapshot = await browserContext.request.get(`${mocks.origin}/login/agent`);
        const state = await snapshot.json();
        expect(typeof state.authContextVersion).toBe('string');
        await browserContext.request.post(
            `${mocks.origin}/logout?__authContext=${encodeURIComponent(state.authContextVersion)}`
        );
    }
    it('rejects a stale tab order submission after assisted entry and after logout without replay', async () => {
        await browserContext.request.get(`${mocks.origin}/test/sign-in`);
        const ordinary = await (await browserContext.request.get(`${mocks.origin}/cart`)).json();
        await browserContext.request.post(`${mocks.origin}/login/agent`);
        const callback = browserContext.request.get(`${mocks.origin}/login/agent/callback?code=authorized`);
        await vi.waitFor(() => expect(mocks.exchange).toHaveBeenCalledOnce());
        releaseExchange?.(assistedResult());
        await callback;
        const active = await (await browserContext.request.get(`${mocks.origin}/cart`)).json();
        const stale = await browserContext.request.post(
            `${mocks.origin}/action/place-order?__authContext=${ordinary.authContextVersion}`
        );
        expect(stale.status()).toBe(409);
        expect(placeOrder).not.toHaveBeenCalled();
        const current = await browserContext.request.post(
            `${mocks.origin}/action/place-order?__authContext=${active.authContextVersion}`
        );
        expect(current.status()).toBe(200);
        expect(placeOrder).toHaveBeenCalledExactlyOnceWith('assisted-shopper');
        await logout();
        const afterEnd = await browserContext.request.post(
            `${mocks.origin}/action/place-order?__authContext=${active.authContextVersion}`
        );
        expect(afterEnd.status()).toBe(409);
        expect(placeOrder).toHaveBeenCalledOnce();
    });
    it('does not restore TAOB when the browser receives callback cookies after logout', async () => {
        const opener = await browserContext.newPage();
        await opener.goto(`${mocks.origin}/login/agent`);
        await browserContext.request.post(`${mocks.origin}/login/agent`);
        const callbackPage = await browserContext.newPage();
        const callback = callbackPage.goto(`${mocks.origin}/login/agent/callback?code=authorized-code`);
        await vi.waitFor(() => expect(mocks.exchange).toHaveBeenCalledOnce());
        await logout();
        if (!releaseExchange) throw new Error('Exchange did not start');
        releaseExchange(assistedResult());
        await callback;
        const tab = await browserContext.newPage();
        const response = await tab.goto(`${mocks.origin}/cart`);
        const auth = await response?.json();
        expect(auth.userType).toBe('guest');
        expect(auth.customerId).not.toBe('assisted-shopper');
        expect(mocks.refresh).not.toHaveBeenCalled();
        const fences = (await browserContext.cookies()).filter(({ name }) => name.startsWith('cc-auth-fence-'));
        expect(fences.length).toBeGreaterThan(0);
        expect(fences.every(({ httpOnly }) => httpOnly)).toBe(true);
        expect(await tab.evaluate(() => document.cookie)).not.toContain('cc-auth-fence-');
    });

    it.each([
        'pending',
        'ended',
    ])('rejects stale registered refresh cookies in a new tab and restored browser during %s mode', async (mode) => {
        const page = await browserContext.newPage();
        await page.goto(`${mocks.origin}/test/sign-in`);
        await browserContext.clearCookies({ name: `cc-at_${settings.siteId}` });
        const oldTab = await browserContext.newPage();
        const oldRequest = oldTab.goto(`${mocks.origin}/cart`);
        void oldRequest.catch(() => undefined);
        await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
        await browserContext.request.post(`${mocks.origin}/login/agent`);
        if (mode === 'ended') await logout();
        if (!releaseRefresh) throw new Error('Refresh did not start');
        releaseRefresh({ ...previous, refresh_token: 'late-refresh' });
        await oldRequest;
        const snapshot = await browserContext.storageState();
        await browserContext.close();
        browserContext = await browser.newContext({
            storageState: { ...snapshot, cookies: snapshot.cookies.filter(({ expires }) => expires > 0) },
        });
        const restoredTab = await browserContext.newPage();
        const response = await restoredTab.goto(`${mocks.origin}/cart`);
        expect(mocks.refresh).toHaveBeenCalledTimes(1);
        if (!response) throw new Error('Missing browser response');
        if (mode === 'pending') {
            const recovery = await response.request().redirectedFrom()?.response();
            expect(recovery?.status()).toBe(303);
            expect(recovery?.headers()['x-sfnext-auth-error']).toBe('TAOB_REAUTH_REQUIRED');
            expect((await response.json()).authMode).toBe('trusted-agent');
        } else {
            const auth = await response.json();
            expect(auth.userType).toBe('guest');
            expect(auth.customerId).not.toBe('prior-shopper');
        }
    });
});
