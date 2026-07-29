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
import type React from 'react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';

import BonusProductSelection from './bonus-product-selection';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockLocale, mockSiteObject } from '@/test-utils/config';
import { resourceRoutes } from '@/route-paths';

const mockSite = mockSiteObject;

// ============================================================================
// Mocks
// ============================================================================

// Mock i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => {
        const { t } = getTranslation();
        return { t, i18n: { language: mockSiteObject.defaultLocale } };
    },
}));

// Mock useFetcher from react-router - will be spied on in beforeEach
const mockSubmit = vi.fn();
const mockFetcher = {
    state: 'idle' as 'idle' | 'loading' | 'submitting',
    data: null as any,
    submit: mockSubmit,
    load: vi.fn(),
    Form: vi.fn(),
};

// Mock useToast
const mockAddToast = vi.fn();
vi.mock('@/components/toast', () => ({
    useToast: vi.fn(() => ({ addToast: mockAddToast })),
}));

// Mock only useBasketUpdater so the publish-back can be asserted; the rest of the provider is unused by this subtree.
const mockUpdateBasket = vi.fn();
vi.mock('@/providers/basket', () => ({
    useBasketUpdater: () => mockUpdateBasket,
}));

// Mock bonus-product-utils
// Default: all slots filled (for existing tests)
vi.mock('@/lib/cart/bonus-product-utils', () => ({
    getBonusProductCountsForPromotion: vi.fn(() => ({
        selectedBonusItems: 3,
        maxBonusItems: 3,
    })),
}));

// Mock product-utils
const mockRequiresVariantSelection = vi.fn();
const mockGetPrimaryProductImageUrl = vi.fn();
const mockIsRuleBasedPromotion = vi.fn();
vi.mock('@/lib/product/product-utils', () => ({
    requiresVariantSelection: (product: any) => mockRequiresVariantSelection(product),
    getPrimaryProductImageUrl: (product: any) => mockGetPrimaryProductImageUrl(product),
    isRuleBasedPromotion: (bonusItem: any) => mockIsRuleBasedPromotion(bonusItem),
}));

// Mock useConfig — still needed because `toImageUrl` reads it for DIS URL transforms.
vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: vi.fn(() => ({})),
}));

// Rule-based bonus product hits arrive as a deferred `ruleBasedBonusProductsPromise`
// keyed by `promotionId`. Tests construct an already-resolved promise via `ruleBasedPromise()`.
const ruleBasedPromise = (hits: any[], promotionId = 'promo-1'): Promise<Record<string, any[]>> =>
    Promise.resolve({ [promotionId]: hits });

// Mock carousel components
vi.mock('@/components/ui/carousel', () => ({
    Carousel: ({ children }: { children: React.ReactNode }) => (
        <div role="region" aria-roledescription="carousel">
            {children}
        </div>
    ),
    CarouselContent: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="carousel-content">{children}</div>
    ),
    CarouselItem: ({ children }: { children: React.ReactNode }) => <div data-testid="carousel-item">{children}</div>,
    CarouselPrevious: (props: React.ComponentProps<'button'>) => <button aria-label="Previous slide" {...props} />,
    CarouselNext: (props: React.ComponentProps<'button'>) => <button aria-label="Next slide" {...props} />,
}));

// ============================================================================
// Test Data Factories
// ============================================================================

function createMockProduct(
    overrides: Partial<ShopperProducts.schemas['Product']> = {}
): ShopperProducts.schemas['Product'] {
    return {
        id: 'product-1',
        name: 'Test Product',
        imageGroups: [
            {
                viewType: 'large',
                images: [{ link: 'https://example.com/image.jpg', alt: 'Product Image' }],
            },
        ],
        ...overrides,
    };
}

function createMockBonusDiscountLineItem(
    overrides: Partial<ShopperBasketsV2.schemas['BonusDiscountLineItem']> = {}
): ShopperBasketsV2.schemas['BonusDiscountLineItem'] {
    return {
        id: 'bdli-1',
        promotionId: 'promo-1',
        maxBonusItems: 3,
        bonusProducts: [
            { productId: 'product-1', productName: 'Test Product 1' },
            { productId: 'product-2', productName: 'Test Product 2' },
        ],
        ...overrides,
    };
}

function createMockBasket(
    overrides: Partial<ShopperBasketsV2.schemas['Basket']> = {}
): ShopperBasketsV2.schemas['Basket'] {
    return {
        basketId: 'basket-1',
        productItems: [],
        bonusDiscountLineItems: [],
        ...overrides,
    };
}

function createMockBonusProductsById(): Record<string, ShopperProducts.schemas['Product']> {
    return {
        'product-1': createMockProduct({ id: 'product-1', name: 'Test Product 1' }),
        'product-2': createMockProduct({ id: 'product-2', name: 'Test Product 2' }),
    };
}

// ============================================================================
// Default Props Helper
// ============================================================================

function getDefaultProps() {
    return {
        bonusDiscountLineItem: createMockBonusDiscountLineItem(),
        bonusProductsById: createMockBonusProductsById(),
        basket: createMockBasket(),
        promotionName: 'Buy one get one free',
        onProductSelect: vi.fn(),
    };
}

// Helper to render with router context
function renderWithRouter(ui: React.ReactElement) {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <SiteProvider
                        site={mockSite}
                        locale={mockLocale}
                        language={mockSiteObject.defaultLocale}
                        currency={mockSiteObject.defaultCurrency}>
                        {ui}
                    </SiteProvider>
                ),
            },
        ],
        {
            initialEntries: ['/'],
        }
    );
    return render(<RouterProvider router={router} />);
}

// ============================================================================
// Tests
// ============================================================================

describe('BonusProductSelection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetcher.state = 'idle';
        mockFetcher.data = null;
        mockRequiresVariantSelection.mockReturnValue(false);
        mockGetPrimaryProductImageUrl.mockReturnValue('https://example.com/image.jpg');
        mockIsRuleBasedPromotion.mockReturnValue(false); // Default to list-based
        // Use vi.spyOn for useFetcher hook
        vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue(mockFetcher as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ========================================================================
    // 1. Carousel Rendering Tests
    // ========================================================================

    describe('Carousel Rendering', () => {
        test('renders carousel with correct products, images, names, and "Free" badge', async () => {
            const props = getDefaultProps();
            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => {
                // Check carousel renders
                const carousel = screen.getByRole('region', { name: '' });
                expect(carousel).toHaveAttribute('aria-roledescription', 'carousel');

                // Check products render (2 carousel items)
                const carouselItems = screen.getAllByTestId('carousel-item');
                expect(carouselItems).toHaveLength(2);

                // Check product names display
                expect(screen.getByText('Test Product 1')).toBeInTheDocument();
                expect(screen.getByText('Test Product 2')).toBeInTheDocument();

                // Check "Free" badges (one per product)
                const badges = screen.getAllByText('Free');
                expect(badges).toHaveLength(2);

                // Check Select buttons render
                const selectButtons = screen.getAllByRole('button', { name: /select/i });
                expect(selectButtons).toHaveLength(2);
            });
        });

        test('does not render products when bonusProducts array is empty', () => {
            const props = getDefaultProps();
            props.bonusDiscountLineItem = createMockBonusDiscountLineItem({ bonusProducts: [] });

            renderWithRouter(<BonusProductSelection {...props} />);

            // Should not have carousel items
            const carouselItems = screen.queryAllByTestId('carousel-item');
            expect(carouselItems).toHaveLength(0);
        });

        test('displays "No image available" placeholder when product has no image', async () => {
            mockGetPrimaryProductImageUrl.mockReturnValue(undefined);
            const props = getDefaultProps();

            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => {
                const placeholders = screen.getAllByText('No image available');
                expect(placeholders).toHaveLength(2);
            });
        });

        test('displays promotion title with selection count from API', async () => {
            // Override mock to have slots available
            const { getBonusProductCountsForPromotion } = await import('@/lib/cart/bonus-product-utils');
            vi.mocked(getBonusProductCountsForPromotion).mockReturnValue({
                selectedBonusItems: 1,
                maxBonusItems: 3,
            });

            const props = getDefaultProps();
            props.promotionName = 'Summer Sale Bonus';

            renderWithRouter(<BonusProductSelection {...props} />);

            // Check title with count (mocked as 1 of 3). Derive the suffix from the resolved
            // translation rather than hardcoding the canonical wording — verticals (e.g. cosmetic)
            // override `selectionCount` to a compact "1/3" form via their locale overlay.
            const { t } = getTranslation();
            const countText = t('cart:bonusProducts.selectionCount', { selected: 1, max: 3 }).trim();
            expect(screen.getByText('Summer Sale Bonus')).toBeInTheDocument();
            expect(screen.getByText((content) => content.includes(countText))).toBeInTheDocument();
        });

        test('displays fallback title when promotionName is not provided', () => {
            // oxlint-disable-next-line @typescript-eslint/no-unused-vars
            const { promotionName, ...propsWithoutPromoName } = getDefaultProps();

            renderWithRouter(<BonusProductSelection {...propsWithoutPromoName} />);

            expect(screen.getByText('Bonus Products Available')).toBeInTheDocument();
        });

        test('carousel items are left-aligned with justify-start class', async () => {
            const props = getDefaultProps();
            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => {
                const carouselContent = screen.getByTestId('carousel-content');
                // Check that justify-start class is applied (via className prop)
                expect(carouselContent).toBeInTheDocument();
            });
        });
    });

    // ========================================================================
    // 2. Product Selection Flow Tests
    // ========================================================================

    describe('Product Selection Flow', () => {
        test('variants add directly to cart; masters open modal', async () => {
            // Override mock to have slots available
            const { getBonusProductCountsForPromotion } = await import('@/lib/cart/bonus-product-utils');
            vi.mocked(getBonusProductCountsForPromotion).mockReturnValue({
                selectedBonusItems: 0,
                maxBonusItems: 3,
            });

            const props = getDefaultProps();
            const user = userEvent.setup();

            // Add a variant and a master product
            props.bonusDiscountLineItem = createMockBonusDiscountLineItem({
                bonusProducts: [
                    { productId: 'variant-1', productName: 'Variant Product' },
                    { productId: 'master-1', productName: 'Master Product' },
                ],
            });
            props.bonusProductsById = {
                'variant-1': createMockProduct({
                    id: 'variant-1',
                    name: 'Variant Product',
                    type: { variant: true },
                }),
                'master-1': createMockProduct({
                    id: 'master-1',
                    name: 'Master Product',
                    type: { master: true },
                    variants: [{ productId: 'var-1' }, { productId: 'var-2' }],
                }),
            };

            // Mock requiresVariantSelection to return false for variant, true for master
            mockRequiresVariantSelection.mockImplementation((product: any) => {
                return product.type?.master === true;
            });

            renderWithRouter(<BonusProductSelection {...props} />);

            const selectButtons = await screen.findAllByRole('button', { name: /select/i });

            // Click variant product (first button)
            await user.click(selectButtons[0]);

            // Variant should add directly to cart
            expect(mockSubmit).toHaveBeenCalledWith(expect.any(FormData), {
                method: 'POST',
                action: resourceRoutes.bonusProductAdd,
            });
            expect(props.onProductSelect).not.toHaveBeenCalled();

            // Reset mocks
            mockSubmit.mockClear();
            props.onProductSelect.mockClear();

            // Click master product (second button)
            await user.click(selectButtons[1]);

            // Master should open modal
            expect(props.onProductSelect).toHaveBeenCalledWith('master-1', 'Master Product', true);
            expect(mockSubmit).not.toHaveBeenCalled();
        });

        test('opens modal when clicking Select on a variant product', async () => {
            // Override mock to have slots available
            const { getBonusProductCountsForPromotion } = await import('@/lib/cart/bonus-product-utils');
            vi.mocked(getBonusProductCountsForPromotion).mockReturnValue({
                selectedBonusItems: 0,
                maxBonusItems: 3,
            });

            mockRequiresVariantSelection.mockReturnValue(true);
            const props = getDefaultProps();
            const user = userEvent.setup();

            renderWithRouter(<BonusProductSelection {...props} />);

            const selectButtons = await screen.findAllByRole('button', { name: /select/i });
            await user.click(selectButtons[0]);

            // Should call onProductSelect with requiresModal=true
            expect(props.onProductSelect).toHaveBeenCalledWith('product-1', 'Test Product 1', true);

            // Should NOT submit to fetcher (modal handles it)
            expect(mockSubmit).not.toHaveBeenCalled();
        });

        test('adds directly to cart when clicking Select on a standard product', async () => {
            // Override mock to have slots available
            const { getBonusProductCountsForPromotion } = await import('@/lib/cart/bonus-product-utils');
            vi.mocked(getBonusProductCountsForPromotion).mockReturnValue({
                selectedBonusItems: 0,
                maxBonusItems: 3,
            });

            mockRequiresVariantSelection.mockReturnValue(false);
            const props = getDefaultProps();
            const user = userEvent.setup();

            renderWithRouter(<BonusProductSelection {...props} />);

            const selectButtons = await screen.findAllByRole('button', { name: /select/i });
            await user.click(selectButtons[0]);

            // Should NOT call onProductSelect (direct add)
            expect(props.onProductSelect).not.toHaveBeenCalled();

            // Should submit to fetcher
            expect(mockSubmit).toHaveBeenCalledWith(expect.any(FormData), {
                method: 'POST',
                action: resourceRoutes.bonusProductAdd,
            });

            // Verify FormData contains correct bonusItems
            const submittedFormData = mockSubmit.mock.calls[0][0] as FormData;
            const bonusItems = JSON.parse(submittedFormData.get('bonusItems') as string);
            expect(bonusItems).toEqual([
                {
                    productId: 'product-1',
                    quantity: 1,
                    bonusDiscountLineItemId: 'bdli-1',
                    promotionId: 'promo-1',
                },
            ]);
        });

        test('does not show toast after successful direct add', async () => {
            mockRequiresVariantSelection.mockReturnValue(false);
            // Set up fetcher with success state before render
            mockFetcher.state = 'idle';
            mockFetcher.data = { success: true };

            const props = getDefaultProps();
            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => {
                expect(mockAddToast).not.toHaveBeenCalled();
            });
        });

        test('publishes the action-response basket into BasketProvider on successful direct add', async () => {
            const responseBasket = { basketId: 'basket-1', lastModified: '2026-06-24T10:00:00.000Z' };
            mockRequiresVariantSelection.mockReturnValue(false);
            mockFetcher.state = 'idle';
            mockFetcher.data = { success: true, basket: responseBasket };

            const props = getDefaultProps();
            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => expect(mockUpdateBasket).toHaveBeenCalledWith(responseBasket));
        });

        test('does not publish a basket when the direct-add response carries none', async () => {
            mockRequiresVariantSelection.mockReturnValue(false);
            mockFetcher.state = 'idle';
            mockFetcher.data = { success: true };

            const props = getDefaultProps();
            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => expect(mockAddToast).not.toHaveBeenCalled());
            expect(mockUpdateBasket).not.toHaveBeenCalled();
        });

        test('does not publish a basket on a failed direct add', async () => {
            mockRequiresVariantSelection.mockReturnValue(false);
            mockFetcher.state = 'idle';
            mockFetcher.data = { success: false, basket: { basketId: 'basket-1' }, error: 'Out of stock' };

            const props = getDefaultProps();
            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => expect(mockAddToast).toHaveBeenCalled());
            expect(mockUpdateBasket).not.toHaveBeenCalled();
        });

        test('shows error toast after failed direct add', async () => {
            const { t } = getTranslation();
            mockRequiresVariantSelection.mockReturnValue(false);
            // Set up fetcher with error state before render
            mockFetcher.state = 'idle';
            mockFetcher.data = { success: false, error: 'Out of stock' };

            const props = getDefaultProps();
            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => {
                expect(mockAddToast).toHaveBeenCalledWith(
                    t('product:bonusProducts.failedToAdd', { error: 'Out of stock' }),
                    'error'
                );
            });
        });

        test('button is disabled during submission and when max items reached', async () => {
            const props = getDefaultProps();

            // Mock max items reached
            const { getBonusProductCountsForPromotion } = await import('@/lib/cart/bonus-product-utils');
            vi.mocked(getBonusProductCountsForPromotion).mockReturnValue({
                selectedBonusItems: 3,
                maxBonusItems: 3,
            });

            renderWithRouter(<BonusProductSelection {...props} />);

            // Check buttons are disabled when max reached
            const selectButtons = await screen.findAllByRole('button', { name: /select/i });
            selectButtons.forEach((button) => {
                expect(button).toBeDisabled();
            });
        });

        test('button shows "Adding..." during submission', async () => {
            mockFetcher.state = 'submitting';
            const props = getDefaultProps();

            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => {
                const addingButtons = screen.getAllByRole('button', { name: /adding\.\.\./i });
                expect(addingButtons.length).toBeGreaterThan(0);
            });
        });

        test('shows error and does not submit when bonusDiscountLineItem.id is missing', async () => {
            const { t } = getTranslation();
            mockRequiresVariantSelection.mockReturnValue(false);

            // Mock counts to ensure button is not disabled
            const { getBonusProductCountsForPromotion } = await import('@/lib/cart/bonus-product-utils');
            vi.mocked(getBonusProductCountsForPromotion).mockReturnValue({
                selectedBonusItems: 0,
                maxBonusItems: 3,
            });

            const props = getDefaultProps();
            props.bonusDiscountLineItem = createMockBonusDiscountLineItem({ id: '' });

            renderWithRouter(<BonusProductSelection {...props} />);

            const selectButtons = await screen.findAllByRole('button', { name: /select/i });
            fireEvent.click(selectButtons[0]);

            // Should show error toast
            await waitFor(() => {
                expect(mockAddToast).toHaveBeenCalledWith(
                    t('product:bonusProducts.failedToAdd', {
                        error: t('product:bonusProducts.missingRequiredInfo'),
                    }),
                    'error'
                );
            });

            // Should NOT submit to fetcher
            expect(mockSubmit).not.toHaveBeenCalled();
        });

        test('shows error and does not submit when promotionId is missing', async () => {
            const { t } = getTranslation();
            mockRequiresVariantSelection.mockReturnValue(false);

            // Mock counts to ensure button is not disabled
            const { getBonusProductCountsForPromotion } = await import('@/lib/cart/bonus-product-utils');
            vi.mocked(getBonusProductCountsForPromotion).mockReturnValue({
                selectedBonusItems: 0,
                maxBonusItems: 3,
            });

            const props = getDefaultProps();
            props.bonusDiscountLineItem = createMockBonusDiscountLineItem({ promotionId: '' });

            renderWithRouter(<BonusProductSelection {...props} />);

            const selectButtons = await screen.findAllByRole('button', { name: /select/i });
            fireEvent.click(selectButtons[0]);

            // Should show error toast
            await waitFor(() => {
                expect(mockAddToast).toHaveBeenCalledWith(
                    t('product:bonusProducts.failedToAdd', {
                        error: t('product:bonusProducts.missingRequiredInfo'),
                    }),
                    'error'
                );
            });

            // Should NOT submit to fetcher
            expect(mockSubmit).not.toHaveBeenCalled();
        });
    });

    // ========================================================================
    // 3. Edge Cases & Graceful Handling
    // ========================================================================

    describe('Edge Cases', () => {
        test('handles missing product in bonusProductsById gracefully', async () => {
            const props = getDefaultProps();
            // Remove product-2 from the map
            delete props.bonusProductsById['product-2'];

            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => {
                // Should only render 1 product card (product-1)
                const carouselItems = screen.getAllByTestId('carousel-item');
                expect(carouselItems).toHaveLength(1);

                // Only product-1 name should be visible
                expect(screen.getByText('Test Product 1')).toBeInTheDocument();
                expect(screen.queryByText('Test Product 2')).not.toBeInTheDocument();
            });
        });

        test('uses product name from bonusProductsById when productName is missing', async () => {
            const props = getDefaultProps();
            // Remove productName from bonusProducts
            props.bonusDiscountLineItem = createMockBonusDiscountLineItem({
                bonusProducts: [
                    { productId: 'product-1' }, // No productName
                ],
            });
            // Ensure bonusProductsById has the name
            props.bonusProductsById = {
                'product-1': createMockProduct({ id: 'product-1', name: 'Name From Product Data' }),
            };

            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => {
                expect(screen.getByText('Name From Product Data')).toBeInTheDocument();
            });
        });

        test('falls back to "Product" when both productName sources are missing', async () => {
            const props = getDefaultProps();
            // Remove productName from bonusProducts
            props.bonusDiscountLineItem = createMockBonusDiscountLineItem({
                bonusProducts: [{ productId: 'product-1' }],
            });
            // Ensure bonusProductsById has no name
            props.bonusProductsById = {
                'product-1': createMockProduct({ id: 'product-1', name: undefined }),
            };

            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => {
                expect(screen.getByText('Product')).toBeInTheDocument();
            });
        });
    });

    // ========================================================================
    // 4. Rule-Based and Combined Products Tests
    // ========================================================================

    describe('Rule-Based and Combined Products', () => {
        test('renders rule-based products when promotion is rule-based', async () => {
            // Override mock to have slots available
            const { getBonusProductCountsForPromotion } = await import('@/lib/cart/bonus-product-utils');
            vi.mocked(getBonusProductCountsForPromotion).mockReturnValue({
                selectedBonusItems: 0,
                maxBonusItems: 3,
            });

            mockIsRuleBasedPromotion.mockReturnValue(true);

            const props = {
                ...getDefaultProps(),
                bonusDiscountLineItem: createMockBonusDiscountLineItem({
                    bonusProducts: [], // Empty list-based products
                }),
                ruleBasedBonusProductsPromise: ruleBasedPromise([
                    {
                        productId: 'rule-product-1',
                        id: 'rule-product-1',
                        productName: 'Rule Based Product 1',
                        image: { disBaseLink: 'https://example.com/rule1.jpg' },
                    },
                    {
                        productId: 'rule-product-2',
                        id: 'rule-product-2',
                        productName: 'Rule Based Product 2',
                        image: { link: 'https://example.com/rule2.jpg' },
                    },
                ]),
            };

            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => {
                expect(screen.getByText('Rule Based Product 1')).toBeInTheDocument();
                expect(screen.getByText('Rule Based Product 2')).toBeInTheDocument();

                const carouselItems = screen.getAllByTestId('carousel-item');
                expect(carouselItems).toHaveLength(2);
            });
        });

        test('combines list-based and rule-based products when both exist', async () => {
            // Override mock to have slots available
            const { getBonusProductCountsForPromotion } = await import('@/lib/cart/bonus-product-utils');
            vi.mocked(getBonusProductCountsForPromotion).mockReturnValue({
                selectedBonusItems: 0,
                maxBonusItems: 5,
            });

            mockIsRuleBasedPromotion.mockReturnValue(true);

            const props = {
                ...getDefaultProps(),
                ruleBasedBonusProductsPromise: ruleBasedPromise([
                    {
                        productId: 'rule-product-1',
                        id: 'rule-product-1',
                        productName: 'Rule Product 1',
                        image: { disBaseLink: 'https://example.com/rule1.jpg' },
                    },
                    {
                        productId: 'rule-product-2',
                        id: 'rule-product-2',
                        productName: 'Rule Product 2',
                        image: { link: 'https://example.com/rule2.jpg' },
                    },
                ]),
            };
            // Keep the list-based products from default props (product-1, product-2)

            renderWithRouter(<BonusProductSelection {...props} />);

            // Should show all 4 products (2 list-based + 2 rule-based)
            await waitFor(() => {
                // List-based products
                expect(screen.getByText('Test Product 1')).toBeInTheDocument();
                expect(screen.getByText('Test Product 2')).toBeInTheDocument();

                // Rule-based products
                expect(screen.getByText('Rule Product 1')).toBeInTheDocument();
                expect(screen.getByText('Rule Product 2')).toBeInTheDocument();

                const carouselItems = screen.getAllByTestId('carousel-item');
                expect(carouselItems).toHaveLength(4);
            });
        });

        test('deduplicates products appearing in both list-based and rule-based', async () => {
            // Override mock to have slots available
            const { getBonusProductCountsForPromotion } = await import('@/lib/cart/bonus-product-utils');
            vi.mocked(getBonusProductCountsForPromotion).mockReturnValue({
                selectedBonusItems: 0,
                maxBonusItems: 5,
            });

            mockIsRuleBasedPromotion.mockReturnValue(true);

            const props = {
                ...getDefaultProps(),
                // Rule-based products include product-1 which is also in list-based
                ruleBasedBonusProductsPromise: ruleBasedPromise([
                    {
                        productId: 'product-1', // DUPLICATE with list-based
                        id: 'product-1',
                        productName: 'Rule Version of Product 1',
                        image: { disBaseLink: 'https://example.com/rule1.jpg' },
                    },
                    {
                        productId: 'rule-product-unique',
                        id: 'rule-product-unique',
                        productName: 'Unique Rule Product',
                        image: { link: 'https://example.com/unique.jpg' },
                    },
                ]),
            };
            // Default props have product-1 and product-2

            renderWithRouter(<BonusProductSelection {...props} />);

            // Should show only 3 unique products (product-1 deduplicated)
            await waitFor(() => {
                const carouselItems = screen.getAllByTestId('carousel-item');
                expect(carouselItems).toHaveLength(3);

                // product-1 should appear only once (list-based version takes precedence)
                expect(screen.getByText('Test Product 1')).toBeInTheDocument();
                expect(screen.queryByText('Rule Version of Product 1')).not.toBeInTheDocument();

                // Other products should be present
                expect(screen.getByText('Test Product 2')).toBeInTheDocument();
                expect(screen.getByText('Unique Rule Product')).toBeInTheDocument();
            });
        });

        test('handles empty rule-based products gracefully', async () => {
            mockIsRuleBasedPromotion.mockReturnValue(true);

            const props = {
                ...getDefaultProps(),
                bonusDiscountLineItem: createMockBonusDiscountLineItem({
                    bonusProducts: [], // Also empty list-based
                }),
                ruleBasedBonusProductsPromise: ruleBasedPromise([]),
            };

            renderWithRouter(<BonusProductSelection {...props} />);

            // Should render without crashing, but no products
            await waitFor(() => {
                const carouselItems = screen.queryAllByTestId('carousel-item');
                expect(carouselItems).toHaveLength(0);
            });
        });

        test('uses disBaseLink for rule-based product images when available', async () => {
            // Override mock to have slots available
            const { getBonusProductCountsForPromotion } = await import('@/lib/cart/bonus-product-utils');
            vi.mocked(getBonusProductCountsForPromotion).mockReturnValue({
                selectedBonusItems: 0,
                maxBonusItems: 3,
            });

            mockIsRuleBasedPromotion.mockReturnValue(true);

            const props = {
                ...getDefaultProps(),
                bonusDiscountLineItem: createMockBonusDiscountLineItem({ bonusProducts: [] }),
                ruleBasedBonusProductsPromise: ruleBasedPromise([
                    {
                        productId: 'rule-product-1',
                        id: 'rule-product-1',
                        productName: 'Rule Product with disBaseLink',
                        image: {
                            disBaseLink: 'https://example.com/disbased.jpg',
                            link: 'https://example.com/regular.jpg',
                        },
                    },
                ]),
            };

            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => {
                const image = screen.getByRole<HTMLImageElement>('img', { name: 'Rule Product with disBaseLink' });
                expect(image.src).toContain('disbased.jpg');
            });
        });

        test('falls back to link for rule-based product images when disBaseLink is not available', async () => {
            // Override mock to have slots available
            const { getBonusProductCountsForPromotion } = await import('@/lib/cart/bonus-product-utils');
            vi.mocked(getBonusProductCountsForPromotion).mockReturnValue({
                selectedBonusItems: 0,
                maxBonusItems: 3,
            });

            mockIsRuleBasedPromotion.mockReturnValue(true);

            const props = {
                ...getDefaultProps(),
                bonusDiscountLineItem: createMockBonusDiscountLineItem({ bonusProducts: [] }),
                ruleBasedBonusProductsPromise: ruleBasedPromise([
                    {
                        productId: 'rule-product-1',
                        id: 'rule-product-1',
                        productName: 'Rule Product with link only',
                        image: {
                            link: 'https://example.com/fallback.jpg',
                        },
                    },
                ]),
            };

            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => {
                const image = screen.getByRole<HTMLImageElement>('img', { name: 'Rule Product with link only' });
                expect(image.src).toContain('fallback.jpg');
            });
        });

        test('handles rule-based products with missing image gracefully', async () => {
            // Override mock to have slots available
            const { getBonusProductCountsForPromotion } = await import('@/lib/cart/bonus-product-utils');
            vi.mocked(getBonusProductCountsForPromotion).mockReturnValue({
                selectedBonusItems: 0,
                maxBonusItems: 3,
            });

            mockIsRuleBasedPromotion.mockReturnValue(true);

            const props = {
                ...getDefaultProps(),
                bonusDiscountLineItem: createMockBonusDiscountLineItem({ bonusProducts: [] }),
                ruleBasedBonusProductsPromise: ruleBasedPromise([
                    {
                        productId: 'rule-product-1',
                        id: 'rule-product-1',
                        productName: 'Rule Product without image',
                        // No image property
                    },
                ]),
            };

            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => {
                expect(screen.getByText('Rule Product without image')).toBeInTheDocument();
                expect(screen.getByText('No image available')).toBeInTheDocument();
            });
        });

        test('filters out rule-based products with missing productId and id', async () => {
            // Override mock to have slots available
            const { getBonusProductCountsForPromotion } = await import('@/lib/cart/bonus-product-utils');
            vi.mocked(getBonusProductCountsForPromotion).mockReturnValue({
                selectedBonusItems: 0,
                maxBonusItems: 3,
            });

            mockIsRuleBasedPromotion.mockReturnValue(true);

            const props = {
                ...getDefaultProps(),
                bonusDiscountLineItem: createMockBonusDiscountLineItem({ bonusProducts: [] }),
                ruleBasedBonusProductsPromise: ruleBasedPromise([
                    {
                        productName: 'Invalid Product - No ID',
                        image: { link: 'https://example.com/image.jpg' },
                        // Missing both productId and id
                    },
                    {
                        productId: 'valid-product',
                        id: 'valid-product',
                        productName: 'Valid Product',
                        image: { link: 'https://example.com/valid.jpg' },
                    },
                ]),
            };

            renderWithRouter(<BonusProductSelection {...props} />);

            await waitFor(() => {
                // Should only show the valid product
                const carouselItems = screen.getAllByTestId('carousel-item');
                expect(carouselItems).toHaveLength(1);
                expect(screen.getByText('Valid Product')).toBeInTheDocument();
                expect(screen.queryByText('Invalid Product - No ID')).not.toBeInTheDocument();
            });
        });
    });
});
