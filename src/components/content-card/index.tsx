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
import { Link } from '@/components/link';
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
    description?: string;
    imageUrl?: Image | string;
    imageAlt?: string;
    buttonText?: string;
    buttonLink?: string;
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
export class ContentCardMetadata {
    @AttributeDefinition()
    title?: string;

    @AttributeDefinition()
    description?: string;

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
            description,
            imageUrl,
            imageAlt,
            buttonText,
            buttonLink,
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
        const imageObj = typeof imageUrl === 'string' ? { url: imageUrl } : imageUrl;
        const imageSrc = imageObj?.url;
        const focalPoint = imageObj?.focalPoint;

        // Calculate focal point for object-position (defaults to center).
        const focalX = focalPoint?.x != null ? `${focalPoint.x}%` : '50%';
        const focalY = focalPoint?.y != null ? `${focalPoint.y}%` : '50%';
        const objectPosition = `${focalX} ${focalY}`;

        const hasCta = !!(buttonText && buttonLink);
        const hasText = !!(title || description);
        const hasContent = hasText || hasCta;

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
                            {title && (
                                <h3
                                    className={cn(
                                        'order-2 text-2xl font-semibold leading-[120%] tracking-[-0.6px] mb-4',
                                        onImage ? 'text-card' : 'text-foreground'
                                    )}>
                                    {title}
                                </h3>
                            )}
                            {description && (
                                <p
                                    className={cn(
                                        'order-1 text-sm font-normal leading-5 mb-2 whitespace-pre-line',
                                        onImage ? 'text-muted' : 'text-muted-foreground'
                                    )}>
                                    {description}
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
                            <Link to={buttonLink}>{buttonText}</Link>
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
                        <div className="relative aspect-[4/3] overflow-hidden bg-secondary/20">
                            <img
                                src={resolveAssetUrl(imageSrc)}
                                alt={imageAlt || title || ''}
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
