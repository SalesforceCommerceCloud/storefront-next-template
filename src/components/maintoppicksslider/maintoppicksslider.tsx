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
import { ProductCarouselSkeleton } from '@/components/product-carousel';
import { ProductCarouselWithData } from '@/components/product-carousel/carousel';

interface TopPicksSliderProps {
    /** Streamed products from the home loader (`fetchCarouselProducts`). */
    searchResult?: Promise<ShopperSearch.schemas['ProductSearchResult']>;
}

function FeaturedProductsError() {
    const { t } = useTranslation('home');
    return (
        <p role="alert" className="py-8 text-center text-muted-foreground">
            {t('featuredProducts.loadFailed')}
        </p>
    );
}

/**
 * Home page "Top Picks": real catalog products (price, image, link and delivery date come from
 * `ProductTile`), followed by an "All Products" button that opens the full product list.
 */
export default function TopPicksSlider({ searchResult }: TopPicksSliderProps) {
    const { t } = useTranslation('home');
    const title = t('featuredProducts.title');

    return (
        <section className="w-full max-w-[1900px] mx-auto px-6 lg:px-12 py-8 bg-background font-sans">
            {searchResult && (
                <Suspense fallback={<ProductCarouselSkeleton title={title} />}>
                    <Await resolve={searchResult} errorElement={<FeaturedProductsError />}>
                        {(result) => <ProductCarouselWithData data={result} title={title} />}
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
