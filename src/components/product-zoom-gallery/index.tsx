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
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useTranslation } from 'react-i18next';
import ImageGalleryContent, { type ImageGalleryContentProps } from '@/components/image-gallery/gallery-content';
import { MOSAIC_MAX_IMAGES } from '@/components/image-gallery/constants';

// Lazy-mounted so the lightbox chunk and hi-res image request never load until a shopper opens zoom.
const ProductZoomModal = lazy(() => import('@/components/product-zoom-modal'));

type ProductZoomGalleryProps = Omit<
    ImageGalleryContentProps,
    'onSelectedImageIndexChange' | 'renderImageOverlay' | 'selectedImageIndex'
>;

/**
 * PDP-only image gallery with an on-demand image zoom dialog.
 *
 * Shared gallery content owns ordinary image selection. This PDP-only controller supplies the zoom
 * action while ImageGallery's public API remains zoom-free for other consumers.
 */
export default function ProductZoomGallery({
    images,
    productName,
    layout = 'stacked',
    ...galleryProps
}: ProductZoomGalleryProps): ReactElement {
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [zoomLoaded, setZoomLoaded] = useState(false);
    const [zoomOpen, setZoomOpen] = useState(false);
    const zoomTriggerRef = useRef<HTMLButtonElement>(null);
    const config = useConfig();
    const { t } = useTranslation('common');
    const zoomAvailable = config?.images?.enableDis !== false;
    const galleryImages = layout === 'mosaic' ? images.slice(0, MOSAIC_MAX_IMAGES) : images;

    useEffect(() => {
        setSelectedImageIndex((currentIndex) => (currentIndex < galleryImages.length ? currentIndex : 0));
    }, [images, layout, galleryImages.length]);

    const openZoom = useCallback((trigger: HTMLButtonElement, imageIndex: number) => {
        zoomTriggerRef.current = trigger;
        setSelectedImageIndex(imageIndex);
        setZoomLoaded(true);
        setZoomOpen(true);
    }, []);

    return (
        <>
            <ImageGalleryContent
                {...galleryProps}
                images={galleryImages}
                productName={productName}
                layout={layout}
                selectedImageIndex={selectedImageIndex}
                onSelectedImageIndexChange={setSelectedImageIndex}
                renderImageOverlay={
                    zoomAvailable
                        ? (imageIndex) => (
                              <ZoomTrigger
                                  imageIndex={imageIndex}
                                  onZoom={openZoom}
                                  accessibleName={t('zoom.openImage', {
                                      current: imageIndex + 1,
                                      total: galleryImages.length,
                                      defaultValue: 'Zoom image {{current}} of {{total}}',
                                  })}
                              />
                          )
                        : undefined
                }
            />
            {zoomLoaded && (
                <Suspense fallback={null}>
                    <ProductZoomModal
                        images={galleryImages}
                        initialIndex={selectedImageIndex}
                        open={zoomOpen}
                        onOpenChange={setZoomOpen}
                        onIndexChange={setSelectedImageIndex}
                        productName={productName}
                        triggerRef={zoomTriggerRef}
                    />
                </Suspense>
            )}
        </>
    );
}

interface ZoomTriggerProps {
    imageIndex: number;
    onZoom: (trigger: HTMLButtonElement, imageIndex: number) => void;
    accessibleName: string;
}

function ZoomTrigger({ imageIndex, onZoom, accessibleName }: ZoomTriggerProps): ReactElement {
    return (
        <button
            type="button"
            onClick={(event) => onZoom(event.currentTarget, imageIndex)}
            data-slot="gallery-zoom-trigger"
            className="absolute inset-0 h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            aria-label={accessibleName}
            aria-haspopup="dialog"
        />
    );
}
