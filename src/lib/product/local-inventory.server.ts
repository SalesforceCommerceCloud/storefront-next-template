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
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import type { RouterContextProvider } from 'react-router';
import { fetchInventoryRecords, hasUsableInventoryStock, type InventoryRecord, type ShopperProducts } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
import { selectedStoreContext } from '@/extensions/store-locator/middlewares/selected-store.server';
import { shoppingContext, validateSelectedStore } from '@/extensions/store-locator/lib/store-selection.server';
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

export { LocalInventoryError } from '@/lib/product/local-inventory-error';
import { LocalInventoryError } from '@/lib/product/local-inventory-error';

type Context = Readonly<RouterContextProvider>;
export type LocalInventoryContext = { storeId: string; inventoryId: string; contextRevision?: string };

/** Use only the selection validated by middleware. Inventory IDs from URLs/cookies never authorize a read. */
export function getLocalInventoryContext(_context: Context): LocalInventoryContext | null {
    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    if (getConfig(_context).features?.localInventory?.enabled) {
        const store = _context.get(selectedStoreContext);
        const committed = _context.get(shoppingContext);
        if (!store) {
            if (committed?.preparingStoreId) throw new LocalInventoryError('INVALID_STORE_MAPPING');
            return null;
        }
        if (committed && (committed.preparingStoreId !== store.id || committed.inventoryId !== store.inventoryId)) {
            throw new LocalInventoryError('INVALID_STORE_MAPPING');
        }
        assertInventoryList(_context, store.inventoryId);
        return { storeId: store.id, inventoryId: store.inventoryId, contextRevision: committed?.contextRevision };
    }
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
    return null;
}

/**
 * The Store API maps a store to a list but does not attest list existence or default-in-stock policy.
 * Keep unverified/deleted lists closed until merchant inventory configuration has been validated.
 */
function assertInventoryList(context: Context, inventoryId: string | undefined): asserts inventoryId is string {
    const siteId = context.get(siteContext)?.site.id;
    const lists = siteId && getConfig(context).features?.localInventory?.inventoryListsBySite?.[siteId];
    if (!inventoryId || !lists || !lists.includes(inventoryId)) throw new LocalInventoryError('INVALID_INVENTORY_LIST');
}

export async function readLocalInventory(
    context: Context,
    productIds: string[],
    selection = getLocalInventoryContext(context)
) {
    if (!selection) return null;
    assertInventoryList(context, selection.inventoryId);
    return fetchInventoryRecords(createApiClients(context).shopperAvailability, productIds, selection.inventoryId);
}

/** Stock-only candidate read. Does not select a store or change native qualification. */
export async function readCandidateStoreInventory(
    _context: Context,
    _storeId: string,
    _productIds: string[]
): Promise<Map<string, InventoryRecord> | null> {
    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    if (getConfig(_context).features?.localInventory?.enabled) {
        const store = await validateSelectedStore(_context, { id: _storeId });
        assertInventoryList(_context, store.inventoryId);
        return readLocalInventory(_context, _productIds, { storeId: store.id, inventoryId: store.inventoryId });
    }
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
    throw new LocalInventoryError('STORE_CONTEXT_REQUIRED');
}

/** Replace every availability signal with the explicit selected-list result, leaving prices/offers untouched. */
export async function applyLocalInventory(context: Context, products: ShopperProducts.schemas['Product'][]) {
    const selection = getLocalInventoryContext(context);
    if (!selection || !products.length) return products;
    const ids = new Set<string>();
    const collect = (product: ShopperProducts.schemas['Product']) => {
        ids.add(product.id);
        product.variants?.forEach((variant) => ids.add(variant.productId));
        product.bundledProducts?.forEach((child) => collect(child.product));
        product.setProducts?.forEach(collect);
    };
    products.forEach(collect);
    const records = await readLocalInventory(context, [...ids], selection);
    if (!records) throw new LocalInventoryError('STORE_CONTEXT_REQUIRED');
    const empty = (): InventoryRecord => ({ id: selection.inventoryId, ats: 0, stockLevel: 0, orderable: false });
    const inventory = (id: string) => {
        const record = records.get(id) ?? empty();
        return { ...record, orderable: hasUsableInventoryStock(record), preorderable: false, backorderable: false };
    };
    const apply = (product: ShopperProducts.schemas['Product']): ShopperProducts.schemas['Product'] => ({
        ...product,
        c_localInventoryId: selection.inventoryId,
        c_localInventoryStoreId: selection.storeId,
        c_localInventoryRevision: selection.contextRevision,
        inventory: inventory(product.id),
        inventories: [inventory(product.id)],
        ...(product.variants && {
            variants: product.variants.map((variant) => ({
                ...variant,
                inventory: inventory(variant.productId),
                inventories: [inventory(variant.productId)],
                orderable: inventory(variant.productId).orderable,
            })),
        }),
        ...(product.bundledProducts && {
            bundledProducts: product.bundledProducts.map((child) => ({ ...child, product: apply(child.product) })),
        }),
        ...(product.setProducts && { setProducts: product.setProducts.map(apply) }),
    });
    return products.map(apply);
}
