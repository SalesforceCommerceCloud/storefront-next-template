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
/* oxlint-disable react-refresh/only-export-components -- provider and hook are co-located by design */
import { createContext, useCallback, type PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { useProduct } from '@/providers/product-context';
import type { ReviewItem, ReviewsData, ReviewsSummaryData } from '@/extensions/ratings-reviews/lib/api/reviews.server';
import type { ReviewsSummaryResult } from '@/extensions/ratings-reviews/routes/resource.reviews-summary';

export type ExpandReviewsFn = (() => void) | null;

/** Callback run after the reviews accordion has finished expanding (e.g. for scroll-into-view). */
export type OnExpandedCallback = (() => void) | null;

export interface ProductReviewsContextValue {
    productId: string;
    reviewsSummary: ReviewsSummaryData | null;
    reviewsSummaryLoading: boolean;
    reviews: ReviewItem[];
    reviewsLoading: boolean;
    /** Resolves the deferred reviews list Promise from the loader (PDP). No-op when there's no Promise. */
    loadReviewsIfNeeded: () => void;
    aiSummary: string;
    /** Optimistically prepend a newly-submitted review and notify subscribers. */
    addReviewOptimistic: (review: ReviewItem) => void;
    /** Remove an optimistically-added review on server failure (rollback). */
    removeReviewOptimistic: (reviewId: string) => void;
    /** Expand the customer reviews accordion (e.g. from PDP rating summary). No-op if not registered. */
    expandReviews: () => void;
    /** Register/unregister the expand function. Called by CustomerReviewsSection. */
    registerExpand: (fn: ExpandReviewsFn) => void;
    /** Register a callback to run after the accordion open animation completes. */
    registerOnExpanded: (cb: OnExpandedCallback) => void;
    /** Invoke and clear the registered onExpanded callback. */
    triggerOnExpanded: () => void;
}

const ProductReviewsContext = createContext<ProductReviewsContextValue | null>(null);

function revokeBlobUrlsInReviews(reviews: ReviewItem[]): void {
    for (const r of reviews) {
        if (r.photos) {
            for (const p of r.photos) {
                if (typeof p.url === 'string' && p.url.startsWith('blob:')) {
                    URL.revokeObjectURL(p.url);
                }
            }
        }
    }
}

export interface ProductReviewsProviderProps extends PropsWithChildren {
    /**
     * Initial summary data, seeded from the route loader (PDP / order detail).
     * When omitted, the provider fetches the summary lazily via the
     * `resource.reviews-summary` route (used by the cart-item modal).
     */
    summary?: ReviewsSummaryData | null;
    /**
     * Deferred Promise that resolves to the full reviews list. Created by the
     * route loader and consumed when the user expands the reviews accordion.
     */
    reviewsListPromise?: Promise<ReviewsData> | null;
}

/**
 * Provides reviews state to the customer reviews section, the rating summary,
 * and the write-review button. Two seeding modes:
 *
 * - **Loader-seeded** (PDP / order detail): `summary` is passed in directly.
 *   `reviewsListPromise` is awaited lazily when the accordion expands.
 * - **Fetcher-seeded** (cart-item modal, where SSR can't reach): `summary` is
 *   omitted and the provider fetches via `resource.reviews-summary` on mount.
 */
export function ProductReviewsProvider({
    summary = null,
    reviewsListPromise = null,
    children,
}: ProductReviewsProviderProps) {
    const product = useProduct();
    const productId = product?.id;

    const [reviewsSummary, setReviewsSummary] = useState<ReviewsSummaryData | null>(summary);
    const [reviews, setReviews] = useState<ReviewItem[]>([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [aiSummary, setAiSummary] = useState<string>(summary?.aiSummary ?? '');
    const reviewsListFetchedRef = useRef(false);
    const expandRef = useRef<ExpandReviewsFn>(null);
    const onExpandedRef = useRef<OnExpandedCallback>(null);
    const productIdRef = useRef(productId);
    const reviewsRef = useRef<ReviewItem[]>([]);
    productIdRef.current = productId;
    reviewsRef.current = reviews;

    const summaryFetcher = useFetcher<ReviewsSummaryResult>();
    const summaryFetcherLoad = summaryFetcher.load;

    // Fetcher-seeded mode: no summary supplied, fetch on mount via resource route.
    useEffect(() => {
        if (summary != null) return;
        if (productId == null) return;
        const params = new URLSearchParams({ productId });
        void summaryFetcherLoad(`/resource/reviews-summary?${params.toString()}`);
    }, [summary, productId, summaryFetcherLoad]);

    useEffect(() => {
        if (summary != null) return;
        if (summaryFetcher.data?.success && summaryFetcher.data.summary) {
            setReviewsSummary(summaryFetcher.data.summary);
            setAiSummary(summaryFetcher.data.summary.aiSummary ?? '');
        }
    }, [summary, summaryFetcher.data]);

    // Re-seed when the loader passes a new summary (e.g., navigation between products).
    useEffect(() => {
        if (summary == null) return;
        setReviewsSummary(summary);
        setAiSummary(summary.aiSummary ?? '');
        reviewsListFetchedRef.current = false;
        revokeBlobUrlsInReviews(reviewsRef.current);
        setReviews([]);
    }, [summary]);

    useEffect(() => {
        return () => revokeBlobUrlsInReviews(reviewsRef.current);
    }, []);

    const loadReviewsIfNeeded = useCallback(() => {
        if (reviewsListFetchedRef.current) return;
        if (!reviewsListPromise) return;
        reviewsListFetchedRef.current = true;
        const requestProductId = productId;
        setReviewsLoading(true);
        reviewsListPromise
            .then((data) => {
                if (requestProductId !== productIdRef.current) return;
                setReviews(data.reviews ?? []);
                if (data.aiSummary != null) setAiSummary(data.aiSummary);
            })
            .catch(() => {
                if (requestProductId === productIdRef.current) setReviews([]);
            })
            .finally(() => {
                if (requestProductId === productIdRef.current) setReviewsLoading(false);
            });
    }, [reviewsListPromise, productId]);

    const addReviewOptimistic = useCallback((review: ReviewItem) => {
        setReviews((prev) => [review, ...prev]);
    }, []);

    const removeReviewOptimistic = useCallback((reviewId: string) => {
        setReviews((prev) => {
            const removed = prev.filter((r) => r.id === reviewId);
            revokeBlobUrlsInReviews(removed);
            return prev.filter((r) => r.id !== reviewId);
        });
    }, []);

    const registerExpand = useCallback((fn: ExpandReviewsFn) => {
        expandRef.current = fn;
    }, []);

    const expandReviews = useCallback(() => {
        expandRef.current?.();
    }, []);

    const registerOnExpanded = useCallback((cb: OnExpandedCallback) => {
        onExpandedRef.current = cb;
    }, []);

    const triggerOnExpanded = useCallback(() => {
        const fn = onExpandedRef.current;
        onExpandedRef.current = null;
        fn?.();
    }, []);

    const reviewsSummaryLoading =
        summary == null && (summaryFetcher.state === 'loading' || summaryFetcher.state === 'submitting');

    const value: ProductReviewsContextValue = {
        productId: productId ?? '',
        reviewsSummary,
        reviewsSummaryLoading,
        reviews,
        reviewsLoading,
        loadReviewsIfNeeded,
        aiSummary,
        addReviewOptimistic,
        removeReviewOptimistic,
        expandReviews,
        registerExpand,
        registerOnExpanded,
        triggerOnExpanded,
    };

    return <ProductReviewsContext.Provider value={value}>{children}</ProductReviewsContext.Provider>;
}

/**
 * Read product reviews state. Returns no-op defaults when used outside the
 * provider, so generic core components (e.g. the rating summary) can render
 * harmlessly when the extension is not installed.
 */
export function useProductReviews(): ProductReviewsContextValue {
    const ctx = useContext(ProductReviewsContext);
    if (ctx == null) {
        return {
            productId: '',
            reviewsSummary: null,
            reviewsSummaryLoading: false,
            reviews: [],
            reviewsLoading: false,
            loadReviewsIfNeeded: () => {
                /* no-op when outside ProductReviewsProvider */
            },
            aiSummary: '',
            addReviewOptimistic: () => {
                /* no-op when outside ProductReviewsProvider */
            },
            removeReviewOptimistic: () => {
                /* no-op when outside ProductReviewsProvider */
            },
            expandReviews: () => {
                /* no-op when outside ProductReviewsProvider */
            },
            registerExpand: () => {
                /* no-op when outside ProductReviewsProvider */
            },
            registerOnExpanded: () => {
                /* no-op when outside ProductReviewsProvider */
            },
            triggerOnExpanded: () => {
                /* no-op when outside ProductReviewsProvider */
            },
        };
    }
    return ctx;
}
