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

import { Suspense } from 'react';
import { Await } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ShopperSearch } from '@/scapi';
import { Link } from '@/components/link';
import { ProductTile, ProductTileProvider } from '@/components/product-tile';
import { Skeleton } from '@/components/ui/skeleton';
import DynamicImageProvider from '@/providers/dynamic-image';

/** One tile per column on desktop. */
const FEATURED_COUNT = 6;
const imageWidths = ['174px', '240px', '288px'];
const dynamicImageProviderValue = { widths: imageWidths };
const gridClassName = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6';

interface MainStartHereProps {
    /** Streamed products from the home loader (`fetchCarouselProducts`). */
    searchResult?: Promise<ShopperSearch.schemas['ProductSearchResult']>;
}

function FeaturedSkeleton() {
    return (
        <div className={gridClassName} aria-hidden>
            {Array.from({ length: FEATURED_COUNT }, (_, i) => (
                <div key={i} className="space-y-3">
                    <Skeleton className="aspect-[4/5] w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/3" />
                </div>
            ))}
        </div>
    );
}

function FeaturedError() {
    const { t } = useTranslation('home');
    return (
        <p role="alert" className="py-8 text-center text-muted-foreground">
            {t('featuredProducts.loadFailed')}
        </p>
    );
}

/**
 * First section under the hero: the first featured products from the catalog (price, image, link and
 * delivery date come from `ProductTile`), replacing the former static promo cards.
 */
export default function MainStartHere({ searchResult }: MainStartHereProps) {
    const { t } = useTranslation('home');
    return (
        <section
            data-testid="featured-products"
            className="w-full max-w-[1900px] mx-auto px-6 lg:px-12 py-12 bg-background font-sans">
            <h2 className="mb-8 text-xl lg:text-3xl font-bold text-foreground tracking-tight">
                {t('featuredProducts.title')}
            </h2>
            {searchResult && (
                <Suspense fallback={<FeaturedSkeleton />}>
                    <Await resolve={searchResult} errorElement={<FeaturedError />}>
                        {(result) => (
                            <ProductTileProvider>
                                <DynamicImageProvider value={dynamicImageProviderValue}>
                                    <div className={gridClassName}>
                                        {(result.hits ?? []).slice(0, FEATURED_COUNT).map((product) => (
                                            <div key={product.productId} className="min-w-0 flex">
                                                <ProductTile
                                                    product={product}
                                                    imgAspectRatio={0.8}
                                                    className="h-full w-full"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </DynamicImageProvider>
                            </ProductTileProvider>
                        )}
                    </Await>
                </Suspense>
            )}
            <div className="mt-8 flex justify-center">
                <Link
                    to="/category/root"
                    data-testid="all-products-button"
                    className="inline-flex items-center justify-center rounded-ui bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
                    {t('featuredProducts.allProducts', { defaultValue: 'All Products' })}
                </Link>
            </div>
        </section>
    );
}
