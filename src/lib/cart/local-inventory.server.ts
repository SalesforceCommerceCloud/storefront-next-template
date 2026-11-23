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
import type { RouterContextProvider } from 'react-router';
import { aggregateInventoryQuantities, hasInventoryStock, type ShopperBasketsV2 } from '@/scapi';
import {
    getLocalInventoryContext,
    readLocalInventory,
    LocalInventoryError,
} from '@/lib/product/local-inventory.server';
import { flattenInventoryLines, type InventoryLine } from '@/lib/cart/local-inventory';
import { CommerceContextError } from '@/lib/auth/commerce-context.server';

/** Preflight only: native write-time stock validation remains authoritative. */
export async function assertLocalBasketStock(
    context: Readonly<RouterContextProvider>,
    basket: ShopperBasketsV2.schemas['Basket'],
    items?: InventoryLine[]
) {
    const local = getLocalInventoryContext(context);
    if (!local) return;
    if (
        basket.shipments?.some((shipment) => shipment.c_fromStoreId && shipment.c_fromStoreId !== local.storeId) ||
        basket.productItems?.some((item) => item.inventoryId !== local.inventoryId)
    ) {
        throw new CommerceContextError('STORE_CHANGE_CONFIRMATION_REQUIRED', 409);
    }
    const demand = aggregateInventoryQuantities(flattenInventoryLines(items ?? basket.productItems ?? []));
    // Let shoppers repair an already-unavailable basket one reduction/removal at a time.
    // New consumption must fit the total SKU budget, including unchanged duplicate lines.
    const prior = items ? aggregateInventoryQuantities(flattenInventoryLines(basket.productItems ?? [])) : null;
    const changedDemand = new Map([...demand].filter(([id, quantity]) => !prior || quantity > (prior.get(id) ?? 0)));
    if (!changedDemand.size) return;
    const records = await readLocalInventory(context, [...changedDemand.keys()], local);
    if ([...changedDemand].some(([id, quantity]) => !hasInventoryStock(records?.get(id), quantity))) {
        throw new LocalInventoryError('LOCAL_STOCK_UNAVAILABLE', 422);
    }
}
