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

import type { DataStoreEntry } from './utils';
import type { DataStoreLogger } from './logger-context';

/**
 * Cross-request L1 cache for MRT data-store entries.
 *
 * The data-store table exposes every preference entry under a single partition key
 * (`"${MOBIFY_PROPERTY_ID} ${DEPLOY_TARGET}"`), so a storefront under load funnels tens of thousands of reads/sec
 * onto one physical DynamoDB partition and hits hot-key throttling. This cache lets a warm Lambda container serve
 * repeat reads of the same (deployment- and site-scoped) entry from memory instead of re-reading DynamoDB on every
 * request.
 *
 * ## Why the cache lives on `globalThis`
 *
 * A single Lambda container serves many sequential requests — for different shoppers — reusing the same process.
 * To survive across those requests the cache must outlive any request-scoped structure (React Router context, the
 * lazy middleware's per-request promise) AND any module-scope that the SSR bundle may re-evaluate or duplicate.
 * A top-level `const` is not reliable: the server bundle can re-run the module graph or ship duplicate chunks,
 * each getting its own fresh `const`, so cross-request reuse would silently never happen. Anchoring the singleton
 * on `globalThis` via a registered `Symbol.for(...)` key makes every module copy resolve to the one container-global
 * instance.
 *
 * ## Correctness invariant
 *
 * Because the instance is shared process-wide across all shoppers, ONLY deployment-/site-scoped state may be cached —
 * never shopper-specific data. This holds for the built-in preference entries: their keys are fully qualified and
 * site-prefixed (e.g. `acme-custom-site-preferences`) and the values are not shopper-bound. The cache keys on the
 * resolved entry key, so per-site isolation is automatic. Only successful reads are cached; transient failures and
 * missing entries are never stored, so a blip never persists for the TTL.
 *
 * ## Enablement and TTLs
 *
 * Off by default; opt in per environment. {@link DATA_STORE_CACHE_ENABLED_ENV} is the sole on/off switch: set it to
 * `true` to turn the cache on (e.g. in the deployed MRT environment where the hot-partition read volume is the
 * concern). Any other value, or leaving it unset, keeps the cache off, so tests and local development read straight
 * through to the data store and never share cross-request state unless they ask for it.
 * {@link DATA_STORE_CACHE_DEFAULT_TTL_ENV} (default {@link DATA_STORE_CACHE_DEFAULT_TTL} ms) is the base TTL used
 * for the preference entries, while callers that cache slower-changing data pass an explicit `ttlMs` to
 * {@link writeDataStoreCache}. Any non-positive or non-numeric TTL falls back to its default rather than disabling the
 * cache. All three env vars are read once when the module is first evaluated — on MRT the environment is fixed for a
 * container's lifetime, so this keeps the lookups off the per-request read/write path.
 *
 * ## Bounded size
 *
 * The store is bounded by the total UTF-8 byte size of its cached values ({@link DATA_STORE_CACHE_DEFAULT_MAXBYTES}),
 * not an entry count, so a caller that stores a large value cannot grow a warm container's memory without bound and
 * the bound holds regardless of how many keys are cached or how big each value is. Each value's size is measured once
 * on write; a write past the byte budget evicts the least-recently-used key until the store fits again. A hit
 * re-inserts its key (Map preserves insertion order), so frequently-read entries stay hot. A value larger than the
 * whole budget is never cached — caching it would flush every other key — so it is read straight from DynamoDB each
 * time.
 *
 * @env MRT_DATA_STORE_CACHE_ENABLED (optional): `'true'` enables the cache; any other value (or unset) leaves it
 *   disabled. Default: `false`. Example: `MRT_DATA_STORE_CACHE_ENABLED=true`.
 * @env MRT_DATA_STORE_CACHE_TTL (optional): base TTL in milliseconds (preference entries). A zero, negative, or
 *   non-numeric value falls back to the default. Default: `300000`. Example: `MRT_DATA_STORE_CACHE_TTL=300000`.
 * @env MRT_DATA_STORE_CACHE_MAXBYTES (optional): upper bound on the total UTF-8 byte size of cached values. A zero,
 *   negative, or non-numeric value falls back to the default. Default: `131072` (128 KiB).
 *   Example: `MRT_DATA_STORE_CACHE_MAXBYTES=262144`.
 */

/** Env var toggling the cache on/off. `'true'` enables it; anything else (or unset) leaves it disabled. */
export const DATA_STORE_CACHE_ENABLED_ENV = 'MRT_DATA_STORE_CACHE_ENABLED';

/** Env var controlling the cache TTL (ms). `0`/negative/non-numeric ⇒ falls back to the default. */
export const DATA_STORE_CACHE_DEFAULT_TTL_ENV = 'MRT_DATA_STORE_CACHE_TTL';

/** Default TTL (ms), applied when {@link DATA_STORE_CACHE_DEFAULT_TTL_ENV} is unset or cannot be parsed as a positive number. */
export const DATA_STORE_CACHE_DEFAULT_TTL = 300_000;

/** Env var controlling the cache byte budget. `0`/negative/non-numeric ⇒ falls back to the default. */
export const DATA_STORE_CACHE_DEFAULT_MAXBYTES_ENV = 'MRT_DATA_STORE_CACHE_MAXBYTES';

/**
 * Default byte budget (128 KiB), applied when {@link DATA_STORE_CACHE_DEFAULT_MAXBYTES_ENV} is unset or cannot be parsed as a
 * positive number. The store evicts the least-recently-used key until the total UTF-8 size of its cached values fits.
 */
export const DATA_STORE_CACHE_DEFAULT_MAXBYTES = 128 * 1024;

/** Emit a cache-stats log line once every this many lookups (per warm container). */
export const DATA_STORE_CACHE_LOG_INTERVAL = 100;

/** Global registry key. `Symbol.for` shares one instance across duplicated module copies. */
const CACHE_SYMBOL = Symbol.for('@salesforce/storefront-next-runtime/data-store/entry-cache');

type CacheRecord = {
    entry: DataStoreEntry;
    /** Absolute epoch-ms expiry; the record is stale once `Date.now() >= expiresAt`. */
    expiresAt: number;
    /** UTF-8 byte size of `entry.value`, measured once on write; drives the byte-budget eviction. */
    bytes: number;
};

type EntryCacheState = {
    store: Map<string, CacheRecord>;
    /** Running sum of every live record's `bytes`; kept in lockstep with `store` by {@link removeRecord}. */
    totalBytes: number;
    hits: number;
    misses: number;
    /** Lookups since the last stats log; drives the every-N emission. */
    lookupsSinceLog: number;
};

type GlobalWithCache = typeof globalThis & { [CACHE_SYMBOL]?: EntryCacheState };

function getState(): EntryCacheState {
    const globalWithCache = globalThis as GlobalWithCache;
    return (globalWithCache[CACHE_SYMBOL] ??= {
        store: new Map(),
        hits: 0,
        misses: 0,
        totalBytes: 0,
        lookupsSinceLog: 0,
    });
}

/** Parse a positive-integer env value, falling back to `fallback` for empty, zero, negative, or non-numeric input. */
function resolvePositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.floor(parsed);
}

/**
 * Cache configuration, resolved once when the module is first evaluated. On MRT the environment is fixed for a
 * container's lifetime (set at cold start), so reading these env vars once keeps them off the per-request read/write
 * path — where a native `process.env` lookup would otherwise run on every data-store access — without losing any
 * runtime behaviour. Tests that exercise different configurations re-import the module after setting the env vars.
 */
const CACHE_ENABLED = process.env[DATA_STORE_CACHE_ENABLED_ENV] === 'true';
const CACHE_DEFAULT_TTL_MS = resolvePositiveInt(
    process.env[DATA_STORE_CACHE_DEFAULT_TTL_ENV],
    DATA_STORE_CACHE_DEFAULT_TTL
);
const CACHE_MAX_BYTES = resolvePositiveInt(
    process.env[DATA_STORE_CACHE_DEFAULT_MAXBYTES_ENV],
    DATA_STORE_CACHE_DEFAULT_MAXBYTES
);

/**
 * The configured TTL in milliseconds, resolved once at module load. Always a positive value: falls back to
 * {@link DATA_STORE_CACHE_DEFAULT_TTL} when the env var is unset or cannot be parsed as a positive number (empty,
 * zero, negative, or non-numeric). Enablement is governed solely by {@link isDataStoreCacheEnabled}.
 */
export function getDataStoreCacheDefaultTtl(): number {
    return CACHE_DEFAULT_TTL_MS;
}

/**
 * The configured byte budget, resolved once at module load. Always a positive value: falls back to
 * {@link DATA_STORE_CACHE_DEFAULT_MAXBYTES} when {@link DATA_STORE_CACHE_DEFAULT_MAXBYTES_ENV} is unset or cannot be parsed as
 * a positive number (empty, zero, negative, or non-numeric).
 */
export function getDataStoreCacheDefaultMaxBytes(): number {
    return CACHE_MAX_BYTES;
}

/**
 * Whether the L1 cache is enabled, resolved once at module load. Off by default; the sole switch is
 * {@link DATA_STORE_CACHE_ENABLED_ENV} — set it to `'true'` to opt in. Any other value (or unset) leaves it disabled,
 * so tests and local development never share cross-request state unless they ask for it.
 */
export function isDataStoreCacheEnabled(): boolean {
    return CACHE_ENABLED;
}

/**
 * Read a cached entry by its resolved (site-prefixed) key. Returns `undefined` on a miss, on a stale record (which is
 * evicted), or when the cache is disabled. Records a hit/miss and, every {@link DATA_STORE_CACHE_LOG_INTERVAL} lookups,
 * emits a stats line through the injected logger.
 */
export function readDataStoreCache(key: string, logger?: DataStoreLogger): DataStoreEntry | undefined {
    if (!isDataStoreCacheEnabled()) {
        return undefined;
    }

    const state = getState();
    const record = state.store.get(key);

    let result: DataStoreEntry | undefined;
    if (!record) {
        state.misses++;
    } else if (Date.now() >= record.expiresAt) {
        // Evict on read: keeps the map from retaining expired records for keys that stop being read.
        removeRecord(state, key);
        state.misses++;
    } else {
        state.hits++;
        result = record.entry;
        // Re-insert to mark most-recently-used: Map iterates in insertion order, so the LRU eviction in
        // writeDataStoreCache drops the oldest-touched key. A frequently-read preference entry thus never
        // ages out ahead of a one-off manifest read. The byte count is unchanged, so this bypasses removeRecord.
        state.store.delete(key);
        state.store.set(key, record);
    }

    maybeLogStats(state, logger);
    return result;
}

/**
 * Store a successfully-fetched entry under its resolved (site-prefixed) key. No-op when the cache is disabled. Callers
 * must only pass successful reads — never fallbacks, missing states, or errors — so a transient failure never persists
 * for the TTL.
 *
 * `ttlMs` overrides the base TTL for slower-changing data; when omitted the preference TTL
 * ({@link getDataStoreCacheDefaultTtl}) applies. The store is bounded by {@link getDataStoreCacheDefaultMaxBytes}; a
 * write past the byte budget evicts the least-recently-used key until it fits. A value larger than the whole budget is
 * never cached — it would flush every other key — and any stale record already under that key is dropped so a later
 * read cannot serve it.
 */
export function writeDataStoreCache(key: string, entry: DataStoreEntry, ttlMs?: number): void {
    if (!isDataStoreCacheEnabled()) {
        return;
    }
    const state = getState();
    const maxBytes = getDataStoreCacheDefaultMaxBytes();
    const bytes = measureBytes(entry);

    // A value that alone exceeds the budget is never cached: admitting it would evict every other key to make room.
    // Drop any prior record under this key first — otherwise a read could serve the now-superseded (stale) value.
    if (bytes > maxBytes) {
        removeRecord(state, key);
        return;
    }

    const ttl = ttlMs ?? getDataStoreCacheDefaultTtl();
    // Remove-then-set so an overwrite refreshes recency (moves the key to the newest insertion slot) and keeps
    // totalBytes correct against the replaced record.
    removeRecord(state, key);
    // Deep-freeze before storing: a cached entry is shared process-wide across every request and shopper, and reads
    // hand back the live `entry` reference (the identity transform and unwrap transforms return values nested inside
    // it). Freezing turns any consumer mutation into a thrown error in strict mode instead of silently corrupting the
    // value for every subsequent request on the warm container.
    state.store.set(key, { entry: deepFreeze(entry), expiresAt: Date.now() + ttl, bytes });
    state.totalBytes += bytes;
    evictUntilWithinBudget(state, maxBytes);
}

/**
 * Recursively freeze a value and everything reachable from it, returning the same reference. Guards against the shared
 * cache handing out mutable objects: consumers receive the frozen `entry` by reference, so a stray write throws (strict
 * mode) rather than poisoning the process-global cache. Cheap for the small, tree-shaped preference values cached here.
 */
function deepFreeze<T>(value: T): Readonly<T> {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
        return value;
    }
    Object.freeze(value);
    for (const nested of Object.values(value)) {
        deepFreeze(nested);
    }
    return value;
}

/** Measure the UTF-8 byte size of an entry's value. `undefined` serializes to `"null"` rather than throwing. */
function measureBytes(entry: DataStoreEntry): number {
    return Buffer.byteLength(JSON.stringify(entry.value ?? null), 'utf8');
}

/** Delete a key from the store and decrement `totalBytes` by its size, keeping the running sum invariant. */
function removeRecord(state: EntryCacheState, key: string): void {
    const record = state.store.get(key);
    if (!record) {
        return;
    }
    state.store.delete(key);
    state.totalBytes -= record.bytes;
}

/** Drop least-recently-used keys until the store's total byte size is within `maxBytes`. */
function evictUntilWithinBudget(state: EntryCacheState, maxBytes: number): void {
    // Map iterates in insertion order, so the first keys are the least-recently-used. Deleting the current key
    // mid-iteration is well-defined for Map — the iterator advances to the next remaining entry. The just-written
    // key is never over budget on its own (guarded above), so the loop always terminates with the store non-empty.
    for (const oldest of state.store.keys()) {
        if (state.totalBytes <= maxBytes) {
            break;
        }
        removeRecord(state, oldest);
    }
}

/** Snapshot of cache counters for diagnostics/metrics. */
export function getDataStoreCacheStats(): { hits: number; misses: number; entries: number; bytes: number } {
    const globalWithCache = globalThis as GlobalWithCache;
    const state = globalWithCache[CACHE_SYMBOL];
    if (!state) {
        return { hits: 0, misses: 0, entries: 0, bytes: 0 };
    }
    return { hits: state.hits, misses: state.misses, entries: state.store.size, bytes: state.totalBytes };
}

/**
 * Drop the entire process-global cache instance so the next access rebuilds it empty (fresh store, zeroed counters).
 */
export function clearDataStoreCache(): void {
    delete (globalThis as GlobalWithCache)[CACHE_SYMBOL];
}

function maybeLogStats(state: EntryCacheState, logger?: DataStoreLogger): void {
    state.lookupsSinceLog++;
    if (state.lookupsSinceLog < DATA_STORE_CACHE_LOG_INTERVAL) {
        return;
    }
    state.lookupsSinceLog = 0;
    // Correlate with lambdaInstanceId in Splunk to compute per-instance hit ratio (see W-23159612).
    logger?.info('Data store L1 cache stats', {
        size: state.store.size,
        hits: state.hits,
        misses: state.misses,
        bytes: state.totalBytes,
    });
}
