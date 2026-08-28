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
import React from 'react';
import { DesignStoreContext } from '../context/DesignStoreContext';
import type { DesignState } from '../context/DesignStateContext';

/**
 * Subscribe to a slice of design state; re-render only when that slice changes
 * per the equality function (default `Object.is`).
 *
 * The `useSyncExternalStore` selector overload is intentionally not used because
 * it re-runs the selector on every store change and compares results with
 * `Object.is` only — a selector that derives a NEW object (e.g. a merged props
 * bag) would loop forever. Instead we cache the last selected value in a ref and
 * only publish a new value when `isEqual` reports a real change, so derived
 * objects are safe.
 */
export function useDesignSelector<TSelected>(
    selector: (state: DesignState) => TSelected,
    isEqual: (a: TSelected, b: TSelected) => boolean = Object.is
): TSelected {
    const store = React.useContext(DesignStoreContext);

    if (!store) {
        throw new Error('useDesignSelector must be used within a DesignStateProvider');
    }

    // Keep the latest selector/isEqual without resubscribing.
    const selectorRef = React.useRef(selector);
    const isEqualRef = React.useRef(isEqual);
    selectorRef.current = selector;
    isEqualRef.current = isEqual;

    // Cache the last selected value so getSelectedSnapshot returns a stable
    // reference until isEqual reports a change — this is what prevents the
    // derived-object infinite loop.
    const lastSelectedRef = React.useRef<{ value: TSelected } | null>(null);

    const getSelectedSnapshot = React.useCallback(() => {
        const selected = selectorRef.current(store.getSnapshot());
        const cached = lastSelectedRef.current;
        if (cached && isEqualRef.current(cached.value, selected)) {
            return cached.value;
        }
        lastSelectedRef.current = { value: selected };
        return selected;
    }, [store]);

    return React.useSyncExternalStore(store.subscribe, getSelectedSnapshot, getSelectedSnapshot);
}
