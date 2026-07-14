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
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// React Router
// eslint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider, type useFetchers } from 'react-router';

// Commerce SDK
import type { ShopperBasketsV2, ShopperProducts, ShopperPromotions } from '@/scapi';

// Components
import ProductItem from './index';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { getSitePrefix, mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';

// Vertical-aware UI flags. `@/lib/config.ui` resolves to the active vertical's overlay via the same
// Vite resolver the component uses, so these match exactly what ProductItem renders. The default
// variant gates the variant-attributes row, "Saved $X" promo badge, and "Bonus Product" title badge
// behind these flags (fashion = true, cosmetic = false), so assertions on those elements must follow suit.
import { uiConfig } from '@/lib/config.ui';

const { showLineItemVariantAttributes, showLineItemPromoBadge, showLineItemBonusBadge } = uiConfig.pages.cart;

/** Assert an element is present when its gating flag is on, absent when off. */
const expectGatedText = (matcher: Parameters<typeof screen.queryByText>[0], shown: boolean) => {
    if (shown) {
        expect(screen.getByText(matcher)).toBeInTheDocument();
    } else {
        expect(screen.queryByText(matcher)).not.toBeInTheDocument();
    }
};

const mockSite = mockSiteObject;

// Mock data
import { bundleProd as mockedBundleProduct } from '../__mocks__/bundle-product';

// Mock useFetchers will be set up via vi.spyOn in beforeEach
const mockUseFetchers = vi.fn();

// Helper function to create mock fetchers
const createMockFetcher = (key: string, state: 'idle' | 'submitting' | 'loading') =>
    ({
        key,
        state,
        submit: vi.fn(),
    }) as unknown as ReturnType<typeof useFetchers>[0];

const renderWithRouter = (component: React.ReactElement) => {
    // Using createMemoryRouter in framework mode is fine
    // because both framework and data routers share the same underlying architecture, so it provides a valid navigation context for hooks and <Link>.
    // Even though it's listed under "data routers," it fully supports testing non-route components that rely on router behavior.
    const router = createMemoryRouter(
        [
            {
                path: '/cart',
                element: (
                    <ConfigProvider config={mockConfig}>
                        <SiteProvider
                            site={mockSite}
                            locale={mockLocale}
                            language={mockSiteObject.defaultLocale}
                            currency={mockSiteObject.defaultCurrency}>
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

describe('ProductItem', () => {
    const mockProduct: ShopperBasketsV2.schemas['ProductItem'] & Partial<ShopperProducts.schemas['Product']> = {
        id: 'test-product-id',
        itemId: 'item-1',
        productId: 'test-product-id',
        productName: 'Test Product',
        name: 'Test Product',
        basePrice: 29.99, // per-unit list price
        price: 59.98, // total: 29.99 × 2
        priceAfterItemDiscount: 59.98, // total after discount
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

    const mockPrimaryAction = (
        _product: ShopperBasketsV2.schemas['ProductItem'] & Partial<ShopperProducts.schemas['Product']>
    ) => <button data-testid="primary-action">Update Quantity</button>;
    const mockSecondaryActions = (
        product: ShopperBasketsV2.schemas['ProductItem'] & Partial<ShopperProducts.schemas['Product']>
    ) => <button data-testid={`remove-item-${product.itemId}`}>Remove Item</button>;

    beforeEach(() => {
        vi.clearAllMocks();
        // Use vi.spyOn to mock useFetchers while keeping real router exports
        vi.spyOn(ReactRouter, 'useFetchers').mockImplementation(mockUseFetchers);
        // Default mock: no active fetchers
        mockUseFetchers.mockReturnValue([]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('ProductItem', () => {
        test('renders product item properly', () => {
            renderWithRouter(<ProductItem productItem={mockProduct} />);

            // check for all data on screen
            // product title as link
            const link = screen.getByRole('link', { name: 'Test Product' });
            expect(link).toBeInTheDocument();
            expect(link).toHaveAttribute('href', `${getSitePrefix()}/product/${mockProduct.productId}`);
            expect(link).toHaveTextContent('Test Product');

            // image
            // Note: toDisImageUrl only transforms SFCC URLs, so example.com URLs pass through unchanged
            const image = screen.getByRole('img');
            expect(image).toBeInTheDocument();
            expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
            expect(image).toHaveAttribute('alt', 'Product image');

            expectGatedText('Color: Red', showLineItemVariantAttributes);
            expectGatedText('Size: Medium', showLineItemVariantAttributes);

            // Should render the quantity picker component
            const quantityPicker = screen.getByDisplayValue('2');
            expect(quantityPicker).toBeInTheDocument();

            // Per-unit price with "each" label appears in both mobile and desktop views
            const eachPriceElements = screen.getAllByText('£29.99 each');
            //Since we are using Tailwind css classes to show/hide (md:hidden),
            // JSDOM does not compute these classes into proper css properties
            // we can only assert if these two exists in DOM, but can't check the visibility
            // it can only visible on proper browser (or E2E tests)
            expect(eachPriceElements).toHaveLength(1); // Rendered once
        });

        test('does not render quantity text in default variant', () => {
            renderWithRouter(<ProductItem productItem={mockProduct} />);

            // In default variant, quantity is not displayed as text, only in the quantity picker
            expect(screen.queryByText('Qty: 2')).not.toBeInTheDocument();
        });

        test('renders inventory message when showInventoryMessage is true', () => {
            const productWithInventoryMessage = {
                ...mockProduct,
                showInventoryMessage: true,
                inventoryMessage: 'Low stock warning',
            };

            renderWithRouter(<ProductItem productItem={productWithInventoryMessage} />);

            expect(screen.getByText('Low stock warning')).toBeInTheDocument();
        });

        test('renders primary action and secondary actions', () => {
            renderWithRouter(
                <ProductItem
                    productItem={mockProduct}
                    primaryAction={mockPrimaryAction}
                    secondaryActions={mockSecondaryActions}
                />
            );

            // Primary action is rendered once with mobile-primary-action testid
            expect(screen.getByTestId('mobile-primary-action')).toBeInTheDocument();
            // Secondary actions are rendered
            expect(screen.getByTestId('remove-item-item-1')).toBeInTheDocument();
        });

        test('calls render prop functions with correct parameters', () => {
            const mockPrimaryActionSpy = vi.fn((_product) => (
                <button data-testid="primary-action">Update Quantity</button>
            ));
            const mockSecondaryActionsSpy = vi.fn((_product) => (
                <button data-testid={`remove-item-${_product.itemId}`}>Remove Item</button>
            ));

            renderWithRouter(
                <ProductItem
                    productItem={mockProduct}
                    primaryAction={mockPrimaryActionSpy}
                    secondaryActions={mockSecondaryActionsSpy}
                />
            );

            // Verify that render prop functions were called with correct parameters
            expect(mockPrimaryActionSpy).toHaveBeenCalledWith(expect.objectContaining(mockProduct));
            expect(mockSecondaryActionsSpy).toHaveBeenCalledWith(expect.objectContaining(mockProduct));
        });

        test('renders without primary action and secondary actions', () => {
            renderWithRouter(<ProductItem productItem={mockProduct} />);

            expect(screen.queryByTestId('mobile-primary-action')).not.toBeInTheDocument();
            expect(screen.queryByTestId('remove-item-item-1')).not.toBeInTheDocument();
        });

        test('does not show loading spinner when no fetchers are active', () => {
            renderWithRouter(<ProductItem productItem={mockProduct} />);

            // Verify that the component renders without errors
            expect(screen.getByTestId(`sf-product-item-${mockProduct.productId}`)).toBeInTheDocument();

            // Verify that loading spinner is not shown when no fetchers are active
            expect(screen.queryByTestId(`sf-product-item-loading-${mockProduct.productId}`)).not.toBeInTheDocument();
        });

        test('shows loading spinner when fetcher for this item is submitting', () => {
            // Mock fetchers with one active fetcher for this item
            mockUseFetchers.mockReturnValue([
                createMockFetcher(`${mockProduct.itemId}-cart-quantity-picker`, 'submitting'),
            ]);

            renderWithRouter(<ProductItem productItem={mockProduct} />);

            // Verify that loading spinner is shown
            expect(screen.getByTestId(`sf-product-item-loading-${mockProduct.productId}`)).toBeInTheDocument();
        });

        test('does not show loading spinner when fetcher for different item is submitting', () => {
            // Mock fetchers with one active fetcher for a different item
            mockUseFetchers.mockReturnValue([
                createMockFetcher('different-item-id-cart-quantity-picker', 'submitting'),
            ]);

            renderWithRouter(<ProductItem productItem={mockProduct} />);

            // Verify that loading spinner is not shown for this item
            expect(screen.queryByTestId(`sf-product-item-loading-${mockProduct.productId}`)).not.toBeInTheDocument();
        });

        test('shows loading spinner when any fetcher for this item is submitting', () => {
            // Mock fetchers with multiple active fetchers for this item
            mockUseFetchers.mockReturnValue([
                createMockFetcher(`${mockProduct.itemId}-cart-quantity-picker`, 'idle'),
                createMockFetcher(`${mockProduct.itemId}-remove-item-button`, 'submitting'),
            ]);

            renderWithRouter(<ProductItem productItem={mockProduct} />);

            // Verify that loading spinner is shown when any fetcher is submitting
            expect(screen.getByTestId(`sf-product-item-loading-${mockProduct.productId}`)).toBeInTheDocument();
        });

        test('does not show loading spinner when fetcher for this item is idle', () => {
            // Mock fetchers with one idle fetcher for this item
            mockUseFetchers.mockReturnValue([createMockFetcher(`${mockProduct.itemId}-cart-quantity-picker`, 'idle')]);

            renderWithRouter(<ProductItem productItem={mockProduct} />);

            // Verify that loading spinner is not shown when fetcher is idle
            expect(screen.queryByTestId(`sf-product-item-loading-${mockProduct.productId}`)).not.toBeInTheDocument();
        });

        test('handles missing itemId gracefully', () => {
            const productWithoutItemId = {
                ...mockProduct,
                itemId: undefined,
            };

            // Mock fetchers with active fetchers
            mockUseFetchers.mockReturnValue([createMockFetcher('some-item-id-cart-quantity-picker', 'submitting')]);

            renderWithRouter(<ProductItem productItem={productWithoutItemId} />);

            // Verify that loading spinner is not shown when itemId is missing
            expect(screen.queryByTestId(`sf-product-item-loading-${mockProduct.productId}`)).not.toBeInTheDocument();
        });
    });

    describe('Summary variant', () => {
        test('renders summary variant with row layout for price', () => {
            renderWithRouter(<ProductItem productItem={mockProduct} displayVariant="summary" />);

            // In summary variant, the price is currently commented out in the row layout
            // So we just verify the summary variant renders successfully
            expect(screen.getByTestId('sf-product-item-summary-test-product-id')).toBeInTheDocument();
        });

        test('renders summary variant with quantity included', () => {
            renderWithRouter(<ProductItem productItem={mockProduct} displayVariant="summary" />);

            // In summary variant, quantity is shown as "Qty: 2" text
            expect(screen.getByText('Qty: 2')).toBeInTheDocument();
        });

        test('renders summary variant with smaller image width', () => {
            renderWithRouter(<ProductItem productItem={mockProduct} displayVariant="summary" />);

            const imageContainer = screen.getByRole('img').parentElement;
            expect(imageContainer).toHaveClass('w-16');
        });

        test('variant attributes ul carries explicit role="list"', () => {
            // Tailwind preflight strips list-style on <ul>, and Safari VoiceOver drops the implicit
            // list role when list-style is removed. The explicit role="list" restores it.
            const { container } = renderWithRouter(<ProductItem productItem={mockProduct} displayVariant="summary" />);

            const attributesList = container.querySelector('ul[role="list"]');
            expect(attributesList).not.toBeNull();
        });
    });

    describe('Edge cases', () => {
        test('handles missing product data gracefully', () => {
            const emptyProduct = {} as ShopperBasketsV2.schemas['ProductItem'] &
                Partial<ShopperProducts.schemas['Product']>;

            renderWithRouter(<ProductItem productItem={emptyProduct} />);

            expect(screen.getByTestId('sf-product-item-undefined')).toBeInTheDocument();
            expect(screen.getByText('Product Name')).toBeInTheDocument(); // Default name
            // Zero price shows "Free" text
            expect(screen.getByText('Free')).toBeInTheDocument();
        });

        test('handles product with only productId', () => {
            const minimalProduct = {
                productId: 'minimal-product-id',
            } as ShopperBasketsV2.schemas['ProductItem'] & Partial<ShopperProducts.schemas['Product']>;

            renderWithRouter(<ProductItem productItem={minimalProduct} />);

            expect(screen.getByTestId('sf-product-item-minimal-product-id')).toBeInTheDocument();
            expect(screen.getByText('Product Name')).toBeInTheDocument();
        });

        test('handles product with only id (no productId)', () => {
            const productWithIdOnly = {
                id: 'product-with-id-only',
            } as ShopperBasketsV2.schemas['ProductItem'] & Partial<ShopperProducts.schemas['Product']>;

            renderWithRouter(<ProductItem productItem={productWithIdOnly} />);

            expect(screen.getByTestId('sf-product-item-product-with-id-only')).toBeInTheDocument();
        });

        test('handles missing image groups', () => {
            const productWithoutImages = {
                ...mockProduct,
                imageGroups: undefined,
            };

            renderWithRouter(<ProductItem productItem={productWithoutImages} />);

            // Should render placeholder div instead of image
            const imageContainer = document.querySelector('.bg-muted');
            expect(imageContainer).toBeInTheDocument();
            expect(imageContainer).toHaveClass('bg-muted');
        });

        test('handles missing variation attributes', () => {
            const productWithoutVariations = {
                ...mockProduct,
                variationAttributes: undefined,
                variationValues: undefined,
            };

            renderWithRouter(<ProductItem productItem={productWithoutVariations} />);

            // Should not render variation attributes
            expect(screen.queryByText('Color: Red')).not.toBeInTheDocument();
            expect(screen.queryByText('Size: Medium')).not.toBeInTheDocument();
        });

        test('handles zero quantity (defaults to 1)', () => {
            const productWithZeroQuantity = {
                ...mockProduct,
                quantity: 0,
            };

            renderWithRouter(<ProductItem productItem={productWithZeroQuantity} displayVariant="summary" />);

            // Component defaults to 1 when quantity is 0 (falsy)
            expect(screen.getByText('Qty: 1')).toBeInTheDocument();
        });

        test('handles undefined quantity (defaults to 1)', () => {
            const productWithoutQuantity = {
                ...mockProduct,
                quantity: undefined,
            };

            renderWithRouter(<ProductItem productItem={productWithoutQuantity} displayVariant="summary" />);

            expect(screen.getByText('Qty: 1')).toBeInTheDocument();
        });

        test('handles zero price', () => {
            const productWithZeroPrice = {
                ...mockProduct,
                price: 0,
                priceAfterItemDiscount: 0,
            };

            renderWithRouter(<ProductItem productItem={productWithZeroPrice} />);

            // Zero price shows "Free" text
            expect(screen.getByText('Free')).toBeInTheDocument();
        });

        test('handles missing price (defaults to 0)', () => {
            const productWithoutPrice = {
                ...mockProduct,
                basePrice: undefined,
                price: undefined,
                priceAfterItemDiscount: undefined,
            };

            renderWithRouter(<ProductItem productItem={productWithoutPrice} />);

            // Zero price shows "Free" text
            expect(screen.getByText('Free')).toBeInTheDocument();
        });
    });

    describe('Product name fallbacks', () => {
        test('uses productName when available', () => {
            const productWithProductName = {
                ...mockProduct,
                productName: 'Product Name',
                name: 'Fallback Name',
            };

            renderWithRouter(<ProductItem productItem={productWithProductName} />);

            const link = screen.getByRole('link', { name: 'Product Name' });
            expect(link).toHaveTextContent('Product Name');
        });

        test('falls back to name when productName is not available', () => {
            const productWithNameOnly = {
                ...mockProduct,
                productName: undefined,
                name: 'Fallback Name',
            };

            renderWithRouter(<ProductItem productItem={productWithNameOnly} />);

            const link = screen.getByRole('link', { name: 'Fallback Name' });
            expect(link).toHaveTextContent('Fallback Name');
        });

        test('falls back to default name when neither productName nor name is available', () => {
            const productWithoutNames = {
                ...mockProduct,
                productName: undefined,
                name: undefined,
            };

            renderWithRouter(<ProductItem productItem={productWithoutNames} />);

            const link = screen.getByRole('link', { name: 'Product Name' });
            expect(link).toHaveTextContent('Product Name');
        });
    });

    describe('Product ID fallbacks', () => {
        test('uses master.masterId when available', () => {
            const productWithMaster = {
                ...mockProduct,
                master: { masterId: 'master-product-id' },
                id: 'variant-id',
                productId: 'variant-product-id',
            };

            renderWithRouter(<ProductItem productItem={productWithMaster} />);

            const link = screen.getByRole('link', { name: 'Test Product' });
            expect(link).toHaveAttribute('href', `${getSitePrefix()}/product/master-product-id`);
        });
    });

    describe('Price calculation', () => {
        test('uses priceAfterItemDiscount when available', () => {
            const productWithDiscountPrice = {
                ...mockProduct,
                basePrice: 39.99,
                price: 79.98, // total: 39.99 × 2
                priceAfterItemDiscount: 59.98, // discounted total: 29.99 × 2
            };

            renderWithRouter(<ProductItem productItem={productWithDiscountPrice} />);

            // Component uses priceAfterItemDiscount for "each" calculation: 59.98 / 2 = $29.99
            const priceElements = screen.getAllByText('£29.99 each');
            expect(priceElements).toHaveLength(1); // Rendered once
        });

        test('handles missing priceAfterItemDiscount gracefully', () => {
            const productWithoutDiscountPrice = {
                ...mockProduct,
                basePrice: 39.99,
                price: 79.98, // total: 39.99 × 2
                priceAfterItemDiscount: undefined,
            };

            renderWithRouter(<ProductItem productItem={productWithoutDiscountPrice} />);

            // Falls back to price for "each" calculation: 79.98 / 2 = $39.99
            const priceElements = screen.getAllByText('£39.99 each');
            expect(priceElements).toHaveLength(1); // Rendered once
        });
    });

    describe('PromoPopover and promotion info', () => {
        const mockPromotions: Record<string, ShopperPromotions.schemas['Promotion']> = {
            'promo-1': {
                id: 'promo-1',
                calloutMsg: '<strong>20% Off!</strong> Limited time offer',
                name: 'Summer Sale',
                description: 'Get 20% off on all summer items',
            },
            'promo-2': {
                id: 'promo-2',
                calloutMsg: 'Free shipping on orders over $50',
                name: 'Free Shipping',
                description: 'Complimentary shipping for qualifying orders',
            },
        };

        test('renders ProductItemPromotions "Saved" badge when product has discount', () => {
            const productWithPromotions = {
                ...mockProduct,
                basePrice: 25.0,
                price: 50.0,
                priceAfterItemDiscount: 40.0,
                quantity: 2,
                priceAdjustments: [{ promotionId: 'promo-1', itemText: '20% discount applied', price: -10 }],
            };

            renderWithRouter(<ProductItem productItem={productWithPromotions} promotions={mockPromotions} />);

            // ProductItemPromotions shows a "Saved" badge when there's a discount (gated in default variant)
            expectGatedText(/Saved/, showLineItemPromoBadge);
        });

        test('does not render "Saved" badge when no discount exists', () => {
            const productWithoutDiscount = {
                ...mockProduct,
                basePrice: 29.99,
                price: 59.98,
                priceAfterItemDiscount: 59.98, // Same as price, no discount
                priceAdjustments: [
                    { promotionId: 'promo-1', itemText: '20% discount applied' },
                    { promotionId: 'promo-2', itemText: 'Free shipping applied' },
                ],
            };

            renderWithRouter(<ProductItem productItem={productWithoutDiscount} promotions={mockPromotions} />);

            // No "Saved" badge since there's no price difference
            expect(screen.queryByText(/Saved/)).not.toBeInTheDocument();
        });

        test('does not render PromoPopover when no promotions or discounts', () => {
            const productWithoutPromotions = {
                ...mockProduct,
                priceAdjustments: undefined,
                price: 29.99,
                priceAfterItemDiscount: 29.99, // Same as price, no discount
            };

            renderWithRouter(<ProductItem productItem={productWithoutPromotions} />);

            // PromoPopover should not be rendered
            expect(screen.queryByRole('button', { name: 'Info' })).not.toBeInTheDocument();
            expect(screen.queryByText('Promotions:')).not.toBeInTheDocument();
        });

        test('handles missing promotions gracefully', () => {
            const productWithPromotions = {
                ...mockProduct,
                basePrice: 39.99,
                price: 79.98, // total: 39.99 × 2
                priceAfterItemDiscount: 59.98, // discounted total
                priceAdjustments: [{ promotionId: 'promo-1', itemText: '20% discount applied' }],
            };

            renderWithRouter(<ProductItem productItem={productWithPromotions} />);

            // Should render without errors even without promotions prop
            // ProductItemPromotions shows "Saved" badge when there's a discount (gated in default variant)
            expectGatedText(/Saved/, showLineItemPromoBadge);
        });

        test('render properly when no promotions', () => {
            const productWithEmptyAdjustments = {
                ...mockProduct,
                priceAdjustments: [],
                price: 29.99,
                priceAfterItemDiscount: 29.99,
            };

            renderWithRouter(<ProductItem productItem={productWithEmptyAdjustments} />);

            // PromoPopover should not be rendered
            expect(screen.queryByRole('button', { name: 'Info' })).not.toBeInTheDocument();
        });

        test('handles very large discount amounts', () => {
            const productWithLargeDiscount = {
                ...mockProduct,
                basePrice: 999.99,
                price: 999.99,
                priceAfterItemDiscount: 0.01, // Almost free
                quantity: 1,
                priceAdjustments: [{ promotionId: 'promo-1', itemText: 'Large discount', price: -999.98 }],
            };

            renderWithRouter(<ProductItem productItem={productWithLargeDiscount} />);

            // ProductItemPromotions shows "Saved" badge for the large discount (gated in default variant)
            expectGatedText(/Saved/, showLineItemPromoBadge);
        });

        // NOTE: adjust this test when display price is implemented
        test('displays correct discount calculation for zero original price', () => {
            const productWithZeroPrice = {
                ...mockProduct,
                price: 0,
                priceAfterItemDiscount: 0,
            };

            renderWithRouter(<ProductItem productItem={productWithZeroPrice} />);

            // Zero price shows "Free" text
            expect(screen.getByText('Free')).toBeInTheDocument();
        });

        test('render properly for bonus product', () => {
            const productWithEmptyAdjustments = {
                ...mockProduct,
                bonusProductLineItem: true,
                priceAdjustments: [{ promotionId: 'promo-1', itemText: 'bonus product' }],
                price: 29.99,
                priceAfterItemDiscount: 29.99,
            };

            renderWithRouter(<ProductItem productItem={productWithEmptyAdjustments} />);

            // ProductItemPromotions returns null for bonus products
            expect(screen.queryByText(/Saved/)).not.toBeInTheDocument();
        });
    });

    describe('Auto Bonus Products', () => {
        test('identifies bonus product correctly when bonusProductLineItem is true', () => {
            const bonusProduct = {
                ...mockProduct,
                bonusProductLineItem: true,
                bonusDiscountLineItemId: 'bonus-discount-1',
            };

            renderWithRouter(<ProductItem productItem={bonusProduct} />);

            // Check for bonus product badge (gated in default variant)
            expectGatedText('Bonus Product', showLineItemBonusBadge);
        });

        test('does not show bonus badge for regular product', () => {
            const regularProduct = {
                ...mockProduct,
                bonusProductLineItem: false,
            };

            renderWithRouter(<ProductItem productItem={regularProduct} />);

            // Should not show bonus product badge
            expect(screen.queryByText('Bonus Product')).not.toBeInTheDocument();
        });

        test('shows Free text for bonus product with zero price', () => {
            const bonusProduct = {
                ...mockProduct,
                bonusProductLineItem: true,
                basePrice: 39.99,
                price: 39.99, // qty 1 × 39.99
                priceAfterItemDiscount: 0, // Bonus product is free
                quantity: 1,
            };

            renderWithRouter(<ProductItem productItem={bonusProduct} />);

            // Zero priceAfterItemDiscount shows "Free" text in default variant
            expect(screen.getByText('Free')).toBeInTheDocument();
        });

        test('handles bonus product with zero original price', () => {
            const bonusProduct = {
                ...mockProduct,
                bonusProductLineItem: true,
                price: 0,
                pricePerUnit: 0,
                quantity: 1,
            };

            renderWithRouter(<ProductItem productItem={bonusProduct} />);

            // Verify component renders without errors when price is 0
            expect(screen.getByRole('img', { name: /product image/i })).toBeInTheDocument();
            expect(screen.getByRole('link', { name: /test product/i })).toBeInTheDocument();
            // Check that the bonus badge is shown (gated in default variant)
            expectGatedText('Bonus Product', showLineItemBonusBadge);
        });

        test('disables quantity picker for bonus product', () => {
            const bonusProduct = {
                ...mockProduct,
                bonusProductLineItem: true,
                quantity: 1,
            };

            renderWithRouter(<ProductItem productItem={bonusProduct} />);

            // Quantity picker input should be disabled
            const quantityInput = screen.getByRole('spinbutton');
            expect(quantityInput).toBeDisabled();
        });

        test('shows correct quantity for bonus product', () => {
            const bonusProduct = {
                ...mockProduct,
                bonusProductLineItem: true,
                quantity: 2,
            };

            renderWithRouter(<ProductItem productItem={bonusProduct} />);

            // Quantity picker should show the actual quantity value
            const quantityInput = screen.getByRole('spinbutton');
            expect(quantityInput).toHaveValue(2);
            expect(quantityInput).toBeDisabled();
        });

        test('handles bonus product with all required fields', () => {
            const completeBonusProduct = {
                ...mockProduct,
                bonusProductLineItem: true,
                bonusDiscountLineItemId: 'bonus-discount-123',
                basePrice: 49.99,
                price: 49.99, // qty 1 × 49.99
                priceAfterItemDiscount: 0, // Bonus product is free
                quantity: 1,
                productName: 'Free Bonus Tie',
            };

            renderWithRouter(<ProductItem productItem={completeBonusProduct} />);

            // Verify all bonus product elements that ARE implemented (badge gated in default variant)
            expectGatedText('Bonus Product', showLineItemBonusBadge);
            expect(screen.getByText('Free Bonus Tie')).toBeInTheDocument();

            // Zero priceAfterItemDiscount shows "Free" text
            expect(screen.getByText('Free')).toBeInTheDocument();
        });

        test('hides both primary and secondary actions for bonus product', () => {
            const bonusProduct = {
                ...mockProduct,
                bonusProductLineItem: true,
            };

            renderWithRouter(
                <ProductItem
                    productItem={bonusProduct}
                    primaryAction={mockPrimaryAction}
                    secondaryActions={mockSecondaryActions}
                />
            );

            // Both primary and secondary actions should be hidden
            expect(screen.queryByTestId('mobile-primary-action')).not.toBeInTheDocument();
            expect(screen.queryByTestId('primary-action')).not.toBeInTheDocument();
            expect(screen.queryByTestId(`remove-item-${mockProduct.itemId}`)).not.toBeInTheDocument();
        });
    });

    describe('Choice-Based Bonus Products', () => {
        const mockBonusDiscountLineItems: ShopperBasketsV2.schemas['BonusDiscountLineItem'][] = [
            {
                id: 'bonus-discount-choice-1',
                promotionId: 'promo-choice-1',
                maxBonusItems: 3,
                bonusProducts: [
                    {
                        productId: 'bonus-product-1',
                        productName: 'Choice Bonus Product 1',
                    },
                    {
                        productId: 'bonus-product-2',
                        productName: 'Choice Bonus Product 2',
                    },
                ],
            },
        ];

        const choiceBonusProduct = {
            ...mockProduct,
            bonusProductLineItem: true,
            bonusDiscountLineItemId: 'bonus-discount-choice-1',
            productId: 'bonus-product-1',
            productName: 'Choice Bonus Product 1',
        };

        test('identifies choice-based bonus product correctly', () => {
            renderWithRouter(
                <ProductItem productItem={choiceBonusProduct} bonusDiscountLineItems={mockBonusDiscountLineItems} />
            );

            // Should show bonus product badge (gated in default variant)
            expectGatedText('Bonus Product', showLineItemBonusBadge);
        });

        test('shows Remove button but hides Edit button for choice-based bonus product', () => {
            renderWithRouter(
                <ProductItem
                    productItem={choiceBonusProduct}
                    bonusDiscountLineItems={mockBonusDiscountLineItems}
                    primaryAction={mockPrimaryAction}
                    secondaryActions={mockSecondaryActions}
                />
            );

            // Choice-based bonus products should show primary action and Remove button
            expect(screen.getByTestId('primary-action')).toBeInTheDocument();
            expect(screen.getByTestId(`remove-item-${choiceBonusProduct.itemId}`)).toBeInTheDocument();

            // Edit button should be hidden for choice-based bonus products
            expect(screen.queryByTestId(`edit-item-${choiceBonusProduct.itemId}`)).not.toBeInTheDocument();
        });

        test('enables quantity picker for choice-based bonus product', () => {
            renderWithRouter(
                <ProductItem productItem={choiceBonusProduct} bonusDiscountLineItems={mockBonusDiscountLineItems} />
            );

            // Quantity picker should be enabled (not disabled)
            const quantityInput = screen.getByRole('spinbutton');
            expect(quantityInput).not.toBeDisabled();
        });

        test('applies max quantity limit to choice-based bonus product', () => {
            const choiceBonusProductQuantity1 = {
                ...choiceBonusProduct,
                quantity: 1,
            };

            renderWithRouter(
                <ProductItem
                    productItem={choiceBonusProductQuantity1}
                    bonusDiscountLineItems={mockBonusDiscountLineItems}
                    maxBonusQuantity={2}
                />
            );

            // Quantity picker should have max attribute set
            const quantityInput = screen.getByRole('spinbutton');
            expect(quantityInput).toHaveAttribute('max', '2');
        });

        test('distinguishes between choice-based and auto bonus products', () => {
            // Auto bonus product (no bonusProducts array in bonusDiscountLineItem)
            const autoBonusDiscountLineItems: ShopperBasketsV2.schemas['BonusDiscountLineItem'][] = [
                {
                    id: 'bonus-discount-auto-1',
                    promotionId: 'promo-auto-1',
                    maxBonusItems: 1,
                    // No bonusProducts array = auto bonus
                },
            ];

            const autoBonusProduct = {
                ...mockProduct,
                bonusProductLineItem: true,
                bonusDiscountLineItemId: 'bonus-discount-auto-1',
                productId: 'auto-bonus-product',
                productName: 'Auto Bonus Product',
            };

            renderWithRouter(
                <ProductItem
                    productItem={autoBonusProduct}
                    bonusDiscountLineItems={autoBonusDiscountLineItems}
                    primaryAction={mockPrimaryAction}
                    secondaryActions={mockSecondaryActions}
                />
            );

            // Auto bonus products should hide actions
            expect(screen.queryByTestId('primary-action')).not.toBeInTheDocument();
            expect(screen.queryByTestId('secondary-action')).not.toBeInTheDocument();

            // Auto bonus products should have disabled quantity picker
            const quantityInput = screen.getByRole('spinbutton');
            expect(quantityInput).toBeDisabled();
        });

        test('handles choice-based bonus product without maxBonusQuantity prop', () => {
            renderWithRouter(
                <ProductItem
                    productItem={choiceBonusProduct}
                    bonusDiscountLineItems={mockBonusDiscountLineItems}
                    // maxBonusQuantity not provided
                />
            );

            // Should still render correctly without max (badge gated in default variant)
            expectGatedText('Bonus Product', showLineItemBonusBadge);
            const quantityInput = screen.getByRole('spinbutton');
            expect(quantityInput).not.toBeDisabled();
            // Max attribute should not be set if not provided
            expect(quantityInput).not.toHaveAttribute('max');
        });

        test('handles choice-based bonus product with zero max quantity', () => {
            renderWithRouter(
                <ProductItem
                    productItem={choiceBonusProduct}
                    bonusDiscountLineItems={mockBonusDiscountLineItems}
                    maxBonusQuantity={0}
                />
            );

            // Max should be set to 0
            const quantityInput = screen.getByRole('spinbutton');
            expect(quantityInput).toHaveAttribute('max', '0');
        });

        test('shows Remove button for choice-based bonus product', () => {
            renderWithRouter(
                <ProductItem
                    productItem={choiceBonusProduct}
                    bonusDiscountLineItems={mockBonusDiscountLineItems}
                    secondaryActions={mockSecondaryActions}
                />
            );

            // Remove button should be shown for choice-based bonus products
            expect(screen.getByTestId(`remove-item-${choiceBonusProduct.itemId}`)).toBeInTheDocument();
        });
    });

    describe('Total price and per-unit display', () => {
        test('displays total price and "each" label when quantity is greater than 1', () => {
            const productWithQuantity = {
                ...mockProduct,
                basePrice: 44.0,
                price: 88.0, // total: 44 × 2
                priceAfterItemDiscount: 88.0, // total after discount: 44 × 2
                quantity: 2,
            };

            renderWithRouter(<ProductItem productItem={productWithQuantity} />);

            // Should display "each" label for per-unit price when qty > 1
            const eachElements = screen.getAllByText(/each/);
            expect(eachElements.length).toBeGreaterThanOrEqual(1);

            // Per-unit price should be displayed (total / quantity = 88 / 2 = $44.00)
            const perUnitPriceElements = screen.getAllByText('£44.00 each');
            expect(perUnitPriceElements.length).toBeGreaterThanOrEqual(1);
        });

        test('does not display "each" label when quantity is 1', () => {
            const productWithSingleQuantity = {
                ...mockProduct,
                basePrice: 44.0,
                price: 44.0,
                priceAfterItemDiscount: 44.0,
                quantity: 1,
            };

            renderWithRouter(<ProductItem productItem={productWithSingleQuantity} />);

            // Should NOT display "each" label when qty = 1
            expect(screen.queryByText(/each/)).not.toBeInTheDocument();
        });

        test('calculates per-unit price correctly from total', () => {
            const productWithDiscount = {
                ...mockProduct,
                basePrice: 29.99,
                price: 89.97, // total: 29.99 × 3
                priceAfterItemDiscount: 59.97, // discounted total: 19.99 × 3
                quantity: 3,
            };

            renderWithRouter(<ProductItem productItem={productWithDiscount} />);

            // Per-unit price = 59.97 / 3 = $19.99
            const perUnitPriceElements = screen.getAllByText('£19.99 each');
            expect(perUnitPriceElements.length).toBeGreaterThanOrEqual(1);
        });

        test('handles undefined quantity by defaulting to 1 (no "each" label)', () => {
            const productWithUndefinedQuantity = {
                ...mockProduct,
                basePrice: 44.0,
                price: 44.0,
                priceAfterItemDiscount: 44.0,
                quantity: undefined,
            };

            renderWithRouter(<ProductItem productItem={productWithUndefinedQuantity} />);

            // Should NOT display "each" label when qty defaults to 1
            expect(screen.queryByText(/each/)).not.toBeInTheDocument();
        });

        test('uses price when priceAfterItemDiscount is undefined for "each" calculation', () => {
            const productWithoutDiscount = {
                ...mockProduct,
                basePrice: 25.0,
                price: 50.0, // total: 25 × 2
                priceAfterItemDiscount: undefined,
                quantity: 2,
            };

            renderWithRouter(<ProductItem productItem={productWithoutDiscount} />);

            // Per-unit price = price / quantity = 50 / 2 = $25.00
            const perUnitPriceElements = screen.getAllByText('£25.00 each');
            expect(perUnitPriceElements.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Bundled Products', () => {
        test('renders BundledProductItems when product is a bundle', () => {
            // Use first bundled product from mock (Turquoise and Gold Bracelet)
            const productWithBundle = {
                ...mockedBundleProduct,
                bundledProducts: mockedBundleProduct.bundledProducts ? [mockedBundleProduct.bundledProducts[0]] : [],
            };
            renderWithRouter(<ProductItem productItem={productWithBundle} />);

            // Testing against the first bundled product (Turquoise and Gold Bracelet)
            // Check that bundled product name is rendered
            expect(screen.getByText('Turquoise and Gold Bracelet')).toBeInTheDocument();

            // Check that bundled product variation attributes are rendered
            expect(screen.getByText(/Color: Gold/)).toBeInTheDocument();

            // Check that bundled product quantity is rendered
            expect(screen.getByText(/Qty: 1/)).toBeInTheDocument();
        });

        test('renders multiple bundled products', () => {
            // Use all three bundled products from mock (Bracelet, Necklace, Earring)
            const productWithMultipleBundles = mockedBundleProduct;

            renderWithRouter(<ProductItem productItem={productWithMultipleBundles} />);

            // Check that all bundled products are rendered
            expect(screen.getByText('Turquoise and Gold Bracelet')).toBeInTheDocument();
            expect(screen.getByText('Turquoise and Gold Necklace')).toBeInTheDocument();
            expect(screen.getByText('Turquoise and Gold Hoop Earring')).toBeInTheDocument();

            // Check variation attributes for all products (they all have Color: Gold)
            const colorTexts = screen.getAllByText(/Color: Gold/);
            expect(colorTexts).toHaveLength(3);

            // Check quantities (all are Qty: 1)
            const qtyTexts = screen.getAllByText(/Qty: 1/);
            expect(qtyTexts).toHaveLength(3);
        });

        test('renders BundledProductItems in summary variant', () => {
            // Use second bundled product from mock (Turquoise and Gold Necklace)
            const productWithBundle = {
                ...mockedBundleProduct,
                bundledProducts: mockedBundleProduct.bundledProducts ? [mockedBundleProduct.bundledProducts[1]] : [],
            };

            renderWithRouter(<ProductItem productItem={productWithBundle} displayVariant="summary" />);

            // Check that bundled products are rendered in summary variant
            expect(screen.getByText('Turquoise and Gold Necklace')).toBeInTheDocument();
        });

        test('does not render BundledProductItems when the product is not a bundle', () => {
            const productWithoutBundle = {
                ...mockProduct,
                // no bundledProducts property
            };

            expect(productWithoutBundle.bundledProducts).toBeUndefined();
            renderWithRouter(<ProductItem productItem={productWithoutBundle} />);

            expect(screen.queryByTestId('bundledProductItems')).not.toBeInTheDocument();
        });

        test('still render bundled product that does not have variation attributes yet', () => {
            // Create a minimal bundled product without variation attributes
            const bundledProduct: ShopperProducts.schemas['BundledProduct'] = {
                id: 'bundle-simple',
                product: {
                    id: 'bundled-item-1',
                    name: 'Simple Bundled Product',
                    // no variationValues, no variationAttributes
                },
                quantity: 3,
            };

            const productWithBundle = {
                ...mockedBundleProduct,
                bundledProducts: [bundledProduct],
            };

            renderWithRouter(<ProductItem productItem={productWithBundle} />);

            // Check that bundled product is rendered without variation attributes
            expect(screen.getByText('Simple Bundled Product')).toBeInTheDocument();
            expect(screen.getByText(/Qty: 3/)).toBeInTheDocument();
        });
    });
});
