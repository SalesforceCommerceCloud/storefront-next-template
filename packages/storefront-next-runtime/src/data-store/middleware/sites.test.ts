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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MiddlewareFunction, RouterContextProvider } from 'react-router';
import { DataStore, DataStoreServiceError } from '@salesforce/mrt-utilities/middleware';
import { sitesMiddlewareLazy, getSitesFromDataStoreLazy, type DalSite } from './sites';

type MiddlewareNext = Parameters<MiddlewareFunction<Response>>[1];

const REQUEST_ARGS = () => ({
    request: new Request('https://example.com'),
    params: {},
    pattern: '',
    url: new URL('https://example.com'),
});

const MOCK_SITES: DalSite[] = [
    {
        id: 'site-1',
        name: 'Site One',
        alias: 's1',
        defaultCurrency: 'USD',
        defaultLocale: 'en-US',
        cookies: { domain: 'shop.example.com' },
        supportedCurrencies: ['USD'],
        supportedLocales: [{ id: 'en-US', preferredCurrency: 'USD' }],
    },
    {
        id: 'site-2',
        name: 'Site Two',
        alias: 's2',
        defaultCurrency: null,
        defaultLocale: 'de-DE',
        cookies: { domain: null },
        supportedCurrencies: ['EUR'],
        supportedLocales: [{ id: 'de-DE', preferredCurrency: 'EUR' }],
    },
];

function makeContext(): RouterContextProvider {
    const store = new Map<unknown, unknown>();
    return {
        set: (ctx: unknown, value: unknown) => store.set(ctx, value),
        get: (ctx: unknown) => store.get(ctx),
    } as unknown as RouterContextProvider;
}

describe('sitesMiddlewareLazy', () => {
    let context: RouterContextProvider;
    let next: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        process.env.AWS_REGION = 'us-east-1';
        process.env.MOBIFY_PROPERTY_ID = 'prop-1';
        process.env.DEPLOY_TARGET = 'production';
        context = makeContext();
        next = vi.fn().mockResolvedValue(new Response('ok'));
    });

    afterEach(() => {
        delete process.env.AWS_REGION;
        delete process.env.MOBIFY_PROPERTY_ID;
        delete process.env.DEPLOY_TARGET;
        delete process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE;
        DataStore._testDocumentClient = null;
        DataStore._testLogMRTError = null;
    });

    it('defers the fetch until read, then unwraps the { data } envelope to DalSite[]', async () => {
        const sendMock = vi.fn().mockResolvedValue({ Item: { value: { data: MOCK_SITES } } });
        DataStore._testDocumentClient = { send: sendMock } as unknown as typeof DataStore._testDocumentClient;

        await sitesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);
        expect(sendMock).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledOnce();

        const sites = await getSitesFromDataStoreLazy(context);
        expect(sites).toEqual(MOCK_SITES);
        expect(sendMock.mock.calls[0][0].input.Key.key).toBe('ecomSitesData');
    });

    it('preserves name, alias, and the widened null defaultCurrency / cookies.domain fields', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({ Item: { value: { data: MOCK_SITES } } }),
        } as unknown as typeof DataStore._testDocumentClient;

        await sitesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        const sites = await getSitesFromDataStoreLazy(context);
        expect(sites?.[0]).toMatchObject({ name: 'Site One', alias: 's1', cookies: { domain: 'shop.example.com' } });
        expect(sites?.[1]).toMatchObject({ name: 'Site Two', defaultCurrency: null, cookies: { domain: null } });
    });

    it('returns null when the producer synced zero sites', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({ Item: { value: { data: [] } } }),
        } as unknown as typeof DataStore._testDocumentClient;

        await sitesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        expect(await getSitesFromDataStoreLazy(context)).toBeNull();
    });

    it('returns null when the entry is missing', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({}),
        } as unknown as typeof DataStore._testDocumentClient;

        await sitesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        expect(await getSitesFromDataStoreLazy(context)).toBeNull();
    });

    it('returns null when the entry value is not an object', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({ Item: { value: 'not-an-object' } }),
        } as unknown as typeof DataStore._testDocumentClient;

        await sitesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        expect(await getSitesFromDataStoreLazy(context)).toBeNull();
    });

    it('returns null when data is present but not an array', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({ Item: { value: { data: 'oops' } } }),
        } as unknown as typeof DataStore._testDocumentClient;

        await sitesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        expect(await getSitesFromDataStoreLazy(context)).toBeNull();
    });

    it('reads a site that omits cookies without inventing a cookies object', async () => {
        const siteWithoutCookies: DalSite = {
            id: 'site-3',
            name: 'Site Three',
            alias: 's3',
            defaultCurrency: 'GBP',
            defaultLocale: 'en-GB',
            supportedCurrencies: ['GBP'],
            supportedLocales: [{ id: 'en-GB', preferredCurrency: 'GBP' }],
        };
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({ Item: { value: { data: [siteWithoutCookies] } } }),
        } as unknown as typeof DataStore._testDocumentClient;

        await sitesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        const sites = await getSitesFromDataStoreLazy(context);
        expect(sites?.[0]).toEqual(siteWithoutCookies);
        expect(sites?.[0].cookies).toBeUndefined();
    });

    it('defaults to fallback (resolves null) when the data store is unavailable', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockRejectedValue(new DataStoreServiceError('boom')),
        } as unknown as typeof DataStore._testDocumentClient;
        DataStore._testLogMRTError = vi.fn();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await sitesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);

        expect(await getSitesFromDataStoreLazy(context)).toBeNull();
        warnSpy.mockRestore();
    });

    it('throws on service error when SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw', async () => {
        process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE = 'throw';
        DataStore._testDocumentClient = {
            send: vi.fn().mockRejectedValue(new DataStoreServiceError('boom')),
        } as unknown as typeof DataStore._testDocumentClient;
        DataStore._testLogMRTError = vi.fn();

        vi.resetModules();
        const fresh = await import('./sites');

        await fresh.sitesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);
        await expect(fresh.getSitesFromDataStoreLazy(context)).rejects.toThrow(
            `Data store request failed for 'ecomSitesData'.`
        );
    });

    it('returns null when the lazy middleware never ran', async () => {
        expect(await getSitesFromDataStoreLazy(makeContext())).toBeNull();
    });

    it('fetches at most once across repeated reads within a request', async () => {
        const sendMock = vi.fn().mockResolvedValue({ Item: { value: { data: MOCK_SITES } } });
        DataStore._testDocumentClient = { send: sendMock } as unknown as typeof DataStore._testDocumentClient;

        await sitesMiddlewareLazy({ ...REQUEST_ARGS(), context } as never, next as MiddlewareNext);
        await getSitesFromDataStoreLazy(context);
        await getSitesFromDataStoreLazy(context);

        expect(sendMock).toHaveBeenCalledOnce();
    });
});
