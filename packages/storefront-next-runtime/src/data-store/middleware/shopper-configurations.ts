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

import { createContext, type MiddlewareFunction, type RouterContextProvider } from 'react-router';
import { readDataStoreCache, writeDataStoreCache } from '../entry-cache';
import { getDataStoreLogger } from '../logger-context';
import { prefixWithSiteId, type RawPreferenceEnvelope } from '../utils';

/**
 * Custom preferences read from the Shopper Configurations `getConfigurations` response. The app's loader maps its
 * response fields to this shape, so the SDK doesn't depend on the field names the app's cartridge uses. Both
 * properties use the same `{ data: [{ id, value, groupId }] }` envelope as the MRT data store entries.
 */
export type ShopperConfigurationsPreferences = {
    sitePreferences?: RawPreferenceEnvelope;
    globalPreferences?: RawPreferenceEnvelope;
};

/** Fetches the custom preferences from Shopper Configurations for the current request's site. */
export type ShopperConfigurationsLoader = (
    context: Readonly<RouterContextProvider>
) => Promise<ShopperConfigurationsPreferences | null | undefined>;

type MemoizedShopperConfigurationsLoader = () => Promise<ShopperConfigurationsPreferences | null>;

/**
 * Holds the request's memoized Shopper Configurations loader, registered by
 * {@link createShopperConfigurationsLoaderMiddleware}. Read through {@link readShopperConfigurations}.
 */
export const shopperConfigurationsLoaderContext = createContext<MemoizedShopperConfigurationsLoader | null>(null);

const SHOPPER_CONFIGURATIONS_CACHE_KEY = prefixWithSiteId('shopper-configurations');

/**
 * Creates a middleware that registers a Shopper Configurations loader for the request. The data-store preference
 * getters use it as their source when the MRT data store is unavailable (for example, a storefront not hosted on
 * Managed Runtime). The loader is supplied by the app because the call needs the app's authenticated SCAPI clients.
 *
 * Nothing is fetched until a getter needs the fallback. The first call per request runs `load` and later calls share
 * its promise, so the site and global preference getters cost one request. Successful results are also stored in
 * the in-memory data-store cache under a site-scoped key, so warm instances skip the call until the TTL expires. The
 * cache does not depend on the MRT data store, so it applies when this fallback runs off Managed Runtime. The
 * preferences are not personalized, which makes them safe to share across shoppers.
 *
 * Reads happen in loaders and actions, after authentication has run. A middleware that reads preferences before the
 * app's auth middleware gets no token and falls back to the getters' default.
 *
 * Must run after the site-context middleware (the cache key uses the site id).
 *
 * @param load - Fetches Shopper Configurations and maps the response to {@link ShopperConfigurationsPreferences};
 *   may resolve to `null` when unavailable
 * @returns React Router middleware for server requests
 *
 * @env MRT_DATA_STORE_CACHE_ENABLED (optional): `'true'` caches responses across requests. Default: disabled.
 *   Example: `MRT_DATA_STORE_CACHE_ENABLED=true`.
 * @env MRT_DATA_STORE_CACHE_TTL (optional): cache TTL in milliseconds. Default: `300000`.
 *   Example: `MRT_DATA_STORE_CACHE_TTL=300000`.
 */
export function createShopperConfigurationsLoaderMiddleware(
    load: ShopperConfigurationsLoader
): MiddlewareFunction<Response> {
    return async ({ context }, next) => {
        let pending: Promise<ShopperConfigurationsPreferences | null> | undefined;

        context.set(shopperConfigurationsLoaderContext, () => {
            pending ??= loadShopperConfigurations(context, load);
            return pending;
        });

        return next();
    };
}

async function loadShopperConfigurations(
    context: Readonly<RouterContextProvider>,
    load: ShopperConfigurationsLoader
): Promise<ShopperConfigurationsPreferences | null> {
    const logger = getDataStoreLogger(context);
    const cacheKey = SHOPPER_CONFIGURATIONS_CACHE_KEY(context);
    const cached = readDataStoreCache(cacheKey, logger);
    if (cached?.value) {
        return cached.value as ShopperConfigurationsPreferences;
    }

    const preferences = (await load(context)) ?? null;
    if (preferences && typeof preferences === 'object') {
        writeDataStoreCache(cacheKey, { value: preferences });
    }
    return preferences;
}

/**
 * Read the Shopper Configurations preferences through the loader registered by
 * {@link createShopperConfigurationsLoaderMiddleware}.
 *
 * Never throws: returns `null` when no loader is registered or the call fails, so callers fall back to their own
 * default.
 *
 * @param context - Router context provider
 * @returns The preferences, or `null` when unavailable
 */
export async function readShopperConfigurations(
    context: Readonly<RouterContextProvider>
): Promise<ShopperConfigurationsPreferences | null> {
    const logger = getDataStoreLogger(context);
    const loader = context.get(shopperConfigurationsLoaderContext);
    if (typeof loader !== 'function') {
        logger.debug('No Shopper Configurations loader registered; skipping the data store fallback.');
        return null;
    }
    try {
        return await loader();
    } catch (error) {
        logger.warn('Shopper Configurations request failed; using the fallback value.', { error });
        return null;
    }
}
