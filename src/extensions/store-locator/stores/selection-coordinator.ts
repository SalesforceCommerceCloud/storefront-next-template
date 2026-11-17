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
import type { StoreApi, StoreLocatorStore, SelectedStoreInfo } from './store-locator-store';

export type SelectionResult = {
    success?: boolean;
    selectedStoreInfo?: SelectedStoreInfo | null;
    error?: string;
    outcome?: 'unknown';
};
type Operation = {
    id: number;
    generation: number;
    session: number;
    storeId: string | null;
    owner: string | null;
    formData: FormData;
    unknown: boolean;
};

/** One serialized operation per provider; modal and initiating subtree lifetimes are irrelevant. */
export function createSelectionCoordinator(store: StoreApi<StoreLocatorStore>) {
    let sequence = 0;
    let pending: Operation | null = null;
    let failed: Operation | null = null;
    const invalidate = () => {
        const generation = store.getState().generation;
        if (pending?.generation !== generation) pending = null;
        if (failed?.generation !== generation) failed = null;
    };
    const begin = (storeId: string | null, generation: number, retry?: Operation): Operation | null => {
        invalidate();
        const state = store.getState();
        if (failed && failed.session !== state.session) {
            if (failed.unknown) failed.owner = null;
            else failed = null;
        }
        if (retry && retry.generation !== state.generation) return null;
        if (pending || state.generation !== generation) return null;
        if (failed?.unknown && !retry) return null;
        const owner = retry ? retry.owner : state.isOpen ? state.chooserOwner : null;
        const formData = new FormData();
        formData.set('intent', retry?.unknown ? 'reconcile' : storeId === null ? 'clear' : 'set');
        if (storeId !== null && !retry?.unknown) formData.set('storeId', storeId);
        pending = {
            id: ++sequence,
            generation,
            session: retry?.session ?? state.session,
            storeId,
            owner,
            formData,
            unknown: retry?.unknown ?? false,
        };
        failed = null;
        store.setState({
            selectionPending: true,
            selectionIntent: retry?.unknown ? 'reconcile' : storeId === null ? 'clear' : 'set',
            selectionError: null,
            confirmedSelection: null,
            selectionRevision: state.selectionRevision + 1,
        });
        return pending;
    };
    return {
        begin,
        invalidate,
        retry: (generation: number) => {
            if (failed && failed.session !== store.getState().session && !failed.unknown) failed = null;
            if (failed && failed.generation !== generation) failed = null;
            if (failed?.session !== store.getState().session && failed) failed.owner = null;
            return failed ? begin(failed.storeId, generation, failed) : null;
        },
        complete: (id: number, result?: SelectionResult) => {
            invalidate();
            if (!pending || pending.id !== id) return null;
            const operation = pending;
            pending = null;
            const state = store.getState();
            if (operation.generation !== state.generation) return null;
            // Reads introduced while the write was pending must not publish after settlement.
            store.setState({ selectionPending: false, selectionRevision: state.selectionRevision + 1 });
            const canonical = result?.selectedStoreInfo;
            let published = false;
            if (operation.unknown && result?.success === true && canonical !== undefined) {
                state.setSelectedStoreInfo(canonical);
                published = true;
                const matches =
                    operation.storeId === null
                        ? canonical === null
                        : canonical?.id === operation.storeId && !!canonical.inventoryId;
                if (!matches || operation.session !== state.session) {
                    store.setState({ selectionError: null });
                    return null;
                }
            }
            if (
                result?.success !== true ||
                (operation.storeId === null
                    ? canonical !== null
                    : canonical?.id !== operation.storeId || !canonical?.inventoryId)
            ) {
                if (operation.session !== state.session && result && result.outcome !== 'unknown' && !operation.unknown)
                    return null;
                failed = operation;
                failed.unknown = operation.unknown || !result || result.outcome === 'unknown';
                if (operation.session !== state.session) failed.owner = null;
                store.setState({
                    selectionError: failed.unknown ? 'outcome_unknown' : (result?.error ?? 'persistence_failed'),
                });
                return null;
            }
            if (!published) state.setSelectedStoreInfo(canonical ?? null);
            // Revalidated sources commit before settlement while the write is still pending; record the
            // window so store-matched reads from it stay usable. Earlier or later revisions stay stale.
            store.setState({
                selectionSettlement: { from: state.selectionRevision, to: state.selectionRevision + 1 },
            });
            if (operation.session === state.session) {
                // Confirmation closes and publishes the notification together. Manual close clears
                // chooser ownership, so a late preference result cannot trigger a caller action.
                store.setState({
                    chooserStoreInfo: canonical ?? null,
                    ...(canonical
                        ? {
                              isOpen: false,
                              chooserOwner: null,
                              confirmedSelection:
                                  state.isOpen && operation.owner && state.chooserOwner === operation.owner
                                      ? {
                                            owner: operation.owner,
                                            session: operation.session,
                                            generation: operation.generation,
                                            store: canonical,
                                        }
                                      : null,
                          }
                        : {}),
                });
            }
            return null;
        },
    };
}
