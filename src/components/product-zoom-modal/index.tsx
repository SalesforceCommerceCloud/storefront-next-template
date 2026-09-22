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
    type KeyboardEvent,
    type MouseEvent,
    type PointerEvent,
    type ReactElement,
    type RefObject,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DynamicImage } from '@/components/dynamic-image';
import ImageNavArrows from '@/components/image-nav-arrows';
import type { GalleryImage } from '@/components/image-gallery';
import type { DynamicImageDimensions } from '@/lib/images/dynamic-image';
import { cn } from '@/lib/utils';

/**
 * Responsive widths for the zoomed image. Deliberately larger than the gallery's inline widths so DIS
 * delivers a hi-res variant worth inspecting; the 2× srcSet doubles these again on high-DPR screens.
 * Sits on the shared width ladder (`1200` main rung ×2) to maximize CDN cache reuse.
 */
const ZOOM_WIDTHS: DynamicImageDimensions = { base: '100vw', md: 1200 };

/** Magnification applied while the image is in the zoomed-in state (click-to-toggle). */
const MAGNIFY_SCALE = 2.5;
const PAN_STEP = 10;

export interface ProductZoomModalProps {
    /** The gallery images to page through in the lightbox (same array the gallery renders). */
    images: GalleryImage[];
    /** Index of the image to show when the lightbox opens; kept in sync with the gallery selection. */
    initialIndex: number;
    /** Whether the lightbox is open. */
    open: boolean;
    /** Called when the lightbox requests to close (Escape, overlay click, close button). */
    onOpenChange: (open: boolean) => void;
    /** Fallback alt text / accessible name (usually the product name). */
    productName?: string;
    /** Notifies the parent when the shopper pages to a different image, so the gallery can stay in sync. */
    onIndexChange?: (index: number) => void;
    /** The gallery zoom control that opened this controlled dialog, used to restore focus on close. */
    triggerRef?: RefObject<HTMLButtonElement | null>;
}

/**
 * Product-image lightbox opened from the PDP gallery to inspect a higher-resolution image.
 *
 * Presentation: a large centered dialog (not fullscreen) over a dimmed backdrop — click the backdrop or
 * press Escape to close. Built on the design-system `Dialog` (Radix), so focus trapping, Escape-to-close,
 * `aria-modal`, and scroll-lock come for free. On top of that it adds reused `ImageNavArrows` for
 * prev/next, arrow-key navigation (which Radix does not provide), an image counter, and an `sr-only`
 * title/description for an accessible name.
 *
 * Magnify interaction: the image starts fit-to-dialog. Clicking it toggles a magnified view
 * (`MAGNIFY_SCALE`); while magnified, moving the cursor or using the arrow keys pans the enlarged image
 * by changing its CSS `transform-origin`. Clicking again returns to the fit view, and paging to another
 * image resets magnify. On touch, tapping toggles magnify and the tap point sets the pan origin. Honors
 * `prefers-reduced-motion` by dropping the zoom transition. (`Escape` closes the dialog, per the
 * design-system Dialog default.)
 *
 * Intended to be lazy-mounted by ProductZoomGallery — never import it eagerly.
 */
export default function ProductZoomModal({
    images,
    initialIndex,
    open,
    onOpenChange,
    productName,
    onIndexChange,
    triggerRef,
}: ProductZoomModalProps): ReactElement | null {
    const { t } = useTranslation('common');
    const { t: tProduct } = useTranslation('product');
    const [index, setIndex] = useState(initialIndex);
    const [magnified, setMagnified] = useState(false);
    // Pointer position as a percentage within the visible image; drives the pan `transform-origin`.
    const [origin, setOrigin] = useState({ x: 50, y: 50 });
    const imageContainerRef = useRef<HTMLDivElement>(null);

    // Sync the internal index to the requested one whenever the lightbox (re)opens or the caller changes
    // the selected slide. Clamp so a shrinking `images` array (variant swap) can't point out of bounds.
    useEffect(() => {
        const nextIndex = initialIndex < images.length ? initialIndex : 0;
        setIndex(nextIndex);
    }, [initialIndex, images.length, open]);

    // Reset magnify whenever the slide changes or the lightbox closes — never carry a zoomed state across.
    useEffect(() => {
        setMagnified(false);
        setOrigin({ x: 50, y: 50 });
    }, [index, open]);

    // Change slide and always drop magnify, then notify the gallery of shopper-initiated navigation.
    const goTo = useCallback(
        (nextIndex: number) => {
            setMagnified(false);
            setIndex(nextIndex);
            onIndexChange?.(nextIndex);
        },
        [onIndexChange]
    );

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>) => {
            if (magnified) {
                const panDelta =
                    event.key === 'ArrowLeft'
                        ? { x: -PAN_STEP, y: 0 }
                        : event.key === 'ArrowRight'
                          ? { x: PAN_STEP, y: 0 }
                          : event.key === 'ArrowUp'
                            ? { x: 0, y: -PAN_STEP }
                            : event.key === 'ArrowDown'
                              ? { x: 0, y: PAN_STEP }
                              : undefined;
                if (!panDelta) {
                    return;
                }

                event.preventDefault();
                setOrigin(({ x, y }) => ({
                    x: Math.min(100, Math.max(0, x + panDelta.x)),
                    y: Math.min(100, Math.max(0, y + panDelta.y)),
                }));
                return;
            }

            if (images.length <= 1) {
                return;
            }
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                goTo(index <= 0 ? images.length - 1 : index - 1);
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                goTo(index >= images.length - 1 ? 0 : index + 1);
            }
        },
        [images.length, index, magnified, goTo]
    );

    // Track the pointer within the image's untransformed layout box, not the full letterboxed viewport.
    // Product photos commonly leave space around the contained image, and getBoundingClientRect() on
    // the scaled <img> would feed the previous transform back into the next pan calculation.
    const updateOrigin = useCallback((event: PointerEvent<HTMLButtonElement>) => {
        const rect = imageContainerRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) {
            return;
        }
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        setOrigin({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) });
    }, []);

    const handlePointerMove = useCallback(
        (event: PointerEvent<HTMLButtonElement>) => {
            if (magnified) {
                updateOrigin(event);
            }
        },
        [magnified, updateOrigin]
    );

    const handleToggleMagnify = useCallback((event: MouseEvent<HTMLButtonElement>) => {
        // Keyboard activation produces a click with no pointer detail. Start it from the center rather
        // than retaining the last pointer pan origin.
        if (event.detail === 0) {
            setOrigin({ x: 50, y: 50 });
        }
        setMagnified((m) => !m);
    }, []);

    if (images.length === 0) {
        return null;
    }

    const current = images[index] ?? images[0];
    const accessibleName = productName || tProduct('imageAlt') || 'Product image';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                // Large centered dialog (not fullscreen): ~90% of the viewport, leaving a backdrop margin.
                // `sm:max-w-[90vw]` is required to beat the DS Dialog's default `sm:max-w-lg` cap.
                className={cn(
                    'w-[90vw] max-w-[90vw] sm:max-w-[90vw] h-[90vh] max-h-[90vh] gap-0 p-0 overflow-hidden',
                    'motion-reduce:animate-none'
                )}
                data-slot="product-zoom-modal"
                onCloseAutoFocus={(event) => {
                    // Radix can restore focus only for a <DialogTrigger>. This controlled dialog is opened
                    // by a gallery button outside its tree, so return focus explicitly to that button.
                    const trigger = triggerRef?.current;
                    if (trigger?.isConnected) {
                        event.preventDefault();
                        trigger.focus();
                    }
                }}
                onKeyDown={handleKeyDown}>
                {/* Accessible name/description for the dialog (Radix requires a title). */}
                <DialogTitle className="sr-only">{t('zoom.title', { defaultValue: 'Product image' })}</DialogTitle>
                <DialogDescription className="sr-only">
                    {t('zoom.description', {
                        defaultValue:
                            'Zoomed product image. Click the image to magnify. When magnified, use the arrow keys to pan. Otherwise, use left and right arrow keys to change image.',
                    })}
                </DialogDescription>

                <div className="relative flex h-full w-full items-center justify-center bg-muted">
                    {/* The native overlay button toggles magnify; pointer movement and arrow keys pan via transform-origin. */}
                    <div className="relative flex h-full w-full items-center justify-center overflow-hidden select-none">
                        <div ref={imageContainerRef} className="relative max-h-[90vh] max-w-full">
                            <DynamicImage
                                key={current.src}
                                src={current.src}
                                alt={current.alt || accessibleName}
                                widths={ZOOM_WIDTHS}
                                className="max-h-full max-w-full"
                                imageProps={{
                                    className: cn(
                                        'max-h-[90vh] w-auto object-contain transition-transform duration-200 ease-out',
                                        'motion-reduce:transition-none'
                                    ),
                                    style: {
                                        transform: magnified ? `scale(${MAGNIFY_SCALE})` : 'scale(1)',
                                        transformOrigin: `${origin.x}% ${origin.y}%`,
                                    },
                                }}
                                loading="eager"
                                priority="high"
                            />
                            <button
                                type="button"
                                data-slot="product-zoom-viewport"
                                onClick={handleToggleMagnify}
                                onPointerDown={updateOrigin}
                                onPointerMove={handlePointerMove}
                                aria-pressed={magnified}
                                aria-label={t('zoom.magnify', { defaultValue: 'Toggle image magnification' })}
                                className={cn(
                                    'absolute inset-0 touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                                    magnified ? 'cursor-zoom-out' : 'cursor-zoom-in'
                                )}
                            />
                        </div>
                    </div>

                    {images.length > 1 && (
                        <ImageNavArrows
                            currentIndex={index}
                            imageCount={images.length}
                            onIndexChange={goTo}
                            size="lg"
                        />
                    )}

                    {images.length > 1 && (
                        <p
                            data-slot="product-zoom-counter"
                            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-ui bg-background/90 px-3 py-1 text-sm text-foreground shadow-md"
                            aria-live="polite">
                            {t('zoom.counter', {
                                current: index + 1,
                                total: images.length,
                                defaultValue: '{{current}} of {{total}}',
                            })}
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
