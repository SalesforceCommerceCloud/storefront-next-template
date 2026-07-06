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
import type { DataStoreLogger } from './logger-context';
import {
    DATA_STORE_CACHE_DEFAULT_MAXBYTES,
    DATA_STORE_CACHE_DEFAULT_MAXBYTES_ENV,
    DATA_STORE_CACHE_DEFAULT_TTL,
    DATA_STORE_CACHE_DEFAULT_TTL_ENV,
    DATA_STORE_CACHE_ENABLED_ENV,
    DATA_STORE_CACHE_LOG_INTERVAL,
} from './entry-cache';

const TTL_ENV = DATA_STORE_CACHE_DEFAULT_TTL_ENV;
const ENABLED_ENV = DATA_STORE_CACHE_ENABLED_ENV;
const MAX_BYTES_ENV = DATA_STORE_CACHE_DEFAULT_MAXBYTES_ENV;

function makeLogger(): DataStoreLogger {
    return { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
}

function setOrDelete(name: string, value: string | undefined): void {
    if (value === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = value;
    }
}

/**
 * The cache reads its env vars once when the module is first evaluated, so a test cannot flip a flag on the already-
 * imported module and observe the change. Instead, set the env vars and re-import: `vi.resetModules()` drops the module
 * from the registry so the next `import` re-runs its top-level config capture with the current env. The cache state
 * itself lives on `globalThis` under a registered `Symbol.for(...)`, which survives the module reset, so we clear it
 * here to give each case a clean store. The returned namespace's functions read the freshly-captured config.
 */
async function loadCache(env: { enabled?: string; ttl?: string; maxBytes?: string } = {}) {
    setOrDelete(ENABLED_ENV, env.enabled);
    setOrDelete(TTL_ENV, env.ttl);
    setOrDelete(MAX_BYTES_ENV, env.maxBytes);
    vi.resetModules();
    const mod = await import('./entry-cache');
    mod.clearDataStoreCache();
    return mod;
}

describe('data-store entry cache', () => {
    beforeEach(() => {
        delete process.env[TTL_ENV];
        delete process.env[ENABLED_ENV];
        delete process.env[MAX_BYTES_ENV];
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-03T00:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
        delete process.env[TTL_ENV];
        delete process.env[ENABLED_ENV];
        delete process.env[MAX_BYTES_ENV];
    });

    describe('configuration', () => {
        it('is disabled by default, with the default TTL resolved, when nothing is set', async () => {
            const cache = await loadCache();
            expect(cache.getDataStoreCacheDefaultTtl()).toBe(DATA_STORE_CACHE_DEFAULT_TTL);
            expect(DATA_STORE_CACHE_DEFAULT_TTL).toBe(300000);
            expect(cache.isDataStoreCacheEnabled()).toBe(false);
        });

        it('is enabled only when the enabled flag is exactly "true"', async () => {
            const cache = await loadCache({ enabled: 'true' });
            expect(cache.isDataStoreCacheEnabled()).toBe(true);
        });

        it('stays disabled for any enabled-flag value other than "true"', async () => {
            for (const raw of ['false', 'yes', '']) {
                const cache = await loadCache({ enabled: raw });
                expect(cache.isDataStoreCacheEnabled()).toBe(false);
            }
        });

        it('falls back to the default TTL when the value is empty, zero, negative, or non-numeric', async () => {
            for (const raw of ['', '0', '-5', 'not-a-number']) {
                const cache = await loadCache({ ttl: raw });
                expect(cache.getDataStoreCacheDefaultTtl()).toBe(DATA_STORE_CACHE_DEFAULT_TTL);
            }
        });

        it('honors a positive TTL override', async () => {
            const cache = await loadCache({ ttl: '300000' });
            expect(cache.getDataStoreCacheDefaultTtl()).toBe(300000);
        });

        it('enablement ignores the TTL — the enabled flag is the sole switch', async () => {
            // The TTL never affects enablement; only the enabled flag does. A non-positive TTL leaves an
            // opted-in cache enabled (it just falls back to the default TTL), and an unset flag disables it.
            const enabled = await loadCache({ ttl: '0', enabled: 'true' });
            expect(enabled.isDataStoreCacheEnabled()).toBe(true);
            const disabled = await loadCache({ ttl: '0' });
            expect(disabled.isDataStoreCacheEnabled()).toBe(false);
        });

        it('resolves the byte budget to 128 KiB by default and honors a positive override', async () => {
            const byDefault = await loadCache();
            expect(byDefault.getDataStoreCacheDefaultMaxBytes()).toBe(DATA_STORE_CACHE_DEFAULT_MAXBYTES);
            expect(DATA_STORE_CACHE_DEFAULT_MAXBYTES).toBe(131072);

            const overridden = await loadCache({ maxBytes: '262144' });
            expect(overridden.getDataStoreCacheDefaultMaxBytes()).toBe(262144);
        });

        it('falls back to the byte-budget default for empty, zero, negative, or non-numeric values', async () => {
            for (const raw of ['', '0', '-5', 'not-a-number']) {
                const cache = await loadCache({ maxBytes: raw });
                expect(cache.getDataStoreCacheDefaultMaxBytes()).toBe(DATA_STORE_CACHE_DEFAULT_MAXBYTES);
            }
        });
    });

    describe('when disabled via the enabled flag', () => {
        it('never stores or serves entries and records no stats', async () => {
            const cache = await loadCache({ enabled: 'false' });
            cache.writeDataStoreCache('gcp', { value: { 'api-key': 'k' } });
            expect(cache.readDataStoreCache('gcp')).toBeUndefined();
            expect(cache.getDataStoreCacheStats()).toEqual({ hits: 0, misses: 0, entries: 0, bytes: 0 });
        });
    });

    describe('when enabled', () => {
        it('serves a fresh entry and counts a hit', async () => {
            const cache = await loadCache({ enabled: 'true', ttl: '60000' });
            const entry = { value: { data: { emailVerificationEnabled: true } } };
            cache.writeDataStoreCache('site-1-login-preferences', entry);

            const cached = cache.readDataStoreCache('site-1-login-preferences');

            expect(cached).toEqual(entry);
            expect(cache.getDataStoreCacheStats()).toMatchObject({ hits: 1, misses: 0, entries: 1 });
        });

        it('counts a miss for an unknown key', async () => {
            const cache = await loadCache({ enabled: 'true', ttl: '60000' });
            expect(cache.readDataStoreCache('unknown')).toBeUndefined();
            expect(cache.getDataStoreCacheStats()).toMatchObject({ hits: 0, misses: 1 });
        });

        it('expires and evicts an entry after the TTL elapses', async () => {
            const cache = await loadCache({ enabled: 'true', ttl: '60000' });
            cache.writeDataStoreCache('gcp', { value: { 'api-key': 'k' } });

            vi.advanceTimersByTime(59_999);
            expect(cache.readDataStoreCache('gcp')).toEqual({ value: { 'api-key': 'k' } });

            vi.advanceTimersByTime(2);
            expect(cache.readDataStoreCache('gcp')).toBeUndefined();
            // Stale record is evicted, so the entry count drops back to zero.
            expect(cache.getDataStoreCacheStats().entries).toBe(0);
        });

        it('isolates entries per key (no cross-site bleed)', async () => {
            const cache = await loadCache({ enabled: 'true', ttl: '60000' });
            cache.writeDataStoreCache('siteA-custom-site-preferences', { value: { brand: 'A' } });
            cache.writeDataStoreCache('siteB-custom-site-preferences', { value: { brand: 'B' } });

            expect(cache.readDataStoreCache('siteA-custom-site-preferences')).toEqual({ value: { brand: 'A' } });
            expect(cache.readDataStoreCache('siteB-custom-site-preferences')).toEqual({ value: { brand: 'B' } });
        });

        it('emits a stats log line via the injected logger every N lookups', async () => {
            const cache = await loadCache({ enabled: 'true', ttl: '60000' });
            const logger = makeLogger();
            // eslint-disable-next-line @typescript-eslint/unbound-method -- reading the mock to assert on it, not calling it
            const info = logger.info as ReturnType<typeof vi.fn>;
            cache.writeDataStoreCache('gcp', { value: { 'api-key': 'k' } });

            for (let i = 0; i < DATA_STORE_CACHE_LOG_INTERVAL - 1; i++) {
                cache.readDataStoreCache('gcp', logger);
            }
            expect(info).not.toHaveBeenCalled();

            cache.readDataStoreCache('gcp', logger);
            expect(info).toHaveBeenCalledTimes(1);
            expect(info).toHaveBeenCalledWith(
                'Data store L1 cache stats',
                expect.objectContaining({
                    size: 1,
                    hits: DATA_STORE_CACHE_LOG_INTERVAL,
                    misses: 0,
                })
            );
        });

        it('does not attempt to log when no logger is provided', async () => {
            const cache = await loadCache({ enabled: 'true', ttl: '60000' });
            cache.writeDataStoreCache('gcp', { value: { 'api-key': 'k' } });
            for (let i = 0; i < DATA_STORE_CACHE_LOG_INTERVAL; i++) {
                expect(() => cache.readDataStoreCache('gcp')).not.toThrow();
            }
            expect(cache.getDataStoreCacheStats().hits).toBe(DATA_STORE_CACHE_LOG_INTERVAL);
        });

        it('honors an explicit ttlMs override that outlives the base TTL', async () => {
            const cache = await loadCache({ enabled: 'true', ttl: '60000' });
            // A caller can pass a longer TTL than the 60s base for slower-changing data — the entry must survive
            // past the base window and expire only at the override.
            cache.writeDataStoreCache('slow-changing', { value: { data: 'z' } }, 300_000);

            vi.advanceTimersByTime(120_000); // well past the 60s base TTL
            expect(cache.readDataStoreCache('slow-changing')).toEqual({ value: { data: 'z' } });

            vi.advanceTimersByTime(181_000); // now past the 300s override
            expect(cache.readDataStoreCache('slow-changing')).toBeUndefined();
        });
    });

    describe('bounded size (byte budget, LRU)', () => {
        // An entry whose value serializes to exactly `n` UTF-8 bytes: JSON.stringify({ d: 'a'.repeat(k) })
        // is `{"d":"…"}` = k + 8 bytes, so k = n - 8. Lets tests reason in whole entry sizes against the budget.
        function entryOfBytes(n: number) {
            return { value: { d: 'a'.repeat(n - 8) } };
        }

        // A 300-byte budget holds exactly three 100-byte entries, so a fourth write forces one eviction.
        const BOUNDED = { enabled: 'true', ttl: '60000', maxBytes: '300' } as const;

        it('measures and accumulates the UTF-8 byte size of each cached value', async () => {
            const cache = await loadCache(BOUNDED);
            cache.writeDataStoreCache('k0', entryOfBytes(100));
            expect(cache.getDataStoreCacheStats()).toMatchObject({ entries: 1, bytes: 100 });

            cache.writeDataStoreCache('k1', entryOfBytes(100));
            expect(cache.getDataStoreCacheStats()).toMatchObject({ entries: 2, bytes: 200 });
        });

        it('evicts the least-recently-used key once a write pushes past the byte budget', async () => {
            const cache = await loadCache(BOUNDED);
            cache.writeDataStoreCache('k0', entryOfBytes(100));
            cache.writeDataStoreCache('k1', entryOfBytes(100));
            cache.writeDataStoreCache('k2', entryOfBytes(100));
            expect(cache.getDataStoreCacheStats()).toMatchObject({ entries: 3, bytes: 300 });

            cache.writeDataStoreCache('k3', entryOfBytes(100));

            // k0 was the oldest and never re-touched, so it is dropped to bring the total back within budget.
            expect(cache.readDataStoreCache('k0')).toBeUndefined();
            expect(cache.readDataStoreCache('k3')).toEqual(entryOfBytes(100));
            expect(cache.getDataStoreCacheStats()).toMatchObject({ entries: 3, bytes: 300 });
        });

        it('a read refreshes recency so the just-read key survives the next eviction', async () => {
            const cache = await loadCache(BOUNDED);
            cache.writeDataStoreCache('hot', entryOfBytes(100));
            cache.writeDataStoreCache('k0', entryOfBytes(100));
            cache.writeDataStoreCache('k1', entryOfBytes(100));

            // Promote 'hot' to most-recently-used; without this it would be the eviction target on the next write.
            expect(cache.readDataStoreCache('hot')).toEqual(entryOfBytes(100));
            cache.writeDataStoreCache('k2', entryOfBytes(100));

            expect(cache.readDataStoreCache('hot')).toEqual(entryOfBytes(100));
            expect(cache.readDataStoreCache('k0')).toBeUndefined();
        });

        it('keeps totalBytes in step across overwrites, stale eviction, and byte-budget eviction', async () => {
            const cache = await loadCache(BOUNDED);
            cache.writeDataStoreCache('k0', entryOfBytes(100));
            // Overwriting the same key replaces its byte contribution rather than adding to it.
            cache.writeDataStoreCache('k0', entryOfBytes(150));
            expect(cache.getDataStoreCacheStats()).toMatchObject({ entries: 1, bytes: 150 });

            // A read past the TTL evicts the stale record and reclaims its bytes.
            vi.advanceTimersByTime(60_001);
            expect(cache.readDataStoreCache('k0')).toBeUndefined();
            expect(cache.getDataStoreCacheStats()).toMatchObject({ entries: 0, bytes: 0 });
        });

        it('never caches a value larger than the whole budget and drops a prior value under that key', async () => {
            const cache = await loadCache(BOUNDED);
            // A fresh oversized write is a no-op and leaves other keys untouched.
            cache.writeDataStoreCache('small', entryOfBytes(100));
            cache.writeDataStoreCache('huge', entryOfBytes(400));
            expect(cache.readDataStoreCache('huge')).toBeUndefined();
            expect(cache.readDataStoreCache('small')).toEqual(entryOfBytes(100));
            expect(cache.getDataStoreCacheStats()).toMatchObject({ entries: 1, bytes: 100 });

            // When a key grows past the budget, its cached (now stale) value must not survive to be served.
            cache.writeDataStoreCache('small', entryOfBytes(400));
            expect(cache.readDataStoreCache('small')).toBeUndefined();
            expect(cache.getDataStoreCacheStats()).toMatchObject({ entries: 0, bytes: 0 });
        });

        it('deep-freezes a cached entry so a consumer cannot mutate the process-global value', async () => {
            const cache = await loadCache(BOUNDED);
            // The cache hands back the live entry by reference; freezing turns a stray write into a thrown error
            // (strict mode) instead of silently corrupting the value for every later request on the warm container.
            cache.writeDataStoreCache('login', { value: { data: { emailVerificationEnabled: true } } });

            const cached = cache.readDataStoreCache('login');
            const value = cached?.value as { data: { emailVerificationEnabled: boolean } };

            expect(Object.isFrozen(cached)).toBe(true);
            expect(Object.isFrozen(value)).toBe(true);
            expect(Object.isFrozen(value.data)).toBe(true);
            expect(() => {
                value.data.emailVerificationEnabled = false;
            }).toThrow(TypeError);
            // The stored value is unchanged, so the next reader still sees the original.
            expect(
                (cache.readDataStoreCache('login')?.value as { data: { emailVerificationEnabled: boolean } }).data
                    .emailVerificationEnabled
            ).toBe(true);
        });

        it('counts UTF-8 bytes, not UTF-16 code units, for multibyte values', async () => {
            const cache = await loadCache(BOUNDED);
            // JSON.stringify({ d: '€' }) is `{"d":"€"}`: 9 UTF-16 code units but 11 UTF-8 bytes (€ is 3 bytes).
            cache.writeDataStoreCache('euro', { value: { d: '€' } });
            expect(cache.getDataStoreCacheStats().bytes).toBe(11);
        });
    });

    describe('globalThis residency', () => {
        it('shares one cache instance across module-graph copies via the global symbol', async () => {
            const cache = await loadCache({ enabled: 'true', ttl: '60000' });
            cache.writeDataStoreCache('gcp', { value: { 'api-key': 'shared' } });

            // A re-imported module copy (as happens after vi.resetModules or with duplicated bundle chunks) must
            // resolve to the same globalThis-resident cache instance. The env is unchanged, so the fresh copy is
            // enabled too; import without clearing so the earlier write is still present to be served.
            vi.resetModules();
            const fresh = await import('./entry-cache');

            expect(fresh.readDataStoreCache('gcp')).toEqual({ value: { 'api-key': 'shared' } });
        });
    });

    describe('clearDataStoreCache', () => {
        it('drops every cached entry and zeroes the counters', async () => {
            const cache = await loadCache({ enabled: 'true', ttl: '60000' });
            cache.writeDataStoreCache('gcp', { value: { 'api-key': 'k' } });
            expect(cache.readDataStoreCache('gcp')).toEqual({ value: { 'api-key': 'k' } });
            expect(cache.getDataStoreCacheStats()).toMatchObject({ hits: 1, entries: 1 });

            cache.clearDataStoreCache();

            // A fresh instance is rebuilt on next access: the entry is gone and all counters restart at zero.
            expect(cache.readDataStoreCache('gcp')).toBeUndefined();
            expect(cache.getDataStoreCacheStats()).toEqual({ hits: 0, misses: 1, entries: 0, bytes: 0 });
        });

        it('is a no-op when the cache has never been touched', async () => {
            const cache = await loadCache({ enabled: 'true', ttl: '60000' });
            expect(() => cache.clearDataStoreCache()).not.toThrow();
            expect(cache.getDataStoreCacheStats()).toEqual({ hits: 0, misses: 0, entries: 0, bytes: 0 });
        });
    });
});
