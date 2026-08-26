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
import { correlationMiddleware } from './correlation.server';
import { correlationContext, generateCorrelationId } from '@/lib/correlation';
import { createLoaderArgs, createTestContext } from '@/lib/test-utils';

vi.mock('@/lib/correlation', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        generateCorrelationId: vi.fn(() => 'mock-correlation-id-12345'),
    };
});

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

describe('middlewares/correlation.server.ts', () => {
    let mockContext: Readonly<RouterContextProvider>;
    let mockNext: Mock<() => Promise<Response>>;
    let mockRequest: Request;

    beforeEach(() => {
        vi.clearAllMocks();
        mockContext = createTestContext();
        mockNext = vi.fn<() => Promise<Response>>().mockResolvedValue(new Response('test'));
        mockRequest = new Request('https://example.com/test');
    });

    describe('correlationMiddleware', () => {
        it('should use x-correlation-id header when present', async () => {
            const requestWithHeader = new Request('https://example.com/test', {
                headers: { 'x-correlation-id': 'incoming-correlation-id' },
            });

            await correlationMiddleware(createLoaderArgs(requestWithHeader, mockContext, { pattern: '/' }), mockNext);

            expect(generateCorrelationId).not.toHaveBeenCalled();
            expect(mockContext.get(correlationContext)).toBe('incoming-correlation-id');
        });

        it('should generate a correlation ID when no headers are present', async () => {
            await correlationMiddleware(createLoaderArgs(mockRequest, mockContext, { pattern: '/' }), mockNext);

            expect(generateCorrelationId).toHaveBeenCalledOnce();
            expect(mockContext.get(correlationContext)).toBe('mock-correlation-id-12345');
        });

        it('should call next() and return its response', async () => {
            const expectedResponse = new Response('expected response');
            mockNext.mockResolvedValue(expectedResponse);

            const result = await correlationMiddleware(
                { request: mockRequest, context: mockContext, params: {}, pattern: '/', url: new URL(mockRequest.url) },
                mockNext
            );

            expect(mockNext).toHaveBeenCalledOnce();
            expect(result).toBe(expectedResponse);
        });

        it('should set correlation ID before calling next()', async () => {
            let correlationIdDuringNext: string | undefined;

            mockNext.mockImplementation(() => {
                correlationIdDuringNext = mockContext.get(correlationContext);
                return Promise.resolve(new Response('test'));
            });

            await correlationMiddleware(createLoaderArgs(mockRequest, mockContext, { pattern: '/' }), mockNext);

            expect(correlationIdDuringNext).toBe('mock-correlation-id-12345');
        });

        it('should work with different request URLs', async () => {
            const requests = [
                new Request('https://example.com/'),
                new Request('https://example.com/products/123'),
                new Request('https://example.com/search?q=test'),
            ];

            for (const request of requests) {
                vi.clearAllMocks();
                mockContext = createTestContext();

                await correlationMiddleware(createLoaderArgs(request, mockContext, { pattern: '/' }), mockNext);

                expect(generateCorrelationId).toHaveBeenCalledOnce();
                expect(mockContext.get(correlationContext)).toBe('mock-correlation-id-12345');
            }
        });

        it('should generate a unique ID for each request', async () => {
            let callCount = 0;
            vi.mocked(generateCorrelationId).mockImplementation(() => `id-${++callCount}`);

            const context1 = createTestContext();
            const context2 = createTestContext();

            await correlationMiddleware(createLoaderArgs(mockRequest, context1, { pattern: '/' }), mockNext);
            await correlationMiddleware(createLoaderArgs(mockRequest, context2, { pattern: '/' }), mockNext);

            expect(context1.get(correlationContext)).toBe('id-1');
            expect(context2.get(correlationContext)).toBe('id-2');
        });

        it('reads x-correlation-id from url-encoded POST body when header is absent', async () => {
            const body = new URLSearchParams({
                intent: 'contactInfo',
                email: 'shopper@example.com',
                'x-correlation-id': 'from-form-body-abc',
            });
            const postRequest = new Request('https://example.com/checkout/checkout', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body,
            });

            await correlationMiddleware(createLoaderArgs(postRequest, mockContext, { pattern: '/' }), mockNext);

            expect(generateCorrelationId).not.toHaveBeenCalled();
            expect(mockContext.get(correlationContext)).toBe('from-form-body-abc');
        });

        it('reads x-correlation-id from multipart POST body when header is absent', async () => {
            const formData = new FormData();
            formData.append('intent', 'payment');
            formData.append('x-correlation-id', 'from-multipart-xyz');
            const postRequest = new Request('https://example.com/checkout/checkout', {
                method: 'POST',
                body: formData,
            });

            await correlationMiddleware(createLoaderArgs(postRequest, mockContext, { pattern: '/' }), mockNext);

            expect(generateCorrelationId).not.toHaveBeenCalled();
            expect(mockContext.get(correlationContext)).toBe('from-multipart-xyz');
        });

        it('prefers the header over the form body when both are present', async () => {
            const body = new URLSearchParams({ 'x-correlation-id': 'from-form-body' });
            const postRequest = new Request('https://example.com/checkout/checkout', {
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'x-correlation-id': 'from-header',
                },
                body,
            });

            await correlationMiddleware(createLoaderArgs(postRequest, mockContext, { pattern: '/' }), mockNext);

            expect(mockContext.get(correlationContext)).toBe('from-header');
        });

        it('does not consume the request body when reading the form fallback', async () => {
            const body = new URLSearchParams({
                intent: 'contactInfo',
                'x-correlation-id': 'from-form-body',
            });
            const postRequest = new Request('https://example.com/checkout/checkout', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body,
            });

            await correlationMiddleware(createLoaderArgs(postRequest, mockContext, { pattern: '/' }), mockNext);

            // The downstream action must still be able to read the body. If the
            // middleware consumed it directly, this second read would throw.
            const downstreamForm = await postRequest.formData();
            expect(downstreamForm.get('intent')).toBe('contactInfo');
        });

        it('falls back to generating an ID when POST body is not form-encoded', async () => {
            // Reset the mock so a prior test's per-call counter does not leak.
            vi.mocked(generateCorrelationId).mockReturnValue('mock-correlation-id-12345');
            const postRequest = new Request('https://example.com/api/things', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ 'x-correlation-id': 'ignored-because-json' }),
            });

            await correlationMiddleware(createLoaderArgs(postRequest, mockContext, { pattern: '/' }), mockNext);

            expect(generateCorrelationId).toHaveBeenCalledOnce();
            expect(mockContext.get(correlationContext)).toBe('mock-correlation-id-12345');
        });

        it('generates an ID when the form field is empty', async () => {
            vi.mocked(generateCorrelationId).mockReturnValue('mock-correlation-id-12345');
            const body = new URLSearchParams({
                intent: 'contactInfo',
                'x-correlation-id': '',
            });
            const postRequest = new Request('https://example.com/checkout/checkout', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body,
            });

            await correlationMiddleware(createLoaderArgs(postRequest, mockContext, { pattern: '/' }), mockNext);

            expect(generateCorrelationId).toHaveBeenCalledOnce();
            expect(mockContext.get(correlationContext)).toBe('mock-correlation-id-12345');
        });

        it('generates an ID when the form field is missing', async () => {
            vi.mocked(generateCorrelationId).mockReturnValue('mock-correlation-id-12345');
            const body = new URLSearchParams({ intent: 'contactInfo' });
            const postRequest = new Request('https://example.com/checkout/checkout', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body,
            });

            await correlationMiddleware(createLoaderArgs(postRequest, mockContext, { pattern: '/' }), mockNext);

            expect(generateCorrelationId).toHaveBeenCalledOnce();
            expect(mockContext.get(correlationContext)).toBe('mock-correlation-id-12345');
        });

        it('rejects CRLF / invalid form values and generates an ID', async () => {
            vi.mocked(generateCorrelationId).mockReturnValue('mock-correlation-id-12345');
            const body = new URLSearchParams({
                'x-correlation-id': 'evil\r\ninjection',
            });
            const postRequest = new Request('https://example.com/checkout/checkout', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body,
            });

            await correlationMiddleware(createLoaderArgs(postRequest, mockContext, { pattern: '/' }), mockNext);

            expect(generateCorrelationId).toHaveBeenCalledOnce();
            expect(mockContext.get(correlationContext)).toBe('mock-correlation-id-12345');
        });

        it('rejects oversized form values and generates an ID', async () => {
            vi.mocked(generateCorrelationId).mockReturnValue('mock-correlation-id-12345');
            const body = new URLSearchParams({
                'x-correlation-id': 'a'.repeat(129),
            });
            const postRequest = new Request('https://example.com/checkout/checkout', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body,
            });

            await correlationMiddleware(createLoaderArgs(postRequest, mockContext, { pattern: '/' }), mockNext);

            expect(generateCorrelationId).toHaveBeenCalledOnce();
            expect(mockContext.get(correlationContext)).toBe('mock-correlation-id-12345');
        });

        it('accepts a valid form UUID', async () => {
            const uuid = '550e8400-e29b-41d4-a716-446655440000';
            const body = new URLSearchParams({ 'x-correlation-id': uuid });
            const postRequest = new Request('https://example.com/checkout/checkout', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body,
            });

            await correlationMiddleware(createLoaderArgs(postRequest, mockContext, { pattern: '/' }), mockNext);

            expect(generateCorrelationId).not.toHaveBeenCalled();
            expect(mockContext.get(correlationContext)).toBe(uuid);
        });

        it('reads form correlation ID when content-type includes charset', async () => {
            const body = new URLSearchParams({
                'x-correlation-id': 'from-form-with-charset',
            });
            const postRequest = new Request('https://example.com/checkout/checkout', {
                method: 'POST',
                headers: { 'content-type': 'Application/X-WWW-Form-UrlEncoded; charset=UTF-8' },
                body,
            });

            await correlationMiddleware(createLoaderArgs(postRequest, mockContext, { pattern: '/' }), mockNext);

            expect(generateCorrelationId).not.toHaveBeenCalled();
            expect(mockContext.get(correlationContext)).toBe('from-form-with-charset');
        });

        it('rejects an invalid header and falls through to generate', async () => {
            // Fetch Headers reject CRLF; use other invalid chars the validator still rejects.
            vi.mocked(generateCorrelationId).mockReturnValue('mock-correlation-id-12345');
            const requestWithHeader = new Request('https://example.com/test', {
                headers: { 'x-correlation-id': 'has spaces and/slashes' },
            });

            await correlationMiddleware(createLoaderArgs(requestWithHeader, mockContext, { pattern: '/' }), mockNext);

            expect(generateCorrelationId).toHaveBeenCalledOnce();
            expect(mockContext.get(correlationContext)).toBe('mock-correlation-id-12345');
        });
    });
});
