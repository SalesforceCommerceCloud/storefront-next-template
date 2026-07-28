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
import { type ReactElement, useMemo, useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { StarRating } from '@/components/product-ratings/star-rating';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useProductReviews } from '@/extensions/ratings-reviews/providers/product-reviews-context';
import { uiConfig } from '@/lib/config.ui';
import { cn } from '@/lib/utils';

const StarRatingDistributionModalContent = lazy(() =>
    import('@/components/info-modal/renderers/star-rating-distribution-modal-content').then((m) => ({
        default: m.StarRatingDistributionModalContent,
    }))
);

const CUSTOMER_REVIEWS_ID = 'customer-reviews';
/** Delay before closing popover on mouse leave so user can move to content (portaled). */
const POPOVER_CLOSE_DELAY_MS = 150;

/**
 * Star rating summary shown under the product description on PDP.
 * Displays stars and average (count). Hovering over the entire rating opens an inline
 * popover underneath with distribution and "See customer reviews". Clicking that
 * link scrolls to the customer reviews accordion.
 */
export function ProductRatingSummary({ interactive = true }: { interactive?: boolean }): ReactElement | null {
    const { t } = useTranslation('product');
    const { reviewsSummary, reviews, expandReviews, registerOnExpanded } = useProductReviews();
    // @/lib/config.ui seam — a vertical (e.g. foundations) overlays this to show the
    // numeric average and a "{count} reviews" label; the baseline shows count-only.
    const { showRatingAverage } = uiConfig.pages.product;
    const [popoverOpen, setPopoverOpen] = useState(false);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // True only while the current close was triggered by Escape (a keyboard dismissal), so the
    // close handler can return focus to the trigger for that path and leave it alone otherwise.
    const escapeDismissRef = useRef(false);

    const clearCloseTimeout = useCallback(() => {
        if (closeTimeoutRef.current != null) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
    }, []);

    const scheduleClose = useCallback(() => {
        clearCloseTimeout();
        closeTimeoutRef.current = setTimeout(() => {
            closeTimeoutRef.current = null;
            setPopoverOpen(false);
        }, POPOVER_CLOSE_DELAY_MS);
    }, [clearCloseTimeout]);

    useEffect(() => () => clearCloseTimeout(), [clearCloseTimeout]);

    const aggregateRating = useMemo(() => {
        if (reviews.length > 0) {
            const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
            return { average: sum / reviews.length, count: reviews.length };
        }
        return {
            average: reviewsSummary?.averageRating ?? 0,
            count: reviewsSummary?.totalCount ?? 0,
        };
    }, [reviews, reviewsSummary]);

    const ratingDistributions = useMemo(() => {
        if (reviews.length > 0) {
            const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            reviews.forEach((r) => {
                if (r.rating >= 1 && r.rating <= 5) counts[r.rating] = (counts[r.rating] ?? 0) + 1;
            });
            return [
                { rating: 5, count: counts[5] ?? 0 },
                { rating: 4, count: counts[4] ?? 0 },
                { rating: 3, count: counts[3] ?? 0 },
                { rating: 2, count: counts[2] ?? 0 },
                { rating: 1, count: counts[1] ?? 0 },
            ];
        }
        const d = reviewsSummary?.distribution;
        if (!d)
            return [
                { rating: 5, count: 0 },
                { rating: 4, count: 0 },
                { rating: 3, count: 0 },
                { rating: 2, count: 0 },
                { rating: 1, count: 0 },
            ];
        return [
            { rating: 5, count: d.fiveStars ?? 0 },
            { rating: 4, count: d.fourStars ?? 0 },
            { rating: 3, count: d.threeStars ?? 0 },
            { rating: 2, count: d.twoStars ?? 0 },
            { rating: 1, count: d.oneStar ?? 0 },
        ];
    }, [reviews, reviewsSummary]);

    const hasReviews = aggregateRating.count > 0;
    const canInteract = interactive && hasReviews;

    const scrollToReviews = useCallback(() => {
        const target = document.getElementById(CUSTOMER_REVIEWS_ID);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Move keyboard focus to the reviews section, not just the viewport. Without this a
        // keyboard or screen-reader user stays on the rating summary while the page scrolls
        // away beneath them. `preventScroll` keeps the smooth scroll above from being cut short
        // by the focus call. The target carries tabIndex={-1} so it can receive focus. (W-23325662)
        target.focus({ preventScroll: true });
    }, []);

    const handleSeeReviewsClick = useCallback(() => {
        setPopoverOpen(false);
        registerOnExpanded(scrollToReviews);
        expandReviews();
    }, [expandReviews, registerOnExpanded, scrollToReviews]);

    const handleSummaryClick = useCallback(() => {
        setPopoverOpen(false);
        registerOnExpanded(scrollToReviews);
        expandReviews();
    }, [expandReviews, registerOnExpanded, scrollToReviews]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (!canInteract) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSummaryClick();
            }
        },
        [canInteract, handleSummaryClick]
    );

    return (
        <div className="relative mt-2 inline-block">
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                    {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- hover-only popover trigger (onMouseEnter/Leave); eslint-plugin-jsx-a11y's default handler list excludes mouse-enter/leave, so this is not a keyboard-interaction gap */}
                    <div
                        className={cn('relative inline-block', canInteract && 'cursor-pointer')}
                        onMouseEnter={() => {
                            if (!canInteract) return;
                            clearCloseTimeout();
                            setPopoverOpen(true);
                        }}
                        onMouseLeave={() => canInteract && scheduleClose()}
                        onClick={() => canInteract && handleSummaryClick()}
                        onKeyDown={handleKeyDown}
                        role={canInteract ? 'button' : undefined}
                        tabIndex={canInteract ? 0 : undefined}
                        aria-label={canInteract ? 'View customer reviews' : undefined}
                        aria-expanded={canInteract ? popoverOpen : undefined}>
                        <div className="flex items-center gap-2">
                            <StarRating
                                rating={aggregateRating.average}
                                reviewCount={aggregateRating.count}
                                // Gate the numeric average on hasReviews, mirroring the review-count
                                // suffix below — without reviews the average is 0, and a lone "0" next
                                // to empty stars is neither the with-reviews label ("4.8 (124 reviews)")
                                // nor the count-only baseline. Only the average+count pair should show.
                                showRatingLabel={showRatingAverage && hasReviews}
                                ratingLabelPosition="right"
                                ratingLabelFormat="short"
                                ratingLabelClassName="text-sm font-medium text-card-foreground"
                                showRatingLink={false}
                                starSize="default"
                            />
                            {aggregateRating.count > 0 &&
                                (showRatingAverage ? (
                                    <span className="text-sm text-muted-foreground">
                                        {t('rating.reviewCount', { count: aggregateRating.count })}
                                    </span>
                                ) : (
                                    <span className="text-sm text-muted-foreground">({aggregateRating.count})</span>
                                ))}
                        </div>
                    </div>
                </PopoverTrigger>
                <PopoverContent
                    side="bottom"
                    align="start"
                    sideOffset={4}
                    className="min-w-[280px] max-w-[304px] p-4 bg-card text-card-foreground"
                    aria-label="Star rating distribution"
                    onEscapeKeyDown={() => {
                        // Mark this close as a keyboard dismissal so onCloseAutoFocus below returns
                        // focus to the trigger (Radix fires onEscapeKeyDown before onCloseAutoFocus).
                        escapeDismissRef.current = true;
                    }}
                    onCloseAutoFocus={(e) => {
                        // The popover is hover-opened, so most closes are a mouse-leave: the pointer
                        // has moved on and returning focus to the trigger would yank the page (and
                        // scroll) back to the rating summary. Only Escape, a keyboard dismissal, must
                        // return focus to the trigger for WCAG 2.4.3. Let Radix's default run for
                        // Escape; suppress it for every other close.
                        if (!escapeDismissRef.current) {
                            e.preventDefault();
                        }
                        escapeDismissRef.current = false;
                    }}
                    onMouseEnter={clearCloseTimeout}
                    onMouseLeave={scheduleClose}>
                    <Suspense fallback={null}>
                        <StarRatingDistributionModalContent
                            rating={aggregateRating.average}
                            reviewCount={aggregateRating.count}
                            distributions={ratingDistributions}
                            onSeeReviewsClick={handleSeeReviewsClick}
                        />
                    </Suspense>
                </PopoverContent>
            </Popover>
        </div>
    );
}
