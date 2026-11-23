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
import type { ShopperAvailability } from './types';

export type InventoryRecord = ShopperAvailability.schemas['Inventory'];

/**
 * Preserve native catalog orderability only with positive physical stock and usable ATS.
 * Catalog summaries do not imply demand for one unit; use hasInventoryStock for a requested quantity.
 */
export function hasUsableInventoryStock(inventory: InventoryRecord | null | undefined): boolean {
    return Boolean(
        inventory?.orderable &&
            Number.isFinite(inventory.stockLevel) &&
            (inventory.stockLevel ?? 0) > 0 &&
            // ATS can be lower than physical stock because of reservations.
            (inventory.ats === undefined || (Number.isFinite(inventory.ats) && inventory.ats > 0))
    );
}

/** Strict physical-stock check. Deferred orders and absent records do not supply usable stock. */
export function hasInventoryStock(inventory: InventoryRecord | null | undefined, quantity = 1): boolean {
    return Boolean(
        hasUsableInventoryStock(inventory) &&
            Number.isFinite(quantity) &&
            quantity > 0 &&
            (inventory?.stockLevel ?? 0) >= quantity &&
            (inventory?.ats === undefined || inventory.ats >= quantity)
    );
}
