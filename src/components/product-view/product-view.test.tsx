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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
// React Router
import { createMemoryRouter, RouterProvider } from 'react-router';
// Components
import ProductView from './product-view';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
// mock data
import { masterProduct as mockProduct } from '@/components/__mocks__/master-variant-product';
import { standardProd } from '@/components/__mocks__/standard-product-2';
import { bundleProd } from '@/components/__mocks__/bundle-product';
import { setProduct } from '@/components/__mocks__/set-product';
import { mockAltSiteObject, mockBuildConfig } from '@/test-utils/config';
import type { AppConfig } from '@/types/config';

// Prop-capture mock for <ImageGallery>. The PDP intentionally does not pass `widths` so the
// gallery's documented PDP-shaped defaults apply — we assert that absence below. The mock still
// renders a real <img> with the productName alt so existing assertions like
// `getAllByRole('img', { name: /<product-name>/i })` keep matching. Uses a 1x1 transparent GIF
// data URI to avoid the React empty-`src` warning.
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const capturedImageGalleryProps: { last: any } = { last: null };
vi.mock('@/components/image-gallery', () => ({
    default: (props: any) => {
        capturedImageGalleryProps.last = props;
        return <img alt={props.productName ?? ''} src={TRANSPARENT_PIXEL} data-testid="image-gallery" />;
    },
}));

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
// oxlint-disable-next-line @typescript-eslint/unbound-method -- test fixture
const originalShare = navigator.share;

// Mock window.open
const mockWindowOpen = vi.fn();
window.open = mockWindowOpen;

// Module-level setup and cleanup for navigator.share to prevent test pollution
beforeEach(() => {
    Object.defineProperty(navigator, 'share', {
        writable: true,
        configurable: true,
        value: mockShare,
    });
});

afterEach(() => {
    Object.defineProperty(navigator, 'share', {
        writable: true,
        configurable: true,
        value: originalShare,
    });
    mockShare.mockClear();
});

const renderProductView = (props: React.ComponentProps<typeof ProductView>, initialUrl = '/product/test-product') => {
    // Using createMemoryRouter in framework mode is fine
    // because both framework and data routers share the same underlying architecture, so it provides a valid navigation context for hooks and <Link>.
    // Even though it's listed under "data routers," it fully supports testing non-route components that rely on router behavior.
    const router = createMemoryRouter(
        [
            {
                path: '/product/:productId',
                element: (
                    <AllProvidersWrapper>
                        <ProductView {...props} />
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

describe('ProductView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        capturedImageGalleryProps.last = null;
        mockWriteText.mockResolvedValue(undefined);
        mockShare.mockResolvedValue(undefined);
        mockWindowOpen.mockClear();
    });

    describe('basic rendering', () => {
        test('should render product properly', () => {
            renderProductView({ product: mockProduct });

            // Product name should be visible
            expect(screen.getByText('Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit')).toBeInTheDocument();

            // Image gallery should be present
            expect(
                screen.getAllByRole('img', { name: /Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit/i })[0]
            ).toBeInTheDocument();

            // Price should be visible (single price or range depending on context)
            expect(screen.getAllByText((content) => content.includes('$299.99')).length).toBeGreaterThanOrEqual(1);

            // Swatches should be visible
            expect(screen.getByLabelText('Charcoal')).toBeInTheDocument();
            expect(screen.getByLabelText('36')).toBeInTheDocument();
            expect(screen.getByLabelText('Short')).toBeInTheDocument();

            // Quantity picker should be visible
            expect(screen.getAllByLabelText(/quantity/i)[0]).toBeInTheDocument();

            // Cart action buttons should be visible
            expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /add to wishlist/i })).toBeInTheDocument();
            // Share button should be visible
            expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument();
        });
    });

    describe('product types', () => {
        test('should render correctly for standard product', () => {
            renderProductView({ product: standardProd });

            // Should render product name
            expect(screen.getByText('Laptop Briefcase with wheels (37L)')).toBeInTheDocument();

            // Should have quantity picker text and aria-label
            expect(screen.getAllByLabelText(/quantity/i)[0]).toBeInTheDocument();

            // Should NOT have variation swatches (no radiogroups for color/size selection)
            // Note: DeliveryOptions component may render a radiogroup for delivery options
            const radiogroups = screen.queryAllByRole('radiogroup');
            const variationRadiogroups = radiogroups.filter(
                (radio) => !radio.getAttribute('data-testid')?.includes('delivery-option')
            );
            expect(variationRadiogroups).toHaveLength(0);
        });

        test('should render correctly for bundle product', () => {
            renderProductView({ product: bundleProd });

            // Should render product name
            expect(screen.getByText('Turquoise Jewelry Bundle')).toBeInTheDocument();

            // Bundles do NOT have quantity picker at the parent level
            expect(screen.queryByLabelText(/quantity/i)).not.toBeInTheDocument();

            // Should show bundle notice message
            expect(screen.getByText(/this is a product bundle/i)).toBeInTheDocument();
        });

        test('should render correctly for set product', () => {
            renderProductView({ product: setProduct });

            // Should render product name
            expect(screen.getByText('Winter Look')).toBeInTheDocument();

            // Sets do NOT have quantity picker at the parent level
            expect(screen.queryByLabelText(/quantity/i)).not.toBeInTheDocument();

            // Should show set notice message
            expect(screen.getByText(/this is a product set/i)).toBeInTheDocument();
        });
    });

    describe('Performance and Optimization', () => {
        test('renders efficiently with complex product data', () => {
            renderProductView({ product: mockProduct });

            // Should render all major components without errors
            expect(screen.getByText('Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit')).toBeInTheDocument();
            expect(screen.getAllByText((content) => content.includes('$299.99')).length).toBeGreaterThanOrEqual(1);
            expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        test('handles product without images gracefully', () => {
            const productWithoutImages = {
                ...mockProduct,
                imageGroups: [],
            };

            renderProductView({ product: productWithoutImages });

            // Should still render the product name
            expect(screen.getByText('Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit')).toBeInTheDocument();
        });

        test('handles product without variations gracefully', () => {
            const productWithoutVariations = {
                ...standardProd,
                variationAttributes: [],
            };

            renderProductView({ product: productWithoutVariations });

            // Should render product name
            expect(screen.getByText('Laptop Briefcase with wheels (37L)')).toBeInTheDocument();

            // Should not have variation swatches
            const radiogroups = screen.queryAllByRole('radiogroup');
            const variationRadiogroups = radiogroups.filter(
                (radio) => !radio.getAttribute('data-testid')?.includes('delivery-option')
            );
            expect(variationRadiogroups).toHaveLength(0);
        });

        test('handles product with minimal data', () => {
            const minimalProduct = {
                id: 'minimal-product',
                name: 'Minimal Product',
                price: 99.99,
                currency: mockAltSiteObject.defaultCurrency,
                imageGroups: [],
                variationAttributes: [],
            } as any;

            renderProductView({ product: minimalProduct });

            // Should render basic product information
            expect(screen.getByText('Minimal Product')).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        test('maintains proper ARIA attributes', () => {
            renderProductView({ product: mockProduct });

            // Check for proper form labels
            expect(screen.getAllByLabelText(/quantity/i)[0]).toBeInTheDocument();

            // Check for proper button labels
            expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /add to wishlist/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument();
        });
    });

    describe('Component Integration', () => {
        test('integrates with ProductViewProvider correctly', () => {
            renderProductView({ product: mockProduct });

            // Should render all product components
            expect(screen.getByText('Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit')).toBeInTheDocument();
            expect(screen.getAllByText((content) => content.includes('$299.99')).length).toBeGreaterThanOrEqual(1);
        });

        test('maintains consistent behavior across different product types', () => {
            const productTypes = [
                { product: mockProduct, name: 'Master Product' },
                { product: standardProd, name: 'Standard Product' },
                { product: bundleProd, name: 'Bundle Product' },
                { product: setProduct, name: 'Set Product' },
            ];

            productTypes.forEach(({ product, name: _name }) => {
                const { unmount } = renderProductView({ product });

                // Each product type should render its name
                if (product.name) {
                    expect(screen.getByText(product.name)).toBeInTheDocument();
                }
                unmount();
            });
        });
    });

    describe('Additional Coverage Tests', () => {
        test('renders product with all required elements', () => {
            renderProductView({ product: mockProduct });

            // Verify all major product elements are present
            expect(screen.getByText('Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit')).toBeInTheDocument();
            expect(screen.getAllByText((content) => content.includes('$299.99')).length).toBeGreaterThanOrEqual(1);
            expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /add to wishlist/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument();
        });

        test('handles product with different pricing structures', () => {
            const productWithPriceRange = {
                ...mockProduct,
                price: 299.99,
                priceMax: 500,
            };

            renderProductView({ product: productWithPriceRange });

            expect(screen.getByText('Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit')).toBeInTheDocument();
            expect(screen.getAllByText((content) => content.includes('$299.99')).length).toBeGreaterThanOrEqual(1);
        });

        test('renders product with variation attributes', () => {
            renderProductView({ product: mockProduct });

            // Should have variation swatches
            expect(screen.getByLabelText('Charcoal')).toBeInTheDocument();
            expect(screen.getByLabelText('36')).toBeInTheDocument();
            expect(screen.getByLabelText('Short')).toBeInTheDocument();
        });

        test('handles product without variation attributes', () => {
            const productWithoutVariations = {
                ...standardProd,
                variationAttributes: [],
            };

            renderProductView({ product: productWithoutVariations });

            expect(screen.getByText('Laptop Briefcase with wheels (37L)')).toBeInTheDocument();
            // Should not have variation swatches
            const radiogroups = screen.queryAllByRole('radiogroup');
            const variationRadiogroups = radiogroups.filter(
                (radio) => !radio.getAttribute('data-testid')?.includes('delivery-option')
            );
            expect(variationRadiogroups).toHaveLength(0);
        });
    });

    describe('Description section', () => {
        test('description summary has hover background style', () => {
            const productWithDescription = {
                ...mockProduct,
                longDescription: 'A unique long description that differs from the short one.',
                shortDescription: 'Short description.',
            };
            renderProductView({ product: productWithDescription });

            const summary = screen.getByText(/Description:/i).closest('summary');
            expect(summary).toBeInTheDocument();
            expect(summary).toHaveClass('hover:bg-accent');
        });
    });

    describe('Share Button Integration', () => {
        test('renders share button in action buttons section', () => {
            renderProductView({ product: mockProduct });

            const shareButton = screen.getByRole('button', { name: /share/i });
            expect(shareButton).toBeInTheDocument();
        });

        test('share button triggers native share when available', async () => {
            const user = userEvent.setup();
            renderProductView({ product: mockProduct });

            const shareButton = screen.getByRole('button', { name: /share/i });
            await user.click(shareButton);

            // Native share should be called
            await waitFor(() => {
                expect(mockShare).toHaveBeenCalledOnce();
            });
        });

        test('share button opens dropdown menu when native share is not available', async () => {
            // Temporarily set navigator.share to undefined to test fallback
            // oxlint-disable-next-line @typescript-eslint/unbound-method -- test fixture
            const previousShare = navigator.share;

            Object.defineProperty(navigator, 'share', {
                writable: true,
                configurable: true,
                value: undefined,
            });

            const user = userEvent.setup();
            renderProductView({ product: mockProduct });

            const shareButton = screen.getByRole('button', { name: /share/i });
            await user.click(shareButton);

            // Wait for dropdown to appear
            await waitFor(() => {
                expect(screen.getByText('Copy link')).toBeInTheDocument();
            });

            // Check for configured social providers
            expect(screen.getByText('Email')).toBeInTheDocument();
            expect(screen.getByText('Twitter/X')).toBeInTheDocument();

            // Restore navigator.share
            Object.defineProperty(navigator, 'share', {
                writable: true,
                configurable: true,
                value: previousShare,
            });
        });

        test('share button respects disabled socialShare config in fallback menu', async () => {
            // Temporarily set navigator.share to undefined to test fallback
            // oxlint-disable-next-line @typescript-eslint/unbound-method -- test fixture
            const previousShare = navigator.share;

            Object.defineProperty(navigator, 'share', {
                writable: true,
                configurable: true,
                value: undefined,
            });

            const customConfig: AppConfig = {
                ...mockBuildConfig.app,
                features: {
                    ...mockBuildConfig.app.features,
                    socialShare: { enabled: false, providers: ['Twitter', 'Facebook', 'LinkedIn', 'Email'] },
                },
            };

            const user = userEvent.setup();
            const router = createMemoryRouter(
                [
                    {
                        path: '/product/:productId',
                        element: (
                            <AllProvidersWrapper config={customConfig}>
                                <ProductView product={mockProduct} />
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                {
                    initialEntries: ['/product/test-product'],
                }
            );
            render(<RouterProvider router={router} />);

            const shareButton = screen.getByRole('button', { name: /share/i });
            await user.click(shareButton);

            await waitFor(() => {
                expect(screen.getByText('Copy link')).toBeInTheDocument();
            });

            // Social providers should not be shown when disabled
            expect(screen.queryByText('Email')).not.toBeInTheDocument();
            expect(screen.queryByText('Twitter/X')).not.toBeInTheDocument();

            // Restore navigator.share
            Object.defineProperty(navigator, 'share', {
                writable: true,
                configurable: true,
                value: previousShare,
            });
        });

        test('share button shows only configured providers in fallback menu', async () => {
            // Temporarily set navigator.share to undefined to test fallback
            // oxlint-disable-next-line @typescript-eslint/unbound-method -- test fixture
            const previousShare = navigator.share;

            Object.defineProperty(navigator, 'share', {
                writable: true,
                configurable: true,
                value: undefined,
            });

            const customConfig: AppConfig = {
                ...mockBuildConfig.app,
                features: {
                    ...mockBuildConfig.app.features,
                    socialShare: { enabled: true, providers: ['Email'] },
                },
            };

            const user = userEvent.setup();
            const router = createMemoryRouter(
                [
                    {
                        path: '/product/:productId',
                        element: (
                            <AllProvidersWrapper config={customConfig}>
                                <ProductView product={mockProduct} />
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                {
                    initialEntries: ['/product/test-product'],
                }
            );
            render(<RouterProvider router={router} />);

            const shareButton = screen.getByRole('button', { name: /share/i });
            await user.click(shareButton);

            await waitFor(() => {
                expect(screen.getByText('Copy link')).toBeInTheDocument();
            });

            // Only Email should be shown
            expect(screen.getByText('Email')).toBeInTheDocument();
            expect(screen.queryByText('Twitter/X')).not.toBeInTheDocument();
            expect(screen.queryByText('Facebook')).not.toBeInTheDocument();

            // Restore navigator.share
            Object.defineProperty(navigator, 'share', {
                writable: true,
                configurable: true,
                value: previousShare,
            });
        });

        test('share button appears alongside wishlist button', () => {
            renderProductView({ product: mockProduct });

            const wishlistButton = screen.getByRole('button', { name: /add to wishlist/i });
            const shareButton = screen.getByRole('button', { name: /share/i });

            expect(wishlistButton).toBeInTheDocument();
            expect(shareButton).toBeInTheDocument();

            // Both buttons should be in the same container (flex layout)
            const buttonsContainer = wishlistButton.closest('div.flex');
            expect(buttonsContainer).toContainElement(shareButton);
        });

        test('share button works with different product types', () => {
            const productTypes = [
                { product: mockProduct, name: 'Master Product' },
                { product: standardProd, name: 'Standard Product' },
            ];

            productTypes.forEach(({ product }) => {
                const { unmount } = renderProductView({ product });

                const shareButton = screen.getByRole('button', { name: /share/i });
                expect(shareButton).toBeInTheDocument();

                unmount();
            });
        });
    });

    describe('Gallery widths', () => {
        // The PDP is the canonical surface the <ImageGallery> defaults are sized for
        // (`section-container` → `lg:grid-cols-2` → `max-w-screen-2xl`, capped at 680). It
        // intentionally does NOT pass a `widths` override — the gallery falls back to its
        // documented PDP-shaped defaults. Guarding the absence of an override prevents someone
        // from tightening this surface and silently breaking the cache-ladder alignment.
        test('does not pass a widths override (relies on gallery defaults)', () => {
            renderProductView({ product: mockProduct });

            expect(capturedImageGalleryProps.last?.widths).toBeUndefined();
        });
    });
});
