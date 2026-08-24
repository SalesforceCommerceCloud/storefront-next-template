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

import { describe, it, expect } from 'vitest';
import {
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    getStoreInventoryById,
    isStoreOutOfStock,
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    isSiteOutOfStock,
    getEffectiveStockLevel,
    isInStock,
} from './inventory-utils';
import { masterProductWithInventories } from '@/components/__mocks__/master-product-with-inventories';
import { setProductWithInventories } from '@/components/__mocks__/set-product-with-inventories';
import { bundleProductWithInventories } from '@/components/__mocks__/bundle-product-with-inventories';
import type { ShopperProducts } from '@/scapi';

const mockProduct = masterProductWithInventories;
const mockSetProduct = setProductWithInventories;
const mockBundleProduct = bundleProductWithInventories;

describe('inventory-utils', () => {
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    describe('getStoreInventoryById', () => {
        it('returns inventory when found', () => {
            const result = getStoreInventoryById(mockProduct, 'inventory_m');
            expect(result).toEqual({
                ats: 996,
                backorderable: false,
                id: 'inventory_m',
                orderable: true,
                preorderable: false,
                stockLevel: 996,
            });
        });

        it('returns null when inventory not found', () => {
            const result = getStoreInventoryById(mockProduct, 'non-existent');
            expect(result).toBeNull();
        });

        it('returns null when product is undefined', () => {
            const result = getStoreInventoryById(undefined, 'inventory_m');
            expect(result).toBeNull();
        });

        it('returns null when inventoryId is undefined', () => {
            const result = getStoreInventoryById(mockProduct, undefined);
            expect(result).toBeNull();
        });

        it('returns null when product has no inventories', () => {
            const productWithoutInventories = { ...mockProduct, inventories: undefined };
            const result = getStoreInventoryById(productWithoutInventories, 'inventory_m');
            expect(result).toBeNull();
        });

        it('returns null when product has empty inventories array', () => {
            const productWithEmptyInventories = { ...mockProduct, inventories: [] };
            const result = getStoreInventoryById(productWithEmptyInventories, 'inventory_m');
            expect(result).toBeNull();
        });
    });

    describe('isStoreOutOfStock', () => {
        it('returns false when product is undefined', () => {
            expect(isStoreOutOfStock(undefined, 'inventory_m')).toBe(false);
        });

        it('returns false when selectedStoreInventoryId is undefined', () => {
            expect(isStoreOutOfStock(mockProduct, undefined)).toBe(false);
        });

        it('returns false when product is in stock at store', () => {
            expect(isStoreOutOfStock(mockProduct, 'inventory_m', 1)).toBe(false);
        });

        it('returns true when product is out of stock at store', () => {
            expect(isStoreOutOfStock(mockProduct, 'inventory_out_of_stock', 1)).toBe(true);
        });

        it('returns true when inventory is not found', () => {
            expect(isStoreOutOfStock(mockProduct, 'non-existent', 1)).toBe(true);
        });

        it('returns true when quantity exceeds stock level', () => {
            expect(isStoreOutOfStock(mockProduct, 'inventory_m', 1000)).toBe(true);
        });

        it('returns false when quantity is within stock level', () => {
            expect(isStoreOutOfStock(mockProduct, 'inventory_m', 100)).toBe(false);
        });

        it('returns true when inventory exists but is not orderable', () => {
            const productWithUnorderableInventory = {
                ...mockProduct,
                inventories: [
                    {
                        id: 'inventory_m',
                        stockLevel: 100,
                        orderable: false,
                    },
                ],
            };
            expect(isStoreOutOfStock(productWithUnorderableInventory, 'inventory_m', 1)).toBe(true);
        });

        describe('for product sets', () => {
            it('returns false when all child products are in stock', () => {
                // For sets, inventory should be pre-calculated and stored on the parent product
                // The minimum stock across children is 376 (from child 1)
                const setWithCalculatedInventory = {
                    ...mockSetProduct,
                    inventories: [
                        {
                            id: 'inventory_m',
                            stockLevel: 376, // Minimum of children: min(376, 495)
                            orderable: true,
                            ats: 376,
                            backorderable: false,
                            preorderable: false,
                        },
                    ],
                };
                expect(isStoreOutOfStock(setWithCalculatedInventory, 'inventory_m', 1)).toBe(false);
            });

            it('returns true when any child product is out of stock', () => {
                // For sets with a child out of stock, calculated inventory should reflect that
                const setWithCalculatedInventory = {
                    ...mockSetProduct,
                    inventories: [
                        {
                            id: 'inventory_out_of_stock',
                            stockLevel: 0, // One child is out of stock, so set is out of stock
                            orderable: false,
                            ats: 0,
                            backorderable: false,
                            preorderable: false,
                        },
                    ],
                };
                expect(isStoreOutOfStock(setWithCalculatedInventory, 'inventory_out_of_stock', 1)).toBe(true);
            });

            it('returns true when any child product has no inventory', () => {
                // Set with no inventory for this store
                const setWithNoInventory = {
                    ...mockSetProduct,
                    inventories: [], // No inventory for the requested store
                };
                expect(isStoreOutOfStock(setWithNoInventory, 'non-existent', 1)).toBe(true);
            });

            it('returns true when any child product has insufficient stock', () => {
                // Set with insufficient stock
                const setWithLowStock = {
                    ...mockSetProduct,
                    inventories: [
                        {
                            id: 'inventory_m',
                            stockLevel: 100, // Less than requested 500
                            orderable: true,
                            ats: 100,
                            backorderable: false,
                            preorderable: false,
                        },
                    ],
                };
                expect(isStoreOutOfStock(setWithLowStock, 'inventory_m', 500)).toBe(true);
            });

            it('returns true when any child product is not orderable', () => {
                // Set with unorderable inventory
                const setWithUnorderableInventory = {
                    ...mockSetProduct,
                    inventories: [
                        {
                            id: 'inventory_m',
                            stockLevel: 100,
                            orderable: false, // Not orderable
                            ats: 100,
                            backorderable: false,
                            preorderable: false,
                        },
                    ],
                };
                expect(isStoreOutOfStock(setWithUnorderableInventory, 'inventory_m', 1)).toBe(true);
            });
        });

        describe('for bundles', () => {
            it('returns false when bundle is in stock at store', () => {
                expect(isStoreOutOfStock(mockBundleProduct, 'inventory_m', 1)).toBe(false);
            });

            it('returns true when bundle is out of stock at store', () => {
                expect(isStoreOutOfStock(mockBundleProduct, 'inventory_out_of_stock', 1)).toBe(true);
            });
        });
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    describe('isSiteOutOfStock', () => {
        it('returns false when product is undefined', () => {
            expect(isSiteOutOfStock(undefined)).toBe(false);
        });

        it('returns false when product is in stock', () => {
            const productWithInventory = {
                ...mockProduct,
                inventory: {
                    id: 'site-inventory',
                    ats: 100,
                    orderable: true,
                },
            };
            expect(isSiteOutOfStock(productWithInventory, 1)).toBe(false);
        });

        it('returns true when product has no inventory', () => {
            const productWithoutInventory = {
                ...mockProduct,
                inventory: undefined,
            };
            expect(isSiteOutOfStock(productWithoutInventory, 1)).toBe(true);
        });

        it('returns true when product is out of stock', () => {
            const productOutOfStock = {
                ...mockProduct,
                inventory: {
                    id: 'site-inventory',
                    ats: 0,
                    orderable: false,
                },
            };
            expect(isSiteOutOfStock(productOutOfStock, 1)).toBe(true);
        });

        it('returns true when quantity exceeds ats', () => {
            const productLowStock = {
                ...mockProduct,
                inventory: {
                    id: 'site-inventory',
                    ats: 5,
                    orderable: true,
                },
            };
            expect(isSiteOutOfStock(productLowStock, 10)).toBe(true);
        });

        it('returns false when quantity is within ats', () => {
            const productWithStock = {
                ...mockProduct,
                inventory: {
                    id: 'site-inventory',
                    ats: 100,
                    orderable: true,
                },
            };
            expect(isSiteOutOfStock(productWithStock, 10)).toBe(false);
        });

        it('returns true when product is not orderable', () => {
            const unorderableProduct = {
                ...mockProduct,
                inventory: {
                    id: 'site-inventory',
                    ats: 100,
                    orderable: false,
                },
            };
            expect(isSiteOutOfStock(unorderableProduct, 1)).toBe(true);
        });

        describe('for product sets', () => {
            it('returns false when set has sufficient stock (pre-calculated on parent)', () => {
                // For sets, inventory should be pre-calculated on the parent
                const setWithCalculatedInventory = {
                    ...mockSetProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 50, // Pre-calculated minimum across children
                        orderable: true,
                        stockLevel: 50,
                    },
                };
                expect(isSiteOutOfStock(setWithCalculatedInventory, 1)).toBe(false);
            });

            it('returns true when set is out of stock (pre-calculated reflects child out of stock)', () => {
                // When a child is out of stock, parent inventory reflects that
                const setWithCalculatedInventory = {
                    ...mockSetProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 0, // Pre-calculated: one child out of stock
                        orderable: false,
                    },
                };
                expect(isSiteOutOfStock(setWithCalculatedInventory, 1)).toBe(true);
            });

            it('returns true when quantity exceeds pre-calculated stock', () => {
                // Parent inventory shows minimum available sets
                const setWithLimitedStock = {
                    ...mockSetProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 5, // Pre-calculated: can make 5 complete sets
                        orderable: true,
                    },
                };
                expect(isSiteOutOfStock(setWithLimitedStock, 10)).toBe(true);
            });

            it('returns true when set is not orderable (pre-calculated reflects child not orderable)', () => {
                // When a child is not orderable, parent reflects that
                const setWithUnorderableChild = {
                    ...mockSetProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100,
                        orderable: false, // Pre-calculated: one child not orderable
                    },
                };
                expect(isSiteOutOfStock(setWithUnorderableChild, 1)).toBe(true);
            });
        });

        describe('for bundles', () => {
            it('returns false when bundle is in stock', () => {
                const bundleWithInventory = {
                    ...mockBundleProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100,
                        orderable: true,
                    },
                };
                expect(isSiteOutOfStock(bundleWithInventory, 1)).toBe(false);
            });

            it('returns true when bundle is out of stock', () => {
                const bundleOutOfStock = {
                    ...mockBundleProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 0,
                        orderable: false,
                    },
                };
                expect(isSiteOutOfStock(bundleOutOfStock, 1)).toBe(true);
            });
        });
    });

    describe('getEffectiveStockLevel', () => {
        it('returns 0 when product is undefined', () => {
            expect(
                getEffectiveStockLevel({ product: undefined as any, isPickup: true, storeInventoryId: 'inventory_m' })
            ).toBe(0);
        });

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        describe('with store inventory', () => {
            it('returns store stock level when store is selected', () => {
                expect(
                    getEffectiveStockLevel({ product: mockProduct, isPickup: true, storeInventoryId: 'inventory_m' })
                ).toBe(996);
            });

            it('returns 0 when store inventory is not found', () => {
                expect(
                    getEffectiveStockLevel({ product: mockProduct, isPickup: true, storeInventoryId: 'non-existent' })
                ).toBe(0);
            });

            it('returns 0 when store inventory has no stockLevel', () => {
                const productWithUndefinedStock = {
                    ...mockProduct,
                    inventories: [
                        {
                            id: 'inventory_m',
                            stockLevel: undefined,
                            orderable: true,
                        },
                    ],
                };
                expect(
                    getEffectiveStockLevel({
                        product: productWithUndefinedStock,
                        isPickup: true,
                        storeInventoryId: 'inventory_m',
                    })
                ).toBe(0);
            });
        });
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        describe('without store inventory (site inventory)', () => {
            it('returns product inventory ats when no variant provided', () => {
                const productWithInventory = {
                    ...mockProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100,
                        orderable: true,
                    },
                };
                expect(
                    getEffectiveStockLevel({
                        product: productWithInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                    })
                ).toBe(100);
            });

            it('returns variant inventory ats when variant is provided', () => {
                const variant = {
                    orderable: true,
                    price: 299.99,
                    productId: '640188016716M',
                    inventory: {
                        id: 'variant-inventory',
                        ats: 50,
                        orderable: true,
                    },
                } as ShopperProducts.schemas['Variant'] & { inventory?: ShopperProducts.schemas['Inventory'] };
                const productWithInventory = {
                    ...mockProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100,
                        orderable: true,
                    },
                };
                expect(
                    getEffectiveStockLevel({
                        product: productWithInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                        variant,
                    })
                ).toBe(50);
            });

            it('returns product inventory ats when variant has no inventory', () => {
                const variant: ShopperProducts.schemas['Variant'] = {
                    orderable: true,
                    price: 299.99,
                    productId: '640188016716M',
                };
                const productWithInventory = {
                    ...mockProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100,
                        orderable: true,
                    },
                };
                expect(
                    getEffectiveStockLevel({
                        product: productWithInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                        variant,
                    })
                ).toBe(100);
            });

            it('returns 0 when neither product nor variant has inventory', () => {
                const variant: ShopperProducts.schemas['Variant'] = {
                    orderable: true,
                    price: 299.99,
                    productId: '640188016716M',
                };
                const productWithoutInventory = {
                    ...mockProduct,
                    inventory: undefined,
                };
                expect(
                    getEffectiveStockLevel({
                        product: productWithoutInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                        variant,
                    })
                ).toBe(0);
            });
        });

        describe('for product sets', () => {
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            it('returns minimum stock level across all children with store inventory', () => {
                // For sets, inventory should be pre-calculated on the parent
                const setWithCalculatedInventory = {
                    ...mockSetProduct,
                    inventories: [
                        {
                            id: 'inventory_m',
                            stockLevel: 376, // Pre-calculated minimum from children
                            orderable: true,
                            ats: 376,
                            backorderable: false,
                            preorderable: false,
                        },
                    ],
                };
                expect(
                    getEffectiveStockLevel({
                        product: setWithCalculatedInventory,
                        isPickup: true,
                        storeInventoryId: 'inventory_m',
                    })
                ).toBe(376);
            });
            // @sfdc-extension-block-end SFDC_EXT_BOPIS

            it('returns minimum ats across all children without store inventory', () => {
                // For sets, inventory should be pre-calculated on the parent
                const setWithCalculatedInventory = {
                    ...mockSetProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 50, // Pre-calculated minimum from children
                        orderable: true,
                        stockLevel: 50,
                    },
                };
                expect(
                    getEffectiveStockLevel({
                        product: setWithCalculatedInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                    })
                ).toBe(50);
            });

            it('returns 0 when any child has no inventory with store', () => {
                expect(
                    getEffectiveStockLevel({
                        product: mockSetProduct,
                        isPickup: true,
                        storeInventoryId: 'non-existent',
                    })
                ).toBe(0);
            });

            it('returns 0 when child has no inventory (pre-calculated on parent)', () => {
                // When a child has no inventory, parent inventory is pre-calculated as 0
                const setWithNoChildInventory = {
                    ...mockSetProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 0, // Pre-calculated: one child has no inventory
                        orderable: false,
                    },
                };
                expect(
                    getEffectiveStockLevel({
                        product: setWithNoChildInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                    })
                ).toBe(0);
            });
        });

        describe('for bundles', () => {
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            it('returns store stock level when store is selected', () => {
                expect(
                    getEffectiveStockLevel({
                        product: mockBundleProduct,
                        isPickup: true,
                        storeInventoryId: 'inventory_m',
                    })
                ).toBe(9966);
            });
            // @sfdc-extension-block-end SFDC_EXT_BOPIS

            it('returns product inventory ats when no store is selected', () => {
                const bundleWithInventory = {
                    ...mockBundleProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100,
                        orderable: true,
                    },
                };
                expect(
                    getEffectiveStockLevel({
                        product: bundleWithInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                    })
                ).toBe(100);
            });
        });
    });

    describe('isInStock', () => {
        it('returns false when product is undefined', () => {
            expect(
                isInStock({ product: undefined, isPickup: true, storeInventoryId: 'inventory_m', quantity: 1 })
            ).toBe(false);
        });

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        describe('with store inventory', () => {
            it('returns true when product is in stock at store', () => {
                expect(
                    isInStock({ product: mockProduct, isPickup: true, storeInventoryId: 'inventory_m', quantity: 1 })
                ).toBe(true);
            });

            it('returns false when product is out of stock at store', () => {
                expect(
                    isInStock({
                        product: mockProduct,
                        isPickup: true,
                        storeInventoryId: 'inventory_out_of_stock',
                        quantity: 1,
                    })
                ).toBe(false);
            });

            it('returns false when inventory is not found', () => {
                expect(
                    isInStock({ product: mockProduct, isPickup: true, storeInventoryId: 'non-existent', quantity: 1 })
                ).toBe(false);
            });

            it('returns false when quantity exceeds stock level', () => {
                expect(
                    isInStock({ product: mockProduct, isPickup: true, storeInventoryId: 'inventory_m', quantity: 1000 })
                ).toBe(false);
            });

            it('returns true when quantity is within stock level', () => {
                expect(
                    isInStock({ product: mockProduct, isPickup: true, storeInventoryId: 'inventory_m', quantity: 100 })
                ).toBe(true);
            });

            it('returns false when inventory exists but is not orderable', () => {
                const productWithUnorderableInventory = {
                    ...mockProduct,
                    inventories: [
                        {
                            id: 'inventory_m',
                            stockLevel: 100,
                            orderable: false,
                        },
                    ],
                };
                expect(
                    isInStock({
                        product: productWithUnorderableInventory,
                        isPickup: true,
                        storeInventoryId: 'inventory_m',
                        quantity: 1,
                    })
                ).toBe(false);
            });
        });
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        describe('without store inventory (site inventory)', () => {
            it('returns true when product is in stock', () => {
                const productWithInventory = {
                    ...mockProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100,
                        orderable: true,
                    },
                };
                expect(
                    isInStock({
                        product: productWithInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                        quantity: 1,
                    })
                ).toBe(true);
            });

            it('returns false when product has no inventory', () => {
                const productWithoutInventory = {
                    ...mockProduct,
                    inventory: undefined,
                };
                expect(
                    isInStock({
                        product: productWithoutInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                        quantity: 1,
                    })
                ).toBe(false);
            });

            it('returns false when product is out of stock', () => {
                const productOutOfStock = {
                    ...mockProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 0,
                        orderable: false,
                    },
                };
                expect(
                    isInStock({ product: productOutOfStock, isPickup: false, storeInventoryId: undefined, quantity: 1 })
                ).toBe(false);
            });

            it('returns false when quantity exceeds ats', () => {
                const productLowStock = {
                    ...mockProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 5,
                        orderable: true,
                    },
                };
                expect(
                    isInStock({ product: productLowStock, isPickup: false, storeInventoryId: undefined, quantity: 10 })
                ).toBe(false);
            });

            it('returns true when quantity is within ats', () => {
                const productWithStock = {
                    ...mockProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100,
                        orderable: true,
                    },
                };
                expect(
                    isInStock({ product: productWithStock, isPickup: false, storeInventoryId: undefined, quantity: 10 })
                ).toBe(true);
            });

            it('returns false when product is not orderable', () => {
                const unorderableProduct = {
                    ...mockProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100,
                        orderable: false,
                    },
                };
                expect(
                    isInStock({
                        product: unorderableProduct,
                        isPickup: false,
                        storeInventoryId: undefined,
                        quantity: 1,
                    })
                ).toBe(false);
            });

            it('uses variant inventory when variant is provided', () => {
                const variant = {
                    orderable: true,
                    price: 299.99,
                    productId: '640188016716M',
                    inventory: {
                        id: 'variant-inventory',
                        ats: 50,
                        orderable: true,
                    },
                } as ShopperProducts.schemas['Variant'] & { inventory?: ShopperProducts.schemas['Inventory'] };
                const productWithInventory = {
                    ...mockProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100,
                        orderable: true,
                    },
                };
                expect(
                    isInStock({
                        product: productWithInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                        quantity: 1,
                        variant,
                    })
                ).toBe(true);
            });

            it('falls back to product inventory when variant has no inventory', () => {
                const variant: ShopperProducts.schemas['Variant'] = {
                    orderable: true,
                    price: 299.99,
                    productId: '640188016716M',
                };
                const productWithInventory = {
                    ...mockProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100,
                        orderable: true,
                    },
                };
                expect(
                    isInStock({
                        product: productWithInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                        quantity: 1,
                        variant,
                    })
                ).toBe(true);
            });

            it('returns false when variant inventory is out of stock', () => {
                const variant = {
                    orderable: true,
                    price: 299.99,
                    productId: '640188016716M',
                    inventory: {
                        id: 'variant-inventory',
                        ats: 0,
                        orderable: false,
                    },
                } as ShopperProducts.schemas['Variant'] & { inventory?: ShopperProducts.schemas['Inventory'] };
                const productWithInventory = {
                    ...mockProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100,
                        orderable: true,
                    },
                };
                expect(
                    isInStock({
                        product: productWithInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                        quantity: 1,
                        variant,
                    })
                ).toBe(false);
            });

            it('uses selected variant store inventory for pickup', () => {
                const variant = {
                    orderable: true,
                    productId: '640188016716M',
                    inventories: [
                        {
                            id: 'store-inventory',
                            stockLevel: 0,
                            orderable: false,
                        },
                    ],
                } as ShopperProducts.schemas['Variant'] & { inventories?: ShopperProducts.schemas['Inventory'][] };
                const productWithStoreInventory = {
                    ...mockProduct,
                    inventories: [
                        {
                            id: 'store-inventory',
                            stockLevel: 10,
                            orderable: true,
                        },
                    ],
                };

                expect(
                    isInStock({
                        product: productWithStoreInventory,
                        isPickup: true,
                        storeInventoryId: 'store-inventory',
                        quantity: 1,
                        variant,
                    })
                ).toBe(false);
            });
        });

        describe('for product sets', () => {
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            it('returns true when all child products are in stock at store', () => {
                // For sets, inventory should be pre-calculated on the parent
                const setWithCalculatedInventory = {
                    ...mockSetProduct,
                    inventories: [
                        {
                            id: 'inventory_m',
                            stockLevel: 376, // Pre-calculated minimum from children
                            orderable: true,
                            ats: 376,
                            backorderable: false,
                            preorderable: false,
                        },
                    ],
                };
                expect(
                    isInStock({
                        product: setWithCalculatedInventory,
                        isPickup: true,
                        storeInventoryId: 'inventory_m',
                        quantity: 1,
                    })
                ).toBe(true);
            });

            it('returns false when any child product is out of stock at store', () => {
                expect(
                    isInStock({
                        product: mockSetProduct,
                        isPickup: true,
                        storeInventoryId: 'inventory_out_of_stock',
                        quantity: 1,
                    })
                ).toBe(false);
            });

            it('returns false when any child product has no inventory at store', () => {
                expect(
                    isInStock({
                        product: mockSetProduct,
                        isPickup: true,
                        storeInventoryId: 'non-existent',
                        quantity: 1,
                    })
                ).toBe(false);
            });

            it('returns false when any child product has insufficient stock at store', () => {
                expect(
                    isInStock({
                        product: mockSetProduct,
                        isPickup: true,
                        storeInventoryId: 'inventory_m',
                        quantity: 500,
                    })
                ).toBe(false);
            });
            // @sfdc-extension-block-end SFDC_EXT_BOPIS

            it('returns true when all child products are in stock (site inventory)', () => {
                // For sets, inventory should be pre-calculated on the parent
                const setWithCalculatedInventory = {
                    ...mockSetProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100, // Pre-calculated minimum from children
                        orderable: true,
                        stockLevel: 100,
                    },
                };
                expect(
                    isInStock({
                        product: setWithCalculatedInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                        quantity: 1,
                    })
                ).toBe(true);
            });

            it('returns false when set is out of stock (pre-calculated reflects child out of stock)', () => {
                // When a child is out of stock, parent inventory reflects that
                const setWithCalculatedInventory = {
                    ...mockSetProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 0, // Pre-calculated: one child out of stock
                        orderable: false,
                    },
                };
                expect(
                    isInStock({
                        product: setWithCalculatedInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                        quantity: 1,
                    })
                ).toBe(false);
            });

            it('returns false when quantity exceeds pre-calculated stock', () => {
                // Parent inventory shows minimum available sets
                const setWithLimitedStock = {
                    ...mockSetProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 5, // Pre-calculated: can make 5 complete sets
                        orderable: true,
                    },
                };
                expect(
                    isInStock({
                        product: setWithLimitedStock,
                        isPickup: false,
                        storeInventoryId: undefined,
                        quantity: 10,
                    })
                ).toBe(false);
            });

            it('returns false when set is not orderable (pre-calculated reflects child not orderable)', () => {
                // When a child is not orderable, parent reflects that
                const setWithUnorderableChild = {
                    ...mockSetProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100,
                        orderable: false, // Pre-calculated: one child not orderable
                    },
                };
                expect(
                    isInStock({
                        product: setWithUnorderableChild,
                        isPickup: false,
                        storeInventoryId: undefined,
                        quantity: 1,
                    })
                ).toBe(false);
            });
        });

        describe('for bundles', () => {
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            it('returns true when bundle is in stock at store', () => {
                expect(
                    isInStock({
                        product: mockBundleProduct,
                        isPickup: true,
                        storeInventoryId: 'inventory_m',
                        quantity: 1,
                    })
                ).toBe(true);
            });

            it('returns false when bundle is out of stock at store', () => {
                expect(
                    isInStock({
                        product: mockBundleProduct,
                        isPickup: true,
                        storeInventoryId: 'inventory_out_of_stock',
                        quantity: 1,
                    })
                ).toBe(false);
            });
            // @sfdc-extension-block-end SFDC_EXT_BOPIS

            it('returns true when bundle is in stock (site inventory)', () => {
                const bundleWithInventory = {
                    ...mockBundleProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 100,
                        orderable: true,
                    },
                };
                expect(
                    isInStock({
                        product: bundleWithInventory,
                        isPickup: false,
                        storeInventoryId: undefined,
                        quantity: 1,
                    })
                ).toBe(true);
            });

            it('returns false when bundle is out of stock (site inventory)', () => {
                const bundleOutOfStock = {
                    ...mockBundleProduct,
                    inventory: {
                        id: 'site-inventory',
                        ats: 0,
                        orderable: false,
                    },
                };
                expect(
                    isInStock({ product: bundleOutOfStock, isPickup: false, storeInventoryId: undefined, quantity: 1 })
                ).toBe(false);
            });
        });
    });
});
