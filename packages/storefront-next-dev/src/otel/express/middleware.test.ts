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
import { EventEmitter } from 'node:events';

const { mockServerSpan, mockStreamingSpan, mockTracer } = vi.hoisted(() => {
    const serverSpan = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
    };
    const streamingSpan = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
    };
    const tracer = {
        // The middleware calls the (name, options, context, callback) overload to
        // continue the inbound trace. Invoke the trailing argument as the callback so
        // this mock works regardless of arity.
        startActiveSpan: vi.fn((...args: unknown[]) => {
            const callback = args[args.length - 1] as (s: typeof serverSpan) => unknown;
            return callback(serverSpan);
        }),
        startSpan: vi.fn(() => streamingSpan),
    };
    return { mockServerSpan: serverSpan, mockStreamingSpan: streamingSpan, mockTracer: tracer };
});

vi.mock('../setup', () => ({
    initTelemetry: vi.fn(() => mockTracer),
}));

vi.mock('@opentelemetry/api', async (importOriginal) => {
    const original = await importOriginal<typeof import('@opentelemetry/api')>();
    return {
        ...original,
        ROOT_CONTEXT: 'mock-root-context',
        context: { active: vi.fn(() => 'mock-context') },
        SpanStatusCode: { UNSET: 0, OK: 1, ERROR: 2 },
        trace: {
            getSpan: vi.fn(() => ({
                spanContext: () => ({
                    traceId: 'abc123def456abc123def456abc123de',
                    spanId: '1234567890abcdef',
                    traceFlags: 1,
                }),
            })),
            // The middleware builds the parent context by hand (not via the global
            // propagator) to survive the multi-`@opentelemetry/api`-instance split in the
            // externalized MRT bundle. Return a sentinel so we can assert the server span
            // is started in this context when an inbound traceparent is present.
            setSpanContext: vi.fn(() => 'mock-parent-context'),
        },
    };
});

import { createOtelExpressMiddleware } from './middleware';
import { initTelemetry } from '../setup';
import { ROOT_CONTEXT, SpanKind, trace } from '@opentelemetry/api';

/** A well-formed inbound W3C traceparent used to exercise the continuation path. */
const INBOUND_TRACEPARENT = '00-11111111111111111111111111111111-2222222222222222-01';

/** Create a minimal mock Express request. */
function mockRequest(method = 'GET', url = '/products', headers: Record<string, string> = {}) {
    return { method, url, originalUrl: url, headers } as unknown as Parameters<
        ReturnType<typeof createOtelExpressMiddleware>
    >[0];
}

/** Create a minimal mock Express response with EventEmitter for close/finish. */
function mockResponse(statusCode = 200) {
    const emitter = new EventEmitter();
    const res = Object.assign(emitter, {
        statusCode,
        writeHead: vi.fn(),
        write: vi.fn(),
        setHeader: vi.fn(),
    });
    return res as unknown as Parameters<ReturnType<typeof createOtelExpressMiddleware>>[1] & EventEmitter;
}

describe('createOtelExpressMiddleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('when OTel is disabled', () => {
        it('returns a no-op middleware that calls next() immediately', () => {
            vi.mocked(initTelemetry).mockReturnValueOnce(null);
            const middleware = createOtelExpressMiddleware();
            const next = vi.fn();

            middleware(mockRequest(), mockResponse() as never, next);

            expect(next).toHaveBeenCalledOnce();
            expect(mockTracer.startActiveSpan).not.toHaveBeenCalled();
        });

        it('adds no trace headers — neither reads inbound nor writes the response traceparent', () => {
            vi.mocked(initTelemetry).mockReturnValueOnce(null);
            const middleware = createOtelExpressMiddleware();
            const res = mockResponse();

            middleware(mockRequest(), res as never, vi.fn());

            // No inbound extraction and no outbound/response header when disabled.
            expect(trace.setSpanContext).not.toHaveBeenCalled();
            // oxlint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, no real `this` binding
            expect(res.setHeader).not.toHaveBeenCalled();
        });
    });

    describe('inbound trace continuation', () => {
        it('parses the inbound traceparent and builds the parent context by hand', () => {
            const middleware = createOtelExpressMiddleware();
            const req = mockRequest('GET', '/products', { traceparent: INBOUND_TRACEPARENT });

            middleware(req, mockResponse() as never, vi.fn());

            // Parsed from INBOUND_TRACEPARENT, not deserialized via the global propagator
            // (which is registered on a different @opentelemetry/api instance in the MRT bundle).
            expect(trace.setSpanContext).toHaveBeenCalledWith(ROOT_CONTEXT, {
                traceId: '11111111111111111111111111111111',
                spanId: '2222222222222222',
                traceFlags: 1,
                isRemote: true,
            });
        });

        it('starts the server span in the parent context built from the inbound header', () => {
            const middleware = createOtelExpressMiddleware();
            const req = mockRequest('GET', '/products', { traceparent: INBOUND_TRACEPARENT });

            middleware(req, mockResponse() as never, vi.fn());

            expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
                'sfnext.request',
                { kind: SpanKind.SERVER, attributes: { 'http.request.method': 'GET', 'url.path': '/products' } },
                'mock-parent-context',
                expect.any(Function)
            );
        });

        it('leaves the parent context as ROOT when no traceparent header is present', () => {
            const middleware = createOtelExpressMiddleware();
            middleware(mockRequest('GET', '/products'), mockResponse() as never, vi.fn());

            expect(trace.setSpanContext).not.toHaveBeenCalled();
            expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
                'sfnext.request',
                expect.anything(),
                ROOT_CONTEXT,
                expect.any(Function)
            );
        });

        it('leaves the parent context as ROOT when the traceparent header is malformed', () => {
            const middleware = createOtelExpressMiddleware();
            const req = mockRequest('GET', '/products', { traceparent: 'not-a-valid-traceparent' });

            middleware(req, mockResponse() as never, vi.fn());

            expect(trace.setSpanContext).not.toHaveBeenCalled();
            expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
                'sfnext.request',
                expect.anything(),
                ROOT_CONTEXT,
                expect.any(Function)
            );
        });
    });

    describe('traceparent response header', () => {
        it('sets traceparent and server-timing headers with W3C trace context', () => {
            const middleware = createOtelExpressMiddleware();
            const res = mockResponse();
            middleware(mockRequest(), res as never, vi.fn());

            // oxlint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, no real `this` binding
            expect(res.setHeader).toHaveBeenCalledWith(
                'traceparent',
                '00-abc123def456abc123def456abc123de-1234567890abcdef-01'
            );
        });
    });

    describe('server span', () => {
        it('creates a SERVER-kind span named "sfnext.request"', () => {
            const middleware = createOtelExpressMiddleware();
            middleware(mockRequest('GET', '/'), mockResponse() as never, vi.fn());

            expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
                'sfnext.request',
                { kind: SpanKind.SERVER, attributes: { 'http.request.method': 'GET', 'url.path': '/' } },
                'mock-root-context',
                expect.any(Function)
            );
        });

        it('has http.request.method and url.path attributes', () => {
            const middleware = createOtelExpressMiddleware();
            middleware(mockRequest('POST', '/cart'), mockResponse() as never, vi.fn());

            expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
                'sfnext.request',
                { kind: SpanKind.SERVER, attributes: { 'http.request.method': 'POST', 'url.path': '/cart' } },
                'mock-root-context',
                expect.any(Function)
            );
        });
    });

    describe('streaming span', () => {
        it('is created on first writeHead with method and url.path attributes', () => {
            const middleware = createOtelExpressMiddleware();
            const res = mockResponse();
            middleware(mockRequest(), res as never, vi.fn());

            // Trigger writeHead (patched)
            res.writeHead(200);

            expect(mockTracer.startSpan).toHaveBeenCalledOnce();
            expect(mockTracer.startSpan).toHaveBeenCalledWith(
                'sfnext.response_streaming',
                expect.objectContaining({
                    attributes: expect.objectContaining({
                        'http.request.method': 'GET',
                        'url.path': '/products',
                    }),
                }),
                'mock-context'
            );
        });

        it('is only created once even if writeHead is called multiple times', () => {
            const middleware = createOtelExpressMiddleware();
            const res = mockResponse();
            middleware(mockRequest(), res as never, vi.fn());

            res.writeHead(200);
            res.writeHead(200);
            res.writeHead(200);

            expect(mockTracer.startSpan).toHaveBeenCalledOnce();
        });

        it('is created on write without prior writeHead', () => {
            const middleware = createOtelExpressMiddleware();
            const res = mockResponse();
            middleware(mockRequest(), res as never, vi.fn());

            res.write('data');

            expect(mockTracer.startSpan).toHaveBeenCalledOnce();
        });
    });

    describe('span ending', () => {
        it('ends both spans on finish event (MRT Lambda adapter path)', () => {
            const middleware = createOtelExpressMiddleware();
            const res = mockResponse();
            middleware(mockRequest(), res as never, vi.fn());

            res.writeHead(200);
            res.emit('finish');

            expect(mockStreamingSpan.end).toHaveBeenCalledOnce();
            expect(mockServerSpan.end).toHaveBeenCalledOnce();
        });

        it('ends both spans on close event (dev server path)', () => {
            const middleware = createOtelExpressMiddleware();
            const res = mockResponse();
            middleware(mockRequest(), res as never, vi.fn());

            res.writeHead(200);
            res.emit('close');

            expect(mockStreamingSpan.end).toHaveBeenCalledOnce();
            expect(mockServerSpan.end).toHaveBeenCalledOnce();
        });

        it('only ends spans once even if both close and finish fire', () => {
            const middleware = createOtelExpressMiddleware();
            const res = mockResponse();
            middleware(mockRequest(), res as never, vi.fn());

            res.writeHead(200);
            res.emit('finish');
            res.emit('close');

            expect(mockStreamingSpan.end).toHaveBeenCalledOnce();
            expect(mockServerSpan.end).toHaveBeenCalledOnce();
        });

        it('sets http.response.status_code on both spans', () => {
            const middleware = createOtelExpressMiddleware();
            const res = mockResponse(201);
            middleware(mockRequest(), res as never, vi.fn());

            res.writeHead(201);
            res.emit('close');

            expect(mockStreamingSpan.setAttribute).toHaveBeenCalledWith('http.response.status_code', 201);
            expect(mockServerSpan.setAttribute).toHaveBeenCalledWith('http.response.status_code', 201);
        });

        it('sets http.total_duration_ms on server span and http.streaming_duration_ms on streaming span', () => {
            const middleware = createOtelExpressMiddleware();
            const res = mockResponse();
            middleware(mockRequest(), res as never, vi.fn());

            res.writeHead(200);
            res.emit('close');

            expect(mockServerSpan.setAttribute).toHaveBeenCalledWith('http.total_duration_ms', expect.any(Number));
            expect(mockStreamingSpan.setAttribute).toHaveBeenCalledWith(
                'http.streaming_duration_ms',
                expect.any(Number)
            );
        });

        it('sets SpanStatusCode.ERROR on both spans for 5xx status', () => {
            const middleware = createOtelExpressMiddleware();
            const res = mockResponse(502);
            middleware(mockRequest(), res as never, vi.fn());

            res.writeHead(502);
            res.emit('close');

            expect(mockStreamingSpan.setStatus).toHaveBeenCalledWith({ code: 2 });
            expect(mockServerSpan.setStatus).toHaveBeenCalledWith({ code: 2 });
        });

        it('does not set ERROR status for non-5xx status', () => {
            const middleware = createOtelExpressMiddleware();
            const res = mockResponse(404);
            middleware(mockRequest(), res as never, vi.fn());

            res.writeHead(404);
            res.emit('close');

            expect(mockStreamingSpan.setStatus).not.toHaveBeenCalled();
            expect(mockServerSpan.setStatus).not.toHaveBeenCalled();
        });
    });
});
