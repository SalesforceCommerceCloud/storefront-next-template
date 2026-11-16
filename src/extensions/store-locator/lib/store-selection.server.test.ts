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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import {
    createStaticHandler,
    createStaticRouter,
    StaticRouterProvider,
    RouterContextProvider,
    type MiddlewareFunction,
} from 'react-router';
import { siteContext, type SiteContext } from '@salesforce/storefront-next-runtime/site-context';
import { ApiError, AuthTokenInvalidError, type NativeShopperContext } from '@/scapi';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { createApiClients } from '@/lib/api-clients.server';
import { getAuth, updateAuth } from '@/middlewares/auth.server';
import { completeRegisteredLogin } from '@/lib/api/auth/complete-registered-login.server';
import { buildMockTokenResponse } from '@/test-utils/auth';
import {
    selectedStoreMiddleware,
    selectedStoreContext,
    createSelectedStoreCookie,
} from '@/extensions/store-locator/middlewares/selected-store.server';
import {
    assertStoreSelectionLoginSession,
    prepareStoreSelectionForLogin,
    reconcileStoreAfterAuthentication,
    prepareStoreSelectionForLogout,
    storeSelectionMiddleware,
    selectStore,
    validateSelectedStore,
    shoppingContext,
    STORE_SELECTION_QUALIFIER,
    StoreSelectionError,
    type StoreSelectionConfig,
} from './store-selection.server';
import { action } from '@/extensions/store-locator/routes/action.set-selected-store';

import storeSelectionFixture from '@/extensions/store-locator/tests/fixtures/store-selection.json';
import { processMetadata } from '@/lib/logger';

vi.mock('@/lib/api-clients.server', () => ({ createApiClients: vi.fn() }));
vi.mock('@/middlewares/auth.server', () => ({ getAuth: vi.fn(), updateAuth: vi.fn() }));
vi.mock('@salesforce/storefront-next-runtime/config', async (original) => ({
    ...(await original<typeof import('@salesforce/storefront-next-runtime/config')>()),
    getConfig: vi.fn(),
}));
const logger = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => logger }));

const stores = [
    { id: 'A', name: 'Store A', inventoryId: 'inventory-a' },
    { id: 'B', name: 'Store B', inventoryId: 'inventory-b' },
];
const mappings: StoreSelectionConfig = storeSelectionFixture;
let native: NativeShopperContext;
let enabled: boolean;
let cleanup: boolean;
let items: { productId: string }[];
const patch = vi.fn();
const create = vi.fn();
const basketRead = vi.fn();
const storeRead = vi.fn();
const defaultRead = vi.fn();
const missing = () =>
    new ApiError({
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        body: {
            type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/shopper-context-not-found',
            title: 'Missing',
            detail: 'Missing',
        },
        rawBody: '',
        url: 'https://example.com',
        method: 'PATCH',
    });

function context() {
    const ctx = new RouterContextProvider();
    ctx.set(siteContext, {
        site: { id: 'GroceryNext' },
        locale: { id: 'en-US' },
        currency: 'USD',
    } as SiteContext);
    return ctx;
}
// Runs selected-store and reconciliation middleware around an optional handler.
// Cookie is the incoming header; request overrides method/path. Returns the resulting context and response.
async function run(
    handler?: (ctx: RouterContextProvider) => void | Response | Promise<void | Response>,
    cookie = '',
    request = new Request('https://example.com/', { headers: { Cookie: cookie } })
) {
    const ctx = context();
    const args = { request, context: ctx, params: {} } as unknown as Parameters<MiddlewareFunction<Response>>[0];
    const response = await selectedStoreMiddleware(args, async () => {
        // Expose thrown route responses for service assertions. The document
        // regression below exercises React Router's actual error rendering.
        const inner = await Promise.resolve(
            storeSelectionMiddleware(args, async () => {
                return (await handler?.(ctx)) ?? new Response('ok');
            })
        ).catch((error: unknown) => {
            if (error instanceof Response) return error;
            throw error;
        });
        if (!(inner instanceof Response)) throw new Error('Expected inner middleware response');
        return inner;
    });
    if (!(response instanceof Response)) throw new Error('Expected selected-store middleware response');
    return { ctx, response };
}
// Sends a selection POST through that harness; null requests an explicit clear.
async function runSelectionAction(id: string | null, cookie = '', path = '/action/set-selected-store') {
    const form = new FormData();
    form.set('storeInfo', id ? JSON.stringify({ id }) : '');
    const request = new Request(`https://example.com${path}`, {
        method: 'POST',
        headers: { Cookie: cookie },
        body: form,
    });
    return run(
        async (ctx) => {
            const result = await action({ context: ctx, request } as unknown as Parameters<typeof action>[0]);
            return Response.json(result.data, { status: result.init?.status });
        },
        cookie,
        request
    );
}

const responseCookies = (response: Response) =>
    response.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
const mergeCookies = (...headers: string[]) =>
    [
        ...new Map(
            headers.flatMap((header) =>
                header
                    .split('; ')
                    .filter(Boolean)
                    .map((cookie) => {
                        const separator = cookie.indexOf('=');
                        return [cookie.slice(0, separator), cookie.slice(separator + 1)] as const;
                    })
            )
        ).entries(),
    ]
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
async function remembered(id = 'A', inventoryId = 'inventory-a') {
    return (
        await createSelectedStoreCookie(context()).serialize(encodeURIComponent(JSON.stringify({ id, inventoryId })))
    ).split(';')[0];
}

// Client assertions are preference metadata, never authorization or native write preconditions.
async function clientPreferences(
    id = 'A',
    recordOverrides: Record<string, unknown> = {},
    sessionOverrides: Record<string, unknown> = {}
) {
    const sessionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    return [
        await remembered(id),
        `storeChoiceSession_GroceryNext=${encodeURIComponent(JSON.stringify({ version: 1, siteId: 'GroceryNext', sessionId, issuedAt: Date.now(), ...sessionOverrides }))}`,
        `storeChoiceRecord_GroceryNext=${encodeURIComponent(JSON.stringify({ storeId: id, revision: 'client-preference-revision', sessionId, committedAt: new Date().toISOString(), ...recordOverrides }))}`,
    ].join('; ');
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateAuth).mockReset();
    defaultRead.mockResolvedValue({ data: { preferredStoreId: 'B' } });
    enabled = true;
    cleanup = false;
    items = [];
    native = {
        sourceCode: 'email',
        couponCodes: ['SAVE'],
        customerGroupIds: ['loyal'],
        assignmentQualifiers: { campaign: 'summer' },
        customQualifiers: { device: 'mobile' },
    };
    patch.mockImplementation(({ body }: { body: NativeShopperContext }) => {
        for (const [key, values] of Object.entries(body)) {
            if (key === 'assignmentQualifiers' || key === 'customQualifiers') {
                const next: Record<string, string | null> = { ...native[key] };
                for (const [name, value] of Object.entries(values as Record<string, string | null>)) {
                    if (value === null) delete next[name];
                    else next[name] = value;
                }
                native = { ...native, [key]: next };
            } else native = { ...native, [key]: values };
        }
        return Promise.resolve({ data: structuredClone(native) });
    });
    create.mockImplementation(({ body }: { body: NativeShopperContext }) => {
        native = structuredClone(body);
        return Promise.resolve({ data: native });
    });
    storeRead.mockImplementation(() => Promise.resolve({ data: { data: stores } }));
    basketRead.mockImplementation(() =>
        Promise.resolve({ data: { baskets: [{ basketId: 'basket', productItems: items }] } })
    );
    vi.mocked(getConfig).mockImplementation(
        () =>
            ({
                url: { prefix: '/:siteId/:localeId' },
                features: {
                    shopperContext: { enabled, storeSelectionEnabled: true, storeSelection: { ...mappings, cleanup } },
                },
            }) as ReturnType<typeof getConfig>
    );
    vi.mocked(getAuth).mockReturnValue({
        usid: 'guest-usid',
        customerId: 'guest-customer',
        userType: 'guest',
        accessToken: 'guest-token',
    } as ReturnType<typeof getAuth>);
    vi.mocked(createApiClients).mockReturnValue({
        shopperContext: {
            updateShopperContext: patch,
            createShopperContext: create,
            getShopperContext: vi.fn(() => Promise.resolve({ data: structuredClone(native) })),
        },
        shopperStores: { getStores: storeRead },
        shopperCustomers: { getCustomerBaskets: basketRead, getCustomer: defaultRead },
    } as unknown as ReturnType<typeof createApiClients>);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

let validationNamespace = 0;
function enableValidationCache(ttl = 30) {
    const config = getConfig(context());
    const value = {
        ...config,
        commerce: {
            ...config.commerce,
            api: {
                ...config.commerce?.api,
                organizationId: `cache-${++validationNamespace}`,
                shortCode: 'test',
                clientId: 'client',
            },
        },
        features: {
            ...config.features,
            shopperContext: {
                ...config.features.shopperContext,
                storeSelection: {
                    ...mappings,
                    storesBySite: structuredClone(mappings.storesBySite),
                    storeValidationTtlSeconds: ttl,
                },
            },
        },
    };
    vi.mocked(getConfig).mockReturnValue(value);
    return value;
}
const upstreamFault = (status: number, headers = new Headers()) =>
    new ApiError({
        status,
        statusText: 'Upstream failure',
        headers,
        body: {
            type: 'https://example.com/upstream-fault',
            title: 'private upstream diagnostic',
            detail: 'must not leak',
        },
        rawBody: '',
        url: 'https://example.com',
        method: 'PATCH',
    });

describe('server-owned store validation cache', () => {
    it.each([
        true,
        false,
    ])('reuses recent restore validation without caching native readiness (native: %s)', async (nativeEnabled) => {
        enabled = nativeEnabled;
        enableValidationCache();
        const selected = await runSelectionAction('A');
        const cookie = responseCookies(selected.response);
        await run(undefined, cookie);
        await run(undefined, cookie);
        expect(storeRead).toHaveBeenCalledOnce();
        expect(patch).toHaveBeenCalledTimes(nativeEnabled ? 4 : 0);
    });
    it('expires from validation time rather than sliding on cache hits', async () => {
        enableValidationCache();
        vi.useFakeTimers({ toFake: ['Date'] });
        const ctx = context();
        await validateSelectedStore(ctx, { id: 'A' }, { useCache: true });
        vi.advanceTimersByTime(15000);
        await validateSelectedStore(ctx, { id: 'A' }, { useCache: true });
        expect(storeRead).toHaveBeenCalledOnce();
        vi.advanceTimersByTime(15000);
        await validateSelectedStore(ctx, { id: 'A' }, { useCache: true });
        expect(storeRead).toHaveBeenCalledTimes(2);
    });
    it.each([0, -1, 301, Number.NaN])('disables caching for TTL %s', async (ttl) => {
        enableValidationCache(ttl);
        await validateSelectedStore(context(), { id: 'A' }, { useCache: true });
        await validateSelectedStore(context(), { id: 'A' }, { useCache: true });
        expect(storeRead).toHaveBeenCalledTimes(2);
    });
    it('refreshes an explicit selection despite a recent cached restore', async () => {
        enableValidationCache();
        const selected = await runSelectionAction('A');
        storeRead.mockClear();
        await runSelectionAction('A', responseCookies(selected.response));
        expect(storeRead).toHaveBeenCalled();
    });
    it.each([
        'missing-record',
        'missing-key',
    ])('refreshes store validation before native repair: %s', async (damage) => {
        enableValidationCache();
        const selected = await runSelectionAction('A');
        if (damage === 'missing-record') native = {};
        else if (native.assignmentQualifiers) delete native.assignmentQualifiers.store;
        storeRead.mockClear();
        const restored = await run(undefined, responseCookies(selected.response));
        expect(restored.ctx.get(selectedStoreContext)?.id).toBe('A');
        expect(storeRead).toHaveBeenCalledOnce();
        expect(native.assignmentQualifiers?.store).toBe('store-a');
    });
    it.each([
        'backend',
        'organization',
        'client',
        'site',
        'locale',
        'currency',
        'shopper',
        'customer',
        'mapping',
    ])('partitions cached validation by %s', async (scope) => {
        const config = enableValidationCache();
        const ctx = context();
        await validateSelectedStore(ctx, { id: 'A' }, { useCache: true });
        if (scope === 'backend') vi.stubEnv('SCAPI_PROXY_HOST', 'https://other-backend.example.com');
        if (scope === 'organization') config.commerce.api.organizationId = 'other-organization';
        if (scope === 'client') config.commerce.api.clientId = 'other-client';
        if (scope === 'mapping')
            config.features.shopperContext.storeSelection.storesBySite.GroceryNext.A.assignmentQualifiers.store =
                'new-store-assignment';
        if (scope === 'shopper' || scope === 'customer')
            vi.mocked(getAuth).mockReturnValue({
                usid: scope === 'shopper' ? 'other-usid' : 'guest-usid',
                customerId: scope === 'customer' ? 'other-customer' : 'guest-customer',
            } as ReturnType<typeof getAuth>);
        if (scope === 'site' || scope === 'locale' || scope === 'currency') {
            const site = structuredClone(ctx.get(siteContext));
            if (!site) throw new Error('Expected site context');
            if (scope === 'site') site.site.id = 'OtherSite';
            if (scope === 'locale') site.locale.id = 'fr-FR';
            if (scope === 'currency') site.currency = 'EUR';
            ctx.set(siteContext, site);
        }
        await validateSelectedStore(ctx, { id: 'A' }, { useCache: true });
        expect(storeRead).toHaveBeenCalledTimes(2);
    });
    it('does not cache native store data that disagrees with the current inventory mapping', async () => {
        enableValidationCache();
        storeRead.mockResolvedValueOnce({ data: { data: [{ ...stores[0], inventoryId: 'wrong-inventory' }] } });
        await validateSelectedStore(context(), { id: 'A' }, { useCache: true });
        expect((await validateSelectedStore(context(), { id: 'A' }, { useCache: true })).inventoryId).toBe(
            'inventory-a'
        );
        expect(storeRead).toHaveBeenCalledTimes(2);
    });
    it('does not serve an older success after a failed fresh validation', async () => {
        enableValidationCache();
        await validateSelectedStore(context(), { id: 'A' }, { useCache: true });
        storeRead.mockRejectedValueOnce(new Error('Store API unavailable'));
        await expect(validateSelectedStore(context(), { id: 'A' })).rejects.toThrow('Store API unavailable');
        await validateSelectedStore(context(), { id: 'A' }, { useCache: true });
        expect(storeRead).toHaveBeenCalledTimes(3);
    });
    it('does not let an older completion replace a newer cache entry', async () => {
        enableValidationCache();
        let resolve!: (value: unknown) => void;
        storeRead.mockReturnValueOnce(
            new Promise((done) => {
                resolve = done;
            })
        );
        const older = validateSelectedStore(context(), { id: 'A' });
        storeRead.mockResolvedValueOnce({ data: { data: [{ ...stores[0], name: 'Updated store' }] } });
        await validateSelectedStore(context(), { id: 'A' });
        resolve({ data: { data: stores } });
        await older;
        expect((await validateSelectedStore(context(), { id: 'A' }, { useCache: true })).name).toBe('Updated store');
        expect(storeRead).toHaveBeenCalledTimes(2);
    });
    it('bounds stored validations and evicts older entries', async () => {
        enabled = false;
        enableValidationCache();
        storeRead.mockImplementation(({ params }) =>
            Promise.resolve({ data: { data: [{ id: params.query.ids, inventoryId: 'inventory' }] } })
        );
        for (let i = 0; i < 1001; i++) await validateSelectedStore(context(), { id: `store-${i}` }, { useCache: true });
        await validateSelectedStore(context(), { id: 'store-0' }, { useCache: true });
        await validateSelectedStore(context(), { id: 'store-1000' }, { useCache: true });
        expect(storeRead).toHaveBeenCalledTimes(1002);
    });
});

describe('store-selection failure classification', () => {
    it.each([
        [400, 500, 'STORE_CONTEXT_REJECTED'],
        [401, 401, 'STORE_CONTEXT_AUTH_REQUIRED'],
        [403, 500, 'STORE_CONTEXT_REJECTED'],
        [404, 500, 'STORE_CONTEXT_REJECTED'],
        [429, 503, 'STORE_CONTEXT_RATE_LIMITED'],
        [503, 503, 'STORE_CONTEXT_UNAVAILABLE'],
        [408, 504, 'STORE_CONTEXT_TIMEOUT'],
        [504, 504, 'STORE_CONTEXT_TIMEOUT'],
        [500, 502, 'STORE_CONTEXT_UNAVAILABLE'],
    ])('classifies a native commit HTTP %s as BFF %s (%s)', async (upstream, status, code) => {
        patch
            .mockResolvedValueOnce({ data: structuredClone(native) })
            .mockRejectedValueOnce(upstreamFault(Number(upstream)));
        const result = await runSelectionAction('A');
        expect(result.response.status).toBe(status);
        const body = await result.response.text();
        expect(JSON.parse(body)).toEqual({ success: false, code });
        expect(body).not.toContain('private upstream diagnostic');
        // Starting a preference session is harmless; a failed commit must publish no selection or record.
        expect(
            result.response.headers
                .getSetCookie()
                .some((header) => /^(selectedStoreInfo|storeChoiceRecord)_/.test(header))
        ).toBe(false);
        expect(native.assignmentQualifiers?.store).toBeUndefined();
    });
    it.each([429, 503])('preserves valid upstream Retry-After for %s', async (status) => {
        patch.mockRejectedValueOnce(upstreamFault(status, new Headers({ 'Retry-After': '30' })));
        const result = await run();
        expect(result.response.status).toBe(503);
        expect(result.response.headers.get('Retry-After')).toBe('30');
    });
    it('propagates SDK token invalidation to centralized auth recovery', async () => {
        patch
            .mockResolvedValueOnce({ data: structuredClone(native) })
            .mockRejectedValueOnce(new AuthTokenInvalidError());
        await expect(runSelectionAction('A')).rejects.toBeInstanceOf(AuthTokenInvalidError);
        expect(native.assignmentQualifiers?.store).toBeUndefined();
    });
    it('classifies malformed browser JSON as input failure', async () => {
        const form = new FormData();
        form.set('storeInfo', '{');
        const result = await run(async (ctx) => {
            const response = await action({
                context: ctx,
                request: new Request('https://example.com/action/set-selected-store', { method: 'POST', body: form }),
            } as unknown as Parameters<typeof action>[0]);
            return Response.json(response.data, { status: response.init?.status });
        });
        expect(result.response.status).toBe(400);
        expect(await result.response.json()).toEqual({ success: false, code: 'INVALID_STORE_INFO' });
    });
});

describe('native store selection', () => {
    it.each([true, false])('restores well-formed unsigned preference metadata (native: %s)', async (nativeEnabled) => {
        enabled = nativeEnabled;
        const restored = await run(undefined, await clientPreferences());
        expect(restored.ctx.get(selectedStoreContext)).toEqual(stores[0]);
        expect(restored.ctx.get(shoppingContext)?.selectionOrigin).toBe('explicit');
        if (nativeEnabled) {
            expect(native.assignmentQualifiers).toEqual({ campaign: 'summer', store: 'store-a', group: 'north' });
            expect(JSON.parse(String(native.customQualifiers?.[STORE_SELECTION_QUALIFIER])).revision).not.toBe(
                'client-preference-revision'
            );
        } else expect(patch).not.toHaveBeenCalled();
    });

    it.each([true, false])('selects, restores and clears without a signing key (native: %s)', async (nativeEnabled) => {
        enabled = nativeEnabled;
        const selected = await runSelectionAction('A');
        expect(selected.response.status).toBe(200);
        const cookie = responseCookies(selected.response);
        const recordCookie = cookie.match(/storeChoiceRecord_GroceryNext=([^;]+)/)?.[1];
        if (!recordCookie) throw new Error('Expected unsigned record cookie');
        expect(JSON.parse(decodeURIComponent(recordCookie))).toMatchObject({
            storeId: 'A',
            sessionId: expect.any(String),
        });
        const restored = await run(undefined, cookie);
        expect(restored.ctx.get(shoppingContext)?.selectionOrigin).toBe('explicit');
        const cleared = await runSelectionAction(null, cookie);
        expect(cleared.response.status).toBe(200);
        expect(cleared.ctx.get(selectedStoreContext)).toBeNull();
        if (!nativeEnabled) expect(patch).not.toHaveBeenCalled();
    });

    it('keeps native selection authoritative over conflicting client preference', async () => {
        await runSelectionAction('B');
        const restored = await run(undefined, await clientPreferences('A'));
        expect(restored.ctx.get(selectedStoreContext)).toEqual(stores[1]);
        expect(native.assignmentQualifiers?.store).toBe('store-b');
        expect(restored.ctx.get(shoppingContext)?.selectionOrigin).toBe('remembered');
    });

    it('does not use client preference to bypass confirmation when native lineage is missing', async () => {
        items = [{ productId: 'sku' }];
        const dependentRead = vi.fn();
        const restored = await run(dependentRead, await clientPreferences());
        expect(restored.response.status).toBe(409);
        expect(dependentRead).not.toHaveBeenCalled();
        expect(native.assignmentQualifiers?.store).toBeUndefined();
        expect(patch).toHaveBeenCalledTimes(1); // Readiness only; no qualification commit.
        expect(restored.response.headers.getSetCookie()).toEqual([]);
    });

    it('rejects unconfigured stores despite client-asserted explicit preference', async () => {
        const cookie = await clientPreferences('unknown');
        const restored = await run(undefined, cookie);
        expect(restored.ctx.get(selectedStoreContext)).toBeNull();
        expect(native.assignmentQualifiers?.store).toBeUndefined();
        expect(restored.ctx.get(shoppingContext)?.selectionOrigin).not.toBe('explicit');
    });

    it('uses trusted inventory/qualifiers instead of fields inside preference metadata', async () => {
        const restored = await run(
            undefined,
            await clientPreferences('A', {
                inventoryId: 'invented',
                assignmentQualifiers: { store: 'invented', campaign: 'overwritten' },
            })
        );
        expect(restored.ctx.get(selectedStoreContext)?.inventoryId).toBe('inventory-a');
        expect(native.assignmentQualifiers).toEqual({ campaign: 'summer', store: 'store-a', group: 'north' });
    });

    it.each([
        { storeId: 'B' },
        { revision: '' },
        { revision: 'x'.repeat(257) },
        { sessionId: 'invalid' },
        { storeId: ['A'] },
        { committedAt: 'not-a-date' },
        { committedAt: '2000-01-01' },
        { committedAt: '2099-01-01' },
    ])('ignores mismatched or malformed record metadata without blocking validated restore: %j', async (record) => {
        const restored = await run(undefined, await clientPreferences('A', record));
        expect(restored.ctx.get(selectedStoreContext)?.id).toBe('A');
        expect(restored.ctx.get(shoppingContext)?.selectionOrigin).toBe('remembered');
    });

    it.each([
        { version: 2 },
        { siteId: 'OtherSite' },
        { sessionId: 'invalid' },
        { issuedAt: 'not-a-number' },
        { issuedAt: 0 },
        { issuedAt: Date.now() + 60000 },
    ])('starts a new preference session for invalid session metadata: %j', async (session) => {
        const restored = await run(undefined, await clientPreferences('A', {}, session));
        expect(restored.ctx.get(selectedStoreContext)?.id).toBe('A');
        expect(restored.ctx.get(shoppingContext)?.selectionOrigin).toBe('remembered');
        expect(restored.response.headers.getSetCookie().some((value) => value.startsWith('storeChoiceSession_'))).toBe(
            true
        );
    });

    it.each([
        '%',
        'v1.previous.signature',
        encodeURIComponent('[]'),
        'x'.repeat(4097),
    ])('ignores invalid record wire values (%#)', async (record) => {
        const cookie = (await clientPreferences()).replace(
            /storeChoiceRecord_GroceryNext=[^;]+/,
            `storeChoiceRecord_GroceryNext=${record}`
        );
        const restored = await run(undefined, cookie);
        expect(restored.ctx.get(selectedStoreContext)?.id).toBe('A');
        expect(restored.ctx.get(shoppingContext)?.selectionOrigin).toBe('remembered');
    });

    it('repairs persisted null slots under committed clear metadata before dependent reads', async () => {
        await runSelectionAction('A');
        const cleared = await runSelectionAction(null);
        native.assignmentQualifiers = { ...native.assignmentQualifiers, store: null };
        const dependentRead = vi.fn(() => {
            expect(Object.hasOwn(native.assignmentQualifiers ?? {}, 'store')).toBe(false);
        });
        const restored = await run(dependentRead, responseCookies(cleared.response));
        expect(restored.response.status).toBe(200);
        expect(dependentRead).toHaveBeenCalledOnce();
        expect(native.assignmentQualifiers?.campaign).toBe('summer');
        expect(restored.ctx.get(selectedStoreContext)).toBeNull();
    });

    it('keeps explicit preference across native expiry after revalidating the store', async () => {
        const selected = await runSelectionAction('A');
        native = {};
        const restored = await run(undefined, responseCookies(selected.response));
        expect(restored.ctx.get(selectedStoreContext)?.id).toBe('A');
        expect(restored.ctx.get(shoppingContext)?.selectionOrigin).toBe('explicit');
    });

    it('does not renew the 24-hour preference session on passive reads', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-12T00:00:00Z'));
        const selected = await runSelectionAction('A');
        const cookie = responseCookies(selected.response);
        vi.setSystemTime(new Date('2026-11-12T23:59:59Z'));
        const continued = await run(undefined, cookie);
        expect(continued.ctx.get(shoppingContext)?.selectionOrigin).toBe('explicit');
        expect(continued.response.headers.getSetCookie()).toEqual([]);
        vi.setSystemTime(new Date('2026-11-13T00:00:00Z'));
        const returned = await run(undefined, cookie);
        expect(returned.ctx.get(shoppingContext)?.selectionOrigin).toBe('remembered');
        expect(returned.response.headers.getSetCookie().some((value) => value.startsWith('storeChoiceSession_'))).toBe(
            true
        );
    });

    it('decodes percent-containing preference records once', async () => {
        enabled = false;
        const restored = await run(undefined, await clientPreferences('A', { revision: 'preference%25+café' }));
        expect(restored.ctx.get(shoppingContext)).toMatchObject({
            selectionOrigin: 'explicit',
            contextRevision: 'preference%25+café',
        });
    });
    it.each([
        { nativeEnabled: true, drain: false },
        { nativeEnabled: false, drain: false },
        { nativeEnabled: false, drain: true },
    ])('preserves route cache policy (native: $nativeEnabled, cleanup: $drain)', async ({ nativeEnabled, drain }) => {
        enabled = nativeEnabled;
        cleanup = drain;
        const { response } = await run(
            () => new Response('route response', { headers: { 'Cache-Control': 'public, max-age=300' } })
        );
        expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
    });

    it.each([
        null,
        'B',
    ])('recovers expired context with a stale inventory cookie through explicit selection: %s', async (candidate) => {
        patch.mockRejectedValueOnce(missing());
        const { response, ctx } = await runSelectionAction(candidate, await remembered('A', 'old-inventory'));
        expect(response.status).toBe(200);
        expect(ctx.get(selectedStoreContext)?.id ?? null).toBe(candidate);
        expect(native.assignmentQualifiers?.store).toBe(candidate ? 'store-b' : undefined);
    });

    it.each([
        null,
        'B',
    ])('keeps the basket guard when expired context has a stale inventory cookie: %s', async (candidate) => {
        items = [{ productId: 'sku' }];
        patch.mockRejectedValueOnce(missing());
        const { response } = await runSelectionAction(candidate, await remembered('A', 'old-inventory'));
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 'STORE_CHANGE_CONFIRMATION_REQUIRED' });
        expect(basketRead).toHaveBeenCalled();
        expect(native.assignmentQualifiers?.store).toBeUndefined();
        expect(response.headers.getSetCookie().some((header) => header.startsWith('selectedStoreInfo_'))).toBe(false);
    });

    it.each([true, false])('restores only remembered identity using current store data (native: %s)', async (mode) => {
        enabled = mode;
        const { response, ctx } = await run(undefined, await remembered('A', 'old-inventory'));
        expect(response.status).toBe(200);
        expect(ctx.get(selectedStoreContext)).toEqual(stores[0]);
        expect(ctx.get(shoppingContext)?.selectionOrigin).toBe('remembered');
        expect(decodeURIComponent(decodeURIComponent(response.headers.get('Set-Cookie') ?? ''))).toContain(
            'inventory-a'
        );
        if (!mode) expect(patch).not.toHaveBeenCalled();
    });

    it.each([
        null,
        'B',
    ])('blocks deleted-store recovery when native qualifiers belong to another store: %s', async (candidate) => {
        const first = await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        storeRead.mockResolvedValue({ data: { data: [stores[1]] } });
        native.assignmentQualifiers = { ...native.assignmentQualifiers, store: 'store-b', group: 'south' };
        const before = structuredClone(native);
        patch.mockClear();
        const { response } = await runSelectionAction(candidate, responseCookies(first.response));
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 'NATIVE_STORE_CONTEXT_CONFLICT' });
        expect(native).toEqual(before);
        expect(patch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ body: {} }));
        expect(response.headers.getSetCookie()).toEqual([]);
    });

    it.each([null, 'B'])('blocks invalid-inventory recovery when native qualifiers conflict: %s', async (candidate) => {
        await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        storeRead.mockResolvedValue({
            data: { data: [{ ...stores[0], inventoryId: 'changed-inventory' }, stores[1]] },
        });
        native.assignmentQualifiers = { ...native.assignmentQualifiers, group: 'south' };
        const before = structuredClone(native);
        const { response } = await runSelectionAction(candidate);
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 'NATIVE_STORE_CONTEXT_CONFLICT' });
        expect(native).toEqual(before);
    });

    it.each([
        null,
        'B',
    ])('blocks recovery if the committed store no longer has a trusted mapping: %s', async (candidate) => {
        await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        const config = getConfig(context());
        vi.mocked(getConfig).mockReturnValue({
            ...config,
            features: {
                ...config.features,
                shopperContext: {
                    ...config.features.shopperContext,
                    storeSelection: {
                        ...mappings,
                        storesBySite: { GroceryNext: { B: mappings.storesBySite.GroceryNext.B } },
                    },
                },
            },
        });
        const before = structuredClone(native);
        const { response } = await runSelectionAction(candidate);
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 'NATIVE_STORE_CONTEXT_CONFLICT' });
        expect(native).toEqual(before);
    });

    it.each([
        'not JSON',
        '{}',
    ])('retains malformed native selection diagnostics only in server logs: %s', async (raw) => {
        native.customQualifiers = { ...native.customQualifiers, [STORE_SELECTION_QUALIFIER]: raw };
        const next = vi.fn();
        const { response } = await run(next);
        expect(response.status).toBe(502);
        expect(await response.json()).toMatchObject({ success: false, code: 'INVALID_NATIVE_STORE_CONTEXT' });
        expect(next).not.toHaveBeenCalled();
        const metadata = logger.error.mock.calls.at(-1)?.[1];
        const error = metadata.error;
        expect(error).toBeInstanceOf(StoreSelectionError);
        expect(error.cause).toBeInstanceOf(raw === 'not JSON' ? SyntaxError : Error);
        expect(processMetadata(metadata).cause).toMatchObject({
            name: error.cause.name,
            message: error.cause.message,
        });
    });

    it.each([null, 'B'])('recovers a deleted committed store through explicit selection: %s', async (candidate) => {
        const first = await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        storeRead.mockResolvedValue({ data: { data: [stores[1]] } });
        const cookies = responseCookies(first.response);
        const next = vi.fn();
        expect((await run(next, cookies)).response.status).toBe(400);
        expect(next).not.toHaveBeenCalled();
        expect((await runSelectionAction(candidate, cookies)).response.status).toBe(200);
        expect(native.assignmentQualifiers?.store).toBe(candidate ? 'store-b' : undefined);
        expect(native.assignmentQualifiers?.campaign).toBe('summer');
    });

    it.each([
        '/action/set-selected-store.data',
        '/GroceryNext/en-US/action/set-selected-store',
    ])('accepts the explicit recovery action URL %s', async (path) => {
        await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        storeRead.mockResolvedValue({ data: { data: [stores[1]] } });
        expect((await runSelectionAction(null, '', path)).response.status).toBe(200);
        expect(native.assignmentQualifiers?.store).toBeUndefined();
    });

    it.each([null, 'B'])('requires confirmed change to recover an invalid store with items: %s', async (candidate) => {
        await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        storeRead.mockResolvedValue({ data: { data: [stores[1]] } });
        items = [{ productId: 'sku' }];
        // No selected-store or basket cookie: the native record still requires the basket guard.
        const { response } = await runSelectionAction(candidate);
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
            success: false,
            code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
            current: { id: 'A' },
        });
        expect(native.assignmentQualifiers?.store).toBe('store-a');
    });

    it('allows an explicit clear of a committed store whose inventory mapping changed', async () => {
        await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        storeRead.mockResolvedValue({ data: { data: [{ ...stores[0], inventoryId: 'changed-inventory' }] } });
        expect((await run()).response.status).toBe(400);
        const { response } = await runSelectionAction(null);
        expect(response.status).toBe(200);
        expect(response.headers.getSetCookie().some((header) => header.startsWith('storeChoiceSession_'))).toBe(true);
        expect(native.assignmentQualifiers?.store).toBeUndefined();
    });

    it('does not overwrite an invalid committed store when its replacement is invalid', async () => {
        await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        storeRead.mockResolvedValue({ data: { data: [stores[1]] } });
        const { response } = await runSelectionAction('unknown');
        expect(response.status).toBe(400);
        expect(native.assignmentQualifiers?.store).toBe('store-a');
        expect(response.headers.getSetCookie().some((header) => header.startsWith('selectedStoreInfo_'))).toBe(false);
    });

    it('does not bypass conflicting native qualification during explicit recovery', async () => {
        await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        native.assignmentQualifiers = { ...native.assignmentQualifiers, store: 'store-b' };
        expect((await runSelectionAction(null)).response.status).toBe(409);
        expect(native.assignmentQualifiers.store).toBe('store-b');
    });

    it('does not bypass a restore failure for another POST action', async () => {
        await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        storeRead.mockResolvedValue({ data: { data: [] } });
        const next = vi.fn();
        const request = new Request('https://example.com/action/cart-item-add', { method: 'POST' });
        expect((await run(next, '', request)).response.status).toBe(400);
        expect(next).not.toHaveBeenCalled();
    });

    it.each([true, false])('does not rewrite unchanged selection cookies (native: %s)', async (nativeEnabled) => {
        enabled = nativeEnabled;
        const first = await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        const cookies = responseCookies(first.response);
        const unchanged = await run(undefined, cookies);
        expect(unchanged.response.headers.getSetCookie()).toEqual([]);
        const request = new Request('https://example.com/action/set-selected-store', {
            method: 'POST',
            headers: { Cookie: cookies },
        });
        const explicit = await run(
            async (ctx) => {
                await selectStore(ctx, { id: 'A' });
            },
            cookies,
            request
        );
        expect(explicit.response.headers.getSetCookie().some((header) => header.startsWith('selectedStoreInfo_'))).toBe(
            true
        );
    });

    it('repairs only the missing selected-store cookie when its provenance replica already matches', async () => {
        const first = await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        const cookies = first.response.headers
            .getSetCookie()
            .filter((header) => !header.startsWith('selectedStoreInfo_'))
            .map((header) => header.split(';')[0])
            .join('; ');
        const restored = await run(undefined, cookies);
        expect(restored.response.headers.getSetCookie().map((header) => header.split('=')[0])).toEqual([
            'selectedStoreInfo_GroceryNext',
        ]);
    });

    it('selects A, changes B then A, clears; preserves all unrelated native context', async () => {
        for (const id of ['A', 'B', 'A', null]) {
            const { ctx, response } = await run(async (requestContext) => {
                const result = await selectStore(requestContext, id ? { id } : null);
                expect(result.success).toBe(true);
            });
            expect(ctx.get(selectedStoreContext)?.id ?? null).toBe(id);
            expect(response.headers.get('Set-Cookie')).toContain('selectedStoreInfo_GroceryNext=');
            expect(native).toMatchObject({
                sourceCode: 'email',
                couponCodes: ['SAVE'],
                customerGroupIds: ['loyal'],
                assignmentQualifiers: { campaign: 'summer' },
                customQualifiers: { device: 'mobile' },
            });
        }
        expect(native.assignmentQualifiers).not.toHaveProperty('store');
        expect(create).not.toHaveBeenCalled();
    });

    it('validates restored cookie and keeps its origin remembered', async () => {
        const { ctx } = await run(undefined, await remembered());
        expect(ctx.get(selectedStoreContext)).toEqual(stores[0]);
        expect(ctx.get(shoppingContext)).toMatchObject({ selectionOrigin: 'remembered', preparingStoreId: 'A' });
        expect(ctx.get(shoppingContext)?.explicitChoiceSessionId).toBeUndefined();
    });

    it('repairs a missing native context before dependent reads and same-store selection', async () => {
        native = {};
        patch.mockRejectedValueOnce(missing()).mockRejectedValueOnce(missing());
        await run(
            async (requestContext) => {
                expect(native.assignmentQualifiers?.store).toBe('store-a');
                expect((await selectStore(requestContext, { id: 'A' })).success).toBe(true);
            },
            await remembered()
        );
        expect(create).toHaveBeenCalledTimes(1);
        expect(basketRead).toHaveBeenCalledTimes(1); // restore checks; same-store selection adds no switch check
    });

    it('recovers native choice and cookie after a lost selection response or deleted cookie', async () => {
        await run(async (requestContext) => {
            await selectStore(requestContext, { id: 'B' });
        }); // response lost
        const { ctx } = await run(undefined, await remembered('A'));
        expect(ctx.get(selectedStoreContext)?.id).toBe('B');
        expect(ctx.get(shoppingContext)?.selectionOrigin).toBe('remembered');
        const noCookie = await run();
        expect(noCookie.ctx.get(selectedStoreContext)?.id).toBe('B');
    });

    it('recovers an intentional clear after a lost response without resurrecting an old cookie', async () => {
        await run(async (requestContext) => {
            await selectStore(requestContext, null);
        });
        const { ctx } = await run(undefined, await remembered());
        expect(ctx.get(selectedStoreContext)).toBeNull();
        expect(native.assignmentQualifiers?.store).toBeUndefined();
    });

    it('keeps explicit choice within browser session lineage and downgrades a remembered return', async () => {
        const first = await run(async (requestContext) => {
            await selectStore(requestContext, { id: 'A' });
        });
        expect(first.ctx.get(shoppingContext)?.selectionOrigin).toBe('explicit');
        const session = first.response.headers
            .getSetCookie()
            .find((header) => header.startsWith('storeChoiceSession_'))
            ?.split(';')[0];
        if (!session) throw new Error('Expected a browser session cookie');
        const continued = await run(undefined, session);
        expect(continued.ctx.get(shoppingContext)?.selectionOrigin).toBe('explicit');
        const returned = await run();
        expect(returned.ctx.get(shoppingContext)?.selectionOrigin).toBe('remembered');
    });

    it('rejects invalid store and mismatched trusted or submitted inventory', async () => {
        await run(async (requestContext) => {
            await expect(selectStore(requestContext, { id: 'unknown' })).rejects.toMatchObject({
                code: 'INVALID_STORE',
            });
            await expect(selectStore(requestContext, { id: 'A', inventoryId: 'other' })).rejects.toMatchObject({
                code: 'INVALID_STORE_INVENTORY',
            });
            storeRead.mockResolvedValueOnce({ data: { data: [{ ...stores[0], inventoryId: 'wrong' }] } });
            await expect(selectStore(requestContext, { id: 'A' })).rejects.toMatchObject({
                code: 'INVALID_STORE_MAPPING',
            });
        });
        expect(native.customQualifiers).not.toHaveProperty(STORE_SELECTION_QUALIFIER);
    });

    it('does not publish a new selection on native failure, including an uncertain timeout', async () => {
        const { ctx, response } = await run(async (requestContext) => {
            patch.mockRejectedValueOnce(new Error('timeout'));
            await expect(selectStore(requestContext, { id: 'B' })).rejects.toThrow('timeout');
            expect(requestContext.get(selectedStoreContext)).toBeNull();
        });
        expect(ctx.get(shoppingContext)).toBeNull();
        expect(response.headers.getSetCookie().some((header) => header.startsWith('selectedStoreInfo_'))).toBe(false);
        expect(create).not.toHaveBeenCalled();
    });

    it('requires confirmed-change integration for a nonempty basket, even with no basket cookie', async () => {
        items = [{ productId: 'sku' }];
        await run(async (requestContext) => {
            expect(await selectStore(requestContext, { id: 'B' })).toMatchObject({
                success: false,
                code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
            });
            expect(requestContext.get(selectedStoreContext)).toBeNull();
        });
        expect(patch).toHaveBeenCalledTimes(1); // readiness only
        expect(native.assignmentQualifiers?.store).toBeUndefined();
    });

    it('cleans native store qualifiers explicitly while off, even after cookie removal', async () => {
        await run(async (requestContext) => {
            await selectStore(requestContext, { id: 'A' });
        });
        enabled = false;
        cleanup = true;
        await run();
        expect(native.assignmentQualifiers).toEqual({ campaign: 'summer' });
        expect(native.customQualifiers).toEqual({ device: 'mobile' });
        expect(native.sourceCode).toBe('email');
    });

    it('blocks dependent commerce reads if native repair fails', async () => {
        const dependentRead = vi.fn();
        patch.mockRejectedValueOnce(new Error('503 unavailable'));
        const { response } = await run(dependentRead, await remembered());
        expect(response.status).toBe(502);
        expect(dependentRead).not.toHaveBeenCalled();
        expect(response.headers.getSetCookie().some((header) => header.startsWith('selectedStoreInfo_'))).toBe(false);
    });

    it.each(['EDIT', 'PREVIEW'])('bypasses selection reconciliation in Page Designer %s mode', async (mode) => {
        const next = vi.fn(() => new Response('editor'));
        const cookie = await remembered();
        const { response } = await run(
            next,
            cookie,
            new Request(`https://example.com/?mode=${mode}`, { headers: { Cookie: cookie } })
        );
        expect(response.status).toBe(200);
        expect(next).toHaveBeenCalledOnce();
        expect(patch).not.toHaveBeenCalled();
        expect(storeRead).not.toHaveBeenCalled();
        expect(response.headers.getSetCookie()).toEqual([]);
    });

    it('keeps cookie-based selection when only generic Shopper Context is enabled', async () => {
        const config = getConfig(context());
        vi.mocked(getConfig).mockReturnValue({
            ...config,
            features: {
                ...config.features,
                shopperContext: { ...config.features.shopperContext, storeSelectionEnabled: false },
            },
        });
        const before = structuredClone(native);
        const { response } = await runSelectionAction('A');
        expect(response.status).toBe(200);
        expect(responseCookies(response)).toContain('selectedStoreInfo_');
        expect(patch).not.toHaveBeenCalled();
        expect(native).toEqual(before);
    });

    it('does not let Page Designer query parameters bypass a mutation guard', async () => {
        patch.mockRejectedValueOnce(new Error('native unavailable'));
        const next = vi.fn();
        const { response } = await run(
            next,
            '',
            new Request('https://example.com/action/cart-item-add?mode=EDIT', { method: 'POST' })
        );
        expect(response.status).toBe(502);
        expect(next).not.toHaveBeenCalled();
    });

    it('keeps flag-off pages available during Store API failure without erasing the remembered cookie', async () => {
        enabled = false;
        storeRead.mockRejectedValueOnce(new Error('Store API unavailable'));
        const next = vi.fn(() => new Response('legacy storefront'));
        const { ctx, response } = await run(next, await remembered());
        expect(response.status).toBe(200);
        expect(ctx.get(selectedStoreContext)).toBeNull();
        expect(next).toHaveBeenCalledOnce();
        expect(response.headers.getSetCookie().some((header) => header.startsWith('selectedStoreInfo_'))).toBe(false);
        expect(patch).not.toHaveBeenCalled();
    });

    it.each([
        { path: '/', failure: 'upstream', status: 502 },
        { path: '/p/product-a', failure: 'malformed', status: 502 },
        { path: '/c/category-a', failure: 'conflict', status: 409 },
        { path: '/', failure: 'cleanup', status: 502 },
    ])('renders the router error boundary on $failure for GET $path', async ({ path, failure, status }) => {
        if (failure === 'malformed') {
            native.customQualifiers = { [STORE_SELECTION_QUALIFIER]: 'not JSON' };
        } else if (failure === 'conflict') {
            await run(async (ctx) => {
                await selectStore(ctx, { id: 'A' });
            });
            native.assignmentQualifiers = { ...native.assignmentQualifiers, store: 'store-b' };
        } else {
            if (failure === 'cleanup') {
                enabled = false;
                cleanup = true;
            }
            patch.mockRejectedValueOnce(new Error('upstream diagnostic must remain private'));
        }
        const dependentRead = vi.fn(() => null);
        const request = new Request(`https://example.com${path}`, {
            headers: { Accept: 'text/html', Cookie: await remembered() },
        });
        const router = createStaticHandler([
            {
                id: 'root',
                path: '*',
                middleware: [selectedStoreMiddleware, storeSelectionMiddleware].map(
                    (middleware) => (args, next) =>
                        middleware(args, async () => {
                            const response = await next();
                            if (!(response instanceof Response))
                                throw new Error('Expected a server middleware response');
                            return response;
                        })
                ),
                loader: dependentRead,
                Component: () => createElement('main', null, 'Commerce page'),
                ErrorBoundary: () => createElement('main', { 'data-testid': 'error-page' }, 'Something went wrong'),
            },
        ]);
        const response = await router.query(request, {
            requestContext: context(),
            generateMiddlewareResponse: async (query) => {
                const result = await query(request);
                if (result instanceof Response) return result;
                const headers = new Headers(result.loaderHeaders.root);
                headers.set('Content-Type', 'text/html');
                return new Response(
                    renderToString(
                        createElement(StaticRouterProvider, {
                            router: createStaticRouter(router.dataRoutes, result),
                            context: result,
                            hydrate: false,
                        })
                    ),
                    { status: result.statusCode, headers }
                );
            },
        });
        expect(response).toBeInstanceOf(Response);
        if (!(response instanceof Response)) throw new Error('Expected a document response');
        expect(response.status).toBe(status);
        expect(response.headers.get('Content-Type')).toBe('text/html');
        expect(response.headers.get('Cache-Control')).toBeNull();
        const html = await response.text();
        expect(html).toContain('data-testid="error-page"');
        expect(html).toContain('Something went wrong');
        expect(html).not.toContain('STORE_CONTEXT_UNAVAILABLE');
        expect(html).not.toContain('upstream diagnostic');
        expect(dependentRead).not.toHaveBeenCalled();
        expect(response.headers.getSetCookie()).toEqual([]);
    });

    it('throws a route error for HEAD requests without running dependent reads', async () => {
        patch.mockRejectedValueOnce(new Error('native unavailable'));
        const next = vi.fn();
        const ctx = context();
        const request = new Request('https://example.com/p/product-a', { method: 'HEAD' });
        await expect(
            storeSelectionMiddleware(
                { request, url: new URL(request.url), pattern: '/p/:productId', context: ctx, params: {} },
                next
            )
        ).rejects.toMatchObject({
            status: 502,
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('keeps reconciliation failures structured for the selection action', async () => {
        patch.mockRejectedValueOnce(new Error('native unavailable'));
        const { response } = await runSelectionAction('B', await remembered());
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ success: false, code: 'STORE_CONTEXT_UNAVAILABLE' });
        expect(response.headers.getSetCookie()).toEqual([]);
        expect(patch).toHaveBeenCalledTimes(1);
        expect(storeRead).not.toHaveBeenCalled();
    });

    it('requires confirmed change for clearing and for draining a nonempty basket', async () => {
        await run(async (requestContext) => {
            await selectStore(requestContext, { id: 'A' });
        });
        items = [{ productId: 'sku' }];
        await run(async (requestContext) => {
            expect(await selectStore(requestContext, null)).toMatchObject({
                success: false,
                code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
            });
            expect(requestContext.get(selectedStoreContext)?.id).toBe('A');
        });
        enabled = false;
        cleanup = true;
        const dependentRead = vi.fn();
        const { response } = await run(dependentRead);
        expect(response.status).toBe(409);
        expect(dependentRead).not.toHaveBeenCalled();
        expect(native.assignmentQualifiers?.store).toBe('store-a');
    });

    it('hands missing-lineage recovery to confirmed-change when a basket contains items', async () => {
        items = [{ productId: 'sku' }];
        const next = vi.fn();
        const { response } = await run(next, await remembered());
        expect(response.status).toBe(409);
        expect(next).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
        expect(native.assignmentQualifiers?.store).toBeUndefined();
    });

    it('repairs missing store keys when the committed native record still identifies the selection', async () => {
        await run(async (requestContext) => {
            await selectStore(requestContext, { id: 'A' });
        });
        delete native.assignmentQualifiers?.store;
        items = [{ productId: 'sku' }];
        const { ctx } = await run();
        expect(native.assignmentQualifiers?.store).toBe('store-a');
        expect(ctx.get(selectedStoreContext)?.id).toBe('A');
    });
    it('rejects a native conflict and invalid restored mappings before dependent reads', async () => {
        native.assignmentQualifiers = { store: 'store-b' };
        const next = vi.fn();
        const { response } = await run(next, await remembered());
        expect(response.status).toBe(409);
        expect(next).not.toHaveBeenCalled();
        native = {};
        storeRead.mockResolvedValueOnce({
            data: { data: [{ ...stores[0], inventoryId: 'invalid-current-inventory' }] },
        });
        const invalid = await run(next, await remembered('A', 'untrusted-inventory'));
        expect(invalid.response.status).toBe(400);
        expect(next).not.toHaveBeenCalled();
    });
    it('returns failure from the BFF action without staging a cookie on rejected native write', async () => {
        await run(async (requestContext) => {
            patch.mockRejectedValueOnce(new Error('503'));
            const form = new FormData();
            form.set('storeInfo', JSON.stringify({ id: 'A' }));
            const result = await action({
                context: requestContext,
                request: new Request('https://example.com/action/set-selected-store', { method: 'POST', body: form }),
            } as unknown as Parameters<typeof action>[0]);
            expect(result.init?.status).toBe(502);
            expect(result.data.success).toBe(false);
            expect(requestContext.get(selectedStoreContext)).toBeNull();
        });
    });
});

describe('legacy flag off selection', () => {
    beforeEach(() => {
        enabled = false;
    });
    it('validates restore, select/change/clear without native calls or basket-switch interference', async () => {
        items = [{ productId: 'pickup-sku' }];
        for (const id of ['B', 'A', null]) {
            const { ctx } = await run(
                async (requestContext) => {
                    expect(requestContext.get(selectedStoreContext)).toEqual(stores[0]);
                    expect((await selectStore(requestContext, id ? { id } : null)).success).toBe(true);
                },
                await remembered()
            );
            expect(ctx.get(selectedStoreContext)?.id ?? null).toBe(id);
        }
        expect(patch).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
        expect(basketRead).not.toHaveBeenCalled();
    });

    it('keeps explicit off-mode choices distinct from remembered returns', async () => {
        const first = await run(async (requestContext) => {
            await selectStore(requestContext, { id: 'A' });
        });
        expect(first.ctx.get(shoppingContext)?.selectionOrigin).toBe('explicit');
        const cookies = first.response.headers.getSetCookie().map((header) => header.split(';')[0]);
        const continued = await run(undefined, cookies.join('; '));
        expect(continued.ctx.get(shoppingContext)?.selectionOrigin).toBe('explicit');
        const rememberedCookies = cookies.filter((cookie) => !cookie.startsWith('storeChoiceSession_')).join('; ');
        const returned = await run(undefined, rememberedCookies);
        expect(returned.ctx.get(shoppingContext)?.selectionOrigin).toBe('remembered');
        expect(patch).not.toHaveBeenCalled();
    });
    it('discards an invalid restored store rather than trusting cookie fields', async () => {
        const { ctx, response } = await run(undefined, await remembered('unknown'));
        expect(ctx.get(selectedStoreContext)).toBeNull();
        expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });
    it('ignores malformed cookie shapes', async () => {
        const cookie = (
            await createSelectedStoreCookie(context()).serialize(
                encodeURIComponent(JSON.stringify({ id: { bad: true } }))
            )
        ).split(';')[0];
        const { ctx } = await run(undefined, cookie);
        expect(ctx.get(selectedStoreContext)).toBeNull();
        expect(storeRead).not.toHaveBeenCalled();
        expect(patch).not.toHaveBeenCalled();
    });
});

describe.each([true, false])('authentication reconciliation (native=%s)', (nativeEnabled) => {
    const registered = () =>
        vi.mocked(getAuth).mockReturnValue({
            usid: 'guest-usid',
            customerId: 'registered-customer',
            userType: 'registered',
            accessToken: 'registered-token',
        } as ReturnType<typeof getAuth>);
    beforeEach(() => {
        enabled = nativeEnabled;
    });

    it.each([
        { hasItems: true, tokenUsid: 'guest-usid', responseUsid: 'other-usid', allowed: true },
        { hasItems: true, tokenUsid: 'other-usid', responseUsid: 'guest-usid', allowed: false },
        { hasItems: false, tokenUsid: 'other-usid', responseUsid: 'other-usid', allowed: true },
    ])('gates basket session migration using JWT identity: %j', ({ hasItems, tokenUsid, responseUsid, allowed }) => {
        const token = buildMockTokenResponse({
            accessToken: { usid: tokenUsid, rcid: 'registered-customer' },
            usid: responseUsid,
        });
        const check = () => assertStoreSelectionLoginSession(context(), token, hasItems);
        if (allowed) expect(check).not.toThrow();
        else expect(check).toThrow('STORE_CHANGE_CONFIRMATION_REQUIRED');
    });

    async function login(ctx: RouterContextProvider) {
        const sourceHasItems = await prepareStoreSelectionForLogin(ctx);
        registered();
        try {
            await reconcileStoreAfterAuthentication(ctx, sourceHasItems);
            return new Response('ok');
        } catch (error) {
            if (!(error instanceof StoreSelectionError)) throw error;
            return Response.json({ code: error.code }, { status: error.status });
        }
    }

    it('allows registered credential renewal without reading baskets with the old credential', async () => {
        registered();
        const result = await run(async (ctx) => {
            basketRead.mockClear();
            basketRead.mockRejectedValue(new Error('credential invalidated by email/password change'));
            expect(await prepareStoreSelectionForLogin(ctx)).toBe(false);
            expect(basketRead).not.toHaveBeenCalled();
        });
        expect(result.response.status).toBe(200);
    });

    it('refreshes the guest source guard after a failed login when the shopper empties the basket', async () => {
        const seedCookie = await remembered();
        const first = await run(async (ctx) => {
            items = [{ productId: 'sku' }];
            expect(await prepareStoreSelectionForLogin(ctx)).toBe(true);
            // Credential exchange failed; the shopper is still a guest.
            return new Response('Invalid credentials', { status: 401 });
        }, seedCookie);
        items = [];
        const next = await run(login, mergeCookies(seedCookie, responseCookies(first.response)));
        expect(next.response.status).toBe(200);
        expect(next.ctx.get(selectedStoreContext)?.id).toBe('B');
    });

    it('retains the active store during same-account credential renewal with a new USID', async () => {
        registered();
        const first = await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        defaultRead.mockClear();
        const result = await run(async (ctx) => {
            const sourceHasItems = await prepareStoreSelectionForLogin(ctx);
            vi.mocked(getAuth).mockReturnValue({ ...getAuth(ctx), usid: 'renewed-usid', accessToken: 'renewed-token' });
            native = {};
            await reconcileStoreAfterAuthentication(ctx, sourceHasItems);
        }, responseCookies(first.response));
        expect(result.response.status).toBe(200);
        expect(result.ctx.get(selectedStoreContext)?.id).toBe('A');
        expect(defaultRead).not.toHaveBeenCalled();
        if (nativeEnabled) expect(native.assignmentQualifiers?.store).toBe('store-a');
    });

    it.each([
        'resolve',
        'guard write',
    ])('does not publish a changed USID with a nonempty guest source before destination %s can fail', async (failure) => {
        const guest = getAuth(context());
        registered();
        vi.mocked(getAuth).mockReturnValue({ ...getAuth(context()), usid: 'destination-usid' });
        await run(async (ctx) => {
            await selectStore(ctx, { id: 'B' });
        });
        const destination = structuredClone(native);
        native = {};
        vi.mocked(getAuth).mockReturnValue(guest);
        const restored = await run(undefined, await remembered());
        items = [{ productId: 'sku' }];
        const update = patch.getMockImplementation();
        if (!update) throw new Error('Expected native update implementation');
        const destinationFailure = vi.fn();
        vi.mocked(updateAuth).mockImplementation(() => {
            registered();
            vi.mocked(getAuth).mockReturnValue({ ...getAuth(context()), usid: 'destination-usid' });
            native = destination;
            patch.mockImplementation((args: { body: NativeShopperContext }) => {
                const matches =
                    failure === 'resolve'
                        ? Object.keys(args.body).length === 0
                        : args.body.customQualifiers?.[STORE_SELECTION_QUALIFIER] != null;
                if (matches) {
                    destinationFailure();
                    return Promise.reject(new Error('destination unavailable'));
                }
                return update(args);
            });
        });
        const transfer = vi.fn();
        const first = await run(async (ctx) => {
            try {
                await completeRegisteredLogin(ctx, () =>
                    Promise.resolve(
                        buildMockTokenResponse({
                            accessToken: { usid: 'destination-usid', rcid: 'registered-customer' },
                        })
                    )
                );
                transfer();
                return new Response('unexpected completion');
            } catch (error) {
                if (!(error instanceof Error) || !('status' in error)) throw error;
                return new Response('recovery required', { status: Number(error.status) });
            }
        }, responseCookies(restored.response));
        expect(first.response.status).toBe(409);
        expect(updateAuth).not.toHaveBeenCalled();
        expect(destinationFailure).not.toHaveBeenCalled();
        expect(transfer).not.toHaveBeenCalled();
        expect(getAuth(first.ctx)).toEqual(guest);
        const handler = vi.fn();
        const retry = await run(handler); // Lose every preference cookie.
        expect(retry.response.status).toBe(200);
        expect(getAuth(retry.ctx)).toEqual(guest);
        expect(retry.ctx.get(selectedStoreContext)?.id ?? null).toBe(nativeEnabled ? 'A' : null);
        if (nativeEnabled) {
            expect(native.assignmentQualifiers?.store).toBe('store-a');
            expect(JSON.parse(native.customQualifiers?.[STORE_SELECTION_QUALIFIER] ?? '{}').pendingSourceBasket).toBe(
                true
            );
        }
    });

    it('reads the new account default when registered authentication changes the customer', async () => {
        registered();
        const first = await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        const result = await run(async (ctx) => {
            const sourceHasItems = await prepareStoreSelectionForLogin(ctx);
            vi.mocked(getAuth).mockReturnValue({
                ...getAuth(ctx),
                customerId: 'another-customer',
                accessToken: 'another-token',
            });
            await reconcileStoreAfterAuthentication(ctx, sourceHasItems);
        }, responseCookies(first.response));
        expect(result.ctx.get(selectedStoreContext)?.id).toBe('B');
        expect(defaultRead).toHaveBeenCalledOnce();
        expect(defaultRead).toHaveBeenCalledWith(
            expect.objectContaining({
                params: { path: { customerId: 'another-customer' }, query: { expand: ['none'] } },
            })
        );
    });

    it('keeps an explicit guest choice, refreshes identity/revision, and never reads or writes a default', async () => {
        let before: unknown;
        const { ctx, response } = await run(async (requestContext) => {
            await selectStore(requestContext, { id: 'A' });
            before = requestContext.get(shoppingContext);
            items = [{ productId: 'sku' }];
            return login(requestContext);
        });
        expect(response.status).toBe(200);
        expect(ctx.get(selectedStoreContext)?.id).toBe('A');
        expect(ctx.get(shoppingContext)?.identityEpoch).not.toBe((before as { identityEpoch: string }).identityEpoch);
        expect(ctx.get(shoppingContext)?.contextRevision).not.toBe(
            (before as { contextRevision: string }).contextRevision
        );
        expect(defaultRead).not.toHaveBeenCalled();
        if (!nativeEnabled) expect(patch).not.toHaveBeenCalled();
    });

    it('uses the saved default instead of a restored cookie', async () => {
        const { ctx, response } = await run(login, await remembered());
        expect(response.status).toBe(200);
        expect(ctx.get(selectedStoreContext)?.id).toBe('B');
        expect(ctx.get(shoppingContext)?.selectionOrigin).toBe('remembered');
        expect(defaultRead).toHaveBeenCalledWith({
            params: { path: { customerId: 'registered-customer' }, query: { expand: ['none'] } },
        });
    });

    it('uses the account default on a second device without cookies', async () => {
        const { ctx } = await run(login);
        expect(ctx.get(selectedStoreContext)?.id).toBe('B');
    });

    it('uses the account default after the preference session expires', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-12T00:00:00Z'));
        const selected = await runSelectionAction('A');
        vi.setSystemTime(new Date('2026-11-13T00:00:00Z'));

        const { ctx, response } = await run(login, responseCookies(selected.response));

        expect(response.status).toBe(200);
        expect(ctx.get(selectedStoreContext)?.id).toBe('B');
        expect(ctx.get(shoppingContext)?.selectionOrigin).toBe('remembered');
        expect(defaultRead).toHaveBeenCalledOnce();
    });

    it.each([null, 'deleted-store', '  '])('follows the unselected entry policy for default %s', async (id) => {
        defaultRead.mockResolvedValue({ data: { preferredStoreId: id } });
        const { ctx, response } = await run(login, await remembered());
        expect(response.status).toBe(200);
        expect(ctx.get(selectedStoreContext)).toBeNull();
    });

    it('surfaces a failed read and retries under the new identity before the next commerce handler', async () => {
        defaultRead.mockRejectedValueOnce(new Error('profile unavailable'));
        const first = await run(login, await remembered());
        expect(first.response.status).toBe(503);
        expect(await first.response.json()).toEqual({ code: 'ACCOUNT_DEFAULT_UNAVAILABLE' });
        expect(first.ctx.get(shoppingContext)).toBeNull();
        const next = await run(undefined, responseCookies(first.response));
        expect(next.response.status).toBe(200);
        expect(next.ctx.get(selectedStoreContext)?.id).toBe('B');
    });

    it('blocks a different default before changing a source basket and keeps the boundary on retry', async () => {
        const first = await run(
            async (ctx) => {
                items = [{ productId: 'sku' }];
                return login(ctx);
            },
            await remembered()
        );
        expect(first.response.status).toBe(409);
        expect(await first.response.json()).toEqual({ code: 'STORE_CHANGE_CONFIRMATION_REQUIRED' });
        expect(first.ctx.get(selectedStoreContext)?.id).toBe('A');
        if (nativeEnabled) expect(native.assignmentQualifiers?.store).toBe('store-a');
        const handler = vi.fn();
        const next = await run(handler, responseCookies(first.response));
        expect(next.response.status).toBe(409);
        expect(handler).not.toHaveBeenCalled();
    });

    it('retains the source-basket barrier across a profile failure when the registered basket is empty', async () => {
        defaultRead.mockRejectedValueOnce(new TypeError('fetch failed'));
        const first = await run(
            async (ctx) => {
                basketRead.mockResolvedValueOnce({ data: { baskets: [{ productItems: [{ productId: 'sku' }] }] } });
                basketRead.mockResolvedValue({ data: { baskets: [] } });
                return login(ctx);
            },
            await remembered()
        );
        expect(first.response.status).toBe(503);
        const next = await run(undefined, responseCookies(first.response));
        expect(next.response.status).toBe(409);
        expect(await next.response.json()).toMatchObject({ code: 'STORE_CHANGE_CONFIRMATION_REQUIRED' });
    });

    it.skipIf(!nativeEnabled).each(['resolve', 'guard write'])(
        'retains source-basket consent when the post-auth native %s fails',
        async (failure) => {
            const restored = await run(undefined, await remembered());
            const first = await run(async (ctx) => {
                basketRead.mockResolvedValueOnce({ data: { baskets: [{ productItems: [{ productId: 'sku' }] }] } });
                basketRead.mockResolvedValue({ data: { baskets: [] } });
                const sourceHasItems = await prepareStoreSelectionForLogin(ctx);
                registered();
                const update = patch.getMockImplementation();
                if (!update) throw new Error('Expected native update implementation');
                let failed = false;
                patch.mockImplementation((args: { body: NativeShopperContext }) => {
                    const matches =
                        failure === 'resolve'
                            ? Object.keys(args.body).length === 0
                            : args.body.customQualifiers?.[STORE_SELECTION_QUALIFIER] != null;
                    if (matches && !failed) {
                        failed = true;
                        return Promise.reject(new Error('native unavailable after authentication'));
                    }
                    return update(args);
                });
                try {
                    await reconcileStoreAfterAuthentication(ctx, sourceHasItems);
                    return new Response('unexpected completion');
                } catch (error) {
                    return Response.json({ error: String(error) }, { status: 502 });
                }
            }, responseCookies(restored.response));
            expect(first.response.status).toBeGreaterThanOrEqual(400);
            const handler = vi.fn();
            const next = await run(handler, responseCookies(first.response));
            expect(next.response.status).toBe(409);
            expect(handler).not.toHaveBeenCalled();
            expect(native.assignmentQualifiers?.store).toBe('store-a');
        }
    );

    it.skipIf(!nativeEnabled)('drains native qualifiers before reconciling an identity mismatch', async () => {
        const first = await run(undefined, await remembered());
        registered();
        enabled = false;
        cleanup = true;
        const handler = vi.fn();
        const result = await run(handler, responseCookies(first.response));
        expect(result.response.status).toBe(200);
        expect(handler).toHaveBeenCalledOnce();
        expect(native.assignmentQualifiers).toEqual({ campaign: 'summer' });
        expect(native.customQualifiers).toEqual({ device: 'mobile' });
        expect(result.ctx.get(selectedStoreContext)?.id).toBe('B');
    });

    it.skipIf(!nativeEnabled)(
        'does not drain mismatched identity qualifiers without nonempty-basket consent',
        async () => {
            const first = await run(undefined, await remembered());
            registered();
            enabled = false;
            cleanup = true;
            items = [{ productId: 'sku' }];
            const handler = vi.fn();
            const result = await run(handler, responseCookies(first.response));
            expect(result.response.status).toBe(409);
            expect(handler).not.toHaveBeenCalled();
            expect(native.assignmentQualifiers?.store).toBe('store-a');
        }
    );

    it.skipIf(!nativeEnabled)(
        'retains a matching replica-only source-basket guard from an older deployment',
        async () => {
            const first = await run(undefined, await remembered());
            const rawRecord = native.customQualifiers?.[STORE_SELECTION_QUALIFIER];
            if (!rawRecord) throw new Error('Expected committed native selection');
            const record = JSON.parse(rawRecord);
            registered();
            const cookie = responseCookies(first.response).replace(
                /storeChoiceRecord_GroceryNext=[^;]+/,
                `storeChoiceRecord_GroceryNext=${encodeURIComponent(JSON.stringify({ ...record, pendingSourceBasket: true }))}`
            );
            const handler = vi.fn();
            const result = await run(handler, cookie);
            expect(result.response.status).toBe(409);
            expect(handler).not.toHaveBeenCalled();
            expect(native.assignmentQualifiers?.store).toBe('store-a');
        }
    );

    it.skipIf(!nativeEnabled)(
        'retains source consent when login changes USID to an existing native context',
        async () => {
            await run(async (ctx) => {
                await selectStore(ctx, { id: 'B' });
            });
            const previousNative = structuredClone(native);
            native = {};
            const restored = await run(undefined, await remembered());
            const first = await run(async (ctx) => {
                basketRead.mockResolvedValueOnce({ data: { baskets: [{ productItems: [{ productId: 'sku' }] }] } });
                basketRead.mockResolvedValue({ data: { baskets: [] } });
                const sourceHasItems = await prepareStoreSelectionForLogin(ctx);
                registered();
                vi.mocked(getAuth).mockReturnValue({ ...getAuth(ctx), usid: 'different-registered-usid' });
                native = previousNative;
                patch.mockRejectedValueOnce(new Error('post-auth resolve unavailable'));
                try {
                    await reconcileStoreAfterAuthentication(ctx, sourceHasItems);
                    return new Response('unexpected completion');
                } catch {
                    return new Response('retry later', { status: 502 });
                }
            }, responseCookies(restored.response));
            const handler = vi.fn();
            const next = await run(handler, responseCookies(first.response));
            expect(next.response.status).toBe(409);
            expect(handler).not.toHaveBeenCalled();
            expect(native.assignmentQualifiers?.store).toBe('store-b');
        }
    );

    it.skipIf(!nativeEnabled)(
        'preserves an existing new-USID selection while guarding its separate guest source without cookies',
        async () => {
            await run(async (ctx) => {
                await selectStore(ctx, { id: 'B' });
            });
            const previousNative = structuredClone(native);
            native = {};
            const restored = await run(undefined, await remembered());
            const first = await run(async (ctx) => {
                basketRead.mockResolvedValueOnce({ data: { baskets: [{ productItems: [{ productId: 'sku' }] }] } });
                basketRead.mockResolvedValue({ data: { baskets: [] } });
                const sourceHasItems = await prepareStoreSelectionForLogin(ctx);
                registered();
                vi.mocked(getAuth).mockReturnValue({ ...getAuth(ctx), usid: 'different-registered-usid' });
                native = previousNative;
                try {
                    await reconcileStoreAfterAuthentication(ctx, sourceHasItems);
                    return new Response('unexpected completion');
                } catch (error) {
                    if (!(error instanceof StoreSelectionError)) throw error;
                    return Response.json({ code: error.code }, { status: error.status });
                }
            }, responseCookies(restored.response));
            expect(first.response.status).toBe(409);
            expect(native.assignmentQualifiers?.store).toBe('store-b');
            expect(JSON.parse(native.customQualifiers?.[STORE_SELECTION_QUALIFIER] ?? '{}')).toMatchObject({
                storeId: 'B',
                pendingSourceStoreId: 'A',
                pendingSourceBasket: true,
            });
            const handler = vi.fn();
            const next = await run(handler); // Replica loss must not discard the source guard.
            expect(next.response.status).toBe(409);
            expect(handler).not.toHaveBeenCalled();
            expect(native.assignmentQualifiers?.store).toBe('store-b');
            enabled = false;
            cleanup = true;
            const logout = await run(
                (ctx) => {
                    prepareStoreSelectionForLogout(ctx);
                    return new Response('signed out');
                },
                '',
                new Request('https://example.com/GroceryNext/en-US/logout', { method: 'POST' })
            );
            const recordCookie = responseCookies(logout.response).match(/storeChoiceRecord_GroceryNext=([^;]+)/)?.[1];
            if (!recordCookie) throw new Error('Expected preserved guest intent');
            expect(JSON.parse(decodeURIComponent(recordCookie))).toMatchObject({ storeId: 'A' });
            expect(JSON.parse(decodeURIComponent(recordCookie)).pendingSourceBasket).toBeUndefined();
        }
    );

    it('can sign out of pending consent and restore a fresh guest after existing basket destruction', async () => {
        const seedCookie = await remembered();
        const first = await run(async (ctx) => {
            items = [{ productId: 'sku' }];
            return login(ctx);
        }, seedCookie);
        expect(first.response.status).toBe(409);
        const pendingCookies = mergeCookies(seedCookie, responseCookies(first.response));
        const logout = await run(
            (ctx) => {
                prepareStoreSelectionForLogout(ctx);
                return new Response('signed out');
            },
            pendingCookies,
            new Request('https://example.com/GroceryNext/en-US/logout', {
                method: 'POST',
                headers: { Cookie: pendingCookies },
            })
        );
        expect(logout.response.status).toBe(200);
        // The real logout action destroys auth and the basket before responding.
        items = [];
        native = {};
        vi.mocked(getAuth).mockReturnValue({
            userType: 'guest',
            usid: 'fresh-guest-usid',
            customerId: 'fresh-guest-customer',
            accessToken: 'fresh-token',
        } as ReturnType<typeof getAuth>);
        const guest = await run(undefined, mergeCookies(pendingCookies, responseCookies(logout.response)));
        expect(guest.response.status).toBe(200);
        expect(guest.ctx.get(selectedStoreContext)?.id).toBe('A');
        expect(guest.ctx.get(shoppingContext)?.selectionOrigin).toBe('remembered');
    });

    it('checks the registered basket even when the guest has none', async () => {
        basketRead.mockImplementation(() =>
            Promise.resolve({
                data: {
                    baskets: [
                        {
                            productItems:
                                vi.mocked(getAuth).mock.results.at(-1)?.value.userType === 'registered'
                                    ? [{ productId: 'sku' }]
                                    : [],
                        },
                    ],
                },
            })
        );
        const { response, ctx } = await run(login, await remembered());
        expect(response.status).toBe(409);
        expect(ctx.get(selectedStoreContext)?.id).toBe('A');
    });

    it('preserves explicit provenance through token refresh without rereading the account default', async () => {
        const selected = await run((ctx) => selectStore(ctx, { id: 'A' }).then(() => undefined));
        vi.mocked(getAuth).mockReturnValue({
            usid: 'guest-usid',
            customerId: 'guest-customer',
            userType: 'guest',
            accessToken: 'refreshed-guest-token',
        } as ReturnType<typeof getAuth>);
        const refreshed = await run(login, responseCookies(selected.response));
        expect(refreshed.ctx.get(selectedStoreContext)?.id).toBe('A');
        expect(defaultRead).not.toHaveBeenCalled();
    });

    it('does not make a remembered cookie explicit through refresh', async () => {
        const restored = await run(undefined, await remembered());
        const loggedIn = await run(login, responseCookies(restored.response));
        expect(loggedIn.ctx.get(selectedStoreContext)?.id).toBe('B');
        expect(defaultRead).toHaveBeenCalledTimes(1);
    });

    it('restores store intent on a fresh guest without registered native eligibility', async () => {
        const loggedIn = await run(login, await remembered());
        const loggedOut = await run((ctx) => {
            prepareStoreSelectionForLogout(ctx);
            return new Response('logout');
        }, responseCookies(loggedIn.response));
        // Existing logout destroys auth/basket; the following request obtains a fresh USID.
        vi.mocked(getAuth).mockReturnValue({
            usid: 'new-guest-usid',
            customerId: 'new-guest',
            userType: 'guest',
            accessToken: 'new-guest-token',
        } as ReturnType<typeof getAuth>);
        native = {};
        defaultRead.mockClear();
        const guest = await run(
            undefined,
            [responseCookies(loggedIn.response), responseCookies(loggedOut.response)].join('; ')
        );
        expect(guest.ctx.get(selectedStoreContext)?.id).toBe('B');
        expect(guest.ctx.get(shoppingContext)?.selectionOrigin).toBe('remembered');
        expect(defaultRead).not.toHaveBeenCalled();
        expect(native.customerGroupIds).toBeUndefined();
        expect(native.sourceCode).toBeUndefined();
    });
});

describe('logout store intent', () => {
    it('uses the committed native store when the browser has a stale selection cookie', async () => {
        const first = await run(async (ctx) => {
            await selectStore(ctx, { id: 'A' });
        });
        const oldCookies = responseCookies(first.response);
        await run(async (ctx) => {
            await selectStore(ctx, { id: 'B' });
        }, oldCookies);
        const request = new Request('https://example.com/MarketStreet/en-US/logout', {
            method: 'POST',
            headers: { Cookie: oldCookies },
        });
        const result = await run(
            (ctx) => {
                prepareStoreSelectionForLogout(ctx);
                return new Response('logout');
            },
            oldCookies,
            request
        );
        expect(result.ctx.get(selectedStoreContext)?.id).toBe('B');
    });

    it('allows logout when native reconciliation is unavailable', async () => {
        const cookie = await remembered();
        patch.mockRejectedValueOnce(new Error('native unavailable'));
        const request = new Request('https://example.com/MarketStreet/en-US/logout', {
            method: 'POST',
            headers: { Cookie: cookie },
        });
        const handler = vi.fn(() => new Response('logout'));
        const result = await run(handler, cookie, request);
        expect(result.response.status).toBe(200);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(result.ctx.get(shoppingContext)).toBeNull();
    });
});
