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

import type { RouterContextProvider } from 'react-router';
import { getDataStoreLogger } from '../logger-context';
import {
    createDataStoreContext,
    createDataStoreMiddleware,
    createLazyDataStoreMiddleware,
    prefixWithSiteId,
    readLazyDataStoreEntry,
} from '../utils';

export type SitePreferences = Record<string, unknown>;

export const DEFAULT_SITE_PREFERENCES_KEY = 'site-preferences';
export const sitePreferencesContext = createDataStoreContext<SitePreferences>();

const SITE_PREFERENCES_ENTRY_KEY = prefixWithSiteId('custom-site-preferences');
const SITE_PREFERENCES_ON_UNAVAILABLE =
    process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE === 'throw' ? 'throw' : 'fallback';

/**
 * Read site preferences from router context.
 *
 * @deprecated Use {@link getSitePreferencesLazy} with {@link customSitePreferencesMiddlewareLazy}.
 * The eager pairing fetches the `custom-site-preferences` entry on every request that reaches
 * the middleware — even routes that never read it — which drives avoidable DynamoDB read
 * volume on the single shared data-store partition. The lazy pairing only hits the data store when
 * a consumer actually reads the value.
 *
 * @param context - Router context provider
 * @returns Site preferences data stored by data-store middleware
 */
export function getSitePreferences(context: Readonly<RouterContextProvider>): SitePreferences {
    const data = context.get(sitePreferencesContext);
    if (!data) {
        getDataStoreLogger(context).debug(
            'Data store context not found. Ensure data-store middleware runs before loaders and the required env vars are set.'
        );
        return {};
    }
    return data;
}

/**
 * Read site preferences populated by {@link customSitePreferencesMiddlewareLazy}. Triggers the
 * data-store fetch on first call within a request and reuses the cached promise on subsequent
 * calls. Returns `null` when the lazy middleware did not run or the entry is missing/invalid;
 * callers should coalesce to their own default (e.g. `?? {}`).
 *
 * @param context - Router context provider
 * @returns Site preferences, or `null` when unavailable
 */
export function getSitePreferencesLazy(context: Readonly<RouterContextProvider>): Promise<SitePreferences | null> {
    return readLazyDataStoreEntry(context, sitePreferencesContext);
}

/**
 * Middleware that reads the site-scoped `custom-site-preferences` entry from the MRT data
 * store and stores it in {@link sitePreferencesContext}. The entry key is prefixed with
 * the current site id (e.g. `acme-custom-site-preferences`).
 *
 * @deprecated Use {@link customSitePreferencesMiddlewareLazy} with {@link getSitePreferencesLazy}.
 * This eager variant fetches on every request that reaches it; the lazy variant defers the
 * fetch until a consumer reads the value.
 *
 * Defaults to graceful degradation: if the data store is unavailable or returns a service
 * error, the request continues with `{}` as the preferences value rather than crashing.
 * Set `SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw` in the environment to opt back into
 * fail-fast behavior. The env var is read once at module load.
 *
 * Must run after the site-context middleware (so the site id is available for the entry
 * key) and before any loader that calls {@link getSitePreferences}.
 */
export const customSitePreferencesMiddleware = createDataStoreMiddleware({
    entryKey: SITE_PREFERENCES_ENTRY_KEY,
    context: sitePreferencesContext,
    onUnavailable: SITE_PREFERENCES_ON_UNAVAILABLE,
    fallbackValue: {},
});

/**
 * Lazy variant of {@link customSitePreferencesMiddleware}. Registers a memoized loader in
 * {@link sitePreferencesContext} instead of fetching up front, so only consumers that read the
 * value via {@link getSitePreferencesLazy} pay for the data-store round trip. Same entry key,
 * fallback, and `SFNEXT_DATA_STORE_UNAVAILABLE_MODE` semantics as the eager variant.
 *
 * Must run after the site-context middleware (so the site id is available for the entry key).
 */
export const customSitePreferencesMiddlewareLazy = createLazyDataStoreMiddleware<SitePreferences>({
    entryKey: SITE_PREFERENCES_ENTRY_KEY,
    context: sitePreferencesContext,
    onUnavailable: SITE_PREFERENCES_ON_UNAVAILABLE,
    fallbackValue: {},
});
