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
import FiltersDrawer from './filters-drawer';

vi.mock('@/extensions/bopis/components/refine-inventory', () => ({ default: () => null }));
vi.mock('./refine-default', () => ({ default: () => <div>default refinement</div> }));
vi.mock('./refine-color', () => ({ default: () => <div>color refinement</div> }));
vi.mock('./refine-size', () => ({ default: () => <div>size refinement</div> }));

const mockLocale =
    mockAltSiteObject.supportedLocales.find((l) => l.id === mockAltSiteObject.defaultLocale) ??
    mockAltSiteObject.supportedLocales[0];

const result = {
    refinements: [
        {
            attributeId: 'c_refinementColor',
            label: 'Color',
            values: [{ label: 'Black', value: 'Black', hitCount: 5 }],
        },
        {
            attributeId: 'c_size',
            label: 'Size',
            values: [{ label: 'M', value: 'M', hitCount: 3 }],
        },
    ],
} as never;

function renderDrawer(onOpenChange = vi.fn(), drawerResult: unknown = result, focusFacetId: string | null = null) {
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
                            <FiltersDrawer open onOpenChange={onOpenChange} result={drawerResult as never} refine={[]} focusFacetId={focusFacetId} />
                        </SiteProvider>
                    </ConfigProvider>
                ),
            },
        ],
        { initialEntries: ['/'] }
    );
    render(<RouterProvider router={router} />);
    return onOpenChange;
}

describe('FiltersDrawer', () => {
    test('lists every filter collapsed, with a title, Close and View Results', async () => {
        renderDrawer();
        await screen.findByText('Filters');

        expect(screen.getByText('Filters')).toBeInTheDocument();
        // The dialog's built-in X is hidden by CSS; the visible text Close button is the first one.
        expect(screen.getAllByRole('button', { name: 'Close' })[0]).toHaveTextContent('Close');
        expect(screen.getByRole('button', { name: 'View Results' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Color' })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('button', { name: 'Size' })).toHaveAttribute('aria-expanded', 'false');
    });

    test('opens a filter on click, and opening another one closes the first', () => {
        renderDrawer();
        const color = screen.getByRole('button', { name: 'Color' });
        const size = screen.getByRole('button', { name: 'Size' });

        fireEvent.click(color);
        expect(color).toHaveAttribute('aria-expanded', 'true');
        expect(size).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(size);
        expect(size).toHaveAttribute('aria-expanded', 'true');
        expect(color).toHaveAttribute('aria-expanded', 'false');
    });

    test('closes an open filter when its toggle is clicked again', () => {
        renderDrawer();
        const color = screen.getByRole('button', { name: 'Color' });

        fireEvent.click(color);
        expect(color).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(color);
        expect(color).toHaveAttribute('aria-expanded', 'false');
    });

    test('View Results closes the drawer', () => {
        const onOpenChange = renderDrawer();
        fireEvent.click(screen.getByRole('button', { name: 'View Results' }));
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    test('shows placeholder filters when the search returned no facets', () => {
        renderDrawer(vi.fn(), { refinements: [] });

        // Static facets from the design: Gender, Product Type, Size, Color, Brand, ... Support Level.
        for (const label of ['Gender', 'Product Type', 'Size', 'Color', 'Brand', 'Sale', 'Price', 'Support Level']) {
            expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-expanded', 'false');
        }

        fireEvent.click(screen.getByRole('button', { name: 'Gender' }));
        expect(screen.getByText('default refinement')).toBeInTheDocument();

        // Opening another facet closes Gender.
        fireEvent.click(screen.getByRole('button', { name: /^Brand$/ }));
        expect(screen.getByRole('button', { name: /^Gender/ })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('button', { name: /^Brand/ })).toHaveAttribute('aria-expanded', 'true');
    });

    test('opens the filter the shopper clicked in the bar', () => {
        renderDrawer(vi.fn(), { refinements: [] }, 'c_size');

        expect(screen.getByRole('button', { name: 'Size' })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('button', { name: 'Brand' })).toHaveAttribute('aria-expanded', 'false');
    });
});
