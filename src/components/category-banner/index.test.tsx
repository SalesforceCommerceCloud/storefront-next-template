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
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ShopperProducts, ShopperSearch } from '@/scapi';
import CategoryBanner from './index';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockToImageUrl = vi.fn((params: { src?: string }) => params.src);

vi.mock('@/lib/images/dynamic-image', () => ({
    toImageUrl: (params: { src?: string }) => mockToImageUrl(params),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: () => ({ images: { host: 'https://dis.example.com' } }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) => {
            if (key === 'banner.counting') return 'Counting products...';
            if (key === 'banner.productsAvailable') {
                const count = options?.count ?? 0;
                return count === 1 ? '1 product available' : `${count} products available`;
            }
            return key;
        },
    }),
}));

const mockUseRouteLoaderData = vi.fn();
const mockUseNavigation = vi.fn();
const mockUseLocation = vi.fn();

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useRouteLoaderData: (...args: unknown[]) => mockUseRouteLoaderData(...args),
        useNavigation: () => mockUseNavigation(),
        useLocation: () => mockUseLocation(),
    };
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const mockCategory: ShopperProducts.schemas['Category'] = {
    id: 'men',
    name: 'Men',
    parentCategoryTree: [{ id: 'root', name: 'Root' }],
};

const mockSubCategory: ShopperProducts.schemas['Category'] = {
    id: 'mens-suits',
    name: 'Suits',
    parentCategoryTree: [
        { id: 'root', name: 'Root' },
        { id: 'men', name: 'Men' },
    ],
};

const mockSearchResult: Partial<ShopperSearch.schemas['ProductSearchResult']> = {
    total: 42,
};

const renderBanner = (initialPath = '/category/men') => {
    const router = createMemoryRouter([{ path: '*', element: <CategoryBanner /> }], {
        initialEntries: [initialPath],
    });
    return render(<RouterProvider router={router} />);
};

const idleNavigation = { state: 'idle' as const, location: undefined };

const pendingNavigation = (_currentSearch: string, nextSearch: string) => ({
    state: 'loading' as const,
    location: { pathname: '/category/men', search: nextSearch } as Location,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CategoryBanner', () => {
    beforeEach(() => {
        mockUseNavigation.mockReturnValue(idleNavigation);
        mockUseLocation.mockReturnValue({ pathname: '/category/men', search: '' });
        mockUseRouteLoaderData.mockReturnValue({
            category: mockCategory,
            searchResultCritical: mockSearchResult,
        });
        mockToImageUrl.mockImplementation((params: { src?: string }) => params.src);
    });

    describe('rendering with full loader data', () => {
        test('shows category name and product count', () => {
            renderBanner();

            expect(screen.getByText('Men')).toBeInTheDocument();
            expect(screen.getByText('42 products available')).toBeInTheDocument();
        });

        test('shows root category label from parentCategoryTree', () => {
            mockUseRouteLoaderData.mockReturnValue({
                category: mockSubCategory,
                searchResultCritical: mockSearchResult,
            });

            renderBanner();

            expect(screen.getByText('Men')).toBeInTheDocument();
            expect(screen.getByText('Suits')).toBeInTheDocument();
        });

        test('does not show root category label when parentCategoryTree has only root entry', () => {
            mockUseRouteLoaderData.mockReturnValue({
                category: {
                    ...mockCategory,
                    parentCategoryTree: [{ id: 'root', name: 'Root' }],
                },
                searchResultCritical: mockSearchResult,
            });

            renderBanner();

            expect(screen.queryByText('Root')).not.toBeInTheDocument();
        });

        test('does not show root category label when parentCategoryTree is absent', () => {
            mockUseRouteLoaderData.mockReturnValue({
                category: { id: 'men', name: 'Men' },
                searchResultCritical: mockSearchResult,
            });

            renderBanner();

            expect(screen.queryByText('Root')).not.toBeInTheDocument();
        });

        test('shows singular product count when total is 1', () => {
            mockUseRouteLoaderData.mockReturnValue({
                category: mockCategory,
                searchResultCritical: { total: 1 },
            });

            renderBanner();

            expect(screen.getByText('1 product available')).toBeInTheDocument();
        });

        test('does not show count when total is undefined', () => {
            mockUseRouteLoaderData.mockReturnValue({
                category: mockCategory,
                searchResultCritical: { total: undefined },
            });

            renderBanner();

            expect(screen.queryByText(/products available/)).not.toBeInTheDocument();
        });
    });

    describe('rendering without loader data', () => {
        test('renders without crashing when outside PLP context', () => {
            mockUseRouteLoaderData.mockReturnValue(undefined);

            expect(() => renderBanner()).not.toThrow();
        });

        test('shows no category name, root label, or count when loader data is absent', () => {
            mockUseRouteLoaderData.mockReturnValue(undefined);

            renderBanner();

            expect(screen.queryByText(/products available/)).not.toBeInTheDocument();
        });
    });

    describe('image resolution from category data', () => {
        test('uses c_slotBannerImage when available', () => {
            mockUseRouteLoaderData.mockReturnValue({
                category: {
                    ...mockCategory,
                    c_slotBannerImage: 'https://dis.example.com/dw/image/v2/banner.png',
                    image: 'https://mrt-host/on/demandware.static/fallback.png',
                },
                searchResultCritical: mockSearchResult,
            });

            renderBanner();

            const img = document.querySelector('img') as HTMLImageElement;
            expect(img).toHaveAttribute('src', 'https://dis.example.com/dw/image/v2/banner.png');
        });

        test('falls back to category.image when c_slotBannerImage is absent', () => {
            mockUseRouteLoaderData.mockReturnValue({
                category: {
                    ...mockCategory,
                    image: 'https://mrt-host/on/demandware.static/category.png',
                },
                searchResultCritical: mockSearchResult,
            });

            renderBanner();

            const img = document.querySelector('img') as HTMLImageElement;
            expect(img).toHaveAttribute('src', 'https://mrt-host/on/demandware.static/category.png');
        });

        test('passes image URL through toImageUrl for DIS transformation', () => {
            const rawUrl = 'https://mrt-host/on/demandware.static/category.png';
            const disUrl = 'https://dis.example.com/dw/image/v2/REALM/on/demandware.static/category.webp';
            mockToImageUrl.mockReturnValue(disUrl);

            mockUseRouteLoaderData.mockReturnValue({
                category: { ...mockCategory, image: rawUrl },
                searchResultCritical: mockSearchResult,
            });

            renderBanner();

            expect(mockToImageUrl).toHaveBeenCalledWith(expect.objectContaining({ src: rawUrl }));
            const img = document.querySelector('img') as HTMLImageElement;
            expect(img).toHaveAttribute('src', disUrl);
        });

        test('renders bg-muted when no category image is available', () => {
            mockUseRouteLoaderData.mockReturnValue({
                category: mockCategory,
                searchResultCritical: mockSearchResult,
            });

            renderBanner();

            expect(document.querySelector('img')).not.toBeInTheDocument();
        });

        test('renders bg-muted when loader data is absent', () => {
            mockUseRouteLoaderData.mockReturnValue(undefined);
            renderBanner();

            expect(document.querySelector('img')).not.toBeInTheDocument();
        });

        test('falls back to bg-muted when image fails to load', () => {
            mockUseRouteLoaderData.mockReturnValue({
                category: {
                    ...mockCategory,
                    c_slotBannerImage: 'https://dis.example.com/broken-image.png',
                },
                searchResultCritical: mockSearchResult,
            });

            renderBanner();

            const img = document.querySelector('img') as HTMLImageElement;
            fireEvent.error(img);

            expect(document.querySelector('img')).not.toBeInTheDocument();
        });

        test('resets image error state when category changes', () => {
            mockUseRouteLoaderData.mockReturnValue({
                category: {
                    ...mockCategory,
                    c_slotBannerImage: 'https://dis.example.com/broken-image.png',
                },
                searchResultCritical: mockSearchResult,
            });

            const { rerender } = render(
                <RouterProvider
                    router={createMemoryRouter([{ path: '*', element: <CategoryBanner /> }], {
                        initialEntries: ['/category/men'],
                    })}
                />
            );

            const img = document.querySelector('img') as HTMLImageElement;
            fireEvent.error(img);
            expect(document.querySelector('img')).not.toBeInTheDocument();

            mockUseRouteLoaderData.mockReturnValue({
                category: {
                    ...mockSubCategory,
                    c_slotBannerImage: 'https://dis.example.com/working-image.png',
                },
                searchResultCritical: mockSearchResult,
            });

            rerender(
                <RouterProvider
                    router={createMemoryRouter([{ path: '*', element: <CategoryBanner /> }], {
                        initialEntries: ['/category/mens-suits'],
                    })}
                />
            );

            expect(document.querySelector('img')).toBeInTheDocument();
        });
    });

    describe('isCountPending — shows "Counting products..." label', () => {
        test('shows pending label when refine params change', () => {
            mockUseLocation.mockReturnValue({ pathname: '/category/men', search: '?refine=color=blue' });
            mockUseNavigation.mockReturnValue(
                pendingNavigation('?refine=color=blue', '?refine=color=blue&refine=size=M')
            );

            renderBanner();

            expect(screen.getByText('Counting products...')).toBeInTheDocument();
            expect(screen.queryByText(/products available/)).not.toBeInTheDocument();
        });

        test('shows pending label when sort param changes', () => {
            mockUseLocation.mockReturnValue({ pathname: '/category/men', search: '' });
            mockUseNavigation.mockReturnValue(pendingNavigation('', '?sort=price-low-to-high'));

            renderBanner();

            expect(screen.getByText('Counting products...')).toBeInTheDocument();
        });

        test('shows pending label when offset param changes (pagination)', () => {
            mockUseLocation.mockReturnValue({ pathname: '/category/men', search: '' });
            mockUseNavigation.mockReturnValue(pendingNavigation('', '?offset=24'));

            renderBanner();

            expect(screen.getByText('Counting products...')).toBeInTheDocument();
        });
    });

    describe('isCountPending — shows actual count (not pending)', () => {
        test('shows actual count when navigation is idle', () => {
            mockUseNavigation.mockReturnValue(idleNavigation);

            renderBanner();

            expect(screen.getByText('42 products available')).toBeInTheDocument();
            expect(screen.queryByText('Counting products...')).not.toBeInTheDocument();
        });

        test('shows actual count when navigation.location is absent', () => {
            mockUseNavigation.mockReturnValue({ state: 'loading', location: undefined });

            renderBanner();

            expect(screen.getByText('42 products available')).toBeInTheDocument();
        });

        test('shows actual count when navigating to a different pathname', () => {
            mockUseLocation.mockReturnValue({ pathname: '/category/men', search: '' });
            mockUseNavigation.mockReturnValue({
                state: 'loading' as const,
                location: { pathname: '/category/women', search: '' } as Location,
            });

            renderBanner();

            expect(screen.getByText('42 products available')).toBeInTheDocument();
        });

        test('shows actual count when search params are identical (no real change)', () => {
            mockUseLocation.mockReturnValue({ pathname: '/category/men', search: '?refine=color=blue' });
            mockUseNavigation.mockReturnValue({
                state: 'loading' as const,
                location: { pathname: '/category/men', search: '?refine=color=blue' } as Location,
            });

            renderBanner();

            expect(screen.getByText('42 products available')).toBeInTheDocument();
        });
    });

    describe('accessibility', () => {
        test('decorative background image is hidden from assistive technologies (category name is announced separately)', () => {
            mockUseRouteLoaderData.mockReturnValue({
                category: {
                    ...mockCategory,
                    c_slotBannerImage: 'https://dis.example.com/banner.png',
                },
                searchResultCritical: mockSearchResult,
            });
            renderBanner();

            expect(screen.queryByRole('img')).not.toBeInTheDocument();
            expect(screen.queryByRole('img', { name: 'Men' })).not.toBeInTheDocument();
        });

        test('root category label is exposed to assistive technologies', () => {
            mockUseRouteLoaderData.mockReturnValue({
                category: mockSubCategory,
                searchResultCritical: mockSearchResult,
            });
            renderBanner();

            const rootLabel = screen.getByText('Men');
            expect(rootLabel.closest('[aria-hidden="true"]')).not.toBeInTheDocument();
        });

        test('category name is exposed to assistive technologies', () => {
            renderBanner();

            const categoryName = screen.getByText('Men');
            expect(categoryName).not.toHaveAttribute('aria-hidden');
        });

        test('product count container has aria-live="polite"', () => {
            const { container } = renderBanner();

            const liveRegion = container.querySelector('[aria-live="polite"]');
            expect(liveRegion).toBeInTheDocument();
            expect(liveRegion).toHaveTextContent('42 products available');
        });
    });
});
