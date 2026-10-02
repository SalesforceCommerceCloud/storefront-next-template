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
import { type ReactElement, useCallback, useMemo } from 'react';
import { useLocation, useNavigation } from 'react-router';
import { useNavigate } from '@/hooks/use-navigate';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ShopperProducts } from '@/scapi';
import { useTranslation } from 'react-i18next';

interface QuickFiltersProps {
    category?: ShopperProducts.schemas['Category'];
    /**
     * Optional label for the active category (e.g. the `cgid` refinement label).
     * When provided, a "Shop by {label}" header with a leading sparkles icon is
     * rendered before the chips. When omitted, no header is shown.
     *
     * The component stays presentational: the caller decides whether to supply a
     * label (e.g. a vertical gating on `uiConfig.pages.category.showCategoryLabel`
     * computes it from loader data and passes it). Keeps this component free of
     * config/loader coupling so it renders the same way given the same props.
     */
    categoryLabel?: string;
    /**
     * `chips` (default): outlined pill buttons.
     * `tabs`: a text tab row with an underline on the active tab, led by an "All {category}" tab that clears
     * the subcategory filter.
     */
    variant?: 'chips' | 'tabs';
}

/**
 * QuickFilters Component
 *
 * Displays category subcategories as horizontal chips for quick access without opening the refinements panel.
 *
 * Features:
 * - Horizontal chip/button layout
 * - Optional "Shop by {label}" header (see `categoryLabel`)
 * - Active state for selected filters
 * - Optimistic UI during navigation
 * - Displays direct subcategories from category.categories on category pages
 * - Responsive with horizontal scroll on overflow
 *
 * @param props - Component props
 * @param props.category - Category object with subcategories from SCAPI
 * @param props.categoryLabel - Optional active-category label; renders a header when set
 */
export default function QuickFilters({
    category,
    categoryLabel,
    variant = 'chips',
}: QuickFiltersProps): ReactElement | null {
    const { t } = useTranslation('common');
    const { t: tCategory } = useTranslation('category');
    const navigate = useNavigate();
    const location = useLocation();
    const navigation = useNavigation();
    const isPending = navigation.state !== 'idle';

    // Get subcategories to display from category.categories
    const categories = useMemo(() => {
        if (!category?.categories?.length) {
            return [];
        }

        return category.categories.map((cat) => ({
            value: cat.id,
            label: cat.name || cat.id,
        }));
    }, [category?.categories]);

    // Get active cgid refinements from optimistic state or current location
    const activeRefinements = useMemo(() => {
        const searchParams = navigation.location ? navigation.location.search : location.search;
        const params = new URLSearchParams(searchParams);
        return params.getAll('refine');
    }, [navigation.location, location.search]);

    // Handle category chip click
    const handleCategoryClick = useCallback(
        (categoryValue: string) => {
            const params = new URLSearchParams(location.search);
            const refines = params.getAll('refine');
            const cgidRefinement = `cgid=${categoryValue}`;

            // Check if this refinement is already selected
            const isSelected = refines.includes(cgidRefinement);

            let nextRefines: string[];
            if (isSelected) {
                // Remove this refinement (unfilter)
                nextRefines = refines.filter((r) => r !== cgidRefinement);
            } else {
                // Remove any existing cgid refinements and add the new one
                nextRefines = [...refines.filter((r) => !r.startsWith('cgid=')), cgidRefinement];
            }

            // Rebuild search params with the new refines
            params.delete('refine');
            nextRefines.forEach((r) => params.append('refine', r));
            params.set('offset', '0');

            void navigate({
                pathname: location.pathname,
                search: `?${params.toString()}`,
            });
        },
        [location.search, location.pathname, navigate]
    );

    // Don't render if no categories available
    if (categories.length === 0) {
        return null;
    }

    if (variant === 'tabs') {
        const hasActiveCategory = activeRefinements.some((r) => r.startsWith('cgid='));
        const clearCategory = () => {
            const params = new URLSearchParams(location.search);
            const refines = params.getAll('refine').filter((r) => !r.startsWith('cgid='));
            params.delete('refine');
            refines.forEach((r) => params.append('refine', r));
            params.set('offset', '0');
            void navigate({ pathname: location.pathname, search: `?${params.toString()}` });
        };
        const tabClassName = (active: boolean) =>
            cn(
                '-mb-px cursor-pointer whitespace-nowrap border-b-2 py-3 text-sm transition-colors',
                active
                    ? 'border-foreground font-semibold text-foreground'
                    : 'border-transparent text-foreground/80 hover:text-foreground'
            );
        return (
            <nav
                data-slot="quick-filters"
                aria-label={t('quickCategoryFilters', 'Quick category filters')}
                className={cn(
                    'flex gap-6 overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                    isPending && 'pointer-events-none opacity-50 transition-opacity'
                )}>
                <button
                    type="button"
                    onClick={clearCategory}
                    aria-current={!hasActiveCategory ? 'true' : undefined}
                    className={tabClassName(!hasActiveCategory)}>
                    {tCategory('allInCategory', { name: category?.name ?? '' })}
                </button>
                {categories.map((cat) => {
                    const isActive = activeRefinements.includes(`cgid=${cat.value}`);
                    return (
                        <button
                            key={cat.value}
                            type="button"
                            onClick={() => handleCategoryClick(cat.value)}
                            aria-current={isActive ? 'true' : undefined}
                            className={tabClassName(isActive)}>
                            {cat.label || cat.value}
                        </button>
                    );
                })}
            </nav>
        );
    }

    // Header text shown when a category label is supplied (e.g. "Shop by Dresses").
    const displayLabel = categoryLabel ? `${t('shopBy', 'Shop by')} ${categoryLabel}` : undefined;

    return (
        <div
            className={cn(
                'flex flex-wrap gap-2',
                // items-center only matters once the header sits inline with the chips
                displayLabel && 'items-center',
                isPending && 'pointer-events-none opacity-50 transition-opacity'
            )}
            role="group"
            aria-label={displayLabel || t('quickCategoryFilters', 'Quick category filters')}
            data-slot="quick-filters">
            {displayLabel && (
                <span
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground pr-2"
                    data-slot="quick-filters-label">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-3.5"
                        aria-hidden="true">
                        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .963L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                        <path d="M20 3v4" />
                        <path d="M22 5h-4" />
                        <path d="M4 17v2" />
                        <path d="M5 18H3" />
                    </svg>
                    {displayLabel}
                </span>
            )}
            {categories.map((cat) => {
                const cgidRefinement = `cgid=${cat.value}`;
                const isActive = activeRefinements.includes(cgidRefinement);
                return (
                    <Button
                        key={cat.value}
                        variant={isActive ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleCategoryClick(cat.value)}
                        className={cn(
                            'whitespace-nowrap cursor-pointer text-sm font-normal leading-5 tracking-[-0.15px]',
                            isActive ? 'text-primary-foreground' : 'text-foreground'
                        )}
                        aria-pressed={isActive}>
                        {cat.label || cat.value}
                    </Button>
                );
            })}
        </div>
    );
}
