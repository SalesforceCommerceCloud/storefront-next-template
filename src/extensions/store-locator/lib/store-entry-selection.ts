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
import type { StoreEntryConfig } from '@/extensions/store-locator/lib/store-entry';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';

/** Only a committed selection with a currently configured mode permits required-entry shopping. */
export function hasStoreEntrySelection(selection: SelectedStoreInfo | null, entry: StoreEntryConfig): boolean {
    return Boolean(
        selection?.id &&
            selection.inventoryId &&
            selection.fulfillmentMode &&
            entry.fulfillmentModes.includes(selection.fulfillmentMode)
    );
}
