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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ShopperBasketsV2 } from '@/scapi';
import {
    getPickupItemsFromBasket,
    getInventoryIdsFromPickupShipments,
    getStoreIdsFromBasket,
    getFirstPickupStoreId,
    getFirstPickupShipmentId,
    getStoreIdForBasketItem,
    getPickupProductItemsForStore,
    filterPickupProductItems,
    filterDeliveryShippingMethods,
    isStorePickup,
    getPickupShipment,
} from './basket-utils';

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(),
}));

vi.mock('@/extensions/bopis/lib/api/shipment.server', () => ({
    updateShipmentForPickup: vi.fn(),
}));

beforeEach(() => {
    vi.resetAllMocks();
});

describe('getPickupItemsFromBasket', () => {
    it('returns empty map when basket is undefined', () => {
        const result = getPickupItemsFromBasket(undefined);
        expect(result.size).toBe(0);
    });

    it('returns empty map when basket has no shipments', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            productItems: [
                {
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    quantity: 1,
                },
            ],
        };
        const result = getPickupItemsFromBasket(basket);
        expect(result.size).toBe(0);
    });

    it('returns empty map when basket has no product items', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'me',
                    c_fromStoreId: 'store-1',
                },
            ],
        };
        const result = getPickupItemsFromBasket(basket);
        expect(result.size).toBe(0);
    });

    it('extracts pickup items when shipment has c_fromStoreId', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
            productItems: [
                {
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1',
                    quantity: 1,
                },
                {
                    productId: 'product-2',
                    inventoryId: 'inventory-B',
                    shipmentId: 'shipment-1',
                    quantity: 2,
                },
            ],
        };

        const result = getPickupItemsFromBasket(basket);

        expect(result.size).toBe(2);
        expect(result.get('product-1')).toEqual({
            inventoryId: 'inventory-A',
            storeId: 'store-123',
        });
        expect(result.get('product-2')).toEqual({
            inventoryId: 'inventory-B',
            storeId: 'store-123',
        });
    });

    it('ignores items without inventoryId', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
            productItems: [
                {
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1',
                    quantity: 1,
                },
                {
                    productId: 'product-2',
                    // Missing inventoryId
                    shipmentId: 'shipment-1',
                    quantity: 2,
                },
            ],
        };

        const result = getPickupItemsFromBasket(basket);

        expect(result.size).toBe(1);
        expect(result.get('product-1')).toEqual({
            inventoryId: 'inventory-A',
            storeId: 'store-123',
        });
        expect(result.has('product-2')).toBe(false);
    });

    it('ignores items when shipment has no c_fromStoreId', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    // Missing c_fromStoreId - this is a regular delivery shipment
                },
            ],
            productItems: [
                {
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1',
                    quantity: 1,
                },
                {
                    productId: 'product-2',
                    inventoryId: 'inventory-B',
                    shipmentId: 'shipment-1',
                    quantity: 2,
                },
            ],
        };

        const result = getPickupItemsFromBasket(basket);

        expect(result.size).toBe(0);
    });

    it('ignores items without productId', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
            productItems: [
                {
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1',
                    quantity: 1,
                },
                {
                    // Missing productId
                    inventoryId: 'inventory-B',
                    shipmentId: 'shipment-1',
                    quantity: 2,
                } as ShopperBasketsV2.schemas['ProductItem'],
            ],
        };

        const result = getPickupItemsFromBasket(basket);

        expect(result.size).toBe(1);
        expect(result.get('product-1')).toEqual({
            inventoryId: 'inventory-A',
            storeId: 'store-123',
        });
    });

    it('ignores items without shipmentId', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
            productItems: [
                {
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1',
                    quantity: 1,
                },
                {
                    productId: 'product-2',
                    inventoryId: 'inventory-B',
                    // Missing shipmentId
                    quantity: 2,
                },
            ],
        };

        const result = getPickupItemsFromBasket(basket);

        expect(result.size).toBe(1);
        expect(result.get('product-1')).toEqual({
            inventoryId: 'inventory-A',
            storeId: 'store-123',
        });
        expect(result.has('product-2')).toBe(false);
    });

    it('handles duplicate productIds by keeping the last one', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
            productItems: [
                {
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1',
                    quantity: 1,
                },
                {
                    productId: 'product-1',
                    inventoryId: 'inventory-B',
                    shipmentId: 'shipment-1',
                    quantity: 2,
                },
            ],
        };

        const result = getPickupItemsFromBasket(basket);

        expect(result.size).toBe(1);
        // Last item wins when there are duplicates
        expect(result.get('product-1')).toEqual({
            inventoryId: 'inventory-B',
            storeId: 'store-123',
        });
    });

    it('handles multiple shipments with mixed pickup and delivery', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
                {
                    shipmentId: 'shipment-2',
                    // No c_fromStoreId - regular delivery
                },
            ],
            productItems: [
                {
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1', // Pickup shipment
                    quantity: 1,
                },
                {
                    productId: 'product-2',
                    inventoryId: 'inventory-B',
                    shipmentId: 'shipment-2', // Delivery shipment
                    quantity: 2,
                },
            ],
        };

        const result = getPickupItemsFromBasket(basket);

        // Only items from pickup shipment are included
        expect(result.size).toBe(1);
        expect(result.get('product-1')).toEqual({
            inventoryId: 'inventory-A',
            storeId: 'store-123',
        });
        expect(result.has('product-2')).toBe(false);
    });

    it('handles multiple pickup shipments from different stores', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: 'store-456',
                },
            ],
            productItems: [
                {
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1',
                    quantity: 1,
                },
                {
                    productId: 'product-2',
                    inventoryId: 'inventory-B',
                    shipmentId: 'shipment-2',
                    quantity: 2,
                },
            ],
        };

        const result = getPickupItemsFromBasket(basket);

        // Both items are pickup items from different stores
        expect(result.size).toBe(2);
        expect(result.get('product-1')).toEqual({
            inventoryId: 'inventory-A',
            storeId: 'store-123',
        });
        expect(result.get('product-2')).toEqual({
            inventoryId: 'inventory-B',
            storeId: 'store-456',
        });
    });
});

describe('getInventoryIdsFromPickupShipments', () => {
    it('should return empty array for undefined basket', () => {
        const result = getInventoryIdsFromPickupShipments(undefined);
        expect(result).toEqual([]);
    });

    it('should return empty array for null basket', () => {
        const result = getInventoryIdsFromPickupShipments(null);
        expect(result).toEqual([]);
    });

    it('should return empty array when basket has no shipments', () => {
        const basket = {
            basketId: 'basket-1',
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getInventoryIdsFromPickupShipments(basket);
        expect(result).toEqual([]);
    });

    it('should return empty array when basket has no product items', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getInventoryIdsFromPickupShipments(basket);
        expect(result).toEqual([]);
    });

    it('should return empty array when no shipments have c_fromStoreId', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    // No c_fromStoreId - regular delivery shipment
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-global',
                    shipmentId: 'shipment-1',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getInventoryIdsFromPickupShipments(basket);
        expect(result).toEqual([]);
    });

    it('should extract inventory ID from single pickup item', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-store-123',
                    shipmentId: 'shipment-1',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getInventoryIdsFromPickupShipments(basket);
        expect(result).toEqual(['inventory-store-123']);
    });

    it('should extract unique inventory IDs from multiple pickup items', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-store-123',
                    shipmentId: 'shipment-1',
                },
                {
                    itemId: 'item-2',
                    productId: 'product-2',
                    inventoryId: 'inventory-store-123',
                    shipmentId: 'shipment-1',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getInventoryIdsFromPickupShipments(basket);
        expect(result).toEqual(['inventory-store-123']);
    });

    it('should ignore items in non-pickup shipments', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
                {
                    shipmentId: 'shipment-2',
                    // No c_fromStoreId - regular delivery
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-store-123',
                    shipmentId: 'shipment-1',
                },
                {
                    itemId: 'item-2',
                    productId: 'product-2',
                    inventoryId: 'inventory-global',
                    shipmentId: 'shipment-2',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getInventoryIdsFromPickupShipments(basket);
        expect(result).toEqual(['inventory-store-123']);
    });

    it('should ignore items without inventoryId', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-store-123',
                    shipmentId: 'shipment-1',
                },
                {
                    itemId: 'item-2',
                    productId: 'product-2',
                    // Missing inventoryId
                    shipmentId: 'shipment-1',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getInventoryIdsFromPickupShipments(basket);
        expect(result).toEqual(['inventory-store-123']);
    });

    it('should ignore items without shipmentId', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-store-123',
                    shipmentId: 'shipment-1',
                },
                {
                    itemId: 'item-2',
                    productId: 'product-2',
                    inventoryId: 'inventory-store-456',
                    // Missing shipmentId
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getInventoryIdsFromPickupShipments(basket);
        expect(result).toEqual(['inventory-store-123']);
    });

    it('should handle multiple pickup shipments from different stores', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: 'store-456',
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-store-123',
                    shipmentId: 'shipment-1',
                },
                {
                    itemId: 'item-2',
                    productId: 'product-2',
                    inventoryId: 'inventory-store-456',
                    shipmentId: 'shipment-2',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getInventoryIdsFromPickupShipments(basket);
        // Should return sorted array
        expect(result).toEqual(['inventory-store-123', 'inventory-store-456']);
    });

    it('should return sorted array of inventory IDs', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-zebra',
                    shipmentId: 'shipment-1',
                },
                {
                    itemId: 'item-2',
                    productId: 'product-2',
                    inventoryId: 'inventory-apple',
                    shipmentId: 'shipment-1',
                },
                {
                    itemId: 'item-3',
                    productId: 'product-3',
                    inventoryId: 'inventory-banana',
                    shipmentId: 'shipment-1',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getInventoryIdsFromPickupShipments(basket);
        expect(result).toEqual(['inventory-apple', 'inventory-banana', 'inventory-zebra']);
    });

    it('should handle mixed shipments (pickup and delivery) correctly', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-pickup',
                    c_fromStoreId: 'store-123',
                },
                {
                    shipmentId: 'shipment-delivery',
                    // No c_fromStoreId
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-store-123',
                    shipmentId: 'shipment-pickup',
                },
                {
                    itemId: 'item-2',
                    productId: 'product-2',
                    inventoryId: 'inventory-global',
                    shipmentId: 'shipment-delivery',
                },
                {
                    itemId: 'item-3',
                    productId: 'product-3',
                    inventoryId: 'inventory-store-123',
                    shipmentId: 'shipment-pickup',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getInventoryIdsFromPickupShipments(basket);
        // Should only include inventory from pickup shipment, not delivery
        expect(result).toEqual(['inventory-store-123']);
    });

    it('should ignore shipments without shipmentId even if they have c_fromStoreId', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    // Missing shipmentId
                    c_fromStoreId: 'store-123',
                },
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: 'store-456',
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-store-456',
                    shipmentId: 'shipment-2',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getInventoryIdsFromPickupShipments(basket);
        expect(result).toEqual(['inventory-store-456']);
    });
});

describe('getStoreIdsFromBasket', () => {
    it('should return empty array for undefined basket', () => {
        const result = getStoreIdsFromBasket(undefined);
        expect(result).toEqual([]);
    });

    it('should return empty array for null basket', () => {
        const result = getStoreIdsFromBasket(null);
        expect(result).toEqual([]);
    });

    it('should return empty array when basket has no shipments', () => {
        const basket = {
            basketId: 'basket-1',
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getStoreIdsFromBasket(basket);
        expect(result).toEqual([]);
    });

    it('should return empty array when basket has empty shipments array', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getStoreIdsFromBasket(basket);
        expect(result).toEqual([]);
    });

    it('should return empty array when no shipments have c_fromStoreId', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    // No c_fromStoreId - regular delivery shipment
                },
                {
                    shipmentId: 'shipment-2',
                    // No c_fromStoreId - regular delivery shipment
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getStoreIdsFromBasket(basket);
        expect(result).toEqual([]);
    });

    it('should extract single store ID from pickup shipment', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getStoreIdsFromBasket(basket);
        expect(result).toEqual(['store-123']);
    });

    it('should extract unique store IDs from multiple pickup shipments', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: 'store-456',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getStoreIdsFromBasket(basket);
        expect(result).toHaveLength(2);
        expect(result).toContain('store-123');
        expect(result).toContain('store-456');
    });

    it('should return sorted array of store IDs', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-zebra',
                },
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: 'store-apple',
                },
                {
                    shipmentId: 'shipment-3',
                    c_fromStoreId: 'store-banana',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getStoreIdsFromBasket(basket);
        expect(result).toEqual(['store-apple', 'store-banana', 'store-zebra']);
    });

    it('should remove duplicate store IDs', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: 'store-123',
                },
                {
                    shipmentId: 'shipment-3',
                    c_fromStoreId: 'store-456',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getStoreIdsFromBasket(basket);
        expect(result).toEqual(['store-123', 'store-456']);
    });

    it('should ignore shipments without c_fromStoreId in mixed basket', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
                {
                    shipmentId: 'shipment-2',
                    // No c_fromStoreId - regular delivery
                },
                {
                    shipmentId: 'shipment-3',
                    c_fromStoreId: 'store-456',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getStoreIdsFromBasket(basket);
        expect(result).toEqual(['store-123', 'store-456']);
    });

    it('should ignore empty string c_fromStoreId', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: '',
                },
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: 'store-123',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getStoreIdsFromBasket(basket);
        // Empty strings are falsy in JS and should be excluded (invalid store ID)
        expect(result).toEqual(['store-123']);
    });

    it('should handle numeric store IDs as strings', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: '123',
                },
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: '456',
                },
                {
                    shipmentId: 'shipment-3',
                    c_fromStoreId: '001',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getStoreIdsFromBasket(basket);
        // Alphabetical sort treats them as strings
        expect(result).toEqual(['001', '123', '456']);
    });

    it('should work with real-world basket structure', () => {
        const basket = {
            basketId: 'basket-abc123',
            shipments: [
                {
                    shipmentId: 'pickup-shipment-1',
                    c_fromStoreId: 'NYC-001',
                },
                {
                    shipmentId: 'pickup-shipment-2',
                    c_fromStoreId: 'LA-005',
                },
                {
                    shipmentId: 'delivery-shipment-1',
                    // Regular delivery - no c_fromStoreId
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-A',
                    inventoryId: 'inventory-NYC-001',
                    shipmentId: 'pickup-shipment-1',
                },
                {
                    itemId: 'item-2',
                    productId: 'product-B',
                    inventoryId: 'inventory-LA-005',
                    shipmentId: 'pickup-shipment-2',
                },
                {
                    itemId: 'item-3',
                    productId: 'product-C',
                    inventoryId: 'inventory-global',
                    shipmentId: 'delivery-shipment-1',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getStoreIdsFromBasket(basket);
        expect(result).toEqual(['LA-005', 'NYC-001']);
    });
});

describe('getStoreIdForBasketItem', () => {
    it('should return undefined for null/undefined basket', () => {
        expect(getStoreIdForBasketItem(null, 'item-1')).toBeUndefined();
        expect(getStoreIdForBasketItem(undefined, 'item-1')).toBeUndefined();
    });

    it('should return undefined when itemId is undefined', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [{ shipmentId: 'shipment-1', c_fromStoreId: 'store-123' }],
            productItems: [{ itemId: 'item-1', productId: 'product-1', shipmentId: 'shipment-1' }],
        } as ShopperBasketsV2.schemas['Basket'];

        expect(getStoreIdForBasketItem(basket, undefined)).toBeUndefined();
    });

    it('should return undefined when itemId is empty string', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [{ shipmentId: 'shipment-1', c_fromStoreId: 'store-123' }],
            productItems: [{ itemId: 'item-1', productId: 'product-1', shipmentId: 'shipment-1' }],
        } as ShopperBasketsV2.schemas['Basket'];

        expect(getStoreIdForBasketItem(basket, '')).toBeUndefined();
    });

    it('should return undefined when item is not found', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [{ shipmentId: 'shipment-1', c_fromStoreId: 'store-123' }],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    shipmentId: 'shipment-1',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        expect(getStoreIdForBasketItem(basket, 'item-999')).toBeUndefined();
    });

    it('should return undefined for delivery items (no c_fromStoreId)', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [{ shipmentId: 'shipment-1' }], // No c_fromStoreId
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    shipmentId: 'shipment-1',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        expect(getStoreIdForBasketItem(basket, 'item-1')).toBeUndefined();
    });

    it('should return store ID for pickup items', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [{ shipmentId: 'shipment-1', c_fromStoreId: 'store-123' }],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    shipmentId: 'shipment-1',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        expect(getStoreIdForBasketItem(basket, 'item-1')).toBe('store-123');
    });

    it('should handle mixed basket with pickup and delivery items', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                { shipmentId: 'pickup-1', c_fromStoreId: 'store-NYC' },
                { shipmentId: 'pickup-2', c_fromStoreId: 'store-LA' },
                { shipmentId: 'delivery-1' }, // No c_fromStoreId
            ],
            productItems: [
                { itemId: 'item-1', productId: 'product-A', shipmentId: 'pickup-1' },
                { itemId: 'item-2', productId: 'product-B', shipmentId: 'pickup-2' },
                { itemId: 'item-3', productId: 'product-C', shipmentId: 'delivery-1' },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        expect(getStoreIdForBasketItem(basket, 'item-1')).toBe('store-NYC');
        expect(getStoreIdForBasketItem(basket, 'item-2')).toBe('store-LA');
        expect(getStoreIdForBasketItem(basket, 'item-3')).toBeUndefined();
    });
});

describe('filterPickupProductItems', () => {
    it('should return empty array when basket is undefined', () => {
        const result = filterPickupProductItems(undefined);
        expect(result).toEqual([]);
    });

    it('should return empty array when basket has no product items', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-1',
                },
            ],
        };
        const result = filterPickupProductItems(basket);
        expect(result).toEqual([]);
    });

    it('should return empty array when basket has no shipments', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            productItems: [
                {
                    productId: 'product-1',
                    quantity: 1,
                    shipmentId: 'shipment-1',
                },
            ],
        };
        const result = filterPickupProductItems(basket);
        expect(result).toEqual([]);
    });

    it('should return empty array when no shipments have c_fromStoreId', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    // No c_fromStoreId - regular delivery
                },
            ],
            productItems: [
                {
                    productId: 'product-1',
                    quantity: 1,
                    shipmentId: 'shipment-1',
                },
            ],
        };
        const result = filterPickupProductItems(basket);
        expect(result).toEqual([]);
    });

    it('should filter items that are in pickup shipments', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-1',
                },
                {
                    shipmentId: 'shipment-2',
                    // No c_fromStoreId - delivery shipment
                },
            ],
            productItems: [
                {
                    productId: 'product-1',
                    quantity: 1,
                    shipmentId: 'shipment-1',
                },
                {
                    productId: 'product-2',
                    quantity: 2,
                    shipmentId: 'shipment-2',
                },
                {
                    productId: 'product-3',
                    quantity: 3,
                    shipmentId: 'shipment-1',
                },
            ],
        };
        const result = filterPickupProductItems(basket);
        expect(result).toHaveLength(2);
        expect(result[0].productId).toBe('product-1');
        expect(result[1].productId).toBe('product-3');
    });

    it('should exclude items in delivery shipments', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-1',
                },
                {
                    shipmentId: 'shipment-2',
                    // No c_fromStoreId - delivery shipment
                },
            ],
            productItems: [
                {
                    productId: 'product-1',
                    quantity: 1,
                    shipmentId: 'shipment-1',
                },
                {
                    productId: 'product-2',
                    quantity: 2,
                    shipmentId: 'shipment-2',
                },
            ],
        };
        const result = filterPickupProductItems(basket);
        expect(result).toHaveLength(1);
        expect(result[0].productId).toBe('product-1');
    });

    it('should exclude items without shipmentId', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-1',
                },
            ],
            productItems: [
                {
                    productId: 'product-1',
                    quantity: 1,
                    shipmentId: 'shipment-1',
                },
                {
                    productId: 'product-2',
                    quantity: 2,
                    // No shipmentId
                },
            ],
        };
        const result = filterPickupProductItems(basket);
        expect(result).toHaveLength(1);
        expect(result[0].productId).toBe('product-1');
    });

    it('should handle items with empty shipmentId string', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-1',
                },
            ],
            productItems: [
                {
                    productId: 'product-1',
                    quantity: 1,
                    shipmentId: 'shipment-1',
                },
                {
                    productId: 'product-2',
                    quantity: 2,
                    shipmentId: '',
                },
            ],
        };
        const result = filterPickupProductItems(basket);
        expect(result).toHaveLength(1);
        expect(result[0].productId).toBe('product-1');
    });

    it('should return all items when all are in pickup shipments', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-1',
                },
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: 'store-2',
                },
            ],
            productItems: [
                {
                    productId: 'product-1',
                    quantity: 1,
                    shipmentId: 'shipment-1',
                },
                {
                    productId: 'product-2',
                    quantity: 2,
                    shipmentId: 'shipment-2',
                },
                {
                    productId: 'product-3',
                    quantity: 3,
                    shipmentId: 'shipment-1',
                },
            ],
        };
        const result = filterPickupProductItems(basket);
        expect(result).toHaveLength(3);
        expect(result.map((item) => item.productId)).toEqual(['product-1', 'product-2', 'product-3']);
    });

    it('should preserve all item properties in filtered results', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-1',
                },
                {
                    shipmentId: 'shipment-2',
                    // No c_fromStoreId - delivery shipment
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    quantity: 1,
                    price: 10.99,
                    shipmentId: 'shipment-1',
                },
                {
                    itemId: 'item-2',
                    productId: 'product-2',
                    quantity: 2,
                    price: 20.99,
                    shipmentId: 'shipment-2',
                },
            ],
        };
        const result = filterPickupProductItems(basket);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            itemId: 'item-1',
            productId: 'product-1',
            quantity: 1,
            price: 10.99,
            shipmentId: 'shipment-1',
        });
    });
});

describe('getFirstPickupStoreId', () => {
    it('should return undefined for undefined basket', () => {
        const result = getFirstPickupStoreId(undefined);
        expect(result).toBeUndefined();
    });

    it('should return undefined for null basket', () => {
        const result = getFirstPickupStoreId(null);
        expect(result).toBeUndefined();
    });

    it('should return undefined when basket has no shipments', () => {
        const basket = {
            basketId: 'basket-1',
            productItems: [],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getFirstPickupStoreId(basket);
        expect(result).toBeUndefined();
    });

    it('should return undefined when no shipments have c_fromStoreId', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    // No c_fromStoreId - regular delivery
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getFirstPickupStoreId(basket);
        expect(result).toBeUndefined();
    });

    it('should return store ID from first shipment with c_fromStoreId', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getFirstPickupStoreId(basket);
        expect(result).toBe('store-123');
    });

    it('should return first store ID when multiple shipments have c_fromStoreId', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: 'store-456',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getFirstPickupStoreId(basket);
        expect(result).toBe('store-123');
    });

    it('should skip shipments without c_fromStoreId and return first pickup store', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    // No c_fromStoreId - regular delivery
                },
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: 'store-456',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getFirstPickupStoreId(basket);
        expect(result).toBe('store-456');
    });

    it('should ignore shipments without shipmentId even if they have c_fromStoreId', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                {
                    // Missing shipmentId
                    c_fromStoreId: 'store-123',
                },
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: 'store-456',
                },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getFirstPickupStoreId(basket);
        // Should still find the first valid shipment with c_fromStoreId
        expect(result).toBe('store-123');
    });
});

describe('getFirstPickupShipmentId', () => {
    it('should return undefined for undefined basket', () => {
        const result = getFirstPickupShipmentId(undefined);
        expect(result).toBeUndefined();
    });

    it('should return undefined for null basket', () => {
        const result = getFirstPickupShipmentId(null);
        expect(result).toBeUndefined();
    });

    it('should return undefined when basket has no shipments', () => {
        const basket = {
            basketId: 'basket-1',
            productItems: [],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getFirstPickupShipmentId(basket);
        expect(result).toBeUndefined();
    });

    it('should return undefined when no shipments have c_fromStoreId', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [{ shipmentId: 'shipment-1' }],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getFirstPickupShipmentId(basket);
        expect(result).toBeUndefined();
    });

    it('should return shipment ID from first shipment with c_fromStoreId', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [{ shipmentId: 'pickup-shipment-1', c_fromStoreId: 'store-123' }],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getFirstPickupShipmentId(basket);
        expect(result).toBe('pickup-shipment-1');
    });

    it('should return first pickup shipment ID when multiple shipments exist', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [
                { shipmentId: 'delivery-1' },
                { shipmentId: 'pickup-1', c_fromStoreId: 'store-123' },
                { shipmentId: 'pickup-2', c_fromStoreId: 'store-456' },
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        const result = getFirstPickupShipmentId(basket);
        expect(result).toBe('pickup-1');
    });
});

describe('getPickupProductItemsForStore', () => {
    it('should return empty array when basket is undefined', () => {
        const result = getPickupProductItemsForStore(undefined, 'store-123');
        expect(result).toEqual([]);
    });

    it('should return empty array when basket has no shipments', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            productItems: [
                {
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    quantity: 1,
                },
            ],
        };

        const result = getPickupProductItemsForStore(basket, 'store-123');
        expect(result).toEqual([]);
    });

    it('should return empty array when basket has no product items', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
        };

        const result = getPickupProductItemsForStore(basket, 'store-123');
        expect(result).toEqual([]);
    });

    it('should return empty array when no shipments match the storeId', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1',
                    quantity: 1,
                },
            ],
        };

        const result = getPickupProductItemsForStore(basket, 'store-456');
        expect(result).toEqual([]);
    });

    it('should return product items from shipments matching the storeId', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1',
                    quantity: 1,
                },
                {
                    itemId: 'item-2',
                    productId: 'product-2',
                    inventoryId: 'inventory-B',
                    shipmentId: 'shipment-1',
                    quantity: 2,
                },
            ],
        };

        const result = getPickupProductItemsForStore(basket, 'store-123');
        expect(result).toHaveLength(2);
        expect(result[0].productId).toBe('product-1');
        expect(result[1].productId).toBe('product-2');
    });

    it('should filter items by specific storeId when multiple stores exist', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: 'store-456',
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1',
                    quantity: 1,
                },
                {
                    itemId: 'item-2',
                    productId: 'product-2',
                    inventoryId: 'inventory-B',
                    shipmentId: 'shipment-2',
                    quantity: 2,
                },
            ],
        };

        const result = getPickupProductItemsForStore(basket, 'store-123');
        expect(result).toHaveLength(1);
        expect(result[0].productId).toBe('product-1');
    });

    it('should return items from all shipments matching the storeId', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: 'store-123', // Same store
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1',
                    quantity: 1,
                },
                {
                    itemId: 'item-2',
                    productId: 'product-2',
                    inventoryId: 'inventory-B',
                    shipmentId: 'shipment-2',
                    quantity: 2,
                },
            ],
        };

        const result = getPickupProductItemsForStore(basket, 'store-123');
        expect(result).toHaveLength(2);
        expect(result[0].productId).toBe('product-1');
        expect(result[1].productId).toBe('product-2');
    });

    it('should ignore items without shipmentId', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: 'store-123',
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1',
                    quantity: 1,
                },
                {
                    itemId: 'item-2',
                    productId: 'product-2',
                    inventoryId: 'inventory-B',
                    // Missing shipmentId
                    quantity: 2,
                },
            ],
        };

        const result = getPickupProductItemsForStore(basket, 'store-123');
        expect(result).toHaveLength(1);
        expect(result[0].productId).toBe('product-1');
    });

    it('should ignore shipments without shipmentId even if they match storeId', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    // Missing shipmentId
                    c_fromStoreId: 'store-123',
                } as unknown as ShopperBasketsV2.schemas['Shipment'],
                {
                    shipmentId: 'shipment-2',
                    c_fromStoreId: 'store-123',
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-2',
                    quantity: 1,
                },
            ],
        };

        const result = getPickupProductItemsForStore(basket, 'store-123');
        expect(result).toHaveLength(1);
        expect(result[0].productId).toBe('product-1');
    });

    it('should return empty array when storeId is empty string (empty strings are falsy)', () => {
        const basket: ShopperBasketsV2.schemas['Basket'] = {
            basketId: 'test-basket',
            shipments: [
                {
                    shipmentId: 'shipment-1',
                    c_fromStoreId: '',
                },
            ],
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    inventoryId: 'inventory-A',
                    shipmentId: 'shipment-1',
                    quantity: 1,
                },
            ],
        };

        // Empty strings are falsy, so shipment.c_fromStoreId check fails
        // This is expected behavior - empty string is not a valid store ID
        const result = getPickupProductItemsForStore(basket, '');
        expect(result).toEqual([]);
    });
});

describe('filterDeliveryShippingMethods', () => {
    const PICKUP_SHIPPING_METHOD_ID = '005';

    it('should filter out pickup shipping methods', () => {
        const shippingMethodsMap = {
            'shipment-1': {
                applicableShippingMethods: [
                    { id: '001', name: 'Standard Ground' },
                    { id: PICKUP_SHIPPING_METHOD_ID, name: 'Store Pickup' },
                    { id: '002', name: 'Express' },
                ],
            },
        } as Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>;

        const result = filterDeliveryShippingMethods(shippingMethodsMap);

        expect(result['shipment-1'].applicableShippingMethods).toHaveLength(2);
        expect(result['shipment-1'].applicableShippingMethods?.[0].id).toBe('001');
        expect(result['shipment-1'].applicableShippingMethods?.[1].id).toBe('002');
    });

    it('should handle empty applicableShippingMethods array', () => {
        const shippingMethodsMap = {
            'shipment-1': {
                applicableShippingMethods: [],
            },
        } as Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>;

        const result = filterDeliveryShippingMethods(shippingMethodsMap);

        expect(result['shipment-1'].applicableShippingMethods).toEqual([]);
    });

    it('should handle shipping methods without applicableShippingMethods', () => {
        const shippingMethodsMap = {
            'shipment-1': {
                defaultShippingMethodId: '001',
            },
        } as Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>;

        const result = filterDeliveryShippingMethods(shippingMethodsMap);

        expect(result['shipment-1']).toEqual({ defaultShippingMethodId: '001' });
    });

    it('should handle multiple shipments', () => {
        const shippingMethodsMap = {
            'shipment-1': {
                applicableShippingMethods: [
                    { id: '001', name: 'Standard' },
                    { id: PICKUP_SHIPPING_METHOD_ID, name: 'Pickup' },
                ],
            },
            'shipment-2': {
                applicableShippingMethods: [
                    { id: '002', name: 'Express' },
                    { id: PICKUP_SHIPPING_METHOD_ID, name: 'Pickup' },
                    { id: '003', name: 'Overnight' },
                ],
            },
        } as Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>;

        const result = filterDeliveryShippingMethods(shippingMethodsMap);

        expect(result['shipment-1'].applicableShippingMethods).toHaveLength(1);
        expect(result['shipment-1'].applicableShippingMethods?.[0].id).toBe('001');
        expect(result['shipment-2'].applicableShippingMethods).toHaveLength(2);
        expect(result['shipment-2'].applicableShippingMethods?.[0].id).toBe('002');
        expect(result['shipment-2'].applicableShippingMethods?.[1].id).toBe('003');
    });

    it('should return empty map when input is empty', () => {
        const shippingMethodsMap = {};

        const result = filterDeliveryShippingMethods(shippingMethodsMap);

        expect(result).toEqual({});
    });

    it('should preserve all properties except applicableShippingMethods', () => {
        const shippingMethodsMap = {
            'shipment-1': {
                defaultShippingMethodId: '001',
                applicableShippingMethods: [
                    { id: '001', name: 'Standard' },
                    { id: PICKUP_SHIPPING_METHOD_ID, name: 'Pickup' },
                ],
                c_customProperty: 'custom-value',
            },
        } as any;

        const result = filterDeliveryShippingMethods(shippingMethodsMap);

        expect(result['shipment-1'].defaultShippingMethodId).toBe('001');
        expect((result['shipment-1'] as any).c_customProperty).toBe('custom-value');
        expect(result['shipment-1'].applicableShippingMethods).toHaveLength(1);
    });

    it('should handle shipment with only pickup method', () => {
        const shippingMethodsMap = {
            'shipment-1': {
                applicableShippingMethods: [{ id: PICKUP_SHIPPING_METHOD_ID, name: 'Store Pickup' }],
            },
        } as Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>;

        const result = filterDeliveryShippingMethods(shippingMethodsMap);

        expect(result['shipment-1'].applicableShippingMethods).toEqual([]);
    });

    it('should handle shipment with no pickup methods', () => {
        const shippingMethodsMap = {
            'shipment-1': {
                applicableShippingMethods: [
                    { id: '001', name: 'Standard' },
                    { id: '002', name: 'Express' },
                ],
            },
        } as Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>;

        const result = filterDeliveryShippingMethods(shippingMethodsMap);

        expect(result['shipment-1'].applicableShippingMethods).toHaveLength(2);
        expect(result['shipment-1'].applicableShippingMethods?.[0].id).toBe('001');
        expect(result['shipment-1'].applicableShippingMethods?.[1].id).toBe('002');
    });

    it('should filter out pickup methods by c_storePickupEnabled when id is not fallback 005', () => {
        const shippingMethodsMap = {
            'shipment-1': {
                applicableShippingMethods: [
                    { id: '001', name: 'Standard' },
                    { id: 'store-pickup', name: 'Store Pickup', c_storePickupEnabled: true },
                    { id: '002', name: 'Express' },
                ],
            },
        } as Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>;

        const result = filterDeliveryShippingMethods(shippingMethodsMap);

        expect(result['shipment-1'].applicableShippingMethods).toHaveLength(2);
        expect(result['shipment-1'].applicableShippingMethods?.map((m) => m.id)).toEqual(['001', '002']);
    });

    it('should filter out currency-suffixed pickup methods when pickupCurrencies provided', () => {
        const shippingMethodsMap = {
            'shipment-1': {
                applicableShippingMethods: [
                    { id: '001', name: 'Standard' },
                    { id: '005-gbp', name: 'Store Pickup GBP' },
                ],
            },
        } as Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>;

        const result = filterDeliveryShippingMethods(shippingMethodsMap, ['USD', 'GBP']);

        expect(result['shipment-1'].applicableShippingMethods).toHaveLength(1);
        expect(result['shipment-1'].applicableShippingMethods?.[0].id).toBe('001');
    });

    it('should keep currency-suffixed pickup methods when pickupCurrencies not provided (default)', () => {
        const shippingMethodsMap = {
            'shipment-1': {
                applicableShippingMethods: [
                    { id: '001', name: 'Standard' },
                    { id: '005-gbp', name: 'Store Pickup GBP' },
                ],
            },
        } as Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>;

        const result = filterDeliveryShippingMethods(shippingMethodsMap);

        expect(result['shipment-1'].applicableShippingMethods).toHaveLength(2);
        expect(result['shipment-1'].applicableShippingMethods?.map((m) => m.id)).toEqual(['001', '005-gbp']);
    });
});

describe('isStorePickup', () => {
    it('returns false when basket is undefined', () => {
        expect(isStorePickup(undefined)).toBe(false);
    });

    it('returns false when basket is null', () => {
        expect(isStorePickup(null)).toBe(false);
    });

    it('returns false when basket has no shipments', () => {
        const basket = {
            basketId: 'basket-1',
        } as ShopperBasketsV2.schemas['Basket'];

        expect(isStorePickup(basket)).toBe(false);
    });

    it('returns false when shipments lack store pickup configuration', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [{ shipmentId: 'delivery-1' }],
        } as ShopperBasketsV2.schemas['Basket'];

        expect(isStorePickup(basket)).toBe(false);
    });

    it('returns true when any shipment has store pickup enabled', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [{ shipmentId: 'delivery-1' }, { shipmentId: 'pickup-1', c_fromStoreId: 'store-123' }],
        } as ShopperBasketsV2.schemas['Basket'];

        expect(isStorePickup(basket)).toBe(true);
    });

    it('treats empty string store IDs as falsy', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [{ shipmentId: 'pickup-1', c_fromStoreId: '' }, { shipmentId: 'pickup-2' }],
        } as ShopperBasketsV2.schemas['Basket'];

        expect(isStorePickup(basket)).toBe(false);
    });
});

describe('getPickupShipment', () => {
    it('returns undefined when basket is undefined', () => {
        expect(getPickupShipment(undefined)).toBeUndefined();
    });

    it('returns undefined when basket is null', () => {
        expect(getPickupShipment(null)).toBeUndefined();
    });

    it('returns undefined when basket has no shipments', () => {
        const basket = {
            basketId: 'basket-1',
        } as ShopperBasketsV2.schemas['Basket'];

        expect(getPickupShipment(basket)).toBeUndefined();
    });

    it('returns undefined when no shipments have store pickup configured', () => {
        const basket = {
            basketId: 'basket-1',
            shipments: [{ shipmentId: 'delivery-1' }],
        } as ShopperBasketsV2.schemas['Basket'];

        expect(getPickupShipment(basket)).toBeUndefined();
    });

    it('returns the first shipment with store pickup enabled', () => {
        const pickupShipment = { shipmentId: 'pickup-1', c_fromStoreId: 'store-123' };
        const basket = {
            basketId: 'basket-1',
            shipments: [{ shipmentId: 'delivery-1' }, pickupShipment],
        } as ShopperBasketsV2.schemas['Basket'];

        expect(getPickupShipment(basket)).toBe(pickupShipment);
    });

    it('skips shipments with falsy store IDs', () => {
        const validPickupShipment = { shipmentId: 'pickup-2', c_fromStoreId: 'store-456' };
        const basket = {
            basketId: 'basket-1',
            shipments: [
                { shipmentId: 'pickup-1', c_fromStoreId: '' },
                { shipmentId: 'pickup-1b' },
                validPickupShipment,
            ],
        } as ShopperBasketsV2.schemas['Basket'];

        expect(getPickupShipment(basket)).toBe(validPickupShipment);
    });
});
