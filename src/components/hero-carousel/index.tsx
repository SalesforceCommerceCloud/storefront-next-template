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

/** Each slide is edge-to-edge at every breakpoint, so the image always requests a viewport-width variant from DIS. */
const HERO_IMAGE_WIDTHS = ['100vw'];

const heroCarouselDefaults = {
    autoPlay: true,
    autoPlayInterval: 5000,
    showDots: true,
    showNavigation: true,
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
    component,
}: HeroCarouselProps): ReactElement {
    // Convert page designer heroes to slides format
    const slidesFromComponent = useMemo(() => {
        if (!Array.isArray(component?.regions)) {
            return [];
        }

        const slidesRegion = component.regions.find((r) => r.id === 'slides');
        if (!Array.isArray(slidesRegion?.components)) {
            return [];
        }

        return slidesRegion.components
            .filter((comp) => comp.id && comp.typeId)
            .map((comp) => {
                const data = comp.data as Record<string, unknown> | undefined;
                const imageUrl = data?.imageUrl as { url?: string } | undefined;
                return {
                    id: comp.id,
                    title: (data?.title as string) || '',
                    subtitle: data?.subtitle as string | undefined,
                    imageUrl: imageUrl?.url || heroImage,
                    imageAlt: (data?.imageAlt as string) || '',
                    ctaText: data?.ctaText as string | undefined,
                    ctaLink: data?.ctaLink as string | undefined,
                };
            });
    }, [component]);

    // Use component data slides if available, otherwise use prop slides
    const slides = slidesFromComponent.length ? slidesFromComponent : propSlides;
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
            if (!api || index < 0 || index >= slides.length) return;

            api.scrollTo(index);
        },
        [api, slides.length]
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
                    api.scrollTo(slides.length - 1);
                    break;
            }
        },
        [api, slides.length]
    );

    const emptyState = useMemo(
        () => (
            <div className="relative w-full flex items-center justify-center bg-muted h-[400px] md:h-[500px] lg:h-[600px]">
                <p className="text-muted-foreground text-sm">No slides available</p>
            </div>
        ),
        []
    );

    if (!slides || slides.length === 0) {
        return emptyState;
    }

    return (
        <div
            data-slot="hero-carousel"
            className="relative w-full overflow-hidden h-[400px] md:h-[500px] lg:h-[600px]"
            role="region"
            aria-label={`Hero carousel with ${slides.length} slides`}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onKeyDown={handleKeyDown}
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
                    {slides.map((slide, index) => (
                        <CarouselItem key={slide.id} className="h-full">
                            <HeroSlideContent
                                slide={image ? { ...slide, imageUrl: image.url } : slide}
                                priority={index === 0}
                            />
                        </CarouselItem>
                    ))}
                </CarouselContent>
            </Carousel>

            {slides.length > 1 && (
                <div className="absolute bottom-6 inset-x-0 z-30 section-container">
                    <div className="relative flex items-center justify-center">
                        {showDots && (
                            <div className="flex gap-2" role="tablist" aria-label="Slide navigation">
                                {slides.map((slide, index) => (
                                    <DotButton
                                        key={`dot-${slide.id}`}
                                        index={index}
                                        isActive={currentSlide === index}
                                        totalSlides={slides.length}
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
                                    totalSlides={slides.length}
                                />
                                <NavigationButton
                                    direction="next"
                                    onClick={() => api?.scrollNext()}
                                    disabled={!canScrollNext}
                                    currentSlide={currentSlide + 1}
                                    totalSlides={slides.length}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="sr-only" aria-live="polite" aria-atomic="true">
                Slide {currentSlide + 1} of {slides.length}: {slides[currentSlide]?.title}
            </div>
        </div>
    );
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
            <div
                className="absolute inset-0"
                style={{
                    background:
                        'linear-gradient(to top, color-mix(in oklch, var(--brand-black) 30%, transparent) 0%, transparent 100%), linear-gradient(to right, color-mix(in oklch, var(--brand-black) 60%, transparent) 0%, color-mix(in oklch, var(--brand-black) 30%, transparent) 50%, transparent 100%)',
                }}
            />

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
