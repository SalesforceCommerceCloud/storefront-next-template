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
import type { ShopperBasketsV2 } from '@/scapi';

interface CheckoutFixture {
    cart: ShopperBasketsV2.schemas['Basket'];
    shippingMethods: ShopperBasketsV2.schemas['ShippingMethodResult'];
    checkoutState: {
        step: number;
        isSubmitting: boolean;
        fetchers: Record<string, unknown>;
    };
}

const checkoutWithMultipleItems = {
    cart: {
        adjustedMerchandizeTotalTax: 19.72,
        adjustedShippingTotalTax: 0,
        agentBasket: false,
        basketId: 'e11f8cc0bc972cc2a817636e27',
        channelType: 'storefront',
        creationDate: '2025-09-19T16:04:16.134Z',
        currency: 'GBP',
        customerInfo: {
            customerId: 'abxrBJmbBJlbkRludJkWYYxetH',
            email: 'john.doe@salesforce.com',
        },
        lastModified: '2025-09-19T16:15:41.418Z',
        merchandizeTotalTax: 19.72,
        notes: {},
        orderTotal: 414.07,
        productItems: [
            {
                adjustedTax: 1.89,
                basePrice: 39.67,
                bonusProductLineItem: false,
                gift: false,
                itemId: '1ed3ed7fb732d0333d076ecf3e',
                itemText: 'Button Front Jacket',
                price: 39.67,
                priceAfterItemDiscount: 39.67,
                priceAfterOrderDiscount: 39.67,
                productId: '701642868279M',
                productName: 'Button Front Jacket',
                quantity: 1,
                shipmentId: 'me',
                tax: 1.89,
                taxBasis: 39.67,
                taxClassId: 'standard',
                taxRate: 0.05,
            },
            {
                adjustedTax: 17.83,
                basePrice: 124.8,
                bonusProductLineItem: false,
                gift: false,
                itemId: 'd0a0c366980053e7f2645d9706',
                itemText: 'Casual To Dressy Trousers',
                price: 374.4,
                priceAfterItemDiscount: 374.4,
                priceAfterOrderDiscount: 374.4,
                productId: '883360520599M',
                productName: 'Casual To Dressy Trousers',
                quantity: 3,
                shipmentId: 'me',
                tax: 17.83,
                taxBasis: 374.4,
                taxClassId: 'standard',
                taxRate: 0.05,
            },
        ],
        productSubTotal: 414.07,
        productTotal: 414.07,
        shipments: [
            {
                adjustedMerchandizeTotalTax: 19.72,
                adjustedShippingTotalTax: 0,
                gift: false,
                merchandizeTotalTax: 19.72,
                productSubTotal: 414.07,
                productTotal: 414.07,
                shipmentId: 'me',
                shipmentTotal: 414.07,
                shippingAddress: {
                    address1: '123 Main St',
                    city: 'Jordan South',
                    countryCode: 'US',
                    firstName: 'john',
                    fullName: 'john doe',
                    id: '77b7cb9031a1384947b81f175d',
                    lastName: 'doe',
                    phone: '1233211234',
                    postalCode: '84095',
                    stateCode: 'UT',
                },
                shippingMethod: {
                    description: 'Arrives the next business day',
                    id: 'GBP003',
                    name: 'Overnight',
                    price: 21.99,
                    shippingPromotions: [
                        {
                            calloutMsg: 'Free Shipping Amount Above 50',
                            promotionId: 'FreeShippingAmountAbove50',
                            promotionName: 'Free Shipping Amount Above 50',
                        },
                    ],
                    c_estimatedArrivalTime: 'Next Day',
                },
                shippingStatus: 'not_shipped',
                shippingTotal: 0,
                shippingTotalTax: 1.05,
                taxTotal: 19.72,
            },
        ],
        shippingItems: [
            {
                adjustedTax: 0,
                basePrice: 21.99,
                itemId: 'b1545a5c4a0a7bf436e15fec4f',
                itemText: 'Shipping',
                price: 21.99,
                priceAdjustments: [
                    {
                        appliedDiscount: {
                            amount: 1,
                            type: 'free',
                        },
                        creationDate: '2025-09-19T16:15:41.414Z',
                        custom: false,
                        itemText: 'Free Shipping Amount Above 50',
                        lastModified: '2025-09-19T16:15:41.418Z',
                        manual: false,
                        price: -21.99,
                        priceAdjustmentId: 'b5204a650812b581bc8499a547',
                        promotionId: 'FreeShippingAmountAbove50',
                    },
                ],
                priceAfterItemDiscount: 0,
                shipmentId: 'me',
                tax: 1.05,
                taxBasis: 21.99,
                taxClassId: 'standard',
                taxRate: 0.05,
            },
        ],
        shippingTotal: 0,
        shippingTotalTax: 1.05,
        taxation: 'gross',
        taxTotal: 19.72,
        paymentInstruments: [
            {
                amount: 0,
                paymentCard: {
                    cardType: 'Visa',
                    creditCardExpired: false,
                    expirationMonth: 11,
                    expirationYear: 2028,
                    holder: 'john doe',
                    maskedNumber: '************4242',
                    numberLastDigits: '4242',
                },
                paymentInstrumentId: 'd22314a905454695f9ddf19595',
                paymentMethodId: 'CREDIT_CARD',
            },
        ],
        billingAddress: {
            address1: '123 Main St',
            city: 'Jordan South',
            countryCode: 'US',
            firstName: 'john',
            fullName: 'john doe',
            id: '9e2dab4a4c7f8961e152186fa3',
            lastName: 'doe',
            phone: '1233211234',
            postalCode: '84095',
            stateCode: 'UT',
        },
    },
    shippingMethods: {
        applicableShippingMethods: [
            {
                description: 'Arrives in 7–10 business days',
                id: 'GBP001',
                name: 'Ground',
                price: 9.99,
                shippingPromotions: [
                    {
                        calloutMsg: 'Free Shipping Amount Above 50',
                        promotionId: 'FreeShippingAmountAbove50',
                        promotionName: 'Free Shipping Amount Above 50',
                    },
                ],
                c_estimatedArrivalTime: '7-10 Business Days',
            },
            {
                description: 'Arrives in 2 business days',
                id: 'GBP002',
                name: '2-Day Express',
                price: 15.99,
                shippingPromotions: [
                    {
                        calloutMsg: 'Free Shipping Amount Above 50',
                        promotionId: 'FreeShippingAmountAbove50',
                        promotionName: 'Free Shipping Amount Above 50',
                    },
                    {
                        calloutMsg: 'Spend $100 and get 25% off shipping',
                        promotionId: 'ref-arch-shipping-no-coupon-promotion-1',
                        promotionName: 'Shipping Level Test',
                    },
                ],
                c_estimatedArrivalTime: '2 Business Days',
            },
            {
                description: 'Arrives the next business day',
                id: 'GBP003',
                name: 'Overnight',
                price: 21.99,
                shippingPromotions: [
                    {
                        calloutMsg: 'Free Shipping Amount Above 50',
                        promotionId: 'FreeShippingAmountAbove50',
                        promotionName: 'Free Shipping Amount Above 50',
                    },
                ],
                c_estimatedArrivalTime: 'Next Day',
            },
            {
                description: 'Super Saver delivery (arrives in 3-7 business days)',
                id: 'GBP004',
                name: 'Super Saver',
                price: 1.99,
                shippingPromotions: [
                    {
                        calloutMsg: 'Free Shipping Amount Above 50',
                        promotionId: 'FreeShippingAmountAbove50',
                        promotionName: 'Free Shipping Amount Above 50',
                    },
                ],
                c_estimatedArrivalTime: '3-7 Business Days',
            },
            {
                description: 'Pickup in store',
                id: 'GBP005',
                name: 'Store Pickup',
                price: 0,
                shippingPromotions: [
                    {
                        calloutMsg: 'Free Shipping Amount Above 50',
                        promotionId: 'FreeShippingAmountAbove50',
                        promotionName: 'Free Shipping Amount Above 50',
                    },
                ],
                c_storePickupEnabled: true,
            },
        ],
        defaultShippingMethodId: 'GBP001',
    },
    checkoutState: {
        step: 4,
        isSubmitting: false,
        fetchers: {
            contact: {
                success: true,
                step: 'contactInfo',
                data: {
                    email: 'john.doe@salesforce.com',
                },
            },
            shippingAddress: {
                success: true,
                step: 'shippingAddress',
                data: {
                    address: {
                        firstName: 'john',
                        lastName: 'doe',
                        address1: '123 Main St',
                        address2: '',
                        city: 'Jordan South',
                        stateCode: 'UT',
                        postalCode: '84095',
                        phone: '1233211234',
                        countryCode: 'US',
                    },
                },
            },
            shippingOptions: {
                success: true,
                step: 'shippingOptions',
                data: {
                    shippingMethodId: 'GBP003',
                },
            },
            payment: {
                success: true,
                step: 'payment',
                data: {
                    paymentInfo: {
                        paymentMethodId: 'CREDIT_CARD',
                        paymentCard: {
                            holder: 'john doe',
                            maskedNumber: '************4242',
                            cardType: 'Visa',
                            expirationMonth: 11,
                            expirationYear: 2028,
                        },
                    },
                },
            },
        },
    },
};

const checkoutWithOneItem = {
    cart: {
        adjustedMerchandizeTotalTax: 1.89,
        adjustedShippingTotalTax: 0.76,
        agentBasket: false,
        basketId: 'e11f8cc0bc972cc2a817636e27',
        billingAddress: {
            address1: '123 Main St',
            city: 'Jordan South',
            countryCode: 'US',
            firstName: 'john',
            fullName: 'john doe',
            id: '9e2dab4a4c7f8961e152186fa3',
            lastName: 'doe',
            phone: '1233211234',
            postalCode: '84095',
            stateCode: 'UT',
        },
        channelType: 'storefront',
        creationDate: '2025-09-19T16:04:16.134Z',
        currency: 'GBP',
        customerInfo: {
            customerId: 'abxrBJmbBJlbkRludJkWYYxetH',
            email: 'john.doe@salesforce.com',
        },
        lastModified: '2025-09-19T16:19:06.351Z',
        merchandizeTotalTax: 1.89,
        notes: {},
        orderTotal: 55.66,
        paymentInstruments: [
            {
                amount: 0,
                paymentCard: {
                    cardType: 'Visa',
                    creditCardExpired: false,
                    expirationMonth: 11,
                    expirationYear: 2028,
                    holder: 'john doe',
                    maskedNumber: '************4242',
                    numberLastDigits: '4242',
                },
                paymentInstrumentId: 'd22314a905454695f9ddf19595',
                paymentMethodId: 'CREDIT_CARD',
            },
        ],
        productItems: [
            {
                adjustedTax: 1.89,
                basePrice: 39.67,
                bonusProductLineItem: false,
                gift: false,
                itemId: '1ed3ed7fb732d0333d076ecf3e',
                itemText: 'Button Front Jacket',
                price: 39.67,
                priceAfterItemDiscount: 39.67,
                priceAfterOrderDiscount: 39.67,
                productId: '701642868279M',
                productName: 'Button Front Jacket',
                quantity: 1,
                shipmentId: 'me',
                tax: 1.89,
                taxBasis: 39.67,
                taxClassId: 'standard',
                taxRate: 0.05,
            },
        ],
        productSubTotal: 39.67,
        productTotal: 39.67,
        shipments: [
            {
                adjustedMerchandizeTotalTax: 1.89,
                adjustedShippingTotalTax: 0.76,
                gift: false,
                merchandizeTotalTax: 1.89,
                productSubTotal: 39.67,
                productTotal: 39.67,
                shipmentId: 'me',
                shipmentTotal: 55.66,
                shippingAddress: {
                    address1: '123 Main St',
                    city: 'Jordan South',
                    countryCode: 'US',
                    firstName: 'john',
                    fullName: 'john doe',
                    id: '77b7cb9031a1384947b81f175d',
                    lastName: 'doe',
                    phone: '1233211234',
                    postalCode: '84095',
                    stateCode: 'UT',
                },
                shippingMethod: {
                    description: 'Arrives the next business day',
                    id: 'GBP003',
                    name: 'Overnight',
                    price: 15.99,
                    shippingPromotions: [
                        {
                            calloutMsg: 'Free Shipping Amount Above 50',
                            promotionId: 'FreeShippingAmountAbove50',
                            promotionName: 'Free Shipping Amount Above 50',
                        },
                    ],
                    c_estimatedArrivalTime: 'Next Day',
                },
                shippingStatus: 'not_shipped',
                shippingTotal: 15.99,
                shippingTotalTax: 0.76,
                taxTotal: 2.65,
            },
        ],
        shippingItems: [
            {
                adjustedTax: 0.76,
                basePrice: 15.99,
                itemId: 'b1545a5c4a0a7bf436e15fec4f',
                itemText: 'Shipping',
                price: 15.99,
                priceAfterItemDiscount: 15.99,
                shipmentId: 'me',
                tax: 0.76,
                taxBasis: 15.99,
                taxClassId: 'standard',
                taxRate: 0.05,
            },
        ],
        shippingTotal: 15.99,
        shippingTotalTax: 0.76,
        taxation: 'gross',
        taxTotal: 2.65,
    },
    shippingMethods: {
        applicableShippingMethods: [
            {
                description: 'Arrives in 7–10 business days',
                id: 'GBP001',
                name: 'Ground',
                price: 5.99,
                shippingPromotions: [
                    {
                        calloutMsg: 'Free Shipping Amount Above 50',
                        promotionId: 'FreeShippingAmountAbove50',
                        promotionName: 'Free Shipping Amount Above 50',
                    },
                ],
                c_estimatedArrivalTime: '7-10 Business Days',
            },
            {
                description: 'Arrives in 2 business days',
                id: 'GBP002',
                name: '2-Day Express',
                price: 9.99,
                shippingPromotions: [
                    {
                        calloutMsg: 'Free Shipping Amount Above 50',
                        promotionId: 'FreeShippingAmountAbove50',
                        promotionName: 'Free Shipping Amount Above 50',
                    },
                    {
                        calloutMsg: 'Spend $100 and get 25% off shipping',
                        promotionId: 'ref-arch-shipping-no-coupon-promotion-1',
                        promotionName: 'Shipping Level Test',
                    },
                ],
                c_estimatedArrivalTime: '2 Business Days',
            },
            {
                description: 'Arrives the next business day',
                id: 'GBP003',
                name: 'Overnight',
                price: 15.99,
                shippingPromotions: [
                    {
                        calloutMsg: 'Free Shipping Amount Above 50',
                        promotionId: 'FreeShippingAmountAbove50',
                        promotionName: 'Free Shipping Amount Above 50',
                    },
                ],
                c_estimatedArrivalTime: 'Next Day',
            },
            {
                description: 'Super Saver delivery (arrives in 3-7 business days)',
                id: 'GBP004',
                name: 'Super Saver',
                price: 1.99,
                shippingPromotions: [
                    {
                        calloutMsg: 'Free Shipping Amount Above 50',
                        promotionId: 'FreeShippingAmountAbove50',
                        promotionName: 'Free Shipping Amount Above 50',
                    },
                ],
                c_estimatedArrivalTime: '3-7 Business Days',
            },
            {
                description: 'Pickup in store',
                id: 'GBP005',
                name: 'Store Pickup',
                price: 0,
                shippingPromotions: [
                    {
                        calloutMsg: 'Free Shipping Amount Above 50',
                        promotionId: 'FreeShippingAmountAbove50',
                        promotionName: 'Free Shipping Amount Above 50',
                    },
                ],
                c_storePickupEnabled: true,
            },
        ],
        defaultShippingMethodId: 'GBP001',
    },
    checkoutState: {
        step: 4,
        isSubmitting: false,
        fetchers: {},
    },
};

const _checkoutWithMultipleItems = checkoutWithMultipleItems as unknown as CheckoutFixture;
const _checkoutWithOneItem = checkoutWithOneItem as unknown as CheckoutFixture;

export { _checkoutWithMultipleItems as checkoutWithMultipleItems, _checkoutWithOneItem as checkoutWithOneItem };
