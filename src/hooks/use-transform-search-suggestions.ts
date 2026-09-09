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
import { useMemo } from 'react';
import type { ShopperSearch } from '@/scapi';
import { searchUrlBuilder } from '@/lib/url';

// Simple transformation interface for UI purposes only
interface TransformedSuggestions {
    categorySuggestions: Array<{
        name: string;
        link: string;
        type: string;
        image?: string;
        parentCategoryName?: string;
    }>;
    productSuggestions: Array<{
        name: string;
        link: string;
        type: string;
        image?: string;
        price?: number;
        currency?: string;
    }>;
    phraseSuggestions: Array<{
        name: string;
        link: string;
        type: string;
        exactMatch?: boolean;
    }>;
    popularSearchSuggestions?: Array<{
        name: string;
        link: string;
        type: string;
        exactMatch?: boolean;
    }>;
    recentSearchSuggestions?: Array<{
        name: string;
        link: string;
        type: string;
        exactMatch?: boolean;
    }>;
    searchPhrase?: string;
}

/**
 * Hook to transform SCAPI SuggestionResult into component-ready format
 * Uses only official SDK types as input, minimal transformation for UI needs
 */
export function useTransformSearchSuggestions(
    data: ShopperSearch.schemas['SuggestionResult'] | null | undefined
): TransformedSuggestions | null {
    return useMemo(() => {
        if (!data) return null;

        const categorySuggestions =
            data.categorySuggestions?.categories?.map((cat) => {
                const image = cat.image as ShopperSearch.schemas['Image'] | undefined;
                return {
                    name: cat.name || '',
                    link: `/category/${cat.id}`,
                    type: 'category',
                    image: image?.disBaseLink || image?.link,
                    parentCategoryName: cat.parentCategoryName,
                };
            }) || [];

        const productSuggestions =
            data.productSuggestions?.products
                ?.filter((product) => {
                    // Exclude products flagged as c_hideFromSearchResults (e.g. swatches)
                    const hideFlag = (product as { c_hideFromSearchResults?: boolean }).c_hideFromSearchResults;
                    return hideFlag !== true;
                })
                .map((product) => {
                    const image = product.image as ShopperSearch.schemas['Image'] | undefined;
                    return {
                        name: product.productName || '',
                        link: `/product/${product.productId}`,
                        type: 'product',
                        image: image?.disBaseLink || image?.link,
                        price: product.price,
                        currency: product.currency,
                    };
                }) || [];

        const phraseSuggestions =
            data.productSuggestions?.suggestedPhrases?.map((phrase) => ({
                name: phrase.phrase || '',
                link: searchUrlBuilder(phrase.phrase || ''),
                type: 'phrase',
                exactMatch: phrase.exactMatch,
            })) || [];

        // Einstein suggestions for popular and recent searches
        const popularSearchSuggestions =
            data.einsteinSuggestedPhrases?.popularSearchPhrases?.map((phrase) => ({
                type: 'popular' as const,
                name: phrase.phrase || '',
                link: searchUrlBuilder(phrase.phrase || ''),
                exactMatch: phrase.exactMatch,
            })) || [];

        const recentSearchSuggestions =
            data.einsteinSuggestedPhrases?.recentSearchPhrases?.map((phrase) => ({
                type: 'recent' as const,
                name: phrase.phrase || '',
                link: searchUrlBuilder(phrase.phrase || ''),
                exactMatch: phrase.exactMatch,
            })) || [];

        return {
            categorySuggestions,
            productSuggestions,
            phraseSuggestions,
            ...(popularSearchSuggestions.length > 0 && { popularSearchSuggestions }),
            ...(recentSearchSuggestions.length > 0 && { recentSearchSuggestions }),
            searchPhrase: data.searchPhrase,
        };
    }, [data]);
}
