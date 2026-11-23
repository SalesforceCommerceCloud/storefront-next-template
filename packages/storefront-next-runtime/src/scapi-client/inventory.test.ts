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
import { describe, expect, it, vi } from 'vitest';
import {
    aggregateInventoryQuantities,
    fetchInventoryRecords,
    hasInventoryStock,
    hasUsableInventoryStock,
    scaleInventoryQuantity,
    InventoryQuantityError,
} from './inventory';
import type { Clients } from './createClients';

describe('explicit inventory', () => {
    it.each([
        [undefined, false],
        [null, false],
        [{ id: 'A', orderable: true }, false],
        [{ id: 'A', orderable: true, stockLevel: 0 }, false],
        [{ id: 'A', orderable: true, stockLevel: -0.5 }, false],
        [{ id: 'A', orderable: true, stockLevel: NaN }, false],
        [{ id: 'A', orderable: true, stockLevel: Infinity }, false],
        [{ id: 'A', orderable: true, stockLevel: 0.5, ats: 0 }, false],
        [{ id: 'A', orderable: true, stockLevel: 0.5, ats: -0.25 }, false],
        [{ id: 'A', orderable: true, stockLevel: 0.5, ats: NaN }, false],
        [{ id: 'A', orderable: true, stockLevel: 0.5, ats: Infinity }, false],
        [{ id: 'A', orderable: false, stockLevel: 0.5, ats: 0.5 }, false],
        [{ id: 'A', stockLevel: 0.5, ats: 0.5 }, false],
        [{ id: 'A', orderable: true, stockLevel: 0, ats: 3, backorderable: true }, false],
        [{ id: 'A', orderable: true, stockLevel: 0.5 }, true],
        [{ id: 'A', orderable: true, stockLevel: 0.5, ats: 0.25 }, true],
        [{ id: 'A', orderable: true, stockLevel: Number.MIN_VALUE, ats: Number.MIN_VALUE }, true],
    ])('preserves native catalog orderability only with positive usable stock: %j', (inventory, expected) => {
        expect(hasUsableInventoryStock(inventory)).toBe(expected);
    });
    it.each([
        [0.25, true],
        [0.5, true],
        [0.75, false],
        [1, false],
        [0, false],
        [-0.25, false],
        [NaN, false],
        [Infinity, false],
    ])('qualifies fractional demand separately from catalog availability: %s', (quantity, expected) => {
        const record = { id: 'A', orderable: true, stockLevel: 0.75, ats: 0.5 };
        expect(hasUsableInventoryStock(record)).toBe(true);
        expect(hasInventoryStock(record, quantity)).toBe(expected);
        expect(hasInventoryStock(record)).toBe(false);
    });
    it.each([
        [undefined, false],
        [null, false],
        [{ id: 'A', orderable: true, stockLevel: 0 }, false],
        [{ id: 'A', orderable: true, stockLevel: 2 }, false],
        [{ id: 'A', orderable: true, stockLevel: 3, ats: 1 }, false],
        [{ id: 'A', orderable: false, stockLevel: 99 }, false],
        [{ id: 'A', orderable: true, stockLevel: 3, ats: 3 }, true],
        [{ id: 'A', orderable: true, stockLevel: 0, preorderable: true }, false],
    ])('checks physical stock and ATS for quantity three: %j', (inventory, expected) => {
        expect(hasInventoryStock(inventory, 3)).toBe(expected);
    });
    it('aggregates variants/SKUs across option lines', () => {
        expect([
            ...aggregateInventoryQuantities([
                { productId: 'v1', quantity: 2 },
                { productId: 'v1', quantity: 3 },
                { productId: 'v2', quantity: 1 },
            ]),
        ]).toEqual([
            ['v1', 5],
            ['v2', 1],
        ]);
        expect(() => aggregateInventoryQuantities([{ productId: 'v1', quantity: NaN }])).toThrow(
            'INVALID_INVENTORY_QUANTITY'
        );
    });
    it.each([
        [0.1, 0.2, 0.3],
        [0.2, 0.01, 0.21],
        [1e-7, 2e-7, 3e-7],
        [1.25e21, 2.5e21, 3.75e21],
    ])('compares duplicate fractional quantities %s + %s with exact stock %s', (first, second, total) => {
        const quantity = aggregateInventoryQuantities([
            { productId: 'weighted-sku', quantity: first },
            { productId: 'weighted-sku', quantity: second },
        ]).get('weighted-sku');
        expect(quantity).toBe(total);
        expect(hasInventoryStock({ id: 'A', orderable: true, stockLevel: total, ats: total }, quantity)).toBe(true);
        expect(hasInventoryStock({ id: 'A', orderable: true, stockLevel: total / 2, ats: total }, quantity)).toBe(
            false
        );
    });
    it('rejects a duplicate-SKU total that exceeds the numeric API range', () => {
        expect(() =>
            aggregateInventoryQuantities([
                { productId: 'sku', quantity: 1e308 },
                { productId: 'sku', quantity: 1e308 },
            ])
        ).toThrow('INVALID_INVENTORY_QUANTITY');
    });
    it.each([
        [1.1, 3, 1, 3.3],
        [3002399751580331, 3, 1, 9007199254740992],
        [3002399751580333, 3, 1, 9007199254741000],
        [0.1, 3, 1, 0.3],
        [0.55, 3, 0.5, 3.3],
        [3.3, 1, 3, 1.1],
        [0.3, 1, 0.1, 3],
        [1e-7, 3, 1, 3e-7],
        [1e308, 1e308, 1e308, 1e308],
        [1e-300, 1e-300, 1e-300, 1e-300],
        [1, 1, 3, 1 / 3],
        [Number.MIN_VALUE, 1, 1, Number.MIN_VALUE],
    ])('scales decimal component totals %s × %s ÷ %s', (quantity, multiplier, divisor, total) => {
        const result = scaleInventoryQuantity(quantity, multiplier, divisor);
        expect(result).toBe(total);
        expect(hasInventoryStock({ id: 'A', orderable: true, stockLevel: total, ats: total }, result)).toBe(true);
    });
    it('preserves the total duplicate-SKU budget after component multiplication', () => {
        const total = aggregateInventoryQuantities([
            { productId: 'sku', quantity: scaleInventoryQuantity(1.1, 3) },
            { productId: 'sku', quantity: 0.1 },
        ]).get('sku');
        expect(total).toBe(3.4);
        expect(hasInventoryStock({ id: 'A', orderable: true, stockLevel: 3.3, ats: 3.3 }, total)).toBe(false);
    });
    it.each([0, -1, NaN, Infinity, -Infinity])('rejects invalid decimal operands %s', (quantity) => {
        expect(() => scaleInventoryQuantity(quantity, 1)).toThrow(InventoryQuantityError);
        expect(() => scaleInventoryQuantity(1, quantity)).toThrow(InventoryQuantityError);
        expect(() => scaleInventoryQuantity(1, 1, quantity)).toThrow(InventoryQuantityError);
        expect(() => aggregateInventoryQuantities([{ productId: 'sku', quantity }])).toThrow(InventoryQuantityError);
    });
    it.each([
        [1e308, 1e308],
        [Number.MIN_VALUE, 0.1],
    ])('rejects unrepresentable consumption %s × %s', (first, second) => {
        expect(() => scaleInventoryQuantity(first, second)).toThrow(InventoryQuantityError);
    });
    it('batches and bounds concurrent explicit-list reads, retaining missing records as missing', async () => {
        let active = 0;
        let peak = 0;
        const getAvailability = vi.fn(
            async ({ params }: { params: { query: { productIds: string[]; inventoryIds: string[] } } }) => {
                active++;
                peak = Math.max(peak, active);
                await Promise.resolve();
                active--;
                return {
                    data: {
                        data: params.query.productIds
                            .filter((id) => id !== 'missing')
                            .map((id) => ({ id, inventories: [{ id: 'store-list', stockLevel: 2, orderable: true }] })),
                    },
                };
            }
        );
        const ids = [...Array.from({ length: 100 }, (_, index) => `sku${index}`), 'missing', 'sku0'];
        const records = await fetchInventoryRecords(
            { getAvailability } as unknown as Clients['shopperAvailability'],
            ids,
            'store-list'
        );
        expect(records.size).toBe(100);
        expect(records.has('missing')).toBe(false);
        expect(getAvailability).toHaveBeenCalledTimes(5);
        expect(peak).toBe(4);
        for (const [call] of getAvailability.mock.calls) {
            expect(call.params.query.inventoryIds).toEqual(['store-list']);
            expect(call.params.query.productIds.length).toBeLessThanOrEqual(24);
        }
    });
    it('treats the native all-filtered zero-result response as absent stock', async () => {
        const getAvailability = vi.fn().mockResolvedValue({ data: { limit: 0, total: 0 } });
        const client = { getAvailability } as unknown as Clients['shopperAvailability'];
        const records = await fetchInventoryRecords(client, ['offline-or-unknown'], 'verified-list');
        expect(records.size).toBe(0);
        expect(hasInventoryStock(records.get('offline-or-unknown'))).toBe(false);
    });
    it.each([
        { total: 1, limit: 1 },
        { total: 0 },
        { data: null, total: 0, limit: 0 },
    ])('rejects malformed responses instead of treating them as missing stock: %j', async (response) => {
        const getAvailability = vi.fn().mockResolvedValue({ data: response });
        const client = { getAvailability } as unknown as Clients['shopperAvailability'];
        await expect(fetchInventoryRecords(client, ['sku'], 'verified-list')).rejects.toThrow(
            'INVALID_INVENTORY_RESPONSE'
        );
    });
    it('reports native invalid-list responses as configuration errors instead of missing stock', async () => {
        const getAvailability = vi.fn().mockResolvedValue({ data: { data: [{ id: 'sku' }] } });
        const client = { getAvailability } as unknown as Clients['shopperAvailability'];
        await expect(fetchInventoryRecords(client, ['sku'], 'deleted-list')).rejects.toThrow('INVALID_INVENTORY_LIST');
    });
    it('keeps absent catalog products and empty record collections unavailable', async () => {
        const getAvailability = vi.fn().mockResolvedValue({
            data: { data: [{ id: 'sku', inventories: [] }] },
        });
        const client = { getAvailability } as unknown as Clients['shopperAvailability'];
        const records = await fetchInventoryRecords(client, ['sku', 'unknown-product'], 'store-list');
        expect(records.size).toBe(0);
        expect(hasInventoryStock(records.get('sku'))).toBe(false);
        expect(hasInventoryStock(records.get('unknown-product'))).toBe(false);
    });
    it('rejects fallback inventory and propagates provider failures', async () => {
        const getAvailability = vi.fn().mockResolvedValue({
            data: { data: [{ id: 'sku', inventories: [{ id: 'site-list', orderable: true, stockLevel: 10 }] }] },
        });
        const client = { getAvailability } as unknown as Clients['shopperAvailability'];
        await expect(fetchInventoryRecords(client, ['sku'], 'store-list')).rejects.toThrow('UNEXPECTED_INVENTORY_LIST');
        const error = new Error('provider outage');
        getAvailability.mockRejectedValueOnce(error);
        await expect(fetchInventoryRecords(client, ['sku'], 'store-list')).rejects.toBe(error);
        await expect(fetchInventoryRecords(client, ['sku'], 'a|b')).rejects.toThrow('INVALID_INVENTORY_LIST');
    });
});
