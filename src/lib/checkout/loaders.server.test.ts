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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the middleware and API functions
vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(),
}));

vi.mock('@/middlewares/basket.server', () => ({
    getBasket: vi.fn(),
    updateBasketResource: vi.fn(),
}));

vi.mock('@/lib/api/customer.server', () => ({
    getCustomerProfileForCheckout: vi.fn(),
    isRegisteredCustomer: vi.fn(),
}));

vi.mock('@/lib/api/shipping-methods.server', () => ({
    getShippingMethodsForShipment: vi.fn(),
}));

vi.mock('@/lib/checkout/server-utils.server', () => ({
    fetchProductsInBasket: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(() => ({
        shopperPromotions: {
            getPromotions: vi.fn(),
        },
        shopperProducts: {
            getProducts: vi.fn(),
        },
    })),
}));

vi.mock('@salesforce/storefront-next-runtime/data-store', async (importActual) => ({
    ...(await importActual<typeof import('@salesforce/storefront-next-runtime/data-store')>()),
    getGcpApiKeyLazy: vi.fn(() => Promise.resolve('')),
}));

vi.mock('@/lib/login-preferences.server', async (importActual) => ({
    ...(await importActual<typeof import('@/lib/login-preferences.server')>()),
    getLoginPreferences: vi.fn(() => Promise.resolve({ emailVerificationEnabled: false })),
}));

import {
    loader,
    getServerCustomerProfileData,
    getServerShippingMethodsMapData,
    fetchShippingMethodsMapForBasket,
    initializeBasketForReturningCustomer,
    applyDefaultShippingMethod,
} from './loaders.server';
import type { CustomerProfile } from '@/components/checkout/utils/checkout-context-types';

describe('Checkout Loaders', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Test suite for checkout page loader
    describe('loader', () => {
        function createMockArgs() {
            return {
                request: new Request('http://localhost/checkout'),
                params: {},
                context: {
                    get: vi.fn(),
                    set: vi.fn(),
                },
            } as any;
        }

        it('should return checkout data for guest user', async () => {
            const { getBasket } = await import('@/middlewares/basket.server');
            const { isRegisteredCustomer } = await import('@/lib/api/customer.server');
            const { getAuth } = await import('@/middlewares/auth.server');

            vi.mocked(isRegisteredCustomer).mockReturnValue(false);
            vi.mocked(getAuth).mockReturnValue({ userType: 'guest' } as any);
            vi.mocked(getBasket).mockResolvedValue({
                current: {
                    basketId: 'guest-basket',
                    productItems: [],
                    shipments: [],
                },
            } as any);

            const result = await loader(createMockArgs());

            expect(result).toBeDefined();
            expect(result.isRegisteredCustomer).toBe(false);
            expect(result.productMap).toBeInstanceOf(Promise);
            expect(result.promotions).toBeInstanceOf(Promise);
            expect(result.shippingMethodsMap).toBeInstanceOf(Promise);
            // Defaults to empty string when the data store has no gcp key.
            expect(result.gcpApiKey).toBe('');
        });

        it('surfaces the gcp api key from the data store for the provider', async () => {
            const { getBasket } = await import('@/middlewares/basket.server');
            const { isRegisteredCustomer } = await import('@/lib/api/customer.server');
            const { getAuth } = await import('@/middlewares/auth.server');
            const { getGcpApiKeyLazy } = await import('@salesforce/storefront-next-runtime/data-store');

            vi.mocked(getGcpApiKeyLazy).mockResolvedValueOnce('gcp-ootb-key');
            vi.mocked(isRegisteredCustomer).mockReturnValue(false);
            vi.mocked(getAuth).mockReturnValue({ userType: 'guest' } as any);
            vi.mocked(getBasket).mockResolvedValue({
                current: { basketId: 'guest-basket', productItems: [], shipments: [] },
            } as any);

            const result = await loader(createMockArgs());

            expect(result.gcpApiKey).toBe('gcp-ootb-key');
        });

        it('keeps the basket when the optional gcp key read rejects (throw mode)', async () => {
            const { getBasket } = await import('@/middlewares/basket.server');
            const { isRegisteredCustomer } = await import('@/lib/api/customer.server');
            const { getAuth } = await import('@/middlewares/auth.server');
            const { getGcpApiKeyLazy } = await import('@salesforce/storefront-next-runtime/data-store');

            // With SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw the optional gcp read rejects on a data-store outage.
            // It must not drag the successful basket payload into the empty fallback via Promise.all rejection.
            vi.mocked(getGcpApiKeyLazy).mockRejectedValueOnce(new Error('data store unavailable'));
            vi.mocked(isRegisteredCustomer).mockReturnValue(false);
            vi.mocked(getAuth).mockReturnValue({ userType: 'guest' } as any);
            vi.mocked(getBasket).mockResolvedValue({
                current: { basketId: 'guest-basket', productItems: [], shipments: [] },
            } as any);

            const result = await loader(createMockArgs());

            expect(result.basket).toEqual(expect.objectContaining({ basketId: 'guest-basket' }));
            // The optional read degrades to its default rather than blanking checkout.
            expect(result.gcpApiKey).toBe('');
        });

        it('keeps the basket when the optional login-preferences read rejects (throw mode)', async () => {
            const { getBasket } = await import('@/middlewares/basket.server');
            const { isRegisteredCustomer } = await import('@/lib/api/customer.server');
            const { getAuth } = await import('@/middlewares/auth.server');
            const { getLoginPreferences } = await import('@/lib/login-preferences.server');

            // With SFNEXT_DATA_STORE_UNAVAILABLE_MODE=throw the login-preferences read rejects on a data-store outage.
            // Like the gcp read, it must not drag the successful basket payload into the empty fallback.
            vi.mocked(getLoginPreferences).mockRejectedValueOnce(new Error('data store unavailable'));
            vi.mocked(isRegisteredCustomer).mockReturnValue(false);
            vi.mocked(getAuth).mockReturnValue({ userType: 'guest' } as any);
            vi.mocked(getBasket).mockResolvedValue({
                current: { basketId: 'guest-basket', productItems: [], shipments: [] },
            } as any);

            const result = await loader(createMockArgs());

            expect(result.basket).toEqual(expect.objectContaining({ basketId: 'guest-basket' }));
            // The optional read degrades to its default rather than blanking checkout.
            expect(result.emailVerificationEnabled).toBe(false);
        });

        it('should return checkout data with customer profile for registered user', async () => {
            const { getBasket } = await import('@/middlewares/basket.server');
            const { isRegisteredCustomer, getCustomerProfileForCheckout } = await import('@/lib/api/customer.server');
            const { getAuth } = await import('@/middlewares/auth.server');

            vi.mocked(isRegisteredCustomer).mockReturnValue(true);
            vi.mocked(getAuth).mockReturnValue({
                userType: 'registered',
                customerId: 'customer-123',
            } as any);
            vi.mocked(getBasket).mockResolvedValue({
                current: {
                    basketId: 'registered-basket',
                    productItems: [],
                    shipments: [{}],
                },
            } as any);
            vi.mocked(getCustomerProfileForCheckout).mockResolvedValue({
                customer: { customerId: 'customer-123', login: 'test@example.com' },
                addresses: [],
                paymentInstruments: [],
            } as any);

            const { getGcpApiKeyLazy } = await import('@salesforce/storefront-next-runtime/data-store');
            vi.mocked(getGcpApiKeyLazy).mockResolvedValueOnce('gcp-ootb-key');

            const result = await loader(createMockArgs());

            expect(result).toBeDefined();
            expect(result.isRegisteredCustomer).toBe(true);
            expect(result.customerProfile).toBeInstanceOf(Promise);
            expect(result.productMap).toBeInstanceOf(Promise);
            expect(result.shippingMethodsMap).toBeInstanceOf(Promise);
            expect(result.gcpApiKey).toBe('gcp-ootb-key');
        });

        it('streams the registered-shopper prefill mutation rather than awaiting it', async () => {
            // The registered path used to `await handleBasketPrefill(...)` in the loader, which
            // blocked first byte on any outbound `sfcc.app.shipping.calculate` hook (e.g. CDS).
            // The loader must now return `prefilledBasket` as an unresolved Promise so the render
            // can commit its shell before the hook runs.
            const { getBasket } = await import('@/middlewares/basket.server');
            const { isRegisteredCustomer, getCustomerProfileForCheckout } = await import('@/lib/api/customer.server');
            const { getAuth } = await import('@/middlewares/auth.server');

            vi.mocked(isRegisteredCustomer).mockReturnValue(true);
            vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'customer-123' } as any);
            vi.mocked(getBasket).mockResolvedValue({
                current: { basketId: 'registered-basket', productItems: [], shipments: [{}] },
            } as any);
            vi.mocked(getCustomerProfileForCheckout).mockResolvedValue({
                customer: { customerId: 'customer-123', login: 'test@example.com' },
                addresses: [],
                paymentInstruments: [],
            } as any);

            const result = await loader(createMockArgs());

            expect(result.prefilledBasket).toBeInstanceOf(Promise);
            // The returned `basket` is the pre-prefill snapshot — it must not have been mutated
            // by an in-loader `await` of `handleBasketPrefill`.
            expect(result.basket).toEqual(expect.objectContaining({ basketId: 'registered-basket' }));
        });

        it('degrades the streamed prefill promise to null (and methods to {}) when the prefill chain rejects', async () => {
            // The streamed `prefilledBasket` / `shippingMethodsMap` promises are consumed by `use()`
            // inside `CheckoutErrorBoundary`. An uncaught rejection there would collapse the whole
            // checkout to the error card — a fail-open → fail-closed regression vs the old awaited path.
            // Force `handleBasketPrefill` to throw (its initial getBasket AND its catch-branch getBasket
            // both reject); this drives `prefilledBasketPromise` through its new `.catch` → null. The
            // methods chain then runs against the loader basket (whose lone shipment has no shipmentId,
            // so it is filtered out) and resolves to `{}` via the normal empty-map path — either way the
            // consumer sees a settled soft-degrade value, never a rejection.
            const { getBasket } = await import('@/middlewares/basket.server');
            const { isRegisteredCustomer, getCustomerProfileForCheckout } = await import('@/lib/api/customer.server');
            const { getAuth } = await import('@/middlewares/auth.server');

            vi.mocked(isRegisteredCustomer).mockReturnValue(true);
            vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'customer-123' } as any);
            vi.mocked(getBasket)
                .mockResolvedValueOnce({
                    current: { basketId: 'registered-basket', productItems: [], shipments: [{}] },
                } as any)
                .mockRejectedValue(new Error('SCAPI blip'));
            vi.mocked(getCustomerProfileForCheckout).mockResolvedValue({
                customer: { customerId: 'customer-123', login: 'test@example.com' },
                addresses: [],
                paymentInstruments: [],
            } as any);

            const result = await loader(createMockArgs());

            expect(result.prefilledBasket).toBeInstanceOf(Promise);
            expect(result.shippingMethodsMap).toBeInstanceOf(Promise);
            // Neither promise rejects; they degrade so PrefillSync / ShippingMethodsBridge no-op.
            await expect(result.prefilledBasket).resolves.toBeNull();
            await expect(result.shippingMethodsMap).resolves.toEqual({});
        });

        it('should return fallback data when an error occurs', async () => {
            const { isRegisteredCustomer } = await import('@/lib/api/customer.server');

            // Simulate an error during basket fetch
            vi.mocked(isRegisteredCustomer).mockImplementation(() => {
                throw new Error('Auth error');
            });

            const result = await loader(createMockArgs());

            // Should return fallback data instead of throwing
            expect(result).toBeDefined();
            expect(result.isRegisteredCustomer).toBe(false);
            expect(result.productMap).toBeInstanceOf(Promise);
            expect(result.promotions).toBeInstanceOf(Promise);
            expect(result.shippingMethodsMap).toBeInstanceOf(Promise);

            // Verify fallback promises resolve to empty objects
            expect(await result.productMap).toEqual({});
            expect(await result.promotions).toEqual({});
            expect(await result.shippingMethodsMap).toEqual({});
        });

        it('batches product IDs when the basket has more than 24 distinct products', async () => {
            // Regression for SCAPI's 24-ID getProducts cap: fetchProductsInBasket routes through
            // fetchProductsByIds so an oversized basket fans out into batches instead of a single
            // rejected call that would collapse checkout.
            const { getBasket } = await import('@/middlewares/basket.server');
            const { isRegisteredCustomer } = await import('@/lib/api/customer.server');
            const { getAuth } = await import('@/middlewares/auth.server');
            const { createApiClients } = await import('@/lib/api-clients.server');
            const { siteContext } = await import('@salesforce/storefront-next-runtime/site-context');

            const mockGetProducts = vi.fn(({ params }: any) =>
                Promise.resolve({ data: { data: params.query.ids.map((id: string) => ({ id })) } })
            );
            vi.mocked(createApiClients).mockReturnValue({
                shopperProducts: { getProducts: mockGetProducts },
                shopperPromotions: { getPromotions: vi.fn().mockResolvedValue({ data: { data: [] } }) },
            } as any);

            vi.mocked(isRegisteredCustomer).mockReturnValue(false);
            vi.mocked(getAuth).mockReturnValue({ userType: 'guest' } as any);
            const productItems = Array.from({ length: 25 }, (_, i) => ({
                itemId: `item-${i}`,
                productId: `product-${i}`,
                quantity: 1,
            }));
            vi.mocked(getBasket).mockResolvedValue({
                current: { basketId: 'guest-basket', productItems, shipments: [] },
            } as any);

            const args = createMockArgs();
            args.context.get.mockImplementation((key: unknown) =>
                key === siteContext ? { currency: 'USD' } : undefined
            );

            const result = await loader(args);
            const productMap = await result.productMap;

            // 25 IDs -> two batches, neither exceeding the SCAPI limit. Assert the invariant
            // (cap respected + all IDs fetched) rather than an exact split, so the test isn't
            // tied to batch iteration order.
            expect(mockGetProducts).toHaveBeenCalledTimes(2);
            const batchSizes = mockGetProducts.mock.calls.map((call) => call[0].params.query.ids.length);
            expect(batchSizes.every((n) => n <= 24)).toBe(true); // none over the SCAPI cap
            expect(batchSizes.reduce((a, b) => a + b, 0)).toBe(25); // all IDs fetched
            // The batches merge back into a full itemId -> product map (one entry per basket item).
            expect(Object.keys(productMap)).toHaveLength(25);
        });
    });

    describe('getServerCustomerProfileData', () => {
        it('should return null when authSession is null', async () => {
            const mockContext = {} as any;
            const result = await getServerCustomerProfileData(mockContext, null);
            expect(result).toBeNull();
        });

        it('should return null when authSession has no customer_id', async () => {
            const mockContext = {} as any;
            const authSession = {
                userType: 'registered',
                customerId: undefined,
            } as any;

            const result = await getServerCustomerProfileData(mockContext, authSession);
            expect(result).toBeNull();
        });

        it('should return null when userType is not registered', async () => {
            const mockContext = {} as any;
            const authSession = {
                customerId: 'test-123',
                userType: 'guest',
            } as any;

            const result = await getServerCustomerProfileData(mockContext, authSession);
            expect(result).toBeNull();
        });

        it('should handle errors gracefully', async () => {
            const mockContext = {
                get: () => {
                    throw new Error('Context error');
                },
            } as any;
            const authSession = {
                customerId: 'test-123',
                userType: 'registered',
            } as any;

            const result = await getServerCustomerProfileData(mockContext, authSession);
            expect(result).toBeNull();
        });
    });

    describe('getServerShippingMethodsMapData', () => {
        it('should return empty object when basket fetch fails', async () => {
            const { getBasket } = await import('@/middlewares/basket.server');

            vi.mocked(getBasket).mockRejectedValue(new Error('Basket error'));

            const mockContext = {} as any;
            const result = await getServerShippingMethodsMapData(mockContext, null);
            expect(result).toEqual({});
        });

        it('should return shipping methods when basket has shipments with addresses', async () => {
            const { getBasket } = await import('@/middlewares/basket.server');
            const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods.server');

            vi.mocked(getBasket).mockResolvedValue({
                current: {
                    basketId: 'test-basket',
                    shipments: [
                        {
                            shipmentId: 'shipment-1',
                            shippingAddress: { address1: '123 Main St' },
                        },
                    ],
                },
            } as any);

            vi.mocked(getShippingMethodsForShipment).mockResolvedValue({
                applicableShippingMethods: [{ id: 'standard', name: 'Standard' }],
            } as any);

            const mockContext = {} as any;
            const authSession = { customerId: 'test-123', userType: 'registered' } as any;

            const result = await getServerShippingMethodsMapData(mockContext, authSession);

            expect(result).toHaveProperty('shipment-1');
        });
    });

    describe('fetchShippingMethodsMapForBasket', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should return empty object when basket is null', async () => {
            const mockContext = {} as any;
            const result = await fetchShippingMethodsMapForBasket(mockContext, null);
            expect(result).toEqual({});
        });

        it('should return empty object when basket has no basketId', async () => {
            const mockContext = {} as any;
            const basket = {
                shipments: [{ shippingAddress: { address1: '123 Main St' } }],
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);
            expect(result).toEqual({});
        });

        it('should return empty object when basket has no shipments', async () => {
            const mockContext = {} as any;
            const basket = {
                basketId: 'test-basket',
                shipments: undefined,
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);
            expect(result).toEqual({});
        });

        it('should return empty object when basket has empty shipments array', async () => {
            const mockContext = {} as any;
            const basket = {
                basketId: 'test-basket',
                shipments: [],
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);
            expect(result).toEqual({});
        });

        it('should fetch shipping methods for shipments with addresses', async () => {
            const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods.server');

            vi.mocked(getShippingMethodsForShipment).mockResolvedValue({
                applicableShippingMethods: [{ id: 'standard', name: 'Standard' }],
            } as any);

            const mockContext = {} as any;
            const basket = {
                basketId: 'test-basket',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        shippingAddress: { address1: '123 Main St' },
                    },
                ],
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);

            expect(result).toHaveProperty('shipment-1');
            expect(result['shipment-1'].applicableShippingMethods).toHaveLength(1);
        });

        it('should skip shipments without shipmentId', async () => {
            const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods.server');

            const mockContext = {} as any;
            const basket = {
                basketId: 'test-basket',
                shipments: [
                    {
                        shipmentId: undefined,
                        shippingAddress: { address1: '123 Main St' },
                    },
                ],
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);

            expect(result).toEqual({});
            expect(getShippingMethodsForShipment).not.toHaveBeenCalled();
        });

        it('should skip shipments with empty shipping address', async () => {
            const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods.server');

            const mockContext = {} as any;
            const basket = {
                basketId: 'test-basket',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        shippingAddress: {},
                    },
                ],
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);

            expect(result).toEqual({});
            expect(getShippingMethodsForShipment).not.toHaveBeenCalled();
        });

        it('should handle fetch failures gracefully', async () => {
            const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods.server');

            vi.mocked(getShippingMethodsForShipment).mockRejectedValue(new Error('API Error'));

            const mockContext = {} as any;
            const basket = {
                basketId: 'test-basket',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        shippingAddress: { address1: '123 Main St' },
                    },
                ],
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);

            expect(result).toEqual({});
        });

        it('should handle multiple shipments with mixed success/failure', async () => {
            const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods.server');

            vi.mocked(getShippingMethodsForShipment)
                .mockResolvedValueOnce({
                    applicableShippingMethods: [{ id: 'standard', name: 'Standard' }],
                } as any)
                .mockRejectedValueOnce(new Error('API Error'));

            const mockContext = {} as any;
            const basket = {
                basketId: 'test-basket',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        shippingAddress: { address1: '123 Main St' },
                    },
                    {
                        shipmentId: 'shipment-2',
                        shippingAddress: { address1: '456 Oak Ave' },
                    },
                ],
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);

            expect(result).toHaveProperty('shipment-1');
            expect(result).not.toHaveProperty('shipment-2');
        });
    });

    describe('initializeBasketForReturningCustomer', () => {
        const mockShopperBasketsClient = {
            updateCustomerForBasket: vi.fn(),
            updateShippingAddressForShipment: vi.fn(),
            updateBillingAddressForBasket: vi.fn(),
            updateShippingMethodForShipment: vi.fn(),
        };

        beforeEach(async () => {
            vi.clearAllMocks();
            const { createApiClients } = await import('@/lib/api-clients.server');
            vi.mocked(createApiClients).mockReturnValue({
                shopperBasketsV2: mockShopperBasketsClient,
            } as any);
        });

        it('should return null when basket or customer profile is missing', async () => {
            const { getBasket } = await import('@/middlewares/basket.server');
            const mockContext = {} as any;

            // Test missing basket
            vi.mocked(getBasket).mockResolvedValue({ current: undefined } as any);
            expect(await initializeBasketForReturningCustomer(mockContext, {} as CustomerProfile)).toBeNull();

            // Test missing customer profile
            vi.mocked(getBasket).mockResolvedValue({ current: { basketId: 'test-basket' } } as any);
            expect(
                await initializeBasketForReturningCustomer(mockContext, undefined as unknown as CustomerProfile)
            ).toBeNull();
        });

        it('should prefill email and shipping address when missing from basket', async () => {
            const { getBasket, updateBasketResource } = await import('@/middlewares/basket.server');
            const mockBasket = {
                basketId: 'test-basket',
                customerInfo: {},
                shipments: [{ shipmentId: 'me' }],
            };

            vi.mocked(getBasket).mockResolvedValue({ current: mockBasket } as any);
            vi.mocked(updateBasketResource).mockImplementation(() => {});

            mockShopperBasketsClient.updateCustomerForBasket.mockResolvedValue({
                data: { ...mockBasket, customerInfo: { email: 'test@example.com' } },
            });
            mockShopperBasketsClient.updateShippingAddressForShipment.mockResolvedValue({
                data: {
                    ...mockBasket,
                    shipments: [{ shipmentId: 'me', shippingAddress: { address1: '123 Main St' } }],
                },
            });
            mockShopperBasketsClient.updateBillingAddressForBasket.mockResolvedValue({ data: mockBasket });

            const mockCustomerProfile = {
                customer: { login: 'test@example.com' },
                addresses: [
                    {
                        addressId: 'addr-1',
                        firstName: 'John',
                        lastName: 'Doe',
                        address1: '123 Main St',
                        city: 'Anytown',
                        stateCode: 'CA',
                        postalCode: '12345',
                        countryCode: 'US',
                    },
                ],
                paymentInstruments: [],
            } as CustomerProfile;

            const result = await initializeBasketForReturningCustomer({} as any, mockCustomerProfile);

            // Verify email was prefilled from customer profile
            expect(mockShopperBasketsClient.updateCustomerForBasket).toHaveBeenCalledWith({
                params: { path: { basketId: 'test-basket' } },
                body: { email: 'test@example.com' },
            });

            // Verify shipping address was prefilled from customer profile
            expect(mockShopperBasketsClient.updateShippingAddressForShipment).toHaveBeenCalledWith({
                params: { path: { basketId: 'test-basket', shipmentId: 'me' } },
                body: expect.objectContaining({
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Anytown',
                    stateCode: 'CA',
                    postalCode: '12345',
                    countryCode: 'US',
                }),
            });

            expect(result).toBeTruthy();
        });

        it('should skip prefill when basket already has email, matching customerId, and shipping address', async () => {
            const { getBasket } = await import('@/middlewares/basket.server');
            const mockBasket = {
                basketId: 'test-basket',
                customerInfo: { email: 'test@example.com', customerId: 'cust-123' },
                shipments: [
                    {
                        shipmentId: 'me',
                        shippingAddress: { firstName: 'John', lastName: 'Doe', address1: '123 Main St' },
                    },
                ],
            };

            vi.mocked(getBasket).mockResolvedValue({ current: mockBasket } as any);

            const mockCustomerProfile = {
                customer: { login: 'test@example.com', customerId: 'cust-123' },
                addresses: [{ addressId: 'addr-1', countryCode: 'US', lastName: 'Doe' }],
                paymentInstruments: [],
            } as CustomerProfile;

            const result = await initializeBasketForReturningCustomer({} as any, mockCustomerProfile);

            expect(mockShopperBasketsClient.updateCustomerForBasket).not.toHaveBeenCalled();
            expect(mockShopperBasketsClient.updateShippingAddressForShipment).not.toHaveBeenCalled();
            expect(result).toEqual(mockBasket);
        });

        it('should update email when basket has social login ID instead of a valid email', async () => {
            const { getBasket, updateBasketResource } = await import('@/middlewares/basket.server');
            const mockBasket = {
                basketId: 'test-basket',
                customerInfo: { email: 'Google-111292267709658666876', customerId: 'cust-123' },
                shipments: [
                    {
                        shipmentId: 'me',
                        shippingAddress: { firstName: 'John', lastName: 'Doe', address1: '123 Main St' },
                    },
                ],
            };

            vi.mocked(getBasket).mockResolvedValue({ current: mockBasket } as any);
            vi.mocked(updateBasketResource).mockImplementation(() => {});

            mockShopperBasketsClient.updateCustomerForBasket.mockResolvedValue({
                data: { ...mockBasket, customerInfo: { email: 'user@example.com', customerId: 'cust-123' } },
            });

            const mockCustomerProfile = {
                customer: { login: 'Google-111292267709658666876', email: 'user@example.com', customerId: 'cust-123' },
                addresses: [{ addressId: 'addr-1', countryCode: 'US', lastName: 'Doe' }],
                paymentInstruments: [],
            } as CustomerProfile;

            const result = await initializeBasketForReturningCustomer({} as any, mockCustomerProfile);

            // Should call updateCustomerForBasket with the correct email, not the social login ID
            expect(mockShopperBasketsClient.updateCustomerForBasket).toHaveBeenCalledWith({
                params: { path: { basketId: 'test-basket' } },
                body: { email: 'user@example.com' },
            });
            expect(result).toBeTruthy();
        });

        it('should not update email when basket already has a valid email address', async () => {
            const { getBasket } = await import('@/middlewares/basket.server');
            const mockBasket = {
                basketId: 'test-basket',
                customerInfo: { email: 'user@example.com', customerId: 'cust-123' },
                shipments: [
                    {
                        shipmentId: 'me',
                        shippingAddress: { firstName: 'John', lastName: 'Doe', address1: '123 Main St' },
                    },
                ],
            };

            vi.mocked(getBasket).mockResolvedValue({ current: mockBasket } as any);

            const mockCustomerProfile = {
                customer: { login: 'Google-111292267709658666876', email: 'user@example.com', customerId: 'cust-123' },
                addresses: [{ addressId: 'addr-1', countryCode: 'US', lastName: 'Doe' }],
                paymentInstruments: [],
            } as CustomerProfile;

            const result = await initializeBasketForReturningCustomer({} as any, mockCustomerProfile);

            // Should NOT call updateCustomerForBasket since email is already valid
            expect(mockShopperBasketsClient.updateCustomerForBasket).not.toHaveBeenCalled();
            expect(result).toEqual(mockBasket);
        });

        it('should handle API errors gracefully', async () => {
            const { getBasket } = await import('@/middlewares/basket.server');
            vi.mocked(getBasket).mockResolvedValue({
                current: { basketId: 'test-basket', customerInfo: {}, shipments: [{}] },
            } as any);
            mockShopperBasketsClient.updateCustomerForBasket.mockRejectedValue(new Error('API Error'));

            const mockCustomerProfile = {
                customer: { login: 'test@example.com' },
                addresses: [{ addressId: 'addr-1', countryCode: 'US', lastName: 'Doe' }],
                paymentInstruments: [],
            } as CustomerProfile;

            const result = await initializeBasketForReturningCustomer({} as any, mockCustomerProfile);
            expect(result).toBeNull();
        });

        it('should reconcile basket email when it differs from the authenticated customer email', async () => {
            const { getBasket, updateBasketResource } = await import('@/middlewares/basket.server');
            const mockBasket = {
                basketId: 'test-basket',
                customerInfo: { email: 'guest@x.com', customerId: 'cust-123' },
                shipments: [
                    {
                        shipmentId: 'me',
                        shippingAddress: { firstName: 'Jane', lastName: 'Doe', address1: '1 Main St' },
                    },
                ],
            };
            const reconciled = { ...mockBasket, customerInfo: { email: 'customer@x.com', customerId: 'cust-123' } };

            vi.mocked(getBasket).mockResolvedValue({ current: mockBasket } as any);
            vi.mocked(updateBasketResource).mockImplementation(() => {});
            mockShopperBasketsClient.updateCustomerForBasket.mockResolvedValue({ data: reconciled });

            const mockCustomerProfile = {
                customer: { email: 'customer@x.com', login: 'customer@x.com', customerId: 'cust-123' },
                addresses: [{ addressId: 'addr-1', countryCode: 'US', lastName: 'Doe' }],
                paymentInstruments: [],
            } as CustomerProfile;

            await initializeBasketForReturningCustomer({} as any, mockCustomerProfile);

            expect(mockShopperBasketsClient.updateCustomerForBasket).toHaveBeenCalledWith({
                params: { path: { basketId: 'test-basket' } },
                body: { email: 'customer@x.com' },
            });
        });

        it('should not call updateCustomerForBasket when basket email equals customer email (case-insensitive)', async () => {
            const { getBasket } = await import('@/middlewares/basket.server');
            const mockBasket = {
                basketId: 'test-basket',
                customerInfo: { email: 'ABC@x.com', customerId: 'cust-123' },
                shipments: [
                    {
                        shipmentId: 'me',
                        shippingAddress: { firstName: 'Jane', lastName: 'Doe', address1: '1 Main St' },
                    },
                ],
            };

            vi.mocked(getBasket).mockResolvedValue({ current: mockBasket } as any);

            const mockCustomerProfile = {
                customer: { email: 'abc@x.com', login: 'abc@x.com', customerId: 'cust-123' },
                addresses: [{ addressId: 'addr-1', countryCode: 'US', lastName: 'Doe' }],
                paymentInstruments: [],
            } as CustomerProfile;

            const result = await initializeBasketForReturningCustomer({} as any, mockCustomerProfile);

            expect(mockShopperBasketsClient.updateCustomerForBasket).not.toHaveBeenCalled();
            expect(result).toEqual(mockBasket);
        });

        it('should not call updateCustomerForBasket when customer has no email and login is not an email (social login without email)', async () => {
            const { getBasket } = await import('@/middlewares/basket.server');
            const mockBasket = {
                basketId: 'test-basket',
                customerInfo: { email: 'guest@x.com', customerId: 'cust-123' },
                shipments: [
                    {
                        shipmentId: 'me',
                        shippingAddress: { firstName: 'Jane', lastName: 'Doe', address1: '1 Main St' },
                    },
                ],
            };

            vi.mocked(getBasket).mockResolvedValue({ current: mockBasket } as any);

            const mockCustomerProfile = {
                customer: { email: undefined, login: 'Google-111292267709658666876', customerId: 'cust-123' },
                addresses: [{ addressId: 'addr-1', countryCode: 'US', lastName: 'Doe' }],
                paymentInstruments: [],
            } as CustomerProfile;

            const result = await initializeBasketForReturningCustomer({} as any, mockCustomerProfile);

            // customerEmail is undefined for social login without email - no mismatch, no update
            expect(mockShopperBasketsClient.updateCustomerForBasket).not.toHaveBeenCalled();
            expect(result).toEqual(mockBasket);
        });

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        describe('default shipping method auto-select (BOPIS-aware)', () => {
            const baseProfile = {
                customer: { login: 'test@example.com', email: 'test@example.com', customerId: 'cust-123' },
                addresses: [{ addressId: 'addr-1', countryCode: 'US', lastName: 'Doe' }],
                paymentInstruments: [],
            } as CustomerProfile;

            const basketWithAddressNoMethod = {
                basketId: 'test-basket',
                customerInfo: { email: 'test@example.com', customerId: 'cust-123' },
                shipments: [
                    {
                        shipmentId: 'me',
                        shippingAddress: { firstName: 'John', lastName: 'Doe', address1: '123 Main St' },
                        // no shippingMethod — triggers auto-select branch
                    },
                ],
            };

            it('skips pickup methods when picking the default for a delivery shopper', async () => {
                const { getBasket, updateBasketResource } = await import('@/middlewares/basket.server');
                const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods.server');

                vi.mocked(getBasket).mockResolvedValue({ current: basketWithAddressNoMethod } as any);
                vi.mocked(updateBasketResource).mockImplementation(() => {});
                vi.mocked(getShippingMethodsForShipment).mockResolvedValue({
                    applicableShippingMethods: [
                        { id: '005', name: 'Pickup in store', price: 0, c_storePickupEnabled: true },
                    ],
                } as any);

                await initializeBasketForReturningCustomer({} as any, baseProfile);

                expect(mockShopperBasketsClient.updateShippingMethodForShipment).not.toHaveBeenCalled();
            });

            it('selects the first non-pickup method when both pickup and delivery are applicable', async () => {
                const { getBasket, updateBasketResource } = await import('@/middlewares/basket.server');
                const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods.server');

                vi.mocked(getBasket).mockResolvedValue({ current: basketWithAddressNoMethod } as any);
                vi.mocked(updateBasketResource).mockImplementation(() => {});
                vi.mocked(getShippingMethodsForShipment).mockResolvedValue({
                    applicableShippingMethods: [
                        { id: '005', name: 'Pickup in store', price: 0, c_storePickupEnabled: true },
                        { id: 'standard', name: 'Standard', price: 5.99 },
                        { id: 'express', name: 'Express', price: 12.99 },
                    ],
                } as any);
                mockShopperBasketsClient.updateShippingMethodForShipment.mockResolvedValue({
                    data: basketWithAddressNoMethod,
                });

                await initializeBasketForReturningCustomer({} as any, baseProfile);

                expect(mockShopperBasketsClient.updateShippingMethodForShipment).toHaveBeenCalledWith(
                    expect.objectContaining({ body: { id: 'standard' } })
                );
            });
        });
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
    });

    describe('applyDefaultShippingMethod', () => {
        const mockShopperBasketsClient = {
            updateShippingMethodForShipment: vi.fn(),
        };

        beforeEach(async () => {
            vi.clearAllMocks();
            const { createApiClients } = await import('@/lib/api-clients.server');
            vi.mocked(createApiClients).mockReturnValue({
                shopperBasketsV2: mockShopperBasketsClient,
            } as any);
        });

        it('keeps the basket method unchanged when the current selection is still applicable', async () => {
            const basket = {
                basketId: 'b1',
                shipments: [
                    {
                        shipmentId: 'me',
                        shippingAddress: { address1: '123 Main St' },
                        shippingMethod: { id: 'standard' },
                    },
                ],
            } as any;

            const result = await applyDefaultShippingMethod({} as any, basket, [
                { id: 'standard', name: 'Standard', price: 5.99 },
                { id: 'express', name: 'Express', price: 12.99 },
            ] as any);

            expect(result).toBe(basket);
            expect(mockShopperBasketsClient.updateShippingMethodForShipment).not.toHaveBeenCalled();
        });

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        it('replaces a stale pickup selection with the first non-pickup applicable method on address change', async () => {
            const { updateBasketResource } = await import('@/middlewares/basket.server');
            vi.mocked(updateBasketResource).mockImplementation(() => {});

            const basket = {
                basketId: 'b1',
                shipments: [
                    {
                        shipmentId: 'me',
                        shippingAddress: { address1: '123 Main St' },
                        shippingMethod: { id: '005' }, // stale pickup
                    },
                ],
            } as any;
            const updatedBasket = {
                ...basket,
                shipments: [{ ...basket.shipments[0], shippingMethod: { id: 'standard' } }],
            };
            mockShopperBasketsClient.updateShippingMethodForShipment.mockResolvedValue({ data: updatedBasket });

            const result = await applyDefaultShippingMethod({} as any, basket, [
                { id: '005', name: 'Pickup', price: 0, c_storePickupEnabled: true },
                { id: 'standard', name: 'Standard', price: 5.99 },
                { id: 'express', name: 'Express', price: 12.99 },
            ] as any);

            expect(mockShopperBasketsClient.updateShippingMethodForShipment).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: { path: { basketId: 'b1', shipmentId: 'me' } },
                    body: { id: 'standard' },
                })
            );
            expect(result).toBe(updatedBasket);
        });

        it('leaves the stale method untouched when only pickup is applicable for the new address', async () => {
            const basket = {
                basketId: 'b1',
                shipments: [
                    {
                        shipmentId: 'me',
                        shippingAddress: { address1: '123 Main St' },
                        shippingMethod: { id: 'standard' },
                    },
                ],
            } as any;

            const result = await applyDefaultShippingMethod({} as any, basket, [
                { id: '005', name: 'Pickup', price: 0, c_storePickupEnabled: true },
            ] as any);

            expect(result).toBe(basket);
            expect(mockShopperBasketsClient.updateShippingMethodForShipment).not.toHaveBeenCalled();
        });
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        it('skips when shipment has no address', async () => {
            const basket = {
                basketId: 'b1',
                shipments: [{ shipmentId: 'me', shippingAddress: undefined }],
            } as any;

            const result = await applyDefaultShippingMethod({} as any, basket, [
                { id: 'standard', name: 'Standard', price: 5.99 },
            ] as any);

            expect(result).toBe(basket);
            expect(mockShopperBasketsClient.updateShippingMethodForShipment).not.toHaveBeenCalled();
        });

        it('falls back to fetching applicable methods when none are passed in', async () => {
            const { updateBasketResource } = await import('@/middlewares/basket.server');
            const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods.server');
            vi.mocked(updateBasketResource).mockImplementation(() => {});
            vi.mocked(getShippingMethodsForShipment).mockResolvedValue({
                applicableShippingMethods: [{ id: 'standard', name: 'Standard', price: 5.99 }],
            } as any);

            const basket = {
                basketId: 'b1',
                shipments: [
                    {
                        shipmentId: 'me',
                        shippingAddress: { address1: '123 Main St' },
                    },
                ],
            } as any;
            mockShopperBasketsClient.updateShippingMethodForShipment.mockResolvedValue({
                data: { ...basket, shipments: [{ ...basket.shipments[0], shippingMethod: { id: 'standard' } }] },
            });

            await applyDefaultShippingMethod({} as any, basket);

            expect(getShippingMethodsForShipment).toHaveBeenCalledWith({}, 'b1', 'me');
            expect(mockShopperBasketsClient.updateShippingMethodForShipment).toHaveBeenCalledWith(
                expect.objectContaining({ body: { id: 'standard' } })
            );
        });
    });
});
