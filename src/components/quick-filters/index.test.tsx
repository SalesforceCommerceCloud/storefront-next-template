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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ShopperProducts } from '@/scapi';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockSiteObject } from '@/test-utils/config';
import QuickFilters from './index';

const mockNavigate = vi.fn();

vi.mock('@/hooks/use-navigate', () => ({
    useNavigate: () => mockNavigate,
}));

beforeEach(() => {
    mockNavigate.mockClear();
});

const renderComponent = ({
    category,
    initialPath = '/',
    categoryLabel,
    config = mockConfig,
}: {
    category?: ShopperProducts.schemas['Category'];
    initialPath?: string;
    categoryLabel?: string;
    config?: typeof mockConfig;
}) => {
    const locale = mockSiteObject.supportedLocales[0];
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <ConfigProvider config={config}>
                        <SiteProvider
                            site={mockSiteObject}
                            locale={locale}
                            language={locale.id}
                            currency={locale.preferredCurrency}>
                            <QuickFilters category={category} categoryLabel={categoryLabel} />
                        </SiteProvider>
                    </ConfigProvider>
                ),
            },
            {
                path: '/category/:categoryId',
                element: (
                    <ConfigProvider config={config}>
                        <SiteProvider
                            site={mockSiteObject}
                            locale={locale}
                            language={locale.id}
                            currency={locale.preferredCurrency}>
                            <QuickFilters category={category} categoryLabel={categoryLabel} />
                        </SiteProvider>
                    </ConfigProvider>
                ),
            },
        ],
        {
            initialEntries: [initialPath],
        }
    );

    return render(<RouterProvider router={router} />);
};

describe('QuickFilters', () => {
    test('renders subcategories from category.categories', () => {
        const category = {
            id: 'mens',
            name: 'Men',
            categories: [
                { id: 'mens-suits', name: 'Suits' },
                { id: 'mens-shorts', name: 'Shorts' },
                { id: 'mens-pants', name: 'Pants' },
            ],
        };

        renderComponent({ category });

        expect(screen.getByRole('button', { name: 'Suits' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Shorts' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Pants' })).toBeInTheDocument();
    });

    test('does not render when no category provided', () => {
        renderComponent({});

        expect(screen.queryByRole('group', { name: 'Quick category filters' })).not.toBeInTheDocument();
    });

    test('does not render when category has no subcategories', () => {
        const category = {
            id: 'mens',
            name: 'Men',
            categories: [],
        };

        renderComponent({ category });

        expect(screen.queryByRole('group', { name: 'Quick category filters' })).not.toBeInTheDocument();
    });

    test('highlights active category based on URL refinements', () => {
        const category = {
            id: 'mens',
            name: 'Men',
            categories: [
                { id: 'mens-tops', name: 'Tops' },
                { id: 'mens-bottoms', name: 'Bottoms' },
            ],
        };

        renderComponent({ category, initialPath: '/?refine=cgid%3Dmens-tops' });

        const topsButton = screen.getByRole('button', { name: 'Tops' });
        expect(topsButton).toHaveAttribute('aria-pressed', 'true');

        const bottomsButton = screen.getByRole('button', { name: 'Bottoms' });
        expect(bottomsButton).toHaveAttribute('aria-pressed', 'false');
    });

    test('adds cgid refinement when chip is clicked', async () => {
        const user = userEvent.setup();
        const category = {
            id: 'mens',
            name: 'Men',
            categories: [
                { id: 'mens-tops', name: 'Tops' },
                { id: 'mens-bottoms', name: 'Bottoms' },
            ],
        };

        renderComponent({ category });

        const topsButton = screen.getByRole('button', { name: 'Tops' });
        await user.click(topsButton);

        expect(mockNavigate).toHaveBeenCalledWith({
            pathname: '/',
            search: '?refine=cgid%3Dmens-tops&offset=0',
        });
    });

    test('preserves non-cgid refinements when adding cgid refinement', async () => {
        const user = userEvent.setup();
        const category = {
            id: 'mens',
            name: 'Men',
            categories: [{ id: 'mens-tops', name: 'Tops' }],
        };

        renderComponent({
            category,
            initialPath: '/?refine=c_refinementColor%3Dblack&refine=cgid%3Dmens',
        });

        const topsButton = screen.getByRole('button', { name: 'Tops' });
        await user.click(topsButton);

        expect(mockNavigate).toHaveBeenCalledWith(
            expect.objectContaining({
                pathname: '/',
                search: expect.stringMatching(/refine=c_refinementColor%3Dblack.*refine=cgid%3Dmens-tops/),
            })
        );
        const call = mockNavigate.mock.calls[0][0];
        expect(call.search).not.toContain('cgid%3Dmens&');
    });

    test('navigates to the child category path when SEO routes are configured', async () => {
        const user = userEvent.setup();
        const config = {
            ...mockConfig,
            url: {
                ...mockConfig.url,
                seoRoutes: {
                    [mockSiteObject.id]: {
                        product: { prefix: 'p' },
                        category: { prefix: 'c', mode: 'id-suffix' as const },
                    },
                },
            },
        };
        const category = {
            id: 'mens',
            name: 'Men',
            categories: [{ id: 'mens-tops', name: 'Tops' }],
        };

        renderComponent({
            category,
            config,
            initialPath:
                '/?refine=c_refinementColor%3Dblack&refine=cgid%3Dmens&refine=cgslug%3Dmens&offset=24&page=2&sort=best-matches',
        });

        await user.click(screen.getByRole('button', { name: 'Tops' }));

        expect(mockNavigate).toHaveBeenCalledOnce();
        const destination = new URL(mockNavigate.mock.calls[0][0], 'https://example.com');
        expect(destination.pathname).toBe('/c/mens-tops');
        expect(destination.searchParams.getAll('refine')).toEqual(['c_refinementColor=black']);
        expect(destination.searchParams.get('sort')).toBe('best-matches');
        expect(destination.searchParams.has('offset')).toBe(false);
        expect(destination.searchParams.has('page')).toBe(false);
    });

    test('uses the authoritative child slug in slug-path mode', async () => {
        const user = userEvent.setup();
        const config = {
            ...mockConfig,
            url: {
                ...mockConfig.url,
                seoRoutes: {
                    [mockSiteObject.id]: {
                        product: { prefix: 'p' },
                        category: { prefix: 'catalog', mode: 'slug-path' as const },
                    },
                },
            },
        };

        renderComponent({
            config,
            category: {
                id: 'mens',
                name: 'Men',
                categories: [{ id: 'mens-tops', name: 'Tops', slug: 'mens/tops' }],
            },
        });

        await user.click(screen.getByRole('button', { name: 'Tops' }));

        expect(mockNavigate).toHaveBeenCalledWith('/catalog/mens/tops');
    });

    test('disables a slug-path category without an authoritative slug', async () => {
        const user = userEvent.setup();
        const config = {
            ...mockConfig,
            url: {
                ...mockConfig.url,
                seoRoutes: {
                    [mockSiteObject.id]: {
                        product: { prefix: 'p' },
                        category: { prefix: 'catalog', mode: 'slug-path' as const },
                    },
                },
            },
        };

        renderComponent({
            config,
            category: {
                id: 'mens',
                name: 'Men',
                categories: [{ id: 'mens-tops', name: 'Tops' }],
            },
        });

        const button = screen.getByRole('button', { name: 'Tops' });
        expect(button).toBeDisabled();
        await user.click(button);
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('does not traverse the category hierarchy again when a category is selected', async () => {
        const user = userEvent.setup();
        const config = {
            ...mockConfig,
            url: {
                ...mockConfig.url,
                seoRoutes: {
                    [mockSiteObject.id]: {
                        product: { prefix: 'p' },
                        category: { prefix: 'catalog', mode: 'slug-path' as const },
                    },
                },
            },
        };
        let hierarchyReads = 0;
        const category = {
            id: 'mens',
            name: 'Men',
            get categories() {
                hierarchyReads += 1;
                return [{ id: 'mens-tops', name: 'Tops', slug: 'mens/tops' }];
            },
        };

        renderComponent({ category, config });
        const readsAfterRender = hierarchyReads;

        await user.click(screen.getByRole('button', { name: 'Tops' }));

        expect(hierarchyReads).toBe(readsAfterRender);
        expect(mockNavigate).toHaveBeenCalledWith('/catalog/mens/tops');
    });

    test('removes cgid refinement when clicking active chip (toggle off)', async () => {
        const user = userEvent.setup();
        const category = {
            id: 'mens',
            name: 'Men',
            categories: [
                { id: 'mens-tops', name: 'Tops' },
                { id: 'mens-bottoms', name: 'Bottoms' },
            ],
        };

        renderComponent({
            category,
            initialPath: '/?refine=cgid%3Dmens-tops',
        });

        const topsButton = screen.getByRole('button', { name: 'Tops' });
        expect(topsButton).toHaveAttribute('aria-pressed', 'true');

        await user.click(topsButton);

        expect(mockNavigate).toHaveBeenCalledWith({
            pathname: '/',
            search: '?offset=0',
        });
    });

    test('renders category ID when name is missing', () => {
        const category = {
            id: 'mens',
            name: 'Men',
            categories: [{ id: 'mens-tops', name: '' }],
        };

        renderComponent({ category });

        expect(screen.getByRole('button', { name: 'mens-tops' })).toBeInTheDocument();
    });

    test('has proper accessibility attributes', () => {
        const category = {
            id: 'mens',
            name: 'Men',
            categories: [{ id: 'mens-tops', name: 'Tops' }],
        };

        renderComponent({ category });

        const container = screen.getByRole('group', { name: 'Quick category filters' });
        expect(container).toBeInTheDocument();

        const button = screen.getByRole('button', { name: 'Tops' });
        expect(button).toHaveAttribute('aria-pressed');
    });

    test('renders "Shop by {label}" header when categoryLabel is provided', () => {
        const category = {
            id: 'womens',
            name: 'Women',
            categories: [{ id: 'womens-tops', name: 'Tops' }],
        };

        renderComponent({ category, categoryLabel: 'Women' });

        expect(screen.getByText('Shop by Women')).toBeInTheDocument();
        // Header label is also the group's accessible name when present.
        expect(screen.getByRole('group', { name: 'Shop by Women' })).toBeInTheDocument();
    });

    test('omits the header when categoryLabel is not provided', () => {
        const category = {
            id: 'womens',
            name: 'Women',
            categories: [{ id: 'womens-tops', name: 'Tops' }],
        };

        renderComponent({ category });

        expect(screen.queryByText(/^Shop by/)).not.toBeInTheDocument();
        // Falls back to the generic group label.
        expect(screen.getByRole('group', { name: 'Quick category filters' })).toBeInTheDocument();
    });

    test('has data-slot attribute for deterministic selection', () => {
        const category = {
            id: 'mens',
            name: 'Men',
            categories: [{ id: 'mens-tops', name: 'Tops' }],
        };

        renderComponent({ category });

        const container = screen.getByRole('group', { name: 'Quick category filters' });
        expect(container).toHaveAttribute('data-slot', 'quick-filters');
    });
});
