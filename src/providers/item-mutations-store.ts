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
import type { FetcherWithComponents } from 'react-router';
import type { BasketItemStore } from '@/providers/basket-item-state';

export type Submit = FetcherWithComponents<unknown>['submit'];
export type Snapshot = { state: FetcherWithComponents<unknown>['state']; data: unknown };
export type Entry = {
    key: string;
    refs: number;
    snapshot: Snapshot;
    submit?: Submit;
    queued: Array<{ args: Parameters<Submit>; resolve: () => void; reject: (error: unknown) => void }>;
};
export const IDLE: Snapshot = Object.freeze({ state: 'idle', data: undefined });
const NO_ENTRIES: Entry[] = [];
function createStore(initialScope?: string) {
    let scope = initialScope;
    const entries = new Map<string, Entry>();
    let handles = NO_ENTRIES;
    let pending = new Set<string>();
    const listeners = new Set<() => void>();
    const handleListeners = new Set<() => void>();
    const notify = () => {
        for (const listener of listeners) listener();
    };
    const publishHandles = () => {
        handles = [...entries.values()];
        for (const listener of handleListeners) listener();
    };
    const ensure = (key: string) => {
        let entry = entries.get(key);
        if (!entry) {
            entry = { key, refs: 0, snapshot: IDLE, queued: [] };
            entries.set(key, entry);
            publishHandles();
        }
        return entry;
    };
    return {
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        subscribeHandles: (listener: () => void) => {
            handleListeners.add(listener);
            return () => {
                handleListeners.delete(listener);
            };
        },
        getHandles: () => handles,
        getServerHandles: () => NO_ENTRIES,
        read: (key: string | undefined) => (key ? (entries.get(key)?.snapshot ?? IDLE) : IDLE),
        isPending: (itemId: string | undefined) =>
            Boolean(itemId && [...pending].some((key) => key.startsWith(`${itemId}-`))),
        setScope: (next: string | undefined) => {
            if (scope === next) return;
            scope = next;
            for (const entry of entries.values()) for (const call of entry.queued) call.resolve();
            entries.clear();
            pending = new Set();
            publishHandles();
            notify();
        },
        retain: (key: string) => {
            const entry = ensure(key);
            entry.refs++;
            return () => {
                if (entries.get(key) !== entry || --entry.refs > 0) return;
                entries.delete(key);
                for (const call of entry.queued) call.resolve();
                publishHandles();
                notify();
            };
        },
        register: (entry: Entry, submit: Submit) => {
            if (entries.get(entry.key) !== entry) return;
            entry.submit = submit;
            for (const call of entry.queued.splice(0)) void submit(...call.args).then(call.resolve, call.reject);
        },
        publish: (entry: Entry, snapshot: Snapshot) => {
            if (
                entries.get(entry.key) !== entry ||
                (entry.snapshot.state === snapshot.state && entry.snapshot.data === snapshot.data)
            )
                return;
            entry.snapshot = snapshot;
            notify();
        },
        publishPending: (keys: string[]) => {
            if (keys.length === pending.size && keys.every((key) => pending.has(key))) return;
            pending = new Set(keys);
            notify();
        },
        submit: (key: string, ...args: Parameters<Submit>): Promise<void> => {
            const entry = ensure(key);
            return entry.submit
                ? entry.submit(...args)
                : new Promise((resolve, reject) => entry.queued.push({ args, resolve, reject }));
        },
    };
}
export type Store = ReturnType<typeof createStore>;
// Keys are per-provider handles, so SSR requests and independent storefront roots never share data.
const stores = new WeakMap<BasketItemStore, Store>();
const scopeOf = (basket: ReturnType<BasketItemStore['getState']>) =>
    basket.snapshot?.basketId ?? basket.current?.basketId;
export function getStore(basket: BasketItemStore) {
    let store = stores.get(basket);
    if (!store) {
        const created = createStore(scopeOf(basket.getState()));
        stores.set(basket, created);
        // This subscription has the same lifetime as the provider-local publication handle. Clear old
        // request state before its quantity subscribers observe a new basket identity.
        basket.subscribe(() => created.setScope(scopeOf(basket.getState())));
        store = created;
    }
    return store;
}
