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
import { useCallback, useEffect, useId } from 'react';
import { useLocation } from 'react-router';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useOptionalStoreLocatorApi } from '@/extensions/store-locator/providers/store-locator';
import { loadPendingAddActions } from '@/extensions/store-locator/lib/load-pending-add';
import type { PendingAddIntent } from '@/extensions/store-locator/lib/pending-add';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';

/** Snapshot an add at its origin, cancel on navigation/unmount, and resume only its explicit successful selection. */
export function useStoreEntryAdd() {
    const api = useOptionalStoreLocatorApi();
    const enabled = useConfig().features?.storeEntry?.enabled === true;
    const owner = useId();
    const location = useLocation();
    useEffect(() => () => api?.getState().cancelAdd(owner), [api, owner, location.pathname, location.search]);
    const intercept = useCallback(
        (
            intent: PendingAddIntent,
            resume: (intent: PendingAddIntent, selection: SelectedStoreInfo) => void,
            onLoadError?: () => void
        ) => {
            if (!enabled) return false;
            const state = api?.getState();
            if (state?.selectedStoreInfo?.fulfillmentMode && state.selectedStoreInfo.inventoryId) return false;
            if (
                !api ||
                !state ||
                state.pendingAdd ||
                state.pendingAddLoad ||
                state.selectionPending ||
                state.selectionError === 'outcome_unknown'
            )
                return true;
            const origin = document.activeElement;
            const load = { owner };
            const generation = state.generation;
            let snapshot: PendingAddIntent;
            try {
                snapshot = structuredClone(intent);
            } catch {
                onLoadError?.();
                return true;
            }
            api.setState({ pendingAddLoad: load });
            void loadPendingAddActions()
                .then(({ requestPendingAdd }) => {
                    if (api.getState().pendingAddLoad !== load) return;
                    api.setState({ pendingAddLoad: null });
                    if (api.getState().generation !== generation) return;
                    if (requestPendingAdd(api, owner, snapshot, resume) && origin instanceof HTMLElement)
                        api.setState({ returnFocusTarget: origin });
                })
                .catch(() => {
                    if (api.getState().pendingAddLoad !== load) return;
                    api.setState({ pendingAddLoad: null });
                    if (api.getState().generation === generation) onLoadError?.();
                });
            return true;
        },
        [api, enabled, owner]
    );
    return { enabled, intercept, getSelection: () => (enabled ? api?.getState().selectedStoreInfo : undefined) };
}
