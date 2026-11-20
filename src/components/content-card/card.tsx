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
import { forwardRef, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageDesignerMode } from '@salesforce/storefront-next-runtime/design/react/core';
import contentPlaceholder from '/images/content-placeholder.svg';
import { Link } from '@/components/link';
import {
    TITLE_TYPOGRAPHY_CLASS,
    DESCRIPTION_TYPOGRAPHY_CLASS,
    normalizeTypography,
} from '@/components/content-card/typography';
import type { ComponentDesignMetadata } from '@salesforce/storefront-next-runtime/design/react';
import { cn, resolveAssetUrl } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import DynamicImage from '@/components/dynamic-image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { typographyVariants } from '@/components/typography';
import { type Image } from '@/types';
import type { ComponentType } from '@/components/region';

const contentCardDefaults = { showBackground: true, showBorder: true } as const;

export type ContentCardLayout = 'overlay' | 'split' | 'stack' | 'prose' | 'callout' | 'tile' | 'image';

const EDITORIAL_LAYOUTS: ReadonlySet<ContentCardLayout> = new Set(['split', 'stack', 'prose', 'callout', 'tile']);

export interface ContentCardProps extends ComponentProps<'div'> {
    /** Campaign uses a compact image-overlay presentation with an underlined text CTA. */
    variant?: 'default' | 'campaign';
    title?: string;
    titleTypography?: string;
    description?: string;
    descriptionTypography?: string;
    imageUrl?: Image | string;
    imageAlt?: string;
    /** Media presentation for route compositions and authored cards. */
    imageFit?: 'cover' | 'contain';
    imagePosition?: 'start' | 'end';
    stackOnMobile?: boolean;
    /** Token-based media styling for route compositions. */
    mediaClassName?: string;
    buttonText?: string;
    buttonLink?: string;
    /**
     * Accessible name for the CTA link. Use when the visible buttonText (e.g. "Explore
     * collection") is repeated across cards and so does not describe its own destination.
     * WCAG 2.4.4.
     */
    buttonAriaLabel?: string;
    showBackground?: boolean;
    showBorder?: boolean;
    loading?: 'lazy' | 'eager';
    /** Optional media ratio. Omitted values preserve each layout's existing ratio. */
    imageAspectRatio?: '4:3' | '3:4' | '1:1' | '16:9' | 'auto';
    /** Placement of overlay copy. Bottom preserves the original presentation. */
    contentPosition?: 'top' | 'bottom';
    /** Overlay scrim; use None for artwork that already provides text contrast. */
    overlay?: 'dark' | 'light' | 'none';
    /** Optional disclosure, such as a sponsorship label. */
    badge?: string;
    /** Parent-controlled responsive image hints and LCP priority. */
    imageWidths?: React.ComponentProps<typeof DynamicImage>['widths'];
    imagePriority?: 'high' | 'low' | 'auto';
    /**
     * Editorial layouts for long-form pages. Default `overlay` keeps the canonical
     * image-scrim card. Split/stack put the image beside or above heading-first copy
     * so legal and care pages stay readable. Prose, callout, and tile are text-first.
     */
    layout?: ContentCardLayout;
    /** Small kicker above the title (e.g. "01" on a tile). */
    eyebrow?: string;

    // Page Designer props (need to be extracted to avoid passing to DOM)
    regionId?: string;
    component?: ComponentType;
    componentData?: Record<string, Promise<unknown>>;
    designMetadata?: ComponentDesignMetadata;
    data?: unknown;
    cardFooterClassName?: string;
    cardDescriptionClassName?: string;
    buttonClassName?: string;
}

export const ContentCard = forwardRef<HTMLDivElement, ContentCardProps>(
    (
        {
            className,
            variant = 'default',
            cardFooterClassName,
            cardDescriptionClassName,
            buttonClassName,
            title,
            titleTypography,
            description,
            descriptionTypography,
            imageUrl,
            imageAlt,
            imageFit = 'cover',
            imagePosition = 'start',
            stackOnMobile = true,
            mediaClassName,
            buttonText,
            buttonLink,
            buttonAriaLabel,
            showBackground = contentCardDefaults.showBackground,
            showBorder = contentCardDefaults.showBorder,
            loading = 'lazy',
            layout = 'overlay',
            imageAspectRatio,
            contentPosition = 'bottom',
            overlay = 'dark',
            badge,
            imageWidths,
            imagePriority = 'auto',
            eyebrow,
            regionId: _regionId,
            component: _component,
            componentData: _componentData,
            designMetadata: _designMetadata,
            data: _data,
            ...props
        },
        ref
    ) => {
        const { t } = useTranslation('common');
        const { isDesignMode } = usePageDesignerMode();

        const rawImageObj = typeof imageUrl === 'string' ? { url: imageUrl } : imageUrl;
        const rawImageSrc = rawImageObj?.url;

        const rawHasCta = !!(buttonText && buttonLink);
        const rawHasText = !!(title || description);

        // Empty state (W-23729786): a freshly-dropped Content Card with no configured content.
        // Rather than a bespoke placeholder branch, we feed the shared image placeholder plus the
        // default title/description through the component's *real* render path — so the authoring
        // preview is the actual image-backed card layout (grey placeholder surface + bottom
        // title/description over the standard gradient), guaranteeing it matches a configured card.
        // This is a Page-Designer *authoring* affordance, so it only kicks in during design mode;
        // on the live storefront an unconfigured Content Card still renders just the empty <Card>
        // shell. Mirrors the Hero's design-mode gate.
        const isUnconfigured = !rawImageSrc && !rawHasText && !rawHasCta;
        const showEmptyState = isUnconfigured && isDesignMode;

        // In the empty state, substitute the placeholder image and default copy; otherwise use the
        // authored values verbatim.
        const imageObj = showEmptyState ? { url: contentPlaceholder } : rawImageObj;
        const imageSrc = imageObj?.url;
        const focalPoint = imageObj?.focalPoint;
        const resolvedTitle = showEmptyState ? t('contentCard.emptyTitle') : title;
        const resolvedDescription = showEmptyState ? t('contentCard.emptyDescription') : description;

        // Calculate focal point for object-position (defaults to center).
        const focalX = focalPoint?.x != null ? `${focalPoint.x}%` : '50%';
        const focalY = focalPoint?.y != null ? `${focalPoint.y}%` : '50%';
        const objectPosition = `${focalX} ${focalY}`;

        const hasCta = rawHasCta;
        const hasText = !!(resolvedTitle || resolvedDescription);
        const hasContent = hasText || hasCta;

        // Resolve the typography presets once. `Default` reproduces the
        // original hardcoded look verbatim, so untouched cards are unchanged.
        const titleTypographyClass =
            TITLE_TYPOGRAPHY_CLASS[
                normalizeTypography(titleTypography ?? (variant === 'campaign' ? 'Heading 3' : 'Default'))
            ];
        const descriptionTypographyClass = DESCRIPTION_TYPOGRAPHY_CLASS[normalizeTypography(descriptionTypography)];
        const campaign = variant === 'campaign';
        const editorial = EDITORIAL_LAYOUTS.has(layout);
        const headingFirst = editorial || contentPosition === 'top';
        const lightOverlay = overlay === 'light';
        const mediaRatio =
            imageAspectRatio &&
            {
                '4:3': 'aspect-[4/3]',
                '3:4': 'aspect-[3/4]',
                '1:1': 'aspect-square',
                '16:9': 'aspect-[16/9]',
                auto: 'aspect-auto',
            }[imageAspectRatio];
        const hideImage = layout === 'prose' || layout === 'callout' || layout === 'tile';
        const showImage = Boolean(imageSrc) && !hideImage;
        const imageLinkLabel = buttonAriaLabel?.trim() || imageAlt?.trim() || resolvedTitle?.trim();
        const imageLink = buttonLink?.trim();

        // Invalid authored image links must never reach shoppers with an empty accessible name.
        if (layout === 'image' && showImage && imageLink && !imageLinkLabel) {
            return null;
        }

        const renderContent = (onImage: boolean) =>
            hasContent && (
                <div
                    className={cn(
                        'relative z-10',
                        campaign && (onImage && !lightOverlay ? 'text-card' : 'text-foreground')
                    )}>
                    {eyebrow ? (
                        <p
                            className={cn(
                                'mb-3',
                                typographyVariants({ variant: 'eyebrow', align: null }),
                                onImage && !lightOverlay ? 'text-card' : 'text-muted-foreground'
                            )}>
                            {eyebrow}
                        </p>
                    ) : null}
                    {hasText && (
                        <div
                            className={cn(
                                'flex-1 flex flex-col',
                                headingFirst ? (campaign ? 'gap-1.5' : 'gap-3') : 'justify-end',
                                cardDescriptionClassName
                            )}>
                            {resolvedTitle && (
                                <h3
                                    className={cn(
                                        !headingFirst && 'order-2',
                                        titleTypographyClass,
                                        headingFirst ? 'mb-0' : 'mb-4',
                                        campaign && 'font-extrabold leading-tight',
                                        onImage && !lightOverlay ? 'text-card' : 'text-foreground'
                                    )}>
                                    {resolvedTitle}
                                </h3>
                            )}
                            {resolvedDescription && (
                                <p
                                    className={cn(
                                        !headingFirst && 'order-1',
                                        descriptionTypographyClass,
                                        headingFirst ? 'mb-0' : 'mb-2',
                                        'whitespace-pre-line',
                                        onImage && !lightOverlay ? 'text-muted' : 'text-muted-foreground'
                                    )}>
                                    {resolvedDescription}
                                </p>
                            )}
                        </div>
                    )}
                    {hasCta && (
                        <Button
                            asChild
                            variant={campaign ? 'link' : 'default'}
                            className={cn(
                                'w-fit text-sm font-medium leading-5 text-primary-foreground',
                                headingFirst && 'mt-4',
                                campaign &&
                                    'mt-3 h-auto bg-transparent px-0 py-0 font-extrabold text-inherit underline underline-offset-4 hover:bg-transparent hover:text-inherit',
                                buttonClassName
                            )}>
                            <Link to={buttonLink} aria-label={buttonAriaLabel}>
                                {buttonText}
                            </Link>
                        </Button>
                    )}
                </div>
            );

        const naturalImageSize = imageAspectRatio === 'auto';
        const image = (
            <img
                src={resolveAssetUrl(imageSrc ?? '')}
                alt={showEmptyState ? '' : imageAlt || resolvedTitle || ''}
                width={imageObj?.metaData?.width}
                height={imageObj?.metaData?.height}
                className={
                    naturalImageSize
                        ? 'block h-auto w-full'
                        : cn('h-full w-full', imageFit === 'contain' ? 'object-contain' : 'object-cover')
                }
                style={{ objectPosition }}
                loading={loading}
                {...(imagePriority !== 'auto' && { fetchPriority: imagePriority })}
            />
        );
        const renderImage = () =>
            imageWidths ? (
                <DynamicImage
                    src={resolveAssetUrl(imageSrc ?? '')}
                    alt={showEmptyState ? '' : imageAlt || resolvedTitle || ''}
                    widths={imageWidths}
                    priority={imagePriority}
                    loading={loading}
                    className={naturalImageSize ? 'relative w-full' : 'absolute inset-0 size-full'}
                    imageProps={{
                        className: naturalImageSize
                            ? 'h-auto w-full'
                            : cn('size-full', imageFit === 'contain' ? 'object-contain' : 'object-cover'),
                        style: { objectPosition },
                        width: imageObj?.metaData?.width,
                        height: imageObj?.metaData?.height,
                    }}
                />
            ) : (
                image
            );

        const media =
            showImage && imageSrc ? (
                <div
                    {...(showEmptyState && { 'data-slot': 'empty-state' })}
                    className={cn(
                        'relative overflow-hidden bg-secondary/20',
                        layout === 'split' &&
                            (stackOnMobile ? 'aspect-[4/3] md:aspect-auto md:min-h-full' : 'aspect-square'),
                        layout === 'stack' && 'aspect-[16/9]',
                        campaign && layout === 'stack' && 'rounded-ui',
                        layout === 'split' &&
                            imagePosition === 'end' &&
                            (stackOnMobile ? 'md:order-last' : 'order-last'),
                        (layout === 'overlay' || layout === 'image') && 'aspect-[4/3]',
                        mediaRatio,
                        mediaClassName
                    )}>
                    {renderImage()}
                </div>
            ) : null;

        return (
            <Card
                ref={ref}
                {...(editorial ? { 'data-layout': layout } : {})}
                className={cn(
                    'relative h-full overflow-hidden',
                    layout === 'callout' && 'bg-secondary shadow-none ring-0',
                    layout === 'callout' && showBorder && 'border-0 border-l-2 border-l-primary',
                    !showBorder && '[--ui-border-width:0] border-0 ring-0',
                    layout === 'prose' && 'border-0 bg-transparent shadow-none ring-0',
                    layout !== 'callout' &&
                        layout !== 'prose' &&
                        (showBackground ? 'ring-secondary/40 bg-muted/50' : 'bg-transparent'),
                    layout !== 'callout' && layout !== 'prose' && !showBorder && 'border-0 ',
                    layout === 'tile' && 'bg-card',
                    (layout === 'image' || campaign) && 'gap-0 py-0',
                    className
                )}
                {...props}>
                {layout === 'image' && showImage ? (
                    <CardContent className="p-0">
                        {imageLink ? (
                            <Link
                                to={imageLink}
                                aria-label={imageLinkLabel}
                                className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                                {media}
                            </Link>
                        ) : (
                            media
                        )}
                    </CardContent>
                ) : layout === 'split' && showImage ? (
                    <CardContent
                        className={cn('grid p-0 items-stretch', stackOnMobile ? 'md:grid-cols-2' : 'grid-cols-2')}>
                        {media}
                        {hasContent ? (
                            <div className={cn('flex flex-col justify-center p-6 md:p-10', cardFooterClassName)}>
                                {renderContent(false)}
                            </div>
                        ) : null}
                    </CardContent>
                ) : layout === 'stack' && showImage ? (
                    <CardContent className="p-0">
                        {media}
                        {hasContent ? (
                            <div className={cn('flex flex-col p-6 md:p-8', cardFooterClassName)}>
                                {renderContent(false)}
                            </div>
                        ) : null}
                    </CardContent>
                ) : showImage && imageSrc && layout === 'overlay' ? (
                    <CardContent className="p-0">
                        <div
                            {...(showEmptyState && { 'data-slot': 'empty-state' })}
                            className={cn('relative aspect-[4/3] overflow-hidden bg-secondary/20', mediaRatio)}>
                            {imageWidths || naturalImageSize ? (
                                renderImage()
                            ) : (
                                <img
                                    src={resolveAssetUrl(imageSrc)}
                                    alt={showEmptyState ? '' : imageAlt || resolvedTitle || ''}
                                    className="w-full h-full object-cover"
                                    style={{ objectPosition }}
                                    loading={loading}
                                />
                            )}
                            {hasContent && (
                                <div
                                    className={cn(
                                        'absolute inset-0 flex flex-col justify-end',
                                        campaign ? 'p-5' : 'p-6 md:p-8',
                                        contentPosition === 'top' && 'justify-start',
                                        cardFooterClassName
                                    )}>
                                    {overlay !== 'none' && (
                                        <div
                                            data-slot="content-card-overlay"
                                            className={cn(
                                                'absolute inset-0',
                                                lightOverlay
                                                    ? contentPosition === 'top'
                                                        ? 'bg-[image:var(--content-card-overlay-light-top)]'
                                                        : 'bg-[image:var(--content-card-overlay-light-bottom)]'
                                                    : 'bg-[image:var(--content-card-overlay-dark)]'
                                            )}
                                        />
                                    )}
                                    {renderContent(true)}
                                </div>
                            )}
                        </div>
                    </CardContent>
                ) : (
                    hasContent && (
                        <CardContent className="p-0">
                            <div
                                className={cn(
                                    'flex flex-col',
                                    layout === 'prose' && 'max-w-prose px-0 py-2',
                                    layout === 'callout' && 'px-6 py-5 md:px-8',
                                    layout === 'tile' && 'justify-start p-6 md:p-8',
                                    layout === 'overlay' && 'justify-end p-6 md:p-8',
                                    (layout === 'split' || layout === 'stack') && 'p-6 md:p-8',
                                    cardFooterClassName
                                )}>
                                {renderContent(false)}
                            </div>
                        </CardContent>
                    )
                )}
                {badge && (
                    <Badge
                        variant="secondary"
                        data-slot="content-card-badge"
                        className="absolute right-2 bottom-2 bg-background/90 font-bold text-foreground">
                        {badge}
                    </Badge>
                )}
            </Card>
        );
    }
);
ContentCard.displayName = 'ContentCard';

export default ContentCard;
