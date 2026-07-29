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
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import CategoryBreadcrumbs from './index';
import type { ShopperProducts } from '@/scapi';

const renderInRouter = (element: React.ReactElement) => {
    const router = createMemoryRouter([{ path: '*', element: <AllProvidersWrapper>{element}</AllProvidersWrapper> }], {
        initialEntries: ['/'],
    });
    return render(<RouterProvider router={router} />);
};

describe('CategoryBreadcrumbs', () => {
    test('renders breadcrumb navigation with aria-label', () => {
        const category: ShopperProducts.schemas['Category'] = {
            id: 'category-1',
            name: 'Category 1',
            parentCategoryTree: [
                { id: 'parent', name: 'Parent' },
                { id: 'category-1', name: 'Category 1' },
            ],
        };

        renderInRouter(<CategoryBreadcrumbs category={category} />);

        const nav = screen.getByRole('navigation');
        expect(nav).toHaveAttribute('aria-label');
    });

    test('renders home link and category links', () => {
        const category: ShopperProducts.schemas['Category'] = {
            id: 'category-1',
            name: 'Category 1',
            parentCategoryTree: [
                { id: 'parent', name: 'Parent' },
                { id: 'category-1', name: 'Category 1' },
            ],
        };

        renderInRouter(<CategoryBreadcrumbs category={category} />);

        expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /parent/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /category 1/i })).toBeInTheDocument();
    });

    test('adds aria-current="page" to the last breadcrumb item', () => {
        const category: ShopperProducts.schemas['Category'] = {
            id: 'category-1',
            name: 'Category 1',
            parentCategoryTree: [
                { id: 'parent', name: 'Parent' },
                { id: 'category-1', name: 'Category 1' },
            ],
        };

        renderInRouter(<CategoryBreadcrumbs category={category} />);

        const allLinks = screen.getAllByRole('link');
        const lastCategoryLink = allLinks[allLinks.length - 1];

        expect(lastCategoryLink).toHaveAttribute('aria-current', 'page');
        expect(lastCategoryLink).toHaveTextContent('Category 1');
    });

    test('does not add aria-current to non-terminal breadcrumbs', () => {
        const category: ShopperProducts.schemas['Category'] = {
            id: 'category-1',
            name: 'Category 1',
            parentCategoryTree: [
                { id: 'parent', name: 'Parent' },
                { id: 'category-1', name: 'Category 1' },
            ],
        };

        renderInRouter(<CategoryBreadcrumbs category={category} />);

        const homeLink = screen.getByRole('link', { name: /home/i });
        const parentLink = screen.getByRole('link', { name: /parent/i });

        expect(homeLink).not.toHaveAttribute('aria-current');
        expect(parentLink).not.toHaveAttribute('aria-current');
    });

    test('handles single-level category', () => {
        const category: ShopperProducts.schemas['Category'] = {
            id: 'single',
            name: 'Single',
            parentCategoryTree: [{ id: 'single', name: 'Single' }],
        };

        renderInRouter(<CategoryBreadcrumbs category={category} />);

        const singleLink = screen.getByRole('link', { name: /single/i });
        expect(singleLink).toHaveAttribute('aria-current', 'page');
    });

    test('handles category without parentCategoryTree', () => {
        const category: ShopperProducts.schemas['Category'] = {
            id: 'no-tree',
            name: 'No Tree',
        };

        renderInRouter(<CategoryBreadcrumbs category={category} />);

        const categoryLink = screen.getByRole('link', { name: /no tree/i });
        expect(categoryLink).toHaveAttribute('aria-current', 'page');
    });
});
