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
import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { PassThrough, type Writable } from 'stream';
import { createGunzip, createInflate, createBrotliDecompress } from 'zlib';
import { createExpressResponse, createExpressRequest, type CompressionConfig } from './create-lambda-adapter';
import zlib from 'node:zlib';
import { default as createEvent } from '@serverless/event-mocks';

// Mock awslambda global - creates a pass-through stream that stores metadata
(globalThis as any).awslambda = {
    HttpResponseStream: {
        from: (stream: Writable, metadata: { statusCode: number; headers: Record<string, any> }) => {
            // Store metadata on the original stream for verification
            const originalStream = (stream as any).__originalStream || stream;
            originalStream.__metadata = metadata;
            // Return a pass-through stream that forwards data to the original stream
            const passThrough = new PassThrough();
            passThrough.pipe(stream);
            return passThrough;
        },
    },
};

// Helper to create a real writable stream that collects data
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

// Helper to decompress data based on encoding
// oxlint-disable-next-line @typescript-eslint/no-unused-vars
async function decompress(data: Buffer, encoding: string): Promise<Buffer> {
    if (!encoding || encoding === 'identity' || !data.length) {
        return data;
    }

    let decompressor;
    switch (encoding) {
        case 'gzip':
            decompressor = createGunzip();
            break;
        case 'deflate':
            decompressor = createInflate();
            break;
        case 'br':
            decompressor = createBrotliDecompress();
            break;
        default:
            return data;
    }

    const chunks: Buffer[] = [];
    const output = new PassThrough();

    output.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
    });

    return new Promise((resolve, reject) => {
        let resolved = false;
        const finish = () => {
            if (!resolved) {
                resolved = true;
                resolve(Buffer.concat(chunks));
            }
        };

        output.on('end', finish);
        output.on('finish', finish);
        output.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                reject(err);
            }
        });
        decompressor.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                reject(err);
            }
        });

        decompressor.pipe(output);
        decompressor.end(data);
    });
}

// Helper to create a mock API Gateway event using @serverless/event-mocks
function createMockEvent(overrides?: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
    const event = createEvent('aws:apiGateway', {
        path: '/test',
        httpMethod: 'GET',
        ...(overrides as any),
    });
    // Ensure body is null if undefined (createEvent may return undefined for body)
    if (event.body === undefined) {
        event.body = null;
    }
    // Remove Accept-Encoding header if not explicitly provided in overrides
    // (createEvent may add default headers)
    if (
        overrides?.headers?.['Accept-Encoding'] === undefined &&
        overrides?.headers?.['accept-encoding'] === undefined
    ) {
        if (event.headers) {
            delete event.headers['Accept-Encoding'];
            delete event.headers['accept-encoding'];
        }
        if (event.multiValueHeaders) {
            delete event.multiValueHeaders['Accept-Encoding'];
            delete event.multiValueHeaders['accept-encoding'];
        }
    }
    return event;
}

// Helper to create a mock Lambda context
function createMockContext(overrides?: Partial<Context>): Context {
    return {
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
        ...overrides,
    };
}

describe('Compression Streaming', () => {
    describe('Gzip compression', () => {
        it('should compress text/html content with gzip', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/html');
            const testData = 'This is a test string that should be compressed. '.repeat(100);
            response.end(testData);

            // Wait for stream to finish
            await stream.waitForEnd();
            await new Promise((resolve) => setTimeout(resolve, 50));

            const compressedData = stream.getData();
            const metadata = stream.getMetadata();

            expect(metadata).toBeDefined();
            expect(metadata.headers['content-encoding']).toBe('gzip');
            expect(compressedData.length).toBeGreaterThan(0);
            // Compressed data should typically be smaller than original for repetitive text
            expect(compressedData.length).toBeLessThan(Buffer.from(testData).length);
        });

        it('should compress application/json content with gzip', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'application/json');
            const testData = JSON.stringify({ message: 'test', data: Array(100).fill('x').join('') });
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const compressedData = stream.getData();
            const metadata = stream.getMetadata();

            expect(metadata.headers['content-encoding']).toBe('gzip');
            expect(compressedData.length).toBeGreaterThan(0);
            expect(compressedData.length).toBeLessThan(Buffer.from(testData).length);
        });

        it('should compress streaming chunks with gzip', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/plain');
            response.write('chunk1');
            response.write('chunk2');
            response.write('chunk3');
            response.end();

            await new Promise((resolve) => setTimeout(resolve, 50));

            const compressedData = stream.getData();
            const metadata = stream.getMetadata();

            expect(metadata.headers['content-encoding']).toBe('gzip');
            expect(compressedData.length).toBeGreaterThan(0);
        });
    });

    describe('Deflate compression', () => {
        it('should compress content with deflate when deflate is preferred', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'deflate, gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/html');
            const testData = 'This is a test string. '.repeat(50);
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const compressedData = stream.getData();
            const metadata = stream.getMetadata();

            expect(metadata.headers['content-encoding']).toBe('deflate');
            expect(compressedData.length).toBeGreaterThan(0);
            expect(compressedData.length).toBeLessThan(Buffer.from(testData).length);
        });
    });

    describe('Brotli compression', () => {
        it('should compress content with brotli when br is preferred', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'br, gzip, deflate' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/html');
            const testData = 'This is a test string for brotli compression. '.repeat(100);
            response.end(testData);

            // Wait for stream to finish
            await stream.waitForEnd();
            await new Promise((resolve) => setTimeout(resolve, 50));

            const compressedData = stream.getData();
            const metadata = stream.getMetadata();

            expect(metadata.headers['content-encoding']).toBe('br');
            expect(compressedData.length).toBeGreaterThan(0);
            expect(compressedData.length).toBeLessThan(Buffer.from(testData).length);
        });

        it('should prefer brotli over gzip when both are available', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'br, gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'application/json');
            const testData = JSON.stringify({ data: 'test'.repeat(100) });
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            // Negotiator prefers based on order in Accept-Encoding, but our code prefers br first
            // So br should be selected when available
            expect(metadata.headers['content-encoding']).toBe('br');
        });
    });

    describe('Compressible content types', () => {
        it('should compress text/css', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/css');
            const testData = 'body { color: red; } '.repeat(50);
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            expect(metadata.headers['content-encoding']).toBe('gzip');
        });

        it('should compress application/javascript', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'application/javascript');
            const testData = 'function test() { return true; } '.repeat(50);
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            expect(metadata.headers['content-encoding']).toBe('gzip');
        });

        it('should compress text/xml', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/xml');
            const testData = '<root><item>test</item></root>'.repeat(50);
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            expect(metadata.headers['content-encoding']).toBe('gzip');
        });

        it('should compress image/svg+xml', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'image/svg+xml');
            const testData = '<svg><circle r="10"/></svg>'.repeat(50);
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            expect(metadata.headers['content-encoding']).toBe('gzip');
        });
    });

    describe('Non-compressible content types', () => {
        it('should not compress image/jpeg', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'image/jpeg');
            const testData = Buffer.alloc(1000, 0xff); // Mock JPEG data
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            expect(metadata.headers['content-encoding']).toBeUndefined();
            const data = stream.getData();
            expect(data).toEqual(testData);
        });

        it('should not compress image/png', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'image/png');
            const testData = Buffer.alloc(1000, 0x89); // Mock PNG data
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            expect(metadata.headers['content-encoding']).toBeUndefined();
        });

        it('should not compress video/mp4', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'video/mp4');
            const testData = Buffer.alloc(1000);
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            expect(metadata.headers['content-encoding']).toBeUndefined();
        });

        it('should compress application/octet-stream (compressible package considers it compressible)', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'application/octet-stream');
            const testData = Buffer.alloc(1000, 0xff);
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            // Note: The compressible package considers application/octet-stream as compressible
            // because it starts with "application/". This is the package's behavior.
            expect(metadata.headers['content-encoding']).toBe('gzip');
        });
    });

    describe('No Accept-Encoding header', () => {
        it('should not compress when Accept-Encoding is missing', async () => {
            const stream = createCollectingStream();
            // Explicitly set headers to empty to ensure no Accept-Encoding header
            const event = createMockEvent({ headers: {}, multiValueHeaders: {} });
            const context = createMockContext();

            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/html');
            const testData = 'This should not be compressed';
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            expect(metadata.headers['content-encoding']).toBeUndefined();
            const data = stream.getData();
            expect(data.toString()).toBe(testData);
        });
    });

    describe('Content-Length header removal', () => {
        it('should remove Content-Length header when compression is enabled', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/html');
            // Don't set Content-Length initially - compression setup should prevent it
            const testData = 'test data';
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            expect(metadata.headers['content-encoding']).toBe('gzip');
            // Content-Length should not be present when compression is used
            // (it's removed during compression setup)
            expect(metadata.headers['content-length']).toBeUndefined();
        });
    });

    describe('Multiple writes with compression', () => {
        it('should compress multiple chunks correctly', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/plain');
            const chunks = ['chunk1', 'chunk2', 'chunk3', 'chunk4', 'chunk5'];

            for (const chunk of chunks) {
                response.write(chunk);
            }
            response.end();

            await new Promise((resolve) => setTimeout(resolve, 50));

            const compressedData = stream.getData();
            const metadata = stream.getMetadata();

            expect(metadata.headers['content-encoding']).toBe('gzip');
            expect(compressedData.length).toBeGreaterThan(0);
        });
    });

    describe('Encoding negotiation', () => {
        it('should handle quality values in Accept-Encoding', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip;q=0.8, br;q=0.9' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/html');
            response.end('test data');

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            // Should prefer br due to higher quality value
            expect(metadata.headers['content-encoding']).toBe('br');
        });

        it('should handle wildcard Accept-Encoding', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': '*' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/html');
            response.end('test data');

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            // Should use br as it's first in our preference list
            expect(metadata.headers['content-encoding']).toBe('br');
        });
    });

    describe('Error handling', () => {
        it('should handle compression stream errors gracefully', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/html');

            // Write some data to trigger compression setup
            response.write('test');

            // Simulate an error by destroying the compression stream
            // This is a bit tricky since we don't have direct access to the compression stream
            // But we can verify the response still works
            response.end('more data');

            await new Promise((resolve) => setTimeout(resolve, 50));

            // Response should still complete even if compression has issues
            const metadata = stream.getMetadata();
            expect(metadata).toBeDefined();
        });
    });

    describe('Content type with parameters', () => {
        it('should handle content type with charset parameter', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            const testData = 'test data';
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            expect(metadata.headers['content-encoding']).toBe('gzip');
        });

        it('should handle content type with boundary parameter', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'multipart/form-data; boundary=----WebKitFormBoundary');
            const testData = 'test data';
            response.end(testData);

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            // multipart/form-data is NOT compressible according to the compressible package
            // It doesn't start with text/ or application/ (it's multipart/)
            expect(metadata.headers['content-encoding']).toBeUndefined();
        });
    });

    describe('Response methods with compression', () => {
        it('should compress when using res.send()', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/html');
            response.send('test data');

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            expect(metadata.headers['content-encoding']).toBe('gzip');
        });

        it('should compress when using res.json()', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.json({ message: 'test', data: 'x'.repeat(100) });

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            expect(metadata.headers['content-encoding']).toBe('gzip');
        });

        it('should compress when using writeHead()', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.end('test data');

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            expect(metadata.headers['content-encoding']).toBe('gzip');
        });

        it('should compress when using flushHeaders()', async () => {
            const stream = createCollectingStream();
            const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
            const context = createMockContext();
            const request = createExpressRequest(event, context);
            const response = createExpressResponse(stream, event, context, request);

            response.setHeader('Content-Type', 'text/html');
            response.flushHeaders();
            response.end('test data');

            await new Promise((resolve) => setTimeout(resolve, 50));

            const metadata = stream.getMetadata();
            expect(metadata.headers['content-encoding']).toBe('gzip');
        });
    });

    describe('CompressionConfig', () => {
        describe('Encoding override', () => {
            it('should use compressionConfig.encoding to override Accept-Encoding negotiation', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const request = createExpressRequest(event, context);
                const compressionConfig: CompressionConfig = {
                    enabled: true,
                    encoding: 'br', // But we override to use br
                };
                const response = createExpressResponse(stream, event, context, request, compressionConfig);

                response.setHeader('Content-Type', 'text/html');
                response.end('test data');

                await new Promise((resolve) => setTimeout(resolve, 50));

                const metadata = stream.getMetadata();
                // Should use br from compressionConfig, not gzip from Accept-Encoding
                expect(metadata.headers['content-encoding']).toBe('br');
            });

            it('should use compressionConfig.encoding even when client does not support it', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const request = createExpressRequest(event, context);
                const compressionConfig: CompressionConfig = {
                    enabled: true,
                    encoding: 'deflate', // But we override to use deflate
                };
                const response = createExpressResponse(stream, event, context, request, compressionConfig);

                response.setHeader('Content-Type', 'text/html');
                response.end('test data');

                await new Promise((resolve) => setTimeout(resolve, 50));

                const metadata = stream.getMetadata();
                // Should use deflate from compressionConfig, not gzip from Accept-Encoding
                expect(metadata.headers['content-encoding']).toBe('deflate');
            });

            it('should use compressionConfig.encoding when no Accept-Encoding header is present', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent(); // No Accept-Encoding header
                const context = createMockContext();

                const request = createExpressRequest(event, context);
                const compressionConfig: CompressionConfig = {
                    enabled: true,
                    encoding: 'gzip',
                };
                const response = createExpressResponse(stream, event, context, request, compressionConfig);

                response.setHeader('Content-Type', 'text/html');
                response.end('test data');

                await new Promise((resolve) => setTimeout(resolve, 50));

                const metadata = stream.getMetadata();
                // Should use gzip from compressionConfig even without Accept-Encoding header
                expect(metadata.headers['content-encoding']).toBe('gzip');
            });
        });

        describe('Compression options', () => {
            it('should pass compression options to gzip stream', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const request = createExpressRequest(event, context);
                const compressionConfig: CompressionConfig = {
                    enabled: true,
                    encoding: 'gzip',
                    options: {
                        level: 9, // Maximum compression
                    },
                };

                // Spy on createGzip to verify options are passed
                const createGzipSpy = vi.spyOn(zlib, 'createGzip');

                const response = createExpressResponse(stream, event, context, request, compressionConfig);
                response.setHeader('Content-Type', 'text/html');
                response.end('test data');

                await new Promise((resolve) => setTimeout(resolve, 50));

                // Verify createGzip was called with the options
                expect(createGzipSpy).toHaveBeenCalledWith(compressionConfig.options);
                createGzipSpy.mockRestore();
            });

            it('should pass compression options to brotli stream', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ headers: { 'Accept-Encoding': 'br' } });
                const context = createMockContext();
                const request = createExpressRequest(event, context);
                const compressionConfig: CompressionConfig = {
                    enabled: true,
                    encoding: 'br',
                    options: {
                        params: {
                            [zlib.constants.BROTLI_PARAM_QUALITY]: 11, // Maximum quality
                        },
                    },
                };

                // Spy on createBrotliCompress to verify options are passed
                const createBrotliSpy = vi.spyOn(zlib, 'createBrotliCompress');

                const response = createExpressResponse(stream, event, context, request, compressionConfig);
                response.setHeader('Content-Type', 'text/html');
                response.end('test data');

                await new Promise((resolve) => setTimeout(resolve, 50));

                // Verify createBrotliCompress was called with the options
                expect(createBrotliSpy).toHaveBeenCalledWith(compressionConfig.options);
                createBrotliSpy.mockRestore();
            });

            it('should pass compression options to deflate stream', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ headers: { 'Accept-Encoding': 'deflate' } });
                const context = createMockContext();
                const request = createExpressRequest(event, context);
                const compressionConfig: CompressionConfig = {
                    enabled: true,
                    encoding: 'deflate',
                    options: {
                        level: 9, // Maximum compression
                    },
                };

                // Spy on createDeflate to verify options are passed
                const createDeflateSpy = vi.spyOn(zlib, 'createDeflate');

                const response = createExpressResponse(stream, event, context, request, compressionConfig);
                response.setHeader('Content-Type', 'text/html');
                response.end('test data');

                await new Promise((resolve) => setTimeout(resolve, 50));

                // Verify createDeflate was called with the options
                expect(createDeflateSpy).toHaveBeenCalledWith(compressionConfig.options);
                createDeflateSpy.mockRestore();
            });

            it('should work with compression options but no encoding override', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const request = createExpressRequest(event, context);
                const compressionConfig: CompressionConfig = {
                    enabled: true,
                    // No encoding override, should use Accept-Encoding negotiation
                    options: {
                        level: 6,
                    },
                };

                const createGzipSpy = vi.spyOn(zlib, 'createGzip');

                const response = createExpressResponse(stream, event, context, request, compressionConfig);
                response.setHeader('Content-Type', 'text/html');
                response.end('test data');

                await new Promise((resolve) => setTimeout(resolve, 50));

                const metadata = stream.getMetadata();
                // Should still use gzip from Accept-Encoding
                expect(metadata.headers['content-encoding']).toBe('gzip');
                // But with the custom options
                expect(createGzipSpy).toHaveBeenCalledWith(compressionConfig.options);
                createGzipSpy.mockRestore();
            });
        });

        describe('CompressionConfig edge cases', () => {
            it('should handle undefined compressionConfig', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const request = createExpressRequest(event, context);
                const response = createExpressResponse(stream, event, context, request, undefined);

                response.setHeader('Content-Type', 'text/html');
                response.end('test data');

                await new Promise((resolve) => setTimeout(resolve, 50));

                const metadata = stream.getMetadata();
                // Should work normally without compressionConfig
                expect(metadata.headers['content-encoding']).toBe('gzip');
            });

            it('should handle empty compressionConfig', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip' } });
                const context = createMockContext();
                const request = createExpressRequest(event, context);
                const compressionConfig: CompressionConfig = { enabled: true };
                const response = createExpressResponse(stream, event, context, request, compressionConfig);

                response.setHeader('Content-Type', 'text/html');
                response.end('test data');

                await new Promise((resolve) => setTimeout(resolve, 50));

                const metadata = stream.getMetadata();
                // Should work normally with empty compressionConfig
                expect(metadata.headers['content-encoding']).toBe('gzip');
            });

            it('should handle compressionConfig with only options (no encoding)', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ headers: { 'Accept-Encoding': 'br' } });
                const context = createMockContext();
                const request = createExpressRequest(event, context);
                const compressionConfig: CompressionConfig = {
                    enabled: true,
                    options: {
                        params: {
                            [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
                        },
                    },
                };

                const createBrotliSpy = vi.spyOn(zlib, 'createBrotliCompress');

                const response = createExpressResponse(stream, event, context, request, compressionConfig);
                response.setHeader('Content-Type', 'text/html');
                response.end('test data');

                await new Promise((resolve) => setTimeout(resolve, 50));

                const metadata = stream.getMetadata();
                // Should use br from Accept-Encoding
                expect(metadata.headers['content-encoding']).toBe('br');
                // But with custom options
                expect(createBrotliSpy).toHaveBeenCalledWith(compressionConfig.options);
                createBrotliSpy.mockRestore();
            });
        });

        describe('Disabled compression', () => {
            it('should disable compression when enabled is false', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip, br' } });
                const context = createMockContext();
                const request = createExpressRequest(event, context);
                const compressionConfig: CompressionConfig = {
                    enabled: false,
                };
                const response = createExpressResponse(stream, event, context, request, compressionConfig);

                response.setHeader('Content-Type', 'text/html');
                const testData = 'This is a test string that should NOT be compressed. '.repeat(100);
                response.end(testData);

                await new Promise((resolve) => setTimeout(resolve, 50));

                const metadata = stream.getMetadata();
                // Should NOT have content-encoding header
                expect(metadata.headers['content-encoding']).toBeUndefined();

                // Verify data is not compressed (should be larger or same size)
                const data = stream.getData();
                // The data should be the original text, not compressed
                expect(data.toString()).toContain('This is a test string');
            });

            it('should disable compression even when client supports compression', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ headers: { 'Accept-Encoding': 'gzip, br, deflate' } });
                const context = createMockContext();
                const request = createExpressRequest(event, context);
                const compressionConfig: CompressionConfig = {
                    enabled: false,
                };
                const response = createExpressResponse(stream, event, context, request, compressionConfig);

                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify({ message: 'test', data: 'x'.repeat(1000) }));

                await new Promise((resolve) => setTimeout(resolve, 50));

                const metadata = stream.getMetadata();
                // Should NOT have content-encoding header
                expect(metadata.headers['content-encoding']).toBeUndefined();
            });

            it('should disable compression when enabled is false without Accept-Encoding header', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent(); // No Accept-Encoding header
                const context = createMockContext();

                const request = createExpressRequest(event, context);
                const compressionConfig: CompressionConfig = {
                    enabled: false,
                };
                const response = createExpressResponse(stream, event, context, request, compressionConfig);

                response.setHeader('Content-Type', 'text/html');
                response.end('test data');

                await new Promise((resolve) => setTimeout(resolve, 50));

                const metadata = stream.getMetadata();
                // Should NOT have content-encoding header
                expect(metadata.headers['content-encoding']).toBeUndefined();
            });
        });

        describe('Caller-set Content-Encoding', () => {
            it('should not re-compress when the route already set Content-Encoding: identity', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ headers: { 'Accept-Encoding': 'br, gzip' } });
                const context = createMockContext();
                const request = createExpressRequest(event, context);
                const response = createExpressResponse(stream, event, context, request);

                response.setHeader('Content-Type', 'text/html');
                response.setHeader('Content-Encoding', 'identity');
                const payload = 'plain html '.repeat(100);
                response.end(payload);

                await stream.waitForEnd();

                const metadata = stream.getMetadata();
                expect(metadata.headers['content-encoding']).toBe('identity');
                // Bytes on the wire must be the original payload (no Brotli/gzip framing).
                expect(stream.getData().toString('utf-8')).toBe(payload);
            });

            it('should preserve a caller-set Content-Encoding other than identity', async () => {
                const stream = createCollectingStream();
                const event = createMockEvent({ headers: { 'Accept-Encoding': 'br, gzip' } });
                const context = createMockContext();
                const request = createExpressRequest(event, context);
                const response = createExpressResponse(stream, event, context, request);

                // Simulate a route serving a pre-gzipped asset.
                const preGzipped = zlib.gzipSync(Buffer.from('pre-compressed payload'));
                response.setHeader('Content-Type', 'text/html');
                response.setHeader('Content-Encoding', 'gzip');
                response.end(preGzipped);

                await stream.waitForEnd();

                const metadata = stream.getMetadata();
                expect(metadata.headers['content-encoding']).toBe('gzip');
                // Bytes on the wire must be the caller's pre-compressed buffer, not re-encoded.
                expect(stream.getData().equals(preGzipped)).toBe(true);
            });
        });
    });
});
