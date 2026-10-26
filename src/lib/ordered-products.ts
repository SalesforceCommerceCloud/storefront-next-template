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
import type { ShopperSearch } from '@/scapi';

type ProductSearchResult = ShopperSearch.schemas['ProductSearchResult'];

/**
 * Pagination + sorting envelope for ordered-product results.
 *
 * Derived from {@link ProductSearchResult} via `Pick` so the compiler catches any drift from the
 * SCAPI envelope. When a native SCAPI ordered-products endpoint becomes available, only the
 * resource route implementation changes — this type and all callers stay the same.
 *
 * `sortingOptions` is narrowed to `NonNullable` because this endpoint always populates it.
 */
export type OrderedProductsResult = Pick<
    ProductSearchResult,
    'hits' | 'total' | 'offset' | 'limit' | 'selectedSortingOption'
> & {
    sortingOptions: NonNullable<ProductSearchResult['sortingOptions']>;
};

// Labels are English-only placeholders. No sort selector UI exists yet, so they are not rendered.
// When the native SCAPI ordered-products endpoint ships, sortingOptions will come from SCAPI
// (configured in Business Manager, rendered directly — same pattern as CategorySorting on PLP).
// Only sorts derivable from order history (no product data needed) are supported.
export const SORT_OPTIONS: OrderedProductsResult['sortingOptions'] = [
    { id: 'most-ordered', label: 'Most Ordered' },
    { id: 'most-recent', label: 'Most Recent' },
];

export const DEFAULT_SORT = 'most-ordered';
