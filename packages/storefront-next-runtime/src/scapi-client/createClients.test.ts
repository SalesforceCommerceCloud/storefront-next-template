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
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createCommerceApiClients, type Clients } from './createClients';
import { ApiError } from './ApiError';
import type { Middleware } from 'openapi-fetch';

describe('createCommerceApiClients', () => {
    const baseUrl = 'https://test.commercecloud.salesforce.com';
    const organizationId = 'f_ecom_test_prd';
    const siteId = 'RefArch';
    const clientId = 'test-client-id';
    const redirectUri = 'https://example.com/callback';

    // Default config with required injection parameters
    const defaultConfig = { baseUrl, organizationId, siteId, clientId, redirectUri };

    describe('required parameter validation', () => {
        it('should throw error when clientId is missing', () => {
            expect(() =>
                createCommerceApiClients({
                    ...defaultConfig,
                    clientId: '',
                })
            ).toThrow('Missing required configuration: clientId');
        });

        it('should throw error when organizationId is missing', () => {
            expect(() =>
                createCommerceApiClients({
                    ...defaultConfig,
                    organizationId: '',
                })
            ).toThrow('Missing required configuration: organizationId');
        });

        it('should throw error when baseUrl is missing', () => {
            expect(() =>
                createCommerceApiClients({
                    ...defaultConfig,
                    baseUrl: '',
                })
            ).toThrow('Missing required configuration: baseUrl');
        });

        it('should throw error when siteId is missing', () => {
            expect(() =>
                createCommerceApiClients({
                    ...defaultConfig,
                    siteId: '',
                })
            ).toThrow('Missing required configuration: siteId');
        });

        it('should throw error when redirectUri is missing', () => {
            expect(() =>
                createCommerceApiClients({
                    ...defaultConfig,
                    redirectUri: '',
                })
            ).toThrow('Missing required configuration: redirectUri');
        });

        it('should list all missing parameters in error message', () => {
            expect(() =>
                createCommerceApiClients({
                    baseUrl: '',
                    organizationId: '',
                    siteId: '',
                    clientId: '',
                    redirectUri: '',
                })
            ).toThrow('Missing required configuration: baseUrl, organizationId, siteId, clientId, redirectUri');
        });
    });

    describe('client creation', () => {
        it('should create all required client instances', () => {
            const clients = createCommerceApiClients(defaultConfig);

            expect(clients.shopperAvailability).toBeDefined();
            expect(clients.shopperBasketsV1).toBeDefined();
            expect(clients.shopperBasketsV2).toBeDefined();
            expect(clients.shopperConsents).toBeDefined();
            expect(clients.shopperContext).toBeDefined();
            expect(clients.shopperCustomers).toBeDefined();
            expect(clients.shopperDeliveryEstimates).toBeDefined();
            expect(clients.shopperExperience).toBeDefined();
            expect(clients.shopperGiftCertificates).toBeDefined();
            expect(clients.shopperLogin).toBeDefined();
            expect(clients.shopperOrders).toBeDefined();
            expect(clients.shopperProducts).toBeDefined();
            expect(clients.shopperPromotions).toBeDefined();
            expect(clients.shopperSearch).toBeDefined();
            expect(clients.shopperSeo).toBeDefined();
            expect(clients.shopperStores).toBeDefined();
        });

        it('should create auth namespace with all methods', () => {
            const clients = createCommerceApiClients(defaultConfig);

            expect(clients.auth).toBeDefined();
            expect(typeof clients.auth.loginAsGuest).toBe('function');
            expect(typeof clients.auth.loginWithCredentials).toBe('function');
            expect(typeof clients.auth.refreshToken).toBe('function');
            expect(typeof clients.auth.logout).toBe('function');
        });

        it('should create a use method', () => {
            const clients = createCommerceApiClients(defaultConfig);

            expect(clients.use).toBeDefined();
            expect(typeof clients.use).toBe('function');
        });
    });

    describe('custom fetch', () => {
        it('should use custom fetch when provided', () => {
            const customFetch = vi.fn();
            const clients = createCommerceApiClients({
                ...defaultConfig,
                fetch: customFetch,
            });

            // Verify clients are created
            expect(clients.shopperBasketsV1).toBeDefined();
            expect(clients.shopperProducts).toBeDefined();
        });

        it('should work without custom fetch', () => {
            const clients = createCommerceApiClients(defaultConfig);

            expect(clients.shopperBasketsV1).toBeDefined();
            expect(clients.shopperProducts).toBeDefined();
        });
    });

    describe('middleware', () => {
        it('should apply middleware to all clients via use method', () => {
            const clients = createCommerceApiClients(defaultConfig);

            // Spy on each client's use method
            const availabilitySpy = vi.spyOn(clients.shopperAvailability, 'use');
            const basketsV1Spy = vi.spyOn(clients.shopperBasketsV1, 'use');
            const basketsV2Spy = vi.spyOn(clients.shopperBasketsV2, 'use');
            const consentsSpy = vi.spyOn(clients.shopperConsents, 'use');
            const contextSpy = vi.spyOn(clients.shopperContext, 'use');
            const customersSpy = vi.spyOn(clients.shopperCustomers, 'use');
            const deliveryEstimatesSpy = vi.spyOn(clients.shopperDeliveryEstimates, 'use');
            const experienceSpy = vi.spyOn(clients.shopperExperience, 'use');
            const giftCertsSpy = vi.spyOn(clients.shopperGiftCertificates, 'use');
            const loginSpy = vi.spyOn(clients.shopperLogin, 'use');
            const ordersSpy = vi.spyOn(clients.shopperOrders, 'use');
            const productsSpy = vi.spyOn(clients.shopperProducts, 'use');
            const promotionsSpy = vi.spyOn(clients.shopperPromotions, 'use');
            const searchSpy = vi.spyOn(clients.shopperSearch, 'use');
            const seoSpy = vi.spyOn(clients.shopperSeo, 'use');
            const storesSpy = vi.spyOn(clients.shopperStores, 'use');

            const middleware: Middleware = {
                onRequest: vi.fn((req) => req),
            };

            clients.use(middleware);

            // Verify that use was called on all clients
            expect(availabilitySpy).toHaveBeenCalledWith(middleware);
            expect(basketsV1Spy).toHaveBeenCalledWith(middleware);
            expect(basketsV2Spy).toHaveBeenCalledWith(middleware);
            expect(consentsSpy).toHaveBeenCalledWith(middleware);
            expect(contextSpy).toHaveBeenCalledWith(middleware);
            expect(customersSpy).toHaveBeenCalledWith(middleware);
            expect(deliveryEstimatesSpy).toHaveBeenCalledWith(middleware);
            expect(experienceSpy).toHaveBeenCalledWith(middleware);
            expect(giftCertsSpy).toHaveBeenCalledWith(middleware);
            expect(loginSpy).toHaveBeenCalledWith(middleware);
            expect(ordersSpy).toHaveBeenCalledWith(middleware);
            expect(productsSpy).toHaveBeenCalledWith(middleware);
            expect(promotionsSpy).toHaveBeenCalledWith(middleware);
            expect(searchSpy).toHaveBeenCalledWith(middleware);
            expect(seoSpy).toHaveBeenCalledWith(middleware);
            expect(storesSpy).toHaveBeenCalledWith(middleware);
        });

        it('should apply multiple middlewares to all clients', () => {
            const clients = createCommerceApiClients(defaultConfig);

            const middleware1: Middleware = { onRequest: vi.fn((req) => req) };
            const middleware2: Middleware = { onResponse: vi.fn((res) => res) };

            // Should not throw
            clients.use(middleware1);
            clients.use(middleware2);

            // Verify both middlewares were applied (we can't directly check,
            // but we can verify no errors occurred)
            expect(clients.shopperProducts).toBeDefined();
        });
    });

    describe('client types', () => {
        it('should return properly typed Clients object', () => {
            const clients: Clients = createCommerceApiClients(defaultConfig);

            // Type checking - these should compile without errors
            expect(clients.shopperAvailability).toBeDefined();
            expect(clients.shopperBasketsV1).toBeDefined();
            expect(clients.shopperBasketsV2).toBeDefined();
            expect(clients.shopperConsents).toBeDefined();
            expect(clients.shopperContext).toBeDefined();
            expect(clients.shopperCustomers).toBeDefined();
            expect(clients.shopperDeliveryEstimates).toBeDefined();
            expect(clients.shopperExperience).toBeDefined();
            expect(clients.shopperGiftCertificates).toBeDefined();
            expect(clients.shopperLogin).toBeDefined();
            expect(clients.shopperOrders).toBeDefined();
            expect(clients.shopperProducts).toBeDefined();
            expect(clients.shopperPromotions).toBeDefined();
            expect(clients.shopperSearch).toBeDefined();
            expect(clients.shopperSeo).toBeDefined();
            expect(clients.shopperStores).toBeDefined();
            expect(clients.use).toBeDefined();
        });
    });

    describe('type safety and runtime integration tests', () => {
        // Type mockFetch as Mock with fetch signature for Vitest 4.x compatibility
        let mockFetch: Mock<(input: Request) => Promise<Response>>;

        // Helper to create a proper mock Response object
        const createMockResponse = (data: unknown, status = 200, ok = true) => {
            const response = {
                ok,
                status,
                statusText: ok ? 'OK' : 'Error',
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve(data),
                text: () => Promise.resolve(JSON.stringify(data)),
                blob: () => Promise.resolve(new Blob([JSON.stringify(data)])),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
                clone: () => createMockResponse(data, status, ok),
            };
            return response as Response;
        };

        beforeEach(() => {
            mockFetch = vi.fn();
        });

        describe('GET requests - shopperProducts.getProducts', () => {
            it('should call underlying GET method with correct parameters', async () => {
                mockFetch.mockResolvedValue(createMockResponse({ data: [] }));

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                await clients.shopperProducts.getProducts({
                    params: {
                        path: { organizationId: 'org123' },
                        query: { siteId: 'RefArch', ids: ['product1', 'product2'] },
                    },
                });

                expect(mockFetch).toHaveBeenCalledTimes(1);
                const [request] = mockFetch.mock.calls[0];
                const url = request instanceof Request ? request.url : String(request);
                expect(url).toContain('/organizations/org123/products');
                expect(url).toContain('siteId=RefArch');
                expect(url).toContain('ids=product1');
            });

            it('should work with optional query parameters', async () => {
                mockFetch.mockResolvedValue(createMockResponse({ data: [] }));

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                await clients.shopperProducts.getProducts({
                    params: {
                        path: { organizationId: 'org123' },
                        query: {
                            siteId: 'RefArch',
                            ids: ['product1'],
                            allImages: true,
                        },
                    },
                });

                expect(mockFetch).toHaveBeenCalledTimes(1);
            });
        });

        describe('GET requests with path params - shopperProducts.getProduct', () => {
            it('should call underlying GET method with path parameters', async () => {
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: () => Promise.resolve({ id: 'product123' }),
                } as Response);

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                await clients.shopperProducts.getProduct({
                    params: {
                        path: { organizationId: 'org123', id: 'product123' },
                        query: { siteId: 'RefArch' },
                    },
                });

                expect(mockFetch).toHaveBeenCalledTimes(1);
                const [request] = mockFetch.mock.calls[0];
                const url = request instanceof Request ? request.url : String(request);
                expect(url).toContain('/organizations/org123/products/product123');
            });

            /*
             * Type safety tests - these should fail at compile time:
             * - Missing required path parameter id
             * - Wrong type for id (number instead of string)
             * These are validated by TypeScript, see proxy-types.test-d.ts
             */
        });

        describe('POST requests - shopperBaskets.createBasket', () => {
            it('should call underlying POST method', async () => {
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 201,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: () => Promise.resolve({ basketId: 'basket123' }),
                } as Response);

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                await clients.shopperBasketsV1.createBasket({
                    params: {
                        path: { organizationId: 'org123' },
                        query: { siteId: 'RefArch' },
                    },
                    body: {},
                });

                expect(mockFetch).toHaveBeenCalledTimes(1);
                const [request] = mockFetch.mock.calls[0];
                const url = request instanceof Request ? request.url : String(request);
                expect(url).toContain('/organizations/org123/baskets');
                if (request instanceof Request) {
                    expect(request.method).toBe('POST');
                }
            });
        });

        describe('POST requests with body - shopperBaskets.addItemToBasket', () => {
            it('should call underlying POST method with body', async () => {
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: () => Promise.resolve({ basketId: 'basket123' }),
                } as Response);

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                await clients.shopperBasketsV1.addItemToBasket({
                    params: {
                        path: { organizationId: 'org123', basketId: 'basket123' },
                        query: { siteId: 'RefArch' },
                    },
                    body: [{ productId: 'product123', quantity: 1 }],
                });

                expect(mockFetch).toHaveBeenCalledTimes(1);
                const [request] = mockFetch.mock.calls[0];
                const url = request instanceof Request ? request.url : String(request);
                expect(url).toContain('/baskets/basket123/items');
                if (request instanceof Request) {
                    expect(request.method).toBe('POST');
                }
            });

            /*
             * Type safety: TypeScript enforces body must be an array
             * See proxy-types.test-d.ts for compile-time validation
             */
        });

        describe('PATCH requests - shopperBaskets.updateBasket', () => {
            it('should call underlying PATCH method', async () => {
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: () => Promise.resolve({ basketId: 'basket123' }),
                } as Response);

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                await clients.shopperBasketsV1.updateBasket({
                    params: {
                        path: { organizationId: 'org123', basketId: 'basket123' },
                        query: { siteId: 'RefArch' },
                    },
                    body: {},
                });

                expect(mockFetch).toHaveBeenCalledTimes(1);
                const [request] = mockFetch.mock.calls[0];
                if (request instanceof Request) {
                    expect(request.method).toBe('PATCH');
                }
            });
        });

        describe('PUT requests - shopperBaskets.updateBillingAddressForBasket', () => {
            it('should call underlying PUT method', async () => {
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: () => Promise.resolve({ basketId: 'basket123' }),
                } as Response);

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                await clients.shopperBasketsV1.updateBillingAddressForBasket({
                    params: {
                        path: { organizationId: 'org123', basketId: 'basket123' },
                        query: { siteId: 'RefArch' },
                    },
                    body: {
                        address1: '123 Main St',
                        city: 'Boston',
                        countryCode: 'US',
                        firstName: 'John',
                        lastName: 'Doe',
                        postalCode: '02101',
                    },
                });

                expect(mockFetch).toHaveBeenCalledTimes(1);
                const [request] = mockFetch.mock.calls[0];
                if (request instanceof Request) {
                    expect(request.method).toBe('PUT');
                }
            });
        });

        describe('DELETE requests - shopperBaskets.deleteBasket', () => {
            it('should call underlying DELETE method', async () => {
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 204,
                    headers: new Headers(),
                } as Response);

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                await clients.shopperBasketsV1.deleteBasket({
                    params: {
                        path: { organizationId: 'org123', basketId: 'basket123' },
                        query: { siteId: 'RefArch' },
                    },
                });

                expect(mockFetch).toHaveBeenCalledTimes(1);
                const [request] = mockFetch.mock.calls[0];
                if (request instanceof Request) {
                    expect(request.method).toBe('DELETE');
                }
            });

            /*
             * Type safety: TypeScript enforces required basketId parameter
             * See proxy-types.test-d.ts for compile-time validation
             */
        });

        describe('DELETE with multiple path params - shopperBaskets.removeItemFromBasket', () => {
            it('should call underlying DELETE method with all path params', async () => {
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: () => Promise.resolve({ basketId: 'basket123' }),
                } as Response);

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                await clients.shopperBasketsV1.removeItemFromBasket({
                    params: {
                        path: {
                            organizationId: 'org123',
                            basketId: 'basket123',
                            itemId: 'item123',
                        },
                        query: { siteId: 'RefArch' },
                    },
                });

                expect(mockFetch).toHaveBeenCalledTimes(1);
                const [request] = mockFetch.mock.calls[0];
                const url = request instanceof Request ? request.url : String(request);
                expect(url).toContain('/baskets/basket123/items/item123');
            });
        });

        describe('custom headers and options', () => {
            it('should pass custom headers through', async () => {
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: () => Promise.resolve({ data: [] }),
                } as Response);

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                await clients.shopperProducts.getProducts({
                    params: {
                        path: { organizationId: 'org123' },
                        query: { siteId: 'RefArch', ids: ['product1'] },
                    },
                    headers: {
                        Authorization: 'Bearer token123',
                    },
                });

                expect(mockFetch).toHaveBeenCalledTimes(1);
                const [request] = mockFetch.mock.calls[0];
                if (request instanceof Request) {
                    expect(request.headers.get('Authorization')).toBe('Bearer token123');
                }
            });

            it('should support baseUrl override', async () => {
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: () => Promise.resolve({ data: [] }),
                } as Response);

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                await clients.shopperProducts.getProducts({
                    params: {
                        path: { organizationId: 'org123' },
                        query: { siteId: 'RefArch', ids: ['product1'] },
                    },
                    baseUrl: 'https://custom.api.com',
                });

                expect(mockFetch).toHaveBeenCalledTimes(1);
                const [request] = mockFetch.mock.calls[0];
                const url = request instanceof Request ? request.url : String(request);
                expect(url).toContain('https://custom.api.com');
            });
        });

        describe('response handling', () => {
            it('should return data and response on successful response', async () => {
                const mockData = { total: 10, data: [{ id: 'product1' }] };
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: () => Promise.resolve(mockData),
                    url: 'https://test.commercecloud.salesforce.com/product/shopper-products/v1/organizations/org123/products',
                } as Response);

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                const result = await clients.shopperProducts.getProducts({
                    params: {
                        path: { organizationId: 'org123' },
                        query: { siteId: 'RefArch', ids: ['product1'] },
                    },
                });

                expect(result.data).toEqual(mockData);
                expect(result.response).toBeDefined();
                expect(result.response.status).toBe(200);
                expect(result).not.toHaveProperty('error');
            });

            it('should throw ApiError on failed response', async () => {
                const errorData = { message: 'Not found', code: 'PRODUCT_NOT_FOUND' };
                mockFetch.mockResolvedValue({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: () => Promise.resolve(errorData),
                    text: () => Promise.resolve(JSON.stringify(errorData)),
                    url: 'https://test.commercecloud.salesforce.com/product/shopper-products/v1/organizations/org123/products/invalid',
                    clone() {
                        return this;
                    },
                } as Response);

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                await expect(async () => {
                    await clients.shopperProducts.getProduct({
                        params: {
                            path: { organizationId: 'org123', id: 'invalid' },
                            query: { siteId: 'RefArch' },
                        },
                    });
                }).rejects.toThrow(ApiError);
            });

            it('should throw ApiError with correct error details', async () => {
                // RFC 7807 error format
                const errorData = {
                    type: 'ForbiddenException',
                    title: 'Forbidden',
                    detail: 'Authenticated user does not have access to this resource',
                };
                const errorHeaders = new Headers({
                    'content-type': 'application/json',
                    'www-authenticate': 'Bearer realm="example"',
                });
                mockFetch.mockResolvedValue({
                    ok: false,
                    status: 403,
                    statusText: 'Forbidden',
                    headers: errorHeaders,
                    json: () => Promise.resolve(errorData),
                    text: () => Promise.resolve(JSON.stringify(errorData)),
                    url: 'https://test.commercecloud.salesforce.com/shopper/baskets/v1/organizations/org123/baskets',
                    clone() {
                        return this;
                    },
                } as Response);

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                try {
                    await clients.shopperBasketsV1.createBasket({
                        params: {
                            path: { organizationId: 'org123' },
                            query: { siteId: 'RefArch' },
                        },
                        body: {},
                    });
                    expect.fail('Should have thrown ApiError');
                } catch (error) {
                    expect(error).toBeInstanceOf(ApiError);
                    const apiError = error as ApiError;
                    expect(apiError.status).toBe(403);
                    expect(apiError.statusText).toBe('Forbidden');
                    expect(apiError.body).toEqual(errorData);
                    expect(apiError.rawBody).toBe(JSON.stringify(errorData));
                    expect(apiError.headers).toBe(errorHeaders);
                    expect(apiError.method).toBe('POST');
                    expect(apiError.url).toContain('/baskets');
                }
            });

            it('should provide access to response headers on success', async () => {
                const mockData = { id: 'basket123' };
                const responseHeaders = new Headers({
                    'content-type': 'application/json',
                    etag: '"abc123"',
                    'x-custom-header': 'custom-value',
                });
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 201,
                    statusText: 'Created',
                    headers: responseHeaders,
                    json: () => Promise.resolve(mockData),
                    url: 'https://test.commercecloud.salesforce.com/shopper/baskets/v1/organizations/org123/baskets',
                } as Response);

                const clients = createCommerceApiClients({
                    ...defaultConfig,
                    fetch: mockFetch,
                });

                const result = await clients.shopperBasketsV1.createBasket({
                    params: {
                        path: { organizationId: 'org123' },
                        query: { siteId: 'RefArch' },
                    },
                    body: {},
                });

                expect(result.data).toEqual(mockData);
                expect(result.response.headers.get('etag')).toBe('"abc123"');
                expect(result.response.headers.get('x-custom-header')).toBe('custom-value');
            });
        });
    });

    describe('proxyHost (workspace mode)', () => {
        it('should strip f_ecom_ prefix from organizationId when proxyHost is set', () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve({}),
            } as Response);

            const clients = createCommerceApiClients({
                ...defaultConfig,
                organizationId: 'f_ecom_zzzz_s01',
                proxyHost: 'https://scw:25010',
                fetch: mockFetch,
            });

            // Clients should be created
            expect(clients.shopperProducts).toBeDefined();
            expect(clients.auth).toBeDefined();
        });

        it('should register org ID rewriting middleware when proxyHost is set', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve({ data: [] }),
            } as Response);

            const clients = createCommerceApiClients({
                ...defaultConfig,
                organizationId: 'f_ecom_zzzz_s01',
                proxyHost: 'https://scw:25010',
                fetch: mockFetch,
            });

            // Make a product API call — the middleware should rewrite the org ID
            await clients.shopperProducts.getProducts({
                params: {
                    query: { ids: ['p1'] },
                },
            });

            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [request] = mockFetch.mock.calls[0];
            const url = request instanceof Request ? request.url : String(request);
            // Non-SLAS endpoint should have full org ID restored
            expect(url).toContain('/organizations/f_ecom_zzzz_s01/');
        });

        it('should NOT rewrite org ID for SLAS auth endpoints', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 303,
                headers: new Headers({
                    location: 'https://example.com/callback?code=abc&usid=123',
                }),
                json: () => Promise.resolve({}),
            } as Response);

            const clients = createCommerceApiClients({
                ...defaultConfig,
                organizationId: 'f_ecom_zzzz_s01',
                proxyHost: 'https://scw:25010',
                fetch: mockFetch,
            });

            // Call an SLAS endpoint
            await clients.shopperLogin.authorizeCustomer({
                params: {
                    query: {
                        client_id: clientId,
                        channel_id: siteId,
                        redirect_uri: redirectUri,
                        response_type: 'code',
                    },
                },
                redirect: 'manual',
            });

            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [request] = mockFetch.mock.calls[0];
            const url = request instanceof Request ? request.url : String(request);
            // SLAS auth endpoint should keep stripped org ID
            expect(url).toContain('/organizations/zzzz_s01/');
            expect(url).not.toContain('/organizations/f_ecom_zzzz_s01/');
        });

        it('should not register middleware when proxyHost is not set', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve({ data: [] }),
            } as Response);

            const clients = createCommerceApiClients({
                ...defaultConfig,
                organizationId: 'f_ecom_zzzz_s01',
                fetch: mockFetch,
            });

            await clients.shopperProducts.getProducts({
                params: {
                    query: { ids: ['p1'] },
                },
            });

            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [request] = mockFetch.mock.calls[0];
            const url = request instanceof Request ? request.url : String(request);
            // Without proxyHost, org ID should remain as-is
            expect(url).toContain('/organizations/f_ecom_zzzz_s01/');
        });
    });
});
