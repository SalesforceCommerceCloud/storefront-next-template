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
import { Suspense, useCallback, useEffect, useRef, useMemo, type ReactElement, type ReactNode } from 'react';
import { Await } from 'react-router';
import { useRecommenders, type Product, type Recommendation } from '@/hooks/recommenders/use-recommenders';
import { useAnalytics } from '@/hooks/use-analytics';
import { useIntersectionObserver } from '@/hooks/use-intersection-observer';
import type { ShopperSearch } from '@/scapi';
import ProductCarousel from '@/components/product-carousel/carousel';
import { ProductRecommendationSkeleton } from '@/components/product/skeletons';
import { useProduct } from '@/providers/product-context';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { Component } from '@/lib/decorators/component';
import { AttributeDefinition } from '@/lib/decorators/attribute-definition';
// oxlint-disable-next-line react-refresh/only-export-components -- loader re-export is required for the static-registry AST plugin
export { loader } from './loader';

/**
 * Configuration for a single recommender
 */
export interface RecommenderConfig {
    /** Unique identifier for the recommender (e.g., 'pdp-similar-items') */
    name: string;
    /** Display title for the recommendation section */
    title: string;
    /** Type of recommendation request ('recommender' or 'zone') */
    type?: 'recommender' | 'zone';
}

@Component('productRecommendations', {
    name: 'Product Recommendations',
    description:
        'Displays product recommendations. Automatically reads product from context when available on product pages.',
    group: 'Content',
})
// oxlint-disable-next-line react/only-export-components -- oxlint flags the co-exported Page Designer metadata class; eslint-plugin-react-refresh does not
export class ProductRecommendationsMetadata {
    @AttributeDefinition({
        name: 'Recommender Name',
        description: 'Unique identifier for the Einstein recommender',
        type: 'enum',
        // Values must be inline literals for the AST parser in generate-cartridge.
        values: [
            'pdp-similar-items',
            'viewed-recently-einstein',
            'product-to-product-einstein',
            'complete-the-set',
            'home-top-revenue-for-category',
            'products-in-all-categories',
        ],
        required: true,
    })
    recommenderName?: string;

    @AttributeDefinition({
        name: 'Recommender Title',
        description: 'Display title for the recommendation section',
        type: 'string',
        required: true,
    })
    recommenderTitle?: string;

    @AttributeDefinition({
        name: 'Recommender Type',
        description:
            'Type of recommendation request. Defaults to "recommender" for standard recommenders. Use "zone" only for zone-based recommendations.',
        type: 'enum',
        values: ['recommender', 'zone'],
        defaultValue: 'recommender',
    })
    recommenderType?: 'recommender' | 'zone';
}

/**
 * Props for the ProductRecommendations component
 */
export interface ProductRecommendationsProps {
    recommender?: RecommenderConfig;
    recommenderName?: string;
    recommenderTitle?: string;
    recommenderType?: 'recommender' | 'zone';
    products?: Product[];
    args?: Record<string, unknown>;
    /** Optional className for the carousel title (e.g. smaller text on account overview). */
    titleClassName?: string;
    /** Optional subtitle displayed below the carousel title. */
    subtitle?: string;
    /** Optional label for the header link text (no URL = plain text) */
    shopAllText?: string;
    /** Optional className to apply to the carousel wrapper */
    className?: string;
    /**
     * Pre-fetched recommendation Promise (typically from a route loader).
     * When provided, the component skips the client-side `useRecommenders`
     * fetch path and renders inside a `<Suspense>` boundary using `<Await>`.
     */
    data?: Promise<Recommendation>;
    /** Suspense fallback used while `data` is pending. Defaults to `null`. */
    fallback?: ReactNode;
}

/**
 * ProductRecommendations component displays a single product recommendation carousel using Einstein.
 *
 * This component uses the `useRecommenders` hook to fetch Einstein recommendations
 * and renders them as a product carousel.
 *
 * The component handles loading states and only displays the carousel when products are available.
 * It can read the product from ProductViewContext when available, falling back to the products prop.
 *
 * @param props - The component props
 * @param props.recommender - Recommender configuration (name, title, type)
 * @param props.recommenderName - Optional individual prop for recommender name (alternative to recommender object, used with recommenderTitle)
 * @param props.recommenderTitle - Optional individual prop for recommender title (alternative to recommender object, used with recommenderName)
 * @param props.recommenderType - Optional individual prop for recommender type ('recommender' or 'zone', defaults to 'recommender')
 * @param props.products - Optional products to use as context (falls back to product from context if available)
 * @param props.args - Optional arguments to pass to the recommender
 *
 * @returns JSX element representing the product recommendation carousel
 */
export default function ProductRecommendations(props: ProductRecommendationsProps): ReactElement | null {
    const recommender = useRecommenderConfig(props);

    if (props.data) {
        return (
            <Suspense fallback={props.fallback ?? null}>
                <Await resolve={props.data} errorElement={null}>
                    {(rec: Recommendation) => (
                        <ProductRecommendationsView
                            recommender={recommender}
                            recommendation={rec}
                            isLoading={false}
                            titleClassName={props.titleClassName}
                            subtitle={props.subtitle}
                            shopAllText={props.shopAllText}
                            className={props.className}
                        />
                    )}
                </Await>
            </Suspense>
        );
    }

    return <ProductRecommendationsClientData {...props} recommender={recommender} />;
}

function useRecommenderConfig({
    recommender: recommenderProp,
    recommenderName: recommenderNameProp,
    recommenderTitle: recommenderTitleProp,
    recommenderType: recommenderTypeProp,
}: Pick<ProductRecommendationsProps, 'recommender' | 'recommenderName' | 'recommenderTitle' | 'recommenderType'>) {
    return useMemo(() => {
        if (recommenderProp) {
            return recommenderProp;
        }
        if (recommenderNameProp || recommenderTitleProp) {
            return {
                name: recommenderNameProp ?? '',
                title: recommenderTitleProp ?? '',
                type: recommenderTypeProp || 'recommender',
            } satisfies RecommenderConfig;
        }
        return null;
    }, [recommenderProp, recommenderNameProp, recommenderTitleProp, recommenderTypeProp]);
}

function ProductRecommendationsClientData({
    recommender,
    products: productsProp,
    args,
    titleClassName,
    subtitle,
    shopAllText,
    className,
}: Omit<ProductRecommendationsProps, 'data' | 'fallback' | 'recommender'> & {
    recommender: RecommenderConfig | null;
}): ReactElement | null {
    const { getRecommendations, getZoneRecommendations, recommendations, isLoading, error } = useRecommenders(true);
    const { currency } = useSite();

    // Try to get product from context if available
    const productFromContext = useProduct();

    // Use products prop if provided, otherwise use product from context if available
    const products = useMemo(() => {
        if (productsProp && productsProp.length > 0) {
            return productsProp;
        }
        if (productFromContext) {
            return [productFromContext as Product];
        }
        return undefined;
    }, [productsProp, productFromContext]);

    // Memoize recommender name and type to prevent unnecessary re-fetches
    const recommenderName = recommender?.name;
    const recommenderType = recommender?.type;

    // Track the last fetch to prevent duplicate calls
    const lastFetchRef = useRef<{
        recommenderName: string;
        recommenderType?: string;
        productsKey?: string;
        argsKey?: string;
        currency?: string;
    } | null>(null);

    // Create a stable key for products array
    const productsKey = useMemo(() => {
        if (!products || products.length === 0) return '';
        return products.map((p) => p.id || p.productId || '').join(',');
    }, [products]);

    // Create a stable key for args
    const argsKey = useMemo(() => {
        if (!args) return '';
        return JSON.stringify(args);
    }, [args]);

    // Reset dedup when fetch functions change (e.g. adapter becomes available)
    useEffect(() => {
        lastFetchRef.current = null;
    }, [getRecommendations, getZoneRecommendations]);

    // Fetch recommendations when component mounts or dependencies change
    useEffect(() => {
        if (!recommenderName) {
            return;
        }

        // Skip if we've already fetched with these exact parameters
        const lastFetch = lastFetchRef.current;
        if (
            lastFetch &&
            lastFetch.recommenderName === recommenderName &&
            lastFetch.recommenderType === recommenderType &&
            lastFetch.productsKey === productsKey &&
            lastFetch.argsKey === argsKey &&
            lastFetch.currency === currency
        ) {
            return;
        }

        // Mark that we're fetching with these parameters
        lastFetchRef.current = {
            recommenderName,
            recommenderType,
            productsKey,
            argsKey,
            currency,
        };

        if (recommenderType === 'zone') {
            void getZoneRecommendations(recommenderName, products, args);
        } else {
            void getRecommendations(recommenderName, products, args);
        }
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [recommenderName, recommenderType, productsKey, argsKey, currency, getRecommendations, getZoneRecommendations]);

    if (error) {
        return null;
    }

    // Only show recommendations if they match this recommender — `useRecommenders` shares
    // state between consumers, so we filter by recommenderName.
    const matchedRecommendation = recommendations?.recommenderName === recommenderName ? recommendations : undefined;

    return (
        <ProductRecommendationsView
            recommender={recommender}
            recommendation={matchedRecommendation}
            isLoading={isLoading}
            titleClassName={titleClassName}
            subtitle={subtitle}
            shopAllText={shopAllText}
            className={className}
        />
    );
}

type ProductRecommendationsViewProps = {
    recommender: RecommenderConfig | null;
    recommendation: Recommendation | undefined;
    isLoading: boolean;
} & Pick<ProductRecommendationsProps, 'titleClassName' | 'subtitle' | 'shopAllText' | 'className'>;

function ProductRecommendationsView({
    recommender,
    recommendation,
    isLoading,
    titleClassName,
    subtitle,
    shopAllText,
    className,
}: ProductRecommendationsViewProps): ReactElement | null {
    // The title can come either from the static recommender config (client/PD path) or from the server response's
    // `displayMessage` (loader/BFF path). Fail closed when neither is present — we never want a headless carousel.
    const analytics = useAnalytics();
    const ref = useRef<HTMLDivElement>(null);
    // Viewport-gated: fire the impression once when the carousel scrolls into view (PWA Kit parity).
    const isOnScreen = useIntersectionObserver(ref, { useOnce: true });

    const recommenderId = recommendation?.recoUUID ?? '';
    const recommenderName = recommendation?.recommenderName ?? recommender?.name ?? '';
    const productRecs = recommendation?.recs;

    useEffect(() => {
        if (isOnScreen && productRecs?.length) {
            void analytics.trackViewRecommender({ recommenderId, recommenderName, products: productRecs });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per resolved recommender; recoUUID keys the impression
    }, [isOnScreen, recommendation?.recoUUID]);

    // Keep the click handler stable so the memoized ProductTiles don't re-render on every parent render.
    // `useAnalytics()` returns a fresh object each render, so read it through a ref instead of a dep.
    const analyticsRef = useRef(analytics);
    analyticsRef.current = analytics;
    const onProductClick = useCallback(
        (product: ShopperSearch.schemas['ProductSearchHit']) =>
            void analyticsRef.current.trackClickProductInRecommender({ recommenderId, recommenderName, product }),
        [recommenderId, recommenderName]
    );

    const title = recommendation?.displayMessage || recommender?.title;
    if (!title) {
        return null;
    }

    if (isLoading) {
        return (
            <div ref={ref}>
                <ProductRecommendationSkeleton title={title} />
            </div>
        );
    }

    if (!productRecs || productRecs.length === 0) {
        return null;
    }

    return (
        <div ref={ref}>
            <ProductCarousel
                products={productRecs}
                title={title}
                titleClassName={titleClassName}
                subtitle={subtitle}
                shopAllText={shopAllText}
                className={className}
                handleProductClick={onProductClick}
            />
        </div>
    );
}
