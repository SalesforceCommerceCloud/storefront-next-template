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
import { describe, test, expect } from 'vitest';
import 'reflect-metadata';
import { PageType, getPageTypeMetadata, getPageTypeDefinitions, type PageTypeConfig } from './page-type';

describe('PageType Decorator', () => {
    describe('PageType Decorator', () => {
        test('decorates class with page type metadata', () => {
            const config: PageTypeConfig = {
                name: 'Product Page',
                description: 'Product detail page',
                supportedAspectTypes: ['product'],
            };

            @PageType(config)
            class ProductPage {
                render() {
                    return null;
                }
            }

            const metadata = Reflect.getMetadata('page:type', ProductPage);
            expect(metadata).toEqual(config);
        });

        test('decorates function with page type metadata', () => {
            const config: PageTypeConfig = {
                name: 'Category Page',
                description: 'Category listing page',
                supportedAspectTypes: ['category'],
            };

            function CategoryPage() {
                return null;
            }

            const DecoratedCategoryPage = PageType(config)(CategoryPage);

            const metadata = Reflect.getMetadata('page:type', DecoratedCategoryPage);
            expect(metadata).toEqual(config);
        });

        test('supports multiple aspect types', () => {
            const config: PageTypeConfig = {
                name: 'Search Results',
                description: 'Search results page',
                supportedAspectTypes: ['search', 'category', 'content'],
            };

            @PageType(config)
            class SearchResultsPage {}

            const metadata = Reflect.getMetadata('page:type', SearchResultsPage);
            expect(metadata.supportedAspectTypes).toEqual(['search', 'category', 'content']);
        });

        test('preserves all config properties', () => {
            const config: PageTypeConfig = {
                name: 'Homepage',
                description: 'Main landing page with hero and featured products',
                supportedAspectTypes: ['storefront'],
            };

            @PageType(config)
            class Homepage {}

            const metadata = Reflect.getMetadata('page:type', Homepage);
            expect(metadata.name).toBe('Homepage');
            expect(metadata.description).toBe('Main landing page with hero and featured products');
            expect(metadata.supportedAspectTypes).toEqual(['storefront']);
        });

        test('works with empty aspect types array', () => {
            const config: PageTypeConfig = {
                name: 'Generic Page',
                description: 'Generic page type',
                supportedAspectTypes: [],
            };

            @PageType(config)
            class GenericPage {}

            const metadata = Reflect.getMetadata('page:type', GenericPage);
            expect(metadata.supportedAspectTypes).toEqual([]);
        });
    });

    describe('getPageTypeMetadata', () => {
        test('retrieves page type metadata from decorated class', () => {
            const config: PageTypeConfig = {
                name: 'Test Page',
                description: 'Test page type',
                supportedAspectTypes: ['test'],
            };

            @PageType(config)
            class TestPage {}

            const metadata = getPageTypeMetadata(TestPage);
            expect(metadata).toEqual(config);
        });

        test('retrieves page type metadata from decorated function', () => {
            const config: PageTypeConfig = {
                name: 'Function Page',
                description: 'Function page type',
                supportedAspectTypes: ['function'],
            };

            function FunctionPage() {
                return null;
            }

            const DecoratedFunctionPage = PageType(config)(FunctionPage);

            const metadata = getPageTypeMetadata(DecoratedFunctionPage);
            expect(metadata).toEqual(config);
        });

        test('returns undefined for non-decorated class', () => {
            class UndecoratedPage {}

            const metadata = getPageTypeMetadata(UndecoratedPage);
            expect(metadata).toBeUndefined();
        });

        test('returns undefined for non-decorated function', () => {
            function UndecoratedFunction() {
                return null;
            }

            const metadata = getPageTypeMetadata(UndecoratedFunction);
            expect(metadata).toBeUndefined();
        });

        test('throws error for non-object values', () => {
            // Reflect.getMetadata throws TypeError for non-object values
            expect(() => getPageTypeMetadata(null)).toThrow(TypeError);
            expect(() => getPageTypeMetadata(undefined)).toThrow(TypeError);
            expect(() => getPageTypeMetadata(123)).toThrow(TypeError);
            expect(() => getPageTypeMetadata('string')).toThrow(TypeError);
        });
    });

    describe('getPageTypeDefinitions', () => {
        test('retrieves page type definitions from decorated class', () => {
            const config: PageTypeConfig = {
                name: 'Cart Page',
                description: 'Shopping cart page',
                supportedAspectTypes: ['cart'],
            };

            @PageType(config)
            class CartPage {}

            const definitions = getPageTypeDefinitions(CartPage);
            expect(definitions.pageType).toEqual(config);
        });

        test('returns object with undefined pageType for non-decorated class', () => {
            class PlainPage {}

            const definitions = getPageTypeDefinitions(PlainPage);
            expect(definitions).toEqual({ pageType: undefined });
        });

        test('wraps metadata in pageType property', () => {
            const config: PageTypeConfig = {
                name: 'Checkout Page',
                description: 'Checkout flow page',
                supportedAspectTypes: ['checkout'],
            };

            @PageType(config)
            class CheckoutPage {}

            const definitions = getPageTypeDefinitions(CheckoutPage);
            expect(definitions).toHaveProperty('pageType');
            expect(definitions.pageType).toEqual(config);
        });
    });

    describe('Real-world Page Type Examples', () => {
        test('product detail page', () => {
            @PageType({
                name: 'Product Detail',
                description: 'Individual product page showing product details, images, and variants',
                supportedAspectTypes: ['product'],
            })
            class ProductDetailPage {}

            const metadata = getPageTypeMetadata(ProductDetailPage);
            expect(metadata?.name).toBe('Product Detail');
            expect(metadata?.supportedAspectTypes).toContain('product');
        });

        test('category listing page', () => {
            @PageType({
                name: 'Category Listing',
                description: 'Category page with product grid and filters',
                supportedAspectTypes: ['category'],
            })
            class CategoryListingPage {}

            const metadata = getPageTypeMetadata(CategoryListingPage);
            expect(metadata?.name).toBe('Category Listing');
            expect(metadata?.supportedAspectTypes).toContain('category');
        });

        test('content page', () => {
            @PageType({
                name: 'Content Page',
                description: 'Generic content page with rich text and components',
                supportedAspectTypes: ['content', 'folder'],
            })
            class ContentPage {}

            const metadata = getPageTypeMetadata(ContentPage);
            expect(metadata?.supportedAspectTypes).toEqual(['content', 'folder']);
        });

        test('search results page', () => {
            @PageType({
                name: 'Search Results',
                description: 'Search results page with product grid and refinements',
                supportedAspectTypes: ['search'],
            })
            class SearchResultsPage {}

            const definitions = getPageTypeDefinitions(SearchResultsPage);
            expect(definitions.pageType?.name).toBe('Search Results');
            expect(definitions.pageType?.supportedAspectTypes).toEqual(['search']);
        });

        test('homepage/storefront', () => {
            @PageType({
                name: 'Homepage',
                description: 'Main storefront landing page',
                supportedAspectTypes: ['storefront'],
            })
            class StorefrontPage {}

            const metadata = getPageTypeMetadata(StorefrontPage);
            expect(metadata?.name).toBe('Homepage');
            expect(metadata?.supportedAspectTypes).toContain('storefront');
        });
    });

    describe('Multiple Page Types', () => {
        test('different classes can have different page types', () => {
            @PageType({
                name: 'Page A',
                description: 'First page type',
                supportedAspectTypes: ['type-a'],
            })
            class PageA {}

            @PageType({
                name: 'Page B',
                description: 'Second page type',
                supportedAspectTypes: ['type-b'],
            })
            class PageB {}

            const metadataA = getPageTypeMetadata(PageA);
            const metadataB = getPageTypeMetadata(PageB);

            expect(metadataA?.name).toBe('Page A');
            expect(metadataB?.name).toBe('Page B');
            expect(metadataA?.supportedAspectTypes).toEqual(['type-a']);
            expect(metadataB?.supportedAspectTypes).toEqual(['type-b']);
        });
    });

    describe('preview', () => {
        test('stores preview when declared', () => {
            const config: PageTypeConfig = {
                name: 'Preview Page',
                description: 'Page type marked preview-capable',
                supportedAspectTypes: ['content'],
                preview: 'default',
            };

            @PageType(config)
            class PreviewPage {}

            const metadata = getPageTypeMetadata(PreviewPage);
            expect(metadata?.preview).toBe('default');
            expect(metadata).toEqual(config);
        });

        test('leaves preview undefined when not declared', () => {
            @PageType({
                name: 'Plain Page',
                description: 'Page type without preview',
                supportedAspectTypes: ['content'],
            })
            class PlainPage {}

            const metadata = getPageTypeMetadata(PlainPage);
            expect(metadata?.preview).toBeUndefined();
        });
    });
});
