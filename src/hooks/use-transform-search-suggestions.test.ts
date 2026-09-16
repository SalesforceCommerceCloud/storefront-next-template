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
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ShopperSearch } from '@/scapi';
import { useTransformSearchSuggestions } from './use-transform-search-suggestions';
import { searchUrlBuilder } from '@/lib/url';

// Mock the URL builder
vi.mock('@/lib/url', () => ({
    searchUrlBuilder: vi.fn((phrase: string) => `/search?q=${encodeURIComponent(phrase)}`),
}));

describe('useTransformSearchSuggestions', () => {
    it('should return null when data is null', () => {
        const { result } = renderHook(() => useTransformSearchSuggestions(null));

        expect(result.current).toBeNull();
    });

    it('should return null when data is undefined', () => {
        const { result } = renderHook(() => useTransformSearchSuggestions(undefined as any));

        expect(result.current).toBeNull();
    });

    it('should transform empty data correctly', () => {
        const emptyData = {} as unknown as ShopperSearch.schemas['SuggestionResult'];

        const { result } = renderHook(() => useTransformSearchSuggestions(emptyData));

        expect(result.current).toEqual({
            categorySuggestions: [],
            productSuggestions: [],
            phraseSuggestions: [],
            searchPhrase: undefined,
        });
    });

    it('should transform category suggestions correctly', () => {
        const data = {
            categorySuggestions: {
                suggestedTerms: [],
                categories: [
                    {
                        id: 'cat1',
                        name: 'Electronics',
                        image: {
                            disBaseLink: 'https://example.com/electronics.jpg',
                        },
                        parentCategoryName: 'Home',
                    },
                    {
                        id: 'cat2',
                        name: 'Clothing',
                        // No image
                        parentCategoryName: 'Apparel',
                    },
                ],
            },
        } as unknown as ShopperSearch.schemas['SuggestionResult'];

        const { result } = renderHook(() => useTransformSearchSuggestions(data));

        expect(result.current?.categorySuggestions).toEqual([
            {
                name: 'Electronics',
                link: '/category/cat1',
                type: 'category',
                image: 'https://example.com/electronics.jpg',
                parentCategoryName: 'Home',
            },
            {
                name: 'Clothing',
                link: '/category/cat2',
                type: 'category',
                image: undefined,
                parentCategoryName: 'Apparel',
            },
        ]);
    });

    it('should transform product suggestions correctly', () => {
        const data = {
            productSuggestions: {
                suggestedTerms: [],
                products: [
                    {
                        productId: 'prod1',
                        productName: 'iPhone 15',
                        image: {
                            disBaseLink: 'https://example.com/iphone.jpg',
                        },
                        price: 999,
                        currency: 'USD',
                    },
                    {
                        productId: 'prod2',
                        productName: 'Samsung Galaxy',
                        // No image, price, currency
                    } as any,
                ],
            },
        } as unknown as ShopperSearch.schemas['SuggestionResult'];

        const { result } = renderHook(() => useTransformSearchSuggestions(data));

        expect(result.current?.productSuggestions).toEqual([
            {
                name: 'iPhone 15',
                link: '/product/prod1',
                type: 'product',
                image: 'https://example.com/iphone.jpg',
                price: 999,
                currency: 'USD',
            },
            {
                name: 'Samsung Galaxy',
                link: '/product/prod2',
                type: 'product',
                image: undefined,
                price: undefined,
                currency: undefined,
            },
        ]);
    });

    it('uses an explicit suggestion slug with the active site SEO configuration', () => {
        const data = {
            productSuggestions: {
                products: [{ productId: 'prod1', productName: 'iPhone 15', slug: 'iphone-15' }],
            },
        } as unknown as ShopperSearch.schemas['SuggestionResult'];
        const seoUrlContext = {
            siteId: 'RefArch',
            seoRoutes: {
                RefArch: {
                    product: { prefix: 'p' },
                    category: { prefix: 'c', mode: 'id-suffix' as const },
                },
            },
        };

        const { result } = renderHook(() => useTransformSearchSuggestions(data, seoUrlContext));

        expect(result.current?.productSuggestions[0]?.link).toBe('/p/iphone-15/prod1');
    });

    it('should transform phrase suggestions correctly', () => {
        const data = {
            productSuggestions: {
                suggestedTerms: [],
                suggestedPhrases: [
                    {
                        phrase: 'iphone case',
                        exactMatch: true,
                    },
                    {
                        phrase: 'phone accessories',
                        exactMatch: false,
                    },
                    {
                        phrase: 'bluetooth headphones',
                        // No exactMatch
                    } as any,
                ],
            },
        } as unknown as ShopperSearch.schemas['SuggestionResult'];

        const { result } = renderHook(() => useTransformSearchSuggestions(data));

        expect(result.current?.phraseSuggestions).toEqual([
            {
                name: 'iphone case',
                link: '/search?q=iphone%20case',
                type: 'phrase',
                exactMatch: true,
            },
            {
                name: 'phone accessories',
                link: '/search?q=phone%20accessories',
                type: 'phrase',
                exactMatch: false,
            },
            {
                name: 'bluetooth headphones',
                link: '/search?q=bluetooth%20headphones',
                type: 'phrase',
                exactMatch: undefined,
            },
        ]);
    });

    it('should include searchPhrase in result', () => {
        const data: ShopperSearch.schemas['SuggestionResult'] = {
            searchPhrase: 'original search term',
        };

        const { result } = renderHook(() => useTransformSearchSuggestions(data));

        expect(result.current?.searchPhrase).toBe('original search term');
    });

    it('should handle complete data with all suggestion types', () => {
        const completeData: ShopperSearch.schemas['SuggestionResult'] = {
            searchPhrase: 'phone',
            categorySuggestions: {
                suggestedTerms: [],
                categories: [
                    {
                        id: 'electronics',
                        name: 'Electronics',
                        image: {
                            disBaseLink: 'https://example.com/electronics.jpg',
                        },
                        parentCategoryName: 'Technology',
                    },
                ],
            },
            productSuggestions: {
                suggestedTerms: [],
                products: [
                    {
                        productId: 'iphone15',
                        productName: 'iPhone 15 Pro',
                        image: {
                            disBaseLink: 'https://example.com/iphone15.jpg',
                        },
                        price: 1099,
                        currency: 'USD',
                    },
                ],
                suggestedPhrases: [
                    {
                        phrase: 'phone case',
                        exactMatch: false,
                    },
                ],
            },
        };

        const { result } = renderHook(() => useTransformSearchSuggestions(completeData));

        expect(result.current).toEqual({
            searchPhrase: 'phone',
            categorySuggestions: [
                {
                    name: 'Electronics',
                    link: '/category/electronics',
                    type: 'category',
                    image: 'https://example.com/electronics.jpg',
                    parentCategoryName: 'Technology',
                },
            ],
            productSuggestions: [
                {
                    name: 'iPhone 15 Pro',
                    link: '/product/iphone15',
                    type: 'product',
                    image: 'https://example.com/iphone15.jpg',
                    price: 1099,
                    currency: 'USD',
                },
            ],
            phraseSuggestions: [
                {
                    name: 'phone case',
                    link: '/search?q=phone%20case',
                    type: 'phrase',
                    exactMatch: false,
                },
            ],
        });
    });

    it('should handle missing or empty names/phrases gracefully', () => {
        const dataWithEmptyNames = {
            categorySuggestions: {
                suggestedTerms: [],
                categories: [
                    {
                        id: 'cat1',
                        name: '',
                    },
                    {
                        id: 'cat2',
                        // No name property
                    } as any,
                ],
            },
            productSuggestions: {
                suggestedTerms: [],
                products: [
                    {
                        productId: 'prod1',
                        productName: '',
                    } as any,
                    {
                        productId: 'prod2',
                        // No productName property
                    } as any,
                ],
                suggestedPhrases: [
                    {
                        phrase: '',
                        exactMatch: true,
                    },
                    {
                        // No phrase property
                        exactMatch: false,
                    } as any,
                ],
            },
        } as unknown as ShopperSearch.schemas['SuggestionResult'];

        const { result } = renderHook(() => useTransformSearchSuggestions(dataWithEmptyNames));

        expect(result.current?.categorySuggestions).toEqual([
            {
                name: '',
                link: '/category/cat1',
                type: 'category',
                image: undefined,
                parentCategoryName: undefined,
            },
            {
                name: '',
                link: '/category/cat2',
                type: 'category',
                image: undefined,
                parentCategoryName: undefined,
            },
        ]);

        expect(result.current?.productSuggestions).toEqual([
            {
                name: '',
                link: '/product/prod1',
                type: 'product',
                image: undefined,
                price: undefined,
                currency: undefined,
            },
            {
                name: '',
                link: '/product/prod2',
                type: 'product',
                image: undefined,
                price: undefined,
                currency: undefined,
            },
        ]);

        expect(result.current?.phraseSuggestions).toEqual([
            {
                name: '',
                link: '/search?q=',
                type: 'phrase',
                exactMatch: true,
            },
            {
                name: '',
                link: '/search?q=',
                type: 'phrase',
                exactMatch: false,
            },
        ]);
    });

    it('should memoize results and only recalculate when data changes', () => {
        const data: ShopperSearch.schemas['SuggestionResult'] = {
            searchPhrase: 'test',
        };

        const { result, rerender } = renderHook(({ inputData }) => useTransformSearchSuggestions(inputData), {
            initialProps: { inputData: data },
        });

        const firstResult = result.current;

        // Rerender with same data
        rerender({ inputData: data });

        // Should return the same reference (memoized)
        expect(result.current).toBe(firstResult);

        // Rerender with different data
        const newData = { ...data, searchPhrase: 'new test' };
        rerender({ inputData: newData });

        // Should return a new reference
        expect(result.current).not.toBe(firstResult);
        expect(result.current?.searchPhrase).toBe('new test');
    });

    it('should call searchUrlBuilder for phrase suggestions', () => {
        const mockSearchUrlBuilder = vi.mocked(searchUrlBuilder);

        const data = {
            productSuggestions: {
                suggestedTerms: [],
                suggestedPhrases: [
                    {
                        phrase: 'test phrase',
                        exactMatch: true,
                    },
                ],
            },
        } as unknown as ShopperSearch.schemas['SuggestionResult'];

        renderHook(() => useTransformSearchSuggestions(data));

        expect(mockSearchUrlBuilder).toHaveBeenCalledWith('test phrase');
    });

    it('should handle data with nested empty objects', () => {
        const dataWithEmptyObjects = {
            categorySuggestions: {
                suggestedTerms: [],
                categories: [],
            },
            productSuggestions: {
                suggestedTerms: [],
                products: [],
                suggestedPhrases: [],
            },
        } as unknown as ShopperSearch.schemas['SuggestionResult'];

        const { result } = renderHook(() => useTransformSearchSuggestions(dataWithEmptyObjects));

        expect(result.current).toEqual({
            categorySuggestions: [],
            productSuggestions: [],
            phraseSuggestions: [],
            searchPhrase: undefined,
        });
    });

    describe('Einstein Suggestions Transformation', () => {
        it('should transform Einstein suggested phrases correctly', () => {
            const dataWithEinstein: ShopperSearch.schemas['SuggestionResult'] = {
                searchPhrase: 'test query',
                einsteinSuggestedPhrases: {
                    popularSearchPhrases: [
                        { phrase: 'popular search 1', exactMatch: false },
                        { phrase: 'popular search 2', exactMatch: true },
                    ],
                    recentSearchPhrases: [
                        { phrase: 'recent search 1', exactMatch: false },
                        { phrase: 'recent search 2', exactMatch: true },
                    ],
                },
            };

            const { result } = renderHook(() => useTransformSearchSuggestions(dataWithEinstein));

            expect(result.current?.popularSearchSuggestions).toEqual([
                {
                    type: 'popular',
                    name: 'popular search 1',
                    link: '/search?q=popular%20search%201',
                    exactMatch: false,
                },
                {
                    type: 'popular',
                    name: 'popular search 2',
                    link: '/search?q=popular%20search%202',
                    exactMatch: true,
                },
            ]);

            expect(result.current?.recentSearchSuggestions).toEqual([
                {
                    type: 'recent',
                    name: 'recent search 1',
                    link: '/search?q=recent%20search%201',
                    exactMatch: false,
                },
                {
                    type: 'recent',
                    name: 'recent search 2',
                    link: '/search?q=recent%20search%202',
                    exactMatch: true,
                },
            ]);
        });

        it('should handle empty Einstein suggestions', () => {
            const dataWithEmptyEinstein: ShopperSearch.schemas['SuggestionResult'] = {
                searchPhrase: 'test query',
                einsteinSuggestedPhrases: {
                    popularSearchPhrases: [],
                    recentSearchPhrases: [],
                },
            };

            const { result } = renderHook(() => useTransformSearchSuggestions(dataWithEmptyEinstein));

            expect(result.current?.popularSearchSuggestions).toBeUndefined();
            expect(result.current?.recentSearchSuggestions).toBeUndefined();
        });

        it('should handle missing Einstein suggestions', () => {
            const dataWithoutEinstein: ShopperSearch.schemas['SuggestionResult'] = {
                searchPhrase: 'test query',
            };

            const { result } = renderHook(() => useTransformSearchSuggestions(dataWithoutEinstein));

            expect(result.current?.popularSearchSuggestions).toBeUndefined();
            expect(result.current?.recentSearchSuggestions).toBeUndefined();
        });

        it('should handle Einstein suggestions with empty phrases', () => {
            const dataWithEmptyPhrases: ShopperSearch.schemas['SuggestionResult'] = {
                searchPhrase: 'test query',
                einsteinSuggestedPhrases: {
                    popularSearchPhrases: [
                        { phrase: '', exactMatch: false },
                        { phrase: null as any, exactMatch: true },
                    ],
                    recentSearchPhrases: [
                        { phrase: undefined as any, exactMatch: false },
                        { phrase: 'valid phrase', exactMatch: true },
                    ],
                },
            };

            const { result } = renderHook(() => useTransformSearchSuggestions(dataWithEmptyPhrases));

            expect(result.current?.popularSearchSuggestions).toEqual([
                {
                    type: 'popular',
                    name: '',
                    link: '/search?q=',
                    exactMatch: false,
                },
                {
                    type: 'popular',
                    name: '',
                    link: '/search?q=',
                    exactMatch: true,
                },
            ]);

            expect(result.current?.recentSearchSuggestions).toEqual([
                {
                    type: 'recent',
                    name: '',
                    link: '/search?q=',
                    exactMatch: false,
                },
                {
                    type: 'recent',
                    name: 'valid phrase',
                    link: '/search?q=valid%20phrase',
                    exactMatch: true,
                },
            ]);
        });

        it('should only include Einstein suggestions when arrays have content', () => {
            const dataWithOnlyPopular: ShopperSearch.schemas['SuggestionResult'] = {
                searchPhrase: 'test query',
                einsteinSuggestedPhrases: {
                    popularSearchPhrases: [{ phrase: 'popular search', exactMatch: false }],
                    recentSearchPhrases: [],
                },
            };

            const { result } = renderHook(() => useTransformSearchSuggestions(dataWithOnlyPopular));

            expect(result.current?.popularSearchSuggestions).toEqual([
                {
                    type: 'popular',
                    name: 'popular search',
                    link: '/search?q=popular%20search',
                    exactMatch: false,
                },
            ]);
            expect(result.current?.recentSearchSuggestions).toBeUndefined();
        });

        it('should only include Einstein suggestions when arrays have content - recent only', () => {
            const dataWithOnlyRecent: ShopperSearch.schemas['SuggestionResult'] = {
                searchPhrase: 'test query',
                einsteinSuggestedPhrases: {
                    popularSearchPhrases: [],
                    recentSearchPhrases: [{ phrase: 'recent search', exactMatch: true }],
                },
            };

            const { result } = renderHook(() => useTransformSearchSuggestions(dataWithOnlyRecent));

            expect(result.current?.popularSearchSuggestions).toBeUndefined();
            expect(result.current?.recentSearchSuggestions).toEqual([
                {
                    type: 'recent',
                    name: 'recent search',
                    link: '/search?q=recent%20search',
                    exactMatch: true,
                },
            ]);
        });
    });
});
