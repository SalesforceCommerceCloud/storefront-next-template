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
import { createContext, RouterContextProvider } from 'react-router';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { mockI18nContext } from '@salesforce/storefront-next-runtime/i18n';
import { createInstance } from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/scapi';
import { authContext, authStorageContext } from '@/middlewares/auth.utils';
import type { SessionData } from '@/lib/api/types';
import { loggerContext } from '@/lib/logger.server';
import { createMaintenance, maintenanceContext } from '@/lib/maintenance';
import type { Logger } from '@/lib/logger';
import { getPreferredStoreId, updatePreferredStoreId } from '@/extensions/store-locator/lib/api/preferred-store.server';
import { resolveSelectedStore } from '@/extensions/store-locator/lib/resolve-selected-store.server';
import { selectedStoreContext } from '@/extensions/store-locator/middlewares/selected-store.server';

const session: SessionData = {
    userType: 'registered',
    customerId: 'session-customer',
    accessToken: 'access-token',
};

// Mirror getAuth's synchronous cache ref while the real client awaits authContext.ref.
const authSessionContext = createContext<{ ref: SessionData }>();
vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn((context: Readonly<RouterContextProvider>) => context.get(authSessionContext).ref),
}));
vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>()),
    getConfig: vi.fn(() => ({
        commerce: {
            api: {
                shortCode: 'short-code',
                clientId: 'client-id',
                organizationId: 'organization-id',
                callback: '/callback',
            },
        },
    })),
}));

function createRequestContext(authSession: SessionData, siteId = 'site-id'): RouterContextProvider {
    const context = new RouterContextProvider();
    const i18next = createInstance();
    i18next.language = 'en-US';
    mockI18nContext(context, { locale: 'en-US', instance: i18next });
    context.set(siteContext, { site: { id: siteId }, locale: { id: 'en-US' } } as never);
    context.set(authSessionContext, { ref: authSession });
    context.set(authContext, { ref: Promise.resolve(authSession) });
    context.set(authStorageContext, new Map());
    context.set(maintenanceContext, createMaintenance());
    context.set(loggerContext, {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    } as unknown as Logger);
    return context;
}

describe('preferred store real API client requests', () => {
    let context: RouterContextProvider;
    let requests: Request[];
    let response: Response;

    beforeEach(() => {
        requests = [];
        context = createRequestContext(session);
        response = Response.json({ preferredStoreId: 'store-1', c_preferredStoreId: 'legacy-store' });
        vi.stubGlobal('window', undefined);
        vi.stubEnv('SCAPI_PROXY_HOST', '');
        vi.stubGlobal(
            'fetch',
            vi.fn((input: URL | RequestInfo, init?: RequestInit) => {
                requests.push(input instanceof Request ? input : new Request(input, init));
                return Promise.resolve(response.clone());
            })
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('sends a session-scoped authenticated GET with no profile expansions', async () => {
        await expect(getPreferredStoreId(context)).resolves.toBe('store-1');
        expect(requests).toHaveLength(1);
        const request = requests[0];
        const url = new URL(request.url);
        expect(request.method).toBe('GET');
        expect(url.origin).toBe('https://short-code.api.commercecloud.salesforce.com');
        expect(url.pathname).toBe(
            '/customer/shopper-customers/v1/organizations/organization-id/customers/session-customer'
        );
        expect(Object.fromEntries(url.searchParams)).toEqual({ siteId: 'site-id', expand: 'none' });
        expect(request.headers.get('Authorization')).toBe('Bearer access-token');
        expect(await request.text()).toBe('');
    });

    it('reuses one actual authenticated store request for parallel loader consumers without reading the profile', async () => {
        context.set(selectedStoreContext, { id: 'store-1' });
        vi.stubGlobal(
            'fetch',
            vi.fn((input: URL | RequestInfo, init?: RequestInit) => {
                const request = input instanceof Request ? input : new Request(input, init);
                requests.push(request);
                return Promise.resolve(
                    Response.json(
                        request.url.includes('/customers/')
                            ? { preferredStoreId: 'store-1' }
                            : {
                                  data: [
                                      { id: 'other' },
                                      { id: 'store-1', name: 'Canonical', inventoryId: 'inventory-1' },
                                  ],
                              }
                    )
                );
            })
        );
        const results = await Promise.all([
            resolveSelectedStore(context),
            resolveSelectedStore(context),
            resolveSelectedStore(context),
        ]);
        expect(results.every((result) => result === results[0])).toBe(true);
        expect(results[0].selectedStoreInfo).toEqual({ id: 'store-1', name: 'Canonical', inventoryId: 'inventory-1' });
        expect(requests).toHaveLength(1);
        expect(requests[0].url).not.toContain('/customers/');
        expect(
            requests.every(
                (request) => request.method === 'GET' && request.headers.get('Authorization') === 'Bearer access-token'
            )
        ).toBe(true);
    });

    it.each([' Store-ID ', null])('serializes a minimal PATCH with explicit value %j', async (storeId) => {
        await expect(updatePreferredStoreId(context, storeId)).resolves.toBeUndefined();
        expect(requests).toHaveLength(1);
        const request = requests[0];
        const url = new URL(request.url);
        expect(request.method).toBe('PATCH');
        expect(url.origin).toBe('https://short-code.api.commercecloud.salesforce.com');
        expect(url.pathname).toBe(
            '/customer/shopper-customers/v1/organizations/organization-id/customers/session-customer'
        );
        expect(Object.fromEntries(url.searchParams)).toEqual({ siteId: 'site-id' });
        expect(request.headers.get('Authorization')).toBe('Bearer access-token');
        expect(request.headers.get('Content-Type')).toBe('application/json');
        expect(await request.text()).toBe(JSON.stringify({ preferredStoreId: storeId }));
    });

    it('propagates unsupported native PATCH without retrying a legacy PATCH or reading', async () => {
        response = Response.json(
            { type: 'UnknownProperty', detail: 'preferredStoreId is unsupported' },
            { status: 400 }
        );
        await expect(updatePreferredStoreId(context, 'store-1')).rejects.toMatchObject({ status: 400 });
        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('PATCH');
        expect(await requests[0].json()).toEqual({ preferredStoreId: 'store-1' });
    });

    it('keeps native preferences per site for the same authenticated customer', async () => {
        const values = new Map<string, string | null>([
            ['site-id', 'store-1'],
            ['other-site', 'store-2'],
        ]);
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
                const request = input instanceof Request ? input : new Request(input, init);
                requests.push(request);
                const siteId = new URL(request.url).searchParams.get('siteId');
                if (!siteId) throw new Error('Missing siteId');
                if (request.method === 'PATCH') {
                    const body = (await request.json()) as { preferredStoreId: string | null };
                    expect(body).toEqual({ preferredStoreId: null });
                    values.set(siteId, body.preferredStoreId);
                }
                return Response.json({ preferredStoreId: values.get(siteId), c_preferredStoreId: 'legacy-store' });
            })
        );
        await expect(getPreferredStoreId(createRequestContext(session))).resolves.toBe('store-1');
        await expect(getPreferredStoreId(createRequestContext(session, 'other-site'))).resolves.toBe('store-2');
        await expect(getPreferredStoreId(createRequestContext(session, 'unset-site'))).resolves.toBeNull();
        await updatePreferredStoreId(createRequestContext(session), null);
        await expect(getPreferredStoreId(createRequestContext(session))).resolves.toBeNull();
        await expect(getPreferredStoreId(createRequestContext(session, 'other-site'))).resolves.toBe('store-2');
        expect(requests.map((request) => request.method)).toEqual(['GET', 'GET', 'GET', 'PATCH', 'GET', 'GET']);
        expect(requests.every((request) => new URL(request.url).pathname.endsWith('/customers/session-customer'))).toBe(
            true
        );
    });

    describe.each(['GET', 'PATCH'] as const)('%s failures', (method) => {
        it.each([
            { status: 403, statusText: 'Forbidden' },
            { status: 500, statusText: 'Internal Server Error' },
        ])('propagates HTTP $status through the real client', async ({ status, statusText }) => {
            const body = { type: 'ProfileError', title: statusText, detail: 'Profile request failed' };
            response = Response.json(body, { status, statusText });
            const operation =
                method === 'GET' ? getPreferredStoreId(context) : updatePreferredStoreId(context, 'store-1');

            await expect(operation).rejects.toBeInstanceOf(ApiError);
            await expect(operation).rejects.toMatchObject({
                status,
                statusText,
                method,
                body,
                rawBody: JSON.stringify(body),
            });
            expect(requests).toHaveLength(1);
            expect(requests[0].method).toBe(method);
        });
    });

    it('keeps concurrent customer, site, and bearer identities independent for GET and PATCH', async () => {
        const otherContext = createRequestContext(
            { userType: 'registered', customerId: 'other-customer', accessToken: 'other-token' },
            'other-site'
        );
        const contexts = [context, otherContext];
        await expect(Promise.all(contexts.map(getPreferredStoreId))).resolves.toEqual(['store-1', 'store-1']);
        await Promise.all([
            updatePreferredStoreId(context, 'store-1'),
            updatePreferredStoreId(otherContext, 'store-2'),
        ]);

        expect(requests).toHaveLength(4);
        for (const method of ['GET', 'PATCH']) {
            const methodRequests = requests.filter((request) => request.method === method);
            expect(methodRequests).toHaveLength(2);
            for (const [customerId, siteId, token, storeId] of [
                ['session-customer', 'site-id', 'access-token', 'store-1'],
                ['other-customer', 'other-site', 'other-token', 'store-2'],
            ]) {
                const request = methodRequests.find((candidate) =>
                    new URL(candidate.url).pathname.endsWith(customerId)
                );
                expect(request).toBeDefined();
                if (!request) throw new Error(`Missing ${method} for ${customerId}`);
                const url = new URL(request.url);
                expect(url.origin).toBe('https://short-code.api.commercecloud.salesforce.com');
                expect(url.pathname).toBe(
                    `/customer/shopper-customers/v1/organizations/organization-id/customers/${customerId}`
                );
                expect(Object.fromEntries(url.searchParams)).toEqual({
                    siteId,
                    ...(method === 'GET' ? { expand: 'none' } : {}),
                });
                expect(request.headers.get('Authorization')).toBe(`Bearer ${token}`);
                expect(await request.text()).toBe(
                    method === 'PATCH' ? JSON.stringify({ preferredStoreId: storeId }) : ''
                );
            }
        }
    });

    it('never fetches for guest reads or writes even with a guest customer ID and token', async () => {
        const guestContext = createRequestContext({
            userType: 'guest',
            customerId: 'guest-customer',
            accessToken: 'guest-token',
        });
        await expect(getPreferredStoreId(guestContext)).resolves.toBeNull();
        await expect(updatePreferredStoreId(guestContext, 'store-1')).rejects.toMatchObject({ status: 401 });
        expect(requests).toHaveLength(0);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('reads native set, replacement, and clear without resurrecting retained legacy data', async () => {
        let storedValue: string | null = null;
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
                const request = input instanceof Request ? input : new Request(input, init);
                requests.push(request);
                if (request.method === 'PATCH') {
                    const body = (await request.json()) as { preferredStoreId: string | null };
                    expect(Object.keys(body)).toEqual(['preferredStoreId']);
                    storedValue = body.preferredStoreId;
                }
                return Response.json({
                    preferredStoreId: storedValue,
                    c_preferredStoreId: 'legacy-store',
                    firstName: 'Unchanged',
                });
            })
        );

        for (const storeId of ['store-1', 'store-2', null]) {
            await updatePreferredStoreId(createRequestContext(session), storeId);
            await expect(getPreferredStoreId(createRequestContext(session))).resolves.toBe(storeId);
        }

        expect(requests.map((request) => request.method)).toEqual(['PATCH', 'GET', 'PATCH', 'GET', 'PATCH', 'GET']);
        for (const request of requests.filter((candidate) => candidate.method === 'PATCH')) {
            expect(new URL(request.url).pathname).toContain('/customers/session-customer');
            expect(request.headers.get('Authorization')).toBe('Bearer access-token');
        }
    });
});
