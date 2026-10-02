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

export interface StaticSortOption {
    id: string;
    label: string;
}

/**
 * Placeholder sort choices for the filter bar, shown only while the search result carries no sorting options
 * of its own (no Sorting Rules in Business Manager yet). Display-only: picking one marks it as selected but
 * does not re-order products, because these ids are not known to the search API.
 */
export const STATIC_SORT_OPTIONS: StaticSortOption[] = [
    { id: 'customer-rating', label: 'Customer rating' },
    { id: 'price-high-to-low', label: 'Price (High to Low)' },
    { id: 'price-low-to-high', label: 'Price (Low to High)' },
    { id: 'newest', label: 'Newest' },
    { id: 'percent-off', label: 'Percent Off' },
    { id: 'featured', label: 'Featured' },
];
