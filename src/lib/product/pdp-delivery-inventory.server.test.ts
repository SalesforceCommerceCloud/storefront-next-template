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
import type { RouterContextProvider } from 'react-router';
import { AuthTokenInvalidError, type ShopperProducts } from '@/scapi';
import { seedPdpDeliveryInventory } from './pdp-delivery-inventory.server';

const getAvailability = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-clients.server', () => ({ createApiClients: () => ({ shopperAvailability: { getAvailability } }) }));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => ({ error: vi.fn(), debug: vi.fn(), warn: vi.fn() }) }));
const context = {} as Readonly<RouterContextProvider>;
const inventory = { id: 'site', ats: 7, stockLevel: 7, orderable: true };
type InventoryProduct = ShopperProducts.schemas['Product'] & {
    variants?: Array<ShopperProducts.schemas['Variant'] & { inventory?: ShopperProducts.schemas['Inventory'] }>;
};
const withInventory = (product: ShopperProducts.schemas['Product'] | null | undefined) =>
    product as InventoryProduct | undefined;
const child = (id = 'child'): ShopperProducts.schemas['Product'] => ({
    id,
    type: { master: true },
    inventory: { ...inventory, stockLevel: 99 },
    variationAttributes: [{ id: 'size', values: [{ value: 'S' }, { value: 'L' }] }],
    variants: [
        { productId: `${id}-S`, orderable: false, variationValues: { size: 'S' } },
        { productId: `${id}-L`, orderable: true, variationValues: { size: 'L' } },
    ],
});
describe('initial PDP delivery inventory', () => {
    beforeEach(() => {
        getAvailability.mockReset().mockImplementation(({ params }) =>
            Promise.resolve({
                data: { data: params.query.productIds.map((id: string) => ({ id, inventories: [inventory] })) },
            })
        );
    });
    it('seeds the explicit parent SKU without borrowing master availability', async () => {
        const result = await seedPdpDeliveryInventory(context, child(), new URLSearchParams('size=S'));
        expect(withInventory(result)?.variants?.[0].inventory).toEqual(inventory);
        expect(withInventory(result)?.variants?.[1].inventory).toBeUndefined();
        expect(getAvailability).toHaveBeenCalledExactlyOnceWith({
            params: {
                query: {
                    productIds: ['child-S'],
                },
            },
        });
    });
    it.each(['set', 'bundle'] as const)('uses default and explicit nested child SKUs for a %s', async (kind) => {
        const children = [child('a'), child('b')];
        const product = {
            id: kind,
            type: { [kind]: true },
            inventory,
            ...(kind === 'set'
                ? { setProducts: children }
                : {
                      bundledProducts: children.map((childProduct) => ({
                          id: childProduct.id,
                          quantity: 1,
                          product: childProduct,
                      })),
                  }),
        };
        const result = await seedPdpDeliveryInventory(context, product, new URLSearchParams('a=size%3DS'));
        const seeded = result?.setProducts ?? result?.bundledProducts?.map((item) => item.product);
        expect(withInventory(seeded?.[0])?.variants?.[0].inventory).toEqual(inventory);
        expect(withInventory(seeded?.[1])?.variants?.[1].inventory).toEqual(inventory);
        expect(seeded?.map((childProduct) => childProduct?.inventory)).toEqual([inventory, inventory]);
        expect(getAvailability.mock.calls[0][0].params.query.productIds).toEqual(['a-S', 'b-L']);
    });
    it('reuses only exact inventory and deduplicates missing child SKUs', async () => {
        const a = child('a');
        a.variants = a.variants?.map((variant) => (variant.productId === 'a-L' ? { ...variant, inventory } : variant));
        const result = await seedPdpDeliveryInventory(context, {
            id: 'set',
            type: { set: true },
            setProducts: [a, child('b'), child('b'), { id: 'standard', inventory }],
        });
        expect(getAvailability.mock.calls[0][0].params.query.productIds).toEqual(['b-L']);
        expect(result?.setProducts?.[0].inventory).toEqual(inventory);
    });
    it('leaves an ambiguous parent unselected and does not fetch its master', async () => {
        const product = child();
        expect(await seedPdpDeliveryInventory(context, product)).toBe(product);
        expect(getAvailability).not.toHaveBeenCalled();
    });
    it('marks a successful missing exact SKU unavailable', async () => {
        getAvailability.mockResolvedValue({ data: { data: [{ id: 'child', inventories: [inventory] }] } });
        const result = await seedPdpDeliveryInventory(context, child(), new URLSearchParams('size=S'));
        expect(withInventory(result)?.variants?.[0].inventory).toMatchObject({
            ats: 0,
            stockLevel: 0,
            orderable: false,
        });
    });
    it('uses the existing 24-ID batching contract for large sets', async () => {
        await seedPdpDeliveryInventory(context, {
            id: 'set',
            type: { set: true },
            setProducts: Array.from({ length: 25 }, (_, i) => ({ id: `sku-${i}` })),
        });
        expect(getAvailability.mock.calls.map(([args]) => args.params.query.productIds.length)).toEqual([24, 1]);
        for (const [args] of getAvailability.mock.calls) {
            expect(Object.keys(args.params.query)).toEqual(['productIds']);
        }
    });
    it('keeps a usable parent on supplemental failure but preserves the auth sentinel', async () => {
        const product = child();
        getAvailability.mockRejectedValue(new Error('network'));
        expect(await seedPdpDeliveryInventory(context, product, new URLSearchParams('size=S'))).toBe(product);
        getAvailability.mockRejectedValue(new AuthTokenInvalidError('expired'));
        await expect(seedPdpDeliveryInventory(context, product, new URLSearchParams('size=S'))).rejects.toBeInstanceOf(
            AuthTokenInvalidError
        );
    });
    it('does not borrow another SKU from a partial response', async () => {
        getAvailability.mockResolvedValue({ data: { data: [{ id: 'a-L', inventories: [inventory] }] } });
        const result = await seedPdpDeliveryInventory(context, {
            id: 'set',
            type: { set: true },
            setProducts: [child('a'), child('b')],
        });
        expect(result?.setProducts?.[0].inventory).toEqual(inventory);
        expect(result?.setProducts?.[1].inventory).toMatchObject({ id: 'unavailable', orderable: false, ats: 0 });
    });
    it.each([
        undefined,
        [],
        [null],
    ])('marks missing or malformed default inventory unavailable: %s', async (inventories) => {
        getAvailability.mockResolvedValue({ data: { data: [{ id: 'child-S', inventories }] } });
        const result = await seedPdpDeliveryInventory(context, child(), new URLSearchParams('size=S'));
        expect(withInventory(result)?.variants?.[0].inventory).toMatchObject({
            id: 'unavailable',
            stockLevel: 0,
            orderable: false,
        });
    });
    it('preserves optional stock fields without substituting master stock', async () => {
        getAvailability.mockResolvedValue({
            data: { data: [{ id: 'child-S', inventories: [{ id: 'site', orderable: true }] }] },
        });
        const result = await seedPdpDeliveryInventory(context, child(), new URLSearchParams('size=S'));
        expect(withInventory(result)?.variants?.[0].inventory).toEqual({ id: 'site', orderable: true });
    });
    it('keeps the original parent when any supplemental chunk fails', async () => {
        const product = {
            id: 'set',
            type: { set: true },
            setProducts: Array.from({ length: 25 }, (_, i) => ({ id: `sku-${i}` })),
        };
        getAvailability.mockRejectedValueOnce(new Error('chunk failed'));
        expect(await seedPdpDeliveryInventory(context, product)).toBe(product);
        expect(getAvailability).toHaveBeenCalledTimes(2);
    });
});
