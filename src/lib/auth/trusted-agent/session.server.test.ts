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
import { createCookie, RouterContextProvider } from 'react-router';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { parseTrustedAgentToken } from '@/scapi';
import { getPublicSessionData } from '@/middlewares/auth.utils';
import { mockConfig, mockSiteObject } from '@/test-utils/config';
import {
    restoreTrustedAgentState,
    establishTrustedAgentState,
    persistTrustedAgentState,
    getTrustedAgentSessionData,
    setTrustedAgentTransaction,
    serializeTrustedAgentLaunch,
    readTrustedAgentLaunch,
} from '@/lib/auth/trusted-agent/session.server';
import {
    TAOB_COOKIES,
    readTrustedAgentCookie,
    serializeTrustedAgentCookie,
} from '@/lib/auth/trusted-agent/cookies.server';

vi.mock('@/lib/origin', () => ({ getAppOrigin: () => 'https://store.example' }));

const loginId = 'shopper@example.com';
const settings = { clientId: 'taob-client', organizationId: 'f_ecom_test_001', siteId: mockSiteObject.id };
const name = (base: string) => `${base}_${settings.siteId}`;

function makeContext() {
    const context = new RouterContextProvider();
    const config = structuredClone(mockConfig);
    config.url = { ...config.url, prefix: '' };
    config.commerce.api.organizationId = settings.organizationId;
    config.features.trustedAgent = { enabled: true, clientId: settings.clientId, callbackUri: '/login/agent/callback' };
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

function makeResult() {
    const claims = {
        exp: Math.floor(Date.now() / 1000) + 900,
        dnt: true,
        sub: 'cc-slas::test_001::scid:taob-client::usid:session-1',
        isb: `uido:ecom::upn:${loginId}::rcid:customer-1::chid:${settings.siteId}::agent:agent-1`,
    };
    const accessToken = `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
    return { accessToken, identity: parseTrustedAgentToken(accessToken, { ...settings, loginId }) };
}

const request = (cookie = '') => new Request('https://store.example/cart', { headers: { Cookie: cookie } });
const cookieHeader = (response: Response) =>
    response.headers
        .getSetCookie()
        .filter((entry) => !entry.includes('Expires=Thu, 01 Jan 1970'))
        .map((entry) => entry.split(';')[0])
        .join('; ');

async function activeState() {
    const { context } = makeContext();
    await restoreTrustedAgentState(request(), context);
    const result = makeResult();
    await establishTrustedAgentState(context, result, 'context-1');
    const response = new Response();
    await persistTrustedAgentState(context, response);
    return { context, result, response, cookie: cookieHeader(response) };
}

beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    // WebCrypto and TextEncoder use Node's typed-array realm in jsdom.
    vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
    vi.stubEnv('TAOB_COOKIE_KEYS', JSON.stringify([{ id: 'test', key: Buffer.alloc(32, 1).toString('base64url') }]));
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('protected trusted-agent session contracts', () => {
    it('restores only a bound credential pair and publishes a credential-free public projection', async () => {
        const { cookie, result, response } = await activeState();
        const { context } = makeContext();
        expect((await restoreTrustedAgentState(request(cookie), context)).lifecycle.mode).toBe('active');
        const session = getTrustedAgentSessionData(context);
        expect(session).toMatchObject({
            authMode: 'trusted-agent',
            accessToken: result.accessToken,
            customerId: 'customer-1',
            actingAgent: { contextVersion: 'context-1', status: 'active' },
        });
        const publicData = getPublicSessionData(session);
        expect(publicData.actingAgent?.agentId).toBe('agent-1');
        expect(JSON.stringify(publicData)).not.toContain(result.accessToken);
        expect(publicData.actingAgent?.loginId).toBe(loginId);
        expect(JSON.stringify({ ...publicData, actingAgent: undefined })).not.toContain(loginId);
        expect(session.refreshToken).toBeUndefined();
        const metadata = response.headers
            .getSetCookie()
            .find((entry) => entry.startsWith(`${name(TAOB_COOKIES.session)}=`));
        expect(metadata).toContain('HttpOnly');
        expect(metadata).toContain('Secure');
        expect(metadata).not.toContain('Expires=');
        expect(metadata).not.toContain(loginId);
    });

    it('retains protected recovery identity after token expiry without a replacement refresh token', async () => {
        const { cookie } = await activeState();
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now + 901000);
        const { context } = makeContext();
        expect((await restoreTrustedAgentState(request(cookie), context)).lifecycle.mode).toBe('reauth-required');
        expect(getTrustedAgentSessionData(context)).toMatchObject({
            authMode: 'trusted-agent',
            customerId: 'customer-1',
            actingAgent: { status: 'reauth-required' },
        });
        expect(getTrustedAgentSessionData(context).accessToken).toBeUndefined();
        expect(getTrustedAgentSessionData(context).refreshToken).toBeUndefined();
    });

    it('rejects token mismatch, duplicate cookies, and a changed client binding', async () => {
        const { cookie, result } = await activeState();
        const wrongToken = cookie.replace(result.accessToken, 'different-token');
        for (const value of [wrongToken, `${cookie}; ${name(TAOB_COOKIES.session)}=`]) {
            expect((await restoreTrustedAgentState(request(value), makeContext().context)).lifecycle.mode).toBe(
                'blocked'
            );
        }
        const { context, config } = makeContext();
        config.features.trustedAgent = { enabled: true, clientId: 'other', callbackUri: '/login/agent/callback' };
        expect((await restoreTrustedAgentState(request(cookie), context)).lifecycle.mode).toBe('blocked');
    });

    it('keeps launch hints separate from authentication', async () => {
        const { context } = makeContext();
        await restoreTrustedAgentState(request(), context);
        const header = await serializeTrustedAgentLaunch(loginId, context);
        const launchRequest = request(header.split(';')[0]);
        expect((await restoreTrustedAgentState(launchRequest, context)).lifecycle.mode).toBe('none');
        expect(await readTrustedAgentLaunch(launchRequest, context)).toBe(loginId);
        expect(getTrustedAgentSessionData(context)).toEqual({});
    });

    it('clears the launch hint once the session is active so a later form does not prefill the previous shopper', async () => {
        const { response } = await activeState();
        const launchCookie = response.headers
            .getSetCookie()
            .find((entry) => entry.startsWith(`${TAOB_COOKIES.launch}`));
        expect(launchCookie).toContain('Expires=Thu, 01 Jan 1970');
    });

    it('treats lifecycle paths as ordinary routes when trusted agent is disabled and no agent state exists', async () => {
        const { context, config } = makeContext();
        config.features.trustedAgent = {
            enabled: false,
            clientId: settings.clientId,
            callbackUri: '/login/agent/callback',
        };
        const state = await restoreTrustedAgentState(new Request('https://store.example/login/agent'), context);
        expect(state.lifecycleRoute).toBe(false);
    });

    it('marks lifecycle paths as lifecycle routes when trusted agent is enabled', async () => {
        const { context } = makeContext();
        const state = await restoreTrustedAgentState(new Request('https://store.example/login/agent'), context);
        expect(state.lifecycleRoute).toBe(true);
    });

    it('protects transaction context and rejects expired authorization attempts', async () => {
        const { context } = await activeState();
        setTrustedAgentTransaction(context, {
            loginId,
            codeVerifier: 'v'.repeat(64),
            redirectUri: 'https://store.example/login/agent/callback',
            nonce: 'nonce',
            contextVersion: 'next',
            createdAt: Date.now() - 301000,
        });
        const response = new Response();
        await persistTrustedAgentState(context, response);
        expect(
            (await restoreTrustedAgentState(request(cookieHeader(response)), makeContext().context)).lifecycle.mode
        ).toBe('blocked');
    });

    it('bounds cookie size and uses consistent write/delete scope', async () => {
        const { context, config } = makeContext();
        config.cookies = { domain: '.store.example' };
        const write = await serializeTrustedAgentCookie(TAOB_COOKIES.session, 'value', context);
        const remove = await serializeTrustedAgentCookie(TAOB_COOKIES.session, '', context, new Date(0));
        expect(write).toContain('Domain=.store.example');
        expect(remove).toContain('Domain=.store.example');
        expect(write).toContain('Path=/');
        expect(remove).toContain('Path=/');
        await expect(serializeTrustedAgentCookie(TAOB_COOKIES.session, 'x'.repeat(4096), context)).rejects.toThrow(
            'Trusted agent cookie exceeds supported size or format'
        );
    });

    it('ignores cookie entries without a value separator instead of matching a prefix', () => {
        const { context } = makeContext();
        const valuelessRequest = new Request('https://store.example/', {
            headers: { cookie: `${name(TAOB_COOKIES.accessToken)}X; other=1` },
        });
        expect(readTrustedAgentCookie(valuelessRequest, TAOB_COOKIES.accessToken, context)).toBeUndefined();
    });
});
