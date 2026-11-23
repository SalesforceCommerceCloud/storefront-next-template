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
import { redirect, type RouterContextProvider } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { createApiClients } from '@/lib/api-clients.server';
import { fetchInventoryRecords, hasUsableInventoryStock, type ShopperSearch } from '@/scapi';
import { getLocalInventoryContext, LocalInventoryError } from '@/lib/product/local-inventory.server';
import { normalizeLocalInventorySearch } from '@/lib/product/local-inventory-search';

type Context = Readonly<RouterContextProvider>;
type Query = Partial<ShopperSearch.operations['productSearch']['parameters']['query']>;

export function redirectLocalInventorySearch(context: Context, url: URL) {
    if (!getConfig(context).features?.localInventory?.enabled) return;
    const local = getLocalInventoryContext(context);
    const next = normalizeLocalInventorySearch(url.searchParams, local?.inventoryId, local?.storeId);
    if (next.toString() !== url.searchParams.toString()) {
        // oxlint-disable-next-line @typescript-eslint/only-throw-error -- React Router expects a thrown redirect Response.
        throw redirect(`${url.pathname}${next.size ? `?${next}` : ''}`, {
            headers: { 'Cache-Control': 'private, no-store' },
        });
    }
}

/** Let the native index compute totals, facets, ordering and windows before returning any hits. */
export function scopeLocalInventorySearch(context: Context, query: Query): Query {
    if (!getConfig(context).features?.localInventory?.enabled) return query;
    const local = getLocalInventoryContext(context);
    const refine = (query.refine ?? []).filter((value) => !/^(ilids|orderable_only)=/.test(value));
    if (!local) return { ...query, refine };
    const hideUnavailable = query.refine?.includes('orderable_only=true') ?? false;
    if (hideUnavailable && !getConfig(context).features.localInventory?.nativeSearchVerified) {
        throw new LocalInventoryError('LOCAL_INVENTORY_SEARCH_NOT_VERIFIED');
    }
    return {
        ...query,
        // Result membership depends on stock, so use native availability's shorter cache lifetime.
        ...(hideUnavailable && query.expand && { expand: [...new Set([...query.expand, 'availability' as const])] }),
        refine: [
            ...refine,
            ...(hideUnavailable ? [`ilids=${local.inventoryId}`] : []),
            `orderable_only=${hideUnavailable}`,
        ],
    };
}

/** Enrich a result window without filtering it: native totals/order/pagination remain intact. */
export async function applyLocalSearchInventory(
    context: Context,
    result: ShopperSearch.schemas['ProductSearchResult'],
    hideUnavailable = false
) {
    const local = getLocalInventoryContext(context);
    if (!local || !result.hits?.length) return result;
    const ids = result.hits.flatMap((hit) => (hit.productId ? [hit.productId] : []));
    const records = await fetchInventoryRecords(createApiClients(context).shopperAvailability, ids, local.inventoryId);
    if (hideUnavailable && result.hits.some((hit) => !hasUsableInventoryStock(records.get(hit.productId ?? '')))) {
        throw new LocalInventoryError('LOCAL_INVENTORY_INDEX_STALE');
    }
    return {
        ...result,
        hits: result.hits.map((hit) => ({
            ...hit,
            c_localInventoryAvailable: hasUsableInventoryStock(records.get(hit.productId ?? '')),
            c_localInventoryId: local.inventoryId,
            c_localInventoryRevision: local.contextRevision,
        })),
    };
}
