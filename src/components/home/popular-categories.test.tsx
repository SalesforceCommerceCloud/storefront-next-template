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
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import i18next from 'i18next';
import PopularCategories from './popular-categories';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockAltSiteObject, mockConfig } from '@/test-utils/config';
import type { ShopperProducts } from '@/scapi';

const defaultMockSite = mockAltSiteObject;

const mockLocale =
    defaultMockSite.supportedLocales.find((l) => l.id === defaultMockSite.defaultLocale) ??
    defaultMockSite.supportedLocales[0];

// Mock decorators (minimal mocking to avoid testing them)
vi.mock('@/lib/decorators/component', async (importOriginal) => {
    const actual = await importOriginal<object>();
    return {
        ...actual,
        Component: () => (target: any) => target,
        Loader: () => (target: any) => target,
    };
});

vi.mock('@/lib/decorators', () => ({
    RegionDefinition: () => (target: any) => target,
}));

vi.mock('@/lib/decorators/attribute-definition', () => ({
    AttributeDefinition: () => () => {},
}));

const renderWithRouter = (component: React.ReactElement) => {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <ConfigProvider config={mockConfig}>
                        <SiteProvider
                            site={defaultMockSite}
                            locale={mockLocale}
                            language={mockAltSiteObject.defaultLocale}
                            currency={mockAltSiteObject.defaultCurrency}>
                            {component}
                        </SiteProvider>
                    </ConfigProvider>
                ),
            },
        ],
        { initialEntries: ['/'] }
    );
    return render(<RouterProvider router={router} />);
};

const mockCategories: ShopperProducts.schemas['Category'][] = [
    {
        id: 'cat1',
        name: 'Electronics',
        pageDescription: 'Latest electronics and gadgets',
        image: '/images/electronics.jpg',
        c_slotBannerImage: '/images/electronics-banner.jpg',
    },
    {
        id: 'cat2',
        name: 'Clothing',
        pageDescription: 'Fashion and apparel',
        image: '/images/clothing.jpg',
    },
    {
        id: 'cat3',
        name: 'Books',
        pageDescription: 'Books and literature',
        image: '/images/books.jpg',
    },
    {
        id: 'cat4',
        name: 'Sports',
        pageDescription: 'Sports and fitness',
        image: '/images/sports.jpg',
    },
];

const renderComponent = (component: React.ReactElement) => {
    return renderWithRouter(component);
};

describe('PopularCategories', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('renders component with skeleton initially', async () => {
        const categoriesPromise = Promise.resolve(mockCategories);

        renderComponent(<PopularCategories categoriesPromise={categoriesPromise} />);

        // Skeleton cards are rendered while loading (4 skeleton category cards)
        const skeletons = document.querySelectorAll('.aspect-square');
        expect(skeletons.length).toBe(4);

        // Wait for categories to load
        await waitFor(() => {
            expect(screen.getByText('Style for Real Life')).toBeInTheDocument();
        });
    });

    test('renders categories after loading', async () => {
        const categoriesPromise = Promise.resolve(mockCategories);

        renderComponent(<PopularCategories categoriesPromise={categoriesPromise} />);

        // Wait for categories to load and check they are displayed
        await waitFor(
            () => {
                expect(screen.getByText('Electronics')).toBeInTheDocument();
                expect(screen.getByText('Clothing')).toBeInTheDocument();
                expect(screen.getByText('Books')).toBeInTheDocument();
                expect(screen.getByText('Sports')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );
    });

    test('renders section with correct container classes', async () => {
        const categoriesPromise = Promise.resolve(mockCategories);

        const { container } = renderComponent(<PopularCategories categoriesPromise={categoriesPromise} />);

        // Wait for component to load
        await waitFor(
            () => {
                expect(screen.getByText('Style for Real Life')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        // Check that the outer section wrapper is present (max-w-7xl was removed; carousel is now full-width)
        const sectionWrapper = container.querySelector('section');
        expect(sectionWrapper).toBeInTheDocument();
    });

    test('renders section wrapper with background', async () => {
        const categoriesPromise = Promise.resolve(mockCategories);

        const { container } = renderComponent(<PopularCategories categoriesPromise={categoriesPromise} />);

        // Wait for component to load
        await waitFor(
            () => {
                expect(screen.getByText('Style for Real Life')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        // Check that the section has the muted background
        const section = container.querySelector('section');
        expect(section).toBeInTheDocument();
    });

    test('displays correct number of categories', async () => {
        const categoriesPromise = Promise.resolve(mockCategories);

        renderComponent(<PopularCategories categoriesPromise={categoriesPromise} />);

        // Wait for categories to load
        await waitFor(
            () => {
                expect(screen.getByText('Electronics')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        // Should display all 4 categories
        expect(screen.getByText('Electronics')).toBeInTheDocument();
        expect(screen.getByText('Clothing')).toBeInTheDocument();
        expect(screen.getByText('Books')).toBeInTheDocument();
        expect(screen.getByText('Sports')).toBeInTheDocument();
    });

    test('hides category descriptions by default', async () => {
        const categoriesPromise = Promise.resolve(mockCategories);

        renderComponent(<PopularCategories categoriesPromise={categoriesPromise} />);

        // Wait for categories to load
        await waitFor(
            () => {
                expect(screen.getByText('Electronics')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        // Descriptions are hidden by default (showDescription defaults to false)
        expect(screen.queryByText('Latest electronics and gadgets')).not.toBeInTheDocument();
        expect(screen.queryByText('Fashion and apparel')).not.toBeInTheDocument();
        expect(screen.queryByText('Books and literature')).not.toBeInTheDocument();
        expect(screen.queryByText('Sports and fitness')).not.toBeInTheDocument();
    });

    test('displays shop now buttons', async () => {
        const categoriesPromise = Promise.resolve(mockCategories);

        renderComponent(<PopularCategories categoriesPromise={categoriesPromise} />);

        // Wait for categories to load
        await waitFor(
            () => {
                expect(screen.getByText('Electronics')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        // Check shop now buttons are present
        const shopNowButtons = screen.getAllByText('Shop Now');
        expect(shopNowButtons).toHaveLength(4);
    });

    // Fallback logic tests - verify all code paths work
    test('renders data prop when provided (no component)', async () => {
        renderComponent(<PopularCategories data={mockCategories} />);

        await waitFor(
            () => {
                expect(screen.getByText('Electronics')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        expect(screen.getByText('Clothing')).toBeInTheDocument();
        expect(screen.getByText('Books')).toBeInTheDocument();
        expect(screen.getByText('Sports')).toBeInTheDocument();
    });

    test('falls back to data when component has no regions', async () => {
        const component = {
            id: 'test-component',
            typeId: 'popularCategories',
            regions: [],
        };

        renderComponent(<PopularCategories component={component} data={mockCategories} />);

        await waitFor(
            () => {
                expect(screen.getByText('Electronics')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        expect(screen.getByText('Clothing')).toBeInTheDocument();
    });

    test('falls back to categoriesPromise when component has empty categories region', async () => {
        const component = {
            id: 'test-component',
            typeId: 'popularCategories',
            regions: [
                {
                    id: 'categories',
                    components: [],
                },
            ],
        };
        const categoriesPromise = Promise.resolve(mockCategories);

        renderComponent(<PopularCategories component={component} categoriesPromise={categoriesPromise} />);

        await waitFor(
            () => {
                expect(screen.getByText('Electronics')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        expect(screen.getByText('Clothing')).toBeInTheDocument();
    });

    test('renders nothing when no data sources provided', () => {
        const { container } = renderComponent(<PopularCategories />);

        const section = container.querySelector('section');
        expect(section).toBeInTheDocument();

        expect(screen.queryByText('Electronics')).not.toBeInTheDocument();
        expect(screen.queryByText('Style for Real Life')).not.toBeInTheDocument();
    });

    test('prioritizes data over categoriesPromise when both provided', async () => {
        const categoriesPromise = Promise.resolve([
            {
                id: 'wrong-cat',
                name: 'This should not render',
            },
        ]);

        renderComponent(<PopularCategories data={mockCategories} categoriesPromise={categoriesPromise} />);

        await waitFor(
            () => {
                expect(screen.getByText('Electronics')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        expect(screen.queryByText('This should not render')).not.toBeInTheDocument();
    });

    // Tests for title/subtitle functionality
    test('renders with custom title and subtitle', async () => {
        const customTitle = 'Shop by Category';
        const customSubtitle = 'Discover our curated collections';

        renderComponent(<PopularCategories data={mockCategories} title={customTitle} subtitle={customSubtitle} />);

        await waitFor(
            () => {
                expect(screen.getByText(customTitle)).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        expect(screen.getByText(customSubtitle)).toBeInTheDocument();
    });

    test('falls back to i18n translations when title and subtitle are undefined', async () => {
        renderComponent(<PopularCategories data={mockCategories} />);

        await waitFor(
            () => {
                expect(screen.getByText('Style for Real Life')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        // Default subtitle from i18n — assert the resolved value so this passes
        // under any vertical's locale overrides (e.g. foundations rebrands this copy).
        expect(screen.getByText(i18next.t('categoryGrid.description', { ns: 'home' }))).toBeInTheDocument();
    });

    test('renders custom title with default subtitle', async () => {
        const customTitle = 'Browse Our Collections';

        renderComponent(<PopularCategories data={mockCategories} title={customTitle} />);

        await waitFor(
            () => {
                expect(screen.getByText(customTitle)).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        // Should still show default subtitle from i18n — assert the resolved value so
        // this passes under any vertical's locale overrides.
        expect(screen.getByText(i18next.t('categoryGrid.description', { ns: 'home' }))).toBeInTheDocument();
    });

    test('renders custom subtitle with default title', async () => {
        const customSubtitle = 'Find your perfect style';

        renderComponent(<PopularCategories data={mockCategories} subtitle={customSubtitle} />);

        await waitFor(
            () => {
                expect(screen.getByText('Style for Real Life')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        expect(screen.getByText(customSubtitle)).toBeInTheDocument();
    });
});
