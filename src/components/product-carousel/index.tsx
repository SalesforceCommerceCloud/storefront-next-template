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
/**
 * Product Carousel Components
 *
 * This module exports the main ProductCarousel component, its associated skeleton component,
 * and a Suspense-wrapped version for better loading state management.
 *
 * @fileoverview Exports for product carousel functionality including loading states and Suspense boundaries
 */
import { AttributeDefinition, Component, RegionDefinition } from '@/lib/decorators';
// oxlint-disable-next-line react-refresh/only-export-components
export { loader } from './loaders';

const productCarouselDefaults = {
    title: '',
    limit: 12,
} as const;

// Skeleton component for loading states
export { default as ProductCarouselSkeleton } from './skeleton';
export { default as Carousel } from './carousel';

// ProductCarousel wrapped with Suspense boundary
import { ProductCarouselWithSuspense } from './carousel';
export { ProductCarouselWithSuspense };

// Default export that conforms to ComponentModule interface
export default ProductCarouselWithSuspense;

@Component('productCarousel', {
    name: 'Product Carousel',
    description:
        'A responsive, interactive carousel that displays a collection of product cards in a horizontally scrollable layout.',
    group: 'Layout',
})
@RegionDefinition([
    {
        id: 'products',
        name: 'Products',
        description: 'Add Product Tile components to populate this carousel.',
        maxComponents: 12,
        componentTypeInclusions: ['Content.productTile'],
    },
])
// oxlint-disable-next-line react/only-export-components -- oxlint flags the co-exported Page Designer metadata class; eslint-plugin-react-refresh does not
export class ProductCarouselWithSuspenseMetadata {
    @AttributeDefinition({
        defaultValue: productCarouselDefaults.title,
    })
    title?: string;

    @AttributeDefinition({
        name: 'Category',
        description:
            'Select a category to populate the carousel with its products. When set, the carousel fetches products automatically and the manual product-tile region is ignored.',
        type: 'category',
    })
    categoryId?: string;

    @AttributeDefinition({
        name: 'Product Limit',
        description: 'Maximum number of products to fetch for the carousel.',
        type: 'integer',
        defaultValue: productCarouselDefaults.limit,
    })
    limit?: number;
}

// oxlint-disable-next-line react-refresh/only-export-components
export { default as fallback } from './skeleton';
