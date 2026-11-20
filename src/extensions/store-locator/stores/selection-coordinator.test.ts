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
import { describe, expect, it } from 'vitest';
import { createStoreLocatorStore } from './store-locator-store';
import { createSelectionCoordinator } from './selection-coordinator';

const confirmed = { id: 'old', name: 'old', inventoryId: 'old-inventory' };
const canonical = { id: 'new', name: 'Canonical', inventoryId: 'canonical-inventory' };
const chooser = { owner: 'caller' };

describe('durable store selection', () => {
    it.each([
        undefined,
        { success: false },
        { success: true, selectedStoreInfo: canonical },
    ])('invalidates pending root reads once on matching settlement %j', (result) => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        const pendingRevision = store.getState().selectionRevision;
        coordinator.complete(operation.id, result);
        expect(store.getState().selectionRevision).toBe(pendingRevision + 1);
        coordinator.complete(operation.id, result);
        expect(store.getState().selectionRevision).toBe(pendingRevision + 1);
    });
    it.each([
        null,
        confirmed,
    ])('publishes authoritative %j after reopening without authorizing obsolete pickup', (truth) => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser(chooser);
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        coordinator.complete(operation.id, { outcome: 'unknown' });
        store.getState().close();
        store.getState().openChooser({ owner: 'newer' });
        expect(store.getState().selectionError).toBe('outcome_unknown');
        expect(coordinator.begin('new', 0)).toBeNull();
        const read = coordinator.retry(0);
        if (!read) throw new Error('Expected read');
        expect(read.formData.get('intent')).toBe('reconcile');
        expect(store.getState().selectionIntent).toBe('reconcile');
        expect(coordinator.complete(read.id, { success: true, selectedStoreInfo: truth })).toBeNull();
        expect(store.getState().selectedStoreInfo?.id ?? null).toBe(truth?.id ?? null);
        expect(store.getState().isOpen).toBe(true);
    });
    it('keeps unknown recovery reachable when a held write settles after chooser reopen', () => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser(chooser);
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        store.getState().close();
        store.getState().openChooser();
        coordinator.complete(operation.id, { outcome: 'unknown' });
        const read = coordinator.retry(0);
        if (!read) throw new Error('Expected read');
        expect(read.formData.get('intent')).toBe('reconcile');
        expect(coordinator.complete(read.id, { success: true, selectedStoreInfo: canonical })).toBeNull();
        expect(store.getState().selectedStoreInfo).toEqual(canonical);
        expect(store.getState().isOpen).toBe(true);
    });
    it('publishes only preference state during synchronous set and clear', () => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        for (const storeId of ['new', null]) {
            const operation = coordinator.begin(storeId, 0);
            if (!operation) throw new Error('Expected operation');
            expect(store.getState().selectionPending).toBe(true);
            expect(store.getState().selectionIntent).toBe(storeId === null ? 'clear' : 'set');
            coordinator.complete(operation.id, {
                success: true,
                selectedStoreInfo: storeId === null ? null : canonical,
            });
            expect(store.getState().confirmedSelection).toBeNull();
        }
    });
    it.each([
        undefined,
        { success: false },
        { success: true, selectedStoreInfo: canonical },
    ])('allows a new generation save while old work is held and ignores its late result %j', (result) => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser(chooser);
        const old = coordinator.begin('old', 0);
        if (!old) throw new Error('Expected old operation');
        store.setState({ generation: 1, selectionPending: false, chooserOwner: null });
        const next = coordinator.begin('new', 1);
        expect(next).not.toBeNull();
        if (!next) throw new Error('Expected new operation');
        expect(next?.id).not.toBe(old.id);
        expect(coordinator.complete(old.id, result)).toBeNull();
        expect(store.getState().selectionPending).toBe(true);
        expect(store.getState().selectionError).toBeNull();
        expect(coordinator.complete(next.id, { success: true, selectedStoreInfo: canonical })).toBeNull();
        expect(store.getState().selectedStoreInfo?.id).toBe('new');
    });
    it('does not resume pickup or blindly write after a mismatched authoritative reconciliation', () => {
        const store = createStoreLocatorStore({ selectedStoreInfo: confirmed });
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser(chooser);
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        coordinator.complete(operation.id, { outcome: 'unknown' });
        const retry = coordinator.retry(0);
        if (!retry) throw new Error('Expected reconciliation');
        expect(coordinator.complete(retry.id, { success: true, selectedStoreInfo: confirmed })).toBeNull();
        expect(store.getState().selectedStoreInfo?.id).toBe('old');
        expect(coordinator.retry(0)).toBeNull();
    });
    it('reconciles unknown preference outcomes without replaying the write and resumes captured intent explicitly', () => {
        const store = createStoreLocatorStore({ selectedStoreInfo: confirmed });
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser(chooser);
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        expect(coordinator.complete(operation.id, { success: false, outcome: 'unknown' })).toBeNull();
        expect(store.getState().selectedStoreInfo).toEqual(confirmed);
        const retry = coordinator.retry(0);
        if (!retry) throw new Error('Expected reconciliation');
        expect(retry.formData.get('intent')).toBe('reconcile');
        coordinator.complete(retry.id, { success: true, selectedStoreInfo: canonical });
        expect(store.getState().claimConfirmedSelection('caller')).toEqual(canonical);
    });

    it('keeps uncertain reconciliation read failures read-only on another explicit retry', () => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        coordinator.complete(operation.id);
        const retry = coordinator.retry(0);
        if (!retry) throw new Error('Expected reconciliation');
        coordinator.complete(retry.id, { success: false, error: 'resolution_failed' });
        expect(coordinator.retry(0)?.formData.get('intent')).toBe('reconcile');
    });
    it('discards a failed retry when opening a new chooser without consuming its draft', () => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser(chooser);
        const first = coordinator.begin('old', 0);
        if (!first) throw new Error('Expected operation');
        coordinator.complete(first.id, { success: false });
        const nextIntent = { owner: 'another-caller' };
        store.getState().openChooser(nextIntent);
        expect(store.getState().selectionError).toBeNull();
        expect(coordinator.retry(0)).toBeNull();
        expect(store.getState().chooserOwner).toBe('another-caller');
        const next = coordinator.begin('new', 0);
        if (!next) throw new Error('Expected operation');
        coordinator.complete(next.id, { success: true, selectedStoreInfo: canonical });
        expect(store.getState().claimConfirmedSelection('another-caller')).toEqual(canonical);
    });

    it('retains pickup intent when choosing a different store after a failed save in the same session', () => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser(chooser);
        const first = coordinator.begin('old', 0);
        if (!first) throw new Error('Expected operation');
        coordinator.complete(first.id, { success: false });
        const second = coordinator.begin('new', 0);
        if (!second) throw new Error('Expected operation');
        coordinator.complete(second.id, { success: true, selectedStoreInfo: canonical });
        expect(store.getState().claimConfirmedSelection('caller')).toEqual(canonical);
    });

    it.each(['session', 'generation'])('does not inherit failed intent across a newer %s', (scope) => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser(chooser);
        const first = coordinator.begin('old', 0);
        if (!first) throw new Error('Expected operation');
        coordinator.complete(first.id, { success: false });
        if (scope === 'session') store.getState().open();
        else store.setState({ generation: 1, chooserOwner: null, confirmedSelection: null, isOpen: false });
        const second = coordinator.begin('new', scope === 'generation' ? 1 : 0);
        if (!second) throw new Error('Expected operation');
        expect(coordinator.complete(second.id, { success: true, selectedStoreInfo: canonical })).toBeNull();
        expect(store.getState().claimConfirmedSelection('caller')).toBeNull();
    });
    it('cancels an unsubmitted pickup intent before standalone-page selection', () => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser(chooser);
        store.getState().close();
        expect(store.getState().chooserOwner).toBeNull();
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        expect(coordinator.complete(operation.id, { success: true, selectedStoreInfo: canonical })).toBeNull();
    });

    it('publishes preference after close and retry without a canceled caller notification', () => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser(chooser);
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        expect(store.getState().confirmedSelection).toBeNull();
        store.getState().close();
        coordinator.complete(operation.id, { success: false });
        const retry = coordinator.retry(0);
        if (!retry) throw new Error('Expected retry');
        coordinator.complete(retry.id, { success: true, selectedStoreInfo: canonical });
        expect(store.getState().selectedStoreInfo).toEqual(canonical);
        expect(store.getState().claimConfirmedSelection('caller')).toBeNull();
        expect(coordinator.complete(retry.id, { success: true, selectedStoreInfo: canonical })).toBeNull();
    });
    it('retains confirmed selection on failed persistence and retries ID-only intent', () => {
        const store = createStoreLocatorStore({ selectedStoreInfo: confirmed });
        const coordinator = createSelectionCoordinator(store);
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        expect(store.getState().selectedStoreInfo).toEqual(confirmed);
        expect(operation.formData.get('intent')).toBe('set');
        expect(operation.formData.get('storeId')).toBe('new');
        expect(operation.formData.has('storeInfo')).toBe(false);
        coordinator.complete(operation.id, { success: false, error: 'persistence_failed' });
        expect(store.getState().selectedStoreInfo).toEqual(confirmed);
        expect(store.getState().selectionError).toBe('persistence_failed');
        expect(coordinator.retry(0)?.formData.get('storeId')).toBe('new');
    });

    it('requires explicit success and canonical metadata, not a truthy or missing success', () => {
        const store = createStoreLocatorStore({ selectedStoreInfo: confirmed });
        const coordinator = createSelectionCoordinator(store);
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        coordinator.complete(operation.id, {});
        expect(store.getState().selectedStoreInfo).toEqual(confirmed);
        expect(store.getState().selectionError).toBeTruthy();
    });

    it('serializes competing lists and cancels captured pickup when a newer chooser opens', () => {
        const store = createStoreLocatorStore({ selectedStoreInfo: confirmed });
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser({ selectedStoreInfo: confirmed, ...chooser });
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        store.getState().close();
        store.getState().open();
        expect(coordinator.begin('other', 0)).toBeNull();
        const next = coordinator.complete(operation.id, { success: true, selectedStoreInfo: canonical });
        expect(next).toBeNull();
        expect(store.getState().isOpen).toBe(true);
        expect(store.getState().selectedStoreInfo).toEqual(canonical);
        expect(coordinator.complete(operation.id, { success: true, selectedStoreInfo: canonical })).toBeNull();
    });

    it.each(['identity', 'site'])('discards an old %s completion and stale callbacks against live generation', () => {
        const store = createStoreLocatorStore({ selectedStoreInfo: confirmed });
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser(chooser);
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        store.setState({ generation: 1, selectionPending: false, selectedStoreInfo: { id: 'profile' } });
        expect(coordinator.complete(operation.id, { success: true, selectedStoreInfo: canonical })).toBeNull();
        expect(store.getState().selectedStoreInfo?.id).toBe('profile');
        expect(coordinator.begin('new', 0)).toBeNull();
        expect(store.getState().selectionPending).toBe(false);
    });

    it('does not mutate a basket for preference-only sessions or failed saves', () => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser(chooser);
        const failed = coordinator.begin('new', 0);
        if (!failed) throw new Error('Expected operation');
        expect(coordinator.complete(failed.id, { success: false })).toBeNull();
        store.getState().open();
        const preference = coordinator.begin('new', 0);
        if (!preference) throw new Error('Expected operation');
        expect(coordinator.complete(preference.id, { success: true, selectedStoreInfo: canonical })).toBeNull();
    });

    it('persists same-store confirmation and supports clearing stale IDs without a store lookup', () => {
        const store = createStoreLocatorStore({ selectedStoreInfo: confirmed });
        const coordinator = createSelectionCoordinator(store);
        const operation = coordinator.begin('old', 0);
        if (!operation) throw new Error('Expected operation');
        coordinator.complete(operation.id, { success: true, selectedStoreInfo: confirmed });
        const clear = coordinator.begin(null, 0);
        if (!clear) throw new Error('Expected operation');
        expect(Array.from(clear.formData.entries())).toEqual([['intent', 'clear']]);
        coordinator.complete(clear.id, { success: true, selectedStoreInfo: null });
        expect(store.getState().selectedStoreInfo).toBeNull();
    });

    it('only closes the initiating chooser and does not let a stale close dismiss a newer session', () => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        store.getState().open();
        const session = store.getState().session;
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        store.getState().open();
        store.getState().close(session);
        expect(store.getState().isOpen).toBe(true);
        coordinator.complete(operation.id, { success: true, selectedStoreInfo: canonical });
        expect(store.getState().isOpen).toBe(true);
    });

    it('closes and emits canonical metadata together and claims atomically across callback/remount replay', () => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser(chooser);
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        coordinator.complete(operation.id, { success: true, selectedStoreInfo: canonical });
        expect(store.getState().isOpen).toBe(false);
        expect(store.getState().claimConfirmedSelection('other')).toBeNull();
        let recursiveClaim: unknown;
        store.subscribe(() => {
            recursiveClaim = store.getState().claimConfirmedSelection('caller');
        });
        expect(store.getState().claimConfirmedSelection('caller')).toEqual(canonical);
        expect(recursiveClaim).toBeNull();
        expect(store.getState().claimConfirmedSelection('caller')).toBeNull();
    });

    it.each(['cancel', 'new chooser', 'scope'])('invalidates an unclaimed notification on %s', (reason) => {
        const store = createStoreLocatorStore();
        const coordinator = createSelectionCoordinator(store);
        store.getState().openChooser(chooser);
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        coordinator.complete(operation.id, { success: true, selectedStoreInfo: canonical });
        if (reason === 'cancel') store.getState().close();
        else if (reason === 'new chooser') store.getState().openChooser(chooser);
        else store.setState({ generation: 1 });
        expect(store.getState().claimConfirmedSelection('caller')).toBeNull();
    });
});

describe('selection effects after partial failure', () => {
    it('publishes committed canonical selection while preserving the account-default error and avoiding pickup confirmation', () => {
        const store = createStoreLocatorStore();
        store.getState().setSelectedStoreInfo(confirmed);
        store.getState().openChooser(chooser);
        const coordinator = createSelectionCoordinator(store);
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        const revision = store.getState().selectionRevision;
        coordinator.complete(operation.id, {
            success: false,
            error: 'PREFERRED_STORE_PERSISTENCE_FAILED',
            selectedStoreInfo: canonical,
            effects: { storeSelection: 'committed', nativeContext: 'committed' },
        });
        expect(store.getState()).toMatchObject({
            selectedStoreInfo: canonical,
            selectionError: 'PREFERRED_STORE_PERSISTENCE_FAILED',
            selectionPending: false,
            confirmedSelection: null,
            isOpen: true,
            selectionSettlement: { from: revision, to: revision + 1 },
        });
        const retry = coordinator.retry(0);
        expect(retry?.formData.get('intent')).toBe('set');
    });

    it('uses the existing read-only recovery for an unknown native outcome', () => {
        const store = createStoreLocatorStore();
        store.getState().setSelectedStoreInfo(confirmed);
        const coordinator = createSelectionCoordinator(store);
        const operation = coordinator.begin('new', 0);
        if (!operation) throw new Error('Expected operation');
        coordinator.complete(operation.id, {
            success: false,
            effects: { storeSelection: 'unknown', nativeContext: 'unknown' },
        });
        expect(store.getState().selectedStoreInfo).toEqual(confirmed);
        expect(store.getState().selectionError).toBe('outcome_unknown');
        expect(coordinator.begin('new', 0)).toBeNull();
        expect(coordinator.retry(0)?.formData.get('intent')).toBe('reconcile');
    });
});

it('keeps a basket-consent refusal specific and does not replay the rejected write', () => {
    const store = createStoreLocatorStore();
    const coordinator = createSelectionCoordinator(store);
    const operation = coordinator.begin('B', store.getState().generation);
    if (!operation) throw new Error('Expected operation');
    coordinator.complete(operation.id, {
        success: false,
        code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
        effects: { storeSelection: 'unchanged', nativeContext: 'unchanged' },
    });
    expect(store.getState().selectionError).toBe('STORE_CHANGE_CONFIRMATION_REQUIRED');
    expect(coordinator.retry(store.getState().generation)).toBeNull();
    expect(store.getState().selectedStoreInfo).toBeNull();
});

it.each([
    'chooser',
    'generation',
])('does not let a late account-default failure confirm or close a newer %s', (scope) => {
    const store = createStoreLocatorStore();
    store.getState().setSelectedStoreInfo(confirmed);
    store.getState().openChooser(chooser);
    const coordinator = createSelectionCoordinator(store);
    const operation = coordinator.begin('new', 0);
    if (!operation) throw new Error('Expected operation');
    if (scope === 'chooser') store.getState().openChooser({ owner: 'new-caller' });
    else store.setState({ generation: 1, selectionPending: false });
    coordinator.complete(operation.id, {
        success: false,
        error: 'PREFERRED_STORE_PERSISTENCE_FAILED',
        selectedStoreInfo: canonical,
        effects: { storeSelection: 'committed', nativeContext: 'committed' },
    });
    expect(store.getState().selectedStoreInfo).toEqual(scope === 'chooser' ? canonical : confirmed);
    expect(store.getState().confirmedSelection).toBeNull();
    expect(store.getState().isOpen).toBe(true);
});
