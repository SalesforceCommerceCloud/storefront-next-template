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
import { Await, useAsyncError } from 'react-router';
import type { ShopperProducts } from '@/scapi';
import { Skeleton } from '@/components/ui/skeleton';
import { CarouselItem } from '@/components/ui/carousel';
import { Component } from '@/lib/decorators/component';
import { AttributeDefinition } from '@/lib/decorators/attribute-definition';
import { RegionDefinition } from '@/lib/decorators';
import { useTranslation } from 'react-i18next';
import { usePageDesignerMode } from '@salesforce/storefront-next-runtime/design/react/core';
import type { NormalizedApiError } from '@/lib/api/normalized-api-error';
// oxlint-disable-next-line react-refresh/only-export-components
export { loader } from './loaders';
import PopularCategory from '@/components/home/popular-category';
import { type ComponentType } from '@/components/region';
import { cn } from '@/lib/utils';
import { Component as RegionComponent } from '@/components/region/component';
import { CarouselSection } from '@/components/carousel-section';
import { compactCategoryItemClassName } from '@/components/home/popular-category/constants';

interface PopularCategoriesProps {
    categoriesPromise?: Promise<ShopperProducts.schemas['Category'][]>;
    parentId?: string;
    /** Compact rows use native horizontal scrolling; carousel remains the default. */
    layout?: 'carousel' | 'row';
    /** Whether the compact row displays its heading; it stays available to screen readers. */
    showHeading?: boolean;
    /** Number of leading category images loaded eagerly. Remaining images use native lazy loading. */
    eagerImageCount?: number;
    imageShape?: 'default' | 'circle';
    imageFit?: 'cover' | 'contain';
    title?: string;
    subtitle?: string;
    /**
     * Heading alignment, forwarded to `CarouselSection`.
     * - `'center'` (default): centered title/subtitle, no shop-all link (the classic categories look).
     * - `'left'`: left-aligned title with an optional shop-all link on the right (see `shopAllUrl`/`shopAllText`).
     * @default 'center'
     */
    titleAlign?: 'left' | 'center';
    /**
     * Optional "shop all" link URL, forwarded to `CarouselSection`.
     * @remarks Only rendered when `titleAlign` is `'left'` (CarouselSection ignores it when centered).
     */
    shopAllUrl?: string;
    /**
     * Optional label for the "shop all" link, forwarded to `CarouselSection`.
     * @remarks Only rendered when `titleAlign` is `'left'`.
     */
    shopAllText?: string;
    /**
     * Center the category cards when they don't fill the track (see
     * `CarouselSection`'s `centerWhenPartial`). Off by default.
     */
    centerWhenPartial?: boolean;
    /**
     * Where each card's name sits relative to its image, forwarded to `PopularCategory`.
     * `'overlay'` (default) keeps the name on the image; `'above'` / `'below'` place it outside.
     * @default 'overlay'
     */
    labelPosition?: 'overlay' | 'above' | 'below';
    /** Image forwarded to category cards that have neither an image nor a banner. */
    fallbackImageUrl?: string;
    // Data prop provided by the Page Designer component loader
    data?: ShopperProducts.schemas['Category'][];
    // Page Designer props
    component?: ComponentType;
}

/* v8 ignore start - do not test decorators in unit tests, decorator functionality is tested separately*/
@Component('popularCategories', {
    name: 'Categories Carousel',
    description:
        'Displays a scrollable row of popular category cards with images, titles, descriptions, and shop now buttons',
    group: 'Layout',
})
@RegionDefinition([
    {
        id: 'categories',
        name: 'Categories',
        description: 'Add Category Card components to display in the scrollable row',
        maxComponents: 12,
        componentTypeInclusions: ['Content.popularCategory'],
    },
])
// oxlint-disable-next-line react/only-export-components -- oxlint flags the co-exported Page Designer metadata class; eslint-plugin-react-refresh does not
export class PopularCategoriesMetadata {
    @AttributeDefinition({
        name: 'Parent Category ID',
        description: 'The parent category ID to fetch child categories from (e.g., root, mens, womens)',
        type: 'category',
    })
    parentId?: string;

    @AttributeDefinition({
        name: 'Title',
        description: 'Optional title text for the category section',
    })
    title?: string;

    @AttributeDefinition({
        name: 'Subtitle',
        description: 'Optional subtitle text for the category section',
    })
    subtitle?: string;

    @AttributeDefinition({ type: 'enum', values: ['overlay', 'above', 'below'], defaultValue: 'overlay' })
    labelPosition?: string;

    @AttributeDefinition({ type: 'enum', values: ['default', 'circle'], defaultValue: 'default' })
    imageShape?: string;

    @AttributeDefinition({ type: 'enum', values: ['cover', 'contain'], defaultValue: 'cover' })
    imageFit?: string;
}
/* v8 ignore stop */

const itemClassName = 'w-[348px] md:w-[256px] 2xl:w-[288px] basis-auto py-1 flex';

/**
 * Number of placeholder Category Cards rendered in the Page Designer design-mode empty state
 * (W-23729836) so a freshly-dropped, unconfigured Categories Carousel reads as a real carousel row
 * rather than an empty section. Enough to fill the track past the viewport edge at wide breakpoints,
 * so the row reads as a scrollable carousel rather than a short, centered cluster.
 */
const EMPTY_STATE_PLACEHOLDER_COUNT = 8;

function CategoriesError() {
    const error = useAsyncError() as NormalizedApiError;
    const { t } = useTranslation('home');
    return (
        <div role="alert" className="py-8 text-center text-muted-foreground">
            <p>{t('categoryGrid.loadFailed')}</p>
            {import.meta.env.DEV && (
                <div className="mt-2 text-xs font-mono text-muted-foreground/70">
                    {error.status && <span>{error.status}</span>}
                    {error.message && <p>{error.message}</p>}
                </div>
            )}
        </div>
    );
}

/**
 * Skeleton shown while categoriesPromise is resolving
 */
function CategoryCardsSkeleton({ layout }: { layout?: 'carousel' | 'row' }) {
    if (layout === 'row')
        return (
            <div className="section-container flex gap-3.5 overflow-hidden py-3" aria-hidden="true">
                {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className={compactCategoryItemClassName}>
                        <Skeleton className="aspect-square rounded-full" />
                        <Skeleton className="mt-3 h-4 w-full" />
                    </div>
                ))}
            </div>
        );
    return (
        <div className="section-container py-6">
            <div className="flex -ml-4 overflow-hidden py-6">
                {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={cn(itemClassName, 'shrink-0 grow-0')}>
                        <Skeleton className="aspect-square w-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Renders a single category as a CarouselItem
 */
function CategoryItem({
    category,
    labelPosition,
    fallbackImageUrl,
    imageShape,
    imageFit,
    layout,
    imageLoading,
}: {
    category: ShopperProducts.schemas['Category'];
    labelPosition?: 'overlay' | 'above' | 'below';
    fallbackImageUrl?: string;
    imageShape?: 'default' | 'circle';
    imageFit?: 'cover' | 'contain';
    layout?: 'carousel' | 'row';
    imageLoading: 'eager' | 'lazy';
}) {
    const card = (
        <div className="w-full max-w-full min-w-0 flex">
            <PopularCategory
                category={category}
                size={layout === 'row' ? 'compact' : 'default'}
                imageLoading={imageLoading}
                labelPosition={labelPosition}
                fallbackImageUrl={fallbackImageUrl}
                imageShape={imageShape}
                imageFit={imageFit}
                className={cn('h-full w-full', layout === 'row' && 'text-center')}
            />
        </div>
    );
    return layout === 'row' ? (
        <li className={compactCategoryItemClassName}>{card}</li>
    ) : (
        <CarouselItem className={itemClassName}>{card}</CarouselItem>
    );
}

function CategoryCollection({
    layout,
    showHeading,
    children,
    ...sectionProps
}: React.ComponentProps<typeof CarouselSection> & {
    layout?: 'carousel' | 'row';
    showHeading?: boolean;
}) {
    if (layout !== 'row') return <CarouselSection {...sectionProps}>{children}</CarouselSection>;
    return (
        <nav data-slot="categories-row" className="section-container py-3" aria-label={sectionProps.ariaLabel}>
            <h2 className={showHeading ? 'mb-4 text-xl font-bold' : 'sr-only'}>{sectionProps.title}</h2>
            <ul className="-mx-4 flex gap-3.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:justify-between">
                {children}
            </ul>
        </nav>
    );
}

/**
 * Content component that renders the category carousel.
 * Handles prioritization: Page Designer mode > data > categoriesPromise
 */
function CategoryGridContent({
    data,
    categoriesPromise,
    component,
    title,
    subtitle,
    titleAlign,
    shopAllUrl,
    shopAllText,
    centerWhenPartial,
    labelPosition,
    fallbackImageUrl,
    layout,
    showHeading,
    imageShape,
    imageFit,
    eagerImageCount,
}: {
    data?: ShopperProducts.schemas['Category'][];
    categoriesPromise?: Promise<ShopperProducts.schemas['Category'][]>;
    component?: ComponentType;
    title?: string;
    subtitle?: string;
    titleAlign?: 'left' | 'center';
    shopAllUrl?: string;
    shopAllText?: string;
    centerWhenPartial?: boolean;
    labelPosition?: 'overlay' | 'above' | 'below';
    fallbackImageUrl?: string;
    layout?: 'carousel' | 'row';
    showHeading?: boolean;
    imageShape?: 'default' | 'circle';
    imageFit?: 'cover' | 'contain';
    eagerImageCount: number;
}) {
    const { t } = useTranslation('home');
    const { isDesignMode } = usePageDesignerMode();
    const resolvedTitle = title || t('categoryGrid.title');
    const resolvedSubtitle = subtitle || t('categoryGrid.description');
    const ariaLabel = resolvedTitle;

    const sectionProps = {
        title: resolvedTitle,
        subtitle: resolvedSubtitle,
        // Default to the classic centered look; `titleAlign="left"` opts into a shop-all link.
        titleAlign: titleAlign ?? 'center',
        shopAllUrl,
        shopAllText,
        centerWhenPartial,
        ariaLabel,
        layout,
        showHeading,
    };

    // Empty-state heading: a neutral authoring placeholder, never the brand copy. The live carousel
    // is titled with the merchant's default (`categoryGrid.title` = "Style for Real Life") and its
    // marketing subtitle; leaking those into an *unconfigured* card reads as real content. A
    // merchant-set title still wins, otherwise we show the generic "Add your title here" heading
    // (shared wording with the Content Card empty state), left-aligned and with no subtitle.
    const emptyStateTitle = title || t('categoryGrid.emptyTitle');
    const emptyStateSectionProps = {
        title: emptyStateTitle,
        subtitle,
        titleAlign: 'left' as const,
        centerWhenPartial,
        // Accessible name for the region: the visible heading is a bare edit prompt ("Add your title
        // here"), so labelling the landmark with it would announce the region as an editing hint
        // rather than its purpose (WCAG 2.4.6). Use the merchant's title when set, otherwise a
        // descriptive "Categories carousel" — the heading stays the neutral placeholder either way.
        ariaLabel: title || t('categoryGrid.emptyRegionLabel'),
        layout,
        showHeading,
    };

    // Determine if we should use Page Designer components or fallback categories
    const hasRegions = component?.regions && component.regions.length > 0;
    const categoriesRegion = component?.regions?.find((r) => r.id === 'categories');
    const hasComponents = (categoriesRegion?.components?.length ?? 0) > 0;
    const shouldUseFallback = !component || !hasRegions || !hasComponents;

    if (!shouldUseFallback && categoriesRegion && categoriesRegion.components) {
        return (
            <CategoryCollection {...sectionProps}>
                {categoriesRegion.components.map((comp, index) => {
                    const typedComp = comp as ComponentType;
                    const key = typedComp.contentLinkUuid ?? typedComp.id;
                    const card = (
                        <div className="w-full max-w-full min-w-0 flex">
                            <RegionComponent
                                component={
                                    {
                                        ...typedComp,
                                        data: {
                                            ...typedComp.data,
                                            imageLoading: index < eagerImageCount ? 'eager' : 'lazy',
                                            ...(layout === 'row' ? { size: 'compact' } : {}),
                                            ...(labelPosition ? { labelPosition } : {}),
                                            ...(imageShape ? { imageShape } : {}),
                                            ...(imageFit ? { imageFit } : {}),
                                        },
                                    } as unknown as ComponentType
                                }
                                regionId="categories"
                                className="h-full w-full"
                            />
                        </div>
                    );
                    return layout === 'row' ? (
                        <li key={key} className={compactCategoryItemClassName}>
                            {card}
                        </li>
                    ) : (
                        <CarouselItem key={key} className={itemClassName}>
                            {card}
                        </CarouselItem>
                    );
                })}
            </CategoryCollection>
        );
    }

    if (data && Array.isArray(data) && data.length > 0) {
        return (
            <CategoryCollection {...sectionProps}>
                {data.map((category, index) => (
                    <CategoryItem
                        key={category.id}
                        category={category}
                        imageLoading={index < eagerImageCount ? 'eager' : 'lazy'}
                        labelPosition={labelPosition}
                        fallbackImageUrl={fallbackImageUrl}
                        layout={layout}
                        imageShape={imageShape}
                        imageFit={imageFit}
                    />
                ))}
            </CategoryCollection>
        );
    }

    if (categoriesPromise) {
        return (
            <Suspense fallback={<CategoryCardsSkeleton layout={layout} />}>
                <Await resolve={categoriesPromise} errorElement={<CategoriesError />}>
                    {(categories) => (
                        <CategoryCollection {...sectionProps}>
                            {categories.map((category: ShopperProducts.schemas['Category'], index: number) => (
                                <CategoryItem
                                    key={category.id}
                                    category={category}
                                    imageLoading={index < eagerImageCount ? 'eager' : 'lazy'}
                                    labelPosition={labelPosition}
                                    fallbackImageUrl={fallbackImageUrl}
                                    layout={layout}
                                    imageShape={imageShape}
                                    imageFit={imageFit}
                                />
                            ))}
                        </CategoryCollection>
                    )}
                </Await>
            </Suspense>
        );
    }

    // Empty state (W-23729836): a freshly-dropped, unconfigured Categories Carousel with no cards yet.
    // Rather than a bespoke placeholder, we feed empty `PopularCategory` (Category Card) children
    // through the *real* CarouselSection render path — each renders its own design-mode empty state
    // (placeholder image + default "Category" title). This keeps the authoring preview identical to a
    // configured carousel and cannot drift from it. Page-Designer *authoring* affordance only: on the
    // live storefront an unconfigured carousel still renders nothing, exactly as before.
    if (isDesignMode) {
        return (
            <CategoryCollection {...emptyStateSectionProps}>
                {Array.from({ length: EMPTY_STATE_PLACEHOLDER_COUNT }, (_, i) =>
                    layout === 'row' ? (
                        <li key={i} className={compactCategoryItemClassName}>
                            <PopularCategory
                                size="compact"
                                labelPosition={labelPosition}
                                imageShape={imageShape}
                                imageFit={imageFit}
                                className="h-full w-full"
                            />
                        </li>
                    ) : (
                        <CarouselItem key={i} className={itemClassName}>
                            <div className="w-full max-w-full min-w-0 flex">
                                <PopularCategory
                                    labelPosition={labelPosition}
                                    imageShape={imageShape}
                                    imageFit={imageFit}
                                    className="h-full w-full"
                                />
                            </div>
                        </CarouselItem>
                    )
                )}
            </CategoryCollection>
        );
    }

    return null;
}

/**
 * Popular Categories component that displays a horizontally scrollable carousel of category cards.
 *
 * Can be used in multiple ways:
 * 1. With categoriesPromise - receives pre-fetched categories from route loader
 * 2. With data prop - receives categories from Page Designer component loader
 * 3. With parentId - triggers component loader to fetch categories (used in Page Designer)
 */
export default function PopularCategories({
    categoriesPromise,
    data,
    component,
    title,
    subtitle,
    titleAlign,
    shopAllUrl,
    shopAllText,
    centerWhenPartial,
    labelPosition,
    fallbackImageUrl,
    layout = 'carousel',
    showHeading = true,
    eagerImageCount = 4,
    imageShape,
    imageFit,
}: PopularCategoriesProps) {
    return (
        <section className={layout === 'row' ? undefined : 'bg-muted/50'}>
            <CategoryGridContent
                data={data}
                categoriesPromise={categoriesPromise}
                component={component}
                title={title}
                subtitle={subtitle}
                titleAlign={titleAlign}
                shopAllUrl={shopAllUrl}
                shopAllText={shopAllText}
                centerWhenPartial={centerWhenPartial}
                labelPosition={labelPosition}
                fallbackImageUrl={fallbackImageUrl}
                layout={layout}
                showHeading={showHeading}
                eagerImageCount={eagerImageCount}
                imageShape={imageShape}
                imageFit={imageFit}
            />
        </section>
    );
}
