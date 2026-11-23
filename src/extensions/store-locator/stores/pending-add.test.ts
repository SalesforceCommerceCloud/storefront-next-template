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
import { describe, expect, it, vi } from 'vitest';
import { requestPendingAdd, resumePendingAdd } from '@/extensions/store-locator/lib/pending-add';
import { createSelectionCoordinator } from './selection-coordinator';
import { createStoreLocatorStore, type SelectedStoreInfo } from './store-locator-store';

const selection: SelectedStoreInfo = { id: 'A', name: 'A', inventoryId: 'inventory-a', fulfillmentMode: 'pickup' };
const intent = {
    productId: 'resolved-variant',
    quantity: 3,
    optionItems: [{ optionId: 'engraving', optionValueId: 'yes' }],
};

function select(
    store: ReturnType<typeof createStoreLocatorStore>,
    candidate: SelectedStoreInfo,
    coordinator = createSelectionCoordinator(store)
) {
    const operation = coordinator.begin(
        candidate.id,
        store.getState().generation,
        undefined,
        candidate.fulfillmentMode
    );
    return { coordinator, id: operation?.id ?? 0 };
}
function complete(
    store: ReturnType<typeof createStoreLocatorStore>,
    operation: ReturnType<typeof select>,
    result: Parameters<ReturnType<typeof createSelectionCoordinator>['complete']>[1]
) {
    operation.coordinator.complete(operation.id, result);
    resumePendingAdd(store);
}
describe('selection and pending add lifecycle', () => {
    it('retains the resolved variant, options and quantity and resumes once after a matching success', () => {
        const store = createStoreLocatorStore();
        const resume = vi.fn();
        requestPendingAdd(store, 'pdp', intent, resume);
        // Snapshot: subsequent changes to a product form cannot alter the queued intent.
        const changed = structuredClone(intent);
        requestPendingAdd(store, 'another-button', changed, resume);
        changed.quantity = 9;
        const operation = select(store, selection);
        expect(resume).not.toHaveBeenCalled();
        complete(store, operation, { success: true, selectedStoreInfo: selection });
        complete(store, operation, { success: true, selectedStoreInfo: selection });
        expect(resume).toHaveBeenCalledExactlyOnceWith(intent, selection);
        expect(store.getState().pendingAdd).toBeNull();
        expect(store.getState().isOpen).toBe(false);
    });

    it('retains intent and committed selection after failure, permits an explicit retry and ignores an older response', () => {
        const store = createStoreLocatorStore({ selectedStoreInfo: selection });
        const resume = vi.fn();
        requestPendingAdd(store, 'pdp', intent, resume);
        const candidate = { ...selection, id: 'B' };
        const first = select(store, candidate);
        complete(store, first, { success: false, error: 'STORE_CHANGE_CONFIRMATION_REQUIRED' });
        expect(store.getState().selectedStoreInfo).toEqual(selection);
        expect(store.getState().pendingAdd?.intent).toEqual(intent);
        expect(resume).not.toHaveBeenCalled();
        const second = select(store, candidate, first.coordinator);
        complete(store, first, { success: true, selectedStoreInfo: selection });
        expect(resume).not.toHaveBeenCalled();
        complete(store, second, { success: true, selectedStoreInfo: candidate });
        expect(resume).toHaveBeenCalledExactlyOnceWith(intent, candidate);
    });

    it('does not resume after cancellation, even when an already-submitted selection later succeeds', () => {
        const store = createStoreLocatorStore();
        const resume = vi.fn();
        requestPendingAdd(store, 'pdp', intent, resume);
        const operation = select(store, selection);
        store.getState().close();
        complete(store, operation, { success: true, selectedStoreInfo: selection });
        expect(resume).not.toHaveBeenCalled();
        expect(store.getState().selectionPending).toBe(false);
        expect(store.getState().selectedStoreInfo).toEqual(selection);
    });

    it('blocks duplicate selection submissions and new intents until an in-flight selection settles', () => {
        const store = createStoreLocatorStore();
        const operation = select(store, selection);
        expect(operation.coordinator.begin('B', 0)).toBeNull();
        expect(requestPendingAdd(store, 'pdp', intent, vi.fn())).toBe(false);
    });

    it('navigation/unmount cancels only the owning product intent', () => {
        const store = createStoreLocatorStore();
        const resume = vi.fn();
        requestPendingAdd(store, 'pdp', intent, resume);
        store.getState().cancelAdd('other');
        expect(store.getState().pendingAdd).not.toBeNull();
        store.getState().cancelAdd('pdp');
        complete(store, select(store, selection), { success: true, selectedStoreInfo: selection });
        expect(resume).not.toHaveBeenCalled();
    });

    it.each([
        0,
        -1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.MAX_SAFE_INTEGER + 1,
    ])('rejects invalid quantity %s before opening selection', (quantity) => {
        const store = createStoreLocatorStore();
        expect(requestPendingAdd(store, 'pdp', { ...intent, quantity }, vi.fn())).toBe(false);
        expect(store.getState().isOpen).toBe(false);
    });

    it('rejects empty SKU/options and never resumes an incomplete selection', () => {
        const store = createStoreLocatorStore();
        const resume = vi.fn();
        expect(requestPendingAdd(store, 'pdp', { ...intent, productId: '' }, resume)).toBe(false);
        expect(
            requestPendingAdd(store, 'pdp', { ...intent, optionItems: [{ optionId: '', optionValueId: 'x' }] }, resume)
        ).toBe(false);
        requestPendingAdd(store, 'pdp', intent, resume);
        complete(store, select(store, selection), { success: true, selectedStoreInfo: { id: 'A' } });
        expect(resume).not.toHaveBeenCalled();
    });
});
