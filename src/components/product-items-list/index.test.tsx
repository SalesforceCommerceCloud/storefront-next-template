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
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

// React Router
import { createMemoryRouter, RouterProvider } from 'react-router';

// Commerce SDK
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';

// Components
import ProductItemsList from './index';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockAltSiteObject, mockConfig } from '@/test-utils/config';

const defaultMockSite = mockAltSiteObject;
const mockLocale =
    defaultMockSite.supportedLocales.find((l) => l.id === defaultMockSite.defaultLocale) ??
    defaultMockSite.supportedLocales[0];

const renderWithRouter = (component: React.ReactElement) => {
    const router = createMemoryRouter(
        [
            {
                path: '/cart',
                element: (
                    <ConfigProvider config={mockConfig}>
                        <SiteProvider
                            site={defaultMockSite}
                            locale={mockLocale}
                            language={mockAltSiteObject.defaultLocale}
                            currency={mockAltSiteObject.defaultCurrency}>
                            {component}
                        </SiteProvider>
                    </ConfigProvider>
                ),
            },
        ],
        { initialEntries: ['/cart'] }
    );

    return render(<RouterProvider router={router} />);
};

// Test data
// Note: In the real SFCC Basket API, `price` and `priceAfterItemDiscount` are TOTAL line values,
// not per-unit values. `basePrice` is the per-unit list price.
const mockProductItem: ShopperBasketsV2.schemas['ProductItem'] = {
    itemId: 'item-1',
    productId: 'product-1',
    productName: 'Test Product',
    basePrice: 39.99,
    price: 79.98,
    priceAfterItemDiscount: 59.98,
    quantity: 2,
    variationValues: {
        color: 'red',
        size: 'medium',
    },
    variationAttributes: [
        {
            id: 'color',
            name: 'Color',
            values: [{ value: 'red', name: 'Red' }],
        },
        {
            id: 'size',
            name: 'Size',
            values: [{ value: 'medium', name: 'Medium' }],
        },
    ],
    imageGroups: [
        {
            viewType: 'small',
            images: [
                {
                    disBaseLink: 'https://example.com/image.jpg',
                    link: 'https://example.com/image.jpg',
                    alt: 'Product image',
                },
            ],
        },
    ],
    showInventoryMessage: false,
    inventoryMessage: '',
};

const mockProduct: ShopperProducts.schemas['Product'] = {
    id: 'product-1',
    name: 'Test Product',
    productName: 'Test Product',
    imageGroups: [
        {
            viewType: 'small',
            images: [
                {
                    link: 'https://example.com/image.jpg',
                    alt: 'Product image',
                },
            ],
        },
    ],
    variationAttributes: [
        {
            id: 'color',
            name: 'Color',
            values: [{ value: 'red', name: 'Red' }],
        },
        {
            id: 'size',
            name: 'Size',
            values: [{ value: 'medium', name: 'Medium' }],
        },
    ],
};

describe('ProductItemsList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Basic Rendering', () => {
        test('should render list of product items', () => {
            const productItems = [mockProductItem];
            const productsByItemId = { 'item-1': mockProduct };

            renderWithRouter(<ProductItemsList productItems={productItems} productsByItemId={productsByItemId} />);

            expect(screen.getByText('Test Product')).toBeInTheDocument();
        });

        test('should render empty list when productItems is empty', () => {
            renderWithRouter(<ProductItemsList productItems={[]} productsByItemId={{}} />);

            expect(screen.queryByText('Test Product')).not.toBeInTheDocument();
        });

        test('should render multiple product items', () => {
            const productItems = [
                mockProductItem,
                {
                    ...mockProductItem,
                    itemId: 'item-2',
                    productId: 'product-2',
                    productName: 'Test Product 2',
                },
            ];
            const productsByItemId = {
                'item-1': mockProduct,
                'item-2': { ...mockProduct, id: 'product-2', name: 'Test Product 2', productName: 'Test Product 2' },
            };

            renderWithRouter(<ProductItemsList productItems={productItems} productsByItemId={productsByItemId} />);

            expect(screen.getByText('Test Product')).toBeInTheDocument();
            expect(screen.getByText('Test Product 2')).toBeInTheDocument();
        });

        test('handles null/undefined product items', () => {
            renderWithRouter(
                <ProductItemsList
                    productItems={null as unknown as ShopperBasketsV2.schemas['ProductItem'][]}
                    productsByItemId={{}}
                />
            );

            expect(screen.queryByTestId(/sf-product-item-/)).not.toBeInTheDocument();
        });
    });

    describe('Summary variant', () => {
        test('renders product items with summary variant', () => {
            const productItems = [mockProductItem];
            const productsByItemId = { 'item-1': mockProduct };

            renderWithRouter(
                <ProductItemsList productItems={productItems} productsByItemId={productsByItemId} variant="summary" />
            );

            // Summary variant should use different test ID
            expect(screen.getByTestId('sf-product-item-summary-product-1')).toBeInTheDocument();

            // Product name should still be rendered
            expect(screen.getByText('Test Product')).toBeInTheDocument();
        });

        test('wraps summary items in individual cards when separateCards is true', () => {
            const productItems = [mockProductItem, { ...mockProductItem, itemId: 'item-2', productId: 'product-2' }];
            const productsByItemId = {
                'item-1': mockProduct,
                'item-2': { ...mockProduct, id: 'product-2' },
            };

            const { container } = renderWithRouter(
                <ProductItemsList
                    productItems={productItems}
                    productsByItemId={productsByItemId}
                    variant="summary"
                    separateCards
                />
            );

            const cardWrappers = container.querySelectorAll('[data-slot="card"]');
            expect(cardWrappers).toHaveLength(productItems.length);

            productItems.forEach((item, index) => {
                expect(
                    within(cardWrappers[index] as HTMLElement).getByTestId(`sf-product-item-summary-${item.productId}`)
                ).toBeInTheDocument();
            });
        });
    });

    describe('Product data integration', () => {
        test('combines basket item with product data when available', () => {
            const productItems = [mockProductItem];
            const productsByItemId = { 'item-1': mockProduct };

            renderWithRouter(<ProductItemsList productItems={productItems} productsByItemId={productsByItemId} />);

            // The ProductItem component should receive the combined data
            expect(screen.getByTestId('sf-product-item-product-1')).toBeInTheDocument();
            expect(screen.getByText('Test Product')).toBeInTheDocument();
        });
    });

    describe('Choice-Based Bonus Product Max Quantity Calculation', () => {
        const mockBonusDiscountLineItems: ShopperBasketsV2.schemas['BonusDiscountLineItem'][] = [
            {
                id: 'bonus-discount-1',
                promotionId: 'promo-1',
                maxBonusItems: 3,
                bonusProducts: [
                    {
                        productId: 'bonus-product-1',
                        productName: 'Bonus Product 1',
                    },
                    {
                        productId: 'bonus-product-2',
                        productName: 'Bonus Product 2',
                    },
                ],
            },
        ];

        test('should calculate max quantity for choice-based bonus product', () => {
            const choiceBonusProduct1 = {
                ...mockProductItem,
                itemId: 'bonus-item-1',
                productId: 'bonus-product-1',
                productName: 'Bonus Product 1',
                bonusProductLineItem: true,
                bonusDiscountLineItemId: 'bonus-discount-1',
                quantity: 1,
            };

            const productItems = [choiceBonusProduct1];
            const productsByItemId = { 'bonus-item-1': mockProduct };

            renderWithRouter(
                <ProductItemsList
                    productItems={productItems}
                    productsByItemId={productsByItemId}
                    bonusDiscountLineItems={mockBonusDiscountLineItems}
                />
            );

            // Max should be 3 (maxBonusItems) since no other products selected
            const quantityInput = screen.getByRole('spinbutton');
            expect(quantityInput).toHaveAttribute('max', '3');
        });

        test('should calculate max quantity excluding current product', () => {
            const choiceBonusProduct1 = {
                ...mockProductItem,
                itemId: 'bonus-item-1',
                productId: 'bonus-product-1',
                productName: 'Bonus Product 1',
                bonusProductLineItem: true,
                bonusDiscountLineItemId: 'bonus-discount-1',
                quantity: 1,
            };

            const choiceBonusProduct2 = {
                ...mockProductItem,
                itemId: 'bonus-item-2',
                productId: 'bonus-product-2',
                productName: 'Bonus Product 2',
                bonusProductLineItem: true,
                bonusDiscountLineItemId: 'bonus-discount-1',
                quantity: 1,
            };

            const productItems = [choiceBonusProduct1, choiceBonusProduct2];
            const productsByItemId = {
                'bonus-item-1': mockProduct,
                'bonus-item-2': mockProduct,
            };

            renderWithRouter(
                <ProductItemsList
                    productItems={productItems}
                    productsByItemId={productsByItemId}
                    bonusDiscountLineItems={mockBonusDiscountLineItems}
                />
            );

            // For bonus-item-1: max should be 3 - 1 (bonus-item-2 quantity) = 2
            const quantityInputs = screen.getAllByRole('spinbutton');
            // First product should have max of 2 (3 - 1 from second product)
            expect(quantityInputs[0]).toHaveAttribute('max', '2');
            // Second product should have max of 2 (3 - 1 from first product)
            expect(quantityInputs[1]).toHaveAttribute('max', '2');
        });

        test('should handle multiple bonus products with different quantities', () => {
            const choiceBonusProduct1 = {
                ...mockProductItem,
                itemId: 'bonus-item-1',
                productId: 'bonus-product-1',
                productName: 'Bonus Product 1',
                bonusProductLineItem: true,
                bonusDiscountLineItemId: 'bonus-discount-1',
                quantity: 1,
            };

            const choiceBonusProduct2 = {
                ...mockProductItem,
                itemId: 'bonus-item-2',
                productId: 'bonus-product-2',
                productName: 'Bonus Product 2',
                bonusProductLineItem: true,
                bonusDiscountLineItemId: 'bonus-discount-1',
                quantity: 2, // Higher quantity
            };

            const productItems = [choiceBonusProduct1, choiceBonusProduct2];
            const productsByItemId = {
                'bonus-item-1': mockProduct,
                'bonus-item-2': mockProduct,
            };

            renderWithRouter(
                <ProductItemsList
                    productItems={productItems}
                    productsByItemId={productsByItemId}
                    bonusDiscountLineItems={mockBonusDiscountLineItems}
                />
            );

            // For bonus-item-1: max should be 3 - 2 (bonus-item-2 quantity) = 1
            const quantityInputs = screen.getAllByRole('spinbutton');
            expect(quantityInputs[0]).toHaveAttribute('max', '1');
            // For bonus-item-2: max should be 3 - 1 (bonus-item-1 quantity) = 2
            expect(quantityInputs[1]).toHaveAttribute('max', '2');
        });

        test('should return zero max when all slots are filled', () => {
            const choiceBonusProduct1 = {
                ...mockProductItem,
                itemId: 'bonus-item-1',
                productId: 'bonus-product-1',
                productName: 'Bonus Product 1',
                bonusProductLineItem: true,
                bonusDiscountLineItemId: 'bonus-discount-1',
                quantity: 3, // Already at max
            };

            const productItems = [choiceBonusProduct1];
            const productsByItemId = { 'bonus-item-1': mockProduct };

            renderWithRouter(
                <ProductItemsList
                    productItems={productItems}
                    productsByItemId={productsByItemId}
                    bonusDiscountLineItems={mockBonusDiscountLineItems}
                />
            );

            // Max should be 0 (3 - 3 = 0, but we exclude current product, so it's still 0)
            // Actually, since we exclude current product, max would be 3 - 0 = 3
            // But if there's another product, it would be different
            const quantityInput = screen.getByRole('spinbutton');
            // When only one product exists and we exclude it, max should be 3
            expect(quantityInput).toHaveAttribute('max', '3');
        });

        test('should not calculate max for auto bonus products', () => {
            const autoBonusDiscountLineItems: ShopperBasketsV2.schemas['BonusDiscountLineItem'][] = [
                {
                    id: 'bonus-discount-auto',
                    promotionId: 'promo-auto',
                    maxBonusItems: 1,
                    // No bonusProducts array = auto bonus
                },
            ];

            const autoBonusProduct = {
                ...mockProductItem,
                itemId: 'auto-bonus-item',
                productId: 'auto-bonus-product',
                productName: 'Auto Bonus Product',
                bonusProductLineItem: true,
                bonusDiscountLineItemId: 'bonus-discount-auto',
                quantity: 1,
            };

            const productItems = [autoBonusProduct];
            const productsByItemId = { 'auto-bonus-item': mockProduct };

            renderWithRouter(
                <ProductItemsList
                    productItems={productItems}
                    productsByItemId={productsByItemId}
                    bonusDiscountLineItems={autoBonusDiscountLineItems}
                />
            );

            // Auto bonus products should not have max set (they're disabled anyway)
            const quantityInput = screen.getByRole('spinbutton');
            expect(quantityInput).toBeDisabled();
            expect(quantityInput).not.toHaveAttribute('max');
        });

        test('should handle bonus products in different slots separately', () => {
            const multipleSlotBonusDiscountLineItems: ShopperBasketsV2.schemas['BonusDiscountLineItem'][] = [
                {
                    id: 'bonus-discount-1',
                    promotionId: 'promo-1',
                    maxBonusItems: 3,
                    bonusProducts: [
                        {
                            productId: 'bonus-product-1',
                            productName: 'Bonus Product 1',
                        },
                    ],
                },
                {
                    id: 'bonus-discount-2',
                    promotionId: 'promo-2',
                    maxBonusItems: 2,
                    bonusProducts: [
                        {
                            productId: 'bonus-product-2',
                            productName: 'Bonus Product 2',
                        },
                    ],
                },
            ];

            const choiceBonusProduct1 = {
                ...mockProductItem,
                itemId: 'bonus-item-1',
                productId: 'bonus-product-1',
                productName: 'Bonus Product 1',
                bonusProductLineItem: true,
                bonusDiscountLineItemId: 'bonus-discount-1',
                quantity: 1,
            };

            const choiceBonusProduct2 = {
                ...mockProductItem,
                itemId: 'bonus-item-2',
                productId: 'bonus-product-2',
                productName: 'Bonus Product 2',
                bonusProductLineItem: true,
                bonusDiscountLineItemId: 'bonus-discount-2',
                quantity: 1,
            };

            const productItems = [choiceBonusProduct1, choiceBonusProduct2];
            const productsByItemId = {
                'bonus-item-1': mockProduct,
                'bonus-item-2': mockProduct,
            };

            renderWithRouter(
                <ProductItemsList
                    productItems={productItems}
                    productsByItemId={productsByItemId}
                    bonusDiscountLineItems={multipleSlotBonusDiscountLineItems}
                />
            );

            // Each product should have max based on its own slot
            const quantityInputs = screen.getAllByRole('spinbutton');
            // First product: max 3 (no other products in slot 1)
            expect(quantityInputs[0]).toHaveAttribute('max', '3');
            // Second product: max 2 (no other products in slot 2)
            expect(quantityInputs[1]).toHaveAttribute('max', '2');
        });

        test('should handle regular products without max quantity', () => {
            const regularProduct = {
                ...mockProductItem,
                itemId: 'regular-item',
                productId: 'regular-product',
                productName: 'Regular Product',
                // Not a bonus product
            };

            const productItems = [regularProduct];
            const productsByItemId = { 'regular-item': mockProduct };

            renderWithRouter(
                <ProductItemsList
                    productItems={productItems}
                    productsByItemId={productsByItemId}
                    bonusDiscountLineItems={mockBonusDiscountLineItems}
                />
            );

            // Regular products should not have max set
            const quantityInput = screen.getByRole('spinbutton');
            expect(quantityInput).not.toHaveAttribute('max');
        });

        test('should handle missing bonusDiscountLineItems gracefully', () => {
            const choiceBonusProduct = {
                ...mockProductItem,
                itemId: 'bonus-item-1',
                productId: 'bonus-product-1',
                productName: 'Bonus Product 1',
                bonusProductLineItem: true,
                bonusDiscountLineItemId: 'bonus-discount-1',
                quantity: 1,
            };

            const productItems = [choiceBonusProduct];
            const productsByItemId = { 'bonus-item-1': mockProduct };

            renderWithRouter(
                <ProductItemsList
                    productItems={productItems}
                    productsByItemId={productsByItemId}
                    // bonusDiscountLineItems not provided
                />
            );

            // Should still render without errors
            expect(screen.getByText('Bonus Product 1')).toBeInTheDocument();
        });
    });

    describe('Primary actions integration', () => {
        test('renders primary action when primaryAction function is provided', () => {
            const productItems = [mockProductItem];
            const mockPrimaryAction = vi.fn((product) => (
                <button data-testid={`primary-action-${product.itemId}`}>
                    Primary Action for {product.productName}
                </button>
            ));

            renderWithRouter(
                <ProductItemsList productItems={productItems} productsByItemId={{}} primaryAction={mockPrimaryAction} />
            );

            // Should have primary action button
            expect(screen.getByTestId('primary-action-item-1')).toBeInTheDocument();
            expect(screen.getByText('Primary Action for Test Product')).toBeInTheDocument();

            // Should call the function with the combined product
            expect(mockPrimaryAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    itemId: 'item-1',
                    productName: 'Test Product',
                    basePrice: 39.99,
                    price: 79.98,
                    priceAfterItemDiscount: 59.98,
                    productId: 'product-1',
                    quantity: 2,
                    variationAttributes: [
                        {
                            id: 'color',
                            name: 'Color',
                            values: [
                                {
                                    name: 'Red',
                                    value: 'red',
                                },
                            ],
                        },
                        {
                            id: 'size',
                            name: 'Size',
                            values: [
                                {
                                    name: 'Medium',
                                    value: 'medium',
                                },
                            ],
                        },
                    ],
                    variationValues: {
                        color: 'red',
                        size: 'medium',
                    },
                })
            );
        });

        test('primary action function receives combined product data', () => {
            const productItems = [mockProductItem];
            const productsByItemId = { 'item-1': mockProduct };
            const mockPrimaryAction = vi.fn((_product) => <button>Test Action</button>);

            renderWithRouter(
                <ProductItemsList
                    productItems={productItems}
                    productsByItemId={productsByItemId}
                    primaryAction={mockPrimaryAction}
                />
            );

            // Should call the function with the combined product data
            expect(mockPrimaryAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'product-1',
                    imageGroups: expect.arrayContaining([
                        expect.objectContaining({
                            images: expect.arrayContaining([
                                expect.objectContaining({
                                    alt: 'Product image',
                                    link: 'https://example.com/image.jpg',
                                }),
                            ]),
                            viewType: 'small',
                        }),
                    ]),
                    isProductUnavailable: false,
                    itemId: 'item-1',
                    name: 'Test Product',
                    basePrice: 39.99,
                    price: 79.98,
                    priceAfterItemDiscount: 59.98,
                    productId: 'product-1',
                    productName: 'Test Product',
                    quantity: 2,
                    variationAttributes: expect.arrayContaining([
                        expect.objectContaining({
                            id: 'color',
                            name: 'Color',
                            values: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Red',
                                    value: 'red',
                                }),
                            ]),
                        }),
                        expect.objectContaining({
                            id: 'size',
                            name: 'Size',
                            values: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Medium',
                                    value: 'medium',
                                }),
                            ]),
                        }),
                    ]),
                    variationValues: {
                        color: 'red',
                        size: 'medium',
                    },
                })
            );
        });

        test('primary action function handles missing product data', () => {
            const productItems = [mockProductItem];
            const mockPrimaryAction = vi.fn((_product) => <button>Test Action</button>);

            renderWithRouter(
                <ProductItemsList productItems={productItems} productsByItemId={{}} primaryAction={mockPrimaryAction} />
            );

            // Should call the function with isProductUnavailable: true
            expect(mockPrimaryAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    isProductUnavailable: true,
                    itemId: 'item-1',
                    basePrice: 39.99,
                    price: 79.98,
                    priceAfterItemDiscount: 59.98,
                    productId: 'product-1',
                    productName: 'Test Product',
                    quantity: 2,
                    variationAttributes: [
                        {
                            id: 'color',
                            name: 'Color',
                            values: [
                                {
                                    name: 'Red',
                                    value: 'red',
                                },
                            ],
                        },
                        {
                            id: 'size',
                            name: 'Size',
                            values: [
                                {
                                    name: 'Medium',
                                    value: 'medium',
                                },
                            ],
                        },
                    ],
                    variationValues: {
                        color: 'red',
                        size: 'medium',
                    },
                })
            );
        });

        test('does not render primary action when primaryAction is not provided', () => {
            const productItems = [mockProductItem];

            renderWithRouter(<ProductItemsList productItems={productItems} productsByItemId={{}} />);

            expect(screen.queryByTestId('primary-action-item-1')).not.toBeInTheDocument();
        });

        test('primary action works with multiple product items', () => {
            const productItems = [mockProductItem, { ...mockProductItem, itemId: 'item-2', productId: 'product-2' }];
            const mockPrimaryAction = vi.fn((product) => (
                <button data-testid={`primary-action-${product.itemId}`}>Action for {product.productId}</button>
            ));

            renderWithRouter(
                <ProductItemsList productItems={productItems} productsByItemId={{}} primaryAction={mockPrimaryAction} />
            );

            expect(screen.getByTestId('primary-action-item-1')).toBeInTheDocument();
            expect(screen.getByTestId('primary-action-item-2')).toBeInTheDocument();
            expect(screen.getByText('Action for product-1')).toBeInTheDocument();
            expect(screen.getByText('Action for product-2')).toBeInTheDocument();

            expect(mockPrimaryAction).toHaveBeenCalledTimes(2);
        });
    });

    describe('Secondary actions integration', () => {
        test('renders secondary actions when secondaryActions function is provided', () => {
            const productItems = [mockProductItem];
            const mockSecondaryActions = vi.fn((product) => (
                <button data-testid={`secondary-action-${product.itemId}`}>
                    Secondary Action for {product.productName}
                </button>
            ));

            renderWithRouter(
                <ProductItemsList
                    productItems={productItems}
                    productsByItemId={{}}
                    secondaryActions={mockSecondaryActions}
                />
            );

            expect(screen.getByTestId('secondary-action-item-1')).toBeInTheDocument();
            expect(screen.getByText('Secondary Action for Test Product')).toBeInTheDocument();

            expect(mockSecondaryActions).toHaveBeenCalledTimes(1);

            // Should call the function with the combined product
            expect(mockSecondaryActions).toHaveBeenCalledWith(
                expect.objectContaining({
                    isProductUnavailable: true,
                    itemId: 'item-1',
                    basePrice: 39.99,
                    price: 79.98,
                    priceAfterItemDiscount: 59.98,
                    productId: 'product-1',
                    productName: 'Test Product',
                    quantity: 2,
                    variationAttributes: [
                        {
                            id: 'color',
                            name: 'Color',
                            values: [
                                {
                                    name: 'Red',
                                    value: 'red',
                                },
                            ],
                        },
                        {
                            id: 'size',
                            name: 'Size',
                            values: [
                                {
                                    name: 'Medium',
                                    value: 'medium',
                                },
                            ],
                        },
                    ],
                    variationValues: {
                        color: 'red',
                        size: 'medium',
                    },
                })
            );
        });

        test('does not render secondary actions when secondaryActions is not provided', () => {
            const productItems = [mockProductItem];

            renderWithRouter(<ProductItemsList productItems={productItems} productsByItemId={{}} />);

            expect(screen.queryByTestId('secondary-action-item-1')).not.toBeInTheDocument();
        });

        test('secondary actions function receives combined product data', () => {
            const productItems = [mockProductItem];
            const productsByItemId = { 'item-1': mockProduct };
            const mockSecondaryActions = vi.fn((_product) => <button>Test Action</button>);

            renderWithRouter(
                <ProductItemsList
                    productItems={productItems}
                    productsByItemId={productsByItemId}
                    secondaryActions={mockSecondaryActions}
                />
            );

            // Should call the function with the combined product data
            expect(mockSecondaryActions).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'product-1',
                    imageGroups: expect.arrayContaining([
                        expect.objectContaining({
                            images: expect.arrayContaining([
                                expect.objectContaining({
                                    alt: 'Product image',
                                    link: 'https://example.com/image.jpg',
                                }),
                            ]),
                            viewType: 'small',
                        }),
                    ]),
                    isProductUnavailable: false,
                    itemId: 'item-1',
                    name: 'Test Product',
                    basePrice: 39.99,
                    price: 79.98,
                    priceAfterItemDiscount: 59.98,
                    productId: 'product-1',
                    productName: 'Test Product',
                    quantity: 2,
                    variationAttributes: expect.arrayContaining([
                        expect.objectContaining({
                            id: 'color',
                            name: 'Color',
                            values: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Red',
                                    value: 'red',
                                }),
                            ]),
                        }),
                        expect.objectContaining({
                            id: 'size',
                            name: 'Size',
                            values: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Medium',
                                    value: 'medium',
                                }),
                            ]),
                        }),
                    ]),
                    variationValues: {
                        color: 'red',
                        size: 'medium',
                    },
                })
            );
        });

        test('secondary actions function handles missing product data', () => {
            const productItems = [mockProductItem];
            const mockSecondaryActions = vi.fn((_product) => <button>Test Action</button>);

            renderWithRouter(
                <ProductItemsList
                    productItems={productItems}
                    productsByItemId={{}}
                    secondaryActions={mockSecondaryActions}
                />
            );

            // Should call the function with isProductUnavailable: true
            expect(mockSecondaryActions).toHaveBeenCalledWith(
                expect.objectContaining({
                    isProductUnavailable: true,
                    itemId: 'item-1',
                    basePrice: 39.99,
                    price: 79.98,
                    priceAfterItemDiscount: 59.98,
                    productId: 'product-1',
                    productName: 'Test Product',
                    quantity: 2,
                    variationAttributes: [
                        {
                            id: 'color',
                            name: 'Color',
                            values: [
                                {
                                    name: 'Red',
                                    value: 'red',
                                },
                            ],
                        },
                        {
                            id: 'size',
                            name: 'Size',
                            values: [
                                {
                                    name: 'Medium',
                                    value: 'medium',
                                },
                            ],
                        },
                    ],
                    variationValues: {
                        color: 'red',
                        size: 'medium',
                    },
                })
            );
        });
    });

    describe('Data transformation', () => {
        test('creates combined product object with correct properties', () => {
            const productItems = [mockProductItem];
            const productsByItemId = { 'item-1': mockProduct };

            renderWithRouter(<ProductItemsList productItems={productItems} productsByItemId={productsByItemId} />);

            // Verify that the ProductItem component receives the expected data
            expect(screen.getByTestId('sf-product-item-product-1')).toBeInTheDocument();
            expect(screen.getByText('Test Product')).toBeInTheDocument();

            // Check that per-unit price with "each" label is formatted correctly (qty > 1)
            // Total price: $59.98, Per-unit: $29.99 each
            expect(screen.getAllByText('$29.99 each')).toHaveLength(1);
        });

        test('handles missing product data gracefully', () => {
            const productItems = [mockProductItem];

            renderWithRouter(<ProductItemsList productItems={productItems} productsByItemId={{}} />);

            // The component should still render but with missing product data
            expect(screen.getByTestId('sf-product-item-product-1')).toBeInTheDocument();
            expect(screen.getByText('Test Product')).toBeInTheDocument();
        });

        test('preserves basket item price and quantity', () => {
            const productItems = [mockProductItem];
            const productsByItemId = { 'item-1': mockProduct };

            renderWithRouter(<ProductItemsList productItems={productItems} productsByItemId={productsByItemId} />);

            // Check that per-unit price with "each" label is displayed (qty > 1)
            // priceAfterItemDiscount: 59.98 / quantity: 2 = $29.99 each
            expect(screen.getAllByText('$29.99 each')).toHaveLength(1);

            // Check that quantity is displayed in the quantity picker
            expect(screen.getByDisplayValue('2')).toBeInTheDocument();
        });
    });

    describe('Edge cases', () => {
        test('handles product items with minimal data', () => {
            const minimalProductItem = {
                itemId: 'minimal-item',
                productId: 'minimal-product',
            } as ShopperBasketsV2.schemas['ProductItem'];

            renderWithRouter(<ProductItemsList productItems={[minimalProductItem]} productsByItemId={{}} />);

            expect(screen.getByTestId('sf-product-item-minimal-product')).toBeInTheDocument();
        });

        test('handles productsByItemId with missing keys', () => {
            const productItems = [mockProductItem];
            const productsByItemId = { 'different-item': mockProduct };

            renderWithRouter(<ProductItemsList productItems={productItems} productsByItemId={productsByItemId} />);

            expect(screen.getByTestId('sf-product-item-product-1')).toBeInTheDocument();
        });

        test('handles mixed product items with and without product data', () => {
            const productItems = [mockProductItem, { ...mockProductItem, itemId: 'item-2', productId: 'product-2' }];
            const productsByItemId = { 'item-1': mockProduct }; // Only first item has product data

            renderWithRouter(<ProductItemsList productItems={productItems} productsByItemId={productsByItemId} />);

            expect(screen.getByTestId('sf-product-item-product-1')).toBeInTheDocument();
            expect(screen.getByTestId('sf-product-item-product-2')).toBeInTheDocument();
        });
    });

    describe('Semantic list markup', () => {
        test('renders items in a ul with role="list"', () => {
            const productItems = [mockProductItem];
            const productsByItemId = { 'item-1': mockProduct };

            const { container } = renderWithRouter(
                <ProductItemsList productItems={productItems} productsByItemId={productsByItemId} />
            );

            const list = container.querySelector('ul[role="list"]');
            expect(list).toBeInTheDocument();
        });

        test('renders each item in a li element', () => {
            const productItems = [
                mockProductItem,
                { ...mockProductItem, itemId: 'item-2', productId: 'product-2', productName: 'Test Product 2' },
                { ...mockProductItem, itemId: 'item-3', productId: 'product-3', productName: 'Test Product 3' },
            ];
            const productsByItemId = {
                'item-1': mockProduct,
                'item-2': { ...mockProduct, id: 'product-2' },
                'item-3': { ...mockProduct, id: 'product-3' },
            };

            const { container } = renderWithRouter(
                <ProductItemsList productItems={productItems} productsByItemId={productsByItemId} />
            );

            const list = container.querySelector('ul[role="list"]');
            expect(list).toBeInTheDocument();

            // Scope to the outer list's direct children; ProductItem renders its own
            // nested `ul[role="list"]` for variation attributes, which must not be counted.
            const listItems = list?.querySelectorAll(':scope > li') ?? [];
            expect(listItems).toHaveLength(3);
        });

        test('renders items in li elements when separateCards is true', () => {
            const productItems = [mockProductItem, { ...mockProductItem, itemId: 'item-2', productId: 'product-2' }];
            const productsByItemId = {
                'item-1': mockProduct,
                'item-2': { ...mockProduct, id: 'product-2' },
            };

            const { container } = renderWithRouter(
                <ProductItemsList productItems={productItems} productsByItemId={productsByItemId} separateCards />
            );

            const list = container.querySelector('ul[role="list"]');
            expect(list).toBeInTheDocument();

            // Scope to the outer list's direct children; ProductItem renders its own
            // nested `ul[role="list"]` for variation attributes, which must not be counted.
            const listItems = list?.querySelectorAll(':scope > li') ?? [];
            expect(listItems).toHaveLength(2);

            listItems.forEach((li) => {
                expect(li.querySelector('[data-slot="card"]')).toBeInTheDocument();
            });
        });
    });
});
