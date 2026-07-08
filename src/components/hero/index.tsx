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
import { type CSSProperties, type ReactElement, useId } from 'react';
import { Link } from '@/components/link';
import { DynamicImage } from '@/components/dynamic-image';
import { Button, buttonVariants } from '@/components/ui/button';
import { Component } from '@/lib/decorators/component';
import { AttributeDefinition } from '@/lib/decorators/attribute-definition';
import { RegionDefinition } from '@/lib/decorators';
import { type Image } from '@/types';
import { cn } from '@/lib/utils';
import { type VariantProps } from 'class-variance-authority';
import { normalizeOverlayPosition, normalizeOverlayAlignment, overlayPositionLayout } from './utils';

const HERO_TYPOGRAPHY_VALUES = [
    'Default',
    'Paragraph',
    'Heading 1',
    'Heading 2',
    'Heading 3',
    'Heading 4',
    'Heading 5',
    'Heading 6',
] as const;

type HeroTypography = (typeof HERO_TYPOGRAPHY_VALUES)[number];

const BUTTON_STYLE_VALUES = ['Primary', 'Secondary', 'Tertiary'] as const;
type ButtonStyle = (typeof BUTTON_STYLE_VALUES)[number];

const HERO_HEIGHT_VALUES = ['sm', 'md', 'lg', 'xl', 'full'] as const;
type HeroHeight = (typeof HERO_HEIGHT_VALUES)[number];

/** Hero is edge-to-edge at every breakpoint, so the image always requests a viewport-width variant from DIS. */
const HERO_IMAGE_WIDTHS = ['100vw'];

const HERO_HEIGHT_CLASS: Record<HeroHeight, string> = {
    sm: 'h-[250px] md:h-[300px] lg:h-[350px]',
    md: 'h-[350px] md:h-[450px] lg:h-[500px]',
    lg: 'h-[400px] md:h-[500px] lg:h-[600px]',
    xl: 'h-[500px] md:h-[600px] lg:h-[700px]',
    full: 'h-[100vh] md:h-[85vh]',
};

/** Maps Page Designer labels to shadcn Button variants (no literal "tertiary" variant — outline is the tertiary treatment). */
const BUTTON_STYLE_TO_VARIANT: Record<ButtonStyle, NonNullable<VariantProps<typeof buttonVariants>['variant']>> = {
    Primary: 'default',
    Secondary: 'secondary',
    Tertiary: 'outline',
};

const TITLE_TYPOGRAPHY_CLASS: Record<HeroTypography, string> = {
    Default: 'text-6xl font-bold leading-none [letter-spacing:-1.5px]',
    Paragraph: 'text-base font-normal leading-7',
    'Heading 1': 'text-4xl font-bold tracking-tight',
    'Heading 2': 'text-3xl font-semibold tracking-tight',
    'Heading 3': 'text-2xl font-semibold tracking-tight',
    'Heading 4': 'text-2xl font-semibold tracking-tight',
    'Heading 5': 'text-sm font-semibold tracking-tight',
    'Heading 6': 'text-base font-semibold tracking-tight',
};

const SUBTITLE_TYPOGRAPHY_CLASS: Record<HeroTypography, string> = {
    Default: 'text-lg font-normal leading-[120%]',
    Paragraph: 'text-base font-normal leading-7',
    'Heading 1': 'text-4xl font-bold tracking-tight',
    'Heading 2': 'text-3xl font-semibold tracking-tight',
    'Heading 3': 'text-2xl font-semibold tracking-tight',
    'Heading 4': 'text-2xl font-semibold tracking-tight',
    'Heading 5': 'text-sm font-semibold tracking-tight',
    'Heading 6': 'text-base font-semibold tracking-tight',
};

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function parseOptionalHex(value: string | undefined): string | undefined {
    const t = value?.trim();
    if (!t || !HEX_COLOR_REGEX.test(t)) return undefined;
    return t;
}

function normalizeHeroTypography(value: string | undefined): HeroTypography {
    if (value && (HERO_TYPOGRAPHY_VALUES as readonly string[]).includes(value)) {
        return value as HeroTypography;
    }
    return 'Default';
}

function normalizeButtonStyle(value: string | undefined): ButtonStyle {
    if (value && (BUTTON_STYLE_VALUES as readonly string[]).includes(value)) {
        return value as ButtonStyle;
    }
    return 'Primary';
}

function normalizeHeroHeight(value: string | undefined): HeroHeight {
    if (value && (HERO_HEIGHT_VALUES as readonly string[]).includes(value)) {
        return value as HeroHeight;
    }
    return 'full';
}

function getCtaLabel(ctaText: string | undefined, ctaLink: string): string {
    const trimmed = ctaText?.trim();
    if (trimmed) return trimmed;
    const pathOnly = ctaLink.split('?')[0].split('#')[0];
    const segments = pathOnly.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last) {
        return decodeURIComponent(last).replace(/[-_]+/g, ' ');
    }
    return 'Learn more';
}

/* v8 ignore start - do not test decorators in unit tests, decorator functionality is tested separately*/
@Component('hero', {
    name: 'Hero Banner',
    description:
        'Prominent banner with image, title, subtitle, and call-to-action. Title and subtitle support typography presets, optional hex colors, and overlay placement. Button Style sets the CTA appearance. If CTA Link is empty, the button is not shown. Overlay Position places the content block; Overlay Alignment sets text alignment.',
    group: 'Content',
})
@RegionDefinition([])
export class HeroMetadata {
    @AttributeDefinition()
    title?: string;

    @AttributeDefinition({
        id: 'titleTypography',
        name: 'Title Typography',
        description: 'Visual typography for the title',
        type: 'enum',
        values: ['Default', 'Paragraph', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6'],
        defaultValue: 'Default',
    })
    titleTypography?: string;

    @AttributeDefinition({
        id: 'titleColor',
        name: 'Title Color',
        description: 'Hex color for the title (e.g. #FFFFFF or #fff)',
        type: 'string',
        required: false,
    })
    titleColor?: string;

    @AttributeDefinition({
        type: 'image',
    })
    imageUrl?: string;

    @AttributeDefinition()
    imageAlt?: string;

    @AttributeDefinition()
    imageTitle?: string;

    @AttributeDefinition()
    subtitle?: string;

    @AttributeDefinition({
        id: 'subtitleTypography',
        name: 'Subtitle Typography',
        description: 'Visual typography for the subtitle',
        type: 'enum',
        values: ['Default', 'Paragraph', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6'],
        defaultValue: 'Default',
    })
    subtitleTypography?: string;

    @AttributeDefinition({
        id: 'subtitleColor',
        name: 'Subtitle Color',
        description: 'Hex color for the subtitle (e.g. #FFFFFF or #fff)',
        type: 'string',
        required: false,
    })
    subtitleColor?: string;

    @AttributeDefinition()
    ctaText?: string;

    @AttributeDefinition({
        id: 'ctaLink',
        name: 'CTA Link',
        type: 'url',
        required: false,
    })
    ctaLink?: string;

    @AttributeDefinition({
        id: 'buttonStyle',
        name: 'Button Style',
        type: 'enum',
        values: ['Primary', 'Secondary', 'Tertiary'],
        defaultValue: 'Primary',
    })
    buttonStyle?: string;

    @AttributeDefinition({
        id: 'overlayPosition',
        name: 'Overlay Position',
        description: 'Placement of the content block within the hero',
        type: 'enum',
        values: [
            'Top Left',
            'Top Center',
            'Top Right',
            'Middle Left',
            'Middle Center',
            'Middle Right',
            'Bottom Left',
            'Bottom Center',
            'Bottom Right',
        ],
        defaultValue: 'Middle Center',
    })
    overlayPosition?: string;

    @AttributeDefinition({
        id: 'overlayAlignment',
        name: 'Overlay Alignment',
        description: 'Text alignment for title, subtitle, and call-to-action',
        type: 'enum',
        values: ['left', 'center', 'right'],
        defaultValue: 'center',
    })
    overlayAlignment?: string;

    @AttributeDefinition({
        id: 'height',
        name: 'Height',
        description: 'Height of the hero banner',
        type: 'enum',
        values: ['sm', 'md', 'lg', 'xl', 'full'],
        defaultValue: 'full',
    })
    height?: string;

    @AttributeDefinition({
        id: 'styleOverride',
        name: 'Style Override',
        description:
            'CSS fragment scoped to this hero instance. Use & as the root selector — it maps to this hero element via CSS nesting and is automatically scoped with a unique attribute at render time. Supports any valid CSS including pseudo-classes, descendant selectors, and CSS custom properties (e.g. var(--primary)). Example: & { border-radius: var(--radius-xl); } & [data-slot="button"]:hover { transform: scale(1.05); }',
        type: 'text',
        required: false,
    })
    styleOverride?: string;
}
/* v8 ignore stop */

export default function Hero({
    title,
    titleTypography,
    titleColor,
    imageUrl,
    imageAlt,
    imageTitle,
    subtitle,
    subtitleTypography,
    subtitleColor,
    ctaText,
    ctaLink,
    buttonStyle,
    overlayPosition,
    overlayAlignment,
    height,
    styleOverride,
}: {
    title?: string;
    titleTypography?: string;
    titleColor?: string;
    imageUrl?: Image;
    imageAlt?: string;
    imageTitle?: string;
    subtitle?: string;
    subtitleTypography?: string;
    subtitleColor?: string;
    ctaText?: string;
    ctaLink?: string;
    buttonStyle?: string;
    overlayPosition?: string;
    overlayAlignment?: string;
    height?: string;
    styleOverride?: string;
}): ReactElement {
    const uid = useId();
    const rawCss = styleOverride?.trim() || undefined;
    const scopedCss = rawCss ? `[data-hero-id="${uid}"] { ${rawCss} }` : undefined;

    const renderImage = () => {
        if (!imageUrl?.url) return <div className="absolute inset-0 bg-muted" />;

        const focalPoint = imageUrl.focalPoint;
        const focalX = focalPoint?.x != null ? `${focalPoint.x}%` : '50%';
        const focalY = focalPoint?.y != null ? `${focalPoint.y}%` : '50%';

        return (
            <DynamicImage
                src={imageUrl.url}
                alt={imageAlt || ''}
                widths={HERO_IMAGE_WIDTHS}
                priority="high"
                loading="eager"
                className="absolute inset-0 w-full h-full"
                imageProps={{
                    className: 'w-full h-full object-cover',
                    style: { objectPosition: `${focalX} ${focalY}` },
                    ...(imageTitle && { title: imageTitle }),
                }}
            />
        );
    };

    const position = normalizeOverlayPosition(overlayPosition);
    const alignment = normalizeOverlayAlignment(overlayAlignment);
    const { vertical, horizontal } = overlayPositionLayout(position);

    const titleTypo = normalizeHeroTypography(titleTypography);
    const subtitleTypo = normalizeHeroTypography(subtitleTypography);
    const resolvedButtonStyle = normalizeButtonStyle(buttonStyle);
    const heightClass = HERO_HEIGHT_CLASS[normalizeHeroHeight(height)];
    const buttonVariant = BUTTON_STYLE_TO_VARIANT[resolvedButtonStyle];

    const titleHex = parseOptionalHex(titleColor);
    const subtitleHex = parseOptionalHex(subtitleColor);

    const titleStyle: CSSProperties | undefined = titleHex ? { color: titleHex } : undefined;
    const subtitleStyle: CSSProperties | undefined = subtitleHex ? { color: subtitleHex } : undefined;

    const overlayRowClass = cn(
        vertical === 'start' && 'items-start',
        vertical === 'center' && 'items-center',
        vertical === 'end' && 'items-end'
    );

    const overlayEdgePaddingClass = cn(
        vertical === 'start' && 'pt-6 sm:pt-8 md:pt-10',
        vertical === 'end' && 'pb-6 sm:pb-8 md:pb-10'
    );

    const contentBlockClass = cn(
        'max-w-2xl',
        horizontal === 'center' && 'mx-auto',
        horizontal === 'right' && 'ml-auto'
    );

    const textAlignClass = alignment === 'left' ? 'text-left' : alignment === 'right' ? 'text-right' : 'text-center';

    const ctaJustifyClass =
        alignment === 'left' ? 'justify-start' : alignment === 'right' ? 'justify-end' : 'justify-center';

    const ctaHref = (ctaLink ?? '').trim();
    const showCta = ctaHref.length > 0;

    return (
        <>
            {scopedCss && (
                // eslint-disable-next-line react/no-danger
                <style dangerouslySetInnerHTML={{ __html: scopedCss }} />
            )}
            <div data-hero-id={uid} className={cn('relative w-full overflow-hidden', heightClass)}>
                {renderImage()}

                <div className={cn('absolute inset-0 z-10 flex', overlayRowClass, overlayEdgePaddingClass)}>
                    <div className="container mx-auto w-full section-container">
                        <div className={cn(contentBlockClass, textAlignClass)}>
                            {title && (
                                <h1
                                    className={cn(
                                        TITLE_TYPOGRAPHY_CLASS[titleTypo],
                                        'mb-3 sm:mb-4 md:mb-6',
                                        !titleHex && 'text-primary-foreground'
                                    )}
                                    style={titleStyle}>
                                    {title}
                                </h1>
                            )}

                            {subtitle && (
                                <p
                                    className={cn(
                                        SUBTITLE_TYPOGRAPHY_CLASS[subtitleTypo],
                                        'mb-4 sm:mb-6 md:mb-8',
                                        !subtitleHex && 'text-primary-foreground'
                                    )}
                                    style={subtitleStyle}>
                                    {subtitle}
                                </p>
                            )}

                            {showCta && (
                                <div className={cn('flex', ctaJustifyClass)}>
                                    <Button
                                        asChild
                                        variant={buttonVariant}
                                        className="text-sm font-medium leading-5 text-primary-foreground p-3 sm:p-4 md:p-5 lg:p-6">
                                        <Link to={ctaHref}>{getCtaLabel(ctaText, ctaHref)}</Link>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
