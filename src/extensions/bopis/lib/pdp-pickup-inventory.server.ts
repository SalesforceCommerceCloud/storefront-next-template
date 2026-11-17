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
/** @sfdc-extension-file SFDC_EXT_BOPIS */
import type { RouterContextProvider } from 'react-router';
import { AuthTokenInvalidError, ApiError, type ShopperProducts } from '@/scapi';
import { resolveSelectedStore } from '@/extensions/store-locator/lib/resolve-selected-store.server';
import { fetchProductsByIds } from '@/lib/api/products.server';
import { getInitialVariant } from '@/lib/product/initial-variant';
import { getLogger } from '@/lib/logger.server';

export type PdpPickupInventory = {
    status: 'resolved' | 'empty' | 'error' | 'auth-error';
    storeId?: string;
    inventoryId?: string;
    products: Array<Pick<ShopperProducts.schemas['Product'], 'id' | 'inventory' | 'inventories'>>;
};

function isAuthFailure(error: unknown): boolean {
    if (error instanceof AuthTokenInvalidError || (error instanceof Error && error.name === 'AuthTokenInvalidError'))
        return true;
    if ((error instanceof ApiError || error instanceof Response) && error.status === 401) return true;
    return error instanceof Error && error.cause !== error && error.cause != null ? isAuthFailure(error.cause) : false;
}

/** Start both inputs before joining; contain errors before React Router starts streaming. */
export function loadPdpPickupInventory(
    context: Readonly<RouterContextProvider>,
    productPromise: Promise<ShopperProducts.schemas['Product'] | null>,
    searchParams = new URLSearchParams(),
    selectionPromise = resolveSelectedStore(context)
): Promise<PdpPickupInventory> {
    return Promise.all([productPromise, selectionPromise])
        .then(async ([product, selection]): Promise<PdpPickupInventory> => {
            const inventoryId = selection.selectedStoreInfo?.inventoryId;
            const base = { storeId: selection.selectedStoreInfo?.id, inventoryId, products: [] };
            if (selection.error) return { ...base, status: selection.authError ? 'auth-error' : 'error' };
            if (!product || !inventoryId) return { ...base, status: 'empty' };
            const children = [
                ...(product.setProducts ?? []),
                ...(product.bundledProducts ?? []).flatMap((item) => (item.product ? [item.product] : [])),
            ];
            const selectedSku = getInitialVariant(product, searchParams)?.productId;
            const ids = [
                ...new Set([
                    ...(product.type?.master && !selectedSku ? [] : [selectedSku ?? product.id]),
                    ...children
                        .map(
                            (child) =>
                                getInitialVariant(child, new URLSearchParams(searchParams.get(child.id) ?? ''), true)
                                    ?.productId ?? (child.type?.master ? undefined : child.id)
                        )
                        .filter((id): id is string => Boolean(id)),
                ]),
            ];
            if (!ids.length) return { ...base, status: 'empty' };
            try {
                const products = await fetchProductsByIds(context, ids, {
                    expand: ['availability'],
                    inventoryIds: [inventoryId],
                });
                return {
                    ...base,
                    status: 'resolved',
                    products: ids.map((id) => {
                        const data = products.find((candidate) => candidate.id === id);
                        const inventories =
                            data?.inventories?.filter((inventory) => inventory.id === inventoryId) ?? [];
                        return {
                            id,
                            inventory: data?.inventory,
                            inventories: !inventories.length
                                ? [{ id: inventoryId, orderable: false, ats: 0, stockLevel: 0 }]
                                : inventories,
                        };
                    }),
                };
            } catch (error) {
                getLogger(context).error('PDP pickup inventory failed', { productId: product.id });
                return { ...base, status: isAuthFailure(error) ? 'auth-error' : 'error' };
            }
        })
        .catch((error): PdpPickupInventory => {
            getLogger(context).error('PDP pickup inventory inputs failed');
            return { status: isAuthFailure(error) ? 'auth-error' : 'error', products: [] };
        });
}
