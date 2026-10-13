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

/**
 * A tiny module-scoped registry of cart mutations that were still in flight when their owning line item
 * unmounted — the shopper closed the mini-cart drawer in the same beat as a quantity change or a remove.
 *
 * React Router keeps a settled fetcher's data alive only while some mounted `useFetcher({key})` still
 * references that key, and purges it from `useFetchers()` the moment its last owner unmounts. When the
 * mini-cart closes mid-mutation, the line item that submitted the request unmounts before the response
 * settles, so its own response effect — the one that fires the "Quantity updated" / remove toast — never
 * runs, and the toast is lost. This registry is how the unmounting owner hands the request off: it records
 * the fetcher key and what kind of toast to show, and the root-mounted `CartMutationToastWatcher` (a sibling
 * of `BasketCookieReconciler`) mounts a `useFetcher({key})` per entry to keep the fetcher alive, read the
 * settled data, fire the toast exactly once, then unregister.
 *
 * Same idiom as {@link ./mini-cart-store}: a leaf module (imports only `react`) exposing plain writers for
 * callers outside the React tree plus a `useSyncExternalStore` selector for the reactive reader. Basket sync
 * on success is NOT this module's concern — `BasketCookieReconciler` already advances the in-memory basket
 * off the `__sfdc_basket` cookie for any successful mutation; this registry carries only the toast.
 */
import { useSyncExternalStore } from 'react';

/** Which toast a handed-off mutation should fire when it settles. */
export type CartMutationKind = 'quantity-update' | 'remove';

/** A mutation handed off to the root watcher, addressed by its React Router fetcher key. */
export interface PendingCartMutation {
    /** The exact `fetcher.key` the owning hook used (e.g. `${itemId}-mini-cart-item`). Never reconstructed. */
    key: string;
    /** Which resolver the watcher applies to the settled response. */
    kind: CartMutationKind;
}

const pending = new Map<string, CartMutationKind>();

// Stable snapshot for useSyncExternalStore: rebuilt only on a real change so getSnapshot returns the same
// reference across renders that don't mutate the registry (Object.is comparison would otherwise loop).
const EMPTY: PendingCartMutation[] = [];
let snapshot: PendingCartMutation[] = EMPTY;

const listeners = new Set<() => void>();

const rebuildSnapshot = (): void => {
    snapshot = pending.size === 0 ? EMPTY : Array.from(pending, ([key, kind]) => ({ key, kind }));
};

const notify = (): void => {
    for (const listener of listeners) {
        listener();
    }
};

/**
 * Records a mutation whose owning line item is unmounting before the request settled, so the root watcher
 * can still fire its toast. Callable from anywhere — a component's unmount cleanup runs outside render.
 * An empty key is ignored (a fetcher with no stable key can't be re-observed), and a repeat of the same
 * (key, kind) is idempotent so a double unmount can't wake subscribers twice.
 */
export const registerPendingCartMutation = (key: string, kind: CartMutationKind): void => {
    if (!key || pending.get(key) === kind) return;
    pending.set(key, kind);
    rebuildSnapshot();
    notify();
};

/** Drops a handed-off mutation once its toast has fired. A no-op (no notify) for an unknown key. */
export const unregisterPendingCartMutation = (key: string): void => {
    if (!pending.delete(key)) return;
    rebuildSnapshot();
    notify();
};

const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const getSnapshot = (): PendingCartMutation[] => snapshot;

// The registry only ever mutates via client-side unmount cleanups, never during server render, so the
// server snapshot is always empty and the watcher renders nothing on the server.
const getServerSnapshot = (): PendingCartMutation[] => EMPTY;

/** Reactive read of the pending handed-off mutations. Re-renders the caller only when the set changes. */
export function useMiniCartPendingMutations(): PendingCartMutation[] {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
