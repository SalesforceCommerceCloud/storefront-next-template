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
 * Minimal external store: a current snapshot + a listener set. Consumers
 * subscribe via `useSyncExternalStore` (see `useDesignSelector`) and re-render
 * only when the slice they select changes. The write side stays unchanged: the
 * provider mirrors its existing combined `state` object into the store each
 * render (the "bridge"), so consumers can migrate to selectors one at a time
 * without rewriting the interaction layer.
 */
export interface DesignStore<TState> {
    /** Returns the current snapshot (identity changes only when `setState` sets a new object). */
    getSnapshot: () => TState;
    /** Subscribe to snapshot changes; returns an unsubscribe fn. */
    subscribe: (listener: () => void) => () => void;
    /** Replace the snapshot and notify listeners if the reference actually changed. */
    setState: (next: TState) => void;
}

export function createDesignStore<TState>(initial: TState): DesignStore<TState> {
    let snapshot = initial;
    const listeners = new Set<() => void>();

    return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        setState: (next) => {
            if (next === snapshot) {
                return;
            }
            snapshot = next;
            listeners.forEach((listener) => listener());
        },
    };
}
