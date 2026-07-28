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
import { createContext, type PropsWithChildren, useContext, useRef, useSyncExternalStore, useCallback } from 'react';
import {
    type StoreLocatorStore,
    type StoreApi,
    type SelectedStoreInfo,
    createStoreLocatorStore,
} from '@/extensions/store-locator/stores/store-locator-store';

export type StoreLocatorStoreApi = StoreApi<StoreLocatorStore>;

const StoreLocatorContext = createContext<StoreLocatorStoreApi | undefined>(undefined);

/**
 * StoreLocatorProvider
 *
 * Provides a scoped store instance for the store locator feature. Hydrates the
 * initially selected store from the root loader's `selectedStoreInfo` (set by
 * middleware from the cookie).
 *
 * @param children - React subtree that needs access to store locator state
 * @param selectedStoreInfo - Initial selected store from the root loader (cookie-based)
 * @returns ReactElement
 */
const StoreLocatorProvider = ({
    children,
    selectedStoreInfo,
}: PropsWithChildren<{ selectedStoreInfo?: SelectedStoreInfo | null }>) => {
    const storeRef = useRef<StoreLocatorStoreApi | null>(null);
    if (storeRef.current === null) {
        storeRef.current = createStoreLocatorStore({
            selectedStoreInfo: selectedStoreInfo ?? null,
        });
    }

    return <StoreLocatorContext.Provider value={storeRef.current}>{children}</StoreLocatorContext.Provider>;
};

/**
 * Selector-based hook to read from the store locator state within the provider.
 * Uses {@link useSyncExternalStore} for optimal re-render behavior.
 * Throws if used outside the provider.
 *
 * @param selector - Function selecting a slice of `StoreLocatorStore`
 * @returns The selected slice value
 *
 * @example
 * const selectedStoreInfo = useStoreLocator((s) => s.selectedStoreInfo);
 * const selectedStoreId = selectedStoreInfo?.id;
 */
// oxlint-disable-next-line react-refresh/only-export-components
export const useStoreLocator = <T,>(selector: (store: StoreLocatorStore) => T): T => {
    const store = useContext(StoreLocatorContext);
    if (!store) {
        throw new Error('useStoreLocator must be used within StoreLocatorProvider');
    }

    const getSnapshot = useCallback(() => selector(store.getState()), [store, selector]);
    return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
};

export default StoreLocatorProvider;
