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
import { createClient } from './createClient';
import { ApiError } from './ApiError';
import { AuthTokenInvalidError } from './AuthTokenInvalidError';
import { SLAS_AUTH_ENDPOINTS } from './constants';
import type { Client } from 'openapi-fetch';
import type { OperationMap } from './proxy-types';

// Mock client type for testing
type MockPaths = {
    '/test/{id}': {
        get: {
            parameters: {
                path: { id: string };
                query?: { filter?: string };
            };
            responses: {
                200: { content: { 'application/json': { data: string } } };
            };
        };
        post: {
            parameters: {
                path: { id: string };
            };
            requestBody: {
                content: { 'application/json': { value: number } };
            };
            responses: {
                201: { content: { 'application/json': { created: boolean } } };
            };
        };
    };
    '/users': {
        get: {
            responses: {
                200: { content: { 'application/json': { users: string[] } } };
            };
        };
    };
    '/test': {
        get: {
            responses: {
                200: { content: { 'application/json': { success: boolean } } };
            };
        };
        post: {
            responses: {
                201: { content: { 'application/json': { success: boolean } } };
            };
        };
        put: {
            responses: {
                200: { content: { 'application/json': { success: boolean } } };
            };
        };
        patch: {
            responses: {
                200: { content: { 'application/json': { success: boolean } } };
            };
        };
        delete: {
            responses: {
                204: never;
            };
        };
    };
};

describe('createClient', () => {
    let mockClient: Client<MockPaths>;
    let mockOperations: OperationMap;

    beforeEach(() => {
        // Create a mock response object
        const mockResponse = {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'content-type': 'application/json' }),
            url: 'https://api.example.com/test',
            ok: true,
            clone: () => mockResponse,
            text: vi.fn().mockResolvedValue(''),
        };

        // Create a mock client with HTTP methods that return resolved promises
        mockClient = {
            GET: vi.fn().mockResolvedValue({ data: { success: true }, error: undefined, response: mockResponse }),
            POST: vi.fn().mockResolvedValue({ data: { success: true }, error: undefined, response: mockResponse }),
            PUT: vi.fn().mockResolvedValue({ data: { success: true }, error: undefined, response: mockResponse }),
            PATCH: vi.fn().mockResolvedValue({ data: { success: true }, error: undefined, response: mockResponse }),
            DELETE: vi.fn().mockResolvedValue({ data: null, error: undefined, response: mockResponse }),
            HEAD: vi.fn().mockResolvedValue({ data: null, error: undefined, response: mockResponse }),
            OPTIONS: vi.fn().mockResolvedValue({ data: null, error: undefined, response: mockResponse }),
            TRACE: vi.fn().mockResolvedValue({ data: null, error: undefined, response: mockResponse }),
            use: vi.fn(),
            eject: vi.fn(),
        } as any;

        // Define mock operations with abbreviated keys (m, b, s)
        const BASE_PATH = '/api/v1' as const;
        mockOperations = {
            getTest: { m: 'GET', b: BASE_PATH, s: '/test/{id}' },
            createTest: { m: 'POST', b: BASE_PATH, s: '/test/{id}' },
            listUsers: { m: 'GET', b: BASE_PATH, s: '/users' },
        };
    });

    describe('operation method calls', () => {
        it('should proxy GET operation to client.GET with correct path', async () => {
            const proxyClient = createClient(mockClient, mockOperations) as any;
            const options = {
                params: { path: { id: '123' }, query: { filter: 'active' } },
            };

            const result = await proxyClient.getTest(options);

            expect(mockClient.GET).toHaveBeenCalledWith('/api/v1/test/{id}', options);
            expect(result).toHaveProperty('data');
            expect(result).toHaveProperty('response');
            expect(result).not.toHaveProperty('error');
        });

        it('should proxy POST operation to client.POST with correct path', async () => {
            const proxyClient = createClient(mockClient, mockOperations) as any;
            const options = {
                params: { path: { id: '123' } },
                body: { value: 42 },
            };

            const result = await proxyClient.createTest(options);

            expect(mockClient.POST).toHaveBeenCalledWith('/api/v1/test/{id}', options);
            expect(result).toHaveProperty('data');
            expect(result).toHaveProperty('response');
        });

        it('should handle operations without parameters', async () => {
            const proxyClient = createClient(mockClient, mockOperations) as any;

            const result = await proxyClient.listUsers();

            expect(mockClient.GET).toHaveBeenCalledWith('/api/v1/users');
            expect(result).toHaveProperty('data');
            expect(result).toHaveProperty('response');
        });

        it('should pass through multiple arguments to the HTTP method', async () => {
            const proxyClient = createClient(mockClient, mockOperations) as any;
            const options = { params: { path: { id: '123' } } };

            const result = await proxyClient.getTest(options);

            expect(mockClient.GET).toHaveBeenCalledWith('/api/v1/test/{id}', options);
            expect(result).toHaveProperty('data');
            expect(result).toHaveProperty('response');
        });

        it('should return both data and response on success', async () => {
            const proxyClient = createClient(mockClient, mockOperations) as any;
            const result = await proxyClient.getTest({ params: { path: { id: '123' } } });

            expect(result.data).toEqual({ success: true });
            expect(result.response).toBeDefined();
            expect(result.response.status).toBe(200);
        });
    });

    describe('middleware methods', () => {
        it('should pass through the use method', () => {
            const proxyClient = createClient(mockClient, mockOperations);
            const middleware = { onRequest: vi.fn() };

            proxyClient.use(middleware);

            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(mockClient.use).toHaveBeenCalledWith(middleware);
        });

        it('should pass through the eject method', () => {
            const proxyClient = createClient(mockClient, mockOperations);
            const middleware = { onRequest: vi.fn() };

            proxyClient.eject(middleware);

            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(mockClient.eject).toHaveBeenCalledWith(middleware);
        });

        it('should bind middleware methods to the original client', () => {
            const proxyClient = createClient(mockClient, mockOperations);

            // Access the method
            const useMethod = proxyClient.use;

            // Calling the method should still work
            const middleware = { onRequest: vi.fn() };
            useMethod(middleware);

            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(mockClient.use).toHaveBeenCalledWith(middleware);
        });
    });

    describe('property access', () => {
        it('should return undefined for non-operation and non-middleware properties', () => {
            const proxyClient = createClient(mockClient, mockOperations);

            expect((proxyClient as any).GET).toBeUndefined();
            expect((proxyClient as any).POST).toBeUndefined();
            expect((proxyClient as any).unknownMethod).toBeUndefined();
        });
    });

    describe('error handling', () => {
        it('should throw ApiError when response has error', async () => {
            const errorBody = { message: 'Not Found', code: 'PRODUCT_NOT_FOUND' };
            const errorResponse = {
                status: 404,
                statusText: 'Not Found',
                headers: new Headers({ 'content-type': 'application/json' }),
                url: 'https://api.example.com/test/123',
                ok: false,
                clone: () => ({
                    text: vi.fn().mockResolvedValue(JSON.stringify(errorBody)),
                }),
            };

            mockClient.GET = vi.fn().mockResolvedValue({
                data: undefined,
                error: errorBody,
                response: errorResponse,
            });

            const proxyClient = createClient(mockClient, mockOperations) as any;

            await expect(async () => {
                await proxyClient.getTest({ params: { path: { id: '123' } } });
            }).rejects.toThrow(ApiError);
        });

        it('should throw ApiError with correct status and statusText', async () => {
            const errorBody = { message: 'Not Found' };
            const errorResponse = {
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                url: 'https://api.example.com/test/123',
                ok: false,
                clone: () => ({
                    text: vi.fn().mockResolvedValue(JSON.stringify(errorBody)),
                }),
            };

            mockClient.GET = vi.fn().mockResolvedValue({
                data: undefined,
                error: errorBody,
                response: errorResponse,
            });

            const proxyClient = createClient(mockClient, mockOperations) as any;

            try {
                await proxyClient.getTest({ params: { path: { id: '123' } } });
                expect.fail('Should have thrown ApiError');
            } catch (error) {
                expect(error).toBeInstanceOf(ApiError);
                expect((error as ApiError).status).toBe(404);
                expect((error as ApiError).statusText).toBe('Not Found');
            }
        });

        it('should throw ApiError with parsed JSON body', async () => {
            const errorBody = {
                type: 'https://api.example.com/errors/validation',
                title: 'Validation Error',
                detail: 'The request contained invalid fields',
            };
            const errorResponse = {
                status: 400,
                statusText: 'Bad Request',
                headers: new Headers({ 'content-type': 'application/json' }),
                url: 'https://api.example.com/test',
                ok: false,
                clone: () => ({
                    text: vi.fn().mockResolvedValue(JSON.stringify(errorBody)),
                }),
            };

            mockClient.POST = vi.fn().mockResolvedValue({
                data: undefined,
                error: errorBody,
                response: errorResponse,
            });

            const proxyClient = createClient(mockClient, mockOperations) as any;

            try {
                await proxyClient.createTest({ params: { path: { id: '123' } } });
                expect.fail('Should have thrown ApiError');
            } catch (error) {
                expect(error).toBeInstanceOf(ApiError);
                expect((error as ApiError).body).toEqual(errorBody);
            }
        });

        it('should throw ApiError with generic body when response is not ProblemDetail', async () => {
            const rawErrorText = '<html>Internal Server Error</html>';
            const errorResponse = {
                status: 500,
                statusText: 'Internal Server Error',
                headers: new Headers({ 'content-type': 'text/html' }),
                url: 'https://api.example.com/test',
                ok: false,
                clone: () => ({
                    text: vi.fn().mockResolvedValue(rawErrorText),
                }),
            };

            mockClient.GET = vi.fn().mockResolvedValue({
                data: undefined,
                error: rawErrorText,
                response: errorResponse,
            });

            const proxyClient = createClient(mockClient, mockOperations) as any;

            try {
                await proxyClient.getTest({ params: { path: { id: '123' } } });
                expect.fail('Should have thrown ApiError');
            } catch (error) {
                expect(error).toBeInstanceOf(ApiError);
                expect((error as ApiError).body.type).toBe('Unknown Error');
                expect((error as ApiError).body.title).toBe('Internal Server Error');
                expect((error as ApiError).body.detail).toBe('The API returned a 500 error. See rawBody for details.');
                expect((error as ApiError).rawBody).toBe(rawErrorText);
            }
        });

        it('should throw ApiError with both rawBody and parsed body', async () => {
            const errorBody = {
                type: 'https://api.example.com/errors/forbidden',
                title: 'Forbidden',
                detail: 'Access to this resource is denied',
            };
            const rawBody = JSON.stringify(errorBody);
            const errorResponse = {
                status: 403,
                statusText: 'Forbidden',
                headers: new Headers({ 'content-type': 'application/json' }),
                url: 'https://api.example.com/test',
                ok: false,
                clone: () => ({
                    text: vi.fn().mockResolvedValue(rawBody),
                }),
            };

            mockClient.GET = vi.fn().mockResolvedValue({
                data: undefined,
                error: errorBody,
                response: errorResponse,
            });

            const proxyClient = createClient(mockClient, mockOperations) as any;

            try {
                await proxyClient.getTest({ params: { path: { id: '123' } } });
                expect.fail('Should have thrown ApiError');
            } catch (error) {
                expect(error).toBeInstanceOf(ApiError);
                expect((error as ApiError).body).toEqual(errorBody);
                expect((error as ApiError).rawBody).toBe(rawBody);
            }
        });

        it('should throw ApiError with response headers', async () => {
            const errorBody = { message: 'Rate limit exceeded' };
            const headers = new Headers({
                'content-type': 'application/json',
                'x-rate-limit-remaining': '0',
                'x-rate-limit-reset': '1234567890',
            });
            const errorResponse = {
                status: 429,
                statusText: 'Too Many Requests',
                headers,
                url: 'https://api.example.com/test',
                ok: false,
                clone: () => ({
                    text: vi.fn().mockResolvedValue(JSON.stringify(errorBody)),
                }),
            };

            mockClient.GET = vi.fn().mockResolvedValue({
                data: undefined,
                error: errorBody,
                response: errorResponse,
            });

            const proxyClient = createClient(mockClient, mockOperations) as any;

            try {
                await proxyClient.getTest({ params: { path: { id: '123' } } });
                expect.fail('Should have thrown ApiError');
            } catch (error) {
                expect(error).toBeInstanceOf(ApiError);
                expect((error as ApiError).headers).toBe(headers);
                expect((error as ApiError).headers.get('x-rate-limit-remaining')).toBe('0');
            }
        });

        it('should throw AuthTokenInvalidError on 401 for non-SLAS endpoints', async () => {
            const errorBody = { message: 'Unauthorized' };
            const errorResponse = {
                status: 401,
                statusText: 'Unauthorized',
                headers: new Headers(),
                url: 'https://api.example.com/test/123',
                ok: false,
                clone: () => ({
                    text: vi.fn().mockResolvedValue(JSON.stringify(errorBody)),
                }),
            };

            mockClient.GET = vi.fn().mockResolvedValue({
                data: undefined,
                error: errorBody,
                response: errorResponse,
            });

            const proxyClient = createClient(mockClient, mockOperations) as any;

            await expect(async () => {
                await proxyClient.getTest({ params: { path: { id: '123' } } });
            }).rejects.toThrow(AuthTokenInvalidError);
        });

        it('should invoke onAuthTokenInvalid before throwing', async () => {
            const errorBody = { message: 'Unauthorized' };
            const errorResponse = {
                status: 401,
                statusText: 'Unauthorized',
                headers: new Headers(),
                url: 'https://api.example.com/test/123',
                ok: false,
                clone: () => ({
                    text: vi.fn().mockResolvedValue(JSON.stringify(errorBody)),
                }),
            };

            mockClient.GET = vi.fn().mockResolvedValue({
                data: undefined,
                error: errorBody,
                response: errorResponse,
            });

            const onAuthTokenInvalid = vi.fn();
            const proxyClient = createClient(mockClient, mockOperations, undefined, { onAuthTokenInvalid }) as any;

            await expect(async () => {
                await proxyClient.getTest({ params: { path: { id: '123' } } });
            }).rejects.toThrow(AuthTokenInvalidError);

            expect(onAuthTokenInvalid).toHaveBeenCalledWith(errorResponse);
        });

        it('should throw ApiError on 401 for SLAS auth endpoints', async () => {
            const errorBody = { message: 'Unauthorized' };
            const slasPath = SLAS_AUTH_ENDPOINTS[0];
            const errorResponse = {
                status: 401,
                statusText: 'Unauthorized',
                headers: new Headers(),
                url: `https://api.example.com${slasPath}`,
                ok: false,
                clone: () => ({
                    text: vi.fn().mockResolvedValue(JSON.stringify(errorBody)),
                }),
            };

            mockClient.GET = vi.fn().mockResolvedValue({
                data: undefined,
                error: errorBody,
                response: errorResponse,
            });

            const proxyClient = createClient(mockClient, mockOperations) as any;

            try {
                await proxyClient.getTest({ params: { path: { id: '123' } } });
                expect.fail('Should have thrown ApiError');
            } catch (error) {
                expect(error).toBeInstanceOf(ApiError);
                expect((error as ApiError).url).toBe(`https://api.example.com${slasPath}`);
                expect((error as ApiError).method).toBe('GET');
            }
        });

        it('should throw ApiError on 401 for WebAuthn passkey endpoints', async () => {
            const errorBody = { message: 'Invalid OTP' };
            const webAuthnPath = '/organizations/f_ecom_zzrf_001/oauth2/webauthn/register/authorize';
            const errorResponse = {
                status: 401,
                statusText: 'Unauthorized',
                headers: new Headers(),
                url: `https://api.example.com${webAuthnPath}`,
                ok: false,
                clone: () => ({
                    text: vi.fn().mockResolvedValue(JSON.stringify(errorBody)),
                }),
            };

            mockClient.GET = vi.fn().mockResolvedValue({
                data: undefined,
                error: errorBody,
                response: errorResponse,
            });

            const proxyClient = createClient(mockClient, mockOperations) as any;

            try {
                await proxyClient.getTest({ params: { path: { id: '123' } } });
                expect.fail('Should have thrown ApiError');
            } catch (error) {
                expect(error).toBeInstanceOf(ApiError);
                expect(error).not.toBeInstanceOf(AuthTokenInvalidError);
            }
        });

        it('should throw AuthTokenInvalidError on 401 for WebAuthn passkey/user endpoints', async () => {
            const errorBody = { message: 'Unauthorized' };
            const passkeyPath = '/organizations/f_ecom_zzrf_001/oauth2/webauthn/passkey/user/shopper%40example.com';
            const errorResponse = {
                status: 401,
                statusText: 'Unauthorized',
                headers: new Headers(),
                url: `https://api.example.com${passkeyPath}`,
                ok: false,
                clone: () => ({
                    text: vi.fn().mockResolvedValue(JSON.stringify(errorBody)),
                }),
            };

            mockClient.GET = vi.fn().mockResolvedValue({
                data: undefined,
                error: errorBody,
                response: errorResponse,
            });

            const proxyClient = createClient(mockClient, mockOperations) as any;

            await expect(async () => {
                await proxyClient.getTest({ params: { path: { id: '123' } } });
            }).rejects.toThrow(AuthTokenInvalidError);
        });

        it('should throw error when HTTP method does not exist on client', async () => {
            // Create a mock operation with an unsupported HTTP method
            const BASE = '/api' as const;
            const badOperations = {
                customMethod: { m: 'CUSTOM', b: BASE, s: '/test' },
            };

            const proxyClient = createClient(mockClient, badOperations as unknown as OperationMap) as any;

            await expect(async () => {
                await proxyClient.customMethod();
            }).rejects.toThrow('Client method CUSTOM not found');
        });
    });

    describe('method context binding', () => {
        it('should call HTTP methods with correct context', async () => {
            let capturedThis: unknown;
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: new Headers(),
                url: 'https://api.example.com/test',
                clone: () => mockResponse,
                text: vi.fn().mockResolvedValue(''),
            };

            const clientWithContext = {
                ...mockClient,
                GET: vi.fn(function (this: unknown) {
                    // eslint-disable-next-line @typescript-eslint/no-this-alias
                    capturedThis = this;
                    return Promise.resolve({ data: { success: true }, error: undefined, response: mockResponse });
                }),
            } as unknown as Client<MockPaths>;

            const proxyClient = createClient(clientWithContext, mockOperations) as any;
            await proxyClient.getTest({ params: { path: { id: '123' } } });

            // The context should be the original client
            expect(capturedThis).toBe(clientWithContext);
        });
    });

    describe('with different operation types', () => {
        it('should handle operations with all HTTP methods', async () => {
            const BASE = '/api' as const;
            const allMethodsOperations: OperationMap = {
                getOp: { m: 'GET', b: BASE, s: '/test' },
                postOp: { m: 'POST', b: BASE, s: '/test' },
                putOp: { m: 'PUT', b: BASE, s: '/test' },
                patchOp: { m: 'PATCH', b: BASE, s: '/test' },
                deleteOp: { m: 'DELETE', b: BASE, s: '/test' },
            };

            const proxyClient = createClient(mockClient, allMethodsOperations);

            await (proxyClient as any).getOp();
            await (proxyClient as any).postOp();
            await (proxyClient as any).putOp();
            await (proxyClient as any).patchOp();
            await (proxyClient as any).deleteOp();

            expect(mockClient.GET).toHaveBeenCalledWith('/api/test');
            expect(mockClient.POST).toHaveBeenCalledWith('/api/test');
            expect(mockClient.PUT).toHaveBeenCalledWith('/api/test');
            expect(mockClient.PATCH).toHaveBeenCalledWith('/api/test');
            expect(mockClient.DELETE).toHaveBeenCalledWith('/api/test');
        });

        it('should handle case-insensitive HTTP method names', async () => {
            const BASE = '/api' as const;
            const lowerCaseOps: OperationMap = {
                getOp: { m: 'get', b: BASE, s: '/test' },
                postOp: { m: 'post', b: BASE, s: '/test' },
            };

            const proxyClient = createClient(mockClient, lowerCaseOps);

            await (proxyClient as any).getOp();
            await (proxyClient as any).postOp();

            expect(mockClient.GET).toHaveBeenCalledWith('/api/test');
            expect(mockClient.POST).toHaveBeenCalledWith('/api/test');
        });
    });

    describe('global request parameters', () => {
        const globalParams = { organizationId: 'test-org', siteId: 'test-site' };

        it('should merge organizationId into path params and siteId into query params', async () => {
            const proxyClient = createClient(mockClient, mockOperations, globalParams) as any;

            await proxyClient.getTest({ params: { path: { id: '123' } } });

            expect(mockClient.GET).toHaveBeenCalledWith('/api/v1/test/{id}', {
                params: {
                    path: { id: '123', organizationId: 'test-org' },
                    query: { siteId: 'test-site' },
                },
            });
        });

        it('should merge global params with existing query params', async () => {
            const proxyClient = createClient(mockClient, mockOperations, globalParams) as any;

            await proxyClient.getTest({
                params: {
                    path: { id: '123' },
                    query: { filter: 'active' },
                },
            });

            expect(mockClient.GET).toHaveBeenCalledWith('/api/v1/test/{id}', {
                params: {
                    path: { id: '123', organizationId: 'test-org' },
                    query: { filter: 'active', siteId: 'test-site' },
                },
            });
        });

        it('should work when caller provides no options', async () => {
            const proxyClient = createClient(mockClient, mockOperations, globalParams) as any;

            await proxyClient.listUsers();

            expect(mockClient.GET).toHaveBeenCalledWith('/api/v1/users', {
                params: {
                    path: { organizationId: 'test-org' },
                    query: { siteId: 'test-site' },
                },
            });
        });

        it('should allow caller-provided organizationId/siteId to override global values', async () => {
            const proxyClient = createClient(mockClient, mockOperations, globalParams) as any;

            await proxyClient.getTest({
                params: {
                    path: { id: '123', organizationId: 'caller-org' },
                    query: { siteId: 'caller-site' },
                },
            });

            // Caller-provided values override global defaults
            expect(mockClient.GET).toHaveBeenCalledWith('/api/v1/test/{id}', {
                params: {
                    path: { id: '123', organizationId: 'caller-org' },
                    query: { siteId: 'caller-site' },
                },
            });
        });

        it('should preserve other options like headers and body', async () => {
            const proxyClient = createClient(mockClient, mockOperations, globalParams) as any;

            await proxyClient.createTest({
                params: { path: { id: '123' } },
                body: { value: 42 },
                headers: { 'X-Custom': 'header' },
            });

            expect(mockClient.POST).toHaveBeenCalledWith('/api/v1/test/{id}', {
                params: {
                    path: { id: '123', organizationId: 'test-org' },
                    query: { siteId: 'test-site' },
                },
                body: { value: 42 },
                headers: { 'X-Custom': 'header' },
            });
        });

        it('should work without global params (backward compatible)', async () => {
            const proxyClient = createClient(mockClient, mockOperations) as any;

            await proxyClient.getTest({
                params: {
                    path: { id: '123', organizationId: 'manual-org' },
                    query: { siteId: 'manual-site', filter: 'active' },
                },
            });

            expect(mockClient.GET).toHaveBeenCalledWith('/api/v1/test/{id}', {
                params: {
                    path: { id: '123', organizationId: 'manual-org' },
                    query: { siteId: 'manual-site', filter: 'active' },
                },
            });
        });

        it('should merge into empty options object', async () => {
            const proxyClient = createClient(mockClient, mockOperations, globalParams) as any;

            await proxyClient.listUsers({});

            expect(mockClient.GET).toHaveBeenCalledWith('/api/v1/users', {
                params: {
                    path: { organizationId: 'test-org' },
                    query: { siteId: 'test-site' },
                },
            });
        });
    });
});
