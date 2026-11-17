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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { RouterContextProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getAuth } from '@/middlewares/auth.server';
import {
    selectedStoreContext,
    selectedStoreStorageContext,
} from '@/extensions/store-locator/middlewares/selected-store.server';
import { resolveSelectedStore } from './resolve-selected-store.server';
import { createStoreLocatorStore } from '@/extensions/store-locator/stores/store-locator-store';

const api = vi.hoisted(() => ({ getCustomer: vi.fn(), updateCustomer: vi.fn(), getStores: vi.fn(), error: vi.fn() }));
vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({
    getTranslation: vi.fn(() => ({ i18next: { language: 'en-US' } })),
}));
vi.mock('@/middlewares/auth.server', () => ({ getAuth: vi.fn() }));
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({ shopperCustomers: api, shopperStores: api }),
}));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => ({ error: api.error }) }));

describe('identity-separated selected store resolution', () => {
    let context: RouterContextProvider;
    let requestNumber = 0;
    const store = {
        id: 'store-1',
        name: 'Canonical',
        inventoryId: 'inventory-1',
        city: 'San Francisco',
        countryCode: 'US',
        postalCode: '94105',
    };
    const registered = (extra = {}) =>
        vi.mocked(getAuth).mockReturnValue({
            userType: 'registered',
            customerId: 'A',
            accessToken: `token-${++requestNumber}`,
            ...extra,
        });
    function request(config = mockConfig, site = context.get(siteContext), activeId = 'store-1') {
        const next = new RouterContextProvider();
        next.set(appConfigContext, config);
        next.set(siteContext, site);
        next.set(selectedStoreContext, { id: activeId });
        next.set(selectedStoreStorageContext, new Map());
        return resolveSelectedStore(next);
    }
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getTranslation).mockReturnValue({ i18next: { language: 'en-US' } } as never);
        context = new RouterContextProvider();
        context.set(appConfigContext, mockConfig);
        context.set(siteContext, { site: { id: 'site-1' } } as never);
        context.set(selectedStoreContext, { id: 'store-1', name: 'Untrusted', inventoryId: 'wrong' });
        context.set(selectedStoreStorageContext, new Map());
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest', usid: `guest-${++requestNumber}` });
        api.getCustomer.mockResolvedValue({ data: {} });
        api.getStores.mockResolvedValue({ data: { data: [{ id: 'other' }, store] } });
        api.updateCustomer.mockResolvedValue({});
    });

    it('validates guest ID exactly and projects canonical fields without writes', async () => {
        const result = await resolveSelectedStore(context);
        expect(result.selectedStoreInfo).toEqual({
            id: 'store-1',
            name: 'Canonical',
            inventoryId: 'inventory-1',
            countryCode: 'US',
            postalCode: '94105',
        });
        expect(result.store).toEqual(store);
        expect(api.getCustomer).not.toHaveBeenCalled();
        expect(api.updateCustomer).not.toHaveBeenCalled();
        expect(context.get(selectedStoreStorageContext)?.size).toBe(0);
    });

    it('opens a resolved registered store without browser search memory or cookie metadata', async () => {
        registered();
        context.set(selectedStoreContext, { id: 'store-1', countryCode: 'CA', postalCode: 'untrusted' });
        const result = await resolveSelectedStore(context);
        const clientStore = createStoreLocatorStore({ selectedStoreInfo: result.selectedStoreInfo });
        clientStore.getState().openSelectedStore();
        expect(clientStore.getState()).toMatchObject({
            isOpen: true,
            shouldSearch: true,
            searchParams: { countryCode: 'US', postalCode: '94105' },
            searchResult: null,
        });
        expect(result.selectedStoreInfo).not.toHaveProperty('city');
        expect(result.selectedStoreInfo).not.toHaveProperty('expiresAt');
    });

    it.each([
        ['guest', { userType: 'guest', usid: 'g' }],
        ['registered', { userType: 'registered', customerId: 'A', accessToken: 'reg-each' }],
    ])('resolves the reconciled active store for a %s without any profile read or write', async (_kind, auth) => {
        vi.mocked(getAuth).mockReturnValue(auth as never);
        await resolveSelectedStore(context);
        expect(api.getStores).toHaveBeenCalledTimes(1);
        expect(api.getCustomer).not.toHaveBeenCalled();
        expect(api.updateCustomer).not.toHaveBeenCalled();
    });

    it.each([
        undefined,
        null,
        { id: '' },
        { id: '  ' },
        { id: 'x'.repeat(257) },
    ])('treats an absent or invalid active store %j as empty without lookups', async (active) => {
        registered();
        context.set(selectedStoreContext, active as never);
        expect(await resolveSelectedStore(context)).toMatchObject({
            selectedStoreInfo: null,
            store: null,
            preferredStoreId: null,
            status: 'empty',
            error: null,
        });
        expect(api.getStores).not.toHaveBeenCalled();
        expect(api.getCustomer).not.toHaveBeenCalled();
    });

    it.each([
        'missing',
        'unsuitable',
    ])('reports a %s active store as stale without repairing persistence', async (kind) => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'A', accessToken: `stale-${kind}` });
        api.getStores.mockResolvedValue({ data: { data: kind === 'missing' ? [] : [{ id: 'store-1' }] } });
        expect(await resolveSelectedStore(context)).toMatchObject({
            selectedStoreInfo: null,
            preferredStoreId: null,
            status: 'stale',
            error: null,
        });
        expect(api.updateCustomer).not.toHaveBeenCalled();
        expect(context.get(selectedStoreStorageContext)?.size).toBe(0);
    });

    it('reuses concurrent root/account/PDP reads and isolates identities, sites, tokens and active stores', async () => {
        const results = await Promise.all([
            resolveSelectedStore(context),
            resolveSelectedStore(context),
            resolveSelectedStore(context),
        ]);
        expect(results[0]).toBe(results[1]);
        expect(api.getStores).toHaveBeenCalledTimes(1);
        registered({ accessToken: 'a' });
        await resolveSelectedStore(context);
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'B', accessToken: 'b' });
        await resolveSelectedStore(context);
        context.set(siteContext, { site: { id: 'site-2' } } as never);
        await resolveSelectedStore(context);
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'B', accessToken: 'new' });
        await resolveSelectedStore(context);
        expect(api.getStores).toHaveBeenCalledTimes(5);
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest' });
        context.set(selectedStoreContext, null as never);
        expect((await resolveSelectedStore(context)).selectedStoreInfo).toBeNull();
        context.set(selectedStoreContext, { id: 'store-1' });
        expect((await resolveSelectedStore(context)).store).toEqual(store);
    });

    it.each([401, 403, 500])('contains store failure %i without writes or fallback', async (status) => {
        registered();
        api.getStores.mockRejectedValue(new Response('Failure', { status }));
        expect(await resolveSelectedStore(context)).toMatchObject({
            selectedStoreInfo: null,
            status: 'error',
            error: 'store',
            authError: status === 401,
        });
        expect(api.updateCustomer).not.toHaveBeenCalled();
    });

    it.each([
        new Response(null, { status: 401 }),
        new Error('normalized', { cause: new Response(null, { status: 401 }) }),
        new Error('outer', { cause: new Error('inner', { cause: new Response(null, { status: 401 }) }) }),
    ])('exposes a late wrapped 401 for document recovery without clearing its auth marker (%#)', async (failure) => {
        const { authStorageContext, AUTH_TOKEN_INVALID_ERROR } = await import('@/middlewares/auth.utils');
        const storage = new Map();
        context.set(authStorageContext, storage);
        registered();
        api.getStores.mockImplementationOnce(() => {
            storage.set('error', AUTH_TOKEN_INVALID_ERROR);
            // oxlint-disable-next-line typescript/only-throw-error -- React Router and SCAPI expose HTTP Response failures.
            throw failure;
        });
        expect(await resolveSelectedStore(context)).toMatchObject({ error: 'store', authError: true });
        expect(storage.get('error')).toBe(AUTH_TOKEN_INVALID_ERROR);
    });

    it('reports a store outage, while a missing exact ID is empty', async () => {
        api.getStores.mockResolvedValue({ data: { data: [{ id: 'other' }] } });
        expect((await resolveSelectedStore(context)).error).toBeNull();
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest', usid: 'outage' });
        context.set(selectedStoreContext, { id: 'store-outage' });
        api.getStores.mockRejectedValue(new Error('offline'));
        expect((await resolveSelectedStore(context)).error).toBe('store');
    });

    it('throws missing middleware/site setup defects', async () => {
        const missing = new RouterContextProvider();
        await expect(resolveSelectedStore(missing)).rejects.toThrow();
    });

    it('logs only diagnostic metadata, never error messages or bodies', async () => {
        registered();
        const sensitiveError = Object.assign(new Error('Bearer secret-token; cookie=private; profile=email'), {
            body: { email: 'private@example.com' },
            rawBody: 'private body',
            request: 'private request',
        });
        api.getStores.mockRejectedValue(sensitiveError);
        await resolveSelectedStore(context);
        expect(api.error.mock.calls).toEqual([
            ['SelectedStore: store resolution failed', { category: 'store', status: undefined, name: 'Error' }],
        ]);
        expect(JSON.stringify(api.error.mock.calls)).not.toContain('private');
        expect(JSON.stringify(api.error.mock.calls)).not.toContain('secret-token');
    });

    it('reuses metadata across requests, follows a changed active store immediately and expires without renewal', async () => {
        vi.useFakeTimers();
        try {
            registered({ accessToken: 'cache-test' });
            await request();
            vi.advanceTimersByTime(30_000);
            await request();
            expect(api.getStores).toHaveBeenCalledTimes(1);
            api.getStores.mockResolvedValueOnce({ data: { data: [{ ...store, id: 'store-2' }] } });
            expect((await request(mockConfig, undefined, 'store-2')).store?.id).toBe('store-2');
            expect(api.getStores).toHaveBeenCalledTimes(2);
            vi.advanceTimersByTime(30_000);
            await request();
            expect(api.getStores).toHaveBeenCalledTimes(3);
        } finally {
            vi.useRealTimers();
        }
    });

    it.each([
        'token',
        'session',
        'site',
        'locale',
        'backend',
        'organization',
        'client',
    ])('isolates metadata by %s', async (scope) => {
        const auth = { userType: 'guest' as const, accessToken: `scope-${scope}`, usid: 'session', dwsid: 'dwsid' };
        vi.mocked(getAuth).mockReturnValue(auth);
        await resolveSelectedStore(context);
        const config = structuredClone(mockConfig);
        const site = { site: { id: 'site-1' } };
        if (scope === 'token') auth.accessToken += '-new';
        if (scope === 'session') auth.dwsid += '-new';
        if (scope === 'locale') vi.mocked(getTranslation).mockReturnValue({ i18next: { language: 'fr-FR' } } as never);
        if (scope === 'site') site.site.id = 'site-2';
        if (scope === 'backend') config.commerce.api.shortCode += '-new';
        if (scope === 'organization') config.commerce.api.organizationId += '-new';
        if (scope === 'client') config.commerce.api.clientId += '-new';
        await request(config, site as never);
        expect(api.getStores).toHaveBeenCalledTimes(2);
    });

    it.each(['disabled', 'missing', 'inventory', 'error'])('does not reuse %s metadata', async (scenario) => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest', accessToken: `uncached-${scenario}` });
        const config = structuredClone(mockConfig);
        if (scenario === 'disabled') config.serverExtension = { storeLocator: { storeMetadataCacheTtlSeconds: 0 } };
        if (scenario === 'missing') api.getStores.mockResolvedValue({ data: { data: [] } });
        if (scenario === 'inventory') api.getStores.mockResolvedValue({ data: { data: [{ id: 'store-1' }] } });
        if (scenario === 'error') api.getStores.mockRejectedValue(new Error('offline'));
        for (let i = 0; i < 2; i++) {
            await request(config);
        }
        expect(api.getStores).toHaveBeenCalledTimes(2);
    });

    it('evicts the oldest metadata at the 256-entry bound', async () => {
        for (let i = 0; i < 257; i++) {
            vi.mocked(getAuth).mockReturnValue({ userType: 'guest', accessToken: `bound-${i}` });
            await resolveSelectedStore(context);
        }
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest', accessToken: 'bound-0' });
        await resolveSelectedStore(context);
        expect(api.getStores).toHaveBeenCalledTimes(258);
    });
});
