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
import { useState, useRef, useEffect, useCallback, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, ThumbsUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StarIcon } from '@/components/product-ratings/star-icon';
import type { ReviewItem } from '@/extensions/ratings-reviews/lib/api/reviews.server';
import { REVIEW_CARD_IMAGES } from './review-card-images';

const BODY_TRUNCATE_LENGTH = 400;
/** Data URI fallback when a review photo fails to load (1x1). Matches --review-avatar-bg; Tailwind/CSS can't be used inside img src. */
const FALLBACK_IMAGE = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"><rect width="1" height="1" fill="#e5e7eb"/></svg>'
)}`;

export interface ReviewCardProps {
    review: ReviewItem;
    className?: string;
}

/**
 * Renders a single review card with avatar, verified badge, stars, date/location,
 * headline, body (with optional Read More), photos, and Helpful/Report actions.
 */
/** Focusable selector for lightbox focus trap */
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Format ISO date (YYYY-MM-DD) for display; pass-through non-ISO strings. */
function formatReviewDateDisplay(dateStr: string | undefined): string {
    if (!dateStr?.trim()) return '';
    const trimmed = dateStr.trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed;
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return trimmed;
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}

export function ReviewCard({ review, className }: ReviewCardProps): ReactElement {
    const { t } = useTranslation('extRatingsReviews');
    const reviewImageAltFallback = review.headline || t('card.imageAlt') || 'Review Image';
    const initial = review.authorName.trim().charAt(0).toUpperCase() || '?';
    const dateDisplay = formatReviewDateDisplay(review.date);
    const dateLocation = [dateDisplay, review.location].filter(Boolean).join(' • ');
    const isLongBody = review.body.length > BODY_TRUNCATE_LENGTH;
    const [expanded, setExpanded] = useState(false);
    const [lightboxPhoto, setLightboxPhoto] = useState<{ src: string; alt: string } | null>(null);
    const [helpfulCount, setHelpfulCount] = useState(review.helpfulCount);
    const lightboxTriggerRef = useRef<HTMLButtonElement | null>(null);
    const lightboxOverlayRef = useRef<HTMLDivElement | null>(null);
    const displayBody = isLongBody && !expanded ? `${review.body.slice(0, BODY_TRUNCATE_LENGTH)}...` : review.body;

    const closeLightbox = useCallback(() => {
        const trigger = lightboxTriggerRef.current;
        setLightboxPhoto(null);
        requestAnimationFrame(() => trigger?.focus());
    }, []);

    // Focus trap and Escape for lightbox
    useEffect(() => {
        if (!lightboxPhoto || typeof document === 'undefined') return;
        const overlay = lightboxOverlayRef.current;
        if (!overlay) return;
        const focusables = overlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        first?.focus();

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeLightbox();
                return;
            }
            if (e.key !== 'Tab') return;
            const target = e.target as HTMLElement;
            if (e.shiftKey) {
                if (target === first) {
                    e.preventDefault();
                    last?.focus();
                }
            } else {
                if (target === last) {
                    e.preventDefault();
                    first?.focus();
                }
            }
        };
        overlay.addEventListener('keydown', onKeyDown);
        return () => overlay.removeEventListener('keydown', onKeyDown);
    }, [lightboxPhoto, closeLightbox]);

    return (
        <article
            className={cn('border-b border-border pb-6 last:border-b-0 last:pb-0', className)}
            data-testid="review-card"
            aria-labelledby={`review-headline-${review.id}`}>
            <div className="flex gap-3">
                {/* Avatar - circle with grey background */}
                <div
                    className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-gray-200 text-sm leading-7 font-medium text-brand-gray-600"
                    aria-hidden>
                    {initial}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                    {/* Name (text-base/leading-6) + Verified badge */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-medium leading-6 text-brand-black">{review.authorName}</span>
                        {review.verifiedPurchase && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-review-verified-bg px-2 py-0.5 text-xs font-normal text-review-verified-text">
                                <Check className="size-3.5" aria-hidden />
                                {t('card.verifiedPurchase')}
                            </span>
                        )}
                    </div>
                    {/* Stars + date/location (text-xs/leading-4) */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <div
                            className="flex items-center gap-0.5"
                            role="img"
                            aria-label={`${review.rating} out of 5 stars`}>
                            {[1, 2, 3, 4, 5].map((star) => (
                                <StarIcon key={star} filled={star <= review.rating} opacity={1} className="size-4" />
                            ))}
                        </div>
                        {dateLocation && (
                            <span className="text-xs leading-4 text-muted-foreground">{dateLocation}</span>
                        )}
                    </div>

                    {/* Headline - text-base/leading-6, font-medium, darkest text */}
                    <h3
                        id={`review-headline-${review.id}`}
                        className="mt-2 text-base font-medium leading-6 text-brand-black">
                        {review.headline}
                    </h3>

                    {/* Body - text-sm/leading-5, muted-foreground */}
                    <p className="mt-1 text-sm leading-5 text-muted-foreground whitespace-pre-wrap">{displayBody}</p>
                    {isLongBody && (
                        <button
                            type="button"
                            onClick={() => setExpanded((prev) => !prev)}
                            className="mt-1 cursor-pointer text-sm font-medium text-info hover:underline"
                            data-testid={expanded ? 'review-read-less' : 'review-read-more'}>
                            {expanded ? t('card.readLess') : t('card.readMore')}
                        </button>
                    )}

                    {/* Photos - click opens lightbox in same tab */}
                    {review.photos && review.photos.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {review.photos.map((photo, index) => {
                                const photoSrc = REVIEW_CARD_IMAGES[photo.url] ?? photo.url;
                                const imageAlt = photo.alt || reviewImageAltFallback;
                                return (
                                    <button
                                        // Prefer photo.id when available from API to avoid remounts. Index fallback when same photo.url repeats (e.g. mock data).
                                        key={photo.id ?? `${review.id}-${photo.url}-${index}`}
                                        type="button"
                                        onClick={(e) => {
                                            lightboxTriggerRef.current = e.currentTarget;
                                            setLightboxPhoto({ src: photoSrc, alt: imageAlt });
                                        }}
                                        className="block size-20 shrink-0 overflow-hidden border border-border bg-muted cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                        <img
                                            src={photoSrc}
                                            alt={imageAlt}
                                            className="size-full object-cover"
                                            loading="lazy"
                                            onError={(e) => {
                                                const target = e.currentTarget;
                                                if (!target.src.startsWith('data:')) {
                                                    target.src = FALLBACK_IMAGE;
                                                }
                                            }}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Lightbox: rendered in portal for correct stacking/focus; focus trap + Escape + return focus */}
                    {lightboxPhoto &&
                        typeof document !== 'undefined' &&
                        createPortal(
                            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- modal backdrop click-to-dismiss; dialog also has Escape + focus-trap + explicit Close button
                            <div
                                ref={lightboxOverlayRef}
                                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                                role="dialog"
                                aria-modal="true"
                                aria-label={lightboxPhoto.alt || 'Review photo'}
                                onClick={closeLightbox}>
                                <button
                                    type="button"
                                    onClick={closeLightbox}
                                    className="absolute right-4 top-4 rounded-full p-1 text-primary-foreground hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                    aria-label="Close">
                                    <X className="size-6" />
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => e.stopPropagation()}
                                    className="max-h-[90vh] max-w-[90vw] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                    tabIndex={0}>
                                    {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- img stopPropagation on backdrop click; keyboard navigation via outer Close button + Escape */}
                                    <img
                                        src={lightboxPhoto.src}
                                        alt={lightboxPhoto.alt}
                                        className="max-h-[90vh] max-w-full object-contain"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </button>
                            </div>,
                            document.body
                        )}

                    <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                        <button
                            type="button"
                            onClick={() => setHelpfulCount((c) => c + 1)}
                            className="inline-flex cursor-pointer items-center gap-1 hover:text-info"
                            data-testid="review-helpful">
                            <ThumbsUp className="size-4" aria-hidden />
                            {helpfulCount > 0 ? t('card.helpful', { count: helpfulCount }) : t('card.helpfulNoCount')}
                        </button>
                        {review.reportLabel && (
                            <button
                                type="button"
                                className="cursor-pointer hover:text-info hover:underline"
                                data-testid="review-report">
                                {review.reportLabel}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}
