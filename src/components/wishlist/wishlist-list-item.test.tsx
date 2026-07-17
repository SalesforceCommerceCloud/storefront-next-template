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

import { useEffect } from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
// eslint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ShopperCustomers, ShopperProducts } from '@/scapi';
import { WishlistListItem } from './wishlist-list-item';
import { resourceRoutes } from '@/route-paths';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { masterProduct, variantProduct } from '@/components/__mocks__/master-variant-product';
import { standardProd } from '@/components/__mocks__/standard-product-2';
import { useProductActions } from '@/hooks/product/use-product-actions';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockLocale, mockSiteObject } from '@/test-utils/config';

const mockSite = mockSiteObject;

const { t } = getTranslation();

// Mock react-i18next
vi.mock('react-i18next', () => ({
    useTranslation: (namespace?: string | string[]) => ({
        t: (key: string, options?: Record<string, unknown>) => {
            const ns = Array.isArray(namespace) ? namespace[0] : namespace;
            if (ns && !key.includes(':')) {
                return t(`${ns}:${key}`, options);
            }
            return t(key, options);
        },
        i18n: { language: mockSiteObject.defaultLocale },
    }),
}));

// Mock useProductActions hook
const mockHandleAddToCart = vi.fn();
vi.mock('@/hooks/product/use-product-actions', () => ({
    useProductActions: vi.fn(),
}));

// Mock toast
const mockAddToast = vi.fn();
vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: mockAddToast,
    }),
}));

// Mock analytics
const mockTrackWishlistItemRemoved = vi.fn();
vi.mock('@/hooks/use-analytics', () => ({
    useAnalytics: () => ({
        trackWishlistItemRemoved: mockTrackWishlistItemRemoved,
    }),
}));

// Mock config
const mockGetConfig = vi.fn();
vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>();
    return {
        ...actual,
        useConfig: () => mockGetConfig(),
        getConfig: () => mockGetConfig(),
    };
});

// Mock ProductPrice to avoid its internal complexity
vi.mock('@/components/product-price', () => ({
    default: ({ product }: { product: ShopperProducts.schemas['Product'] }) => (
        <div data-testid="product-price">${product.price}</div>
    ),
}));

// Mock InventoryMessage to control in-stock / out-of-stock output
vi.mock('@/components/inventory-message', () => ({
    default: ({ product }: { product: ShopperProducts.schemas['Product'] }) => (
        <div data-testid="inventory-message">
            {product.inventory?.orderable ? t('product:inStock') : t('product:outOfStockLabel')}
        </div>
    ),
}));

// Tracks how many times the mocked modal has mounted/unmounted, so tests can assert the
// subtree is actually torn down on close rather than just visually hidden. A stuck-mounted
// modal keeps its SCAPI product/variant fetchers registered for revalidation, re-running load()
// on every context mutation for a modal the shopper dismissed.
const modalLifecycle = { mounts: 0, unmounts: 0 };

// Thin harness for CartItemModal — the real modal's behaviour (fetching, swatches, variant
// resolution) is covered by CartItemModal's own tests. Here we only need to observe the
// mount/unmount lifecycle via `data-testid="modal-mounted"` and drive close via onOpenChange.
vi.mock('@/components/cart-item-modal', () => ({
    CartItemModal: ({ open, onOpenChange }: { open: boolean; onOpenChange?: (open: boolean) => void }) => {
        useEffect(() => {
            modalLifecycle.mounts += 1;
            return () => {
                modalLifecycle.unmounts += 1;
            };
        }, []);
        return (
            <div data-testid="modal-mounted">
                {open ? (
                    <div role="dialog" aria-label="Select options">
                        <button type="button" onClick={() => onOpenChange?.(false)}>
                            Close
                        </button>
                    </div>
                ) : null}
            </div>
        );
    },
}));

// Mock basket providers
const mockSetMiniCartOpen = vi.fn();
const mockUpdateBasket = vi.fn();
vi.mock('@/providers/basket', () => ({
    useBasketUpdater: () => mockUpdateBasket,
}));

// use-product-actions opens the flyout via the mini-cart store; stub it so the test never mutates the shared module.
vi.mock('@/hooks/mini-cart-store', () => ({
    setMiniCartOpen: mockSetMiniCartOpen,
}));

// Default useFetcher mock
const mockSubmit = vi.fn();
const mockFetcher = {
    state: 'idle' as 'idle' | 'loading' | 'submitting',
    data: null as { success: boolean; error?: string; basket?: unknown } | null,
    submit: mockSubmit,
    load: vi.fn(),
    Form: ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement> & { children: React.ReactNode }) => (
        <form {...props}>{children}</form>
    ),
};

// Wishlist item pointing at the standard (non-variant) product
const defaultWishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
    id: 'item-123',
    productId: standardProd.id,
    priority: 0,
    public: false,
    quantity: 1,
};

// Wishlist item pointing at a specific variant of masterProduct
const variantWishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
    id: 'item-variant',
    productId: '640188017041M', // variant with variationValues: { color: 'CHARCWL', size: '040', width: 'S' }
    priority: 0,
    public: false,
    quantity: 1,
};

// Wishlist item pointing at the master product itself (no variant selected)
const masterWishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
    id: 'item-master',
    productId: masterProduct.id, // '25686395M' — not in the variants list
    priority: 0,
    public: false,
    quantity: 1,
};

function renderWithRouter(component: React.ReactElement) {
    const router = createMemoryRouter([
        {
            path: '/',
            element: (
                <SiteProvider
                    site={mockSite}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    {component}
                </SiteProvider>
            ),
        },
    ]);
    return render(<RouterProvider router={router} />);
}

describe('WishlistListItem', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        modalLifecycle.mounts = 0;
        modalLifecycle.unmounts = 0;
        mockGetConfig.mockReturnValue({
            commerce: {
                api: {
                    proxy: '/mobify/proxy/api',
                    organizationId: 'test-org',
                    siteId: 'test-site',
                },
            },
        });
        // Setup default fetcher for remove action (cart now uses useProductActions hook)
        vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue(mockFetcher as any);

        // Setup default useProductActions mock
        vi.mocked(useProductActions).mockReturnValue({
            handleAddToCart: mockHandleAddToCart,
            isAddingToOrUpdatingCart: false,
            canAddToCart: true, // Default to true for most tests
            isOrderable: true, // Default to orderable (in stock)
        } as any);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('rendering', () => {
        test('renders product name as a link', () => {
            renderWithRouter(
                <WishlistListItem product={standardProd} wishlistItem={defaultWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.getByText(standardProd.name as string)).toBeInTheDocument();
        });

        test('renders product price', () => {
            renderWithRouter(
                <WishlistListItem product={standardProd} wishlistItem={defaultWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.getByTestId('product-price')).toBeInTheDocument();
        });

        test('renders product image when image data is available', () => {
            renderWithRouter(
                <WishlistListItem product={standardProd} wishlistItem={defaultWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.getByRole('img')).toBeInTheDocument();
        });

        test('renders placeholder when product has no image groups', () => {
            const noImageProduct: ShopperProducts.schemas['Product'] = {
                id: 'no-image',
                name: 'No Image Product',
                price: 10,
                inventory: { ats: 1, orderable: true, id: 'inv' },
            };
            const wishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
                id: 'item-no-image',
                productId: 'no-image',
                priority: 0,
                public: false,
                quantity: 1,
            };

            renderWithRouter(
                <WishlistListItem product={noImageProduct} wishlistItem={wishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.queryByRole('img')).not.toBeInTheDocument();
            expect(screen.getByText('No Image Product')).toBeInTheDocument();
        });

        test('renders remove button', () => {
            renderWithRouter(
                <WishlistListItem product={standardProd} wishlistItem={defaultWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.getByRole('button', { name: t('product:removeFromWishlist') })).toBeInTheDocument();
        });

        test('renders inventory message', () => {
            renderWithRouter(
                <WishlistListItem product={standardProd} wishlistItem={defaultWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.getByTestId('inventory-message')).toBeInTheDocument();
        });
    });

    describe('inventory status', () => {
        test('shows in-stock label for orderable product', () => {
            renderWithRouter(
                <WishlistListItem product={standardProd} wishlistItem={defaultWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.getByTestId('inventory-message')).toHaveTextContent(t('product:inStock'));
        });

        test('shows out-of-stock label for non-orderable product', () => {
            const outOfStockProduct: ShopperProducts.schemas['Product'] = {
                ...standardProd,
                inventory: {
                    ats: 0,
                    backorderable: false,
                    id: 'inv',
                    orderable: false,
                    preorderable: false,
                    stockLevel: 0,
                },
            };
            const wishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
                ...defaultWishlistItem,
                productId: outOfStockProduct.id,
            };

            renderWithRouter(
                <WishlistListItem product={outOfStockProduct} wishlistItem={wishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.getByTestId('inventory-message')).toHaveTextContent(t('product:outOfStockLabel'));
        });
    });

    describe('variant attributes', () => {
        test('displays resolved attribute values for a specific variant', () => {
            // variant '640188017041M' has { color: 'CHARCWL', size: '040', width: 'S' }
            // resolved as { Color: 'Charcoal', Size: '40', Width: 'Short' }
            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={variantWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.getByText(/Color: Charcoal/)).toBeInTheDocument();
            expect(screen.getByText(/Size: 40/)).toBeInTheDocument();
            expect(screen.getByText(/Width: Short/)).toBeInTheDocument();
        });

        test('does not show variant attribute rows for a standard product without variants', () => {
            // standardProd has no variationAttributes
            renderWithRouter(
                <WishlistListItem product={standardProd} wishlistItem={defaultWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.queryByText(/Select/)).not.toBeInTheDocument();
        });

        test('displays "Select" placeholder for each attribute when master product is saved', () => {
            // masterWishlistItem.productId === masterProduct.id — not a variant ID
            // so needsVariantSelection === true, showing placeholders for Color, Size, Width
            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={masterWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.getByText(`Color: ${t('product:selectVariantPlaceholder')}`)).toBeInTheDocument();
            expect(screen.getByText(`Size: ${t('product:selectVariantPlaceholder')}`)).toBeInTheDocument();
            expect(screen.getByText(`Width: ${t('product:selectVariantPlaceholder')}`)).toBeInTheDocument();
        });

        test('displays resolved attribute values when SCAPI returns a variant product (type.variant = true)', () => {
            // When SCAPI returns a variant product directly (type.variant = true), the user
            // explicitly chose and saved that specific variant — show its resolved attributes.
            const wishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
                id: 'item-variant-product',
                productId: variantProduct.id, // '640188017041M', type.variant = true
                priority: 0,
                public: false,
                quantity: 1,
            };

            renderWithRouter(
                <WishlistListItem product={variantProduct} wishlistItem={wishlistItem} onRemove={vi.fn()} />
            );

            // Should show resolved attribute values from the variant product's variationValues
            expect(screen.getByText(/Color: Charcoal/)).toBeInTheDocument();
            // Should NOT show "Select" placeholders
            expect(screen.queryByText(`Color: ${t('product:selectVariantPlaceholder')}`)).not.toBeInTheDocument();
        });
    });

    describe('remove action', () => {
        test('submits remove action when remove button is clicked', () => {
            renderWithRouter(
                <WishlistListItem product={standardProd} wishlistItem={defaultWishlistItem} onRemove={vi.fn()} />
            );

            fireEvent.click(screen.getByRole('button', { name: t('product:removeFromWishlist') }));

            expect(mockSubmit).toHaveBeenCalledWith(
                { itemId: 'item-123' },
                { method: 'POST', action: resourceRoutes.wishlistRemove }
            );
        });

        test('calls onRemove and shows success toast when remove succeeds', async () => {
            const onRemove = vi.fn();
            // Remove fetcher returns success
            vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue({
                ...mockFetcher,
                state: 'idle',
                data: { success: true },
            } as any);

            renderWithRouter(
                <WishlistListItem product={standardProd} wishlistItem={defaultWishlistItem} onRemove={onRemove} />
            );

            await waitFor(() => {
                expect(onRemove).toHaveBeenCalledWith('item-123');
                expect(mockAddToast).toHaveBeenCalledWith(t('product:removedFromWishlist'), 'success');
            });
        });

        test('shows translated error toast when remove fails with an error', async () => {
            vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue({
                ...mockFetcher,
                state: 'idle',
                data: { success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } },
            } as any);

            renderWithRouter(
                <WishlistListItem product={standardProd} wishlistItem={defaultWishlistItem} onRemove={vi.fn()} />
            );

            await waitFor(() => {
                expect(mockAddToast).toHaveBeenCalledWith(t('product:failedToRemoveFromWishlist'), 'error');
            });
        });

        test('shows fallback error toast when remove fails without a message', async () => {
            vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue({
                ...mockFetcher,
                state: 'idle',
                data: { success: false },
            } as any);

            renderWithRouter(
                <WishlistListItem product={standardProd} wishlistItem={defaultWishlistItem} onRemove={vi.fn()} />
            );

            await waitFor(() => {
                expect(mockAddToast).toHaveBeenCalledWith(t('product:failedToRemoveFromWishlist'), 'error');
            });
        });

        test('remove button is disabled while fetcher is submitting', () => {
            vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue({
                ...mockFetcher,
                state: 'submitting',
                data: null,
            } as any);

            renderWithRouter(
                <WishlistListItem product={standardProd} wishlistItem={defaultWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.getByRole('button', { name: t('product:removeFromWishlist') })).toBeDisabled();
        });
    });

    describe('add to cart button', () => {
        test('renders "Add to Cart" button for items with specific variant selected', () => {
            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={variantWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.getByRole('button', { name: t('product:addToCart') })).toBeInTheDocument();
        });

        test('does not render "Add to Cart" button for master product without variant selection', () => {
            vi.mocked(useProductActions).mockReturnValue({
                handleAddToCart: mockHandleAddToCart,
                isAddingToOrUpdatingCart: false,
                canAddToCart: false, // Master without variant cannot add to cart
                isOrderable: true, // Orderability irrelevant when no variant selected
            } as any);

            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={masterWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.queryByRole('button', { name: t('product:addToCart') })).not.toBeInTheDocument();
        });

        test('disabled "Add to Cart" surfaces "Price unavailable" via aria-describedby + title', () => {
            // Regression: when canAddToCart is false (e.g. no price for the active currency),
            // the button shouldn't be a silent grey — assistive tech and hover users must see why.
            vi.mocked(useProductActions).mockReturnValue({
                handleAddToCart: mockHandleAddToCart,
                isAddingToOrUpdatingCart: false,
                canAddToCart: false,
                isOrderable: true,
            } as any);

            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={variantWishlistItem} onRemove={vi.fn()} />
            );

            const btn = screen.getByRole('button', { name: t('product:addToCart') });
            expect(btn).toBeDisabled();
            expect(btn).toHaveAttribute('title', t('product:price.unavailable'));
            const describedBy = btn.getAttribute('aria-describedby');
            expect(describedBy).toBeTruthy();
            expect(document.getElementById(describedBy as string)).toHaveTextContent(t('product:price.unavailable'));
        });

        test('passes the saved variant (not master) to ProductPrice when the variant has no price for the active currency', () => {
            // Regression: the wishlist row used to always pass the master to <ProductPrice>, so a
            // saved variant that lost its price for the active currency would render the
            // master's lowest-priced fallback ("$X") right next to a disabled "Price unavailable"
            // CTA — display and gate disagreed. When the saved variant is the unpriced one, send
            // it to ProductPrice directly so the price area resolves to "Price unavailable" and
            // matches the gate.
            const unpricedVariant = (masterProduct.variants ?? []).find((v) => v.productId === '640188017041M');
            const masterWithUnpricedSavedVariant = {
                ...masterProduct,
                variants: (masterProduct.variants ?? []).map((v) =>
                    v.productId === '640188017041M' ? { ...v, price: undefined } : v
                ),
            };

            renderWithRouter(
                <WishlistListItem
                    product={masterWithUnpricedSavedVariant}
                    wishlistItem={variantWishlistItem}
                    onRemove={vi.fn()}
                />
            );

            // Sanity: the saved variant's price really is undefined in this fixture.
            expect(unpricedVariant).toBeDefined();
            // The master has a numeric `price`; the saved variant has none. If the master had been
            // passed (the buggy behavior), `${product.price}` would render `$<number>`. With the
            // unpriced variant passed instead, the rendered text is just `$` — proving the
            // variant (not the master) reached <ProductPrice> and matches what the gate sees.
            expect(screen.getByTestId('product-price')).toHaveTextContent(/^\$$/);
        });

        test('still passes the master to ProductPrice when the saved variant IS priced (preserves promo/range)', () => {
            // When the saved variant has a price, keep passing the master so PromoCallout and
            // range logic continue to work — variants don't carry productPromotions on getProduct.
            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={variantWishlistItem} onRemove={vi.fn()} />
            );

            // The mock renders `${product.price}`. The master's price reaches the element.
            const expected = `$${masterProduct.price ?? ''}`;
            expect(screen.getByTestId('product-price')).toHaveTextContent(expected);
        });

        test('submits add to cart action when button is clicked', () => {
            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={variantWishlistItem} onRemove={vi.fn()} />
            );

            fireEvent.click(screen.getByRole('button', { name: t('product:addToCart') }));

            expect(mockHandleAddToCart).toHaveBeenCalled();
        });

        test('calls handleAddToCart from useProductActions hook', () => {
            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={variantWishlistItem} onRemove={vi.fn()} />
            );

            fireEvent.click(screen.getByRole('button', { name: t('product:addToCart') }));

            expect(mockHandleAddToCart).toHaveBeenCalled();
        });

        test('useProductActions hook handles errors internally', () => {
            // The hook is responsible for error handling (toasts, basket updates, etc.)
            // This test just verifies the component uses the hook correctly
            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={variantWishlistItem} onRemove={vi.fn()} />
            );

            expect(useProductActions).toHaveBeenCalledWith({
                product: masterProduct,
                currentVariant: expect.objectContaining({ productId: '640188017041M' }),
                initialQuantity: 1,
                skipInventoryValidation: true,
            });
        });

        test('useProductActions receives a defined currentVariant with correct price and variationValues for a variant-type product (type.variant = true)', () => {
            // When SCAPI returns a variant product directly (product.type.variant = true),
            // currentVariant must be defined (so the skipInventoryValidation branch allows
            // add-to-cart) and carry the correct price and variationValues from the product.
            // We use objectContaining so the assertion covers the fields that drive observable
            // behavior without being sensitive to the exact shape of the currentVariant object.
            const wishlistItem: ShopperCustomers.schemas['CustomerProductListItem'] = {
                id: 'item-variant-product',
                productId: variantProduct.id, // '640188017041M', type.variant = true
                priority: 0,
                public: false,
                quantity: 1,
            };

            renderWithRouter(
                <WishlistListItem product={variantProduct} wishlistItem={wishlistItem} onRemove={vi.fn()} />
            );

            expect(useProductActions).toHaveBeenCalledWith({
                product: variantProduct,
                currentVariant: expect.objectContaining({
                    price: variantProduct.price,
                    variationValues: variantProduct.variationValues,
                }),
                initialQuantity: 1,
                skipInventoryValidation: true,
            });
        });

        test('"Add to Cart" button is disabled while adding to cart', () => {
            vi.mocked(useProductActions).mockReturnValue({
                handleAddToCart: mockHandleAddToCart,
                isAddingToOrUpdatingCart: true,
                canAddToCart: true,
                isOrderable: true,
            } as any);

            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={variantWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.getByRole('button', { name: t('product:addingToCart') })).toBeDisabled();
        });
    });

    describe('out of stock button', () => {
        test('renders disabled "Out of stock" button for a specific variant that is not orderable', () => {
            // Specific variant resolved but inventory reports not orderable → OOS button takes
            // precedence over Add to Cart. Button is rendered but disabled (matches PDP behavior).
            vi.mocked(useProductActions).mockReturnValue({
                handleAddToCart: mockHandleAddToCart,
                isAddingToOrUpdatingCart: false,
                canAddToCart: false,
                isOrderable: false,
            } as any);

            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={variantWishlistItem} onRemove={vi.fn()} />
            );

            const oosButton = screen.getByRole('button', { name: t('product:outOfStockLabel') });
            expect(oosButton).toBeInTheDocument();
            expect(oosButton).toBeDisabled();
            // Add to Cart must not render when we're in the OOS state
            expect(screen.queryByRole('button', { name: t('product:addToCart') })).not.toBeInTheDocument();
        });

        test('does not render "Out of stock" button when master product has no variant resolved', () => {
            // Master without a resolved variant should fall through to "Select Options",
            // not show OOS — we don't know orderability until a variant is chosen.
            vi.mocked(useProductActions).mockReturnValue({
                handleAddToCart: mockHandleAddToCart,
                isAddingToOrUpdatingCart: false,
                canAddToCart: false,
                isOrderable: false,
            } as any);

            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={masterWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.queryByRole('button', { name: t('product:outOfStockLabel') })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: t('product:selectOptions') })).toBeInTheDocument();
        });
    });

    describe('select options button', () => {
        test('renders "Select Options" button for master product without variant selection', () => {
            vi.mocked(useProductActions).mockReturnValue({
                handleAddToCart: mockHandleAddToCart,
                isAddingToOrUpdatingCart: false,
                canAddToCart: false, // Master without variant cannot add to cart
                isOrderable: true, // Orderability irrelevant when no variant selected
            } as any);

            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={masterWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.getByRole('button', { name: t('product:selectOptions') })).toBeInTheDocument();
        });

        test('"Select Options" button opens the variant-selection modal (not a PDP link)', () => {
            // The button now triggers an in-page CartItemModal rather than navigating to the PDP.
            // We only assert that clicking the button does not produce link-navigation semantics
            // (no href) and that the button is enabled — the modal's internals are covered by
            // CartItemModal's own tests.
            vi.mocked(useProductActions).mockReturnValue({
                handleAddToCart: mockHandleAddToCart,
                isAddingToOrUpdatingCart: false,
                canAddToCart: false,
                isOrderable: true,
            } as any);

            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={masterWishlistItem} onRemove={vi.fn()} />
            );

            const button = screen.getByRole('button', { name: t('product:selectOptions') });
            expect(button).toBeEnabled();
            expect(button).not.toHaveAttribute('href');
            // Clicking should not throw and should keep the user on the wishlist page
            fireEvent.click(button);
            expect(button).toBeInTheDocument();
        });

        test('does not render "Select Options" button when specific variant is selected', () => {
            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={variantWishlistItem} onRemove={vi.fn()} />
            );

            expect(screen.queryByRole('button', { name: t('product:selectOptions') })).not.toBeInTheDocument();
        });

        test('does not mount the modal subtree until "Select Options" is clicked', () => {
            vi.mocked(useProductActions).mockReturnValue({
                handleAddToCart: mockHandleAddToCart,
                isAddingToOrUpdatingCart: false,
                canAddToCart: false,
                isOrderable: true,
            } as any);

            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={masterWishlistItem} onRemove={vi.fn()} />
            );

            // Modal (and its SCAPI product/variant fetchers) must not exist before first open.
            expect(screen.queryByTestId('modal-mounted')).not.toBeInTheDocument();
            expect(modalLifecycle.mounts).toBe(0);
        });

        // Uses fireEvent (not userEvent) so fake timers stay in control — userEvent's internal
        // real-timer waits would deadlock against vi.useFakeTimers().
        test('unmounts the modal subtree after close so its fetchers deregister', () => {
            vi.useFakeTimers();
            vi.mocked(useProductActions).mockReturnValue({
                handleAddToCart: mockHandleAddToCart,
                isAddingToOrUpdatingCart: false,
                canAddToCart: false,
                isOrderable: true,
            } as any);

            renderWithRouter(
                <WishlistListItem product={masterProduct} wishlistItem={masterWishlistItem} onRemove={vi.fn()} />
            );

            fireEvent.click(screen.getByRole('button', { name: t('product:selectOptions') }));
            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(modalLifecycle.mounts).toBe(1);
            expect(modalLifecycle.unmounts).toBe(0);

            // Closing via the dialog's own control (backdrop/Esc/X) must eventually tear the
            // subtree down — not merely hide it — so useScapiFetcher's unmount cleanup fires.
            fireEvent.click(screen.getByRole('button', { name: /Close/i }));

            // Still mounted through the 200ms exit animation so it can finish playing.
            act(() => {
                vi.advanceTimersByTime(200);
            });
            expect(modalLifecycle.unmounts).toBe(0);

            // Unmounts once the keep-alive delay (which outlasts the animation) elapses.
            act(() => {
                vi.advanceTimersByTime(50);
            });
            expect(modalLifecycle.unmounts).toBe(1);
            expect(screen.queryByTestId('modal-mounted')).not.toBeInTheDocument();
        });
    });
});
