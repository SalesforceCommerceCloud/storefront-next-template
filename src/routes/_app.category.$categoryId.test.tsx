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

import 'reflect-metadata';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { ApiError, type ShopperExperience, type ShopperProducts, type ShopperSearch } from '@/scapi';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
import CategoryPage, { loader, ProductListingPageMetadata, shouldRevalidate } from './_app.category.$categoryId';
import { shouldRevalidate as sharedShouldRevalidate } from '@/lib/revalidation/routes/category';
import { createTestContext } from '@/lib/test-utils';
import { fetchCategory } from '@/lib/api/categories.server';
import { fetchSearchProducts } from '@/lib/api/search.server';
import { fetchPageWithComponentData } from '@/lib/page-designer/page-loader.server';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import type { AppConfig } from '@/types/config';
import { getRegionDefinition } from '@/lib/decorators/region-definition';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { generateCategorySchema } from '@/utils/category-schema';
import { useAnalytics } from '@/hooks/use-analytics';
import type { Route } from './+types/_app.category.$categoryId';

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useNavigation: () => ({ state: 'idle', location: undefined }),
        // CategoryJsonLd reads `nonce` from the root loader. Tests render the page
        // outside a real data router, so stub the lookup with a deterministic value.
        useRouteLoaderData: (id: string) => (id === 'root' ? { nonce: undefined } : undefined),
    };
});

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

type CategoryPageData = Awaited<ReturnType<typeof loader>>;

// Mock data
const mockCategory: ShopperProducts.schemas['Category'] = {
    id: 'electronics',
    name: 'Electronics',
    pageDescription: 'Shop the latest electronics',
    parentCategoryTree: [
        { id: 'root', name: 'Home' },
        { id: 'tech', name: 'Technology' },
    ],
};

const mockSearchResult: ShopperSearch.schemas['ProductSearchResult'] = {
    hits: [
        {
            productId: 'product-1',
            productName: 'Product 1',
            image: { alt: 'Product 1', link: '/product1.jpg' },
            price: 29.99,
            currency: 'USD',
            inventory: { ats: 10 },
            representedProduct: {
                id: 'product-1',
                imageGroups: [],
                variants: [],
                type: { master: true },
            } as any,
        },
        {
            productId: 'product-2',
            productName: 'Product 2',
            image: { alt: 'Product 2', link: '/product2.jpg' },
            price: 49.99,
            currency: 'USD',
            inventory: { ats: 5 },
            representedProduct: {
                id: 'product-2',
                imageGroups: [],
                variants: [],
                type: { master: true },
            } as any,
        },
    ],
    total: 25,
    refinements: [],
    searchPhraseSuggestions: { suggestedTerms: [] },
    sortingOptions: [
        { id: 'best-matches', label: 'Best Matches' },
        { id: 'price-low-to-high', label: 'Price: Low to High' },
    ],
    selectedSortingOption: 'best-matches',
    selectedRefinements: {},
    offset: 0,
    limit: 10,
    query: '',
};

// Helper function to create mock Page objects
const createMockPage = (regions: any[] = []): ShopperExperience.schemas['Page'] =>
    ({
        id: 'plp',
        typeId: 'plp',
        designMetadata: {
            regionDefinitions: regions.map((region) => ({ id: region.id })),
        } as never,
        regions,
    }) as ShopperExperience.schemas['Page'];

// Mock the Region component - simplified since we don't test region behavior
vi.mock('@/components/region', () => ({
    Region: () => null,
}));

// Mock DeferredProductGrid component
vi.mock('@/components/product-grid', () => ({
    default: function DeferredProductGridMock({ critical, nonCriticalCount, handleProductClick }: any) {
        return (
            <div data-testid="product-grid">
                <div data-testid="critical-count" style={{ display: 'none' }}>
                    {critical?.length ?? 0}
                </div>
                <div data-testid="non-critical-skeleton-count" style={{ display: 'none' }}>
                    {nonCriticalCount ?? 0}
                </div>
                {critical?.map((product: any) => (
                    <div
                        key={product.productId}
                        data-testid="product-item"
                        onClick={() => handleProductClick?.(product)}>
                        {product.productName}
                    </div>
                ))}
            </div>
        );
    },
}));

// Mock other components
vi.mock('@/components/category-breadcrumbs', () => ({
    default: ({ category }: any) => <div data-testid="category-breadcrumbs">{category.name}</div>,
}));

vi.mock('@/components/category-pagination', () => ({
    default: ({ limit, offset, total }: any) => (
        <div data-testid="category-pagination">
            {offset}-{Math.min(offset + limit, total)} of {total}
        </div>
    ),
}));

vi.mock('@/components/category-refinements', () => ({
    default: () => <div data-testid="category-refinements" />,
}));

vi.mock('@/components/category-refinements/active-filters', () => ({
    default: () => <div data-testid="active-filters" />,
}));

vi.mock('@/components/category-refinements/filters-button', () => ({
    default: ({ onClick }: any) => (
        <button data-testid="filters-button" onClick={onClick}>
            Filters
        </button>
    ),
}));

vi.mock('@/components/category-sorting', () => ({
    default: () => <div data-testid="category-sorting" />,
}));

vi.mock('@/components/quick-filters', () => ({
    default: () => <div data-testid="quick-filters" />,
}));

vi.mock('@/components/json-ld', () => ({
    JsonLd: ({ id }: any) => <script data-testid={id} type="application/ld+json" />,
}));

// Mock API functions
vi.mock('@/lib/api/categories.server', () => ({
    fetchCategory: vi.fn(),
}));

vi.mock('@/lib/api/search.server', () => ({
    fetchSearchProducts: vi.fn(),
}));

vi.mock('@/lib/page-designer/page-loader.server', () => ({
    fetchPageWithComponentData: vi.fn(),
}));

vi.mock('@/utils/category-schema', () => ({
    generateCategorySchema: vi.fn(),
}));

vi.mock('@/lib/wishlist/fetch-initial-state.server', () => ({
    fetchWishlistInitialState: vi.fn(() => Promise.resolve({ customerId: null, productIds: new Set() })),
}));

// Mock analytics with controllable mock functions
const mockTrackViewCategory = vi.fn();
const mockTrackClickProductInCategory = vi.fn();

vi.mock('@/hooks/use-analytics', () => ({
    useAnalytics: vi.fn(() => ({
        trackViewCategory: mockTrackViewCategory,
        trackClickProductInCategory: mockTrackClickProductInCategory,
    })),
}));

// Mock config
vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal<object>();
    const mockConfigValue = {
        commerce: {
            sites: [
                {
                    id: 'test-site',
                    defaultLocale: 'en-US',
                },
            ],
        },
        search: {
            products: {
                hits: {
                    limit: 10,
                    critical: 2,
                },
            },
        },
    } as AppConfig;
    return {
        ...actual,
        getConfig: vi.fn(() => mockConfigValue),
        useConfig: vi.fn(() => mockConfigValue),
    };
});

describe('CategoryPage', () => {
    const mockContext = createTestContext();
    const mockConfig: AppConfig = {
        commerce: {
            sites: [
                {
                    id: 'test-site',
                    defaultLocale: 'en-US',
                },
            ],
        },
        search: {
            products: {
                hits: {
                    limit: 10,
                    critical: 2,
                },
            },
        },
    } as AppConfig;

    const createLoaderArgs = (url: string, overrides?: { params?: Record<string, string> }): Route.LoaderArgs => ({
        request: new Request(url),
        url: new URL(url),
        context: mockContext,
        params: { siteId: 'test-site', localeId: 'en-US', categoryId: 'electronics', ...overrides?.params },
        pattern: '/category/:categoryId',
    });

    beforeEach(() => {
        vi.clearAllMocks();
        (getConfig as any).mockReturnValue(mockConfig);
        (fetchCategory as any).mockResolvedValue(mockCategory);
        (fetchSearchProducts as any).mockResolvedValue(mockSearchResult);
        (fetchPageWithComponentData as any).mockResolvedValue({
            ...createMockPage(),
            componentData: {},
        });
        (generateCategorySchema as any).mockReturnValue({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Electronics',
        });
    });

    describe('Decorators', () => {
        test('should have PageType decorator', () => {
            const metadata = Reflect.getMetadata('page:type', ProductListingPageMetadata);
            expect(metadata).toBeDefined();
            expect(metadata.name).toBe('Product Listing Page');
            expect(metadata.description).toBe('Product listing page with product listings and personalized content');
            expect(metadata.supportedAspectTypes).toEqual(['plp']);
        });

        test('should have RegionDefinition decorator with three regions', () => {
            const topFullWidthRegion = getRegionDefinition(ProductListingPageMetadata, 'plpTopFullWidth');
            expect(topFullWidthRegion).toBeDefined();
            expect(topFullWidthRegion?.id).toBe('plpTopFullWidth');
            expect(topFullWidthRegion?.name).toBe('Top Full Width Region');
            expect(topFullWidthRegion?.maxComponents).toBe(5);

            const topContentRegion = getRegionDefinition(ProductListingPageMetadata, 'plpTopContent');
            expect(topContentRegion).toBeDefined();
            expect(topContentRegion?.id).toBe('plpTopContent');
            expect(topContentRegion?.name).toBe('Top Content Region');

            const bottomRegion = getRegionDefinition(ProductListingPageMetadata, 'plpBottom');
            expect(bottomRegion).toBeDefined();
            expect(bottomRegion?.id).toBe('plpBottom');
            expect(bottomRegion?.name).toBe('Bottom Region');
        });
    });

    describe('loader', () => {
        test('should fetch category data and search results with correct parameters', async () => {
            const args = createLoaderArgs('https://example.com/category/electronics');

            const result = await loader(args);

            expect(fetchCategory).toHaveBeenCalledWith(mockContext, 'electronics', 1);
            expect(fetchSearchProducts).toHaveBeenCalledWith(mockContext, {
                limit: 2,
                offset: 0,
                sort: '',
                refine: ['cgid=electronics'],
                currency: 'GBP',
            });
            expect(fetchSearchProducts).toHaveBeenCalledWith(mockContext, {
                limit: 8,
                offset: 2,
                sort: '',
                refine: ['cgid=electronics'],
                currency: 'GBP',
            });
            expect(fetchPageWithComponentData).toHaveBeenCalledWith(args, {
                aspectType: 'plp',
                categoryId: 'electronics',
            });
            expect(result.categoryId).toBe('electronics');
            expect(result.category).toEqual(mockCategory);
            expect(result.searchResultCritical).toEqual(mockSearchResult);
        });

        test('should handle query parameters correctly', async () => {
            await loader(
                createLoaderArgs(
                    'https://example.com/category/electronics?offset=20&sort=price-low-to-high&refine=color:red&refine=size:large'
                )
            );

            expect(fetchSearchProducts).toHaveBeenCalledWith(
                mockContext,
                expect.objectContaining({
                    offset: 20,
                    sort: 'price-low-to-high',
                    refine: ['color:red', 'size:large', 'cgid=electronics'],
                })
            );
        });

        test('should honor existing cgid refinement from query params', async () => {
            const result = await loader(
                createLoaderArgs('https://example.com/category/electronics?refine=cgid%3Dwomens&refine=color%3Dblue')
            );

            // Existing cgid should be preserved so quick-filter category selection is respected.
            expect(fetchSearchProducts).toHaveBeenCalledWith(
                mockContext,
                expect.objectContaining({
                    refine: ['color=blue', 'cgid=womens'],
                })
            );
            expect(result.refine).toEqual(['color=blue', 'cgid=womens']);
        });

        test('should return effectiveRefine as refine in loader result', async () => {
            const result = await loader(createLoaderArgs('https://example.com/category/electronics'));

            expect(result.refine).toEqual(['cgid=electronics']);
        });

        test('should parse filters query param into initialFiltersOpen', async () => {
            const openResult = await loader(createLoaderArgs('https://example.com/category/electronics?filters=open'));
            const closedResult = await loader(
                createLoaderArgs('https://example.com/category/electronics?filters=closed')
            );

            expect(openResult.initialFiltersOpen).toBe(true);
            expect(closedResult.initialFiltersOpen).toBe(false);
        });

        test('should throw 404 when category fetch fails with NormalizedApiError 404', async () => {
            const mockApiError = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers({ 'content-type': 'application/json' }),
                body: {
                    type: 'https://api.example.com/errors/not-found',
                    title: 'Category Not Found',
                    detail: 'The requested category does not exist',
                },
                rawBody: JSON.stringify({
                    type: 'https://api.example.com/errors/not-found',
                    title: 'Category Not Found',
                    detail: 'The requested category does not exist',
                }),
                url: 'https://api.example.com/categories/invalid',
                method: 'GET',
            });

            (fetchCategory as any).mockRejectedValue(new NormalizedApiError(mockApiError));

            try {
                await loader(
                    createLoaderArgs('https://example.com/category/invalid', {
                        params: { categoryId: 'invalid' },
                    })
                );
                expect.fail('Expected loader to throw');
            } catch (error: any) {
                expect(error).toBeInstanceOf(Response);
                expect(error.status).toBe(404);
                expect(await error.text()).toBe('The requested category does not exist');
            }
        });

        test('should throw 500 when category fetch fails with NormalizedApiError 500', async () => {
            const mockApiError = new ApiError({
                status: 500,
                statusText: 'Internal Server Error',
                headers: new Headers({ 'content-type': 'application/json' }),
                body: {
                    type: 'https://api.example.com/errors/server-error',
                    title: 'Internal Server Error',
                    detail: 'An unexpected error occurred while processing the request',
                },
                rawBody: JSON.stringify({
                    type: 'https://api.example.com/errors/server-error',
                    title: 'Internal Server Error',
                    detail: 'An unexpected error occurred while processing the request',
                }),
                url: 'https://api.example.com/categories/electronics',
                method: 'GET',
            });

            (fetchCategory as any).mockRejectedValue(new NormalizedApiError(mockApiError));

            try {
                await loader(createLoaderArgs('https://example.com/category/electronics'));
                expect.fail('Expected loader to throw');
            } catch (error: any) {
                expect(error).toBeInstanceOf(Response);
                expect(error.status).toBe(500);
                expect(await error.text()).toBe('An unexpected error occurred while processing the request');
            }
        });

        test('should throw 403 when category fetch fails with NormalizedApiError 403', async () => {
            const mockApiError = new ApiError({
                status: 403,
                statusText: 'Forbidden',
                headers: new Headers({ 'content-type': 'application/json' }),
                body: {
                    type: 'https://api.example.com/errors/forbidden',
                    title: 'Access Denied',
                    detail: 'You do not have permission to access this category',
                },
                rawBody: JSON.stringify({
                    type: 'https://api.example.com/errors/forbidden',
                    title: 'Access Denied',
                    detail: 'You do not have permission to access this category',
                }),
                url: 'https://api.example.com/categories/restricted',
                method: 'GET',
            });

            (fetchCategory as any).mockRejectedValue(new NormalizedApiError(mockApiError));

            try {
                await loader(
                    createLoaderArgs('https://example.com/category/restricted', {
                        params: { categoryId: 'restricted' },
                    })
                );
                expect.fail('Expected loader to throw');
            } catch (error: any) {
                expect(error).toBeInstanceOf(Response);
                expect(error.status).toBe(403);
                expect(await error.text()).toBe('You do not have permission to access this category');
            }
        });

        test('should use body.detail as message when NormalizedApiError body.title is missing', async () => {
            const mockApiError = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers({ 'content-type': 'application/json' }),
                body: {
                    type: 'https://api.example.com/errors/not-found',
                    title: '',
                    detail: 'Category not available',
                },
                rawBody: '{}',
                url: 'https://api.example.com/categories/invalid',
                method: 'GET',
            });

            (fetchCategory as any).mockRejectedValue(new NormalizedApiError(mockApiError));

            try {
                await loader(
                    createLoaderArgs('https://example.com/category/invalid', {
                        params: { categoryId: 'invalid' },
                    })
                );
                expect.fail('Expected loader to throw');
            } catch (error: any) {
                expect(error).toBeInstanceOf(Response);
                expect(error.status).toBe(404);
                expect(await error.text()).toBe('Category not available');
            }
        });

        test('should use statusText as fallback when NormalizedApiError body.detail is missing', async () => {
            const mockApiError = new ApiError({
                status: 404,
                statusText: 'Not Found',
                headers: new Headers({ 'content-type': 'application/json' }),
                body: {
                    type: 'https://api.example.com/errors/not-found',
                    title: 'Category Not Found',
                    detail: '',
                },
                rawBody: '{}',
                url: 'https://api.example.com/categories/invalid',
                method: 'GET',
            });

            (fetchCategory as any).mockRejectedValue(new NormalizedApiError(mockApiError));

            try {
                await loader(
                    createLoaderArgs('https://example.com/category/invalid', {
                        params: { categoryId: 'invalid' },
                    })
                );
                expect.fail('Expected loader to throw');
            } catch (error: any) {
                expect(error).toBeInstanceOf(Response);
                expect(error.status).toBe(404);
                expect(await error.text()).toBe('Not Found');
            }
        });

        test('should throw 500 when category fetch fails with non-ApiError error', async () => {
            (fetchCategory as any).mockRejectedValue(new Error('Unexpected error'));

            try {
                await loader(
                    createLoaderArgs('https://example.com/category/invalid', {
                        params: { categoryId: 'invalid' },
                    })
                );
                expect.fail('Expected loader to throw');
            } catch (error: any) {
                expect(error).toBeInstanceOf(Response);
                expect(error.status).toBe(500);
                expect(await error.text()).toBe('Internal Server Error');
            }
        });

        test('should throw 500 when category fetch fails with network error', async () => {
            (fetchCategory as any).mockRejectedValue(new TypeError('Network request failed'));

            try {
                await loader(createLoaderArgs('https://example.com/category/electronics'));
                expect.fail('Expected loader to throw');
            } catch (error: any) {
                expect(error).toBeInstanceOf(Response);
                expect(error.status).toBe(500);
                expect(await error.text()).toBe('Internal Server Error');
            }
        });

        test('should split search results into critical and non-critical', async () => {
            await loader(createLoaderArgs('https://example.com/category/electronics'));

            expect(fetchSearchProducts).toHaveBeenCalledTimes(2);
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(1, mockContext, {
                limit: 2,
                offset: 0,
                sort: '',
                refine: ['cgid=electronics'],
                currency: 'GBP',
            });
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(2, mockContext, {
                limit: 8,
                offset: 2,
                sort: '',
                refine: ['cgid=electronics'],
                currency: 'GBP',
            });
        });

        test('should generate category schema promise', async () => {
            const result = await loader(createLoaderArgs('https://example.com/category/electronics'));
            const categorySchema = await result.categorySchema;

            expect(categorySchema).toBeDefined();
            expect(generateCategorySchema).toHaveBeenCalledWith({
                category: mockCategory,
                searchResult: expect.objectContaining({
                    ...mockSearchResult,
                    hits: [...(mockSearchResult.hits || []), ...(mockSearchResult.hits || [])],
                }),
                config: mockConfig,
                pageUrl: 'https://example.com/category/electronics',
                defaultCurrency: 'GBP',
            });
        });

        test('should handle category schema generation errors gracefully', async () => {
            (generateCategorySchema as any).mockImplementation(() => {
                throw new Error('Schema generation failed');
            });

            const result = await loader(createLoaderArgs('https://example.com/category/electronics'));
            const categorySchema = await result.categorySchema;

            expect(categorySchema).toBeNull();
        });

        test('should prevent negative non-critical limit when API returns fewer items than requested', async () => {
            // Setup: Config requests 4 critical, but API only returns 2
            const mockConfigWithCritical = {
                ...mockConfig,
                search: { products: { hits: { limit: 24, critical: 4 } } },
            } as AppConfig;
            (getConfig as any).mockReturnValue(mockConfigWithCritical);

            // Mock API returning only 2 items instead of 4
            const partialResult = { ...mockSearchResult, hits: mockSearchResult.hits?.slice(0, 2) };
            (fetchSearchProducts as any).mockResolvedValue(partialResult);

            await loader(createLoaderArgs('https://example.com/category/electronics'));

            // Verify: Critical request asks for 4
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(1, mockContext, {
                limit: 4,
                offset: 0,
                sort: '',
                refine: ['cgid=electronics'],
                currency: 'GBP',
            });

            // Verify: Non-critical request uses actual returned count (2), not config (4)
            // This prevents gaps: offset should be 2 (actual), not 4 (config)
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(2, mockContext, {
                limit: 22, // 24 - 2 (actual) = 22
                offset: 2, // Starts at 2, not 4 - prevents gap!
                sort: '',
                refine: ['cgid=electronics'],
                currency: 'GBP',
            });
        });

        test('should cap critical limit when config.critical > config.limit', async () => {
            // Setup: Config has critical=30 but limit=24
            const mockConfigHighCritical = {
                ...mockConfig,
                search: { products: { hits: { limit: 24, critical: 30 } } },
            } as AppConfig;
            (getConfig as any).mockReturnValue(mockConfigHighCritical);
            (fetchSearchProducts as any).mockResolvedValue(mockSearchResult);

            await loader(createLoaderArgs('https://example.com/category/electronics'));

            // Verify: Critical request is capped at limit (24), not using config.critical (30)
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(1, mockContext, {
                limit: 24, // Capped at limit, not 30
                offset: 0,
                sort: '',
                refine: ['cgid=electronics'],
                currency: 'GBP',
            });

            // Verify: Non-critical request limit should not be negative
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(2, mockContext, {
                limit: 22, // 24 - 2 (actual hits) = 22 (not negative!)
                offset: 2,
                sort: '',
                refine: ['cgid=electronics'],
                currency: 'GBP',
            });
        });

        test('should handle API returning zero items', async () => {
            // Setup: API returns empty result
            const emptyResult = { ...mockSearchResult, hits: [], total: 0 };
            (fetchSearchProducts as any).mockResolvedValue(emptyResult);

            await loader(createLoaderArgs('https://example.com/category/electronics'));

            // Verify: Critical request
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(1, mockContext, {
                limit: 2,
                offset: 0,
                sort: '',
                refine: ['cgid=electronics'],
                currency: 'GBP',
            });

            // Verify: Non-critical request uses full limit since no critical items returned
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(2, mockContext, {
                limit: 10, // 10 - 0 = 10 (full limit)
                offset: 0, // Starts at 0 since no critical items
                sort: '',
                refine: ['cgid=electronics'],
                currency: 'GBP',
            });
        });

        test('should handle small limits correctly', async () => {
            // Setup: Small limit config
            const mockConfigSmallLimit = {
                ...mockConfig,
                search: { products: { hits: { limit: 4, critical: 2 } } },
            } as AppConfig;
            (getConfig as any).mockReturnValue(mockConfigSmallLimit);
            (fetchSearchProducts as any).mockResolvedValue(mockSearchResult);

            await loader(createLoaderArgs('https://example.com/category/electronics'));

            // Verify: Critical request
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(1, mockContext, {
                limit: 2,
                offset: 0,
                sort: '',
                refine: ['cgid=electronics'],
                currency: 'GBP',
            });

            // Verify: Non-critical request with small remaining limit
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(2, mockContext, {
                limit: 2, // 4 - 2 = 2
                offset: 2,
                sort: '',
                refine: ['cgid=electronics'],
                currency: 'GBP',
            });
        });

        test('should never request negative limits', async () => {
            // Setup: Config where critical equals limit
            const mockConfigCriticalEqualsLimit = {
                ...mockConfig,
                search: { products: { hits: { limit: 10, critical: 10 } } },
            } as AppConfig;
            (getConfig as any).mockReturnValue(mockConfigCriticalEqualsLimit);
            (fetchSearchProducts as any).mockResolvedValue(mockSearchResult);

            await loader(createLoaderArgs('https://example.com/category/electronics'));

            // Verify: Non-critical limit should be 0 or positive, never negative
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(2, mockContext, {
                limit: 8, // 10 - 2 (actual returned) = 8 (not negative)
                offset: 2,
                sort: '',
                refine: ['cgid=electronics'],
                currency: 'GBP',
            });
        });
    });

    describe('CategoryPage Component', () => {
        test('should apply initialFiltersOpen from loader data', async () => {
            const openLoaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                initialFiltersOpen: true,
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            const closedLoaderData: CategoryPageData = {
                ...openLoaderData,
                initialFiltersOpen: false,
            };

            const { unmount } = render(
                <MemoryRouter initialEntries={['/category/electronics?filters=open']}>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={openLoaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('category-refinements')).toBeInTheDocument();
            });

            unmount();

            render(
                <MemoryRouter initialEntries={['/category/electronics?filters=closed']}>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={closedLoaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByTestId('category-refinements')).not.toBeInTheDocument();
            });
        });

        test('should render category page with all elements', async () => {
            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve({
                    '@context': 'https://schema.org',
                    '@type': 'CollectionPage',
                    name: 'Electronics',
                }),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('active-filters')).toBeInTheDocument();
                expect(screen.getByTestId('category-breadcrumbs')).toBeInTheDocument();
                expect(screen.getByText('Electronics (25)')).toBeInTheDocument();
                expect(screen.getByTestId('category-sorting')).toBeInTheDocument();
                const filterButtons = screen.getAllByTestId('filters-button');
                // Both mobile and desktop toggle buttons render in JSDOM; responsive visibility is controlled by CSS classes.
                expect(filterButtons).toHaveLength(2);
                expect(filterButtons[0].closest('div')).toHaveClass('lg:hidden');
                expect(filterButtons[1].closest('div')).toHaveClass(
                    'mb-4',
                    'hidden',
                    'lg:flex',
                    'lg:items-center',
                    'lg:gap-4'
                );
                expect(screen.getByTestId('product-grid')).toBeInTheDocument();
                expect(screen.getByTestId('category-pagination')).toBeInTheDocument();
            });
        });

        test('should display category name or id as fallback', async () => {
            const categoryWithoutName = { ...mockCategory, name: undefined };
            const loaderData: CategoryPageData = {
                category: categoryWithoutName,
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText('electronics (25)')).toBeInTheDocument();
            });
        });

        test('should not render sorting when no sorting options available', async () => {
            const searchResultWithoutSorting = { ...mockSearchResult, sortingOptions: [] };
            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: searchResultWithoutSorting,
                searchResultNonCritical: Promise.resolve(searchResultWithoutSorting),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByTestId('category-sorting')).not.toBeInTheDocument();
            });
        });

        test('should not render pagination when total is 1 or less', async () => {
            const searchResultWithOneItem = { ...mockSearchResult, total: 1 };
            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: searchResultWithOneItem,
                searchResultNonCritical: Promise.resolve(searchResultWithOneItem),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByTestId('category-pagination')).not.toBeInTheDocument();
            });
        });

        test('should remount when currency changes', async () => {
            const loaderData1: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            const { rerender } = render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData1} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            const loaderData2: CategoryPageData = {
                ...loaderData1,
                currency: 'EUR',
            };

            rerender(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData2} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText('Electronics (25)')).toBeInTheDocument();
            });
        });

        test('should handle empty hits array', async () => {
            const searchResultWithoutHits = { ...mockSearchResult, hits: [], total: 0 };
            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: searchResultWithoutHits,
                searchResultNonCritical: Promise.resolve(searchResultWithoutHits),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText('Electronics (0)')).toBeInTheDocument();
                expect(screen.getByTestId('product-grid')).toBeInTheDocument();
            });
        });

        test('should show 0 skeletons when total is 0 (empty results)', async () => {
            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: { ...mockSearchResult, hits: [], total: 0, offset: 0 },
                searchResultNonCritical: Promise.resolve({ ...mockSearchResult, hits: [], total: 0 }),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('non-critical-skeleton-count')).toHaveTextContent('0');
            });
        });

        test('should show 0 skeletons when criticalCount >= 8', async () => {
            // Create 8 critical hits
            const manyHits = Array.from({ length: 8 }, (_, i) => ({
                productId: `product-${i}`,
                productName: `Product ${i}`,
                price: 29.99,
                currency: 'USD',
            }));

            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: { ...mockSearchResult, hits: manyHits as any, total: 100, offset: 0 },
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('critical-count')).toHaveTextContent('8');
                expect(screen.getByTestId('non-critical-skeleton-count')).toHaveTextContent('0');
            });
        });

        test('should cap at 8 total tiles when many products remain', async () => {
            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: {
                    ...mockSearchResult,
                    hits: mockSearchResult.hits?.slice(0, 2),
                    total: 100,
                    offset: 0,
                },
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('critical-count')).toHaveTextContent('2');
                // Math.max(0, Math.min(8, 10, 100) - 2) = 6
                expect(screen.getByTestId('non-critical-skeleton-count')).toHaveTextContent('6');
            });
        });

        test('should respect remaining products when fewer than 8 available', async () => {
            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: {
                    ...mockSearchResult,
                    hits: mockSearchResult.hits?.slice(0, 2),
                    total: 6,
                    offset: 0,
                },
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('critical-count')).toHaveTextContent('2');
                // Math.max(0, Math.min(8, 10, 6) - 2) = 4
                expect(screen.getByTestId('non-critical-skeleton-count')).toHaveTextContent('4');
            });
        });

        test('should handle pagination offset correctly', async () => {
            const fourHits = Array.from({ length: 4 }, (_, i) => ({
                productId: `product-${i}`,
                productName: `Product ${i}`,
                price: 29.99,
                currency: 'USD',
            }));

            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: { ...mockSearchResult, hits: fourHits as any, total: 30, offset: 20 },
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('critical-count')).toHaveTextContent('4');
                // Math.max(0, Math.min(8, 10, 30-20) - 4) = Math.max(0, 8-4) = 4
                expect(screen.getByTestId('non-critical-skeleton-count')).toHaveTextContent('4');
            });
        });

        test('should show 0 skeletons when offset >= total', async () => {
            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: {
                    ...mockSearchResult,
                    hits: mockSearchResult.hits?.slice(0, 2),
                    total: 24,
                    offset: 24,
                },
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('critical-count')).toHaveTextContent('2');
                // Math.max(0, Math.min(8, 10, 24-24) - 2) = Math.max(0, 0-2) = 0
                expect(screen.getByTestId('non-critical-skeleton-count')).toHaveTextContent('0');
            });
        });

        test('should never show negative skeleton count', async () => {
            const tenHits = Array.from({ length: 10 }, (_, i) => ({
                productId: `product-${i}`,
                productName: `Product ${i}`,
                price: 29.99,
                currency: 'USD',
            }));

            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: { ...mockSearchResult, hits: tenHits as any, total: 5, offset: 0 },
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('critical-count')).toHaveTextContent('10');
                // Math.max(0, Math.min(8, 10, 5) - 10) = Math.max(0, 5-10) = 0
                expect(screen.getByTestId('non-critical-skeleton-count')).toHaveTextContent('0');
            });
        });
    });

    describe('CategoryJsonLd Component', () => {
        test('should render JSON-LD schema when schema is provided', async () => {
            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve({
                    '@context': 'https://schema.org',
                    '@type': 'CollectionPage',
                    name: 'Electronics',
                }),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('category-schema')).toBeInTheDocument();
            });

            const productGrid = screen.getByTestId('product-grid');
            const categorySchema = screen.getByTestId('category-schema');
            expect(
                Boolean(productGrid.compareDocumentPosition(categorySchema) & Node.DOCUMENT_POSITION_FOLLOWING)
            ).toBe(true);
        });

        test('should not render JSON-LD schema when schema is null', async () => {
            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByTestId('category-schema')).not.toBeInTheDocument();
            });
        });
    });

    describe('Analytics Integration', () => {
        beforeEach(() => {
            mockTrackViewCategory.mockClear();
            mockTrackClickProductInCategory.mockClear();
        });

        test('should call trackClickProductInCategory when product is clicked', async () => {
            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('product-grid')).toBeInTheDocument();
            });

            // Click on a product
            const productItems = screen.getAllByTestId('product-item');
            productItems[0].click();

            expect(mockTrackClickProductInCategory).toHaveBeenCalledWith({
                category: mockCategory,
                product: expect.objectContaining({ productId: 'product-1' }),
            });
        });

        test('should render without errors when analytics is not available', async () => {
            // Temporarily mock useAnalytics to return null
            vi.mocked(useAnalytics).mockReturnValueOnce(null as any);

            const loaderData: CategoryPageData = {
                category: mockCategory,
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                categoryId: 'electronics',
                refine: ['cgid=electronics'],
                currency: 'USD',
                locale: 'en-US',
                pageUrl: 'http://localhost/category/test',
                categorySchema: Promise.resolve(null),
                wishlistInitialState: Promise.resolve({
                    customerId: null,
                    productIds: new Set(),
                }),
            };

            // Should render without errors even when analytics is null
            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <CategoryPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText('Electronics (25)')).toBeInTheDocument();
            });
        });
    });
});

describe('CategoryPage shouldRevalidate', () => {
    // The revalidation policy itself is covered by src/lib/revalidation/routes/category.test.ts. Here we
    // only assert the route wires up that exact function, so the behavior isn't re-tested per route.
    test('re-exports the shared listing revalidation policy', () => {
        expect(shouldRevalidate).toBe(sharedShouldRevalidate);
    });
});
