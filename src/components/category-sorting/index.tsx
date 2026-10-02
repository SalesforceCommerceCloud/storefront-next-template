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
import { type ReactElement, useCallback, useId, useMemo, useState } from 'react';
import { useLocation, useNavigation } from 'react-router';
import { useNavigate } from '@/hooks/use-navigate';

import type { ShopperSearch } from '@/scapi';

import { ArrowUpDown, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { STATIC_SORT_OPTIONS } from './static-sort-options';
import { PRODUCT_SEARCH_QUERY_PARAMS } from '@/lib/query-params';

/**
 * CategorySorting Component
 *
 * Renders a dropdown select control that allows users to sort product search results
 * by different criteria (e.g., brand, price, name, etc.). The component updates
 * the URL parameters when a new sorting option is selected, triggering a page navigation
 * to refresh the results with the new sort order.
 *
 * @param props - Component props
 * @param props.result - Product search result object from Salesforce Commerce Cloud
 * @param props.result.sortingOptions - Array of available sorting options with id and label
 * @param props.result.selectedSortingOption - Currently selected sorting option ID
 *
 * @returns A select dropdown for sorting options, or null if no sorting options are available
 *
 * @example
 * ```tsx
 * <CategorySorting result={productSearchResult} />
 * ```
 *
 * Features:
 * - Uses native select component with consistent UI styling
 * - Generates unique IDs to support multiple instances on the same page
 * - Automatically updates URL parameters (sort, offset) when selection changes
 * - Accessible with proper label-select association
 */
export default function CategorySorting({
    result,
    variant = 'default',
}: {
    result: ShopperSearch.schemas['ProductSearchResult'];
    /** `bar`: compact icon + select for the horizontal filter bar (label is visually hidden). */
    variant?: 'default' | 'bar';
}): ReactElement | null {
    const navigate = useNavigate();
    const location = useLocation();
    const navigation = useNavigation();
    const isPending = navigation.state !== 'idle';
    const selectId = useId();
    const [sortOpen, setSortOpen] = useState(false);
    const [staticSort, setStaticSort] = useState('featured');

    /**
     * Optimistic sorting option derived from the in-flight navigation target.
     *
     * While a navigation is pending, `navigation.location` holds the target location, allowing us to read the
     * intended sort param immediately. Once the navigation settles, we fall back to the server-provided value.
     */
    const effectiveSortingOption = navigation.location
        ? new URLSearchParams(navigation.location.search).get(PRODUCT_SEARCH_QUERY_PARAMS.SORT) ||
          result.selectedSortingOption
        : result.selectedSortingOption;

    const sortingOptions = useMemo(() => result?.sortingOptions || [], [result?.sortingOptions]);

    const navigatePage = useCallback(
        (sort: string) => {
            const params = new URLSearchParams(location.search);
            params.set(PRODUCT_SEARCH_QUERY_PARAMS.SORT, sort);
            params.set(PRODUCT_SEARCH_QUERY_PARAMS.OFFSET, '0');
            void navigate({
                ...location,
                search: `?${params.toString()}`,
            });
        },
        [location, navigate]
    );

    if (variant === 'bar') {
        const useStaticOptions = sortingOptions.length === 0;
        const options = useStaticOptions ? STATIC_SORT_OPTIONS : sortingOptions;
        const selectedId = useStaticOptions ? staticSort : effectiveSortingOption;
        return (
            <div data-slot="sorting-bar" className={isPending ? 'pointer-events-none opacity-50' : undefined}>
                <Popover open={sortOpen} onOpenChange={setSortOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            aria-label="Sort by:"
                            data-testid="sort-trigger"
                            className="h-11 gap-2 px-4 text-foreground">
                            <ArrowUpDown className="size-5" aria-hidden />
                            <ChevronDown className="size-4" aria-hidden />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-56 p-0">
                        <div role="listbox" aria-label="Sort by:" className="py-1">
                            {options.map((option) => {
                                const isSelected = option.id === selectedId;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        role="option"
                                        aria-selected={isSelected}
                                        onClick={() => {
                                            // Placeholder options (no sorting rules configured) only mark the
                                            // selection; real options re-sort through the URL.
                                            if (useStaticOptions) setStaticSort(option.id);
                                            else navigatePage(option.id);
                                            setSortOpen(false);
                                        }}
                                        className={cn(
                                            'block w-full cursor-pointer px-4 py-2.5 text-left text-sm',
                                            isSelected
                                                ? 'bg-primary text-primary-foreground'
                                                : 'text-foreground hover:bg-muted'
                                        )}>
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        );
    }

    // Default variant: nothing to render without sorting options.
    if (sortingOptions.length === 0) {
        return null;
    }

    return (
        <div
            className={`flex items-center space-x-2${isPending ? ' pointer-events-none opacity-50 transition-opacity' : ''}`}>
            <label htmlFor={selectId} className="text-sm text-muted-foreground">
                Sort by:
            </label>
            <NativeSelect
                id={selectId}
                value={effectiveSortingOption || ''}
                onChange={(e) => void navigatePage(e.target.value)}>
                {sortingOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                        {option.label}
                    </option>
                ))}
            </NativeSelect>
        </div>
    );
}
