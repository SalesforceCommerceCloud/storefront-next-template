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
import ImageGallery, { type GalleryImage } from '@/components/image-gallery';

interface ChildProductCardGalleryProps {
    images: GalleryImage[];
    productName?: string;
    widths: {
        main: { base: number; md: number };
        thumbnail: { base: number; md: number };
    };
}

/**
 * Defers the reusable gallery implementation from product set and bundle card shells.
 *
 * The parent reserves the square image region while this module loads, so loading the gallery does
 * not shift the rest of the card.
 */
export default function ChildProductCardGallery({ images, productName, widths }: ChildProductCardGalleryProps) {
    return <ImageGallery images={images} eager={false} productName={productName} widths={widths} />;
}
