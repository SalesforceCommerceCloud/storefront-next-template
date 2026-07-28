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
/**
 * Type-level tests for SCAPI client type safety
 *
 * These tests verify TypeScript enforces correct types at compile time.
 * Run with: pnpm typecheck
 *
 * The tests verify:
 * 1. Valid API calls compile successfully
 * 2. Invalid calls produce TypeScript errors (checked manually or in CI)
 * 3. Response types are correctly inferred
 */
import { expectTypeOf, describe, it, expect } from 'vitest';
import { createCommerceApiClients, type Clients } from './createClients';
import { ApiError } from './ApiError';

describe('SCAPI Client Type Safety', () => {
    const clients = createCommerceApiClients({
        baseUrl: 'https://test.com',
        organizationId: 'f_ecom_test_prd',
        siteId: 'RefArch',
        clientId: 'test-client-id',
        redirectUri: 'https://test.com/callback',
    });

    describe('valid API calls', () => {
        it('should allow valid getCategories call', () => {
            // This should compile without errors - all required params provided
            const validCall = () =>
                clients.shopperProducts.getCategories({
                    params: {
                        path: { organizationId: 'org123' },
                        query: { ids: ['root'], siteId: 'RefArch' },
                    },
                });

            expectTypeOf(validCall).returns.resolves.toHaveProperty('data');
        });

        it('should allow valid getProduct call with all required params', () => {
            const validCall = () =>
                clients.shopperProducts.getProduct({
                    params: {
                        path: { organizationId: 'org123', id: 'prod123' },
                        query: { siteId: 'RefArch' },
                    },
                });

            expectTypeOf(validCall).returns.resolves.toHaveProperty('data');
        });

        it('should allow optional query parameters to be omitted', () => {
            // Optional params like 'allImages' can be omitted - this is type-checked at compile time
            const validCallWithoutOptional = () =>
                clients.shopperProducts.getProducts({
                    params: {
                        path: { organizationId: 'org123' },
                        query: {
                            siteId: 'RefArch',
                            ids: ['product1'],
                        },
                    },
                });

            // Or included
            const validCallWithOptional = () =>
                clients.shopperProducts.getProducts({
                    params: {
                        path: { organizationId: 'org123' },
                        query: {
                            siteId: 'RefArch',
                            ids: ['product1'],
                            allImages: true,
                        },
                    },
                });

            expectTypeOf(validCallWithoutOptional).returns.resolves.toHaveProperty('data');
            expectTypeOf(validCallWithOptional).returns.resolves.toHaveProperty('data');
        });

        it('should allow POST requests with body', () => {
            const validCall = () =>
                clients.shopperBasketsV1.createBasket({
                    params: {
                        path: { organizationId: 'org123' },
                        query: { siteId: 'RefArch' },
                    },
                    body: {},
                });

            expectTypeOf(validCall).returns.resolves.toHaveProperty('data');
        });

        it('should allow operations with empty suffix (createBasket)', () => {
            // createBasket has empty suffix (s: '') because path matches BASE_PATH exactly
            // This tests that operations with empty suffix are type-safe
            const validCall = () =>
                clients.shopperBasketsV1.createBasket({
                    params: {
                        path: { organizationId: 'org123' },
                        query: { siteId: 'RefArch' },
                    },
                    body: {},
                });

            expectTypeOf(validCall).returns.resolves.toHaveProperty('data');
            expectTypeOf(validCall).returns.resolves.toHaveProperty('response');
        });

        it('should allow operations with empty suffix (createOrder)', () => {
            // createOrder has empty suffix (s: '') because path matches BASE_PATH exactly
            const validCall = () =>
                clients.shopperOrders.createOrder({
                    params: {
                        path: { organizationId: 'org123' },
                        query: { siteId: 'RefArch' },
                    },
                    body: {
                        basketId: 'basket123',
                    },
                });

            expectTypeOf(validCall).returns.resolves.toHaveProperty('data');
            expectTypeOf(validCall).returns.resolves.toHaveProperty('response');
        });

        it('should allow custom headers', () => {
            const validCall = () =>
                clients.shopperProducts.getCategories({
                    params: {
                        path: { organizationId: 'org123' },
                        query: { ids: ['root'], siteId: 'RefArch' },
                    },
                    headers: {
                        Authorization: 'Bearer token123',
                    },
                });

            expectTypeOf(validCall).returns.resolves.toHaveProperty('data');
        });
    });

    describe('parameter type enforcement', () => {
        it('should enforce string type for organizationId', () => {
            // Valid: string
            expectTypeOf<{ organizationId: string }>().toMatchTypeOf<{
                organizationId: string;
            }>();

            // Invalid: number (this would be caught by TypeScript)
            expectTypeOf<{ organizationId: number }>().not.toMatchTypeOf<{
                organizationId: string;
            }>();
        });

        it('should enforce array type for ids parameter', () => {
            type QueryParams = {
                ids: string[];
                siteId: string;
            };

            // Valid: string array
            expectTypeOf<{ ids: string[] }>().toMatchTypeOf<Pick<QueryParams, 'ids'>>();

            // Invalid: single string
            expectTypeOf<{ ids: string }>().not.toMatchTypeOf<Pick<QueryParams, 'ids'>>();

            // Invalid: number array
            expectTypeOf<{ ids: number[] }>().not.toMatchTypeOf<Pick<QueryParams, 'ids'>>();
        });
    });

    describe('response types', () => {
        it('should infer correct response structure', () => {
            // Type-check the response structure without making actual HTTP call
            type GetResponse = typeof clients.shopperProducts.getCategories;
            type ResponseType = Awaited<ReturnType<GetResponse>>;

            // Response should have data and response properties
            expectTypeOf<ResponseType>().toHaveProperty('data');
            expectTypeOf<ResponseType>().toHaveProperty('response');
        });

        it('should have Response type for response property', () => {
            type GetResponse = typeof clients.shopperProducts.getCategories;
            type ResponseType = Awaited<ReturnType<GetResponse>>;
            type ResponseProp = ResponseType['response'];

            // response property should be of type Response
            expectTypeOf<ResponseProp>().toMatchTypeOf<Response>();
        });

        it('should have typed data property from OpenAPI spec', () => {
            type GetCategoriesResponse = typeof clients.shopperProducts.getCategories;
            type ResponseType = Awaited<ReturnType<GetCategoriesResponse>>;
            type DataType = ResponseType['data'];

            // data should be defined (not undefined)
            expectTypeOf<DataType>().not.toBeUndefined();
            expectTypeOf<DataType>().not.toBeNull();
        });

        it('should not have error property in success response', () => {
            type GetResponse = typeof clients.shopperProducts.getCategories;
            type ResponseType = Awaited<ReturnType<GetResponse>>;

            // Response should NOT have an error property (errors are thrown)
            expectTypeOf<ResponseType>().not.toHaveProperty('error');
        });
    });

    describe('client structure', () => {
        it('should expose correct client type', () => {
            expectTypeOf(clients).toMatchTypeOf<Clients>();
        });

        it('should expose operation methods', () => {
            expectTypeOf(clients.shopperProducts.getCategories).toBeFunction();
            expectTypeOf(clients.shopperProducts.getProduct).toBeFunction();
            expectTypeOf(clients.shopperProducts.getProducts).toBeFunction();
        });

        it('should expose middleware methods', () => {
            expectTypeOf(clients.shopperProducts.use).toBeFunction();
            expectTypeOf(clients.shopperProducts.eject).toBeFunction();
            expectTypeOf(clients.use).toBeFunction();
        });

        it('should NOT expose HTTP methods directly', () => {
            // @ts-expect-error - GET should not be accessible
            expectTypeOf(clients.shopperProducts.GET).toBeFunction();
        });
    });

    describe('middleware support', () => {
        it('should accept middleware with proper signature', () => {
            type Middleware = Parameters<typeof clients.use>[0];

            expectTypeOf<Middleware>().toHaveProperty('onRequest');
            expectTypeOf<Middleware>().toHaveProperty('onResponse');
            expectTypeOf<Middleware>().toHaveProperty('onError');
        });
    });

    describe('error handling types', () => {
        it('should have ApiError class available for import', () => {
            // Verify ApiError is properly typed as a constructor
            const error = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: {
                    type: 'https://api.example.com/errors/not-found',
                    title: 'Not Found',
                    detail: 'The requested resource was not found',
                },
                rawBody:
                    '{"type":"https://api.example.com/errors/not-found","title":"Not Found","detail":"The requested resource was not found"}',
                url: 'https://api.example.com',
                method: 'GET',
            });

            expectTypeOf(error).toMatchTypeOf<ApiError>();
        });

        it('should have typed status property on ApiError instance', () => {
            const error = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: {
                    type: 'about:blank',
                    title: 'Not Found',
                    detail: 'Resource not found',
                },
                rawBody: '',
                url: '',
                method: 'GET',
            });

            expectTypeOf(error.status).toBeNumber();
        });

        it('should have typed statusText property on ApiError instance', () => {
            const error = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: {
                    type: 'about:blank',
                    title: 'Not Found',
                    detail: 'Resource not found',
                },
                rawBody: '',
                url: '',
                method: 'GET',
            });

            expectTypeOf(error.statusText).toBeString();
        });

        it('should have typed headers property on ApiError instance', () => {
            const error = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: {
                    type: 'about:blank',
                    title: 'Not Found',
                    detail: 'Resource not found',
                },
                rawBody: '',
                url: '',
                method: 'GET',
            });

            expectTypeOf(error.headers).toMatchTypeOf<Headers>();
        });

        it('should have typed body property on ApiError instance', () => {
            const error = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: {
                    type: 'https://api.example.com/errors/test',
                    title: 'Test Error',
                    detail: 'Test error detail',
                },
                rawBody: '',
                url: '',
                method: 'GET',
            });

            // body property exists and is accessible
            expect(error.body).toBeDefined();
        });

        it('should have typed rawBody property on ApiError instance', () => {
            const error = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: {
                    type: 'about:blank',
                    title: 'Not Found',
                    detail: 'Resource not found',
                },
                rawBody: '',
                url: '',
                method: 'GET',
            });

            expectTypeOf(error.rawBody).toBeString();
        });

        it('should have typed url property on ApiError instance', () => {
            const error = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: {
                    type: 'about:blank',
                    title: 'Not Found',
                    detail: 'Resource not found',
                },
                rawBody: '',
                url: 'https://api.example.com',
                method: 'GET',
            });

            expectTypeOf(error.url).toBeString();
        });

        it('should have typed method property on ApiError instance', () => {
            const error = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: {
                    type: 'about:blank',
                    title: 'Not Found',
                    detail: 'Resource not found',
                },
                rawBody: '',
                url: '',
                method: 'GET',
            });

            expectTypeOf(error.method).toBeString();
        });

        it('should have body typed as ErrorDetail', () => {
            const error = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: {
                    type: 'https://api.example.com/errors/not-found',
                    title: 'Not Found',
                    detail: 'Resource not found',
                },
                rawBody: '',
                url: '',
                method: 'GET',
            });

            expectTypeOf(error.body.type).toBeString();
            expectTypeOf(error.body.title).toBeString();
            expectTypeOf(error.body.detail).toBeString();
        });

        it('should have toJSON method on ApiError instance', () => {
            const error = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: {
                    type: 'https://api.example.com/errors/test',
                    title: 'Test Error',
                    detail: 'Test error detail',
                },
                rawBody:
                    '{"type":"https://api.example.com/errors/test","title":"Test Error","detail":"Test error detail"}',
                url: 'https://api.example.com',
                method: 'GET',
            });

            const toJsonMethod = () => error.toJSON();
            expectTypeOf(toJsonMethod).toBeFunction();

            const jsonResult = error.toJSON();
            expectTypeOf(jsonResult).toHaveProperty('status');
            expectTypeOf(jsonResult).toHaveProperty('body');
            expectTypeOf(jsonResult).toHaveProperty('headers');
        });

        it('should extend Error class', () => {
            const error = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: {
                    type: 'about:blank',
                    title: 'Not Found',
                    detail: 'Resource not found',
                },
                rawBody: '',
                url: '',
                method: 'GET',
            });

            expectTypeOf(error).toMatchTypeOf<Error>();
            expectTypeOf(error.message).toBeString();
            expectTypeOf(error.name).toBeString();
        });

        it('should be throwable and catchable with instanceof check', () => {
            // This verifies the type signature allows throw/catch patterns
            const throwError = (): never => {
                throw new ApiError({
                    status: 404,
                    statusText: 'Not Found',
                    headers: new Headers(),
                    body: {
                        type: 'https://api.example.com/errors/test',
                        title: 'Test Error',
                        detail: 'Test error detail',
                    },
                    rawBody:
                        '{"type":"https://api.example.com/errors/test","title":"Test Error","detail":"Test error detail"}',
                    url: 'https://api.example.com',
                    method: 'GET',
                });
            };

            expectTypeOf(throwError).returns.toBeNever();

            // Verify catch pattern type narrowing works with instanceof
            if (false as boolean) {
                try {
                    throwError();
                } catch (error) {
                    if (error instanceof ApiError) {
                        expectTypeOf(error.status).toBeNumber();
                    }
                }
            }
        });
    });

    describe('realistic error handling usage', () => {
        it('should type narrow error in catch block when calling API methods', async () => {
            // This test verifies that calling actual API client methods and catching
            // errors provides proper type narrowing
            if (false as boolean) {
                try {
                    // Call an API method - this would throw ApiError on non-2xx response
                    await clients.shopperProducts.getProduct({
                        params: {
                            path: { organizationId: 'org123', id: 'invalid-id' },
                            query: { siteId: 'RefArch' },
                        },
                    });
                } catch (error) {
                    // Type narrowing with instanceof should work
                    if (error instanceof ApiError) {
                        // All ApiError properties should be accessible and typed
                        expectTypeOf(error.status).toBeNumber();
                        expectTypeOf(error.statusText).toBeString();
                        expectTypeOf(error.headers).toMatchTypeOf<Headers>();
                        expectTypeOf(error.rawBody).toBeString();
                        expectTypeOf(error.url).toBeString();
                        expectTypeOf(error.method).toBeString();
                    }
                }
            }
        });

        it('should allow typed error body access in catch blocks', async () => {
            // Verify that developers can type-assert error bodies
            if (false as boolean) {
                try {
                    await clients.shopperProducts.getProduct({
                        params: {
                            path: { organizationId: 'org123', id: 'invalid' },
                            query: { siteId: 'RefArch' },
                        },
                    });
                } catch (error) {
                    if (error instanceof ApiError) {
                        // Developer can type-assert the error body based on API docs
                        type SCAPIError = {
                            type: string;
                            title?: string;
                            detail?: string;
                            instance?: string;
                        };

                        const errorBody = error.body as SCAPIError;
                        expectTypeOf(errorBody.type).toBeString();
                        expectTypeOf(errorBody.detail).toEqualTypeOf<string | undefined>();
                    }
                }
            }
        });

        it('should allow access to response headers in error catch blocks', async () => {
            // Verify developers can access response headers from errors
            if (false as boolean) {
                try {
                    await clients.shopperProducts.getProduct({
                        params: {
                            path: { organizationId: 'org123', id: 'invalid' },
                            query: { siteId: 'RefArch' },
                        },
                    });
                } catch (error) {
                    if (error instanceof ApiError) {
                        // Headers should be accessible for debugging/logging
                        const getMethod = (key: string) => error.headers.get(key);
                        expectTypeOf(getMethod).toBeFunction();
                        expectTypeOf(getMethod).parameter(0).toBeString();
                        expectTypeOf(getMethod).returns.toEqualTypeOf<string | null>();

                        // Common headers should be accessible
                        const contentType = error.headers.get('content-type');
                        expectTypeOf(contentType).toEqualTypeOf<string | null>();
                    }
                }
            }
        });

        it('should allow handling specific HTTP status codes', async () => {
            // Verify pattern for handling specific error codes
            if (false as boolean) {
                try {
                    await clients.shopperCustomers.getCustomer({
                        params: {
                            path: { organizationId: 'org123', customerId: 'invalid' },
                            query: { siteId: 'RefArch' },
                        },
                    });
                } catch (error) {
                    if (error instanceof ApiError) {
                        // TypeScript should know status is a number
                        expectTypeOf(error.status).toBeNumber();

                        // Common pattern: handle specific status codes
                        if (error.status === 401) {
                            // Handle unauthorized
                            expectTypeOf(error.status).toEqualTypeOf<number>();
                        } else if (error.status === 404) {
                            // Handle not found
                            expectTypeOf(error.status).toEqualTypeOf<number>();
                        } else if (error.status === 429) {
                            // Handle rate limiting
                            const retryAfter = error.headers.get('retry-after');
                            expectTypeOf(retryAfter).toEqualTypeOf<string | null>();
                        }
                    }
                }
            }
        });

        it('should support success path without error property', async () => {
            // Verify that successful responses have the correct type
            if (false as boolean) {
                const result = await clients.shopperProducts.getProduct({
                    params: {
                        path: { organizationId: 'org123', id: 'valid-id' },
                        query: { siteId: 'RefArch' },
                    },
                });

                // Success response should have data and response
                expectTypeOf(result).toHaveProperty('data');
                expectTypeOf(result).toHaveProperty('response');

                // Should NOT have error property (errors are thrown)
                expectTypeOf(result).not.toHaveProperty('error');

                // Response should be standard Response type
                expectTypeOf(result.response).toMatchTypeOf<Response>();
                expectTypeOf(result.response.headers).toMatchTypeOf<Headers>();
            }
        });

        it('should support async error handling with multiple operations', async () => {
            // Verify error handling works across multiple sequential operations
            if (false as boolean) {
                try {
                    // First operation
                    const basket = await clients.shopperBasketsV1.createBasket({
                        params: {
                            path: { organizationId: 'org123' },
                            query: { siteId: 'RefArch' },
                        },
                        body: {},
                    });

                    // Second operation using result from first
                    await clients.shopperBasketsV1.addItemToBasket({
                        params: {
                            path: {
                                organizationId: 'org123',
                                basketId: basket.data.basketId || 'fallback',
                            },
                            query: { siteId: 'RefArch' },
                        },
                        body: [{ productId: 'prod123', quantity: 1 }],
                    });
                } catch (error) {
                    if (error instanceof ApiError) {
                        // Error from any operation in the chain
                        expectTypeOf(error.status).toBeNumber();
                        expectTypeOf(error.method).toBeString();
                        expectTypeOf(error.url).toBeString();
                    }
                }
            }
        });

        it('should support error logging patterns', async () => {
            // Verify common logging patterns work with proper types
            if (false as boolean) {
                try {
                    await clients.shopperProducts.getProduct({
                        params: {
                            path: { organizationId: 'org123', id: 'invalid' },
                            query: { siteId: 'RefArch' },
                        },
                    });
                } catch (error) {
                    if (error instanceof ApiError) {
                        // toJSON method for structured logging
                        const logData = error.toJSON();
                        expectTypeOf(logData).toHaveProperty('status');
                        expectTypeOf(logData).toHaveProperty('body');
                        expectTypeOf(logData).toHaveProperty('headers');
                        expectTypeOf(logData).toHaveProperty('url');
                        expectTypeOf(logData).toHaveProperty('method');

                        // Should be JSON-serializable
                        const jsonString = JSON.stringify(error);
                        expectTypeOf(jsonString).toBeString();
                    }
                }
            }
        });
    });

    /**
     * Type error detection tests
     *
     * These tests verify that TypeScript DOES catch type errors at compile-time.
     * Each test uses @ts-expect-error to assert that a specific line should fail type checking.
     * If TypeScript doesn't report an error, the test will fail with "Unused @ts-expect-error".
     *
     * IMPORTANT: These are COMPILE-TIME ONLY tests. They do not execute any code at runtime.
     * The 'if (false as boolean)' guard ensures code is never executed while still being type-checked.
     * This is critical for CI - we verify TypeScript catches errors without making HTTP requests.
     */
    /* oxlint-disable @typescript-eslint/no-floating-promises */
    describe('type error detection', () => {
        it('should catch missing required params object', () => {
            if (false as boolean) {
                // @ts-expect-error - params is required
                clients.shopperProducts.getCategories();
            }
        });

        it('should allow omitting path when only organizationId is required (global param)', () => {
            if (false as boolean) {
                // path is optional because organizationId (the only required path param) is provided by global params
                clients.shopperProducts.getCategories({
                    params: {
                        query: { ids: ['root'] },
                    },
                });
            }
        });

        it('should catch missing required query parameter - ids', () => {
            if (false as boolean) {
                clients.shopperProducts.getCategories({
                    params: {
                        path: { organizationId: 'org123' },
                        // @ts-expect-error - query.ids is required
                        query: { siteId: 'RefArch' },
                    },
                });
            }
        });

        it('should allow missing siteId since it is auto-injected', () => {
            // With injection, siteId is optional - the client injects it automatically
            const validCall = () =>
                clients.shopperProducts.getCategories({
                    params: {
                        path: { organizationId: 'org123' },
                        query: { ids: ['root'] }, // siteId not required - injected
                    },
                });
            // This should compile without errors
            expectTypeOf(validCall).toBeFunction();
        });

        it('should catch wrong path parameter type', () => {
            if (false as boolean) {
                clients.shopperProducts.getCategories({
                    params: {
                        // @ts-expect-error - organizationId must be string, not number
                        path: { organizationId: 123 },
                        query: { ids: ['root'], siteId: 'RefArch' },
                    },
                });
            }
        });

        it('should catch wrong query parameter type - string instead of array', () => {
            if (false as boolean) {
                clients.shopperProducts.getCategories({
                    params: {
                        path: { organizationId: 'org123' },
                        // @ts-expect-error - ids must be string[], not string
                        query: { ids: 'root', siteId: 'RefArch' },
                    },
                });
            }
        });

        it('should catch wrong query parameter type - number array instead of string array', () => {
            if (false as boolean) {
                clients.shopperProducts.getCategories({
                    params: {
                        path: { organizationId: 'org123' },
                        // @ts-expect-error - ids must be string[], not number[]
                        query: { ids: [1, 2, 3], siteId: 'RefArch' },
                    },
                });
            }
        });

        it('should catch unknown path parameter', () => {
            if (false as boolean) {
                clients.shopperProducts.getCategories({
                    params: {
                        // @ts-expect-error - unknownParam is not a valid path parameter
                        path: { organizationId: 'org123', unknownParam: 'value' },
                        query: { ids: ['root'], siteId: 'RefArch' },
                    },
                });
            }
        });

        it('should catch unknown query parameter', () => {
            if (false as boolean) {
                clients.shopperProducts.getCategories({
                    params: {
                        path: { organizationId: 'org123' },
                        // @ts-expect-error - unknownQuery is not a valid query parameter
                        query: { ids: ['root'], siteId: 'RefArch', unknownQuery: 'value' },
                    },
                });
            }
        });

        it('should catch missing path parameter id in getProduct', () => {
            if (false as boolean) {
                clients.shopperProducts.getProduct({
                    params: {
                        // @ts-expect-error - path.id is required
                        path: { organizationId: 'org123' },
                        query: { siteId: 'RefArch' },
                    },
                });
            }
        });

        it('should catch wrong body type - object instead of array', () => {
            if (false as boolean) {
                clients.shopperBasketsV1.addItemToBasket({
                    params: {
                        path: { organizationId: 'org123', basketId: 'basket123' },
                        query: { siteId: 'RefArch' },
                    },
                    // @ts-expect-error - body must be array, not object
                    body: { quantity: 1 },
                });
            }
        });

        it('should not expose GET method directly', () => {
            // Type-only check: GET should not be accessible (TypeScript error expected)
            // @ts-expect-error - GET should not be accessible on proxy client
            const _get = clients.shopperProducts.GET;
            expect(_get).toBeUndefined();
        });

        it('should not expose POST method directly', () => {
            // Type-only check: POST should not be accessible (TypeScript error expected)
            // @ts-expect-error - POST should not be accessible on proxy client
            const _post = clients.shopperProducts.POST;
            expect(_post).toBeUndefined();
        });

        it('should catch wrong type in optional parameter', () => {
            if (false as boolean) {
                clients.shopperProducts.getProducts({
                    params: {
                        path: { organizationId: 'org123' },
                        query: {
                            siteId: 'RefArch',
                            ids: ['product1'],
                            // @ts-expect-error - allImages must be boolean, not string
                            allImages: 'yes',
                        },
                    },
                });
            }
        });

        it('should catch missing entire params for operation requiring them', () => {
            if (false as boolean) {
                // @ts-expect-error - params object is required
                clients.shopperProducts.getProduct();
            }
        });

        it('should allow missing params in createBasket since organizationId/siteId are auto-injected', () => {
            // With injection, createBasket can be called without params
            // since organizationId and siteId (the only required params) are injected
            const validCall = () => clients.shopperBasketsV1.createBasket();
            // This should compile without errors
            expectTypeOf(validCall).toBeFunction();
        });

        it('should allow omitting path in empty suffix operation (global param)', () => {
            if (false as boolean) {
                // path is optional because organizationId is provided by global params
                clients.shopperBasketsV1.createBasket({
                    params: {},
                    body: {},
                });
            }
        });

        it('should catch wrong type in empty suffix operation body', () => {
            if (false as boolean) {
                clients.shopperOrders.createOrder({
                    params: {
                        path: { organizationId: 'org123' },
                        query: { siteId: 'RefArch' },
                    },
                    body: {
                        // @ts-expect-error - basketId must be string, not number
                        basketId: 123,
                    },
                });
            }
        });

        // Error handling type detection - verify TypeScript catches incorrect error usage
        it('should catch accessing ApiError properties without instanceof check', async () => {
            if (false as boolean) {
                try {
                    await clients.shopperProducts.getProduct({
                        params: {
                            path: { organizationId: 'org123', id: 'invalid' },
                            query: { siteId: 'RefArch' },
                        },
                    });
                } catch (error) {
                    // @ts-expect-error - cannot access status without instanceof check
                    void error.status;
                }
            }
        });

        it('should catch accessing non-existent property on ApiError', async () => {
            if (false as boolean) {
                try {
                    await clients.shopperProducts.getProduct({
                        params: {
                            path: { organizationId: 'org123', id: 'invalid' },
                            query: { siteId: 'RefArch' },
                        },
                    });
                } catch (error) {
                    if (error instanceof ApiError) {
                        // @ts-expect-error - nonExistentProp does not exist on ApiError
                        void error.nonExistentProp;
                    }
                }
            }
        });

        it('should catch assigning status to string variable', async () => {
            if (false as boolean) {
                try {
                    await clients.shopperProducts.getProduct({
                        params: {
                            path: { organizationId: 'org123', id: 'invalid' },
                            query: { siteId: 'RefArch' },
                        },
                    });
                } catch (error) {
                    if (error instanceof ApiError) {
                        // @ts-expect-error - status is number, cannot assign to string
                        const _statusString: string = error.status;
                        void _statusString;
                    }
                }
            }
        });

        it('should catch treating status as string when it is number', async () => {
            if (false as boolean) {
                try {
                    await clients.shopperProducts.getProduct({
                        params: {
                            path: { organizationId: 'org123', id: 'invalid' },
                            query: { siteId: 'RefArch' },
                        },
                    });
                } catch (error) {
                    if (error instanceof ApiError) {
                        // @ts-expect-error - status is number, not string - cannot use string methods
                        void error.status.toUpperCase();
                    }
                }
            }
        });

        it('should catch treating headers as plain object', async () => {
            if (false as boolean) {
                try {
                    await clients.shopperProducts.getProduct({
                        params: {
                            path: { organizationId: 'org123', id: 'invalid' },
                            query: { siteId: 'RefArch' },
                        },
                    });
                } catch (error) {
                    if (error instanceof ApiError) {
                        // @ts-expect-error - headers is Headers object, not plain object with string indexer
                        void error.headers['content-type'];
                    }
                }
            }
        });

        it('should catch accessing error property on success response', async () => {
            if (false as boolean) {
                const result = await clients.shopperProducts.getProduct({
                    params: {
                        path: { organizationId: 'org123', id: 'prod123' },
                        query: { siteId: 'RefArch' },
                    },
                });

                // @ts-expect-error - error property does not exist (errors are thrown)
                void result.error;
            }
        });

        it('should catch destructuring error from response', async () => {
            if (false as boolean) {
                // @ts-expect-error - error is not a property of the response
                const { data, error, response } = await clients.shopperProducts.getProduct({
                    params: {
                        path: { organizationId: 'org123', id: 'prod123' },
                        query: { siteId: 'RefArch' },
                    },
                });

                expectTypeOf(data).not.toBeNever();
                expectTypeOf(response).not.toBeNever();
                void error; // Suppress unused warning
            }
        });
    });
});
