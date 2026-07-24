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
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import type { ShopperSearch } from '@/scapi';
import type { CategoryProductsResult, loader as categoryProductsLoader } from '@/routes/resource.category-products';
import { resourceRoutes } from '@/route-paths';
import { PRODUCT_SEARCH_QUERY_PARAMS } from '@/lib/query-params';

type ProductSearchHit = ShopperSearch.schemas['ProductSearchHit'];

/**
 * Narrow the raw `fetcher.data` (which is `unknown`-ish once the resource route can return either a
 * JSON payload or a bare error Response) to our result shape, or `null` if it isn't one. A non-null
 * return means the last request succeeded.
 */
function asCategoryProductsResult(data: unknown): CategoryProductsResult | null {
    if (!data || typeof data !== 'object') {
        return null;
    }
    const candidate = data as Partial<CategoryProductsResult>;
    if (!Array.isArray(candidate.hits) || typeof candidate.offset !== 'number') {
        return null;
    }
    return candidate as CategoryProductsResult;
}

/** Viewport (max-)width below which the mobile batch size applies. Matches the Tailwind `md` breakpoint. */
const MOBILE_QUERY = '(max-width: 767px)';

/**
 * @property refine - The active search refinements (`cgid=...`, plus any facet refinements).
 * @property sort - The active sorting option id, if any.
 * @property currency - Currency to price the additional hits in.
 * @property initialCount - How many products the route loader already rendered (the first page). The
 *   first "load more" batch starts at this offset.
 * @property total - Total number of products matching the current search.
 * @property batchSize - Products to request per batch on desktop/tablet viewports.
 * @property mobileBatchSize - Products to request per batch on mobile viewports (smaller for perf).
 * @property maxProducts - DOM cap: once this many products are loaded, `capReached` is set and no
 *   further batches load (the UI prompts the shopper to refine filters instead).
 * @property identity - A stable string that changes whenever the underlying query changes (category,
 *   sort, refinements, locale, currency). When it changes, accumulated batches are discarded so the
 *   shopper starts from the fresh first page again.
 */
export interface UseLoadMoreProductsOptions {
    refine: string[];
    sort?: string;
    currency?: string;
    initialCount: number;
    total: number;
    batchSize: number;
    mobileBatchSize: number;
    maxProducts: number;
    identity: string;
    offset?: number;
}

/**
 * @property appended - Products loaded after the initial page, to render below the initial grid tiles.
 * @property loadedCount - How many products are currently rendered (initial page + appended).
 * @property total - Total number of products matching the current search.
 * @property hasMore - Whether more products remain to load AND the DOM cap has not been hit.
 * @property capReached - Whether the DOM cap (`maxProducts`) has been reached while products still remain.
 * @property isLoading - Whether a "load more" request is in flight.
 * @property hasError - Whether the most recent "load more" request failed.
 * @property firstNewIndex - Index within `appended` at which the most recent batch begins, or `null`.
 *   Consumers use it to move focus to the first newly appended tile after a load (accessibility).
 * @property loadMore - Request the next batch. No-op while loading, at the cap, or when nothing remains.
 * @property sentinelRef - Attach to an element below the grid to auto-load on scroll into view.
 */
export interface UseLoadMoreProductsResult {
    appended: ProductSearchHit[];
    loadedCount: number;
    total: number;
    hasMore: boolean;
    capReached: boolean;
    isLoading: boolean;
    isRestoring: boolean;
    restorationTarget: number;
    hasError: boolean;
    firstNewIndex: number | null;
    loadMore: () => void;
    sentinelRef: (node: Element | null) => void;
}

/**
 * Client-side accumulation for the product listing "Load more" / infinite-scroll control.
 *
 * The first batch of products is server-rendered by the route loader (critical + non-critical). This
 * hook appends further batches by calling the `/resource/category-products` endpoint with `useFetcher`
 * — a non-navigating fetch, so tiles are appended in place rather than the whole route re-rendering.
 * Accumulated batches are keyed to the query `identity`; when the shopper changes sort or refinements
 * (which changes the URL and re-runs the loader), the accumulated list resets to the new first page.
 */
export function useLoadMoreProducts({
    refine,
    sort,
    currency,
    initialCount,
    total,
    batchSize,
    mobileBatchSize,
    maxProducts,
    identity,
    offset = 0,
}: UseLoadMoreProductsOptions): UseLoadMoreProductsResult {
    const fetcher = useFetcher<typeof categoryProductsLoader>();

    // Batches appended after the initial (server-rendered) page.
    const [appended, setAppended] = useState<ProductSearchHit[]>([]);
    // Next offset to request. Starts just past the initial (server-rendered) page.
    const nextOffsetRef = useRef<number>(offset + initialCount);
    // Index within `appended` where the most recent batch starts — used to focus the first new tile.
    const [firstNewIndex, setFirstNewIndex] = useState<number | null>(null);

    // Resolve the effective batch size for the viewport. Desktop on the server / first render;
    // re-resolves after mount and on resize so a rotate/resize picks up the right size.
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const mql = globalThis.matchMedia?.(MOBILE_QUERY);
        if (!mql) {
            return;
        }
        const sync = () => setIsMobile(mql.matches);
        sync();
        mql.addEventListener('change', sync);
        return () => mql.removeEventListener('change', sync);
    }, []);
    const effectiveBatchSize = isMobile ? mobileBatchSize : batchSize;

    // Reset accumulation whenever the underlying query changes, and scroll back to the top so the
    // shopper starts the new result set from its first product (filter/sort reset behavior).
    const isFirstRenderRef = useRef(true);
    const prevIdentityRef = useRef(identity);
    useEffect(() => {
        const identityChanged = prevIdentityRef.current !== identity;
        prevIdentityRef.current = identity;

        nextOffsetRef.current = offset + initialCount;
        setAppended([]);
        setFirstNewIndex(null);

        // Don't scroll on the initial mount — only when the query actually changes after first paint.
        // Also don't scroll when initialCount changes but identity hasn't (back-nav restoration).
        if (isFirstRenderRef.current) {
            isFirstRenderRef.current = false;
            return;
        }
        if (!identityChanged) {
            return;
        }
        globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
    }, [identity, initialCount, offset]);

    // Merge each settled batch into the accumulated list, de-duplicating by product id so a
    // shifted offset window (e.g. after a background revalidation) never renders a tile twice.
    const result = asCategoryProductsResult(fetcher.data);
    const lastMergedRef = useRef<unknown>(null);
    useEffect(() => {
        if (!result || fetcher.data === lastMergedRef.current) {
            return;
        }
        lastMergedRef.current = fetcher.data;
        const batch = result.hits;
        if (batch.length === 0) {
            return;
        }
        nextOffsetRef.current = result.offset + batch.length;
        setAppended((prev) => {
            const seen = new Set<string | undefined>(prev.map((h) => h.productId));
            const fresh = batch.filter((h) => !seen.has(h.productId));
            if (!fresh.length) {
                return prev;
            }
            setFirstNewIndex(prev.length);
            return [...prev, ...fresh];
        });
    }, [fetcher.data, result]);

    // Back-nav catch-up: read the prior loaded count from sessionStorage (keyed by React Router's
    // history key) synchronously so the skeleton grid renders on the very first frame — before
    // ScrollRestoration fires. useState's lazy initializer runs only once on the client.
    const STORAGE_KEY = 'sfnext:loadMore';
    const [restorationTargetInitial] = useState(() => {
        if (typeof window === 'undefined') return 0;
        try {
            const historyKey = (window.history.state as { key?: string } | null)?.key;
            if (!historyKey) return 0;
            const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
            const saved = stored[historyKey] ?? 0;
            return saved > initialCount ? saved : 0;
        } catch {
            return 0;
        }
    });
    const restorationTargetRef = useRef<number>(restorationTargetInitial);

    const loadedCount = initialCount + appended.length;
    // DOM cap: stop offering more once `maxProducts` are loaded, even if the catalog has more.
    const capReached = loadedCount >= maxProducts && loadedCount < total;
    const hasMore = loadedCount < total && !capReached;
    const isLoading = fetcher.state === 'loading';
    // A settled fetch whose payload is not our JSON result object (the resource route returned a
    // non-2xx Response, which useFetcher surfaces as the raw body) means the last request failed.
    const hasError = fetcher.state === 'idle' && fetcher.data !== undefined && result === null;

    const loadMore = useCallback(() => {
        if (isLoading || !hasMore) {
            return;
        }
        // Never request past the DOM cap: shrink the final batch so we land exactly on maxProducts.
        const remainingToCap = Math.max(0, maxProducts - nextOffsetRef.current);
        const requestLimit = Math.min(effectiveBatchSize, remainingToCap);
        if (requestLimit <= 0) {
            return;
        }
        const params = new URLSearchParams();
        params.set(PRODUCT_SEARCH_QUERY_PARAMS.OFFSET, String(nextOffsetRef.current));
        params.set(PRODUCT_SEARCH_QUERY_PARAMS.LIMIT, String(requestLimit));
        if (sort) {
            params.set(PRODUCT_SEARCH_QUERY_PARAMS.SORT, sort);
        }
        if (currency) {
            params.set(PRODUCT_SEARCH_QUERY_PARAMS.CURRENCY, currency);
        }
        for (const r of refine) {
            params.append(PRODUCT_SEARCH_QUERY_PARAMS.REFINE, r);
        }
        void fetcher.load(`${resourceRoutes.categoryProducts}?${params.toString()}`);
    }, [isLoading, hasMore, effectiveBatchSize, maxProducts, sort, currency, refine]); // eslint-disable-line react-hooks/exhaustive-deps -- fetcher.load is stable per React Router

    // Back-nav catch-up: keep fetching until we've restored the prior depth.
    useEffect(() => {
        if (restorationTargetRef.current > 0 && loadedCount < restorationTargetRef.current && !isLoading && hasMore) {
            loadMore();
        }
        if (loadedCount >= restorationTargetRef.current || (!hasMore && !isLoading)) {
            restorationTargetRef.current = 0;
        }
    }, [loadedCount, isLoading, hasMore, loadMore]);

    // Infinite scroll: auto-trigger loadMore when a sentinel below the grid scrolls into view.
    // Guard against spurious triggers: the observer stays dormant until the user actively scrolls
    // after the grid is ready. This prevents auto-loading on back-nav when the sentinel is in the
    // viewport because the user was near the bottom before navigating away.
    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef(loadMore);
    loadMoreRef.current = loadMore;
    const observerReadyRef = useRef(false);
    const wasRestoredRef = useRef(restorationTargetInitial > 0);

    const sentinelRef = useCallback((node: Element | null) => {
        observerRef.current?.disconnect();
        observerReadyRef.current = false;

        if (!node || typeof IntersectionObserver === 'undefined') {
            return;
        }

        observerRef.current = new IntersectionObserver(
            (entries) => {
                if (!observerReadyRef.current) {
                    return;
                }
                if (entries.some((entry) => entry.isIntersecting)) {
                    loadMoreRef.current();
                }
            },
            // 200px balances early prefetch (user doesn't see a loading gap) vs not over-fetching
            // when the user stops scrolling. Lower than 600px (original) to avoid firing while the
            // previous batch is still rendering on slower devices.
            { rootMargin: '200px 0px' }
        );
        observerRef.current.observe(node);
    }, []);

    // Activate the observer only after the user scrolls — prevents immediate trigger when the
    // sentinel is already in the viewport after back-nav restoration or initial hydration.
    useEffect(() => {
        if (typeof window === 'undefined') return;

        // If this was a restored session, wait for restoration to complete before arming.
        if (wasRestoredRef.current && restorationTargetRef.current > 0) {
            return;
        }

        const arm = () => {
            observerReadyRef.current = true;
            window.removeEventListener('scroll', arm);
        };
        window.addEventListener('scroll', arm, { passive: true, once: true });
        return () => window.removeEventListener('scroll', arm);
    }, [restorationTargetInitial]);

    // Once restoration finishes, re-arm: wait for the next scroll event before enabling observer.
    useEffect(() => {
        if (wasRestoredRef.current && restorationTargetRef.current === 0) {
            wasRestoredRef.current = false;
            observerReadyRef.current = false;
            const arm = () => {
                observerReadyRef.current = true;
            };
            window.addEventListener('scroll', arm, { passive: true, once: true });
            return () => window.removeEventListener('scroll', arm);
        }
    }, [loadedCount]); // fires when catch-up finishes and restorationTargetRef resets to 0

    useEffect(() => () => observerRef.current?.disconnect(), []);

    const isRestoring = restorationTargetRef.current > 0 && loadedCount < restorationTargetRef.current;

    return {
        appended,
        loadedCount,
        total,
        hasMore,
        capReached,
        isLoading,
        isRestoring,
        restorationTarget: restorationTargetRef.current,
        hasError,
        firstNewIndex,
        loadMore,
        sentinelRef,
    };
}
