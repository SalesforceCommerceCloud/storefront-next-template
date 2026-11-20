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
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Pause, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePageDesignerMode } from '@salesforce/storefront-next-runtime/design/react/core';
import { CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { Button } from '@/components/ui/button';
import { CarouselSection } from '@/components/carousel-section';
import ContentCard, { type ContentCardProps } from '@/components/content-card/card';
import type { ComponentType } from '@/components/region';
import { Component as RegionComponent } from '@/components/region/component';
import { RegionWrapper } from '@/components/region/region-wrapper';
import { cn } from '@/lib/utils';

export type ContentCarouselItem = Omit<ContentCardProps, 'ref'> & { id: string };

export interface ContentCarouselProps {
    title?: string;
    items?: ContentCarouselItem[];
    component?: ComponentType;
    /** Number of cards visible at each breakpoint. Fractions reveal the next card. */
    itemsOnMobile?: number | string;
    itemsOnTablet?: number | string;
    itemsOnDesktop?: number | string;
    spacing?: 'small' | 'medium' | 'large';
    showNavigation?: boolean;
    autoPlay?: boolean;
    autoPlayInterval?: number;
    className?: string;
    titleClassName?: string;
    titleVariant?: 'default' | 'section';
}

const NO_ITEMS: ContentCarouselItem[] = [];

function normalizeCount(value: number | string, fallback: number): number {
    const count = Number(value);
    return Number.isFinite(count) && count >= 1 && count <= 6 ? count : fallback;
}

/** Authored Content Cards share the same renderer in route compositions and Page Designer. */
export default function ContentCarousel({
    title,
    items = NO_ITEMS,
    component,
    itemsOnMobile = 1,
    itemsOnTablet = 2,
    itemsOnDesktop = 4,
    spacing = 'medium',
    showNavigation = true,
    autoPlay = false,
    autoPlayInterval = 6000,
    className,
    titleClassName,
    titleVariant = 'default',
}: ContentCarouselProps) {
    const { t } = useTranslation('common');
    const { isDesignMode } = usePageDesignerMode();
    const [api, setApi] = useState<CarouselApi>();
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [reducedMotion, setReducedMotion] = useState(false);
    const [manualPause, setManualPause] = useState<boolean | null>(null);
    const [currentSlide, setCurrentSlide] = useState(0);
    const paused = manualPause ?? reducedMotion;
    const mobile = normalizeCount(itemsOnMobile, 1);
    const tablet = normalizeCount(itemsOnTablet, 2);
    const desktop = normalizeCount(itemsOnDesktop, 4);
    const regionItems = useMemo(
        () =>
            component?.regions
                ?.find((region) => region.id === 'items')
                ?.components?.filter((item) => item.id && item.typeId === 'Content.contentCard') as
                | ComponentType[]
                | undefined,
        [component]
    );
    const count = component ? (regionItems?.length ?? 0) : items.length;
    const emptyPreview = count === 0 && isDesignMode;
    const canPlay = autoPlay && count > 1 && !isDesignMode;
    const rotating = canPlay && !paused && !hovered && !focused;
    const interval = Number.isFinite(autoPlayInterval) ? Math.max(1000, Math.min(60000, autoPlayInterval)) : 6000;

    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReducedMotion(query.matches);
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);

    useEffect(() => {
        if (!api || !rotating) return;
        const timer = window.setInterval(() => api.scrollNext(), interval);
        return () => window.clearInterval(timer);
    }, [api, rotating, interval]);

    useEffect(() => {
        if (!api) return;
        const select = () => setCurrentSlide(api.selectedScrollSnap());
        select();
        api.on('select', select);
        api.on('reInit', select);
        return () => {
            api.off('select', select);
            api.off('reInit', select);
        };
    }, [api]);

    if (count === 0 && !emptyPreview) return null;

    const imageWidths = [`${100 / mobile}vw`, `${100 / tablet}vw`, `${100 / desktop}vw`];
    const imageProps = (index: number) => ({
        imageWidths,
        imagePriority: index === 0 ? ('high' as const) : ('auto' as const),
        loading: index < Math.ceil(Math.max(mobile, tablet, desktop)) ? ('eager' as const) : ('lazy' as const),
    });
    const itemClassName = cn(
        'flex min-w-0 basis-(--content-carousel-mobile-width) md:basis-(--content-carousel-tablet-width) lg:basis-(--content-carousel-desktop-width)',
        spacing === 'small' ? 'pl-3' : spacing === 'large' ? 'pl-6' : 'pl-4'
    );
    const cardItems = component
        ? (regionItems ?? []).map((item, index) => (
              <CarouselItem key={item.contentLinkUuid ?? item.id} className={itemClassName}>
                  <RegionComponent
                      component={{ ...item, data: { ...item.data, ...imageProps(index) } } as unknown as ComponentType}
                      regionId="items"
                      className="h-full w-full"
                  />
              </CarouselItem>
          ))
        : items.map(({ id, ...card }, index) => (
              <CarouselItem key={id} className={itemClassName}>
                  <ContentCard {...card} {...imageProps(index)} className={cn('w-full', card.className)} />
              </CarouselItem>
          ));

    return (
        <div
            data-slot="content-carousel"
            style={
                {
                    '--content-carousel-mobile-width': `${100 / mobile}%`,
                    '--content-carousel-tablet-width': `${100 / tablet}%`,
                    '--content-carousel-desktop-width': `${100 / desktop}%`,
                } as CSSProperties
            }>
            <RegionWrapper
                region={{ id: 'items', components: regionItems ?? [] }}
                designMetadata={{ id: 'items', componentTypeInclusions: ['Content.contentCard'] }}>
                <CarouselSection
                    title={title ?? (emptyPreview ? t('contentCarousel.emptyLabel') : undefined)}
                    titleClassName={titleClassName}
                    titleVariant={titleVariant}
                    className={className}
                    ariaLabel={title || t('contentCarousel.label')}
                    carouselClassName="py-0 mt-3"
                    contentClassName={spacing === 'small' ? '-ml-3' : spacing === 'large' ? '-ml-6' : '-ml-4'}
                    navigationClassName="size-11 shadow-ui [--ui-shadow:var(--float-shadow,var(--shadow-md))]"
                    showNavigation={showNavigation && count > 1}
                    headerActions={
                        canPlay ? (
                            <Button
                                variant="secondary"
                                size="icon"
                                className="size-11"
                                onClick={() => setManualPause(!paused)}
                                aria-label={paused ? t('contentCarousel.play') : t('contentCarousel.pause')}>
                                {paused ? (
                                    <Play className="size-4" aria-hidden="true" />
                                ) : (
                                    <Pause className="size-4" aria-hidden="true" />
                                )}
                            </Button>
                        ) : undefined
                    }
                    carouselProps={{
                        setApi,
                        opts: { align: 'start', loop: canPlay },
                        onMouseEnter: () => setHovered(true),
                        onMouseLeave: () => setHovered(false),
                        onFocusCapture: () => setFocused(true),
                        onBlurCapture: (event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
                        },
                    }}>
                    {emptyPreview
                        ? Array.from({ length: Math.ceil(desktop) }, (_, index) => (
                              <CarouselItem key={`placeholder-${index}`} className={itemClassName}>
                                  <ContentCard className="w-full" />
                              </CarouselItem>
                          ))
                        : cardItems}
                </CarouselSection>
            </RegionWrapper>
            {count > 0 && (
                <span className="sr-only" aria-live={rotating ? 'off' : 'polite'} aria-atomic="true">
                    {t('contentCarousel.position', { current: currentSlide + 1, count })}
                </span>
            )}
        </div>
    );
}
