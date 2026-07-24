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
import { type ReactElement, type Ref, Suspense, useState } from 'react';
import { Await } from 'react-router';
import type { ShopperSearch } from '@/scapi';
import { useDeferredRender } from '@/hooks/use-deferred-render';
import ProductGrid from './grid';

type ProductSearchHit = ShopperSearch.schemas['ProductSearchHit'];

/**
 * Wraps ProductGrid with three-phase deferred rendering for non-critical products.
 *
 * Why: Mounting a Suspense boundary on initial render forces React to retain the entire fallback
 * tree in memory and blocks the main thread while it reconciles the pending subtree — even if the
 * user hasn't scrolled to that content yet. This hurts LCP and inflates TBT. By deferring the
 * Suspense mount until after an idle callback, the critical (above-the-fold) tiles paint without
 * contention, then the non-critical tiles stream in once the browser is idle.
 *
 * Additionally, extracting this wrapper from ProductGrid itself keeps error handling explicit and
 * consistent across all routes: the error fallback always preserves critical tiles, rather than
 * each route reimplementing its own Suspense/Await/error pattern.
 *
 * Phase 1 (Pre-Idle): Show critical tiles + lightweight skeletons without mounting the Suspense
 * boundary. This keeps the initial render minimal, reducing TBT and improving LCP.
 *
 * Phase 2 (Post-Idle, Pending): Idle callback fires, Suspense boundary mounts with skeleton fallback.
 *
 * Phase 3 (Resolved): Non-critical products rendered via ProductGrid.
 */
export default function DeferredProductGrid({
    critical,
    nonCritical,
    appended,
    firstNewIndex,
    firstNewItemRef,
    appendPending,
    nonCriticalCount = 0,
    hasRefinementsPanel,
    handleProductClick,
    topCategoryName,
    isLoading,
    errorElement,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    showPickupAvailable,
}: {
    critical?: ProductSearchHit[];
    nonCritical: Promise<ProductSearchHit[]>;
    /**
     * Products appended after the initial page via the "Load more" / infinite-scroll control. Rendered
     * inside the same grid container so critical, non-critical, and appended tiles flow as one grid.
     */
    appended?: ProductSearchHit[];
    /** Index within `appended` of the first tile of the most recent batch — receives `firstNewItemRef`. */
    firstNewIndex?: number | null;
    /** Ref attached to the first newly appended tile so focus can move to it after a "load more". */
    firstNewItemRef?: Ref<HTMLDivElement>;
    /** Whether a "load more" fetch is in flight — sets `aria-busy` on the grid for assistive tech. */
    appendPending?: boolean;
    nonCriticalCount?: number;
    hasRefinementsPanel?: boolean;
    handleProductClick?: (product: ProductSearchHit) => void;
    topCategoryName?: string;
    isLoading?: boolean;
    errorElement?: ReactElement;
    // @sfdc-extension-line SFDC_EXT_BOPIS
    showPickupAvailable?: boolean;
}): ReactElement {
    const shouldRenderNonCritical = useDeferredRender(nonCriticalCount > 0);

    // Pin the non-critical promise to its first reference for the lifetime of this component
    // instance. Without pinning, any non-navigating loader revalidation (e.g. a useFetcher.submit
    // from a tile-level mutation like wishlist-add) returns a fresh promise from the loader, which
    // <Await> treats as a new resolve and re-suspends — unmounting every tile (and any in-flight
    // fetcher whose owning component lives inside). Routes invalidate this pinned reference by
    // remounting via `key={productGridDataKey}` whenever URL identity changes (pagination, sort,
    // refine), which is the only time we actually want fresh non-critical data.
    const [pinnedNonCritical] = useState(() => nonCritical);

    const gridProps = {
        critical,
        appended,
        firstNewIndex,
        firstNewItemRef,
        appendPending,
        hasRefinementsPanel,
        handleProductClick,
        topCategoryName,
        isLoading,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        showPickupAvailable,
    };

    // Phase 1: Pre-idle — show critical tiles + skeleton placeholders.
    // (`appended` is empty here — the shopper can only load more once the initial page has resolved.)
    if (!shouldRenderNonCritical) {
        return <ProductGrid {...gridProps} skeletonCount={nonCriticalCount} />;
    }

    // Phase 2 & 3: Post-idle — mount Suspense + Await, resolve non-critical tiles.
    // When the promise rejects, render critical tiles alongside the errorElement so
    // above-the-fold products remain visible even when non-critical loading fails.
    const errorFallback = errorElement ? (
        <>
            <ProductGrid {...gridProps} />
            {errorElement}
        </>
    ) : undefined;

    return (
        <Suspense fallback={<ProductGrid {...gridProps} skeletonCount={nonCriticalCount} />}>
            <Await resolve={pinnedNonCritical} errorElement={errorFallback}>
                {(products: ProductSearchHit[]) => <ProductGrid {...gridProps} nonCritical={products} />}
            </Await>
        </Suspense>
    );
}
