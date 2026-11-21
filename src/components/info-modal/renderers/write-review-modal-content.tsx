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
import { type ReactElement, useState, useCallback, useRef, useEffect } from 'react';
import { useAuthFetcher as useFetcher } from '@/hooks/use-auth-fetcher';
import { resourceRoutes } from '@/route-paths';
import { useTranslation } from 'react-i18next';
import { StarRating } from '@/components/product-ratings/star-rating';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Typography } from '@/components/typography';
import { filterAcceptedFiles, getFileUploadConfig } from '@/lib/file-upload-utils';
import { cn } from '@/lib/utils';
import type { ReviewItem, WriteReviewFormData } from '@/extensions/ratings-reviews/lib/api/reviews.server';
import type { AddReviewResponse } from '@/extensions/ratings-reviews/routes/action.add-review';
import { useProductReviews } from '@/extensions/ratings-reviews/providers/product-reviews-context';

/** Inline field error — plain text, no border or padding. */
function FieldError({ id, message }: { id?: string; message: string }): ReactElement {
    return (
        <p id={id} className="mt-1 text-sm text-status-critical-strong">
            {message}
        </p>
    );
}

export function WriteReviewModalContent({
    onClose,
    formConfig,
    onAfterSubmit,
}: {
    onClose?: () => void;
    formConfig?: WriteReviewFormData;
    /** Invoked after a successful submit, after `addReview` (e.g. order line UI). PDP omits. */
    onAfterSubmit?: (review: ReviewItem) => void;
}): ReactElement | null {
    const [selectedRating, setSelectedRating] = useState(0);
    const [hoverRating, setHoverRating] = useState<number | null>(null);
    const [reviewTitle, setReviewTitle] = useState('');
    const [reviewBody, setReviewBody] = useState('');
    const [recommend, setRecommend] = useState<boolean | null>(null);
    const [location, setLocation] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isUploadZoneHovered, setIsUploadZoneHovered] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [showRatingValidation, setShowRatingValidation] = useState(false);
    const [showReviewValidation, setShowReviewValidation] = useState(false);
    const [showTitleValidation, setShowTitleValidation] = useState(false);

    const formRef = useRef<HTMLFormElement>(null);
    const ratingSectionRef = useRef<HTMLDivElement>(null);
    const ratingGroupRef = useRef<HTMLFieldSetElement>(null);
    const reviewBodyRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { t } = useTranslation('writeReview');
    const { t: tProduct } = useTranslation('product');
    const { addReviewOptimistic, removeReviewOptimistic, productId } = useProductReviews();
    const fetcher = useFetcher<AddReviewResponse>();
    const pendingReviewIdRef = useRef<string | null>(null);
    const isSubmitting = fetcher.state !== 'idle';

    // Watch fetcher completion — close on success, rollback on failure.
    useEffect(() => {
        if (fetcher.state !== 'idle' || !fetcher.data) return;
        if (pendingReviewIdRef.current) {
            removeReviewOptimistic(pendingReviewIdRef.current);
            pendingReviewIdRef.current = null;
        }
        if (fetcher.data.success) {
            addReviewOptimistic(fetcher.data.review);
            onAfterSubmit?.(fetcher.data.review);
            onClose?.();
        }
    }, [fetcher.state, fetcher.data, onAfterSubmit, onClose, removeReviewOptimistic, addReviewOptimistic]);

    const minReviewLength = formConfig?.reviewBody?.minCharacters ?? 50;
    const maxReviewLength = formConfig?.reviewBody?.maxCharacters;
    const maxTitleLength = formConfig?.reviewTitle?.maxCharacters;
    const displayRating = hoverRating ?? selectedRating;

    const handleStarClick = useCallback((value: number) => {
        setSelectedRating(value);
        setShowRatingValidation(false);
    }, []);

    const reviewTitleTrimmed = reviewTitle.trim();
    const reviewBodyTrimmed = reviewBody.trim();
    const reviewBodyInvalid =
        reviewBody.length > 0 &&
        (reviewBodyTrimmed.length < minReviewLength ||
            (typeof maxReviewLength === 'number' && reviewBodyTrimmed.length > maxReviewLength));
    const reviewTitleInvalid = typeof maxTitleLength === 'number' && reviewTitleTrimmed.length > maxTitleLength;

    const handleFormSubmit = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const form = formRef.current;
            if (!form) return;

            // Validate all fields at once
            const hasRatingError = selectedRating <= 0;
            const hasTitleError = typeof maxTitleLength === 'number' && reviewTitleTrimmed.length > maxTitleLength;
            const hasReviewError =
                reviewBodyTrimmed.length < minReviewLength ||
                (typeof maxReviewLength === 'number' && reviewBodyTrimmed.length > maxReviewLength);

            setShowRatingValidation(hasRatingError);
            setShowTitleValidation(hasTitleError);
            setShowReviewValidation(hasReviewError);

            if (hasRatingError || hasTitleError || hasReviewError) {
                if (typeof ratingSectionRef.current?.scrollIntoView === 'function') {
                    ratingSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                return;
            }

            // Optimistic local update — immediate UI feedback while action persists.
            const reviewId = `new-${Date.now()}`;
            const newReview: ReviewItem = {
                id: reviewId,
                authorName: 'You',
                verifiedPurchase: false,
                date: new Date().toISOString().split('T')[0],
                location: location.trim() || undefined,
                rating: selectedRating,
                headline: reviewTitleTrimmed,
                body: reviewBodyTrimmed,
                photos:
                    selectedFiles.length > 0
                        ? selectedFiles.map((f) => ({ url: URL.createObjectURL(f), alt: f.name }))
                        : undefined,
                helpfulCount: 0,
                reportLabel: tProduct('report'),
            };
            addReviewOptimistic(newReview);
            pendingReviewIdRef.current = reviewId;

            // Submit to action route — onAfterSubmit and onClose fire in the
            // useEffect above once the fetcher returns idle with data.
            const formData = new FormData();
            formData.append('productId', productId);
            formData.append('rating', String(selectedRating));
            formData.append('headline', reviewTitleTrimmed);
            formData.append('body', reviewBodyTrimmed);
            if (location.trim()) formData.append('location', location.trim());
            if (recommend !== null) formData.append('recommend', String(recommend));
            void fetcher.submit(formData, { method: 'POST', action: resourceRoutes.addReview });
        },
        [
            addReviewOptimistic,
            location,
            reviewBodyTrimmed,
            reviewTitleTrimmed,
            selectedRating,
            selectedFiles,
            recommend,
            minReviewLength,
            maxReviewLength,
            maxTitleLength,
            tProduct,
            productId,
            fetcher,
        ]
    );

    const handleCancel = useCallback(() => {
        onClose?.();
    }, [onClose]);

    const handleReviewTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setReviewTitle(e.target.value);
        setShowTitleValidation(false);
    }, []);

    const handleReviewBodyChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setReviewBody(e.target.value);
        setShowReviewValidation(false);
        e.target.setCustomValidity('');
    }, []);

    const fileUploadConfig = getFileUploadConfig(formConfig?.addPhotos);

    const processFiles = useCallback(
        (fileList: FileList | null) => {
            const accepted = filterAcceptedFiles(fileList, {
                allowedTypes: fileUploadConfig.allowedTypes,
                maxBytes: fileUploadConfig.maxBytes,
            });
            if (accepted.length > 0) {
                setSelectedFiles((prev) => [...prev, ...accepted]);
            }
        },
        [fileUploadConfig.allowedTypes, fileUploadConfig.maxBytes]
    );

    const handleFileInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            processFiles(e.target.files);
            e.target.value = '';
        },
        [processFiles]
    );

    const handleUploadZoneClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleUploadZoneKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            processFiles(e.dataTransfer.files);
        },
        [processFiles]
    );

    const removeFile = useCallback((index: number) => {
        setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const reviewValidationMessage = !showReviewValidation
        ? null
        : reviewBodyTrimmed.length < minReviewLength
          ? t('validation.reviewMinLength', { count: minReviewLength })
          : typeof maxReviewLength === 'number' && reviewBodyTrimmed.length > maxReviewLength
            ? t('validation.reviewMaxLength', { count: maxReviewLength })
            : null;

    const validationErrors: string[] = [];
    if (showRatingValidation) validationErrors.push(t('validation.ratingRequired'));
    if (showTitleValidation && maxTitleLength != null)
        validationErrors.push(t('validation.titleMaxLength', { count: maxTitleLength }));
    if (showReviewValidation && reviewValidationMessage) validationErrors.push(reviewValidationMessage);

    if (!formConfig) return null;

    return (
        <form ref={formRef} onSubmit={handleFormSubmit} noValidate>
            <div className="space-y-6 p-6">
                {/* Error summary */}
                {validationErrors.length > 0 && (
                    <div
                        role="alert"
                        className="rounded-ui border border-status-critical-border bg-status-critical-bg p-4">
                        <p className="text-sm font-medium text-status-critical-foreground">
                            {t('validation.pleaseFixFollowing')}
                        </p>
                        <ul className="mt-2 list-disc pl-5 text-sm text-status-critical-foreground">
                            {validationErrors.map((msg) => (
                                <li key={msg}>{msg}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Overall Rating - accessible radiogroup */}
                <div ref={ratingSectionRef} className="space-y-2">
                    <Label className="text-foreground" id="rating-label">
                        {formConfig.overallRating.label} <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex items-center gap-2">
                        <fieldset
                            ref={ratingGroupRef}
                            role="radiogroup"
                            aria-labelledby="rating-label"
                            aria-required
                            aria-invalid={showRatingValidation}
                            aria-describedby={showRatingValidation ? 'rating-validation-message' : undefined}
                            className="border-0 p-0 m-0 min-w-0"
                            onKeyDown={(e) => {
                                const currentValue = selectedRating || 1;
                                if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    handleStarClick(Math.max(1, currentValue - 1));
                                } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    handleStarClick(Math.min(5, currentValue + 1));
                                }
                            }}>
                            <div className="relative flex items-center">
                                <StarRating
                                    rating={displayRating}
                                    reviewCount={0}
                                    showRatingLabel={false}
                                    starSize="lg"
                                    className="pointer-events-none"
                                />
                                <div className="absolute top-0 left-0 z-10 flex items-center gap-0.5">
                                    {[1, 2, 3, 4, 5].map((value) => (
                                        <button
                                            key={value}
                                            type="button"
                                            role="radio"
                                            aria-checked={selectedRating === value}
                                            aria-label={`${value} out of 5 stars`}
                                            tabIndex={
                                                selectedRating === value || (selectedRating === 0 && value === 1)
                                                    ? 0
                                                    : -1
                                            }
                                            className="h-6 w-6 shrink-0 cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            onMouseEnter={() => setHoverRating(value)}
                                            onMouseLeave={() => setHoverRating(null)}
                                            onClick={() => handleStarClick(value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    handleStarClick(value);
                                                }
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </fieldset>
                        {selectedRating > 0 ? (
                            <Typography variant="muted" as="span" className="text-sm">
                                {selectedRating} out of 5 stars
                            </Typography>
                        ) : null}
                    </div>
                    {showRatingValidation && (
                        <FieldError id="rating-validation-message" message={t('validation.ratingRequired')} />
                    )}
                </div>

                {/* Review Title */}
                <div className="space-y-2">
                    <Label htmlFor="write-review-title" className="text-foreground">
                        {formConfig.reviewTitle.label}
                    </Label>
                    <Input
                        id="write-review-title"
                        type="text"
                        placeholder={formConfig.reviewTitle.placeholder}
                        value={reviewTitle}
                        onChange={handleReviewTitleChange}
                        maxLength={formConfig.reviewTitle.maxCharacters}
                        aria-invalid={reviewTitleInvalid || showTitleValidation}
                        aria-describedby={showTitleValidation ? 'title-validation-message' : undefined}
                        className={cn(
                            'w-full',
                            (reviewTitleInvalid || showTitleValidation) && 'border-status-critical'
                        )}
                    />
                    {showTitleValidation && maxTitleLength != null && (
                        <FieldError
                            id="title-validation-message"
                            message={t('validation.titleMaxLength', { count: maxTitleLength })}
                        />
                    )}
                </div>

                {/* Your Review (mandatory) */}
                <div className="space-y-2">
                    <Label htmlFor="write-review-body" className="text-foreground">
                        {formConfig.reviewBody.label} <span className="text-destructive">*</span>
                    </Label>
                    <textarea
                        ref={reviewBodyRef}
                        id="write-review-body"
                        placeholder={formConfig.reviewBody.placeholder}
                        value={reviewBody}
                        onChange={handleReviewBodyChange}
                        rows={4}
                        maxLength={formConfig.reviewBody.maxCharacters}
                        aria-invalid={reviewBodyInvalid || showReviewValidation}
                        aria-describedby={showReviewValidation ? 'review-validation-message' : undefined}
                        className={cn(
                            'flex w-full border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                            (reviewBodyInvalid || showReviewValidation) && 'border-status-critical'
                        )}
                    />
                    <div className="mt-2 flex items-center justify-between text-[0.75rem] text-muted-foreground">
                        <span>{t('minCharactersHint', { count: minReviewLength })}</span>
                        <span aria-live="polite">
                            {reviewBody.length}/{typeof maxReviewLength === 'number' ? maxReviewLength : 2000}
                        </span>
                    </div>
                    {showReviewValidation && reviewValidationMessage && (
                        <FieldError id="review-validation-message" message={reviewValidationMessage} />
                    )}
                </div>

                {/* Would you recommend? */}
                <div className="space-y-2">
                    <Label className="text-foreground">{formConfig.recommend.label}</Label>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="recommend"
                                checked={recommend === true}
                                onChange={() => setRecommend(true)}
                                className="border-input text-primary focus:ring-ring"
                            />
                            <span className="text-sm">{formConfig.recommend.yesLabel}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="recommend"
                                checked={recommend === false}
                                onChange={() => setRecommend(false)}
                                className="border-input text-primary focus:ring-ring"
                            />
                            <span className="text-sm">{formConfig.recommend.noLabel}</span>
                        </label>
                    </div>
                </div>

                {/* Location (Optional) */}
                {formConfig.location && (
                    <div className="space-y-2">
                        <Label htmlFor="write-review-location" className="text-foreground">
                            {formConfig.location.label}
                        </Label>
                        <Input
                            id="write-review-location"
                            type="text"
                            placeholder={formConfig.location.placeholder}
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className="w-full"
                        />
                        <p className="text-[0.75rem] text-muted-foreground">{formConfig.location.hint}</p>
                    </div>
                )}

                {/* Add Photos (Optional) - click or drag and drop */}
                <div className="space-y-2">
                    <Label className="text-foreground">{formConfig.addPhotos.label}</Label>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={fileUploadConfig.acceptAttr}
                        multiple
                        className="sr-only"
                        aria-label={formConfig.addPhotos.label}
                        onChange={handleFileInputChange}
                    />
                    <div
                        role="button"
                        tabIndex={0}
                        onMouseEnter={() => setIsUploadZoneHovered(true)}
                        onMouseLeave={() => setIsUploadZoneHovered(false)}
                        onFocus={() => setIsUploadZoneHovered(true)}
                        onBlur={() => setIsUploadZoneHovered(false)}
                        onClick={handleUploadZoneClick}
                        onKeyDown={handleUploadZoneKeyDown}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={cn(
                            'mt-2 flex flex-col items-center justify-center gap-2 rounded-ui border-2 border-dashed p-8 transition-colors cursor-pointer',
                            isUploadZoneHovered || isDragging
                                ? 'border-primary bg-primary/5'
                                : 'border-muted-foreground/40'
                        )}>
                        <svg
                            className="h-10 w-10 text-muted-foreground"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden>
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                        </svg>
                        <Typography variant="muted" className="text-sm">
                            {formConfig.addPhotos.hint}
                        </Typography>
                        <Typography variant="muted" className="text-xs">
                            {formConfig.addPhotos.accept} up to {formConfig.addPhotos.maxSize}
                        </Typography>
                    </div>
                    {selectedFiles.length > 0 && (
                        <div className="mt-2 space-y-1">
                            <p className="text-xs text-muted-foreground">
                                {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                            </p>
                            <ul className="flex flex-wrap gap-2">
                                {selectedFiles.map((file) => (
                                    <li
                                        key={`${file.name}-${file.size}-${file.lastModified}`}
                                        className="flex items-center gap-2 rounded-ui border border-border bg-muted/30 px-2 py-1.5 text-sm">
                                        <span className="truncate max-w-[180px]" title={file.name}>
                                            {file.name}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeFile(selectedFiles.indexOf(file));
                                            }}
                                            className="shrink-0 rounded-ui p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                            aria-label={`Remove ${file.name}`}>
                                            ×
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <Typography variant="muted" className="text-xs">
                    {formConfig.termsText}
                </Typography>
            </div>

            <div className="mt-4 flex justify-end gap-3 p-6 pt-0">
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isSubmitting}
                    className="hover:bg-muted hover:text-foreground hover:border-border">
                    {formConfig.cancelLabel}
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                    {formConfig.submitLabel}
                </Button>
            </div>
        </form>
    );
}
