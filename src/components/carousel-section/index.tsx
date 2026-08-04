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
import { type ReactNode } from 'react';
import { Link } from '@/components/link';
import { Carousel, CarouselContent, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

export interface CarouselSectionProps {
    /** Optional title displayed above the carousel */
    title?: string;
    /** Optional subtitle displayed below the title */
    subtitle?: string;
    /**
     * Optional "Shop all" link URL.
     * @remarks Ignored when `titleAlign` is `'center'`.
     */
    shopAllUrl?: string;
    /**
     * Optional label for the "Shop all" link.
     * @remarks Ignored when `titleAlign` is `'center'`.
     */
    shopAllText?: string;
    /** Optional className override for the title heading */
    titleClassName?: string;
    /**
     * Title alignment.
     * - 'left' (default): title left-aligned with optional shop-all link on the right
     * - 'center': title and subtitle centered, no shop-all link
     */
    titleAlign?: 'left' | 'center';
    /**
     * Center the carousel items along the track when they don't fill it, instead of
     * left-aligning (the default). Uses `justify-center-safe`, which centers when the
     * items fit but falls back to start-alignment once the track overflows — so Embla's
     * `align: 'start'` scroll still reaches every item (a plain `justify-center` would
     * strand the leading item off the scrollable edge). Off by default, so existing
     * consumers are unchanged.
     */
    centerWhenPartial?: boolean;
    /** Optional className for the outer wrapper div */
    className?: string;
    /** Accessible label for the carousel region */
    ariaLabel?: string;
    /** Carousel items — should be <CarouselItem> elements */
    children: ReactNode;
}

const defaultLeftTitleClassName = 'text-4xl font-medium leading-none tracking-[-0.9px] text-foreground';
const defaultCenterTitleClassName = 'text-4xl font-medium leading-none tracking-[-0.9px] text-foreground mb-4';

// oxlint-disable-next-line react-refresh/only-export-components
export { carouselItemImageWidths, productCarouselItemAspectRatio } from './constants';

/**
 * CarouselSection is a shared layout shell for all carousel components in the storefront.
 *
 * It provides the consistent outer padding, title row, Embla carousel track, and prev/next
 * navigation buttons. Consumers render their own <CarouselItem> elements as children.
 *
 * @example
 * ```tsx
 * // Left-aligned title with shop-all link (product carousel style)
 * <CarouselSection title="Featured Products" shopAllUrl="/category/root" shopAllText="Shop all">
 *     {products.map(p => (
 *         <CarouselItem key={p.productId} className="basis-1/2 sm:basis-1/3 md:basis-1/4 pl-4 flex min-w-0">
 *             <ProductTile product={p} className="h-full w-full" />
 *         </CarouselItem>
 *     ))}
 * </CarouselSection>
 *
 * // Centered title with subtitle (category carousel style)
 * <CarouselSection title="Shop by Category" subtitle="Explore our collections" titleAlign="center">
 *     {categories.map(c => (
 *         <CarouselItem key={c.id} className="basis-1/2 sm:basis-1/3 md:basis-1/4 pl-4 flex min-w-0">
 *             <CategoryTile category={c} className="h-full w-full" />
 *         </CarouselItem>
 *     ))}
 * </CarouselSection>
 * ```
 */
export function CarouselSection({
    title,
    subtitle,
    shopAllUrl,
    shopAllText,
    titleClassName,
    titleAlign = 'left',
    centerWhenPartial = false,
    className,
    ariaLabel,
    children,
}: CarouselSectionProps) {
    const titleSection =
        titleAlign === 'center' ? (
            <div className="text-center">
                {title && <h2 className={titleClassName ?? defaultCenterTitleClassName}>{title}</h2>}
                {subtitle && (
                    <p className="text-base font-normal leading-6 text-muted-foreground max-w-2xl mx-auto">
                        {subtitle}
                    </p>
                )}
            </div>
        ) : (
            <div className="flex items-center justify-between">
                {subtitle ? (
                    <div>
                        {title && <h2 className={titleClassName ?? defaultLeftTitleClassName}>{title}</h2>}
                        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
                    </div>
                ) : (
                    title && <h2 className={titleClassName ?? defaultLeftTitleClassName}>{title}</h2>
                )}
                {shopAllText && (
                    <div>
                        {shopAllUrl ? (
                            <Link
                                to={shopAllUrl}
                                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors shrink-0 ml-4">
                                {shopAllText}
                            </Link>
                        ) : (
                            <span className="text-sm font-medium text-primary shrink-0 ml-4">{shopAllText}</span>
                        )}
                    </div>
                )}
            </div>
        );

    return (
        <div className={cn('section-container py-6', className)}>
            {(title !== undefined || subtitle) && titleSection}
            <Carousel className="w-full py-6" opts={{ align: 'start' }} aria-label={ariaLabel}>
                <CarouselContent
                    className={cn('-ml-4 items-stretch flex-nowrap', centerWhenPartial && 'justify-center-safe')}>
                    {children}
                </CarouselContent>
                {/*
                 * The nav buttons straddle the carousel edge on desktop (translated half their width
                 * outside the track). At mobile widths the section-container has only 16px of side
                 * padding, so an 18px outward straddle pushes the button 2px past a 320px viewport and
                 * forces a horizontal scrollbar (WCAG 1.4.10 Reflow). Keep the straddle from `lg` up
                 * and seat the buttons flush inside the track below it. This also keeps the buttons
                 * on-screen and keyboard-reachable at mobile widths (W-23325488).
                 */}
                <CarouselPrevious className="flex left-0 lg:-translate-x-1/2 size-9 shadow-md" />
                <CarouselNext className="flex right-0 lg:translate-x-1/2 size-9 shadow-md" />
            </Carousel>
        </div>
    );
}
