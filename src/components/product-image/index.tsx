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
import { useCallback, useMemo, useState } from 'react';
import { Link } from '@/components/link';
import type { ShopperSearch } from '@/scapi';
import { createProductUrl, getImagesForColor } from '@/lib/product/product-utils';
import { useDynamicImageContext } from '@/providers/dynamic-image';
import { ProductImage } from './product-image';
import ImageNavArrows from '@/components/image-nav-arrows';
import { useTranslation } from 'react-i18next';

interface ProductImageContainerProps {
    product: ShopperSearch.schemas['ProductSearchHit'];
    selectedColorValue?: string | null;
    className?: string;
    handleProductClick?: (product: ShopperSearch.schemas['ProductSearchHit']) => void;
    /** Image aspect ratio (width/height). If provided, calculates height based on viewport width. Defaults to 1 (square) */
    imgAspectRatio?: number;
    /** Show prev/next navigation arrows when multiple images are available */
    showNavigationArrows?: boolean;
}

const ProductImageContainer = ({
    product,
    selectedColorValue = null,
    className,
    handleProductClick,
    imgAspectRatio = 1,
    showNavigationArrows = false,
}: ProductImageContainerProps) => {
    const { t } = useTranslation('product');
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);

    // Get all images for the selected color variant
    const allImages = useMemo(
        () => getImagesForColor(product, selectedColorValue, 'medium'),
        [product, selectedColorValue]
    );

    const currentImage = allImages[selectedImageIndex] ?? allImages[0] ?? product.image;
    const currentImageUrl = currentImage?.disBaseLink || currentImage?.link;
    const imageAltFallback = product.productName || t('imageAlt') || 'Product Image';

    // Report the image URL to the dynamic image context, if available
    const imageContext = useDynamicImageContext();
    currentImageUrl && imageContext?.addSource(currentImageUrl);

    const handleClick = useCallback(() => {
        handleProductClick?.(product);
    }, [handleProductClick, product]);

    // When a non-square aspect ratio is requested, apply it via the native CSS
    // `aspect-ratio` property. The legacy padding-bottom percentage trick is not
    // used here because it conflicts with the native property and collapses the
    // image height to zero.
    const heightStyle = imgAspectRatio !== 1 ? { aspectRatio: `${imgAspectRatio}` } : {};

    return (
        <div
            className={`${showNavigationArrows ? 'group/image ' : ''}relative overflow-hidden bg-secondary/20 flex flex-col ${
                imgAspectRatio === 1 ? 'aspect-square' : ''
            } ${className || ''}`}
            style={heightStyle}>
            {/* Product Image — mouse convenience only, hidden from AT so the tile
                exposes a single PDP link (the product name) to screen readers and
                the keyboard tab order. */}
            <Link
                to={createProductUrl(product.productId, selectedColorValue)}
                onClick={handleClick}
                className="block w-full h-full flex-1"
                aria-hidden="true"
                tabIndex={-1}>
                <ProductImage
                    src={currentImageUrl || ''}
                    alt={currentImage?.alt || imageAltFallback}
                    className="w-full h-full object-cover transition-all duration-200 group-hover:scale-105"
                    widths={imageContext?.widths}
                />
            </Link>
            {/* Navigation Arrows - visible on hover */}
            {showNavigationArrows && allImages.length > 1 && (
                <ImageNavArrows
                    imageCount={allImages.length}
                    onIndexChange={setSelectedImageIndex}
                    className="opacity-0 group-hover/image:opacity-100 transition-opacity"
                />
            )}
        </div>
    );
};

export { ProductImageContainer };
