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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { createTestContext } from '@/lib/test-utils';
import { fetchProductById, fetchProductsByIds } from '@/lib/api/products.server';
import { fetchSearchProducts } from '@/lib/api/search.server';
import { loader as resourceLoader } from '@/routes/resource.api.client.$resource';
import { loader as stockLoader } from '@/routes/resource.store-stock';
import { encodeResource } from '@/lib/scapi/resource-encoding';
import type { ShopperProducts } from '@/scapi';
import { selectedStoreContext } from '@/extensions/store-locator/middlewares/selected-store.server';
import { shoppingContext } from '@/extensions/store-locator/lib/store-selection.server';
import { applyLocalInventory, getLocalInventoryContext, readCandidateStoreInventory } from './local-inventory.server';
import { scopeLocalInventorySearch, applyLocalSearchInventory } from './local-inventory-search.server';
import { assertLocalBasketStock } from '@/lib/cart/local-inventory.server';
import { validateCartInventory } from '@/lib/cart/inventory-validation';
import { isInStock, isStoreOutOfStock } from './inventory-utils';

const api = vi.hoisted(() => ({
    availability: vi.fn(),
    stores: vi.fn(),
    product: vi.fn(),
    products: vi.fn(),
    search: vi.fn(),
}));
vi.mock('@/middlewares/auth.server', () => ({ getAuth: () => ({ usid: 'guest-usid', userType: 'guest' }) }));
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({
        shopperAvailability: { getAvailability: api.availability },
        shopperStores: { getStores: api.stores },
        shopperProducts: { getProduct: api.product, getProducts: api.products },
        shopperSearch: { productSearch: api.search },
    }),
}));

function setup(nativeSearchVerified = false) {
    const context = createTestContext() as RouterContextProvider;
    const config = context.get(appConfigContext);
    const siteId = context.get(siteContext)?.site.id ?? 'missing-site';
    context.set(appConfigContext, {
        ...config,
        features: {
            ...config.features,
            localInventory: {
                enabled: true,
                inventoryListsBySite: { [siteId]: ['list-A', 'list-B'] },
                nativeSearchVerified,
            },
        },
    });
    context.set(selectedStoreContext, { id: 'A', inventoryId: 'list-A' });
    context.set(shoppingContext, {
        siteId,
        preparingStoreId: 'A',
        inventoryId: 'list-A',
        contextRevision: 'revision-A',
        selectionOrigin: 'explicit',
        committedAt: new Date().toISOString(),
    });
    return context;
}

beforeEach(() => {
    vi.clearAllMocks();
    api.availability.mockImplementation(async ({ params }) => {
        await Promise.resolve();
        return {
            data: {
                data: params.query.productIds
                    .filter((id: string) => id !== 'missing')
                    .map((id: string) => ({
                        id,
                        inventories: [{ id: params.query.inventoryIds[0], orderable: true, stockLevel: 3, ats: 3 }],
                    })),
            },
        };
    });
    api.product.mockResolvedValue({ data: { id: 'sku', inventory: { id: 'site', ats: 100, orderable: true } } });
    api.products.mockResolvedValue({
        data: { data: [{ id: 'sku', inventory: { id: 'site', ats: 100, orderable: true } }] },
    });
    api.search.mockResolvedValue({
        data: { total: 301, offset: 48, limit: 2, hits: [{ productId: 'missing' }, { productId: 'sku' }] },
    });
    api.stores.mockResolvedValue({ data: { data: [{ id: 'B', inventoryId: 'list-B' }] } });
});

describe('preparing-store inventory', () => {
    it('preserves fractional stock through product enrichment and downstream quantity validation', async () => {
        const context = setup();
        api.product.mockResolvedValue({ data: { id: 'weighted', minOrderQuantity: 0.25, stepQuantity: 0.25 } });
        api.availability.mockResolvedValue({
            data: {
                data: [{ id: 'weighted', inventories: [{ id: 'list-A', orderable: true, stockLevel: 0.5, ats: 0.5 }] }],
            },
        });
        const product = await fetchProductById(context, 'weighted');
        if (!product) throw new Error('Expected the weighted product');
        expect(product.inventory).toMatchObject({ id: 'list-A', orderable: true, stockLevel: 0.5, ats: 0.5 });
        expect(isInStock({ product, quantity: 0.25 })).toBe(true);
        expect(isInStock({ product, quantity: 0.5 })).toBe(true);
        expect(isInStock({ product, quantity: 0.75 })).toBe(false);
        expect(isStoreOutOfStock(product, undefined, 0.25)).toBe(false);

        const basket = {
            productItems: [
                { itemId: 'one', productId: 'weighted', quantity: 0.25, inventoryId: 'list-A' },
                { itemId: 'two', productId: 'weighted', quantity: 0.25, inventoryId: 'list-A' },
            ],
        };
        const products = { one: product, two: product };
        expect(validateCartInventory(basket, products).hasInventoryIssues).toBe(false);
        await expect(assertLocalBasketStock(context, basket)).resolves.toBeUndefined();
        const excessive = { productItems: [...basket.productItems, { ...basket.productItems[0], itemId: 'three' }] };
        expect(validateCartInventory(excessive, { ...products, three: product }).totalItemsWithIssues).toBe(3);
        await expect(assertLocalBasketStock(context, excessive)).rejects.toMatchObject({
            code: 'LOCAL_STOCK_UNAVAILABLE',
            status: 422,
        });
    });
    it('preserves sub-unit native orderability for variants, bundle children and set products', async () => {
        const context = setup();
        api.availability.mockImplementation(({ params }) =>
            Promise.resolve({
                data: {
                    data: params.query.productIds.map((id: string) => ({
                        id,
                        inventories: [{ id: 'list-A', orderable: true, stockLevel: 0.5, ats: 0.25 }],
                    })),
                },
            })
        );
        const [product] = await applyLocalInventory(context, [
            {
                id: 'parent',
                variants: [{ productId: 'variant' }],
                bundledProducts: [{ id: 'child', quantity: 0.25, product: { id: 'child', minOrderQuantity: 0.25 } }],
                setProducts: [{ id: 'set-child', minOrderQuantity: 0.25 }],
            },
        ]);
        expect(product.variants?.[0].orderable).toBe(true);
        expect(isInStock({ product, variant: product.variants?.[0], quantity: 0.25 })).toBe(true);
        expect(isInStock({ product, variant: product.variants?.[0], quantity: 0.5 })).toBe(false);
        for (const child of [product.bundledProducts?.[0].product, product.setProducts?.[0]]) {
            expect(child?.inventory?.orderable).toBe(true);
            expect(isInStock({ product: child, quantity: 0.25 })).toBe(true);
            expect(isInStock({ product: child, quantity: 0.5 })).toBe(false);
        }
    });
    it('uses the strict selected-list path from the shared product loaders and the browser resource', async () => {
        const context = setup();
        const product = await fetchProductById(context, 'sku', { inventoryIds: ['browser-list'], expand: ['prices'] });
        expect(api.product.mock.calls[0][0].params.query).toMatchObject({
            inventoryIds: ['list-A'],
            expand: ['prices', 'availability'],
        });
        expect(product?.inventory?.id).toBe('list-A');
        const products = await fetchProductsByIds(context, ['sku'], { inventoryIds: ['browser-list'] });
        expect(products[0].inventory?.id).toBe('list-A');
        const args = {
            context,
            params: {
                resource: encodeResource('shopperProducts', 'getProduct', {
                    params: { path: { id: 'sku' }, query: { inventoryIds: ['browser-list'] } },
                }),
            },
            request: new Request('http://localhost/resource/api/client/test'),
        };
        const response = await resourceLoader(args as never);
        expect(response.success).toBe(true);
        expect(api.product.mock.calls.at(-1)?.[0].params.query.inventoryIds).toEqual(['list-A']);
        expect(response).toMatchObject({ success: true, data: { inventory: { id: 'list-A' } } });
    });
    it('removes browser inventory scope after selection is cleared', async () => {
        const context = setup();
        context.set(selectedStoreContext, null);
        context.set(shoppingContext, null);
        const args = {
            context,
            params: {
                resource: encodeResource('shopperProducts', 'getProduct', {
                    params: { path: { id: 'sku' }, query: { inventoryIds: ['browser-list'] } },
                }),
            },
            request: new Request('http://localhost/resource/api/client/test'),
        };
        await resourceLoader(args as never);
        expect(api.product.mock.calls[0][0].params.query).not.toHaveProperty('inventoryIds');
        expect(api.availability).not.toHaveBeenCalled();
    });
    it('ignores site inventory and overlays variants, options and bundles without touching price fields', async () => {
        const context = setup();
        const product = {
            id: 'bundle',
            price: 9,
            inventory: { id: 'site', ats: 100, stockLevel: 100, orderable: true },
            type: { bundle: true },
            variants: [{ productId: 'missing', price: 12 }],
            bundledProducts: [{ quantity: 2, product: { id: 'child' } }],
        } as ShopperProducts.schemas['Product'];
        const [result] = await applyLocalInventory(context, [product]);
        expect(result.price).toBe(9);
        expect(result.inventory?.id).toBe('list-A');
        expect(result.variants?.[0].orderable).toBe(false);
        expect(result.bundledProducts?.[0].product.inventory?.id).toBe('list-A');
        expect(isInStock({ product: result, quantity: 4 })).toBe(false);
        expect(isInStock({ product: result, variant: result.variants?.[0], quantity: 1 })).toBe(false);
        expect(product.inventory?.id).toBe('site');
    });
    it('treats missing records and zero physical stock as unavailable, including deferred orders', async () => {
        const context = setup();
        api.availability.mockResolvedValueOnce({
            data: {
                data: [
                    {
                        id: 'zero',
                        inventories: [{ id: 'list-A', stockLevel: 0, ats: 100, orderable: true, backorderable: true }],
                    },
                ],
            },
        });
        const result = await applyLocalInventory(context, [
            { id: 'missing' },
            { id: 'zero' },
        ] as ShopperProducts.schemas['Product'][]);
        expect(result.map((product) => product.inventory?.orderable)).toEqual([false, false]);
        expect(isStoreOutOfStock(result[0], undefined)).toBe(true);
    });
    it('keeps configuration, invalid-list responses and API failures distinct from stock', async () => {
        const context = setup();
        context.set(selectedStoreContext, { id: 'A', inventoryId: 'unknown' });
        expect(() => getLocalInventoryContext(context)).toThrow('INVALID_STORE_MAPPING');
        context.set(shoppingContext, null);
        expect(() => getLocalInventoryContext(context)).toThrow('INVALID_INVENTORY_LIST');
        context.set(selectedStoreContext, { id: 'A', inventoryId: 'list-A' });
        const error = new Error('503 inventory API');
        api.availability.mockRejectedValueOnce(error);
        await expect(applyLocalInventory(context, [{ id: 'sku' }])).rejects.toBe(error);
        api.availability.mockResolvedValueOnce({
            data: { data: [{ id: 'sku', inventories: [{ id: 'site', orderable: true, stockLevel: 999 }] }] },
        });
        await expect(applyLocalInventory(context, [{ id: 'sku' }])).rejects.toThrow('UNEXPECTED_INVENTORY_LIST');
    });
    it.each([
        [{ limit: 0, total: 0 }, 200],
        [{ data: [{ id: 'sku' }], limit: 1, total: 1 }, 503],
    ])('distinguishes native all-missing stock from invalid-list shapes in the candidate resource: %j', async (native, status) => {
        const context = setup();
        api.availability.mockResolvedValueOnce({ data: native });
        const params = new URLSearchParams({
            candidateStoreId: 'B',
            items: JSON.stringify([{ productId: 'sku', quantity: 1 }]),
        });
        const request = new Request(`http://localhost/resource/store-stock?${params}`, {
            headers: { Origin: 'http://localhost' },
        });
        const response = await stockLoader({ context, request } as never);
        expect(response.status).toBe(status);
        const body = await response.json();
        if (status === 200) {
            expect(body.items).toEqual([{ productId: 'sku', quantity: 1, available: false, stockLevel: 0 }]);
        } else {
            expect(body.success).toBe(false);
            expect(body.items).toBeUndefined();
        }
        expect(context.get(selectedStoreContext)?.id).toBe('A');
    });
    it('aggregates fractional duplicate demand against exact candidate stock', async () => {
        const context = setup();
        api.availability.mockResolvedValueOnce({
            data: {
                data: [{ id: 'sku', inventories: [{ id: 'list-B', orderable: true, stockLevel: 0.3, ats: 0.3 }] }],
            },
        });
        const params = new URLSearchParams({
            candidateStoreId: 'B',
            items: JSON.stringify([
                { productId: 'sku', quantity: 0.1 },
                { productId: 'sku', quantity: 0.2 },
            ]),
        });
        const request = new Request(`http://localhost/resource/store-stock?${params}`, {
            headers: { Origin: 'http://localhost' },
        });
        const response = await stockLoader({ context, request } as never);
        expect(response.status).toBe(200);
        expect((await response.json()).items).toEqual([
            { productId: 'sku', quantity: 0.3, available: true, stockLevel: 0.3 },
        ]);
        expect(context.get(selectedStoreContext)?.id).toBe('A');
    });
    it('uses trusted candidate-store mapping for stock only and leaves committed selection intact', async () => {
        const context = setup();
        const before = context.get(shoppingContext);
        await readCandidateStoreInventory(context, 'B', ['sku']);
        expect(api.availability).toHaveBeenCalledWith({
            params: { query: { productIds: ['sku'], inventoryIds: ['list-B'] } },
        });
        expect(context.get(shoppingContext)).toBe(before);
        expect(context.get(selectedStoreContext)?.id).toBe('A');
    });
    it('aggregates duplicate SKU demand across option lines, delivery and bundle components', async () => {
        const context = setup();
        const basket = {
            productItems: [
                {
                    itemId: 'one',
                    productId: 'sku',
                    quantity: 2,
                    inventoryId: 'list-A',
                    optionItems: [{ optionId: 'wrap', optionValueId: 'yes' }],
                },
                {
                    itemId: 'bundle',
                    productId: 'bundle',
                    quantity: 1,
                    inventoryId: 'list-A',
                    bundledProductItems: [{ productId: 'sku', quantity: 2 }],
                },
            ],
        };
        await expect(assertLocalBasketStock(context, basket)).rejects.toMatchObject({
            code: 'LOCAL_STOCK_UNAVAILABLE',
            status: 422,
        });
        const products = await applyLocalInventory(context, [
            { id: 'sku' },
            { id: 'bundle', bundledProducts: [{ quantity: 2, product: { id: 'sku' } }] },
        ] as ShopperProducts.schemas['Product'][]);
        const validation = validateCartInventory(basket, { one: products[0], bundle: products[1] });
        expect(validation.totalItemsWithIssues).toBe(2);
        expect(validation.itemsExceedingInventory.map((issue) => issue.itemId)).toEqual(['one', 'bundle']);
    });
    it('permits incremental repairs but rejects new duplicate-SKU consumption', async () => {
        const context = setup();
        const basket = { productItems: [{ itemId: 'one', productId: 'sku', quantity: 5, inventoryId: 'list-A' }] };
        await expect(
            assertLocalBasketStock(context, basket, [{ ...basket.productItems[0], quantity: 4 }])
        ).resolves.toBeUndefined();
        expect(api.availability).not.toHaveBeenCalled();
        await expect(
            assertLocalBasketStock(context, basket, [...basket.productItems, { productId: 'sku', quantity: 1 }])
        ).rejects.toMatchObject({ code: 'LOCAL_STOCK_UNAVAILABLE' });
    });
    it('hands mixed-store baskets to the existing confirmed-switch boundary', async () => {
        const context = setup();
        await expect(
            assertLocalBasketStock(context, {
                productItems: [{ productId: 'sku', quantity: 1, inventoryId: 'list-B' }],
            })
        ).rejects.toMatchObject({ code: 'STORE_CHANGE_CONFIRMATION_REQUIRED', status: 409 });
        expect(api.availability).not.toHaveBeenCalled();
    });
});

describe('complete native result windows', () => {
    it.each([
        false,
        true,
    ])('keeps fractional stock orderable without altering a native window (filtered=%s)', async (hideUnavailable) => {
        const context = setup(true);
        api.availability.mockResolvedValue({
            data: {
                data: [
                    { id: 'fractional', inventories: [{ id: 'list-A', orderable: true, stockLevel: 0.5, ats: 0.25 }] },
                    { id: 'sku', inventories: [{ id: 'list-A', orderable: true, stockLevel: 3, ats: 3 }] },
                ],
            },
        });
        const native = { total: 301, offset: 48, limit: 2, hits: [{ productId: 'fractional' }, { productId: 'sku' }] };
        api.search.mockResolvedValue({ data: native });
        const result = await fetchSearchProducts(context, {
            offset: 48,
            limit: 2,
            refine: [`orderable_only=${hideUnavailable}`],
        });
        expect(result).toMatchObject({ total: 301, offset: 48, limit: 2 });
        expect(result.hits?.map((hit) => [hit.productId, hit.c_localInventoryAvailable])).toEqual([
            ['fractional', true],
            ['sku', true],
        ]);
        expect(native.hits).toEqual([{ productId: 'fractional' }, { productId: 'sku' }]);
        expect(api.product).not.toHaveBeenCalled();
        expect(api.products).not.toHaveBeenCalled();
    });
    it('rejects a native bundle hit with zero selected-list stock despite a stocked represented child', async () => {
        const context = setup(true);
        api.search.mockResolvedValue({
            data: {
                total: 102,
                offset: 96,
                limit: 24,
                hits: [
                    {
                        productId: 'bundle',
                        productType: { bundle: true },
                        orderable: true,
                        representedProduct: { id: 'stocked-child' },
                    },
                ],
            },
        });
        api.availability.mockResolvedValue({
            data: {
                data: [
                    { id: 'bundle', inventories: [{ id: 'list-A', orderable: false, stockLevel: 0, ats: 0 }] },
                    { id: 'stocked-child', inventories: [{ id: 'list-A', orderable: true, stockLevel: 8, ats: 8 }] },
                ],
            },
        });
        const result = await fetchSearchProducts(context, { offset: 96, refine: ['orderable_only=false'] });
        expect(result).toMatchObject({ total: 102, offset: 96, hits: [{ c_localInventoryAvailable: false }] });
        await expect(
            fetchSearchProducts(context, { offset: 96, refine: ['orderable_only=true'] })
        ).rejects.toMatchObject({ code: 'LOCAL_INVENTORY_INDEX_STALE', status: 503 });
    });
    it('keeps complete result counts and offsets through the shared search loader', async () => {
        const context = setup(true);
        api.search.mockResolvedValueOnce({
            data: { total: 301, offset: 48, limit: 2, hits: [{ productId: 'sku1' }, { productId: 'sku2' }] },
        });
        const result = await fetchSearchProducts(context, {
            q: 'milk',
            limit: 2,
            offset: 48,
            refine: ['ilids=browser-list', 'orderable_only=true'],
        });
        expect(api.search.mock.calls[0][0].params.query).toMatchObject({
            offset: 48,
            limit: 2,
            refine: ['ilids=list-A', 'orderable_only=true'],
        });
        expect(result.total).toBe(301);
        expect(result.offset).toBe(48);
        expect(result.hits?.map((hit) => hit.productId)).toEqual(['sku1', 'sku2']);
        // A stale/inconsistent index cannot be repaired by filtering one returned window.
        await expect(fetchSearchProducts(context, { refine: ['orderable_only=true'] })).rejects.toMatchObject({
            code: 'LOCAL_INVENTORY_INDEX_STALE',
            status: 503,
        });
    });
    it('replaces browser lists with the validated list before requesting a native result window', () => {
        const query = scopeLocalInventorySearch(setup(true), {
            q: 'milk',
            sort: 'price-low-to-high',
            offset: 48,
            limit: 24,
            refine: ['c_brand=Coop', 'ilids=browser-other', 'orderable_only=true'],
        });
        expect(query).toMatchObject({
            offset: 48,
            limit: 24,
            sort: 'price-low-to-high',
            refine: ['c_brand=Coop', 'ilids=list-A', 'orderable_only=true'],
        });
    });
    it('requires verified native semantics before enabling the hide-unavailable path', () => {
        expect(() => scopeLocalInventorySearch(setup(), { refine: ['orderable_only=true'] })).toThrow(
            'LOCAL_INVENTORY_SEARCH_NOT_VERIFIED'
        );
    });
    it('includes native availability in filtered search requests while retaining financial expansions', async () => {
        const context = setup(true);
        api.search.mockResolvedValue({ data: { hits: [], total: 0 } });
        await fetchSearchProducts(context, { currency: 'GBP', refine: ['orderable_only=true'] });
        expect(api.search.mock.calls[0][0].params.query).toMatchObject({
            currency: 'GBP',
            expand: expect.arrayContaining(['availability', 'prices', 'promotions']),
            refine: ['ilids=list-A', 'orderable_only=true'],
        });
    });
    it('preserves expansion defaults outside filtered store search and avoids duplicate availability', () => {
        const context = setup(true);
        const expand = ['prices', 'availability'] as const;
        expect(
            scopeLocalInventorySearch(context, { expand: [...expand], refine: ['orderable_only=true'] }).expand
        ).toEqual(expand);
        expect(
            scopeLocalInventorySearch(context, { expand: ['prices'], refine: ['orderable_only=false'] }).expand
        ).toEqual(['prices']);
        // An omitted expand already means all native expansions; don't replace it with a subset.
        expect(scopeLocalInventorySearch(context, { refine: ['orderable_only=true'] }).expand).toBeUndefined();
        context.set(selectedStoreContext, null);
        context.set(shoppingContext, null);
        expect(
            scopeLocalInventorySearch(context, { expand: ['prices'], refine: ['orderable_only=true'] }).expand
        ).toEqual(['prices']);
    });
    it('annotates unavailable windows without changing complete totals, order or pagination', async () => {
        const context = setup();
        const result = await applyLocalSearchInventory(context, {
            query: '',
            refinements: [],
            searchPhraseSuggestions: { suggestedTerms: [] },
            sortingOptions: [],
            total: 301,
            offset: 48,
            limit: 2,
            hits: [{ productId: 'missing' }, { productId: 'sku' }],
        });
        expect(result).toMatchObject({ total: 301, offset: 48, limit: 2 });
        expect(result.hits?.map((hit) => [hit.productId, hit.c_localInventoryAvailable])).toEqual([
            ['missing', false],
            ['sku', true],
        ]);
        expect(scopeLocalInventorySearch(context, { refine: ['ilids=other', 'orderable_only=false'] }).refine).toEqual([
            'orderable_only=false',
        ]);
    });
});
