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
import { createCookie, RouterContextProvider } from 'react-router';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { mockI18nContext } from '@salesforce/storefront-next-runtime/i18n';
import { createInstance } from 'i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import authMiddleware, { getAuth, updateAuth } from '@/middlewares/auth.server';
import { authContext, authStorageContext, AUTH_TOKEN_INVALID_ERROR } from '@/middlewares/auth.utils';
import {
    basketMetadataContext,
    basketResourceContext,
    createBasketMiddleware,
    getBasket,
    updateBasketResource,
} from '@/middlewares/basket.server';
import { BASKET_COOKIE_NAME, parseBasketCookie } from '@/lib/basket/cookie';
import { mergeBasket } from '@/lib/api/basket.server';
import { createApiClients } from '@/lib/api-clients.server';
import { action as finishPasskey } from '@/routes/action.passkey-finish-authentication';
import { action as verifyOtp } from '@/routes/action.verify-passwordless-otp';
import { createMaintenance, maintenanceContext } from '@/lib/maintenance';
import { loggerContext } from '@/lib/logger.server';
import type { Logger } from '@/lib/logger';
import { mockConfig, mockSiteObject, mockLocale } from '@/test-utils/config';
import { buildMockAccessToken, buildMockTokenResponse } from '@/test-utils/auth';
import { completeRegisteredLogin } from './complete-registered-login.server';
import { performanceTimerContext } from '@/middlewares/performance-metrics';

// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
vi.mock('@/extensions/store-locator/lib/store-selection.server', () => ({
    prepareStoreSelectionForLogin: vi.fn(() => Promise.resolve(false)),
    assertStoreSelectionLoginSession: vi.fn(),
    reconcileStoreAfterAuthentication: vi.fn(() => Promise.resolve(undefined)),
}));
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

const token = buildMockTokenResponse({ accessToken: { rcid: 'new-customer', chid: mockSiteObject.id } });
const snapshot = { basketId: 'guest-basket', totalItemCount: 2, uniqueProductCount: 1, lastModified: '' };
let requests: Request[];
let refreshedToken = token;
let refreshStatus = 200;
let basketReply: (request: Request) => Response;
const matchingRequests = (path: string, method?: string) =>
    requests.filter((request) => request.url.includes(path) && (!method || request.method === method));

beforeEach(() => {
    requests = [];
    refreshedToken = token;
    refreshStatus = 200;
    basketReply = (request) =>
        request.method === 'POST'
            ? Response.json({}, { status: 401 })
            : request.url.includes('/customers/')
              ? Response.json({ baskets: [] })
              : Response.json({}, { status: 404 });
    vi.stubGlobal('window', undefined);
    vi.stubEnv('SCAPI_PROXY_HOST', '');
    vi.stubGlobal(
        'fetch',
        vi.fn((input: URL | RequestInfo, init?: RequestInit) => {
            const request = input instanceof Request ? input : new Request(input, init);
            requests.push(request);
            if (request.url.includes('/webauthn/authenticate'))
                return Promise.resolve(Response.json({ tokenResponse: token }));
            if (request.url.includes('/passwordless/token')) return Promise.resolve(Response.json(token));
            if (request.url.includes('/oauth2/token'))
                return Promise.resolve(Response.json(refreshedToken, { status: refreshStatus }));
            if (request.url.includes('/product-lists')) return Promise.resolve(Response.json({ data: [] }));
            if (request.url.includes('/baskets')) return Promise.resolve(basketReply(request));
            throw new Error(`Unexpected core request: ${request.method} ${request.url}`);
        })
    );
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

/** Auth and basket only: the core suite must survive optional extension removal. */
async function session(
    check: (context: RouterContextProvider) => Promise<void> | void,
    options: { basket?: boolean; path?: string; response?: Response; guard?: boolean } = {}
) {
    const context = new RouterContextProvider();
    context.set(appConfigContext, {
        ...mockConfig,
        features: { ...mockConfig.features, passkey: { enabled: true } },
    } as never);
    context.set(siteContext, {
        site: { ...mockSiteObject, cookies: { domain: '.example.com' } },
        locale: mockLocale,
    } as never);
    mockI18nContext(context, { locale: 'en-US', instance: createInstance() });
    context.set(maintenanceContext, createMaintenance());
    context.set(performanceTimerContext, undefined as never);
    context.set(loggerContext, { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger);
    context.set(basketMetadataContext, undefined);
    context.set(basketResourceContext, undefined);
    const basketCookie = options.basket
        ? (await createCookie(BASKET_COOKIE_NAME).serialize(snapshot)).split(';')[0]
        : '';
    const request = new Request(`https://example.com${options.path ?? '/login'}`, {
        headers: {
            Cookie: `cc-at_${mockSiteObject.id}=${buildMockAccessToken({ chid: mockSiteObject.id })}${basketCookie ? `; ${basketCookie}` : ''}${options.guard ? `; cc-auth-recover_${mockSiteObject.id}=1` : ''}`,
        },
    });
    const args = { request, context, params: {}, pattern: '/login', url: new URL(request.url) };
    const next = async () => {
        await check(context);
        return options.response ?? new Response('OK');
    };
    const response = await authMiddleware(args, async () => {
        const result = options.basket ? await createBasketMiddleware()(args, next) : await next();
        if (!(result instanceof Response)) throw new Error('Expected basket middleware response');
        return result;
    });
    if (!(response instanceof Response)) throw new Error('Expected middleware response');
    return { response, context, basketCookie };
}

async function completeWithBasket(context: RouterContextProvider, containFailure = false) {
    await completeRegisteredLogin(context, () => Promise.resolve(token));
    try {
        await mergeBasket(context);
    } catch (error) {
        if (!containFailure) throw error;
    }
}

it('updates both real auth caches without any optional profile or store requests', async () => {
    await session(async (context) => {
        await completeRegisteredLogin(context, () => Promise.resolve(token));
        expect(getAuth(context)).toMatchObject({ userType: 'registered', customerId: 'new-customer' });
        expect(await context.get(authContext).ref).toMatchObject({ accessToken: token.access_token });
    });
    expect(requests).toHaveLength(0);
});

it.each([false, true])('characterizes transfer 401 recovery with completed login marked %s', async (completed) => {
    refreshedToken = {
        ...buildMockTokenResponse({ accessToken: { rcid: 'new-customer', extra: { jti: 'recovered' } } }),
        refresh_token: 'rotated',
    };
    let transferError: unknown;
    const completedResponse = new Response(null, { status: 302, headers: { Location: '/cart' } });
    const {
        response,
        context: recoveredContext,
        basketCookie,
    } = await session(
        async (context) => {
            const transfer = async () => {
                try {
                    const basket = await mergeBasket(context);
                    if (basket) updateBasketResource(context, basket);
                } catch (error) {
                    transferError = error;
                }
            };
            if (completed) {
                await completeRegisteredLogin(context, () => Promise.resolve(token));
                await transfer();
            } else {
                updateAuth(context, token);
                await transfer();
            }
            expect(context.get(authStorageContext).get('error')).toBe(completed ? undefined : AUTH_TOKEN_INVALID_ERROR);
        },
        { basket: true, response: completedResponse }
    );
    expect(transferError).toEqual(completed ? undefined : expect.objectContaining({ name: 'AuthTokenInvalidError' }));
    const transfers = matchingRequests('/actions/transfer', 'POST');
    expect(transfers).toHaveLength(1);
    expect(transfers[0].headers.get('Authorization')).toBe(`Bearer ${token.access_token}`);
    expect(new URL(transfers[0].url).searchParams.get('merge')).toBe('true');
    expect(matchingRequests('/oauth2/token')).toHaveLength(1);
    const refreshGrant = new URLSearchParams(await matchingRequests('/oauth2/token')[0].text());
    expect(refreshGrant.get('grant_type')).toBe('refresh_token');
    expect(refreshGrant.get('refresh_token')).toBe(token.refresh_token);
    if (completed) {
        const cookies = response.headers.getSetCookie();
        for (const [name, value] of [
            ['cc-at', refreshedToken.access_token],
            ['cc-nx', refreshedToken.refresh_token],
            ['usid', 'usid-abc'],
        ]) {
            expect(cookies.find((cookie) => cookie.startsWith(`${name}_${mockSiteObject.id}=`))).toContain(value);
        }
        expect(refreshGrant.has('code')).toBe(false);
        expect(refreshGrant.has('otp')).toBe(false);
    }
    expect(getAuth(recoveredContext).accessToken).toBe(refreshedToken.access_token);
    // Only completed logins retain the guest snapshot through recovery; a bare updateAuth retires it like any
    // other authentication change.
    expect(recoveredContext.get(basketResourceContext)).toMatchObject({
        snapshot: completed ? snapshot : null,
        current: null,
    });
    expect(recoveredContext.get(basketMetadataContext)?.basketMarkedForDeletion).toBe(false);
    expect(parseBasketCookie(basketCookie)).toEqual(snapshot);
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith(`${BASKET_COOKIE_NAME}=`))).toBe(false);
    expect(response.status).toBe(completed ? 302 : 307);
    expect(response.headers.get('Location')).toBe(completed ? '/cart' : 'https://example.com/login');
    if (completed) expect(response).toBe(completedResponse);
});

it.each([true, false])('reconciles transferred basket ownership %s without replaying transfer', async (owned) => {
    basketReply = (request) =>
        request.method === 'POST'
            ? Response.json({}, { status: 401 })
            : request.url.includes('/customers/')
              ? Response.json({ baskets: [{ basketId: owned ? 'guest-basket' : 'different' }] })
              : Response.json({ basketId: 'guest-basket', productItems: [{ quantity: 7 }] });
    const { response, context: recoveredContext } = await session((context) => completeWithBasket(context), {
        basket: true,
    });
    expect(recoveredContext.get(basketResourceContext)?.snapshot?.totalItemCount).toBe(owned ? 7 : 2);
    expect(matchingRequests('/actions/transfer', 'POST')).toHaveLength(1);
    expect(matchingRequests('/oauth2/token')).toHaveLength(1);
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith(`${BASKET_COOKIE_NAME}=`))).toBe(owned);
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith('basket-handoff_'))).toBe(!owned);
});

it.each(['customer', 'usid'])('rejects refreshed %s changes before authorized basket reads', async (changed) => {
    basketReply = () => Response.json({}, { status: 401 });
    refreshedToken = buildMockTokenResponse({
        accessToken: {
            rcid: changed === 'customer' ? 'other-customer' : 'new-customer',
            ...(changed === 'usid' ? { usid: 'other-usid' } : {}),
        },
    });
    await expect(session((context) => completeWithBasket(context, true), { basket: true })).rejects.toMatchObject({
        name: 'AuthTokenInvalidError',
    });
    expect(matchingRequests('/oauth2/token')).toHaveLength(1);
    expect(matchingRequests('/baskets', 'GET')).toHaveLength(0);
});

it('never publishes rejected recovery credentials to downstream calls after a swallowed merge failure', async () => {
    refreshedToken = buildMockTokenResponse({ accessToken: { rcid: 'other-customer' } });
    let downstreamToken: string | undefined;
    await expect(
        session(
            async (context) => {
                await completeWithBasket(context, true);
                downstreamToken = getAuth(context).accessToken;
                await getBasket(context).catch(() => undefined);
                await createApiClients(context)
                    .shopperCustomers.getCustomer({ params: { path: { customerId: 'other-customer' } } })
                    .catch(() => undefined);
            },
            { basket: true, path: '/action/passkey-finish-authentication' }
        )
    ).rejects.toThrow();
    expect(downstreamToken).toBe(token.access_token);
    expect(
        requests.some((request) => request.headers.get('Authorization') === `Bearer ${refreshedToken.access_token}`)
    ).toBe(false);
    expect(matchingRequests('/actions/transfer', 'POST')).toHaveLength(1);
});

it('retains uncertain handoff through downstream implicit basket helpers and writes', async () => {
    basketReply = (request) =>
        request.url.includes('/actions/transfer')
            ? Response.json({}, { status: 401 })
            : request.url.includes('/customers/')
              ? Response.json({ baskets: [] })
              : Response.json({}, { status: request.method === 'GET' ? 404 : 200 });
    const { response } = await session(
        async (context) => {
            await completeWithBasket(context);
            expect((await getBasket(context)).snapshot).toEqual(snapshot);
            await createApiClients(context)
                .basket.getOrCreateBasket({ params: { path: { basketId: 'guest-basket' } }, body: { currency: 'USD' } })
                .catch(() => undefined);
            await createApiClients(context)
                .shopperBasketsV2.updateBasket({
                    params: { path: { basketId: 'guest-basket' } },
                    body: { currency: 'USD' },
                })
                .catch(() => undefined);
        },
        { basket: true, path: '/action/verify-passwordless-otp' }
    );
    expect(requests.filter((request) => request.url.includes('/baskets') && request.method !== 'GET')).toHaveLength(1);
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith(`${BASKET_COOKIE_NAME}=`))).toBe(false);
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith('basket-handoff_'))).toBe(true);
});

it.each(
    ['passkey', 'otp'].flatMap((kind) => ['unowned', 'customer', 'usid', 'site'].map((failure) => ({ kind, failure })))
)('contains $failure through the actual consumed $kind callback', async ({ kind, failure }) => {
    vi.stubEnv('COMMERCE_API_SLAS_SECRET', 'fixture-secret');
    if (failure !== 'unowned')
        refreshedToken = buildMockTokenResponse({
            accessToken: {
                rcid: failure === 'customer' ? 'other-customer' : 'new-customer',
                usid: failure === 'usid' ? 'other-session' : 'usid-abc',
                chid: failure === 'site' ? 'other-site' : mockSiteObject.id,
            },
        });
    basketReply = (request) =>
        request.url.includes('/actions/transfer')
            ? Response.json({}, { status: 401 })
            : request.url.includes('/customers/')
              ? Response.json({ baskets: [] })
              : Response.json({}, { status: request.method === 'GET' ? 404 : 200 });
    let callbackSucceeded: boolean | undefined;
    const operation = session(
        async (context) => {
            const form = new FormData();
            form.set('otpCode', 'consumed');
            form.set('email', 'fixture@example.com');
            const request = new Request(`https://example.com/action/${kind}`, {
                method: 'POST',
                body: kind === 'otp' ? form : JSON.stringify({ credential: { id: 'consumed' } }),
                ...(kind === 'passkey' ? { headers: { 'Content-Type': 'application/json' } } : {}),
            });
            const result = await (kind === 'otp' ? verifyOtp : finishPasskey)({
                request,
                context,
                params: {},
                pattern: '',
                url: new URL(request.url),
            } as never);
            callbackSucceeded = result.data.success;
            expect(context.get(basketResourceContext)?.snapshot).toEqual(snapshot);
        },
        { basket: true, path: `/action/${kind}` }
    );
    const result = failure === 'unowned' ? await operation : await operation.catch(() => null);
    expect(callbackSucceeded).toBe(true);
    expect(matchingRequests(kind === 'otp' ? '/passwordless/token' : '/webauthn/authenticate')).toHaveLength(1);
    expect(requests.filter((request) => request.url.includes('/baskets') && request.method !== 'GET')).toHaveLength(1);
    if (failure !== 'unowned') {
        expect(result).toBeNull();
        expect(
            requests.some((request) => request.headers.get('Authorization') === `Bearer ${refreshedToken.access_token}`)
        ).toBe(false);
    } else
        expect(
            result?.response.headers.getSetCookie().some((cookie) => cookie.startsWith(`${BASKET_COOKIE_NAME}=`))
        ).toBe(false);
});

it('retains ordinary auth invalidation redirects when no login completion is marked', async () => {
    const { response } = await session(
        (context) => {
            updateAuth(context, token);
            context.get(authStorageContext).set('error', AUTH_TOKEN_INVALID_ERROR);
        },
        { path: '/account' }
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe('https://example.com/account');
    expect(matchingRequests('/oauth2/token')).toHaveLength(1);
});

it('rejects a malformed token before dispatching downstream work', async () => {
    await session(async (context) => {
        await expect(
            completeRegisteredLogin(context, () => Promise.resolve({ ...token, access_token: 'malformed' }))
        ).rejects.toThrow();
        expect(requests).toHaveLength(0);
        expect(await context.get(authContext).ref).toMatchObject({ userType: 'guest' });
    });
});

const completeInvalidatedLogin = async (context: RouterContextProvider) => {
    await completeRegisteredLogin(context, () => Promise.resolve(token));
    context.get(authStorageContext).set('error', AUTH_TOKEN_INVALID_ERROR);
};

it('rejects completed login recovery with an existing guard without refreshing or replaying', async () => {
    await expect(
        session(completeInvalidatedLogin, { path: '/social-callback?code=consumed', guard: true })
    ).rejects.toThrow('Access token is invalid or revoked');
    expect(requests).toHaveLength(0);
});

it('does not report completed login success or replay proof when refresh fails', async () => {
    refreshStatus = 401;
    await expect(
        session(completeInvalidatedLogin, {
            path: '/social-callback?code=consumed',
            response: new Response(null, { status: 302, headers: { Location: '/account' } }),
        })
    ).rejects.toThrow();
    expect(matchingRequests('/oauth2/token')).toHaveLength(1);
});

it.each(['guest', 'other-customer'])('rejects recovery that changes completed identity to %s', async (identity) => {
    refreshedToken = buildMockTokenResponse({ accessToken: identity === 'guest' ? {} : { rcid: identity } });
    await expect(session(completeInvalidatedLogin)).rejects.toThrow('Access token is invalid or revoked');
    expect(matchingRequests('/oauth2/token')).toHaveLength(1);
});
