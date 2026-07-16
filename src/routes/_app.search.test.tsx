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
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import type { ShopperExperience, ShopperSearch } from '@/scapi';
import SearchPage, { loader, shouldRevalidate, type SearchPageData, SearchPageMetadata } from './_app.search';
import { shouldRevalidate as sharedShouldRevalidate } from '@/lib/revalidation/routes/category';
import { createLoaderArgs, createTestContext } from '@/lib/test-utils';
import { fetchSearchProducts } from '@/lib/api/search.server';
import { fetchPageWithComponentData } from '@/lib/page-designer/page-loader.server';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import type { AppConfig } from '@/types/config';
import { getRegionDefinition } from '@/lib/decorators/region-definition';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { useAnalytics } from '@/hooks/use-analytics';
import type { Route } from './+types/_app.search';

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useNavigation: () => ({ state: 'idle', location: undefined }),
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

// Mock data
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
    query: 'shoes',
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

// Mock Page Designer mode - must be before Region mock
vi.mock('@salesforce/storefront-next-runtime/design/mode', () => ({
    isDesignModeActive: vi.fn(() => false),
}));

// Mock the Region component
vi.mock('@/components/region', async () => {
    const { isDesignModeActive } = await import('@salesforce/storefront-next-runtime/design/mode');

    return {
        Region: ({ page, regionId }: any) => {
            // Simulate the real Region component behavior
            const MockRegion = () => {
                const [resolvedPage, setResolvedPage] = React.useState<any>(null);

                React.useEffect(() => {
                    // eslint-disable-next-line react/prop-types
                    page.then((p: any) => setResolvedPage(p));
                }, []);

                if (!resolvedPage) return null;

                const region = resolvedPage.regions?.find((r: any) => r.id === regionId);
                if (!region) return null;

                const isDesignMode = isDesignModeActive();

                // Don't render if no components and not in design mode
                if (!region.components?.length && !isDesignMode) return null;

                return <div data-testid="region" data-region-id={regionId} />;
            };

            return <MockRegion />;
        },
    };
});

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
vi.mock('@/components/category-skeleton', () => ({
    default: () => <div data-testid="category-skeleton" />,
}));

vi.mock('@/components/category-pagination', () => ({
    default: () => <div data-testid="category-pagination" />,
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
vi.mock('@/lib/api/search.server', () => ({
    fetchSearchProducts: vi.fn(),
}));

vi.mock('@/lib/page-designer/page-loader.server', () => ({
    fetchPageWithComponentData: vi.fn(),
}));

vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(() => ({ customerId: null })),
}));

// Mock analytics with controllable mock functions
const mockTrackViewSearch = vi.fn();
const mockTrackClickProductInSearch = vi.fn();

vi.mock('@/hooks/use-analytics', () => ({
    useAnalytics: vi.fn(() => ({
        trackViewSearch: mockTrackViewSearch,
        trackClickProductInSearch: mockTrackClickProductInSearch,
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

describe('SearchPage', () => {
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

    beforeEach(() => {
        vi.clearAllMocks();
        (getConfig as any).mockReturnValue(mockConfig);
        (fetchSearchProducts as any).mockResolvedValue(mockSearchResult);
        (fetchPageWithComponentData as any).mockResolvedValue({
            ...createMockPage(),
            componentData: {},
        });
    });

    describe('Decorators', () => {
        test('should have PageType decorator', () => {
            const metadata = Reflect.getMetadata('page:type', SearchPageMetadata);
            expect(metadata).toBeDefined();
            expect(metadata.name).toBe('Search Results Page');
            expect(metadata.description).toBe('Search results page with product listings and personalized content');
        });

        test('should have RegionDefinition decorator with three regions', () => {
            const topFullWidthRegion = getRegionDefinition(SearchPageMetadata, 'searchTopFullWidth');
            expect(topFullWidthRegion).toBeDefined();
            expect(topFullWidthRegion?.id).toBe('searchTopFullWidth');
            expect(topFullWidthRegion?.name).toBe('Top Full Width Region');
            expect(topFullWidthRegion?.maxComponents).toBe(5);

            const topContentRegion = getRegionDefinition(SearchPageMetadata, 'searchTopContent');
            expect(topContentRegion).toBeDefined();
            expect(topContentRegion?.id).toBe('searchTopContent');
            expect(topContentRegion?.name).toBe('Top Content Region');

            const bottomRegion = getRegionDefinition(SearchPageMetadata, 'searchBottom');
            expect(bottomRegion).toBeDefined();
            expect(bottomRegion?.id).toBe('searchBottom');
            expect(bottomRegion?.name).toBe('Bottom Region');
        });
    });

    describe('loader', () => {
        test('should fetch search data and page with correct parameters', async () => {
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://example.com/search?q=shoes&offset=0'),
                mockContext,
                {
                    pattern: '/search',
                }
            );

            const result = await loader(args);

            expect(fetchSearchProducts).toHaveBeenCalledWith(mockContext, {
                q: 'shoes',
                limit: 2,
                offset: 0,
                sort: '',
                refine: [],
                currency: 'GBP',
            });

            expect(fetchSearchProducts).toHaveBeenCalledWith(mockContext, {
                q: 'shoes',
                limit: 8,
                offset: 2,
                sort: '',
                refine: [],
                currency: 'GBP',
            });

            expect(fetchPageWithComponentData).toHaveBeenCalledWith(args, { pageId: 'search' });
            expect(result.searchTerm).toBe('shoes');
        });

        test('should handle query parameters correctly', async () => {
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request(
                    'https://example.com/search?q=boots&offset=20&sort=price-low-to-high&refine=color:red&refine=size:10'
                ),
                mockContext,
                { pattern: '/search' }
            );

            await loader(args);

            expect(fetchSearchProducts).toHaveBeenCalledWith(
                mockContext,
                expect.objectContaining({
                    q: 'boots',
                    offset: 20,
                    sort: 'price-low-to-high',
                    refine: ['color:red', 'size:10'],
                })
            );
        });

        test('should parse filters query param into initialFiltersOpen', async () => {
            const openArgs: Route.LoaderArgs = {
                request: new Request('https://example.com/search?q=shoes&filters=open'),
                url: new URL('https://example.com/search?q=shoes&filters=open'),
                context: mockContext,
                params: { siteId: 'test-site', localeId: 'en-US' },
                pattern: '/search',
            };
            const closedArgs: Route.LoaderArgs = {
                request: new Request('https://example.com/search?q=shoes&filters=closed'),
                url: new URL('https://example.com/search?q=shoes&filters=closed'),
                context: mockContext,
                params: { siteId: 'test-site', localeId: 'en-US' },
                pattern: '/search',
            };

            const openResult = await loader(openArgs);
            const closedResult = await loader(closedArgs);

            expect(openResult.initialFiltersOpen).toBe(true);
            expect(closedResult.initialFiltersOpen).toBe(false);
        });

        test('should split search results into critical and non-critical', async () => {
            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://example.com/search?q=shoes'),
                mockContext,
                {
                    pattern: '/search',
                }
            );

            await loader(args);

            expect(fetchSearchProducts).toHaveBeenCalledTimes(2);
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(1, mockContext, {
                q: 'shoes',
                limit: 2,
                offset: 0,
                sort: '',
                refine: [],
                currency: 'GBP',
            });
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(2, mockContext, {
                q: 'shoes',
                limit: 8,
                offset: 2,
                sort: '',
                refine: [],
                currency: 'GBP',
            });
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

            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://example.com/search?q=shoes'),
                mockContext,
                {
                    pattern: '/search',
                }
            );
            await loader(args);

            // Verify: Critical request asks for 4
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(1, mockContext, {
                q: 'shoes',
                limit: 4,
                offset: 0,
                sort: '',
                refine: [],
                currency: 'GBP',
            });

            // Verify: Non-critical request uses actual returned count (2), not config (4)
            // This prevents gaps: offset should be 2 (actual), not 4 (config)
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(2, mockContext, {
                q: 'shoes',
                limit: 22, // 24 - 2 (actual) = 22
                offset: 2, // Starts at 2, not 4 - prevents gap!
                sort: '',
                refine: [],
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

            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://example.com/search?q=shoes'),
                mockContext,
                {
                    pattern: '/search',
                }
            );
            await loader(args);

            // Verify: Critical request is capped at limit (24), not using config.critical (30)
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(1, mockContext, {
                q: 'shoes',
                limit: 24, // Capped at limit, not 30
                offset: 0,
                sort: '',
                refine: [],
                currency: 'GBP',
            });

            // Verify: Non-critical request limit should not be negative
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(2, mockContext, {
                q: 'shoes',
                limit: 22, // 24 - 2 (actual hits) = 22 (not negative!)
                offset: 2,
                sort: '',
                refine: [],
                currency: 'GBP',
            });
        });

        test('should handle API returning zero items', async () => {
            // Setup: API returns empty result
            const emptyResult = { ...mockSearchResult, hits: [], total: 0 };
            (fetchSearchProducts as any).mockResolvedValue(emptyResult);

            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://example.com/search?q=shoes'),
                mockContext,
                {
                    pattern: '/search',
                }
            );
            await loader(args);

            // Verify: Critical request
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(1, mockContext, {
                q: 'shoes',
                limit: 2,
                offset: 0,
                sort: '',
                refine: [],
                currency: 'GBP',
            });

            // Verify: Non-critical request uses full limit since no critical items returned
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(2, mockContext, {
                q: 'shoes',
                limit: 10, // 10 - 0 = 10 (full limit)
                offset: 0, // Starts at 0 since no critical items
                sort: '',
                refine: [],
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

            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://example.com/search?q=shoes'),
                mockContext,
                {
                    pattern: '/search',
                }
            );
            await loader(args);

            // Verify: Critical request
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(1, mockContext, {
                q: 'shoes',
                limit: 2,
                offset: 0,
                sort: '',
                refine: [],
                currency: 'GBP',
            });

            // Verify: Non-critical request with small remaining limit
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(2, mockContext, {
                q: 'shoes',
                limit: 2, // 4 - 2 = 2
                offset: 2,
                sort: '',
                refine: [],
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

            const args = createLoaderArgs<Route.LoaderArgs>(
                new Request('https://example.com/search?q=shoes'),
                mockContext,
                {
                    pattern: '/search',
                }
            );
            await loader(args);

            // Verify: Non-critical limit should be 0 or positive, never negative
            expect(fetchSearchProducts).toHaveBeenNthCalledWith(2, mockContext, {
                q: 'shoes',
                limit: 8, // 10 - 2 (actual returned) = 8 (not negative)
                offset: 2,
                sort: '',
                refine: [],
                currency: 'GBP',
            });
        });
    });

    describe('SearchPage Component', () => {
        test('should apply initialFiltersOpen from loader data', async () => {
            const openLoaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                initialFiltersOpen: true,
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            const closedLoaderData: SearchPageData = {
                ...openLoaderData,
                initialFiltersOpen: false,
            };

            const { unmount } = render(
                <MemoryRouter initialEntries={['/search?q=shoes&filters=open']}>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={openLoaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('category-refinements')).toBeInTheDocument();
            });

            unmount();

            render(
                <MemoryRouter initialEntries={['/search?q=shoes&filters=closed']}>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={closedLoaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByTestId('category-refinements')).not.toBeInTheDocument();
            });
        });

        test('should render search results', async () => {
            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('active-filters')).toBeInTheDocument();
                expect(screen.getByText('shoes (25)')).toBeInTheDocument();
                expect(screen.getByTestId('product-grid')).toBeInTheDocument();
            });
        });

        test('should render region when it has components', async () => {
            const mockRegion = {
                id: 'searchTopContent',
                components: [
                    {
                        id: 'hero-1',
                        typeId: 'Content.hero',
                        data: {},
                    },
                ],
            };

            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage([mockRegion]), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                const regions = screen.queryAllByTestId('region');
                expect(regions.length).toBe(1);
                expect(regions[0]).toHaveAttribute('data-region-id', 'searchTopContent');
            });
        });

        test('should not render regions when no components', async () => {
            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage([]), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByTestId('region')).not.toBeInTheDocument();
            });
        });

        test('should render pagination when results total is greater than 1', async () => {
            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: { ...mockSearchResult, total: 50 },
                searchResultNonCritical: Promise.resolve({ ...mockSearchResult, total: 50 }),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('category-pagination')).toBeInTheDocument();
            });
        });

        test('should not render pagination when total is 1 or less', async () => {
            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: { ...mockSearchResult, total: 1 },
                searchResultNonCritical: Promise.resolve({ ...mockSearchResult, total: 1 }),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByTestId('category-pagination')).not.toBeInTheDocument();
            });
        });

        test('should render refinements and sorting', async () => {
            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                const filterButtons = screen.getAllByTestId('filters-button');
                expect(filterButtons).toHaveLength(2);
                expect(screen.getByTestId('category-sorting')).toBeInTheDocument();
            });
        });

        test('should render empty regions in design mode', async () => {
            const { isDesignModeActive } = await import('@salesforce/storefront-next-runtime/design/mode');
            vi.mocked(isDesignModeActive).mockReturnValue(true);

            const mockRegion = {
                id: 'searchTopContent',
                components: [],
            };

            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage([mockRegion]), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                const regions = screen.queryAllByTestId('region');
                expect(regions.length).toBeGreaterThan(0);
                const searchTopContentRegion = regions.find(
                    (r) => r.getAttribute('data-region-id') === 'searchTopContent'
                );
                expect(searchTopContentRegion).toBeInTheDocument();
            });
        });

        test('should not render empty regions in normal mode', async () => {
            const { isDesignModeActive } = await import('@salesforce/storefront-next-runtime/design/mode');
            vi.mocked(isDesignModeActive).mockReturnValue(false);

            const mockRegion = {
                id: 'searchTopContent',
                components: [],
            };

            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage([mockRegion]), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByTestId('region')).not.toBeInTheDocument();
            });
        });

        test('should not render sorting when no sorting options available', async () => {
            const searchResultWithoutSorting = { ...mockSearchResult, sortingOptions: [] };
            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: searchResultWithoutSorting,
                searchResultNonCritical: Promise.resolve(searchResultWithoutSorting),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByTestId('category-sorting')).not.toBeInTheDocument();
            });
        });

        test('should remount when currency changes', async () => {
            const loaderData1: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            const { rerender } = render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData1} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            const loaderData2: SearchPageData = {
                ...loaderData1,
                currency: 'EUR',
            };

            rerender(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData2} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText('shoes (25)')).toBeInTheDocument();
            });
        });

        test('should handle empty hits array', async () => {
            const searchResultWithoutHits = { ...mockSearchResult, hits: [], total: 0 };
            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: searchResultWithoutHits,
                searchResultNonCritical: Promise.resolve(searchResultWithoutHits),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText('shoes (0)')).toBeInTheDocument();
                expect(screen.getByTestId('product-grid')).toBeInTheDocument();
            });
        });

        test('should show 0 skeletons when total is 0 (empty results)', async () => {
            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: { ...mockSearchResult, hits: [], total: 0, offset: 0 },
                searchResultNonCritical: Promise.resolve({ ...mockSearchResult, hits: [], total: 0 }),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
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

            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: { ...mockSearchResult, hits: manyHits as any, total: 100, offset: 0 },
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('critical-count')).toHaveTextContent('8');
                expect(screen.getByTestId('non-critical-skeleton-count')).toHaveTextContent('0');
            });
        });

        test('should cap at 8 total tiles when many products remain', async () => {
            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: {
                    ...mockSearchResult,
                    hits: mockSearchResult.hits?.slice(0, 2),
                    total: 100,
                    offset: 0,
                },
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
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
            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: {
                    ...mockSearchResult,
                    hits: mockSearchResult.hits?.slice(0, 2),
                    total: 6,
                    offset: 0,
                },
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
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

            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: { ...mockSearchResult, hits: fourHits as any, total: 30, offset: 20 },
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
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
            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: {
                    ...mockSearchResult,
                    hits: mockSearchResult.hits?.slice(0, 2),
                    total: 24,
                    offset: 24,
                },
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
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

            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: { ...mockSearchResult, hits: tenHits as any, total: 5, offset: 0 },
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
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

    describe('Analytics Integration', () => {
        beforeEach(() => {
            mockTrackViewSearch.mockClear();
            mockTrackClickProductInSearch.mockClear();
        });

        test('should call trackClickProductInSearch when product is clicked', async () => {
            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('product-grid')).toBeInTheDocument();
            });

            // Click on a product
            const productItems = screen.getAllByTestId('product-item');
            productItems[0].click();

            expect(mockTrackClickProductInSearch).toHaveBeenCalledWith({
                searchInputText: 'shoes',
                product: expect.objectContaining({ productId: 'product-1' }),
            });
        });

        test('should render without errors when analytics is not available', async () => {
            // Temporarily mock useAnalytics to return null
            vi.mocked(useAnalytics).mockReturnValueOnce(null as any);

            const loaderData: SearchPageData = {
                searchTerm: 'shoes',
                searchResultCritical: mockSearchResult,
                searchResultNonCritical: Promise.resolve(mockSearchResult),
                page: Promise.resolve({ ...createMockPage(), componentData: {} }),
                currency: 'USD',
                locale: 'en-US',
                refine: [],
                pageUrl: 'http://localhost/search',
            };

            // Should render without errors even when analytics is null
            render(
                <MemoryRouter>
                    <AllProvidersWrapper>
                        <SearchPage loaderData={loaderData} />
                    </AllProvidersWrapper>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText('shoes (25)')).toBeInTheDocument();
            });
        });
    });
});

describe('SearchPage shouldRevalidate', () => {
    // The revalidation policy itself is covered by src/lib/revalidation/routes/category.test.ts. Here we
    // only assert the route wires up that exact function, so the behavior isn't re-tested per route.
    test('re-exports the shared listing revalidation policy', () => {
        expect(shouldRevalidate).toBe(sharedShouldRevalidate);
    });
});
