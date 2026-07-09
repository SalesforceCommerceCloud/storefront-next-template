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
import { type FormEvent, type ReactElement, useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useNavigate } from '@/hooks/use-navigate';
import debounce from 'lodash.debounce';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { Search as SearchIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Suggestions from '@/components/search/suggestions';
import { useSearchSuggestions } from '@/hooks/use-search-suggestions';
import { useTransformSearchSuggestions } from '@/hooks/use-transform-search-suggestions';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { getSessionJSONItem, setSessionJSONItem, clearSessionJSONItem } from '@/lib/utils';

import { UITarget } from '@/targets/ui-target';

const RECENT_SEARCH_LIMIT = 5;
const RECENT_SEARCH_KEY = 'recent-search-key';
const RECENT_SEARCH_MIN_LENGTH = 3;

export default function SearchBar(): ReactElement {
    const { t } = useTranslation('header');
    const navigate = useNavigate();
    const config = useConfig();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [query, setQuery] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const queryRef = useRef(query);
    const refetchRef = useRef<() => Promise<void>>(() => Promise.resolve());

    const { data: suggestions, refetch } = useSearchSuggestions({
        q: query,
        expand: ['images', 'prices'],
        includeEinsteinSuggestedPhrases: true,
        enabled: query.trim().length >= RECENT_SEARCH_MIN_LENGTH,
    });

    const transformedSuggestions = useTransformSearchSuggestions(suggestions);

    useEffect(() => {
        queryRef.current = query;
        refetchRef.current = refetch;
    }, [query, refetch]);

    const saveRecentSearch = useCallback((searchText: string) => {
        let searches = getSessionJSONItem<string[]>(RECENT_SEARCH_KEY) || [];
        searches = searches.filter((savedSearchTerm) => {
            return searchText.toLowerCase() !== savedSearchTerm.toLowerCase();
        });
        searches = [searchText, ...searches].slice(0, RECENT_SEARCH_LIMIT);
        setSessionJSONItem(RECENT_SEARCH_KEY, searches);
    }, []);

    const debouncedRefetch = useMemo(() => {
        return debounce(() => {
            const currentQuery = queryRef.current;
            if (currentQuery.trim().length >= RECENT_SEARCH_MIN_LENGTH) {
                void refetchRef.current();
            }
        }, config.pages.search.suggestionsDebounce);
    }, [config.pages.search.suggestionsDebounce]);

    useEffect(() => {
        if (query.trim().length >= RECENT_SEARCH_MIN_LENGTH) {
            debouncedRefetch();
        } else {
            debouncedRefetch.cancel();
        }

        return () => {
            debouncedRefetch.cancel();
        };
    }, [query, debouncedRefetch]);

    const shouldOpenPopover = useCallback(() => {
        const recentSearches = getSessionJSONItem<string[]>(RECENT_SEARCH_KEY) || [];
        const searchSuggestionsAvailable =
            transformedSuggestions &&
            (transformedSuggestions.categorySuggestions.length > 0 ||
                transformedSuggestions.productSuggestions.length > 0 ||
                (transformedSuggestions.popularSearchSuggestions?.length ?? 0) > 0);

        if (
            (document.activeElement === inputRef.current && recentSearches.length > 0) ||
            (searchSuggestionsAvailable && inputRef.current?.value && inputRef.current.value.length > 0)
        ) {
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    }, [transformedSuggestions]);

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;
            setQuery(value);
            shouldOpenPopover();
        },
        [shouldOpenPopover]
    );

    const handleSubmit = useCallback(
        (e: FormEvent) => {
            e.preventDefault();
            if (inputRef.current?.value?.trim()) {
                const searchQuery = inputRef.current.value.trim();
                saveRecentSearch(searchQuery);
                setShowSuggestions(false);
                void navigate(`/search?q=${encodeURIComponent(searchQuery)}`, {
                    state: { query: searchQuery },
                });
            }
        },
        [navigate, saveRecentSearch]
    );

    const closeAndNavigate = useCallback(
        (link: string) => {
            inputRef.current?.blur();
            setShowSuggestions(false);
            setQuery('');
            if (inputRef.current) {
                inputRef.current.value = '';
            }
            if (link) {
                void navigate(link);
            }
        },
        [navigate]
    );

    const clearRecentSearches = useCallback(() => {
        clearSessionJSONItem(RECENT_SEARCH_KEY);
        setShowSuggestions(false);
    }, []);

    useEffect(() => {
        shouldOpenPopover();
    }, [query, suggestions, shouldOpenPopover]);

    return (
        <UITarget targetId="sfcc.header.search.input">
            <Popover open={showSuggestions}>
                <form onSubmit={handleSubmit} className="relative z-10">
                    <div className="relative">
                        <PopoverTrigger asChild>
                            <Input
                                ref={inputRef}
                                type="text"
                                placeholder={t('searchPlaceholder')}
                                className="w-full pl-10 focus-visible:border-header-foreground focus-visible:ring-1 focus-visible:ring-header-foreground"
                                onChange={handleInputChange}
                                onFocus={shouldOpenPopover}
                                onBlur={() => setShowSuggestions(false)}
                                aria-label={t('searchPlaceholder')}
                                aria-autocomplete="list"
                                aria-expanded={showSuggestions}
                                aria-haspopup="listbox"
                                role="combobox"
                                data-testid="header-search"
                            />
                        </PopoverTrigger>
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2" />
                    </div>
                </form>
                {/* Note: Using a fixed div instead of PopoverContent because the search
                    suggestions panel is designed to span the full page width while the trigger is input with limited width in the header.
                    Using w-screen on Radix PopoverContent will include the scrollbar width, while the rest of page does not aware of scrollbar width
                    this causing the content in Popover to completely miss aligned with the rest of the layout despite using the same section gutter class.
                    Therefore, we go with traditional div to get control over styling for search result area*/}
                {showSuggestions && (
                    <div
                        className="fixed left-0 right-0 z-50 border-b shadow-[0px_1px_12px_rgba(0,0,0,0.25)] max-h-[min(70vh,32rem)] overflow-y-auto bg-popover text-popover-foreground"
                        style={{ top: 'var(--header-height)' }}
                        role="listbox"
                        aria-label={t('searchSuggestions')}>
                        <Suggestions
                            searchSuggestions={transformedSuggestions}
                            recentSearches={getSessionJSONItem<string[]>(RECENT_SEARCH_KEY) || []}
                            closeAndNavigate={closeAndNavigate}
                            clearRecentSearches={clearRecentSearches}
                        />
                    </div>
                )}
            </Popover>
        </UITarget>
    );
}
