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
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ShopperSearch } from '@/scapi';
import ProductMerchandisingGrid from './grid';

let isDesignMode = false;

vi.mock('@salesforce/storefront-next-runtime/design/react/core', () => ({
    usePageDesignerMode: () => ({ isDesignMode }),
}));

vi.mock('@/components/product-tile', () => ({
    ProductTile: ({ product }: { product?: ShopperSearch.schemas['ProductSearchHit'] }) => (
        <div data-testid={product ? `product-${product.productId}` : 'product-placeholder'} />
    ),
    ProductTileProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/providers/dynamic-image', () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/region/component', () => ({
    Component: ({ component }: { component: { id: string } }) => <div data-testid={`curated-${component.id}`} />,
}));

const products = Array.from({ length: 10 }, (_, index) => ({
    productId: `product-${index + 1}`,
    productName: `Product ${index + 1}`,
})) as ShopperSearch.schemas['ProductSearchHit'][];

const manuallyCuratedComponent = {
    regions: [
        {
            id: 'products',
            components: [
                { id: 'curated-product-1', typeId: 'Content.productTile' },
                { id: 'curated-product-2', typeId: 'Content.productTile' },
            ],
        },
    ],
};

describe('ProductMerchandisingGrid', () => {
    beforeEach(() => {
        isDesignMode = false;
    });

    test('renders no more products than its configured rows and columns', () => {
        render(<ProductMerchandisingGrid products={products} columns={3} rows={2} />);

        expect(screen.getAllByTestId(/^product-product-/)).toHaveLength(6);
    });

    test('uses the static responsive classes for four configured columns', () => {
        render(<ProductMerchandisingGrid products={products} columns={4} rows={2} />);

        expect(screen.getByTestId('product-merchandising-grid')).toHaveClass(
            'grid-cols-2',
            'sm:grid-cols-3',
            'lg:grid-cols-4'
        );
    });

    test('renders nothing on the storefront for an empty category result', () => {
        const { container } = render(<ProductMerchandisingGrid products={[]} columns={4} rows={2} />);

        expect(container).toBeEmptyDOMElement();
    });

    test('renders the configured placeholder count in Page Designer design mode', () => {
        isDesignMode = true;
        render(<ProductMerchandisingGrid products={[]} columns={3} rows={2} />);

        expect(screen.getAllByTestId('product-placeholder')).toHaveLength(6);
    });

    test('renders authored Product Tiles when no category is selected', () => {
        render(
            <ProductMerchandisingGrid
                products={[]}
                component={manuallyCuratedComponent as never}
                columns={3}
                rows={2}
            />
        );

        expect(screen.getByTestId('curated-curated-product-1')).toBeInTheDocument();
        expect(screen.getByTestId('curated-curated-product-2')).toBeInTheDocument();
    });

    test('prioritizes category results over authored Product Tiles', () => {
        render(
            <ProductMerchandisingGrid
                products={products}
                categoryId="living-room"
                component={manuallyCuratedComponent as never}
                columns={3}
                rows={2}
            />
        );

        expect(screen.getAllByTestId(/^product-product-/)).toHaveLength(6);
        expect(screen.queryByTestId('curated-curated-product-1')).not.toBeInTheDocument();
    });

    test('does not fall back to manual Product Tiles when a selected category has no products', () => {
        const { container } = render(
            <ProductMerchandisingGrid
                products={[]}
                categoryId="empty-category"
                component={manuallyCuratedComponent as never}
            />
        );

        expect(container).toBeEmptyDOMElement();
    });
});
