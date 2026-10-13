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

import { describe, it, expect } from 'vitest';
import type { ShopperProducts } from '@/scapi';
import { convertProductToProductSearchHit } from './product-conversion';

describe('convertProductToProductSearchHit', () => {
    it('should convert a basic product to ProductSearchHit format', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product-123',
            productId: 'test-product-123',
            name: 'Test Product',
            productName: 'Test Product',
            price: 29.99,
            currency: 'USD',
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.productId).toBe('test-product-123');
        expect(result.productName).toBe('Test Product');
        expect(result.price).toBe(29.99);
        expect(result.currency).toBe('USD');
        expect(result.inStock).toBe(true);
        expect(result.promotions).toEqual([]);
    });

    it('preserves the authoritative product slug', () => {
        const product = {
            id: 'test-product-123',
            slug: 'test-product',
        } as ShopperProducts.schemas['Product'];

        expect(convertProductToProductSearchHit(product).slug).toBe('test-product');
    });

    it('should handle product with image groups', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product-456',
            name: 'Product With Image',
            price: 49.99,
            currency: 'USD',
            imageGroups: [
                {
                    images: [
                        {
                            disBaseLink: 'https://example.com/image',
                            link: 'https://example.com/image.jpg',
                            alt: 'Product Image',
                        },
                    ],
                    viewType: '',
                },
            ],
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.image).toBeDefined();
        expect(result.image?.disBaseLink).toBe('https://example.com/image');
        expect(result.image?.link).toBe('https://example.com/image');
        expect(result.image?.alt).toBe('Product Image');
    });

    it('should handle product with inventory information', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product-789',
            name: 'Product With Inventory',
            price: 19.99,
            currency: 'USD',
            inventory: {
                id: 'inventory-1',
                ats: 0,
            },
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.inStock).toBe(false);
    });

    it('should handle product with variation attributes', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product-variant',
            name: 'Variant Product',
            price: 39.99,
            currency: 'USD',
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
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.variationAttributes).toBeDefined();
        expect(result.variants).toBeDefined();
        // The function creates one variant per variation attribute, mapping all values
        expect(result.variants?.length).toBe(1);
        // It maps all values from the attribute, so we should check it contains the values
        expect(result.variants?.[0].variationValues).toBeDefined();
        expect(result.variants?.[0].variationValues).toHaveProperty('color');
    });

    it('should use productId as fallback when id is missing', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: '',
            productId: 'fallback-product-id',
            name: 'Product Without ID',
            price: 15.99,
            currency: 'USD',
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.productId).toBe('fallback-product-id');
    });

    it('should use priceMax as fallback when price is missing', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product',
            name: 'Product Without Price',
            priceMax: 99.99,
            currency: 'USD',
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.price).toBe(99.99);
    });

    it('should handle product with custom properties', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product',
            name: 'Product With Custom Props',
            price: 35.99,
            currency: 'USD',
            customProperties: {
                customField1: 'value1',
                customField2: 'value2',
            },
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.customProperties).toEqual({
            customField1: 'value1',
            customField2: 'value2',
        });
    });

    it('should use productName as fallback when name is missing', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product',
            productName: 'Product Name Fallback',
            price: 20.99,
            currency: 'USD',
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.productName).toBe('Product Name Fallback');
    });

    it('should default to empty string when both id and productId are missing', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: '',
            name: 'Product Without IDs',
            price: 15.99,
            currency: 'USD',
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.productId).toBe('');
    });

    it('should default to empty string when both name and productName are missing', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product',
            price: 15.99,
            currency: 'USD',
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.productName).toBe('');
    });

    it('should default price to 0 when both price and priceMax are missing', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product',
            name: 'Product Without Price',
            currency: 'USD',
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.price).toBe(0);
    });

    it('should handle product without variation attributes', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product',
            name: 'Product Without Variants',
            price: 25.99,
            currency: 'USD',
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.variationAttributes).toBeUndefined();
        expect(result.variants).toBeUndefined();
    });

    it('should handle product with image but missing alt text', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product',
            name: 'Product With Image No Alt',
            price: 30.99,
            currency: 'USD',
            imageGroups: [
                {
                    images: [
                        {
                            disBaseLink: 'https://example.com/image',
                            link: 'https://example.com/image.jpg',
                        },
                    ],
                    viewType: '',
                },
            ],
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.image).toBeDefined();
        expect(result.image?.alt).toBe('Product With Image No Alt');
    });

    it('should handle product with image but missing alt and name', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product',
            price: 30.99,
            currency: 'USD',
            imageGroups: [
                {
                    images: [
                        {
                            disBaseLink: 'https://example.com/image',
                            link: 'https://example.com/image.jpg',
                        },
                    ],
                    viewType: '',
                },
            ],
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.image).toBeDefined();
        expect(result.image?.alt).toBe('');
    });

    it('should handle variation attributes with missing id', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product',
            name: 'Product With Invalid Variant',
            price: 40.99,
            currency: 'USD',
            variationAttributes: [
                {
                    id: '',
                    name: 'Color',
                    values: [{ value: 'red', name: 'Red' }],
                },
            ],
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.variants).toBeDefined();
        expect(result.variants?.[0].variationValues).toEqual({});
    });

    it('should handle variation attributes with missing value', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product',
            name: 'Product With Invalid Variant Value',
            price: 40.99,
            currency: 'USD',
            variationAttributes: [
                {
                    id: 'color',
                    name: 'Color',
                    values: [{ value: '', name: 'Red' }],
                },
            ],
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.variants).toBeDefined();
        expect(result.variants?.[0].variationValues).toEqual({});
    });

    it('should handle inventory with ats undefined', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product',
            name: 'Product With Inventory No ATS',
            price: 25.99,
            currency: 'USD',
            inventory: {
                id: 'inventory-1',
            },
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.inStock).toBe(true);
    });

    it('should handle inventory with ats greater than 0', () => {
        const product: ShopperProducts.schemas['Product'] = {
            id: 'test-product',
            name: 'Product In Stock',
            price: 25.99,
            currency: 'USD',
            inventory: {
                id: 'inventory-1',
                ats: 10,
            },
        };

        const result = convertProductToProductSearchHit(product);

        expect(result.inStock).toBe(true);
    });
});
