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
    type PropsWithChildren,
    useCallback,
    useEffect,
    useContext,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import type { ShopperBasketsV2 } from '@/scapi';
import type { BasketSnapshot } from '@/middlewares/basket.server';
import { useScapiFetcher } from '@/hooks/use-scapi-fetcher';
import { useScapiFetcherEffect } from '@/hooks/use-scapi-fetcher-effect';
import { parseBasketCookie } from '@/lib/basket/cookie';

// Cookie changes are not observable via an event; the store returns a noop unsubscribe and relies on existing
// re-render triggers (updater callbacks on mutations) to refresh. useSyncExternalStore guarantees SSR (null) and
// client (cookie) snapshots can diverge without a hydration-mismatch warning.
// eslint-disable-next-line @typescript-eslint/no-empty-function
const subscribeBasketCookie = () => () => {};
const getServerBasketCookieSnapshot = (): BasketSnapshot | null => null;

export type BasketProviderValue = {
    snapshot?: BasketSnapshot | null;
    current?: ShopperBasketsV2.schemas['Basket'];
    /** Whether the full basket has been hydrated */
    hydrated?: boolean;
    /** Error encountered during hydration, if any */
    error?: string[] | null;
};

const defaultCreateSnapshot = (basket: ShopperBasketsV2.schemas['Basket']): BasketSnapshot => ({
    basketId: basket.basketId ?? '',
    totalItemCount: (basket.productItems ?? []).reduce((sum, item) => sum + (item.quantity ?? 0), 0),
    uniqueProductCount: (basket.productItems ?? []).length,
    lastModified: basket.lastModified ?? '',
});

/*
 * Shared basket context that exposes snapshot data, current basket data, and hydration state.
 * `hydrated` indicates whether a full basket load has been attempted.
 * `error` holds any hydration errors from the last attempt.
 */
const BasketContext = createContext<BasketProviderValue>({
    snapshot: undefined,
    current: undefined,
    hydrated: undefined,
    error: undefined,
});

type BasketUpdater = {
    setBasket: (next: BasketProviderValue | ((prev: BasketProviderValue | undefined) => BasketProviderValue)) => void;
    /**
     * Imperatively load the full basket. Safe to call from anywhere — the provider owns the underlying SCAPI fetcher
     * and dedupes by tracking the in-flight basket id. While a load is in flight, repeat calls are no-ops; on success
     * the loaded data is written to context (so callers gating on `current` short-circuit naturally); on failure the
     * in-flight ref is cleared so a retry can proceed.
     */
    loadBasket: () => void;
};

const BasketUpdaterContext = createContext<BasketUpdater | undefined>(undefined);

// Mini-cart open/panel-mounted state lives in the standalone mini-cart store (`@/hooks/mini-cart-store`), not in a
// context here. Two reasons: `resource.basket-products`' `shouldRevalidate` needs a synchronous read from outside the
// React tree, which context cannot serve; and slice-scoped subscriptions keep toggling the sheet from re-rendering
// unrelated basket consumers (the isolation a separate context used to provide, now at slice granularity).

/**
 * Provider for basket data that's typically retrieved by the basket middleware.
 * Exposes a setter so any component can update the basket state after lazy loads.
 *
 * ## Two-source state model
 *
 * The effective snapshot exposed on the context is derived from two independent inputs, merged in a single `useMemo`:
 *
 * 1. **Props** (`snapshot`, `basket`) — typically passed down from a route loader that reads the basket middleware's
 *    request-scoped context. Set on SSR and on every loader revalidation.
 * 2. **`__sfdc_basket` cookie** — written by the basket middleware's response step (`Set-Cookie`) and by client-side
 *    mutations. Read on the client via `useSyncExternalStore`. Treated as ground truth post-hydration: it overrides
 *    the prop snapshot whenever present.
 *
 * The merge rule is `cookieSnapshot ?? state.snapshot`, i.e. cookie wins whenever the visitor has one.
 *
 * ## Why two sources — enabling cache-safe SSR
 *
 * This split is what allows a caller to decide, per request, how much per-visitor state to bake into the SSR HTML.
 * Two scenarios the model is designed to support:
 *
 * - **Shared HTML caching.** If a route emits SSR HTML that may be served from a shared cache (e.g. a guest segment
 *   at a CDN), the caller can pass `snapshot={null}` so no per-visitor count is serialized. After hydration, the
 *   client reads the visitor's own cookie and fills the counter in — the cached HTML stays visitor-agnostic, but
 *   the UI still reflects the current visitor's basket.
 * - **Per-user or uncached HTML.** If the caller knows the response is per-user (uncached, or cached under a per-user
 *   key), it can pass the middleware snapshot directly. The badge renders with the correct count during SSR, no
 *   post-hydration flash.
 *
 * The provider itself is indifferent to which mode the caller picks; the contract is simply "whatever you pass as
 * `snapshot` ends up in the SSR HTML, and the cookie will augment or correct it on the client."
 *
 * ## SSR → hydrate → augment lifecycle
 *
 * The mechanism that makes the above possible is a single `useSyncExternalStore` call with asymmetric snapshot
 * functions:
 *
 *   - `getServerSnapshot` returns `null` — the value baked into SSR HTML.
 *   - `getSnapshot` reads `document.cookie` — available only on the client.
 *
 * React's `useSyncExternalStore` contract explicitly permits the server and client snapshots to diverge without
 * emitting a hydration-mismatch warning. It is the **only** hook that offers this guarantee; reaching for plain
 * `useEffect` + `useState` for the same trick would either warn on hydration or flicker a tick after first paint.
 *
 * Flow when the caller opts out of baking the snapshot (e.g. shared SSR HTML):
 *
 * ```
 *  SSR                         Hydration                    Post-hydration
 *  ───                         ─────────                    ──────────────
 *  props.snapshot = null       1st client commit replays    getSnapshot re-reads
 *  cookieSnapshot = null       getServerSnapshot = null     cookie → fresh snapshot
 *  → effective = null          → identical DOM, no warning  → context re-renders,
 *  → HTML: "0 items"                                          badge shows the visitor's
 *                                                             own count
 * ```
 *
 * When the caller passes a real `snapshot`, the same flow applies but `effective` starts as the prop snapshot and is
 * then corrected (or confirmed) by the cookie after hydration.
 *
 * ## Load-bearing invariants
 *
 * These are prerequisites for the cache-safe SSR property above. Breaking any of them removes the guarantee that SSR
 * HTML is safe to share across visitors when the caller passes `snapshot={null}`:
 *
 * - `getServerBasketCookieSnapshot` must return `null`. Any non-null value would be baked into the SSR HTML and
 *   defeat the opt-out.
 * - The cookie-derived snapshot must take precedence over the prop snapshot in the context value
 *   (`cookieSnapshot ?? state.snapshot`). Reversing the order would let a stale or foreign prop snapshot win over
 *   the visitor's own cookie.
 * - The per-provider snapshot cache (`cacheRef` inside the component) is required for referential stability.
 *   `useSyncExternalStore` compares successive `getSnapshot` return values with `Object.is`; without the cache,
 *   every call would allocate a fresh object, fail the comparison, and drive an infinite render loop. The cache
 *   lives on a ref (not module scope) so concurrent SSR requests in the same process cannot observe each other's
 *   state — important even though `getServerSnapshot` always returns `null` today, because it keeps the code
 *   resilient to future changes (and to reviewer scrutiny).
 * - The `getSnapshot` callback passed to `useSyncExternalStore` must itself be stable across renders; a fresh
 *   function reference would force the store to re-subscribe and re-read on every render. The component wraps it
 *   in `useCallback` with empty deps so the ref-backed closure stays identity-stable.
 * - `subscribe` is a noop because cookies emit no events. Re-reads are triggered indirectly by other re-renders
 *   (mutations → `setBasket` → context change → descendants re-render → store snapshot re-read).
 *
 * @param props - Provider props.
 * @param props.children - Children to render within the provider.
 * @param props.basket - Full basket payload when available.
 * @param props.snapshot - Basket snapshot payload when available. Pass `null`
 *   to keep per-visitor state out of the SSR HTML (cache-safe mode); pass the
 *   middleware snapshot to render the counter during SSR (per-user mode).
 * @example
 * ```tsx
 * <BasketProvider snapshot={basketSnapshot}>
 *   <App />
 * </BasketProvider>
 * ```
 *
 * @example
 * ```tsx
 * <BasketProvider basket={basket} snapshot={basketSnapshot}>
 *   <Cart />
 * </BasketProvider>
 * ```
 */
const BasketProvider = (
    props: PropsWithChildren<{ basket?: ShopperBasketsV2.schemas['Basket']; snapshot?: BasketSnapshot | null }>
) => {
    const { basket, snapshot, children } = props;

    // Providers internal state management.
    const [state, setState] = useState<BasketProviderValue | undefined>(() => {
        if (props.basket === undefined && props.snapshot === undefined) {
            return undefined;
        }

        return {
            current: props.basket,
            snapshot: props.snapshot,
            hydrated: Boolean(props.basket),
            error: null,
        };
    });

    const setBasket = useCallback(
        (next: BasketProviderValue | ((prev: BasketProviderValue | undefined) => BasketProviderValue)) => {
            setState(next);
        },
        []
    );

    // Per-provider cache for the parsed cookie snapshot. useSyncExternalStore compares successive getSnapshot
    // return values via Object.is and would infinite-loop if a fresh object were produced on every read. Keeping
    // the cache on a ref (not module scope) guarantees isolation across concurrent SSR requests — the cache is
    // written to only inside getClientBasketCookieSnapshot, which is only ever invoked on the client today, but
    // ref-scoping keeps the code resilient to future changes.
    const cookieCacheRef = useRef<{ header?: string; snapshot: BasketSnapshot | null }>({ snapshot: null });

    // Stable identity across renders is required: useSyncExternalStore will re-subscribe on every render if the
    // subscribe or getSnapshot references change, which would defeat the Object.is cache.
    const getClientBasketCookieSnapshot = useCallback((): BasketSnapshot | null => {
        const header = document.cookie;
        const cache = cookieCacheRef.current;
        if (header !== cache.header) {
            cache.header = header;
            cache.snapshot = parseBasketCookie(header);
        }
        return cache.snapshot;
    }, []);

    // Post-hydration, prefer the cookie over the props snapshot so a stale server snapshot (e.g. per-user cached HTML
    // that no longer matches the latest basket) is corrected once __sfdc_basket is available.
    //
    // Cross-user leakage on guest-segment CDN hits is NOT prevented here — the `?? state?.snapshot` fallback would
    // still surface another guest's count when the current user has no cookie yet. That leak is prevented at the
    // source: root.tsx emits `null` for guests, so the SSR HTML carries no foreign snapshot to begin with.
    //
    // SSR and the initial hydration commit both return null (matching the server output); useSyncExternalStore
    // permits SSR/client divergence so a post-hydration cookie read does not warn as a hydration mismatch.
    const cookieSnapshot = useSyncExternalStore(
        subscribeBasketCookie,
        getClientBasketCookieSnapshot,
        getServerBasketCookieSnapshot
    );

    const ctxValue = useMemo(() => {
        const effectiveSnapshot = cookieSnapshot ?? state?.snapshot;
        return {
            snapshot: effectiveSnapshot,
            current: state?.current,
            hydrated: state?.hydrated,
            error: state?.error,
        };
    }, [state, cookieSnapshot]);

    // Update the internal state when the props change.
    useEffect(() => {
        if (basket === undefined && snapshot === undefined) {
            return;
        }
        setState((current) => ({
            current: basket === undefined ? current?.current : basket,
            snapshot: snapshot === undefined ? current?.snapshot : snapshot,
            hydrated: basket === undefined ? current?.hydrated : Boolean(basket),
            error: basket === undefined ? current?.error : null,
        }));
    }, [basket, snapshot]);

    // Provider-owned basket fetcher. Hosting it here (rather than in a hook called from arbitrary
    // descendants) means a single fetcher instance services every consumer — useBasket auto-loads,
    // usePrefetchCart imperatively loads — and the success/error → context wiring runs exactly
    // once per resolution. Without this centralization each consumer would mount its own fetcher
    // and effect; both would write the same payload (idempotent but wasteful).
    const basketIdForFetcher = ctxValue.snapshot?.basketId ?? '';
    const basketFetcher = useScapiFetcher('shopperBasketsV2', 'getBasket', {
        params: { path: { basketId: basketIdForFetcher } },
    });

    // useScapiFetcher returns a fresh object every render (spread + getters), and basketIdForFetcher
    // can change on prop sync. If loadBasket depended on either, its reference would flip every
    // render, propagate through BasketUpdaterContext, and break consumers that put
    // useBasketUpdater's callback in a useEffect dep array (cart-content, mini-cart, checkout) —
    // they'd loop on setBasket → re-render → new updater callback → effect re-fires.
    // Mirror the live values into refs so loadBasket can use empty deps and stay reference-stable.
    const basketFetcherRef = useRef(basketFetcher);
    basketFetcherRef.current = basketFetcher;
    const basketIdForFetcherRef = useRef(basketIdForFetcher);
    basketIdForFetcherRef.current = basketIdForFetcher;

    // Two refs together produce idempotent loadBasket():
    // - inFlightIdRef: id of the currently-pending request. Cleared in onSuccess/onError so a failure can be retried.
    // - loadedIdRef: id of the most recent successful load. Set in onSuccess so subsequent calls for the same id
    //   (e.g. repeat hover, focus restoration on sheet close) are no-ops.
    // A change in basket id (cookie update, guest→registered handoff) leaves both refs holding the old id; the next
    // load() call for the new id passes the `===` guard naturally and proceeds.
    const inFlightIdRef = useRef<string | null>(null);
    const loadedIdRef = useRef<string | null>(null);

    const loadBasket = useCallback(() => {
        const id = basketIdForFetcherRef.current;
        if (!id || inFlightIdRef.current === id || loadedIdRef.current === id) {
            return;
        }
        inFlightIdRef.current = id;
        void basketFetcherRef.current.load();
    }, []);

    useScapiFetcherEffect(basketFetcher, {
        onSuccess: (data) => {
            inFlightIdRef.current = null;
            // Drop the payload if its basketId no longer matches the active fetcher. Keying off the data's own
            // basketId (rather than inFlightIdRef) means any resolution that did not originate from loadBasket() — and
            // so leaves inFlightIdRef null — still writes to context, e.g. a registry-driven reload of this fetcher
            // after a global mutation (site/currency switch).
            if (!data || data.basketId !== basketIdForFetcherRef.current) {
                return;
            }
            loadedIdRef.current = data.basketId ?? null;
            // Functional update: write only the loaded fields. Do not clobber snapshot — it is
            // owned by props and the cookie store, both of which can be fresher than the value
            // captured when this callback was defined.
            setBasket((prev) => ({
                snapshot: prev?.snapshot,
                current: data,
                hydrated: true,
                error: null,
            }));
        },
        onError: (errors) => {
            const completedId = inFlightIdRef.current;
            inFlightIdRef.current = null;
            // Only surface errors that originated from an explicit loadBasket() call. A failure from any other
            // resolution (inFlightIdRef === null) — e.g. a registry-driven reload after a global mutation — must not
            // overwrite a previously-good basket with an error state; the caller that triggered it owns its own
            // error reporting.
            if (!completedId || completedId !== basketIdForFetcherRef.current) {
                return;
            }
            setBasket((prev) => ({
                snapshot: prev?.snapshot,
                current: prev?.current,
                hydrated: true,
                error: errors,
            }));
        },
    });

    const updaterValue = useMemo(() => ({ setBasket, loadBasket }), [setBasket, loadBasket]);

    return (
        <BasketUpdaterContext.Provider value={updaterValue}>
            <BasketContext.Provider value={ctxValue}>{children}</BasketContext.Provider>
        </BasketUpdaterContext.Provider>
    );
};

/**
 * Returns the imperative basket loader exposed by {@link BasketProvider}. Calling this triggers the provider-owned
 * fetcher (or no-ops if a fetch already happened or is in flight). The result is written to context by the provider —
 * observe it via {@link useBasket}.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useBasketLoader = (): (() => void) => {
    const updater = useContext(BasketUpdaterContext);
    return useCallback(() => {
        updater?.loadBasket();
    }, [updater]);
};

/**
 * Returns the current basket from context. By default, this hook is **read-only** — it doesn't trigger any SCAPI
 * request. Routes that need the basket on first paint are expected to either (a) load it in their server `loader` and
 * write it to context via `useBasketUpdater()` in a `useLayoutEffect` (cart, checkout), or (b) opt in to auto-load by
 * passing `{ autoLoad: true }`.
 *
 * Pass `{ autoLoad: true }` only on routes that genuinely need a client-side `GET /baskets/{id}` (e.g. PDP edit-mode
 * where the basket isn't loader-hydrated). When auto-load is enabled and `current` is missing but a `snapshot.basketId`
 * is available, the provider-owned fetcher is dispatched and the result is written back to context.
 *
 * This default keeps consumers from issuing redundant GETs — and keeps the SSR HTML cache-safe, because nothing fans
 * out an opportunistic basket fetch on hydration unless the consumer asks for it.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useBasket = (options?: { autoLoad?: boolean }): ShopperBasketsV2.schemas['Basket'] | undefined => {
    const autoLoad = options?.autoLoad ?? false;
    const { current, snapshot } = useContext(BasketContext);
    const loadBasket = useBasketLoader();
    const basketId = snapshot?.basketId;

    // basketId is in the dep array so a hand-off (e.g. guest → registered merge changes the id)
    // re-fires the load. loadBasket is reference-stable so it never spuriously re-triggers.
    useEffect(() => {
        if (autoLoad && !current && basketId) {
            loadBasket();
        }
    }, [autoLoad, current, basketId, loadBasket]);

    return current;
};

/**
 * Returns the current basket snapshot, if available.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useBasketSnapshot = (): BasketSnapshot | null | undefined => {
    return useContext(BasketContext).snapshot;
};

/**
 * Whether the full basket has been fetched at least once.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useBasketHydrated = (): boolean => {
    return useContext(BasketContext).hydrated ?? false;
};

/**
 * Returns a setter for updating the basket in context.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useBasketUpdater = (): ((basket?: ShopperBasketsV2.schemas['Basket']) => void) => {
    const updater = useContext(BasketUpdaterContext);
    return useCallback(
        (basket?: ShopperBasketsV2.schemas['Basket']) => {
            updater?.setBasket((prev) => {
                // Monotonic dedup within a single basketId. SCAPI's `lastModified` is an ISO 8601 UTC
                // timestamp, so string comparison orders revisions of the same basket correctly. Skip
                // when the incoming revision is the SAME as or OLDER than what's in context for the
                // SAME `basketId` — this prevents a late-arriving parent effect (rendering a pre-
                // prefill loader snapshot) from clobbering a newer basket that a child Suspense
                // boundary (e.g. `PrefillSync`) already published. A basketId change (guest →
                // registered handoff, destroy + recreate) always writes through, even if the new
                // basket's `lastModified` predates the previous one. The undefined-basket clear-and-
                // rehydrate path is unaffected — callers that want to wipe `current` still work.
                if (
                    basket?.lastModified &&
                    prev?.current?.lastModified &&
                    prev.hydrated &&
                    basket.basketId &&
                    prev.current.basketId === basket.basketId &&
                    basket.lastModified <= prev.current.lastModified
                ) {
                    return prev;
                }
                return {
                    current: basket,
                    hydrated: true,
                    snapshot: basket ? defaultCreateSnapshot(basket) : undefined,
                    error: null,
                };
            });
        },
        [updater]
    );
};

/**
 * Returns a callback that clears the basket context when invoked.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useBasketReset = (): (() => void) => {
    const updater = useContext(BasketUpdaterContext);
    return useCallback(() => {
        updater?.setBasket({
            current: undefined,
            snapshot: undefined,
            hydrated: false,
            error: null,
        });
    }, [updater]);
};

export default BasketProvider;
