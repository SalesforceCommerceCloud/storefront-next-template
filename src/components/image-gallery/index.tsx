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
import {
    useState,
    useEffect,
    useMemo,
    useRef,
    useCallback,
    type FocusEvent,
    type MouseEvent,
    type PointerEvent,
    type ReactElement,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { DynamicImage } from '@/components/dynamic-image';
import { preloadDynamicImage } from '@/components/dynamic-image/preload';
import ImageNavArrows from '@/components/image-nav-arrows';
import { useTranslation } from 'react-i18next';
import { useDeferredRenderSequence } from '@/hooks/use-deferred-render';
import { cn } from '@/lib/utils';
import type { DynamicImageDimensions } from '@/lib/images/dynamic-image';
import { UITarget } from '@/targets/ui-target';

export interface GalleryImage {
    src: string;
    alt?: string;
    thumbSrc?: string;
}

interface ImageGalleryWidths {
    /**
     * Responsive widths for the main image. Defaults match PDP (`section-container` → `lg:grid-cols-2` →
     * `max-w-screen-2xl`): viewport-wide below `lg`, half-viewport at `lg`/`xl`, capped at 680 once the
     * container hits `max-w-screen-2xl`. Override when the gallery sits in a narrower container (modal,
     * card cell) so DIS doesn't deliver an oversized main image.
     */
    main?: DynamicImageDimensions;
    /**
     * Responsive widths for thumbnails in grid mode. Defaults match PDP (gallery half-width at `lg+`,
     * grid-cols-4). Override when the gallery's effective width differs (e.g. inside a modal at `lg+` or
     * a multi-column card grid). Ignored when `horizontalThumbnails` is set — the strip uses fixed CSS
     * sizes instead.
     */
    thumbnail?: DynamicImageDimensions;
}

interface ImageGalleryProps {
    images: GalleryImage[];
    eager?: boolean;
    /** Show prev/next arrows on the main image (e.g. in modal) */
    showNavigationArrows?: boolean;
    /** Size of navigation arrows: "sm" (default) or "lg" for PDP */
    navigationArrowSize?: 'sm' | 'lg';
    /** Use horizontal scrollable thumbnail strip with arrows instead of grid */
    horizontalThumbnails?: boolean;
    productName?: string;
    /**
     * Per-callsite responsive widths for the main image and grid thumbnails. Either field may be
     * omitted to keep the corresponding default. Defaults are PDP-shaped (full container,
     * `lg:grid-cols-2`, capped at `max-w-screen-2xl`); override when the gallery sits in a narrower
     * container so DIS doesn't deliver oversized variants.
     */
    widths?: ImageGalleryWidths;
}

type NetworkInformation = {
    saveData?: boolean;
};

// Cap eager preloads so a set/bundle PDP (one gallery per child product) doesn't fan out into an unclear amount of
// requests on hydration. Slides beyond the cap are promoted on hover/focus intent before the click lands. Within the
// cap, the preloads are spread across consecutive idle frames so the network burst stays flat.
const EAGER_PRELOAD_LIMIT = 4;
const THUMBNAIL_SCROLL_OFFSET = 200;

// === Canonical width ladder for cache reuse ===
//
// Each width here turns into a `sw=<n>` query param on the DIS URL, and `sw` is part of the cache key. A single
// browsing session typically hits the gallery on the PDP, the cart-edit modal, the bonus-product modal, and the
// per-child gallery on a set/bundle PDP. If those four surfaces pick four slightly different widths for the same
// product image, the browser and CDN cache them as four separate variants. Same picture, four downloads.
//
// Fix: pick widths from a small shared ladder instead of fitting each container to the pixel. ~3-5% over-supply is
// invisible to the user; the cache reuse compounds across navigation. When in doubt, round up to the next rung —
// never invent a new one.
//
//   thumbs:  64, 80, 96, 144, 176, 240
//   main:    360, 420, 680, '100vw' (resolves to 640/768/1024), '50vw'
//
// Alignments this currently buys us:
//   - All mobile main images share the `'100vw'` rung → 640/768/1024 on PDP, cart-modal, bonus-modal.
//   - All desktop "narrow gallery" main images share 420 (cart-modal `md+`, bonus-modal `lg+`, child-card `md+`).
//   - PDP and bonus-modal share the same `md` thumb at 240.
//
// PDP gallery is full-width below `lg`, half-width at `lg`/`xl` (`lg:grid-cols-2`), and capped at 680 once the
// container hits `max-w-screen-2xl`. The `'50vw'` overestimates slightly (ignores `lg:gap-12`) which is harmless —
// the browser picks the smallest sufficient candidate from the srcset.
const DEFAULT_WIDTHS_MAIN: DynamicImageDimensions = { base: '100vw', lg: '50vw', '2xl': 680 };
// Grid is `grid-cols-4 gap-2 sm:gap-3` inside the gallery container, and the gallery itself drops to half-width once
// PDP switches to `lg:grid-cols-2`. Cell width therefore peaks in the `md` range (~230px just below `lg`) and falls
// back to ~160px at `lg+` where the gallery is half-width and capped by `max-w-screen-2xl`. Each entry targets the
// upper end of its breakpoint range so DIS still has headroom at @2x DPR.
const DEFAULT_WIDTHS_THUMBNAIL_GRID: DynamicImageDimensions = { base: 144, sm: 176, md: 240, lg: 168 };
// Horizontal strip uses fixed `h-16 w-16 sm:h-20 sm:w-20` — 64 base, 80 sm+. Fixed CSS, so this is intentionally
// not configurable per consumer.
const DEFAULT_WIDTHS_THUMBNAIL_STRIP: DynamicImageDimensions = [64, 80];

/**
 * Respect the user-explicit Data Saver preference (`Save-Data`) by skipping preloads. Falls back to "preload allowed"
 * when the `NetworkInformation` API isn't exposed (Safari, Firefox). We deliberately do not consult `effectiveType`,
 * which is a passively-derived network signal and a known fingerprinting vector — only the explicit user preference is
 * honored. The remaining defenses against bandwidth waste (cap, idle scheduling, `fetchPriority: 'low'`) carry the rest.
 */
const isPreloadAllowedByConnection = (): boolean => {
    if (typeof navigator === 'undefined') {
        return false;
    }
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    return !connection?.saveData;
};

export default function ImageGallery({
    images,
    eager = false,
    showNavigationArrows = false,
    navigationArrowSize = 'sm',
    horizontalThumbnails = false,
    productName,
    widths,
}: ImageGalleryProps): ReactElement {
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const thumbStripRef = useRef<HTMLDivElement>(null);
    const config = useConfig();
    const mainWidths = widths?.main ?? DEFAULT_WIDTHS_MAIN;
    const thumbnailWidths = widths?.thumbnail ?? DEFAULT_WIDTHS_THUMBNAIL_GRID;

    const preloadGallerySlide = useCallback(
        (image: GalleryImage | undefined) => {
            if (!image) {
                return;
            }
            preloadDynamicImage({
                config,
                src: image.src,
                widths: mainWidths,
                fetchPriority: 'low',
            });
        },
        [config, mainWidths]
    );

    /**
     * Promote a non-eagerly-preloaded slide on hover/focus intent. By the time the click lands, the variant should
     * usually already be in the HTTP cache.
     */
    const handleThumbnailIntent = useCallback(
        (event: PointerEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) => {
            const index = Number(event.currentTarget.dataset.index);
            if (Number.isNaN(index)) {
                return;
            }
            preloadGallerySlide(images[index]);
        },
        [images, preloadGallerySlide]
    );
    const handleScrollThumbnailsLeft = useCallback(() => {
        thumbStripRef.current?.scrollBy({ left: -THUMBNAIL_SCROLL_OFFSET, behavior: 'smooth' });
    }, []);
    const handleScrollThumbnailsRight = useCallback(() => {
        thumbStripRef.current?.scrollBy({ left: THUMBNAIL_SCROLL_OFFSET, behavior: 'smooth' });
    }, []);
    const handleThumbnailClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
        const nextIndex = Number(event.currentTarget.dataset.index);
        if (!Number.isNaN(nextIndex)) {
            setSelectedImageIndex(nextIndex);
        }
    }, []);

    useEffect(() => {
        // When images change (e.g., color variant changes), try to preserve the selected index
        // Only reset to 0 if the current index is out of bounds for the new images array
        // The key prop ensures each product has independent state, so this only affects the current product
        setSelectedImageIndex((currentIndex) => {
            // If current index is still valid for the new images array, keep it
            // Otherwise reset to 0
            return currentIndex < images.length ? currentIndex : 0;
        });
    }, [images]);

    // Off-screen slides eligible for eager preload. Save-Data and the cap are folded into the array length so the
    // sequencer's `n === 0` disabled state doubles as the "nothing to do" guard. No idle frames are scheduled when
    // there's only one slide or when the user opted into Data Saver.
    const offScreenSlides = useMemo(
        () => (isPreloadAllowedByConnection() ? images.slice(1, 1 + EAGER_PRELOAD_LIMIT) : []),
        [images]
    );

    // Spread preloads across consecutive idle frames instead of registering all `EAGER_PRELOAD_LIMIT` in one tick.
    // `react-dom` dedupes per resource, so re-running the effect with a growing cursor is cheap. Slides beyond the
    // cap are promoted on hover/focus.
    const readyPreloadCount = useDeferredRenderSequence(offScreenSlides.length);
    useEffect(() => {
        offScreenSlides.slice(0, readyPreloadCount).forEach(preloadGallerySlide);
    }, [offScreenSlides, readyPreloadCount, preloadGallerySlide]);

    const { t: tCommon } = useTranslation('common');
    const { t: tProduct } = useTranslation('product');

    // The first image is the fallback image. It's needed for when `images` are just updated, and the `selectedImageIndex` goes out of bound and is soon to be reset.
    const selectedImage = images[selectedImageIndex] ?? images[0];

    if (!images || images.length === 0) {
        return (
            <div className="aspect-square bg-muted flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                    <div className="text-4xl mb-2">📷</div>
                    <p>{tCommon('noImageAvailable')}</p>
                </div>
            </div>
        );
    }

    const imageAltFallback = productName || tProduct('imageAlt') || 'Product Image';

    return (
        <UITarget targetId="sfcc.pdp.products.gallery">
            <div className="space-y-4">
                {/* Main Image */}
                <div className="relative aspect-square overflow-hidden bg-muted" data-gallery-hero>
                    <DynamicImage
                        src={selectedImage.src}
                        alt={selectedImage.alt || imageAltFallback}
                        widths={mainWidths}
                        className="w-full h-full object-cover object-center [&_img]:object-contain! [&_img]:h-full! [&_img]:max-w-full! [&_img]:mx-auto!"
                        loading={eager ? 'eager' : 'lazy'}
                        priority={eager ? 'high' : undefined}
                    />
                    {showNavigationArrows && images.length > 1 && (
                        <ImageNavArrows
                            imageCount={images.length}
                            onIndexChange={setSelectedImageIndex}
                            size={navigationArrowSize}
                        />
                    )}
                </div>

                {/* Thumbnail Navigation */}
                {images.length > 1 && !horizontalThumbnails && (
                    <div className="grid grid-cols-4 gap-2 sm:gap-3" data-gallery-thumbs>
                        {images.map((image, index) => (
                            <button
                                key={image.src + (image.thumbSrc || '')}
                                onClick={handleThumbnailClick}
                                onPointerEnter={handleThumbnailIntent}
                                onFocus={handleThumbnailIntent}
                                data-index={index}
                                className={`
                                aspect-square overflow-hidden bg-muted
                                border-2 transition-colors cursor-pointer
                                ${
                                    selectedImageIndex === index
                                        ? 'border-primary'
                                        : 'border-transparent hover:border-border'
                                }
                            `}>
                                <DynamicImage
                                    src={image.thumbSrc || image.src}
                                    alt={image.alt || imageAltFallback}
                                    widths={thumbnailWidths}
                                    className="w-full h-full"
                                    imageProps={{ className: 'w-full h-full object-cover object-center' }}
                                    loading="lazy"
                                />
                            </button>
                        ))}
                    </div>
                )}

                {/* Horizontal Scrollable Thumbnail Strip */}
                {images.length > 1 && horizontalThumbnails && (
                    <div className="relative flex items-center gap-2">
                        {images.length > 4 && (
                            <button
                                type="button"
                                onClick={handleScrollThumbnailsLeft}
                                className={cn(
                                    'hidden sm:flex h-8 w-8 flex-shrink-0 items-center justify-center border border-border bg-background shadow-md',
                                    'hover:bg-muted transition-colors',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                                )}
                                aria-label={tCommon('previousImage')}>
                                <ChevronLeft className="size-4" />
                            </button>
                        )}
                        <div
                            ref={thumbStripRef}
                            data-gallery-strip
                            className="flex flex-1 gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            {images.map((image, index) => (
                                <button
                                    key={image.src + (image.thumbSrc || '')}
                                    onClick={handleThumbnailClick}
                                    onPointerEnter={handleThumbnailIntent}
                                    onFocus={handleThumbnailIntent}
                                    data-index={index}
                                    className={cn(
                                        'flex-shrink-0 h-16 w-16 sm:h-20 sm:w-20 overflow-hidden bg-muted',
                                        'border-2 transition-colors cursor-pointer',
                                        selectedImageIndex === index
                                            ? 'border-primary'
                                            : 'border-transparent hover:border-border'
                                    )}>
                                    <DynamicImage
                                        src={image.thumbSrc || image.src}
                                        alt={image.alt || imageAltFallback}
                                        widths={DEFAULT_WIDTHS_THUMBNAIL_STRIP}
                                        className="w-full h-full"
                                        imageProps={{ className: 'w-full h-full object-cover object-center' }}
                                        loading="lazy"
                                    />
                                </button>
                            ))}
                        </div>
                        {images.length > 4 && (
                            <button
                                type="button"
                                onClick={handleScrollThumbnailsRight}
                                className={cn(
                                    'hidden sm:flex h-8 w-8 flex-shrink-0 items-center justify-center border border-border bg-background shadow-md',
                                    'hover:bg-muted transition-colors',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                                )}
                                aria-label={tCommon('nextImage')}>
                                <ChevronRight className="size-4" />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </UITarget>
    );
}
