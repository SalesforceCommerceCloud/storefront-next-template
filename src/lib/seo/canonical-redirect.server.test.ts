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
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/lib/test-utils';
import config from '@/config/server';
import {
    getCanonicalProductRedirect,
    getCanonicalResourceRedirect,
    redirectToCanonicalPath,
} from './canonical-redirect.server';

function catchRedirect(url: string): Response | undefined {
    try {
        redirectToCanonicalPath(new URL(url));
        return undefined;
    } catch (thrown) {
        return thrown as Response;
    }
}

function getResourceRedirect(url: string, canonicalPath: string): Response | undefined {
    return getCanonicalResourceRedirect(new URL(url), canonicalPath);
}

describe('redirectToCanonicalPath', () => {
    it('301-redirects a trailing-slash path to the slash-free path', () => {
        const response = catchRedirect('https://www.example.com/product/123/');

        expect(response).toBeInstanceOf(Response);
        expect(response?.status).toBe(301);
        expect(response?.headers.get('Location')).toBe('/product/123');
    });

    it('preserves the query string on redirect', () => {
        const response = catchRedirect('https://www.example.com/category/mens/?sort=price&utm_source=news');

        expect(response?.status).toBe(301);
        expect(response?.headers.get('Location')).toBe('/category/mens?sort=price&utm_source=news');
    });

    it('collapses repeated trailing slashes to a single clean path', () => {
        const response = catchRedirect('https://www.example.com/product/123///');

        expect(response?.headers.get('Location')).toBe('/product/123');
    });

    it('does not redirect a path that already has no trailing slash', () => {
        expect(catchRedirect('https://www.example.com/product/123')).toBeUndefined();
    });

    it('exempts the root path so it cannot loop', () => {
        expect(catchRedirect('https://www.example.com/')).toBeUndefined();
    });
});

describe('getCanonicalResourceRedirect', () => {
    it('redirects a stale path once while preserving the request query', () => {
        const response = getResourceRedirect(
            'https://internal.example/global/en/p/old-slug/p1?color=blue&utm_source=news',
            '/global/en/p/current-slug/p1'
        );

        expect(response?.status).toBe(301);
        expect(response?.headers.get('Location')).toBe('/global/en/p/current-slug/p1?color=blue&utm_source=news');
    });

    it('retains request tracking and canonical site and locale query parameters', () => {
        const response = getResourceRedirect(
            'https://internal.example/p/old-slug/p1?utm_source=news&color=blue',
            '/p/current-slug/p1?site=global&lng=fr'
        );

        expect(response?.status).toBe(301);
        expect(response?.headers.get('Location')).toBe(
            '/p/current-slug/p1?utm_source=news&color=blue&site=global&lng=fr'
        );
    });

    it('lets canonical query context override a colliding request parameter', () => {
        const response = getResourceRedirect(
            'https://internal.example/p/old-slug/p1?lng=stale&utm_source=news',
            '/p/current-slug/p1?lng=fr&site=global'
        );

        expect(response?.headers.get('Location')).toBe('/p/current-slug/p1?utm_source=news&lng=fr&site=global');
    });

    it('does not redirect an already canonical encoded path', () => {
        expect(
            getResourceRedirect(
                'https://internal.example/global/fr/p/caf%C3%A9/p1?color=blue',
                '/global/fr/p/caf%C3%A9/p1'
            )
        ).toBeUndefined();
    });

    it.each([
        'https://evil.example/p/p1',
        '//evil.example/p/p1',
        '/\\evil.example/p/p1',
    ])('rejects a non-relative or backslash destination: %s', (canonicalPath) => {
        expect(getResourceRedirect('https://internal.example/p/old/p1', canonicalPath)).toBeUndefined();
    });
});

describe('getCanonicalProductRedirect', () => {
    const context = createTestContext({
        locale: 'en-US',
        appConfig: {
            url: {
                ...config.app.url,
                seoRoutes: {
                    [config.app.defaultSiteId]: {
                        product: { prefix: 'p' },
                        category: { prefix: 'c', mode: 'id-suffix' },
                    },
                },
            },
        },
    });

    it('redirects extra default-route segments without requiring a product slug', () => {
        const defaultRouteContext = createTestContext({
            locale: 'en-US',
            appConfig: {
                url: {
                    ...config.app.url,
                    seoRoutes: undefined,
                },
            },
        });
        const response = getCanonicalProductRedirect({
            requestUrl: new URL('https://example.com/global/en-US/p/arbitrary/p1?color=blue'),
            context: defaultRouteContext,
            productId: 'p1',
            product: { id: 'p1' },
        });

        expect(response?.status).toBe(301);
        expect(response?.headers.get('Location')).toBe('/global/en-US/p/p1?color=blue');
    });

    it('does not invent a slug when the product response omits it', () => {
        expect(
            getCanonicalProductRedirect({
                requestUrl: new URL('https://example.com/global/en-US/p/old/p1'),
                context,
                productId: 'p1',
                product: { id: 'p1' },
            })
        ).toBeUndefined();
    });

    it.each(['.', '..', '\uD800'])('does not redirect for an unsafe product slug: %s', (slug) => {
        expect(
            getCanonicalProductRedirect({
                requestUrl: new URL('https://example.com/global/en-US/p/old/p1'),
                context,
                productId: 'p1',
                product: { id: 'p1', slug },
            })
        ).toBeUndefined();
    });

    it('redirects a stale path using the encoded Unicode slug and preserves the query', () => {
        const response = getCanonicalProductRedirect({
            requestUrl: new URL('https://example.com/global/en-US/p/old/p1?color=blue'),
            context,
            productId: 'p1',
            product: { id: 'p1', slug: 'current café' },
        });

        expect(response).toBeInstanceOf(Response);
        expect(response?.status).toBe(301);
        expect(response?.headers.get('Location')).toBe('/global/en-US/p/current%20caf%C3%A9/p1?color=blue');
    });

    it('does not combine a resolved variant slug with a master route ID', () => {
        expect(
            getCanonicalProductRedirect({
                requestUrl: new URL('https://example.com/global/en-US/p/master-slug/master-1?pid=variant-1'),
                context,
                productId: 'master-1',
                product: { id: 'variant-1', slug: 'variant-slug' },
            })
        ).toBeUndefined();
    });
});
