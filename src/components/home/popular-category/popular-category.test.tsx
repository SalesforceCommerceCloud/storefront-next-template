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
import PopularCategory from './index';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, getSitePrefix, mockSiteObject } from '@/test-utils/config';
import { SiteProvider, type Site } from '@salesforce/storefront-next-runtime/site-context';
import type { ShopperProducts } from '@/scapi';

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

// Mock i18n
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const translations: Record<string, string> = {
                'categoryGrid.shopNowButton': 'Shop Now',
            };
            return translations[key] || key;
        },
        i18n: { language: mockSiteObject.defaultLocale },
    }),
}));

const mockCategory: ShopperProducts.schemas['Category'] = {
    id: 'newarrivals',
    name: 'New Arrivals',
    pageDescription: 'Shop all new arrivals including women and mens clothing',
    image: '/images/new-arrivals.jpg',
    c_slotBannerImage: '/images/new-arrivals-banner.jpg',
};

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

describe('PopularCategory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('renders category with data prop (from loader)', () => {
        renderComponent(<PopularCategory data={mockCategory} />);

        expect(screen.getByText('New Arrivals')).toBeInTheDocument();
        expect(screen.queryByText('Shop all new arrivals including women and mens clothing')).not.toBeInTheDocument();
        expect(screen.getByText('Shop Now')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /new arrivals/i })).toHaveAttribute(
            'href',
            `${getSitePrefix()}/category/newarrivals`
        );
    });

    test('renders category with category prop (programmatic use)', () => {
        renderComponent(<PopularCategory category={mockCategory} />);

        expect(screen.getByText('New Arrivals')).toBeInTheDocument();
        expect(screen.queryByText('Shop all new arrivals including women and mens clothing')).not.toBeInTheDocument();
    });

    test('shows description when showDescription is true', () => {
        renderComponent(<PopularCategory data={mockCategory} showDescription />);

        expect(screen.getByText('New Arrivals')).toBeInTheDocument();
        expect(screen.getByText('Shop all new arrivals including women and mens clothing')).toBeInTheDocument();
    });

    test('prioritizes data prop over category prop', () => {
        const dataCategory = { ...mockCategory, name: 'From Data' };
        const categoryProp = { ...mockCategory, name: 'From Category' };

        renderComponent(<PopularCategory data={dataCategory} category={categoryProp} />);

        expect(screen.getByText('From Data')).toBeInTheDocument();
        expect(screen.queryByText('From Category')).not.toBeInTheDocument();
    });

    test('ignores string category prop (from Page Designer)', () => {
        const { container } = renderComponent(<PopularCategory category={'newarrivals' as any} />);

        // Component returns null when category is a string (not an object)
        expect(container.firstChild).toBeNull();
    });

    test('renders nothing when no data provided', () => {
        const { container } = renderComponent(<PopularCategory />);

        // Component returns null when no category data is available
        expect(container.firstChild).toBeNull();
    });

    test('uses pageDescription over description when showDescription is true', () => {
        const categoryWithBoth = {
            ...mockCategory,
            pageDescription: 'Page description',
            description: 'Regular description',
        };

        renderComponent(<PopularCategory data={categoryWithBoth} showDescription />);

        expect(screen.getByText('Page description')).toBeInTheDocument();
        expect(screen.queryByText('Regular description')).not.toBeInTheDocument();
    });

    test('falls back to description if pageDescription not available', () => {
        const categoryWithoutPageDesc = {
            ...mockCategory,
            pageDescription: undefined,
            description: 'Regular description',
        };

        renderComponent(<PopularCategory data={categoryWithoutPageDesc} showDescription />);

        expect(screen.getByText('Regular description')).toBeInTheDocument();
    });

    test('uses category image when available', () => {
        const { container } = renderComponent(<PopularCategory data={mockCategory} />);

        const image = container.querySelector('img');
        expect(image).toHaveAttribute('src', '/images/new-arrivals.jpg');
    });

    test('falls back to banner image if category image not available', () => {
        const categoryWithoutImage = {
            ...mockCategory,
            image: undefined,
        };

        const { container } = renderComponent(<PopularCategory data={categoryWithoutImage} />);

        const image = container.querySelector('img');
        expect(image).toHaveAttribute('src', '/images/new-arrivals-banner.jpg');
    });

    test('sets image alt to empty (decorative — the overlaid heading names the tile)', () => {
        const { container } = renderComponent(<PopularCategory data={mockCategory} />);

        const image = container.querySelector('img');
        expect(image).toHaveAttribute('alt', '');
    });

    test('generates correct category link', () => {
        renderComponent(<PopularCategory data={mockCategory} />);

        const link = screen.getByRole('link', { name: /new arrivals/i });
        expect(link).toHaveAttribute('href', `${getSitePrefix()}/category/newarrivals`);
    });

    test('handles category with empty id', () => {
        const categoryWithEmptyId = {
            ...mockCategory,
            id: '',
        };

        renderComponent(<PopularCategory data={categoryWithEmptyId} />);

        const link = screen.getByRole('link', { name: /new arrivals/i });
        expect(link).toHaveAttribute('href', `${getSitePrefix()}/category/`);
    });

    test('handles category with empty name', () => {
        const categoryWithEmptyName = {
            ...mockCategory,
            name: '',
        };

        const { container } = renderComponent(<PopularCategory data={categoryWithEmptyName} />);

        // When alt is empty, image has role="presentation" and is not accessible via getByRole('img')
        // Query the image directly from the container
        const image = container.querySelector('img');
        expect(image).toBeInTheDocument();
        expect(image).toHaveAttribute('alt', '');
    });

    test('handles category with neither image nor banner', () => {
        const categoryNoImages = {
            ...mockCategory,
            image: undefined,
            c_slotBannerImage: undefined,
        };

        const { container } = renderComponent(<PopularCategory data={categoryNoImages} />);

        // Should use fallback hero image
        const image = container.querySelector('img');
        expect(image).toBeInTheDocument();
    });

    test('handles null category prop', () => {
        const { container } = renderComponent(<PopularCategory category={null as any} />);

        // Component returns null when category is null
        expect(container.firstChild).toBeNull();
    });

    test('handles category prop with null value in type check', () => {
        const { container } = renderComponent(<PopularCategory category={null as any} data={undefined} />);

        // Component returns null since null is not an object
        expect(container.firstChild).toBeNull();
    });
});
