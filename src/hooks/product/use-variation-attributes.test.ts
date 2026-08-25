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
 * useVariationAttributes Hook Tests
 *
 * Tests the useVariationAttributes hook functionality including variation attribute
 * processing, URL generation, image swatch handling, and orderability checks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useVariationAttributes } from './use-variation-attributes';
import { useSelectedVariations } from './use-selected-variations';
import { useLocation } from 'react-router';
import { findImageGroupBy } from '@/lib/product/image-groups-utils';
import type { ShopperProducts } from '@/scapi';

vi.mock('react-router', () => ({
    href: (path: string) => path,
    useLocation: vi.fn(),
}));

vi.mock('./use-selected-variations', () => ({
    useSelectedVariations: vi.fn(),
}));

vi.mock('@/lib/product/image-groups-utils', () => ({
    findImageGroupBy: vi.fn(),
}));

const createMockProduct = (
    variationAttributes?: ShopperProducts.schemas['VariationAttribute'][],
    variants?: ShopperProducts.schemas['Variant'][],
    imageGroups?: ShopperProducts.schemas['ImageGroup'][]
): ShopperProducts.schemas['Product'] => {
    return {
        id: 'test-product-id',
        name: 'Test Product',
        variationAttributes,
        variants,
        imageGroups,
    } as ShopperProducts.schemas['Product'];
};

const createMockVariationAttribute = (
    id: string,
    name: string,
    values: Array<{ name: string; value: string; orderable?: boolean; description?: string }>
): ShopperProducts.schemas['VariationAttribute'] => {
    return {
        id,
        name,
        values,
    } as ShopperProducts.schemas['VariationAttribute'];
};

const createMockVariant = (
    variationValues: Record<string, string>,
    orderable: boolean = true
): ShopperProducts.schemas['Variant'] => {
    return {
        productId: 'variant-id',
        variationValues,
        orderable,
    } as ShopperProducts.schemas['Variant'];
};

describe('useVariationAttributes', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        vi.mocked(useLocation).mockReturnValue({
            pathname: '/product/test-product-id',
            search: '',
        } as any);

        vi.mocked(useSelectedVariations).mockReturnValue({});
    });

    describe('empty states', () => {
        it('should return empty array when product has no variation attributes', () => {
            const product = createMockProduct();

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current).toEqual([]);
        });

        it('should return empty array when product has no id', () => {
            const product = createMockProduct([
                createMockVariationAttribute('color', 'Color', [{ name: 'Red', value: 'RED' }]),
            ]);

            (product as any).id = undefined;

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current).toEqual([]);
        });
    });

    describe('variation attribute processing', () => {
        it('should process variation attributes correctly', () => {
            const product = createMockProduct([
                createMockVariationAttribute('color', 'Color', [
                    { name: 'Red', value: 'RED' },
                    { name: 'Blue', value: 'BLUE' },
                ]),
            ]);

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current).toHaveLength(1);
            expect(result.current[0].id).toBe('color');
            expect(result.current[0].name).toBe('Color');
            expect(result.current[0].values).toHaveLength(2);
        });

        it('should handle multiple variation attributes', () => {
            const product = createMockProduct([
                createMockVariationAttribute('color', 'Color', [{ name: 'Red', value: 'RED' }]),
                createMockVariationAttribute('size', 'Size', [
                    { name: 'Small', value: 'S' },
                    { name: 'Large', value: 'L' },
                ]),
            ]);

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current).toHaveLength(2);
            expect(result.current[0].id).toBe('color');
            expect(result.current[1].id).toBe('size');
        });
    });

    describe('selected value detection', () => {
        it('should detect selected value from URL parameters', () => {
            const product = createMockProduct([
                createMockVariationAttribute('color', 'Color', [
                    { name: 'Red', value: 'RED' },
                    { name: 'Blue', value: 'BLUE' },
                ]),
            ]);

            vi.mocked(useSelectedVariations).mockReturnValue({ color: 'RED' });

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current[0].selectedValue.value).toBe('RED');
            expect(result.current[0].selectedValue.name).toBe('Red');
            expect(result.current[0].values[0].selected).toBe(true);
            expect(result.current[0].values[1].selected).toBe(false);
        });

        it('should handle no selected value', () => {
            const product = createMockProduct([
                createMockVariationAttribute('color', 'Color', [{ name: 'Red', value: 'RED' }]),
            ]);

            vi.mocked(useSelectedVariations).mockReturnValue({});

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current[0].selectedValue.value).toBeUndefined();
            expect(result.current[0].selectedValue.name).toBeUndefined();
            expect(result.current[0].values[0].selected).toBe(false);
        });
    });

    describe('URL generation', () => {
        it('should generate correct hrefs for variation values', () => {
            const product = createMockProduct([
                createMockVariationAttribute('color', 'Color', [{ name: 'Red', value: 'RED' }]),
            ]);

            vi.mocked(useLocation).mockReturnValue({
                pathname: '/product/test-product-id',
                search: '',
            } as any);

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current[0].values[0].href).toContain('color=RED');
        });

        it('should preserve existing URL parameters when building hrefs', () => {
            const product = createMockProduct([
                createMockVariationAttribute('size', 'Size', [{ name: 'Large', value: 'L' }]),
            ]);

            vi.mocked(useLocation).mockReturnValue({
                pathname: '/product/test-product-id',
                search: '?color=RED',
            } as any);

            vi.mocked(useSelectedVariations).mockReturnValue({ color: 'RED' });

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current[0].values[0].href).toContain('color=RED');
            expect(result.current[0].values[0].href).toContain('size=L');
        });

        it('should handle child product URL parameters', () => {
            const product = createMockProduct([
                createMockVariationAttribute('color', 'Color', [{ name: 'Red', value: 'RED' }]),
            ]);

            vi.mocked(useLocation).mockReturnValue({
                pathname: '/product/test-product-id',
                search: `?test-product-id=color%3DRED`,
            } as any);

            vi.mocked(useSelectedVariations).mockReturnValue({ color: 'RED' });

            const { result } = renderHook(() => useVariationAttributes({ product, isChildProduct: true }));

            expect(result.current[0].values[0].href).toContain('test-product-id');
        });
    });

    describe('image swatch handling', () => {
        it('should find swatch images for color attributes', () => {
            const mockImage = {
                link: 'https://example.com/swatch.jpg',
                alt: 'Red Swatch',
            } as ShopperProducts.schemas['Image'];

            const mockImageGroup = {
                viewType: 'swatch',
                variationAttributes: [{ id: 'color', values: [{ value: 'RED' }] }],
                images: [mockImage],
            } as ShopperProducts.schemas['ImageGroup'];

            const product = createMockProduct(
                [createMockVariationAttribute('color', 'Color', [{ name: 'Red', value: 'RED' }])],
                undefined,
                [mockImageGroup]
            );

            vi.mocked(findImageGroupBy).mockReturnValue(mockImageGroup);

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(findImageGroupBy).toHaveBeenCalledWith(
                [mockImageGroup],
                expect.objectContaining({
                    viewType: 'swatch',
                    selectedVariationAttributes: { color: 'RED' },
                })
            );
            expect(result.current[0].values[0].image).toBe(mockImage);
        });

        it('should find swatch images for ANY axis that ships swatch imagery (e.g. size)', () => {
            const mockImage = {
                link: 'https://example.com/size-swatch.jpg',
                alt: 'Large size swatch',
            } as ShopperProducts.schemas['Image'];

            // A swatch group that declares the `size` axis — a data-driven, non-color image swatch.
            const mockImageGroup = {
                viewType: 'swatch',
                variationAttributes: [{ id: 'size', values: [{ value: 'L' }] }],
                images: [mockImage],
            } as ShopperProducts.schemas['ImageGroup'];

            const product = createMockProduct(
                [createMockVariationAttribute('size', 'Size', [{ name: 'Large', value: 'L' }])],
                undefined,
                [mockImageGroup]
            );

            vi.mocked(findImageGroupBy).mockReturnValue(mockImageGroup);

            const { result } = renderHook(() => useVariationAttributes({ product }));

            // Lookup is keyed by the attribute id, not hardcoded to `color`.
            expect(findImageGroupBy).toHaveBeenCalledWith(
                [mockImageGroup],
                expect.objectContaining({
                    viewType: 'swatch',
                    selectedVariationAttributes: { size: 'L' },
                })
            );
            expect(result.current[0].values[0].image).toBe(mockImage);
        });

        it('should ignore a swatch group that does not declare the requested axis (backward-safe)', () => {
            // Simulates findImageGroupBy's vacuous match: a `size` lookup on a color-only catalog
            // returns the FIRST (color) swatch group. The axis guard must reject it so the size
            // value renders as text rather than borrowing a color swatch image.
            const colorSwatchGroup = {
                viewType: 'swatch',
                variationAttributes: [{ id: 'color', values: [{ value: 'RED' }] }],
                images: [{ link: 'https://example.com/color-swatch.jpg', alt: 'Red swatch' }],
            } as ShopperProducts.schemas['ImageGroup'];

            const product = createMockProduct(
                [createMockVariationAttribute('size', 'Size', [{ name: 'Large', value: 'L' }])],
                undefined,
                [colorSwatchGroup]
            );

            vi.mocked(findImageGroupBy).mockReturnValue(colorSwatchGroup);

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current[0].values[0].image).toBeUndefined();
        });

        it('should not attempt a swatch lookup when the product has no image groups', () => {
            const product = createMockProduct([
                createMockVariationAttribute('size', 'Size', [{ name: 'Large', value: 'L' }]),
            ]);

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(findImageGroupBy).not.toHaveBeenCalled();
            expect(result.current[0].values[0].image).toBeUndefined();
        });
    });

    describe('orderability checks', () => {
        it('should mark values as orderable when variants exist', () => {
            const product = createMockProduct(
                [createMockVariationAttribute('color', 'Color', [{ name: 'Red', value: 'RED' }])],
                [createMockVariant({ color: 'RED' }, true)]
            );

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current[0].values[0].orderable).toBe(true);
            expect(result.current[0].values[0].disabled).toBe(false);
        });

        it('should mark values as not orderable when no matching variants', () => {
            const product = createMockProduct(
                [
                    createMockVariationAttribute('color', 'Color', [
                        { name: 'Red', value: 'RED' },
                        { name: 'Blue', value: 'BLUE' },
                    ]),
                ],
                [createMockVariant({ color: 'RED' }, true)]
            );

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current[0].values[0].orderable).toBe(true); // RED has variant
            expect(result.current[0].values[1].orderable).toBe(false); // BLUE has no variant
            expect(result.current[0].values[1].disabled).toBe(true);
        });

        it('should mark values as orderable when product has no variants', () => {
            const product = createMockProduct([
                createMockVariationAttribute('color', 'Color', [{ name: 'Red', value: 'RED' }]),
            ]);

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current[0].values[0].orderable).toBe(true);
        });

        it('should check orderability with combined variation parameters', () => {
            const product = createMockProduct(
                [
                    createMockVariationAttribute('color', 'Color', [{ name: 'Red', value: 'RED' }]),
                    createMockVariationAttribute('size', 'Size', [{ name: 'Large', value: 'L' }]),
                ],
                [
                    createMockVariant({ color: 'RED', size: 'L' }, true),
                    createMockVariant({ color: 'RED', size: 'M' }, true),
                ]
            );

            vi.mocked(useSelectedVariations).mockReturnValue({ color: 'RED' });

            const { result } = renderHook(() => useVariationAttributes({ product }));

            // Size L should be orderable because there's a variant with color=RED and size=L
            expect(result.current[1].values[0].orderable).toBe(true);
        });
    });

    describe('custom swatch images (c_swatchImages)', () => {
        it('synthesizes an image from c_swatchImages for an axis SCAPI does not natively decorate', () => {
            const product = {
                ...createMockProduct([
                    createMockVariationAttribute('size', 'Size', [
                        { name: 'Loveseat', value: 'loveseat' },
                        { name: 'Sectional', value: 'sectional' },
                    ]),
                ]),
                c_swatchImages: JSON.stringify({
                    size: {
                        loveseat: 'images/products/size-loveseat.webp',
                        sectional: 'images/products/size-sectional.webp',
                    },
                }),
            } as unknown as ShopperProducts.schemas['Product'];

            // No native swatch image for size.
            vi.mocked(findImageGroupBy).mockReturnValue(undefined);

            const { result } = renderHook(() => useVariationAttributes({ product }));

            // Bare catalog path resolves to the vertical public-overlay URL.
            expect(result.current[0].values[0].image?.link).toBe('/images/size-loveseat.webp');
            expect(result.current[0].values[0].image?.disBaseLink).toBe('/images/size-loveseat.webp');
            expect(result.current[0].values[0].image?.alt).toBe('Loveseat');
            expect(result.current[0].values[1].image?.link).toBe('/images/size-sectional.webp');
        });

        it('prefers a native swatch image over c_swatchImages when both exist', () => {
            const nativeImage = {
                link: 'https://example.com/native.jpg',
                alt: 'native',
            } as ShopperProducts.schemas['Image'];
            const nativeGroup = {
                viewType: 'swatch',
                variationAttributes: [{ id: 'fabric', values: [{ value: 'velvet' }] }],
                images: [nativeImage],
            } as ShopperProducts.schemas['ImageGroup'];

            const product = {
                ...createMockProduct(
                    [createMockVariationAttribute('fabric', 'Fabric', [{ name: 'Velvet', value: 'velvet' }])],
                    undefined,
                    [nativeGroup]
                ),
                c_swatchImages: JSON.stringify({ fabric: { velvet: 'images/products/velvet.webp' } }),
            } as unknown as ShopperProducts.schemas['Product'];

            vi.mocked(findImageGroupBy).mockReturnValue(nativeGroup);

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current[0].values[0].image).toBe(nativeImage);
        });

        it('leaves image undefined when neither a native swatch nor c_swatchImages entry exists', () => {
            const product = {
                ...createMockProduct([
                    createMockVariationAttribute('legStyle', 'Leg Style', [{ name: 'Tapered', value: 'tapered' }]),
                ]),
                c_swatchImages: JSON.stringify({ size: { loveseat: 'images/products/size-loveseat.webp' } }),
            } as unknown as ShopperProducts.schemas['Product'];

            vi.mocked(findImageGroupBy).mockReturnValue(undefined);

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current[0].values[0].image).toBeUndefined();
        });
    });

    describe('per-value description (localized option hint)', () => {
        it('passes the SCAPI value description through to each value, undefined when absent', () => {
            const product = createMockProduct([
                createMockVariationAttribute('fabric', 'Fabric', [
                    { name: 'Linen', value: 'linen' },
                    { name: 'Velvet', value: 'velvet', description: '+US$200' },
                ]),
            ]);

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current[0].values[0].description).toBeUndefined();
            expect(result.current[0].values[1].description).toBe('+US$200');
        });
    });

    describe('value name fallback', () => {
        it('should use value as name when name is missing', () => {
            const product = createMockProduct([
                createMockVariationAttribute('color', 'Color', [{ name: '', value: 'RED' }]),
            ]);

            const { result } = renderHook(() => useVariationAttributes({ product }));

            expect(result.current[0].values[0].name).toBe('RED');
        });
    });
});
