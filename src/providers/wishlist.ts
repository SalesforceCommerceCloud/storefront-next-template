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
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { resourceRoutes } from '@/route-paths';
import type { ApiResponse } from '@/lib/scapi/types';

/**
 * Module-level wishlist store shared by every route in the tab. There is no provider and no
 * per-route `initialState`: hooks subscribe straight to this singleton via `useSyncExternalStore`,
 * so hearts filled on one route stay filled after client navigation without re-seeding.
 *
 * The `_app` shell binds the session `customerId` from client auth (see `useWishlistSession`). No
 * SCAPI read happens at load; the store loads lazily on first product intent (tile hover / PDP
 * heart mount) via `/action/wishlist-state`.
 */

/**
 * Per-product store entry. `pending` is true while an optimistic add for that
 * product is awaiting the server action's confirmation; it flips to false on
 * success and the entry is removed entirely on failure.
 */
export type WishlistEntry = { pending: boolean };

/** Shape the `/action/wishlist-*` routes serialize via React Router's `data()`. */
type WishlistActionResult = {
    success?: boolean;
    alreadyInWishlist?: boolean;
    error?: { message?: string };
};

/**
 * POST a wishlist mutation to a server action route and normalize the response to
 * {@link ApiResponse}. Plain `fetch` (not `useFetcher`) so the write doesn't trigger
 * loader revalidation on the page. Always resolves — failures are coerced to
 * `{ success: false, errors: [...] }`.
 */
async function postWishlistAction(
    route: string,
    productId: string
): Promise<ApiResponse<{ alreadyInWishlist?: boolean }>> {
    try {
        const body = new FormData();
        body.set('productId', productId);
        const response = await fetch(route, { method: 'POST', body });
        const parsed = (await response.json()) as WishlistActionResult;

        if (!response.ok || !parsed.success) {
            return {
                success: false,
                errors: [parsed.error?.message ?? (response.statusText || `HTTP ${response.status}`)],
            };
        }

        return { success: true, data: { alreadyInWishlist: parsed.alreadyInWishlist } };
    } catch (e) {
        return { success: false, errors: [e instanceof Error ? e.message : 'Network error'] };
    }
}

/**
 * Referentially-stable external store for the `productId → { pending }` map.
 *
 * Subscribers are only invoked when the underlying map identity changes, and
 * per-id consumers (via `useIsInWishlist`) only re-render when *their* entry
 * changes identity — so a heart icon for product A never re-renders when
 * product B is added or removed.
 */
function createWishlistStore() {
    let data: ReadonlyMap<string, WishlistEntry> = new Map();
    const listeners = new Set<() => void>();

    const notify = () => {
        listeners.forEach((l) => l());
    };

    return {
        subscribe(this: void, listener: () => void): () => void {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getSnapshot(this: void): ReadonlyMap<string, WishlistEntry> {
            return data;
        },
        get(this: void, productId: string): WishlistEntry | undefined {
            return data.get(productId);
        },
        has(this: void, productId: string): boolean {
            return data.has(productId);
        },
        /** Insert/replace a single entry. Notifies on identity change of the entry. */
        set(this: void, productId: string, entry: WishlistEntry): void {
            const prev = data.get(productId);
            if (prev && prev.pending === entry.pending) {
                // Identical entry; skip notify so per-id subscribers don't re-render.
                return;
            }
            const next = new Map(data);
            next.set(productId, entry);
            data = next;
            notify();
        },
        /** Remove a single entry. No-op if absent. */
        delete(this: void, productId: string): void {
            if (!data.has(productId)) return;
            const next = new Map(data);
            next.delete(productId);
            data = next;
            notify();
        },
        /** Bulk replace. Used by the lazy load and session reset. */
        replaceAll(this: void, productIds: ReadonlySet<string>): void {
            const next = new Map<string, WishlistEntry>();
            for (const id of productIds) {
                next.set(id, { pending: false });
            }
            data = next;
            notify();
        },
    };
}

/** Counter store backing the global `isPending` flag, subscribable independently of the map. */
function createPendingStore() {
    let count = 0;
    const listeners = new Set<() => void>();
    return {
        subscribe(this: void, listener: () => void): () => void {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getSnapshot(this: void): number {
            return count;
        },
        increment(this: void): void {
            count += 1;
            listeners.forEach((l) => l());
        },
        decrement(this: void): void {
            count -= 1;
            listeners.forEach((l) => l());
        },
        reset(this: void): void {
            count = 0;
            listeners.forEach((l) => l());
        },
    };
}

/**
 * Actions exposed to mutating components. `add`, `remove`, and `toggle` are stable
 * module-level references; only `isPending` changes identity (to drive spinner/disable
 * on mutating buttons). `isPending` is a global "any mutation in flight" flag — components
 * that need per-product pending state should derive it via `useWishlistEntry`.
 */
export type WishlistActions = {
    /** Optimistic add. Resolves with the server result; rolls back on `!success`. */
    add: (productId: string) => Promise<ApiResponse<unknown>>;
    /** Optimistic remove. */
    remove: (productId: string) => Promise<ApiResponse<unknown>>;
    /** Convenience: add when absent, remove when present. */
    toggle: (productId: string) => Promise<ApiResponse<unknown>>;
    /** True while any add/remove is in flight. */
    isPending: boolean;
};

// ---------------------------------------------------------------------------
// Module singleton state
// ---------------------------------------------------------------------------

/** @internal The referentially-stable stores. Exported for the test-utils seed/reset helpers only. */
export const wishlistStore = createWishlistStore();
/** @internal */
export const pendingStore = createPendingStore();

/**
 * @internal
 * Mutable singleton bookkeeping the store logic reads and writes directly. A single holder (rather
 * than free `let`s) so the test-utils seed/reset helpers can drive it from another module without a
 * test-only export shipping in the runtime bundle.
 *
 * - `sessionCustomerId`: current session owner, pushed per navigation by `useWishlistSession`; drives eviction.
 * - `loadState`: once-per-session lazy-read latch, reset on session change.
 * - `pendingRemovals`: product IDs optimistically REMOVED while a lazy load GET is in flight. The GET
 *   reflects the wishlist as of when it fired, so without this it would resurrect an item removed mid-fetch.
 * - `loadRequested`: sticky flag — some consumer has asked to load. An at-load heart fires `loadWishlist()`
 *   from its mount effect, which flushes child-before-parent (before the route's session effect runs);
 *   recording the request lets `setSessionCustomerId` replay it once the session is known.
 * - `writeChain`: serializes wishlist write round-trips (see `enqueueWrite`).
 */
export const wishlistState: {
    sessionCustomerId: string | null;
    loadState: { done: boolean; inFlight: Promise<readonly string[]> | null };
    pendingRemovals: Set<string>;
    loadRequested: boolean;
    writeChain: Promise<unknown>;
} = {
    sessionCustomerId: null,
    loadState: { done: false, inFlight: null },
    pendingRemovals: new Set<string>(),
    loadRequested: false,
    writeChain: Promise.resolve(),
};

/** GET the session's wishlist product IDs from the on-demand load route. */
async function fetchWishlistState(): Promise<readonly string[]> {
    const response = await fetch(resourceRoutes.wishlistState, { method: 'GET' });
    if (!response.ok) {
        throw new Error(`wishlist-state responded ${response.status}`);
    }
    const parsed = (await response.json()) as { productIds?: unknown };
    return Array.isArray(parsed.productIds)
        ? parsed.productIds.filter((id): id is string => typeof id === 'string')
        : [];
}

/**
 * The once-per-session read. No-ops without a session or once done; coalesces concurrent callers
 * onto one in-flight fetch; on failure clears the latch so a later intent can retry.
 */
async function runLoad(): Promise<void> {
    if (wishlistState.sessionCustomerId === null) return;
    if (wishlistState.loadState.done) return;
    if (!wishlistState.loadState.inFlight) {
        wishlistState.loadState.inFlight = fetchWishlistState();
    }
    const ownerAtFetch = wishlistState.sessionCustomerId;
    try {
        const productIds = await wishlistState.loadState.inFlight;
        // A shopper swap (or logout) during the fetch means this list belongs to the previous
        // session, which has already reset the store and its own pendingRemovals. Discard the
        // result rather than write one shopper's wishlist — or clear another's pending removals.
        if (wishlistState.sessionCustomerId !== ownerAtFetch) return;
        // Reconcile the server snapshot (as of when the GET fired) against mutations that raced
        // it: union in current store keys (don't drop a mid-fetch add), subtract mid-fetch
        // removals (don't resurrect a removed item).
        const merged = new Set<string>(productIds);
        for (const id of wishlistStore.getSnapshot().keys()) {
            merged.add(id);
        }
        for (const id of wishlistState.pendingRemovals) {
            merged.delete(id);
        }
        wishlistState.loadState = { done: true, inFlight: null };
        wishlistState.pendingRemovals = new Set();
        wishlistStore.replaceAll(merged);
    } catch {
        if (wishlistState.sessionCustomerId !== ownerAtFetch) return;
        wishlistState.loadState = { done: false, inFlight: null };
        wishlistState.pendingRemovals = new Set();
    }
}

/** Public trigger: record intent (for pre-session replay), then attempt the read. */
async function loadWishlist(): Promise<void> {
    wishlistState.loadRequested = true;
    await runLoad();
}

/**
 * Point the singleton at the session's `customerId`. On a change (including a shopper swap or
 * logout → `null`), evict the prior shopper's hearts and reset the load latch so the new
 * session re-reads from scratch — auth transitions are client-side (no document reload), so the
 * store would otherwise leak one shopper's wishlist into the next in the same tab.
 */
function setSessionCustomerId(customerId: string | null): void {
    if (customerId === wishlistState.sessionCustomerId) return;
    wishlistState.sessionCustomerId = customerId;
    wishlistState.loadState = { done: false, inFlight: null };
    wishlistState.pendingRemovals = new Set();
    wishlistStore.replaceAll(new Set());
    // Replay an at-load heart's loadWishlist() that fired before the session was known.
    if (customerId !== null && wishlistState.loadRequested) {
        void runLoad();
    }
}

// Serializes wishlist write round-trips (the POSTs to the action routes). Optimistic store
// updates still happen synchronously — the UI never waits — but the network calls run one at a
// time. Required because the FIRST add for a shopper with no wishlist provisions the list
// server-side via `getOrCreateWishlist`, a non-atomic read-then-create. Firing concurrent
// first-adds would let each request see "no list" and POST its own create, producing duplicate
// lists and silently stranding items on the losing one. Serializing guarantees the provisioning
// add settles before the next POST. The chain tail lives on `wishlistState.writeChain`.
function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const run = wishlistState.writeChain.then(task);
    // Swallow on the stored tail so a failed write never poisons later writes; the caller still
    // sees the real result/rejection via `run`.
    wishlistState.writeChain = run.catch(() => undefined);
    return run;
}

async function addToWishlist(productId: string): Promise<ApiResponse<unknown>> {
    if (!wishlistState.sessionCustomerId) {
        return { success: false, errors: ['Not signed in'] };
    }
    // Fast path: item is confirmed in the wishlist already. Surface as a typed signal so the
    // caller can show the right toast ("already in wishlist") instead of a duplicate server call.
    const existing = wishlistStore.get(productId);
    if (existing && !existing.pending) {
        return { success: true, data: { alreadyInWishlist: true } };
    }
    // An add for the same product is in flight from another button — refuse rather than show a
    // misleading "already in wishlist" toast for an unconfirmed insert.
    if (existing?.pending) {
        return { success: false, errors: ['Wishlist update in progress'] };
    }

    // Optimistic insert with pending flag; confirmed (or removed) on settle.
    wishlistStore.set(productId, { pending: true });
    pendingStore.increment();
    const ownerAtWrite = wishlistState.sessionCustomerId;
    try {
        const result = await enqueueWrite(() => postWishlistAction(resourceRoutes.wishlistAdd, productId));
        // A shopper swap (or logout) during the POST already reset the store for the new session;
        // skip the settle write so this shopper's add can't land in the next shopper's store.
        if (wishlistState.sessionCustomerId !== ownerAtWrite) {
            return result;
        }
        if (!result.success) {
            wishlistStore.delete(productId);
            return result;
        }
        wishlistStore.set(productId, { pending: false });
        return result;
    } finally {
        pendingStore.decrement();
    }
}

async function removeFromWishlist(productId: string): Promise<ApiResponse<unknown>> {
    if (!wishlistState.sessionCustomerId) {
        return { success: false, errors: ['Not signed in'] };
    }
    const item = wishlistStore.get(productId);
    if (!item) {
        return { success: false, errors: ['Not in wishlist'] };
    }
    // The optimistic add for this product hasn't confirmed yet. Refuse rather than race a remove
    // against an unconfirmed add.
    if (item.pending) {
        return { success: false, errors: ['Wishlist update in progress'] };
    }

    // Optimistic delete. If a lazy load GET is in flight, mark this a mid-fetch removal so
    // the load merge doesn't resurrect it from the now-stale snapshot.
    wishlistStore.delete(productId);
    if (wishlistState.loadState.inFlight) {
        wishlistState.pendingRemovals.add(productId);
    }
    pendingStore.increment();
    const ownerAtWrite = wishlistState.sessionCustomerId;
    try {
        const result = await enqueueWrite(() => postWishlistAction(resourceRoutes.wishlistRemove, productId));
        // A shopper swap (or logout) during the POST already reset the store for the new session;
        // skip the rollback so this shopper's item can't be restored into the next shopper's store.
        if (wishlistState.sessionCustomerId !== ownerAtWrite) {
            return result;
        }
        if (!result.success) {
            // Rollback to the prior (confirmed) entry and drop the mid-fetch removal marker so an
            // in-flight load doesn't subtract a still-saved item.
            wishlistStore.set(productId, item);
            wishlistState.pendingRemovals.delete(productId);
            return result;
        }
        return result;
    } finally {
        pendingStore.decrement();
    }
}

function toggleWishlist(productId: string): Promise<ApiResponse<unknown>> {
    return wishlistStore.has(productId) ? removeFromWishlist(productId) : addToWishlist(productId);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Subscribe to whether a specific `productId` is currently in the wishlist.
 *
 * Re-renders ONLY when the entry for that productId is added, removed, or its pending flag
 * changes (e.g. optimistic → confirmed on add success). A change to a different product's entry
 * will not trigger a re-render here. Use this for per-tile heart icons in product grids.
 */
export function useIsInWishlist(productId: string | undefined): boolean {
    const getEntry = useCallback(
        () => (productId ? wishlistStore.getSnapshot().get(productId) : undefined),
        [productId]
    );
    const entry = useSyncExternalStore(wishlistStore.subscribe, getEntry, getEntry);
    return entry !== undefined;
}

/**
 * Subscribe to the per-product wishlist entry, including its pending state.
 *
 * Returns `{ inWishlist, pending }` where `pending` is true while the optimistic add for that
 * specific product is awaiting server confirmation. Re-renders only when the entry identity changes.
 */
export function useWishlistEntry(productId: string | undefined): {
    inWishlist: boolean;
    pending: boolean;
} {
    const getEntry = useCallback(
        () => (productId ? wishlistStore.getSnapshot().get(productId) : undefined),
        [productId]
    );
    const entry = useSyncExternalStore(wishlistStore.subscribe, getEntry, getEntry);
    return useMemo(
        () => ({
            inWishlist: entry !== undefined,
            pending: entry?.pending ?? false,
        }),
        [entry]
    );
}

/**
 * Subscribe to the wishlist size. Re-renders only when the count changes — adds and removes both
 * flip identity, but optimistic → confirmed swaps do not change the count and so do not re-render
 * badge consumers.
 */
export function useWishlistCount(): number {
    const getSize = useCallback(() => wishlistStore.getSnapshot().size, []);
    return useSyncExternalStore(wishlistStore.subscribe, getSize, getSize);
}

/**
 * Subscribe to the full set of product IDs in the wishlist.
 *
 * Returns a referentially-stable `ReadonlySet<string>` that only changes identity when membership
 * changes. Use sparingly — most consumers should prefer {@link useIsInWishlist} or
 * {@link useWishlistCount} which avoid re-rendering on unrelated mutations.
 */
export function useWishlistIds(): ReadonlySet<string> {
    // Memoize the derived Set per snapshot identity so getSnapshot returns a stable reference
    // between unrelated subscribes (required by useSyncExternalStore).
    const cacheRef = useRef<{ map: ReadonlyMap<string, WishlistEntry>; ids: ReadonlySet<string> } | null>(null);
    const getIds = useCallback(() => {
        const map = wishlistStore.getSnapshot();
        if (cacheRef.current && cacheRef.current.map === map) {
            return cacheRef.current.ids;
        }
        const ids: ReadonlySet<string> = new Set(map.keys());
        cacheRef.current = { map, ids };
        return ids;
    }, []);
    return useSyncExternalStore(wishlistStore.subscribe, getIds, getIds);
}

/**
 * Read the wishlist mutation actions and the global pending flag.
 *
 * Components that need to mutate (heart buttons, "remove" links) should use this hook for
 * `add`/`remove`/`toggle`. To display per-product visual state (filled heart, in-flight spinner),
 * pair with {@link useIsInWishlist} or {@link useWishlistEntry} — those subscribe with topic
 * granularity and avoid re-rendering on every global pending flip.
 */
export function useWishlistActions(): WishlistActions {
    const isPending = useSyncExternalStore(
        pendingStore.subscribe,
        () => pendingStore.getSnapshot() > 0,
        () => false
    );
    return useMemo<WishlistActions>(
        () => ({ add: addToWishlist, remove: removeFromWishlist, toggle: toggleWishlist, isPending }),
        [isPending]
    );
}

/**
 * Returns the once-per-session lazy load trigger. The loader skips the per-page-view read
 * (see `action.wishlist-state`), so consumers call this on first product intent (tile
 * hover/focus/touch, PDP heart mount) to fill hearts. Idempotent and safe to call on every intent
 * — it no-ops once loaded and coalesces concurrent calls. No-ops without a session.
 */
export function useWishlistLoader(): () => Promise<void> {
    return loadWishlist;
}

/**
 * Bind the singleton store to the current session `customerId`. Called once from the `_app` shell
 * with `useAuth()?.customerId`.
 *
 * The shell's own `shouldRevalidate: false` only pins its loader data — it does not stop React
 * context from re-rendering the persistent shell. `customerId` changes solely on login/logout,
 * both of which redirect to a route that revalidates the root loader and refreshes `useAuth()`; the
 * shell re-runs this on that change and evicts the prior shopper's hearts. Plain browse navigation
 * never changes the id, so there is nothing to catch per-route.
 */
export function useWishlistSession(customerId: string | null): void {
    useEffect(() => {
        setSessionCustomerId(customerId);
    }, [customerId]);
}
