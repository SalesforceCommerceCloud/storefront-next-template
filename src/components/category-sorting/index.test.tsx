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

import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockAltSiteObject, mockConfig } from '@/test-utils/config';
import CategorySorting from './index';

const mockLocale =
    mockAltSiteObject.supportedLocales.find((l) => l.id === mockAltSiteObject.defaultLocale) ??
    mockAltSiteObject.supportedLocales[0];

function renderSorting(result: unknown) {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <ConfigProvider config={mockConfig}>
                        <SiteProvider
                            site={mockAltSiteObject}
                            locale={mockLocale}
                            language={mockAltSiteObject.defaultLocale}
                            currency={mockAltSiteObject.defaultCurrency}>
                            <CategorySorting variant="bar" result={result as never} />
                        </SiteProvider>
                    </ConfigProvider>
                ),
            },
        ],
        { initialEntries: ['/'] }
    );
    render(<RouterProvider router={router} />);
    return router;
}

describe('CategorySorting (bar)', () => {
    test('without sorting options it offers the placeholder list and marks the chosen one', async () => {
        renderSorting({ sortingOptions: [] });

        fireEvent.click(await screen.findByTestId('sort-trigger'));
        const labels = screen.getAllByRole('option').map((option) => option.textContent);
        expect(labels).toEqual([
            'Customer rating',
            'Price (High to Low)',
            'Price (Low to High)',
            'Newest',
            'Percent Off',
            'Featured',
        ]);
        expect(screen.getByRole('option', { name: 'Featured' })).toHaveAttribute('aria-selected', 'true');

        fireEvent.click(screen.getByRole('option', { name: 'Newest' }));
        fireEvent.click(screen.getByTestId('sort-trigger'));
        expect(screen.getByRole('option', { name: 'Newest' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('option', { name: 'Featured' })).toHaveAttribute('aria-selected', 'false');
    });

    test('with real sorting options it lists them and sorts through the URL', async () => {
        const router = renderSorting({
            sortingOptions: [
                { id: 'best-matches', label: 'Best Matches' },
                { id: 'price-low-to-high', label: 'Price Low To High' },
            ],
            selectedSortingOption: 'best-matches',
        });

        fireEvent.click(await screen.findByTestId('sort-trigger'));
        expect(screen.getByRole('option', { name: 'Best Matches' })).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(screen.getByRole('option', { name: 'Price Low To High' }));

        await vi.waitFor(() => expect(router.state.location.search).toContain('sort=price-low-to-high'));
    });
});
