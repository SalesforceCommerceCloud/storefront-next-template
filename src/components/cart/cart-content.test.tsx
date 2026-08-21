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
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import type { Recommendation } from '@/hooks/recommenders/use-recommenders';
import ProductRecommendations from '@/components/product-recommendations';
import { EINSTEIN_RECOMMENDERS } from '@/lib/product/einstein-recommenders';

const { t } = getTranslation();

// React Router
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.mock('@/hooks/use-scapi-fetcher', () => ({
    useScapiFetcher: vi.fn(() => ({
        load: vi.fn(),
        submit: vi.fn(),
        data: null,
        errors: undefined,
        success: false,
        state: 'idle' as const,
    })),
}));

// useDeferredRenderSequence is consumed transitively by the carousel's image-gallery; stub to `0`
// to preserve the real hook's "no preloads until the first idle frame" contract.
// @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
vi.mock('@/extensions/ratings-reviews/providers/product-reviews-context', () => ({
    ProductReviewsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useProductReviews: () => ({
        reviewsSummary: null,
        reviewsSummaryLoading: false,
        reviews: [],
        reviewsLoading: false,
        loadReviewsIfNeeded: () => {},
        aiSummary: '',
        addReviewOptimistic: () => {},
        removeReviewOptimistic: () => {},
        expandReviews: () => {},
        registerExpand: () => {},
        registerOnExpanded: () => {},
        triggerOnExpanded: () => {},
    }),
}));
// @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS

vi.mock('@/hooks/use-deferred-render', () => ({
    useDeferredRenderSequence: () => 0,
}));

// Spy on the bonus-product modal so we can verify the props the cart wires through
// `getBonusDiscountSlotsForPromotion`. Render-only stub — exercises the modal-open code path
// without needing the full modal subtree (variant selector, image gallery, scapi fetcher).
const bonusModalRenders: Array<Record<string, unknown>> = [];
vi.mock('@/components/bonus-product-modal', () => ({
    BonusProductModal: (props: Record<string, unknown>) => {
        bonusModalRenders.push(props);
        return props.open ? <div data-testid="bonus-product-modal-stub" /> : null;
    },
}));

// Components
import CartContent from './cart-content';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import BasketProvider, { useBasket } from '@/providers/basket';

// Minimum-viable enriched recommendations that ProductCarousel + ProductTile can render.
const buildRecs = (productNames: string[]) =>
    productNames.map((productName, idx) => ({
        id: `rec-${idx + 1}`,
        productId: `rec-${idx + 1}`,
        productName,
        price: 19.99 + idx,
        currency: 'USD',
        imageGroups: [
            {
                viewType: 'medium',
                images: [
                    {
                        alt: productName,
                        link: `https://example.com/${idx + 1}.jpg`,
                        disBaseLink: `https://example.com/${idx + 1}.jpg`,
                    },
                ],
            },
        ],
    }));

// Default empty recommendation promises — server resolved with no recs.
const emptyRecsPromise = (): Promise<Recommendation> => Promise.resolve({});

/**
 * Build a recommendations slot the same way the cart route does — pinning is the route's concern,
 * so tests pass the promises directly to <ProductRecommendations>.
 */
const buildRecommendationsSlot = ({
    cartMayAlsoLikePromise = emptyRecsPromise(),
    cartRecentlyViewedPromise = emptyRecsPromise(),
}: {
    cartMayAlsoLikePromise?: Promise<Recommendation>;
    cartRecentlyViewedPromise?: Promise<Recommendation>;
} = {}) => (
    <div className="mt-16 space-y-16">
        <ProductRecommendations
            recommenderName={EINSTEIN_RECOMMENDERS.CART_MAY_ALSO_LIKE}
            recommenderTitle={t('product:recommendations.youMightAlsoLike')}
            data={cartMayAlsoLikePromise}
            className="max-w-none px-0"
        />
        <ProductRecommendations
            recommenderName={EINSTEIN_RECOMMENDERS.CART_RECENTLY_VIEWED}
            recommenderTitle={t('product:recommendations.recentlyViewed')}
            data={cartRecentlyViewedPromise}
            className="max-w-none px-0"
        />
    </div>
);

// `<Await resolve>` tracks promises by identity. Share a single already-resolved instance for
// tests that don't exercise rule-based bonus carousels — a per-call `Promise.resolve({})` would
// re-suspend the boundary every render and break unrelated assertions.
const EMPTY_RULE_BASED_BONUS_PRODUCTS: Promise<Record<string, never>> = Promise.resolve({});

// Utils
const renderCartContent = (props: Omit<React.ComponentProps<typeof CartContent>, 'ruleBasedBonusProductsPromise'>) => {
    // Using createMemoryRouter in framework mode is fine
    // because both framework and data routers share the same underlying architecture, so it provides a valid navigation context for hooks and <Link>.
    // Even though it's listed under "data routers," it fully supports testing non-route components that rely on router behavior.
    const router = createMemoryRouter(
        [
            {
                path: '/cart',
                element: (
                    <AllProvidersWrapper>
                        <CartContent ruleBasedBonusProductsPromise={EMPTY_RULE_BASED_BONUS_PRODUCTS} {...props} />
                    </AllProvidersWrapper>
                ),
            },
        ],
        { initialEntries: ['/cart'] }
    );

    return render(<RouterProvider router={router} />);
};

describe('CartContent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        bonusModalRenders.length = 0;
        // The spacer wiring writes to the shared <html> element; reset it between tests so a
        // saved/restored value from one test can't leak into the next.
        document.documentElement.style.removeProperty('scroll-padding-bottom');
        document.documentElement.style.removeProperty('--cart-mobile-summary-spacer');
    });

    const mockBasket = {
        basketId: 'test-basket-id',
        productItems: [
            { itemId: 'item-1', quantity: 2, productId: 'product-1' },
            { itemId: 'item-2', quantity: 1, productId: 'product-2' },
        ],
    };

    const mockProductMap = {
        'item-1': { id: 'product-1', name: 'Product 1', variants: [{} as any] },
        'item-2': { id: 'product-2', name: 'Product 2', variants: [{} as any] },
    } as any;

    const mockPromotionMap = {
        'promo-1': { id: 'promo-1', name: 'Promotion 1' },
    };

    const mockBonusProductsById: Record<string, import('@/scapi').ShopperProducts.schemas['Product']> = {};

    test('renders empty cart for 0 product items', () => {
        // Test empty product items array
        const emptyBasket = { ...mockBasket, productItems: [] };
        renderCartContent({
            basket: emptyBasket,
            productsByItemId: mockProductMap,
            bonusProductsById: mockBonusProductsById,
        });

        expect(screen.getByTestId('sf-cart-empty')).toBeInTheDocument();
        expect(screen.getByText(t('cart:empty.title'))).toBeInTheDocument();
        expect(screen.getByText(t('cart:empty.guestMessage'))).toBeInTheDocument();
        expect(screen.getByText(t('cart:empty.continueShopping'))).toBeInTheDocument();
        expect(screen.queryByTestId('sf-cart-container')).not.toBeInTheDocument();
    });

    test('exposes the cart-delivery-group, order-summary, and bonus-products-rail data-slot hooks', () => {
        // These data-slot attributes are the styling contract verticals hook into
        // (cosmetic restyles all three via base.css). A bonus discount line item is
        // included so the bonus rail branch renders alongside delivery + summary.
        const basketWithBonus = {
            ...mockBasket,
            bonusDiscountLineItems: [
                {
                    id: 'bdli-1',
                    promotionId: 'promo-1',
                    maxBonusItems: 1,
                    bonusProducts: [{ productId: 'bonus-1', productName: 'Free Bonus' }],
                },
            ],
        } as any;

        const { container } = renderCartContent({
            basket: basketWithBonus,
            productsByItemId: mockProductMap,
            bonusProductsById: { 'bonus-1': { id: 'bonus-1', name: 'Free Bonus' } as any },
            promotions: mockPromotionMap as any,
        });

        expect(container.querySelector('[data-slot="cart-delivery-group"]')).toBeInTheDocument();
        expect(container.querySelector('[data-slot="order-summary"]')).toBeInTheDocument();
        expect(container.querySelector('[data-slot="bonus-products-rail"]')).toBeInTheDocument();
    });

    test('sources the bonus rail title callout from the trigger product when the promotions map lacks it', async () => {
        // Unselected state: a choice-of-bonus promo has no priceAdjustment yet, so `fetchPromotionsForBasket`
        // omits it from the promotions map. The callout must instead come from the trigger product's
        // productPromotions (expanded at load), so the rail title shows the real callout — not the generic
        // "Bonus Products Available" fallback.
        const basketWithBonus = {
            ...mockBasket,
            bonusDiscountLineItems: [
                {
                    id: 'bdli-1',
                    promotionId: 'promo-bonus',
                    maxBonusItems: 1,
                    bonusProducts: [{ productId: 'bonus-1', productName: 'Free Bonus' }],
                },
            ],
        } as any;

        // Trigger product carries the promo callout via productPromotions; promotions map intentionally omits it.
        const productsWithCallout = {
            ...mockProductMap,
            'item-1': {
                id: 'product-1',
                name: 'Product 1',
                variants: [{} as any],
                productPromotions: [{ promotionId: 'promo-bonus', calloutMsg: "Buy one men's suit, get 2 free ties" }],
            },
        };

        renderCartContent({
            basket: basketWithBonus,
            productsByItemId: productsWithCallout,
            bonusProductsById: { 'bonus-1': { id: 'bonus-1', name: 'Free Bonus' } as any },
            promotions: {} as any, // promo absent from the map (unselected state)
        });

        // Lazy fashion carousel resolves async; the title renders the sourced callout, not the fallback.
        expect(await screen.findByText("Buy one men's suit, get 2 free ties")).toBeInTheDocument();
        expect(screen.queryByText(t('cart:bonusProducts.defaultTitle'))).not.toBeInTheDocument();
    });

    test('renders empty cart when basket is undefined', () => {
        renderCartContent({
            basket: undefined,
            productsByItemId: mockProductMap,
            bonusProductsById: mockBonusProductsById,
        });

        expect(screen.getByTestId('sf-cart-empty')).toBeInTheDocument();
        expect(screen.getByText(t('cart:empty.title'))).toBeInTheDocument();
    });

    test('renders cart content with proper structure when basket has items', () => {
        renderCartContent({
            basket: mockBasket,
            productsByItemId: mockProductMap,
            bonusProductsById: mockBonusProductsById,
            promotions: mockPromotionMap,
        });

        // Verify main container
        expect(screen.getByTestId('sf-cart-container')).toBeInTheDocument();
        expect(screen.queryByTestId('sf-cart-empty')).not.toBeInTheDocument();

        // Verify page heading with item count is rendered (h1)
        const heading = screen.getByRole('heading', { level: 1 });
        expect(heading).toBeInTheDocument();
        expect(heading).toHaveTextContent(t('cart:itemCount', { count: 3 }));

        // Verify product items are rendered (they have individual test IDs)
        expect(screen.getByTestId('sf-product-item-product-1')).toBeInTheDocument();
        expect(screen.getByTestId('sf-product-item-product-2')).toBeInTheDocument();
    });

    test('mirrors the mobile summary panel height into both scroll-padding-bottom and the --cart-mobile-summary-spacer custom property', () => {
        const { unmount } = renderCartContent({
            basket: mockBasket,
            productsByItemId: mockProductMap,
            bonusProductsById: mockBonusProductsById,
            promotions: mockPromotionMap,
        });

        const rootStyle = document.documentElement.style;
        // jsdom doesn't compute real layout, so offsetHeight is always 0 here — what this test
        // guards is that both properties are wired to the SAME live value (one ResizeObserver
        // source), not that either holds a specific pixel number.
        expect(rootStyle.getPropertyValue('--cart-mobile-summary-spacer')).not.toBe('');
        expect(rootStyle.scrollPaddingBottom).toBe(rootStyle.getPropertyValue('--cart-mobile-summary-spacer'));

        unmount();

        expect(rootStyle.scrollPaddingBottom).toBe('');
        expect(rootStyle.getPropertyValue('--cart-mobile-summary-spacer')).toBe('');
    });

    test('restores the documentElement prior scroll-padding-bottom on unmount instead of clearing a shared value', () => {
        // Another owner may have set an inline scroll-padding-bottom on the shared <html> element
        // before the cart mounted. The cart must hand that value back on unmount, not blow it away.
        const rootStyle = document.documentElement.style;
        rootStyle.scrollPaddingBottom = '42px';

        const { unmount } = renderCartContent({
            basket: mockBasket,
            productsByItemId: mockProductMap,
            bonusProductsById: mockBonusProductsById,
        });

        // While mounted the cart owns the value (0px in jsdom, which has no layout).
        expect(rootStyle.scrollPaddingBottom).toBe('0px');

        unmount();

        // The prior owner's value is restored, not cleared to empty.
        expect(rootStyle.scrollPaddingBottom).toBe('42px');

        rootStyle.removeProperty('scroll-padding-bottom');
    });

    test('wires the spacer when a cart that started empty later fills (observer lifecycle follows the panel node)', () => {
        // The fixed mobile summary panel only renders for a non-empty cart. A mount-once effect
        // would bail on the first empty render and never set up when the cart later fills; the
        // ref-callback wiring must attach whenever the panel node mounts.
        const rootStyle = document.documentElement.style;

        function FillableCart() {
            const [filled, setFilled] = useState(false);
            return (
                <>
                    <button type="button" data-testid="fill-cart" onClick={() => setFilled(true)}>
                        fill
                    </button>
                    <CartContent
                        basket={filled ? mockBasket : { ...mockBasket, productItems: [] }}
                        productsByItemId={mockProductMap}
                        bonusProductsById={mockBonusProductsById}
                        ruleBasedBonusProductsPromise={EMPTY_RULE_BASED_BONUS_PRODUCTS}
                    />
                </>
            );
        }

        const router = createMemoryRouter(
            [
                {
                    path: '/cart',
                    element: (
                        <AllProvidersWrapper>
                            <FillableCart />
                        </AllProvidersWrapper>
                    ),
                },
            ],
            { initialEntries: ['/cart'] }
        );
        render(<RouterProvider router={router} />);

        // Empty cart: the panel is absent, so the spacer is not wired.
        expect(screen.getByTestId('sf-cart-empty')).toBeInTheDocument();
        expect(rootStyle.getPropertyValue('--cart-mobile-summary-spacer')).toBe('');

        // Fill the cart in the same mounted instance — the panel mounts and the ref callback wires up.
        fireEvent.click(screen.getByTestId('fill-cart'));

        expect(screen.getByTestId('sf-cart-container')).toBeInTheDocument();
        expect(rootStyle.getPropertyValue('--cart-mobile-summary-spacer')).not.toBe('');
        expect(rootStyle.scrollPaddingBottom).toBe(rootStyle.getPropertyValue('--cart-mobile-summary-spacer'));
    });

    test('handles missing promotionMap prop gracefully', () => {
        renderCartContent({
            basket: mockBasket,
            productsByItemId: mockProductMap,
            bonusProductsById: mockBonusProductsById,
        });

        // Verify that the cart container is still rendered even without promotionMap
        expect(screen.getByTestId('sf-cart-container')).toBeInTheDocument();

        // Verify product items are still rendered
        expect(screen.getByTestId('sf-product-item-product-1')).toBeInTheDocument();
        expect(screen.getByTestId('sf-product-item-product-2')).toBeInTheDocument();
    });

    test('handles basket with missing productItems (undefined) as empty state', () => {
        // productItems is omitted entirely
        const basketWithoutProductItems = { basketId: 'b-no-items' } as any;
        renderCartContent({
            basket: basketWithoutProductItems,
            productsByItemId: {} as any,
            bonusProductsById: mockBonusProductsById,
        });

        // Should render empty state
        expect(screen.getByTestId('sf-cart-empty')).toBeInTheDocument();
    });

    test('renders singular cart heading when total item count is one', () => {
        const oneItemBasket = {
            ...mockBasket,
            productItems: [{ itemId: 'item-1', quantity: 1, productId: 'product-1' }],
        };

        renderCartContent({
            basket: oneItemBasket,
            productsByItemId: mockProductMap,
            bonusProductsById: mockBonusProductsById,
        });

        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('cart:itemCount', { count: 1 }));
    });

    describe('Line item secondary actions', () => {
        test('renders remove, edit, and wishlist controls for each cart item with itemId', async () => {
            renderCartContent({
                basket: mockBasket,
                productsByItemId: mockProductMap,
                bonusProductsById: mockBonusProductsById,
            });

            expect(screen.getByTestId('remove-item-item-1')).toBeInTheDocument();
            expect(screen.getByTestId('remove-item-item-2')).toBeInTheDocument();
            expect(screen.getByTestId('edit-item-item-1')).toBeInTheDocument();
            expect(screen.getByTestId('edit-item-item-2')).toBeInTheDocument();
            expect(await screen.findByTestId('cart-add-wishlist-item-1')).toBeInTheDocument();
            expect(await screen.findByTestId('cart-add-wishlist-item-2')).toBeInTheDocument();
        });

        test('does not render secondary actions when product has no itemId', async () => {
            const basketWithoutItemIds = {
                ...mockBasket,
                productItems: [
                    { quantity: 2, productId: 'product-1' },
                    { itemId: 'item-2', quantity: 1, productId: 'product-2' },
                ],
            };

            renderCartContent({
                basket: basketWithoutItemIds,
                productsByItemId: mockProductMap,
                bonusProductsById: mockBonusProductsById,
            });

            expect(screen.queryByTestId('remove-item-item-1')).not.toBeInTheDocument();
            expect(screen.queryByTestId('edit-item-item-1')).not.toBeInTheDocument();
            expect(screen.queryByTestId('cart-add-wishlist-item-1')).not.toBeInTheDocument();
            expect(screen.getByTestId('remove-item-item-2')).toBeInTheDocument();
            expect(screen.getByTestId('edit-item-item-2')).toBeInTheDocument();
            expect(await screen.findByTestId('cart-add-wishlist-item-2')).toBeInTheDocument();
        });

        test('choice-based bonus product hides wishlist and shows remove only', async () => {
            const basket = {
                basketId: 'b1',
                productItems: [
                    {
                        itemId: 'item-1',
                        quantity: 1,
                        productId: 'p1',
                        bonusProductLineItem: true,
                        bonusDiscountLineItemId: 'bonus-discount-choice-1',
                    },
                ],
                bonusDiscountLineItems: [
                    {
                        id: 'bonus-discount-choice-1',
                        promotionId: 'promo-choice-1',
                        maxBonusItems: 3,
                        bonusProducts: [{ productId: 'p1', productName: 'Choice Bonus Product 1' }],
                    },
                ],
            };

            renderCartContent({
                basket: basket as any,
                productsByItemId: { 'item-1': { id: 'p1', variants: [{} as any] } } as any,
                bonusProductsById: { p1: { id: 'p1', name: 'Choice Bonus Product 1' } } as any,
            });

            expect(screen.queryByTestId('edit-item-item-1')).not.toBeInTheDocument();
            expect(screen.getByTestId('remove-item-item-1')).toBeInTheDocument();
            await waitFor(() => {
                expect(screen.queryByTestId('cart-add-wishlist-item-1')).not.toBeInTheDocument();
            });
        });

        test('auto bonus product hides wishlist and does not show edit', () => {
            const basket = {
                basketId: 'b1',
                productItems: [
                    {
                        itemId: 'item-1',
                        quantity: 1,
                        productId: 'p1',
                        bonusProductLineItem: true,
                        bonusDiscountLineItemId: 'bonus-discount-auto-1',
                    },
                ],
                bonusDiscountLineItems: [
                    {
                        id: 'bonus-discount-auto-1',
                        promotionId: 'promo-auto-1',
                        maxBonusItems: 1,
                        // No bonusProducts array = auto bonus
                    },
                ],
            };

            renderCartContent({
                basket: basket as any,
                productsByItemId: { 'item-1': { id: 'p1', variants: [{} as any] } } as any,
                bonusProductsById: mockBonusProductsById,
            });

            expect(screen.queryByTestId('edit-item-item-1')).not.toBeInTheDocument();
            expect(screen.queryByTestId('cart-add-wishlist-item-1')).not.toBeInTheDocument();
        });
    });

    describe('Inventory validation and checkout blocking', () => {
        test('disables checkout button when items exceed inventory', () => {
            const basketWithExcessQuantity = {
                basketId: 'test-basket',
                productItems: [
                    {
                        itemId: 'item-1',
                        quantity: 100,
                        productId: 'product-1',
                        shipmentId: 'ship-1',
                        productName: 'Product 1',
                    },
                ],
            };

            const productMapWithLowStock = {
                'item-1': {
                    id: 'product-1',
                    name: 'Product 1',
                    inventory: { id: 'inv-1', ats: 5, orderable: true },
                    variants: [{} as any],
                },
            } as any;

            renderCartContent({
                basket: basketWithExcessQuantity as any,
                productsByItemId: productMapWithLowStock,
                bonusProductsById: {},
            });

            const checkoutButtons = screen.getAllByText(t('cart:checkout.continueToCheckout'));
            // Both mobile and desktop buttons should be disabled
            checkoutButtons.forEach((button) => {
                expect(button.closest('button')).toBeDisabled();
            });
        });

        test('shows inventory error banner when items exceed stock', () => {
            const basketWithExcessQuantity = {
                basketId: 'test-basket',
                productItems: [
                    {
                        itemId: 'item-1',
                        quantity: 100,
                        productId: 'product-1',
                        shipmentId: 'ship-1',
                        productName: 'Product 1',
                    },
                ],
            };

            const productMapWithLowStock = {
                'item-1': {
                    id: 'product-1',
                    name: 'Product 1',
                    inventory: { id: 'inv-1', ats: 5, orderable: true },
                    variants: [{} as any],
                },
            } as any;

            renderCartContent({
                basket: basketWithExcessQuantity as any,
                productsByItemId: productMapWithLowStock,
                bonusProductsById: {},
            });

            const banners = screen.getAllByText(t('cart:inventory.blockMessage'));
            // Should have banners for both mobile and desktop
            expect(banners.length).toBeGreaterThan(0);
            banners.forEach((banner) => {
                expect(banner).toBeInTheDocument();
            });
        });

        test('enables checkout when all items are in stock', () => {
            const basketWithValidQuantity = {
                basketId: 'test-basket',
                productItems: [
                    {
                        itemId: 'item-1',
                        quantity: 3,
                        productId: 'product-1',
                        shipmentId: 'ship-1',
                        productName: 'Product 1',
                    },
                ],
            };

            const productMapWithStock = {
                'item-1': {
                    id: 'product-1',
                    name: 'Product 1',
                    inventory: { id: 'inv-1', ats: 10, orderable: true },
                    variants: [{} as any],
                },
            } as any;

            renderCartContent({
                basket: basketWithValidQuantity as any,
                productsByItemId: productMapWithStock,
                bonusProductsById: {},
            });

            const checkoutLinks = screen.getAllByText(t('cart:checkout.continueToCheckout'));
            // Both mobile and desktop buttons should be enabled links
            checkoutLinks.forEach((link) => {
                expect(link.closest('a')).toHaveAttribute('href', expect.stringContaining('/checkout'));
            });
        });

        test('does not show error banner when all items are in stock', () => {
            const basketWithValidQuantity = {
                basketId: 'test-basket',
                productItems: [
                    {
                        itemId: 'item-1',
                        quantity: 3,
                        productId: 'product-1',
                        shipmentId: 'ship-1',
                        productName: 'Product 1',
                    },
                ],
            };

            const productMapWithStock = {
                'item-1': {
                    id: 'product-1',
                    name: 'Product 1',
                    inventory: { id: 'inv-1', ats: 10, orderable: true },
                    variants: [{} as any],
                },
            } as any;

            renderCartContent({
                basket: basketWithValidQuantity as any,
                productsByItemId: productMapWithStock,
                bonusProductsById: {},
            });

            expect(screen.queryByText(t('cart:inventory.blockMessage'))).not.toBeInTheDocument();
        });
    });

    describe('CartItemEditButton Integration', () => {
        test('renders edit buttons for each cart item', () => {
            renderCartContent({
                basket: mockBasket,
                productsByItemId: mockProductMap,
                bonusProductsById: mockBonusProductsById,
            });

            expect(screen.getByTestId('edit-item-item-1')).toBeInTheDocument();
            expect(screen.getByTestId('edit-item-item-2')).toBeInTheDocument();

            const editButtons = screen.getAllByText(t('actionCard:edit'));
            expect(editButtons).toHaveLength(2);
        });

        test('applies correct className to edit buttons', () => {
            renderCartContent({
                basket: mockBasket,
                productsByItemId: mockProductMap,
                bonusProductsById: mockBonusProductsById,
            });

            const editButton1 = screen.getByTestId('edit-item-item-1');
            const editButton2 = screen.getByTestId('edit-item-item-2');

            expect(editButton1).toHaveClass('pl-0');
            expect(editButton2).toHaveClass('pl-0');
        });

        test('opens product modal when edit button is clicked', () => {
            renderCartContent({
                basket: mockBasket,
                productsByItemId: mockProductMap,
                bonusProductsById: mockBonusProductsById,
            });

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

            const editButton = screen.getByTestId('edit-item-item-1');
            fireEvent.click(editButton);

            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(screen.getByText(t('editItem:title'))).toBeInTheDocument();
        });

        test('can close modal using close button', () => {
            renderCartContent({
                basket: mockBasket,
                productsByItemId: mockProductMap,
                bonusProductsById: mockBonusProductsById,
            });

            const editButton = screen.getByTestId('edit-item-item-1');
            fireEvent.click(editButton);

            expect(screen.getByRole('dialog')).toBeInTheDocument();

            const closeButton = screen.getByRole('button', { name: /close/i });
            fireEvent.click(closeButton);

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        test('does not render edit buttons when product has no itemId', () => {
            const basketWithoutItemIds = {
                ...mockBasket,
                productItems: [
                    { quantity: 2, productId: 'product-1' },
                    { itemId: 'item-2', quantity: 1, productId: 'product-2' },
                ],
            };

            renderCartContent({
                basket: basketWithoutItemIds,
                productsByItemId: mockProductMap,
                bonusProductsById: mockBonusProductsById,
            });

            expect(screen.queryByTestId('edit-item-item-1')).not.toBeInTheDocument();
            expect(screen.getByTestId('edit-item-item-2')).toBeInTheDocument();
        });
    });

    describe('Cart recommendations section', () => {
        // CartContent renders the recommendations region from a `recommendationsSlot` ReactNode
        // owned by the route. These tests construct the slot the same way `CartBody` does so
        // they verify both the slot integration and that <ProductRecommendations data={…}>
        // resolves the loader-provided promises end-to-end.
        test('renders the "you might also like" carousel with translated title and recommended products', async () => {
            renderCartContent({
                basket: mockBasket,
                productsByItemId: mockProductMap,
                bonusProductsById: mockBonusProductsById,
                recommendationsSlot: buildRecommendationsSlot({
                    cartMayAlsoLikePromise: Promise.resolve({
                        recommenderName: 'product-to-product-einstein',
                        recs: buildRecs(['Recommended Shirt', 'Recommended Pants']),
                    }),
                }),
            });

            expect(await screen.findByText(t('product:recommendations.youMightAlsoLike'))).toBeInTheDocument();
            expect(screen.getByText('Recommended Shirt')).toBeInTheDocument();
            expect(screen.getByText('Recommended Pants')).toBeInTheDocument();
        });

        test('renders the "recently viewed" carousel with its translated title and product', async () => {
            renderCartContent({
                basket: mockBasket,
                productsByItemId: mockProductMap,
                bonusProductsById: mockBonusProductsById,
                recommendationsSlot: buildRecommendationsSlot({
                    cartRecentlyViewedPromise: Promise.resolve({
                        recommenderName: 'viewed-recently-einstein',
                        recs: buildRecs(['Previously Viewed Hat']),
                    }),
                }),
            });

            expect(await screen.findByText(t('product:recommendations.recentlyViewed'))).toBeInTheDocument();
            expect(screen.getByText('Previously Viewed Hat')).toBeInTheDocument();
        });

        test('renders nothing for either recommender when the resolved recs arrays are empty', async () => {
            renderCartContent({
                basket: mockBasket,
                productsByItemId: mockProductMap,
                bonusProductsById: mockBonusProductsById,
                recommendationsSlot: buildRecommendationsSlot(),
            });

            // Allow Suspense boundaries to resolve their (empty) promises.
            await waitFor(() => {
                expect(screen.getByTestId('sf-cart-container')).toBeInTheDocument();
            });
            expect(screen.queryByText(t('product:recommendations.youMightAlsoLike'))).not.toBeInTheDocument();
            expect(screen.queryByText(t('product:recommendations.recentlyViewed'))).not.toBeInTheDocument();
        });

        test('renders nothing for either recommender when the cart is empty', async () => {
            // Empty cart short-circuits to <CartEmpty />; the recommendations region never renders.
            renderCartContent({
                basket: { ...mockBasket, productItems: [] },
                productsByItemId: mockProductMap,
                bonusProductsById: mockBonusProductsById,
                // The slot is still passed (the route always builds it) — we just confirm
                // CartContent doesn't render anything below CartEmpty.
                recommendationsSlot: buildRecommendationsSlot(),
            });

            await waitFor(() => {
                expect(screen.getByTestId('sf-cart-empty')).toBeInTheDocument();
            });
            expect(screen.queryByText(t('product:recommendations.youMightAlsoLike'))).not.toBeInTheDocument();
            expect(screen.queryByText(t('product:recommendations.recentlyViewed'))).not.toBeInTheDocument();
        });
    });

    describe('Edit button visibility (CartItemEditButton presence)', () => {
        function renderWith(productsByItemId: Record<string, any>) {
            const basket = {
                basketId: 'b1',
                productItems: [{ itemId: 'item-1', quantity: 1, productId: 'p1' }],
            };
            return renderCartContent({ basket, productsByItemId, bonusProductsById: mockBonusProductsById });
        }

        const editBtn = () => screen.queryByTestId('edit-item-item-1');

        test('standard product does not show CartItemEditButton', () => {
            renderWith({ 'item-1': { id: 'p1', type: { item: true } } } as any);
            expect(editBtn()).not.toBeInTheDocument();
        });

        test('product with variants shows CartItemEditButton', () => {
            renderWith({ 'item-1': { id: 'p1', variants: [{} as any] } } as any);
            expect(editBtn()).toBeInTheDocument();
        });

        test('missing product details mapping shows CartItemEditButton', () => {
            const basket = { basketId: 'b1', productItems: [{ itemId: 'item-1', quantity: 1, productId: 'p1' }] };
            renderCartContent({
                basket,
                productsByItemId: {} as any,
                bonusProductsById: mockBonusProductsById,
            });
            expect(editBtn()).toBeInTheDocument();
        });

        test('bundle product shows CartItemEditButton', () => {
            renderWith({ 'item-1': { id: 'p1', type: { bundle: true } } } as any);
            expect(editBtn()).toBeInTheDocument();
        });

        test('parent product shows CartItemEditButton', () => {
            renderWith({ 'item-1': { id: 'p1', type: { master: true } } } as any);
            expect(editBtn()).toBeInTheDocument();
        });

        test('choice-based bonus product does not show CartItemEditButton', () => {
            const basket = {
                basketId: 'b1',
                productItems: [
                    {
                        itemId: 'item-1',
                        quantity: 1,
                        productId: 'p1',
                        bonusProductLineItem: true,
                        bonusDiscountLineItemId: 'bonus-discount-choice-1',
                    },
                ],
                bonusDiscountLineItems: [
                    {
                        id: 'bonus-discount-choice-1',
                        promotionId: 'promo-choice-1',
                        maxBonusItems: 3,
                        bonusProducts: [{ productId: 'p1', productName: 'Choice Bonus Product 1' }],
                    },
                ],
            };

            renderCartContent({
                basket: basket as any,
                productsByItemId: { 'item-1': { id: 'p1', variants: [{} as any] } } as any,
                bonusProductsById: { p1: { id: 'p1', name: 'Choice Bonus Product 1' } } as any,
            });

            expect(editBtn()).not.toBeInTheDocument();
            expect(screen.getByTestId('remove-item-item-1')).toBeInTheDocument();
        });

        test('auto bonus product does not show CartItemEditButton', () => {
            const basket = {
                basketId: 'b1',
                productItems: [
                    {
                        itemId: 'item-1',
                        quantity: 1,
                        productId: 'p1',
                        bonusProductLineItem: true,
                        bonusDiscountLineItemId: 'bonus-discount-auto-1',
                    },
                ],
                bonusDiscountLineItems: [
                    {
                        id: 'bonus-discount-auto-1',
                        promotionId: 'promo-auto-1',
                        maxBonusItems: 1,
                    },
                ],
            };

            renderCartContent({
                basket: basket as any,
                productsByItemId: { 'item-1': { id: 'p1', variants: [{} as any] } } as any,
                bonusProductsById: mockBonusProductsById,
            });

            expect(editBtn()).not.toBeInTheDocument();
        });
    });

    describe('basket sync into BasketProvider', () => {
        // Read-only consumer: useBasket() does not fall back to a SCAPI fetch. If CartContent's
        // pre-paint sync is broken, the probe renders "no-basket" on first commit and never recovers.
        function BasketProbe() {
            const basket = useBasket();
            return <div data-testid="basket-probe">{basket?.basketId ?? 'no-basket'}</div>;
        }

        const renderWithBasketProvider = (
            basket: typeof mockBasket,
            ProbeComponent: React.ComponentType = BasketProbe
        ) => {
            const router = createMemoryRouter(
                [
                    {
                        path: '/cart',
                        element: (
                            <AllProvidersWrapper>
                                <BasketProvider snapshot={null}>
                                    <ProbeComponent />
                                    <CartContent
                                        basket={basket}
                                        productsByItemId={mockProductMap}
                                        bonusProductsById={mockBonusProductsById}
                                        recommendationsSlot={buildRecommendationsSlot()}
                                        ruleBasedBonusProductsPromise={EMPTY_RULE_BASED_BONUS_PRODUCTS}
                                    />
                                </BasketProvider>
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                { initialEntries: ['/cart'] }
            );
            return render(<RouterProvider router={router} />);
        };

        test('makes the loader basket observable to descendants on first commit', async () => {
            renderWithBasketProvider(mockBasket);

            await waitFor(() => {
                expect(screen.getByTestId('basket-probe')).toHaveTextContent('test-basket-id');
            });
        });

        test('sibling consumer observes undefined on first commit even with the pre-paint sync', async () => {
            // Load-bearing reason useBasket() defaults to autoLoad:false: CartContent's
            // useLayoutEffect-based sync runs *after* the first commit of any consumer that
            // mounts in the same render. Sibling and descendant useBasket() consumers
            // therefore observe `current === undefined` on their first committed render and
            // re-render once the sync writes to context. Auto-load on this site would issue
            // a redundant `GET /baskets/{id}` and flicker the UI before the pre-paint sync
            // takes effect.
            const renders: (string | undefined)[] = [];
            function DefaultProbe() {
                const basket = useBasket();
                renders.push(basket?.basketId);
                return <div data-testid="default-probe">{basket?.basketId ?? 'no-basket'}</div>;
            }

            renderWithBasketProvider(mockBasket, DefaultProbe);

            await waitFor(() => {
                expect(screen.getByTestId('default-probe')).toHaveTextContent('test-basket-id');
            });

            // First committed render does NOT see the basket — the autoLoad:false default is
            // required at every read-only consumer that mounts inside or alongside CartContent.
            expect(renders[0]).toBeUndefined();
        });
    });

    describe('Bonus product modal — capacity wiring', () => {
        // Variant-bearing bonus product: triggers `requiresVariantSelection` → `requiresModal=true`,
        // which is the only path that opens BonusProductModal.
        const variantBonusProduct = {
            id: 'bonus-shirt',
            name: 'Free Shirt',
            type: { master: true },
            variationAttributes: [{ id: 'color', name: 'Color', values: [{ value: 'red' }] }],
            variants: [{ productId: 'bonus-shirt-red' }],
        } as unknown as import('@/scapi').ShopperProducts.schemas['Product'];

        test('opens with slot rows wired from getBonusDiscountSlotsForPromotion when user picks a variant-bearing bonus', async () => {
            // Two BLIs under the same promotion. One slot is fully claimed (selected=2/2),
            // the other has half-remaining capacity (selected=1/3). The test asserts the
            // modal receives both slot rows verbatim — the modal recomputes its own remaining
            // count from the active slot's `maxBonusItems` and `bonusProductsSelected`.
            const basket = {
                basketId: 'b-bonus',
                productItems: [
                    { itemId: 'cart-item-1', quantity: 1, productId: 'shirt-1' },
                    {
                        itemId: 'bonus-item-1',
                        productId: 'bonus-shirt-red',
                        quantity: 2,
                        bonusProductLineItem: true,
                        bonusDiscountLineItemId: 'bli-1',
                    },
                    {
                        itemId: 'bonus-item-2',
                        productId: 'bonus-tie',
                        quantity: 1,
                        bonusProductLineItem: true,
                        bonusDiscountLineItemId: 'bli-2',
                    },
                ],
                bonusDiscountLineItems: [
                    {
                        id: 'bli-1',
                        promotionId: 'promo-bonus',
                        maxBonusItems: 2,
                        bonusProducts: [{ productId: 'bonus-shirt', productName: 'Free Shirt' }],
                    },
                    {
                        id: 'bli-2',
                        promotionId: 'promo-bonus',
                        maxBonusItems: 3,
                        bonusProducts: [{ productId: 'bonus-shirt', productName: 'Free Shirt' }],
                    },
                ],
            };

            renderCartContent({
                basket: basket as any,
                productsByItemId: { 'cart-item-1': { id: 'shirt-1', variants: [{} as any] } } as any,
                bonusProductsById: { 'bonus-shirt': variantBonusProduct } as any,
            });

            // The add CTA lives inside the lazily-loaded BonusProductSelection carousel, and one renders per
            // BLI. The label is vertical-specific — canonical "Select", cosmetic "Pick" — so match both so
            // this canonical test passes in the flattened cosmetic mirror too. Wait for the chunk to mount,
            // then click any one — capacity is keyed on promotionId, not the clicked BLI.
            const selectButtons = await screen.findAllByRole('button', { name: /^(Select|Pick)$/ });
            fireEvent.click(selectButtons[0]);

            // Modal mounts via Suspense after `selectedBonusProduct` is set.
            await screen.findByTestId('bonus-product-modal-stub');

            const openCalls = bonusModalRenders.filter((p) => p.open === true);
            expect(openCalls.length).toBeGreaterThan(0);
            const lastOpen = openCalls[openCalls.length - 1];

            expect(lastOpen.promotionId).toBe('promo-bonus');
            expect(lastOpen.bonusDiscountSlots).toEqual([
                { id: 'bli-1', maxBonusItems: 2, bonusProductsSelected: 2 },
                { id: 'bli-2', maxBonusItems: 3, bonusProductsSelected: 1 },
            ]);
        });

        test('passes a single empty slot through to the modal on the simple-BLI happy path', async () => {
            // Smallest possible wiring test: one BLI, no prior selections. Pins the contract that
            // an empty bonus state surfaces as `bonusDiscountSlots: [{ ..., bonusProductsSelected: 0 }]`.
            const basket = {
                basketId: 'b-bonus-empty',
                productItems: [{ itemId: 'cart-item-1', quantity: 1, productId: 'shirt-1' }],
                bonusDiscountLineItems: [
                    {
                        id: 'bli-active',
                        promotionId: 'promo-bonus',
                        maxBonusItems: 1,
                        bonusProducts: [{ productId: 'bonus-shirt', productName: 'Free Shirt' }],
                    },
                ],
            };

            renderCartContent({
                basket: basket as any,
                productsByItemId: { 'cart-item-1': { id: 'shirt-1', variants: [{} as any] } } as any,
                bonusProductsById: { 'bonus-shirt': variantBonusProduct } as any,
            });

            // Vertical-specific label (canonical "Select" / cosmetic "Pick") — match both.
            const selectButton = await screen.findByRole('button', { name: /^(Select|Pick)$/ });
            fireEvent.click(selectButton);

            await screen.findByTestId('bonus-product-modal-stub');

            const openCalls = bonusModalRenders.filter((p) => p.open === true);
            const lastOpen = openCalls[openCalls.length - 1];
            expect(lastOpen.promotionId).toBe('promo-bonus');
            expect(lastOpen.bonusDiscountSlots).toEqual([
                { id: 'bli-active', maxBonusItems: 1, bonusProductsSelected: 0 },
            ]);
        });
    });
});
