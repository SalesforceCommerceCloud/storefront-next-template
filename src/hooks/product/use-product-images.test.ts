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

/**
 * useProductImages Hook Tests
 *
 * Tests the useProductImages hook functionality including image filtering,
 * attribute-based selection, and gallery image transformation.
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { useProductImages } from './use-product-images';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import type { ShopperProducts } from '@/scapi';

const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ConfigProvider, { config: mockConfig, children } as never);

const createMockProduct = (
    imageGroups?: ShopperProducts.schemas['ImageGroup'][]
): ShopperProducts.schemas['Product'] => {
    return {
        id: 'test-product-id',
        name: 'Test Product',
        imageGroups,
    } as ShopperProducts.schemas['Product'];
};

const createMockImageGroup = (
    viewType: string,
    images: ShopperProducts.schemas['Image'][],
    variationAttributes?: Record<string, string>
): ShopperProducts.schemas['ImageGroup'] => {
    // Convert variationAttributes object to array format expected by findImageGroupBy
    // The structure should be: [{ id: 'color', values: [{ value: 'red' }] }]
    const variationAttributesArray = variationAttributes
        ? Object.entries(variationAttributes).map(([id, value]) => ({
              id,
              values: [{ value }],
          }))
        : [];

    return {
        viewType,
        images,
        variationAttributes: variationAttributesArray,
    } as ShopperProducts.schemas['ImageGroup'];
};

const createMockImage = (link: string, alt?: string): ShopperProducts.schemas['Image'] => {
    return {
        link,
        disBaseLink: link,
        alt: alt || 'Test Image',
    } as ShopperProducts.schemas['Image'];
};

describe('useProductImages', () => {
    describe('default images', () => {
        it('should return default images when no attributes are selected', () => {
            const defaultImages = [
                createMockImage('https://example.com/image1.jpg'),
                createMockImage('https://example.com/image2.jpg'),
            ];
            const product = createMockProduct([createMockImageGroup('large', defaultImages)]);

            const { result } = renderHook(
                () =>
                    useProductImages({
                        product,
                        selectedAttributes: undefined,
                    }),
                { wrapper }
            );

            expect(result.current.galleryImages).toHaveLength(2);
            expect(result.current.galleryImages[0].src).toBe('https://example.com/image1.jpg');
            expect(result.current.galleryImages[1].src).toBe('https://example.com/image2.jpg');
        });

        it('should return empty array when no image groups exist', () => {
            const product = createMockProduct();

            const { result } = renderHook(
                () =>
                    useProductImages({
                        product,
                    }),
                { wrapper }
            );

            expect(result.current.galleryImages).toEqual([]);
        });

        it('should return empty array when no images in default group', () => {
            const product = createMockProduct([createMockImageGroup('large', [])]);

            const { result } = renderHook(
                () =>
                    useProductImages({
                        product,
                    }),
                { wrapper }
            );

            expect(result.current.galleryImages).toEqual([]);
        });
    });

    describe('attribute-based filtering', () => {
        it('should return images matching selected attributes', () => {
            const colorRedImages = [
                createMockImage('https://example.com/red1.jpg'),
                createMockImage('https://example.com/red2.jpg'),
            ];
            const defaultImages = [createMockImage('https://example.com/default.jpg')];

            const product = createMockProduct([
                createMockImageGroup('large', defaultImages),
                createMockImageGroup('large', colorRedImages, { color: 'red' }),
            ]);

            const { result } = renderHook(
                () =>
                    useProductImages({
                        product,
                        selectedAttributes: { color: 'red' },
                    }),
                { wrapper }
            );

            expect(result.current.galleryImages).toHaveLength(2);
            expect(result.current.galleryImages[0].src).toBe('https://example.com/red1.jpg');
        });

        it('should fallback to default images when no matching group found', () => {
            const defaultImages = [createMockImage('https://example.com/default.jpg')];

            const product = createMockProduct([
                createMockImageGroup('large', defaultImages),
                createMockImageGroup('large', [], { color: 'blue' }),
            ]);

            const { result } = renderHook(
                () =>
                    useProductImages({
                        product,
                        selectedAttributes: { color: 'red' },
                    }),
                { wrapper }
            );

            expect(result.current.galleryImages).toHaveLength(1);
            expect(result.current.galleryImages[0].src).toBe('https://example.com/default.jpg');
        });
    });

    describe('view type filtering', () => {
        it('should return images for specified view type', () => {
            const largeImages = [createMockImage('https://example.com/large.jpg')];
            const mediumImages = [createMockImage('https://example.com/medium.jpg')];

            const product = createMockProduct([
                createMockImageGroup('large', largeImages),
                createMockImageGroup('medium', mediumImages),
            ]);

            const { result } = renderHook(
                () =>
                    useProductImages({
                        product,
                        viewType: 'medium',
                    }),
                { wrapper }
            );

            expect(result.current.galleryImages).toHaveLength(1);
            expect(result.current.galleryImages[0].src).toBe('https://example.com/medium.jpg');
        });

        it('should default to large view type', () => {
            const largeImages = [createMockImage('https://example.com/large.jpg')];
            const mediumImages = [createMockImage('https://example.com/medium.jpg')];

            const product = createMockProduct([
                createMockImageGroup('large', largeImages),
                createMockImageGroup('medium', mediumImages),
            ]);

            const { result } = renderHook(
                () =>
                    useProductImages({
                        product,
                    }),
                { wrapper }
            );

            expect(result.current.galleryImages).toHaveLength(1);
            expect(result.current.galleryImages[0].src).toBe('https://example.com/large.jpg');
        });
    });

    describe('image transformation', () => {
        it('should transform images to gallery format', () => {
            const images = [
                createMockImage('https://example.com/image1.jpg', 'Image 1'),
                createMockImage('https://example.com/image2.jpg', 'Image 2'),
            ];

            const product = createMockProduct([createMockImageGroup('large', images)]);

            const { result } = renderHook(
                () =>
                    useProductImages({
                        product,
                    }),
                { wrapper }
            );

            expect(result.current.galleryImages[0]).toEqual({
                src: 'https://example.com/image1.jpg',
                alt: 'Image 1',
                thumbSrc: 'https://example.com/image1.jpg',
            });
        });

        it('should use product name as alt text fallback', () => {
            // Create image without alt text to test fallback
            const image = {
                link: 'https://example.com/image1.jpg',
                disBaseLink: 'https://example.com/image1.jpg',
                alt: undefined,
            } as ShopperProducts.schemas['Image'];

            const images = [image];

            const product = createMockProduct([createMockImageGroup('large', images)]);
            product.name = 'Test Product Name';

            const { result } = renderHook(
                () =>
                    useProductImages({
                        product,
                    }),
                { wrapper }
            );

            expect(result.current.galleryImages[0].alt).toBe('Test Product Name');
        });

        it('should use disBaseLink over link when available', () => {
            const image = {
                link: 'https://example.com/link.jpg',
                disBaseLink: 'https://example.com/disBaseLink.jpg',
                alt: 'Test',
            } as ShopperProducts.schemas['Image'];

            const product = createMockProduct([createMockImageGroup('large', [image])]);

            const { result } = renderHook(
                () =>
                    useProductImages({
                        product,
                    }),
                { wrapper }
            );

            expect(result.current.galleryImages[0].src).toBe('https://example.com/disBaseLink.jpg');
        });

        it('should drop entries whose link/disBaseLink lack a DIS-supported extension', () => {
            const image = {
                link: '',
                disBaseLink: '',
                alt: 'Test',
            } as ShopperProducts.schemas['Image'];

            const product = createMockProduct([createMockImageGroup('large', [image])]);

            const { result } = renderHook(
                () =>
                    useProductImages({
                        product,
                    }),
                { wrapper }
            );

            expect(result.current.galleryImages).toEqual([]);
        });
    });

    // Restrict the gallery to assets DIS can transform. Anything else (videos, 3D models, opaque blobs SFCC merchants
    // sometimes attach to image_groups) cannot flow through the <picture>/<DynamicImage> pipeline, so we drop it at the
    // hook boundary rather than carrying a media-type discriminator through the UI.
    describe('non-image filtering', () => {
        it.each(['mp4', 'webm', 'ogg', 'mov'])('drops entries with video extension .%s', (ext) => {
            const videoEntry = {
                link: `https://example.com/product.${ext}`,
                disBaseLink: `https://example.com/product.${ext}`,
                alt: 'Product Video',
            } as ShopperProducts.schemas['Image'];

            const product = createMockProduct([createMockImageGroup('large', [videoEntry])]);

            const { result } = renderHook(() => useProductImages({ product }), { wrapper });

            expect(result.current.galleryImages).toEqual([]);
        });

        it.each([
            'jpg',
            'jpeg',
            'png',
            'webp',
            'gif',
            'avif',
            'jp2',
            'tif',
            'tiff',
        ])('keeps entries with DIS-supported extension .%s', (ext) => {
            const image = {
                link: `https://example.com/product.${ext}`,
                disBaseLink: `https://example.com/product.${ext}`,
                alt: 'Product Image',
            } as ShopperProducts.schemas['Image'];

            const product = createMockProduct([createMockImageGroup('large', [image])]);

            const { result } = renderHook(() => useProductImages({ product }), { wrapper });

            expect(result.current.galleryImages).toHaveLength(1);
        });

        it('keeps only the image entries when image groups mix images and unsupported assets', () => {
            const mixedMedia = [
                createMockImage('https://example.com/image1.jpg'),
                {
                    link: 'https://example.com/demo.mp4',
                    disBaseLink: 'https://example.com/demo.mp4',
                    alt: 'Demo Video',
                } as ShopperProducts.schemas['Image'],
                createMockImage('https://example.com/image2.png'),
            ];

            const product = createMockProduct([createMockImageGroup('large', mixedMedia)]);

            const { result } = renderHook(() => useProductImages({ product }), { wrapper });

            expect(result.current.galleryImages).toHaveLength(2);
            expect(result.current.galleryImages[0].src).toContain('image1');
            expect(result.current.galleryImages[1].src).toContain('image2');
        });

        it('drops entries whose path lacks any extension', () => {
            const blob = {
                link: 'https://example.com/media/asset',
                disBaseLink: 'https://example.com/media/asset',
                alt: 'Opaque blob',
            } as ShopperProducts.schemas['Image'];

            const product = createMockProduct([createMockImageGroup('large', [blob])]);

            const { result } = renderHook(() => useProductImages({ product }), { wrapper });

            expect(result.current.galleryImages).toEqual([]);
        });
    });
});
