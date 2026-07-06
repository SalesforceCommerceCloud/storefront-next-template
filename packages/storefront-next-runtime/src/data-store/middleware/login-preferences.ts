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

export type LoginPreferences = {
    emailVerificationEnabled?: boolean;
};

export const loginPreferencesContext = createDataStoreContext<LoginPreferences>();

const LOGIN_PREFERENCES_ENTRY_KEY = prefixWithSiteId('login-preferences');
const LOGIN_PREFERENCES_ON_UNAVAILABLE =
    process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE === 'throw' ? 'throw' : 'fallback';
const LOGIN_PREFERENCES_FALLBACK: Readonly<LoginPreferences> = Object.freeze({ emailVerificationEnabled: false });
const unwrapLoginPreferences = (value: Record<string, unknown>): LoginPreferences => value.data as LoginPreferences;

/**
 * Read login preferences from router context.
 *
 * @deprecated Use {@link getLoginPreferencesLazy} with {@link loginPreferencesMiddlewareLazy}.
 * The eager pairing fetches the `login-preferences` entry on every request that reaches the
 * middleware — even routes that never read it — which drives avoidable DynamoDB read volume
 * on the single shared data-store partition. The lazy pairing only hits the data store when a
 * loader actually reads the value.
 *
 * @param context - Router context provider
 * @returns Login preferences data stored by data-store middleware
 */
export function getLoginPreferences(context: Readonly<RouterContextProvider>): LoginPreferences {
    const data = context.get(loginPreferencesContext);
    if (!data) {
        getDataStoreLogger(context).debug(
            'Login preferences context not found. Ensure data-store middleware runs before loaders and the required env vars are set.'
        );
        return {};
    }
    return data;
}

/**
 * Read login preferences populated by {@link loginPreferencesMiddlewareLazy}. Triggers the
 * data-store fetch on first call within a request and reuses the cached promise on subsequent
 * calls. Returns `null` when the lazy middleware did not run or the entry is missing/invalid;
 * callers should coalesce to their own default (e.g. `?? { emailVerificationEnabled: false }`).
 *
 * @param context - Router context provider
 * @returns Login preferences, or `null` when unavailable
 */
export function getLoginPreferencesLazy(context: Readonly<RouterContextProvider>): Promise<LoginPreferences | null> {
    return readLazyDataStoreEntry(context, loginPreferencesContext);
}

/**
 * Middleware that reads the site-scoped `login-preferences` entry from the MRT data store
 * and stores its `data` field in {@link loginPreferencesContext}. The entry key is
 * prefixed with the current site id (e.g. `acme-login-preferences`).
 *
 * @deprecated Use {@link loginPreferencesMiddlewareLazy} with {@link getLoginPreferencesLazy}.
 * This eager variant fetches on every request that reaches it; the lazy variant defers the
 * fetch until a loader reads the value.
 *
 * Defaults to graceful degradation: if the data store is unavailable or returns a service
 * error, the request continues with `{ emailVerificationEnabled: false }` rather than
 * crashing. Set `SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw` in the environment to opt back
 * into fail-fast behavior. The env var is read once at module load.
 *
 * Must run after the site-context middleware (so the site id is available for the entry
 * key) and before any loader that calls {@link getLoginPreferences}.
 */
export const loginPreferencesMiddleware = createDataStoreMiddleware<LoginPreferences>({
    entryKey: LOGIN_PREFERENCES_ENTRY_KEY,
    context: loginPreferencesContext,
    onUnavailable: LOGIN_PREFERENCES_ON_UNAVAILABLE,
    fallbackValue: LOGIN_PREFERENCES_FALLBACK,
    transform: unwrapLoginPreferences,
});

/**
 * Lazy variant of {@link loginPreferencesMiddleware}. Registers a memoized loader in
 * {@link loginPreferencesContext} instead of fetching up front, so only routes that read the
 * value via {@link getLoginPreferencesLazy} pay for the data-store round trip. Same entry key,
 * fallback, and `SFNEXT_DATA_STORE_UNAVAILABLE_MODE` semantics as the eager variant.
 *
 * Must run after the site-context middleware (so the site id is available for the entry key).
 */
export const loginPreferencesMiddlewareLazy = createLazyDataStoreMiddleware<LoginPreferences>({
    entryKey: LOGIN_PREFERENCES_ENTRY_KEY,
    context: loginPreferencesContext,
    onUnavailable: LOGIN_PREFERENCES_ON_UNAVAILABLE,
    fallbackValue: LOGIN_PREFERENCES_FALLBACK,
    transform: unwrapLoginPreferences,
});
