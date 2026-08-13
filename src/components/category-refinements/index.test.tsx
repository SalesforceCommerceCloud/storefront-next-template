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
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ShopperSearch } from '@/scapi';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockAltSiteObject, mockConfig } from '@/test-utils/config';
import CategoryRefinements from './index';

// `uiConfig` is a build-time static read at module scope (not from ConfigProvider). Mock it with a
// mutable object so individual tests can flip the `sidebarCategoryRefinement` opt-in. Default matches
// the canonical baseline (flag absent → cgid excluded from the sidebar) so existing tests are unaffected.
const mockUiConfig = {
    pages: {
        category: {
            sidebarCategoryRefinement: undefined as { enabled: boolean } | undefined,
        },
    },
};

vi.mock('@/lib/config.ui', () => ({
    get uiConfig() {
        return mockUiConfig;
    },
}));

const defaultMockSite = mockAltSiteObject;

const mockLocale =
    defaultMockSite.supportedLocales.find((l) => l.id === defaultMockSite.defaultLocale) ??
    defaultMockSite.supportedLocales[0];

vi.mock('@/extensions/bopis/components/refine-inventory', () => ({
    default: () => null,
}));

vi.mock('./refine-default', () => ({
    default: () => <div>default refinement</div>,
}));

vi.mock('./refine-color', () => ({
    default: () => <div>color refinement</div>,
}));

vi.mock('./refine-size', () => ({
    default: () => <div>size refinement</div>,
}));

vi.mock('./refine-price', () => ({
    default: () => <div>price refinement</div>,
}));

const renderComponent = ({
    result,
    refine = [],
}: {
    result: ShopperSearch.schemas['ProductSearchResult'];
    refine?: string[];
}) => {
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
                            <CategoryRefinements result={result} refine={refine} />
                        </SiteProvider>
                    </ConfigProvider>
                ),
            },
        ],
        {
            initialEntries: ['/'],
        }
    );

    return render(<RouterProvider router={router} />);
};

const createProductSearchResult = (
    refinements: ShopperSearch.schemas['ProductSearchResult']['refinements']
): ShopperSearch.schemas['ProductSearchResult'] => ({
    hits: [],
    limit: 0,
    offset: 0,
    total: 0,
    query: '',
    searchPhraseSuggestions: {
        suggestedTerms: [],
    },
    sortingOptions: [],
    refinements,
});

beforeEach(() => {
    // Default: opt-in flag absent (canonical baseline — cgid excluded from the sidebar).
    mockUiConfig.pages.category.sidebarCategoryRefinement = undefined;
});

describe('CategoryRefinements accessibility headings', () => {
    test('does not render cgid category refinement in side filters', () => {
        const result = createProductSearchResult([
            {
                attributeId: 'cgid',
                label: 'Category',
                values: [{ value: 'womens-clothing', label: 'Womens Clothing', hitCount: 12 }],
            },
            {
                attributeId: 'c_refinementColor',
                label: 'Color',
                values: [{ value: 'black', label: 'Black', hitCount: 10 }],
            },
        ]);

        renderComponent({ result });

        expect(screen.queryByRole('heading', { level: 3, name: 'Category' })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 3, name: 'Color' })).toBeInTheDocument();
    });

    test('renders semantic section heading that wraps the trigger button', () => {
        const result = createProductSearchResult([
            {
                attributeId: 'c_refinementColor',
                label: 'Color',
                values: [{ value: 'black', label: 'Black', hitCount: 10 }],
            },
        ]);

        renderComponent({ result });

        const sectionHeading = screen.getByRole('heading', { level: 3, name: 'Color' });
        expect(sectionHeading).toBeInTheDocument();
        expect(sectionHeading.querySelector('button')).toBeInTheDocument();
    });

    test('does not render section headings when no refinements are available', () => {
        const result = createProductSearchResult([]);

        renderComponent({ result });

        expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    });
});

describe('CategoryRefinements sidebar category facet (opt-in)', () => {
    beforeEach(() => {
        // Promote the cgid level into the sidebar (e.g. footwear "Shop by Activity").
        mockUiConfig.pages.category.sidebarCategoryRefinement = { enabled: true };
    });

    afterEach(() => {
        mockUiConfig.pages.category.sidebarCategoryRefinement = undefined;
    });

    test('renders the cgid refinement as a single-select radio facet when enabled', () => {
        const result = createProductSearchResult([
            {
                attributeId: 'cgid',
                label: 'Activity',
                values: [
                    {
                        value: 'activity',
                        label: 'Activity',
                        hitCount: 60,
                        values: [
                            { value: 'running', label: 'Running', hitCount: 42 },
                            { value: 'trail', label: 'Trail', hitCount: 18 },
                        ],
                    },
                ],
            },
        ]);

        // An active cgid refine opens the section by default (hasActiveFilter), so its radios
        // are visible rather than inside a collapsed panel.
        renderComponent({ result, refine: ['cgid=running'] });

        // The "Activity" section heading now renders (cgid is kept in the sidebar)...
        expect(screen.getByRole('heading', { level: 3, name: 'Activity' })).toBeInTheDocument();
        // ...and the child categories render as single-select radios (hierarchical flattened).
        expect(screen.getAllByRole('radio')).toHaveLength(2);
        expect(screen.getByText('Running')).toBeInTheDocument();
        expect(screen.getByText('Trail')).toBeInTheDocument();
    });

    test('renders no facet content and does not crash when the cgid refinement has empty values', () => {
        // AC-5 safety: before the activity catalog is provisioned, cgid may arrive with no values.
        const result = createProductSearchResult([
            {
                attributeId: 'cgid',
                label: 'Activity',
                values: [],
            },
        ]);

        renderComponent({ result });

        // Empty-values refinements are skipped entirely (no section heading, no radios, no crash).
        expect(screen.queryByRole('heading', { level: 3, name: 'Activity' })).not.toBeInTheDocument();
        expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    });
});
