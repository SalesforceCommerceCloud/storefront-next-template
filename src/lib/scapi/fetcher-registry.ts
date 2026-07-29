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
import { decodeResource, type DecodedResource } from './resource-encoding';
import type { FetcherWithComponents } from 'react-router';

// oxlint-disable-next-line
type FetcherLoad = FetcherWithComponents<any>['load'];

type RegistryEntry = {
    /** The decoded resource, computed once at registration; `null` if the key was not decodable. */
    resource: DecodedResource | null;
    /** Bound, zero-arg replay of the fetcher's `load`; absent until `register()` is called. */
    load?: () => Promise<void>;
    /**
     * How many currently-mounted handles have registered under this key. React Router shares one fetcher state per
     * key, so any number of `useScapiFetcher` instances with the same encoded resource drive a single shared fetcher.
     * The entry must outlive every one of them: it is removed only when the last registered handle unregisters.
     */
    refs: number;
};

/**
 * The handle returned by {@link createFetcherRegistration}. Frozen so callers cannot swap the methods out — but the
 * methods themselves write the live registry. Call `register` to record (or replace) the key's `load` invocation, and
 * `unregister` to remove the key on unmount.
 *
 * Only `load` is recorded: the registry exists to selectively *reload* fetchers after a mutation, and replaying a
 * `submit` would re-issue a write. A fetcher's `submit` is therefore never tracked here.
 */
export interface FetcherRegistration {
    /**
     * Record (or replace) this key's `load` invocation. Params are typed to React Router's `fetcher.load`, so the call
     * site stays type-safe.
     */
    register(method: FetcherLoad, ...params: Parameters<FetcherLoad>): void;
    /** Remove this key's entry. Idempotent, and a no-op if the key was already re-registered by a newer handle. */
    unregister(): void;
}

/** Predicate over a registered fetcher's decoded resource. Return `true` to reload it. */
type Predicate = (resource: DecodedResource) => boolean;

// Module-level singleton. The registry is inherently client-only: it holds live invocation closures from mounted
// `useScapiFetcher` instances. On the server no fetcher mounts, so it simply stays empty.
const entries = new Map<string, RegistryEntry>();

/**
 * Open a registration handle for a mounted SCAPI fetcher so it can be selectively revalidated later.
 *
 * This is the bridge React Router does not provide: `shouldRevalidate` is called without the identity of the fetcher
 * being evaluated, so per-invocation scoping is impossible there. By recording each fetcher's encoded key (its
 * decodable `[client, method, options]` identity) alongside its bound invocations at mount time — the one place where
 * both are in scope — {@link invokeMatchingFetchers} can later reload exactly the fetchers whose resource matches a
 * predicate.
 *
 * The handle is lazy: the key occupies no registry slot until `register()` is called, so an unused handle leaves no
 * trace.
 *
 * @param key - The encoded resource key (also the `useFetcher` key).
 * @returns A frozen {@link FetcherRegistration} handle.
 */
export function createFetcherRegistration(key: string): Readonly<FetcherRegistration> {
    // The entry this handle has joined, resolved lazily on first `register()`. Tracked so this handle's `unregister`
    // only ever touches the entry it actually counted against — never one a later handle published under the same key.
    let entry: RegistryEntry | undefined;

    return Object.freeze<FetcherRegistration>({
        register(method: FetcherLoad, ...params: Parameters<FetcherLoad>): void {
            if (!entry) {
                // First registration for this handle: reuse the live entry for this key if one exists (a sibling
                // `useScapiFetcher` with the same shared fetcher), else publish a fresh one. Count this handle in.
                entry = entries.get(key) ?? { resource: decodeResource(key), refs: 0 };
                entry.refs += 1;
                entries.set(key, entry);
            }
            // Store the bound, zero-arg replay closure capturing the params at this call. Re-registering (a later
            // `load()`, or a sibling handle) overwrites it; the latest registration wins, mirroring the single fetcher
            // state React Router shares across every handle with this key.
            entry.load = () => method(...params);
        },
        unregister() {
            // Release this handle's reference; remove the entry only when the last registered handle leaves. The
            // identity check guards against decrementing an entry a newer handle has since replaced under the same key.
            if (entry && entries.get(key) === entry) {
                entry.refs -= 1;
                if (entry.refs <= 0) {
                    entries.delete(key);
                }
            }
            entry = undefined;
        },
    });
}

/**
 * Reload every registered fetcher whose decoded resource satisfies `predicate`. Entries whose key cannot be decoded,
 * or that have no `load` invocation registered, are skipped (never matched, never thrown).
 *
 * Call this from a mutation's success path (e.g. an `action`'s result handler or an event subscriber) to invalidate
 * precisely the localized fetchers a mutation affects — without re-running unrelated loaders.
 */
export function invokeMatchingFetchers(predicate: Predicate): void {
    for (const { resource, load } of entries.values()) {
        if (resource && load && predicate(resource)) {
            void load();
        }
    }
}
