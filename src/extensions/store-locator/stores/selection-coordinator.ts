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
import type { FulfillmentMode } from '@/extensions/store-locator/lib/store-entry';
import { hasSettledStoreSelection, type StoreSelectionEffects } from '@/extensions/store-locator/lib/selection-effects';
import type { StoreApi, StoreLocatorStore, SelectedStoreInfo } from './store-locator-store';

export type SelectionResult = {
    success?: boolean;
    selectedStoreInfo?: SelectedStoreInfo | null;
    error?: string;
    code?: string;
    outcome?: 'unknown';
    effects?: StoreSelectionEffects;
};
type Operation = {
    id: number;
    generation: number;
    session: number;
    storeId: string | null;
    fulfillmentMode?: FulfillmentMode;
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
    const clearStaleFailure = () => {
        if (failed && failed.session !== store.getState().session) {
            if (failed.unknown) failed.owner = null;
            else failed = null;
        }
    };
    const begin = (
        storeId: string | null,
        generation: number,
        retry?: Operation,
        fulfillmentMode?: FulfillmentMode
    ): Operation | null => {
        invalidate();
        const state = store.getState();
        clearStaleFailure();
        if (retry && retry.generation !== state.generation) return null;
        if (pending || state.generation !== generation) return null;
        if (failed?.unknown && !retry) return null;
        const owner = retry ? retry.owner : state.isOpen ? state.chooserOwner : null;
        const formData = new FormData();
        formData.set('intent', retry?.unknown ? 'reconcile' : storeId === null ? 'clear' : 'set');
        if (storeId !== null && !retry?.unknown) formData.set('storeId', storeId);
        const mode = retry?.fulfillmentMode ?? fulfillmentMode;
        if (mode && !retry?.unknown) formData.set('fulfillmentMode', mode);
        pending = {
            id: ++sequence,
            generation,
            session: retry?.session ?? state.session,
            storeId,
            fulfillmentMode: mode,
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
            if (store.getState().selectionError === 'STORE_CHANGE_CONFIRMATION_REQUIRED') return null;
            invalidate();
            clearStaleFailure();
            if (failed && failed.generation !== generation) return null;
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
            // A profile-default failure must not leave the displayed selection behind the native
            // context whose prices have revalidated. Keep the persistence error and retry semantics.
            if (
                result?.success !== true &&
                result?.outcome !== 'unknown' &&
                hasSettledStoreSelection(result?.effects) &&
                canonical !== undefined
            ) {
                state.setSelectedStoreInfo(canonical);
                published = true;
                store.setState({
                    selectionSettlement: { from: state.selectionRevision, to: state.selectionRevision + 1 },
                });
            }
            if (operation.unknown && result?.success === true && canonical !== undefined) {
                state.setSelectedStoreInfo(canonical);
                published = true;
                const matches =
                    operation.storeId === null
                        ? canonical === null
                        : canonical?.id === operation.storeId &&
                          !!canonical.inventoryId &&
                          (!operation.fulfillmentMode || canonical.fulfillmentMode === operation.fulfillmentMode);
                if (!matches || operation.session !== state.session) {
                    store.setState({ selectionError: null });
                    return null;
                }
            }
            if (
                result?.success !== true ||
                (operation.storeId === null
                    ? canonical !== null
                    : canonical?.id !== operation.storeId ||
                      !canonical?.inventoryId ||
                      (operation.fulfillmentMode !== undefined &&
                          canonical.fulfillmentMode !== operation.fulfillmentMode))
            ) {
                if (operation.session !== state.session && result && result.outcome !== 'unknown' && !operation.unknown)
                    return null;
                failed = operation;
                failed.unknown =
                    operation.unknown ||
                    !result ||
                    result.outcome === 'unknown' ||
                    result.effects?.storeSelection === 'unknown' ||
                    result.effects?.nativeContext === 'unknown';
                if (operation.session !== state.session) failed.owner = null;
                store.setState({
                    selectionError: failed.unknown
                        ? 'outcome_unknown'
                        : (result?.code ?? result?.error ?? 'persistence_failed'),
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
