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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import { loadPdpPickupInventory } from './pdp-pickup-inventory.server';
import { fetchProductsByIds } from '@/lib/api/products.server';
import { resolveSelectedStore } from '@/extensions/store-locator/lib/resolve-selected-store.server';
import { AuthTokenInvalidError } from '@/scapi';
vi.mock('@/lib/api/products.server', () => ({ fetchProductsByIds: vi.fn() }));
vi.mock('@/extensions/store-locator/lib/resolve-selected-store.server', () => ({ resolveSelectedStore: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => ({ error: vi.fn() }) }));
const context = {} as Readonly<RouterContextProvider>;
const selection = { selectedStoreInfo: { id: 'A', inventoryId: 'inv-A' }, store: null, error: null };
describe('deferred PDP inventory', () => {
    it.each([
        'variant',
        'set',
        'bundle',
    ])('does not fetch %s pickup availability without an inventory ID', async (kind) => {
        const product = {
            id: 'master',
            type: { master: true },
            variationAttributes: [{ id: 'size', values: [{ value: 'S' }] }],
            variants: [{ productId: 'small', variationValues: { size: 'S' } }],
        };
        for (const selectedStoreInfo of [null, { id: 'store' }]) {
            const result = await loadPdpPickupInventory(
                context,
                Promise.resolve(
                    kind === 'variant'
                        ? product
                        : {
                              id: kind,
                              type: { [kind]: true },
                              ...(kind === 'set'
                                  ? { setProducts: [product] }
                                  : { bundledProducts: [{ id: product.id, quantity: 1, product }] }),
                          }
                ),
                undefined,
                Promise.resolve({ selectedStoreInfo, store: null, error: null })
            );
            expect(result.status).toBe('empty');
            expect(result.products).toEqual([]);
            expect(fetchProductsByIds).not.toHaveBeenCalled();
        }
    });
    beforeEach(() => {
        vi.mocked(resolveSelectedStore).mockResolvedValue(selection);
        vi.mocked(fetchProductsByIds)
            .mockReset()
            .mockResolvedValue([{ id: 'sku', inventories: [{ id: 'inv-A', stockLevel: 3, orderable: true }] }]);
    });
    it('waits for both independently started inputs and projects availability only', async () => {
        let release!: (value: typeof selection) => void;
        const held = new Promise<typeof selection>((resolve) => {
            release = resolve;
        });
        const promise = loadPdpPickupInventory(
            context,
            Promise.resolve({ id: 'sku', price: 42 }),
            new URLSearchParams(),
            held
        );
        await Promise.resolve();
        expect(fetchProductsByIds).not.toHaveBeenCalled();
        release(selection);
        const result = await promise;
        expect(fetchProductsByIds).toHaveBeenCalledWith(context, ['sku'], {
            expand: ['availability'],
            inventoryIds: ['inv-A'],
        });
        expect(result.products[0]).not.toHaveProperty('price');
        expect(result.status).toBe('resolved');
    });
    it('seeds exact default child SKUs and the bundle parent', async () => {
        await loadPdpPickupInventory(
            context,
            Promise.resolve({
                id: 'bundle',
                type: { bundle: true },
                bundledProducts: [
                    {
                        id: 'master',
                        quantity: 1,
                        product: {
                            id: 'master',
                            type: { master: true },
                            variationAttributes: [{ id: 'size', values: [{ value: 'S' }, { value: 'L' }] }],
                            variants: [
                                { productId: 'small', orderable: false, variationValues: { size: 'S' } },
                                { productId: 'large', orderable: true, variationValues: { size: 'L' } },
                            ],
                        },
                    },
                ],
            })
        );
        expect(fetchProductsByIds).toHaveBeenCalledWith(context, ['bundle', 'large'], expect.anything());
    });
    it('marks a successful missing store record unavailable rather than pending', async () => {
        vi.mocked(fetchProductsByIds).mockResolvedValue([{ id: 'sku', inventory: { id: 'site', ats: 9 } }]);
        const result = await loadPdpPickupInventory(context, Promise.resolve({ id: 'sku' }));
        expect(result.products[0].inventories).toEqual([{ id: 'inv-A', orderable: false, ats: 0, stockLevel: 0 }]);
    });
    it('never borrows a returned master record for the requested SKU', async () => {
        vi.mocked(fetchProductsByIds).mockResolvedValue([
            { id: 'master', inventories: [{ id: 'inv-A', stockLevel: 99 }] },
        ]);
        const result = await loadPdpPickupInventory(context, Promise.resolve({ id: 'sku' }));
        expect(result.products[0].id).toBe('sku');
        expect(result.products[0].inventories?.[0].stockLevel).toBe(0);
    });
    it('contains normalized late auth failures', async () => {
        vi.mocked(fetchProductsByIds).mockRejectedValue(
            new Error('normalized', { cause: new AuthTokenInvalidError('expired') })
        );
        const result = await loadPdpPickupInventory(context, Promise.resolve({ id: 'sku' }));
        expect(result.status).toBe('auth-error');
    });
    it('contains selection rejection immediately', async () => {
        const result = await loadPdpPickupInventory(
            context,
            Promise.resolve({ id: 'sku' }),
            undefined,
            Promise.reject(new Error('store failed'))
        );
        expect(result.status).toBe('error');
        expect(fetchProductsByIds).not.toHaveBeenCalled();
    });
});
