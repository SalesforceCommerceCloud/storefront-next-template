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
import { AttributeDefinition, Component, RegionDefinition } from '@/lib/decorators';
import withSuspense from '@/components/with-suspense';
import ProductMerchandisingGrid from './grid';
import ProductMerchandisingGridSkeleton from './skeleton';
import type { ShopperSearch } from '@/scapi';

// oxlint-disable-next-line react/only-export-components -- loader re-export is required for the static-registry AST plugin
export { loader } from './loaders';
export { default as ProductMerchandisingGridSkeleton } from './skeleton';
export { default as ProductMerchandisingGrid } from './grid';

export function ProductMerchandisingGridWithData({
    data,
    ...props
}: {
    data?: ShopperSearch.schemas['ProductSearchResult'] | ShopperSearch.schemas['ProductSearchHit'][] | null;
    [key: string]: unknown;
}) {
    const products = Array.isArray(data) ? data : (data?.hits ?? []);
    return <ProductMerchandisingGrid products={products} {...props} />;
}

// oxlint-disable-next-line react/only-export-components -- Page Designer needs a named Suspense-wrapped component export
export const ProductMerchandisingGridWithSuspense = withSuspense(ProductMerchandisingGridWithData, {
    fallback: (props) => <ProductMerchandisingGridSkeleton {...props} />,
});

export default ProductMerchandisingGridWithSuspense;

@Component('productMerchandisingGrid', {
    name: 'Product Merchandising Grid',
    description:
        'Displays either a bounded category assortment or an authored collection of product tiles in a responsive grid.',
    group: 'Layout',
})
@RegionDefinition([
    {
        id: 'products',
        name: 'Products',
        description:
            'Add Product Tile components to curate this grid. This region is ignored when a category is selected.',
        maxComponents: 24,
        componentTypeInclusions: ['Content.productTile'],
    },
])
// oxlint-disable-next-line react/only-export-components -- Page Designer metadata is co-exported with the component
export class ProductMerchandisingGridMetadata {
    @AttributeDefinition({ defaultValue: '' })
    title?: string;

    @AttributeDefinition({
        name: 'Category',
        description:
            'Select a category to populate the product grid automatically. When set, the manual product-tile region is ignored.',
        type: 'category',
    })
    categoryId?: string;

    @AttributeDefinition({
        name: 'Columns',
        description: 'Number of product columns at desktop widths.',
        type: 'enum',
        values: ['2', '3', '4'],
        defaultValue: '4',
    })
    columns?: string;

    @AttributeDefinition({
        name: 'Rows',
        description: 'Number of merchandising rows to display at desktop widths.',
        type: 'integer',
        defaultValue: 2,
    })
    rows?: number;
}

// oxlint-disable-next-line react-refresh/only-export-components
export { default as fallback } from './skeleton';
