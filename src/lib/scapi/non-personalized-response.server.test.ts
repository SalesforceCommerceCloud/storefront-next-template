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
import { describe, expect, it, vi } from 'vitest';
import type { MiddlewareCallbackParams } from '@/scapi';
import {
    createNonPersonalizedResponseMiddleware,
    type NonPersonalizedResponseClassifier,
    type NonPersonalizedResponseClassifierErrorContext,
} from './non-personalized-response.server';

const baseUrl = 'https://example.com/product/shopper-products/v1';
const schemaPath = '/organizations/{organizationId}/products/{id}';

const createMiddleware = (
    classifier: NonPersonalizedResponseClassifier,
    onError?: (error: unknown, context: NonPersonalizedResponseClassifierErrorContext) => void,
    onPersonalization?: (id: string, mode: 'automatic-none' | 'explicit') => void
) =>
    createNonPersonalizedResponseMiddleware({
        client: 'shopperProducts',
        provenance: 'built-in',
        clientBasePath: '/product/shopper-products/v1',
        expectedBaseUrl: `${baseUrl}/`,
        classifier,
        onError,
        onPersonalization,
    });

const run = async (
    classifier: NonPersonalizedResponseClassifier,
    request = new Request(
        `${baseUrl}/organizations/org/products/product?siteId=site&expand=images%2Clinks&expand=variations`
    ),
    overrides: Partial<MiddlewareCallbackParams> = {},
    onError?: (error: unknown, context: NonPersonalizedResponseClassifierErrorContext) => void,
    onPersonalization?: (id: string, mode: 'automatic-none' | 'explicit') => void
) => {
    const middleware = createMiddleware(classifier, onError, onPersonalization);
    return await middleware.onRequest?.({
        request,
        schemaPath,
        params: { path: { organizationId: 'org', id: 'product', ids: ['one', 'two'] } },
        id: 'request-id',
        options: {
            baseUrl,
            parseAs: 'json',
            querySerializer: () => '',
            bodySerializer: JSON.stringify,
            fetch,
        },
        ...overrides,
    });
};

describe('createNonPersonalizedResponseMiddleware', () => {
    it('adds personalized=none only after literal true and preserves Request extensions', async () => {
        const request = new Request(`${baseUrl}/organizations/org/products/product?siteId=site`);
        Object.defineProperty(request, 'trace', { value: 'request-extension', enumerable: true });

        const result = await run(() => true, request);

        expect(result).toBeInstanceOf(Request);
        expect(result).not.toBe(request);
        expect(new URL((result as Request).url).searchParams.get('personalized')).toBe('none');
        expect((result as Request & { trace: string }).trace).toBe('request-extension');
    });

    it.each([
        ['automatic classification', '', 'automatic-none'],
        ['explicit personalization', '?personalized=custom', 'explicit'],
    ] as const)('reports %s with the native request ID', async (_label, query, mode) => {
        const onPersonalization = vi.fn();
        await run(
            () => true,
            new Request(`${baseUrl}/organizations/org/products/product${query}`),
            {},
            undefined,
            onPersonalization
        );

        expect(onPersonalization).toHaveBeenCalledWith('request-id', mode);
    });

    it('preserves existing query serialization when adding personalized=none', async () => {
        const request = new Request(`${baseUrl}/organizations/org/products/product?q=two%20words&path=%2Fvalue`);

        const result = await run(() => true, request);

        expect((result as Request).url).toBe(`${request.url}&personalized=none`);
    });

    it('passes detached final request state to the classifier', async () => {
        const classifier = vi.fn<NonPersonalizedResponseClassifier>((input) => {
            input.request.headers.set('x-classifier', 'changed');
            (input.path.ids as string[]).push('changed');
            (input.query.expand as string[]).push('changed');
            return false;
        });
        const request = new Request(
            `${baseUrl}/organizations/org/products/product?expand=images%2Clinks&expand=variations&siteId=site&tag=a&tag=b`
        );

        const result = await run(classifier, request);

        expect(result).toBe(request);
        expect(request.headers.has('x-classifier')).toBe(false);
        expect(classifier).toHaveBeenCalledWith({
            client: 'shopperProducts',
            provenance: 'built-in',
            clientBasePath: '/product/shopper-products/v1',
            schemaPath,
            method: 'GET',
            destination: baseUrl,
            request: expect.any(Request),
            siteId: 'site',
            expand: ['images', 'links', 'variations'],
            path: { organizationId: 'org', id: 'product', ids: ['one', 'two', 'changed'] },
            query: {
                expand: ['images,links', 'variations', 'changed'],
                siteId: 'site',
                tag: ['a', 'b'],
            },
        });
    });

    it('keeps prototype-named query parameters as own data', async () => {
        const classifier = vi.fn<NonPersonalizedResponseClassifier>(() => false);
        const request = new Request(`${baseUrl}/organizations/org/products/product?__proto__=first&__proto__=second`);

        await run(classifier, request);

        const query = classifier.mock.calls[0][0].query;
        expect(Object.getPrototypeOf(query)).toBeNull();
        expect(Object.hasOwn(query, '__proto__')).toBe(true);
        expect(query.__proto__).toEqual(['first', 'second']);
    });

    it.each([
        ['non-GET request', new Request(`${baseUrl}/organizations/org/products/product`, { method: 'POST' }), {}],
        [
            'explicit personalization',
            new Request(`${baseUrl}/organizations/org/products/product?personalized=none`),
            {},
        ],
        ['different origin', new Request('https://other.example.com/product/shopper-products/v1/products'), {}],
        ['different client base path', new Request('https://example.com/search/shopper-search/v1/products'), {}],
        [
            'effective base URL override',
            new Request(`${baseUrl}/organizations/org/products/product`),
            { options: { baseUrl: 'https://example.com/alternate' } },
        ],
    ])('skips classification for %s', async (_label, request, overrides) => {
        const classifier = vi.fn<NonPersonalizedResponseClassifier>(() => true);

        const result = await run(classifier, request, overrides as Partial<MiddlewareCallbackParams>);

        expect(result).toBe(request);
        expect(classifier).not.toHaveBeenCalled();
    });

    it('accepts an explicitly supplied normalization-equivalent base URL', async () => {
        const result = await run(() => true, new Request(`${baseUrl}/organizations/org/products/product`), {
            options: { baseUrl: `${baseUrl}/` },
        } as Partial<MiddlewareCallbackParams>);

        expect(new URL((result as Request).url).searchParams.get('personalized')).toBe('none');
    });

    it.each([
        [
            'throws',
            () => {
                throw new Error('classifier failed');
            },
        ],
        ['returns a non-boolean', () => 'invalid' as unknown as boolean],
    ])('reports when the classifier %s and dispatches the original request', async (_label, classifier) => {
        const onError = vi.fn();
        const request = new Request(`${baseUrl}/organizations/org/products/product?siteId=site&secret=value`);

        const result = await run(classifier, request, {}, onError);

        expect(result).toBe(request);
        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0][1]).toEqual({
            client: 'shopperProducts',
            provenance: 'built-in',
            schemaPath,
            siteId: 'site',
        });
        expect(JSON.stringify(onError.mock.calls[0][1])).not.toContain('secret');
    });

    it('continues when error reporting also fails', async () => {
        const request = new Request(`${baseUrl}/organizations/org/products/product`);

        const result = await run(
            () => {
                throw new Error('classifier failed');
            },
            request,
            {},
            () => {
                throw new Error('logger failed');
            }
        );

        expect(result).toBe(request);
    });
});
