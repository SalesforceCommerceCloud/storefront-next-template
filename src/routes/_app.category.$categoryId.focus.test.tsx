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

// Focus-management tests for the category route live in their own file. They render the full page and
// drive router state, which is heavier than the rest of the category suite; keeping them separate avoids
// adding runtime pressure to the timing-sensitive Suspense assertions in the main category test file.

import 'reflect-metadata';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import type { ShopperExperience, ShopperProducts, ShopperSearch } from '@/scapi';
import CategoryPage, { loader } from './_app.category.$categoryId';
import type { AppConfig } from '@/types/config';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { fetchCategory } from '@/lib/api/categories.server';
import { fetchSearchProducts } from '@/lib/api/search.server';
import { fetchPageWithComponentData } from '@/lib/page-designer/page-loader.server';
import { generateCategorySchema } from '@/utils/category-schema';

// Router state the focus tests drive. Defaults mirror the static values every other test expects
// (idle navigation, real location). `vi.hoisted` so the hoisted `vi.mock` factory below can read it.
const mockRouterState = vi.hoisted(() => ({
    navigationState: 'idle' as string,
    // When null, `useLocation` returns the real router location; set a string to drive `location.search`.
    locationSearch: null as string | null,
}));

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useNavigation: () => ({ state: mockRouterState.navigationState, location: undefined }),
        useLocation: () => {
            const real = actual.useLocation();
            return mockRouterState.locationSearch === null ? real : { ...real, search: mockRouterState.locationSearch };
        },
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

// Mock the "Load more" hook: no fetcher (which needs a data router), just derive hasMore from the
// initial page vs total so behavior-driven tests still exercise the show/hide logic.
vi.mock('@/hooks/use-load-more-products', () => ({
    useLoadMoreProducts: ({ initialCount, total }: any) => ({
        appended: [],
        loadedCount: initialCount,
        total,
        hasMore: initialCount < total,
        capReached: false,
        isLoading: false,
        hasError: false,
        firstNewIndex: null,
        loadMore: vi.fn(),
    }),
}));

// Mock the "Load more" control: mirror the real component's terminal-state logic — it renders whenever
// there are products (button, end-of-catalog message, or cap prompt) and nothing only when total is 0.
vi.mock('@/components/product-grid/load-more', () => ({
    default: ({ loadedCount, total }: any) =>
        total > 0 ? (
            <div data-testid="load-more">
                Showing {loadedCount} of {total}
            </div>
        ) : null,
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

vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(() => ({ customerId: null })),
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
        mockRouterState.navigationState = 'idle';
        mockRouterState.locationSearch = null;
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

    describe('results-heading focus management (W-23492546 / W-23325659)', () => {
        // A settled refinement/sort must re-home focus to the results heading ONLY when the control the
        // shopper operated was removed (focus dropped to <body>) — e.g. clearing filters (W-23325659).
        // When the operated control persists (a facet button toggled via the panel's optimistic state),
        // focus must stay put, not jump to the heading (WCAG 3.2.2 change-of-context, W-23492546).
        const SEARCH_BASE = '?refine=cgid%3Delectronics';
        const SEARCH_WITH_COLOR = '?refine=cgid%3Delectronics&refine=c_refinementColor%3DBeige';

        const focusLoaderData = (): CategoryPageData => ({
            category: mockCategory,
            searchResultCritical: mockSearchResult,
            searchResultNonCritical: Promise.resolve(mockSearchResult),
            page: { ...createMockPage(), componentData: {} },
            categoryId: 'electronics',
            refine: ['cgid=electronics'],
            currency: 'USD',
            locale: 'en-US',
            pageUrl: 'http://localhost/category/test',
            categorySchema: Promise.resolve(null),
            seoPagination: null,
            initialCount: 24,
        });

        const treeFor = (loaderData: CategoryPageData) => (
            <MemoryRouter initialEntries={['/category/electronics']}>
                <AllProvidersWrapper>
                    <CategoryPage loaderData={loaderData} />
                </AllProvidersWrapper>
            </MemoryRouter>
        );

        // Mount, then flush every deferred (Await/Suspense) promise so the results subtree — including the
        // <h1> the focus effect targets — is committed and its DOM node is stable before we assert. The same
        // loaderData object is reused on rerender so its deferred promises keep the same identity and React
        // does NOT re-suspend and swap the <h1> node out from under focus (that race made the assertion flaky).
        const mountSettled = async (loaderData: CategoryPageData) => {
            const utils = render(treeFor(loaderData));
            await waitFor(() => expect(screen.getByText('Electronics (25)')).toBeInTheDocument());
            await act(async () => {
                await Promise.resolve();
            });
            return utils;
        };

        let rafSpy: ReturnType<typeof vi.spyOn>;
        beforeEach(() => {
            // Run the effect's requestAnimationFrame callback synchronously so focus is settled by the
            // time we assert. Returns a numeric handle to satisfy the FrameRequestCallback contract.
            rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
                cb(0);
                return 0;
            });
        });
        afterEach(() => {
            rafSpy.mockRestore();
            document.querySelectorAll('[data-testid="test-facet"]').forEach((el) => el.remove());
        });

        test('keeps focus on the operated facet when a refinement settles (does not steal to the heading)', async () => {
            const loaderData = focusLoaderData();
            mockRouterState.locationSearch = SEARCH_BASE;
            const { rerender } = await mountSettled(loaderData);

            // The facet button the shopper just toggled stays mounted (panel keeps it via optimistic state).
            const facet = document.createElement('button');
            facet.setAttribute('data-testid', 'test-facet');
            facet.textContent = 'Beige (13)';
            document.body.appendChild(facet);
            facet.focus();
            expect(document.activeElement).toBe(facet);

            // A color refinement settles: the meaningful search changes while navigation is idle.
            mockRouterState.locationSearch = SEARCH_WITH_COLOR;
            await act(async () => {
                rerender(treeFor(loaderData));
                await Promise.resolve();
            });

            // Focus stays on the facet — not stolen to the results heading.
            expect(document.activeElement).toBe(facet);
        });

        test('re-homes focus to the results heading when the operated control is removed (Clear all)', async () => {
            const loaderData = focusLoaderData();
            mockRouterState.locationSearch = SEARCH_WITH_COLOR;
            const { rerender } = await mountSettled(loaderData);

            // Clearing filters unmounts the chip/control that had focus, dropping focus to <body>.
            if (document.activeElement && document.activeElement !== document.body) {
                (document.activeElement as HTMLElement).blur();
            }

            // The refinement is cleared: the meaningful search changes while navigation is idle.
            mockRouterState.locationSearch = SEARCH_BASE;
            await act(async () => {
                rerender(treeFor(loaderData));
                await Promise.resolve();
            });

            // Focus lands on the results heading so keyboard/screen-reader users keep their place.
            expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
        });
    });
});
