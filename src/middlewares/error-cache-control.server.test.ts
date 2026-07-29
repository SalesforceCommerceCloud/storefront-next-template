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
import type { RouterContextProvider } from 'react-router';
import { createLoaderArgs, createTestContext } from '@/lib/test-utils';
import { errorCacheControlMiddleware } from './error-cache-control.server';

/**
 * Header React Router stamps on every single-fetch (`.data`) response via its internal
 * `generateSingleFetchResponse`. In react-router 7.12.0 the `.data` URL suffix is stripped from
 * `request.url` before middleware runs, so this response header is the only middleware-visible
 * signal for a data response. Once the app runs with the `.data` suffix preserved on the request
 * (react-router ≥ 7.13.2 + `unstable_passThroughRequests`), the request URL becomes the signal too.
 */
const DATA_RESPONSE_HEADER = 'X-Remix-Response';

const DATA_REQUEST = new Request('https://example.com/test.data');
const DOCUMENT_REQUEST = new Request('https://example.com/test');

/**
 * The two ways a data interaction is detectable at middleware time:
 * - `request-url`: the request targets a `.data` URL (future-safe; works once the suffix is preserved).
 * - `response-header`: the response carries `X-Remix-Response` (works today in 7.12.0).
 *
 * Each scenario carries a `request` exercising that signal and an `asData` decorator that stamps the
 * response signal when (and only when) the request URL does not already carry it.
 */
const DATA_SIGNALS = [
    {
        signal: 'request-url',
        request: DATA_REQUEST,
        asData: (response: Response): Response => response,
    },
    {
        signal: 'response-header',
        request: DOCUMENT_REQUEST,
        asData: (response: Response): Response => {
            response.headers.set(DATA_RESPONSE_HEADER, 'yes');
            return response;
        },
    },
] as const;

describe('middlewares/error-cache-control.server.ts', () => {
    let mockContext: Readonly<RouterContextProvider>;
    let mockNext: Mock<() => Promise<Response>>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockContext = createTestContext();
        mockNext = vi.fn<() => Promise<Response>>();
    });

    function callMiddleware(request: Request): Promise<Response> {
        return errorCacheControlMiddleware(
            createLoaderArgs(request, mockContext, { pattern: '/' }),
            mockNext
        ) as Promise<Response>;
    }

    describe.each(DATA_SIGNALS)('data responses ($signal)', ({ request, asData }) => {
        describe('returned responses', () => {
            it('should set no-store on a 500 data response', async () => {
                const response = asData(new Response('Internal Server Error', { status: 500 }));
                mockNext.mockResolvedValue(response);

                const result = await callMiddleware(request);

                expect(result).toBe(response);
                expect(result.status).toBe(500);
                expect(result.headers.get('Cache-Control')).toBe('no-store');
            });

            it('should not set Pragma or Expires on a 500 data response', async () => {
                const response = asData(new Response('Internal Server Error', { status: 500 }));
                mockNext.mockResolvedValue(response);

                const result = await callMiddleware(request);

                expect(result.headers.has('Pragma')).toBe(false);
                expect(result.headers.has('Expires')).toBe(false);
            });

            it('should not set no-cache headers on a 200 data response', async () => {
                const response = asData(new Response('OK', { status: 200 }));
                mockNext.mockResolvedValue(response);

                const result = await callMiddleware(request);

                expect(result.status).toBe(200);
                expect(result.headers.has('Cache-Control')).toBe(false);
                expect(result.headers.has('Pragma')).toBe(false);
                expect(result.headers.has('Expires')).toBe(false);
            });

            it('should not set no-cache headers on a 404 data response', async () => {
                const response = asData(new Response('Not Found', { status: 404 }));
                mockNext.mockResolvedValue(response);

                const result = await callMiddleware(request);

                expect(result.status).toBe(404);
                expect(result.headers.has('Cache-Control')).toBe(false);
            });

            it('should not set no-cache headers on a 301 data redirect', async () => {
                const response = asData(
                    new Response(null, {
                        status: 301,
                        headers: { Location: '/new-path' },
                    })
                );
                mockNext.mockResolvedValue(response);

                const result = await callMiddleware(request);

                expect(result.status).toBe(301);
                expect(result.headers.has('Cache-Control')).toBe(false);
            });

            it.each([500, 501, 502, 504])('should set no-store on a %i data response', async (status) => {
                const response = asData(new Response('Server Error', { status }));
                mockNext.mockResolvedValue(response);

                const result = await callMiddleware(request);

                expect(result.status).toBe(status);
                expect(result.headers.get('Cache-Control')).toBe('no-store');
            });

            it('should set a brief max-age, not no-store, on a 503 data response (overload backoff)', async () => {
                const response = asData(new Response('Service Unavailable', { status: 503 }));
                mockNext.mockResolvedValue(response);

                const result = await callMiddleware(request);

                expect(result.status).toBe(503);
                expect(result.headers.get('Cache-Control')).toBe('max-age=2');
            });

            it.each([500, 501, 502, 504])('should preserve existing headers on a %i data response', async (status) => {
                const response = asData(
                    new Response('Error', {
                        status,
                        headers: { 'X-Custom-Header': 'value' },
                    })
                );
                mockNext.mockResolvedValue(response);

                const result = await callMiddleware(request);

                expect(result.headers.get('X-Custom-Header')).toBe('value');
                expect(result.headers.get('Cache-Control')).toBe('no-store');
            });

            it('should preserve existing headers on a 503 data response', async () => {
                const response = asData(
                    new Response('Service Unavailable', {
                        status: 503,
                        headers: { 'X-Custom-Header': 'value' },
                    })
                );
                mockNext.mockResolvedValue(response);

                const result = await callMiddleware(request);

                expect(result.headers.get('X-Custom-Header')).toBe('value');
                expect(result.headers.get('Cache-Control')).toBe('max-age=2');
            });

            it.each([
                500, 501, 502, 504,
            ])('should override existing Cache-Control with no-store on a %i data response', async (status) => {
                const response = asData(
                    new Response('Error', {
                        status,
                        headers: { 'Cache-Control': 'max-age=3600' },
                    })
                );
                mockNext.mockResolvedValue(response);

                const result = await callMiddleware(request);

                expect(result.headers.get('Cache-Control')).toBe('no-store');
            });

            it('should override existing Cache-Control with max-age=2 on a 503 data response', async () => {
                const response = asData(
                    new Response('Service Unavailable', {
                        status: 503,
                        headers: { 'Cache-Control': 'max-age=3600' },
                    })
                );
                mockNext.mockResolvedValue(response);

                const result = await callMiddleware(request);

                expect(result.headers.get('Cache-Control')).toBe('max-age=2');
            });

            it('should not set no-cache headers on a 499 data response (just below the 5xx boundary)', async () => {
                const response = asData(new Response('Client Closed Request', { status: 499 }));
                mockNext.mockResolvedValue(response);

                const result = await callMiddleware(request);

                expect(result.status).toBe(499);
                expect(result.headers.has('Cache-Control')).toBe(false);
                expect(result.headers.has('Pragma')).toBe(false);
                expect(result.headers.has('Expires')).toBe(false);
            });

            it('should preserve the response body on a 500 data response', async () => {
                const response = asData(new Response('Internal Server Error', { status: 500 }));
                mockNext.mockResolvedValue(response);

                const result = await callMiddleware(request);

                await expect(result.text()).resolves.toBe('Internal Server Error');
            });

            it('should preserve statusText on a 500 data response', async () => {
                const response = asData(new Response('Boom', { status: 500, statusText: 'Internal Server Error' }));
                mockNext.mockResolvedValue(response);

                const result = await callMiddleware(request);

                expect(result.statusText).toBe('Internal Server Error');
            });
        });
    });

    describe('document (non-data) responses', () => {
        it.each([
            500, 501, 502, 503, 504,
        ])('should not set no-store on a returned %i document response', async (status) => {
            const response = new Response('Server Error', { status });
            mockNext.mockResolvedValue(response);

            const result = await callMiddleware(DOCUMENT_REQUEST);

            expect(result.status).toBe(status);
            expect(result.headers.has('Cache-Control')).toBe(false);
        });

        it('should not set no-store on a 200 document response', async () => {
            const response = new Response('OK', { status: 200 });
            mockNext.mockResolvedValue(response);

            const result = await callMiddleware(DOCUMENT_REQUEST);

            expect(result.status).toBe(200);
            expect(result.headers.has('Cache-Control')).toBe(false);
        });
    });

    describe('rejected next()', () => {
        /**
         * The middleware does not wrap `next()` in a try/catch: in react-router 7.12 a thrown `Response` from a loader,
         * action, or downstream middleware is resolved back into the response on both the document (`query`) and `.data`
         * (`queryRoute`) server paths, so `next()` never rejects with a `Response`. Any rejection therefore propagates
         * untouched and the `Cache-Control` logic never runs — including for a thrown 5xx `Response`.
         */
        it.each([
            500, 501, 502, 503, 504,
        ])('should re-throw a thrown %i data Response untouched, without setting Cache-Control', async (status) => {
            const errorResponse = new Response('Server Error', { status });
            mockNext.mockRejectedValue(errorResponse);

            await expect(callMiddleware(DATA_REQUEST)).rejects.toBe(errorResponse);
            expect(errorResponse.headers.has('Cache-Control')).toBe(false);
        });

        it('should re-throw a thrown 500 document Response untouched, without setting no-store', async () => {
            const errorResponse = new Response('Server Error', { status: 500 });
            mockNext.mockRejectedValue(errorResponse);

            await expect(callMiddleware(DOCUMENT_REQUEST)).rejects.toBe(errorResponse);
            expect(errorResponse.headers.has('Cache-Control')).toBe(false);
        });

        it('should re-throw a regular Error without modification', async () => {
            const error = new Error('Something broke');
            mockNext.mockRejectedValue(error);

            await expect(callMiddleware(DATA_REQUEST)).rejects.toBe(error);
        });

        it('should re-throw a string error without modification', async () => {
            mockNext.mockRejectedValue('unexpected failure');

            await expect(callMiddleware(DATA_REQUEST)).rejects.toBe('unexpected failure');
        });

        it('should re-throw a plain object without modification', async () => {
            const error = { code: 'BOOM', message: 'something broke' };
            mockNext.mockRejectedValue(error);

            await expect(callMiddleware(DATA_REQUEST)).rejects.toBe(error);
        });

        it('should re-throw null without modification', async () => {
            mockNext.mockRejectedValue(null);

            await expect(callMiddleware(DATA_REQUEST)).rejects.toBeNull();
        });
    });
});
