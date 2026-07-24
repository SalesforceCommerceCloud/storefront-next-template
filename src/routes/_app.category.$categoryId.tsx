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
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useTransition } from 'react';
import { useAsyncError, useLocation, useNavigation, useRouteLoaderData } from 'react-router';
import type { loader as rootLoader } from '@/root';
import type { Route } from './+types/_app.category.$categoryId';
import type { ShopperProducts, ShopperSearch } from '@/scapi';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
import { fetchCategory } from '@/lib/api/categories.server';
import { fetchSearchProducts } from '@/lib/api/search.server';
import { getAllQueryParams, getQueryParam, PRODUCT_SEARCH_QUERY_PARAMS } from '@/lib/query-params';
import { getConfig, useConfig } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import CategoryBreadcrumbs from '@/components/category-breadcrumbs';
import CategoryPagination from '@/components/category-pagination';
import LoadMore from '@/components/product-grid/load-more';
import { useLoadMoreProducts } from '@/hooks/use-load-more-products';
import ActiveFilters from '@/components/category-refinements/active-filters';
import FiltersButton from '@/components/category-refinements/filters-button';
import CategoryRefinements from '@/components/category-refinements';
import CategorySorting from '@/components/category-sorting';
import DeferredProductGrid from '@/components/product-grid';
import { ProductTileSkeleton } from '@/components/category-skeleton';
import QuickFilters from '@/components/quick-filters';
import { useAnalytics } from '@/hooks/use-analytics';
import { PageType } from '@/lib/decorators/page-type';
import { RegionDefinition } from '@/lib/decorators/region-definition';
import { Region } from '@/components/region';
import { fetchPageWithComponentData } from '@/lib/page-designer/page-loader.server';
import CategoryBanner from '@/components/category-banner';
import CategoryBannerSkeleton from '@/components/category-banner/skeleton';
import { JsonLd } from '@/components/json-ld';
import { SeoMeta } from '@/components/seo-meta';
import { useTranslation } from 'react-i18next';
import { UITarget } from '@/targets/ui-target';
import { generateCategorySchema } from '@/utils/category-schema';
import { getPublicOrigin } from '@/utils/schema-url';
import { buildCanonicalUrl } from '@/utils/canonical-url';
import {
    getInitialFiltersOpen,
    getSearchWithoutFiltersParam,
    useFiltersPanelState,
} from '@/hooks/use-filters-panel-state';
import { getLogger } from '@/lib/logger.server';
import { uiConfig } from '@/lib/config.ui';

@PageType({
    name: 'Product Listing Page',
    description: 'Product listing page with product listings and personalized content',
    supportedAspectTypes: ['plp'],
})
@RegionDefinition([
    {
        id: 'plpTopFullWidth',
        name: 'Top Full Width Region',
        description: 'Full screen width region at the top of the results',
        maxComponents: 5,
    },
    {
        id: 'plpTopContent',
        name: 'Top Content Region',
        description: 'Content width region below sort/filter, above product grid',
        maxComponents: 5,
    },
    {
        id: 'plpBottom',
        name: 'Bottom Region',
        description: 'Region at the bottom of search results after product grid',
        maxComponents: 5,
    },
])
export class ProductListingPageMetadata {}

type CategoryPageData = {
    category: ShopperProducts.schemas['Category'];
    searchResultCritical: ShopperSearch.schemas['ProductSearchResult'];
    searchResultNonCritical: Promise<ShopperSearch.schemas['ProductSearchResult']>;
    page: ReturnType<typeof fetchPageWithComponentData>;
    categoryId: string;
    pageUrl: string;
    refine: string[];
    currency: string;
    locale: string;
    initialFiltersOpen?: boolean;
    categorySchema: Promise<ReturnType<typeof generateCategorySchema> | null>;
    /** `rel=prev/next` crawl URLs for load-more mode, or `null` in traditional mode. */
    seoPagination: { prevUrl: string | null; nextUrl: string | null } | null;
    /** Products the server rendered on first paint. */
    initialCount: number;
    /** Server-side offset for `?page=N` entry in load-more mode (0 for normal entry). */
    offset?: number;
};

/**
 * Server-side loader function that fetches category data and product search results.
 * This function runs on the server during SSR and prepares data for the category page.
 * @returns Object containing search results, category data, and page metadata
 */
export async function loader(args: Route.LoaderArgs): Promise<CategoryPageData> {
    const {
        context,
        request,
        params: { categoryId },
    } = args;
    const requestUrl = new URL(request.url);
    const { searchParams } = requestUrl;
    const logger = getLogger(context);
    logger.debug('Category: loader starting', {
        categoryId,
        offset: parseInt(searchParams.get('offset') || '0', 10),
    });
    const sort = getQueryParam(searchParams, PRODUCT_SEARCH_QUERY_PARAMS.SORT);
    const refine = getAllQueryParams(searchParams, PRODUCT_SEARCH_QUERY_PARAMS.REFINE);
    const initialFiltersOpen = getInitialFiltersOpen(searchParams);

    // Get currency and locale for cache-busting the page key
    const config = getConfig(context);
    const siteCtx = context.get(siteContext);
    if (!siteCtx) {
        logger.error('Category: site context is not available');
        throw new Response('Site context is not available', { status: 500 });
    }
    const { currency } = siteCtx;
    const locale = siteCtx.locale.id;
    const limit = config.search.products.hits.limit;

    // Pagination params. Which ones are honored depends on the merchant's pagination mode:
    // - `traditional`: `?offset=N` drives the numbered page window (existing behavior).
    // - `load-more`: the client persists loaded count to sessionStorage for back-nav restoration;
    //   `?page=N` is the crawler/no-JS fallback that server-renders a single traditional page window.
    const paginationConfig = uiConfig.pages.category.pagination;
    const isLoadMoreMode = paginationConfig.mode === 'load-more';
    const requestedOffset = parseInt(getQueryParam(searchParams, PRODUCT_SEARCH_QUERY_PARAMS.OFFSET) || '0', 10) || 0;
    const requestedPage = parseInt(searchParams.get('page') || '0', 10) || 0;
    // In load-more mode a `?page=N` request is the SEO/no-JS path — serve that page's offset window.
    const isPagedRequest = isLoadMoreMode && requestedPage > 1;
    const offset = isPagedRequest ? (requestedPage - 1) * limit : requestedOffset;
    const initialFetchLimit = limit;

    let categoryData: ShopperProducts.schemas['Category'] | undefined;
    try {
        categoryData = await fetchCategory(context, categoryId, 1);
    } catch (e) {
        if (e instanceof NormalizedApiError && e.status) {
            throw new Response(e.message, { status: e.status });
        }
        throw new Response('Internal Server Error', { status: 500 });
    }

    // Keep non-category refinements and apply exactly one category refinement.
    // If URL already contains a cgid refine (e.g. from quick filters), honor it.
    // Otherwise, default to the category id from the route path.
    const effectiveRefine = refine.filter((r) => !r.startsWith('cgid='));
    const selectedCgidRefine = refine.find((r) => r.startsWith('cgid='));
    effectiveRefine.push(selectedCgidRefine ?? `cgid=${categoryId}`);

    // Ensure criticalCount doesn't exceed limit to prevent negative non-critical limit
    const criticalCount = config.search.products.hits.critical ?? 4;
    const safeCriticalCount = Math.min(criticalCount, limit);
    const searchResultCritical = await fetchSearchProducts(context, {
        limit: safeCriticalCount,
        offset,
        sort,
        refine: effectiveRefine,
        currency,
    });

    const effectiveCriticalCount = searchResultCritical.hits?.length ?? 0;
    const searchResultNonCritical = fetchSearchProducts(context, {
        // On a `?loaded=N` restoration this widens to N so the full run is server-rendered; otherwise
        // it's the normal single-page window.
        limit: initialFetchLimit - effectiveCriticalCount,
        offset: offset + effectiveCriticalCount,
        sort,
        refine: effectiveRefine,
        currency,
    });

    const pageUrl = buildCanonicalUrl(requestUrl.origin, requestUrl.pathname, requestUrl.search);

    // SEO / crawler pagination (load-more mode only). Expose `rel=prev/next` URLs so bots can discover
    // and crawl the full result set via `?page=N` even though shoppers use the JS "load more" flow.
    // These use the clean path + a single `page` param (canonical stays the base URL; see SeoMeta).
    const totalCount = searchResultCritical.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const currentPage = isPagedRequest ? requestedPage : 1;
    const buildPageUrl = (p: number): string => {
        const params = new URLSearchParams();
        for (const r of refine) params.append('refine', r);
        if (sort) params.set('sort', sort);
        if (p > 1) params.set('page', String(p));
        const qs = params.toString();
        return `${requestUrl.origin}${requestUrl.pathname}${qs ? `?${qs}` : ''}`;
    };
    const seoPagination = isLoadMoreMode
        ? {
              prevUrl: currentPage > 1 ? buildPageUrl(currentPage - 1) : null,
              nextUrl: currentPage < totalPages ? buildPageUrl(currentPage + 1) : null,
          }
        : null;

    // Generate category schema in loader (server-side) for SEO
    const categorySchemaPromise = searchResultNonCritical
        .then((searchResult: ShopperSearch.schemas['ProductSearchResult']) => {
            try {
                // Use public origin from request headers instead of request.url
                // to avoid exposing internal AWS Lambda URLs in schema
                const publicOrigin = getPublicOrigin(request);
                const url = new URL(request.url);
                const schemaPageUrl = `${publicOrigin}${url.pathname}${url.search}`;
                // Validate inputs before generating schema
                if (!categoryData || !searchResult) {
                    return null;
                }
                return generateCategorySchema({
                    category: categoryData,
                    searchResult: {
                        ...searchResult,
                        hits: [...(searchResultCritical.hits || []), ...(searchResult.hits || [])],
                    },
                    config,
                    pageUrl: schemaPageUrl,
                    defaultCurrency: currency,
                });
            } catch (error) {
                logger.error('Error generating category schema in loader', {
                    error,
                });
                return null;
            }
        })
        .catch((error) => {
            logger.error('Error in category schema promise chain', {
                error,
            });
            return null;
        });

    return {
        category: categoryData,
        searchResultCritical,
        searchResultNonCritical,
        page: fetchPageWithComponentData(args, {
            aspectType: 'plp',
            categoryId,
        }),
        categoryId,
        pageUrl,
        refine: effectiveRefine,
        currency,
        locale,
        initialFiltersOpen,
        categorySchema: categorySchemaPromise,
        seoPagination,
        initialCount: Math.min(initialFetchLimit, Math.max(0, (searchResultCritical.total ?? 0) - offset)),
        offset,
    };
}

export { shouldRevalidate } from '@/lib/revalidation/routes/category';

/**
 * Category page component that displays a product category with filtering, sorting, and pagination.
 * This component uses the createPage factory to handle Suspense patterns.
 * @returns JSX element representing the category page
 */
function ProductGridError() {
    const rawError = useAsyncError();
    const error = rawError instanceof NormalizedApiError ? rawError : null;
    const { t } = useTranslation('common');
    return (
        <div role="alert" className="col-span-full py-8 text-center text-muted-foreground">
            <p>{t('productGrid.loadFailed')}</p>
            {import.meta.env.DEV && error && (
                <div className="mt-2 text-xs font-mono text-muted-foreground/70">
                    {error.status && <span>{error.status} </span>}
                    {error.message && <p>{error.message}</p>}
                </div>
            )}
        </div>
    );
}

/**
 * Component that renders JSON-LD schema when categorySchema promise resolves.
 * Must be inside Suspense boundary to ensure it streams correctly in SSR.
 */
function CategoryJsonLd({
    categorySchemaPromise,
}: {
    categorySchemaPromise: Promise<ReturnType<typeof generateCategorySchema> | null>;
}) {
    const categorySchema = use(categorySchemaPromise);
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const nonce = rootData?.nonce ?? undefined;
    return categorySchema ? <JsonLd data={categorySchema} id="category-schema" nonce={nonce} /> : null;
}

export default function CategoryPage({
    loaderData: {
        category,
        searchResultCritical,
        searchResultNonCritical,
        page,
        categoryId,
        pageUrl,
        refine,
        locale,
        currency,
        initialFiltersOpen,
        categorySchema,
        seoPagination,
        initialCount,
        offset = 0,
    },
}: {
    loaderData: CategoryPageData;
}) {
    const config = useConfig();

    const [filtersOpen, toggleFiltersOpen] = useFiltersPanelState(initialFiltersOpen);
    const limit = config.search.products.hits.limit;

    // Determine the maximum number of skeletons to display in the product grid.
    // Out-of-the-box the idea is to not display more than 8 skeletons, i.e., two rows on a desktop device.
    // Wrap in Math.max(0, ...) to prevent negative values when criticalCount is high(er).
    const criticalCount = searchResultCritical.hits?.length ?? 0;
    const nonCriticalCount = Math.max(
        0,
        Math.min(8, limit, searchResultCritical.total - searchResultCritical.offset) - criticalCount
    );

    const analytics = useAnalytics();
    const lastTrackedDataRef = useRef<string | null>(null);
    const resultsHeadingRef = useRef<HTMLHeadingElement>(null);

    const location = useLocation();
    const navigation = useNavigation();
    const searchWithoutFiltersParam = useMemo(() => getSearchWithoutFiltersParam(location.search), [location.search]);
    const pageIdentity = `${categoryId}-${currency}-${locale}`;
    const analyticsKey = `${pageIdentity}-${searchWithoutFiltersParam}-${location.hash}`;
    const productGridDataKey = `${pageIdentity}-${searchWithoutFiltersParam}`;
    const selectedFiltersCount = useMemo(
        () => new URLSearchParams(location.search).getAll('refine').length,
        [location.search]
    );

    // QuickFilters "Shop by {label}" header is opt-in per build target via
    // `uiConfig.pages.category.showCategoryLabel`. When on, derive the label from
    // the active `cgid` refinement and pass it down; when off, pass nothing so
    // QuickFilters renders the chips-only baseline. Keeping this in the (shared)
    // route means QuickFilters stays presentational and no vertical has to fork
    // either the component or this route. See @/lib/config.ui.
    const categoryLabel = uiConfig.pages.category.showCategoryLabel
        ? searchResultCritical.refinements?.find((r) => r.attributeId === 'cgid')?.label
        : undefined;
    const isProductGridLoading = useMemo(() => {
        if (navigation.state === 'idle' || !navigation.location) {
            return false;
        }
        const currentRefines = new URLSearchParams(location.search).getAll('refine');
        const nextRefines = new URLSearchParams(navigation.location.search).getAll('refine');
        return (
            currentRefines.length !== nextRefines.length ||
            currentRefines.some((currentRefine, index) => currentRefine !== nextRefines[index])
        );
    }, [location.search, navigation.location, navigation.state]);

    const nonCriticalPromise = useMemo(
        () => searchResultNonCritical.then((r) => r.hits ?? []),
        [searchResultNonCritical]
    );

    // Pagination mode is merchant-configurable: `load-more` (button + infinite scroll, the default)
    // or `traditional` (numbered prev/next that navigates the URL offset). See @/lib/config.ui.
    const paginationConfig = uiConfig.pages.category.pagination;
    const isLoadMoreMode = paginationConfig.mode === 'load-more';

    // "Load more" / infinite scroll: the loader renders the first page (`initialCount` products) and
    // this hook appends further pages via a non-navigating fetch, resetting whenever the underlying
    // query changes (category / sort / refinements). On bfcache-miss back-nav, the hook reads
    // `sfnextLoaded` from history.state and auto-fetches to restore the prior scroll depth.
    const {
        appended,
        loadedCount,
        total: loadMoreTotal,
        hasMore,
        capReached,
        isLoading: isLoadingMore,
        isRestoring,
        restorationTarget,
        hasError: loadMoreError,
        firstNewIndex,
        loadMore,
        sentinelRef,
    } = useLoadMoreProducts({
        refine,
        sort: searchResultCritical.selectedSortingOption,
        currency,
        initialCount,
        total: searchResultCritical.total,
        batchSize: paginationConfig.batchSize,
        mobileBatchSize: paginationConfig.mobileBatchSize,
        maxProducts: paginationConfig.maxProducts,
        identity: productGridDataKey,
        offset,
    });

    // Accessibility: after a "load more" appends a batch, move focus to its first tile so keyboard and
    // screen-reader users land on the new content instead of staying on the (now mid-page) button.
    const firstNewItemRef = useRef<HTMLDivElement>(null);
    const focusTargetKey = firstNewIndex === null ? null : `${appended.length}-${firstNewIndex}`;
    useEffect(() => {
        if (focusTargetKey === null || !firstNewItemRef.current) {
            return;
        }
        const node = firstNewItemRef.current;
        // ProductTile's root isn't natively focusable; make it programmatically focusable, focus it,
        // then drop the tabindex on blur so it doesn't linger in the tab order.
        node.setAttribute('tabindex', '-1');
        node.focus({ preventScroll: true });
        const onBlur = () => node.removeAttribute('tabindex');
        node.addEventListener('blur', onBlur, { once: true });
        return () => node.removeEventListener('blur', onBlur);
    }, [focusTargetKey]);

    // Persist loaded count in sessionStorage keyed by React Router's history key. React Router
    // overwrites history.state with { key } on navigation, so history.state is not safe for custom
    // data. sessionStorage survives SPA navigations and is the same mechanism React Router uses
    // for its own scroll positions. URL stays clean — no params exposed to users.
    const STORAGE_KEY = 'sfnext:loadMore';
    useEffect(() => {
        if (!isLoadMoreMode || typeof window === 'undefined' || isRestoring) {
            return;
        }
        const historyKey = (window.history.state as { key?: string } | null)?.key;
        if (!historyKey) return;
        try {
            if (loadedCount > initialCount) {
                const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
                stored[historyKey] = loadedCount;
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
            } else {
                const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
                delete stored[historyKey];
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
            }
        } catch {
            // sessionStorage full or unavailable — non-critical, skip
        }
    }, [isLoadMoreMode, isRestoring, loadedCount, initialCount]);

    const [, startTransition] = useTransition();
    const lastSearchParamsRef = useRef<string>(location.search);

    useEffect(() => {
        // Move focus to results heading after refinement or sort changes
        if (navigation.state === 'idle' && lastSearchParamsRef.current !== location.search) {
            lastSearchParamsRef.current = location.search;
            // Allow the DOM to update before moving focus
            requestAnimationFrame(() => {
                resultsHeadingRef.current?.focus();
            });
        }
    }, [navigation.state, location.search]);

    useEffect(() => {
        // Only track if we haven't already tracked this specific data combination
        if (analyticsKey !== lastTrackedDataRef.current) {
            lastTrackedDataRef.current = analyticsKey;

            startTransition(() => {
                void nonCriticalPromise
                    .then((searchHitsData: ShopperSearch.schemas['ProductSearchHit'][]) => {
                        if (analytics) {
                            void analytics.trackViewCategory({
                                category,
                                searchResults: [...(searchResultCritical.hits ?? []), ...searchHitsData],
                                sort:
                                    searchResultCritical.selectedSortingOption ||
                                    searchResultCritical.sortingOptions?.[0]?.label ||
                                    '',
                                refinements: searchResultCritical.selectedRefinements ?? {},
                            });
                        }
                    })
                    .catch(() => {
                        // Silently handle promise rejection
                    });
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [analytics, category, analyticsKey, nonCriticalPromise]);

    const handleProductClick = useCallback(
        (product: ShopperSearch.schemas['ProductSearchHit']) => {
            if (analytics) {
                void analytics.trackClickProductInCategory({
                    category,
                    product,
                });
            }
        },
        [analytics, category]
    );

    return (
        <>
            <SeoMeta
                title={category.name || category.id}
                description={category.pageDescription || category.description}
                openGraph={{
                    type: 'website',
                    url: pageUrl,
                }}
            />
            {/* SEO pagination hints: let crawlers walk the full result set via `?page=N` even though
                shoppers use the JS "load more" flow. React 19 hoists these <link>s into <head>. */}
            {seoPagination?.prevUrl && <link rel="prev" href={seoPagination.prevUrl} />}
            {seoPagination?.nextUrl && <link rel="next" href={seoPagination.nextUrl} />}
            <div className="pb-16 -mt-8">
                {/* plpTopFullWidth — full-width banner region, flush to the header (mirrors homepage pattern) */}
                <Region
                    page={page}
                    regionId="plpTopFullWidth"
                    fallbackElement={<CategoryBannerSkeleton />}
                    errorElement={<CategoryBanner />}
                    fallbackOnEmpty
                />

                <div className="section-container pt-8">
                    <div className="mb-4">
                        <CategoryBreadcrumbs category={category} />
                    </div>

                    <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <h1
                            ref={resultsHeadingRef}
                            tabIndex={-1}
                            className="text-3xl font-bold leading-none tracking-[-0.75px] text-card-foreground rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                            {category?.name || category.id} ({searchResultCritical.total})
                        </h1>
                        <UITarget targetId="sfcc.plp.search.summary" />
                        {searchResultCritical?.sortingOptions && searchResultCritical.sortingOptions.length > 0 && (
                            <div className="flex-shrink-0">
                                <CategorySorting result={searchResultCritical} />
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col lg:flex-row gap-2">
                        {/* Filters toggle button + Quick Filters - mobile only (above panel) */}
                        <div className="lg:hidden mb-4 flex flex-col items-start gap-2" data-slot="filters-wrapper">
                            <FiltersButton
                                onClick={toggleFiltersOpen}
                                isActive={filtersOpen}
                                selectedFiltersCount={selectedFiltersCount}
                            />
                            <QuickFilters category={category} categoryLabel={categoryLabel} />
                        </div>

                        {/* Category Refinements - toggles visibility on left side */}
                        {filtersOpen && (
                            <div className="w-full lg:w-64 lg:flex-shrink-0">
                                <CategoryRefinements result={searchResultCritical} refine={refine} />
                            </div>
                        )}

                        <div className="flex-grow">
                            {/* Filters toggle button + Quick Filters - desktop only (inside content area) */}
                            <div className="mb-4 hidden lg:flex lg:items-center lg:gap-4" data-slot="filters-wrapper">
                                <FiltersButton
                                    onClick={toggleFiltersOpen}
                                    isActive={filtersOpen}
                                    selectedFiltersCount={selectedFiltersCount}
                                />
                                <QuickFilters category={category} categoryLabel={categoryLabel} />
                            </div>

                            <ActiveFilters result={searchResultCritical} />

                            {/* plpTopContent */}
                            <Region className="mb-8" page={page} regionId="plpTopContent" />

                            <UITarget targetId="sfcc.plp.agent.categoryHelper" />
                            <UITarget targetId="sfcc.plp.search.results">
                                {isRestoring ? (
                                    <div
                                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-8"
                                        aria-busy="true">
                                        {Array.from({ length: restorationTarget }, (_, i) => (
                                            <ProductTileSkeleton key={`restore-skeleton-${i}`} />
                                        ))}
                                    </div>
                                ) : (
                                    <DeferredProductGrid
                                        key={productGridDataKey}
                                        critical={searchResultCritical.hits ?? []}
                                        nonCritical={nonCriticalPromise}
                                        appended={isLoadMoreMode ? appended : undefined}
                                        firstNewIndex={isLoadMoreMode ? firstNewIndex : undefined}
                                        firstNewItemRef={isLoadMoreMode ? firstNewItemRef : undefined}
                                        appendPending={isLoadMoreMode ? isLoadingMore : undefined}
                                        nonCriticalCount={nonCriticalCount}
                                        hasRefinementsPanel={filtersOpen}
                                        isLoading={isProductGridLoading}
                                        handleProductClick={handleProductClick}
                                        topCategoryName={
                                            category.parentCategoryTree?.find((p) => p.id !== 'root')?.name ??
                                            category.name
                                        }
                                        errorElement={<ProductGridError />}
                                    />
                                )}
                            </UITarget>

                            {!isProductGridLoading &&
                                (isLoadMoreMode ? (
                                    <div className="mt-10">
                                        <LoadMore
                                            loadedCount={loadedCount}
                                            total={loadMoreTotal}
                                            hasMore={hasMore}
                                            capReached={capReached}
                                            isLoading={isLoadingMore}
                                            hasError={loadMoreError}
                                            onLoadMore={loadMore}
                                            sentinelRef={sentinelRef}
                                        />
                                    </div>
                                ) : (
                                    searchResultCritical.total > 1 && (
                                        <div className="mt-10">
                                            <CategoryPagination
                                                limit={limit}
                                                offset={searchResultCritical.offset}
                                                total={searchResultCritical.total}
                                            />
                                        </div>
                                    )
                                ))}

                            {/* plpBottom */}
                            <Region className="mt-8" page={page} regionId="plpBottom" />
                        </div>
                    </div>
                </div>
            </div>
            <Suspense fallback={null}>
                <CategoryJsonLd categorySchemaPromise={categorySchema} />
            </Suspense>
        </>
    );
}
