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
import type { ShoppingContext, StoreChangeResult } from './store-selection.server';

export type PublicShoppingContext = Pick<
    ShoppingContext,
    | 'siteId'
    | 'preparingStoreId'
    | 'inventoryId'
    | 'contextRevision'
    | 'selectionOrigin'
    | 'committedAt'
    | 'fulfillmentMode'
>;

/** Browser consumers receive display/revalidation metadata, never preference-session or identity internals. */
export function toPublicShoppingContext(value: ShoppingContext | null): PublicShoppingContext | null {
    if (!value) return null;
    return {
        siteId: value.siteId,
        preparingStoreId: value.preparingStoreId,
        inventoryId: value.inventoryId,
        contextRevision: value.contextRevision,
        selectionOrigin: value.selectionOrigin,
        committedAt: value.committedAt,
        ...(value.fulfillmentMode ? { fulfillmentMode: value.fulfillmentMode } : {}),
    };
}

/** Explicit response shape prevents future server-only selection fields from being serialized by a spread. */
export function toPublicStoreChangeResult(result: StoreChangeResult) {
    if (result.success)
        return {
            success: true as const,
            selectedStoreInfo: result.selectedStoreInfo,
            shoppingContext: toPublicShoppingContext(result.shoppingContext),
        };
    return { success: false as const, code: result.code, current: result.current, candidate: result.candidate };
}
