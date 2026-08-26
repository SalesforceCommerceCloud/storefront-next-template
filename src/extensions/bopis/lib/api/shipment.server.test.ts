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

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
    updateShipmentForPickup,
    setAddressAndMethodForPickup,
    findOrCreatePickupShipment,
    getPickupShippingMethodId,
    PickupShipmentStoreConflictError,
} from './shipment.server';
import type { ShopperBasketsV2 } from '@/scapi';
import type { RouterContextProvider } from 'react-router';
import { createApiClients } from '@/lib/api-clients.server';
import { getShippingMethodsForShipment } from '@/lib/api/shipping-methods.server';
import { PICKUP_SHIPMENT_ID, PICKUP_SHIPPING_METHOD_ID } from '@/extensions/bopis/constants';
import { createMockBasketWithPickupItems, createMockStore } from '@/extensions/bopis/tests/__mocks__/basket';

// Mock createApiClients
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(),
}));

// Mock getShippingMethodsForShipment
vi.mock('@/lib/api/shipping-methods.server', () => ({
    getShippingMethodsForShipment: vi.fn(),
}));

describe('Shipment API utilities', () => {
    const mockContext = {
        get: vi.fn(),
        set: vi.fn(),
    } as unknown as RouterContextProvider;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Helper function to setup mock API clients with updateShipmentForBasket
    function setupMockApiClients(mockUpdateShipmentForBasket: ReturnType<typeof vi.fn>) {
        vi.mocked(createApiClients).mockReturnValue({
            shopperBasketsV2: {
                updateShipmentForBasket: mockUpdateShipmentForBasket,
            },
        } as any);
    }

    // Helper function to setup mock API clients with createShipmentForBasket and getBasket
    function setupMockApiClientsForCreate(
        mockCreateShipmentForBasket: ReturnType<typeof vi.fn>,
        mockGetBasket: ReturnType<typeof vi.fn>
    ) {
        vi.mocked(createApiClients).mockReturnValue({
            shopperBasketsV2: {
                createShipmentForBasket: mockCreateShipmentForBasket,
                getBasket: mockGetBasket,
                updateShipmentForBasket: vi.fn(),
            },
        } as any);
    }

    // Helper function to create common params structure
    function createShipmentParams(basketId: string, shipmentId: string = 'me') {
        return {
            path: {
                basketId,
                shipmentId,
            },
        };
    }

    // Helper for setAddressAndMethodForPickup
    function setupMocksForSetAddressAndMethod(
        mockUpdateShippingAddress: ReturnType<typeof vi.fn>,
        mockUpdateShippingMethod: ReturnType<typeof vi.fn>,
        mockBasket: Partial<ShopperBasketsV2.schemas['Basket']>,
        pickupMethodId: string = 'store-pickup'
    ) {
        vi.mocked(createApiClients).mockReturnValue({
            shopperBasketsV2: {
                updateShippingAddressForShipment: mockUpdateShippingAddress,
                updateShippingMethodForShipment: mockUpdateShippingMethod,
                updateShipmentForBasket: vi.fn(),
            },
        } as any);
        vi.mocked(getShippingMethodsForShipment).mockResolvedValue({
            defaultShippingMethodId: '001',
            applicableShippingMethods: [
                { id: '001', name: 'Ground', c_storePickupEnabled: false },
                { id: pickupMethodId, name: 'Store Pickup', c_storePickupEnabled: true },
            ],
        } as any);
        mockUpdateShippingAddress.mockResolvedValue({ data: mockBasket });
        mockUpdateShippingMethod.mockResolvedValue({ data: mockBasket });
    }

    describe('getPickupShippingMethodId', () => {
        test('returns id of first method with c_storePickupEnabled === true', () => {
            const result = {
                applicableShippingMethods: [
                    { id: '001', name: 'Ground', c_storePickupEnabled: false },
                    { id: 'store-pickup', name: 'Store Pickup', c_storePickupEnabled: true },
                ],
            } as ShopperBasketsV2.schemas['ShippingMethodResult'];
            expect(getPickupShippingMethodId(result)).toBe('store-pickup');
        });

        test('returns null when no pickup method in list', () => {
            const result = {
                applicableShippingMethods: [{ id: '001', name: 'Ground', c_storePickupEnabled: false }],
            } as ShopperBasketsV2.schemas['ShippingMethodResult'];
            expect(getPickupShippingMethodId(result)).toBeNull();
        });

        test('returns null when applicableShippingMethods is empty or missing', () => {
            expect(getPickupShippingMethodId({ applicableShippingMethods: [] })).toBeNull();
            expect(getPickupShippingMethodId({})).toBeNull();
            expect(getPickupShippingMethodId(null)).toBeNull();
            expect(getPickupShippingMethodId(undefined)).toBeNull();
        });

        test('returns id 005 when only pickup method has id 005 (as fallback, no c_storePickupEnabled)', () => {
            const result = {
                applicableShippingMethods: [
                    { id: '001', name: 'Ground' },
                    { id: PICKUP_SHIPPING_METHOD_ID, name: 'Store Pickup' },
                ],
            } as ShopperBasketsV2.schemas['ShippingMethodResult'];
            expect(getPickupShippingMethodId(result)).toBe(PICKUP_SHIPPING_METHOD_ID);
        });
    });

    describe('updateShipmentForPickup', () => {
        test('should update shipment with c_fromStoreId', async () => {
            const mockBasket: Partial<ShopperBasketsV2.schemas['Basket']> = {
                basketId: 'test-basket',
                shipments: [
                    {
                        shipmentId: 'me',
                        c_fromStoreId: 'store-123',
                    },
                ],
            };

            const mockUpdateShipmentForBasket = vi.fn().mockResolvedValue({ data: mockBasket });
            setupMockApiClients(mockUpdateShipmentForBasket);

            const result = await updateShipmentForPickup(mockContext, 'test-basket', 'me', 'store-123');

            expect(mockUpdateShipmentForBasket).toHaveBeenCalledWith({
                params: createShipmentParams('test-basket', 'me'),
                body: {
                    shipmentId: 'me',
                    c_fromStoreId: 'store-123',
                },
            });
            expect(result).toEqual(mockBasket);
        });

        test('should use default shipmentId PICKUP_SHIPMENT_ID', async () => {
            const mockBasket: Partial<ShopperBasketsV2.schemas['Basket']> = {
                basketId: 'test-basket',
            };

            const mockUpdateShipmentForBasket = vi.fn().mockResolvedValue({ data: mockBasket });
            setupMockApiClients(mockUpdateShipmentForBasket);

            await updateShipmentForPickup(mockContext, 'test-basket', undefined, 'store-456');

            expect(mockUpdateShipmentForBasket).toHaveBeenCalledWith({
                params: createShipmentParams('test-basket', PICKUP_SHIPMENT_ID),
                body: {
                    shipmentId: PICKUP_SHIPMENT_ID,
                    c_fromStoreId: 'store-456',
                },
            });
        });

        test('should handle API errors', async () => {
            const mockError = new Error('API Error');
            const mockUpdateShipmentForBasket = vi.fn().mockRejectedValue(mockError);
            setupMockApiClients(mockUpdateShipmentForBasket);

            await expect(updateShipmentForPickup(mockContext, 'test-basket', 'me', 'store-123')).rejects.toThrow(
                'API Error'
            );
        });
    });

    describe('setAddressAndMethodForPickup', () => {
        const mockStore = createMockStore('store-123', 'inventory-123');

        test('should set address then resolve pickup method by c_storePickupEnabled and set method', async () => {
            const mockBasket = createMockBasketWithPickupItems([], { basketId: 'test-basket' });
            const mockUpdateShippingAddress = vi.fn();
            const mockUpdateShippingMethod = vi.fn();
            setupMocksForSetAddressAndMethod(mockUpdateShippingAddress, mockUpdateShippingMethod, mockBasket);

            const result = await setAddressAndMethodForPickup(mockContext, 'test-basket', mockStore, 'me');

            expect(mockUpdateShippingAddress).toHaveBeenCalledWith({
                params: createShipmentParams('test-basket', 'me'),
                body: {
                    firstName: 'Test Store',
                    lastName: 'Pickup',
                    address1: '123 Main St',
                    address2: 'Suite 100',
                    city: 'San Francisco',
                    stateCode: 'CA',
                    postalCode: '94102',
                    countryCode: 'US',
                },
            });
            expect(getShippingMethodsForShipment).toHaveBeenCalledWith(mockContext, 'test-basket', 'me');
            expect(mockUpdateShippingMethod).toHaveBeenCalledWith({
                params: createShipmentParams('test-basket', 'me'),
                body: { id: 'store-pickup' },
            });
            expect(result).toEqual(mockBasket);
        });

        test('should use default shipmentId PICKUP_SHIPMENT_ID', async () => {
            const mockBasket = createMockBasketWithPickupItems([], { basketId: 'test-basket' });
            const mockUpdateShippingAddress = vi.fn();
            const mockUpdateShippingMethod = vi.fn();
            setupMocksForSetAddressAndMethod(mockUpdateShippingAddress, mockUpdateShippingMethod, mockBasket);

            await setAddressAndMethodForPickup(mockContext, 'test-basket', mockStore);

            expect(mockUpdateShippingAddress).toHaveBeenCalledWith({
                params: createShipmentParams('test-basket', PICKUP_SHIPMENT_ID),
                body: expect.any(Object),
            });
            expect(getShippingMethodsForShipment).toHaveBeenCalledWith(mockContext, 'test-basket', PICKUP_SHIPMENT_ID);
        });

        test('should fall back to PICKUP_SHIPPING_METHOD_ID when no c_storePickupEnabled method', async () => {
            const mockBasket = createMockBasketWithPickupItems([], { basketId: 'test-basket' });
            const mockUpdateShippingAddress = vi.fn();
            const mockUpdateShippingMethod = vi.fn();
            setupMocksForSetAddressAndMethod(mockUpdateShippingAddress, mockUpdateShippingMethod, mockBasket);
            vi.mocked(getShippingMethodsForShipment).mockResolvedValue({
                applicableShippingMethods: [{ id: '001', name: 'Ground', c_storePickupEnabled: false }],
            } as any);

            await setAddressAndMethodForPickup(mockContext, 'test-basket', mockStore, 'me');

            expect(mockUpdateShippingMethod).toHaveBeenCalledWith({
                params: createShipmentParams('test-basket', 'me'),
                body: { id: PICKUP_SHIPPING_METHOD_ID },
            });
        });

        test('should handle store with missing optional fields', async () => {
            const incompleteStore = {
                id: 'store-456',
                name: 'Incomplete Store',
                address1: '456 Oak Ave',
                city: 'Los Angeles',
                stateCode: 'CA',
                postalCode: '90001',
                countryCode: 'US',
            } as any;

            const mockBasket = createMockBasketWithPickupItems([], { basketId: 'test-basket' });
            const mockUpdateShippingAddress = vi.fn();
            const mockUpdateShippingMethod = vi.fn();
            setupMocksForSetAddressAndMethod(mockUpdateShippingAddress, mockUpdateShippingMethod, mockBasket);

            await setAddressAndMethodForPickup(mockContext, 'test-basket', incompleteStore, 'me');

            expect(mockUpdateShippingAddress).toHaveBeenCalledWith({
                params: createShipmentParams('test-basket', 'me'),
                body: {
                    firstName: 'Incomplete Store',
                    lastName: 'Pickup',
                    address1: '456 Oak Ave',
                    address2: '',
                    city: 'Los Angeles',
                    stateCode: 'CA',
                    postalCode: '90001',
                    countryCode: 'US',
                },
            });
        });

        test('should handle store with all undefined address fields', async () => {
            const emptyStore = { id: 'store-empty' } as any;

            const mockBasket = createMockBasketWithPickupItems([], { basketId: 'test-basket' });
            const mockUpdateShippingAddress = vi.fn();
            const mockUpdateShippingMethod = vi.fn();
            setupMocksForSetAddressAndMethod(mockUpdateShippingAddress, mockUpdateShippingMethod, mockBasket);

            await setAddressAndMethodForPickup(mockContext, 'test-basket', emptyStore, 'me');

            expect(mockUpdateShippingAddress).toHaveBeenCalledWith({
                params: createShipmentParams('test-basket', 'me'),
                body: {
                    firstName: '',
                    lastName: 'Pickup',
                    address1: '',
                    address2: '',
                    city: '',
                    stateCode: '',
                    postalCode: '',
                    countryCode: '',
                },
            });
        });

        test('should handle API errors from updateShippingAddressForShipment', async () => {
            const mockError = new Error('API Error');
            const mockBasket = createMockBasketWithPickupItems([], { basketId: 'test-basket' });
            const mockUpdateShippingAddress = vi.fn();
            const mockUpdateShippingMethod = vi.fn();
            setupMocksForSetAddressAndMethod(mockUpdateShippingAddress, mockUpdateShippingMethod, mockBasket);
            mockUpdateShippingAddress.mockRejectedValueOnce(mockError);

            await expect(setAddressAndMethodForPickup(mockContext, 'test-basket', mockStore, 'me')).rejects.toThrow(
                'API Error'
            );
        });
    });

    describe('findOrCreatePickupShipment', () => {
        describe('validation', () => {
            test('throws error when basket is missing basketId', async () => {
                const basket = {} as ShopperBasketsV2.schemas['Basket'];

                await expect(findOrCreatePickupShipment(basket, mockContext, 'store-123')).rejects.toThrow(
                    'Basket is missing a basketId'
                );
            });
        });

        describe('creating new pickup shipment', () => {
            test('creates new pickup shipment when no pickup shipments exist', async () => {
                const basket = {
                    basketId: 'basket-123',
                    shipments: [],
                    productItems: [],
                } as ShopperBasketsV2.schemas['Basket'];

                const mockCreateShipmentForBasket = vi.fn().mockResolvedValue({ data: {} });
                const newShipment = {
                    shipmentId: PICKUP_SHIPMENT_ID,
                    c_fromStoreId: 'store-123',
                };
                const mockGetBasket = vi.fn().mockResolvedValue({
                    data: {
                        basketId: 'basket-123',
                        shipments: [newShipment],
                    },
                });

                setupMockApiClientsForCreate(mockCreateShipmentForBasket, mockGetBasket);

                const result = await findOrCreatePickupShipment(basket, mockContext, 'store-123');

                expect(mockCreateShipmentForBasket).toHaveBeenCalledWith({
                    params: { path: { basketId: 'basket-123' } },
                    body: { shipmentId: PICKUP_SHIPMENT_ID, c_fromStoreId: 'store-123' },
                });
                expect(mockGetBasket).toHaveBeenCalledWith({
                    params: { path: { basketId: 'basket-123' } },
                });
                expect(result).toEqual(newShipment);
            });

            test('throws error when shipment not found after creation', async () => {
                const basket = {
                    basketId: 'basket-123',
                    shipments: [],
                    productItems: [],
                } as ShopperBasketsV2.schemas['Basket'];

                const mockCreateShipmentForBasket = vi.fn().mockResolvedValue({ data: {} });
                const mockGetBasket = vi.fn().mockResolvedValue({
                    data: {
                        basketId: 'basket-123',
                        shipments: [], // No shipments returned
                    },
                });

                setupMockApiClientsForCreate(mockCreateShipmentForBasket, mockGetBasket);

                await expect(findOrCreatePickupShipment(basket, mockContext, 'store-123')).rejects.toThrow(
                    'Shipment was not created'
                );
            });
        });

        describe('existing pickup shipment with product items', () => {
            test('throws error when pickup shipment has product items assigned', async () => {
                const existingShipment = {
                    shipmentId: PICKUP_SHIPMENT_ID,
                    c_fromStoreId: 'store-456',
                };
                const basket = {
                    basketId: 'basket-123',
                    shipments: [existingShipment],
                    productItems: [
                        {
                            itemId: 'item-1',
                            productId: 'product-1',
                            shipmentId: PICKUP_SHIPMENT_ID,
                            quantity: 1,
                        },
                    ],
                } as ShopperBasketsV2.schemas['Basket'];

                await expect(findOrCreatePickupShipment(basket, mockContext, 'store-123')).rejects.toBeInstanceOf(
                    PickupShipmentStoreConflictError
                );
            });
        });

        describe('existing pickup shipment without product items', () => {
            test('returns existing shipment when store ID is already set correctly', async () => {
                const existingShipment = {
                    shipmentId: PICKUP_SHIPMENT_ID,
                    c_fromStoreId: 'store-123',
                };
                const basket = {
                    basketId: 'basket-123',
                    shipments: [existingShipment],
                    productItems: [], // No items assigned
                } as ShopperBasketsV2.schemas['Basket'];

                const mockUpdateShipmentForBasket = vi.fn();
                setupMockApiClients(mockUpdateShipmentForBasket);

                const result = await findOrCreatePickupShipment(basket, mockContext, 'store-123');

                // Should not call updateShipmentForBasket since store ID is already correct
                expect(mockUpdateShipmentForBasket).not.toHaveBeenCalled();
                expect(result).toEqual(existingShipment);
            });

            test('updates store ID when pickup shipment exists without product items', async () => {
                const existingShipment = {
                    shipmentId: PICKUP_SHIPMENT_ID,
                    c_fromStoreId: 'store-456',
                };
                const basket = {
                    basketId: 'basket-123',
                    shipments: [existingShipment],
                    productItems: [], // No items assigned
                } as ShopperBasketsV2.schemas['Basket'];

                const updatedShipment = {
                    shipmentId: PICKUP_SHIPMENT_ID,
                    c_fromStoreId: 'store-123',
                };
                const updatedBasket = {
                    basketId: 'basket-123',
                    shipments: [updatedShipment],
                };

                const mockUpdateShipmentForBasket = vi.fn().mockResolvedValue({ data: updatedBasket });
                setupMockApiClients(mockUpdateShipmentForBasket);

                const result = await findOrCreatePickupShipment(basket, mockContext, 'store-123');

                expect(mockUpdateShipmentForBasket).toHaveBeenCalledWith({
                    params: {
                        path: {
                            basketId: 'basket-123',
                            shipmentId: PICKUP_SHIPMENT_ID,
                        },
                    },
                    body: {
                        shipmentId: PICKUP_SHIPMENT_ID,
                        c_fromStoreId: 'store-123',
                    },
                });
                expect(result).toEqual(updatedShipment);
            });

            test('throws error when shipment not found after updating store ID', async () => {
                const existingShipment = {
                    shipmentId: PICKUP_SHIPMENT_ID,
                    c_fromStoreId: 'store-456',
                };
                const basket = {
                    basketId: 'basket-123',
                    shipments: [existingShipment],
                    productItems: [],
                } as ShopperBasketsV2.schemas['Basket'];

                const updatedBasket = {
                    basketId: 'basket-123',
                    shipments: [], // Shipment missing after update
                };

                const mockUpdateShipmentForBasket = vi.fn().mockResolvedValue({ data: updatedBasket });
                setupMockApiClients(mockUpdateShipmentForBasket);

                await expect(findOrCreatePickupShipment(basket, mockContext, 'store-123')).rejects.toThrow(
                    'Shipment not found after updating store ID'
                );
            });
        });

        describe('edge cases', () => {
            test('handles basket with delivery shipments only', async () => {
                const basket = {
                    basketId: 'basket-123',
                    shipments: [
                        {
                            shipmentId: 'delivery-shipment',
                            shippingAddress: { address1: '123 Main St' },
                        },
                    ],
                    productItems: [],
                } as ShopperBasketsV2.schemas['Basket'];

                const mockCreateShipmentForBasket = vi.fn().mockResolvedValue({ data: {} });
                const newShipment = {
                    shipmentId: PICKUP_SHIPMENT_ID,
                    c_fromStoreId: 'store-123',
                };
                const mockGetBasket = vi.fn().mockResolvedValue({
                    data: {
                        basketId: 'basket-123',
                        shipments: [
                            {
                                shipmentId: 'delivery-shipment',
                                shippingAddress: { address1: '123 Main St' },
                            },
                            newShipment,
                        ],
                    },
                });

                setupMockApiClientsForCreate(mockCreateShipmentForBasket, mockGetBasket);

                const result = await findOrCreatePickupShipment(basket, mockContext, 'store-123');

                expect(result).toEqual(newShipment);
            });

            test('handles basket with product items not assigned to pickup shipment', async () => {
                const existingShipment = {
                    shipmentId: PICKUP_SHIPMENT_ID,
                    c_fromStoreId: 'store-456',
                };
                const basket = {
                    basketId: 'basket-123',
                    shipments: [existingShipment],
                    productItems: [
                        {
                            itemId: 'item-1',
                            productId: 'product-1',
                            shipmentId: 'other-shipment-id', // Different shipment
                            quantity: 1,
                        },
                    ],
                } as ShopperBasketsV2.schemas['Basket'];

                const updatedShipment = {
                    shipmentId: PICKUP_SHIPMENT_ID,
                    c_fromStoreId: 'store-123',
                };
                const updatedBasket = {
                    basketId: 'basket-123',
                    shipments: [updatedShipment],
                };

                const mockUpdateShipmentForBasket = vi.fn().mockResolvedValue({ data: updatedBasket });
                setupMockApiClients(mockUpdateShipmentForBasket);

                const result = await findOrCreatePickupShipment(basket, mockContext, 'store-123');

                expect(result).toEqual(updatedShipment);
            });
        });
    });
});
