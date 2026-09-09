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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type RouterContextProvider } from 'react-router';
import { encodeBase64Url } from '@/lib/url';
import { encodeResource } from '@/lib/scapi/resource-encoding';
import { action, loader, type ApiResponse } from './resource.api.client.$resource';
import { extractResponseError, getErrorMessage } from '@/lib/utils';
import { ApiError } from '@/scapi';

const apiClientMocks = vi.hoisted(() => ({
    mockShopperCustomersGetCustomer: vi.fn(),
    mockShopperCustomersUpdateCustomer: vi.fn(),
    mockShopperCustomersUse: vi.fn(),
    mockShopperCustomersEject: vi.fn(),
    mockShopperBasketsAddItemToBasket: vi.fn(),
    mockBasketGetOrCreateBasket: vi.fn(),
    mockAuthLoginAsGuest: vi.fn(),
    mockLoyaltyGetLoyaltyPoints: vi.fn(),
    mockSfnextEmailSendEmail: vi.fn(),
}));

// Mock dependencies
vi.mock('@/middlewares/auth.server');
vi.mock('@/lib/utils', () => ({
    extractResponseError: vi.fn(),
    getErrorMessage: vi.fn(),
}));

vi.mock('@/lib/origin', () => ({
    getAppOrigin: vi.fn(() => 'https://example.com'),
}));

// Type the mocked functions
const {
    mockShopperCustomersGetCustomer,
    mockShopperCustomersUpdateCustomer,
    mockShopperCustomersUse,
    mockShopperCustomersEject,
    mockShopperBasketsAddItemToBasket,
    mockBasketGetOrCreateBasket,
    mockAuthLoginAsGuest,
    mockLoyaltyGetLoyaltyPoints,
    mockSfnextEmailSendEmail,
} = apiClientMocks;
const mockExtractResponseError = vi.mocked(extractResponseError);
const mockGetErrorMessage = vi.mocked(getErrorMessage);

// Mock the createApiClients function
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(() => ({
        shopperCustomers: {
            getCustomer: mockShopperCustomersGetCustomer,
            updateCustomer: mockShopperCustomersUpdateCustomer,
            // Reserved proxy members exposed by the underlying ProxyClient — must NOT be
            // invocable through the resource route, even though they are functions.
            use: mockShopperCustomersUse,
            eject: mockShopperCustomersEject,
        },
        shopperBasketsV2: {
            addItemToBasket: mockShopperBasketsAddItemToBasket,
        },
        basket: {
            getOrCreateBasket: mockBasketGetOrCreateBasket,
        },
        auth: {
            loginAsGuest: mockAuthLoginAsGuest,
        },
        loyalty: {
            getLoyaltyPoints: mockLoyaltyGetLoyaltyPoints,
        },
        sfnextNotify: {
            notify: mockSfnextEmailSendEmail,
        },
    })),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

const createMockContextProvider = (): RouterContextProvider => {
    const store = new Map<unknown, unknown>();
    return {
        get(key: unknown) {
            return store.get(key);
        },
        set(key: unknown, value: unknown) {
            store.set(key, value);
            return value;
        },
    } as unknown as RouterContextProvider;
};

describe('Commerce SDK resource', () => {
    const validResource = [
        'shopperCustomers',
        'getCustomer',
        {
            params: {
                path: { customerId: 'customer-123' },
            },
        },
    ];
    const encodedValidResource = encodeBase64Url(JSON.stringify(validResource));
    const mockResponseData = { customerId: 'customer-123', email: 'test@example.com' };
    let mockContextProvider: RouterContextProvider;

    beforeEach(() => {
        mockShopperCustomersGetCustomer.mockClear();
        mockShopperCustomersUpdateCustomer.mockClear();
        mockShopperBasketsAddItemToBasket.mockClear();
        mockBasketGetOrCreateBasket.mockClear();
        mockAuthLoginAsGuest.mockClear();
        mockLoyaltyGetLoyaltyPoints.mockClear();
        mockExtractResponseError.mockClear();
        mockGetErrorMessage.mockClear();

        mockContextProvider = createMockContextProvider();

        // New API returns { data, response } format
        mockShopperCustomersGetCustomer.mockResolvedValue({ data: mockResponseData });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('loader()', () => {
        const createLoaderArgs = (resource: string) => ({
            params: { resource },
            context: mockContextProvider,
            request: new Request('http://localhost/test'),
            url: new URL('http://localhost/test'),
            pattern: 'resource/api/client/:resource',
        });

        describe('successful requests', () => {
            it('should handle successful loader call', async () => {
                const result = await loader(createLoaderArgs(encodedValidResource));
                expect(result).toEqual({
                    success: true,
                    data: mockResponseData,
                });
            });

            it('should handle successful custom client loader calls', async () => {
                const loyaltyData = { customerId: 'customer-123', points: 420 };
                const encodedLoyaltyResource = encodeBase64Url(
                    JSON.stringify([
                        'loyalty',
                        'getLoyaltyPoints',
                        {
                            params: {
                                path: { customerId: 'customer-123' },
                            },
                        },
                    ])
                );
                mockLoyaltyGetLoyaltyPoints.mockResolvedValue({ data: loyaltyData });

                const result = await loader(createLoaderArgs(encodedLoyaltyResource));

                expect(result).toEqual({
                    success: true,
                    data: loyaltyData,
                });
                expect(mockLoyaltyGetLoyaltyPoints).toHaveBeenCalledWith({
                    params: {
                        path: { customerId: 'customer-123' },
                    },
                });
            });
        });

        describe('error handling', () => {
            it('should handle invalid resource format - not an array', async () => {
                const args = createLoaderArgs('invalid-encoded-resource');
                const result = await loader(args);
                expect(result).toEqual({
                    success: false,
                    errors: ['The encoded data was not valid for encoding utf-8'],
                });
            });

            it('should handle invalid resource format - wrong array length', async () => {
                const invalid = encodeBase64Url(JSON.stringify(['shopperProducts', 'getProducts']));
                const args = createLoaderArgs(invalid);
                const result = await loader(args);
                expect(result).toEqual({
                    success: false,
                    errors: ['Unexpected resource format'],
                });
            });

            it('should handle ApiError using getErrorMessage', async () => {
                const mockApiError = new ApiError({
                    url: 'https://api.example.com/test',
                    method: 'PUT',
                    status: 400,
                    statusText: 'Bad Request',
                    headers: new Headers(),
                    body: {
                        type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/invalid-customer',
                        title: 'Invalid Customer',
                        detail: 'The current password is incorrect.',
                    },
                    rawBody: JSON.stringify({ message: 'The current password is incorrect.' }),
                });

                mockShopperCustomersGetCustomer.mockRejectedValue(mockApiError);
                mockGetErrorMessage.mockReturnValue('The current password is incorrect.');

                const result = await loader(createLoaderArgs(encodedValidResource));
                expect(result).toEqual({
                    success: false,
                    errors: ['The current password is incorrect.'],
                });

                expect(mockGetErrorMessage).toHaveBeenCalledWith(mockApiError);
                // extractResponseError should NOT be called for ApiError instances
                expect(mockExtractResponseError).not.toHaveBeenCalled();
            });

            it('should handle fetch client errors with extractResponseError', async () => {
                const mockError = new Error('API Error');
                const mockExtractedError = {
                    status_code: '400',
                    responseMessage: 'Bad Request: Invalid product ID',
                };
                Reflect.set(mockError, 'response', Response.json(mockExtractedError));

                mockShopperCustomersGetCustomer.mockRejectedValue(mockError);
                mockExtractResponseError.mockImplementationOnce(() => Promise.resolve(mockExtractedError));

                const result = await loader(createLoaderArgs(encodedValidResource));
                expect(result).toEqual({
                    success: false,
                    errors: [mockExtractedError.responseMessage],
                });

                expect(mockExtractResponseError).toHaveBeenCalledWith(mockError);
            });

            it('should handle fetch client errors when extractResponseError fails', async () => {
                const mockError = new Error('Network Error');
                mockShopperCustomersGetCustomer.mockRejectedValue(mockError);
                mockExtractResponseError.mockRejectedValue(new Error('Extract failed'));

                const result = await loader(createLoaderArgs(encodedValidResource));
                expect(result).toEqual({
                    success: false,
                    errors: ['Network Error'],
                });
            });

            it('should handle unknown errors without message', async () => {
                const mockError = { someProperty: 'unknown error' };
                mockShopperCustomersGetCustomer.mockRejectedValue(mockError);

                const result = await loader(createLoaderArgs(encodedValidResource));
                expect(result).toEqual({
                    success: false,
                    errors: ['Unknown error'],
                });
            });

            it('should handle loader with null resource parameter', async () => {
                const createLoaderArgsWithNullResource = () => ({
                    params: { resource: null as any },
                    context: mockContextProvider,
                    request: new Request('http://localhost/test'),
                    url: new URL('http://localhost/test'),
                    pattern: 'resource/api/client/:resource',
                });

                const result = await loader(createLoaderArgsWithNullResource());
                expect(result).toEqual({
                    success: false,
                    errors: ['Unexpected resource format'],
                });
            });

            it('should handle loader with undefined resource parameter', async () => {
                const createLoaderArgsWithUndefinedResource = () => ({
                    params: { resource: undefined as any },
                    context: mockContextProvider,
                    request: new Request('http://localhost/test'),
                    url: new URL('http://localhost/test'),
                    pattern: 'resource/api/client/:resource',
                });

                const result = await loader(createLoaderArgsWithUndefinedResource());
                expect(result).toEqual({
                    success: false,
                    errors: ['Unexpected resource format'],
                });
            });

            it('should handle loader errors when reason is falsy', async () => {
                // Mock a falsy reason (null, undefined, false, 0, empty string)
                mockShopperCustomersGetCustomer.mockRejectedValue(null);

                const result = await loader(createLoaderArgs(encodedValidResource));
                expect(result).toEqual({
                    success: false,
                    errors: ['Unknown error'],
                });
            });

            // ProxyClient exposes `use` and `eject` as functions on every SCAPI client.
            // They are not SCAPI operations and must not be invocable from a crafted resource URL.
            it.each(['use', 'eject'])('should reject reserved proxy member "%s" in loader calls', async (reserved) => {
                const invalidResource = encodeBase64Url(JSON.stringify(['shopperCustomers', reserved, { params: {} }]));

                const result = await loader(createLoaderArgs(invalidResource));

                expect(result).toEqual({
                    success: false,
                    errors: [`Method not found: "shopperCustomers.${reserved}"`],
                });
                expect(mockShopperCustomersUse).not.toHaveBeenCalled();
                expect(mockShopperCustomersEject).not.toHaveBeenCalled();
            });

            it('should deny server-only sfnextNotify client in loader calls', async () => {
                const deniedResource = encodeBase64Url(
                    JSON.stringify(['sfnextNotify', 'notify', { params: {}, body: { type: 'otp' } }])
                );

                const result = await loader(createLoaderArgs(deniedResource));

                expect(result).toEqual({
                    success: false,
                    errors: ['Method not found: "sfnextNotify.notify"'],
                });
                expect(mockSfnextEmailSendEmail).not.toHaveBeenCalled();
            });
        });
    });

    describe('action()', () => {
        const validActionResource = [
            'shopperCustomers',
            'updateCustomer',
            {
                params: {
                    path: { customerId: 'customer-123' },
                },
            },
        ];
        const encodedValidActionResource = encodeBase64Url(JSON.stringify(validActionResource));
        const mockActionResponseData = { customerId: 'customer-123', email: 'updated@example.com' };

        const createActionArgs = (resource: string, formData?: Record<string, string>) => {
            const body = new URLSearchParams(formData || {}).toString();

            const request = new Request('http://localhost/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            });

            return {
                params: { resource },
                context: mockContextProvider,
                request,
                url: new URL(request.url),
                pattern: 'resource/api/client/:resource',
            };
        };

        beforeEach(() => {
            mockShopperCustomersUpdateCustomer.mockResolvedValue({ data: mockActionResponseData });
        });

        describe('successful requests', () => {
            it('should handle successful action call with form data', async () => {
                const formData = { email: 'updated@example.com', firstName: 'John' };
                const result = await action(createActionArgs(encodedValidActionResource, formData));

                expect(result).toEqual({
                    success: true,
                    data: mockActionResponseData,
                });

                // Verify the method was called with merged parameters (new API format)
                expect(mockShopperCustomersUpdateCustomer).toHaveBeenCalledWith({
                    params: {
                        path: { customerId: 'customer-123' },
                    },
                    body: formData,
                });
            });

            it('should handle successful action call without form data', async () => {
                const result = await action(createActionArgs(encodedValidActionResource));

                expect(result).toEqual({
                    success: true,
                    data: mockActionResponseData,
                });

                // Verify the method was called with empty body (new API format)
                expect(mockShopperCustomersUpdateCustomer).toHaveBeenCalledWith({
                    params: {
                        path: { customerId: 'customer-123' },
                    },
                    body: {},
                });
            });

            it('should handle action call with existing body parameter', async () => {
                const resourceWithBody = [
                    'shopperCustomers',
                    'updateCustomer',
                    {
                        params: {
                            path: { customerId: 'customer-123' },
                        },
                        body: { existingData: 'test' },
                    },
                ];
                const encodedResourceWithBody = encodeBase64Url(JSON.stringify(resourceWithBody));
                const formData = { email: 'updated@example.com' };

                const result = await action(createActionArgs(encodedResourceWithBody, formData));

                expect(result).toEqual({
                    success: true,
                    data: mockActionResponseData,
                });

                // Verify the method was called with merged body (new API format)
                // FormData should merge with existing body
                expect(mockShopperCustomersUpdateCustomer).toHaveBeenCalledWith({
                    params: {
                        path: { customerId: 'customer-123' },
                    },
                    body: {
                        existingData: 'test',
                        ...formData,
                    },
                });
            });

            it('should add body parameter when no parameters exist', async () => {
                const resourceWithNoParams = ['shopperCustomers', 'updateCustomer', {}];
                const encodedResourceWithNoParams = encodeBase64Url(JSON.stringify(resourceWithNoParams));
                const formData = { email: 'updated@example.com' };

                const result = await action(createActionArgs(encodedResourceWithNoParams, formData));

                expect(result).toEqual({
                    success: true,
                    data: mockActionResponseData,
                });

                // Verify the method was called with only the body parameter
                expect(mockShopperCustomersUpdateCustomer).toHaveBeenCalledWith({ body: formData });
            });

            it('should add body parameter when last parameter has no body property', async () => {
                const resourceWithNoBody = [
                    'shopperCustomers',
                    'updateCustomer',
                    {
                        params: {
                            path: { customerId: 'customer-123' },
                        },
                    },
                ];
                const encodedResourceWithNoBody = encodeBase64Url(JSON.stringify(resourceWithNoBody));
                const formData = { email: 'updated@example.com' };

                const result = await action(createActionArgs(encodedResourceWithNoBody, formData));

                expect(result).toEqual({
                    success: true,
                    data: mockActionResponseData,
                });

                // Verify the method was called with parameters and added body (new API format)
                expect(mockShopperCustomersUpdateCustomer).toHaveBeenCalledWith({
                    params: {
                        path: { customerId: 'customer-123' },
                    },
                    body: formData,
                });
            });

            it('passes FormData fields through as raw strings without per-field coercion', async () => {
                // FormData values are inherently strings; callers needing typed values (numbers,
                // booleans, null) must submit JSON instead. The resource route does not bake in
                // knowledge of specific SCAPI field schemas.
                const formData = {
                    preferred: '1',
                    gender: '2',
                };

                const result = await action(createActionArgs(encodedValidActionResource, formData));

                expect(result).toEqual({
                    success: true,
                    data: mockActionResponseData,
                });
                expect(mockShopperCustomersUpdateCustomer).toHaveBeenCalledWith({
                    params: {
                        path: { customerId: 'customer-123' },
                    },
                    body: {
                        preferred: '1',
                        gender: '2',
                    },
                });
            });

            it('reads JSON body when Content-Type is application/json', async () => {
                // JSON path used by useScapiFetch and form callers that need typed values
                // (numbers, booleans, null) — body shape arrives as-is, no string coercion.
                const resource = encodeResource('shopperCustomers', 'updateCustomer', {
                    params: { path: { customerId: 'customer-123' } },
                });
                const request = new Request(`http://localhost/resource/api/client/${resource}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ firstName: 'Ada', gender: 2, preferred: true }),
                });

                const result = await action({
                    params: { resource },
                    context: mockContextProvider,
                    request,
                    url: new URL(request.url),
                    pattern: 'resource/api/client/:resource',
                } as never);

                expect(result).toEqual({
                    success: true,
                    data: mockActionResponseData,
                });
                // Typed values (number, boolean) survive the round-trip with no munging.
                expect(mockShopperCustomersUpdateCustomer).toHaveBeenCalledWith({
                    params: {
                        path: { customerId: 'customer-123' },
                    },
                    body: { firstName: 'Ada', gender: 2, preferred: true },
                });
            });

            it('passes JSON null values through to clear nullable fields', async () => {
                // Callers can clear server-side fields by submitting JSON with explicit nulls
                // (e.g., resetting `gender`). FormData cannot represent this — that's why
                // typed mutations should use `encType: 'application/json'`.
                const resource = encodeResource('shopperCustomers', 'updateCustomer', {
                    params: { path: { customerId: 'customer-123' } },
                });
                const request = new Request(`http://localhost/resource/api/client/${resource}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gender: null }),
                });

                const result = await action({
                    params: { resource },
                    context: mockContextProvider,
                    request,
                    url: new URL(request.url),
                    pattern: 'resource/api/client/:resource',
                } as never);

                expect(result).toEqual({
                    success: true,
                    data: mockActionResponseData,
                });
                expect(mockShopperCustomersUpdateCustomer).toHaveBeenCalledWith({
                    params: {
                        path: { customerId: 'customer-123' },
                    },
                    body: { gender: null },
                });
            });
        });

        describe('error handling', () => {
            it('should handle invalid resource format - not an array', async () => {
                const args = createActionArgs('invalid-encoded-resource');
                const result = await action(args);
                expect(result).toEqual({
                    success: false,
                    errors: ['The encoded data was not valid for encoding utf-8'],
                });
            });

            it('should handle invalid resource format - wrong array length', async () => {
                const invalid = encodeBase64Url(JSON.stringify(['shopperCustomers', 'updateCustomer']));
                const args = createActionArgs(invalid);
                const result = await action(args);
                expect(result).toEqual({
                    success: false,
                    errors: ['Unexpected resource format'],
                });
            });

            it('should handle ApiError using getErrorMessage for password update errors', async () => {
                const mockApiError = new ApiError({
                    url: 'https://api.example.com/test',
                    method: 'PUT',
                    status: 400,
                    statusText: 'Bad Request',
                    headers: new Headers(),
                    body: {
                        type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/invalid-customer',
                        title: 'Invalid Customer',
                        detail: 'The customer is invalid.',
                    },
                    rawBody: JSON.stringify({ message: 'The current password is incorrect.' }),
                });

                mockShopperCustomersUpdateCustomer.mockRejectedValue(mockApiError);
                mockGetErrorMessage.mockReturnValue('The current password is incorrect.');

                const result = await action(createActionArgs(encodedValidActionResource));
                expect(result).toEqual({
                    success: false,
                    errors: ['The current password is incorrect.'],
                });

                expect(mockGetErrorMessage).toHaveBeenCalledWith(mockApiError);
                // extractResponseError should NOT be called for ApiError instances
                expect(mockExtractResponseError).not.toHaveBeenCalled();
            });

            it('should handle action errors with extractResponseError', async () => {
                const mockError = new Error('API Error');
                const mockExtractedError = {
                    status_code: '400',
                    responseMessage: 'Bad Request: Invalid customer data',
                };
                Reflect.set(mockError, 'response', Response.json(mockExtractedError));

                mockShopperCustomersUpdateCustomer.mockRejectedValue(mockError);
                mockExtractResponseError.mockImplementationOnce(() => Promise.resolve(mockExtractedError));

                const result = await action(createActionArgs(encodedValidActionResource));
                expect(result).toEqual({
                    success: false,
                    errors: [mockExtractedError.responseMessage],
                });

                expect(mockExtractResponseError).toHaveBeenCalledWith(mockError);
            });

            it('should handle action errors when extractResponseError fails', async () => {
                const mockError = new Error('Network Error');
                mockShopperCustomersUpdateCustomer.mockRejectedValue(mockError);
                mockExtractResponseError.mockRejectedValue(new Error('Extract failed'));

                const result = await action(createActionArgs(encodedValidActionResource));
                expect(result).toEqual({
                    success: false,
                    errors: ['Network Error'],
                });
            });

            it('should handle unknown errors without message', async () => {
                const mockError = { someProperty: 'unknown error' };
                mockShopperCustomersUpdateCustomer.mockRejectedValue(mockError);

                const result = await action(createActionArgs(encodedValidActionResource));
                expect(result).toEqual({
                    success: false,
                    errors: ['Unknown error'],
                });
            });

            it('should handle action with null resource parameter', async () => {
                const createActionArgsWithNullResource = () => {
                    const request = new Request('http://localhost/test', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({ email: 'test@example.com' }).toString(),
                    });

                    return {
                        params: { resource: null as any },
                        context: mockContextProvider,
                        request,
                        url: new URL(request.url),
                        pattern: 'resource/api/client/:resource',
                    };
                };

                const result = await action(createActionArgsWithNullResource());
                expect(result).toEqual({
                    success: false,
                    errors: ['Unexpected resource format'],
                });
            });

            it('should handle action with undefined resource parameter', async () => {
                const createActionArgsWithUndefinedResource = () => {
                    const request = new Request('http://localhost/test', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({ email: 'test@example.com' }).toString(),
                    });

                    return {
                        params: { resource: undefined as any },
                        context: mockContextProvider,
                        request,
                        url: new URL(request.url),
                        pattern: 'resource/api/client/:resource',
                    };
                };

                const result = await action(createActionArgsWithUndefinedResource());
                expect(result).toEqual({
                    success: false,
                    errors: ['Unexpected resource format'],
                });
            });

            it('should handle action errors when reason is falsy', async () => {
                // Mock a falsy reason (null, undefined, false, 0, empty string)
                mockShopperCustomersUpdateCustomer.mockRejectedValue(null);

                const result = await action(createActionArgs(encodedValidActionResource));
                expect(result).toEqual({
                    success: false,
                    errors: ['Unknown error'],
                });
            });

            it('should handle missing client methods in action calls', async () => {
                const invalidResource = encodeBase64Url(
                    JSON.stringify(['loyalty', 'missingMethod', { params: { path: { customerId: 'customer-123' } } }])
                );

                const result = await action(createActionArgs(invalidResource));

                expect(result).toEqual({
                    success: false,
                    errors: ['Method not found: "loyalty.missingMethod"'],
                });
            });

            // ProxyClient exposes `use` and `eject` as functions on every SCAPI client.
            // They are not SCAPI operations and must not be invocable from a crafted resource URL.
            it.each(['use', 'eject'])('should reject reserved proxy member "%s" in action calls', async (reserved) => {
                const invalidResource = encodeBase64Url(JSON.stringify(['shopperCustomers', reserved, { params: {} }]));

                const result = await action(createActionArgs(invalidResource));

                expect(result).toEqual({
                    success: false,
                    errors: [`Method not found: "shopperCustomers.${reserved}"`],
                });
                expect(mockShopperCustomersUse).not.toHaveBeenCalled();
                expect(mockShopperCustomersEject).not.toHaveBeenCalled();
            });

            it('should deny server-only sfnextNotify client in action calls', async () => {
                const deniedResource = encodeBase64Url(
                    JSON.stringify(['sfnextNotify', 'notify', { params: {}, body: { type: 'otp' } }])
                );

                const result = await action(createActionArgs(deniedResource));

                expect(result).toEqual({
                    success: false,
                    errors: ['Method not found: "sfnextNotify.notify"'],
                });
                expect(mockSfnextEmailSendEmail).not.toHaveBeenCalled();
            });
        });
    });

    describe('ApiResponse interface', () => {
        it('should have correct structure for success response', () => {
            const successResponse: ApiResponse<{ id: string }> = {
                success: true,
                data: { id: 'test-123' },
            };

            expect(successResponse.success).toBe(true);
            expect(successResponse.data).toEqual({ id: 'test-123' });
            expect(successResponse.errors).toBeUndefined();
        });

        it('should have correct structure for error response', () => {
            const errorResponse: ApiResponse = {
                success: false,
                errors: ['Error message'],
            };

            expect(errorResponse.success).toBe(false);
            expect(errorResponse.errors).toEqual(['Error message']);
            expect(errorResponse.data).toBeUndefined();
        });

        it('should support optional properties', () => {
            const minimalSuccess: ApiResponse = {
                success: true,
            };

            expect(minimalSuccess.success).toBe(true);
            expect(minimalSuccess.data).toBeUndefined();
            expect(minimalSuccess.errors).toBeUndefined();
        });
    });

    describe('Edge cases and comprehensive coverage', () => {
        const createLoaderArgs = (resource: string) => ({
            params: { resource },
            context: mockContextProvider,
            request: new Request('http://localhost/test'),
            url: new URL('http://localhost/test'),
            pattern: 'resource/api/client/:resource',
        });

        it('should handle empty form data in action', async () => {
            const validActionResource = [
                'shopperCustomers',
                'updateCustomer',
                {
                    params: {
                        path: { customerId: 'customer-123' },
                    },
                },
            ];
            const encodedValidActionResource = encodeBase64Url(JSON.stringify(validActionResource));

            // Set up the mock for this specific test
            mockShopperCustomersUpdateCustomer.mockResolvedValue({ data: mockResponseData });

            const createActionArgsWithEmptyForm = () => {
                const request = new Request('http://localhost/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: '',
                });

                return {
                    params: { resource: encodedValidActionResource },
                    context: mockContextProvider,
                    request,
                    url: new URL(request.url),
                    pattern: 'resource/api/client/:resource',
                };
            };

            const result = await action(createActionArgsWithEmptyForm());
            expect(result).toEqual({
                success: true,
                data: mockResponseData,
            });

            // Verify the method was called with empty body (new API format)
            expect(mockShopperCustomersUpdateCustomer).toHaveBeenCalledWith({
                params: {
                    path: { customerId: 'customer-123' },
                },
                body: {},
            });
        });

        it('should handle malformed JSON in resource parameter', async () => {
            const malformedResource = 'not-valid-json';
            const args = createLoaderArgs(malformedResource);
            const result = await loader(args);
            expect(result).toEqual({
                success: false,
                errors: ['The encoded data was not valid for encoding utf-8'],
            });
        });

        it('should handle extractResponseError returning null responseMessage', async () => {
            const mockError = new Error('API Error');
            const mockExtractedError = {
                status_code: '400',
                responseMessage: null as any,
            };
            Reflect.set(mockError, 'response', Response.json(mockExtractedError));

            mockShopperCustomersGetCustomer.mockRejectedValue(mockError);
            mockExtractResponseError.mockImplementationOnce(() => Promise.resolve(mockExtractedError));

            const result = await loader(createLoaderArgs(encodedValidResource));
            expect(result).toEqual({
                success: false,
                errors: ['Unknown error'],
            });
        });

        it('should handle extractResponseError returning undefined responseMessage', async () => {
            const mockError = new Error('API Error');
            const mockExtractedError = {
                status_code: '400',
                responseMessage: undefined,
            };
            Reflect.set(mockError, 'response', Response.json(mockExtractedError));

            mockShopperCustomersGetCustomer.mockRejectedValue(mockError);
            mockExtractResponseError.mockImplementationOnce(() => Promise.resolve(mockExtractedError));

            const result = await loader(createLoaderArgs(encodedValidResource));
            expect(result).toEqual({
                success: false,
                errors: ['Unknown error'],
            });
        });

        it('should handle extractResponseError returning empty string responseMessage', async () => {
            const mockError = new Error('API Error');
            const mockExtractedError = {
                status_code: '400',
                responseMessage: '',
            };
            Reflect.set(mockError, 'response', Response.json(mockExtractedError));

            mockShopperCustomersGetCustomer.mockRejectedValue(mockError);
            mockExtractResponseError.mockImplementationOnce(() => Promise.resolve(mockExtractedError));

            const result = await loader(createLoaderArgs(encodedValidResource));
            expect(result).toEqual({
                success: false,
                errors: ['Unknown error'],
            });
        });

        it('should handle non-Error objects thrown', async () => {
            const nonErrorObject = { message: 'Custom error', code: 500 };
            mockShopperCustomersGetCustomer.mockRejectedValue(nonErrorObject);

            const result = await loader(createLoaderArgs(encodedValidResource));
            expect(result).toEqual({
                success: false,
                errors: ['Unknown error'],
            });
        });

        it('should handle string errors', async () => {
            const stringError = 'String error message';
            mockShopperCustomersGetCustomer.mockRejectedValue(stringError);

            const result = await loader(createLoaderArgs(encodedValidResource));
            expect(result).toEqual({
                success: false,
                errors: ['Unknown error'],
            });
        });

        it('should handle number errors', async () => {
            const numberError = 404;
            mockShopperCustomersGetCustomer.mockRejectedValue(numberError);

            const result = await loader(createLoaderArgs(encodedValidResource));
            expect(result).toEqual({
                success: false,
                errors: ['Unknown error'],
            });
        });

        it('should handle boolean errors', async () => {
            const booleanError = false;
            mockShopperCustomersGetCustomer.mockRejectedValue(booleanError);

            const result = await loader(createLoaderArgs(encodedValidResource));
            expect(result).toEqual({
                success: false,
                errors: ['Unknown error'],
            });
        });
    });

    describe('helpers', () => {
        const createLoaderArgs = (resource: string) => ({
            params: { resource },
            context: mockContextProvider,
            request: new Request('http://localhost/test'),
            url: new URL('http://localhost/test'),
            pattern: 'resource/api/client/:resource',
        });

        const createActionArgs = (resource: string, formData?: Record<string, string>) => {
            const body = new URLSearchParams(formData || {}).toString();
            const request = new Request('http://localhost/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            });
            return {
                params: { resource },
                context: mockContextProvider,
                request,
                url: new URL(request.url),
                pattern: 'resource/api/client/:resource',
            };
        };

        describe('loader with helpers', () => {
            it('should handle successful helper call with options', async () => {
                const mockBasketData = { basketId: 'basket-123', currency: 'USD' };
                mockBasketGetOrCreateBasket.mockResolvedValue(mockBasketData);

                const helperResource = [
                    'helpers',
                    'basket',
                    {
                        helperName: 'getOrCreateBasket',
                        params: { path: { basketId: 'basket-123' } },
                        body: { currency: 'USD' },
                    },
                ];
                const encoded = encodeBase64Url(JSON.stringify(helperResource));

                const result = await loader(createLoaderArgs(encoded));
                expect(result).toEqual({
                    success: true,
                    data: mockBasketData,
                });
                expect(mockBasketGetOrCreateBasket).toHaveBeenCalledWith({
                    params: { path: { basketId: 'basket-123' } },
                    body: { currency: 'USD' },
                });
            });

            it('should handle successful helper call without options', async () => {
                const mockAuthData = { access_token: 'token-123' };
                mockAuthLoginAsGuest.mockResolvedValue(mockAuthData);

                const helperResource = ['helpers', 'auth', { helperName: 'loginAsGuest' }];
                const encoded = encodeBase64Url(JSON.stringify(helperResource));

                const result = await loader(createLoaderArgs(encoded));
                expect(result).toEqual({
                    success: true,
                    data: mockAuthData,
                });
                expect(mockAuthLoginAsGuest).toHaveBeenCalledWith(undefined);
            });

            it('should handle invalid helper namespace', async () => {
                const helperResource = ['helpers', 'nonexistent', { helperName: 'someMethod' }];
                const encoded = encodeBase64Url(JSON.stringify(helperResource));

                const result = await loader(createLoaderArgs(encoded));
                expect(result).toEqual({
                    success: false,
                    errors: ['Unknown helper namespace: "nonexistent"'],
                });
            });

            it('should reject SDK client names used as helper namespaces', async () => {
                const helperResource = ['helpers', 'shopperCustomers', { helperName: 'getCustomer' }];
                const encoded = encodeBase64Url(JSON.stringify(helperResource));

                const result = await loader(createLoaderArgs(encoded));
                expect(result).toEqual({
                    success: false,
                    errors: ['Unknown helper namespace: "shopperCustomers"'],
                });
            });

            it('should handle invalid helper method name', async () => {
                const helperResource = ['helpers', 'basket', { helperName: 'nonexistentMethod' }];
                const encoded = encodeBase64Url(JSON.stringify(helperResource));

                const result = await loader(createLoaderArgs(encoded));
                expect(result).toEqual({
                    success: false,
                    errors: ['Helper method not found: "helpers.basket.nonexistentMethod"'],
                });
            });

            it('should handle helper method throwing ApiError', async () => {
                const mockApiError = new ApiError({
                    url: 'https://api.example.com/test',
                    method: 'POST',
                    status: 400,
                    statusText: 'Bad Request',
                    headers: new Headers(),
                    body: {
                        type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/bad-request',
                        title: 'Bad Request',
                        detail: 'Basket quota exceeded',
                    },
                    rawBody: JSON.stringify({ message: 'Basket quota exceeded' }),
                });

                mockBasketGetOrCreateBasket.mockRejectedValue(mockApiError);
                mockGetErrorMessage.mockReturnValue('Basket quota exceeded');

                const helperResource = [
                    'helpers',
                    'basket',
                    { helperName: 'getOrCreateBasket', body: { currency: 'USD' } },
                ];
                const encoded = encodeBase64Url(JSON.stringify(helperResource));

                const result = await loader(createLoaderArgs(encoded));
                expect(result).toEqual({
                    success: false,
                    errors: ['Basket quota exceeded'],
                });
                expect(mockGetErrorMessage).toHaveBeenCalledWith(mockApiError);
            });
        });

        describe('action with helpers', () => {
            it('should merge form data into body for basket helper', async () => {
                const mockBasketData = { basketId: 'basket-123', currency: 'EUR' };
                mockBasketGetOrCreateBasket.mockResolvedValue(mockBasketData);

                const helperResource = [
                    'helpers',
                    'basket',
                    {
                        helperName: 'getOrCreateBasket',
                        params: { path: { basketId: 'basket-123' } },
                        body: { currency: 'USD' },
                    },
                ];
                const encoded = encodeBase64Url(JSON.stringify(helperResource));

                // Submit form data with a currency override — should merge into body, not top level
                const formData = { currency: 'EUR' };
                const result = await action(createActionArgs(encoded, formData));
                expect(result).toEqual({
                    success: true,
                    data: mockBasketData,
                });
                // Form data merges into body (not top level) because options has a body key
                expect(mockBasketGetOrCreateBasket).toHaveBeenCalledWith({
                    params: { path: { basketId: 'basket-123' } },
                    body: { currency: 'EUR' },
                });
            });

            it('should merge form data at top level for auth helper (not into body)', async () => {
                const mockAuthData = { access_token: 'token-123' };
                mockAuthLoginAsGuest.mockResolvedValue(mockAuthData);

                const helperResource = ['helpers', 'auth', { helperName: 'loginAsGuest' }];
                const encoded = encodeBase64Url(JSON.stringify(helperResource));
                const formData = { usid: 'session-123' };

                const result = await action(createActionArgs(encoded, formData));
                expect(result).toEqual({
                    success: true,
                    data: mockAuthData,
                });
                // Auth helpers take flat arguments — form data merges at top level, not { body: { usid } }
                expect(mockAuthLoginAsGuest).toHaveBeenCalledWith({ usid: 'session-123' });
            });

            it('should pass undefined when action has no form data and no options', async () => {
                const mockAuthData = { access_token: 'token-123' };
                mockAuthLoginAsGuest.mockResolvedValue(mockAuthData);

                const helperResource = ['helpers', 'auth', { helperName: 'loginAsGuest' }];
                const encoded = encodeBase64Url(JSON.stringify(helperResource));

                const result = await action(createActionArgs(encoded));
                expect(result).toEqual({
                    success: true,
                    data: mockAuthData,
                });
                // Should pass undefined, not { body: {} }, aligning with loader behavior
                expect(mockAuthLoginAsGuest).toHaveBeenCalledWith(undefined);
            });

            it('should handle invalid helper namespace in action', async () => {
                const helperResource = ['helpers', 'nonexistent', { helperName: 'someMethod' }];
                const encoded = encodeBase64Url(JSON.stringify(helperResource));

                const result = await action(createActionArgs(encoded));
                expect(result).toEqual({
                    success: false,
                    errors: ['Unknown helper namespace: "nonexistent"'],
                });
            });

            it('should handle helper action throwing error', async () => {
                const mockError = new Error('Network Error');
                mockBasketGetOrCreateBasket.mockRejectedValue(mockError);
                mockExtractResponseError.mockRejectedValue(new Error('Extract failed'));

                const helperResource = [
                    'helpers',
                    'basket',
                    { helperName: 'getOrCreateBasket', body: { currency: 'USD' } },
                ];
                const encoded = encodeBase64Url(JSON.stringify(helperResource));

                const result = await action(createActionArgs(encoded));
                expect(result).toEqual({
                    success: false,
                    errors: ['Network Error'],
                });
            });

            it('should handle helper action throwing ApiError', async () => {
                const mockApiError = new ApiError({
                    url: 'https://api.example.com/test',
                    method: 'POST',
                    status: 400,
                    statusText: 'Bad Request',
                    headers: new Headers(),
                    body: {
                        type: 'https://api.commercecloud.salesforce.com/documentation/error/v1/errors/bad-request',
                        title: 'Bad Request',
                        detail: 'Invalid basket currency',
                    },
                    rawBody: JSON.stringify({ message: 'Invalid basket currency' }),
                });

                mockBasketGetOrCreateBasket.mockRejectedValue(mockApiError);
                mockGetErrorMessage.mockReturnValue('Invalid basket currency');

                const helperResource = [
                    'helpers',
                    'basket',
                    { helperName: 'getOrCreateBasket', body: { currency: 'INVALID' } },
                ];
                const encoded = encodeBase64Url(JSON.stringify(helperResource));

                const result = await action(createActionArgs(encoded));
                expect(result).toEqual({
                    success: false,
                    errors: ['Invalid basket currency'],
                });
                expect(mockGetErrorMessage).toHaveBeenCalledWith(mockApiError);
            });
        });
    });
});

describe('shouldRevalidate export', () => {
    // The policy itself is covered by src/lib/revalidation/routes/api-client.test.ts. Here we only
    // assert the route wires up that exact function, so the behavior isn't re-tested at the route.
    it('re-exports the api-client revalidation policy', async () => {
        const { shouldRevalidate } = await import('./resource.api.client.$resource');
        const { shouldRevalidate: shouldRevalidatePolicy } = await import('@/lib/revalidation/routes/api-client');
        expect(shouldRevalidate).toBe(shouldRevalidatePolicy);
    });
});
