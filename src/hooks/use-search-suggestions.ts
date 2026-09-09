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
import { useCallback, useMemo } from 'react';
import type { ShopperSearch } from '@/scapi';
import { useScapiFetcher } from './use-scapi-fetcher';

export interface UseSearchSuggestionsOptions {
    q: string;
    expand?: ('images' | 'prices' | 'custom_product_properties')[];
    limit?: number;
    currency?: string;
    includeEinsteinSuggestedPhrases?: boolean;
    enabled?: boolean;
    includedCustomProductProperties?: string[];
}

export interface SearchSuggestionsResult {
    data?: ShopperSearch.schemas['SuggestionResult'];
    isLoading: boolean;
    refetch: () => Promise<void>;
}

/**
 * Hook for fetching search suggestions using Commerce SDK
 * Uses useScapiFetcher for Commerce SDK operations
 */
export function useSearchSuggestions({
    q,
    expand,
    limit,
    currency,
    includeEinsteinSuggestedPhrases,
    enabled = true,
    includedCustomProductProperties,
}: UseSearchSuggestionsOptions): SearchSuggestionsResult {
    // Prepare parameters for Commerce SDK getSearchSuggestions method
    const parameters = useMemo(
        () => ({
            params: {
                query: {
                    q,
                    ...(expand && { expand }),
                    ...(limit && { limit }),
                    ...(currency && { currency }),
                    ...(includeEinsteinSuggestedPhrases !== undefined && { includeEinsteinSuggestedPhrases }),
                    ...(includedCustomProductProperties && { includedCustomProductProperties }),
                },
            },
        }),
        [q, expand, limit, currency, includeEinsteinSuggestedPhrases, includedCustomProductProperties]
    );

    // Use useScapiFetcher hook for Commerce SDK operations
    const fetcher = useScapiFetcher('shopperSearch', 'getSearchSuggestions', parameters);

    const refetch = useCallback(async (): Promise<void> => {
        if (!enabled || !q?.trim()) {
            throw new Error('Search suggestions disabled or query is empty');
        }
        await fetcher.load();
        // Data will be available in fetcher.data after load completes
    }, [fetcher, enabled, q]);

    return {
        data: fetcher.data,
        isLoading: fetcher.state === 'loading',
        refetch,
    };
}
