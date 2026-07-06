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
    readLazyDataStoreEntry,
} from '../utils';

export type CustomGlobalPreferences = Record<string, unknown>;

export const DEFAULT_CUSTOM_GLOBAL_PREFERENCES_KEY = 'custom-global-preferences';
export const customGlobalPreferencesContext = createDataStoreContext<CustomGlobalPreferences>();

const CUSTOM_GLOBAL_PREFERENCES_ON_UNAVAILABLE =
    process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE === 'throw' ? 'throw' : 'fallback';

/**
 * Read custom global preferences from router context.
 *
 * @deprecated Use {@link getCustomGlobalPreferencesLazy} with
 * {@link customGlobalPreferencesMiddlewareLazy}. The eager pairing fetches the
 * `custom-global-preferences` entry on every request that reaches the middleware — even routes
 * that never read it — which drives avoidable DynamoDB read volume on the single shared
 * data-store partition. The lazy pairing only hits the data store when a consumer actually reads the value.
 *
 * @param context - Router context provider
 * @returns Custom global preferences data stored by data-store middleware
 */
export function getCustomGlobalPreferences(context: Readonly<RouterContextProvider>): CustomGlobalPreferences {
    const data = context.get(customGlobalPreferencesContext);
    if (!data) {
        getDataStoreLogger(context).debug(
            'Custom global preferences context not found. Ensure data-store middleware runs before loaders and the required env vars are set.'
        );
        return {};
    }
    return data;
}

/**
 * Read custom global preferences populated by {@link customGlobalPreferencesMiddlewareLazy}.
 * Triggers the data-store fetch on first call within a request and reuses the cached promise on
 * subsequent calls. Returns `null` when the lazy middleware did not run or the entry is
 * missing/invalid; callers should coalesce to their own default (e.g. `?? {}`).
 *
 * @param context - Router context provider
 * @returns Custom global preferences, or `null` when unavailable
 */
export function getCustomGlobalPreferencesLazy(
    context: Readonly<RouterContextProvider>
): Promise<CustomGlobalPreferences | null> {
    return readLazyDataStoreEntry(context, customGlobalPreferencesContext);
}

/**
 * Middleware that reads the global `custom-global-preferences` entry from the MRT data
 * store and stores it in {@link customGlobalPreferencesContext}.
 *
 * @deprecated Use {@link customGlobalPreferencesMiddlewareLazy} with
 * {@link getCustomGlobalPreferencesLazy}. This eager variant fetches on every request that
 * reaches it; the lazy variant defers the fetch until a consumer reads the value.
 *
 * Defaults to graceful degradation: if the data store is unavailable or returns a service
 * error, the request continues with `{}` as the preferences value rather than crashing.
 * Set `SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw` in the environment to opt back into
 * fail-fast behavior. The env var is read once at module load.
 */
export const customGlobalPreferencesMiddleware = createDataStoreMiddleware({
    entryKey: DEFAULT_CUSTOM_GLOBAL_PREFERENCES_KEY,
    context: customGlobalPreferencesContext,
    onUnavailable: CUSTOM_GLOBAL_PREFERENCES_ON_UNAVAILABLE,
    fallbackValue: {},
});

/**
 * Lazy variant of {@link customGlobalPreferencesMiddleware}. Registers a memoized loader in
 * {@link customGlobalPreferencesContext} instead of fetching up front, so only consumers that
 * read the value via {@link getCustomGlobalPreferencesLazy} pay for the data-store round trip.
 * Same entry key, fallback, and `SFNEXT_DATA_STORE_UNAVAILABLE_MODE` semantics as the eager
 * variant.
 */
export const customGlobalPreferencesMiddlewareLazy = createLazyDataStoreMiddleware<CustomGlobalPreferences>({
    entryKey: DEFAULT_CUSTOM_GLOBAL_PREFERENCES_KEY,
    context: customGlobalPreferencesContext,
    onUnavailable: CUSTOM_GLOBAL_PREFERENCES_ON_UNAVAILABLE,
    fallbackValue: {},
});
