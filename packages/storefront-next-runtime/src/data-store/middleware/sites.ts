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
import type { Site } from '../../config/types';
import { createDataStoreContext, createLazyDataStoreMiddleware, readLazyDataStoreEntry } from '../utils';

/**
 * Global data-store key written by the upstream sites producer. Must stay in
 * lockstep with the producer's key — a rename on either side silently breaks
 * multi-site config resolution.
 */
const ECOM_SITES_DATA_KEY = 'ecomSitesData';

/**
 * Site shape as it arrives from the DAL. Widens two fields relative to the
 * config-side {@link Site} so the reader tolerates payload shapes the base type
 * forbids: `defaultCurrency` may be `null`, and a `cookies` object, when
 * present, may carry a `null` `domain`. `cookies` stays optional to match the
 * base {@link Site}, so a site with no cookie config is typed honestly rather
 * than asserting a `.cookies` a caller could dereference. Keeping this widening
 * local to the DAL reader leaves the config-fed `Site` — consumed across
 * currency detection, basket, and cookie handling — unchanged.
 */
export type DalSite = Omit<Site, 'defaultCurrency' | 'cookies'> & {
    defaultCurrency: string | null;
    cookies?: { domain: string | null };
};

const sitesContext = createDataStoreContext<DalSite[]>();

const SITES_ON_UNAVAILABLE = process.env.SFNEXT_DATA_STORE_UNAVAILABLE_MODE === 'throw' ? 'throw' : 'fallback';

/**
 * Coalesce an empty sites array to `null`. A producer that has synced but has
 * no sites emits `{ data: [] }`; callers treat that identically to a missing
 * entry so they fall back to their static config rather than to zero sites.
 */
function nullIfEmpty(sites: DalSite[] | null): DalSite[] | null {
    return sites && sites.length > 0 ? sites : null;
}

/**
 * Read the DAL sites populated by {@link sitesMiddlewareLazy}. Triggers the
 * data-store fetch on first call within a request and reuses the cached promise
 * on subsequent calls. Returns `null` when the middleware did not run, the entry
 * is missing/invalid, or the producer synced zero sites.
 *
 * @param context - Router context provider
 * @returns Typed `DalSite[]`, or `null` when unavailable/empty
 */
export function getSitesFromDataStoreLazy(context: Readonly<RouterContextProvider>): Promise<DalSite[] | null> {
    return readLazyDataStoreEntry(context, sitesContext).then(nullIfEmpty);
}

/**
 * Lazy middleware that registers a memoized loader for the global `ecomSitesData`
 * entry. The DAL wraps the array in a `{ data: [...] }` envelope; the transform
 * unwraps it, coalescing a non-array `data` to `[]` so a malformed payload reads
 * as "no sites" rather than flowing a non-array value out typed as `DalSite[]`.
 * Only consumers that read via {@link getSitesFromDataStoreLazy} pay for the
 * data-store round trip.
 *
 * Defaults to graceful degradation: if the data store is unavailable or returns
 * a service error, the read resolves to `null`. Set
 * `SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw` to opt into fail-fast. The env var
 * is read once at module load.
 */
export const sitesMiddlewareLazy = createLazyDataStoreMiddleware<DalSite[]>({
    entryKey: ECOM_SITES_DATA_KEY,
    context: sitesContext,
    onUnavailable: SITES_ON_UNAVAILABLE,
    transform: (value) => (Array.isArray(value.data) ? (value.data as DalSite[]) : []),
});
