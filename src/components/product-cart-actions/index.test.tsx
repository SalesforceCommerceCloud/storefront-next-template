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

// Testing libraries
import { type ComponentProps } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
// React Router
import { createMemoryRouter, RouterProvider } from 'react-router';
// Components
import ProductCartActions from './index';
import ProductViewProvider from '@/providers/product-view';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
// mock data
import { masterProduct } from '@/components/__mocks__/master-variant-product';
import { standardProd } from '@/components/__mocks__/standard-product-2';
import { bundleProd } from '@/components/__mocks__/bundle-product';
import { mockBuildConfig } from '@/test-utils/config';
import type { AppConfig } from '@/types/config';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

// Create a default config object for tests
const defaultTestConfig: AppConfig = {
    ...mockBuildConfig.app,
    features: {
        ...mockBuildConfig.app.features,
        passwordlessLogin: {
            callbackUri: '/passwordless-login-callback',
            landingUri: '/passwordless-login-landing',
            mode: 'email' as const,
        },
        socialLogin: { enabled: true, callbackUri: '/social-callback', providers: ['Apple', 'Google'] },
        socialShare: { enabled: true, providers: ['Twitter', 'Facebook', 'LinkedIn', 'Email'] },
        guestCheckout: true,
    },
};

// Mock useToast
const mockAddToast = vi.fn();
vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: mockAddToast,
    }),
}));

// Mock navigator.clipboard
const mockWriteText = vi.fn();
Object.assign(navigator, {
    clipboard: {
        writeText: mockWriteText,
    },
});

// Mock navigator.share
const mockShare = vi.fn();
Object.defineProperty(navigator, 'share', {
    writable: true,
    value: mockShare,
});

// Mock window.open
const mockWindowOpen = vi.fn();
window.open = mockWindowOpen;

// Mock window.location for ShareButton with getter
let mockLocationHref = 'http://localhost:5173/product/test-product-id';
Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: {
        get href() {
            return mockLocationHref;
        },
        set href(value: string) {
            mockLocationHref = value;
        },
    },
});

// see https://vitest.dev/api/vi.html#mock-modules
// Mock the useProductActions hook - use vi.hoisted to ensure proper hoisting
const { mockHandleAddToCart, mockHandleUpdateCart, mockHandleAddToWishlist } = vi.hoisted(() => {
    return {
        mockHandleAddToCart: vi.fn(),
        mockHandleUpdateCart: vi.fn(),
        mockHandleAddToWishlist: vi.fn(),
    };
});

vi.mock('@/hooks/product/use-product-actions', async () => {
    const actual = await vi.importActual<typeof import('@/hooks/product/use-product-actions')>(
        '@/hooks/product/use-product-actions'
    );
    return {
        useProductActions: vi.fn((props) => {
            const result = actual.useProductActions(props);
            return {
                ...result,
                handleAddToCart: mockHandleAddToCart,
                handleUpdateCart: mockHandleUpdateCart,
                handleAddToWishlist: mockHandleAddToWishlist,
            };
        }),
    };
});

const renderProductCartActions = (props: ComponentProps<typeof ProductCartActions>, mode: 'add' | 'edit' = 'add') => {
    const productId = props.product.id;
    const initialUrl = `/product/${productId}`;
    // Using createMemoryRouter in framework mode is fine
    // because both framework and data routers share the same underlying architecture,
    // so it provides a valid navigation context for hooks and <Link>.
    // Even though it's listed under "data routers," it fully supports testing non-route components that rely on router behavior.
    const router = createMemoryRouter(
        [
            {
                path: '/product/:productId',
                element: (
                    <AllProvidersWrapper config={defaultTestConfig}>
                        <ProductViewProvider product={props.product} mode={mode}>
                            <ProductCartActions {...props} />
                        </ProductViewProvider>
                    </AllProvidersWrapper>
                ),
            },
        ],
        {
            initialEntries: [initialUrl],
        }
    );
    return {
        ...render(<RouterProvider router={router} />),
        router,
    };
};

describe('ProductCartActions', () => {
    const { t } = getTranslation();

    beforeEach(() => {
        vi.clearAllMocks();
        mockWriteText.mockResolvedValue(undefined);
        mockShare.mockResolvedValue(undefined);
        mockWindowOpen.mockClear();
    });

    describe('when shopping for a product', () => {
        test('add to cart button is rendered', () => {
            renderProductCartActions({ product: standardProd });

            // User should see a button to add the product to cart
            expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument();
        });

        test('add to cart button is disabled on out of stock item', () => {
            const outOfStockProduct = {
                ...standardProd,
                inventory: { ats: 0, orderable: false, id: 'test-inventory' },
            };
            renderProductCartActions({ product: outOfStockProduct });

            // Add to cart button should be disabled when product is out of stock
            expect(screen.getByRole('button', { name: /add to cart/i })).toBeDisabled();
        });

        test('select variant options msg is rendered on firs load item when variations are not selected', () => {
            renderProductCartActions({ product: masterProduct });

            // User should see a message prompting them to select all options
            expect(screen.getByText(t('product:selectAllOptions'))).toBeInTheDocument();
        });

        test('product bundles do not show parent add to cart button', () => {
            renderProductCartActions({ product: bundleProd });

            // Bundles are added as a complete group, so parent doesn't have individual button
            expect(screen.queryByRole('button', { name: /^add to cart$/i })).not.toBeInTheDocument();
        });
    });

    describe('when editing cart item', () => {
        test('user can  see update cart button', () => {
            renderProductCartActions({ product: standardProd }, 'edit');

            // User should see a button to update the cart item
            expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
        });

        test('wishlist button is not shown when editing', () => {
            renderProductCartActions({ product: standardProd }, 'edit');

            // Wishlist is not relevant when editing existing cart items
            expect(screen.queryByRole('button', { name: /wishlist/i })).not.toBeInTheDocument();
        });

        test('share button is not shown when editing', () => {
            renderProductCartActions({ product: standardProd }, 'edit');

            // Share button is not shown when editing existing cart items
            expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument();
        });
    });

    describe('user interactions', () => {
        test('clicking add to cart button calls handleAddToCart', async () => {
            const user = userEvent.setup();
            renderProductCartActions({ product: standardProd });

            const addToCartButton = screen.getByRole('button', { name: /add to cart/i });

            // Button should be clickable
            expect(addToCartButton).toBeEnabled();
            await user.click(addToCartButton);

            // handleAddToCart should be called
            expect(mockHandleAddToCart).toHaveBeenCalledOnce();
        });
    });

    describe('compact add mode (onBuyNow prop)', () => {
        test('renders "Add to Cart" and "Buy It Now" buttons side by side when onBuyNow is provided', () => {
            const onBuyNow = vi.fn();
            renderProductCartActions({ product: standardProd, onBuyNow });

            expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: t('product:buyItNow') })).toBeInTheDocument();
        });

        test('hides express payments and BNPL in compact add mode', () => {
            const onBuyNow = vi.fn();
            renderProductCartActions({ product: standardProd, onBuyNow });

            // In compact mode, we show a simple two-button layout
            expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: t('product:buyItNow') })).toBeInTheDocument();
        });

        test('calls onBuyNow when "Buy It Now" is clicked', async () => {
            const user = userEvent.setup();
            const onBuyNow = vi.fn();
            renderProductCartActions({ product: standardProd, onBuyNow });

            await user.click(screen.getByRole('button', { name: t('product:buyItNow') }));

            expect(onBuyNow).toHaveBeenCalledOnce();
        });

        test('"Buy It Now" button is disabled when product cannot be added to cart', () => {
            const outOfStockProduct = {
                ...standardProd,
                inventory: { ats: 0, orderable: false, id: 'test-inventory' },
            };
            const onBuyNow = vi.fn();
            renderProductCartActions({ product: outOfStockProduct, onBuyNow });

            expect(screen.getByRole('button', { name: t('product:buyItNow') })).toBeDisabled();
        });

        test('standard add mode does not show Buy It Now button when onBuyNow is not provided', () => {
            renderProductCartActions({ product: standardProd });

            expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: t('product:buyItNow') })).not.toBeInTheDocument();
        });
    });

    describe('pending action execution', () => {
        test('executes pending wishlist action when URL has matching params', async () => {
            const mockOnBeforeAddToWishlist = vi.fn();
            const mockOnAddToWishlistSuccess = vi.fn();
            const productId = (standardProd.productId as string) || standardProd.id;

            const router = createMemoryRouter(
                [
                    {
                        path: '/product/:productId',
                        element: (
                            <AllProvidersWrapper config={defaultTestConfig}>
                                <ProductViewProvider product={standardProd}>
                                    <ProductCartActions
                                        product={standardProd}
                                        onBeforeAddToWishlist={mockOnBeforeAddToWishlist}
                                        onAddToWishlistSuccess={mockOnAddToWishlistSuccess}
                                    />
                                </ProductViewProvider>
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                {
                    initialEntries: [
                        `/product/${productId}?action=addToWishlist&actionParams=${encodeURIComponent(JSON.stringify({ productId }))}`,
                    ],
                }
            );

            render(<RouterProvider router={router} />);

            await waitFor(
                () => {
                    expect(mockOnBeforeAddToWishlist).toHaveBeenCalled();
                    expect(mockHandleAddToWishlist).toHaveBeenCalled();
                },
                { timeout: 3000 }
            );
        });

        test('does not execute pending action when productId does not match', async () => {
            const mockOnBeforeAddToWishlist = vi.fn();
            const productId = (standardProd.productId as string) || standardProd.id;
            const differentProductId = 'different-product-id';

            const router = createMemoryRouter(
                [
                    {
                        path: '/product/:productId',
                        element: (
                            <AllProvidersWrapper config={defaultTestConfig}>
                                <ProductViewProvider product={standardProd}>
                                    <ProductCartActions
                                        product={standardProd}
                                        onBeforeAddToWishlist={mockOnBeforeAddToWishlist}
                                    />
                                </ProductViewProvider>
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                {
                    initialEntries: [
                        `/product/${productId}?action=addToWishlist&actionParams=${encodeURIComponent(JSON.stringify({ productId: differentProductId }))}`,
                    ],
                }
            );

            render(<RouterProvider router={router} />);

            // Wait a bit to ensure action doesn't execute
            await new Promise((resolve) => setTimeout(resolve, 500));

            expect(mockOnBeforeAddToWishlist).not.toHaveBeenCalled();
            expect(mockHandleAddToWishlist).not.toHaveBeenCalled();
        });

        test('executes pending wishlist action asynchronously', async () => {
            const productId = (standardProd.productId as string) || standardProd.id;

            // Mock handleAddToWishlist to be async and take some time
            mockHandleAddToWishlist.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

            const router = createMemoryRouter(
                [
                    {
                        path: '/product/:productId',
                        element: (
                            <AllProvidersWrapper config={defaultTestConfig}>
                                <ProductViewProvider product={standardProd}>
                                    <ProductCartActions product={standardProd} />
                                </ProductViewProvider>
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                {
                    initialEntries: [
                        `/product/${productId}?action=addToWishlist&actionParams=${encodeURIComponent(JSON.stringify({ productId }))}`,
                    ],
                }
            );

            render(<RouterProvider router={router} />);

            // Verify the action is executed
            await waitFor(
                () => {
                    expect(mockHandleAddToWishlist).toHaveBeenCalled();
                },
                { timeout: 2000 }
            );
        });
    });
});
