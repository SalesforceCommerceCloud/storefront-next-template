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
import {
    createDataStoreContext,
    createDataStoreMiddleware,
    createLazyDataStoreMiddleware,
    prefixWithSiteId,
    readLazyDataStoreEntry,
} from './utils';
import { type DataStoreLogger, dataStoreLoggerContext } from './logger-context';
import { getSitePreferences, sitePreferencesContext } from './middleware/custom-site-preferences';
import { siteContext } from '../site-context';

type MiddlewareNext = Parameters<MiddlewareFunction<Response>>[1];

describe('createDataStoreMiddleware', () => {
    let context: RouterContextProvider;
    let next: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        process.env.AWS_REGION = 'us-east-1';
        process.env.MOBIFY_PROPERTY_ID = 'prop-1';
        process.env.DEPLOY_TARGET = 'production';

        const store = new Map<unknown, unknown>();
        context = {
            set: (ctx: unknown, value: unknown) => store.set(ctx, value),
            get: (ctx: unknown) => store.get(ctx),
        } as unknown as RouterContextProvider;

        next = vi.fn().mockResolvedValue(new Response('ok'));
    });

    afterEach(() => {
        delete process.env.AWS_REGION;
        delete process.env.MOBIFY_PROPERTY_ID;
        delete process.env.DEPLOY_TARGET;
        DataStore._testDocumentClient = null;
        DataStore._testLogMRTError = null;
    });

    it('fetches site preferences and stores them in context', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({
                Item: { value: { enabled: true, title: 'Site Prefs' } },
            }),
        } as unknown as typeof DataStore._testDocumentClient;

        const middleware = createDataStoreMiddleware({
            entryKey: 'site-preferences',
            context: sitePreferencesContext,
        });
        await middleware(
            {
                request: new Request('https://example.com'),
                context,
                params: {},
                pattern: '',
                url: new URL(new Request('https://example.com').url),
            },
            next as MiddlewareNext
        );

        const contextValue = context.get(sitePreferencesContext) as Record<string, unknown>;
        expect(contextValue).toEqual({ enabled: true, title: 'Site Prefs' });
        expect(getSitePreferences(context)).toEqual({ enabled: true, title: 'Site Prefs' });
        expect(next).toHaveBeenCalledOnce();
    });

    it('stores entry values in a custom context', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({
                Item: { value: { allowed: ['USD', 'CAD'] } },
            }),
        } as unknown as typeof DataStore._testDocumentClient;

        const allowedCurrenciesContext = createDataStoreContext<{ allowed: string[] }>();
        const middleware = createDataStoreMiddleware({
            entryKey: 'allowed-currencies',
            context: allowedCurrenciesContext,
        });

        await middleware(
            {
                request: new Request('https://example.com'),
                context,
                params: {},
                pattern: '',
                url: new URL(new Request('https://example.com').url),
            },
            next as MiddlewareNext
        );

        expect(context.get(allowedCurrenciesContext)).toEqual({ allowed: ['USD', 'CAD'] });
        expect(next).toHaveBeenCalledOnce();
    });

    it('resolves entry keys from context', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({
                Item: { value: { enabled: true } },
            }),
        } as unknown as typeof DataStore._testDocumentClient;

        const siteIdContext = createDataStoreContext<string>();
        context.set(siteIdContext, 'site-1');

        let resolvedSiteId: string | null = null;
        const middleware = createDataStoreMiddleware({
            entryKey: (ctx) => {
                resolvedSiteId = ctx.get(siteIdContext) ?? null;
                return 'site-preferences';
            },
            context: sitePreferencesContext,
        });

        await middleware(
            {
                request: new Request('https://example.com'),
                context,
                params: {},
                pattern: '',
                url: new URL(new Request('https://example.com').url),
            },
            next as MiddlewareNext
        );

        expect(resolvedSiteId).toBe('site-1');
        expect(context.get(sitePreferencesContext)).toEqual({ enabled: true });
        expect(next).toHaveBeenCalledOnce();
    });

    it('throws when data store is unavailable and onUnavailable is throw', async () => {
        const originalNodeEnv = process.env.NODE_ENV;
        const originalCi = process.env.CI;
        delete process.env.AWS_REGION;
        delete process.env.MOBIFY_PROPERTY_ID;
        delete process.env.DEPLOY_TARGET;
        process.env.NODE_ENV = 'production';
        process.env.CI = 'false';

        const middleware = createDataStoreMiddleware({
            entryKey: 'site-preferences',
            context: sitePreferencesContext,
            onUnavailable: 'throw',
        });

        await expect(
            middleware(
                {
                    request: new Request('https://example.com'),
                    context,
                    params: {},
                    pattern: '',
                    url: new URL(new Request('https://example.com').url),
                },
                next as MiddlewareNext
            )
        ).rejects.toThrow(
            'Data store is unavailable. Ensure AWS_REGION, MOBIFY_PROPERTY_ID, and DEPLOY_TARGET are set.'
        );
        expect(next).not.toHaveBeenCalled();
        process.env.NODE_ENV = originalNodeEnv;
        if (typeof originalCi === 'undefined') {
            delete process.env.CI;
        } else {
            process.env.CI = originalCi;
        }
    });

    it('falls back when service error occurs and onUnavailable is fallback', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockRejectedValue(new DataStoreServiceError('boom')),
        } as unknown as typeof DataStore._testDocumentClient;
        DataStore._testLogMRTError = vi.fn();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const middleware = createDataStoreMiddleware({
            entryKey: 'site-preferences',
            context: sitePreferencesContext,
            onUnavailable: 'fallback',
            fallbackValue: { ok: false },
        });

        await middleware(
            {
                request: new Request('https://example.com'),
                context,
                params: {},
                pattern: '',
                url: new URL(new Request('https://example.com').url),
            },
            next as MiddlewareNext
        );

        expect(context.get(sitePreferencesContext)).toEqual({ ok: false });
        expect(next).toHaveBeenCalledOnce();
        warnSpy.mockRestore();
    });

    it('throws with legacy message when service error occurs and onUnavailable is throw', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockRejectedValue(new DataStoreServiceError('boom')),
        } as unknown as typeof DataStore._testDocumentClient;
        DataStore._testLogMRTError = vi.fn();

        const middleware = createDataStoreMiddleware({
            entryKey: 'site-preferences',
            context: sitePreferencesContext,
            onUnavailable: 'throw',
        });

        await expect(
            middleware(
                {
                    request: new Request('https://example.com'),
                    context,
                    params: {},
                    pattern: '',
                    url: new URL(new Request('https://example.com').url),
                },
                next as MiddlewareNext
            )
        ).rejects.toThrow(`Data store request failed for 'site-preferences'.`);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns missing state when service error occurs and no fallback value is configured', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockRejectedValue(new DataStoreServiceError('boom')),
        } as unknown as typeof DataStore._testDocumentClient;
        DataStore._testLogMRTError = vi.fn();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const middleware = createDataStoreMiddleware({
            entryKey: 'site-preferences',
            context: sitePreferencesContext,
            onUnavailable: 'fallback',
        });

        await middleware(
            {
                request: new Request('https://example.com'),
                context,
                params: {},
                pattern: '',
                url: new URL(new Request('https://example.com').url),
            },
            next as MiddlewareNext
        );

        expect(context.get(sitePreferencesContext)).toBeUndefined();
        expect(next).toHaveBeenCalledOnce();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('returns missing state when data store is unavailable and no fallback value is configured', async () => {
        const originalNodeEnv = process.env.NODE_ENV;
        const originalCi = process.env.CI;
        delete process.env.AWS_REGION;
        delete process.env.MOBIFY_PROPERTY_ID;
        delete process.env.DEPLOY_TARGET;
        process.env.NODE_ENV = 'production';
        process.env.CI = 'false';
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const middleware = createDataStoreMiddleware({
            entryKey: 'site-preferences',
            context: sitePreferencesContext,
            onUnavailable: 'fallback',
        });

        await middleware(
            {
                request: new Request('https://example.com'),
                context,
                params: {},
                pattern: '',
                url: new URL(new Request('https://example.com').url),
            },
            next as MiddlewareNext
        );

        expect(context.get(sitePreferencesContext)).toBeUndefined();
        expect(next).toHaveBeenCalledOnce();
        warnSpy.mockRestore();
        process.env.NODE_ENV = originalNodeEnv;
        if (typeof originalCi === 'undefined') {
            delete process.env.CI;
        } else {
            process.env.CI = originalCi;
        }
    });

    it('rethrows unknown errors thrown from transform', async () => {
        // The mrt-utilities client wraps any underlying SDK error into DataStoreServiceError, so
        // unknown errors bypass that classification only when they come from the transform pipeline.
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({ Item: { value: { ok: true } } }),
        } as unknown as typeof DataStore._testDocumentClient;

        const middleware = createDataStoreMiddleware({
            entryKey: 'site-preferences',
            context: sitePreferencesContext,
            onUnavailable: 'fallback',
            fallbackValue: {},
            transform: () => {
                throw new TypeError('something else broke');
            },
        });

        await expect(
            middleware(
                {
                    request: new Request('https://example.com'),
                    context,
                    params: {},
                    pattern: '',
                    url: new URL(new Request('https://example.com').url),
                },
                next as MiddlewareNext
            )
        ).rejects.toThrow('something else broke');
        expect(next).not.toHaveBeenCalled();
    });

    it('uses the injected logger from dataStoreLoggerContext when provided', async () => {
        const injected: DataStoreLogger = {
            error: vi.fn(),
            warn: vi.fn(),
            info: vi.fn(),
            debug: vi.fn(),
        };
        context.set(dataStoreLoggerContext, injected);

        // Empty response triggers DataStoreNotFoundError inside getEntry — the path that emits the
        // structured 'not found' debug log we want to assert.
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({}),
        } as unknown as typeof DataStore._testDocumentClient;
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const middleware = createDataStoreMiddleware({
            entryKey: 'site-preferences',
            context: sitePreferencesContext,
        });

        await middleware(
            {
                request: new Request('https://example.com'),
                context,
                params: {},
                pattern: '',
                url: new URL(new Request('https://example.com').url),
            },
            next as MiddlewareNext
        );

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(injected.debug).toHaveBeenCalledWith(
            `Data store entry 'site-preferences' not found.`,
            expect.objectContaining({ entryKey: 'site-preferences' })
        );
        expect(consoleWarnSpy).not.toHaveBeenCalled();
        consoleWarnSpy.mockRestore();
    });

    it('uses fallback value when data store is unavailable and fallback mode is configured', async () => {
        const originalNodeEnv = process.env.NODE_ENV;
        const originalCi = process.env.CI;
        delete process.env.AWS_REGION;
        delete process.env.MOBIFY_PROPERTY_ID;
        delete process.env.DEPLOY_TARGET;
        process.env.NODE_ENV = 'production';
        process.env.CI = 'false';

        const middleware = createDataStoreMiddleware({
            entryKey: 'site-preferences',
            context: sitePreferencesContext,
            onUnavailable: 'fallback',
            fallbackValue: { enabled: false },
        });

        await middleware(
            {
                request: new Request('https://example.com'),
                context,
                params: {},
                pattern: '',
                url: new URL(new Request('https://example.com').url),
            },
            next as MiddlewareNext
        );

        expect(context.get(sitePreferencesContext)).toEqual({ enabled: false });
        expect(next).toHaveBeenCalledOnce();

        process.env.NODE_ENV = originalNodeEnv;
        if (typeof originalCi === 'undefined') {
            delete process.env.CI;
        } else {
            process.env.CI = originalCi;
        }
    });

    it('resolves fallback value from callback with access to context', async () => {
        const originalNodeEnv = process.env.NODE_ENV;
        const originalCi = process.env.CI;
        delete process.env.AWS_REGION;
        delete process.env.MOBIFY_PROPERTY_ID;
        delete process.env.DEPLOY_TARGET;
        process.env.NODE_ENV = 'production';
        process.env.CI = 'false';

        const siteIdContext = createDataStoreContext<string>();
        context.set(siteIdContext, 'site-1');
        const customContext = createDataStoreContext<{ siteId: string }>();

        const middleware = createDataStoreMiddleware({
            entryKey: 'site-preferences',
            context: customContext,
            onUnavailable: 'fallback',
            fallbackValue: (ctx) => ({ siteId: ctx.get(siteIdContext) ?? 'unknown' }),
        });

        await middleware(
            {
                request: new Request('https://example.com'),
                context,
                params: {},
                pattern: '',
                url: new URL(new Request('https://example.com').url),
            },
            next as MiddlewareNext
        );

        expect(context.get(customContext)).toEqual({ siteId: 'site-1' });
        expect(next).toHaveBeenCalledOnce();

        process.env.NODE_ENV = originalNodeEnv;
        if (typeof originalCi === 'undefined') {
            delete process.env.CI;
        } else {
            process.env.CI = originalCi;
        }
    });
});

describe('createLazyDataStoreMiddleware', () => {
    let context: RouterContextProvider;
    let next: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        process.env.AWS_REGION = 'us-east-1';
        process.env.MOBIFY_PROPERTY_ID = 'prop-1';
        process.env.DEPLOY_TARGET = 'production';

        const store = new Map<unknown, unknown>();
        context = {
            set: (ctx: unknown, value: unknown) => store.set(ctx, value),
            get: (ctx: unknown) => store.get(ctx),
        } as unknown as RouterContextProvider;

        next = vi.fn().mockResolvedValue(new Response('ok'));
    });

    afterEach(() => {
        delete process.env.AWS_REGION;
        delete process.env.MOBIFY_PROPERTY_ID;
        delete process.env.DEPLOY_TARGET;
        DataStore._testDocumentClient = null;
        DataStore._testLogMRTError = null;
    });

    it('does not fetch the entry until a consumer reads it', async () => {
        const sendMock = vi.fn().mockResolvedValue({ Item: { value: { enabled: true } } });
        DataStore._testDocumentClient = {
            send: sendMock,
        } as unknown as typeof DataStore._testDocumentClient;

        const middleware = createLazyDataStoreMiddleware({
            entryKey: 'site-preferences',
            context: sitePreferencesContext,
        });

        await middleware(
            {
                request: new Request('https://example.com'),
                context,
                params: {},
                pattern: '',
                url: new URL(new Request('https://example.com').url),
            },
            next as MiddlewareNext
        );

        expect(sendMock).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledOnce();

        const value = await readLazyDataStoreEntry(context, sitePreferencesContext);
        expect(value).toEqual({ enabled: true });
        expect(sendMock).toHaveBeenCalledOnce();
    });

    it('reuses the cached promise across multiple reads in the same request', async () => {
        const sendMock = vi.fn().mockResolvedValue({ Item: { value: { enabled: true } } });
        DataStore._testDocumentClient = {
            send: sendMock,
        } as unknown as typeof DataStore._testDocumentClient;

        const middleware = createLazyDataStoreMiddleware({
            entryKey: 'site-preferences',
            context: sitePreferencesContext,
        });

        await middleware(
            {
                request: new Request('https://example.com'),
                context,
                params: {},
                pattern: '',
                url: new URL(new Request('https://example.com').url),
            },
            next as MiddlewareNext
        );

        await Promise.all([
            readLazyDataStoreEntry(context, sitePreferencesContext),
            readLazyDataStoreEntry(context, sitePreferencesContext),
            readLazyDataStoreEntry(context, sitePreferencesContext),
        ]);

        expect(sendMock).toHaveBeenCalledOnce();
    });

    it('returns null on read when the entry is missing', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockResolvedValue({}),
        } as unknown as typeof DataStore._testDocumentClient;

        const middleware = createLazyDataStoreMiddleware({
            entryKey: 'site-preferences',
            context: sitePreferencesContext,
        });

        await middleware(
            {
                request: new Request('https://example.com'),
                context,
                params: {},
                pattern: '',
                url: new URL(new Request('https://example.com').url),
            },
            next as MiddlewareNext
        );

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const value = await readLazyDataStoreEntry(context, sitePreferencesContext);
        expect(value).toBeNull();
        warnSpy.mockRestore();
    });

    it('returns null when no loader has been registered in context', async () => {
        const value = await readLazyDataStoreEntry(context, sitePreferencesContext);
        expect(value).toBeNull();
    });
});

describe('data-store middleware L1 cache', () => {
    const TTL_ENV = 'MRT_DATA_STORE_CACHE_TTL';
    const ENABLED_ENV = 'MRT_DATA_STORE_CACHE_ENABLED';

    // `entry-cache` reads its enabled/TTL env vars once at module load, and `utils` binds those functions at import
    // time, so the statically-imported `createDataStoreMiddleware` above is frozen with the cache disabled (env unset
    // when this file first loaded). To exercise an enabled cache we set the env vars, reset the module registry, and
    // re-import `utils` — which pulls in a fresh `entry-cache` (config re-captured) and a fresh `DataStore` from
    // mrt-utilities. We pin the test document client on that re-imported `DataStore`, and clear the process-global
    // cache state (which lives on `globalThis` and outlives the module reset) so no earlier case's entry leaks in.
    async function loadWithCache(env: { enabled?: string; ttl?: string } = { enabled: 'true', ttl: '60000' }) {
        if (env.enabled === undefined) {
            delete process.env[ENABLED_ENV];
        } else {
            process.env[ENABLED_ENV] = env.enabled;
        }
        if (env.ttl === undefined) {
            delete process.env[TTL_ENV];
        } else {
            process.env[TTL_ENV] = env.ttl;
        }
        vi.resetModules();
        const utils = await import('./utils');
        const cache = await import('./entry-cache');
        const { DataStore: FreshDataStore } = await import('@salesforce/mrt-utilities/middleware');
        cache.clearDataStoreCache();
        return { utils, cache, DataStore: FreshDataStore };
    }

    beforeEach(() => {
        process.env.AWS_REGION = 'us-east-1';
        process.env.MOBIFY_PROPERTY_ID = 'prop-1';
        process.env.DEPLOY_TARGET = 'production';
    });

    afterEach(() => {
        delete process.env.AWS_REGION;
        delete process.env.MOBIFY_PROPERTY_ID;
        delete process.env.DEPLOY_TARGET;
        delete process.env[TTL_ENV];
        delete process.env[ENABLED_ENV];
        DataStore._testDocumentClient = null;
        DataStore._testLogMRTError = null;
    });

    // Runs the eager middleware for a key against a fresh per-request context (the cache is
    // process-global and must survive across requests) and returns the value written to context.
    // `create` is the re-imported factory whose internal cache reference reflects the current env.
    async function runMiddleware(
        create: typeof createDataStoreMiddleware,
        entryKey: string,
        transform?: (value: Record<string, unknown>) => unknown
    ): Promise<unknown> {
        const store = new Map<unknown, unknown>();
        const context = {
            set: (ctx: unknown, value: unknown) => store.set(ctx, value),
            get: (ctx: unknown) => store.get(ctx),
        } as unknown as RouterContextProvider;
        const middleware = create({ entryKey, context: sitePreferencesContext, transform });
        await middleware(
            {
                request: new Request('https://example.com'),
                context,
                params: {},
                pattern: '',
                url: new URL('https://example.com'),
            },
            vi.fn().mockResolvedValue(new Response('ok')) as MiddlewareNext
        );
        return context.get(sitePreferencesContext);
    }

    it('hits DynamoDB on every read when the cache is disabled via the enabled flag', async () => {
        const { utils, cache, DataStore: FreshDataStore } = await loadWithCache({ enabled: 'false', ttl: '60000' });
        const sendMock = vi.fn().mockResolvedValue({ Item: { value: { enabled: true } } });
        FreshDataStore._testDocumentClient = {
            send: sendMock,
        } as unknown as typeof FreshDataStore._testDocumentClient;

        await runMiddleware(utils.createDataStoreMiddleware, 'site-preferences');
        await runMiddleware(utils.createDataStoreMiddleware, 'site-preferences');

        expect(sendMock).toHaveBeenCalledTimes(2);
        expect(cache.getDataStoreCacheStats()).toEqual({ hits: 0, misses: 0, entries: 0, bytes: 0 });
    });

    it('serves the second read from cache when enabled, sparing DynamoDB', async () => {
        const { utils, cache, DataStore: FreshDataStore } = await loadWithCache();
        const sendMock = vi.fn().mockResolvedValue({ Item: { value: { enabled: true } } });
        FreshDataStore._testDocumentClient = {
            send: sendMock,
        } as unknown as typeof FreshDataStore._testDocumentClient;

        const first = await runMiddleware(utils.createDataStoreMiddleware, 'site-preferences');
        const second = await runMiddleware(utils.createDataStoreMiddleware, 'site-preferences');

        expect(first).toEqual({ enabled: true });
        expect(second).toEqual({ enabled: true });
        expect(sendMock).toHaveBeenCalledOnce();
        expect(cache.getDataStoreCacheStats()).toMatchObject({ hits: 1, entries: 1 });
    });

    it('caches per resolved key so different sites never share a value', async () => {
        const { utils, DataStore: FreshDataStore } = await loadWithCache();
        const sendMock = vi
            .fn()
            .mockResolvedValueOnce({ Item: { value: { brand: 'A' } } })
            .mockResolvedValueOnce({ Item: { value: { brand: 'B' } } });
        FreshDataStore._testDocumentClient = {
            send: sendMock,
        } as unknown as typeof FreshDataStore._testDocumentClient;

        expect(await runMiddleware(utils.createDataStoreMiddleware, 'siteA-custom-site-preferences')).toEqual({
            brand: 'A',
        });
        expect(await runMiddleware(utils.createDataStoreMiddleware, 'siteB-custom-site-preferences')).toEqual({
            brand: 'B',
        });
        expect(sendMock).toHaveBeenCalledTimes(2);
    });

    it('does not cache the entry when the transform throws, so a corrected value clears the failure', async () => {
        // A throwing transform must not poison the cache: if the raw entry were cached before the transform ran,
        // every read within the TTL would re-serve it and re-throw, and a fixed DynamoDB value could not clear the
        // failure until expiry. The read must therefore hit DynamoDB again on retry.
        const { utils, cache, DataStore: FreshDataStore } = await loadWithCache();
        const sendMock = vi.fn().mockResolvedValue({ Item: { value: { enabled: true } } });
        FreshDataStore._testDocumentClient = {
            send: sendMock,
        } as unknown as typeof FreshDataStore._testDocumentClient;

        let shouldThrow = true;
        const transform = vi.fn((value: Record<string, unknown>) => {
            if (shouldThrow) throw new TypeError('transform blew up');
            return value;
        });

        await expect(runMiddleware(utils.createDataStoreMiddleware, 'site-preferences', transform)).rejects.toThrow(
            'transform blew up'
        );
        // Nothing was cached, so the second attempt re-reads DynamoDB rather than re-running the poisoned transform.
        expect(cache.getDataStoreCacheStats()).toMatchObject({ entries: 0 });

        shouldThrow = false;
        expect(await runMiddleware(utils.createDataStoreMiddleware, 'site-preferences', transform)).toEqual({
            enabled: true,
        });
        expect(sendMock).toHaveBeenCalledTimes(2);
    });

    it('does not cache a missing entry, so a later publish is picked up', async () => {
        // An empty response makes the underlying getEntry throw DataStoreNotFoundError, which
        // loadDataStoreEntry handles gracefully as a missing entry. A missing entry must never be
        // cached, so the retry after a publish still hits DynamoDB.
        const { utils, DataStore: FreshDataStore } = await loadWithCache();
        const sendMock = vi
            .fn()
            .mockResolvedValueOnce({}) // not found → treated as missing
            .mockResolvedValueOnce({ Item: { value: { enabled: true } } });
        FreshDataStore._testDocumentClient = {
            send: sendMock,
        } as unknown as typeof FreshDataStore._testDocumentClient;

        expect(await runMiddleware(utils.createDataStoreMiddleware, 'site-preferences')).toBeUndefined();
        expect(await runMiddleware(utils.createDataStoreMiddleware, 'site-preferences')).toEqual({ enabled: true });
        expect(sendMock).toHaveBeenCalledTimes(2);
    });
});

describe('prefixWithSiteId', () => {
    function createContext(siteId?: string): Readonly<RouterContextProvider> {
        const store = new Map<unknown, unknown>();
        if (siteId) {
            store.set(siteContext, { site: { id: siteId } });
        }
        return {
            set: (ctx: unknown, value: unknown) => store.set(ctx, value),
            get: (ctx: unknown) => store.get(ctx),
        } as unknown as RouterContextProvider;
    }

    it('returns a key prefixed with the site id', () => {
        const entryKey = prefixWithSiteId('login-preferences');
        expect(entryKey(createContext('site-1'))).toBe('site-1-login-preferences');
    });

    it('throws when site id is not available', () => {
        const entryKey = prefixWithSiteId('login-preferences');
        expect(() => entryKey(createContext())).toThrow(
            'Site id not found. Ensure site context middleware runs before data-store middleware.'
        );
    });
});

describe('getSitePreferences', () => {
    it('returns empty object without warning when data-store context is missing', () => {
        const emptyContext = {
            set: vi.fn(),
            get: vi.fn().mockReturnValue(null),
        } as unknown as RouterContextProvider;

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        expect(getSitePreferences(emptyContext)).toEqual({});
        expect(warnSpy).not.toHaveBeenCalled();

        warnSpy.mockRestore();
    });
});

describe('built-in data-store middlewares', () => {
    let next: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        process.env.AWS_REGION = 'us-east-1';
        process.env.MOBIFY_PROPERTY_ID = 'prop-1';
        process.env.DEPLOY_TARGET = 'production';
        delete process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE;

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

    // Build a context populated with the freshly-imported siteContext symbol. After
    // vi.resetModules(), the module-graph identity of siteContext is reset, so we have to
    // populate context using the same module instance the middleware was loaded from.
    async function buildFreshContext(siteId: string): Promise<RouterContextProvider> {
        const { siteContext: freshSiteContext } = await import('../site-context');
        const store = new Map<unknown, unknown>();
        store.set(freshSiteContext, { site: { id: siteId } });
        return {
            set: (ctx: unknown, value: unknown) => store.set(ctx, value),
            get: (ctx: unknown) => store.get(ctx),
        } as unknown as RouterContextProvider;
    }

    it('customSitePreferencesMiddleware defaults to fallback on service error', async () => {
        DataStore._testDocumentClient = {
            send: vi.fn().mockRejectedValue(new Error('underlying ddb failure')),
            // logMRTError noop to silence the wrapped log
        } as unknown as typeof DataStore._testDocumentClient;
        DataStore._testLogMRTError = vi.fn();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        vi.resetModules();
        const { customSitePreferencesMiddleware, sitePreferencesContext: ctxKey } = await import(
            './middleware/custom-site-preferences'
        );
        const context = await buildFreshContext('icelandfoodsuk');

        await customSitePreferencesMiddleware(
            {
                request: new Request('https://example.com'),
                context,
                params: {},
                pattern: '',
                url: new URL(new Request('https://example.com').url),
            },
            next as MiddlewareNext
        );

        expect(context.get(ctxKey)).toEqual({});
        expect(next).toHaveBeenCalledOnce();
        warnSpy.mockRestore();
    });

    it('customSitePreferencesMiddleware throws when SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw', async () => {
        process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE = 'throw';
        DataStore._testDocumentClient = {
            send: vi.fn().mockRejectedValue(new Error('underlying ddb failure')),
        } as unknown as typeof DataStore._testDocumentClient;
        DataStore._testLogMRTError = vi.fn();

        vi.resetModules();
        const { customSitePreferencesMiddleware } = await import('./middleware/custom-site-preferences');
        const context = await buildFreshContext('icelandfoodsuk');

        await expect(
            customSitePreferencesMiddleware(
                {
                    request: new Request('https://example.com'),
                    context,
                    params: {},
                    pattern: '',
                    url: new URL(new Request('https://example.com').url),
                },
                next as MiddlewareNext
            )
        ).rejects.toThrow(`Data store request failed for 'icelandfoodsuk-custom-site-preferences'.`);
        expect(next).not.toHaveBeenCalled();
    });
});
