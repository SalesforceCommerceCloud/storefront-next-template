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

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { loader } from './_app.wishlist';
import { createTestContext, ROUTE_PATTERN } from '@/lib/test-utils';

// SCAPI clients are exercised by loadWishlistPageData; mock them so the loader
// path can run without hitting the network.
const mockGetProducts = vi.fn();
const mockGetCustomerProductLists = vi.fn();
const mockGetCustomerProductList = vi.fn();

const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => mockLogger),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => mockLogger),
}));

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({
        shopperProducts: {
            getProducts: mockGetProducts,
        },
        shopperCustomers: {
            getCustomerProductLists: mockGetCustomerProductLists,
            getCustomerProductList: mockGetCustomerProductList,
        },
    }),
}));

const mockGetAuthServer = vi.fn();
const mockGetConfig = vi.fn();

vi.mock('@/middlewares/auth.server', () => ({
    getAuth: () => mockGetAuthServer(),
}));

vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>();
    return {
        ...actual,
        getConfig: () => mockGetConfig(),
        useConfig: () => mockGetConfig(),
    };
});

// buildUrlFromContext returns the prefixed path for a redirect; mock to return
// the bare input so the assertion against `Location` is straightforward.
vi.mock('@/lib/url.server', () => ({
    buildUrlFromContext: (path: string) => path,
}));

describe('_app.wishlist loader', () => {
    const mockContext = createTestContext();

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetConfig.mockReturnValue({
            search: {
                products: {
                    hits: {
                        limit: 24,
                    },
                },
            },
            commerce: {
                api: {
                    organizationId: 'test-org-id',
                    siteId: 'test-site-id',
                },
            },
        });
    });

    test('redirects to /account/wishlist when userType is registered with a valid customerId', async () => {
        mockGetAuthServer.mockReturnValue({
            userType: 'registered',
            customerId: 'registered-customer-id',
            accessToken: 'token',
            accessTokenExpiry: Date.now() + 3_600_000,
        });

        // React Router's redirect() throws a Response — capture it and inspect the redirect target.
        const thrown = await loader({
            context: mockContext,
            request: new Request('http://localhost/wishlist'),
            url: new URL('http://localhost/wishlist'),
            params: { siteId: 'test-site', localeId: 'en-US' },
            pattern: ROUTE_PATTERN,
        }).then(
            () => {
                throw new Error('Loader should have thrown a redirect Response');
            },
            (err: unknown) => err
        );

        expect(thrown).toBeInstanceOf(Response);
        const response = thrown as Response;
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('/account/wishlist');

        expect(mockGetCustomerProductLists).not.toHaveBeenCalled();
    });

    test('returns empty wishlist payload for guest userType', async () => {
        mockGetAuthServer.mockReturnValue({
            userType: 'guest',
            customerId: 'guest-customer-id',
            accessToken: 'token',
            accessTokenExpiry: Date.now() + 3_600_000,
        });

        mockGetCustomerProductLists.mockResolvedValue({
            data: { data: [] },
        });

        const result = await loader({
            context: mockContext,
            request: new Request('http://localhost/wishlist'),
            url: new URL('http://localhost/wishlist'),
            params: { siteId: 'test-site', localeId: 'en-US' },
            pattern: ROUTE_PATTERN,
        });

        expect(result.wishlist).toBeNull();
        expect(result.items).toEqual([]);
        await expect(result.productsByProductId).resolves.toEqual({});
        expect(mockGetCustomerProductLists).toHaveBeenCalledWith({
            params: {
                path: { customerId: 'guest-customer-id' },
            },
        });
    });

    test('returns guest wishlist with items when SCAPI returns a list', async () => {
        mockGetAuthServer.mockReturnValue({
            userType: 'guest',
            customerId: 'guest-customer-id',
            accessToken: 'token',
            accessTokenExpiry: Date.now() + 3_600_000,
        });

        const mockWishlist = {
            id: 'list-1',
            type: 'wish_list' as const,
            customerProductListItems: [
                { id: 'item-1', productId: 'product-1', priority: 0, public: false, quantity: 1 },
            ],
        };
        mockGetCustomerProductLists.mockResolvedValue({
            data: { data: [mockWishlist] },
        });
        mockGetProducts.mockResolvedValue({
            data: { data: [{ id: 'product-1', name: 'Product 1' }] },
        });

        const result = await loader({
            context: mockContext,
            request: new Request('http://localhost/wishlist'),
            url: new URL('http://localhost/wishlist'),
            params: { siteId: 'test-site', localeId: 'en-US' },
            pattern: ROUTE_PATTERN,
        });

        expect(result.wishlist).toEqual(mockWishlist);
        expect(result.items).toHaveLength(1);
        await result.productsByProductId;
        expect(mockGetProducts).toHaveBeenCalledTimes(1);
    });

    test('falls through to guest render when registered shopper has no customerId', async () => {
        mockGetAuthServer.mockReturnValue({
            userType: 'registered',
            customerId: undefined,
            accessToken: 'token',
            accessTokenExpiry: Date.now() + 3_600_000,
        });

        const result = await loader({
            context: mockContext,
            request: new Request('http://localhost/wishlist'),
            url: new URL('http://localhost/wishlist'),
            params: { siteId: 'test-site', localeId: 'en-US' },
            pattern: ROUTE_PATTERN,
        });

        expect(result.wishlist).toBeNull();
        expect(result.items).toEqual([]);
        await expect(result.productsByProductId).resolves.toEqual({});
        expect(mockGetCustomerProductLists).not.toHaveBeenCalled();
    });

    test('falls through to guest render when registered shopper session has expired', async () => {
        mockGetAuthServer.mockReturnValue({
            userType: 'registered',
            customerId: 'registered-customer-id',
            accessToken: 'token',
            accessTokenExpiry: Date.now() - 1_000,
        });

        const result = await loader({
            context: mockContext,
            request: new Request('http://localhost/wishlist'),
            url: new URL('http://localhost/wishlist'),
            params: { siteId: 'test-site', localeId: 'en-US' },
            pattern: ROUTE_PATTERN,
        });

        expect(result.wishlist).toBeNull();
        expect(result.items).toEqual([]);
        await expect(result.productsByProductId).resolves.toEqual({});
        expect(mockGetCustomerProductLists).not.toHaveBeenCalled();
    });
});

describe('_app.wishlist ErrorBoundary', () => {
    test('exports a route-level ErrorBoundary that renders the WishlistLoadError', async () => {
        const { ErrorBoundary } = await import('./_app.wishlist');
        expect(typeof ErrorBoundary).toBe('function');
    });
});
