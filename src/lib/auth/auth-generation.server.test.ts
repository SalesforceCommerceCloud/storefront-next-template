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
import { mockConfig, mockSiteObject } from '@/test-utils/config';
import { getTrustedAgentCookieCodec } from '@/lib/auth/trusted-agent/cookies.server';
import {
    restoreAuthGeneration,
    advanceAuthGeneration,
    persistAuthGeneration,
    canUseOrdinaryCredentials,
    prepareGuestGeneration,
    AUTH_FENCE_PREFIX,
    AUTH_PROVENANCE_COOKIE,
    AUTH_RESPONSE_WINDOW_MS,
    AUTH_FENCE_MAX_AGE_MS,
    authMutationFailure,
} from '@/lib/auth/auth-generation.server';

vi.mock('@/lib/origin', () => ({ getAppOrigin: () => 'https://store.example' }));
const suffix = `_${mockSiteObject.id}`;
const credentials = { accessToken: 'ordinary-access', refreshToken: 'ordinary-refresh' };
function context(enabled = true) {
    const provider = new RouterContextProvider();
    const config = structuredClone(mockConfig);
    config.features.trustedAgent = { enabled, clientId: 'taob-client', callbackUri: '/login/agent/callback' };
    provider.set(appConfigContext, config);
    provider.set(siteContext, {
        site: mockSiteObject,
        locale: mockSiteObject.supportedLocales[0],
        currency: mockSiteObject.defaultCurrency,
        siteCookie: createCookie('site'),
        localeCookie: createCookie('locale'),
        currencyCookie: createCookie('currency'),
    });
    return provider;
}
const request = (jar: Map<string, string>) =>
    new Request('https://store.example/cart', {
        headers: { Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') },
    });
function apply(jar: Map<string, string>, response: Response) {
    for (const header of response.headers.getSetCookie()) {
        const pair = header.split(';')[0];
        const equals = pair.indexOf('=');
        const name = pair.slice(0, equals);
        if (header.includes('Expires=Thu, 01 Jan 1970')) jar.delete(name);
        else jar.set(name, pair.slice(equals + 1));
    }
}
async function ordinaryJar() {
    const jar = new Map<string, string>();
    const provider = context();
    await restoreAuthGeneration(request(jar), provider);
    advanceAuthGeneration(provider, 'shopper');
    const response = new Response();
    await persistAuthGeneration(provider, response, credentials, true);
    apply(jar, response);
    jar.set(`cc-at${suffix}`, credentials.accessToken);
    jar.set(`cc-nx${suffix}`, credentials.refreshToken);
    return jar;
}
beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
    vi.stubEnv('TAOB_COOKIE_KEYS', JSON.stringify([{ id: 'test', key: Buffer.alloc(32, 1).toString('base64url') }]));
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('browser-persisted auth generation fencing', () => {
    it('binds all mutation methods and bound reads to the current generation, including prefixed data logout', async () => {
        const jar = await ordinaryJar();
        const provider = context();
        const state = await restoreAuthGeneration(request(jar), provider);
        const previous = state.current?.id;
        const current = advanceAuthGeneration(provider, 'trusted-agent');
        expect(current).toBeTypeOf('string');
        for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'GET']) {
            const stale = new Request('https://store.example/action/place-order', {
                method,
                headers: { 'x-sfnext-auth-context': previous ?? '' },
            });
            const failure = authMutationFailure(stale, provider);
            expect(failure?.status).toBe(409);
            expect(failure?.headers.get('x-sfnext-auth-error')).toBe('AUTH_CONTEXT_CHANGED');
            expect(
                authMutationFailure(
                    new Request(stale, { headers: { 'x-sfnext-auth-context': current ?? '' } }),
                    provider
                )
            ).toBeUndefined();
        }
        expect(authMutationFailure(new Request('https://store.example/cart'), provider)).toBeUndefined();
        expect(
            authMutationFailure(new Request('https://store.example/action/place-order', { method: 'POST' }), provider)
                ?.status
        ).toBe(409);
        const config = provider.get(appConfigContext);
        config.url = { ...config.url, prefix: '/:siteId/:localeId' };
        const prefix = `/${mockSiteObject.alias ?? mockSiteObject.id}/${mockSiteObject.supportedLocales[0].id}`;
        expect(
            authMutationFailure(
                new Request(`https://store.example${prefix}/logout.data`, { method: 'POST' }),
                provider,
                true
            )?.status
        ).toBe(409);
        expect(
            authMutationFailure(
                new Request(`https://store.example${prefix}/resource/analytics-proxy`, { method: 'POST' }),
                provider
            )
        ).toBeUndefined();
        for (const query of [`__authContext=${current}&__authContext=${current}`, `__authContext=${previous}`]) {
            expect(
                authMutationFailure(
                    new Request(`https://store.example/cart?${query}`, {
                        method: 'POST',
                        headers: { 'x-sfnext-auth-context': current ?? '' },
                    }),
                    provider
                )?.status
            ).toBe(409);
        }
    });

    it('rejects old assisted work after end and fresh guest establishment', async () => {
        const jar = await ordinaryJar();
        const provider = context();
        await restoreAuthGeneration(request(jar), provider);
        const assisted = advanceAuthGeneration(provider, 'trusted-agent');
        advanceAuthGeneration(provider, 'ended');
        await prepareGuestGeneration(provider);
        expect(
            authMutationFailure(
                new Request(`https://store.example/action/place-order?__authContext=${assisted}`, { method: 'POST' }),
                provider
            )?.status
        ).toBe(409);
    });

    it('still finds the highest authentic boundary behind a malformed marker before an explicit end', async () => {
        const jar = await ordinaryJar();
        const damaged = new Map([[`cc-auth-fence-0-invalid${suffix}`, 'damaged'], ...jar]);
        const provider = context();
        const state = await restoreAuthGeneration(request(damaged), provider);
        expect(state.invalid).toBe(true);
        expect(state.maximum).toBe(1);
        advanceAuthGeneration(provider, 'ended');
        const response = new Response();
        await persistAuthGeneration(provider, response);
        apply(damaged, response);
        expect((await restoreAuthGeneration(request(damaged), context())).current?.mode).toBe('ended');
    });
    it('retains end fences beyond every bounded predecessor refresh lifetime and rejects over-age response writers', async () => {
        const jar = await ordinaryJar();
        const captured = context();
        const { startedAt } = await restoreAuthGeneration(request(jar), captured);
        expect(AUTH_FENCE_MAX_AGE_MS).toBeGreaterThan(90 * 24 * 60 * 60 * 1000);
        vi.spyOn(Date, 'now').mockReturnValue(startedAt + AUTH_RESPONSE_WINDOW_MS + 1);
        const response = new Response();
        await expect(persistAuthGeneration(captured, response, credentials, true)).rejects.toThrow(
            'Authentication response expired'
        );
        expect(response.headers.getSetCookie()).toEqual([]);
    });
    it('binds ordinary access AND refresh credentials and accepts a missing access cookie for legitimate refresh', async () => {
        const jar = await ordinaryJar();
        let provider = context();
        await restoreAuthGeneration(request(jar), provider);
        expect(await canUseOrdinaryCredentials(request(jar), provider)).toBe(true);
        jar.delete(`cc-at${suffix}`);
        provider = context();
        await restoreAuthGeneration(request(jar), provider);
        expect(await canUseOrdinaryCredentials(request(jar), provider)).toBe(true);
        jar.set(`cc-nx${suffix}`, 'another-refresh');
        expect(await canUseOrdinaryCredentials(request(jar), provider)).toBe(false);
    });

    it('retains a credential-free end fence after a late ordinary refresh response and compacts observed older fences', async () => {
        const jar = await ordinaryJar();
        const old = context();
        await restoreAuthGeneration(request(jar), old);
        const end = context();
        await restoreAuthGeneration(request(jar), end);
        advanceAuthGeneration(end, 'ended');
        const ended = new Response();
        await persistAuthGeneration(end, ended);
        apply(jar, ended);
        const late = new Response();
        await persistAuthGeneration(old, late, credentials, true);
        apply(jar, late);
        const current = context();
        const restored = await restoreAuthGeneration(request(jar), current);
        expect(restored.current?.mode).toBe('ended');
        expect(await canUseOrdinaryCredentials(request(jar), current)).toBe(false);
        const compacted = new Response();
        await persistAuthGeneration(current, compacted);
        apply(jar, compacted);
        const markers = [...jar].filter(([name]) => name.startsWith(AUTH_FENCE_PREFIX));
        expect(markers).toHaveLength(1);
        const payload = await getTrustedAgentCookieCodec(current).open(markers[0][1], 'auth-fence');
        expect(Object.keys(payload as object).sort()).toEqual(['id', 'mode', 'sequence']);
        expect(JSON.stringify(payload)).not.toContain(credentials.refreshToken);
        expect(
            ended.headers
                .getSetCookie()
                .some(
                    (header) => header.includes('HttpOnly') && header.includes('Secure') && header.includes('Expires=')
                )
        ).toBe(true);
    });

    it('gives logout precedence over an equal-sequence delayed start and blocks ambiguous competing starts', async () => {
        const jar = await ordinaryJar();
        const left = context();
        const right = context();
        await restoreAuthGeneration(request(jar), left);
        await restoreAuthGeneration(request(jar), right);
        advanceAuthGeneration(left, 'trusted-agent');
        advanceAuthGeneration(right, 'ended');
        const end = new Response();
        await persistAuthGeneration(right, end);
        apply(jar, end);
        const delayed = new Response();
        await persistAuthGeneration(left, delayed);
        apply(jar, delayed);
        expect((await restoreAuthGeneration(request(jar), context())).current?.mode).toBe('ended');
        const jar2 = await ordinaryJar();
        const starts = [context(), context()];
        for (const provider of starts) await restoreAuthGeneration(request(jar2), provider);
        for (const provider of starts) {
            advanceAuthGeneration(provider, 'trusted-agent');
            const response = new Response();
            await persistAuthGeneration(provider, response);
            apply(jar2, response);
        }
        const ambiguous = context();
        expect((await restoreAuthGeneration(request(jar2), ambiguous)).invalid).toBe(true);
        expect(await canUseOrdinaryCredentials(request(jar2), ambiguous)).toBe(false);
    });

    it('fails closed when persistent refresh/provenance survives without its fence', async () => {
        const jar = await ordinaryJar();
        for (const name of jar.keys()) if (name.startsWith(AUTH_FENCE_PREFIX)) jar.delete(name);
        expect(jar.has(`${AUTH_PROVENANCE_COOKIE}${suffix}`)).toBe(true);
        const provider = context();
        expect((await restoreAuthGeneration(request(jar), provider)).invalid).toBe(true);
        expect(await canUseOrdinaryCredentials(request(jar), provider)).toBe(false);
    });

    it('uses the same fresh-guest generation for concurrent requests after logout', async () => {
        const jar = await ordinaryJar();
        const provider = context();
        await restoreAuthGeneration(request(jar), provider);
        advanceAuthGeneration(provider, 'ended');
        const ended = new Response();
        await persistAuthGeneration(provider, ended);
        apply(jar, ended);
        const requests = [context(), context()];
        for (const next of requests) await restoreAuthGeneration(request(jar), next);
        for (const next of requests) {
            await prepareGuestGeneration(next);
            const response = new Response();
            await persistAuthGeneration(next, response, credentials, true);
            apply(jar, response);
        }
        const restored = await restoreAuthGeneration(request(jar), context());
        expect(restored.invalid).toBe(false);
        expect(restored.current?.mode).toBe('shopper');
    });

    it('uses the same initial guest generation for concurrent first-time requests', async () => {
        const jar = new Map<string, string>();
        const requests = [context(), context()];
        for (const next of requests) await restoreAuthGeneration(request(jar), next);
        for (const next of requests) {
            await prepareGuestGeneration(next);
            const response = new Response();
            await persistAuthGeneration(next, response, credentials, true);
            apply(jar, response);
        }
        const restored = await restoreAuthGeneration(request(jar), context());
        expect(restored.invalid).toBe(false);
        expect(restored.current).toMatchObject({ sequence: 0, mode: 'shopper' });
    });

    it('leaves unfenced, feature-disabled ordinary sessions unchanged', async () => {
        const provider = context(false);
        const jar = new Map([
            [`cc-nx${suffix}`, 'legacy-refresh'],
            ['analytics', 'cc-auth-fence-fake'],
            ['cc-auth-fence-1-other_OtherSite', 'other-site-marker'],
        ]);
        expect((await restoreAuthGeneration(request(jar), provider)).required).toBe(false);
        expect(await canUseOrdinaryCredentials(request(jar), provider)).toBe(true);
        const response = new Response();
        await persistAuthGeneration(provider, response, credentials, true);
        expect(response.headers.getSetCookie()).toEqual([]);
    });
});

describe('unreadable auth generation', () => {
    const otherKeyRing = JSON.stringify([{ id: 'rotated', key: Buffer.alloc(32, 2).toString('base64url') }]);
    const assistedCookie = `cc-taob-session${suffix}`;

    it('resets an ordinary shopper to a fresh guest when the sealing key is no longer configured', async () => {
        const jar = await ordinaryJar();
        const oldNames = [...jar.keys()].filter((name) => name.startsWith(AUTH_FENCE_PREFIX));
        vi.stubEnv('TAOB_COOKIE_KEYS', otherKeyRing);
        const provider = context();
        const state = await restoreAuthGeneration(request(jar), provider);
        expect(state).toMatchObject({ invalid: false, reset: true, current: undefined });
        expect(await canUseOrdinaryCredentials(request(jar), provider)).toBe(false);
        expect(await prepareGuestGeneration(provider)).toBe(true);
        const response = new Response();
        await persistAuthGeneration(provider, response, credentials, true);
        apply(jar, response);
        const recovered = await restoreAuthGeneration(request(jar), context());
        expect(recovered).toMatchObject({ invalid: false, reset: false });
        expect(recovered.current?.mode).toBe('shopper');
        for (const name of oldNames) expect(jar.has(name)).toBe(false);
    });

    it('resets when the trusted agent client id changes', async () => {
        const jar = await ordinaryJar();
        const provider = context();
        const { trustedAgent } = provider.get(appConfigContext).features;
        if (!trustedAgent) throw new Error('trustedAgent must be configured by the test context');
        trustedAgent.clientId = 'another-client';
        expect((await restoreAuthGeneration(request(jar), provider)).reset).toBe(true);
    });

    it('stays blocked when an assisted credential cookie still depends on the unreadable fence', async () => {
        const jar = await ordinaryJar();
        jar.set(assistedCookie, 'sealed-session');
        vi.stubEnv('TAOB_COOKIE_KEYS', otherKeyRing);
        const state = await restoreAuthGeneration(request(jar), context());
        expect(state).toMatchObject({ invalid: true, reset: false });
    });

    it('stays blocked when only some fences are unreadable', async () => {
        const jar = await ordinaryJar();
        jar.set(`cc-auth-fence-0-invalid${suffix}`, 'damaged');
        const state = await restoreAuthGeneration(request(jar), context());
        expect(state).toMatchObject({ invalid: true, reset: false });
    });

    it('stays blocked on duplicate fence names', async () => {
        const jar = await ordinaryJar();
        const fenceEntry = [...jar].find(([key]) => key.startsWith(AUTH_FENCE_PREFIX));
        if (!fenceEntry) throw new Error('ordinaryJar must carry a fence cookie');
        const [name, value] = fenceEntry;
        const duplicated = new Request('https://store.example/cart', {
            headers: { Cookie: `${[...jar].map(([k, v]) => `${k}=${v}`).join('; ')}; ${name}=${value}` },
        });
        expect((await restoreAuthGeneration(duplicated, context())).invalid).toBe(true);
    });

    it('stays blocked on duplicate fence names even when the key ring was removed', async () => {
        const jar = await ordinaryJar();
        const fenceEntry = [...jar].find(([key]) => key.startsWith(AUTH_FENCE_PREFIX));
        if (!fenceEntry) throw new Error('ordinaryJar must carry a fence cookie');
        const [name, value] = fenceEntry;
        const duplicated = new Request('https://store.example/cart', {
            headers: { Cookie: `${[...jar].map(([k, v]) => `${k}=${v}`).join('; ')}; ${name}=${value}` },
        });
        vi.stubEnv('TAOB_COOKIE_KEYS', '');
        const state = await restoreAuthGeneration(duplicated, context(false));
        expect(state).toMatchObject({ invalid: true, reset: false, unrecoverable: true });
    });

    it('stays blocked on more fences than the cap even when the key ring was removed', async () => {
        const jar = await ordinaryJar();
        for (let sequence = 1; sequence <= 8; sequence += 1) jar.set(`cc-auth-fence-${sequence}-extra${suffix}`, 'x');
        vi.stubEnv('TAOB_COOKIE_KEYS', '');
        const state = await restoreAuthGeneration(request(jar), context(false));
        expect(state).toMatchObject({ invalid: true, reset: false, unrecoverable: true });
    });

    it('stays blocked when an unreadable fence cookie is oversized', async () => {
        const jar = await ordinaryJar();
        for (const name of [...jar.keys()].filter((key) => key.startsWith(AUTH_FENCE_PREFIX)))
            jar.set(name, 'x'.repeat(5000));
        vi.stubEnv('TAOB_COOKIE_KEYS', otherKeyRing);
        const state = await restoreAuthGeneration(request(jar), context());
        expect(state).toMatchObject({ invalid: true, reset: false });
    });

    it('turns a disabled feature without keys inert and only expires the leftover cookies', async () => {
        const jar = await ordinaryJar();
        vi.stubEnv('TAOB_COOKIE_KEYS', '');
        const provider = context(false);
        const state = await restoreAuthGeneration(request(jar), provider);
        expect(state).toMatchObject({ required: false, reset: true });
        expect(await canUseOrdinaryCredentials(request(jar), provider)).toBe(true);
        const response = new Response();
        await persistAuthGeneration(provider, response);
        const headers = response.headers.getSetCookie();
        expect(headers.length).toBeGreaterThan(0);
        for (const header of headers) expect(header).toContain('Expires=Thu, 01 Jan 1970');
        apply(jar, response);
        expect([...jar.keys()].filter((name) => name.includes('cc-auth-'))).toEqual([]);
    });
});
