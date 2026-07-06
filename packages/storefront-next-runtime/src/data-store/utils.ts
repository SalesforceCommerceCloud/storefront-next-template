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

import { type MiddlewareFunction, type RouterContextProvider, createContext } from 'react-router';
import {
    DataStore,
    DataStoreNotFoundError,
    DataStoreServiceError,
    DataStoreUnavailableError,
} from '@salesforce/mrt-utilities/data-store';
import { siteContext } from '../site-context';
import { type DataStoreLogger, getDataStoreLogger } from './logger-context';
import { readDataStoreCache, writeDataStoreCache } from './entry-cache';

export type DataStoreContextKey<T> = ReturnType<typeof createContext<T | null>>;

export type DataStoreEntryKey = string | ((context: Readonly<RouterContextProvider>) => string);

export type DataStoreEntry<TValue = unknown> = {
    value?: TValue;
};

/**
 * Options for {@link createDataStoreMiddleware} and {@link createLazyDataStoreMiddleware}.
 *
 * @typeParam T - The shape stored in `context` after the entry is fetched and transformed.
 */
export type DataStoreMiddlewareOptions<T> = {
    /**
     * The data store entry key, or a function that derives it from request context (used
     * for site-scoped keys — see {@link prefixWithSiteId}).
     */
    entryKey: DataStoreEntryKey;
    /**
     * The React Router context the resolved value is written to. Create one with
     * {@link createDataStoreContext}.
     */
    context: DataStoreContextKey<T>;
    /**
     * Optional projection from the raw entry value to the typed shape stored in context.
     * Defaults to the identity function (the raw value cast to `T`). Throws from this
     * function propagate to the caller; do not use it as a place to handle data-store
     * errors.
     */
    transform?: (value: Record<string, unknown>) => T;
    /**
     * How the middleware reacts when the data store cannot serve the entry
     * (`DataStoreUnavailableError` or `DataStoreServiceError`). `DataStoreNotFoundError`
     * is always handled gracefully and ignores this setting.
     *
     * - `'throw'` *(factory default)*: rethrow with a stable error message. Use when the
     *   entry is required and a failure should surface as a 5xx.
     * - `'fallback'`: warn and resolve to {@link DataStoreMiddlewareOptions.fallbackValue}
     *   (or the missing state if no fallback is configured). Use for optional preferences
     *   where graceful degradation is preferred.
     *
     * The four built-in middlewares (`customSitePreferencesMiddleware`, etc.) override
     * this default to `'fallback'` so the storefront stays up during transient outages,
     * and expose `SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw` as an opt-in escape hatch.
     */
    onUnavailable?: 'throw' | 'fallback';
    /**
     * Value to populate the context with when `onUnavailable === 'fallback'` and the data
     * store fetch fails. Either a constant or a function that derives the value from the
     * router context (useful for fallbacks that need request-scoped information). When
     * omitted, the middleware leaves the context unset on failure (downstream consumers
     * see the context's default value, typically `null`).
     */
    fallbackValue?: T | ((context: Readonly<RouterContextProvider>) => T);
};

/**
 * Creates a typed React Router context for data store entries.
 *
 * Initializes the context with `null` so middleware can populate it during requests.
 *
 * @returns React Router context key for data store values
 */
export function createDataStoreContext<T>(): DataStoreContextKey<T> {
    return createContext<T | null>(null);
}

/**
 * Creates a React Router middleware that fetches a single MRT data store entry on every
 * request and stores the resulting value in the supplied router context.
 *
 * Failure handling is controlled by `options.onUnavailable`:
 * - `'throw'` (default for the factory): rethrow `DataStoreUnavailableError` and
 *   `DataStoreServiceError` with a stable error message. Fail-fast — the request errors out.
 * - `'fallback'`: log a warning and resolve to `options.fallbackValue` when configured, or
 *   to the missing state (context not populated) when no `fallbackValue` is provided. The
 *   request continues without crashing the middleware chain.
 *
 * `DataStoreNotFoundError` is always treated as "missing" (warn, do not populate context),
 * regardless of `onUnavailable` — a not-found entry is an expected steady-state for
 * features that haven't been published yet, not a service failure.
 *
 * Errors thrown from `options.transform` propagate to the caller — they indicate a
 * programmer error in the middleware definition, not data-store unavailability.
 *
 * @param options - See {@link DataStoreMiddlewareOptions}.
 * @returns React Router middleware for server requests.
 *
 * @env AWS_REGION (required): AWS region for the data store table (e.g., `us-east-1`).
 * @env MOBIFY_PROPERTY_ID (required): MRT property identifier.
 * @env DEPLOY_TARGET (required): MRT deploy target (e.g., `production`).
 */
export function createDataStoreMiddleware<T>(options: DataStoreMiddlewareOptions<T>): MiddlewareFunction<Response> {
    const { entryKey, context: contextKey, onUnavailable = 'throw', fallbackValue } = options;
    const transform = options.transform ?? ((value: Record<string, unknown>) => value as T);

    const dataStoreMiddleware: MiddlewareFunction<Response> = async ({ context }, next) => {
        const resolvedEntryKey = typeof entryKey === 'function' ? entryKey(context) : entryKey;
        const result = await loadDataStoreEntry({
            entryKey: resolvedEntryKey,
            context,
            transform,
            onUnavailable,
            fallbackValue,
        });

        if (result.state === 'value' || result.state === 'fallback') {
            context.set(contextKey, result.value);
        }

        return next();
    };

    return dataStoreMiddleware;
}

/**
 * Lazy variant of {@link createDataStoreMiddleware}. Instead of fetching the
 * entry up-front during middleware execution, this stores a memoized loader
 * in the router context. Consumers call {@link readLazyDataStoreEntry} to
 * trigger the fetch on demand — pages that never read the value never pay
 * for the data-store call.
 *
 * Repeated reads within the same request share the in-flight promise so
 * the entry is fetched at most once per request.
 *
 * Failure handling matches the eager variant: `onUnavailable` and
 * `fallbackValue` are honored when the underlying fetch fails. The fallback
 * value (or `null` for the missing state) surfaces through
 * {@link readLazyDataStoreEntry}.
 *
 * Use this for entries that only a subset of routes consume (e.g. config
 * read by a single feature) rather than entries needed on every request.
 */
export function createLazyDataStoreMiddleware<T>(options: DataStoreMiddlewareOptions<T>): MiddlewareFunction<Response> {
    const { entryKey, context: contextKey, onUnavailable = 'throw', fallbackValue } = options;
    const transform = options.transform ?? ((value: Record<string, unknown>) => value as T);

    const lazyMiddleware: MiddlewareFunction<Response> = async ({ context }, next) => {
        let pending: Promise<T | null> | undefined;

        const loader: LazyDataStoreLoader<T> = () => {
            if (!pending) {
                const resolvedEntryKey = typeof entryKey === 'function' ? entryKey(context) : entryKey;
                pending = loadDataStoreEntry({
                    entryKey: resolvedEntryKey,
                    context,
                    transform,
                    onUnavailable,
                    fallbackValue,
                }).then((result) => (result.state === 'missing' ? null : result.value));
            }
            return pending;
        };

        context.set(contextKey as unknown as DataStoreContextKey<LazyDataStoreLoader<T>>, loader);

        return next();
    };

    return lazyMiddleware;
}

/**
 * Reads a value populated by {@link createLazyDataStoreMiddleware}. Triggers
 * the underlying data-store fetch on first call and reuses the cached
 * promise on subsequent calls within the same request.
 *
 * Returns `null` when the lazy middleware did not run (no loader in
 * context) or when the entry is missing/invalid.
 */
export async function readLazyDataStoreEntry<T>(
    context: Readonly<RouterContextProvider>,
    contextKey: DataStoreContextKey<T>
): Promise<T | null> {
    const loader = context.get(contextKey as unknown as DataStoreContextKey<LazyDataStoreLoader<T>>);
    if (typeof loader !== 'function') return null;
    return loader();
}

type LazyDataStoreLoader<T> = () => Promise<T | null>;

type LoadResult<T> = { state: 'value'; value: T } | { state: 'fallback'; value: T } | { state: 'missing' };

/**
 * Internal helper shared by the eager and lazy middleware factories.
 * Performs the fetch + transform pipeline and resolves all three error
 * paths (unavailable / not-found / service-error) consistently. Returns a
 * tagged result so callers can decide whether to populate the context
 * synchronously (eager middleware) or hand the value back to a lazy reader.
 *
 * This is the single funnel every eager and lazy data-store middleware read passes through, so the cross-request L1
 * cache (see {@link readDataStoreCache}) is consulted here. A fresh cached entry is served without touching
 * DynamoDB; only successful reads (a present, object-shaped `value`) are cached, so a missing entry or a thrown error
 * (not-found, unavailable, service error) is never stored and transient failures don't persist for the TTL.
 */
async function loadDataStoreEntry<T>(args: {
    entryKey: string;
    context: Readonly<RouterContextProvider>;
    transform: (value: Record<string, unknown>) => T;
    onUnavailable: 'throw' | 'fallback';
    fallbackValue: T | ((context: Readonly<RouterContextProvider>) => T) | undefined;
}): Promise<LoadResult<T>> {
    const { entryKey, context, transform, onUnavailable, fallbackValue } = args;
    const logger = getDataStoreLogger(context);

    try {
        const cached = readDataStoreCache(entryKey, logger);
        const entry = cached ?? (await getDataStoreEntry(entryKey));

        if (!entry?.value || typeof entry.value !== 'object') {
            logger.debug(`Data store entry '${entryKey}' not found or invalid.`, { entryKey });
            return { state: 'missing' };
        }

        // Transform before caching: a throwing transform must not poison the cache. If we wrote first, a corrected
        // DynamoDB value could not clear an eventual throw until expiry.
        const value = transform(entry.value as Record<string, unknown>);

        if (!cached) {
            // Cache the raw entry, never the transformed `value`. `transform` re-runs on every read (hit or miss), so
            // two middlewares that share an entryKey but apply different transforms each project the shared raw value
            // through their own transform — a hit never hands back another registration's transformed result. The
            // entry is frozen on write (see writeDataStoreCache), so a transform cannot mutate the shared reference.
            writeDataStoreCache(entryKey, entry);
        }

        return { state: 'value', value };
    } catch (error) {
        if (error instanceof DataStoreNotFoundError) {
            logger.debug(`Data store entry '${entryKey}' not found.`, { entryKey });
            return { state: 'missing' };
        }
        if (error instanceof DataStoreUnavailableError || error instanceof DataStoreServiceError) {
            return resolveDataStoreFallback({
                entryKey,
                context,
                error,
                onUnavailable,
                fallbackValue,
                logger,
            });
        }
        throw error;
    }
}

function resolveDataStoreFallback<T>(args: {
    entryKey: string;
    context: Readonly<RouterContextProvider>;
    error: DataStoreUnavailableError | DataStoreServiceError;
    onUnavailable: 'throw' | 'fallback';
    fallbackValue: T | ((context: Readonly<RouterContextProvider>) => T) | undefined;
    logger: DataStoreLogger;
}): LoadResult<T> {
    const { entryKey, context, error, onUnavailable, fallbackValue, logger } = args;
    const reason = error instanceof DataStoreServiceError ? 'service error' : 'unavailable';

    if (onUnavailable === 'fallback') {
        if (typeof fallbackValue !== 'undefined') {
            const resolved =
                typeof fallbackValue === 'function'
                    ? (fallbackValue as (ctx: Readonly<RouterContextProvider>) => T)(context)
                    : fallbackValue;
            logger.warn(`Data store ${reason} for '${entryKey}'. Using configured fallback value.`, {
                entryKey,
                reason,
                error,
            });
            return { state: 'fallback', value: resolved };
        }
        logger.warn(`Data store ${reason} for '${entryKey}'. No fallback configured; treating entry as missing.`, {
            entryKey,
            reason,
            error,
        });
        return { state: 'missing' };
    }

    if (error instanceof DataStoreUnavailableError) {
        throw new Error('Data store is unavailable. Ensure AWS_REGION, MOBIFY_PROPERTY_ID, and DEPLOY_TARGET are set.');
    }
    throw new Error(`Data store request failed for '${entryKey}'.`);
}

/**
 * Read a data-store entry through the singleton MRT utilities API.
 * The underlying implementation (production DynamoDB vs development pseudo store)
 * is resolved by `@salesforce/mrt-utilities/data-store` export conditions.
 *
 * @param key - Data-store entry key
 * @returns Data-store entry or null when missing/invalid shape
 */
export async function getDataStoreEntry<TValue = unknown>(key: string): Promise<DataStoreEntry<TValue> | null> {
    const entry = (await DataStore.getDataStore().getEntry(key)) as DataStoreEntry<TValue> | undefined;
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    return entry;
}

/**
 * Creates an entryKey function that prefixes the given suffix with the current site ID.
 *
 * @param suffix - The entry key suffix (e.g., "custom-site-preferences")
 * @returns A function compatible with `DataStoreMiddlewareOptions.entryKey`
 */
export function prefixWithSiteId(suffix: string): (context: Readonly<RouterContextProvider>) => string {
    return (context) => {
        const siteId = context.get(siteContext)?.site?.id;
        if (!siteId)
            throw new Error('Site id not found. Ensure site context middleware runs before data-store middleware.');
        return `${siteId}-${suffix}`;
    };
}
