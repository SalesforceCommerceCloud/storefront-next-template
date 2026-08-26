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
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import CategoryBreadcrumbs from './index';
import type { ShopperProducts } from '@/scapi';

type PrimaryCategory = NonNullable<ShopperProducts.schemas['Product']['primaryCategory']>;

const createTestWrapper = (component: React.ReactElement) => {
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: <AllProvidersWrapper>{component}</AllProvidersWrapper>,
            },
        ],
        { initialEntries: ['/'] }
    );
    return <RouterProvider router={router} />;
};

describe('CategoryBreadcrumbs', () => {
    it('should render breadcrumbs from parentCategoryTree when provided', () => {
        const category: PrimaryCategory = {
            id: 'category-3',
            name: 'Subcategory',
            parentCategoryTree: [
                { id: 'category-1', name: 'New Arrivals' },
                { id: 'category-2', name: 'Parent Category' },
                { id: 'category-3', name: 'Subcategory' },
            ],
        };

        render(createTestWrapper(<CategoryBreadcrumbs category={category} />));

        expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.getByText('New Arrivals')).toBeInTheDocument();
        expect(screen.getByText('Parent Category')).toBeInTheDocument();
        expect(screen.getByText('Subcategory')).toBeInTheDocument();
    });

    it('should render Home and fallback breadcrumb when parentCategoryTree is undefined', () => {
        const category: PrimaryCategory = {
            id: 'category-1',
            name: 'Root Category',
        };

        render(createTestWrapper(<CategoryBreadcrumbs category={category} />));

        expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.getByText('Root Category')).toBeInTheDocument();
    });

    it('should render links with correct hrefs', () => {
        const category: PrimaryCategory = {
            id: 'category-2',
            name: 'Category',
            parentCategoryTree: [
                { id: 'cat-1', name: 'First' },
                { id: 'cat-2', name: 'Second' },
            ],
        };

        render(createTestWrapper(<CategoryBreadcrumbs category={category} />));

        const homeLink = screen.getByRole('link', { name: 'Home' });
        const firstLink = screen.getByRole('link', { name: 'First' });
        const secondLink = screen.getByRole('link', { name: 'Second' });

        expect(homeLink).toHaveAttribute('href', '/global/en-GB/');
        expect(firstLink).toHaveAttribute('href', '/global/en-GB/category/cat-1');
        expect(secondLink).toHaveAttribute('href', '/global/en-GB/category/cat-2');
    });

    it('should show chevron icons between breadcrumb items', () => {
        const category: PrimaryCategory = {
            id: 'category-3',
            name: 'Third',
            parentCategoryTree: [
                { id: 'cat-1', name: 'First' },
                { id: 'cat-2', name: 'Second' },
                { id: 'cat-3', name: 'Third' },
            ],
        };

        const { container } = render(createTestWrapper(<CategoryBreadcrumbs category={category} />));

        // Home + 3 category items = 4 items, 3 chevrons (one before each category item)
        const chevrons = container.querySelectorAll('svg.lucide-chevron-right');
        expect(chevrons).toHaveLength(3);
    });

    it('should show chevron between Home and single category item', () => {
        const category: PrimaryCategory = {
            id: 'cat-1',
            name: 'Single',
            parentCategoryTree: [{ id: 'cat-1', name: 'Single' }],
        };

        const { container } = render(createTestWrapper(<CategoryBreadcrumbs category={category} />));

        // Home + 1 category item = 2 items, 1 chevron
        const chevrons = container.querySelectorAll('svg.lucide-chevron-right');
        expect(chevrons).toHaveLength(1);
    });
});
