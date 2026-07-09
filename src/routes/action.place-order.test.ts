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
import { action } from './action.place-order';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { getAuth } from '@/middlewares/auth.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { createFormDataRequest } from '@/test-utils/request-helpers';
import { resourceRoutes } from '@/route-paths';
import type { ActionFunctionArgs } from 'react-router';
import {
    savePaymentMethodToCustomerViaOrder,
    saveShippingAddressToCustomer,
    saveBillingAddressToCustomer,
    updateCustomerContactInfo,
    getCustomerProfileForCheckout,
} from '@/lib/api/customer.server';
import {
    getBasketCurrency,
    calculateBasket,
    addPaymentInstrumentToBasket,
    updatePaymentInstrumentInBasket,
    updateBillingAddressForBasket,
} from '@/lib/api/basket.server';
import { createApiClients } from '@/lib/api-clients.server';
import { getAddressBookFromCustomer, getPaymentMethodsFromCustomer } from '@/lib/customer/profile-utils';
import { ApiError } from '@/scapi';

vi.mock('@/middlewares/basket.server', () => ({
    getBasket: vi.fn(),
    updateBasketResource: vi.fn(),
    destroyBasket: vi.fn(),
}));

vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(),
}));

vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({
    getTranslation: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

vi.mock('@/extensions/multiship/lib/api/basket.server', () => ({
    resolveEmptyShipments: vi.fn(),
}));

vi.mock('@/lib/api-clients.server');
vi.mock('@/lib/api/basket.server');
vi.mock('@/lib/api/customer.server');
vi.mock('@/lib/customer/profile-utils');
vi.mock('@/lib/error-handler');
vi.mock('@/lib/url.server', () => ({
    buildUrlFromContext: vi.fn((to: string) => to),
}));

async function parsePlaceOrderResponse(
    response: Response
): Promise<{ success?: boolean; error?: string; step?: string }> {
    return response.json() as Promise<{ success?: boolean; error?: string; step?: string }>;
}

describe('action.place-order action', () => {
    const mockContext = {} as ActionFunctionArgs['context'];

    beforeEach(() => {
        vi.clearAllMocks();
        // Return translation key as-is so tests can assert the exact key used (catches wrong-key regressions)
        vi.mocked(getTranslation).mockReturnValue({
            i18next: {} as any,
            t: ((key: string) => key) as any,
        });
        vi.mocked(getCustomerProfileForCheckout).mockResolvedValue({} as any);
        vi.mocked(getAddressBookFromCustomer).mockReturnValue([]);
        // syncPaymentInstrumentAmount calls this; default to passthrough so tests
        // that don't care about the sync don't have to set up a return value.
        vi.mocked(updatePaymentInstrumentInBasket).mockImplementation((_ctx, basketId, _piId, instrument) =>
            Promise.resolve({ basketId, paymentInstruments: [instrument] } as any)
        );
    });

    test('returns noActiveBasket when basket is missing', async () => {
        vi.mocked(getBasket).mockResolvedValue({ current: undefined } as any);

        const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {});
        const response = await action({
            request,
            context: mockContext,
            params: {},
            pattern: resourceRoutes.placeOrder,
        } as ActionFunctionArgs);

        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(400);
        const body = await parsePlaceOrderResponse(response);
        expect(body.success).toBe(false);
        expect(body.error).toEqual(expect.objectContaining({ message: 'No active basket found' }));
        expect(body.step).toBe('placeOrder');
    });

    test('returns emailRequired when basket has no customer email', async () => {
        vi.mocked(getBasket).mockResolvedValue({
            current: {
                basketId: 'b1',
                productItems: [],
                shipments: [],
            },
        } as any);

        const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {});
        const response = await action({
            request,
            context: mockContext,
            params: {},
            pattern: resourceRoutes.placeOrder,
        } as ActionFunctionArgs);

        expect(response.status).toBe(400);
        const body = await parsePlaceOrderResponse(response);
        expect(body.success).toBe(false);
        expect(body.error).toEqual(expect.objectContaining({ message: 'Customer email is required' }));
    });

    test('returns shippingMethodRequired when a non-empty shipment has no shipping method', async () => {
        vi.mocked(getBasket).mockResolvedValue({
            current: {
                basketId: 'b1',
                customerInfo: { email: 'test@example.com' },
                productItems: [{ itemId: 'i1', productId: 'p1', quantity: 1, shipmentId: 'me' }],
                shipments: [
                    {
                        shipmentId: 'me',
                        shippingAddress: {
                            address1: '123 Main St',
                            city: 'Austin',
                            postalCode: '78701',
                            countryCode: 'US',
                        },
                        // no shippingMethod
                    },
                ],
            },
        } as any);

        const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {});
        const response = await action({
            request,
            context: mockContext,
            params: {},
            pattern: resourceRoutes.placeOrder,
        } as ActionFunctionArgs);

        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(400);
        const body = await parsePlaceOrderResponse(response);
        expect(body.success).toBe(false);
        expect(body.step).toBe('placeOrder');
        expect(body.error).toEqual(expect.objectContaining({ message: 'Shipping method is required' }));
    });

    test('returns shippingAddressRequired when a non-empty shipment has no shipping address', async () => {
        vi.mocked(getBasket).mockResolvedValue({
            current: {
                basketId: 'b1',
                customerInfo: { email: 'test@example.com' },
                productItems: [{ itemId: 'i1', productId: 'p1', quantity: 1, shipmentId: 'me' }],
                shipments: [
                    {
                        shipmentId: 'me',
                        // no shippingAddress
                        shippingMethod: { id: 'ground', name: 'Ground' },
                    },
                ],
            },
        } as any);

        const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {});
        const response = await action({
            request,
            context: mockContext,
            params: {},
            pattern: resourceRoutes.placeOrder,
        } as ActionFunctionArgs);

        expect(response.status).toBe(400);
        const body = await parsePlaceOrderResponse(response);
        expect(body.success).toBe(false);
        expect(body.error).toEqual(expect.objectContaining({ message: 'Shipping address is required' }));
    });

    test('calls savePaymentMethodToCustomerViaOrder when savePaymentToProfile is true and customer is logged in', async () => {
        const basketWithPayment = {
            basketId: 'b1',
            customerInfo: { email: 'test@example.com' },
            productItems: [{ itemId: 'i1', productId: 'p1', quantity: 1, shipmentId: 's1' }],
            shipments: [
                {
                    shipmentId: 's1',
                    shippingAddress: {
                        address1: '123 Main St',
                        city: 'Austin',
                        postalCode: '78701',
                        countryCode: 'US',
                    },
                    shippingMethod: { id: 'ground', name: 'Ground' },
                },
            ],
            paymentInstruments: [{ paymentInstrumentId: 'pi1' }],
            billingAddress: { address1: '123 Main St', city: 'Austin', postalCode: '78701', countryCode: 'US' },
            orderTotal: 99.99,
        };

        vi.mocked(getBasket).mockResolvedValue({ current: basketWithPayment } as any);
        vi.mocked(getAuth).mockReturnValue({ customerId: 'cust-1' } as any);
        vi.mocked(getBasketCurrency).mockReturnValue('USD');
        vi.mocked(calculateBasket).mockResolvedValue({ ...basketWithPayment, basketId: 'b1' } as any);
        vi.mocked(createApiClients).mockReturnValue({
            shopperOrders: {
                createOrder: vi.fn().mockResolvedValue({
                    data: {
                        orderNo: 'O-1',
                        paymentInstruments: [
                            {
                                paymentInstrumentId: 'order-pi1',
                                paymentMethodId: 'CREDIT_CARD',
                                paymentCard: {
                                    cardType: 'Visa',
                                    expirationMonth: 12,
                                    expirationYear: 2030,
                                    holder: 'Test User',
                                    numberLastDigits: '4242',
                                },
                            },
                        ],
                    },
                }),
            },
        } as any);
        vi.mocked(savePaymentMethodToCustomerViaOrder).mockResolvedValue(true);

        const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
            shouldCreateAccount: 'false',
            savePaymentToProfile: 'true',
        });
        const response = await action({
            request,
            context: mockContext,
            params: {},
            pattern: resourceRoutes.placeOrder,
        } as ActionFunctionArgs);

        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(302);
        expect(vi.mocked(savePaymentMethodToCustomerViaOrder)).toHaveBeenCalledWith(
            mockContext,
            'O-1',
            expect.objectContaining({
                paymentMethodId: 'CREDIT_CARD',
                paymentCard: expect.objectContaining({
                    cardType: 'Visa',
                    holder: 'Test User',
                }),
            })
        );
    });

    test('returns 500 and does NOT call createOrder when payment-amount sync fails', async () => {
        const basketWithPayment = {
            basketId: 'b1',
            customerInfo: { email: 'test@example.com' },
            productItems: [{ itemId: 'i1', productId: 'p1', quantity: 1, shipmentId: 's1' }],
            shipments: [
                {
                    shipmentId: 's1',
                    shippingAddress: {
                        address1: '123 Main St',
                        city: 'Austin',
                        postalCode: '78701',
                        countryCode: 'US',
                    },
                    shippingMethod: { id: 'ground', name: 'Ground' },
                },
            ],
            paymentInstruments: [{ paymentInstrumentId: 'pi1' }],
            billingAddress: { address1: '123 Main St', city: 'Austin', postalCode: '78701', countryCode: 'US' },
            orderTotal: 99.99,
        };

        vi.mocked(getBasket).mockResolvedValue({ current: basketWithPayment } as any);
        vi.mocked(getAuth).mockReturnValue({ customerId: 'cust-1' } as any);
        vi.mocked(getBasketCurrency).mockReturnValue('USD');
        vi.mocked(calculateBasket).mockResolvedValue({ ...basketWithPayment, basketId: 'b1' } as any);
        // Override the passthrough default: simulate SCAPI failure on amount sync.
        vi.mocked(updatePaymentInstrumentInBasket).mockRejectedValue(new Error('SCAPI down'));
        const createOrderMock = vi.fn();
        vi.mocked(createApiClients).mockReturnValue({
            shopperOrders: { createOrder: createOrderMock },
        } as any);

        const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {});
        const response = await action({
            request,
            context: mockContext,
            params: {},
            pattern: resourceRoutes.placeOrder,
        } as ActionFunctionArgs);

        expect(response.status).toBe(500);
        // The whole point: createOrder must not run when the basket and instrument
        // are out of sync, otherwise OMS will reject the resulting order.
        expect(createOrderMock).not.toHaveBeenCalled();
    });

    test('saves payment method and addresses for checkout-registration even without savePaymentToProfile', async () => {
        const shippingAddress = {
            firstName: 'Jane',
            lastName: 'Doe',
            address1: '456 Oak Ave',
            city: 'Dallas',
            postalCode: '75201',
            countryCode: 'US',
            stateCode: 'TX',
        };
        const billingAddress = {
            firstName: 'Jane',
            lastName: 'Doe',
            address1: '789 Elm St',
            city: 'Dallas',
            postalCode: '75202',
            countryCode: 'US',
            stateCode: 'TX',
            phone: '+1 555-123-4567',
        };
        const basketWithPayment = {
            basketId: 'b1',
            customerInfo: { email: 'new@example.com' },
            productItems: [{ itemId: 'i1', productId: 'p1', quantity: 1, shipmentId: 's1' }],
            shipments: [
                {
                    shipmentId: 's1',
                    shippingAddress,
                    shippingMethod: { id: 'ground', name: 'Ground' },
                },
            ],
            paymentInstruments: [{ paymentInstrumentId: 'pi1' }],
            billingAddress,
            orderTotal: 49.99,
        };

        vi.mocked(getBasket).mockResolvedValue({ current: basketWithPayment } as any);
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'new-cust-1' } as any);
        vi.mocked(getBasketCurrency).mockReturnValue('USD');
        vi.mocked(calculateBasket).mockResolvedValue({ ...basketWithPayment, basketId: 'b1' } as any);
        vi.mocked(createApiClients).mockReturnValue({
            shopperOrders: {
                createOrder: vi.fn().mockResolvedValue({
                    data: {
                        orderNo: 'O-2',
                        customerInfo: { email: 'new@example.com' },
                        shipments: [{ shippingAddress }],
                        billingAddress,
                        paymentInstruments: [
                            {
                                paymentInstrumentId: 'order-pi2',
                                paymentMethodId: 'CREDIT_CARD',
                                paymentCard: {
                                    cardType: 'Mastercard',
                                    expirationMonth: 6,
                                    expirationYear: 2029,
                                    holder: 'Jane Doe',
                                    numberLastDigits: '5678',
                                },
                            },
                        ],
                    },
                }),
            },
        } as any);
        vi.mocked(savePaymentMethodToCustomerViaOrder).mockResolvedValue(true);
        vi.mocked(saveShippingAddressToCustomer).mockResolvedValue(true);
        vi.mocked(saveBillingAddressToCustomer).mockResolvedValue(true);
        vi.mocked(updateCustomerContactInfo).mockResolvedValue(true);

        const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
            shouldCreateAccount: 'true',
            checkoutRegistrationIntent: 'true',
            savePaymentToProfile: 'false',
            useDifferentBilling: 'true',
        });
        const response = await action({
            request,
            context: mockContext,
            params: {},
            pattern: resourceRoutes.placeOrder,
        } as ActionFunctionArgs);

        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(302);

        expect(vi.mocked(savePaymentMethodToCustomerViaOrder)).toHaveBeenCalledWith(
            mockContext,
            'O-2',
            expect.objectContaining({
                paymentMethodId: 'CREDIT_CARD',
                paymentCard: expect.objectContaining({
                    cardType: 'Mastercard',
                    holder: 'Jane Doe',
                }),
            })
        );
        expect(vi.mocked(saveShippingAddressToCustomer)).toHaveBeenCalledWith(
            mockContext,
            'new-cust-1',
            shippingAddress,
            true
        );
        expect(vi.mocked(saveBillingAddressToCustomer)).toHaveBeenCalledWith(mockContext, 'new-cust-1', billingAddress);
        expect(vi.mocked(updateCustomerContactInfo)).toHaveBeenCalledWith(mockContext, 'new-cust-1', {
            phone: '+1 555-123-4567',
        });
    });

    test('saves payment, shipping address and phone for newly registered shopper with empty profile (shouldCreateAccount=false)', async () => {
        const shippingAddress = {
            firstName: 'Alex',
            lastName: 'Smith',
            address1: '100 Pine St',
            city: 'Houston',
            postalCode: '77001',
            countryCode: 'US',
            stateCode: 'TX',
        };
        const billingAddress = {
            firstName: 'Alex',
            lastName: 'Smith',
            address1: '100 Pine St',
            city: 'Houston',
            postalCode: '77001',
            countryCode: 'US',
            stateCode: 'TX',
            phone: '+1 5559998888',
        };
        const basketWithPayment = {
            basketId: 'b1',
            customerInfo: { email: 'otp-user@example.com' },
            productItems: [{ itemId: 'i1', productId: 'p1', quantity: 1, shipmentId: 's1' }],
            shipments: [
                {
                    shipmentId: 's1',
                    shippingAddress,
                    shippingMethod: { id: 'ground', name: 'Ground' },
                },
            ],
            paymentInstruments: [{ paymentInstrumentId: 'pi1' }],
            billingAddress,
            orderTotal: 59.99,
        };

        vi.mocked(getBasket).mockResolvedValue({ current: basketWithPayment } as any);
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'new-otp-cust' } as any);
        vi.mocked(getBasketCurrency).mockReturnValue('USD');
        vi.mocked(calculateBasket).mockResolvedValue({ ...basketWithPayment, basketId: 'b1' } as any);
        vi.mocked(createApiClients).mockReturnValue({
            shopperOrders: {
                createOrder: vi.fn().mockResolvedValue({
                    data: {
                        orderNo: 'O-3',
                        customerInfo: { email: 'otp-user@example.com' },
                        shipments: [{ shippingAddress }],
                        billingAddress,
                        paymentInstruments: [
                            {
                                paymentInstrumentId: 'order-pi3',
                                paymentMethodId: 'CREDIT_CARD',
                                paymentCard: { cardType: 'Visa', holder: 'Alex Smith', numberLastDigits: '1111' },
                            },
                        ],
                    },
                }),
            },
        } as any);
        // Empty profile: no addresses, no phoneHome
        vi.mocked(getCustomerProfileForCheckout).mockResolvedValue({
            customer: { customerId: 'new-otp-cust', login: 'otp-user@example.com' },
            addresses: [],
            paymentInstruments: [],
        } as any);
        vi.mocked(savePaymentMethodToCustomerViaOrder).mockResolvedValue(true);
        vi.mocked(saveShippingAddressToCustomer).mockResolvedValue(true);
        vi.mocked(saveBillingAddressToCustomer).mockResolvedValue(true);
        vi.mocked(updateCustomerContactInfo).mockResolvedValue(true);

        const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
            shouldCreateAccount: 'false',
            savePaymentToProfile: 'false',
        });
        const response = await action({
            request,
            context: mockContext,
            params: {},
            pattern: resourceRoutes.placeOrder,
        } as ActionFunctionArgs);

        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(302);

        // Payment SHOULD be saved (empty profile triggers isNewlyRegisteredWithEmptyProfile)
        expect(vi.mocked(savePaymentMethodToCustomerViaOrder)).toHaveBeenCalledWith(
            mockContext,
            'O-3',
            expect.objectContaining({
                paymentMethodId: 'CREDIT_CARD',
            })
        );

        // Shipping address and phone SHOULD be saved (empty profile)
        expect(vi.mocked(saveShippingAddressToCustomer)).toHaveBeenCalledWith(
            mockContext,
            'new-otp-cust',
            shippingAddress,
            true
        );
        // Billing address should NOT be saved because useDifferentBilling is not set
        expect(vi.mocked(saveBillingAddressToCustomer)).not.toHaveBeenCalled();
        expect(vi.mocked(updateCustomerContactInfo)).toHaveBeenCalledWith(mockContext, 'new-otp-cust', {
            phone: '+1 5559998888',
        });
    });

    test('does not save addresses for existing registered shopper with populated profile', async () => {
        const basketWithPayment = {
            basketId: 'b1',
            customerInfo: { email: 'existing@example.com' },
            productItems: [{ itemId: 'i1', productId: 'p1', quantity: 1, shipmentId: 's1' }],
            shipments: [
                {
                    shipmentId: 's1',
                    shippingAddress: {
                        address1: '123 Main St',
                        city: 'Austin',
                        postalCode: '78701',
                        countryCode: 'US',
                    },
                    shippingMethod: { id: 'ground', name: 'Ground' },
                },
            ],
            paymentInstruments: [{ paymentInstrumentId: 'pi1' }],
            billingAddress: { address1: '123 Main St', city: 'Austin', postalCode: '78701', countryCode: 'US' },
            orderTotal: 99.99,
        };

        vi.mocked(getBasket).mockResolvedValue({ current: basketWithPayment } as any);
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'existing-cust' } as any);
        vi.mocked(getBasketCurrency).mockReturnValue('USD');
        vi.mocked(calculateBasket).mockResolvedValue({ ...basketWithPayment, basketId: 'b1' } as any);
        vi.mocked(createApiClients).mockReturnValue({
            shopperOrders: {
                createOrder: vi.fn().mockResolvedValue({
                    data: { orderNo: 'O-4', paymentInstruments: [{ paymentInstrumentId: 'order-pi4' }] },
                }),
            },
        } as any);
        // Populated profile: has addresses and phoneHome
        vi.mocked(getCustomerProfileForCheckout).mockResolvedValue({
            customer: { customerId: 'existing-cust', phoneHome: '+1 1111111111' },
            addresses: [{ addressId: 'addr-1', address1: '999 Elm St' }],
            paymentInstruments: [],
        } as any);

        const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
            shouldCreateAccount: 'false',
            savePaymentToProfile: 'false',
        });
        await action({
            request,
            context: mockContext,
            params: {},
            pattern: resourceRoutes.placeOrder,
        } as ActionFunctionArgs);

        // Should not save addresses or phone for an existing registered shopper
        expect(vi.mocked(saveShippingAddressToCustomer)).not.toHaveBeenCalled();
        expect(vi.mocked(saveBillingAddressToCustomer)).not.toHaveBeenCalled();
        expect(vi.mocked(updateCustomerContactInfo)).not.toHaveBeenCalled();
    });

    test('does not call savePaymentMethodToCustomerViaOrder when savePaymentToProfile is false', async () => {
        const basketWithPayment = {
            basketId: 'b1',
            customerInfo: { email: 'test@example.com' },
            productItems: [{ itemId: 'i1', productId: 'p1', quantity: 1, shipmentId: 's1' }],
            shipments: [
                {
                    shipmentId: 's1',
                    shippingAddress: {
                        address1: '123 Main St',
                        city: 'Austin',
                        postalCode: '78701',
                        countryCode: 'US',
                    },
                    shippingMethod: { id: 'ground', name: 'Ground' },
                },
            ],
            paymentInstruments: [{ paymentInstrumentId: 'pi1' }],
            billingAddress: { address1: '123 Main St', city: 'Austin', postalCode: '78701', countryCode: 'US' },
            orderTotal: 99.99,
        };

        vi.mocked(getBasket).mockResolvedValue({ current: basketWithPayment } as any);
        vi.mocked(getAuth).mockReturnValue({ customerId: 'cust-1' } as any);
        vi.mocked(getBasketCurrency).mockReturnValue('USD');
        vi.mocked(calculateBasket).mockResolvedValue({ ...basketWithPayment, basketId: 'b1' } as any);
        vi.mocked(createApiClients).mockReturnValue({
            shopperOrders: {
                createOrder: vi.fn().mockResolvedValue({
                    data: { orderNo: 'O-1', paymentInstruments: [{ paymentInstrumentId: 'order-pi1' }] },
                }),
            },
        } as any);
        vi.mocked(savePaymentMethodToCustomerViaOrder).mockResolvedValue(true);

        const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
            shouldCreateAccount: 'false',
            savePaymentToProfile: 'false',
        });
        await action({ request, context: mockContext, params: {} } as ActionFunctionArgs);

        expect(savePaymentMethodToCustomerViaOrder).not.toHaveBeenCalled();
    });

    describe('retryProfileSave behavior', () => {
        const shippingAddress = {
            firstName: 'Retry',
            lastName: 'Test',
            address1: '100 Retry St',
            city: 'Austin',
            postalCode: '78701',
            countryCode: 'US',
            stateCode: 'TX',
        };

        function setupCheckoutRegistrationMocks(overrides?: {
            saveShippingResult?: boolean | boolean[];
            savePaymentResult?: boolean | boolean[];
            savePhoneResult?: boolean | boolean[];
        }) {
            const basket = {
                basketId: 'b1',
                customerInfo: { email: 'retry@example.com' },
                productItems: [{ itemId: 'i1', productId: 'p1', quantity: 1, shipmentId: 's1' }],
                shipments: [{ shipmentId: 's1', shippingAddress, shippingMethod: { id: 'ground', name: 'Ground' } }],
                paymentInstruments: [{ paymentInstrumentId: 'pi1' }],
                billingAddress: { ...shippingAddress, phone: '+1 5551234567' },
                orderTotal: 79.99,
            };

            vi.mocked(getBasket).mockResolvedValue({ current: basket } as any);
            vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'retry-cust' } as any);
            vi.mocked(getBasketCurrency).mockReturnValue('USD');
            vi.mocked(calculateBasket).mockResolvedValue({ ...basket, basketId: 'b1' } as any);
            vi.mocked(createApiClients).mockReturnValue({
                shopperOrders: {
                    createOrder: vi.fn().mockResolvedValue({
                        data: {
                            orderNo: 'O-retry',
                            customerInfo: { email: 'retry@example.com' },
                            shipments: [{ shippingAddress }],
                            billingAddress: { ...shippingAddress, phone: '+1 5551234567' },
                            paymentInstruments: [
                                {
                                    paymentInstrumentId: 'order-pi-retry',
                                    paymentMethodId: 'CREDIT_CARD',
                                    paymentCard: {
                                        cardType: 'Visa',
                                        expirationMonth: 3,
                                        expirationYear: 2028,
                                        holder: 'Retry Test',
                                        numberLastDigits: '9999',
                                    },
                                },
                            ],
                        },
                    }),
                },
            } as any);

            const shippingResults = overrides?.saveShippingResult;
            if (Array.isArray(shippingResults)) {
                const mock = vi.mocked(saveShippingAddressToCustomer);
                shippingResults.forEach((r) => mock.mockResolvedValueOnce(r));
            } else {
                vi.mocked(saveShippingAddressToCustomer).mockResolvedValue(shippingResults ?? true);
            }

            const paymentResults = overrides?.savePaymentResult;
            if (Array.isArray(paymentResults)) {
                const mock = vi.mocked(savePaymentMethodToCustomerViaOrder);
                paymentResults.forEach((r) => mock.mockResolvedValueOnce(r));
            } else {
                vi.mocked(savePaymentMethodToCustomerViaOrder).mockResolvedValue(paymentResults ?? true);
            }

            const phoneResults = overrides?.savePhoneResult;
            if (Array.isArray(phoneResults)) {
                const mock = vi.mocked(updateCustomerContactInfo);
                phoneResults.forEach((r) => mock.mockResolvedValueOnce(r));
            } else {
                vi.mocked(updateCustomerContactInfo).mockResolvedValue(phoneResults ?? true);
            }
        }

        test('retries shipping address save when first attempt fails', async () => {
            setupCheckoutRegistrationMocks({
                saveShippingResult: [false, true],
            });

            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
                shouldCreateAccount: 'true',
                checkoutRegistrationIntent: 'true',
            });
            const response = await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            expect(response.status).toBe(302);
            expect(vi.mocked(saveShippingAddressToCustomer)).toHaveBeenCalledTimes(2);
        });

        test('retries phone save when first attempt fails', async () => {
            setupCheckoutRegistrationMocks({
                savePhoneResult: [false, true],
            });

            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
                shouldCreateAccount: 'true',
                checkoutRegistrationIntent: 'true',
            });
            const response = await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            expect(response.status).toBe(302);
            expect(vi.mocked(updateCustomerContactInfo)).toHaveBeenCalledTimes(2);
        });

        test('retries payment method save when first attempt fails', async () => {
            setupCheckoutRegistrationMocks({
                savePaymentResult: [false, true],
            });

            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
                shouldCreateAccount: 'true',
                checkoutRegistrationIntent: 'true',
            });
            const response = await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            expect(response.status).toBe(302);
            expect(vi.mocked(savePaymentMethodToCustomerViaOrder)).toHaveBeenCalledTimes(2);
        });

        test('completes order even when profile save fails after retry', async () => {
            setupCheckoutRegistrationMocks({
                saveShippingResult: [false, false],
                savePhoneResult: [false, false],
                savePaymentResult: [false, false],
            });

            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
                shouldCreateAccount: 'true',
                checkoutRegistrationIntent: 'true',
            });
            const response = await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            // Order still succeeds even when all profile saves fail
            expect(response.status).toBe(302);
        });

        test('completes order when a profile save throws (e.g. validateAddress) instead of returning false', async () => {
            setupCheckoutRegistrationMocks();
            // Simulate an unexpected throw bubbling out of the per-save helper - exercises
            // the route-level catch that prevents a 500 after the order is already created.
            vi.mocked(saveShippingAddressToCustomer).mockRejectedValue(new Error('validateAddress: city required'));

            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
                shouldCreateAccount: 'true',
                checkoutRegistrationIntent: 'true',
            });
            const response = await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            expect(response.status).toBe(302);
        });

        test('does not retry when first attempt succeeds', async () => {
            setupCheckoutRegistrationMocks({
                saveShippingResult: true,
                savePhoneResult: true,
                savePaymentResult: true,
            });

            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
                shouldCreateAccount: 'true',
                checkoutRegistrationIntent: 'true',
            });
            await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            expect(vi.mocked(saveShippingAddressToCustomer)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(savePaymentMethodToCustomerViaOrder)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(updateCustomerContactInfo)).toHaveBeenCalledTimes(1);
        });
    });

    describe('deduplication guards', () => {
        const shippingAddress = {
            firstName: 'Dedup',
            lastName: 'Test',
            address1: '200 Dedup Ln',
            city: 'Dallas',
            postalCode: '75201',
            countryCode: 'US',
            stateCode: 'TX',
        };

        function setupDeduplicationMocks() {
            const basket = {
                basketId: 'b1',
                customerInfo: { email: 'dedup@example.com' },
                productItems: [{ itemId: 'i1', productId: 'p1', quantity: 1, shipmentId: 's1' }],
                shipments: [{ shipmentId: 's1', shippingAddress, shippingMethod: { id: 'ground', name: 'Ground' } }],
                paymentInstruments: [{ paymentInstrumentId: 'pi1' }],
                billingAddress: { ...shippingAddress, phone: '+1 5559990000' },
                orderTotal: 120.0,
            };

            vi.mocked(getBasket).mockResolvedValue({ current: basket } as any);
            vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'dedup-cust' } as any);
            vi.mocked(getBasketCurrency).mockReturnValue('USD');
            vi.mocked(calculateBasket).mockResolvedValue({ ...basket, basketId: 'b1' } as any);
            vi.mocked(createApiClients).mockReturnValue({
                shopperOrders: {
                    createOrder: vi.fn().mockResolvedValue({
                        data: {
                            orderNo: 'O-dedup',
                            customerInfo: { email: 'dedup@example.com' },
                            shipments: [{ shippingAddress }],
                            billingAddress: { ...shippingAddress, phone: '+1 5559990000' },
                            paymentInstruments: [
                                {
                                    paymentInstrumentId: 'order-pi-dedup',
                                    paymentMethodId: 'CREDIT_CARD',
                                    paymentCard: {
                                        cardType: 'Visa',
                                        expirationMonth: 12,
                                        expirationYear: 2030,
                                        holder: 'Dedup Test',
                                        numberLastDigits: '4242',
                                    },
                                },
                            ],
                        },
                    }),
                },
            } as any);
            vi.mocked(savePaymentMethodToCustomerViaOrder).mockResolvedValue(true);
            vi.mocked(saveShippingAddressToCustomer).mockResolvedValue(true);
            vi.mocked(updateCustomerContactInfo).mockResolvedValue(true);
        }

        test('skips shipping address save when address already exists on profile', async () => {
            setupDeduplicationMocks();
            // Return matching address from getAddressBookFromCustomer
            vi.mocked(getAddressBookFromCustomer).mockReturnValue([
                {
                    firstName: 'dedup',
                    lastName: 'test',
                    address1: '200 dedup ln',
                    city: 'dallas',
                    postalCode: '75201',
                    countryCode: 'us',
                    stateCode: 'tx',
                } as any,
            ]);

            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
                shouldCreateAccount: 'true',
                checkoutRegistrationIntent: 'true',
            });
            const response = await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            expect(response.status).toBe(302);
            expect(vi.mocked(saveShippingAddressToCustomer)).not.toHaveBeenCalled();
        });

        test('skips payment save when matching card already exists on profile', async () => {
            setupDeduplicationMocks();
            vi.mocked(getCustomerProfileForCheckout).mockResolvedValue({
                customer: { customerId: 'dedup-cust' },
                addresses: [],
                paymentInstruments: [{ paymentInstrumentId: 'existing-pi' }],
            } as any);
            vi.mocked(getPaymentMethodsFromCustomer).mockReturnValue([
                {
                    maskedNumber: '************4242',
                    expirationMonth: 12,
                    expirationYear: 2030,
                } as any,
            ]);

            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
                shouldCreateAccount: 'true',
                checkoutRegistrationIntent: 'true',
            });
            const response = await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            expect(response.status).toBe(302);
            expect(vi.mocked(savePaymentMethodToCustomerViaOrder)).not.toHaveBeenCalled();
        });

        test('skips phone save when profile phone matches contact phone', async () => {
            setupDeduplicationMocks();
            vi.mocked(getCustomerProfileForCheckout).mockResolvedValue({
                customer: { customerId: 'dedup-cust', phoneHome: '+1 5559990000' },
                addresses: [],
                paymentInstruments: [],
            } as any);

            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
                shouldCreateAccount: 'true',
                checkoutRegistrationIntent: 'true',
                contactPhone: '+1 5559990000',
            });
            const response = await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            expect(response.status).toBe(302);
            expect(vi.mocked(updateCustomerContactInfo)).not.toHaveBeenCalled();
        });
    });

    describe('checkoutRegistrationIntent gate', () => {
        test('does not trigger registration saves when checkoutRegistrationIntent is missing', async () => {
            const basket = {
                basketId: 'b1',
                customerInfo: { email: 'gate@example.com' },
                productItems: [{ itemId: 'i1', productId: 'p1', quantity: 1, shipmentId: 's1' }],
                shipments: [
                    {
                        shipmentId: 's1',
                        shippingAddress: {
                            firstName: 'Gate',
                            lastName: 'Test',
                            address1: '300 Gate St',
                            city: 'Houston',
                            postalCode: '77001',
                            countryCode: 'US',
                        },
                        shippingMethod: { id: 'ground', name: 'Ground' },
                    },
                ],
                paymentInstruments: [{ paymentInstrumentId: 'pi1' }],
                billingAddress: { address1: '300 Gate St', city: 'Houston', postalCode: '77001', countryCode: 'US' },
                orderTotal: 50.0,
            };

            vi.mocked(getBasket).mockResolvedValue({ current: basket } as any);
            vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'gate-cust' } as any);
            vi.mocked(getBasketCurrency).mockReturnValue('USD');
            vi.mocked(calculateBasket).mockResolvedValue({ ...basket, basketId: 'b1' } as any);
            vi.mocked(createApiClients).mockReturnValue({
                shopperOrders: {
                    createOrder: vi.fn().mockResolvedValue({
                        data: {
                            orderNo: 'O-gate',
                            shipments: [{ shippingAddress: basket.shipments[0].shippingAddress }],
                            billingAddress: basket.billingAddress,
                            paymentInstruments: [
                                {
                                    paymentInstrumentId: 'order-pi-gate',
                                    paymentMethodId: 'CREDIT_CARD',
                                    paymentCard: {
                                        cardType: 'Visa',
                                        expirationMonth: 1,
                                        expirationYear: 2029,
                                        holder: 'Gate Test',
                                        numberLastDigits: '1111',
                                    },
                                },
                            ],
                        },
                    }),
                },
            } as any);
            // Profile with data so isNewlyRegisteredWithEmptyProfile is false
            vi.mocked(getCustomerProfileForCheckout).mockResolvedValue({
                customer: { customerId: 'gate-cust', phoneHome: '+1 2223334444' },
                addresses: [{ addressId: 'a1', address1: '999 Existing' }],
                paymentInstruments: [],
            } as any);

            // shouldCreateAccount=true but checkoutRegistrationIntent is missing/false
            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
                shouldCreateAccount: 'true',
                checkoutRegistrationIntent: 'false',
                savePaymentToProfile: 'false',
            });
            const response = await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            expect(response.status).toBe(302);
            // No registration saves should fire without the intent flag
            expect(vi.mocked(savePaymentMethodToCustomerViaOrder)).not.toHaveBeenCalled();
            expect(vi.mocked(saveShippingAddressToCustomer)).not.toHaveBeenCalled();
            expect(vi.mocked(saveBillingAddressToCustomer)).not.toHaveBeenCalled();
            expect(vi.mocked(updateCustomerContactInfo)).not.toHaveBeenCalled();
        });

        test('uses contactPhone from formData over basket fields', async () => {
            const basket = {
                basketId: 'b1',
                customerInfo: { email: 'phone@example.com' },
                productItems: [{ itemId: 'i1', productId: 'p1', quantity: 1, shipmentId: 's1' }],
                shipments: [
                    {
                        shipmentId: 's1',
                        shippingAddress: {
                            firstName: 'Phone',
                            lastName: 'Test',
                            address1: '400 Phone St',
                            city: 'Austin',
                            postalCode: '78701',
                            countryCode: 'US',
                        },
                        shippingMethod: { id: 'ground', name: 'Ground' },
                    },
                ],
                paymentInstruments: [{ paymentInstrumentId: 'pi1' }],
                billingAddress: {
                    address1: '400 Phone St',
                    city: 'Austin',
                    postalCode: '78701',
                    countryCode: 'US',
                    phone: '+1 0000000000',
                },
                orderTotal: 30.0,
            };

            vi.mocked(getBasket).mockResolvedValue({ current: basket } as any);
            vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'phone-cust' } as any);
            vi.mocked(getBasketCurrency).mockReturnValue('USD');
            vi.mocked(calculateBasket).mockResolvedValue({ ...basket, basketId: 'b1' } as any);
            vi.mocked(createApiClients).mockReturnValue({
                shopperOrders: {
                    createOrder: vi.fn().mockResolvedValue({
                        data: {
                            orderNo: 'O-phone',
                            shipments: [{ shippingAddress: basket.shipments[0].shippingAddress }],
                            billingAddress: basket.billingAddress,
                            paymentInstruments: [
                                {
                                    paymentInstrumentId: 'order-pi-phone',
                                    paymentMethodId: 'CREDIT_CARD',
                                    paymentCard: {
                                        cardType: 'Visa',
                                        expirationMonth: 5,
                                        expirationYear: 2027,
                                        holder: 'Phone Test',
                                        numberLastDigits: '3333',
                                    },
                                },
                            ],
                        },
                    }),
                },
            } as any);
            vi.mocked(savePaymentMethodToCustomerViaOrder).mockResolvedValue(true);
            vi.mocked(saveShippingAddressToCustomer).mockResolvedValue(true);
            vi.mocked(updateCustomerContactInfo).mockResolvedValue(true);

            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {
                shouldCreateAccount: 'true',
                checkoutRegistrationIntent: 'true',
                contactPhone: '+1 8885551234',
            });
            await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            // Phone from formData should be used, not the billing address phone
            expect(vi.mocked(updateCustomerContactInfo)).toHaveBeenCalledWith(mockContext, 'phone-cust', {
                phone: '+1 8885551234',
            });
        });
    });

    describe('saved-payment-method auto-apply', () => {
        // Regression: getBasket() short-circuits when basketResource.current is already
        // populated. After addPaymentInstrumentToBasket + updateBillingAddressForBasket
        // mutate the basket on SCAPI, the local resource must be refreshed via
        // updateBasketResource. Without this, the downstream billingAddress check sees
        // the stale basket and returns a spurious 'Billing address is required' 400.
        test('refreshes the local basket resource after applying saved payment + billing address', async () => {
            const shippingAddress = {
                firstName: 'Saved',
                lastName: 'Card',
                address1: '500 Wallet Ln',
                city: 'Austin',
                postalCode: '78701',
                countryCode: 'US',
                stateCode: 'TX',
            };
            const basketBeforeMutation = {
                basketId: 'b-saved',
                customerInfo: { email: 'saved@example.com' },
                productItems: [{ itemId: 'i1', productId: 'p1', quantity: 1, shipmentId: 's1' }],
                shipments: [{ shipmentId: 's1', shippingAddress, shippingMethod: { id: 'ground', name: 'Ground' } }],
                paymentInstruments: undefined,
                billingAddress: undefined,
                orderTotal: 0,
            };
            const basketAfterBilling = {
                ...basketBeforeMutation,
                billingAddress: shippingAddress,
                orderTotal: 50.0,
                paymentInstruments: [{ paymentInstrumentId: 'pi-saved', paymentMethodId: 'CREDIT_CARD' }],
            };

            // Simulate updateBasketResource side-effect: getBasket reflects updates after the
            // first call (the route reads via getBasket again after mutating the resource).
            const basketRef = { current: basketBeforeMutation as any };
            vi.mocked(getBasket).mockImplementation(() => Promise.resolve(basketRef as any));
            vi.mocked(updateBasketResource).mockImplementation((_context, merged) => {
                basketRef.current = merged;
            });
            vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'saved-cust' } as any);
            vi.mocked(getCustomerProfileForCheckout).mockResolvedValue({
                customer: { customerId: 'saved-cust' },
                preferredBillingAddress: shippingAddress,
                paymentInstruments: [{ id: 'wallet-pi-1', preferred: true }],
            } as any);
            vi.mocked(getPaymentMethodsFromCustomer).mockReturnValue([{ id: 'wallet-pi-1', preferred: true } as any]);
            vi.mocked(addPaymentInstrumentToBasket).mockResolvedValue({
                ...basketBeforeMutation,
                paymentInstruments: basketAfterBilling.paymentInstruments,
            } as any);
            vi.mocked(updateBillingAddressForBasket).mockResolvedValue(basketAfterBilling as any);
            vi.mocked(getBasketCurrency).mockReturnValue('USD');
            vi.mocked(calculateBasket).mockResolvedValue(basketAfterBilling as any);
            vi.mocked(createApiClients).mockReturnValue({
                shopperOrders: {
                    createOrder: vi
                        .fn()
                        .mockResolvedValue({ data: { orderNo: 'O-saved', shipments: [{ shippingAddress }] } }),
                },
            } as any);

            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {});
            const response = await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            // Should reach createOrder, not 400 with 'Billing address is required'.
            expect(response.status).toBe(302);
            expect(vi.mocked(addPaymentInstrumentToBasket)).toHaveBeenCalledOnce();
            expect(vi.mocked(updateBillingAddressForBasket)).toHaveBeenCalledOnce();
            expect(vi.mocked(updateBasketResource)).toHaveBeenCalled();
            // The merged basket passed to updateBasketResource should carry the SCAPI mutations.
            const mergedBasket = vi.mocked(updateBasketResource).mock.calls[0][1] as {
                billingAddress: unknown;
                paymentInstruments: unknown;
            };
            expect(mergedBasket.billingAddress).toEqual(shippingAddress);
            expect(mergedBasket.paymentInstruments).toEqual(basketAfterBilling.paymentInstruments);
        });
    });

    describe('inventory rejection backstop', () => {
        const readyBasket = {
            basketId: 'b1',
            customerInfo: { email: 'test@example.com' },
            productItems: [{ itemId: 'i1', productId: 'p1', quantity: 3, shipmentId: 's1' }],
            shipments: [
                {
                    shipmentId: 's1',
                    shippingAddress: {
                        address1: '123 Main St',
                        city: 'Austin',
                        postalCode: '78701',
                        countryCode: 'US',
                    },
                    shippingMethod: { id: 'ground', name: 'Ground' },
                },
            ],
            paymentInstruments: [{ paymentInstrumentId: 'pi1' }],
            billingAddress: { address1: '123 Main St', city: 'Austin', postalCode: '78701', countryCode: 'US' },
            orderTotal: 99.99,
        };

        const apiError = (body: { type?: string; title?: string; detail?: string }) =>
            new ApiError({
                status: 400,
                statusText: 'Bad Request',
                headers: new Headers(),
                body: { type: '', title: '', detail: '', ...body },
                rawBody: JSON.stringify(body),
                url: 'https://example.com/orders',
                method: 'POST',
            });

        const primeReadyBasket = () => {
            vi.mocked(getBasket).mockResolvedValue({ current: readyBasket } as any);
            vi.mocked(getAuth).mockReturnValue({ customerId: 'cust-1' } as any);
            vi.mocked(getBasketCurrency).mockReturnValue('USD');
            vi.mocked(calculateBasket).mockResolvedValue({ ...readyBasket } as any);
        };

        test('maps an inventory fault from createOrder to OUT_OF_STOCK (422)', async () => {
            primeReadyBasket();
            vi.mocked(createApiClients).mockReturnValue({
                shopperOrders: {
                    createOrder: vi.fn().mockRejectedValue(
                        apiError({
                            type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/product-item-not-available',
                            title: 'Product Item Not Available',
                            detail: 'The requested quantity is not available in inventory.',
                        })
                    ),
                },
            } as any);

            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {});
            const response = await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            expect(response.status).toBe(422);
            const body = await parsePlaceOrderResponse(response);
            expect(body.success).toBe(false);
            expect(body.step).toBe('placeOrder');
            expect(body.error).toEqual(expect.objectContaining({ code: 'OUT_OF_STOCK' }));
        });

        test('leaves a non-inventory fault from createOrder as a generic 500', async () => {
            primeReadyBasket();
            vi.mocked(createApiClients).mockReturnValue({
                shopperOrders: {
                    createOrder: vi.fn().mockRejectedValue(
                        apiError({
                            type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/payment-declined',
                            title: 'Payment Declined',
                            detail: 'The payment could not be authorized.',
                        })
                    ),
                },
            } as any);

            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {});
            const response = await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            expect(response.status).toBe(500);
            const body = await parsePlaceOrderResponse(response);
            expect(body.success).toBe(false);
            expect(body.step).toBe('placeOrder');
            expect(body.error).not.toEqual(expect.objectContaining({ code: 'OUT_OF_STOCK' }));
        });

        test('does not misclassify a non-inventory fault whose free-text detail says "not available"', async () => {
            // The detail is a human sentence, not the machine-readable type slug. Matching only the type slug keeps
            // this shipping fault out of the OUT_OF_STOCK path so it stays visible in 500 monitoring.
            primeReadyBasket();
            vi.mocked(createApiClients).mockReturnValue({
                shopperOrders: {
                    createOrder: vi.fn().mockRejectedValue(
                        apiError({
                            type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/shipping-method-invalid',
                            title: 'Shipping Method Invalid',
                            detail: 'The selected shipping method is not available for this address.',
                        })
                    ),
                },
            } as any);

            const request = createFormDataRequest(`http://localhost${resourceRoutes.placeOrder}`, 'POST', {});
            const response = await action({
                request,
                context: mockContext,
                params: {},
                pattern: resourceRoutes.placeOrder,
            } as ActionFunctionArgs);

            expect(response.status).toBe(500);
            const body = await parsePlaceOrderResponse(response);
            expect(body.error).not.toEqual(expect.objectContaining({ code: 'OUT_OF_STOCK' }));
        });
    });
});
