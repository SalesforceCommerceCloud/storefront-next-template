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
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import PopularCategories from './index';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockSiteObject } from '@/test-utils/config';
import { SiteProvider, type Site } from '@salesforce/storefront-next-runtime/site-context';

// Mock decorators (minimal mocking to avoid testing them)
vi.mock('@/lib/decorators/component', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/decorators/component')>();
    return {
        ...actual,
        Component: () => (target: unknown) => target,
        Loader: () => (target: unknown) => target,
    };
});

vi.mock('@/lib/decorators/attribute-definition', () => ({
    AttributeDefinition: () => () => {},
}));

vi.mock('@/lib/decorators', () => ({
    RegionDefinition: () => () => {},
}));

// Mock i18n — cover both the carousel section (`home`) and the Category Card empty title (`common`).
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const translations: Record<string, string> = {
                'categoryGrid.title': 'Popular Categories',
                'categoryGrid.description': 'Explore our collections',
                'categoryGrid.emptyTitle': 'Add your title here',
                'categoryGrid.emptyRegionLabel': 'Categories carousel',
                'categoryGrid.shopNowButton': 'Shop Now',
                'popularCategory.emptyTitle': 'Category',
            };
            return translations[key] || key;
        },
        i18n: { language: mockSiteObject.defaultLocale },
    }),
}));

// Mock Page Designer mode — default to non-design (live storefront). Individual tests flip
// mockIsDesignMode to exercise the authoring empty state.
let mockIsDesignMode = false;
vi.mock('@salesforce/storefront-next-runtime/design/react/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/design/react/core')>();
    return {
        ...actual,
        usePageDesignerMode: () => ({ isDesignMode: mockIsDesignMode }),
    };
});

// Mock the Embla-backed carousel UI so children render synchronously in jsdom.
vi.mock('@/components/ui/carousel', () => ({
    Carousel: ({ children, 'aria-label': ariaLabel }: { children: React.ReactNode; 'aria-label'?: string }) => (
        <div data-testid="carousel" aria-label={ariaLabel}>
            {children}
        </div>
    ),
    CarouselContent: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="carousel-content">{children}</div>
    ),
    CarouselItem: ({ children }: { children: React.ReactNode }) => <div data-testid="carousel-item">{children}</div>,
    CarouselPrevious: () => null,
    CarouselNext: () => null,
    useCarousel: () => ({ isScrollable: false, canScrollPrev: false, canScrollNext: false }),
}));

const mockSite: Site = mockSiteObject;
const mockLocale =
    mockSite.supportedLocales.find((l) => l.id === mockSite.defaultLocale) ?? mockSite.supportedLocales[0];

const renderComponent = (component: React.ReactElement) => {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <ConfigProvider config={mockConfig}>
                        <SiteProvider
                            site={mockSite}
                            locale={mockLocale}
                            language={mockSiteObject.defaultLocale}
                            currency={mockSiteObject.defaultCurrency}>
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

describe('PopularCategories empty state (Page Designer authoring)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsDesignMode = false;
    });

    test('renders placeholder Category Cards through the real carousel path in design mode', () => {
        mockIsDesignMode = true;

        renderComponent(<PopularCategories />);

        // The neutral authoring heading renders ("Add your title here"), NOT the brand copy ("Popular
        // Categories" / its marketing subtitle), and each placeholder Category Card renders its own
        // empty state ("Category" heading) through the real CarouselSection path.
        expect(screen.getByText('Add your title here')).toBeInTheDocument();
        expect(screen.queryByText('Popular Categories')).not.toBeInTheDocument();
        expect(screen.queryByText('Explore our collections')).not.toBeInTheDocument();
        const placeholders = screen.getAllByRole('heading', { name: 'Category' });
        expect(placeholders.length).toBe(8);
        // The region is labelled descriptively ("Categories carousel"), NOT with the visible edit
        // prompt heading — otherwise assistive tech announces the landmark as an editing hint
        // rather than its purpose (WCAG 2.4.6).
        const region = screen.getByTestId('carousel');
        expect(region).toHaveAttribute('aria-label', 'Categories carousel');
        expect(region).not.toHaveAttribute('aria-label', 'Add your title here');
    });

    test('uses a merchant-set title over the neutral placeholder in design mode', () => {
        mockIsDesignMode = true;

        renderComponent(<PopularCategories title="Featured Categories" />);

        // A configured title wins; the neutral "Add your title here" placeholder only fills in when unset.
        expect(screen.getByText('Featured Categories')).toBeInTheDocument();
        expect(screen.queryByText('Add your title here')).not.toBeInTheDocument();
        // A merchant-set title also labels the region (the descriptive fallback only applies when unset).
        expect(screen.getByTestId('carousel')).toHaveAttribute('aria-label', 'Featured Categories');
    });

    test('renders nothing when unconfigured on the live storefront (not design mode)', () => {
        mockIsDesignMode = false;

        const { container } = renderComponent(<PopularCategories />);

        // The authoring placeholder must never leak to shoppers: no title, no placeholder cards.
        expect(screen.queryByText('Add your title here')).not.toBeInTheDocument();
        expect(screen.queryByText('Popular Categories')).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Category' })).not.toBeInTheDocument();
        expect(container.querySelector('[data-testid="carousel"]')).toBeNull();
    });
});
