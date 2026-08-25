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
/* oxlint-disable no-console */
import { ServerResponse } from 'http';
import { pipeline } from 'node:stream/promises';
import zlib, {
    type BrotliCompress,
    type Gzip,
    type Deflate,
    type ZstdCompress,
    type ZlibOptions,
    type BrotliOptions,
    type ZstdOptions,
} from 'node:zlib';
import Negotiator from 'negotiator';
import compressible from 'compressible';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import type { Express, Request, Response } from 'express';
import type { Writable } from 'stream';
import { ServerlessRequest } from '@h4ad/serverless-adapter';

/**
 * Header keys to copy from the request to the response.
 * These headers are typically used for tracing, correlation, or other request/response matching purposes.
 */
const REQUEST_HEADERS_TO_COPY = ['x-correlation-id'] as const;

// Node's Brotli default is quality 11, which is optimized for offline compression
// and can consume seconds of Lambda CPU for large streamed HTML responses.
const DEFAULT_BROTLI_QUALITY = 6;
const DEFAULT_BROTLI_FLUSH_THRESHOLD_BYTES = 32 * 1024;

/**
 * Resolves the Brotli compression quality from the MRT_BROTLI_COMPRESSION_QUALITY
 * environment variable, falling back to DEFAULT_BROTLI_QUALITY. Values that are not
 * integers within the valid Brotli quality range (0-11) are ignored.
 *
 * @returns The Brotli quality level to use.
 */
function resolveBrotliQuality(): number {
    const raw = process.env.MRT_BROTLI_COMPRESSION_QUALITY;
    if (raw === undefined || raw.trim() === '') {
        return DEFAULT_BROTLI_QUALITY;
    }

    const parsed = Number(raw);
    if (
        Number.isInteger(parsed) &&
        parsed >= zlib.constants.BROTLI_MIN_QUALITY &&
        parsed <= zlib.constants.BROTLI_MAX_QUALITY
    ) {
        return parsed;
    }

    return DEFAULT_BROTLI_QUALITY;
}

/**
 * Resolves the Brotli flush threshold (in bytes) from the MRT_BROTLI_FLUSH_THRESHOLD_BYTES
 * environment variable, falling back to DEFAULT_BROTLI_FLUSH_THRESHOLD_BYTES.
 * Values that are not positive integers are ignored.
 *
 * @returns The number of uncompressed bytes to buffer before forcing a Brotli flush.
 */
function resolveBrotliFlushThresholdBytes(): number {
    const raw = process.env.MRT_BROTLI_FLUSH_THRESHOLD_BYTES;
    if (raw === undefined || raw.trim() === '') {
        return DEFAULT_BROTLI_FLUSH_THRESHOLD_BYTES;
    }

    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
    }

    return DEFAULT_BROTLI_FLUSH_THRESHOLD_BYTES;
}

/**
 * Resolves whether periodic Brotli flushing ("chunking") is enabled from the
 * MRT_BROTLI_CHUNKING_ENABLED environment variable. Defaults to enabled; set the
 * variable to "false" to disable it and let Brotli buffer output until the response ends.
 *
 * @returns true if periodic Brotli flushing should be performed.
 */
function isBrotliChunkingEnabled(): boolean {
    const raw = process.env.MRT_BROTLI_CHUNKING_ENABLED;
    if (!raw) {
        return true;
    }

    return raw.toLowerCase() !== 'false';
}

// Check if zstd compression is available (Node.js v24.0.0+)
let createZstdCompress: ((options?: ZstdOptions) => ZstdCompress) | undefined;
try {
    // Try to import createZstdCompress - it may not exist in older Node.js versions
    if (typeof zlib.createZstdCompress === 'function') {
        createZstdCompress = zlib.createZstdCompress;
    }
} catch {
    // zstd not available
}

// Declare global awslambda type for AWS Lambda runtime
declare const awslambda: {
    HttpResponseStream: {
        from(
            stream: Writable,
            metadata: {
                statusCode: number;
                headers: Record<string, string | string[] | undefined>;
            }
        ): Writable;
    };
};

interface ExpressRequest extends Request {
    apiGateway?: {
        event: APIGatewayProxyEvent;
        context: Context;
    };
}

interface ExpressResponse extends Response {
    flushable?: boolean;
}

interface StreamMetadata {
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    multiValueHeaders?: Record<string, string[] | undefined>;
    cookies?: string[];
}

type CompressionStream = BrotliCompress | Gzip | Deflate | ZstdCompress;

/**
 * Configuration options for response compression.
 *
 * @property enabled - Whether compression is enabled. Set to false to disable compression entirely.
 *                     Defaults to true (compression enabled).
 * @property encoding - The compression encoding to use ('br', 'zstd', 'gzip', 'deflate').
 *                      If not specified, the best encoding will be negotiated based on Accept-Encoding header.
 * @property options  - Compression library options. This can include any of the options accepted by
 *                      zlib, Brotli, or Zstd, as defined in the zlib library, and will be passed
 *                      directly to the corresponding compression library.
 */
export interface CompressionConfig {
    enabled: boolean;
    encoding?: 'br' | 'zstd' | 'gzip' | 'deflate';
    options?: ZlibOptions | BrotliOptions | ZstdOptions;
}

type AsyncHandlerFunction = (event: APIGatewayProxyEvent, context: Context) => Promise<void>;

/**
 * Creates a Lambda Adapter that wraps an Express app and supports response streaming
 * for API Gateway v1 proxy integration using AWS Lambda response streaming
 *
 * @param app - Express application instance
 * @param responseStream - AWS Lambda response stream
 * @param compressionConfig - Optional compression configuration
 * @returns Lambda handler function
 */
export function createStreamingLambdaAdapter(
    app: Express,
    responseStream: Writable,
    compressionConfig: CompressionConfig = { enabled: true }
): AsyncHandlerFunction {
    const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<void> => {
        try {
            await streamResponse(event, responseStream, context, app, compressionConfig);
        } catch (error) {
            console.error('Error in streaming handler:', error);
            const isStreamOpen =
                responseStream && responseStream.writable && !responseStream.destroyed && !responseStream.writableEnded;

            if (isStreamOpen && typeof responseStream.write === 'function') {
                const errorMessage = error instanceof Error ? error.message : String(error);
                responseStream.write(
                    `HTTP/1.1 500 Internal Server Error\r\n\r\nInternal Server Error: ${errorMessage}`
                );
            } else {
                console.error('[error handler] Cannot write error - stream is closed');
            }
        } finally {
            const isStreamOpen =
                responseStream && responseStream.writable && !responseStream.destroyed && !responseStream.writableEnded;
            if (isStreamOpen && typeof responseStream.end === 'function') {
                responseStream.end();
            }
        }
    };

    return handler;
}

/**
 * Streams the response from Express app using AWS Lambda HttpResponseStream
 */
async function streamResponse(
    event: APIGatewayProxyEvent,
    responseStream: Writable,
    context: Context,
    app: Express,
    compressionConfig?: CompressionConfig
): Promise<void> {
    // Convert API Gateway event to Express-compatible request
    const expressRequest = createExpressRequest(event, context);

    const expressResponse = createExpressResponse(responseStream, event, context, expressRequest, compressionConfig);

    // Process the request through Express app
    return new Promise<void>((resolve, reject) => {
        let resolved = false;
        const resolveOnce = () => {
            if (!resolved) {
                resolved = true;
                resolve();
            }
        };

        const rejectOnce = (err: Error) => {
            if (!resolved) {
                resolved = true;
                reject(err);
            }
        };

        // Handle response finish
        expressResponse.once('finish', () => {
            resolveOnce();
        });

        // Handle response errors
        expressResponse.once('error', (err: Error) => {
            rejectOnce(err);
        });

        try {
            app(expressRequest, expressResponse, (err) => {
                if (err) {
                    console.error('Express app error:', err);
                    rejectOnce(err);
                } else {
                    // If response has finished, resolveOnce will be called by the finish event
                    // Otherwise, resolve after a short delay to allow async operations
                    if (expressResponse.finished) {
                        resolveOnce();
                    } else {
                        // Wait a bit for the response to finish
                        setTimeout(() => {
                            resolveOnce();
                        }, 10);
                    }
                }
            });
        } catch (error) {
            console.error('Error in streamResponse:', error);
            rejectOnce(error as Error);
        }
    });
}

/**
 * Builds a full URL path with query string from API Gateway event
 * Merges multiValueQueryStringParameters and queryStringParameters
 */
const getPathFromEvent = (event: APIGatewayProxyEvent): string => {
    const path = event.path;

    // Start with multi-value query parameters (already arrays), filtering out undefined values
    const mergedParams: Record<string, string[]> = {};
    if (event.multiValueQueryStringParameters) {
        for (const [key, values] of Object.entries(event.multiValueQueryStringParameters)) {
            if (values) {
                mergedParams[key] = [...values];
            }
        }
    }

    // Merge in single-value query parameters, converting to arrays
    if (event.queryStringParameters) {
        for (const [key, value] of Object.entries(event.queryStringParameters)) {
            if (value === undefined) continue;

            // Add to existing array or create new one
            if (mergedParams[key]) {
                if (!mergedParams[key].includes(value)) {
                    mergedParams[key].push(value);
                }
            } else {
                mergedParams[key] = [value];
            }
        }
    }

    // Build query string
    const searchParams = new URLSearchParams();
    for (const [key, values] of Object.entries(mergedParams)) {
        for (const value of values) {
            searchParams.append(key, value);
        }
    }

    const queryString = searchParams.toString();
    return queryString ? `${path}?${queryString}` : path;
};

/**
 * Converts API Gateway event to Express-compatible request object
 * Creates a proper IncomingMessage-like object with stream properties
 */
// oxlint-disable-next-line @typescript-eslint/no-unused-vars
export function createExpressRequest(event: APIGatewayProxyEvent, context: Context): ExpressRequest {
    const { httpMethod, headers, multiValueHeaders, body, isBase64Encoded, requestContext } = event;

    const remoteAddress = requestContext?.identity?.sourceIp ?? undefined;

    const bodyEncoding = isBase64Encoded ? 'base64' : 'utf-8';
    const requestBody: Buffer | undefined = body ? Buffer.from(body, bodyEncoding) : undefined;

    // Normalize headers to lowercase keys for case-insensitive lookup
    const normalizedHeaders: Record<string, string> = {};
    if (headers) {
        for (const [key, value] of Object.entries(headers)) {
            const normalizedKey = key.toLowerCase();
            // If value is an array, take the first one; otherwise use the value
            if (value === undefined) continue;
            normalizedHeaders[normalizedKey] = value;
        }
    }
    for (const multiValueHeaderKey of Object.keys(multiValueHeaders || {})) {
        const value = multiValueHeaders[multiValueHeaderKey];
        if (!value || value.length <= 1) continue;
        normalizedHeaders[multiValueHeaderKey] = value.join(',');
    }

    const request = new ServerlessRequest({
        method: httpMethod,
        url: getPathFromEvent(event),
        headers: normalizedHeaders,
        body: requestBody,
        remoteAddress,
    });

    // Add Express-specific properties that aren't part of IncomingMessage
    // IncomingMessage doesn't have query, params, etc. - these are added by Express
    const req = request as unknown as ExpressRequest;

    // Express-like methods
    Object.defineProperty(req, 'get', {
        value(this: ExpressRequest, headerName: string): string | string[] | undefined {
            return this.headers[headerName.toLowerCase()];
        },
        writable: true,
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(req, 'header', {
        value(this: ExpressRequest, headerName: string): string | string[] | undefined {
            return this.get(headerName);
        },
        writable: true,
        enumerable: true,
        configurable: true,
    });

    return req;
}

/**
 * Checks if a content type is compressible using the compressible package
 *
 * @param contentType - The content type to check (e.g., 'text/html', 'application/json')
 * @returns true if the content type is compressible, false otherwise
 */
function isCompressible(contentType: string | undefined): boolean {
    if (!contentType) {
        return false;
    }

    return !!compressible(contentType);
}

const isNullOrUndefined = (value: unknown): value is null | undefined => value == null;

/**
 * Determines the best encoding based on Accept-Encoding header using the negotiator package
 * Prefers encodings in order: br (brotli), zstd (if available), gzip, deflate
 *
 * @param acceptEncoding - The Accept-Encoding header value from the request
 * @param compressionConfig - Optional compression configuration
 * @returns The best available encoding or null if none are supported
 */
function getBestEncoding(
    acceptEncoding: string | string[] | undefined,
    compressionConfig?: CompressionConfig
): string | null {
    // If compression is explicitly disabled, return null
    if (compressionConfig?.enabled === false) {
        return null;
    }

    // If override encoding is provided, use it regardless of Accept-Encoding header
    if (compressionConfig?.encoding) {
        return compressionConfig.encoding;
    }
    if (!acceptEncoding) {
        return null;
    }
    const negotiator = new Negotiator({ headers: { 'accept-encoding': acceptEncoding } });

    // Build available encodings list based on what's supported
    // Order of preference: br (brotli), zstd (if available), gzip, deflate
    const availableEncodings: string[] = ['br', 'gzip', 'deflate'];
    if (createZstdCompress) {
        availableEncodings.push('zstd');
    }

    const bestEncoding = negotiator.encoding(availableEncodings);

    return bestEncoding || null;
}

/**
 * Creates a compression stream based on the encoding type
 *
 * @param encoding - The encoding type ('br', 'zstd', 'gzip', or 'deflate')
 * @param compressionConfig - The compression configuration options
 * @returns A compression stream (BrotliCompress, ZstdCompress, Gzip, or Deflate)
 * @throws Error if the encoding is not supported
 */
function createCompressionStream(encoding: string, compressionConfig?: CompressionConfig): CompressionStream {
    const options = compressionConfig?.options || undefined;
    switch (encoding) {
        case 'br': {
            const brotliOptions = options as BrotliOptions | undefined;
            const qualityParameter = zlib.constants.BROTLI_PARAM_QUALITY;

            if (brotliOptions?.params?.[qualityParameter] !== undefined) {
                return zlib.createBrotliCompress(brotliOptions);
            }

            return zlib.createBrotliCompress({
                ...brotliOptions,
                params: {
                    ...brotliOptions?.params,
                    [qualityParameter]: resolveBrotliQuality(),
                },
            });
        }
        case 'zstd':
            if (!createZstdCompress) {
                throw new Error('zstd compression is not available in this Node.js version (requires v24.0.0+)');
            }
            return createZstdCompress(options as ZstdOptions);
        case 'gzip':
            return zlib.createGzip(options as ZlibOptions);
        case 'deflate':
            return zlib.createDeflate(options as ZlibOptions);
        default:
            throw new Error(`Unsupported encoding: ${encoding}`);
    }
}

/**
 * Creates Express-compatible response object that properly extends ServerResponse
 *
 * This function creates a response object that:
 * - Supports AWS Lambda response streaming via HttpResponseStream
 * - Automatically compresses responses based on Accept-Encoding header
 * - Uses negotiator to select the best available encoding (br, zstd if available, gzip, deflate)
 * - Uses compressible package to determine if content should be compressed
 *
 * Compression flow:
 * 1. Check Accept-Encoding header and select best encoding
 * 2. Create HttpResponseStream with metadata
 * 3. If compression is applicable, create compression stream and pipe to httpResponseStream
 * 4. Write data to compression stream (or httpResponseStream if no compression)
 * 5. End compression stream, which automatically ends httpResponseStream
 *
 * @param responseStream - The AWS Lambda response stream
 * @param method - The HTTP method (GET, POST, etc.)
 * @param request - Optional Express request object (used to check Accept-Encoding header)
 * @returns Express-compatible response object
 */
export function createExpressResponse(
    responseStream: Writable,
    event: APIGatewayProxyEvent,
    context: Context,
    request?: ExpressRequest,
    compressionConfig?: CompressionConfig
): ExpressResponse {
    const method = event.httpMethod;
    let statusCode = 200;
    let statusMessage: string | undefined = undefined;
    const headers: Record<string, string | string[] | undefined> = {};
    let responseStarted = false;
    let httpResponseStream: Writable | null = null;

    // Determine if compression should be used based on Accept-Encoding header
    const acceptEncoding = request?.get('accept-encoding') || 'identity';
    const selectedEncoding = getBestEncoding(acceptEncoding, compressionConfig) || 'identity';
    let compressionStream: CompressionStream | null = null;
    let shouldCompress = false;
    let compressionInitialized = false;
    let uncompressedBytesSinceBrotliFlush = 0;
    const brotliFlushThresholdBytes = resolveBrotliFlushThresholdBytes();
    const brotliChunkingEnabled = isBrotliChunkingEnabled();

    // Helper function to check if stream is still writable
    const isStreamOpen = (): boolean => {
        const streamToCheck = compressionStream || httpResponseStream || responseStream;
        return streamToCheck && streamToCheck.writable && !streamToCheck.destroyed && !streamToCheck.writableEnded;
    };

    /**
     * Initializes compression stream and pipes it to httpResponseStream
     * This must be called after httpResponseStream is created
     *
     * @param httpResponseStream - The HttpResponseStream to pipe compressed data to
     * @param selectedEncoding - The encoding to use (br, gzip, or deflate)
     */
    const initializeCompression = (): void => {
        if (!httpResponseStream || compressionInitialized || !selectedEncoding) {
            return;
        }

        try {
            // Create compression stream based on selected encoding
            compressionStream = createCompressionStream(selectedEncoding, compressionConfig);

            // Set up error handling for compression stream
            compressionStream.on('error', (error: Error) => {
                console.error('Compression stream error:', error);
                shouldCompress = false;
            });

            // Pipe compression stream to httpResponseStream
            // The { end: true } option ensures httpResponseStream is ended when compressionStream ends
            compressionStream.pipe(httpResponseStream, { end: true });

            shouldCompress = true;
            compressionInitialized = true;
        } catch (error) {
            console.error('Error setting up compression:', error);
            shouldCompress = false;
            compressionStream = null;
        }
    };

    /**
     * Writes a chunk to the appropriate stream (compression stream if enabled, otherwise httpResponseStream)
     *
     * Returns whether the chunk was accepted, NOT the stream's backpressure signal.
     * A backpressured write (write() returning false) has still buffered the chunk —
     * Node's pipe drains it to the response stream on its own. React Router 7.16+
     * treats a falsy res.write() as a cue to await a 'drain' event on res before
     * sending the next chunk; the MRT response stream does not surface drain on res,
     * so reporting backpressure here would stall the whole response until it times
     * out. Reporting "accepted" keeps the writer flowing (the behavior React Router
     * relied on before 7.16) while real flow control stays inside the compression →
     * HttpResponseStream pipe.
     *
     * @param chunk - The data chunk to write
     * @returns true if the chunk was accepted, false if it could not be written
     */
    const writeChunk = (chunk?: string | Buffer | Uint8Array): boolean => {
        // Don't write null, undefined
        if (isNullOrUndefined(chunk) || !isStreamOpen()) {
            return false;
        }

        try {
            if (shouldCompress && compressionStream && compressionStream.writable) {
                // Write to compression stream, which will compress and pipe to httpResponseStream
                compressionStream.write(chunk);
                if (
                    brotliChunkingEnabled &&
                    selectedEncoding === 'br' &&
                    typeof compressionStream.flush === 'function'
                ) {
                    uncompressedBytesSinceBrotliFlush +=
                        typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength;

                    if (uncompressedBytesSinceBrotliFlush >= brotliFlushThresholdBytes) {
                        compressionStream.flush(zlib.constants.BROTLI_OPERATION_FLUSH);
                        uncompressedBytesSinceBrotliFlush = 0;
                    }
                }
            } else if (httpResponseStream && httpResponseStream.writable) {
                // No compression, write directly to httpResponseStream
                httpResponseStream.write(chunk);
            } else {
                return false;
            }
            return true;
        } catch (error) {
            console.error('Error writing chunk:', error);
            return false;
        }
    };

    const isCompressionEnabled = (contentTypeStr: string | undefined, contentEncoding?: string): boolean => {
        const enabled = compressionConfig?.enabled ?? true;
        // If the route already declared its own Content-Encoding (e.g. `identity` to opt
        // out of runtime compression, or a pre-compressed asset like `gzip`), don't
        // re-encode — that would double-compress or break the negotiated semantics.
        if (contentEncoding) return false;
        return !!(selectedEncoding && selectedEncoding !== 'identity' && isCompressible(contentTypeStr) && enabled);
    };

    const getContentType = (response: ExpressResponse): string | undefined => {
        const contentType = response.getHeader('content-type');
        if (Array.isArray(contentType)) {
            return contentType.join(',');
        } else if (typeof contentType === 'number') {
            return String(contentType);
        }
        return contentType;
    };

    const getContentEncoding = (response: ExpressResponse): string | undefined => {
        const value = response.getHeader('content-encoding');
        if (Array.isArray(value)) return value.join(',');
        if (typeof value === 'number') return String(value);
        return value;
    };

    /**
     * Initializes the response by:
     * 1. Collecting headers
     * 2. Determining if compression should be used
     * 3. Creating HttpResponseStream with metadata
     * 4. Setting up compression stream if needed
     *
     * This must be called before any data is written to the response.
     *
     * @param response - The Express response object
     */
    const initializeResponse = (response: ExpressResponse): void => {
        if (responseStarted) {
            return;
        }

        if (!isStreamOpen()) {
            console.error('Cannot initialize response - stream is closed');
            return;
        }

        // Collect all current headers from the response
        const currentHeaders = response.getHeaders();
        Object.assign(headers, currentHeaders);

        for (const header of REQUEST_HEADERS_TO_COPY) {
            const value = request?.get(header);
            if (value) {
                headers[header] = value;
            }
        }

        const contentType = getContentType(response);
        const existingContentEncoding = getContentEncoding(response);

        if (isCompressionEnabled(contentType, existingContentEncoding)) {
            headers['content-encoding'] = selectedEncoding;
            response.setHeader('Content-Encoding', selectedEncoding);
        }
        // Remove Content-Length header when compression is enabled since the length will change
        delete headers['content-length'];
        response.removeHeader('content-length');

        // Create HttpResponseStream with metadata
        // This writes the HTTP status and headers to the stream
        const metadata: StreamMetadata = {
            statusCode,
            headers,
        };

        const cookies = metadata.headers['set-cookie'];
        if (cookies) {
            metadata.cookies = Array.isArray(cookies) ? cookies : [cookies];
            delete metadata.headers['set-cookie'];
        }
        metadata.headers = convertHeaders(metadata.headers);

        httpResponseStream = awslambda.HttpResponseStream.from(responseStream, metadata);

        // Set up compression stream if compression is enabled
        // The compression stream pipes to httpResponseStream, which pipes to responseStream
        // 'identity' means no encoding, so we should not initialize compression for it
        if (isCompressionEnabled(contentType, existingContentEncoding)) {
            initializeCompression();
        }

        responseStarted = true;
    };

    // Helper function to convert headers to the expected format
    const convertHeaders = (
        headersToConvert: Record<string, string | string[] | number | undefined>
    ): Record<string, string | string[] | undefined> => {
        const converted: Record<string, string> = {};
        for (const [key, value] of Object.entries(headersToConvert)) {
            if (value !== undefined) {
                if (Array.isArray(value)) {
                    converted[key] = value.join(',');
                } else if (typeof value === 'number') {
                    converted[key] = String(value);
                } else {
                    converted[key] = value;
                }
            }
        }
        return converted;
    };

    /**
     * Pipes data from the compression stream (if enabled) or httpResponseStream to a destination
     * Note: This is a simplified implementation for API compatibility
     *
     * @param destination - The destination stream to pipe to
     * @returns true if the pipe operation was successful, false otherwise
     */
    const pipeToDestination = async (destination: Writable): Promise<boolean> => {
        if (!isStreamOpen()) {
            console.error('[pipeToDestination] Cannot pipe - stream is closed');
            return false;
        }

        // Note: pipeToDestination is called from res.pipe() which already calls initializeResponse
        // So compression should already be initialized if needed
        try {
            // Pipe from compression stream if available, otherwise from httpResponseStream
            const sourceStream = compressionStream || httpResponseStream;
            if (!sourceStream) {
                console.error('[pipeToDestination] No source stream available');
                return false;
            }

            // @ts-expect-error - Pipeline expects Readable, but compression streams are Transform streams
            await pipeline(sourceStream, destination);
            return true;
        } catch (error) {
            console.error('[pipeToDestination] Pipeline error:', error);
            return false;
        }
    };

    // @ts-expect-error - ServerResponse constructor expects IncomingMessage, but we're creating a minimal mock
    const res = new ServerResponse({
        method,
    }) as ExpressResponse;

    // Override statusMessage property to track custom status messages
    Object.defineProperty(res, 'statusMessage', {
        get() {
            return statusMessage;
        },
        set(value: string) {
            statusMessage = value;
        },
        enumerable: true,
        configurable: true,
    });

    // Override headersSent property to track when headers are sent
    // This is readonly in the parent class, so we override it to be writable
    Object.defineProperty(res, 'headersSent', {
        get() {
            return responseStarted;
        },
        enumerable: true,
        configurable: true,
    });

    // Override the core streaming methods to work with AWS Lambda Response Streaming
    // @ts-expect-error - Type signature doesn't match ServerResponse.writeHead exactly, but our implementation is compatible
    res.writeHead = function (
        code: number,
        reasonPhrase?: string | Record<string, string | string[] | undefined>,
        headerObj?: Record<string, string | string[] | undefined>
    ) {
        if (typeof reasonPhrase === 'object') {
            headerObj = reasonPhrase;
            reasonPhrase = undefined;
        }

        statusCode = code || statusCode;
        this.statusCode = statusCode;

        // Set statusMessage if provided
        if (reasonPhrase) {
            statusMessage = reasonPhrase;
        }

        if (headerObj) {
            Object.assign(headers, headerObj);
            for (const [key, value] of Object.entries(headerObj)) {
                if (value !== undefined) {
                    this.setHeader(key, value);
                }
            }
        }

        // Collect all current headers
        const currentHeaders = this.getHeaders();
        Object.assign(headers, currentHeaders);

        initializeResponse(this);

        return this;
    };

    res.write = function (chunk: string | Buffer | Uint8Array): boolean {
        if (!isStreamOpen()) {
            console.error(`Cannot write - stream is closed`);
            return false;
        }

        initializeResponse(this);

        if (!isNullOrUndefined(chunk)) {
            return writeChunk(chunk);
        }
        return true; // ServerResponse.write returns boolean
    };

    const _flush = () => {
        if (
            shouldCompress &&
            compressionStream &&
            compressionStream.writable &&
            typeof compressionStream.flush === 'function'
        ) {
            compressionStream.flush();
        } else if (
            httpResponseStream &&
            httpResponseStream.writable &&
            // @ts-expect-error - flush doesn't exist on Writable, but we're adding it
            typeof httpResponseStream.flush === 'function'
        ) {
            // @ts-expect-error - flush doesn't exist on Writable, but we're adding it
            httpResponseStream.flush();
        }
    };

    /**
     * Ends the appropriate stream(s) and emits the finish event
     * If compression is enabled, ends the compression stream which will automatically
     * end httpResponseStream due to the pipe with { end: true }
     *
     * @param response - The Express response object to emit finish event on
     */
    const endStream = (response: ExpressResponse): void => {
        if (shouldCompress && compressionStream) {
            try {
                // Flush compression stream to ensure all buffered data is written
                _flush();
                // End compression stream - this will automatically end httpResponseStream
                // due to the pipe with { end: true } option
                compressionStream.end(() => {
                    response.finished = true;
                    response.emit('finish');
                });
            } catch (error) {
                console.error(`Error ending compression stream:`, error);
                // Still emit finish even if there was an error
                response.finished = true;
                response.emit('finish');
            }
        } else if (httpResponseStream && httpResponseStream.writable) {
            // No compression, end httpResponseStream directly
            try {
                _flush();
                httpResponseStream.end(() => {
                    response.finished = true;
                    response.emit('finish');
                });
            } catch (error) {
                console.error(`Error ending httpResponseStream:`, error);
                response.finished = true;
                response.emit('finish');
            }
        } else {
            console.error(`Cannot call end() - stream is closed`);
            // Still emit finish to prevent hanging
            response.finished = true;
            response.emit('finish');
        }
    };

    // @ts-expect-error - Type signature doesn't match ServerResponse.end exactly, but our implementation is compatible
    res.end = function (chunk?: string | Buffer | Uint8Array) {
        if (!isStreamOpen()) {
            console.error(`Cannot end - stream is already closed`);
            return this;
        }

        initializeResponse(this);

        // MRT requires at least one write call to the body stream before
        // ending it, even for responses with no body (e.g. 3xx redirects,
        // 204 No Content, 2xx routes that intentionally discard the upstream
        // body such as analytics beacon proxies, and 5xx error responses
        // returned without a body). Without this, the stream terminates
        // abnormally and MRT returns its own 502 InternalServerErrorException
        // regardless of the application's intended status code.
        //
        // Known limitation: when a body-less response declares a compressible
        // Content-Type with an encoding negotiated, this empty write is routed
        // through the compression stream, so the response carries a few bytes
        // of gzip framing and a Content-Encoding header — technically a body on
        // a 204/304, which RFC 9110 says must not have one. In practice these
        // statuses rarely set a compressible Content-Type, so the impact is
        // negligible; revisit by skipping compression for body-less responses
        // if a real case appears.
        if (isNullOrUndefined(chunk)) {
            writeChunk(Buffer.alloc(0));
        } else {
            // Chunks can be falsy ('', 0, etc.) but not null or undefined.
            // writeChunk buffers into the compression → HttpResponseStream pipe,
            // which drains on its own; endStream flushes and ends that pipe.
            writeChunk(chunk);
        }

        // End the stream(s) and emit finish event
        endStream(this);
        return this;
    };

    // Add Express-specific methods that aren't in ServerResponse
    res.status = function (code: number, message?: string) {
        this.statusCode = code;
        statusCode = code;
        if (message !== undefined) {
            statusMessage = message;
        }
        return this;
    };

    res.set = function (field: string | Record<string, string | string[] | undefined>, value?: string | string[]) {
        if (typeof field === 'object') {
            for (const [key, val] of Object.entries(field)) {
                if (val !== undefined) {
                    this.setHeader(key, val);
                }
            }
        } else {
            if (value !== undefined) {
                this.setHeader(field, value);
            }
        }
        return this;
    };

    // @ts-expect-error - Type signature doesn't match ExpressResponse.append exactly, but our implementation is compatible
    res.append = function (field: string, value: string | string[]): this {
        const prevValue = this.getHeader(field);

        if (prevValue) {
            // If header already exists, append the value
            if (Array.isArray(prevValue)) {
                this.setHeader(field, prevValue.concat(value as string[]));
            } else if (Array.isArray(value)) {
                this.setHeader(field, [prevValue as string].concat(value));
            } else {
                this.setHeader(field, [prevValue as string, value]);
            }
        } else {
            // If header doesn't exist, just set it
            this.setHeader(field, value);
        }

        return this;
    };

    res.flushHeaders = function () {
        if (!responseStarted) {
            if (!isStreamOpen()) {
                console.error('[res.flushHeaders] Cannot flush headers - stream is closed');
                return this;
            }

            // Collect all current headers and send them
            // getHeaders() returns all headers from ServerResponse, including those set via set()/setHeader()
            // This is the source of truth for all headers
            const currentHeaders = this.getHeaders();
            // Merge with local headers variable to include any headers set via writeHead
            // currentHeaders takes precedence as it's the authoritative source from ServerResponse
            Object.assign(headers, currentHeaders);
        }

        initializeResponse(this);

        return this;
    };

    res.json = function (obj: unknown) {
        res.setHeader('Content-Type', 'application/json');
        this.end(JSON.stringify(obj));
        return this;
    };

    res.send = function (body: string | object) {
        if (typeof body === 'object' && body !== null) {
            return this.json(body);
        }
        // Convert non-string values to string
        const bodyString = typeof body === 'string' ? body : String(body);
        this.end(bodyString);
        return this;
    };

    // @ts-expect-error - Type signature doesn't match ExpressResponse.redirect exactly, but our implementation is compatible
    res.redirect = function (url: string) {
        this.status(302);
        this.setHeader('Location', url);
        this.end();
        return this;
    };

    // Add flush method for streaming responses (important for streaming SSR)
    res.flush = function () {
        if (!isStreamOpen()) {
            console.error(`Cannot flush - stream is closed`);
            return this;
        }

        initializeResponse(this);

        // Flush the compression stream if it exists and supports it
        // This ensures any buffered compressed data is written immediately
        try {
            _flush();
        } catch (error) {
            console.error(`Error flushing:`, error);
        }

        return this;
    };

    // Track piped destinations for unpipe support
    const pipedDestinations = new Set<Writable>();

    // Add pipe method for streaming responses (commonly used in Express)
    // @ts-expect-error - Type signature doesn't match ExpressResponse.pipe exactly, but our implementation is compatible
    // oxlint-disable-next-line @typescript-eslint/no-unused-vars
    res.pipe = function (destination: Writable, options?: { end?: boolean }) {
        if (!isStreamOpen()) {
            console.error('[res.pipe] Cannot pipe - stream is closed');
            return destination;
        }

        initializeResponse(this);

        // Track the destination for unpipe support
        pipedDestinations.add(destination);

        // Use actual Node.js pipeline for pipe operations
        pipeToDestination(destination)
            .then(() => {
                pipedDestinations.delete(destination);
            })
            .catch((error) => {
                console.error('[res.pipe] Pipeline error:', error);
                pipedDestinations.delete(destination);
            });

        return destination;
    };

    // Add unpipe method to remove pipe destinations
    // @ts-expect-error - unpipe doesn't exist on ExpressResponse type, but we're adding it
    res.unpipe = function (destination?: Writable) {
        if (destination) {
            pipedDestinations.delete(destination);
            // In a real implementation, you'd need to handle unpipe more carefully
            // For now, we just track it
        } else {
            // Unpipe all destinations
            pipedDestinations.clear();
        }

        return this;
    };

    // Make response flushable (flag used by some frameworks)
    res.flushable = true;

    return res;
}
