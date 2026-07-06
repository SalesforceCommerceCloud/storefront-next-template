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

/**
 * OOTB Google Cloud Platform preferences sourced from the MRT data store.
 *
 * Additional fields (e.g. `projectId`, `region`) may be added here as the
 * ECOM MRT sync job expands the `gcp` entry. Consumers should read the
 * object as a whole via `getGcpPreferences`, or use a specific convenience
 * getter like `getGcpApiKey` for a single field.
 */
export type GcpPreferences = {
    apiKey: string;
};

export const DEFAULT_GCP_PREFERENCES_KEY = 'gcp';

/**
 * Map keys inside the `gcp` data store entry. The ECOM MRT sync job writes
 * to these exact keys; keep in sync with the sync job contract.
 */
const API_KEY_MAP_KEY = 'api-key';

export const gcpPreferencesContext = createDataStoreContext<GcpPreferences>();

const GCP_ON_UNAVAILABLE = process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE === 'throw' ? 'throw' : 'fallback';
const GCP_FALLBACK: Readonly<GcpPreferences> = Object.freeze({ apiKey: '' });

const transformGcpPreferences = (value: Record<string, unknown>): GcpPreferences => {
    const rawKey = value[API_KEY_MAP_KEY];
    return { apiKey: typeof rawKey === 'string' ? rawKey : '' };
};

/**
 * Read the GCP (Google Cloud Platform) preferences object from router context.
 *
 * @deprecated Use {@link getGcpPreferencesLazy} with {@link gcpPreferencesMiddlewareLazy}.
 * The eager pairing fetches the `gcp` entry on every request that reaches the middleware —
 * even routes that never read it — which drives avoidable DynamoDB read volume on the single
 * shared data-store partition. The lazy pairing only hits the data store when a loader actually
 * reads the value.
 *
 * The preferences are sourced from the MRT data store entry `gcp`, which is
 * populated only for storefronts connecting to production ECOM instances.
 * In non-production environments, or when the entry is missing, returns an
 * object whose fields are all empty/default.
 *
 * @param context - Router context provider
 * @returns GCP preferences object; fields are empty/default when the entry is unavailable
 */
export function getGcpPreferences(context: Readonly<RouterContextProvider>): GcpPreferences {
    const data = context.get(gcpPreferencesContext);
    if (data === null) {
        getDataStoreLogger(context).debug(
            'GCP preferences context not found. Ensure gcpPreferencesMiddleware runs before loaders, or expect empty values in environments without the MRT data store entry.'
        );
        return { apiKey: '' };
    }
    return data;
}

/**
 * Convenience getter for the Google Cloud API key alone.
 *
 * @deprecated Use {@link getGcpApiKeyLazy} with {@link gcpPreferencesMiddlewareLazy}. See
 * {@link getGcpPreferences} for why the eager pairing is discouraged.
 *
 * Equivalent to `getGcpPreferences(context).apiKey`.
 *
 * @param context - Router context provider
 * @returns The GCP API key, or an empty string when unavailable
 */
export function getGcpApiKey(context: Readonly<RouterContextProvider>): string {
    return getGcpPreferences(context).apiKey;
}

/**
 * Read GCP preferences populated by {@link gcpPreferencesMiddlewareLazy}. Triggers the
 * data-store fetch on first call within a request and reuses the cached promise on subsequent
 * calls. Returns `null` when the lazy middleware did not run or the entry is missing/invalid;
 * callers should coalesce to their own default.
 *
 * @param context - Router context provider
 * @returns GCP preferences, or `null` when unavailable
 */
export function getGcpPreferencesLazy(context: Readonly<RouterContextProvider>): Promise<GcpPreferences | null> {
    return readLazyDataStoreEntry(context, gcpPreferencesContext);
}

/**
 * Convenience getter for the Google Cloud API key alone, backed by
 * {@link gcpPreferencesMiddlewareLazy}. Coalesces the lazy `null` (middleware absent, entry
 * missing, or data store unavailable) to an empty string, matching {@link getGcpApiKey}.
 *
 * @param context - Router context provider
 * @returns The GCP API key, or an empty string when unavailable
 */
export async function getGcpApiKeyLazy(context: Readonly<RouterContextProvider>): Promise<string> {
    return (await getGcpPreferencesLazy(context))?.apiKey ?? '';
}

/**
 * Middleware that reads the OOTB GCP preferences from the MRT data store and
 * stores them in the router context. The entry shape is `{ "api-key": string, ... }`
 * under data store key `gcp`. Missing/invalid fields coerce to empty/default values.
 *
 * @deprecated Use {@link gcpPreferencesMiddlewareLazy} with {@link getGcpApiKeyLazy}.
 * This eager variant fetches on every request that reaches it; the lazy variant defers the
 * fetch until a loader reads the value.
 *
 * Only available for storefronts connecting to production ECOM instances. When the entry
 * is not synced (e.g. the GCP feature flag is off in ECOM), the underlying fetch surfaces
 * as `DataStoreNotFoundError` and the context is left unset; consumers see the empty
 * default `{ apiKey: '' }` via {@link getGcpPreferences}.
 *
 * Defaults to graceful degradation: if the data store is unavailable or returns a service
 * error, the request continues with `{ apiKey: '' }` rather than crashing. Set
 * `SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw` in the environment to opt back into
 * fail-fast behavior. The env var is read once at module load.
 *
 * Must run before any loader/middleware that reads `getGcpPreferences(context)` or
 * `getGcpApiKey(context)`.
 */
export const gcpPreferencesMiddleware = createDataStoreMiddleware<GcpPreferences>({
    entryKey: DEFAULT_GCP_PREFERENCES_KEY,
    context: gcpPreferencesContext,
    onUnavailable: GCP_ON_UNAVAILABLE,
    fallbackValue: GCP_FALLBACK,
    transform: transformGcpPreferences,
});

/**
 * Lazy variant of {@link gcpPreferencesMiddleware}. Registers a memoized loader in
 * {@link gcpPreferencesContext} instead of fetching up front, so only routes that read the
 * value via {@link getGcpApiKeyLazy} / {@link getGcpPreferencesLazy} pay for the data-store
 * round trip. Same entry key, fallback, and `SFNEXT_DATA_STORE_UNAVAILABLE_MODE` semantics as
 * the eager variant.
 *
 * The `gcp` entry is not site-scoped, so this middleware has no ordering dependency on the
 * site-context middleware.
 */
export const gcpPreferencesMiddlewareLazy = createLazyDataStoreMiddleware<GcpPreferences>({
    entryKey: DEFAULT_GCP_PREFERENCES_KEY,
    context: gcpPreferencesContext,
    onUnavailable: GCP_ON_UNAVAILABLE,
    fallbackValue: GCP_FALLBACK,
    transform: transformGcpPreferences,
});
