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
import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import { resourceRoutes } from '@/route-paths';
import type { ApiResponse } from '@/lib/scapi/types';
import type { WishlistInitialState } from '@/lib/wishlist/state';

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
 * Inspired by `createSubCategoryStore` in `navigation-menu/context.ts`.
 *
 * Subscribers are only invoked when the underlying map identity changes, and
 * per-id consumers (via `useIsInWishlist`) only re-render when *their* entry
 * changes identity — so a heart icon for product A never re-renders when
 * product B is added or removed.
 */
export type WishlistStore = ReturnType<typeof createWishlistStore>;

function createWishlistStore(initialProductIds: ReadonlySet<string>) {
    const seed = new Map<string, WishlistEntry>();
    for (const id of initialProductIds) {
        seed.set(id, { pending: false });
    }
    let data: ReadonlyMap<string, WishlistEntry> = seed;
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
        size(this: void): number {
            return data.size;
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
        /** Bulk replace. Used when async hydration of initialState resolves. */
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

/**
 * Actions exposed to mutating components. The reference identity of `add`,
 * `remove`, and `toggle` is stable for the provider's lifetime — they read the
 * current `customerId` from a ref at call time, so they don't change identity
 * when it hydrates. Don't key an effect on these references expecting it to
 * re-run after hydration; subscribe to the store instead.
 * `isPending` is a global "any mutation in flight" flag — components that need
 * per-product pending state should derive it via `useWishlistEntry`.
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

const WishlistStoreContext = createContext<WishlistStore | null>(null);
const WishlistActionsContext = createContext<WishlistActions | null>(null);

/**
 * Internal helper — looks up the store from context and throws if used outside
 * `<WishlistProvider>` so missing providers surface as clear dev-time errors
 * rather than silent empty UI in production.
 */
function useWishlistStore(): WishlistStore {
    const store = useContext(WishlistStoreContext);
    if (!store) {
        throw new Error('Wishlist hooks must be used inside <WishlistProvider>');
    }
    return store;
}

/**
 * Subscribe to whether a specific `productId` is currently in the wishlist.
 *
 * Re-renders ONLY when the entry for that productId is added, removed, or its
 * pending flag changes (e.g. optimistic → confirmed on add success). A change to
 * a different product's entry will not trigger a re-render here. Use this for
 * per-tile heart icons in product grids.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useIsInWishlist(productId: string | undefined): boolean {
    const store = useWishlistStore();
    const subscribe = store.subscribe;
    const getEntry = useCallback(
        () => (productId ? store.getSnapshot().get(productId) : undefined),
        [store, productId]
    );
    const entry = useSyncExternalStore(subscribe, getEntry, getEntry);
    return entry !== undefined;
}

/**
 * Subscribe to the per-product wishlist entry, including its pending state.
 *
 * Returns `{ inWishlist, pending }` where `pending` is true while the
 * optimistic add for that specific product is awaiting server confirmation.
 * Re-renders only when the entry identity changes.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useWishlistEntry(productId: string | undefined): {
    inWishlist: boolean;
    pending: boolean;
} {
    const store = useWishlistStore();
    const subscribe = store.subscribe;
    const getEntry = useCallback(
        () => (productId ? store.getSnapshot().get(productId) : undefined),
        [store, productId]
    );
    const entry = useSyncExternalStore(subscribe, getEntry, getEntry);
    return useMemo(
        () => ({
            inWishlist: entry !== undefined,
            pending: entry?.pending ?? false,
        }),
        [entry]
    );
}

/**
 * Subscribe to the wishlist size. Re-renders only when the count changes — adds
 * and removes both flip identity, but optimistic → confirmed swaps do not change
 * the count and so do not re-render badge consumers.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useWishlistCount(): number {
    const store = useWishlistStore();
    const subscribe = store.subscribe;
    const getSize = useCallback(() => store.getSnapshot().size, [store]);
    return useSyncExternalStore(subscribe, getSize, getSize);
}

/**
 * Subscribe to the full set of product IDs in the wishlist.
 *
 * Returns a referentially-stable `ReadonlySet<string>` that only changes
 * identity when membership changes. Use sparingly — most consumers should
 * prefer {@link useIsInWishlist} or {@link useWishlistCount} which avoid
 * re-rendering on unrelated mutations.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useWishlistIds(): ReadonlySet<string> {
    const store = useWishlistStore();
    const subscribe = store.subscribe;
    // Memoize the derived Set per snapshot identity so getSnapshot returns a
    // stable reference between unrelated subscribes (required by useSyncExternalStore).
    const cacheRef = useRef<{ map: ReadonlyMap<string, WishlistEntry>; ids: ReadonlySet<string> } | null>(null);
    const getIds = useCallback(() => {
        const map = store.getSnapshot();
        if (cacheRef.current && cacheRef.current.map === map) {
            return cacheRef.current.ids;
        }
        const ids: ReadonlySet<string> = new Set(map.keys());
        cacheRef.current = { map, ids };
        return ids;
    }, [store]);
    return useSyncExternalStore(subscribe, getIds, getIds);
}

/**
 * Read the wishlist mutation actions and the global pending flag.
 *
 * Components that need to mutate (heart buttons, "remove" links) should use
 * this hook for `add`/`remove`/`toggle`. To display per-product visual state
 * (filled heart, in-flight spinner), pair with {@link useIsInWishlist} or
 * {@link useWishlistEntry} — those subscribe with topic granularity and avoid
 * re-rendering on every global pending flip.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useWishlistActions(): WishlistActions {
    const ctx = useContext(WishlistActionsContext);
    if (!ctx) {
        throw new Error('useWishlistActions must be used inside <WishlistProvider>');
    }
    return ctx;
}

/**
 * Route-local wishlist provider. Mount once per route that renders wishlist UI
 * (PLP, PDP, search, cart, home recommenders, account overview); routes without
 * wishlist UI shouldn't mount it and pay no SCAPI hydration cost.
 *
 * Holds the set of product IDs in the wishlist in a referentially-stable external
 * store; consumers subscribe with topic granularity via {@link useIsInWishlist},
 * {@link useWishlistCount}, etc.
 *
 * `add`/`remove` flip optimistic state synchronously, then POST to the
 * `/action/wishlist-add` / `/action/wishlist-remove` server actions (keyed by
 * `productId`) and roll back on failure. All SCAPI work — list get-or-create, item
 * lookup, add/delete — happens server-side; the client issues no direct SCAPI calls.
 */
export function WishlistProvider({
    initialState,
    children,
}: {
    /**
     * Wishlist initial state. Pass a `Promise` from a route loader to defer the
     * SCAPI hydration off the SSR critical path — the provider mounts immediately
     * with empty state, then hydrates the store + customerId in a `useEffect` once
     * the Promise resolves. Pass a sync value when the loader already awaited it
     * (e.g. tests, or a route that doesn't mind blocking).
     *
     * Hearts render unfilled until hydration completes — uncritical for product
     * tiles (the `<DeferredWishlistButton>` placeholder is gated on hover anyway)
     * and acceptable for eagerly-mounted hearts (the round-trip is fast enough that
     * the flash is rarely user-visible).
     */
    initialState: Promise<WishlistInitialState> | WishlistInitialState;
    children: ReactNode;
}) {
    // Single store instance per provider mount. Initial entries from the sync
    // path; for the Promise path we replaceAll() once the Promise resolves so
    // the store reference itself stays stable for the provider's lifetime.
    const [store] = useState(() =>
        createWishlistStore(initialState instanceof Promise ? new Set<string>() : initialState.productIds)
    );

    // customerId lives on a ref, not in state. It's only read at click time by
    // add/remove as the signed-in gate — never during render. Holding it in
    // `useState` would re-render the whole provider when async hydration flips
    // null → real, which rebuilds the actions context value and re-renders every
    // consumer of the page subtree at once (a whole-page hydration flicker). The
    // store fill below reaches only the topic subscribers whose entries changed.
    const customerIdRef = useRef<string | null>(initialState instanceof Promise ? null : initialState.customerId);

    // When initialState is a Promise, hydrate post-mount. `useEffect` doesn't run
    // on the server, so the SSR pass renders with the empty state — the wishlist
    // SCAPI call doesn't block the loader response. The promise the route passed
    // is already in flight (loader started it); we just await its resolution here.
    useEffect(() => {
        if (!(initialState instanceof Promise)) return;
        let cancelled = false;
        void initialState.then(
            (state) => {
                if (cancelled) return;
                customerIdRef.current = state.customerId;
                store.replaceAll(state.productIds);
            },
            () => {
                // SCAPI failed; keep the empty state so hearts stay unfilled rather than crash.
            }
        );
        return () => {
            cancelled = true;
        };
    }, [initialState, store]);

    // Count of in-flight mutations backs the global `isPending` flag. Flipping it
    // re-renders the provider and the actions-context consumers (heart buttons) so
    // they can show a spinner / disable — matching the prior `useScapiFetchClient`
    // behavior. Per-product pending state is isolated in the store (see PENDING flag).
    const [inFlight, setInFlight] = useState(0);
    const isPending = inFlight > 0;

    // Serializes wishlist write round-trips (the POSTs to the action routes). Optimistic
    // store updates still happen synchronously — the UI never waits — but the network calls
    // run one at a time. This is required because the FIRST add for a shopper with no
    // wishlist provisions the list server-side via `getOrCreateWishlist`, a non-atomic
    // read-then-create. Firing concurrent first-adds would let each request see "no list"
    // and POST its own create, producing duplicate lists and silently stranding items on the
    // losing one. Serializing guarantees the provisioning add settles before the next POST,
    // so every later write finds the list already created. (Registered/guest sessions that
    // hydrated with items already have a list, so their writes just await an already-settled
    // chain and effectively run back-to-back with no added latency.)
    const writeChainRef = useRef<Promise<unknown>>(Promise.resolve());
    const enqueueWrite = useCallback(function enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = writeChainRef.current.then(task);
        // Swallow on the stored tail so a failed write never poisons later writes; the
        // caller still sees the real result/rejection via `run`.
        writeChainRef.current = run.catch(() => undefined);
        return run;
    }, []);

    const add = useCallback(
        async (productId: string): Promise<ApiResponse<unknown>> => {
            const customerId = customerIdRef.current;
            if (!customerId) {
                return { success: false, errors: ['Not signed in'] };
            }

            // Fast path: item is confirmed in the wishlist already. Surface as a typed
            // signal so the caller can show the right toast ("already in wishlist")
            // instead of triggering a duplicate server call.
            const existing = store.get(productId);
            if (existing && !existing.pending) {
                return { success: true, data: { alreadyInWishlist: true } };
            }
            // An add for the same product is in flight from another button — refuse rather
            // than show a misleading "already in wishlist" toast for an unconfirmed insert.
            if (existing?.pending) {
                return { success: false, errors: ['Wishlist update in progress'] };
            }

            // Optimistic insert with pending flag; confirmed (or removed) on settle.
            store.set(productId, { pending: true });
            setInFlight((n) => n + 1);
            try {
                // Serialize the POST behind any in-flight write so a first-add provisions the
                // list before the next request runs (see `enqueueWrite`).
                const result = await enqueueWrite(() => postWishlistAction(resourceRoutes.wishlistAdd, productId));
                if (!result.success) {
                    store.delete(productId);
                    return result;
                }
                store.set(productId, { pending: false });
                return result;
            } finally {
                setInFlight((n) => n - 1);
            }
        },
        [store, enqueueWrite]
    );

    const remove = useCallback(
        async (productId: string): Promise<ApiResponse<unknown>> => {
            const customerId = customerIdRef.current;
            if (!customerId) {
                return { success: false, errors: ['Not signed in'] };
            }
            const item = store.get(productId);
            if (!item) {
                return { success: false, errors: ['Not in wishlist'] };
            }
            // The optimistic add for this product hasn't confirmed yet. Refuse rather
            // than race a remove against an unconfirmed add.
            if (item.pending) {
                return { success: false, errors: ['Wishlist update in progress'] };
            }

            // Optimistic delete.
            store.delete(productId);
            setInFlight((n) => n + 1);
            try {
                // Serialize behind any in-flight write so a remove can't race the create/add
                // it depends on (see `enqueueWrite`).
                const result = await enqueueWrite(() => postWishlistAction(resourceRoutes.wishlistRemove, productId));
                if (!result.success) {
                    // Rollback to the prior (confirmed) entry.
                    store.set(productId, item);
                }
                return result;
            } finally {
                setInFlight((n) => n - 1);
            }
        },
        [store, enqueueWrite]
    );

    const toggle = useCallback(
        (productId: string) => (store.has(productId) ? remove(productId) : add(productId)),
        [store, add, remove]
    );

    const actions = useMemo<WishlistActions>(
        () => ({ add, remove, toggle, isPending }),
        [add, remove, toggle, isPending]
    );

    return (
        <WishlistStoreContext.Provider value={store}>
            <WishlistActionsContext.Provider value={actions}>{children}</WishlistActionsContext.Provider>
        </WishlistStoreContext.Provider>
    );
}
