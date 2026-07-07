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
import type { RouterContextProvider } from 'react-router';
import type { ShopperProducts } from '@/scapi';
import { loader } from './_app.product.$productId';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { authContext } from '@/middlewares/auth.utils';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';

// Mock fetchProductById and fetchCategory directly
const mockFetchProductById = vi.hoisted(() => vi.fn());
const mockFetchCategory = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/products.server', () => ({
    fetchProductById: mockFetchProductById,
}));

vi.mock('@/lib/api/categories.server', () => ({
    fetchCategory: mockFetchCategory,
}));

vi.mock('@/lib/wishlist/fetch-initial-state.server', () => ({
    fetchWishlistInitialState: vi.fn(() => Promise.resolve({ customerId: null, productIds: new Set() })),
}));

// Mock Page Designer functions - use vi.hoisted to avoid hoisting issues
const mockFetchPageWithComponentData = vi.hoisted(() =>
    vi.fn(() =>
        Promise.resolve({
            id: 'pdp',
            typeId: 'page',
            aspectTypeId: 'pdp',
            name: 'Product Detail Page',
            regions: [],
            componentData: {},
        })
    )
);

vi.mock('@/lib/page-designer/page-loader.server', () => ({
    fetchPageWithComponentData: mockFetchPageWithComponentData,
}));

// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { selectedStoreContext } from '@/extensions/store-locator/middlewares/selected-store.server';
// @sfdc-extension-block-end SFDC_EXT_BOPIS

describe('Product Route Loaders', () => {
    const mockProduct: ShopperProducts.schemas['Product'] = {
        id: 'test-product-123',
        name: 'Test Product',
        primaryCategoryId: 'test-category-123',
        shortDescription: 'Test product description',
        longDescription: 'Long test product description',
        master: undefined,
    };

    const mockCategory: ShopperProducts.schemas['Category'] = {
        id: 'test-category-123',
        name: 'Test Category',
        parentCategoryId: 'parent-category-123',
        categories: [],
    };

    const mockAppConfig = {
        commerce: {
            api: {
                organizationId: 'test-org',
                siteId: 'test-site',
                clientId: 'test-client-id',
                proxy: '/api/commerce',
            },
        },
        sitePreferences: {
            productDetailSitePreferences: {},
        },
    };

    const mockAuthSession = {
        ref: Promise.resolve({
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            token_type: 'Bearer',
        }),
    };

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    let mockSelectedStoreInfo: { id?: string; name?: string; inventoryId?: string } | null = null;
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    const mockContext = {
        locale: 'en-US',
        currency: 'USD',
        siteId: 'test-site',
        get: vi.fn((context) => {
            if (context === appConfigContext) {
                return mockAppConfig;
            }
            if (context === authContext) {
                return mockAuthSession;
            }
            if (context === siteContext) {
                return { currency: 'USD', site: { id: 'test-site' }, locale: { id: 'en-US' } };
            }
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            if (context === selectedStoreContext) {
                return mockSelectedStoreInfo;
            }
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
            return undefined;
        }),
        set: vi.fn(),
    } as unknown as Readonly<RouterContextProvider>;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('loader function', () => {
        test('fetches product data successfully', async () => {
            mockFetchProductById.mockResolvedValueOnce(mockProduct);
            mockFetchCategory.mockResolvedValue(mockCategory);

            const request = new Request('https://example.com/product/test-product-123');
            const params = { productId: 'test-product-123' };
            const context = mockContext;

            const result = await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            // product is now synchronous on the loaderData
            expect(result.product).toEqual(mockProduct);

            // category is still a Promise
            const categoryData = await result.category;
            expect(categoryData).toEqual(mockCategory);

            expect(mockFetchProductById).toHaveBeenCalledWith(
                context,
                'test-product-123',
                expect.objectContaining({ allImages: true, perPricebook: true })
            );
            expect(mockFetchCategory).toHaveBeenCalledWith(context, 'test-category-123', 1);
        });

        test('throws Response with original status when product fetch fails with NormalizedApiError', async () => {
            const { NormalizedApiError } = await import('@/lib/api/normalized-api-error');
            const { ApiError } = await import('@/scapi');

            const apiError = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers(),
                body: { type: 'Not Found', title: 'Not Found', detail: 'Product not found' },
                rawBody: JSON.stringify({ detail: 'Product not found' }),
                url: 'https://api.example.com/products/nonexistent',
                method: 'GET',
            });
            mockFetchProductById.mockRejectedValueOnce(new NormalizedApiError(apiError));

            const request = new Request('https://example.com/product/nonexistent');
            const params = { productId: 'nonexistent' };
            const context = mockContext;

            const error = await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            }).then(
                () => {
                    throw new Error('expected loader to throw a Response');
                },
                (e: unknown) => e
            );

            expect(error).toBeInstanceOf(Response);
            const response = error as Response;
            expect(response.status).toBe(404);
            expect(await response.text()).toBe('Product not found');
        });

        test('throws Response 500 when product fetch fails with non-API error', async () => {
            const { NormalizedApiError } = await import('@/lib/api/normalized-api-error');
            mockFetchProductById.mockRejectedValueOnce(new NormalizedApiError(new TypeError('Network failure')));

            const request = new Request('https://example.com/product/sku-network');
            const params = { productId: 'sku-network' };
            const context = mockContext;

            const error = await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            }).then(
                () => {
                    throw new Error('expected loader to throw a Response');
                },
                (e: unknown) => e
            );

            expect(error).toBeInstanceOf(Response);
            expect((error as Response).status).toBe(500);
        });

        test('throws Response 404 when fetchProductById returns null', async () => {
            mockFetchProductById.mockResolvedValueOnce(null);

            const request = new Request('https://example.com/product/empty-result');
            const params = { productId: 'empty-result' };
            const context = mockContext;

            const error = await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            }).then(
                () => {
                    throw new Error('expected loader to throw a Response');
                },
                (e: unknown) => e
            );

            expect(error).toBeInstanceOf(Response);
            expect((error as Response).status).toBe(404);
        });

        test('propagates category fetch failure on the deferred promise (route-level <Await errorElement> degrades silently)', async () => {
            const { NormalizedApiError } = await import('@/lib/api/normalized-api-error');
            mockFetchProductById.mockResolvedValueOnce(mockProduct);
            mockFetchCategory.mockRejectedValueOnce(new NormalizedApiError(new Error('Category service down')));

            const request = new Request('https://example.com/product/test-product-123');
            const params = { productId: 'test-product-123' };
            const context = mockContext;

            const result = await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            // Product still resolves
            expect(result.product).toEqual(mockProduct);

            // Category promise rejects — render-time silent degradation is handled by
            // <Await errorElement={null}> at the route level, not by a loader-side .catch().
            await expect(result.category).rejects.toThrow(NormalizedApiError);
        });

        test('handles variant product with master product category', async () => {
            const variantProduct = {
                ...mockProduct,
                id: 'variant-product-123',
                primaryCategoryId: null,
                master: { masterId: 'master-product-123' },
            };

            const masterProduct = {
                ...mockProduct,
                id: 'master-product-123',
                primaryCategoryId: 'master-category-123',
            };

            mockFetchProductById
                .mockResolvedValueOnce(variantProduct) // First call for variant (loader's await)
                .mockResolvedValueOnce(masterProduct); // Second call for master (inside category promise)
            mockFetchCategory.mockResolvedValue(mockCategory);

            const request = new Request('https://example.com/product/variant-product-123');
            const params = { productId: 'variant-product-123' };
            const context = mockContext;

            const result = await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            expect(result.product).toEqual(variantProduct);

            const categoryData = await result.category;
            expect(categoryData).toEqual(mockCategory);

            expect(mockFetchProductById).toHaveBeenCalledTimes(2);
        });

        test('handles product with variant ID in search params', async () => {
            mockFetchProductById.mockResolvedValueOnce(mockProduct);
            mockFetchCategory.mockResolvedValue(mockCategory);

            const request = new Request('https://example.com/product/test-product-123?pid=variant-123');
            const params = { productId: 'test-product-123' };
            const context = mockContext;

            await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            // Should use the pid parameter instead of productId
            expect(mockFetchProductById.mock.calls[0][1]).toBe('variant-123');
        });
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    describe('loader function with BOPIS extension', () => {
        test('includes inventoryIds when store is selected in context', async () => {
            mockFetchProductById.mockResolvedValueOnce(mockProduct);
            mockFetchCategory.mockResolvedValue(mockCategory);

            mockSelectedStoreInfo = {
                id: 'store-123',
                inventoryId: 'inventory-123',
                name: 'Test Store',
            };

            const request = new Request('https://example.com/product/test-product-123');
            const params = { productId: 'test-product-123' };
            const context = mockContext;

            await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            // Verify fetchProductById was called with inventoryIds parameter
            expect(mockFetchProductById).toHaveBeenCalledWith(
                context,
                'test-product-123',
                expect.objectContaining({ inventoryIds: ['inventory-123'] })
            );

            mockSelectedStoreInfo = null;
        });

        test('does not include inventoryIds when store is not selected', async () => {
            mockFetchProductById.mockResolvedValueOnce(mockProduct);
            mockFetchCategory.mockResolvedValue(mockCategory);
            mockSelectedStoreInfo = null;

            const request = new Request('https://example.com/product/test-product-123');
            const params = { productId: 'test-product-123' };
            const context = mockContext;

            await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            // Verify fetchProductById was called without inventoryIds parameter
            expect(mockFetchProductById.mock.calls[0][2]).not.toHaveProperty('inventoryIds');
        });

        test('handles store info without inventoryId', async () => {
            mockFetchProductById.mockResolvedValueOnce(mockProduct);
            mockFetchCategory.mockResolvedValue(mockCategory);

            mockSelectedStoreInfo = {
                id: 'store-123',
                name: 'Test Store',
                // No inventoryId
            };

            const request = new Request('https://example.com/product/test-product-123');
            const params = { productId: 'test-product-123' };
            const context = mockContext;

            await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            // Verify fetchProductById was called without inventoryIds parameter
            expect(mockFetchProductById.mock.calls[0][2]).not.toHaveProperty('inventoryIds');

            mockSelectedStoreInfo = null;
        });
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    describe('getPageData helper function', () => {
        test('uses pid parameter when present in URL', async () => {
            mockFetchProductById.mockResolvedValueOnce(mockProduct);
            mockFetchCategory.mockResolvedValue(mockCategory);

            const request = new Request('https://example.com/product/test-product-123?pid=variant-456');
            const params = { productId: 'test-product-123' };
            const context = mockContext;

            await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            // Should use the pid parameter instead of productId
            expect(mockFetchProductById.mock.calls[0][1]).toBe('variant-456');
        });

        test('uses productId when pid parameter is not present', async () => {
            mockFetchProductById.mockResolvedValueOnce(mockProduct);
            mockFetchCategory.mockResolvedValue(mockCategory);

            const request = new Request('https://example.com/product/test-product-123');
            const params = { productId: 'test-product-123' };
            const context = mockContext;

            await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            // Should use the productId from params
            expect(mockFetchProductById.mock.calls[0][1]).toBe('test-product-123');
        });

        test('includes all required expand parameters', async () => {
            mockFetchProductById.mockResolvedValueOnce(mockProduct);
            mockFetchCategory.mockResolvedValue(mockCategory);

            const request = new Request('https://example.com/product/test-product-123');
            const params = { productId: 'test-product-123' };
            const context = mockContext;

            await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            const callOptions = mockFetchProductById.mock.calls[0][2];
            expect(callOptions.expand).toContain('availability');
            expect(callOptions.expand).toContain('bundled_products');
            expect(callOptions.expand).toContain('images');
            expect(callOptions.expand).toContain('options');
            expect(callOptions.expand).toContain('page_meta_tags');
            expect(callOptions.expand).toContain('prices');
            expect(callOptions.expand).toContain('promotions');
            expect(callOptions.expand).toContain('set_products');
            expect(callOptions.expand).toContain('variations');
            expect(callOptions.allImages).toBe(true);
            expect(callOptions.perPricebook).toBe(true);
        });

        test('handles product without primaryCategoryId', async () => {
            const productWithoutCategory = {
                ...mockProduct,
                primaryCategoryId: null,
            };

            mockFetchProductById.mockResolvedValueOnce(productWithoutCategory);

            const request = new Request('https://example.com/product/test-product-123');
            const params = { productId: 'test-product-123' };
            const context = mockContext;

            const result = await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            const categoryData = await result.category;
            expect(categoryData).toBeUndefined();
            expect(mockFetchCategory).not.toHaveBeenCalled();
        });

        test('handles variant product without master product ID', async () => {
            const variantProductWithoutMaster = {
                ...mockProduct,
                id: 'variant-product-123',
                primaryCategoryId: null,
                master: undefined, // No master product
            };

            mockFetchProductById.mockResolvedValueOnce(variantProductWithoutMaster);

            const request = new Request('https://example.com/product/variant-product-123');
            const params = { productId: 'variant-product-123' };
            const context = mockContext;

            const result = await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            const categoryData = await result.category;
            expect(categoryData).toBeUndefined();
            // Should not try to fetch master product category
            expect(mockFetchProductById).toHaveBeenCalledTimes(1);
        });

        test('handles variant product with master but master has no category', async () => {
            const variantProduct = {
                ...mockProduct,
                id: 'variant-product-123',
                primaryCategoryId: null,
                master: {
                    masterId: 'master-product-123',
                },
            };

            const masterProductWithoutCategory = {
                ...mockProduct,
                id: 'master-product-123',
                primaryCategoryId: null, // Master also has no category
            };

            mockFetchProductById
                .mockResolvedValueOnce(variantProduct) // First call for variant
                .mockResolvedValueOnce(masterProductWithoutCategory); // Second call for master

            const request = new Request('https://example.com/product/variant-product-123');
            const params = { productId: 'variant-product-123' };
            const context = mockContext;

            const result = await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            const categoryData = await result.category;
            expect(categoryData).toBeUndefined();
            expect(mockFetchProductById).toHaveBeenCalledTimes(2);
            expect(mockFetchCategory).not.toHaveBeenCalled();
        });

        test('propagates category fetch failure on the deferred promise', async () => {
            const { NormalizedApiError } = await import('@/lib/api/normalized-api-error');
            mockFetchProductById.mockResolvedValueOnce(mockProduct);
            mockFetchCategory.mockRejectedValueOnce(new NormalizedApiError(new Error('Category not found')));

            const request = new Request('https://example.com/product/test-product-123');
            const params = { productId: 'test-product-123' };
            const context = mockContext;

            const result = await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            await expect(result.category).rejects.toThrow(NormalizedApiError);
        });

        test('passes primaryCategoryId to fetchPageWithComponentData as the category fallback', async () => {
            mockFetchProductById.mockResolvedValueOnce(mockProduct);
            mockFetchCategory.mockResolvedValue(mockCategory);

            const request = new Request('https://example.com/product/test-product-123');
            const params = { productId: 'test-product-123' };

            await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context: mockContext,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            expect(mockFetchPageWithComponentData).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    aspectType: 'pdp',
                    productId: 'test-product-123',
                    categoryId: 'test-category-123',
                })
            );
        });

        test('omits categoryId from fetchPageWithComponentData when product has no primaryCategoryId', async () => {
            const productWithoutCategory = {
                ...mockProduct,
                primaryCategoryId: null,
            };
            mockFetchProductById.mockResolvedValueOnce(productWithoutCategory);

            const request = new Request('https://example.com/product/test-product-123');
            const params = { productId: 'test-product-123' };

            await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context: mockContext,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            expect(mockFetchPageWithComponentData).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ aspectType: 'pdp', productId: 'test-product-123' })
            );
            expect(mockFetchPageWithComponentData).not.toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ categoryId: expect.anything() })
            );
        });

        test('uses variant pid as productId for fetchPageWithComponentData', async () => {
            const variantProduct = { ...mockProduct, id: 'variant-pid-123', primaryCategoryId: 'variant-cat-123' };
            mockFetchProductById.mockResolvedValueOnce(variantProduct);
            mockFetchCategory.mockResolvedValue(mockCategory);

            const request = new Request('https://example.com/product/test-product-123?pid=variant-pid-123');
            const params = { productId: 'test-product-123' };

            await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context: mockContext,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            expect(mockFetchPageWithComponentData).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    aspectType: 'pdp',
                    productId: 'variant-pid-123',
                    categoryId: 'variant-cat-123',
                })
            );
        });

        test('falls back to the master product category for fetchPageWithComponentData when the variant has none', async () => {
            const variantProduct = {
                ...mockProduct,
                id: 'variant-product-123',
                primaryCategoryId: null,
                master: { masterId: 'master-product-123' },
            };
            const masterProduct = {
                ...mockProduct,
                id: 'master-product-123',
                primaryCategoryId: 'master-category-123',
            };

            mockFetchProductById
                .mockResolvedValueOnce(variantProduct) // loader's awaited product fetch
                .mockResolvedValueOnce(masterProduct); // shared master fetch
            mockFetchCategory.mockResolvedValue(mockCategory);

            const request = new Request('https://example.com/product/variant-product-123');
            const params = { productId: 'variant-product-123' };

            const result = await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context: mockContext,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            // Resolve the deferred page promise so the master-category fallback runs.
            await result.page;

            expect(mockFetchPageWithComponentData).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    aspectType: 'pdp',
                    productId: 'variant-product-123',
                    categoryId: 'master-category-123',
                })
            );

            // The master is fetched once and shared by both the breadcrumb category
            // promise and the page-fallback promise — not re-fetched per consumer.
            expect(mockFetchProductById).toHaveBeenCalledTimes(2);
        });

        test('handles variant product with master product category lookup', async () => {
            const variantProduct = {
                ...mockProduct,
                id: 'variant-product-123',
                primaryCategoryId: null,
                master: {
                    masterId: 'master-product-123',
                },
            };

            const masterProduct = {
                ...mockProduct,
                id: 'master-product-123',
                primaryCategoryId: 'master-category-123',
            };

            mockFetchProductById
                .mockResolvedValueOnce(variantProduct) // First call for variant
                .mockResolvedValueOnce(masterProduct); // Second call for master
            mockFetchCategory.mockResolvedValue(mockCategory);

            const request = new Request('https://example.com/product/variant-product-123');
            const params = { productId: 'variant-product-123' };
            const context = mockContext;

            const result = await loader({
                request,
                params: { siteId: 'test-site', localeId: 'en-US', ...params },
                context,
                url: new URL(request.url),
                pattern: '/product/:productId',
            });

            expect(result.product).toEqual(variantProduct);

            const categoryData = await result.category;
            expect(categoryData).toEqual(mockCategory);

            // Verify both product calls were made
            expect(mockFetchProductById).toHaveBeenCalledTimes(2);
            expect(mockFetchProductById.mock.calls[0][1]).toBe('variant-product-123');
            expect(mockFetchProductById.mock.calls[1][1]).toBe('master-product-123');
        });
    });
});
