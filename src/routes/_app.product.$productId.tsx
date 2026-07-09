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
import { useEffect, useRef, Suspense, Fragment } from 'react';
import { Await, useRouteLoaderData } from 'react-router';
import type { loader as rootLoader } from '@/root';
import { shouldRevalidate as shouldRevalidateProduct } from '@/lib/revalidation/routes/product';
import type { Route } from './+types/_app.product.$productId';
import { type ShopperProducts } from '@/scapi';
import { fetchProductById } from '@/lib/api/products.server';
import { fetchCategory } from '@/lib/api/categories.server';
import { fetchWishlistInitialState } from '@/lib/wishlist/fetch-initial-state.server';
import type { WishlistInitialState } from '@/lib/wishlist/state';
import { WishlistProvider } from '@/providers/wishlist';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import ProductView from '@/components/product-view';
import ChildProducts from '@/components/product-view/child-products';
import CategoryBreadcrumbs from '@/components/category-breadcrumbs';
import { CategoryBreadcrumbsSkeleton } from '@/components/category-breadcrumbs/skeleton';
import { isProductSet, isProductBundle } from '@/lib/product/product-utils';
import ProductRecommendations from '@/components/product-recommendations';
import { EINSTEIN_RECOMMENDERS } from '@/lib/product/einstein-recommenders';
import { useTranslation } from 'react-i18next';
import { useAnalytics } from '@/hooks/use-analytics';
import { Region } from '@/components/region';
import { ProductProvider } from '@/providers/product-context';
import { PageType } from '@/lib/decorators/page-type';
import { RegionDefinition } from '@/lib/decorators/region-definition';
import { fetchPageWithComponentData } from '@/lib/page-designer/page-loader.server';
import { JsonLd } from '@/components/json-ld';
import { SeoMeta } from '@/components/seo-meta';
import { generateProductSchema } from '@/utils/product-schema';
import { getPublicOrigin } from '@/utils/schema-url';
import { buildCanonicalUrl } from '@/utils/canonical-url';
import { getLogger } from '@/lib/logger.server';
import { UITarget } from '@/targets/ui-target';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { selectedStoreContext } from '@/extensions/store-locator/middlewares/selected-store.server';
import PickupProvider from '@/extensions/bopis/context/pickup-context';
// @sfdc-extension-block-end SFDC_EXT_BOPIS
// @sfdc-extension-block-start SFDC_EXT_BNPL
import {
    getBuyNowPayLaterMessage,
    getBuyNowPayLaterLearnMore,
    type BuyNowPayLaterMessageData,
    type BuyNowPayLaterLearnMoreData,
} from '@/extensions/bnpl/lib/api/bnpl.server';
import { BnplProvider } from '@/extensions/bnpl/context/bnpl-context';
// @sfdc-extension-block-end SFDC_EXT_BNPL
// @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
import {
    getReviewsSummary,
    getReviews,
    getWriteReviewForm,
    type ReviewsSummaryData,
    type ReviewsData,
    type WriteReviewFormData,
} from '@/extensions/ratings-reviews/lib/api/reviews.server';
import { ProductReviewsProvider } from '@/extensions/ratings-reviews/providers/product-reviews-context';
import { WriteReviewFormProvider } from '@/extensions/ratings-reviews/context/write-review-form-context';
// @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
// @sfdc-extension-block-start SFDC_EXT_PRODUCT_CONTENT
import {
    getReturnsAndWarranty,
    pdpSectionApi,
    type ReturnsAndWarrantyData,
    type HtmlContent,
} from '@/extensions/product-content/lib/api/product-content.server';
import { resolvePdpSections } from '@/extensions/product-content/lib/pdp-sections';
import { ProductContentDataProvider } from '@/extensions/product-content/context/product-content-data-context';
// @sfdc-extension-block-end SFDC_EXT_PRODUCT_CONTENT
// @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
import {
    getEstimatedDelivery,
    type EstimatedDeliveryData,
} from '@/extensions/shipping-delivery/lib/api/shipping-delivery.server';
import { ShippingDeliveryProvider } from '@/extensions/shipping-delivery/context/shipping-delivery-context';
// @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY

@PageType({
    name: 'Product Detail Page',
    description: 'Product detail page with product information, images, and recommendations',
    supportedAspectTypes: ['pdp'],
})
@RegionDefinition([
    {
        id: 'promoContent',
        name: 'Promo Content Region',
        description: 'Promotional content region above main product content',
        maxComponents: 1,
    },
    {
        id: 'engagementContent',
        name: 'Engagement Content Region',
        description: 'Engagement content region for recommendations and related products below main content',
        maxComponents: 1,
    },
])
export class ProductPageMetadata {}

export type ProductPageData = {
    product: ShopperProducts.schemas['Product'];
    category: Promise<ShopperProducts.schemas['Category'] | undefined>;
    page: ReturnType<typeof fetchPageWithComponentData>;
    pageKey: string;
    pageUrl: string;
    productSchema: Promise<ReturnType<typeof generateProductSchema> | null>;
    wishlistInitialState: Promise<WishlistInitialState>;
    // @sfdc-extension-block-start SFDC_EXT_BNPL
    bnplMessage: Promise<BuyNowPayLaterMessageData>;
    bnplLearnMore: Promise<BuyNowPayLaterLearnMoreData>;
    // @sfdc-extension-block-end SFDC_EXT_BNPL
    // @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
    reviewsSummary: ReviewsSummaryData;
    reviewsList: Promise<ReviewsData>;
    writeReviewForm: Promise<WriteReviewFormData>;
    // @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
    // @sfdc-extension-block-start SFDC_EXT_PRODUCT_CONTENT
    returnsWarranty: Promise<ReturnsAndWarrantyData>;
    pdpCollapsibles: Promise<Array<HtmlContent | null>>;
    // @sfdc-extension-block-end SFDC_EXT_PRODUCT_CONTENT
    // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
    estimatedDelivery: Promise<EstimatedDeliveryData>;
    // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
};

/**
 * Server-side loader function that fetches product data and category information.
 * This function runs on the server during SSR and can access cookies for store information.
 *
 * The product is awaited as critical data: a 404 from SCAPI is re-thrown as
 * `Response(message, { status: 404 })` so React Router renders the 404 page with
 * the proper HTTP status (essential for SEO).
 *
 * @returns Object containing the resolved product, deferred category, page data, and schema promises
 */
export async function loader(args: Route.LoaderArgs): Promise<ProductPageData> {
    const { request, params, context } = args;
    const logger = getLogger(context);
    const { productId } = params;
    const requestUrl = new URL(request.url);
    const { searchParams } = requestUrl;
    const variantPid = searchParams.get('pid');
    logger.debug('Product: loader starting', { productId, variantPid: variantPid || undefined });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    const selectedStoreInfo = context.get(selectedStoreContext);
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    // Get currency from context for product pricing
    const siteCtx = context.get(siteContext);
    if (!siteCtx) {
        logger.error('Product: site context is not available');
        throw new Response('Site context is not available', { status: 500 });
    }
    const { currency } = siteCtx;

    // Resolve the product critically. A 404 here must propagate as Response(404)
    // so the route error boundary renders the 404 page with the correct HTTP status.
    const productLookupId = variantPid || productId;

    // @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
    // Start reviews summary fetch in parallel with the product fetch — it only
    // needs the product ID and drives above-the-fold star display + SEO.
    const reviewsSummaryPromise = getReviewsSummary(productLookupId);
    // @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS

    let product: ShopperProducts.schemas['Product'] | null;
    try {
        product = await fetchProductById(context, productLookupId, {
            expand: [
                'availability', // <-- TTL = 60s (!)
                'bundled_products',
                'images',
                'options',
                'page_meta_tags',
                'prices', // <-- TTL = 900s
                'promotions', // <-- TTL = 900s
                'set_products',
                'variations',
            ],
            allImages: true,
            perPricebook: true,
            ...(currency ? { currency } : {}),
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            // Include inventoryIds parameter when store is selected
            ...(selectedStoreInfo?.inventoryId ? { inventoryIds: [selectedStoreInfo.inventoryId] } : {}),
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
        });
    } catch (e) {
        if (e instanceof NormalizedApiError && e.status) {
            throw new Response(e.message, { status: e.status });
        }
        throw new Response('Internal Server Error', { status: 500 });
    }

    if (!product) {
        throw new Response('Product not found', { status: 404 });
    }

    const masterProductPromise = (() => {
        if (product.master?.masterId) {
            return fetchProductById(context, product.master.masterId, {
                ...(currency ? { currency } : {}),
            });
        }

        return null;
    })();

    // Build the deferred category promise. Category is optional context for the
    // breadcrumbs — failures degrade silently via the route-level <Await errorElement={null}>.
    const categoryPromise: Promise<ShopperProducts.schemas['Category'] | undefined> = (async () => {
        if (product.primaryCategoryId) {
            return fetchCategory(context, product.primaryCategoryId, 1);
        }

        // For variant products, try to get the master product's category.
        const masterProduct = await masterProductPromise;

        if (masterProduct?.primaryCategoryId) {
            return fetchCategory(context, masterProduct.primaryCategoryId, 1);
        }

        return undefined;
    })();

    const pageUrl = buildCanonicalUrl(requestUrl.origin, requestUrl.pathname, requestUrl.search);

    // Generate product schema in loader (server-side) for SEO.
    // Wrapped in a Promise so it can be rendered through Suspense without blocking
    // the loader response. The inner try/catch logs synchronous schema-generation failures
    // (this is local computation, not a SCAPI call — `fetchProductById` already logs SCAPI
    // errors at the API layer) so we keep visibility on rare malformed-input bugs.
    // Render-time failures degrade silently via the route-level <Await errorElement={null}>.
    const productSchemaPromise: Promise<ReturnType<typeof generateProductSchema> | null> = Promise.resolve().then(
        () => {
            try {
                // Use public origin from request headers instead of request.url
                // to avoid exposing internal AWS Lambda URLs in schema
                const publicOrigin = getPublicOrigin(request);
                const url = new URL(request.url);
                const productUrl = `${publicOrigin}${url.pathname}${url.search}`;
                return generateProductSchema(product, productUrl);
            } catch (error) {
                logger.error('Error generating product schema in loader', { error });
                return null;
            }
        }
    );

    const pagePromise = (async () => {
        const primaryCategoryId = product.primaryCategoryId ?? (await masterProductPromise)?.primaryCategoryId;

        return fetchPageWithComponentData(args, {
            aspectType: 'pdp',
            productId: productLookupId,
            ...(primaryCategoryId ? { categoryId: primaryCategoryId } : {}),
        });
    })();

    // @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
    // Await the summary started earlier (ran in parallel with fetchProductById).
    const reviewsSummary = await reviewsSummaryPromise;
    const reviewsList = getReviews(productLookupId);
    const writeReviewForm = getWriteReviewForm(productLookupId);
    // @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS

    return {
        product,
        category: categoryPromise,
        /**
         * Fetch page data from Page Designer API with nested componentData promises.
         * Handle errors gracefully - return page with empty componentData if fetch failed.
         */
        page: pagePromise,
        pageKey: productId,
        pageUrl,
        productSchema: productSchemaPromise,
        wishlistInitialState: fetchWishlistInitialState(context),
        // @sfdc-extension-block-start SFDC_EXT_BNPL
        bnplMessage: getBuyNowPayLaterMessage(productLookupId),
        bnplLearnMore: getBuyNowPayLaterLearnMore(productLookupId),
        // @sfdc-extension-block-end SFDC_EXT_BNPL
        // @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
        reviewsSummary,
        reviewsList,
        writeReviewForm,
        // @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
        // @sfdc-extension-block-start SFDC_EXT_PRODUCT_CONTENT
        returnsWarranty: getReturnsAndWarranty(productLookupId),
        pdpCollapsibles: Promise.all(
            resolvePdpSections(product).map((section) =>
                pdpSectionApi[section.apiMethod](productLookupId).catch(() => null)
            )
        ),
        // @sfdc-extension-block-end SFDC_EXT_PRODUCT_CONTENT
        // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
        estimatedDelivery: getEstimatedDelivery(productLookupId),
        // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
    };
}

// Gates both the navigation axis (skip client-only param changes like color/size) and the action axis (skip the
// expensive loader re-run after cart/wishlist/account mutations that touch nothing the loader reads). The policy and
// its denylist live in the shared module so the rationale is documented and unit-tested in one place.
export const shouldRevalidate = shouldRevalidateProduct;

function ProductContent({
    product,
    url,
    // @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
    reviewsSummary,
    reviewsList,
    writeReviewForm,
    // @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
    // @sfdc-extension-block-start SFDC_EXT_PRODUCT_CONTENT
    returnsWarrantyPromise,
    pdpCollapsiblesPromise,
    // @sfdc-extension-block-end SFDC_EXT_PRODUCT_CONTENT
}: {
    product: ShopperProducts.schemas['Product'];
    url: string;
    // @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
    reviewsSummary: ReviewsSummaryData;
    reviewsList: Promise<ReviewsData>;
    writeReviewForm: Promise<WriteReviewFormData>;
    // @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
    // @sfdc-extension-block-start SFDC_EXT_PRODUCT_CONTENT
    returnsWarrantyPromise: Promise<ReturnsAndWarrantyData>;
    pdpCollapsiblesPromise: Promise<Array<HtmlContent | null>>;
    // @sfdc-extension-block-end SFDC_EXT_PRODUCT_CONTENT
}) {
    const analytics = useAnalytics();
    const lastTrackedProductIdRef = useRef<string | null>(null);

    const primaryImage =
        product.imageGroups?.find((g) => g.viewType === 'large')?.images?.[0]?.link ??
        product.imageGroups?.[0]?.images?.[0]?.link;

    // Track product view on mount and whenever productData changes
    useEffect(() => {
        // Only track if we haven't already tracked this product
        if (product.id !== lastTrackedProductIdRef.current) {
            void analytics.trackViewProduct({
                product,
            });
            lastTrackedProductIdRef.current = product.id;
        }
    }, [analytics, product]);

    const isProductASet = isProductSet(product);
    const isProductABundle = isProductBundle(product);

    return (
        <ProductProvider product={product}>
            {/* @sfdc-extension-block-start SFDC_EXT_PRODUCT_CONTENT */}
            <ProductContentDataProvider
                product={product}
                returnsWarrantyPromise={returnsWarrantyPromise}
                pdpCollapsiblesPromise={pdpCollapsiblesPromise}>
                {/* @sfdc-extension-block-end SFDC_EXT_PRODUCT_CONTENT */}
                {/* @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS */}
                {/* Provider wraps ProductView so the in-page rating summary shares state
                        with the customer reviews accordion (expand/jump-to coordination). */}
                <ProductReviewsProvider summary={reviewsSummary} reviewsListPromise={reviewsList}>
                    <WriteReviewFormProvider writeReviewFormPromise={writeReviewForm}>
                        {/* @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS */}
                        <SeoMeta
                            title={product.name}
                            description={product.pageDescription || product.shortDescription}
                            openGraph={{
                                type: 'product',
                                url,
                                image: primaryImage,
                            }}
                        />
                        <div className="space-y-8">
                            {isProductASet || isProductABundle ? (
                                <>
                                    <ProductView product={product} />
                                    <ChildProducts parentProduct={product} />
                                </>
                            ) : (
                                <ProductView product={product} />
                            )}

                            {/* @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS */}
                            <UITarget targetId="sfcc.pdp.reviews.section" />
                            {/* @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS */}
                            <UITarget targetId="sfcc.pdp.reviews.qna" />
                        </div>
                        {/* @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS */}
                    </WriteReviewFormProvider>
                </ProductReviewsProvider>
                {/* @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS */}
                {/* @sfdc-extension-block-start SFDC_EXT_PRODUCT_CONTENT */}
            </ProductContentDataProvider>
            {/* @sfdc-extension-block-end SFDC_EXT_PRODUCT_CONTENT */}
        </ProductProvider>
    );
}

/**
 * Product detail shell that composes the page layout with granular Suspense boundaries.
 * Regions render independently (they manage their own async via Suspense/Await),
 * while the core product content renders synchronously from the resolved loader data.
 */
function ProductDetailView({ loaderData }: { loaderData: ProductPageData }) {
    const { t } = useTranslation('product');
    const content = (
        <div className="min-h-screen bg-background">
            <div className="section-container pb-4 lg:pb-8">
                {/* Promo Content Region - Promotional content above main product */}
                <Region className="mb-8" page={loaderData.page} regionId="promoContent" />

                {/* Category breadcrumbs - streams independently of product data.
                    Breadcrumbs are non-critical: errorElement renders nothing so a category
                    fetch failure silently degrades to an empty breadcrumbs row. */}
                <Suspense fallback={<CategoryBreadcrumbsSkeleton />}>
                    <Await resolve={loaderData.category} errorElement={null}>
                        {(category) => (category ? <CategoryBreadcrumbs category={category} /> : null)}
                    </Await>
                </Suspense>

                {/* Main Product Content — product is resolved synchronously by the loader */}
                <ProductContent
                    product={loaderData.product}
                    url={loaderData.pageUrl}
                    // @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
                    reviewsSummary={loaderData.reviewsSummary}
                    reviewsList={loaderData.reviewsList}
                    writeReviewForm={loaderData.writeReviewForm}
                    // @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
                    // @sfdc-extension-block-start SFDC_EXT_PRODUCT_CONTENT
                    returnsWarrantyPromise={loaderData.returnsWarranty}
                    pdpCollapsiblesPromise={loaderData.pdpCollapsibles}
                    // @sfdc-extension-block-end SFDC_EXT_PRODUCT_CONTENT
                />

                {/* Engagement Content Region - Shows page content or recommendations */}
                <Region
                    className="mt-16"
                    page={loaderData.page}
                    regionId="engagementContent"
                    errorElement={
                        <div className="mt-16 space-y-16">
                            <ProductRecommendations
                                recommenderName={EINSTEIN_RECOMMENDERS.PDP_COMPLETE_SET}
                                recommenderTitle={t('recommendations.completeTheLook')}
                                className="max-w-none px-0"
                            />
                            <ProductRecommendations
                                recommenderName={EINSTEIN_RECOMMENDERS.PDP_MIGHT_ALSO_LIKE}
                                recommenderTitle={t('recommendations.youMightAlsoLike')}
                                className="max-w-none px-0"
                            />
                            <ProductRecommendations
                                recommenderName={EINSTEIN_RECOMMENDERS.PDP_RECENTLY_VIEWED}
                                recommenderTitle={t('recommendations.recentlyViewed')}
                                className="max-w-none px-0"
                            />
                        </div>
                    }
                />
            </div>
        </div>
    );

    let finalContent = content;
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    finalContent = <PickupProvider>{finalContent}</PickupProvider>;
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    // @sfdc-extension-block-start SFDC_EXT_BNPL
    finalContent = (
        <BnplProvider messagePromise={loaderData.bnplMessage} learnMorePromise={loaderData.bnplLearnMore}>
            {finalContent}
        </BnplProvider>
    );
    // @sfdc-extension-block-end SFDC_EXT_BNPL
    // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
    finalContent = (
        <ShippingDeliveryProvider estimatedDeliveryPromise={loaderData.estimatedDelivery}>
            {finalContent}
        </ShippingDeliveryProvider>
    );
    // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY

    return finalContent;
}

/**
 * Product page component that displays a product with its details and category breadcrumbs.
 * The page key ensures React only remounts when navigating to a different product, not variants.
 * @returns JSX element representing the product page with Suspense boundary
 */
export default function ProductPage({ loaderData }: { loaderData: ProductPageData }) {
    // Use pageKey from loaderData to force remount only when productId changes
    // This prevents showing skeleton when switching variants (pid parameter)
    const pageKey = loaderData.pageKey;

    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const nonce = rootData?.nonce ?? undefined;

    return (
        <WishlistProvider initialState={loaderData.wishlistInitialState}>
            <Fragment key={pageKey}>
                <ProductDetailView loaderData={loaderData} />

                {/* Product JSON-LD Schema for SEO - render after page content so it appears at end of body flow.
                    JSON-LD is non-critical: errorElement renders nothing so a schema-generation failure
                    silently degrades to no <script> tag. */}
                <Suspense fallback={null}>
                    <Await resolve={loaderData.productSchema} errorElement={null}>
                        {(productSchema) =>
                            productSchema ? <JsonLd data={productSchema} id="product-schema" nonce={nonce} /> : null
                        }
                    </Await>
                </Suspense>
            </Fragment>
        </WishlistProvider>
    );
}
