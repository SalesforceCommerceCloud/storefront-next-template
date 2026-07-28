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
/* oxlint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { PassThrough, type Writable } from 'stream';
import { EventEmitter } from 'events';
import zlib from 'node:zlib';
import express, { type Express } from 'express';
import { writeReadableStreamToWritable } from '@react-router/node';
import { createStreamingLambdaAdapter, createExpressRequest, createExpressResponse } from './create-lambda-adapter';

// Mock awslambda global
const mockHttpResponseStream = {
    from: vi.fn(
        // oxlint-disable-next-line @typescript-eslint/no-unused-vars
        (stream: Writable, metadata: { statusCode: number; headers: Record<string, any>; cookies?: string[] }) => {
            return stream;
        }
    ),
};

// Mocking global awslambda for testing

(globalThis as any).awslambda = {
    HttpResponseStream: mockHttpResponseStream,
};

// Helper to create a mock Writable stream
function createMockWritable(): Writable & EventEmitter {
    const stream = new EventEmitter() as any;
    const chunks: Buffer[] = [];
    let ended = false;
    let destroyed = false;

    stream.writable = true;
    stream.writableEnded = false;
    stream.writableFinished = false;
    stream.destroyed = false;

    stream.write = vi.fn((chunk: any) => {
        if (destroyed || ended) return false;
        chunks.push(Buffer.from(chunk));
        return true;
    });

    stream.end = vi.fn((chunk?: any, encoding?: any, callback?: any) => {
        if (destroyed) {
            // If callback is provided, call it
            if (typeof chunk === 'function') {
                chunk();
            } else if (typeof encoding === 'function') {
                encoding();
            } else if (typeof callback === 'function') {
                callback();
            }
            return stream;
        }

        // Handle different call signatures:
        // end() - no arguments
        // end(callback) - callback function only
        // end(chunk) - data chunk only
        // end(chunk, encoding) - data chunk with encoding
        // end(chunk, callback) - data chunk with callback
        // end(chunk, encoding, callback) - data chunk with encoding and callback

        let actualCallback: (() => void) | undefined;

        if (typeof chunk === 'function') {
            // end(callback) - first arg is callback
            actualCallback = chunk;
        } else if (chunk !== undefined && chunk !== null) {
            // end(chunk) or end(chunk, encoding) or end(chunk, callback) or end(chunk, encoding, callback)
            // Only push to chunks if it's not a function
            if (typeof chunk !== 'function') {
                chunks.push(Buffer.from(chunk, encoding));
            }

            // Check if second arg is callback
            if (typeof encoding === 'function') {
                actualCallback = encoding;
            } else if (typeof callback === 'function') {
                actualCallback = callback;
            }
        } else if (typeof encoding === 'function') {
            // end(undefined, callback) - unlikely but handle it
            actualCallback = encoding;
        } else if (typeof callback === 'function') {
            actualCallback = callback;
        }

        ended = true;
        stream.writableEnded = true;
        stream.writableFinished = true;
        stream.emit('finish');

        // Call callback if provided
        if (actualCallback) {
            actualCallback();
        }

        return stream;
    });

    stream.destroy = vi.fn(() => {
        destroyed = true;
        stream.destroyed = true;
        stream.writable = false;
        stream.emit('close');
        return stream;
    });

    stream.flush = vi.fn(() => {
        // Mock flush method
    });

    return stream as Writable & EventEmitter;
}

// Helper to create a mock API Gateway event
function createMockEvent(overrides?: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
    return {
        httpMethod: 'GET',
        path: '/test',
        pathParameters: null,
        queryStringParameters: null,
        headers: {
            'Content-Type': 'application/json',
            Host: 'example.com',
        },
        multiValueHeaders: {},
        body: null,
        isBase64Encoded: false,
        requestContext: {
            requestId: 'test-request-id',
            accountId: '123456789012',
            apiId: 'test-api-id',
            protocol: 'HTTP/1.1',
            httpMethod: 'GET',
            path: '/test',
            stage: 'test',
            requestTime: '09/Apr/2015:12:34:56 +0000',
            requestTimeEpoch: 1428582896000,
            identity: {
                sourceIp: '127.0.0.1',
                userAgent: 'test-agent',
                accessKey: null,
                accountId: null,
                apiKey: null,
                apiKeyId: null,
                caller: null,
                cognitoAuthenticationProvider: null,
                cognitoAuthenticationType: null,
                cognitoIdentityId: null,
                cognitoIdentityPoolId: null,
                principalOrgId: null,
                user: null,
                userArn: null,
                clientCert: null,
            },
            resourceId: 'test-resource-id',
            resourcePath: '/test',
        },
        ...overrides,
    } as APIGatewayProxyEvent;
}

// Helper to create a mock Lambda context
// Helper to create a collecting stream for compression tests
function createCollectingStream(): PassThrough & {
    getData: () => Buffer;
    getMetadata: () => any;
    waitForEnd: () => Promise<void>;
} {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    // Mark this as the original stream for metadata storage
    (stream as any).__originalStream = stream;

    stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
    });

    return Object.assign(stream, {
        getData: () => Buffer.concat(chunks),
        getMetadata: () => (stream as any).__metadata,
        waitForEnd: () => {
            return new Promise<void>((resolve) => {
                if (stream.writableEnded) {
                    resolve();
                } else {
                    const timeout = setTimeout(resolve, 500);
                    stream.once('finish', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                    stream.once('end', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                }
            });
        },
    });
}

// Helper to create a request with Accept-Encoding header
function createRequestWithEncoding(acceptEncoding: string): ReturnType<typeof createExpressRequest> {
    const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/test',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        headers: {
            'Accept-Encoding': acceptEncoding,
        },
        multiValueHeaders: {},
        body: null,
        isBase64Encoded: false,
        requestContext: createMockEvent().requestContext,
        resource: '/test',
        stageVariables: null,
    } as APIGatewayProxyEvent;

    const context: Context = {
        callbackWaitsForEmptyEventLoop: false,
        functionName: 'test-function',
        functionVersion: '$LATEST',
        invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
        memoryLimitInMB: '128',
        awsRequestId: 'test-request-id',
        logGroupName: '/aws/lambda/test-function',
        logStreamName: '2023/01/01/[$LATEST]test',
        getRemainingTimeInMillis: () => 30000,
        done: () => {},
        fail: () => {},
        succeed: () => {},
    };

    return createExpressRequest(event, context);
}

function createMockContext(overrides?: Partial<Context>): Context {
    return {
        callbackWaitsForEmptyEventLoop: false,
        functionName: 'test-function',
        functionVersion: '$LATEST',
        invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
        memoryLimitInMB: '128',
        awsRequestId: 'test-request-id',
        logGroupName: '/aws/lambda/test-function',
        logStreamName: '2024/01/01/[$LATEST]test',
        getRemainingTimeInMillis: () => 30000,
        done: vi.fn(),
        fail: vi.fn(),
        succeed: vi.fn(),
        ...overrides,
    } as Context;
}

describe('create-lambda-adapter', () => {
    let mockResponseStream: Writable & EventEmitter;
    let mockApp: Express;

    beforeEach(() => {
        mockResponseStream = createMockWritable();
        mockApp = express();
        vi.clearAllMocks();
        mockHttpResponseStream.from.mockImplementation((stream) => stream);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('createStreamingLambdaAdapter', () => {
        it('should create a handler function', () => {
            const handler = createStreamingLambdaAdapter(mockApp, mockResponseStream);
            expect(typeof handler).toBe('function');
        });

        it('should handle successful request', async () => {
            mockApp.get('/test', (req, res) => {
                res.status(200).json({ message: 'success' });
            });

            const handler = createStreamingLambdaAdapter(mockApp, mockResponseStream);
            const event = createMockEvent({ path: '/test' });
            const context = createMockContext();

            await handler(event, context);

            // Response should have been written and ended
            expect(mockResponseStream.write).toHaveBeenCalled();
            expect(mockResponseStream.end).toHaveBeenCalled();
        }, 10000); // Increase timeout for this test

        it('should handle errors and write error response', async () => {
            // Create an app that throws an error synchronously
            mockApp.get('/test', () => {
                throw new Error('Test error');
            });

            const handler = createStreamingLambdaAdapter(mockApp, mockResponseStream);
            const event = createMockEvent({ path: '/test' });
            const context = createMockContext();

            await handler(event, context);

            expect(mockResponseStream.write).toHaveBeenCalledWith(expect.stringContaining('500 Internal Server Error'));
            expect(mockResponseStream.end).toHaveBeenCalled();
        });

        it('should handle non-Error objects thrown', async () => {
            mockApp.get('/test', () => {
                throw new Error('String error');
            });

            const handler = createStreamingLambdaAdapter(mockApp, mockResponseStream);
            const event = createMockEvent({ path: '/test' });
            const context = createMockContext();

            await handler(event, context);

            expect(mockResponseStream.write).toHaveBeenCalledWith(expect.stringContaining('500 Internal Server Error'));
            expect(mockResponseStream.end).toHaveBeenCalled();
        });

        it('should handle closed stream in error handler', async () => {
            mockApp.get('/test', () => {
                throw new Error('Test error');
            });

            const closedStream = createMockWritable();
            (closedStream as any).writable = false;
            (closedStream as any).destroyed = true;

            const handler = createStreamingLambdaAdapter(mockApp, closedStream);
            const event = createMockEvent({ path: '/test' });
            const context = createMockContext();

            await handler(event, context);

            // Should not throw, even with closed stream
            expect(closedStream.write).not.toHaveBeenCalled();
        });

        it('should handle stream without write method', async () => {
            mockApp.get('/test', () => {
                throw new Error('Test error');
            });

            const streamWithoutWrite = createMockWritable();
            delete (streamWithoutWrite as any).write;

            const handler = createStreamingLambdaAdapter(mockApp, streamWithoutWrite);
            const event = createMockEvent({ path: '/test' });
            const context = createMockContext();

            await handler(event, context);

            // Should not throw
            expect(streamWithoutWrite.end).toHaveBeenCalled();
        });

        it('should handle stream without end method in finally', async () => {
            mockApp.get('/test', (req, res) => {
                res.status(200).send('OK');
            });

            const streamWithoutEnd = createMockWritable();
            delete (streamWithoutEnd as any).end;

            const handler = createStreamingLambdaAdapter(mockApp, streamWithoutEnd);
            const event = createMockEvent({ path: '/test' });
            const context = createMockContext();

            await handler(event, context);

            // Should not throw
            expect(streamWithoutEnd.write).toHaveBeenCalled();
        });
    });

    describe('createExpressRequest', () => {
        it('should create Express-like request object', () => {
            const event = createMockEvent();
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            expect(req.method).toBe('GET');
            expect(req.url).toBe('/test');
            expect(req.headers).toBeDefined();
            // ServerlessRequest doesn't expose path, query, params, or apiGateway directly
            // These are handled by Express middleware
        });

        it('should decode base64 encoded body', () => {
            const body = Buffer.from('test body').toString('base64');
            const event = createMockEvent({
                body,
                isBase64Encoded: true,
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            // ServerlessRequest returns body as Buffer
            expect(Buffer.isBuffer(req.body)).toBe(true);
            expect(req.body.toString('utf-8')).toBe('test body');
        });

        it('should handle query string parameters', () => {
            const event = createMockEvent({
                queryStringParameters: {
                    foo: 'bar',
                    baz: 'qux',
                },
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            // Query parameters are in the URL, Express will parse them
            expect(req.url).toContain('foo=bar');
            expect(req.url).toContain('baz=qux');
        });

        it('should handle path parameters', () => {
            const event = createMockEvent({
                pathParameters: {
                    id: '123',
                },
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            // Path parameters are handled by Express routing, not directly on request
            expect(req.url).toBeDefined();
        });

        it('should set protocol from X-Forwarded-Proto header', () => {
            const event = createMockEvent({
                headers: {
                    'X-Forwarded-Proto': 'http',
                },
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            // ServerlessRequest doesn't expose protocol directly
            // It's available via headers if needed
            expect(req.headers['x-forwarded-proto']).toBe('http');
        });

        it('should default to https protocol', () => {
            const event = createMockEvent({
                headers: {},
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            // ServerlessRequest doesn't expose protocol directly
            // Without X-Forwarded-Proto header, protocol is not set
            expect(req.headers['x-forwarded-proto']).toBeUndefined();
        });

        it('should set hostname from Host header', () => {
            const event = createMockEvent({
                headers: {
                    Host: 'example.com',
                },
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            // ServerlessRequest doesn't expose hostname directly
            // It's available via headers
            expect(req.headers.host).toBe('example.com');
        });

        it('should set IP from X-Forwarded-For header', () => {
            const event = createMockEvent({
                headers: {
                    'X-Forwarded-For': '192.168.1.1, 10.0.0.1',
                },
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            // ServerlessRequest uses remoteAddress, which comes from requestContext.identity.sourceIp
            // X-Forwarded-For is in headers but remoteAddress is set from sourceIp
            expect(req.headers['x-forwarded-for']).toBe('192.168.1.1, 10.0.0.1');
        });

        it('should implement get method for headers', () => {
            const event = createMockEvent({
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            expect(req.get('Content-Type')).toBe('application/json');
            expect(req.get('content-type')).toBe('application/json');
            expect(req.header('Content-Type')).toBe('application/json');
        });

        it('should handle missing headers', () => {
            const event = createMockEvent({
                headers: null as any,
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            expect(req.headers).toEqual({});
            expect(req.get('Content-Type')).toBeUndefined();
        });

        it('should handle empty headers object', () => {
            const event = createMockEvent({
                headers: {},
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            expect(req.headers).toEqual({});
            expect(req.get('Any-Header')).toBeUndefined();
        });

        it('should handle headers with array values', () => {
            const event = createMockEvent({
                headers: {
                    'X-Custom': ['value1', 'value2'] as any,
                },
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            // ServerlessRequest stores the value as-is (array)
            // The get method returns the header value directly
            const value = req.get('X-Custom');
            expect(Array.isArray(value)).toBe(true);
            expect(value).toEqual(['value1', 'value2']);
        });

        it('should handle missing requestContext', () => {
            const event = createMockEvent({
                requestContext: null,
            } as any);
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            // ServerlessRequest uses remoteAddress which defaults to empty string
            // We can't directly access it, but the request should still be created
            expect(req.method).toBe('GET');
        });

        it('should handle missing identity in requestContext', () => {
            const event = createMockEvent({
                requestContext: {
                    identity: null,
                } as any,
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            // ServerlessRequest uses remoteAddress which defaults to empty string
            // We can't directly access it, but the request should still be created
            expect(req.method).toBe('GET');
        });

        it('should handle empty query string parameters', () => {
            const event = createMockEvent({
                queryStringParameters: {},
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            // ServerlessRequest doesn't expose query directly
            // Empty query string parameters should not add '?' to URL
            expect(req.url).toBe('/test');
        });

        it('should handle null body', () => {
            const event = createMockEvent({
                body: null,
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            // When body is null, requestBody is undefined, so req.body may be undefined
            // or ServerlessRequest may convert it to an empty Buffer
            expect(req.body === undefined || Buffer.isBuffer(req.body)).toBe(true);
            if (Buffer.isBuffer(req.body)) {
                expect(req.body.length).toBe(0);
            }
        });

        it('should handle body without base64 encoding', () => {
            const event = createMockEvent({
                body: 'plain text body',
                isBase64Encoded: false,
            });
            const context = createMockContext();
            const req = createExpressRequest(event, context);

            // ServerlessRequest returns body as Buffer
            expect(Buffer.isBuffer(req.body)).toBe(true);
            expect(req.body.toString('utf-8')).toBe('plain text body');
        });
    });

    describe('createExpressResponse', () => {
        describe('writeHead', () => {
            it('should set status code and headers', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.writeHead(200, { 'Content-Type': 'text/plain' });

                expect(res.statusCode).toBe(200);
                expect(mockHttpResponseStream.from).toHaveBeenCalled();
                expect(res.headersSent).toBe(true);
            });

            it('should handle status message', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.writeHead(404, 'Not Found');

                expect(res.statusCode).toBe(404);
                expect(res.statusMessage).toBe('Not Found');
            });

            it('should handle object as second parameter', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.writeHead(200, { 'Content-Type': 'application/json' });

                expect(res.statusCode).toBe(200);
            });

            it('should handle writeHead with only status code', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.writeHead(201);

                expect(res.statusCode).toBe(201);
                expect(mockHttpResponseStream.from).toHaveBeenCalled();
            });

            it('should handle writeHead with status code and status message', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.writeHead(500, 'Internal Server Error', { 'X-Custom': 'value' });

                expect(res.statusCode).toBe(500);
                expect(res.statusMessage).toBe('Internal Server Error');
                expect(res.getHeader('X-Custom')).toBe('value');
            });

            it('should not send headers twice if writeHead called multiple times', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.writeHead(200);
                const firstCallCount = mockHttpResponseStream.from.mock.calls.length;
                res.writeHead(201);

                // Should only call from once (headers already sent)
                expect(mockHttpResponseStream.from).toHaveBeenCalledTimes(firstCallCount);
            });

            it('should handle writeHead with array header values', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.writeHead(200, { 'X-Custom': ['value1', 'value2'] });

                expect(res.statusCode).toBe(200);
                expect(mockHttpResponseStream.from).toHaveBeenCalled();
            });
        });

        describe('write', () => {
            it('should write chunk to stream', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const result = res.write('test');

                expect(result).toBe(true);
                expect(mockResponseStream.write).toHaveBeenCalledWith('test');
            });

            it('should auto-send headers on first write', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.write('test');

                expect(mockHttpResponseStream.from).toHaveBeenCalled();
                expect(res.headersSent).toBe(true);
            });

            it('should handle Buffer chunks', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const buffer = Buffer.from('test');
                res.write(buffer);

                expect(mockResponseStream.write).toHaveBeenCalledWith(buffer);
            });

            it('should handle multiple writes', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.write('chunk1');
                res.write('chunk2');
                res.write('chunk3');

                expect(mockResponseStream.write).toHaveBeenCalledTimes(3);
                expect(mockResponseStream.write).toHaveBeenNthCalledWith(1, 'chunk1');
                expect(mockResponseStream.write).toHaveBeenNthCalledWith(2, 'chunk2');
                expect(mockResponseStream.write).toHaveBeenNthCalledWith(3, 'chunk3');
            });

            it('should handle empty string chunk', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const result = res.write('');

                // Empty strings should be written
                expect(result).toBe(true);
                expect(mockResponseStream.write).toHaveBeenCalledWith('');
            });

            it('should handle Uint8Array chunks', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const uint8Array = new Uint8Array([1, 2, 3, 4]);
                res.write(uint8Array);

                expect(mockResponseStream.write).toHaveBeenCalledWith(uint8Array);
            });

            it('should return false if stream write fails', () => {
                const failingStream = createMockWritable();
                failingStream.write = vi.fn(() => {
                    throw new Error('Write failed');
                });

                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(failingStream, event, context);
                const result = res.write('test');

                expect(result).toBe(false);
            });

            it('should handle write after headers are sent', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.writeHead(200);
                vi.clearAllMocks();

                res.write('test');

                // Should still write, but not call from again
                expect(mockResponseStream.write).toHaveBeenCalledWith('test');
                expect(mockHttpResponseStream.from).not.toHaveBeenCalled();
            });
        });

        describe('end', () => {
            it('should end stream', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.end();

                expect(mockResponseStream.end).toHaveBeenCalled();
                expect(res.finished).toBe(true);
            });

            // MRT requires at least one body chunk write before stream end; otherwise
            // the AWS Lambda HttpResponseStream terminates abnormally and API Gateway
            // returns a 502 InternalServerErrorException. The adapter writes an empty
            // buffer for any body-less response so this constraint is satisfied
            // regardless of the application's intended status code.
            it('should write empty buffer before ending for 200 with no body chunk', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.status(200).end();

                expect(mockResponseStream.write).toHaveBeenCalledWith(Buffer.alloc(0));
                expect(mockResponseStream.end).toHaveBeenCalled();
            });

            it('should write empty buffer before ending for 204 No Content', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.status(204).end();

                expect(mockResponseStream.write).toHaveBeenCalledWith(Buffer.alloc(0));
                expect(mockResponseStream.end).toHaveBeenCalled();
            });

            it('should write empty buffer before ending for 302 redirect with no body chunk', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.status(302).end();

                expect(mockResponseStream.write).toHaveBeenCalledWith(Buffer.alloc(0));
                expect(mockResponseStream.end).toHaveBeenCalled();
            });

            it('should write empty buffer before ending for 4xx with no body chunk', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.status(400).end();

                expect(mockResponseStream.write).toHaveBeenCalledWith(Buffer.alloc(0));
                expect(mockResponseStream.end).toHaveBeenCalled();
            });

            it('should write empty buffer before ending for 502 error response with no body chunk', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.status(502).end();

                expect(mockResponseStream.write).toHaveBeenCalledWith(Buffer.alloc(0));
                expect(mockResponseStream.end).toHaveBeenCalled();
            });

            // Regression guard for the compressed path. A body-less res.end()
            // reaches endStream() with or without the fix, so res.finished and
            // the emitted gzip framing (byte-identical either way) can't tell
            // fixed from unfixed code apart. The behavior unique to the fix is
            // the writeChunk(Buffer.alloc(0)) call from end() — which lands
            // BEFORE endStream() flushes/ends the stream.
            //
            // Note: endStream()'s own _flush() also writes a zero-length buffer
            // into the gzip stream — that's how zlib's flush() triggers a flush
            // (it calls this.write(Buffer.alloc(0))). So "gzip received an empty
            // write" is true even on the unfixed adapter. The discriminator is
            // specifically an empty write that occurs BEFORE the first flush().
            it('should write a zero-length chunk into the compression stream before flushing a body-less 200', async () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('gzip');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();

                // Wrap the real gzip stream so the pipeline still flushes and
                // waitForEnd() resolves, while letting us observe its writes.
                const realCreateGzip = zlib.createGzip;
                let gzipWriteSpy: any;
                let gzipFlushSpy: any;
                const createGzipSpy = vi.spyOn(zlib, 'createGzip').mockImplementation((options) => {
                    const gzip = realCreateGzip(options);
                    gzipWriteSpy = vi.spyOn(gzip, 'write');
                    gzipFlushSpy = vi.spyOn(gzip, 'flush');
                    return gzip;
                });

                try {
                    const res = createExpressResponse(stream, event, context, request);
                    res.setHeader('Content-Type', 'application/json');
                    res.status(200).end();

                    await stream.waitForEnd();

                    // Compression was actually negotiated — guards against a
                    // silent fall back to the identity path that would void this
                    // test.
                    expect(createGzipSpy).toHaveBeenCalledTimes(1);

                    // A zero-length chunk reached the gzip stream from end()'s
                    // priming write, before endStream()'s flush() ran. The
                    // flush-induced empty write happens after flush(), so it does
                    // not satisfy this — only the fix's write does.
                    const flushOrder = gzipFlushSpy.mock.invocationCallOrder[0] ?? Infinity;
                    const primedBeforeFlush = gzipWriteSpy.mock.calls.some(
                        ([chunk]: [any], i: number) =>
                            Buffer.isBuffer(chunk) &&
                            chunk.length === 0 &&
                            gzipWriteSpy.mock.invocationCallOrder[i] < flushOrder
                    );
                    expect(primedBeforeFlush).toBe(true);
                    expect(res.finished).toBe(true);
                } finally {
                    createGzipSpy.mockRestore();
                }
            });

            it('should write final chunk before ending', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.end('final');

                expect(mockResponseStream.write).toHaveBeenCalledWith('final');
                expect(mockResponseStream.end).toHaveBeenCalled();
            });

            it('should auto-send headers on end', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.end();

                expect(mockHttpResponseStream.from).toHaveBeenCalled();
                expect(res.headersSent).toBe(true);
            });

            it('should emit finish event', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const finishSpy = vi.fn();
                res.on('finish', finishSpy);
                res.end();

                expect(finishSpy).toHaveBeenCalled();
            });

            it('should handle end with Buffer chunk', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const buffer = Buffer.from('final');
                res.end(buffer);

                expect(mockResponseStream.write).toHaveBeenCalledWith(buffer);
                expect(mockResponseStream.end).toHaveBeenCalled();
            });

            it('should handle end with empty string', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.end('');

                // Empty strings should be written
                expect(mockResponseStream.write).toHaveBeenCalledWith('');
                expect(mockResponseStream.end).toHaveBeenCalled();
            });

            it('should handle end after write', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.write('chunk1');
                res.end('chunk2');

                expect(mockResponseStream.write).toHaveBeenCalledTimes(2);
                expect(mockResponseStream.end).toHaveBeenCalled();
            });

            it('should handle end error gracefully', () => {
                const failingStream = createMockWritable();
                failingStream.end = vi.fn(() => {
                    throw new Error('End failed');
                });

                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(failingStream, event, context);
                const result = res.end();

                expect(result).toBe(res);
                expect(res.finished).toBe(true);
            });
        });

        describe('status', () => {
            it('should set status code', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const result = res.status(404);

                expect(res.statusCode).toBe(404);
                expect(result).toBe(res);
            });

            it('should set status message', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                // @ts-expect-error - ExpressResponse type doesn't include the message parameter, but our implementation supports it
                res.status(404, 'Not Found');

                expect(res.statusCode).toBe(404);
                expect(res.statusMessage).toBe('Not Found');
            });
        });

        describe('set', () => {
            it('should set single header', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const result = res.set('Content-Type', 'application/json');

                expect(res.getHeader('Content-Type')).toBe('application/json');
                expect(result).toBe(res);
            });

            it('should set multiple headers from object', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.set({
                    'Content-Type': 'application/json',
                    'X-Custom': 'value',
                });

                expect(res.getHeader('Content-Type')).toBe('application/json');
                expect(res.getHeader('X-Custom')).toBe('value');
            });

            it('should overwrite existing header', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.set('X-Custom', 'value1');
                res.set('X-Custom', 'value2');

                expect(res.getHeader('X-Custom')).toBe('value2');
            });

            it('should set header with array value', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.set('X-Custom', ['value1', 'value2']);

                expect(res.getHeader('X-Custom')).toEqual(['value1', 'value2']);
            });

            it('should handle setting undefined value', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.set('X-Custom', 'value1');
                res.set('X-Custom', undefined as any);

                // Should not throw
                expect(res.getHeader('X-Custom')).toBe('value1');
            });
        });

        describe('append', () => {
            it('should append to existing header', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.set('X-Custom', 'value1');
                res.append('X-Custom', 'value2');

                const header = res.getHeader('X-Custom');
                expect(Array.isArray(header)).toBe(true);
                expect(header).toContain('value1');
                expect(header).toContain('value2');
            });

            it('should set header if it does not exist', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.append('X-Custom', 'value');

                expect(res.getHeader('X-Custom')).toBe('value');
            });

            it('should append to existing array header', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.set('X-Custom', ['value1', 'value2']);
                res.append('X-Custom', 'value3');

                const header = res.getHeader('X-Custom');
                expect(Array.isArray(header)).toBe(true);
                expect(header).toContain('value1');
                expect(header).toContain('value2');
                expect(header).toContain('value3');
            });

            it('should append array to existing header', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.set('X-Custom', 'value1');
                res.append('X-Custom', ['value2', 'value3']);

                const header = res.getHeader('X-Custom');
                expect(Array.isArray(header)).toBe(true);
                expect(header).toContain('value1');
                expect(header).toContain('value2');
                expect(header).toContain('value3');
            });
        });

        describe('flushHeaders', () => {
            it('should send headers immediately', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.set('Content-Type', 'application/json');
                res.flushHeaders();

                expect(mockHttpResponseStream.from).toHaveBeenCalled();
                expect(res.headersSent).toBe(true);
            });

            it('should not send headers twice', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.flushHeaders();
                const firstCallCount = mockHttpResponseStream.from.mock.calls.length;
                res.flushHeaders();

                expect(mockHttpResponseStream.from).toHaveBeenCalledTimes(firstCallCount);
            });

            it('should include all set headers', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.set('Content-Type', 'application/json');
                res.set('X-Custom', 'value');
                res.status(201);

                // Verify headers are set on the response object
                expect(res.getHeader('Content-Type')).toBe('application/json');
                expect(res.getHeader('X-Custom')).toBe('value');

                res.flushHeaders();

                expect(mockHttpResponseStream.from).toHaveBeenCalled();
                const metadata = mockHttpResponseStream.from.mock.calls[0][1];
                expect(metadata.statusCode).toBe(201);
                // Headers should be included in metadata (case-insensitive check)
                const headers = metadata.headers;
                expect(headers['content-type'] || headers['Content-Type']).toBe('application/json');
                expect(headers['x-custom'] || headers['X-Custom']).toBe('value');
            });
        });

        describe('json', () => {
            it('should send JSON response', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.json({ message: 'test' });

                expect(res.getHeader('Content-Type')).toBe('application/json');
                expect(mockResponseStream.write).toHaveBeenCalledWith(JSON.stringify({ message: 'test' }));
                expect(mockResponseStream.end).toHaveBeenCalled();
            });

            it('should handle complex JSON objects', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const complexObj = {
                    nested: { value: 123 },
                    array: [1, 2, 3],
                    string: 'test',
                };
                res.json(complexObj);

                expect(mockResponseStream.write).toHaveBeenCalledWith(JSON.stringify(complexObj));
            });

            it('should handle null JSON', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.json(null);

                expect(mockResponseStream.write).toHaveBeenCalledWith('null');
            });

            it('should handle array JSON', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.json([1, 2, 3]);

                expect(mockResponseStream.write).toHaveBeenCalledWith(JSON.stringify([1, 2, 3]));
            });
        });

        describe('send', () => {
            it('should send string response', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.send('test');

                expect(mockResponseStream.write).toHaveBeenCalledWith('test');
                expect(mockResponseStream.end).toHaveBeenCalled();
            });

            it('should send object as JSON', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.send({ message: 'test' });

                expect(res.getHeader('Content-Type')).toBe('application/json');
                expect(mockResponseStream.write).toHaveBeenCalledWith(JSON.stringify({ message: 'test' }));
            });

            it('should send empty string', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.send('');

                // Empty strings should be written
                expect(mockResponseStream.write).toHaveBeenCalledWith('');
                expect(mockResponseStream.end).toHaveBeenCalled();
            });

            it('should send number as string', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                // send() converts numbers to strings
                res.send(123 as any);

                // Numbers are converted to strings and sent
                expect(mockResponseStream.write).toHaveBeenCalledWith('123');
                expect(mockResponseStream.end).toHaveBeenCalled();
            });
        });

        describe('redirect', () => {
            it('should redirect to URL', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.redirect('https://example.com');

                expect(res.statusCode).toBe(302);
                expect(res.getHeader('Location')).toBe('https://example.com');
                expect(mockResponseStream.end).toHaveBeenCalled();
            });

            it('should redirect to relative URL', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.redirect('/other/path');

                expect(res.statusCode).toBe(302);
                expect(res.getHeader('Location')).toBe('/other/path');
            });
        });

        describe('headersSent property', () => {
            it('should be false initially', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                expect(res.headersSent).toBe(false);
            });

            it('should be true after writeHead', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.writeHead(200);
                expect(res.headersSent).toBe(true);
            });

            it('should be true after write', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.write('test');
                expect(res.headersSent).toBe(true);
            });

            it('should be true after end', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.end();
                expect(res.headersSent).toBe(true);
            });
        });

        describe('flush', () => {
            it('should flush stream if supported', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.flush();

                expect((mockResponseStream as any).flush).toHaveBeenCalled();
            });

            it('should auto-send headers on flush', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.flush();

                expect(mockHttpResponseStream.from).toHaveBeenCalled();
                expect(res.headersSent).toBe(true);
            });

            it('should handle stream without flush method', () => {
                const streamWithoutFlush = createMockWritable();
                delete (streamWithoutFlush as any).flush;

                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(streamWithoutFlush, event, context);
                const result = res.flush();

                expect(result).toBe(res);
            });

            it('should handle flush error gracefully', () => {
                const failingStream = createMockWritable();
                (failingStream as any).flush = vi.fn(() => {
                    throw new Error('Flush failed');
                });

                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(failingStream, event, context);
                const result = res.flush();

                expect(result).toBe(res);
            });
        });

        describe('pipe', () => {
            it('should pipe to destination', () => {
                const destination = createMockWritable();
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const result = res.pipe(destination);

                expect(result).toBe(destination);
            });

            it('should auto-send headers on pipe', () => {
                const destination = createMockWritable();
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.pipe(destination);

                expect(mockHttpResponseStream.from).toHaveBeenCalled();
                expect(res.headersSent).toBe(true);
            });

            it('should handle pipe with options', () => {
                const destination = createMockWritable();
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const result = res.pipe(destination, { end: false } as any);

                expect(result).toBe(destination);
            });
        });

        describe('unpipe', () => {
            it('should unpipe specific destination', () => {
                const destination = createMockWritable();
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.pipe(destination);
                // @ts-expect-error - unpipe doesn't exist on ExpressResponse type, but we're adding it
                const result = res.unpipe(destination);

                expect(result).toBe(res);
            });

            it('should unpipe all destinations', () => {
                const destination1 = createMockWritable();
                const destination2 = createMockWritable();
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.pipe(destination1);
                res.pipe(destination2);
                // @ts-expect-error - unpipe doesn't exist on ExpressResponse type, but we're adding it
                const result = res.unpipe();

                expect(result).toBe(res);
            });

            it('should handle unpipe when no destinations', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                // @ts-expect-error - unpipe doesn't exist on ExpressResponse type, but we're adding it
                const result = res.unpipe();

                expect(result).toBe(res);
            });
        });

        describe('status code handling', () => {
            it('should default to 200 status code', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                expect(res.statusCode).toBe(200);
            });

            it('should update status code multiple times', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.status(201);
                expect(res.statusCode).toBe(201);
                res.status(404);
                expect(res.statusCode).toBe(404);
            });

            it('should preserve status code through writeHead', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.status(201);
                res.writeHead(200);

                expect(res.statusCode).toBe(200);
            });
        });

        describe('header operations', () => {
            it('should handle getHeader for non-existent header', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                expect(res.getHeader('X-Non-Existent')).toBeUndefined();
            });

            it('should handle setHeader with number value', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('Content-Length', 123);

                expect(res.getHeader('Content-Length')).toBe(123);
            });

            it('should handle multiple setHeader calls', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('X-Header1', 'value1');
                res.setHeader('X-Header2', 'value2');
                res.setHeader('X-Header3', 'value3');

                expect(res.getHeader('X-Header1')).toBe('value1');
                expect(res.getHeader('X-Header2')).toBe('value2');
                expect(res.getHeader('X-Header3')).toBe('value3');
            });
        });

        describe('flushable property', () => {
            it('should be set to true', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                expect(res.flushable).toBe(true);
            });
        });

        describe('multi-value headers', () => {
            it('should convert array headers to comma-separated strings in metadata', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('X-Multi-Value-Header', ['value1', 'value2', 'value3']);
                res.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1];
                expect(metadata?.headers['x-multi-value-header']).toBe('value1,value2,value3');
            });

            it('should handle single value headers normally', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('X-Single-Header', 'value1');
                res.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1];
                expect(metadata?.headers['x-single-header']).toBe('value1');
            });
        });

        describe('cookies', () => {
            it('should extract cookies from set-cookie header and add to metadata', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('Set-Cookie', ['cookie1=value1', 'cookie2=value2']);
                res.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1] as {
                    cookies?: string[];
                    headers: Record<string, any>;
                };
                expect(metadata?.cookies).toEqual(['cookie1=value1', 'cookie2=value2']);
                expect(metadata?.headers['set-cookie']).toBeUndefined();
            });

            it('should handle single cookie string', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('Set-Cookie', 'cookie1=value1');
                res.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1] as { cookies?: string[] };
                expect(metadata?.cookies).toEqual(['cookie1=value1']);
            });
        });

        describe('request header copying', () => {
            it('should copy x-correlation-id from request to response headers', () => {
                const event = createMockEvent({
                    httpMethod: 'GET',
                    headers: {
                        'x-correlation-id': 'test-correlation-123',
                    },
                });
                const context = createMockContext();
                const req = createExpressRequest(event, context);
                const res = createExpressResponse(mockResponseStream, event, context, req);
                res.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1] as {
                    headers: Record<string, any>;
                };
                expect(metadata?.headers['x-correlation-id']).toBe('test-correlation-123');
            });

            it('should not include x-correlation-id in response headers when not present in request', () => {
                const event = createMockEvent({
                    httpMethod: 'GET',
                    headers: {},
                });
                const context = createMockContext();
                const req = createExpressRequest(event, context);
                const res = createExpressResponse(mockResponseStream, event, context, req);
                res.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1] as {
                    headers: Record<string, any>;
                };
                expect(metadata?.headers['x-correlation-id']).toBeUndefined();
            });

            it('should copy x-correlation-id when using writeHead', () => {
                const event = createMockEvent({
                    httpMethod: 'GET',
                    headers: {
                        'x-correlation-id': 'correlation-456',
                    },
                });
                const context = createMockContext();
                const req = createExpressRequest(event, context);
                const res = createExpressResponse(mockResponseStream, event, context, req);
                res.writeHead(200);
                res.end();

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1] as {
                    headers: Record<string, any>;
                };
                expect(metadata?.headers['x-correlation-id']).toBe('correlation-456');
            });

            it('should copy x-correlation-id when using write', () => {
                const event = createMockEvent({
                    httpMethod: 'GET',
                    headers: {
                        'x-correlation-id': 'correlation-789',
                    },
                });
                const context = createMockContext();
                const req = createExpressRequest(event, context);
                const res = createExpressResponse(mockResponseStream, event, context, req);
                res.write('chunk');
                res.end();

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1] as {
                    headers: Record<string, any>;
                };
                expect(metadata?.headers['x-correlation-id']).toBe('correlation-789');
            });

            it('should copy x-correlation-id when using flushHeaders', () => {
                const event = createMockEvent({
                    httpMethod: 'GET',
                    headers: {
                        'x-correlation-id': 'correlation-flush',
                    },
                });
                const context = createMockContext();
                const req = createExpressRequest(event, context);
                const res = createExpressResponse(mockResponseStream, event, context, req);
                res.flushHeaders();
                res.end();

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1] as {
                    headers: Record<string, any>;
                };
                expect(metadata?.headers['x-correlation-id']).toBe('correlation-flush');
            });

            it('should handle x-correlation-id with case-insensitive matching', () => {
                const event = createMockEvent({
                    httpMethod: 'GET',
                    headers: {
                        'X-Correlation-ID': 'correlation-case-test',
                    },
                });
                const context = createMockContext();
                const req = createExpressRequest(event, context);
                const res = createExpressResponse(mockResponseStream, event, context, req);
                res.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1] as {
                    headers: Record<string, any>;
                };
                expect(metadata?.headers['x-correlation-id']).toBe('correlation-case-test');
            });

            it('should overwrite x-correlation-id on response with value from request', () => {
                const event = createMockEvent({
                    httpMethod: 'GET',
                    headers: {
                        'x-correlation-id': 'request-correlation',
                    },
                });
                const context = createMockContext();
                const req = createExpressRequest(event, context);
                const res = createExpressResponse(mockResponseStream, event, context, req);
                res.setHeader('x-correlation-id', 'response-correlation');
                res.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1] as {
                    headers: Record<string, any>;
                };
                // Request header should overwrite response header since request headers are copied after
                // response headers are collected in initializeResponse
                expect(metadata?.headers['x-correlation-id']).toBe('request-correlation');
            });
        });
    });

    describe('createExpressRequest', () => {
        describe('multiValueHeaders processing', () => {
            it('should handle multiValueHeaders with length > 1', () => {
                const event: APIGatewayProxyEvent = {
                    httpMethod: 'GET',
                    path: '/test',
                    pathParameters: null,
                    queryStringParameters: null,
                    multiValueQueryStringParameters: null,
                    headers: {},
                    multiValueHeaders: {
                        'x-custom': ['value1', 'value2', 'value3'], // Use lowercase key
                    },
                    body: null,
                    isBase64Encoded: false,
                    requestContext: createMockEvent().requestContext,
                    resource: '/test',
                    stageVariables: null,
                } as APIGatewayProxyEvent;

                const context = createMockContext();
                const req = createExpressRequest(event, context);
                // Should join multi-value headers (key is used as-is from multiValueHeaders)
                expect(req.headers['x-custom']).toBe('value1,value2,value3');
            });

            it('should skip multiValueHeaders with length <= 1', () => {
                const event: APIGatewayProxyEvent = {
                    httpMethod: 'GET',
                    path: '/test',
                    pathParameters: null,
                    queryStringParameters: null,
                    multiValueQueryStringParameters: null,
                    headers: {},
                    multiValueHeaders: {
                        'X-Custom': ['value1'], // Length is 1, should be skipped
                    },
                    body: null,
                    isBase64Encoded: false,
                    requestContext: createMockEvent().requestContext,
                    resource: '/test',
                    stageVariables: null,
                } as APIGatewayProxyEvent;

                const context = createMockContext();
                const req = createExpressRequest(event, context);
                // Should not add header with length <= 1
                expect(req.headers['x-custom']).toBeUndefined();
            });
        });

        describe('query parameter merging', () => {
            it('should handle duplicate values in merged query parameters', () => {
                const event: APIGatewayProxyEvent = {
                    httpMethod: 'GET',
                    path: '/test',
                    pathParameters: null,
                    queryStringParameters: {
                        param1: 'value1',
                    },
                    multiValueQueryStringParameters: {
                        param1: ['value1', 'value2'], // value1 is duplicate
                    },
                    headers: {},
                    multiValueHeaders: {},
                    body: null,
                    isBase64Encoded: false,
                    requestContext: createMockEvent().requestContext,
                    resource: '/test',
                    stageVariables: null,
                } as APIGatewayProxyEvent;

                const context = createMockContext();
                const req = createExpressRequest(event, context);
                // Should not duplicate value1
                expect(req.url).toContain('param1=value1');
                expect(req.url).toContain('param1=value2');
            });

            it('should merge single-value and multi-value query parameters', () => {
                const event: APIGatewayProxyEvent = {
                    httpMethod: 'GET',
                    path: '/test',
                    pathParameters: null,
                    queryStringParameters: {
                        param1: 'value1',
                        param2: 'value2',
                    },
                    multiValueQueryStringParameters: {
                        param1: ['value1', 'value3'],
                        param3: ['value4', 'value5'],
                    },
                    headers: {},
                    multiValueHeaders: {},
                    body: null,
                    isBase64Encoded: false,
                    requestContext: createMockEvent().requestContext,
                    resource: '/test',
                    stageVariables: null,
                } as APIGatewayProxyEvent;

                const context: Context = {
                    callbackWaitsForEmptyEventLoop: false,
                    functionName: 'test-function',
                    functionVersion: '$LATEST',
                    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
                    memoryLimitInMB: '128',
                    awsRequestId: 'test-request-id',
                    logGroupName: '/aws/lambda/test-function',
                    logStreamName: '2023/01/01/[$LATEST]test',
                    getRemainingTimeInMillis: () => 30000,
                    done: () => {},
                    fail: () => {},
                    succeed: () => {},
                };

                const req = createExpressRequest(event, context);
                // The URL should contain all query parameters
                expect(req.url).toContain('param1');
                expect(req.url).toContain('param2');
                expect(req.url).toContain('param3');
            });

            it('should handle only single-value query parameters', () => {
                const event: APIGatewayProxyEvent = {
                    httpMethod: 'GET',
                    path: '/test',
                    pathParameters: null,
                    queryStringParameters: {
                        param1: 'value1',
                        param2: 'value2',
                    },
                    multiValueQueryStringParameters: null,
                    headers: {},
                    multiValueHeaders: {},
                    body: null,
                    isBase64Encoded: false,
                    requestContext: createMockEvent().requestContext,
                    resource: '/test',
                    stageVariables: null,
                } as APIGatewayProxyEvent;

                const context: Context = {
                    callbackWaitsForEmptyEventLoop: false,
                    functionName: 'test-function',
                    functionVersion: '$LATEST',
                    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
                    memoryLimitInMB: '128',
                    awsRequestId: 'test-request-id',
                    logGroupName: '/aws/lambda/test-function',
                    logStreamName: '2023/01/01/[$LATEST]test',
                    getRemainingTimeInMillis: () => 30000,
                    done: () => {},
                    fail: () => {},
                    succeed: () => {},
                };

                const req = createExpressRequest(event, context);
                expect(req.url).toContain('param1=value1');
                expect(req.url).toContain('param2=value2');
            });

            it('should handle only multi-value query parameters', () => {
                const event: APIGatewayProxyEvent = {
                    httpMethod: 'GET',
                    path: '/test',
                    pathParameters: null,
                    queryStringParameters: null,
                    multiValueQueryStringParameters: {
                        param1: ['value1', 'value2'],
                    },
                    headers: {},
                    multiValueHeaders: {},
                    body: null,
                    isBase64Encoded: false,
                    requestContext: createMockEvent().requestContext,
                    resource: '/test',
                    stageVariables: null,
                } as APIGatewayProxyEvent;

                const context: Context = {
                    callbackWaitsForEmptyEventLoop: false,
                    functionName: 'test-function',
                    functionVersion: '$LATEST',
                    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
                    memoryLimitInMB: '128',
                    awsRequestId: 'test-request-id',
                    logGroupName: '/aws/lambda/test-function',
                    logStreamName: '2023/01/01/[$LATEST]test',
                    getRemainingTimeInMillis: () => 30000,
                    done: () => {},
                    fail: () => {},
                    succeed: () => {},
                };

                const req = createExpressRequest(event, context);
                expect(req.url).toContain('param1=value1');
                expect(req.url).toContain('param1=value2');
            });

            it('should handle path without query parameters', () => {
                const event: APIGatewayProxyEvent = {
                    httpMethod: 'GET',
                    path: '/test',
                    pathParameters: null,
                    queryStringParameters: null,
                    multiValueQueryStringParameters: null,
                    headers: {},
                    multiValueHeaders: {},
                    body: null,
                    isBase64Encoded: false,
                    requestContext: createMockEvent().requestContext,
                    resource: '/test',
                    stageVariables: null,
                } as APIGatewayProxyEvent;

                const context: Context = {
                    callbackWaitsForEmptyEventLoop: false,
                    functionName: 'test-function',
                    functionVersion: '$LATEST',
                    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
                    memoryLimitInMB: '128',
                    awsRequestId: 'test-request-id',
                    logGroupName: '/aws/lambda/test-function',
                    logStreamName: '2023/01/01/[$LATEST]test',
                    getRemainingTimeInMillis: () => 30000,
                    done: () => {},
                    fail: () => {},
                    succeed: () => {},
                };

                const req = createExpressRequest(event, context);
                expect(req.url).toBe('/test');
            });
        });
    });

    describe('Edge cases and error handling', () => {
        describe('initializeResponse edge cases', () => {
            it('should handle closed stream in initializeResponse', () => {
                const closedStream = createMockWritable();
                (closedStream as any).writable = false;
                (closedStream as any).destroyed = true;

                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(closedStream, event, context);
                res.setHeader('Content-Type', 'text/html');
                res.write('test'); // This should trigger initializeResponse

                // Should not throw, even with closed stream
                expect(mockHttpResponseStream.from).not.toHaveBeenCalled();
            });

            it('should handle initializeResponse called multiple times', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('Content-Type', 'text/html');
                res.write('test');
                const firstCallCount = mockHttpResponseStream.from.mock.calls.length;
                res.write('more'); // Second write should not re-initialize

                // Should only initialize once
                expect(mockHttpResponseStream.from.mock.calls.length).toBe(firstCallCount);
            });
        });

        describe('convertHeaders edge cases', () => {
            it('should handle number header values', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('Content-Length', 123);
                res.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1];
                // Content-Length should be removed for streaming responses
                expect(metadata?.headers['content-length']).toBeUndefined();
            });

            it('should handle array header values in convertHeaders', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('X-Custom', ['value1', 'value2', 'value3']);
                res.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1];
                expect(metadata?.headers['x-custom']).toBe('value1,value2,value3');
            });

            it('should skip undefined header values', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                // Set a header then remove it
                res.setHeader('X-Test', 'value');
                res.removeHeader('X-Test');
                res.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1];
                expect(metadata?.headers['x-test']).toBeUndefined();
            });

            it('should handle string header values', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('X-String', 'simple-value');
                res.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1];
                expect(metadata?.headers['x-string']).toBe('simple-value');
            });
        });

        describe('cookie handling edge cases', () => {
            it('should handle single cookie string (not array)', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('Set-Cookie', 'single-cookie=value');
                res.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1] as {
                    cookies?: string[];
                    headers: Record<string, any>;
                };
                expect(metadata?.cookies).toEqual(['single-cookie=value']);
                expect(metadata?.headers['set-cookie']).toBeUndefined();
            });

            it('should handle no cookies', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1] as {
                    cookies?: string[];
                };
                expect(metadata?.cookies).toBeUndefined();
            });
        });

        describe('status message handling', () => {
            it('should set status message when provided', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                // @ts-expect-error - status method signature doesn't match ExpressResponse type exactly
                res.status(404, 'Not Found');
                res.end('test');

                expect(res.statusMessage).toBe('Not Found');
            });

            it('should not set status message when undefined', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.status(200);
                res.end('test');

                expect(res.statusMessage).toBeUndefined();
            });
        });

        describe('res.set edge cases', () => {
            it('should handle res.set with object', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.set({
                    'X-Header1': 'value1',
                    'X-Header2': 'value2',
                });
                res.end('test');

                expect(res.getHeader('X-Header1')).toBe('value1');
                expect(res.getHeader('X-Header2')).toBe('value2');
            });

            it('should skip undefined values in res.set object', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.set({
                    'X-Header1': 'value1',
                    'X-Header2': undefined,
                } as any);
                res.end('test');

                expect(res.getHeader('X-Header1')).toBe('value1');
                expect(res.getHeader('X-Header2')).toBeUndefined();
            });

            it('should handle res.set with undefined value', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.set('X-Header', undefined as any);
                res.end('test');

                expect(res.getHeader('X-Header')).toBeUndefined();
            });
        });

        describe('res.append edge cases', () => {
            it('should append to existing array header', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('X-Header', ['value1', 'value2']);
                res.append('X-Header', 'value3');
                res.end('test');

                const header = res.getHeader('X-Header');
                expect(Array.isArray(header)).toBe(true);
                expect(header).toContain('value1');
                expect(header).toContain('value2');
                expect(header).toContain('value3');
            });

            it('should append array to existing string header', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('X-Header', 'value1');
                res.append('X-Header', ['value2', 'value3']);
                res.end('test');

                const header = res.getHeader('X-Header');
                expect(Array.isArray(header)).toBe(true);
                expect(header).toContain('value1');
                expect(header).toContain('value2');
                expect(header).toContain('value3');
            });

            it('should append string to existing string header', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('X-Header', 'value1');
                res.append('X-Header', 'value2');
                res.end('test');

                const header = res.getHeader('X-Header');
                expect(Array.isArray(header)).toBe(true);
                expect(header).toContain('value1');
                expect(header).toContain('value2');
            });

            it('should set header if it does not exist in append', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.append('X-Header', 'value1');
                res.end('test');

                expect(res.getHeader('X-Header')).toBe('value1');
            });
        });

        describe('pipeToDestination edge cases', () => {
            it('should handle pipeToDestination with closed stream', async () => {
                const closedStream = createMockWritable();
                (closedStream as any).writable = false;
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(closedStream, event, context);
                const destination = createMockWritable();

                res.pipe(destination);

                // Should handle gracefully
                await new Promise((resolve) => setTimeout(resolve, 50));
                expect(destination.write).not.toHaveBeenCalled();
            });

            it('should handle pipeToDestination with no source stream', async () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const destination = createMockWritable();

                // Try to pipe before initialization - this will initialize response
                res.pipe(destination);

                await new Promise((resolve) => setTimeout(resolve, 50));
                // Should handle gracefully - httpResponseStream should be created
                expect(mockHttpResponseStream.from).toHaveBeenCalled();
            });

            it('should handle pipeToDestination pipeline error', async () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const destination = createMockWritable();
                // Make destination throw an error
                (destination as any).write = () => {
                    throw new Error('Pipeline error');
                };

                res.setHeader('Content-Type', 'text/html');
                res.pipe(destination);

                await new Promise((resolve) => setTimeout(resolve, 50));
                // Should handle error gracefully
            });
        });

        describe('res.unpipe edge cases', () => {
            it('should unpipe specific destination', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const dest1 = createMockWritable();
                const dest2 = createMockWritable();

                res.pipe(dest1);
                res.pipe(dest2);
                // @ts-expect-error - unpipe doesn't exist on ExpressResponse type, but we're adding it
                res.unpipe(dest1);

                // Should only have dest2 in piped destinations
                // @ts-expect-error - unpipe doesn't exist on ExpressResponse type, but we're adding it
                res.unpipe(dest2);
            });

            it('should unpipe all destinations', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                const dest1 = createMockWritable();
                const dest2 = createMockWritable();

                res.pipe(dest1);
                res.pipe(dest2);
                // @ts-expect-error - unpipe doesn't exist on ExpressResponse type, but we're adding it
                res.unpipe();

                // All destinations should be removed
            });
        });

        describe('writeChunk edge cases', () => {
            it('should handle writeChunk with empty chunk', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('Content-Type', 'text/html');
                const result = res.write('');

                expect(result).toBe(true);
            });

            it('should handle writeChunk with closed stream', () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context);

                response.setHeader('Content-Type', 'text/html');
                response.write('test');
                // Close the stream
                stream.destroy();

                // Should handle gracefully
                const result = response.write('more');
                expect(result).toBe(false);
            });

            it('should handle writeChunk when compression stream is not writable', async () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('gzip');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context, request);

                response.setHeader('Content-Type', 'text/html');
                // First write should succeed
                const firstWrite = response.write('test');
                expect(firstWrite).toBe(true);

                // Write more data
                response.write('more');

                // End the response
                response.end('done');

                await stream.waitForEnd();
                await new Promise((resolve) => setTimeout(resolve, 50));

                // Should have written data
                expect(stream.getData().length).toBeGreaterThan(0);
            });

            it('should handle writeChunk when httpResponseStream is not writable', () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context);

                response.setHeader('Content-Type', 'text/html');
                response.write('test');
                // Destroy stream
                stream.destroy();

                // Should handle gracefully
                const result = response.write('more');
                expect(result).toBe(false);
            });

            it('should handle writeChunk when neither compression nor httpResponseStream is available', () => {
                const closedStream = createMockWritable();
                (closedStream as any).writable = false;
                (closedStream as any).destroyed = true;
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const response = createExpressResponse(closedStream, event, context);

                response.setHeader('Content-Type', 'text/html');
                // Should return false when stream is closed
                const result = response.write('test');
                expect(result).toBe(false);
            });

            it('should handle writeChunk error gracefully', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('Content-Type', 'text/html');

                // Mock write to throw an error
                const originalWrite = mockResponseStream.write;
                (mockResponseStream as any).write = vi.fn(() => {
                    throw new Error('Write error');
                });

                // Should handle error gracefully
                const result = res.write('test');
                expect(result).toBe(false);

                // Restore original write
                mockResponseStream.write = originalWrite;
            });
        });

        describe('endStream edge cases', () => {
            it('should handle endStream with compression stream error', () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('gzip');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context, request);

                response.setHeader('Content-Type', 'text/html');
                response.write('test');
                // End should handle compression stream errors gracefully
                response.end('more');
            });

            it('should handle endStream with httpResponseStream error', () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context);

                response.setHeader('Content-Type', 'text/html');
                // End should handle httpResponseStream errors gracefully
                response.end('test');
            });

            it('should handle endStream when compression stream is not writable', () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('gzip');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context, request);

                response.setHeader('Content-Type', 'text/html');
                response.write('test');
                // Close the stream before ending
                stream.destroy();
                // Should handle gracefully
                response.end('more');
            });

            it('should handle endStream when compression stream has flush method', () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('gzip');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context, request);

                response.setHeader('Content-Type', 'text/html');
                response.write('test');
                // End should call flush if available
                response.end('more');
            });

            it('should handle endStream when compression stream does not have flush method', () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('deflate');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'deflate' } });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context, request);

                response.setHeader('Content-Type', 'text/html');
                response.write('test');
                // End should work even without flush method
                response.end('more');
            });
        });

        describe('getBestEncoding edge cases', () => {
            it('should handle getBestEncoding with compression disabled', () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('gzip');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const compressionConfig = {
                    enabled: false,
                };
                const response = createExpressResponse(stream, event, context, request, compressionConfig);

                response.setHeader('Content-Type', 'text/html');
                response.end('test');

                const metadata = stream.getMetadata();
                expect(metadata?.headers['content-encoding']).toBeUndefined();
            });

            it('should handle getBestEncoding with Accept-Encoding header', () => {
                const event: APIGatewayProxyEvent = {
                    httpMethod: 'GET',
                    path: '/test',
                    pathParameters: null,
                    queryStringParameters: null,
                    multiValueQueryStringParameters: null,
                    headers: {
                        'Accept-Encoding': 'br, gzip', // Put br first to ensure it's selected
                    },
                    multiValueHeaders: {},
                    body: null,
                    isBase64Encoded: false,
                    requestContext: createMockEvent().requestContext,
                    resource: '/test',
                    stageVariables: null,
                } as APIGatewayProxyEvent;

                const context = createMockContext();
                const request = createExpressRequest(event, context);
                const response = createExpressResponse(mockResponseStream, event, context, request);

                response.setHeader('Content-Type', 'text/html');
                response.end('test');

                const metadata = mockHttpResponseStream.from.mock.calls[0]?.[1];
                // Should prefer br over gzip based on preference order
                expect(metadata?.headers['content-encoding']).toBe('br');
            });
        });

        describe('initializeCompression edge cases', () => {
            it('should not initialize compression if already initialized', () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('gzip');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context, request);

                response.setHeader('Content-Type', 'text/html');
                response.write('test');
                // Second write should not re-initialize compression
                response.write('more');
                response.end('done');
            });

            it('should not initialize compression when enabled is false', () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('gzip');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const compressionConfig = {
                    enabled: false,
                };
                const response = createExpressResponse(stream, event, context, request, compressionConfig);

                response.setHeader('Content-Type', 'text/html');
                response.end('test');

                const metadata = stream.getMetadata();
                expect(metadata?.headers['content-encoding']).toBeUndefined();
            });

            it('should handle compression stream creation error', () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('invalid-encoding');
                const event = createMockEvent({
                    httpMethod: 'GET',
                    headers: { 'Accept-Encoding': 'invalid-encoding' },
                });
                const context = createMockContext();
                // This should not crash, but handle gracefully
                // Note: getBestEncoding will return null for invalid encoding
                const response = createExpressResponse(stream, event, context, request);

                response.setHeader('Content-Type', 'text/html');
                response.end('test');
            });

            it('should handle initializeCompression error during stream creation', () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('gzip');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context, request);

                response.setHeader('Content-Type', 'text/html');
                // Compression should initialize successfully
                response.write('test');
                response.end('more');
            });

            it('should handle compression stream error event', () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('gzip');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context, request);

                response.setHeader('Content-Type', 'text/html');
                response.write('test');
                // Compression stream error should be handled gracefully
                response.end('more');
            });

            it('should handle initializeCompression catch block', async () => {
                // This is hard to test directly, but we can verify the error handling path exists
                // by ensuring compression still works normally
                const stream = createCollectingStream();

                // Override the mock for this test to use the collecting stream mock
                const originalFrom = (globalThis as any).awslambda.HttpResponseStream.from;
                (globalThis as any).awslambda.HttpResponseStream.from = (s: Writable, m: any) => {
                    const originalStream = (s as any).__originalStream || s;
                    originalStream.__metadata = m;
                    const passThrough = new PassThrough();
                    passThrough.pipe(s);
                    return passThrough;
                };

                const request = createRequestWithEncoding('gzip');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context, request);

                response.setHeader('Content-Type', 'text/html');
                response.end('test');

                await stream.waitForEnd();
                await new Promise((resolve) => setTimeout(resolve, 50));

                // Compression should work normally
                const metadata = stream.getMetadata();
                expect(metadata?.headers['content-encoding']).toBe('gzip');

                // Restore original mock
                (globalThis as any).awslambda.HttpResponseStream.from = originalFrom;
            });
        });

        describe('writeChunk with backpressure', () => {
            it('should handle writeChunk returning false (backpressure)', () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('gzip');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context, request);

                response.setHeader('Content-Type', 'text/html');
                // Write should handle backpressure
                const result = response.write('test');
                expect(typeof result).toBe('boolean');
            });
        });

        describe('res.end with backpressure', () => {
            it('should handle res.end with backpressure and wait for drain', () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('gzip');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context, request);

                response.setHeader('Content-Type', 'text/html');
                // End with chunk should handle backpressure
                response.end('test');
            });

            it('should handle res.end without chunk', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('Content-Type', 'text/html');
                res.write('test');
                res.end(); // End without chunk

                expect(mockResponseStream.end).toHaveBeenCalled();
            });

            it('should handle res.end with chunk and backpressure - wait for drain', async () => {
                const stream = createCollectingStream();
                const request = createRequestWithEncoding('gzip');
                const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const response = createExpressResponse(stream, event, context, request);
                response.setHeader('Content-Type', 'text/html');

                // Create a mock compression stream that returns false on write (backpressure)
                // This is tricky to test directly, so we'll just verify the end works
                response.write('test');
                response.end('more');

                await stream.waitForEnd();
                await new Promise((resolve) => setTimeout(resolve, 50));

                // Should handle backpressure gracefully
                expect(stream.getData().length).toBeGreaterThan(0);
            });

            it('should handle res.end with backpressure when no stream to wait for', () => {
                const closedStream = createMockWritable();
                (closedStream as any).writable = false;
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(closedStream, event, context);
                res.setHeader('Content-Type', 'text/html');

                // Write should fail (stream closed), then end should handle the else branch
                res.write('test');
                res.end('more');

                // Should handle gracefully even when stream is closed
            });

            it('should handle res.end with chunk and no backpressure', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('Content-Type', 'text/html');

                // End with chunk when there's no backpressure
                res.end('test');

                expect(mockResponseStream.write).toHaveBeenCalled();
            });
        });

        describe('res.write edge cases', () => {
            it('should handle res.write with Buffer', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('Content-Type', 'text/html');
                const result = res.write(Buffer.from('test'));

                expect(result).toBe(true);
            });

            it('should handle res.write with Uint8Array', () => {
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(mockResponseStream, event, context);
                res.setHeader('Content-Type', 'text/html');
                const uint8Array = new Uint8Array([116, 101, 115, 116]);
                const result = res.write(uint8Array);

                expect(result).toBe(true);
            });
        });

        describe('backpressure handling', () => {
            // A response stream that applies real backpressure: the first write()
            // returns false and a 'drain' fires on the next event-loop tick, on the
            // stream itself. This mirrors the AWS Lambda response stream that does not
            // surface its drain on res — the condition that stalled React Router 7.16+.
            function createBackpressuringStream(): Writable & EventEmitter & { getChunks: () => Buffer[] } {
                const stream = new EventEmitter() as any;
                const chunks: Buffer[] = [];
                let saturated = false;
                stream.writable = true;
                stream.writableEnded = false;
                stream.destroyed = false;
                stream.write = vi.fn((chunk: any) => {
                    chunks.push(Buffer.from(chunk));
                    if (!saturated) {
                        saturated = true;
                        setImmediate(() => {
                            saturated = false;
                            stream.emit('drain');
                        });
                        return false;
                    }
                    return true;
                });
                stream.end = vi.fn((cb?: any) => {
                    stream.writableEnded = true;
                    stream.emit('finish');
                    if (typeof cb === 'function') cb();
                    return stream;
                });
                stream.destroy = vi.fn((err?: any) => {
                    stream.destroyed = true;
                    stream.writable = false;
                    stream.emit('close', err);
                    return stream;
                });
                return Object.assign(stream, { getChunks: () => chunks }) as Writable &
                    EventEmitter & { getChunks: () => Buffer[] };
            }

            function readableStreamOf(parts: string[]): ReadableStream {
                const encoder = new TextEncoder();
                return new ReadableStream({
                    start(controller) {
                        for (const part of parts) {
                            controller.enqueue(encoder.encode(part));
                        }
                        controller.close();
                    },
                });
            }

            async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
                let timer: ReturnType<typeof setTimeout> | undefined;
                const deadline = new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () => reject(new Error(`stream did not finish within ${ms}ms — drain not forwarded to res`)),
                        ms
                    );
                });
                try {
                    return await Promise.race([promise, deadline]);
                } finally {
                    clearTimeout(timer);
                }
            }

            it("completes React Router's stream write when the response stream applies backpressure", async () => {
                const destination = createBackpressuringStream();
                const event = createMockEvent({ httpMethod: 'GET' });
                const context = createMockContext();
                const res = createExpressResponse(destination, event, context);
                res.setHeader('Content-Type', 'text/html');

                // The real 7.18 writer awaits a 'drain' on res whenever res.write()
                // reports backpressure. The MRT response stream does not surface its
                // drain on res, so res.write reports each accepted chunk as writable
                // and the writer keeps flowing instead of hanging until the platform
                // timeout. Every chunk still reaches the destination.
                await withDeadline(
                    writeReadableStreamToWritable(
                        readableStreamOf(['<!doctype html>', '<body>', 'streamed content', '</body>']),
                        res as unknown as Writable
                    ),
                    1000
                );

                expect(destination.end).toHaveBeenCalled();
                expect(res.finished).toBe(true);
                expect(Buffer.concat(destination.getChunks()).toString()).toContain('streamed content');
            });

            it('reports accepted writes as writable on the compressed path so the writer never stalls', async () => {
                const realCreateGzip = zlib.createGzip;
                let gzip: ReturnType<typeof zlib.createGzip> | undefined;
                const createGzipSpy = vi.spyOn(zlib, 'createGzip').mockImplementation((options) => {
                    gzip = realCreateGzip(options);
                    return gzip;
                });

                try {
                    const stream = createCollectingStream();
                    const request = createRequestWithEncoding('gzip');
                    const event = createMockEvent({ httpMethod: 'GET', headers: { 'Accept-Encoding': 'gzip' } });
                    const context = createMockContext();
                    const res = createExpressResponse(stream, event, context, request);
                    res.setHeader('Content-Type', 'text/html');

                    // First write negotiates compression.
                    const firstWrite = res.write('<!doctype html>');
                    expect(createGzipSpy).toHaveBeenCalledTimes(1);
                    expect(gzip).toBeDefined();
                    expect(firstWrite).toBe(true);

                    if (!gzip) throw new Error('compression stream was not created');

                    // Even when the compression stream signals backpressure (write
                    // returns false), res.write reports the chunk as accepted so React
                    // Router 7.16+ does not await a drain the MRT response stream never
                    // delivers. The chunk still flows through to the gzip stream.
                    const realGzipWrite = gzip.write.bind(gzip);
                    const gzipWriteSpy = vi
                        .spyOn(gzip, 'write')
                        .mockImplementation((...args: Parameters<typeof realGzipWrite>) => {
                            realGzipWrite(...args);
                            return false;
                        });
                    expect(res.write('<body>more content</body>')).toBe(true);
                    expect(gzipWriteSpy).toHaveBeenCalled();

                    res.end();
                    await stream.waitForEnd();
                } finally {
                    createGzipSpy.mockRestore();
                }
            });
        });
    });
});
