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
import { type ReactElement, type Ref, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
// @sfdc-extension-line SFDC_EXT_BOPIS
import { useShowPickupAvailable } from './use-pickup-filter';
import type { ShopperSearch } from '@/scapi';
import DynamicImageProvider from '@/providers/dynamic-image';
import { ProductTile, ProductTileProvider } from '@/components/product-tile';
import { ProductTileSkeleton } from '@/components/category-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

type ProductSearchHit = ShopperSearch.schemas['ProductSearchHit'];

// Responsive size of the product images in the product grid when the refinement panel is visible.
// Values are based on the grid column configuration and refinement panel width
// (w-64 + gap-8 --> 256px + 32px = 288px).
const responsiveImageWidthsWithRefinements = [
    '40vw', // base: 2 grid columns, no refinement panel, ~(100vw - col padding) / 2 ≈ 40% of vw
    '25vw', // sm:   3 grid columns, no refinement panel, ~(100vw - col padding) / 3 ≈ 25% of vw
    '18vw', // md:   4 grid columns, no refinement panel, ~(100vw - col padding) / 4 ≈ 18% of vw
    '14vw', // lg:   4 grid columns, refinement panel, ~(100vw − 288px − col padding) / 4 ≈ 14% of vw
    '16vw', // xl:   4 grid columns, refinement panel, ~(100vw − 288px − col padding) / 4 ≈ 16% of vw
    '16vw', // 2xl:  4 grid columns, refinement panel, ~(100vw − 288px − col padding) / 4 ≈ 16% of vw
];

// Responsive size of product images when refinements panel is collapsed.
const responsiveImageWidthsWithoutRefinements = [
    '40vw', // base: 2 grid columns, no refinement panel, ~(100vw - col padding) / 2 ≈ 40% of vw
    '25vw', // sm:   3 grid columns, no refinement panel, ~(100vw - col padding) / 3 ≈ 25% of vw
    '18vw', // md:   4 grid columns, no refinement panel, ~(100vw - col padding) / 4 ≈ 18% of vw
    '18vw', // lg:   4 grid columns, no refinement panel, ~(100vw - col padding) / 4 ≈ 18% of vw
    '20vw', // xl:   4 grid columns, no refinement panel, ~(100vw - col padding) / 4 ≈ 20% of vw
    '20vw', // 2xl:  4 grid columns, no refinement panel, ~(100vw - col padding) / 4 ≈ 20% of vw
];

function NoProductsMessage({ criticalSize, nonCriticalSize }: { criticalSize: number; nonCriticalSize: number }) {
    const { t } = useTranslation('common');

    if (criticalSize > 0 || nonCriticalSize > 0) {
        return null;
    }
    return (
        <div className="col-span-full text-center py-12">
            <p className="text-sm text-muted-foreground">{t('noProductsFound')}</p>
        </div>
    );
}

function NonCriticalContent({
    products,
    criticalSize,
    responsiveImageWidths,
    handleProductClick,
    topCategoryName,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    showPickupAvailable,
}: {
    products: ProductSearchHit[];
    criticalSize: number;
    responsiveImageWidths: string[];
    handleProductClick?: (product: ProductSearchHit) => void;
    topCategoryName?: string;
    // @sfdc-extension-line SFDC_EXT_BOPIS
    showPickupAvailable?: boolean;
}) {
    return (
        <DynamicImageProvider value={{ widths: responsiveImageWidths }}>
            {products.map((product) => (
                <ProductTile
                    key={product.productId}
                    product={product}
                    handleProductClick={handleProductClick}
                    showNavigationArrows
                    topCategoryName={topCategoryName}
                    // @sfdc-extension-line SFDC_EXT_BOPIS
                    showPickupAvailable={showPickupAvailable}
                />
            ))}
            <NoProductsMessage criticalSize={criticalSize} nonCriticalSize={products.length} />
        </DynamicImageProvider>
    );
}

function ProductGridSkeleton({ count = 8 }: { count?: number }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-8">
            {Array.from({ length: count }, (_, index) => (
                <div key={`grid-skeleton-${index}`} className="space-y-3">
                    <Skeleton className="aspect-square w-full" />
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-5 w-20" />
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * ProductGrid renders product tiles in a responsive grid layout, wrapping all tiles in a shared
 * context provider to reduce hydration overhead. Instead of each tile initializing its own hooks
 * (navigate, config, translation, currency), the provider initializes them once and shares them
 * via context.
 *
 * The grid accepts synchronous data for both critical (above-the-fold) and non-critical
 * (below-the-fold) products. Critical product images are loaded with high priority and eagerly.
 * For deferred loading of non-critical products, use DeferredProductGrid.
 */
export default function ProductGrid({
    critical,
    nonCritical,
    appended,
    firstNewIndex,
    firstNewItemRef,
    appendPending = false,
    hasRefinementsPanel = true,
    handleProductClick,
    topCategoryName,
    isLoading = false,
    skeletonCount,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    showPickupAvailable: showPickupAvailableProp,
}: {
    critical?: ProductSearchHit[];
    nonCritical?: ProductSearchHit[];
    /**
     * Products appended after the initial page via the "Load more" / infinite-scroll control. Rendered
     * inside the same grid container as critical/non-critical tiles so the whole listing flows as one grid.
     */
    appended?: ProductSearchHit[];
    /** Index within `appended` of the first tile of the most recent batch — receives `firstNewItemRef`. */
    firstNewIndex?: number | null;
    /** Ref attached to the first newly appended tile so focus can move to it after a "load more". */
    firstNewItemRef?: Ref<HTMLDivElement>;
    /** Whether a "load more" fetch is in flight — sets `aria-busy` on the grid for assistive tech. */
    appendPending?: boolean;
    hasRefinementsPanel?: boolean;
    handleProductClick?: (product: ProductSearchHit) => void;
    topCategoryName?: string;
    isLoading?: boolean;
    skeletonCount?: number;
    // @sfdc-extension-line SFDC_EXT_BOPIS
    showPickupAvailable?: boolean;
}): ReactElement {
    const criticalData = critical ?? [];
    const l = criticalData.length;
    const responsiveImageWidths = hasRefinementsPanel
        ? responsiveImageWidthsWithRefinements
        : responsiveImageWidthsWithoutRefinements;

    // Initialize the `<DynamicImageProvider/>` behavior for the scope of this grid.
    // Out-of-the-box we make sure that the product images of all products considered critical (displayed inside a
    // `<DynamicImage/>` component) should be loaded eagerly with high priority.
    const hasSource = useCallback(() => true, []);

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    const pickupFromUrl = useShowPickupAvailable();
    const showPickupAvailable = showPickupAvailableProp ?? pickupFromUrl;
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    const loadingSkeletonCount = Math.max(criticalData.length + (nonCritical?.length ?? 0), 4);

    if (isLoading) {
        return (
            <ProductTileProvider>
                <div data-testid="product-grid-loading-state" aria-busy>
                    <ProductGridSkeleton count={loadingSkeletonCount} />
                </div>
            </ProductTileProvider>
        );
    }

    return (
        <ProductTileProvider>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-8" aria-busy={appendPending}>
                {l > 0 && (
                    <DynamicImageProvider value={{ hasSource, widths: responsiveImageWidths }}>
                        {criticalData.map((product) => (
                            <ProductTile
                                key={product.productId}
                                product={product}
                                handleProductClick={handleProductClick}
                                showNavigationArrows
                                topCategoryName={topCategoryName}
                                // @sfdc-extension-line SFDC_EXT_BOPIS
                                showPickupAvailable={showPickupAvailable}
                            />
                        ))}
                    </DynamicImageProvider>
                )}
                {nonCritical && nonCritical.length > 0 && (
                    <NonCriticalContent
                        products={nonCritical}
                        criticalSize={l}
                        responsiveImageWidths={responsiveImageWidths}
                        handleProductClick={handleProductClick}
                        topCategoryName={topCategoryName}
                        // @sfdc-extension-line SFDC_EXT_BOPIS
                        showPickupAvailable={showPickupAvailable}
                    />
                )}
                {appended && appended.length > 0 && (
                    <DynamicImageProvider value={{ hasSource, widths: responsiveImageWidths }}>
                        {appended.map((product, index) => (
                            <ProductTile
                                // The first tile of the most recently loaded batch gets a ref so the route
                                // can move focus to it after a "load more" (accessibility). All appended
                                // tiles fade in (200ms) to signal "these are new" without being distracting.
                                ref={index === firstNewIndex ? firstNewItemRef : undefined}
                                key={product.productId}
                                product={product}
                                handleProductClick={handleProductClick}
                                showNavigationArrows
                                topCategoryName={topCategoryName}
                                className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
                                // @sfdc-extension-line SFDC_EXT_BOPIS
                                showPickupAvailable={showPickupAvailable}
                            />
                        ))}
                    </DynamicImageProvider>
                )}
                {(skeletonCount ?? 0) > 0 &&
                    Array.from({ length: skeletonCount ?? 0 }, (_, i) => <ProductTileSkeleton key={`skeleton-${i}`} />)}
                {!skeletonCount && (
                    <NoProductsMessage
                        criticalSize={l + (appended?.length ?? 0)}
                        nonCriticalSize={nonCritical?.length ?? 0}
                    />
                )}
            </div>
        </ProductTileProvider>
    );
}
