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
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import ActiveFilters from './index';
import type { ShopperSearch } from '@/scapi';
import { normalizeLocalInventorySearch } from '@/lib/product/local-inventory-search';

const mockNavigate = vi.fn();

vi.mock('@/hooks/use-navigate', () => ({
    useNavigate: () => mockNavigate,
}));

vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    useStoreLocator: () => null,
}));

const createProductSearchResult = (): ShopperSearch.schemas['ProductSearchResult'] => ({
    hits: [],
    limit: 24,
    offset: 0,
    total: 100,
    query: '',
    searchPhraseSuggestions: {
        suggestedTerms: [],
    },
    sortingOptions: [],
    refinements: [
        { attributeId: 'ilids', label: 'Inventory', values: [{ value: 'list-A', label: 'In stock', hitCount: 1 }] },
        {
            attributeId: 'cgid',
            label: 'Category',
            values: [{ value: 'womens-outfits', label: 'Outfits', hitCount: 10 }],
        },
        {
            attributeId: 'c_refinementColor',
            label: 'Color',
            values: [{ value: 'Black', label: 'Black', hitCount: 8 }],
        },
    ],
});

const renderComponent = (initialEntry: string) => {
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: <ActiveFilters result={createProductSearchResult()} />,
            },
        ],
        { initialEntries: [initialEntry] }
    );
    return render(<RouterProvider router={router} />);
};

describe('ActiveFilters on category pages', () => {
    beforeEach(() => {
        mockNavigate.mockReset();
    });

    test('hides cgid quick filters from applied filters list', () => {
        renderComponent('/category/womens-clothing?refine=cgid%3Dwomens-outfits&refine=c_refinementColor%3DBlack');

        expect(screen.getByRole('button', { name: /Black/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Outfits/i })).not.toBeInTheDocument();
    });

    test('represents the paired inventory filter with the store chip only', () => {
        renderComponent('/search?refine=ilids%3Dlist-A&refine=orderable_only%3Dtrue&refine=c_refinementColor%3DBlack');
        expect(screen.getByRole('button', { name: /in stock/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Black' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'true' })).not.toBeInTheDocument();
    });

    test('removing the store chip clears the paired boolean without restoring it on normalization', async () => {
        renderComponent(
            '/search?q=shirt&sort=best-matches&utm_source=qa&inventoryStore=A&refine=ilids%3Dlist-A&refine=orderable_only%3Dtrue&refine=c_refinementColor%3DBlack&offset=48&page=3'
        );
        await userEvent.setup().click(screen.getByRole('button', { name: /in stock/i }));
        const params = new URLSearchParams(mockNavigate.mock.calls[0][0].search);
        expect(params.getAll('refine')).toEqual(['c_refinementColor=Black']);
        expect(params.get('offset')).toBe('0');
        expect(params.has('page')).toBe(false);
        expect(params.get('q')).toBe('shirt');
        expect(params.get('sort')).toBe('best-matches');
        expect(params.get('utm_source')).toBe('qa');
        expect(params.get('inventoryStore')).toBe('A');
        expect(normalizeLocalInventorySearch(params, 'list-A', 'A').getAll('refine')).toEqual([
            'c_refinementColor=Black',
        ]);
    });

    test('clear all resets both pagination modes and retains selection and unrelated parameters', async () => {
        renderComponent(
            '/search?q=shirt&sort=best-matches&inventoryStore=A&refine=ilids%3Dlist-A&refine=orderable_only%3Dtrue&offset=48&page=3'
        );
        await userEvent.setup().click(screen.getByRole('button', { name: /clear all/i }));
        const params = new URLSearchParams(mockNavigate.mock.calls[0][0].search);
        expect(params.has('refine')).toBe(false);
        expect(params.get('offset')).toBe('0');
        expect(params.has('page')).toBe(false);
        expect(params.get('q')).toBe('shirt');
        expect(params.get('sort')).toBe('best-matches');
        expect(params.get('inventoryStore')).toBe('A');
    });

    test('clear all still removes all refine params including cgid', async () => {
        const user = userEvent.setup();
        renderComponent('/category/womens-clothing?refine=cgid%3Dwomens-outfits&refine=c_refinementColor%3DBlack');

        await user.click(screen.getByRole('button', { name: /clear all/i }));

        expect(mockNavigate).toHaveBeenCalledWith(
            expect.objectContaining({
                search: expect.stringContaining('offset=0'),
            })
        );
        const firstCallArg = mockNavigate.mock.calls[0]?.[0] as { search?: string };
        expect(firstCallArg.search).not.toContain('refine=');
    });
});
