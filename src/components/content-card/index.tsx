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
import { TITLE_TYPOGRAPHY_CLASS, DESCRIPTION_TYPOGRAPHY_CLASS, normalizeTypography } from './typography';
import type { ComponentDesignMetadata } from '@salesforce/storefront-next-runtime/design/react';
import { cn, resolveAssetUrl } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Component } from '@/lib/decorators/component';
import { AttributeDefinition } from '@/lib/decorators/attribute-definition';
import { type Image } from '@/types';
import type { ComponentType } from '@/components/region';

const contentCardDefaults = {
    showBackground: true,
    showBorder: true,
} as const;

interface ContentCardProps extends ComponentProps<'div'> {
    title?: string;
    titleTypography?: string;
    description?: string;
    descriptionTypography?: string;
    imageUrl?: Image | string;
    imageAlt?: string;
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

/* v8 ignore start - do not test decorators in unit tests, decorator functionality is tested separately*/
@Component('contentCard', {
    name: 'Content Card',
    description: 'Flexible card component with optional image, title, description, and call-to-action button',
    group: 'Content',
})
// oxlint-disable-next-line react/only-export-components -- oxlint flags the co-exported Page Designer metadata class; eslint-plugin-react-refresh does not
export class ContentCardMetadata {
    @AttributeDefinition()
    title?: string;

    // `values` must be an inline string-literal array: the cartridge metadata generator
    // (`sfnext cartridge:generate`) statically parses this decorator via ts-morph and cannot expand
    // a spread of an imported const (`[...CONTENT_CARD_TYPOGRAPHY_VALUES]`) — it emits the string
    // "...CONTENT_CARD_TYPOGRAPHY_VALUES" verbatim, yielding an invalid enum that SFCC rejects on
    // import (Content Card then never appears in the Page Designer palette). Keep this list in sync
    // with CONTENT_CARD_TYPOGRAPHY_VALUES in ./typography (the runtime source of truth).
    @AttributeDefinition({
        id: 'titleTypography',
        name: 'Title Typography',
        description: 'Visual typography for the title',
        type: 'enum',
        values: ['Default', 'Paragraph', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6'],
        defaultValue: 'Default',
    })
    titleTypography?: string;

    @AttributeDefinition()
    description?: string;

    // Inline literal — see the titleTypography note above (generator cannot expand a const spread).
    @AttributeDefinition({
        id: 'descriptionTypography',
        name: 'Description Typography',
        description: 'Visual typography for the description',
        type: 'enum',
        values: ['Default', 'Paragraph', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6'],
        defaultValue: 'Default',
    })
    descriptionTypography?: string;

    @AttributeDefinition({ type: 'image' })
    imageUrl?: Image;

    @AttributeDefinition()
    imageAlt?: string;

    @AttributeDefinition()
    buttonText?: string;

    @AttributeDefinition({
        id: 'buttonLink',
        name: 'Button Link',
        type: 'url',
        required: false,
    })
    buttonLink?: string;

    @AttributeDefinition({ defaultValue: contentCardDefaults.showBackground })
    showBackground?: boolean;

    @AttributeDefinition({ defaultValue: contentCardDefaults.showBorder })
    showBorder?: boolean;
}
/* v8 ignore stop */

export const ContentCard = forwardRef<HTMLDivElement, ContentCardProps>(
    (
        {
            className,
            cardFooterClassName,
            cardDescriptionClassName,
            buttonClassName,
            title,
            titleTypography,
            description,
            descriptionTypography,
            imageUrl,
            imageAlt,
            buttonText,
            buttonLink,
            buttonAriaLabel,
            showBackground = contentCardDefaults.showBackground,
            showBorder = contentCardDefaults.showBorder,
            loading = 'lazy',
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
        const titleTypographyClass = TITLE_TYPOGRAPHY_CLASS[normalizeTypography(titleTypography)];
        const descriptionTypographyClass = DESCRIPTION_TYPOGRAPHY_CLASS[normalizeTypography(descriptionTypography)];

        // Title/description/CTA. Shared by the image branch (rendered as a
        // gradient overlay) and the text-only branch (rendered on the card
        // surface) so authored copy is never silently dropped when an image is
        // absent. `onImage` swaps the overlay-only affordances (light-on-dark
        // text colors) for surface-appropriate ones.
        const renderContent = (onImage: boolean) =>
            hasContent && (
                <div className="relative z-10">
                    {hasText && (
                        <div className={cn('flex-1 flex flex-col justify-end', cardDescriptionClassName)}>
                            {/*
                             * Source order is heading-first (<h3> before <p>) for assistive tech,
                             * while `order-*` preserves the visual layout (description above title,
                             * both bottom-aligned via justify-end).
                             */}
                            {resolvedTitle && (
                                <h3
                                    className={cn(
                                        'order-2',
                                        titleTypographyClass,
                                        'mb-4',
                                        onImage ? 'text-card' : 'text-foreground'
                                    )}>
                                    {resolvedTitle}
                                </h3>
                            )}
                            {resolvedDescription && (
                                <p
                                    className={cn(
                                        'order-1',
                                        descriptionTypographyClass,
                                        'mb-2 whitespace-pre-line',
                                        onImage ? 'text-muted' : 'text-muted-foreground'
                                    )}>
                                    {resolvedDescription}
                                </p>
                            )}
                        </div>
                    )}
                    {hasCta && (
                        <Button
                            asChild
                            variant="default"
                            className={cn(
                                'w-fit text-sm font-medium leading-5 text-primary-foreground',
                                buttonClassName
                            )}>
                            <Link to={buttonLink} aria-label={buttonAriaLabel}>
                                {buttonText}
                            </Link>
                        </Button>
                    )}
                </div>
            );

        return (
            <Card
                ref={ref}
                className={cn(
                    'relative h-full overflow-hidden',
                    showBackground ? 'ring-secondary/40 bg-muted/50' : 'bg-transparent',
                    !showBorder && 'border-0 ',
                    className
                )}
                {...props}>
                {imageSrc ? (
                    <CardContent className="p-0">
                        <div
                            {...(showEmptyState && { 'data-slot': 'empty-state' })}
                            className="relative aspect-[4/3] overflow-hidden bg-secondary/20">
                            <img
                                src={resolveAssetUrl(imageSrc)}
                                // Empty-state placeholder is decorative: the same title text is rendered
                                // as a heading below, so an alt would make a screen reader read it twice.
                                alt={showEmptyState ? '' : imageAlt || resolvedTitle || ''}
                                className="w-full h-full object-cover"
                                style={{ objectPosition }}
                                loading={loading}
                            />
                            {hasContent && (
                                <div
                                    className={cn(
                                        'absolute inset-0 flex flex-col justify-end p-6 md:p-8',
                                        cardFooterClassName
                                    )}>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent -z-10" />
                                    {renderContent(true)}
                                </div>
                            )}
                        </div>
                    </CardContent>
                ) : (
                    hasContent && (
                        <CardContent className="p-0">
                            <div className={cn('flex flex-col justify-end p-6 md:p-8', cardFooterClassName)}>
                                {renderContent(false)}
                            </div>
                        </CardContent>
                    )
                )}
            </Card>
        );
    }
);
ContentCard.displayName = 'ContentCard';

export default ContentCard;
