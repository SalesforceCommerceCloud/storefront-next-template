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
    useContext,
    useLayoutEffect,
    useState,
    type ComponentType,
    type PropsWithChildren,
} from 'react';
import type { BasketProviderValue } from '@/providers/basket';

function createStore(initial: BasketProviderValue, onRuntimeChange: (runtime: ComponentType | null) => void) {
    let value = initial;
    let runtimeUsers = 0;
    const listeners = new Set<() => void>();
    return {
        getState: () => value,
        getServerState: () => initial,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        publish: (next: BasketProviderValue) => {
            if (next === value) return;
            value = next;
            for (const listener of listeners) listener();
        },
        retainRuntime: (runtime: ComponentType) => {
            if (runtimeUsers++ === 0) onRuntimeChange(runtime);
            return () => {
                if (--runtimeUsers === 0) onRuntimeChange(null);
            };
        },
    };
}
export type BasketItemStore = ReturnType<typeof createStore>;
const EMPTY: BasketProviderValue = Object.freeze({});
const emptyStore = createStore(EMPTY, () => undefined);
const Context = createContext<BasketItemStore>(emptyStore);

/** Publish committed, request-local basket state. Quantity code is supplied only by mounted controls. */
export function BasketItemStateProvider({ value, children }: PropsWithChildren<{ value: BasketProviderValue }>) {
    const [runtime, setRuntime] = useState<{ Component: ComponentType } | null>(null);
    const [store] = useState(() => createStore(value, (Component) => setRuntime(Component ? { Component } : null)));
    useLayoutEffect(() => store.publish(value), [store, value]);
    return (
        <Context.Provider value={store}>
            {runtime && <runtime.Component />}
            {children}
        </Context.Provider>
    );
}

/** Stable publication handle; selectors and mutation ownership live in the lazy quantity-control graph. */
// oxlint-disable-next-line react/only-export-components -- provider and its handle share a context
export function useBasketItemStore() {
    return useContext(Context);
}
