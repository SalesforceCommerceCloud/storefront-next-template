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
import ActiveFilters from '@/components/category-refinements/active-filters';
import FiltersButton from '@/components/category-refinements/filters-button';
import CategoryRefinements from '@/components/category-refinements';
import CategorySorting from '@/components/category-sorting';
import DeferredProductGrid from '@/components/product-grid';
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
    const offset = parseInt(getQueryParam(searchParams, PRODUCT_SEARCH_QUERY_PARAMS.OFFSET) || '0', 10);
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
        limit: limit - effectiveCriticalCount,
        offset: offset + effectiveCriticalCount,
        sort,
        refine: effectiveRefine,
        currency,
    });

    const pageUrl = buildCanonicalUrl(requestUrl.origin, requestUrl.pathname, requestUrl.search);

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
                                <DeferredProductGrid
                                    key={productGridDataKey}
                                    critical={searchResultCritical.hits ?? []}
                                    nonCritical={nonCriticalPromise}
                                    nonCriticalCount={nonCriticalCount}
                                    hasRefinementsPanel={filtersOpen}
                                    isLoading={isProductGridLoading}
                                    handleProductClick={handleProductClick}
                                    topCategoryName={
                                        category.parentCategoryTree?.find((p) => p.id !== 'root')?.name ?? category.name
                                    }
                                    errorElement={<ProductGridError />}
                                />
                            </UITarget>

                            {searchResultCritical.total > 1 && (
                                <div className="mt-10">
                                    <CategoryPagination
                                        limit={limit}
                                        offset={searchResultCritical.offset}
                                        total={searchResultCritical.total}
                                    />
                                </div>
                            )}

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
