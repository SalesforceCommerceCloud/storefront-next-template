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
import { Await, redirect, useAsyncError } from 'react-router';
import type { Route } from './+types/_app._index';
import type { ShopperProducts, ShopperSearch } from '@/scapi';
import { fetchCarouselProducts } from '@/components/product-carousel/loaders';
import { fetchCategories } from '@/lib/api/categories.server';
import { siteContext, resolvePrefix, type SiteContext } from '@salesforce/storefront-next-runtime/site-context';
import { Region } from '@/components/region';
import PopularCategories from '@/components/home/popular-categories';
import ContentCard from '@/components/content-card';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { PageType } from '@/lib/decorators/page-type';
import { RegionDefinition } from '@/lib/decorators/region-definition';

import { fetchPageWithComponentData } from '@/lib/page-designer/page-loader.server';
import { getLogger } from '@/lib/logger.server';

import hero01 from '/images/hero-01.webp';
import hero02 from '/images/hero-02.webp';
import hero03 from '/images/hero-03.webp';
import hero04 from '/images/hero-04.webp';
import HeroCarousel, { HeroCarouselSkeleton, type HeroSlide } from '@/components/hero-carousel';
import { ProductCarouselSkeleton } from '@/components/product-carousel';
import { ProductCarouselWithData } from '@/components/product-carousel/carousel';
import { SeoMeta } from '@/components/seo-meta';
import { buildCanonicalUrl } from '@/utils/canonical-url';
import { useTranslation } from 'react-i18next';
import type { NormalizedApiError } from '@/lib/api/normalized-api-error';

export { shouldRevalidate } from '@/lib/revalidation/routes/home';

@PageType({
    name: 'Home Page',
    description: 'Main landing page with hero carousel, featured products, and help sections',
    supportedAspectTypes: [],
})
@RegionDefinition([
    {
        id: 'headerbanner',
        name: 'Header Banner Region',
        description: 'Region for promotional banners and hero content',
        maxComponents: 3,
    },
    {
        id: 'main',
        name: 'Main Content Region',
        description: 'Region for main content',
        maxComponents: 10,
    },
])
export class HomePageMetadata {}

function FeaturedProductsError() {
    const error = useAsyncError() as NormalizedApiError;
    const { t } = useTranslation('home');
    return (
        <div role="alert" className="py-8 text-center text-muted-foreground">
            <p>{t('featuredProducts.loadFailed')}</p>
            {import.meta.env.DEV && (
                <div className="mt-2 text-xs font-mono text-muted-foreground/70">
                    {error.status && <span>{error.status}</span>}
                    {error.message && <p>{error.message}</p>}
                </div>
            )}
        </div>
    );
}

export type HomePageData = {
    page: ReturnType<typeof fetchPageWithComponentData>;
    searchResult: Promise<ShopperSearch.schemas['ProductSearchResult']>;
    categories: Promise<ShopperProducts.schemas['Category'][]>;
    pageUrl: string;
    ogImageUrl: string;
};

/**
 * Server-side loader function that fetches home page data.
 * This function runs on the server during SSR and prepares data for the home page.
 * @returns Promise that resolves to an object containing search result promise
 */
export function loader(args: Route.LoaderArgs): HomePageData {
    const logger = getLogger(args.context);
    logger.debug('HomePage: loader starting');

    const config = getConfig(args.context);
    const requestUrl = new URL(args.request.url);

    // Redirect bare "/" to the default site/locale prefixed homepage
    if (requestUrl.pathname === '/' && config.url?.prefix && config.url.prefix !== '/') {
        const siteRef = config.siteAliasMap?.[config.defaultSiteId] ?? config.defaultSiteId;
        const defaultSite = config.commerce.sites.find((s) => s.id === config.defaultSiteId);
        const defaultLocale = defaultSite?.defaultLocale ?? config.i18n.fallbackLng;
        const localeRef = config.localeAliasMap?.[defaultLocale] ?? defaultLocale;
        const prefixedPath = resolvePrefix({
            prefix: config.url.prefix,
            params: { siteId: siteRef, localeId: localeRef },
        });
        throw redirect(`${prefixedPath}/`);
    }

    const currency = (args.context.get(siteContext) as SiteContext).currency;
    const pageUrl = buildCanonicalUrl(requestUrl.origin, requestUrl.pathname, requestUrl.search);

    return {
        page: fetchPageWithComponentData(args, {
            pageId: 'homepage',
        }),
        searchResult: fetchCarouselProducts(args.context, {
            categoryId: 'root',
            limit: config.pages.home.featuredProductsCount,
            currency: currency ?? undefined,
        }),
        categories: fetchCategories(args.context, 'root', 1),
        pageUrl,
        ogImageUrl: new URL(hero01, requestUrl.origin).href,
    };
}

/**
 * Home page component that displays the home page content with granular Suspense boundaries.
 * Components within the page handle their own Suspense boundaries for progressive loading.
 * @returns JSX element representing the home page layout
 */
export default function HomePage({ loaderData }: { loaderData: HomePageData }) {
    const { t } = useTranslation('home');

    const heroSlides: HeroSlide[] = [
        {
            id: 'slide-1',
            title: t('hero.slide1.title'),
            subtitle: t('hero.slide1.subtitle'),
            imageUrl: hero01,
            imageAlt: t('hero.slide1.imageAlt'),
            ctaText: t('hero.slide1.ctaText'),
            ctaLink: '/category/root',
            overlayPosition: 'Middle Center',
            overlayAlignment: 'center',
        },
        {
            id: 'slide-2',
            title: t('hero.slide2.title'),
            subtitle: t('hero.slide2.subtitle'),
            imageUrl: hero02,
            imageAlt: t('hero.slide2.imageAlt'),
            ctaText: t('hero.slide2.ctaText'),
            ctaLink: '/category/root',
            overlayPosition: 'Middle Center',
            overlayAlignment: 'center',
        },
        {
            id: 'slide-3',
            title: t('hero.slide3.title'),
            subtitle: t('hero.slide3.subtitle'),
            imageUrl: hero03,
            imageAlt: t('hero.slide3.imageAlt'),
            ctaText: t('hero.slide3.ctaText'),
            ctaLink: '/category/root',
            overlayPosition: 'Middle Center',
            overlayAlignment: 'center',
        },
        {
            id: 'slide-4',
            title: t('hero.slide4.title'),
            subtitle: t('hero.slide4.subtitle'),
            imageUrl: hero04,
            imageAlt: t('hero.slide4.imageAlt'),
            ctaText: t('hero.slide4.ctaText'),
            ctaLink: '/category/root',
            overlayPosition: 'Middle Center',
            overlayAlignment: 'center',
        },
    ];

    return (
        <>
            <div className="pb-16 -mt-8">
                <h1 className="sr-only">{t('meta.title', { defaultValue: 'NextGen PWA Kit Store' })}</h1>
                <SeoMeta
                    rawTitle
                    title={t('meta.title', { defaultValue: 'NextGen PWA Kit Store' })}
                    description={t('meta.description', {
                        defaultValue: 'Welcome to our web store for high performers!',
                    })}
                    openGraph={{
                        type: 'website',
                        url: loaderData.pageUrl,
                        image: loaderData.ogImageUrl,
                    }}
                />
                {/* Header Banner Region - Region component handles its own Suspense internally */}
                <div>
                    <Region
                        page={loaderData.page}
                        regionId="headerbanner"
                        fallbackElement={
                            <>
                                {/* Provide fallback skeletons for the above the fold content */}
                                <HeroCarouselSkeleton showDots={true} showNavigation={true} />
                                <ProductCarouselSkeleton title={t('featuredProducts.title')} />
                            </>
                        }
                        errorElement={
                            <>
                                <HeroCarousel
                                    slides={heroSlides}
                                    autoPlay={true}
                                    autoPlayInterval={6000}
                                    showNavigation={true}
                                    showDots={true}
                                />

                                {/* Featured Products */}
                                <Suspense fallback={<ProductCarouselSkeleton title={t('featuredProducts.title')} />}>
                                    <Await resolve={loaderData.searchResult} errorElement={<FeaturedProductsError />}>
                                        {(searchResult) => (
                                            <ProductCarouselWithData
                                                data={searchResult}
                                                title={t('featuredProducts.title')}
                                                shopAllUrl="/category/root"
                                                shopAllText={t('featuredProducts.shopAll')}
                                            />
                                        )}
                                    </Await>
                                </Suspense>
                            </>
                        }
                    />
                </div>

                {/* Main Region - Region component handles its own Suspense internally */}
                {/* Note: This region doesn't provide fallback skeletons right now as it's located below the fold */}
                <Region
                    page={loaderData.page}
                    regionId="main"
                    errorElement={
                        <>
                            {/* Popular Categories - full-width section with its own gray bg and container */}
                            <PopularCategories categoriesPromise={loaderData.categories} />

                            {/* Featured Content Cards - Static content */}
                            <div className="pt-16">
                                <div className="section-container">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <ContentCard
                                            title={t('featuredContent.women.title')}
                                            description={t('featuredContent.women.description')}
                                            imageUrl={hero03}
                                            imageAlt={t('featuredContent.women.imageAlt')}
                                            buttonText={t('featuredContent.women.ctaText')}
                                            buttonAriaLabel={t('featuredContent.women.ctaAriaLabel')}
                                            buttonLink="/category/womens"
                                            showBackground={false}
                                            showBorder={false}
                                            loading="lazy"
                                        />
                                        <ContentCard
                                            title={t('featuredContent.men.title')}
                                            description={t('featuredContent.men.description')}
                                            imageUrl={hero04}
                                            imageAlt={t('featuredContent.men.imageAlt')}
                                            buttonText={t('featuredContent.men.ctaText')}
                                            buttonAriaLabel={t('featuredContent.men.ctaAriaLabel')}
                                            buttonLink="/category/mens"
                                            showBackground={false}
                                            showBorder={false}
                                            loading="lazy"
                                        />
                                    </div>

                                    {/* Text-only card below women/men cards */}
                                    <div className="mt-16 max-w-4xl mx-auto layout-gutter text-center">
                                        <ContentCard
                                            title={t('featuredContent.styleForRealLife.title')}
                                            description={t('featuredContent.styleForRealLife.description')}
                                            showBackground={false}
                                            showBorder={false}
                                            cardFooterClassName="items-center text-center p-0"
                                            cardDescriptionClassName="text-center"
                                            className="[&_h3]:text-3xl [&_h3]:md:text-4xl [&_h3]:font-normal [&_h3]:text-brand-black [&_h3]:mb-6 [&_h3]:tracking-tight [&_p]:text-sm [&_p]:text-brand-gray-700 [&_p]:leading-relaxed [&_p]:font-normal [&_p:last-of-type]:text-base [&_p:last-of-type]:text-brand-gray-600"
                                        />
                                    </div>
                                </div>
                            </div>
                        </>
                    }
                />
            </div>
        </>
    );
}
