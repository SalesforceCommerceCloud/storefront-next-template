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

// React
import { useMemo } from 'react';

// React Router
import { useFetcher, useFetchers } from 'react-router';

interface UseItemFetcherOptions {
    /** The item ID to prefix the fetcher key with */
    itemId?: string;
    /** The component name to append to the fetcher key (e.g., 'cart-quantity-picker', 'remove-item-button') */
    componentName: string;
}

/**
 * Custom hook that creates a useFetcher with a prefixed itemId key
 *
 * This hook provides a consistent way to create fetchers for item-specific operations
 * while ensuring unique keys to prevent conflicts between multiple instances.
 *
 * @param options - Configuration object
 * @returns The fetcher instance (key accessible via fetcher.key, loading state via fetcher.state)
 *
 * @example
 * ```tsx
 * // In a cart quantity picker component
 * const fetcher = useItemFetcher({
 *   itemId: 'item-123',
 *   componentName: 'cart-quantity-picker'
 * });
 * const isLoading = fetcher.state === 'submitting';
 *
 * // In a remove item button component
 * const fetcher = useItemFetcher({
 *   itemId: 'item-123',
 *   componentName: 'remove-item-button'
 * });
 * ```
 */
export function useItemFetcher({ itemId, componentName }: UseItemFetcherOptions) {
    // Generate the fetcher key with itemId prefix (or just componentName if itemId is undefined)
    const fetcherKey = itemId ? `${itemId}-${componentName}` : '';

    // Create the fetcher with the generated key
    const fetcher = useFetcher({
        key: fetcherKey,
    });

    return fetcher;
}

/**
 * Hook that tracks loading state for all fetchers related to a specific item
 *
 * This hook uses useFetchers to monitor all active fetchers and determines
 * if any fetcher for the specified item is currently in a submitting state.
 * This is useful for showing loading indicators at the item level.
 *
 * @param itemId - The item ID to track fetchers for
 * @returns Boolean indicating if any fetcher for this item is loading
 *
 * @example
 * ```tsx
 * // In a ProductItem component
 * const isItemFetcherLoading = useItemFetcherLoading(product.itemId);
 *
 * return (
 *   <div>
 *     {isItemFetcherLoading && <Spinner />}
 *   </div>
 * );
 * ```
 */
export function useItemFetcherLoading(itemId?: string): boolean {
    const fetchers = useFetchers();

    return useMemo(() => {
        if (!itemId) return false;

        // Item keys are delimited. Matching the delimiter avoids treating `item-10-*`
        // as work for `item-1`.
        const itemFetchers = fetchers.filter((fetcher) => fetcher.key.startsWith(`${itemId}-`));

        // A mutation remains pending while React Router processes the response.
        return itemFetchers.some((fetcher) => fetcher.state === 'submitting' || fetcher.state === 'loading');
    }, [fetchers, itemId]);
}
