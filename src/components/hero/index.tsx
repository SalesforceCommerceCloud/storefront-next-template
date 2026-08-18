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
import { type CSSProperties, type ReactElement, type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageDesignerMode } from '@salesforce/storefront-next-runtime/design/react/core';
import { Link } from '@/components/link';
import { typographyVariants } from '@/components/typography';
import { DynamicImage } from '@/components/dynamic-image';
import { Button, type buttonVariants } from '@/components/ui/button';
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

const HERO_OVERLAY_VALUES = ['None', 'Light', 'Dark'] as const;
type HeroOverlay = (typeof HERO_OVERLAY_VALUES)[number];

/**
 * Gradient scrim layered between the image and the text so overlay copy stays legible on
 * busy imagery. `None` renders no scrim (the default for a standalone Hero). `Dark`/`Light`
 * darken/lighten from the bottom-left, matching the treatment the Hero Carousel applies to
 * its slides. The carousel sets a default overlay that each slide inherits unless the Hero
 * author sets its own overlay.
 *
 * The gradient recipe itself lives in each vertical's `theme/tokens/brand.css`
 * (`--hero-overlay-dark` / `--hero-overlay-light`), next to the `--brand-black`/`--brand-white`
 * primitives it mixes, so the scrim geometry is brand-overridable and a vertical can't ship a
 * brand color without the matching scrim.
 */
const HERO_OVERLAY_BACKGROUND: Record<Exclude<HeroOverlay, 'None'>, string> = {
    Dark: 'var(--hero-overlay-dark)',
    Light: 'var(--hero-overlay-light)',
};

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

/**
 * The Heading/Paragraph presets derive from the shared Typography scale
 * (`typographyVariants`) so there is a single source of truth for those sizes.
 * `Default` is Hero-only (no cva equivalent) and stays local. `align: null`
 * opts out of the cva `align` default — Hero controls text alignment on the
 * container, so these presets must emit size/weight only.
 */
const TITLE_TYPOGRAPHY_CLASS: Record<HeroTypography, string> = {
    Default: 'text-6xl font-bold leading-none [letter-spacing:-1.5px]',
    Paragraph: typographyVariants({ variant: 'body', align: null }),
    'Heading 1': typographyVariants({ variant: 'h1', align: null }),
    'Heading 2': typographyVariants({ variant: 'h2', align: null }),
    'Heading 3': typographyVariants({ variant: 'h3', align: null }),
    'Heading 4': typographyVariants({ variant: 'h4', align: null }),
    'Heading 5': typographyVariants({ variant: 'h5', align: null }),
    'Heading 6': typographyVariants({ variant: 'h6', align: null }),
};

const SUBTITLE_TYPOGRAPHY_CLASS: Record<HeroTypography, string> = {
    Default: 'text-lg font-normal leading-[120%]',
    Paragraph: typographyVariants({ variant: 'body', align: null }),
    'Heading 1': typographyVariants({ variant: 'h1', align: null }),
    'Heading 2': typographyVariants({ variant: 'h2', align: null }),
    'Heading 3': typographyVariants({ variant: 'h3', align: null }),
    'Heading 4': typographyVariants({ variant: 'h4', align: null }),
    'Heading 5': typographyVariants({ variant: 'h5', align: null }),
    'Heading 6': typographyVariants({ variant: 'h6', align: null }),
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

function normalizeHeroOverlay(value: string | undefined): HeroOverlay {
    if (value && (HERO_OVERLAY_VALUES as readonly string[]).includes(value)) {
        return value as HeroOverlay;
    }
    return 'None';
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

/**
 * Decorative flourish behind the design-mode empty state — the Figma "Empty State" layer: a
 * wave blob, a ring in the top-right corner, and two thin accent grooves. The paths are the
 * exact geometry from the design (node 538:26646), reproduced in a single 1492×280 viewBox.
 *
 * Hero-only: the wave-blob treatment is unique to the Hero empty state in the design; the other
 * Page Designer components have their own distinct empty states, so this is inlined here rather
 * than shared.
 *
 * Theme binding (epic global constraint — no hardcoded colors): the design's fixed greys map to
 * theme tokens. The blob/ring `#C9C9C9` becomes `currentColor` (the wrapper sets
 * `text-muted-foreground`), and the `#F3F3F3` accent strokes become `var(--muted)` so they read
 * as grooves cut into the blob against the surface. The whole layer sits at 50% opacity, matching
 * the design. Purely decorative: `aria-hidden`.
 */
function HeroEmptyStateDecoration(): ReactNode {
    return (
        <div className="pointer-events-none absolute inset-0 z-0 text-muted-foreground opacity-50" aria-hidden>
            <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 1492 280"
                fill="none"
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg">
                {/* Wave blob (Figma "Vector 1"), anchored to the bottom of the surface. */}
                <path
                    transform="translate(0 59)"
                    d="M280 100.105C178 100.105 0 214.67 0 214.67L1492 221.105C1492 221.105 1181.11 -5.56395 978 0.104573C774.889 5.7731 652.683 192.148 539.66 192.148C444 192.148 401.602 100.105 280 100.105Z"
                    fill="currentColor"
                />
                {/* Ring (Figma "Ellipse 1"), top-right corner. */}
                <circle cx="1368.5" cy="79.5" r="38.5" stroke="currentColor" strokeWidth="8" />
                {/* Accent grooves (Figma "Line 2" / "Line 3"), muted surface color reading as cut-outs. */}
                <path
                    transform="translate(137 78) rotate(133.56)"
                    d="M4.00065 4.00065C4.00065 4.00065 74.5081 45.2772 145.611 68.7376C199.427 86.4944 275.206 104.88 275.206 104.88"
                    stroke="var(--muted)"
                    strokeWidth="8"
                    strokeLinecap="round"
                />
                <path
                    transform="translate(1068 197) rotate(133.56)"
                    d="M108.622 41.8136C108.622 41.8136 44.5439 30.3033 4.00047 4.00047"
                    stroke="var(--muted)"
                    strokeWidth="8"
                    strokeLinecap="round"
                />
            </svg>
        </div>
    );
}

/* v8 ignore start - do not test decorators in unit tests, decorator functionality is tested separately*/
@Component('hero', {
    name: 'Hero Banner',
    description:
        'Prominent banner with image, title, subtitle, and call-to-action. Title and subtitle support typography presets, optional hex colors, and overlay placement. Button Style sets the CTA appearance. If CTA Link is empty, the button is not shown. Overlay Position places the content block; Overlay Alignment sets text alignment.',
    group: 'Content',
})
@RegionDefinition([])
// oxlint-disable-next-line react/only-export-components -- oxlint flags the co-exported Page Designer metadata class; eslint-plugin-react-refresh does not
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
        id: 'ctaAriaLabel',
        name: 'CTA Accessible Name',
        description:
            'Accessible name for the CTA link, read by screen readers instead of the visible button text. Use when the button text is generic (e.g. "Shop Now") and does not by itself describe the link\'s destination. Leave blank to use the title and button text together.',
        type: 'text',
        required: false,
    })
    ctaAriaLabel?: string;

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
        id: 'overlay',
        name: 'Overlay',
        description:
            'Gradient scrim behind the text to keep overlay copy legible on busy imagery. None shows no scrim; Dark/Light darken/lighten the image.',
        type: 'enum',
        values: ['None', 'Light', 'Dark'],
        defaultValue: 'None',
    })
    overlay?: string;

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
    overlay,
    styleOverride,
    priority = 'high',
    loading = 'eager',
    fillHeight = false,
    ctaAriaLabel,
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
    /** Gradient scrim behind the text. Page-Designer authorable. */
    overlay?: string;
    styleOverride?: string;
    /**
     * DIS image priority. Defaults to 'high' so a standalone Hero preloads its LCP image.
     * The Hero Carousel passes 'auto' for off-screen slides to avoid competing for bandwidth.
     * Not a Page-Designer attribute — set by the parent (e.g. the carousel), never a merchant.
     */
    priority?: 'high' | 'low' | 'auto';
    /**
     * Accessible name for the CTA link, overriding the visible ctaText. Page-Designer authorable
     * (WCAG 2.4.4). When a merchant leaves this blank, Hero derives a default by combining the
     * visible CTA text with the title, so repeated CTAs (e.g. "Shop Now" on every carousel slide)
     * still get distinct accessible names as long as each slide's title differs.
     */
    ctaAriaLabel?: string;
    /**
     * Image loading strategy. Defaults to 'eager' (standalone Hero is above the fold). The
     * carousel passes 'lazy' for non-first slides. Not a Page-Designer attribute.
     */
    loading?: 'eager' | 'lazy';
    /**
     * When true, the hero fills its parent's height (h-full) instead of applying its own
     * `height` preset — used by the carousel to enforce uniform slide heights. Not a
     * Page-Designer attribute.
     */
    fillHeight?: boolean;
}): ReactElement {
    const uid = useId();
    const { t } = useTranslation('common');
    const { isDesignMode } = usePageDesignerMode();
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
                priority={priority}
                loading={loading}
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
    // When the parent controls height (fillHeight, e.g. inside a carousel with uniform slide
    // heights) the Hero's own height preset is ignored in favor of filling the parent.
    const heightClass = fillHeight ? 'h-full' : HERO_HEIGHT_CLASS[normalizeHeroHeight(height)];
    const buttonVariant = BUTTON_STYLE_TO_VARIANT[resolvedButtonStyle];

    const overlayMode = normalizeHeroOverlay(overlay);
    const overlayBackground = overlayMode === 'None' ? undefined : HERO_OVERLAY_BACKGROUND[overlayMode];

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

    // Default accessible name when the merchant hasn't authored one: combine the visible CTA
    // text with the title, so repeated CTAs across slides with generic text (e.g. "Shop Now")
    // still get distinct accessible names as long as each slide's title differs. WCAG 2.4.4/4.1.2.
    const trimmedTitle = title?.trim();
    const effectiveCtaAriaLabel =
        ctaAriaLabel?.trim() || (trimmedTitle ? `${getCtaLabel(ctaText, ctaHref)}: ${trimmedTitle}` : undefined);

    // Empty state (W-23733121 / W-23729775): a freshly-dropped Hero with no configured content.
    // The instructional placeholder (decorated grey surface + "Add your title here" cue) is a
    // Page-Designer *authoring* affordance, so it renders only in design mode — on the live
    // storefront an unconfigured Hero falls through to renderImage(), which shows a plain muted
    // box rather than an author-facing prompt. Mirrors the ProductCarousel design-mode gate.
    const isUnconfigured = !imageUrl?.url && !title?.trim() && !subtitle?.trim() && !showCta;
    const showEmptyState = isUnconfigured && isDesignMode;

    // The empty banner uses the fixed Figma banner height (300px) rather than the configured
    // Hero height — the placeholder's proportions match the design at that size. When the parent
    // controls height (fillHeight, e.g. inside a carousel with uniform slide heights) it wins, so
    // an empty slide matches its configured siblings instead of collapsing to the banner height.
    const rootHeightClass = showEmptyState ? (fillHeight ? 'h-full' : 'h-[300px]') : heightClass;

    return (
        <>
            {scopedCss && (
                // oxlint-disable-next-line react/no-danger
                <style dangerouslySetInnerHTML={{ __html: scopedCss }} />
            )}
            <div data-hero-id={uid} className={cn('relative w-full overflow-hidden', rootHeightClass)}>
                {showEmptyState ? (
                    // Themed grey surface with the decorative wave flourish and default authoring
                    // content. Uses bg-muted / text-muted-foreground only (no hardcoded colors) so
                    // the empty state tracks the active theme. The CTA is rendered as a non-interactive
                    // <span> (styled like a button) — it is an illustrative placeholder, not a control,
                    // so it must not be focusable or submit a form.
                    <div
                        data-slot="empty-state"
                        className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden bg-muted p-2.5">
                        <HeroEmptyStateDecoration />
                        <div className="relative z-10 flex flex-col items-center gap-4 text-center">
                            <h1 className={cn(TITLE_TYPOGRAPHY_CLASS['Heading 1'], 'text-muted-foreground')}>
                                {t('hero.emptyTitle')}
                            </h1>
                            <Button asChild variant="default" className="p-3 text-sm font-medium leading-5">
                                <span>{t('hero.emptyButton')}</span>
                            </Button>
                        </div>
                    </div>
                ) : (
                    renderImage()
                )}

                {overlayBackground && (
                    <div className="absolute inset-0 z-[5]" style={{ background: overlayBackground }} aria-hidden />
                )}

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
                                        <Link to={ctaHref} aria-label={effectiveCtaAriaLabel}>
                                            {getCtaLabel(ctaText, ctaHref)}
                                        </Link>
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
