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
import type { ComponentProps } from 'react';
import type { ShopperProducts, ShopperExperience } from '@/scapi';
import type { ComponentDesignMetadata } from '@salesforce/storefront-next-runtime/design/react';
import type { ComponentType } from '@/components/region';
import { usePageDesignerMode } from '@salesforce/storefront-next-runtime/design/react/core';
import { Link } from '@/components/link';
import { Component } from '@/lib/decorators/component';
import { AttributeDefinition } from '@/lib/decorators/attribute-definition';
import { cn, resolveAssetUrl } from '@/lib/utils';
import { carouselItemImageWidths } from '@/components/carousel-section';
import { DynamicImage } from '@/components/dynamic-image';
import { toImageUrl } from '@/lib/images/dynamic-image';
import { useTranslation } from 'react-i18next';
import heroImage from '/images/hero-01.webp';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { routes, routeHref } from '@/route-paths';

/**
 * Public-dir path to the shared authoring placeholder. Referenced by URL (not a module import) so
 * the 906-byte SVG is never inlined as a data URI into this home-page component's shopper bundle —
 * a top-level `import … from '/images/…svg'` would inline it and regress the home Lighthouse
 * bundle-size budget. Only ever resolved on the design-mode empty-state path.
 */
const EMPTY_STATE_PLACEHOLDER_SRC = '/images/content-placeholder.svg';

// oxlint-disable-next-line react-refresh/only-export-components
export { loader } from './loaders';

/**
 * Extends Link props (minus `to`, which is hardcoded to the category URL) so that
 * callers can forward attributes such as `className`, `ref`, or `aria-*` directly
 * onto the rendered anchor element via `...rest`.
 */
interface PopularCategoryProps extends Omit<ComponentProps<typeof Link>, 'to'> {
    // Category data from Page Designer (via loader) or programmatic use
    category?: ShopperProducts.schemas['Category'];
    // Whether to display the category description on the card
    showDescription?: boolean;
    /**
     * Where the category name sits relative to the image.
     * - `'overlay'` (default): name overlaid on the image with a gradient scrim and hover "Shop Now".
     * - `'below'`: square image with the name as a plain label beneath it (no scrim, no "Shop Now").
     *   `showDescription` is ignored in this layout.
     * @default 'overlay'
     */
    labelPosition?: 'overlay' | 'below';
    /**
     * `'square'` preserves the default card media frame. `'fill'` lets a parent
     * layout, such as a category mosaic, own the tile's aspect ratio.
     * @default 'square'
     */
    mediaAspectRatio?: 'square' | 'fill';
    // Page Designer props (passed by Component wrapper, must be extracted to avoid passing to DOM)
    regionId?: string;
    page?: ShopperExperience.schemas['Page'];
    component?: ComponentType;
    componentData?: Record<string, Promise<unknown>>;
    designMetadata?: ComponentDesignMetadata;
    // Loader data - full category object fetched by loader
    data?: ShopperProducts.schemas['Category'];
}

/* v8 ignore start - do not test decorators in unit tests, decorator functionality is tested separately*/
@Component('popularCategory', {
    name: 'Category Card',
    description: 'Displays a single category card with image, title, description, and shop now button',
    group: 'Content',
})
// oxlint-disable-next-line react/only-export-components -- oxlint flags the co-exported Page Designer metadata class; eslint-plugin-react-refresh does not
export class PopularCategoryMetadata {
    @AttributeDefinition({
        name: 'Category',
        description: 'Select a category to display',
        type: 'category',
    })
    category?: string;
}
/* v8 ignore stop */

/**
 * PopularCategory component that displays a single category as an image card
 * with gradient overlay, title, description, and hover "Shop Now" animation.
 *
 * When used in Page Designer:
 * - Uses a single 'category' attribute (type: 'category') which stores the category ID
 * - The loader fetches the full category object and passes it via the 'data' prop
 *
 * When used programmatically:
 * - Accepts a full category object via the 'category' prop
 */
export default function PopularCategory({
    category,
    showDescription = false,
    labelPosition = 'overlay',
    mediaAspectRatio = 'square',
    // Page Designer props - extracted to avoid passing to DOM
    regionId: _regionId,
    page: _page,
    component: _component,
    componentData: _componentData,
    designMetadata: _designMetadata,
    // Loader data - full category object fetched by loader
    data,
    className,
    ...rest
}: PopularCategoryProps) {
    const { t } = useTranslation('home');
    const { t: tCommon } = useTranslation('common');
    const config = useConfig();
    const { isDesignMode } = usePageDesignerMode();

    // Use data from loader (Page Designer) or category prop (programmatic use)
    // If category is a string, it's from Page Designer and we should ignore it (wait for loader data)
    // If category is an object, it's programmatic use
    const categoryData = data || (typeof category === 'object' && category !== null ? category : undefined);

    // Empty state (W-23729812): a freshly-dropped Category Card with no category selected yet.
    // Rather than a bespoke placeholder branch, we feed the shared image placeholder plus a default
    // "Category" title through the component's *real* render path — so the authoring preview is the
    // actual card layout (image surface + bottom title over the standard gradient) and cannot drift
    // from a configured card. This is a Page-Designer *authoring* affordance, so it only kicks in
    // during design mode; on the live storefront an unconfigured Category Card still renders nothing,
    // exactly as before. Mirrors the Content Card's and Hero's design-mode gate.
    const showEmptyState = !categoryData && isDesignMode;

    if (!categoryData && !showEmptyState) {
        return null;
    }

    const finalCategoryId = categoryData?.id || '';
    const finalName = showEmptyState ? tCommon('popularCategory.emptyTitle') : categoryData?.name || '';
    const finalDescription = showDescription ? categoryData?.pageDescription || categoryData?.description || '' : '';

    // Determine image URL - priority: category image > category banner > hero fallback.
    // In the empty state, substitute the shared placeholder image.
    const categoryImageUrl =
        (typeof categoryData?.image === 'string' && categoryData.image) ||
        (typeof categoryData?.c_slotBannerImage === 'string' && categoryData.c_slotBannerImage) ||
        undefined;
    const transformedCategoryImage = toImageUrl({ src: categoryImageUrl, config }) ?? categoryImageUrl;
    const finalImageUrl: string = showEmptyState
        ? resolveAssetUrl(EMPTY_STATE_PLACEHOLDER_SRC)
        : transformedCategoryImage || heroImage;

    // 'below' layout: square image with the name as a plain label beneath it (no scrim overlay,
    // no hover "Shop Now"). Used by the footwear activity rail.
    if (labelPosition === 'below') {
        return (
            <Link
                to={routeHref(routes.category, { categoryId: finalCategoryId })}
                className={cn(
                    'group flex flex-col items-center gap-3',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-ui',
                    className
                )}
                {...rest}>
                <div
                    data-slot="category-media"
                    className={cn(
                        'relative w-full overflow-hidden rounded-ui bg-muted',
                        mediaAspectRatio === 'square' ? 'aspect-square' : 'flex-1 min-h-0'
                    )}>
                    {/* Decorative: the adjacent visible label below names the link, so empty alt
                        avoids the category name being announced twice by assistive technology. */}
                    <DynamicImage
                        src={finalImageUrl}
                        alt=""
                        className="h-full w-full"
                        imageProps={{
                            className:
                                'h-full w-full object-cover transition-transform duration-300 group-hover:scale-105',
                        }}
                        widths={carouselItemImageWidths}
                        loading="eager"
                    />
                </div>
                <span data-slot="category-label" className="text-sm font-medium text-foreground group-hover:underline">
                    {finalName}
                </span>
            </Link>
        );
    }

    return (
        <Link
            to={routeHref(routes.category, { categoryId: finalCategoryId })}
            className={cn(
                'block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                className
            )}
            {...rest}>
            <div className="group relative overflow-hidden bg-muted h-full">
                <div
                    data-slot="category-media"
                    className={cn('overflow-hidden', mediaAspectRatio === 'square' ? 'aspect-square' : 'h-full')}>
                    <div className="relative w-full h-full transition-transform duration-500 group-hover:scale-105">
                        {/* Decorative: the overlaid heading below names the link, so empty alt avoids
                            the category name being announced twice by assistive technology. */}
                        <DynamicImage
                            src={finalImageUrl}
                            alt=""
                            className="w-full h-full"
                            imageProps={{ className: 'w-full h-full object-cover' }}
                            widths={carouselItemImageWidths}
                            loading="eager"
                        />
                    </div>
                </div>
                {/*
                 * Scrim for WCAG 1.4.3: the title/description are white and pinned to the bottom edge over an
                 * arbitrary merchant photo. The gradient stays image-visible at the top (to-transparent) but
                 * raises the floor in the lower half so the composited background behind the text stays at or
                 * below ~#707070, keeping white text >=4.5:1 over any image. The image is unchanged. */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent">
                    <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 pt-12 flex flex-col justify-end">
                        <div>
                            <h3 className="text-2xl font-bold leading-[120%] tracking-[-0.6px] text-card mb-1">
                                {finalName}
                            </h3>
                            {finalDescription && <p className="text-sm text-white/90">{finalDescription}</p>}
                        </div>
                        <div className="overflow-hidden max-h-0 transition-[max-height] duration-300 ease-out group-hover:max-h-8 mt-1">
                            <span className="inline-block text-sm font-medium text-primary-foreground">
                                {t('categoryGrid.shopNowButton')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}
