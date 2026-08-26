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
/** @sfdc-extension-file SFDC_EXT_RATINGS_REVIEWS */
import { type ReactElement, useState, useEffect, useMemo, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Search, ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { ReviewItem, WriteReviewFormData } from '@/extensions/ratings-reviews/lib/api/reviews.server';
import { useProductReviews } from '@/extensions/ratings-reviews/providers/product-reviews-context';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { getPaginationItems } from '@/lib/pagination-utils';
import { cn } from '@/lib/utils';
import WriteReviewButton from '@/extensions/ratings-reviews/components/write-review-button';
import { StarIcon } from '@/components/product-ratings/star-icon';
import { ReviewCard } from './review-card';

const REVIEWS_PER_PAGE = 5;
/** When there are more than this many pages, show truncated pagination (e.g. 1 ... 4 [5] 6 ... 20) */
const MAX_VISIBLE_PAGE_BUTTONS = 5;

/** Sort option value and translation key for label */
const REVIEW_SORT_OPTIONS = [
    { value: 'most-recent', labelKey: 'filters.sortMostRecent' as const },
    { value: 'highest-rated', labelKey: 'filters.sortHighestRated' as const },
    { value: 'lowest-rated', labelKey: 'filters.sortLowestRated' as const },
    { value: 'most-helpful', labelKey: 'filters.sortMostHelpful' as const },
] as const;

export type ReviewSortValue = (typeof REVIEW_SORT_OPTIONS)[number]['value'];

export interface ReviewCardsSectionProps {
    /** When provided, rating filter is controlled by parent (e.g. from distribution bar clicks) */
    selectedRating?: number | null;
    /** When provided, parent is notified when user changes rating filter */
    onRatingChange?: (rating: number | null) => void;
    /** Write-review form configuration (loader-resolved) passed through to the button. */
    writeReviewFormConfig?: WriteReviewFormData;
}

/**
 * Parse ISO 8601 date string (YYYY-MM-DD) to timestamp for stable sorting.
 * Returns 0 for empty or invalid dates so the comparator never yields NaN.
 */
function parseReviewDate(dateStr: string | undefined): number {
    const s = (dateStr ?? '').trim();
    if (!s) return 0;
    const t = new Date(s).getTime();
    return Number.isNaN(t) ? 0 : t;
}

function filterReviews(
    reviews: ReviewItem[],
    searchKeyword: string | undefined,
    selectedRating: number | null,
    withPhotosOnly: boolean
): ReviewItem[] {
    let result = reviews;

    if (selectedRating != null) {
        result = result.filter((r) => Number(r.rating) === selectedRating);
    }
    if (withPhotosOnly) {
        result = result.filter((r) => r.photos && r.photos.length > 0);
    }
    const kw = (searchKeyword ?? '').trim().toLowerCase();
    if (kw) {
        result = result.filter(
            (r) =>
                r.headline.toLowerCase().includes(kw) ||
                r.body.toLowerCase().includes(kw) ||
                r.authorName.toLowerCase().includes(kw)
        );
    }
    return result;
}

function sortReviews(reviews: ReviewItem[], sortBy: ReviewSortValue): ReviewItem[] {
    return [...reviews].sort((a, b) => {
        switch (sortBy) {
            case 'most-recent': {
                return parseReviewDate(b.date) - parseReviewDate(a.date);
            }
            case 'highest-rated':
                return b.rating - a.rating;
            case 'lowest-rated':
                return a.rating - b.rating;
            case 'most-helpful':
                return b.helpfulCount - a.helpfulCount;
            default:
                return 0;
        }
    });
}

export default function ReviewCardsSection({
    selectedRating: controlledRating,
    onRatingChange,
    writeReviewFormConfig,
}: ReviewCardsSectionProps = {}): ReactElement {
    const { t } = useTranslation('extRatingsReviews');
    const { reviews } = useProductReviews();
    const sortSelectId = useId();

    const [currentPage, setCurrentPage] = useState(1);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [internalRating, setInternalRating] = useState<number | null>(null);
    const [withPhotosOnly, setWithPhotosOnly] = useState(false);
    const [sortBy, setSortBy] = useState<ReviewSortValue>('most-recent');
    const sectionRef = useRef<HTMLDivElement>(null);
    const ratingButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({});
    const withPhotosButtonRef = useRef<HTMLButtonElement | null>(null);
    const prevPageButtonRef = useRef<HTMLButtonElement | null>(null);
    const nextPageButtonRef = useRef<HTMLButtonElement | null>(null);
    const lastPaginationActionRef = useRef<'prev' | 'next' | null>(null);

    const isControlled = onRatingChange != null;
    const selectedRating = isControlled ? (controlledRating ?? null) : internalRating;
    const setSelectedRating = (value: number | null) => {
        if (isControlled) onRatingChange?.(value);
        else setInternalRating(value);
    };

    const debouncedSearchKeyword = useDebouncedValue(searchKeyword, 300);

    useEffect(() => {
        setCurrentPage(1);
    }, []);

    const filteredReviews = useMemo(
        () => filterReviews(reviews, debouncedSearchKeyword, selectedRating, withPhotosOnly),
        [reviews, debouncedSearchKeyword, selectedRating, withPhotosOnly]
    );

    const filteredAndSortedReviews = useMemo(() => sortReviews(filteredReviews, sortBy), [filteredReviews, sortBy]);

    const ratingCounts = useMemo(() => {
        const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        reviews.forEach((r) => {
            if (r.rating >= 1 && r.rating <= 5) counts[r.rating] = (counts[r.rating] ?? 0) + 1;
        });
        return counts;
    }, [reviews]);

    const withPhotosCount = useMemo(() => reviews.filter((r) => r.photos && r.photos.length > 0).length, [reviews]);

    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchKeyword, selectedRating, withPhotosOnly, sortBy]);

    // Scroll to top of reviews section when page changes so we don't end up at the bottom
    useEffect(() => {
        const el = sectionRef.current;
        if (currentPage > 1 && el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [currentPage]);

    const totalReviews = filteredAndSortedReviews.length;
    const totalPages = Math.max(1, Math.ceil(totalReviews / REVIEWS_PER_PAGE));
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * REVIEWS_PER_PAGE;
    const pageReviews = useMemo(
        () => filteredAndSortedReviews.slice(startIndex, startIndex + REVIEWS_PER_PAGE),
        [filteredAndSortedReviews, startIndex]
    );

    const from = totalReviews === 0 ? 0 : startIndex + 1;
    const to = Math.min(startIndex + REVIEWS_PER_PAGE, totalReviews);

    // Previous/Next become disabled at the ends of the page range. A disabled button can't hold
    // focus, so send it to the remaining enabled control instead of letting it drop (WCAG 2.4.3).
    useEffect(() => {
        const action = lastPaginationActionRef.current;
        if (!action) return;
        lastPaginationActionRef.current = null;

        if (action === 'prev' && currentPage <= 1) {
            nextPageButtonRef.current?.focus();
        } else if (action === 'next' && currentPage >= totalPages) {
            prevPageButtonRef.current?.focus();
        }
    }, [currentPage, totalPages]);

    return (
        <div ref={sectionRef} className="space-y-6" data-testid="review-cards-section">
            {reviews.length === 0 ? (
                <p className="text-muted-foreground">{t('section.noReviewsForProduct')}</p>
            ) : (
                <>
                    {/* Filter by star rating + With Photos */}
                    <div className="space-y-2">
                        <p className="sm:text-sm text-brand-gray-600 font-medium">{t('filters.filterBy')}</p>
                        <div className="flex flex-wrap items-center gap-2">
                            {([5, 4, 3, 2, 1] as const).map((rating) => {
                                const count = ratingCounts[rating] ?? 0;
                                const isSelected = selectedRating === rating;
                                return (
                                    <Button
                                        key={rating}
                                        ref={(el) => {
                                            ratingButtonRefs.current[rating] = el;
                                        }}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className={cn(
                                            'gap-1 rounded-ui bg-muted border-transparent hover:bg-muted-hover',
                                            isSelected && 'border-filter-selected-border bg-filter-selected'
                                        )}
                                        onClick={() => setSelectedRating(isSelected ? null : rating)}
                                        aria-pressed={isSelected}
                                        aria-label={t('filters.filterByStars', { count: rating })}>
                                        <span>{rating}</span>
                                        <StarIcon filled={true} opacity={1} className="size-4" aria-hidden />
                                        <span className="text-muted-foreground">({count})</span>
                                    </Button>
                                );
                            })}
                            <Button
                                ref={withPhotosButtonRef}
                                type="button"
                                variant="outline"
                                size="sm"
                                className={cn(
                                    'gap-1.5 rounded-ui bg-muted border-transparent hover:bg-muted-hover',
                                    withPhotosOnly && 'border-filter-selected-border bg-filter-selected'
                                )}
                                onClick={() => setWithPhotosOnly((prev) => !prev)}
                                aria-pressed={withPhotosOnly}
                                aria-label={`${t('filters.withPhotos')} (${withPhotosCount})`}>
                                <ImageIcon className="size-4" aria-hidden />
                                {t('filters.withPhotos')}{' '}
                                <span className="text-muted-foreground">({withPhotosCount})</span>
                            </Button>
                        </div>
                    </div>

                    {/* Search reviews */}
                    <div className="relative">
                        <Search
                            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden
                        />
                        <Input
                            type="search"
                            placeholder={t('filters.searchPlaceholder')}
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            className="pl-9"
                            aria-label={t('filters.searchPlaceholder')}
                        />
                    </div>

                    {/* Sort + Write a Review */}
                    <div className="flex flex-wrap items-center justify-between gap-4 w-full">
                        <div className="flex items-center gap-2">
                            <label htmlFor={sortSelectId} className="sm:text-sm text-brand-gray-600 font-medium">
                                {t('filters.sortLabel')}
                            </label>
                            <NativeSelect
                                id={sortSelectId}
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as ReviewSortValue)}>
                                {REVIEW_SORT_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {t(opt.labelKey)}
                                    </option>
                                ))}
                            </NativeSelect>
                        </div>
                        <WriteReviewButton formConfig={writeReviewFormConfig} />
                    </div>

                    {/* Active filter chips - show in reviews section when filters are applied */}
                    {(selectedRating != null || withPhotosOnly) && (
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedRating != null && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const rating = selectedRating;
                                        setSelectedRating(null);
                                        requestAnimationFrame(() => {
                                            ratingButtonRefs.current[rating]?.focus();
                                        });
                                    }}
                                    className="inline-flex items-center gap-1 rounded-ui border border-filter-selected-border bg-filter-selected px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    aria-label={t('filters.clearStarFilter', { count: selectedRating })}>
                                    <span>{t('filters.activeFilterStars', { count: selectedRating })}</span>
                                    <X className="size-3.5 shrink-0" aria-hidden />
                                </button>
                            )}
                            {withPhotosOnly && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setWithPhotosOnly(false);
                                        requestAnimationFrame(() => {
                                            withPhotosButtonRef.current?.focus();
                                        });
                                    }}
                                    className="inline-flex items-center gap-1 rounded-ui border border-filter-selected-border bg-filter-selected px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    aria-label={t('filters.clearPhotoFilter')}>
                                    <span>{t('filters.withPhotos')}</span>
                                    <X className="size-3.5 shrink-0" aria-hidden />
                                </button>
                            )}
                        </div>
                    )}

                    {totalReviews === 0 ? (
                        <p className="text-muted-foreground">{t('section.noReviewsMatchFilters')}</p>
                    ) : (
                        <>
                            <ul className="list-none divide-y divide-border p-0 m-0">
                                {pageReviews.map((review) => (
                                    <li key={review.id} className="py-6 first:pt-0">
                                        <ReviewCard review={review} />
                                    </li>
                                ))}
                            </ul>

                            {/* Pagination */}
                            <div className="mt-6 flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-muted-foreground">
                                    {t('section.showingReviews', { from, to, total: totalReviews })}
                                </p>
                                <nav className="flex items-center gap-1" aria-label={t('section.heading')}>
                                    <Button
                                        ref={prevPageButtonRef}
                                        variant="outline"
                                        size="icon"
                                        className="size-9"
                                        onClick={() => {
                                            lastPaginationActionRef.current = 'prev';
                                            setCurrentPage((p) => Math.max(1, p - 1));
                                        }}
                                        disabled={safePage <= 1}
                                        aria-label="Previous page">
                                        <ChevronLeft className="size-4" />
                                    </Button>
                                    {getPaginationItems(totalPages, safePage, MAX_VISIBLE_PAGE_BUTTONS).map((item) => {
                                        if (typeof item === 'object' && item.type === 'ellipsis') {
                                            return (
                                                <span
                                                    key={item.key}
                                                    className="flex size-9 items-center justify-center px-1 text-muted-foreground"
                                                    aria-hidden>
                                                    …
                                                </span>
                                            );
                                        }
                                        const page = item as number;
                                        return (
                                            <Button
                                                key={page}
                                                variant={page === safePage ? 'default' : 'outline'}
                                                size="icon"
                                                className="size-9"
                                                onClick={() => setCurrentPage(page)}
                                                aria-label={`Page ${String(page)}`}
                                                aria-current={page === safePage ? 'page' : undefined}>
                                                {page}
                                            </Button>
                                        );
                                    })}
                                    <Button
                                        ref={nextPageButtonRef}
                                        variant="outline"
                                        size="icon"
                                        className="size-9"
                                        onClick={() => {
                                            lastPaginationActionRef.current = 'next';
                                            setCurrentPage((p) => Math.min(totalPages, p + 1));
                                        }}
                                        disabled={safePage >= totalPages}
                                        aria-label="Next page">
                                        <ChevronRight className="size-4" />
                                    </Button>
                                </nav>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
