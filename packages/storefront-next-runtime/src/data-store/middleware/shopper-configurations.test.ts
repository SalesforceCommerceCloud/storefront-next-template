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
import type { MiddlewareFunction, RouterContextProvider } from 'react-router';
import { DataStore, DataStoreServiceError } from '@salesforce/mrt-utilities/middleware';
import { siteContext } from '../../site-context';
import { customSitePreferencesMiddlewareLazy, getSitePreferencesLazy } from './custom-site-preferences';
import { customGlobalPreferencesMiddlewareLazy, getCustomGlobalPreferencesLazy } from './custom-global-preferences';
import {
    createShopperConfigurationsLoaderMiddleware,
    readShopperConfigurations,
    type ShopperConfigurationsLoader,
    type ShopperConfigurationsPreferences,
} from './shopper-configurations';

type MiddlewareNext = Parameters<MiddlewareFunction<Response>>[1];

const REQUEST_ARGS = () => ({
    request: new Request('https://example.com'),
    params: {},
    pattern: '',
    url: new URL('https://example.com'),
});

const RESPONSE: ShopperConfigurationsPreferences = {
    sitePreferences: {
        data: [
            { groupId: 'sfnextShopperConfiguration', id: 'minimumDeliveryValue', value: 25 },
            { groupId: 'sfnextShopperConfiguration', id: 'feefoEnableReviews', value: true },
        ],
    },
    globalPreferences: {
        data: [{ groupId: 'sfnextShopperConfiguration', id: 'brandName', value: 'Acme' }],
    },
};

function makeContext(): RouterContextProvider {
    const store = new Map<unknown, unknown>();
    const context = {
        set: (ctx: unknown, value: unknown) => store.set(ctx, value),
        get: (ctx: unknown) => store.get(ctx),
    } as unknown as RouterContextProvider;
    context.set(siteContext, { site: { id: 'acme' } } as never);
    return context;
}

/** Runs the given middlewares in order against one request context, like the root middleware chain. */
async function runChain(context: RouterContextProvider, middlewares: MiddlewareFunction<Response>[]): Promise<void> {
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    for (const middleware of middlewares) {
        await middleware({ ...REQUEST_ARGS(), context }, next as MiddlewareNext);
    }
}

function setDataStoreAvailable(available: boolean): void {
    if (available) {
        process.env.AWS_REGION = 'us-east-1';
        process.env.MOBIFY_PROPERTY_ID = 'prop-1';
        process.env.DEPLOY_TARGET = 'production';
    } else {
        delete process.env.AWS_REGION;
        delete process.env.MOBIFY_PROPERTY_ID;
        delete process.env.DEPLOY_TARGET;
    }
}

describe('Shopper Configurations fallback for custom preferences', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        setDataStoreAvailable(false);
        DataStore._testDocumentClient = null;
        DataStore._testLogMRTError = null;
        vi.restoreAllMocks();
    });

    async function readBoth(load: ShopperConfigurationsLoader | null) {
        const context = makeContext();
        await runChain(context, [
            customSitePreferencesMiddlewareLazy,
            customGlobalPreferencesMiddlewareLazy,
            ...(load ? [createShopperConfigurationsLoaderMiddleware(load)] : []),
        ]);
        const [site, global] = await Promise.all([
            getSitePreferencesLazy(context),
            getCustomGlobalPreferencesLazy(context),
        ]);
        return { site, global, context };
    }

    it('reads both preference sets from one Shopper Configurations call when the data store is unavailable', async () => {
        const load = vi.fn<ShopperConfigurationsLoader>().mockResolvedValue(RESPONSE);

        const { site, global } = await readBoth(load);

        expect(site).toEqual({ minimumDeliveryValue: 25, feefoEnableReviews: true });
        expect(global).toEqual({ brandName: 'Acme' });
        expect(load).toHaveBeenCalledOnce();
        expect(console.warn).not.toHaveBeenCalled();
    });

    it('does not call the loader until a preference is read', async () => {
        const load = vi.fn<ShopperConfigurationsLoader>().mockResolvedValue(RESPONSE);
        const context = makeContext();

        await runChain(context, [
            customSitePreferencesMiddlewareLazy,
            createShopperConfigurationsLoaderMiddleware(load),
        ]);

        expect(load).not.toHaveBeenCalled();
    });

    it('falls back to {} when no loader is registered', async () => {
        const { site, global } = await readBoth(null);

        expect(site).toEqual({});
        expect(global).toEqual({});
    });

    it('falls back to {} when the loader fails', async () => {
        const load = vi.fn<ShopperConfigurationsLoader>().mockRejectedValue(new Error('401'));

        const { site, global } = await readBoth(load);

        expect(site).toEqual({});
        expect(global).toEqual({});
        expect(load).toHaveBeenCalledOnce();
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Using configured fallback value.'));
    });

    it('falls back to {} when the loader returns no preferences', async () => {
        const load = vi.fn<ShopperConfigurationsLoader>().mockResolvedValue({});

        const { site, global } = await readBoth(load);

        expect(site).toEqual({});
        expect(global).toEqual({});
    });

    it('falls back to {} with a warning when the loader returns a malformed envelope', async () => {
        const load = vi.fn<ShopperConfigurationsLoader>().mockResolvedValue({
            sitePreferences: { foo: 1 },
            globalPreferences: { data: 'not-an-array' },
        } as unknown as ShopperConfigurationsPreferences);

        const { site, global } = await readBoth(load);

        expect(site).toEqual({});
        expect(global).toEqual({});
        expect(console.warn).toHaveBeenCalledTimes(2);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Using configured fallback value.'));
    });

    it('uses the data store, not the loader, when the data store is available', async () => {
        setDataStoreAvailable(true);
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({ Item: { value: { data: [{ id: 'fromDal', value: 1 }] } } }),
        } as unknown as typeof DataStore._testDocumentClient;
        const load = vi.fn<ShopperConfigurationsLoader>().mockResolvedValue(RESPONSE);

        const { site } = await readBoth(load);

        expect(site).toEqual({ fromDal: 1 });
        expect(load).not.toHaveBeenCalled();
    });

    it('does not use the loader for a data store service error', async () => {
        setDataStoreAvailable(true);
        DataStore._testDocumentClient = {
            send: vi.fn().mockRejectedValue(new DataStoreServiceError('boom')),
        } as unknown as typeof DataStore._testDocumentClient;
        DataStore._testLogMRTError = vi.fn();
        const load = vi.fn<ShopperConfigurationsLoader>().mockResolvedValue(RESPONSE);

        const { site } = await readBoth(load);

        expect(site).toEqual({});
        expect(load).not.toHaveBeenCalled();
    });
});

describe('readShopperConfigurations', () => {
    it('returns null when no loader is registered', async () => {
        await expect(readShopperConfigurations(makeContext())).resolves.toBeNull();
    });

    it('returns null when the loader resolves to undefined', async () => {
        const context = makeContext();
        await runChain(context, [createShopperConfigurationsLoaderMiddleware(() => Promise.resolve(undefined))]);

        await expect(readShopperConfigurations(context)).resolves.toBeNull();
    });
});

describe('Shopper Configurations cross-request cache', () => {
    const ENABLED_ENV = 'MRT_DATA_STORE_CACHE_ENABLED';

    // entry-cache reads its env vars once at module load, so re-import with the cache enabled. The fresh modules
    // also bring a fresh siteContext key, which the context must use.
    async function loadWithCache() {
        process.env[ENABLED_ENV] = 'true';
        vi.resetModules();
        const mod = await import('./shopper-configurations');
        const cache = await import('../entry-cache');
        const site = await import('../../site-context');
        cache.clearDataStoreCache();
        return { mod, cache, siteContextKey: site.siteContext };
    }

    afterEach(() => {
        delete process.env[ENABLED_ENV];
    });

    it('serves later requests for the same site from the cache', async () => {
        const { mod, cache, siteContextKey } = await loadWithCache();
        const load = vi.fn<ShopperConfigurationsLoader>().mockResolvedValue(RESPONSE);
        const middleware = mod.createShopperConfigurationsLoaderMiddleware(load);

        for (let request = 0; request < 2; request++) {
            const context = makeContext();
            context.set(siteContextKey, { site: { id: 'acme' } } as never);
            await runChain(context, [middleware]);
            await expect(mod.readShopperConfigurations(context)).resolves.toEqual(RESPONSE);
        }

        expect(load).toHaveBeenCalledOnce();
        cache.clearDataStoreCache();
    });

    it('does not cache a failed call', async () => {
        const { mod, cache, siteContextKey } = await loadWithCache();
        const load = vi
            .fn<ShopperConfigurationsLoader>()
            .mockRejectedValueOnce(new Error('timeout'))
            .mockResolvedValue(RESPONSE);
        const middleware = mod.createShopperConfigurationsLoaderMiddleware(load);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const results = [];
        for (let request = 0; request < 2; request++) {
            const context = makeContext();
            context.set(siteContextKey, { site: { id: 'acme' } } as never);
            await runChain(context, [middleware]);
            results.push(await mod.readShopperConfigurations(context));
        }

        expect(results).toEqual([null, RESPONSE]);
        expect(load).toHaveBeenCalledTimes(2);
        cache.clearDataStoreCache();
    });
});
