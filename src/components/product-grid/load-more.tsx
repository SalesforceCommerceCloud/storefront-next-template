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
import { type JSX, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/spinner';
import { cn } from '@/lib/utils';

/**
 * Props for {@link LoadMore}.
 *
 * @property loadedCount - Number of products currently shown.
 * @property total - Total number of products matching the current search.
 * @property hasMore - Whether more products remain to load (and the DOM cap has not been hit).
 * @property capReached - Whether the DOM cap was hit while products still remain — shows a
 *   "refine your filters" prompt instead of the button.
 * @property isLoading - Whether a "load more" request is in flight.
 * @property hasError - Whether the last "load more" request failed.
 * @property onLoadMore - Called when the shopper clicks the button (or retries after an error).
 * @property sentinelRef - Ref for the infinite-scroll sentinel; when it scrolls into view the next
 *   batch auto-loads. Rendered only while more products remain.
 * @property className - Optional extra classes for the wrapper.
 */
export interface LoadMoreProps {
    loadedCount: number;
    total: number;
    hasMore: boolean;
    capReached?: boolean;
    isLoading: boolean;
    hasError?: boolean;
    onLoadMore: () => void;
    sentinelRef?: (node: Element | null) => void;
    className?: string;
}

/**
 * "Load more" control for the product listing page — the infinite-scroll and manual-append
 * counterpart to numbered pagination.
 *
 * Shows a progress line ("Showing X of Y"), an optional error/retry message, and a button that
 * requests the next batch. An invisible sentinel below the button auto-loads the next batch as the
 * shopper scrolls near it; the button remains as an explicit, keyboard-accessible trigger and as the
 * fallback when JavaScript-driven scroll observation is unavailable.
 *
 * Terminal states, in priority order:
 * - **Cap reached** (`capReached`): the DOM cap was hit with products still remaining — the button is
 *   replaced with a prompt to refine filters (prevents DOM bloat on low-end devices).
 * - **End of catalog** (`!hasMore && !isLoading && !capReached`): every product is loaded — shows a
 *   short end message. On mobile the button is full-width with a large (min 48px) tap target.
 */
export default function LoadMore({
    loadedCount,
    total,
    hasMore,
    capReached = false,
    isLoading,
    hasError = false,
    onLoadMore,
    sentinelRef,
    className,
}: LoadMoreProps): JSX.Element | null {
    const { t } = useTranslation('category');
    const statusId = useId();

    if (total <= 0) {
        return null;
    }

    const isEndOfCatalog = !hasMore && !isLoading && !capReached;

    return (
        <div data-slot="load-more" className={cn('flex flex-col items-center gap-4', className)}>
            <p data-slot="load-more-status" id={statusId} className="text-sm text-muted-foreground" aria-live="polite">
                {t('loadMore.status', {
                    loaded: loadedCount,
                    total,
                    defaultValue: 'Showing {{loaded}} of {{total}}',
                })}
            </p>

            {hasError && (
                <p data-slot="load-more-error" role="alert" className="text-sm text-destructive">
                    {t('loadMore.error', { defaultValue: 'Something went wrong. Please try again.' })}
                </p>
            )}

            {capReached ? (
                <p data-slot="load-more-cap" className="max-w-md text-center text-sm text-muted-foreground">
                    {t('loadMore.capReached', {
                        loaded: loadedCount,
                        defaultValue:
                            "You've viewed {{loaded}} products. Refine your filters to narrow down the results.",
                    })}
                </p>
            ) : isEndOfCatalog ? (
                <p data-slot="load-more-end" className="text-sm text-muted-foreground">
                    {t('loadMore.end', { defaultValue: "You've reached the end of the results" })}
                </p>
            ) : (
                <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    // Full-width with a large (48px) tap target on mobile; a centered fixed-width button on
                    // larger viewports. `h-12` clears the WCAG 2.1 AA 44px minimum target height on touch.
                    className="h-12 w-full min-w-56 sm:h-11 sm:w-auto"
                    onClick={onLoadMore}
                    disabled={isLoading}
                    aria-describedby={statusId}
                    data-slot="load-more-button">
                    {isLoading && <Spinner size="sm" aria-hidden="true" />}
                    {isLoading
                        ? t('loadMore.loading', { defaultValue: 'Loading…' })
                        : hasError
                          ? t('loadMore.retry', { defaultValue: 'Try again' })
                          : t('loadMore.button', { defaultValue: 'Load more' })}
                </Button>
            )}

            {/* Infinite-scroll sentinel: auto-loads the next batch when it nears the viewport. */}
            {hasMore && sentinelRef && <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />}
        </div>
    );
}
