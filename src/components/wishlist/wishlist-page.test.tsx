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
import { render, screen, fireEvent } from '@testing-library/react';
import type { ShopperCustomers, ShopperProducts } from '@/scapi';
import { WishlistPageContent, WishlistSkeleton } from './wishlist-page';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();

type CustomerProductListItem = ShopperCustomers.schemas['CustomerProductListItem'];
type Product = ShopperProducts.schemas['Product'];

// Mock react-i18next using the same pattern as other wishlist tests
vi.mock('react-i18next', () => ({
    useTranslation: (namespace?: string | string[]) => ({
        t: (key: string, options?: Record<string, unknown>) => {
            const ns = Array.isArray(namespace) ? namespace[0] : namespace;
            if (ns && !key.includes(':')) {
                return t(`${ns}:${key}`, options);
            }
            return t(key, options);
        },
        i18n: { language: 'en-GB' },
    }),
}));

// Mock WishlistListItem to isolate page-level logic
vi.mock('@/components/wishlist/wishlist-list-item', () => ({
    WishlistListItem: ({
        product,
        onRemove,
        wishlistItem,
    }: {
        product: ShopperProducts.schemas['Product'];
        onRemove: (id: string) => void;
        wishlistItem: ShopperCustomers.schemas['CustomerProductListItem'];
    }) => (
        <div data-testid={`wishlist-item-${wishlistItem.id}`}>
            <span>{product.name}</span>
            <button data-testid={`remove-btn-${wishlistItem.id}`} onClick={() => onRemove(wishlistItem.id ?? '')}>
                Remove
            </button>
        </div>
    ),
}));

// Mock getPriceData to control on-sale detection per product
const mockGetPriceData = vi.fn();
vi.mock('@/components/product-price/utils', () => ({
    getPriceData: (...args: unknown[]) => mockGetPriceData(...args),
}));

// -- Test data --

const inStockProduct: Product = {
    id: 'prod-in-stock',
    name: 'Alpha Jacket',
    price: 150,
    currency: 'GBP',
    inventory: { ats: 5, orderable: true, id: 'inv1' },
};

const outOfStockProduct: Product = {
    id: 'prod-out-of-stock',
    name: 'Beta Boots',
    price: 200,
    currency: 'GBP',
    inventory: { ats: 0, orderable: false, id: 'inv2' },
};

const onSaleProduct: Product = {
    id: 'prod-on-sale',
    name: 'Charlie Coat',
    price: 75,
    currency: 'GBP',
    inventory: { ats: 3, orderable: true, id: 'inv3' },
};

const allItems: CustomerProductListItem[] = [
    { id: 'item-1', productId: 'prod-in-stock', priority: 0, public: false, quantity: 1 },
    { id: 'item-2', productId: 'prod-out-of-stock', priority: 0, public: false, quantity: 1 },
    { id: 'item-3', productId: 'prod-on-sale', priority: 0, public: false, quantity: 1 },
];

const allProducts: Record<string, Product> = {
    'prod-in-stock': inStockProduct,
    'prod-out-of-stock': outOfStockProduct,
    'prod-on-sale': onSaleProduct,
};

describe('WishlistPageContent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        mockGetPriceData.mockImplementation((product: Product) => ({
            isOnSale: product.id === 'prod-on-sale',
        }));
    });

    describe('rendering', () => {
        test('renders page title', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);
            expect(screen.getByText(t('account:wishlist.pageTitle'))).toBeInTheDocument();
        });

        test('renders page subtitle', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);
            expect(screen.getByText(t('account:wishlist.pageSubtitle'))).toBeInTheDocument();
        });

        test('renders item count', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);
            expect(screen.getByText(t('account:wishlist.itemCount', { count: 3 }))).toBeInTheDocument();
        });

        test('renders all wishlist items', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);
            expect(screen.getByTestId('wishlist-item-item-1')).toBeInTheDocument();
            expect(screen.getByTestId('wishlist-item-item-2')).toBeInTheDocument();
            expect(screen.getByTestId('wishlist-item-item-3')).toBeInTheDocument();
        });

        test('renders sort and filter controls', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);
            expect(screen.getByText(t('account:wishlist.sortBy'))).toBeInTheDocument();
            expect(screen.getByText(t('account:wishlist.filterBy'))).toBeInTheDocument();
        });
    });

    describe('empty state', () => {
        test('shows empty title when no items', () => {
            render(<WishlistPageContent items={[]} productsByProductId={{}} />);
            expect(screen.getByText(t('account:wishlist.emptyTitle'))).toBeInTheDocument();
        });

        test('shows empty subtitle when no items', () => {
            render(<WishlistPageContent items={[]} productsByProductId={{}} />);
            expect(screen.getByText(t('account:wishlist.emptySubtitle'))).toBeInTheDocument();
        });

        test('does not render sort/filter controls when empty', () => {
            render(<WishlistPageContent items={[]} productsByProductId={{}} />);
            expect(screen.queryByText(t('account:wishlist.sortBy'))).not.toBeInTheDocument();
        });
    });

    describe('filtering', () => {
        test('filter "in-stock" shows only in-stock items', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);

            const selects = screen.getAllByRole('combobox');
            fireEvent.change(selects[1], { target: { value: 'in-stock' } });

            expect(screen.getByTestId('wishlist-item-item-1')).toBeInTheDocument();
            expect(screen.queryByTestId('wishlist-item-item-2')).not.toBeInTheDocument();
            expect(screen.getByTestId('wishlist-item-item-3')).toBeInTheDocument();
        });

        test('filter "out-of-stock" shows only out-of-stock items', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);

            const selects = screen.getAllByRole('combobox');
            fireEvent.change(selects[1], { target: { value: 'out-of-stock' } });

            expect(screen.queryByTestId('wishlist-item-item-1')).not.toBeInTheDocument();
            expect(screen.getByTestId('wishlist-item-item-2')).toBeInTheDocument();
            expect(screen.queryByTestId('wishlist-item-item-3')).not.toBeInTheDocument();
        });

        test('filter "on-sale" shows only on-sale items', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);

            const selects = screen.getAllByRole('combobox');
            fireEvent.change(selects[1], { target: { value: 'on-sale' } });

            expect(screen.queryByTestId('wishlist-item-item-1')).not.toBeInTheDocument();
            expect(screen.queryByTestId('wishlist-item-item-2')).not.toBeInTheDocument();
            expect(screen.getByTestId('wishlist-item-item-3')).toBeInTheDocument();
        });

        test('shows no-filter-results message when filter excludes all items', () => {
            mockGetPriceData.mockReturnValue({ isOnSale: false });

            render(
                <WishlistPageContent items={[allItems[0]]} productsByProductId={{ 'prod-in-stock': inStockProduct }} />
            );

            const selects = screen.getAllByRole('combobox');
            fireEvent.change(selects[1], { target: { value: 'on-sale' } });

            // The message renders in two places by design: the sr-only status region
            // (announced to screen readers) and the aria-hidden centered placeholder
            // (shown to sighted users). This test covers the visible placeholder; the
            // status-region announcement is covered in the accessibility block below.
            const matches = screen.getAllByText(t('account:wishlist.noFilterResults'));
            expect(matches.some((el) => el.closest('[aria-hidden="true"]'))).toBe(true);
        });
    });

    describe('sorting', () => {
        test('sort "name-asc" orders items alphabetically', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);

            const selects = screen.getAllByRole('combobox');
            fireEvent.change(selects[0], { target: { value: 'name-asc' } });

            const itemElements = screen.getAllByTestId(/^wishlist-item-/);
            // Alpha (item-1) < Beta (item-2) < Charlie (item-3)
            expect(itemElements[0]).toHaveAttribute('data-testid', 'wishlist-item-item-1');
            expect(itemElements[1]).toHaveAttribute('data-testid', 'wishlist-item-item-2');
            expect(itemElements[2]).toHaveAttribute('data-testid', 'wishlist-item-item-3');
        });

        test('sort "price-low" orders by price ascending', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);

            const selects = screen.getAllByRole('combobox');
            fireEvent.change(selects[0], { target: { value: 'price-low' } });

            const itemElements = screen.getAllByTestId(/^wishlist-item-/);
            // Charlie: 75, Alpha: 150, Beta: 200
            expect(itemElements[0]).toHaveAttribute('data-testid', 'wishlist-item-item-3');
            expect(itemElements[1]).toHaveAttribute('data-testid', 'wishlist-item-item-1');
            expect(itemElements[2]).toHaveAttribute('data-testid', 'wishlist-item-item-2');
        });

        test('sort "price-high" orders by price descending', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);

            const selects = screen.getAllByRole('combobox');
            fireEvent.change(selects[0], { target: { value: 'price-high' } });

            const itemElements = screen.getAllByTestId(/^wishlist-item-/);
            // Beta: 200, Alpha: 150, Charlie: 75
            expect(itemElements[0]).toHaveAttribute('data-testid', 'wishlist-item-item-2');
            expect(itemElements[1]).toHaveAttribute('data-testid', 'wishlist-item-item-1');
            expect(itemElements[2]).toHaveAttribute('data-testid', 'wishlist-item-item-3');
        });
    });

    describe('accessibility - result status announcement', () => {
        // A screen reader only announces text written into a live region that was
        // ALREADY present (empty or with prior text) when the region was observed.
        // The wishlist result summary (item count / no-results) changes in response
        // to shopper actions (remove, filter), so it must live in a persistent
        // aria-live region rather than mounting freshly with its text already set.
        // Regression guard for W-23325748.

        test('keeps a persistent polite status region carrying the item-count summary', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);

            const region = screen.getByRole('status');
            expect(region).toHaveAttribute('aria-live', 'polite');
            expect(region).toHaveAttribute('aria-atomic', 'true');
            expect(region).toHaveTextContent(t('account:wishlist.itemCount', { count: 3 }));
        });

        test('updates the status region text when an item is removed', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);

            const region = screen.getByRole('status');
            expect(region).toHaveTextContent(t('account:wishlist.itemCount', { count: 3 }));

            fireEvent.click(screen.getByTestId('remove-btn-item-1'));

            // Same region node now carries the new count (empty-first transition preserved).
            expect(screen.getByRole('status')).toHaveTextContent(t('account:wishlist.itemCount', { count: 2 }));
        });

        test('announces the no-results state through the status region when a filter empties the list', () => {
            mockGetPriceData.mockReturnValue({ isOnSale: false });

            render(
                <WishlistPageContent items={[allItems[0]]} productsByProductId={{ 'prod-in-stock': inStockProduct }} />
            );

            const selects = screen.getAllByRole('combobox');
            fireEvent.change(selects[1], { target: { value: 'on-sale' } });

            expect(screen.getByRole('status')).toHaveTextContent(t('account:wishlist.noFilterResults'));
        });
    });

    describe('remove item', () => {
        test('removing an item hides it from the list', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);

            expect(screen.getByTestId('wishlist-item-item-1')).toBeInTheDocument();
            fireEvent.click(screen.getByTestId('remove-btn-item-1'));
            expect(screen.queryByTestId('wishlist-item-item-1')).not.toBeInTheDocument();
            expect(screen.getByTestId('wishlist-item-item-2')).toBeInTheDocument();
            expect(screen.getByTestId('wishlist-item-item-3')).toBeInTheDocument();
        });

        test('item count updates after removal', () => {
            render(<WishlistPageContent items={allItems} productsByProductId={allProducts} />);

            expect(screen.getByText(t('account:wishlist.itemCount', { count: 3 }))).toBeInTheDocument();
            fireEvent.click(screen.getByTestId('remove-btn-item-1'));
            expect(screen.getByText(t('account:wishlist.itemCount', { count: 2 }))).toBeInTheDocument();
        });

        test('shows empty state when all items are removed', () => {
            render(
                <WishlistPageContent items={[allItems[0]]} productsByProductId={{ 'prod-in-stock': inStockProduct }} />
            );

            fireEvent.click(screen.getByTestId('remove-btn-item-1'));
            expect(screen.getByText(t('account:wishlist.emptyTitle'))).toBeInTheDocument();
        });
    });
});

describe('WishlistSkeleton', () => {
    test('renders heading text', () => {
        render(<WishlistSkeleton />);
        expect(screen.getByText(t('account:navigation.wishlist'))).toBeInTheDocument();
    });

    test('renders skeleton placeholders', () => {
        const { container } = render(<WishlistSkeleton />);
        // Skeleton component renders divs with data-slot="skeleton"
        const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
        expect(skeletons.length).toBeGreaterThan(0);
    });
});
