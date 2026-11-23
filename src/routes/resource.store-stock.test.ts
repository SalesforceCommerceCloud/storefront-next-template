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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { createTestContext } from '@/lib/test-utils';
import { readCandidateStoreInventory, LocalInventoryError } from '@/lib/product/local-inventory.server';
import { loader, action } from './resource.store-stock';

vi.mock('@/lib/product/local-inventory.server', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/product/local-inventory.server')>()),
    readCandidateStoreInventory: vi.fn(),
}));
function args(
    items: unknown = [
        { productId: 'sku', quantity: 2 },
        { productId: 'sku', quantity: 2 },
    ],
    origin = 'http://localhost'
) {
    const context = createTestContext() as RouterContextProvider;
    const config = context.get(appConfigContext);
    context.set(appConfigContext, { ...config, features: { ...config.features, localInventory: { enabled: true } } });
    const params = new URLSearchParams({
        candidateStoreId: 'B',
        inventoryIds: 'browser-other',
        items: JSON.stringify(items),
    });
    const request = new Request(`http://localhost/resource/store-stock?${params}`, { headers: { Origin: origin } });
    return { context, request, params: {}, url: new URL(request.url), pattern: '/resource/store-stock' };
}
beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readCandidateStoreInventory).mockResolvedValue(
        new Map([['sku', { id: 'list-B', stockLevel: 3, ats: 3, orderable: true }]])
    );
});

describe('candidate-store stock resource', () => {
    it('derives inventory from the candidate store and aggregates options/SKU quantities without financial data', async () => {
        const input = args();
        const response = await loader(input);
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(readCandidateStoreInventory).toHaveBeenCalledWith(input.context, 'B', ['sku']);
        expect(await response.json()).toEqual({
            success: true,
            stockOnly: true,
            candidateStoreId: 'B',
            items: [{ productId: 'sku', quantity: 4, available: false, stockLevel: 3 }],
        });
    });
    it.each(
        [
            [],
            [{ productId: 'sku', quantity: 0 }],
            [{ productId: 'sku', quantity: '2' }],
            Array.from({ length: 81 }, () => ({ productId: 'sku', quantity: 1 })),
        ].map((items) => [items])
    )('rejects malformed or unbounded requests: %j', async (items) => {
        expect((await loader(args(items))).status).toBe(400);
        expect(readCandidateStoreInventory).not.toHaveBeenCalled();
    });
    it('distinguishes configuration/API errors from unavailable stock and rejects cross-origin requests', async () => {
        vi.mocked(readCandidateStoreInventory).mockRejectedValueOnce(new LocalInventoryError('INVALID_INVENTORY_LIST'));
        const invalid = await loader(args());
        expect(invalid.status).toBe(503);
        expect(await invalid.json()).toEqual({ success: false, code: 'INVALID_INVENTORY_LIST' });
        vi.mocked(readCandidateStoreInventory).mockRejectedValueOnce(new Error('upstream'));
        expect((await loader(args())).status).toBe(503);
        expect((await loader(args(undefined, 'http://other.example'))).status).toBe(403);
        expect(action().status).toBe(405);
    });
});
