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
import React, { type ReactElement, useState, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Link } from '@/components/link';
import { DynamicImage } from '@/components/dynamic-image';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Component } from '@/lib/decorators/component';
import { AttributeDefinition } from '@/lib/decorators/attribute-definition';
import withSuspense from '@/components/with-suspense';
import HeroCarouselSkeleton from './skeleton';
import { RegionDefinition } from '@/lib/decorators/region-definition';
import heroImage from '/images/hero-01.webp';
import { normalizeOverlayPosition, normalizeOverlayAlignment, overlayPositionLayout } from '@/components/hero/utils';
import type { ComponentType } from '@/components/region';
import { Component as RegionComponent } from '@/components/region/component';

/** Each slide is edge-to-edge at every breakpoint, so the image always requests a viewport-width variant from DIS. */
const HERO_IMAGE_WIDTHS = ['100vw'];

const heroCarouselDefaults = {
    autoPlay: true,
    autoPlayInterval: 5000,
    showDots: true,
    showNavigation: true,
    /** Default gradient scrim applied to every slide; each Hero slide can override its own `overlay`. */
    overlay: 'Dark',
} as const;

@Component('heroCarousel', {
    name: 'Hero Carousel',
    description:
        'Interactive carousel component with multiple hero slides, autoplay, navigation controls, and dot indicators',
    group: 'Layout',
})
@RegionDefinition([
    {
        id: 'slides',
        name: 'Carousel Slides',
        description:
            'Add hero components to display as carousel slides. Each hero will be shown as a full-width slide.',
        maxComponents: 10,
        componentTypeInclusions: ['Content.hero'],
    },
])
export class HeroCarouselMetadata {
    @AttributeDefinition({ defaultValue: heroCarouselDefaults.autoPlay })
    autoPlay?: boolean;

    @AttributeDefinition({ defaultValue: heroCarouselDefaults.autoPlayInterval })
    autoPlayInterval?: number;

    @AttributeDefinition({ defaultValue: heroCarouselDefaults.showDots })
    showDots?: boolean;

    @AttributeDefinition({ defaultValue: heroCarouselDefaults.showNavigation })
    showNavigation?: boolean;

    @AttributeDefinition({
        id: 'overlay',
        name: 'Slide Overlay',
        description:
            'Default gradient scrim applied to every slide to keep text legible. Individual Hero slides can override this with their own Overlay setting.',
        type: 'enum',
        values: ['None', 'Light', 'Dark'],
        defaultValue: heroCarouselDefaults.overlay,
    })
    overlay?: string;
}

type Image = {
    url: string;
    metaData?: {
        height?: number | string;
        width?: number | string;
    };
    focalPoint?: {
        x?: number | string;
        y?: number | string;
    };
};

const heroSlides: HeroSlide[] = [
    {
        id: 'slide-1',
        title: 'Adventure Awaits',
        subtitle: 'Gear up for your next outdoor expedition with premium equipment',
        imageUrl: heroImage,
        imageAlt: 'Outdoor adventure gear',
        ctaText: 'Shop Now',
        ctaLink: '/category/mens-clothing-shorts',
    },
    {
        id: 'slide-2',
        title: 'Built for the Wild',
        subtitle: 'Durable, weather-resistant gear for every terrain and season',
        imageUrl: heroImage,
        imageAlt: 'Outdoor equipment for all seasons',
        ctaText: 'Explore Collection',
        ctaLink: '/category/mens-clothing-shorts',
    },
    {
        id: 'slide-3',
        title: 'Your Journey Starts Here',
        subtitle: 'From mountain peaks to forest trails, we have everything you need',
        imageUrl: heroImage,
        imageAlt: 'Hiking and camping equipment',
        ctaText: 'Discover Gear',
        ctaLink: '/category/mens-clothing-shorts',
    },
];

export interface HeroSlide {
    id: string;
    title: string;
    subtitle?: string;
    imageUrl: string;
    imageAlt?: string;
    ctaText?: string;
    ctaLink?: string;
    overlayPosition?: string;
    overlayAlignment?: string;
}

interface HeroCarouselProps {
    slides?: HeroSlide[];
    image?: Image;
    autoPlay?: boolean;
    autoPlayInterval?: number;
    showDots?: boolean;
    showNavigation?: boolean;
    /** Default gradient scrim applied to every slide; a per-slide Hero `overlay` overrides it. */
    overlay?: string;
    /** Component data containing regions from Page Designer */
    component?: ComponentType;
}

export function HeroCarouselPlain({
    slides: propSlides = heroSlides,
    autoPlay = heroCarouselDefaults.autoPlay,
    image,
    autoPlayInterval = heroCarouselDefaults.autoPlayInterval,
    showDots = heroCarouselDefaults.showDots,
    showNavigation = heroCarouselDefaults.showNavigation,
    overlay = heroCarouselDefaults.overlay,
    component,
}: HeroCarouselProps): ReactElement {
    // Production (Page Designer) path: render each slide by delegating to the real Hero
    // component through the <Component> registry, so every authored Hero attribute (typography,
    // colors, button style, focal point, styleOverride, …) is honored — instead of flattening a
    // handful of fields into a bespoke slide renderer. Mirrors product-carousel's region path.
    const regionComponents = useMemo(() => {
        if (!Array.isArray(component?.regions)) return [];
        const slidesRegion = component.regions.find((r) => r.id === 'slides');
        if (!Array.isArray(slidesRegion?.components)) return [];
        return slidesRegion.components.filter((comp) => comp.id && comp.typeId) as ComponentType[];
    }, [component]);

    // When the region has authored heroes we delegate to <Component>; otherwise we fall back to
    // the `slides` prop (storybook/test path) rendered by the local HeroSlideContent.
    const usingRegion = regionComponents.length > 0;
    const slides = propSlides;

    // Unified per-slide metadata (id + title) for dot indicators and the aria-live announcement,
    // independent of which render path is active.
    const slideMeta = useMemo(
        () =>
            usingRegion
                ? regionComponents.map((comp) => ({
                      id: comp.id,
                      title: ((comp.data as Record<string, unknown> | undefined)?.title as string) || '',
                  }))
                : slides.map((slide) => ({ id: slide.id, title: slide.title })),
        [usingRegion, regionComponents, slides]
    );
    const slideCount = slideMeta.length;

    const [currentSlide, setCurrentSlide] = useState(0);
    const [api, setApi] = useState<CarouselApi | null>(null);
    const [isPaused, setIsPaused] = useState(false);
    const [canScrollPrev, setCanScrollPrev] = useState(false);
    const [canScrollNext, setCanScrollNext] = useState(false);

    useEffect(() => {
        if (!autoPlay || !api || isPaused) return;

        const interval = setInterval(() => {
            api.scrollNext();
        }, autoPlayInterval);

        return () => clearInterval(interval);
    }, [api, autoPlay, autoPlayInterval, isPaused]);

    const onSelect = useCallback(() => {
        if (!api) return;

        const currentIndex = api.selectedScrollSnap();
        const canPrev = api.canScrollPrev();
        const canNext = api.canScrollNext();

        setCurrentSlide(currentIndex);
        setCanScrollPrev(canPrev);
        setCanScrollNext(canNext);
    }, [api]);

    useEffect(() => {
        if (!api) return;
        onSelect();
        api.on('select', onSelect);
        api.on('reInit', onSelect);

        return () => {
            api.off('select', onSelect);
            api.off('reInit', onSelect);
        };
    }, [api, onSelect]);

    const goToSlide = useCallback(
        (index: number) => {
            if (!api || index < 0 || index >= slideCount) return;

            api.scrollTo(index);
        },
        [api, slideCount]
    );

    const handleFocus = useCallback(() => setIsPaused(true), []);
    const handleBlur = useCallback(() => setIsPaused(false), []);
    const handleMouseEnter = useCallback(() => setIsPaused(true), []);
    const handleMouseLeave = useCallback(() => setIsPaused(false), []);

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
            if (!api) return;

            switch (event.key) {
                case 'ArrowLeft':
                    event.preventDefault();
                    api.scrollPrev();
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    api.scrollNext();
                    break;
                case 'Home':
                    event.preventDefault();
                    api.scrollTo(0);
                    break;
                case 'End':
                    event.preventDefault();
                    api.scrollTo(slideCount - 1);
                    break;
            }
        },
        [api, slideCount]
    );

    const emptyState = useMemo(
        () => (
            <div className="relative w-full flex items-center justify-center bg-muted h-[400px] md:h-[500px] lg:h-[600px]">
                <p className="text-muted-foreground text-sm">No slides available</p>
            </div>
        ),
        []
    );

    if (slideCount === 0) {
        return emptyState;
    }

    return (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- labelled carousel region: keydown/hover handlers pause autoplay and drive arrow-key slide nav, not the primary control
        <div
            data-slot="hero-carousel"
            className="relative w-full overflow-hidden h-[400px] md:h-[500px] lg:h-[600px]"
            role="region"
            aria-label={`Hero carousel with ${slideCount} slides`}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onKeyDown={handleKeyDown}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- intentional tab stop so keyboard users can reach the carousel's arrow-key slide navigation
            tabIndex={0}>
            <Carousel
                setApi={setApi}
                opts={{
                    align: 'center',
                    loop: true,
                    containScroll: 'trimSnaps',
                }}
                className="w-full h-full [&_[data-slot=carousel-content]]:h-full [&_[data-slot=carousel-item]]:h-full">
                {/* Passing -ml-4 to the CarouselContent to prevent CLS issues during hydration */}
                <CarouselContent className="h-full">
                    {usingRegion
                        ? regionComponents.map((comp, index) => (
                              <CarouselItem key={comp.contentLinkUuid ?? comp.id} className="h-full">
                                  <RegionComponent
                                      component={withSlideProps(comp, {
                                          overlay,
                                          priority: index === 0 ? 'high' : 'auto',
                                          loading: index === 0 ? 'eager' : 'lazy',
                                          fillHeight: true,
                                      })}
                                      regionId="slides"
                                      className="h-full w-full"
                                  />
                              </CarouselItem>
                          ))
                        : slides.map((slide, index) => (
                              <CarouselItem key={slide.id} className="h-full">
                                  <HeroSlideContent
                                      slide={image ? { ...slide, imageUrl: image.url } : slide}
                                      priority={index === 0}
                                  />
                              </CarouselItem>
                          ))}
                </CarouselContent>
            </Carousel>

            {slideCount > 1 && (
                <div className="absolute bottom-6 inset-x-0 z-30 section-container">
                    <div className="relative flex items-center justify-center">
                        {showDots && (
                            <div className="flex gap-2" role="tablist" aria-label="Slide navigation">
                                {slideMeta.map((slide, index) => (
                                    <DotButton
                                        key={`dot-${slide.id}`}
                                        index={index}
                                        isActive={currentSlide === index}
                                        totalSlides={slideCount}
                                        onClick={goToSlide}
                                    />
                                ))}
                            </div>
                        )}
                        {showNavigation && (
                            <div className="absolute right-0 flex gap-2">
                                <NavigationButton
                                    direction="prev"
                                    onClick={() => api?.scrollPrev()}
                                    disabled={!canScrollPrev}
                                    currentSlide={currentSlide + 1}
                                    totalSlides={slideCount}
                                />
                                <NavigationButton
                                    direction="next"
                                    onClick={() => api?.scrollNext()}
                                    disabled={!canScrollNext}
                                    currentSlide={currentSlide + 1}
                                    totalSlides={slideCount}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="sr-only" aria-live="polite" aria-atomic="true">
                Slide {currentSlide + 1} of {slideCount}: {slideMeta[currentSlide]?.title}
            </div>
        </div>
    );
}

/**
 * Clone a Page Designer Hero component with carousel-controlled slide props merged into its
 * `data` (which <Component> spreads onto the Hero). A per-slide Hero `overlay` authored in
 * Page Designer wins over the carousel default; `priority`/`loading`/`fillHeight` are always
 * set by the carousel (they're not Page-Designer attributes).
 */
function withSlideProps(
    comp: ComponentType,
    slideProps: { overlay: string; priority: 'high' | 'auto'; loading: 'eager' | 'lazy'; fillHeight: boolean }
): ComponentType {
    const data = (comp.data as Record<string, unknown> | undefined) ?? {};
    return {
        ...comp,
        data: {
            ...data,
            // Per-slide overlay overrides the carousel default; carousel default fills in when unset.
            overlay: (data.overlay as string | undefined) ?? slideProps.overlay,
            priority: slideProps.priority,
            loading: slideProps.loading,
            fillHeight: slideProps.fillHeight,
        },
        // SCAPI types Component.data as Record<string, never>; the runtime payload is arbitrary
        // attribute data, so cast through unknown to attach the carousel-controlled slide props.
    } as unknown as ComponentType;
}

const DotButton = React.memo(
    ({
        index,
        isActive,
        totalSlides,
        onClick,
    }: {
        index: number;
        isActive: boolean;
        totalSlides: number;
        onClick: (index: number) => void;
    }): ReactElement => (
        <button
            onClick={() => onClick(index)}
            className={`rounded-ui transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white/50 ${
                isActive ? 'w-8 h-2 bg-white' : 'w-2 h-2 bg-white/50 hover:bg-white/75'
            }`}
            role="tab"
            aria-selected={isActive}
            aria-label={`Go to slide ${index + 1} of ${totalSlides}`}
            tabIndex={isActive ? 0 : -1}
        />
    )
);

DotButton.displayName = 'DotButton';

const NavigationButton = React.memo(
    ({
        direction,
        onClick,
        disabled,
        currentSlide,
        totalSlides,
    }: {
        direction: 'prev' | 'next';
        onClick: () => void;
        disabled: boolean;
        currentSlide: number;
        totalSlides: number;
    }): ReactElement => {
        const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
        const label = direction === 'prev' ? 'Previous' : 'Next';

        return (
            <button
                onClick={onClick}
                disabled={disabled}
                className="rounded-ui p-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all focus:outline-none focus:ring-2 focus:ring-white/50"
                aria-label={`${label} slide (${currentSlide} of ${totalSlides})`}>
                <Icon className="w-6 h-6 text-primary-foreground" strokeWidth={2} />
            </button>
        );
    }
);

NavigationButton.displayName = 'NavigationButton';

const HeroSlideContent = React.memo(({ slide, priority }: { slide: HeroSlide; priority: boolean }): ReactElement => {
    const position = normalizeOverlayPosition(slide.overlayPosition);
    const alignment = normalizeOverlayAlignment(slide.overlayAlignment);
    const { vertical, horizontal } = overlayPositionLayout(position);

    const overlayRowClass = cn(
        vertical === 'start' && 'items-start',
        vertical === 'center' && 'items-center',
        vertical === 'end' && 'items-end'
    );
    const overlayEdgePaddingClass = cn(
        vertical === 'start' && 'pt-6 sm:pt-8 md:pt-10',
        vertical === 'end' && 'pb-6 sm:pb-8 md:pb-10'
    );
    const contentBlockClass = cn('max-w-xl', horizontal === 'center' && 'mx-auto', horizontal === 'right' && 'ml-auto');
    const textAlignClass = alignment === 'left' ? 'text-left' : alignment === 'right' ? 'text-right' : 'text-center';
    const ctaJustifyClass =
        alignment === 'left' ? 'justify-start' : alignment === 'right' ? 'justify-end' : 'justify-center';

    return (
        <div className="relative w-full h-full overflow-hidden">
            <DynamicImage
                src={slide.imageUrl}
                alt={slide.imageAlt || slide.title || 'Hero Carousel'}
                widths={HERO_IMAGE_WIDTHS}
                // One full-width slide is visible per view (CarouselItem is basis-full), so slide 0 is what
                // paints first and is the LCP candidate: preload it and load it eagerly. Off-screen slides stay
                // lazy so they don't compete with the LCP image for bandwidth.
                priority={priority ? 'high' : 'auto'}
                loading={priority ? 'eager' : 'lazy'}
                className="absolute inset-0 w-full h-full"
                imageProps={{ className: 'w-full h-full object-cover' }}
            />
            {/*
             * Scrim for WCAG 1.4.3 text contrast. The overlay text is white and can be placed at any of the
             * 9 overlayPosition slots over an arbitrary merchant photo, so a directional gradient cannot
             * guarantee legibility everywhere (a top or centre heading over a bright sky measured ~1.7:1). A
             * uniform scrim floor keeps the composited background dark enough for white text over any region
             * of any image: worst case (a blown-out white region behind) is 5.7:1 for fashion and 4.7:1 for
             * cosmetic, both clearing the 4.5:1 AA minimum. The scrim is mixed from each vertical's
             * `--brand-black` so it keeps the brand's warm/neutral tint rather than forcing pure black. The
             * image itself is unchanged. */}
            <div className="absolute inset-0 bg-[color-mix(in_oklch,var(--brand-black)_60%,transparent)]" />

            <div className={cn('relative h-full flex z-20 overflow-hidden', overlayRowClass, overlayEdgePaddingClass)}>
                <div className="section-container w-full">
                    <div className={cn(contentBlockClass, textAlignClass)}>
                        <h1 className="text-6xl font-bold leading-none [letter-spacing:-1.5px] text-primary-foreground mb-4">
                            {slide.title}
                        </h1>

                        {slide.subtitle && (
                            <p className="text-lg font-normal leading-[120%] text-primary-foreground mb-8">
                                {slide.subtitle}
                            </p>
                        )}

                        <div className={cn('flex', ctaJustifyClass)}>
                            <Button
                                asChild
                                className="h-auto px-8 py-4 text-sm font-medium leading-5 text-primary-foreground">
                                <Link to={slide.ctaLink || '#'}>{slide.ctaText || 'Learn More'}</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

HeroSlideContent.displayName = 'HeroSlideContent';

/**
 * HeroCarouselWithSuspense component provides a HeroCarousel wrapped with a Suspense boundary.
 *
 * This component automatically shows the HeroCarouselSkeleton as a fallback while the
 * HeroCarousel is loading, providing better user experience during data fetching.
 *
 * When used with a `resolve` prop, the resolved data should be an object containing
 * slides data that will be passed as props to the HeroCarousel component.
 *
 * @example
 * ```tsx
 * // Basic usage with Suspense boundary
 * <HeroCarouselWithSuspense
 *   slides={heroSlides}
 *   autoPlay={true}
 *   showDots={true}
 * />
 *
 * // Usage with promise resolution as a prop
 * <HeroCarouselWithSuspense
 *   resolve={heroDataPromise}
 *   autoPlay={true}
 * />
 *
 * // Usage in a page with streaming
 * function HomePage() {
 *   return (
 *     <div>
 *       <HeroCarouselWithSuspense resolve={heroDataPromise} />
 *       <ProductCarouselWithSuspense resolve={productsPromise} />
 *     </div>
 *   );
 * }
 * ```
 */
const HeroCarousel = withSuspense(HeroCarouselPlain, {
    fallback: (props) => <HeroCarouselSkeleton {...props} />,
});

export default HeroCarousel;

// eslint-disable-next-line react-refresh/only-export-components
export { HeroCarouselSkeleton, HeroCarouselSkeleton as fallback };
