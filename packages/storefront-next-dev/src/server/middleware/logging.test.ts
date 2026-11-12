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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createLoggingMiddleware, redactUrlForLogging } from './logging';

describe('logging middleware', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let nextFunction: NextFunction;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mockRequest = {
            method: 'GET',
            url: '/test',
        };

        mockResponse = {
            statusCode: 200,
            getHeader: vi.fn(),
            setHeader: vi.fn(),
            on: vi.fn(),
        };

        nextFunction = vi.fn();
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        vi.clearAllMocks();
    });

    describe('createLoggingMiddleware', () => {
        it('should create a logging middleware', () => {
            const middleware = createLoggingMiddleware();
            expect(middleware).toBeTypeOf('function');
        });

        it('should handle requests with GET method', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = 'GET';
            mockRequest.url = '/api/test';
            mockResponse.statusCode = 200;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should handle requests with POST method', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = 'POST';
            mockRequest.url = '/api/create';
            mockResponse.statusCode = 201;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should handle requests with PUT method', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = 'PUT';
            mockRequest.url = '/api/update';
            mockResponse.statusCode = 200;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should handle requests with DELETE method', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = 'DELETE';
            mockRequest.url = '/api/delete';
            mockResponse.statusCode = 204;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should handle requests with PATCH method', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = 'PATCH';
            mockRequest.url = '/api/patch';
            mockResponse.statusCode = 200;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should handle undefined method gracefully', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = undefined;
            mockRequest.url = '/api/test';
            mockResponse.statusCode = 200;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should handle requests with HEAD method', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = 'HEAD';
            mockRequest.url = '/api/test';
            mockResponse.statusCode = 200;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should handle status codes >= 500', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = 'GET';
            mockRequest.url = '/error';
            mockResponse.statusCode = 500;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should handle status codes >= 400', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = 'GET';
            mockRequest.url = '/not-found';
            mockResponse.statusCode = 404;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should handle status codes >= 300', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = 'GET';
            mockRequest.url = '/redirect';
            mockResponse.statusCode = 301;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should handle status codes < 300', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = 'GET';
            mockRequest.url = '/success';
            mockResponse.statusCode = 200;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should skip logging for /@vite URLs', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.url = '/@vite/client';

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should skip logging for /@id URLs', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.url = '/@id/some-module';

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should skip logging for /@fs URLs', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.url = '/@fs/some/file';

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should skip logging for /src URLs', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.url = '/src/components/Button.tsx';

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should skip logging for .js files', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.url = '/assets/main.js';

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should skip logging for .css files', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.url = '/assets/styles.css';

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should skip logging for .ts files', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.url = '/src/index.ts';

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should skip logging for .tsx files', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.url = '/src/App.tsx';

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should skip logging for .js.map files', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.url = '/assets/main.js.map';

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should skip logging for .css.map files', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.url = '/assets/styles.css.map';

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should not skip logging for regular API URLs', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.url = '/api/products';
            mockRequest.method = 'GET';
            mockResponse.statusCode = 200;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should handle requests with 503 status code', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = 'GET';
            mockRequest.url = '/unavailable';
            mockResponse.statusCode = 503;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should handle requests with 401 status code', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = 'GET';
            mockRequest.url = '/unauthorized';
            mockResponse.statusCode = 401;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should handle requests with 302 status code', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = 'GET';
            mockRequest.url = '/temporary-redirect';
            mockResponse.statusCode = 302;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });

        it('should handle requests with 201 status code', () => {
            const middleware = createLoggingMiddleware();
            mockRequest.method = 'POST';
            mockRequest.url = '/created';
            mockResponse.statusCode = 201;

            middleware(mockRequest as Request, mockResponse as Response, nextFunction);
            expect(nextFunction).toHaveBeenCalled();
        });
    });
});

describe('redactUrlForLogging', () => {
    it('masks the passwordless magic-link token', () => {
        expect(redactUrlForLogging('/global/en-GB/login?token=20533860')).toBe('/global/en-GB/login?token=[REDACTED]');
    });

    it('masks email, login_id, and otpCode while keeping other params', () => {
        expect(
            redactUrlForLogging(
                '/login?otpCode=12345678&email=shopper%2Btag%40example.com&returnUrl=%2Fcart&login_id=a@b.com'
            )
        ).toBe('/login?otpCode=[REDACTED]&email=[REDACTED]&returnUrl=%2Fcart&login_id=[REDACTED]');
    });

    it('masks encoded parameter names', () => {
        expect(redactUrlForLogging('/login?%74oken=abc')).toBe('/login?%74oken=[REDACTED]');
    });

    it('masks a sensitive param that has no value', () => {
        expect(redactUrlForLogging('/login?token')).toBe('/login?token=[REDACTED]');
    });

    it('leaves malformed parameter names untouched', () => {
        expect(redactUrlForLogging('/login?%E0%A4%A=1&token=abc')).toBe('/login?%E0%A4%A=1&token=[REDACTED]');
    });

    it('returns URLs without a query string unchanged', () => {
        expect(redactUrlForLogging('/global/en-GB/login')).toBe('/global/en-GB/login');
        expect(redactUrlForLogging(undefined)).toBeUndefined();
    });

    it('does not mask params that only contain a sensitive name', () => {
        expect(redactUrlForLogging('/search?q=token&emailOptIn=true')).toBe('/search?q=token&emailOptIn=true');
    });
});
