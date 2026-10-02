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
import { type ReactElement, useState, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { StarRating } from '@/components/product-ratings/star-rating';
import { StarRatingDistributions } from '@/components/product-ratings/star-rating-distributions';
import { StarIcon } from '@/components/product-ratings/star-icon';
import { ThumbsUp } from 'lucide-react';
import { useProduct } from '@/providers/product-context';
import { useProductReviews } from '@/extensions/ratings-reviews/providers/product-reviews-context';
import type { ReviewItem, WriteReviewFormData } from '@/extensions/ratings-reviews/lib/api/reviews.server';

// Lazy load the ReviewCardsSection to improve initial page load
const ReviewCardsSection = lazy(
    () => import('@/extensions/ratings-reviews/components/review-cards/review-cards-section')
);

const CUSTOMER_REVIEWS_ACCORDION_VALUE = 'customer-reviews';
/** Delay before triggering onExpanded callback (matches accordion open animation duration). */
const ACCORDION_OPEN_DURATION_MS = 250;

const REFERENCE_REVIEW: ReviewItem = {
    id: 'reference-alterations-review',
    authorName: '',
    verifiedPurchase: false,
    date: 'Jan 12, 2026',
    rating: 4,
    headline: 'Charged for alterations',
    body: "I paid just under $2000 for a sport jacket, plus shipping from another store. When the jacket arrived I was told it would be an additional $150 for alterations. I paid, but I won't be shopping in the Men's Department again,",
    helpfulCount: 1,
};

function ReviewPreviewCard({ review }: { review: ReviewItem }): ReactElement {
    return (
        <article className="border-b border-border pb-4 last:border-b-0 last:pb-0" data-testid="review-preview-card">
            <div className="flex items-center gap-3">
                <div role="img" aria-label={`${review.rating} out of 5 stars`} className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <StarIcon key={star} filled={star <= review.rating} opacity={1} className="size-4" />
                    ))}
                </div>
                <span className="text-xs text-muted-foreground">{review.date}</span>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">{review.headline}</h3>
            <p className="mt-2 text-sm leading-5 text-foreground">{review.body}</p>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ThumbsUp aria-hidden="true" className="size-4" />
                {review.helpfulCount} found this helpful
            </div>
        </article>
    );
}

/**
 * Customer Reviews Section. Header uses the loader-seeded summary; the full
 * list is lazy-resolved from the loader Promise when the accordion expands.
 */
export interface CustomerReviewsSectionProps {
    /** Write-review form configuration (loader-resolved) — passed through to the button. */
    writeReviewFormConfig?: WriteReviewFormData;
}

export default function CustomerReviewsSection({
    writeReviewFormConfig,
}: CustomerReviewsSectionProps = {}): ReactElement {
    const { t } = useTranslation('extRatingsReviews');
    const product = useProduct();
    const {
        reviewsSummary,
        reviewsSummaryLoading,
        reviews,
        reviewsLoading,
        loadReviewsIfNeeded,
        registerExpand,
        triggerOnExpanded,
    } = useProductReviews();
    const productName = product?.name ?? '';
    const [accordionValue, setAccordionValue] = useState<string[]>([]);
    const [selectedRatingFilter, setSelectedRatingFilter] = useState<number | null>(null);
    const prevAccordionOpenRef = useRef(false);

    useEffect(() => {
        if (accordionValue.includes(CUSTOMER_REVIEWS_ACCORDION_VALUE)) {
            loadReviewsIfNeeded();
        }
    }, [accordionValue, loadReviewsIfNeeded]);

    const isOpen = accordionValue.includes(CUSTOMER_REVIEWS_ACCORDION_VALUE);
    useEffect(() => {
        const justOpened = isOpen && !prevAccordionOpenRef.current;
        prevAccordionOpenRef.current = isOpen;
        if (!justOpened) return;
        const id = setTimeout(triggerOnExpanded, ACCORDION_OPEN_DURATION_MS);
        return () => clearTimeout(id);
    }, [isOpen, triggerOnExpanded]);

    useEffect(() => {
        registerExpand(() => {
            if (prevAccordionOpenRef.current) {
                requestAnimationFrame(() => triggerOnExpanded());
                return;
            }
            setAccordionValue((prev) =>
                prev.includes(CUSTOMER_REVIEWS_ACCORDION_VALUE) ? prev : [...prev, CUSTOMER_REVIEWS_ACCORDION_VALUE]
            );
        });
        return () => registerExpand(null);
    }, [registerExpand, triggerOnExpanded]);

    const aggregateRating = useMemo(() => {
        if (reviews.length > 0) {
            const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
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
            reviews.forEach((review) => {
                if (review.rating >= 1 && review.rating <= 5) {
                    counts[review.rating] = (counts[review.rating] ?? 0) + 1;
                }
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

    const isLoadingHeader = reviewsSummaryLoading;

    const reviewCountLabel =
        aggregateRating.count === 1
            ? t('section.subtitleOne', { productName })
            : t('section.subtitleOther', { count: aggregateRating.count, productName });

    return (
        // tabIndex={-1} lets the "View customer reviews" jump control move keyboard focus here,
        // not just scroll the viewport. See product-rating-summary scrollToReviews. (W-23325662)
        <div id="customer-reviews" tabIndex={-1} className="outline-none">
            <Accordion type="multiple" className="w-full" value={accordionValue} onValueChange={setAccordionValue}>
                <AccordionItem value={CUSTOMER_REVIEWS_ACCORDION_VALUE}>
                    <AccordionTrigger headingLevel={2} className="text-left hover:no-underline py-2 cursor-pointer">
                        <span className="sm:text-2xl text-brand-black font-medium">{t('section.heading')}</span>
                    </AccordionTrigger>
                    {!isLoadingHeader && aggregateRating.count > 0 && (
                        <p className="sm:text-sm mt-px text-brand-gray-600">{reviewCountLabel}</p>
                    )}
                    {!isLoadingHeader && (
                        <div className="mt-4 space-y-4">
                            <ReviewPreviewCard review={REFERENCE_REVIEW} />
                            {reviews.slice(0, 1).map((review) => (
                                <ReviewPreviewCard key={review.id} review={review} />
                            ))}
                            {reviewsLoading && reviews.length === 0 && (
                                <p className="text-sm text-muted-foreground">{t('section.loading')}</p>
                            )}
                        </div>
                    )}
                    <AccordionContent>
                        {reviewsLoading && reviews.length === 0 ? (
                            <p className="text-muted-foreground pt-4">{t('section.loading')}</p>
                        ) : reviews.length === 0 && !reviewsLoading ? (
                            <p className="text-muted-foreground pt-4">{t('section.noReviewsForProduct')}</p>
                        ) : (
                            <div className="space-y-6 pt-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8 mb-6 sm:mb-8 p-4 sm:p-6 rounded-ui bg-secondary">
                                    <div className="flex flex-col items-start space-y-2">
                                        <StarRating
                                            rating={aggregateRating.average}
                                            reviewCount={aggregateRating.count}
                                            showRatingLabel={true}
                                            ratingLabelPosition="top"
                                            ratingLabelFormat="short"
                                            starSize="default"
                                            ratingLabelClassName="text-4xl font-bold text-foreground"
                                            showReviewCountLabel={true}
                                            reviewCountLabelClassName="text-sm text-muted-foreground mt-1"
                                        />
                                    </div>
                                    <div className="md:col-span-2 min-w-0">
                                        <StarRatingDistributions
                                            distributions={ratingDistributions}
                                            selectedRating={selectedRatingFilter}
                                            onRatingClick={(rating) =>
                                                setSelectedRatingFilter((prev) => (prev === rating ? null : rating))
                                            }
                                        />
                                    </div>
                                </div>
                                <Suspense
                                    fallback={<div className="text-muted-foreground">{t('section.loading')}</div>}>
                                    <ReviewCardsSection
                                        selectedRating={selectedRatingFilter}
                                        onRatingChange={setSelectedRatingFilter}
                                        writeReviewFormConfig={writeReviewFormConfig}
                                    />
                                </Suspense>
                            </div>
                        )}
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}
