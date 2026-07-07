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
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShopperSearch } from '@/scapi';
import { CarouselItem } from '@/components/ui/carousel';
import { ProductTile, ProductTileProvider } from '@/components/product-tile';
import DynamicImageProvider from '@/providers/dynamic-image';
import withSuspense from '@/components/with-suspense';
import ProductCarouselSkeleton from './skeleton';
import { cn } from '@/lib/utils';
import type { ComponentType } from '@/components/region';
import { Component } from '@/components/region/component';
import { usePageDesignerMode } from '@salesforce/storefront-next-runtime/design/react/core';
import { CarouselSection } from '@/components/carousel-section';

const carouselItemImageWidths = ['348px', '256px', '256px', '288px'];
const productCarouselItemAspectRatio = 0.8;

// Stable reference so the DynamicImageProvider value never changes between renders.
const dynamicImageProviderValue = { widths: carouselItemImageWidths };

export interface ProductCarouselProps {
    /** Array of product search hits to display in the carousel */
    products: ShopperSearch.schemas['ProductSearchHit'][];
    /** Optional title to display above the carousel */
    title?: string;
    /** Optional subtitle displayed below the title */
    subtitle?: string;
    /** Optional "Shop all" link URL displayed next to the title */
    shopAllUrl?: string;
    /** Optional label for the "Shop all" link. Defaults to "Shop all" */
    shopAllText?: string;
    /** Optional className for the title heading. Defaults to text-2xl md:text-3xl font-normal text-foreground tracking-tight */
    titleClassName?: string;
    /** Optional className to apply to the carousel wrapper */
    className?: string;
    /** Optional Page Designer component for container rendering mode */
    component?: ComponentType;
}

/**
 * ProductCarousel component displays a horizontal carousel of product tiles.
 *
 * This component renders a responsive carousel with navigation controls that displays
 * a collection of products in a scrollable horizontal layout. It's commonly used
 * for featured products, recommendations, or product collections on home and category pages.
 *
 * @param props - The component props
 * @param props.products - Array of product search hits to display in the carousel
 * @param props.title - Optional title to display above the carousel
 * @param props.className - Optional className to apply to the carousel wrapper
 *
 * @returns JSX element representing the product carousel, or a translated "No products found" message
 *
 * @example
 * ```tsx
 * // Basic usage with products array
 * <ProductCarousel
 *   products={searchResult.hits}
 *   title="Featured Products"
 * />
 *
 * // Usage without title
 * <ProductCarousel products={products} />
 *
 * // Usage with custom className
 * <ProductCarousel products={products} className="mt-8" />
 * ```
 *
 * @since 1.0.0
 */
export default function ProductCarousel({
    products,
    title,
    subtitle,
    shopAllUrl,
    shopAllText,
    titleClassName,
    className,
    component,
}: ProductCarouselProps): ReactNode {
    const { t } = useTranslation('product');
    const { isDesignMode } = usePageDesignerMode();
    const productsRegion = component?.regions?.find((region) => region.id === 'products');
    const regionComponents = productsRegion?.components ?? [];
    const resolvedTitle = title || ''; // put empty string as the title since dont currently have i18n for these default values.

    // When there are no products and no region components, only show the prompt in
    // Page Designer design mode (to guide the content author). On the live storefront
    // render nothing to avoid showing a confusing placeholder to shoppers.
    if ((!products || products.length === 0) && regionComponents.length === 0) {
        if (!isDesignMode) {
            return null;
        }
        return (
            <div className={cn('section-container py-6', className)}>
                <div role="status" aria-live="polite">
                    {t('selectProduct')}
                </div>
            </div>
        );
    }

    return (
        <CarouselSection
            title={resolvedTitle}
            subtitle={subtitle}
            shopAllUrl={shopAllUrl}
            shopAllText={shopAllText}
            titleClassName={titleClassName}
            className={className}
            ariaLabel={`${resolvedTitle} carousel`}>
            {regionComponents.length > 0 && productsRegion ? (
                regionComponents.map((comp) => {
                    const typedComp = comp as ComponentType;
                    const key = typedComp.contentLinkUuid ?? typedComp.id;
                    return (
                        <CarouselItem key={key} className="w-[348px] md:w-[256px] 2xl:w-[288px] basis-auto py-1 flex">
                            <div className="w-full max-w-full min-w-0 flex">
                                <Component
                                    component={typedComp}
                                    regionId={productsRegion.id}
                                    className="h-full w-full"
                                />
                            </div>
                        </CarouselItem>
                    );
                })
            ) : (
                <ProductTileProvider>
                    <DynamicImageProvider value={dynamicImageProviderValue}>
                        {products.map((product) => (
                            <CarouselItem
                                key={product.productId}
                                className="w-[348px] md:w-[256px] 2xl:w-[288px] basis-auto py-1 flex">
                                <div className="w-full max-w-full min-w-0 flex">
                                    <ProductTile
                                        product={product}
                                        imgAspectRatio={productCarouselItemAspectRatio}
                                        className="h-full w-full"
                                    />
                                </div>
                            </CarouselItem>
                        ))}
                    </DynamicImageProvider>
                </ProductTileProvider>
            )}
        </CarouselSection>
    );
}

/**
 * ProductCarouselWithSuspense component provides a ProductCarousel wrapped with a Suspense boundary.
 *
 * This component automatically shows the ProductCarouselSkeleton as a fallback while the
 * ProductCarousel is loading, providing better user experience during data fetching.
 *
 * When used with a `resolve` prop, the resolved data should be a ProductSearchResult
 * that will be passed as the `products` prop to the ProductCarousel component.
 *
 * @example
 * ```tsx
 * // Basic usage with Suspense boundary
 * <ProductCarouselWithSuspense
 *   products={searchResult.hits}
 *   title="Featured Products"
 * />
 *
 * // Usage with promise resolution as a prop
 * <ProductCarouselWithSuspense
 *   resolve={searchResultPromise}
 *   title="Featured Products"
 * />
 *
 * // Usage in a page with streaming
 * function HomePage() {
 *   return (
 *     <div>
 *       <Hero />
 *       <ProductCarouselWithSuspense resolve={searchResultPromise} title="Shop Products" />
 *     </div>
 *   );
 * }
 * ```
 */
export const ProductCarouselWithSuspense = withSuspense(ProductCarouselWithData, {
    fallback: (props) => <ProductCarouselSkeleton {...props} />,
});

/**
 * Internal component that handles data transformation for ProductCarousel.
 * This component receives the resolved data and transforms it to the expected format.
 * Only supports ProductSearchResult and ProductSearchHit types for simplicity.
 */
export function ProductCarouselWithData({
    data,
    title,
    ...props
}: {
    data?: ShopperSearch.schemas['ProductSearchResult'] | ShopperSearch.schemas['ProductSearchHit'][];
    title?: string;
    [key: string]: unknown;
}) {
    // If data is provided (from resolve), extract products from it
    if (data) {
        // Handle ProductSearchResult (has hits property)
        if ('hits' in data && Array.isArray(data.hits)) {
            return <ProductCarousel products={data.hits} title={title} {...props} />;
        }

        // Handle direct ProductSearchHit array
        if (Array.isArray(data)) {
            return <ProductCarousel products={data} title={title} {...props} />;
        }
    }

    // If no data or unsupported format, render empty state
    return <ProductCarousel products={[]} title={title} {...props} />;
}
