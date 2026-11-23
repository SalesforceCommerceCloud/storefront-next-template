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
import type {
    StoreApi,
    StoreLocatorStore,
    SelectedStoreInfo,
} from '@/extensions/store-locator/stores/store-locator-store';

export type PendingAddIntent = {
    /** The resolved SKU carries variant identity; incomplete master selections are never queued. */
    productId: string;
    quantity: number;
    optionItems?: Array<{ optionId: string; optionValueId: string }>;
};

const identifier = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= 256;

/**
 * Validate and snapshot the small add-intent payload without loading form-schema machinery into the root store.
 * This checks shape only: the native basket action still validates the actual SKU, options and orderability.
 */
export function parsePendingAdd(value: unknown): PendingAddIntent | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const input = value as Record<string, unknown>;
    if (
        !identifier(input.productId) ||
        !input.productId.trim() ||
        !Number.isSafeInteger(input.quantity) ||
        (input.quantity as number) <= 0
    )
        return null;
    let optionItems: PendingAddIntent['optionItems'];
    if (input.optionItems !== undefined) {
        if (!Array.isArray(input.optionItems) || input.optionItems.length > 30) return null;
        optionItems = [];
        for (const item of input.optionItems) {
            if (
                !item ||
                typeof item !== 'object' ||
                Array.isArray(item) ||
                !identifier(item.optionId) ||
                !identifier(item.optionValueId)
            )
                return null;
            optionItems.push({ optionId: item.optionId, optionValueId: item.optionValueId });
        }
    }
    return {
        productId: input.productId.trim(),
        quantity: input.quantity as number,
        ...(optionItems ? { optionItems } : {}),
    };
}

/** Validate and snapshot a product intent only after its optional entry code is requested. */
export function requestPendingAdd(
    store: StoreApi<StoreLocatorStore>,
    owner: string,
    intent: PendingAddIntent,
    resume: (intent: PendingAddIntent, selection: SelectedStoreInfo) => void
): boolean {
    const state = store.getState();
    if (
        state.pendingAdd ||
        state.pendingAddLoad ||
        state.selectionPending ||
        state.selectionError === 'outcome_unknown'
    )
        return false;
    const parsed = parsePendingAdd(intent);
    if (!parsed) return false;
    state.openChooser({ owner });
    store.setState({
        pendingAdd: { owner, intent: parsed, resume, resumeAfterSelection: () => resumePendingAdd(store) },
    });
    return true;
}

/** Consume only the existing coordinator's owner-confirmed notification, once and before calling the product. */
export function resumePendingAdd(store: StoreApi<StoreLocatorStore>): void {
    const state = store.getState();
    const pending = state.pendingAdd;
    const confirmed = state.confirmedSelection;
    if (
        !pending ||
        confirmed?.owner !== pending.owner ||
        !confirmed.store.fulfillmentMode ||
        !confirmed.store.inventoryId
    )
        return;
    const selection = state.claimConfirmedSelection(pending.owner);
    if (!selection) return;
    store.setState({ pendingAdd: null });
    pending.resume(pending.intent, selection);
}
