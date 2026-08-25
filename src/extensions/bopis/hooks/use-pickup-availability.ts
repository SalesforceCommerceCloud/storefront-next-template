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
import { useMemo } from 'react';
import type { ShopperProducts } from '@/scapi';
import { isStoreOutOfStock } from '@/lib/product/inventory-utils';
import { isProductSet, isProductBundle } from '@/lib/product/product-utils';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';

interface UsePickupAvailabilityProps {
    product: ShopperProducts.schemas['Product'];
    quantity: number;
    pickupStore?: SelectedStoreInfo | null;
}

export function usePickupAvailability({ product, quantity, pickupStore }: UsePickupAvailabilityProps): boolean {
    return useMemo(() => {
        if (pickupStore && !pickupStore.inventoryId) {
            return true;
        }

        const hasStoreSelected = Boolean(pickupStore?.inventoryId);
        const hasInventoryData = Boolean(product?.inventories?.length);
        const isSetOrBundle = isProductSet(product) || isProductBundle(product);

        // Store inventory arrives after the selected store; do not flash unavailable while it loads.
        if (hasStoreSelected && !hasInventoryData && !isSetOrBundle) {
            return false;
        }

        return isStoreOutOfStock(product, pickupStore?.inventoryId, quantity);
    }, [product, pickupStore, quantity]);
}
