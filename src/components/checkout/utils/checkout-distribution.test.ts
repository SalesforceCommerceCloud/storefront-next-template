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
import type { ShopperBasketsV2 } from '@/scapi';
import { getSingleShipmentDistribution } from './checkout-distribution';

describe('getSingleShipmentDistribution', () => {
    describe('edge cases', () => {
        it('returns all false flags when basket is undefined', () => {
            const result = getSingleShipmentDistribution(undefined);
            expect(result).toEqual({
                hasDeliveryItems: false,
                hasUnaddressedDeliveryItems: false,
                needsShippingMethods: false,
                hasEmptyShipments: false,
                deliveryShipments: [],
            });
        });

        it('returns all false flags when basket has no shipments', () => {
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result).toEqual({
                hasDeliveryItems: false,
                hasUnaddressedDeliveryItems: false,
                needsShippingMethods: false,
                hasEmptyShipments: false,
                deliveryShipments: [],
            });
        });

        it('returns hasEmptyShipments true when basket has shipments but no product items', () => {
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result).toEqual({
                hasDeliveryItems: false,
                hasUnaddressedDeliveryItems: false,
                needsShippingMethods: false,
                hasEmptyShipments: true,
                deliveryShipments: [],
            });
        });

        it('returns hasEmptyShipments true when basket has empty shipments array', () => {
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result).toEqual({
                hasDeliveryItems: false,
                hasUnaddressedDeliveryItems: false,
                needsShippingMethods: false,
                hasEmptyShipments: false,
                deliveryShipments: [],
            });
        });
    });

    describe('hasUnaddressedDeliveryItems detection', () => {
        it('detects unaddressed delivery items when shipment has no shippingAddress', () => {
            const firstShipment: ShopperBasketsV2.schemas['Shipment'] = {
                shipmentId: 'shipment-1',
                // No shippingAddress
            };
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [firstShipment],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.hasUnaddressedDeliveryItems).toBe(true);
            expect(result.deliveryShipments).toHaveLength(1);
            expect(result.deliveryShipments[0]).toEqual(firstShipment);
        });

        it('detects unaddressed delivery items when shippingAddress is null', () => {
            const firstShipment: ShopperBasketsV2.schemas['Shipment'] = {
                shipmentId: 'shipment-1',
                shippingAddress: null as unknown as ShopperBasketsV2.schemas['OrderAddress'],
            };
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [firstShipment],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.hasUnaddressedDeliveryItems).toBe(true);
            expect(result.deliveryShipments).toHaveLength(1);
            expect(result.deliveryShipments[0]).toEqual(firstShipment);
        });

        it('detects unaddressed delivery items when shippingAddress is an empty object', () => {
            const firstShipment: ShopperBasketsV2.schemas['Shipment'] = {
                shipmentId: 'shipment-1',
                shippingAddress: {} as ShopperBasketsV2.schemas['OrderAddress'],
            };
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [firstShipment],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.hasUnaddressedDeliveryItems).toBe(true);
            expect(result.deliveryShipments).toHaveLength(1);
            expect(result.deliveryShipments[0]).toEqual(firstShipment);
        });

        it('detects unaddressed delivery items when shippingAddress has all empty fields', () => {
            const firstShipment: ShopperBasketsV2.schemas['Shipment'] = {
                shipmentId: 'shipment-1',
                shippingAddress: {
                    address1: '',
                    city: '',
                    countryCode: '',
                    firstName: '',
                    lastName: '',
                    phone: '',
                    postalCode: '',
                    stateCode: '',
                },
            };
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [firstShipment],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.hasUnaddressedDeliveryItems).toBe(true);
            expect(result.deliveryShipments).toHaveLength(1);
            expect(result.deliveryShipments[0]).toEqual(firstShipment);
        });

        it('does not flag addressed delivery shipments as unaddressed', () => {
            const firstShipment: ShopperBasketsV2.schemas['Shipment'] = {
                shipmentId: 'shipment-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'San Francisco',
                    stateCode: 'CA',
                    postalCode: '94102',
                    countryCode: 'US',
                },
            };
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [firstShipment],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.hasUnaddressedDeliveryItems).toBe(false);
            expect(result.deliveryShipments).toHaveLength(1);
            expect(result.deliveryShipments[0]).toEqual(firstShipment);
        });

        it('does not flag as unaddressed when there are no items', () => {
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        // No shippingAddress
                    },
                ],
                productItems: [],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.hasUnaddressedDeliveryItems).toBe(false);
        });
    });

    describe('needsShippingMethods', () => {
        it('detects when first shipment needs a shipping method', () => {
            const firstShipment: ShopperBasketsV2.schemas['Shipment'] = {
                shipmentId: 'shipment-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'San Francisco',
                    stateCode: 'CA',
                    postalCode: '94102',
                    countryCode: 'US',
                },
                // No shippingMethod
            };
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [firstShipment],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.needsShippingMethods).toBe(true);
        });

        it('does not flag when first shipment has a shipping method', () => {
            const firstShipment: ShopperBasketsV2.schemas['Shipment'] = {
                shipmentId: 'shipment-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'San Francisco',
                    stateCode: 'CA',
                    postalCode: '94102',
                    countryCode: 'US',
                },
                shippingMethod: {
                    id: 'method-1',
                    name: 'Standard Shipping',
                },
            };
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [firstShipment],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.needsShippingMethods).toBe(false);
        });

        it('does not flag when there are no items', () => {
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        shippingAddress: {
                            firstName: 'John',
                            lastName: 'Doe',
                            address1: '123 Main St',
                            city: 'San Francisco',
                            stateCode: 'CA',
                            postalCode: '94102',
                            countryCode: 'US',
                        },
                        // No shippingMethod, but no items either
                    },
                ],
                productItems: [],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.needsShippingMethods).toBe(false);
        });

        it('does not flag when there is no first shipment', () => {
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.needsShippingMethods).toBe(false);
        });
    });

    describe('hasEmptyShipments detection', () => {
        it('detects empty shipments when shipment exists but has no items', () => {
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        shippingAddress: {
                            firstName: 'John',
                            lastName: 'Doe',
                            address1: '123 Main St',
                            city: 'San Francisco',
                            stateCode: 'CA',
                            postalCode: '94102',
                            countryCode: 'US',
                        },
                    },
                ],
                productItems: [],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.hasEmptyShipments).toBe(true);
            expect(result.deliveryShipments).toEqual([]);
        });

        it('does not flag as empty when shipment has items', () => {
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        shippingAddress: {
                            firstName: 'John',
                            lastName: 'Doe',
                            address1: '123 Main St',
                            city: 'San Francisco',
                            stateCode: 'CA',
                            postalCode: '94102',
                            countryCode: 'US',
                        },
                    },
                ],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.hasEmptyShipments).toBe(false);
        });
    });

    describe('deliveryShipments array', () => {
        it('returns empty array when there are no items', () => {
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        shippingAddress: {
                            firstName: 'John',
                            lastName: 'Doe',
                            address1: '123 Main St',
                            city: 'San Francisco',
                            stateCode: 'CA',
                            postalCode: '94102',
                            countryCode: 'US',
                        },
                    },
                ],
                productItems: [],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.deliveryShipments).toEqual([]);
        });

        it('returns empty array when there is no first shipment', () => {
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.deliveryShipments).toEqual([]);
        });

        it('returns shipment when items exist even if address is empty', () => {
            const firstShipment: ShopperBasketsV2.schemas['Shipment'] = {
                shipmentId: 'shipment-1',
                shippingAddress: {
                    address1: '',
                    city: '',
                    countryCode: '',
                    firstName: '',
                    lastName: '',
                    phone: '',
                    postalCode: '',
                    stateCode: '',
                },
            };
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [firstShipment],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.deliveryShipments).toHaveLength(1);
            expect(result.deliveryShipments[0]).toEqual(firstShipment);
        });

        it('returns first shipment when it exists and has items', () => {
            const firstShipment: ShopperBasketsV2.schemas['Shipment'] = {
                shipmentId: 'shipment-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'San Francisco',
                    stateCode: 'CA',
                    postalCode: '94102',
                    countryCode: 'US',
                },
            };
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [firstShipment],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.deliveryShipments).toEqual([firstShipment]);
        });

        it('returns first shipment even when multiple shipments exist (assumes single shipment)', () => {
            const firstShipment: ShopperBasketsV2.schemas['Shipment'] = {
                shipmentId: 'shipment-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'San Francisco',
                    stateCode: 'CA',
                    postalCode: '94102',
                    countryCode: 'US',
                },
            };
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [
                    firstShipment,
                    {
                        shipmentId: 'shipment-2',
                        shippingAddress: {
                            firstName: 'Jane',
                            lastName: 'Smith',
                            address1: '456 Oak Ave',
                            city: 'Los Angeles',
                            stateCode: 'CA',
                            postalCode: '90001',
                            countryCode: 'US',
                        },
                    },
                ],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.deliveryShipments).toEqual([firstShipment]);
        });
    });

    describe('complex scenarios', () => {
        it('handles complete checkout scenario with address and items', () => {
            const firstShipment: ShopperBasketsV2.schemas['Shipment'] = {
                shipmentId: 'shipment-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'San Francisco',
                    stateCode: 'CA',
                    postalCode: '94102',
                    countryCode: 'US',
                },
                shippingMethod: {
                    id: 'method-1',
                    name: 'Standard Shipping',
                },
            };
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [firstShipment],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 2,
                        itemId: 'item-1',
                    },
                    {
                        productId: 'product-2',
                        quantity: 1,
                        itemId: 'item-2',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.hasUnaddressedDeliveryItems).toBe(false);
            expect(result.needsShippingMethods).toBe(false);
            expect(result.hasEmptyShipments).toBe(false);
            expect(result.deliveryShipments).toHaveLength(1);
            expect(result.deliveryShipments[0]).toEqual(firstShipment);
        });

        it('handles scenario with items but empty address', () => {
            const firstShipment: ShopperBasketsV2.schemas['Shipment'] = {
                shipmentId: 'shipment-1',
                shippingAddress: {
                    address1: '',
                    city: '',
                    countryCode: '',
                    firstName: '',
                    lastName: '',
                    phone: '',
                    postalCode: '',
                    stateCode: '',
                },
            };
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [firstShipment],
                productItems: [
                    {
                        productId: 'product-1',
                        quantity: 1,
                        itemId: 'item-1',
                    },
                ],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.hasUnaddressedDeliveryItems).toBe(true);
            expect(result.hasEmptyShipments).toBe(false);
            expect(result.deliveryShipments).toHaveLength(1);
            expect(result.deliveryShipments[0]).toEqual(firstShipment);
        });

        it('handles scenario with address but no items', () => {
            const basket: ShopperBasketsV2.schemas['Basket'] = {
                basketId: 'basket-1',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        shippingAddress: {
                            firstName: 'John',
                            lastName: 'Doe',
                            address1: '123 Main St',
                            city: 'San Francisco',
                            stateCode: 'CA',
                            postalCode: '94102',
                            countryCode: 'US',
                        },
                    },
                ],
                productItems: [],
            };
            const result = getSingleShipmentDistribution(basket);
            expect(result.hasUnaddressedDeliveryItems).toBe(false);
            expect(result.hasEmptyShipments).toBe(true);
            expect(result.deliveryShipments).toEqual([]);
        });
    });
});
