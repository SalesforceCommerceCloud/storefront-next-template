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
import type { LoaderFunctionArgs } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { aggregateInventoryQuantities, hasInventoryStock } from '@/scapi';
import { isSameOrigin } from '@/lib/origin';
import { readCandidateStoreInventory, LocalInventoryError } from '@/lib/product/local-inventory.server';

const headers = { 'Cache-Control': 'private, no-store' };

export async function loader({ request, context }: LoaderFunctionArgs) {
    if (!getConfig(context).features.localInventory?.enabled) return new Response(null, { status: 404, headers });
    if (!isSameOrigin(request)) return new Response(null, { status: 403, headers });
    const params = new URL(request.url).searchParams;
    const storeId = params.get('candidateStoreId');
    let items: { productId: string; quantity: number }[];
    try {
        const parsed: unknown = JSON.parse(params.get('items') ?? 'null');
        if (
            !storeId ||
            storeId.length > 256 ||
            /[,|\r\n]/.test(storeId) ||
            !Array.isArray(parsed) ||
            !parsed.length ||
            parsed.length > 80
        )
            throw new TypeError();
        items = parsed.map((entry: unknown) => {
            if (!entry || typeof entry !== 'object') throw new TypeError();
            const item = entry as Record<string, unknown>;
            if (
                typeof item.productId !== 'string' ||
                !item.productId.trim() ||
                item.productId.length > 100 ||
                /[,|\r\n]/.test(item.productId) ||
                typeof item.quantity !== 'number'
            )
                throw new TypeError();
            return { productId: item.productId, quantity: item.quantity };
        });
        aggregateInventoryQuantities(items);
    } catch {
        return Response.json({ success: false, code: 'INVALID_STOCK_REQUEST' }, { status: 400, headers });
    }
    try {
        const demand = aggregateInventoryQuantities(items);
        const records = await readCandidateStoreInventory(context, storeId, [...demand.keys()]);
        return Response.json(
            {
                success: true,
                stockOnly: true,
                candidateStoreId: storeId,
                items: [...demand].map(([productId, quantity]) => ({
                    productId,
                    quantity,
                    available: hasInventoryStock(records?.get(productId), quantity),
                    stockLevel: Math.max(
                        0,
                        Math.min(
                            records?.get(productId)?.stockLevel ?? 0,
                            records?.get(productId)?.ats ?? records?.get(productId)?.stockLevel ?? 0
                        )
                    ),
                })),
            },
            { headers }
        );
    } catch (error) {
        return Response.json(
            { success: false, code: error instanceof LocalInventoryError ? error.code : 'STOCK_READ_FAILED' },
            { status: error instanceof LocalInventoryError ? error.status : 503, headers }
        );
    }
}

export function action() {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } });
}
