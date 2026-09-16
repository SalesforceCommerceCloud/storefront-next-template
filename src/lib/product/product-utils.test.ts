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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ShopperBasketsV2, ShopperProducts, ShopperSearch } from '@/scapi';
import {
    getDisplayVariationValues,
    createProductUrlFromAttributes,
    getDecoratedVariationAttributes,
    getImagesForColor,
    isProductBundle,
    isStandardProduct,
    isRuleBasedPromotion,
    requiresVariantSelection,
    getPrimaryProductImageUrl,
    getEnrichedProducts,
} from './product-utils';

// Mock image group utility
vi.mock('@/lib/product/image-groups-utils', () => ({
    findImageGroupBy: vi.fn((imageGroups, options) => {
        if (!imageGroups?.length) return undefined;
        // If no variation attributes specified, return undefined (so all imageGroups are used)
        if (!options.selectedVariationAttributes || Object.keys(options.selectedVariationAttributes).length === 0) {
            return undefined;
        }
        // Return first group with matching viewType that has variationAttributes
        return imageGroups.find(
            (group: any) =>
                group.viewType === options.viewType &&
                group.variationAttributes?.length > 0 &&
                group.variationAttributes.some(
                    (attr: any) =>
                        options.selectedVariationAttributes?.[attr.id] &&
                        attr.values?.some((val: any) => val.value === options.selectedVariationAttributes?.[attr.id])
                )
        );
    }),
}));

describe('product-utils', () => {
    describe('getDisplayVariationValues', () => {
        const mockVariationAttributes: ShopperProducts.schemas['VariationAttribute'][] = [
            {
                id: 'color',
                name: 'Color',
                values: [
                    { value: 'red', name: 'Red' },
                    { value: 'blue', name: 'Blue' },
                    { value: 'green', name: 'Green' },
                ],
            },
            {
                id: 'size',
                name: 'Size',
                values: [
                    { value: 's', name: 'Small' },
                    { value: 'm', name: 'Medium' },
                    { value: 'l', name: 'Large' },
                ],
            },
            {
                id: 'material',
                name: 'Material',
                values: [
                    { value: 'cotton', name: 'Cotton' },
                    { value: 'silk', name: 'Silk' },
                ],
            },
        ];

        it('should return display values for valid inputs', () => {
            const values = { color: 'red', size: 'm' };
            const result = getDisplayVariationValues(mockVariationAttributes, values);

            expect(result).toEqual({
                Color: 'Red',
                Size: 'Medium',
            });
        });

        it('should handle single attribute selection', () => {
            const values = { color: 'blue' };
            const result = getDisplayVariationValues(mockVariationAttributes, values);

            expect(result).toEqual({
                Color: 'Blue',
            });
        });

        it('should handle all attributes selected', () => {
            const values = { color: 'green', size: 'l', material: 'cotton' };
            const result = getDisplayVariationValues(mockVariationAttributes, values);

            expect(result).toEqual({
                Color: 'Green',
                Size: 'Large',
                Material: 'Cotton',
            });
        });

        it('should ignore unknown attribute IDs', () => {
            const values = { color: 'red', unknownAttribute: 'value' };
            const result = getDisplayVariationValues(mockVariationAttributes, values);

            expect(result).toEqual({
                Color: 'Red',
            });
        });

        it('should ignore unknown attribute values', () => {
            const values = { color: 'purple', size: 'm' };
            const result = getDisplayVariationValues(mockVariationAttributes, values);

            expect(result).toEqual({
                Size: 'Medium',
            });
        });

        it('should handle empty variation attributes array', () => {
            const values = { color: 'red', size: 'm' };
            const result = getDisplayVariationValues([], values);

            expect(result).toEqual({});
        });

        it('should handle empty values object', () => {
            const result = getDisplayVariationValues(mockVariationAttributes, {});

            expect(result).toEqual({});
        });

        it('should handle undefined variation attributes (default parameter)', () => {
            const values = { color: 'red' };
            const result = getDisplayVariationValues(undefined, values);

            expect(result).toEqual({});
        });

        it('should handle undefined values (default parameter)', () => {
            const result = getDisplayVariationValues(mockVariationAttributes, undefined);

            expect(result).toEqual({});
        });

        it('should handle both parameters undefined', () => {
            const result = getDisplayVariationValues();

            expect(result).toEqual({});
        });

        it('should handle attributes without names', () => {
            const attributesWithoutNames: ShopperProducts.schemas['VariationAttribute'][] = [
                {
                    id: 'color',
                    // name is missing
                    values: [{ value: 'red', name: 'Red' }],
                },
            ];
            const values = { color: 'red' };
            const result = getDisplayVariationValues(attributesWithoutNames, values);

            expect(result).toEqual({});
        });

        it('should handle attribute values without names', () => {
            const attributesWithoutValueNames: ShopperProducts.schemas['VariationAttribute'][] = [
                {
                    id: 'color',
                    name: 'Color',
                    values: [
                        { value: 'red' }, // name is missing
                    ],
                },
            ];
            const values = { color: 'red' };
            const result = getDisplayVariationValues(attributesWithoutValueNames, values);

            expect(result).toEqual({});
        });

        it('should handle attributes without values array', () => {
            const attributesWithoutValues: ShopperProducts.schemas['VariationAttribute'][] = [
                {
                    id: 'color',
                    name: 'Color',
                    // values array is missing
                },
            ];
            const values = { color: 'red' };
            const result = getDisplayVariationValues(attributesWithoutValues, values);

            expect(result).toEqual({});
        });
    });

    describe('createProductUrlFromAttributes', () => {
        it('should create basic product URL without color', () => {
            const result = createProductUrlFromAttributes('12345');

            expect(result).toBe('/product/12345');
        });

        it('should create product URL with color parameter', () => {
            const result = createProductUrlFromAttributes('12345', 'red');

            expect(result).toBe('/product/12345?color=red');
        });

        it('should create product URL with custom attribute type', () => {
            const result = createProductUrlFromAttributes('12345', 'L', 'size');

            expect(result).toBe('/product/12345?size=L');
        });

        it('should default to color when attribute type not specified', () => {
            const result = createProductUrlFromAttributes('12345', 'blue');

            expect(result).toBe('/product/12345?color=blue');
        });

        it('should create product URL with variant pid', () => {
            const result = createProductUrlFromAttributes('master-123', null, 'color', 'variant-456');

            expect(result).toBe('/product/master-123?pid=variant-456');
        });

        it('should create product URL with both color and variant pid', () => {
            const result = createProductUrlFromAttributes('master-123', 'red', 'color', 'variant-456');

            expect(result).toBe('/product/master-123?color=red&pid=variant-456');
        });

        it('should not include pid when variantPid is null', () => {
            const result = createProductUrlFromAttributes('12345', 'red', 'color', null);

            expect(result).toBe('/product/12345?color=red');
        });

        it('delegates configured paths and explicit slugs to the shared URL builder', () => {
            const result = createProductUrlFromAttributes('12345', 'red', 'color', 'variant-456', {
                context: {
                    siteId: 'RefArch',
                    seoRoutes: {
                        RefArch: {
                            product: { prefix: 'p' },
                            category: { prefix: 'c', mode: 'id-suffix' },
                        },
                    },
                },
                slugSegments: ['summer-dress'],
            });

            expect(result).toBe('/p/summer-dress/12345?color=red&pid=variant-456');
        });
    });

    describe('getDecoratedVariationAttributes', () => {
        const swatchImageGroup: ShopperProducts.schemas['ImageGroup'] = {
            viewType: 'swatch',
            images: [
                {
                    link: 'https://example.com/swatch-red.jpg',
                    disBaseLink: 'https://example.com/swatch-red.jpg',
                    alt: 'Red swatch',
                },
            ],
            variationAttributes: [{ id: 'color', values: [{ value: 'RED' }] }],
        };

        it('decorates the existing variationAttributes when present (regression guard)', () => {
            const product: ShopperSearch.schemas['ProductSearchHit'] = {
                productId: 'M123',
                variationAttributes: [
                    {
                        id: 'color',
                        name: 'Colour',
                        values: [{ value: 'RED', name: 'Red' }],
                    },
                ],
                imageGroups: [swatchImageGroup],
            };

            const result = getDecoratedVariationAttributes(product);

            expect(result).toEqual([
                {
                    id: 'color',
                    name: 'Colour',
                    values: [
                        {
                            value: 'RED',
                            name: 'Red',
                            href: '/product/M123?color=RED',
                            swatch: swatchImageGroup.images[0],
                        },
                    ],
                },
            ]);
        });

        it('uses the configured product prefix and explicit search-hit slug for swatch links', () => {
            const product: ShopperSearch.schemas['ProductSearchHit'] = {
                productId: 'M123',
                slug: 'modern-shirt',
                variationAttributes: [{ id: 'color', values: [{ value: 'RED' }] }],
            };

            const [color] = getDecoratedVariationAttributes(product, {
                seoUrlContext: {
                    siteId: 'RefArch',
                    seoRoutes: {
                        RefArch: {
                            product: { prefix: 'p' },
                            category: { prefix: 'c', mode: 'id-suffix' },
                        },
                    },
                },
            });

            expect(color?.values?.[0]?.href).toBe('/p/modern-shirt/M123?color=RED');
        });

        it('synthesizes variationAttributes from variants when the hit omits them', () => {
            const product: ShopperSearch.schemas['ProductSearchHit'] = {
                productId: 'M123',
                variants: [
                    { productId: 'V1', variationValues: { color: 'RED', size: '10' } },
                    { productId: 'V2', variationValues: { color: 'BLU', size: '10' } },
                    { productId: 'V3', variationValues: { color: 'RED', size: '11' } },
                ],
                imageGroups: [swatchImageGroup],
            };

            const result = getDecoratedVariationAttributes(product);

            expect(result).toEqual([
                {
                    id: 'color',
                    values: [
                        {
                            value: 'RED',
                            name: 'RED',
                            href: '/product/M123?color=RED',
                            swatch: swatchImageGroup.images[0],
                        },
                        {
                            value: 'BLU',
                            name: 'BLU',
                            href: '/product/M123?color=BLU',
                            swatch: undefined,
                        },
                    ],
                },
                {
                    id: 'size',
                    values: [
                        { value: '10', name: '10', href: '/product/M123?size=10', swatch: undefined },
                        { value: '11', name: '11', href: '/product/M123?size=11', swatch: undefined },
                    ],
                },
            ]);
        });

        it('returns the synthesized attribute without a swatch image when no matching imageGroup exists', () => {
            const product: ShopperSearch.schemas['ProductSearchHit'] = {
                productId: 'M123',
                variants: [{ productId: 'V1', variationValues: { color: 'RED' } }],
                imageGroups: [],
            };

            const result = getDecoratedVariationAttributes(product);

            expect(result).toEqual([
                {
                    id: 'color',
                    values: [
                        {
                            value: 'RED',
                            name: 'RED',
                            href: '/product/M123?color=RED',
                            swatch: undefined,
                        },
                    ],
                },
            ]);
        });

        it('returns an empty array when neither variationAttributes nor variants are present', () => {
            const product: ShopperSearch.schemas['ProductSearchHit'] = {
                productId: 'M123',
            };

            expect(getDecoratedVariationAttributes(product)).toEqual([]);
        });
    });

    describe('getImagesForColor', () => {
        const defaultLargeImages: ShopperProducts.schemas['Image'][] = [
            {
                link: 'https://example.com/default1.jpg',
                disBaseLink: 'https://example.com/default1.jpg',
                alt: 'Default Image 1',
            },
            {
                link: 'https://example.com/default2.jpg',
                disBaseLink: 'https://example.com/default2.jpg',
                alt: 'Default Image 2',
            },
        ];

        const redImages: ShopperProducts.schemas['Image'][] = [
            {
                link: 'https://example.com/red1.jpg',
                disBaseLink: 'https://example.com/red1.jpg',
                alt: 'Red Image 1',
            },
            {
                link: 'https://example.com/red2.jpg',
                disBaseLink: 'https://example.com/red2.jpg',
                alt: 'Red Image 2',
            },
        ];

        const blueImages: ShopperProducts.schemas['Image'][] = [
            {
                link: 'https://example.com/blue1.jpg',
                disBaseLink: 'https://example.com/blue1.jpg',
                alt: 'Blue Image 1',
            },
        ];

        const productWithColorVariants: ShopperProducts.schemas['Product'] = {
            id: 'test-product',
            imageGroups: [
                {
                    viewType: 'large',
                    images: defaultLargeImages,
                },
                {
                    viewType: 'large',
                    variationAttributes: [
                        {
                            id: 'color',
                            values: [{ value: 'red' }],
                        },
                    ],
                    images: redImages,
                },
                {
                    viewType: 'large',
                    variationAttributes: [
                        {
                            id: 'color',
                            values: [{ value: 'blue' }],
                        },
                    ],
                    images: blueImages,
                },
                {
                    viewType: 'swatch',
                    images: [
                        {
                            link: 'https://example.com/swatch.jpg',
                            disBaseLink: 'https://example.com/swatch.jpg',
                            alt: 'Swatch',
                        },
                    ],
                },
            ],
        };

        it('should return default large images when no color is selected', () => {
            const result = getImagesForColor(productWithColorVariants, null);

            expect(result).toEqual(defaultLargeImages);
        });

        it('should return color-specific images when color is selected', () => {
            const redResult = getImagesForColor(productWithColorVariants, 'red');
            const blueResult = getImagesForColor(productWithColorVariants, 'blue');

            expect(redResult).toEqual(redImages);
            expect(blueResult).toEqual(blueImages);
        });

        it('should handle product without imageGroups', () => {
            const productWithoutImages: ShopperProducts.schemas['Product'] = {
                id: 'test-product',
                // imageGroups is missing
            };

            const result = getImagesForColor(productWithoutImages, 'red');

            expect(result).toEqual([]);
        });

        it('should handle product with empty imageGroups array', () => {
            const productWithEmptyImageGroups: ShopperProducts.schemas['Product'] = {
                id: 'test-product',
                imageGroups: [],
            };

            const resultWithColor = getImagesForColor(productWithEmptyImageGroups, 'red');
            const resultWithoutColor = getImagesForColor(productWithEmptyImageGroups, null);

            expect(resultWithColor).toEqual([]);
            expect(resultWithoutColor).toEqual([]);
        });

        it('should handle large image group without images array', () => {
            const productWithIncompleteImageGroup: ShopperProducts.schemas['Product'] = {
                id: 'test-product',
                imageGroups: [
                    {
                        viewType: 'large',
                        images: [],
                    },
                ],
            };

            const result = getImagesForColor(productWithIncompleteImageGroup, null);

            expect(result).toEqual([]);
        });

        it('should prioritize exact color matches over default images', () => {
            const productWithDefaultAndColorImages: ShopperProducts.schemas['Product'] = {
                id: 'test-product',
                imageGroups: [
                    {
                        viewType: 'large',
                        images: defaultLargeImages,
                    },
                    {
                        viewType: 'large',
                        variationAttributes: [
                            {
                                id: 'color',
                                values: [{ value: 'red' }],
                            },
                        ],
                        images: redImages,
                    },
                ],
            };

            const result = getImagesForColor(productWithDefaultAndColorImages, 'red');

            expect(result).toEqual(redImages);
        });

        it('should handle multiple variation attributes in image groups', () => {
            const productWithMultipleAttributes: ShopperProducts.schemas['Product'] = {
                id: 'test-product',
                imageGroups: [
                    {
                        viewType: 'large',
                        images: defaultLargeImages,
                    },
                    {
                        viewType: 'large',
                        variationAttributes: [
                            {
                                id: 'color',
                                values: [{ value: 'red' }],
                            },
                            {
                                id: 'size',
                                values: [{ value: 'large' }],
                            },
                        ],
                        images: redImages,
                    },
                ],
            };

            const result = getImagesForColor(productWithMultipleAttributes, 'red');

            expect(result).toEqual(redImages);
        });

        it('should handle case sensitivity in color matching', () => {
            const result1 = getImagesForColor(productWithColorVariants, 'Red');
            const result2 = getImagesForColor(productWithColorVariants, 'RED');

            expect(result1).toEqual([]);
            expect(result2).toEqual([]);
        });

        it('should use custom viewType when provided', () => {
            const swatchImages: ShopperProducts.schemas['Image'][] = [
                {
                    link: 'https://example.com/swatch-red.jpg',
                    disBaseLink: 'https://example.com/swatch-red.jpg',
                    alt: 'Red Swatch',
                },
            ];

            const productWithSwatchVariants: ShopperProducts.schemas['Product'] = {
                id: 'test-product',
                imageGroups: [
                    {
                        viewType: 'large',
                        images: defaultLargeImages,
                    },
                    {
                        viewType: 'swatch',
                        images: [
                            {
                                link: 'https://example.com/default-swatch.jpg',
                                disBaseLink: 'https://example.com/default-swatch.jpg',
                                alt: 'Default Swatch',
                            },
                        ],
                    },
                    {
                        viewType: 'swatch',
                        variationAttributes: [
                            {
                                id: 'color',
                                values: [{ value: 'red' }],
                            },
                        ],
                        images: swatchImages,
                    },
                ],
            };

            // Should return swatch images for red color when viewType is 'swatch'
            const result = getImagesForColor(productWithSwatchVariants, 'red', 'swatch');
            expect(result).toEqual(swatchImages);
        });

        it('should return default images for custom viewType when no color is selected', () => {
            const defaultSwatchImages: ShopperProducts.schemas['Image'][] = [
                {
                    link: 'https://example.com/default-swatch.jpg',
                    disBaseLink: 'https://example.com/default-swatch.jpg',
                    alt: 'Default Swatch',
                },
            ];

            const productWithSwatches: ShopperProducts.schemas['Product'] = {
                id: 'test-product',
                imageGroups: [
                    {
                        viewType: 'large',
                        images: defaultLargeImages,
                    },
                    {
                        viewType: 'swatch',
                        images: defaultSwatchImages,
                    },
                ],
            };

            // Should return default swatch images when no color is selected
            const result = getImagesForColor(productWithSwatches, null, 'swatch');
            expect(result).toEqual(defaultSwatchImages);
        });

        it('should return empty array when custom viewType has no matching images', () => {
            const productWithOnlyLarge: ShopperProducts.schemas['Product'] = {
                id: 'test-product',
                imageGroups: [
                    {
                        viewType: 'large',
                        images: defaultLargeImages,
                    },
                ],
            };

            // Should return empty array when 'swatch' viewType doesn't exist
            const result = getImagesForColor(productWithOnlyLarge, null, 'swatch');
            expect(result).toEqual([]);
        });
    });

    describe('product type helpers', () => {
        it('isProductBundle returns true when product.type.bundle is true', () => {
            const product = { id: 'p1', type: { bundle: true } } as unknown as ShopperProducts.schemas['Product'];
            expect(isProductBundle(product)).toBe(true);
        });

        it('isProductBundle returns false when product.type.bundle is falsy', () => {
            const product = { id: 'p2', type: { item: true } } as unknown as ShopperProducts.schemas['Product'];
            expect(isProductBundle(product)).toBe(false);
        });

        it('isStandardProduct returns true when product.type.item is true', () => {
            const product = { id: 'p4', type: { item: true } } as unknown as ShopperProducts.schemas['Product'];
            expect(isStandardProduct(product)).toBe(true);
        });

        it('isStandardProduct returns false when product.type.item is falsy', () => {
            const product = { id: 'p5', type: { master: true } } as unknown as ShopperProducts.schemas['Product'];
            expect(isStandardProduct(product)).toBe(false);
        });
    });

    describe('isRuleBasedPromotion', () => {
        it('should return true when promotionId exists and bonusProducts is empty array', () => {
            const item: ShopperBasketsV2.schemas['BonusDiscountLineItem'] = {
                promotionId: 'promo-123',
                bonusProducts: [],
            };
            expect(isRuleBasedPromotion(item)).toBe(true);
        });

        it('should return true when promotionId exists and bonusProducts is undefined', () => {
            const item: ShopperBasketsV2.schemas['BonusDiscountLineItem'] = {
                promotionId: 'promo-123',
            };
            expect(isRuleBasedPromotion(item)).toBe(true);
        });

        it('should return false when bonusProducts has items', () => {
            const item: ShopperBasketsV2.schemas['BonusDiscountLineItem'] = {
                promotionId: 'promo-123',
                bonusProducts: [{ productId: 'prod-1' }],
            };
            expect(isRuleBasedPromotion(item)).toBe(false);
        });

        it('should return false when item is null', () => {
            expect(isRuleBasedPromotion(null)).toBe(false);
        });

        it('should return false when item is undefined', () => {
            expect(isRuleBasedPromotion(undefined)).toBe(false);
        });

        it('should return false when promotionId is missing', () => {
            const item: ShopperBasketsV2.schemas['BonusDiscountLineItem'] = {
                bonusProducts: [],
            };
            expect(isRuleBasedPromotion(item)).toBe(false);
        });
    });

    describe('requiresVariantSelection', () => {
        it('returns true for products with variants array', () => {
            const product = {
                id: 'master-product',
                variants: [{ productId: 'variant-1' }, { productId: 'variant-2' }],
            } as unknown as ShopperProducts.schemas['Product'];

            expect(requiresVariantSelection(product)).toBe(true);
        });

        it('returns true for products with multiple selectable variation attribute values', () => {
            const product = {
                id: 'product-with-variations',
                variationAttributes: [
                    {
                        id: 'color',
                        name: 'Color',
                        values: [
                            { value: 'red', name: 'Red' },
                            { value: 'blue', name: 'Blue' },
                        ],
                    },
                ],
            } as unknown as ShopperProducts.schemas['Product'];

            expect(requiresVariantSelection(product)).toBe(true);
        });

        it('returns false for products with single variation attribute value', () => {
            const product = {
                id: 'single-variant',
                variationAttributes: [
                    {
                        id: 'color',
                        name: 'Color',
                        values: [{ value: 'red', name: 'Red' }],
                    },
                ],
            } as unknown as ShopperProducts.schemas['Product'];

            expect(requiresVariantSelection(product)).toBe(false);
        });

        it('returns false for standard products without variants', () => {
            const product = {
                id: 'standard-product',
                type: { item: true },
            } as unknown as ShopperProducts.schemas['Product'];

            expect(requiresVariantSelection(product)).toBe(false);
        });

        it('returns false for products with empty variants array', () => {
            const product = {
                id: 'empty-variants',
                variants: [],
            } as unknown as ShopperProducts.schemas['Product'];

            expect(requiresVariantSelection(product)).toBe(false);
        });

        it('returns false for variant products even with sibling variants array', () => {
            const product = {
                id: '793775370033M',
                type: { variant: true },
                variants: [
                    { productId: '793775370033M', variationValues: { color: 'TURQUSI' } },
                    { productId: '793775362380M', variationValues: { color: 'REDSI' } },
                ],
                variationAttributes: [
                    {
                        id: 'color',
                        name: 'Color',
                        values: [
                            { value: 'TURQUSI', name: 'Turquoise' },
                            { value: 'REDSI', name: 'Red' },
                        ],
                    },
                ],
            } as unknown as ShopperProducts.schemas['Product'];

            // This is a variant product (not a master), so it should not require variant selection
            // even though it has a variants array containing sibling variants
            expect(requiresVariantSelection(product)).toBe(false);
        });
    });

    describe('getPrimaryProductImageUrl', () => {
        it('returns large image URL when available', () => {
            const product = {
                id: 'product-with-images',
                imageGroups: [
                    {
                        viewType: 'large',
                        images: [
                            { disBaseLink: 'https://cdn.example.com/large.jpg', link: 'https://example.com/large.jpg' },
                        ],
                    },
                ],
            } as unknown as ShopperProducts.schemas['Product'];

            expect(getPrimaryProductImageUrl(product)).toBe('https://cdn.example.com/large.jpg');
        });

        it('prefers disBaseLink over link', () => {
            const product = {
                id: 'product',
                imageGroups: [
                    {
                        viewType: 'large',
                        images: [
                            { disBaseLink: 'https://cdn.example.com/image.jpg', link: 'https://example.com/image.jpg' },
                        ],
                    },
                ],
            } as unknown as ShopperProducts.schemas['Product'];

            expect(getPrimaryProductImageUrl(product)).toBe('https://cdn.example.com/image.jpg');
        });

        it('falls back to link when disBaseLink is not available', () => {
            const product = {
                id: 'product',
                imageGroups: [
                    {
                        viewType: 'large',
                        images: [{ link: 'https://example.com/image.jpg' }],
                    },
                ],
            } as unknown as ShopperProducts.schemas['Product'];

            expect(getPrimaryProductImageUrl(product)).toBe('https://example.com/image.jpg');
        });

        it('falls back to first available image when large view type not found', () => {
            const product = {
                id: 'product',
                imageGroups: [
                    {
                        viewType: 'swatch',
                        images: [{ link: 'https://example.com/swatch.jpg' }],
                    },
                    {
                        viewType: 'medium',
                        images: [{ link: 'https://example.com/medium.jpg' }],
                    },
                ],
            } as unknown as ShopperProducts.schemas['Product'];

            // Falls back to first image group
            expect(getPrimaryProductImageUrl(product)).toBe('https://example.com/swatch.jpg');
        });

        it('returns undefined when no images available', () => {
            const product = {
                id: 'product-no-images',
            } as unknown as ShopperProducts.schemas['Product'];

            expect(getPrimaryProductImageUrl(product)).toBeUndefined();
        });

        it('returns undefined when imageGroups is empty', () => {
            const product = {
                id: 'product',
                imageGroups: [],
            } as unknown as ShopperProducts.schemas['Product'];

            expect(getPrimaryProductImageUrl(product)).toBeUndefined();
        });

        it('allows custom viewType parameter', () => {
            const product = {
                id: 'product',
                imageGroups: [
                    {
                        viewType: 'large',
                        images: [{ link: 'https://example.com/large.jpg' }],
                    },
                    {
                        viewType: 'small',
                        images: [{ link: 'https://example.com/small.jpg' }],
                    },
                ],
            } as unknown as ShopperProducts.schemas['Product'];

            expect(getPrimaryProductImageUrl(product, 'small')).toBe('https://example.com/small.jpg');
        });

        it('returns variant-specific image when variationValues provided', () => {
            const product = {
                id: 'product-with-color-variants',
                imageGroups: [
                    {
                        viewType: 'large',
                        images: [{ link: 'https://example.com/default.jpg' }],
                    },
                    {
                        viewType: 'large',
                        variationAttributes: [
                            {
                                id: 'color',
                                values: [{ value: 'red' }],
                            },
                        ],
                        images: [{ disBaseLink: 'https://example.com/red.jpg' }],
                    },
                    {
                        viewType: 'large',
                        variationAttributes: [
                            {
                                id: 'color',
                                values: [{ value: 'blue' }],
                            },
                        ],
                        images: [{ disBaseLink: 'https://example.com/blue.jpg' }],
                    },
                ],
            } as unknown as ShopperProducts.schemas['Product'];

            // Should return red variant image
            expect(getPrimaryProductImageUrl(product, 'large', { color: 'red' })).toBe('https://example.com/red.jpg');

            // Should return blue variant image
            expect(getPrimaryProductImageUrl(product, 'large', { color: 'blue' })).toBe('https://example.com/blue.jpg');
        });

        it('falls back to default image when variationValues do not match any image group', () => {
            const product = {
                id: 'product-with-color-variants',
                imageGroups: [
                    {
                        viewType: 'large',
                        images: [{ link: 'https://example.com/default.jpg' }],
                    },
                    {
                        viewType: 'large',
                        variationAttributes: [
                            {
                                id: 'color',
                                values: [{ value: 'red' }],
                            },
                        ],
                        images: [{ disBaseLink: 'https://example.com/red.jpg' }],
                    },
                ],
            } as unknown as ShopperProducts.schemas['Product'];

            // Request a color that doesn't exist - should fall back to default large image
            expect(getPrimaryProductImageUrl(product, 'large', { color: 'green' })).toBe(
                'https://example.com/default.jpg'
            );
        });
    });

    describe('getEnrichedProducts', () => {
        const mockProductItems: ShopperBasketsV2.schemas['ProductItem'][] = [
            {
                itemId: 'item-1',
                productId: 'product-1',
                productName: 'Test Product 1',
                quantity: 2,
                price: 50,
                priceAfterItemDiscount: 45,
                variationValues: { color: 'red', size: 'M' },
            },
            {
                itemId: 'item-2',
                productId: 'product-2',
                productName: 'Test Product 2',
                quantity: 1,
                price: 100,
                priceAfterItemDiscount: 100,
            },
            {
                itemId: 'item-3',
                productId: 'product-3',
                productName: 'Test Product 3',
                quantity: 1,
                price: 75,
            },
        ];

        const mockProductMap: Record<string, ShopperProducts.schemas['Product']> = {
            'product-1': {
                id: 'product-1',
                name: 'Full Product 1',
                imageGroups: [
                    {
                        viewType: 'large',
                        images: [{ link: 'https://example.com/large1.jpg', alt: 'Large image 1' }],
                    },
                    {
                        viewType: 'small',
                        variationAttributes: [
                            {
                                id: 'color',
                                values: [{ value: 'red' }],
                            },
                        ],
                        images: [{ link: 'https://example.com/small-red.jpg', alt: 'Small red image' }],
                    },
                ],
                variationAttributes: [
                    { id: 'color', name: 'Color', values: [{ value: 'red', name: 'Red' }] },
                    { id: 'size', name: 'Size', values: [{ value: 'M', name: 'Medium' }] },
                ],
                variationValues: { color: 'red', size: 'M' },
            },
            'product-2': {
                id: 'product-2',
                name: 'Full Product 2',
                imageGroups: [
                    {
                        viewType: 'large',
                        images: [{ link: 'https://example.com/large2.jpg', alt: 'Large image 2' }],
                    },
                    {
                        viewType: 'small',
                        images: [{ link: 'https://example.com/small2.jpg', alt: 'Small image 2' }],
                    },
                ],
            },
        };

        beforeEach(() => {
            vi.clearAllMocks();
        });

        afterEach(() => {
            vi.clearAllMocks();
        });

        it('should return empty array when productItems is undefined', () => {
            const result = getEnrichedProducts(mockProductMap, undefined);

            expect(result).toEqual([]);
        });

        it('should return empty array when productItems is empty', () => {
            const result = getEnrichedProducts(mockProductMap, []);

            expect(result).toEqual([]);
        });

        it('should return productItems when productMap is undefined', () => {
            const result = getEnrichedProducts(undefined, mockProductItems);

            expect(result).toEqual(mockProductItems);
        });

        it('should return productItems when productMap is empty', () => {
            const result = getEnrichedProducts({}, mockProductItems);

            expect(result).toEqual(mockProductItems);
        });

        it('should merge basket items with product data', () => {
            const result = getEnrichedProducts(mockProductMap, mockProductItems);

            expect(result.length).toBe(3);

            // Check that the first item is enriched with product data
            const firstItem = result[0];
            expect(firstItem.itemId).toBe('item-1');
            expect(firstItem.productId).toBe('product-1');
            expect(firstItem.name).toBe('Full Product 1');
            expect(firstItem.variationAttributes).toBeDefined();
            expect(firstItem.variationAttributes).toEqual(mockProductMap['product-1'].variationAttributes);
        });

        it('should preserve basket-specific data when merging', () => {
            const result = getEnrichedProducts(mockProductMap, mockProductItems);

            const firstItem = result[0];
            // Basket-specific data should be preserved
            expect(firstItem.itemId).toBe('item-1');
            expect(firstItem.quantity).toBe(2);
            expect(firstItem.price).toBe(50);
            expect(firstItem.priceAfterItemDiscount).toBe(45);
        });

        it('should return basic item when product data is not found', () => {
            const result = getEnrichedProducts(mockProductMap, mockProductItems);

            // Third item (product-3) should still be the basic basket item
            const thirdItem = result[2];
            expect(thirdItem.itemId).toBe('item-3');
            expect(thirdItem.productName).toBe('Test Product 3');
            expect(thirdItem.quantity).toBe(1);
            expect(thirdItem.price).toBe(75);
        });

        it('should return basic item when productId is missing', () => {
            const itemsWithoutProductId: ShopperBasketsV2.schemas['ProductItem'][] = [
                {
                    itemId: 'item-1',
                    // productId is missing
                    productName: 'Test Product',
                    quantity: 1,
                    price: 50,
                },
            ];

            const result = getEnrichedProducts(mockProductMap, itemsWithoutProductId);

            expect(result.length).toBe(1);
            expect(result[0].itemId).toBe('item-1');
            expect(result[0].productName).toBe('Test Product');
        });

        it('should use item variationValues when available', () => {
            const result = getEnrichedProducts(mockProductMap, mockProductItems);

            const firstItem = result[0];
            // Item's variationValues should be preserved
            expect(firstItem.variationValues).toEqual({ color: 'red', size: 'M' });
        });

        it('should use product variationValues when item has none', () => {
            const itemsWithoutVariationValues: ShopperBasketsV2.schemas['ProductItem'][] = [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    productName: 'Test Product 1',
                    quantity: 1,
                    price: 50,
                    // variationValues is missing
                },
            ];

            const result = getEnrichedProducts(mockProductMap, itemsWithoutVariationValues);

            const firstItem = result[0];
            // Should use product's variationValues
            expect(firstItem.variationValues).toEqual(mockProductMap['product-1'].variationValues);
        });

        it('should set variationAttributes from product data', () => {
            const result = getEnrichedProducts(mockProductMap, mockProductItems);

            const firstItem = result[0];
            expect(firstItem.variationAttributes).toEqual(mockProductMap['product-1'].variationAttributes);
        });

        it('should use matched image group when variation matches', () => {
            const result = getEnrichedProducts(mockProductMap, mockProductItems);

            const firstItem = result[0];
            // Should have imageGroups array with the matched small image group
            expect(firstItem.imageGroups).toBeDefined();
            expect(Array.isArray(firstItem.imageGroups)).toBe(true);
            if (firstItem.imageGroups && firstItem.imageGroups.length > 0) {
                expect(firstItem.imageGroups[0].viewType).toBe('small');
            }
        });

        it('should use all product imageGroups when no variation match found', () => {
            const result = getEnrichedProducts(mockProductMap, mockProductItems);

            const secondItem = result[1];
            // Should have all imageGroups from product
            expect(secondItem.imageGroups).toBeDefined();
            expect(secondItem.imageGroups).toEqual(mockProductMap['product-2'].imageGroups);
        });

        it('should handle items with no matching product in map', () => {
            const itemsWithUnknownProduct: ShopperBasketsV2.schemas['ProductItem'][] = [
                {
                    itemId: 'item-unknown',
                    productId: 'unknown-product',
                    productName: 'Unknown Product',
                    quantity: 1,
                    price: 50,
                },
            ];

            const result = getEnrichedProducts(mockProductMap, itemsWithUnknownProduct);

            expect(result.length).toBe(1);
            expect(result[0].itemId).toBe('item-unknown');
            expect(result[0].productName).toBe('Unknown Product');
            // Should not have product data merged
            expect(result[0].name).toBeUndefined();
        });

        it('should handle product with no imageGroups', () => {
            const productMapWithoutImages: Record<string, ShopperProducts.schemas['Product']> = {
                'product-1': {
                    id: 'product-1',
                    name: 'Product Without Images',
                    // imageGroups is missing
                },
            };

            const items: ShopperBasketsV2.schemas['ProductItem'][] = [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    productName: 'Test Product',
                    quantity: 1,
                    price: 50,
                },
            ];

            const result = getEnrichedProducts(productMapWithoutImages, items);

            expect(result.length).toBe(1);
            expect(result[0].name).toBe('Product Without Images');
        });

        it('should handle product with empty imageGroups array', () => {
            const productMapWithEmptyImages: Record<string, ShopperProducts.schemas['Product']> = {
                'product-1': {
                    id: 'product-1',
                    name: 'Product With Empty Images',
                    imageGroups: [],
                },
            };

            const items: ShopperBasketsV2.schemas['ProductItem'][] = [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    productName: 'Test Product',
                    quantity: 1,
                    price: 50,
                },
            ];

            const result = getEnrichedProducts(productMapWithEmptyImages, items);

            expect(result.length).toBe(1);
            expect(result[0].imageGroups).toEqual([]);
        });

        it('should preserve bonus product properties', () => {
            const itemsWithBonus: ShopperBasketsV2.schemas['ProductItem'][] = [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    productName: 'Bonus Product',
                    quantity: 1,
                    price: 0,
                    bonusProductLineItem: true,
                    bonusDiscountLineItemId: 'bonus-discount-1',
                },
            ];

            const result = getEnrichedProducts(mockProductMap, itemsWithBonus);

            expect(result.length).toBe(1);
            expect(result[0].bonusProductLineItem).toBe(true);
            expect(result[0].bonusDiscountLineItemId).toBe('bonus-discount-1');
        });
    });
});
