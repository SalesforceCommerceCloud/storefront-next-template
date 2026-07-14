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
import { afterEach, beforeEach, describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
// eslint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';

const { t } = getTranslation();
import OrderSummary from './index';

// Mock the currency formatter
vi.mock('@/lib/currency', () => ({
    formatCurrency: (amount: number) => `$${amount.toFixed(2)}`,
}));

// Mock the ProductItemsList component
vi.mock('@/components/product-items-list', () => ({
    default: ({ variant }: { variant: string }) => (
        <div data-testid="product-items-list" data-variant={variant}>
            Mocked ProductItemsList
        </div>
    ),
}));

// Mock the useToast hook
vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: vi.fn(),
    }),
}));

// Mock fetcher for useFetcher hook
const mockFetcher = {
    submit: vi.fn(),
    state: 'idle' as const,
    data: null,
    formData: null,
    formAction: null,
    formMethod: null,
    formEncType: null,
    text: null,
    form: null,
    load: vi.fn(),
    Form: ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement> & { children: React.ReactNode }) => (
        <form {...props}>{children}</form>
    ),
};

// Helper function to render component with Router and all providers
const renderWithProviders = (component: React.ReactElement, currency: string = 'USD') => {
    const router = createMemoryRouter(
        [{ path: '*', element: <AllProvidersWrapper currency={currency}>{component}</AllProvidersWrapper> }],
        { initialEntries: ['/'] }
    );
    return render(<RouterProvider router={router} />);
};

describe('OrderSummary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Use vi.spyOn to mock React Router hooks while keeping real router exports
        vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue(mockFetcher as any);
        vi.spyOn(ReactRouter, 'useNavigate').mockReturnValue(vi.fn());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockBasket: ShopperBasketsV2.schemas['Basket'] = {
        basketId: 'test-basket-id',
        productSubTotal: 100.0,
        shippingTotal: 10.0,
        taxTotal: 8.5,
        orderTotal: 118.5,
        productItems: [
            {
                itemId: 'item1',
                productId: 'product1',
                quantity: 2,
                price: 50.0,
            },
            {
                itemId: 'item2',
                productId: 'product2',
                quantity: 1,
                price: 50.0,
            },
        ],
        shippingItems: [
            {
                itemId: 'shipping1',
                price: 10.0,
            },
        ],
    };

    const mockProductsByItemId: Record<string, ShopperProducts.schemas['Product']> = {
        item1: {
            id: 'product1',
            name: 'Test Product 1',
        },
        item2: {
            id: 'product2',
            name: 'Test Product 2',
        },
    };

    test('renders order summary with default props', () => {
        renderWithProviders(<OrderSummary basket={mockBasket} />);

        expect(screen.getByText(t('cart:summary.orderSummary'))).toBeInTheDocument();
        expect(screen.getByTestId('sf-order-summary')).toBeInTheDocument();
        expect(screen.getByText(t('cart:summary.subtotal'))).toBeInTheDocument();
        expect(screen.getByText('$100.00')).toBeInTheDocument();
        expect(screen.getByText(t('cart:summary.shipping'))).toBeInTheDocument();
        expect(screen.getByText('$10.00')).toBeInTheDocument();
        expect(screen.getByText(t('cart:summary.tax'))).toBeInTheDocument();
        expect(screen.getByText('$8.50')).toBeInTheDocument();
        expect(screen.getByText(t('cart:summary.total'))).toBeInTheDocument();
        expect(screen.getByText('$118.50')).toBeInTheDocument();
    });

    test('does not render heading when showHeading is false', () => {
        renderWithProviders(<OrderSummary basket={mockBasket} showHeading={false} />);

        expect(screen.queryByText(t('cart:summary.orderSummary'))).not.toBeInTheDocument();
    });

    test('does not render cart items when showCartItems is false', () => {
        renderWithProviders(<OrderSummary basket={mockBasket} showCartItems={false} />);

        expect(screen.queryByText('3 items in cart')).not.toBeInTheDocument();
        expect(screen.queryByTestId('product-items-list')).not.toBeInTheDocument();
    });

    test('renders cart items accordion with correct item count', async () => {
        const user = userEvent.setup();
        renderWithProviders(<OrderSummary basket={mockBasket} productsByItemId={mockProductsByItemId} />);

        // Total items: 2 + 1 = 3 items
        expect(screen.getByText(t('cart:items.itemsInCart', { count: 3 }))).toBeInTheDocument();

        // Open the accordion to access the content
        const accordionTrigger = screen.getByRole('button');
        await user.click(accordionTrigger);

        expect(screen.getByTestId('product-items-list')).toBeInTheDocument();
        expect(screen.getByText(t('cart:items.editCart'))).toBeInTheDocument();
    });

    test('shows correct item count text for different quantities', () => {
        // Test zero items
        const emptyBasket = { ...mockBasket, productItems: [] };
        renderWithProviders(<OrderSummary basket={emptyBasket} />);
        expect(screen.getByText(t('cart:items.itemsInCart', { count: 0 }))).toBeInTheDocument();

        // Test one item
        const oneItemBasket = {
            ...mockBasket,
            productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1, price: 50.0 }],
        };
        renderWithProviders(<OrderSummary basket={oneItemBasket} />);
        expect(screen.getByText(t('cart:items.itemsInCart', { count: 1 }))).toBeInTheDocument();
    });

    test('expands cart items accordion when itemsExpanded is true', () => {
        renderWithProviders(<OrderSummary basket={mockBasket} itemsExpanded={true} />);

        // The accordion should be expanded by default, so ProductItemsList should be visible
        expect(screen.getByTestId('product-items-list')).toBeInTheDocument();
        expect(screen.getByText(t('cart:items.editCart'))).toBeInTheDocument();
    });

    test('renders promo code form when showPromoCodeForm is true', () => {
        renderWithProviders(<OrderSummary basket={mockBasket} showPromoCodeForm={true} />);

        expect(screen.getByPlaceholderText(t('cart:promoCode.placeholder'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: t('cart:promoCode.apply') })).toBeInTheDocument();
    });

    test('shows estimated total when isEstimate is true', () => {
        renderWithProviders(<OrderSummary basket={mockBasket} isEstimate={true} />);

        expect(screen.getByText(t('cart:summary.estimatedTotal'))).toBeInTheDocument();
        expect(screen.queryByText(t('cart:summary.total'))).not.toBeInTheDocument();
    });

    test('displays order price adjustments when present', () => {
        const basketWithAdjustments = {
            ...mockBasket,
            orderPriceAdjustments: [
                {
                    priceAdjustmentId: 'adj1',
                    itemText: '10% Off Promotion',
                    price: -10.0,
                },
            ],
        };

        renderWithProviders(<OrderSummary basket={basketWithAdjustments} />);

        expect(screen.getByText('10% Off Promotion')).toBeInTheDocument();
        expect(screen.getByText('$-10.00')).toBeInTheDocument();
    });

    test('shows free shipping when shipping promotion is applied', () => {
        const basketWithFreeShipping = {
            ...mockBasket,
            shippingTotal: 0,
            shippingItems: [
                {
                    itemId: 'shipping1',
                    price: 0,
                    priceAdjustments: [
                        {
                            priceAdjustmentId: 'shipping-adj1',
                            appliedDiscount: {
                                type: 'free' as const, // Use const assertion for test simplicity
                            },
                        },
                    ],
                },
            ],
        };

        renderWithProviders(<OrderSummary basket={basketWithFreeShipping} />);

        expect(screen.getByText(t('cart:summary.shippingPromotionApplied'))).toBeInTheDocument();
        expect(screen.getByText(t('cart:summary.shippingFree'))).toBeInTheDocument();
    });

    test('shows TBD when shippingTotal is undefined', () => {
        const basketWithUndefinedShipping = {
            ...mockBasket,
            shippingTotal: undefined,
        };

        renderWithProviders(<OrderSummary basket={basketWithUndefinedShipping} />);

        expect(screen.getByText(t('cart:summary.shippingTbd'))).toBeInTheDocument();
        expect(screen.queryByText(t('cart:summary.shippingFree'))).not.toBeInTheDocument();
        expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    });

    test('shows TBD when shippingTotal is null', () => {
        const basketWithNullShipping = {
            ...mockBasket,
            shippingTotal: null as unknown as number,
        };

        renderWithProviders(<OrderSummary basket={basketWithNullShipping} />);

        expect(screen.getByText(t('cart:summary.shippingTbd'))).toBeInTheDocument();
        expect(screen.queryByText(t('cart:summary.shippingFree'))).not.toBeInTheDocument();
        expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    });

    test('shows formatted currency when shippingTotal is positive number', () => {
        const basketWithPositiveShipping = {
            ...mockBasket,
            shippingTotal: 15.99,
        };

        renderWithProviders(<OrderSummary basket={basketWithPositiveShipping} />);

        expect(screen.getByText('$15.99')).toBeInTheDocument();
        expect(screen.queryByText(t('cart:summary.shippingFree'))).not.toBeInTheDocument();
        expect(screen.queryByText(t('cart:summary.shippingTbd'))).not.toBeInTheDocument();
    });

    test('shows TBD when taxTotal is undefined', () => {
        const basketWithoutTax = {
            ...mockBasket,
            taxTotal: undefined,
        };

        renderWithProviders(<OrderSummary basket={basketWithoutTax} />);

        expect(screen.getByText(t('cart:summary.taxTbd'))).toBeInTheDocument();
    });

    test('shows TBD when taxTotal is null', () => {
        const basketWithNullTax = {
            ...mockBasket,
            taxTotal: null as unknown as number,
        };

        renderWithProviders(<OrderSummary basket={basketWithNullTax} />);

        expect(screen.getByText(t('cart:summary.taxTbd'))).toBeInTheDocument();
    });

    test('shows formatted currency when taxTotal is zero', () => {
        const basketWithZeroTax = {
            ...mockBasket,
            taxTotal: 0,
        };

        renderWithProviders(<OrderSummary basket={basketWithZeroTax} />);

        expect(screen.getByText('$0.00')).toBeInTheDocument();
        expect(screen.queryByText(t('cart:summary.taxTbd'))).not.toBeInTheDocument();
    });

    test('shows formatted currency when taxTotal is positive number', () => {
        const basketWithPositiveTax = {
            ...mockBasket,
            taxTotal: 12.75,
        };

        renderWithProviders(<OrderSummary basket={basketWithPositiveTax} />);

        expect(screen.getByText('$12.75')).toBeInTheDocument();
        expect(screen.queryByText(t('cart:summary.taxTbd'))).not.toBeInTheDocument();
    });

    test('hides tax line when taxation is gross', () => {
        const grossBasket = {
            ...mockBasket,
            taxation: 'gross' as const,
        };

        renderWithProviders(<OrderSummary basket={grossBasket} />);

        expect(screen.queryByText(t('cart:summary.tax'))).not.toBeInTheDocument();
        expect(screen.queryByText('$8.50')).not.toBeInTheDocument();
        expect(screen.getByText(t('cart:summary.subtotal'))).toBeInTheDocument();
        expect(screen.getByText(t('cart:summary.total'))).toBeInTheDocument();
    });

    test('shows tax line when taxation is net', () => {
        const netBasket = {
            ...mockBasket,
            taxation: 'net' as const,
        };

        renderWithProviders(<OrderSummary basket={netBasket} />);

        expect(screen.getByText(t('cart:summary.tax'))).toBeInTheDocument();
        expect(screen.getByText('$8.50')).toBeInTheDocument();
    });

    test('shows tax line when taxation is undefined', () => {
        renderWithProviders(<OrderSummary basket={mockBasket} />);

        expect(screen.getByText(t('cart:summary.tax'))).toBeInTheDocument();
        expect(screen.getByText('$8.50')).toBeInTheDocument();
    });

    test('displays item-level price adjustments from productItems', () => {
        const basketWithItemPromos = {
            ...mockBasket,
            productItems: [
                {
                    itemId: 'item1',
                    productId: 'product1',
                    quantity: 1,
                    price: 19.19,
                    priceAdjustments: [
                        {
                            priceAdjustmentId: 'pa1',
                            itemText: '$10 Off Ties',
                            price: -14.6,
                        },
                    ],
                },
            ],
        };

        renderWithProviders(<OrderSummary basket={basketWithItemPromos} />);

        expect(screen.getByText('$10 Off Ties')).toBeInTheDocument();
        expect(screen.getByText('$-14.60')).toBeInTheDocument();
    });

    test('displays both order-level and item-level price adjustments together', () => {
        const basketWithBothPromos = {
            ...mockBasket,
            orderPriceAdjustments: [
                {
                    priceAdjustmentId: 'opa1',
                    itemText: '10% Off Entire Order',
                    price: -5.0,
                },
            ],
            productItems: [
                {
                    itemId: 'item1',
                    productId: 'product1',
                    quantity: 1,
                    price: 50.0,
                    priceAdjustments: [
                        {
                            priceAdjustmentId: 'pa1',
                            itemText: '$10 Off Ties',
                            price: -10.0,
                        },
                    ],
                },
                {
                    itemId: 'item2',
                    productId: 'product2',
                    quantity: 1,
                    price: 30.0,
                    priceAdjustments: [
                        {
                            priceAdjustmentId: 'pa2',
                            itemText: 'Buy 1 Get 50% Off',
                            price: -15.0,
                        },
                    ],
                },
            ],
        };

        renderWithProviders(<OrderSummary basket={basketWithBothPromos} />);

        expect(screen.getByText('10% Off Entire Order')).toBeInTheDocument();
        expect(screen.getByText('$-5.00')).toBeInTheDocument();
        expect(screen.getByText('$10 Off Ties')).toBeInTheDocument();
        expect(screen.getByText('$-10.00')).toBeInTheDocument();
        expect(screen.getByText('Buy 1 Get 50% Off')).toBeInTheDocument();
        expect(screen.getByText('$-15.00')).toBeInTheDocument();
    });

    test('shows no adjustments when neither order-level nor item-level promos exist', () => {
        const basketWithNoPromos = {
            ...mockBasket,
            orderPriceAdjustments: undefined,
            productItems: [
                {
                    itemId: 'item1',
                    productId: 'product1',
                    quantity: 1,
                    price: 50.0,
                },
            ],
        };

        renderWithProviders(<OrderSummary basket={basketWithNoPromos} />);

        expect(screen.getByText(t('cart:summary.subtotal'))).toBeInTheDocument();
        const adjustmentElements = screen.queryAllByText(/Off|Promotion|Discount/i);
        expect(adjustmentElements).toHaveLength(0);
    });

    test('displays item-level adjustments when items have empty priceAdjustments arrays', () => {
        const basketWithMixedItems = {
            ...mockBasket,
            productItems: [
                {
                    itemId: 'item1',
                    productId: 'product1',
                    quantity: 1,
                    price: 50.0,
                    priceAdjustments: [],
                },
                {
                    itemId: 'item2',
                    productId: 'product2',
                    quantity: 1,
                    price: 30.0,
                    priceAdjustments: [
                        {
                            priceAdjustmentId: 'pa1',
                            itemText: 'Summer Sale',
                            price: -5.0,
                        },
                    ],
                },
            ],
        };

        renderWithProviders(<OrderSummary basket={basketWithMixedItems} />);

        expect(screen.getByText('Summer Sale')).toBeInTheDocument();
        expect(screen.getByText('$-5.00')).toBeInTheDocument();
    });

    test('displays applied coupon items with remove buttons', () => {
        const basketWithCoupons = {
            ...mockBasket,
            couponItems: [
                {
                    couponItemId: 'coupon1',
                    code: 'SAVE10',
                    statusCode: 'applied' as const,
                },
                {
                    couponItemId: 'coupon2',
                    code: 'FREESHIP',
                    statusCode: 'applied' as const,
                },
            ],
        };

        renderWithProviders(<OrderSummary basket={basketWithCoupons} showPromoCodeForm={true} />);

        // Coupon codes are displayed by PromoCodeForm component
        expect(screen.getByText('SAVE10')).toBeInTheDocument();
        expect(screen.getByText('FREESHIP')).toBeInTheDocument();
    });

    test('does not show remove buttons for coupon items when basket has orderNo', () => {
        const basketWithOrderNo = {
            ...mockBasket,
            orderNo: 'ORDER-123',
            couponItems: [
                {
                    couponItemId: 'coupon1',
                    code: 'SAVE10',
                    statusCode: 'applied' as const,
                },
            ],
        };

        renderWithProviders(<OrderSummary basket={basketWithOrderNo} showPromoCodeForm={true} />);

        expect(screen.getByText('SAVE10')).toBeInTheDocument();
    });

    test('handles missing basket data gracefully', () => {
        renderWithProviders(<OrderSummary basket={{} as ShopperBasketsV2.schemas['Basket']} />);

        expect(screen.getByText(t('cart:summary.noBasketData'))).toBeInTheDocument();
    });

    test('handles basket with orderNo instead of basketId', () => {
        const orderBasket = {
            ...mockBasket,
            basketId: undefined,
            orderNo: 'ORDER-123',
        };

        renderWithProviders(<OrderSummary basket={orderBasket} />);

        expect(screen.getByText(t('cart:summary.orderSummary'))).toBeInTheDocument();
        expect(screen.getByTestId('sf-order-summary')).toBeInTheDocument();
    });

    test('uses productTotal when orderTotal is not available', () => {
        const basketWithProductTotal = {
            ...mockBasket,
            orderTotal: undefined,
            productTotal: 95.0,
        };

        renderWithProviders(<OrderSummary basket={basketWithProductTotal} />);

        expect(screen.getByText('$95.00')).toBeInTheDocument();
    });

    test('renders separator when promo code form is not shown', () => {
        renderWithProviders(<OrderSummary basket={mockBasket} showPromoCodeForm={false} />);

        const separator = document.querySelector('hr.border-border');
        expect(separator).toBeInTheDocument();
    });

    test('has proper accessibility attributes', () => {
        renderWithProviders(<OrderSummary basket={mockBasket} />);

        const orderSummaryRegion = screen.getByRole('region', { name: t('cart:summary.orderSummary') });
        expect(orderSummaryRegion).toBeInTheDocument();
        expect(orderSummaryRegion).toHaveAttribute('aria-label', t('cart:summary.orderSummary'));

        const heading = screen.getByRole('heading', { name: t('cart:summary.orderSummary') });
        expect(heading).toBeInTheDocument();
        expect(heading).toHaveAttribute('id', 'order-summary-heading-desktop');
    });

    test('renders totals as a description list with dt/dd as direct dl children', () => {
        // Assistive tech announces <dl> as a description list only when <dt>/<dd> are direct children —
        // wrapping each pair in a <div> silently drops the term/definition semantics in VoiceOver/JAWS.
        const { container } = renderWithProviders(<OrderSummary basket={mockBasket} />);

        const dl = container.querySelector('dl');
        expect(dl).not.toBeNull();

        // Direct-child selector: catches regression where dt/dd get wrapped in a grid <div>.
        expect(container.querySelectorAll('dl > dt').length).toBeGreaterThan(0);
        expect(container.querySelectorAll('dl > dd').length).toBeGreaterThan(0);

        // Cross-check via WAI-ARIA implicit roles.
        expect(screen.getAllByRole('term').length).toBeGreaterThan(0);
        expect(screen.getAllByRole('definition').length).toBeGreaterThan(0);
    });

    test('handles cart items accordion interaction', async () => {
        const user = userEvent.setup();
        renderWithProviders(<OrderSummary basket={mockBasket} />);

        const accordionTrigger = screen.getByRole('button');
        expect(accordionTrigger).toBeInTheDocument();

        await user.click(accordionTrigger);
        // The accordion should expand/collapse on click
        expect(accordionTrigger).toHaveAttribute('aria-expanded');
    });

    test('displays ProductItemsList with correct variant', async () => {
        const user = userEvent.setup();
        renderWithProviders(<OrderSummary basket={mockBasket} />);

        // Open the accordion to access the content
        const accordionTrigger = screen.getByRole('button');
        await user.click(accordionTrigger);

        const productItemsList = screen.getByTestId('product-items-list');
        expect(productItemsList).toHaveAttribute('data-variant', 'summary');
    });
});
