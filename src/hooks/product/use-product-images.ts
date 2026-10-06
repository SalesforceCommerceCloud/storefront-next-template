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
import { useMemo } from 'react';
import type { ShopperProducts } from '@/scapi';
import type { GalleryImage } from '@/components/image-gallery';
import { findImageGroupBy } from '@/lib/product/image-groups-utils';
import { isDynamicImageSource, toImageUrl } from '@/lib/images/dynamic-image';
import { useVariationMedia } from '@/hooks/product/use-variation-media';
import { useConfig } from '@salesforce/storefront-next-runtime/config';

interface UseProductImagesProps {
    product: ShopperProducts.schemas['Product'];
    selectedAttributes?: Record<string, string>;
    viewType?: string;
}

interface UseProductImagesReturn {
    galleryImages: GalleryImage[];
}

/**
 * Helper function to get default images from image groups
 * @param imageGroups - The image groups array
 * @param viewType - The view type to filter by (defaults to 'large')
 * @returns Array of images for the specified view type
 */
const getDefaultImages = (
    imageGroups: ShopperProducts.schemas['ImageGroup'][] | undefined,
    viewType: string = 'large'
): ShopperProducts.schemas['Image'][] => {
    return imageGroups?.find((group) => group.viewType === viewType)?.images || [];
};

/**
 * Manages product images based on variation attributes with automatic fallbacks.
 *
 * @example Basic usage in ProductView
 * ```tsx
 * const [selectedAttributes, setSelectedAttributes] = useState({});
 * const { galleryImages } = useProductImages({
 *   product,
 *   selectedAttributes,
 * });
 * return <ImageGallery images={galleryImages} />;
 * ```
 *
 * @example With specific view type
 * ```tsx
 * const { galleryImages } = useProductImages({
 *   product,
 *   selectedAttributes: { color: 'red', size: 'M' },
 *   viewType: 'large'
 * });
 * ```
 *
 * @param props - Configuration object
 * @param props.product - Product with image groups
 * @param props.selectedAttributes - Selected variation attributes
 * @param props.viewType - Image size ('large', 'medium', 'small', etc.)
 * @returns Gallery images and utility functions
 */
export function useProductImages({
    product,
    selectedAttributes,
    viewType = 'large',
}: UseProductImagesProps): UseProductImagesReturn {
    const config = useConfig();

    // Per-combination media declared on `c_variationMedia`. Covers multi-axis heroes SCAPI can't express
    // through standard `imageGroups` (it decorates only one variation axis). Empty for any product without
    // the attribute, so the standard path below is a no-op fallback for every existing catalog.
    const { imagesByViewType } = useVariationMedia({ product, selectedAttributes });

    // Get images filtered by selected attributes
    const filteredImages = useMemo(() => {
        // Prefer per-combination variation media when the product declares USABLE images for this view
        // type. Filter to DIS-ingestible sources first: a `c_variationMedia` entry pointing at a
        // non-image path (e.g. a video) must NOT shadow the standard gallery — drop it and fall through
        // so a malformed entry degrades to `imageGroups` instead of yielding an empty hero.
        const variationImages = imagesByViewType[viewType]?.filter((image) =>
            isDynamicImageSource(image.disBaseLink ?? image.link)
        );
        if (variationImages && variationImages.length > 0) {
            return variationImages;
        }

        // Return default images if no attributes are selected
        if (!selectedAttributes || Object.keys(selectedAttributes).length === 0) {
            return getDefaultImages(product.imageGroups, viewType);
        }

        // Find image group that matches the selected attributes
        const imageGroup = findImageGroupBy(product.imageGroups || [], {
            viewType,
            selectedVariationAttributes: selectedAttributes,
        });

        // Return images from the matching group, or fallback to default images
        return imageGroup?.images || getDefaultImages(product.imageGroups, viewType);
    }, [product.imageGroups, selectedAttributes, viewType, imagesByViewType]);

    // Transform Commerce SDK images to GalleryImage format. We restrict the gallery to assets DIS can actually
    // process as a source image — anything else (videos, 3D models, unknown blobs SFCC merchants sometimes attach
    // to `image_groups`) cannot be served through the `<picture>`/`<DynamicImage>` pipeline and is dropped here so
    // downstream code never needs to special-case it.
    const galleryImages: GalleryImage[] = useMemo(() => {
        if (!filteredImages || filteredImages.length === 0) {
            return [];
        }

        return filteredImages.flatMap((image: ShopperProducts.schemas['Image']): GalleryImage[] => {
            if (!isDynamicImageSource(image.disBaseLink ?? image.link)) {
                return [];
            }
            const optimizedImageUrl = toImageUrl({ image, config }) || '';
            return [
                {
                    src: optimizedImageUrl,
                    alt: image.alt || product.name || '',
                    thumbSrc: optimizedImageUrl,
                },
            ];
        });
    }, [filteredImages, product.name, config]);

    return {
        // Transformed images
        /** Array of images formatted for gallery display, filtered by selected attributes */
        galleryImages,
    };
}
