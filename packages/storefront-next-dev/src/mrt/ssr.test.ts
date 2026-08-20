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
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';
import type { Express } from 'express';

// Mock modules with factory functions
vi.mock('@codegenie/serverless-express', () => ({
    default: vi.fn(),
}));

vi.mock('../server/index', () => ({
    createServer: vi.fn(),
}));

// Mock the server build import
vi.mock('./server/index.js', () => ({
    default: {
        assets: { version: '1', entry: { module: 'entry.js', imports: [] }, routes: {} },
        assetsBuildDirectory: '/build/client',
        basename: '/',
        entry: { module: {} },
        future: {},
        publicPath: '/',
        routes: {},
    },
}));

// Import after mocks are set up
const serverlessExpress = (await import('@codegenie/serverless-express')).default;
const { createServer } = await import('../server/index');

describe('mrt/ssr', () => {
    let mockExpressApp: Express;
    let mockServerlessHandler: ReturnType<typeof vi.fn>;
    let mockContext: Context;
    let mockEvent: APIGatewayProxyEvent;
    let mockCallback: Callback;

    beforeAll(() => {
        // Mock Express app
        mockExpressApp = {
            use: vi.fn(),
            all: vi.fn(),
            disable: vi.fn(),
        } as unknown as Express;

        // Mock serverless handler
        mockServerlessHandler = vi.fn();
        vi.mocked(serverlessExpress).mockReturnValue(mockServerlessHandler as any);

        // Mock createServer
        vi.mocked(createServer).mockResolvedValue(mockExpressApp);
    });

    beforeEach(() => {
        // Reset modules to clear the cached handler in ssr.ts
        vi.resetModules();

        // Re-register mocks after resetModules (they get cleared too)
        vi.doMock('@codegenie/serverless-express', () => ({
            default: vi.fn().mockReturnValue(mockServerlessHandler),
        }));
        vi.doMock('../server/index', () => ({
            createServer: vi.fn().mockResolvedValue(mockExpressApp),
        }));
        vi.doMock('./server/index.js', () => ({
            default: {
                assets: { version: '1', entry: { module: 'entry.js', imports: [] }, routes: {} },
                assetsBuildDirectory: '/build/client',
                basename: '/',
                entry: { module: {} },
                future: {},
                publicPath: '/',
                routes: {},
            },
        }));

        // Clear the shared mock handler
        mockServerlessHandler.mockClear();

        // Mock AWS Lambda context
        mockContext = {
            callbackWaitsForEmptyEventLoop: true,
            functionName: 'test-function',
            functionVersion: '1',
            invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
            memoryLimitInMB: '128',
            awsRequestId: 'test-request-id',
            logGroupName: '/aws/lambda/test-function',
            logStreamName: '2024/01/01/[$LATEST]test',
            getRemainingTimeInMillis: () => 3000,
            done: vi.fn(),
            fail: vi.fn(),
            succeed: vi.fn(),
        };

        // Mock AWS Lambda event (API Gateway v1)
        mockEvent = {
            resource: '/',
            httpMethod: 'GET',
            path: '/',
            queryStringParameters: null,
            multiValueQueryStringParameters: null,
            headers: {},
            multiValueHeaders: {},
            body: null,
            isBase64Encoded: false,
            requestContext: {
                accountId: '123456789012',
                apiId: 'test-api-id',
                protocol: 'HTTP/1.1',
                httpMethod: 'GET',
                path: '/',
                stage: '$default',
                requestId: 'test-request-id',
                requestTime: '01/Jan/2024:00:00:00 +0000',
                requestTimeEpoch: 1704067200000,
                identity: {
                    sourceIp: '127.0.0.1',
                    userAgent: 'test-agent',
                    accessKey: null,
                    accountId: null,
                    apiKey: null,
                    apiKeyId: null,
                    caller: null,
                    clientCert: null,
                    cognitoAuthenticationProvider: null,
                    cognitoAuthenticationType: null,
                    cognitoIdentityId: null,
                    cognitoIdentityPoolId: null,
                    principalOrgId: null,
                    user: null,
                    userArn: null,
                },
                authorizer: {},
                resourceId: 'test-resource-id',
                resourcePath: '/',
            },
            pathParameters: null,
            stageVariables: null,
        };

        // Mock callback
        mockCallback = vi.fn() as Callback;
    });

    describe('get handler', () => {
        it('should set callbackWaitsForEmptyEventLoop to false', async () => {
            const { get } = await import('./ssr');

            void get(mockEvent, mockContext, mockCallback);

            expect(mockContext.callbackWaitsForEmptyEventLoop).toBe(false);

            await vi.waitFor(() => {
                expect(mockCallback).toHaveBeenCalled();
            });
        });

        it('should maintain AWS Lambda callback signature (not async)', async () => {
            const { get } = await import('./ssr');

            // Verify that the handler does NOT return a Promise
            // AWS Lambda callback handlers should be synchronous functions
            const result = get(mockEvent, mockContext, mockCallback);

            expect(result).toBeUndefined();

            await vi.waitFor(() => {
                expect(mockCallback).toHaveBeenCalled();
            });
        });
    });

    describe('invokeHandler', () => {
        it('should invoke the handler when it resolves successfully', async () => {
            const { invokeHandler } = await import('./ssr');
            const mockHandler = vi.fn();
            const handlerPromise = Promise.resolve(mockHandler);
            const testCallback = vi.fn() as Callback;

            invokeHandler(handlerPromise, mockEvent, mockContext, testCallback);

            await vi.waitFor(() => {
                expect(mockHandler).toHaveBeenCalledWith(mockEvent, mockContext, testCallback);
            });
        });

        it('should call callback with error when handler is null', async () => {
            const { invokeHandler } = await import('./ssr');
            const handlerPromise = Promise.resolve(null);
            const testCallback = vi.fn() as Callback;

            invokeHandler(handlerPromise, mockEvent, mockContext, testCallback);

            await vi.waitFor(() => {
                expect(testCallback).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: 'Serverless Express handler is not available',
                    })
                );
            });
        });

        it('should call callback with error when handler promise rejects', async () => {
            const { invokeHandler } = await import('./ssr');
            const initError = new Error('Failed to initialize handler');
            const handlerPromise = Promise.reject(initError);
            const testCallback = vi.fn() as Callback;

            invokeHandler(handlerPromise, mockEvent, mockContext, testCallback);

            await vi.waitFor(() => {
                expect(testCallback).toHaveBeenCalledWith(initError);
            });
        });

        it('should handle multiple concurrent invocations', async () => {
            const { invokeHandler } = await import('./ssr');
            const mockHandler = vi.fn();
            const handlerPromise = Promise.resolve(mockHandler);

            const callback1 = vi.fn() as Callback;
            const callback2 = vi.fn() as Callback;
            const callback3 = vi.fn() as Callback;

            const context1 = { ...mockContext, awsRequestId: 'req-1' };
            const context2 = { ...mockContext, awsRequestId: 'req-2' };
            const context3 = { ...mockContext, awsRequestId: 'req-3' };

            invokeHandler(handlerPromise, mockEvent, context1, callback1);
            invokeHandler(handlerPromise, mockEvent, context2, callback2);
            invokeHandler(handlerPromise, mockEvent, context3, callback3);

            await vi.waitFor(() => {
                expect(mockHandler).toHaveBeenCalledTimes(3);
            });

            expect(mockHandler).toHaveBeenCalledWith(mockEvent, context1, callback1);
            expect(mockHandler).toHaveBeenCalledWith(mockEvent, context2, callback2);
            expect(mockHandler).toHaveBeenCalledWith(mockEvent, context3, callback3);
        });
    });

    describe('createHandler', () => {
        it('should create a handler using the provided build loader', async () => {
            const { createHandler } = await import('./ssr');
            const mockBuild = {
                assets: { version: '1', entry: { module: 'entry.js', imports: [] }, routes: {} },
                assetsBuildDirectory: '/build/client',
                basename: '/',
                entry: { module: {} },
                future: {},
                publicPath: '/',
                routes: {},
            };
            const mockBuildLoader = vi.fn().mockResolvedValue(mockBuild);

            const handler = await createHandler(mockBuildLoader);

            expect(mockBuildLoader).toHaveBeenCalled();
            expect(handler).toBeDefined();
            expect(typeof handler).toBe('function');
        });

        it('should propagate errors from build loader', async () => {
            const { createHandler } = await import('./ssr');
            const buildError = new Error('Failed to load build');
            const mockBuildLoader = vi.fn().mockRejectedValue(buildError);

            await expect(createHandler(mockBuildLoader)).rejects.toThrow('Failed to load build');
        });
    });

    describe('MRT constraints compliance', () => {
        it('should export handler named "get" for MRT compatibility', async () => {
            const module = await import('./ssr');

            expect(module).toHaveProperty('get');
            expect(typeof module.get).toBe('function');
        });

        it('should use callback signature instead of async handler', async () => {
            const { get } = await import('./ssr');

            // AWS Lambda async handlers return a Promise
            // MRT-compatible handlers use callbacks and return void
            const returnValue = get(mockEvent, mockContext, mockCallback);

            expect(returnValue).toBeUndefined();

            await vi.waitFor(() => {
                expect(mockCallback).toHaveBeenCalled();
            });
        });

        it('should set callbackWaitsForEmptyEventLoop to false immediately', async () => {
            const { get } = await import('./ssr');

            // Context starts with true
            expect(mockContext.callbackWaitsForEmptyEventLoop).toBe(true);

            void get(mockEvent, mockContext, mockCallback);

            // Should be set to false synchronously, before any async operations
            expect(mockContext.callbackWaitsForEmptyEventLoop).toBe(false);

            await vi.waitFor(() => {
                expect(mockCallback).toHaveBeenCalled();
            });
        });
    });
});
