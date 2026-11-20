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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { StoreApi, StoreLocatorStore } from '@/extensions/store-locator/stores/store-locator-store';

export const StoreLocatorContext = createContext<StoreApi<StoreLocatorStore> | undefined>(undefined);

const subscribeInactive = () => () => {
    /* No selection provider to unsubscribe. */
};
const notPending = () => false;

/** Financial resource leaves must not publish retained data during an unsettled store change. */
export function useStoreQualificationPending(enabled: boolean): boolean {
    const store = useContext(StoreLocatorContext);
    const getSnapshot = useCallback(
        () => !!store && (store.getState().selectionPending || store.getState().selectionError === 'outcome_unknown'),
        [store]
    );
    return useSyncExternalStore(
        enabled && store ? store.subscribe : subscribeInactive,
        enabled ? getSnapshot : notPending,
        notPending
    );
}
