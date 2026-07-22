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
import { describe, test, expect } from 'vitest';
// React Router
import { createMemoryRouter, RouterProvider } from 'react-router';

// Components
import ProductInfo from './product-info';
import ProductViewProvider from '@/providers/product-view';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
// mock data
import { masterProduct as mockProduct } from '@/components/__mocks__/master-variant-product';
import { standardProd } from '@/components/__mocks__/standard-product-2';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();

const renderProductInfo = (props: React.ComponentProps<typeof ProductInfo>) => {
    // Using createMemoryRouter in framework mode is fine
    // because both framework and data routers share the same underlying architecture, so it provides a valid navigation context for hooks and <Link>.
    // Even though it's listed under "data routers," it fully supports testing non-route components that rely on router behavior.
    const router = createMemoryRouter(
        [
            {
                path: '/product/:productId',
                element: (
                    <AllProvidersWrapper>
                        <ProductViewProvider product={props.product}>
                            <ProductInfo {...props} />
                        </ProductViewProvider>
                    </AllProvidersWrapper>
                ),
            },
            // Catch-all route to prevent 404 errors when navigating
            {
                path: '*',
                element: <div>Navigated</div>,
            },
        ],
        {
            initialEntries: ['/product/test-product'],
        }
    );
    return { ...render(<RouterProvider router={router} />), router };
};

describe('ProductInfo', () => {
    describe('basic rendering', () => {
        test('should render product name and description on desktop', () => {
            renderProductInfo({ product: mockProduct });

            expect(screen.getByText('Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit')).toBeInTheDocument();
            expect(
                screen.getByText(
                    'This suit is great for any occasion. Add a shirt and a tie and you are ready for any event.'
                )
            ).toBeInTheDocument();
        });

        test('should render price information', () => {
            renderProductInfo({ product: mockProduct });

            // Price is visible (PDP may show single variant price or range depending on context)
            expect(screen.getAllByText((content) => content.includes('$299.99')).length).toBeGreaterThanOrEqual(1);
        });

        test('should render price from aria-label', () => {
            renderProductInfo({ product: mockProduct });

            // Price has aria-label (single price or range depending on context)
            const priceElement = screen.getByLabelText(/\$299\.99/);
            expect(priceElement).toBeInTheDocument();
        });
    });

    describe('variant selection', () => {
        test('should render color label when color variation exists', () => {
            renderProductInfo({ product: mockProduct });

            // The component shows "Color: [SelectedColorName]" - Red is selected by default
            // Use flexible text matching for the color attribute name and value
            expect(screen.getByText(new RegExp('Color'))).toBeInTheDocument();
        });

        test('should render variant selector for non-color attributes', () => {
            renderProductInfo({ product: mockProduct });

            expect(screen.getByText(new RegExp('Size'))).toBeInTheDocument();
        });

        test('should generate correct URLs for swatch selection', () => {
            renderProductInfo({ product: mockProduct });

            // Find color swatches - only Charcoal available
            const charcoalSwatch = screen.getByLabelText('Charcoal');
            expect(charcoalSwatch).toBeInTheDocument();
            expect(charcoalSwatch).toHaveAttribute('href', '/global/en-GB/product/test-product?color=CHARCWL');

            // Find size swatches
            const size36Swatch = screen.getByLabelText('36');
            expect(size36Swatch).toBeInTheDocument();
            expect(size36Swatch).toHaveAttribute('href', '/global/en-GB/product/test-product?size=036');

            const size38Swatch = screen.getByLabelText('38');
            expect(size38Swatch).toBeInTheDocument();
            expect(size38Swatch).toHaveAttribute('href', '/global/en-GB/product/test-product?size=038');

            // Find width swatches
            const shortSwatch = screen.getByLabelText('Short');
            expect(shortSwatch).toBeInTheDocument();
            expect(shortSwatch).toHaveAttribute('href', '/global/en-GB/product/test-product?width=S');

            const regularSwatch = screen.getByLabelText('Regular');
            expect(regularSwatch).toBeInTheDocument();
            expect(regularSwatch).toHaveAttribute('href', '/global/en-GB/product/test-product?width=V');
        });

        test('should update URL when swatch is clicked', async () => {
            const user = userEvent.setup();
            const { router } = renderProductInfo({ product: mockProduct });

            // Click on size 38 swatch
            const size38Swatch = screen.getByLabelText('38');
            expect(size38Swatch).toHaveAttribute('href', '/global/en-GB/product/test-product?size=038');

            await user.click(size38Swatch);

            // After clicking, verify the location was updated
            await waitFor(() => {
                // In tests using createMemoryRouter (or RouterProvider in framework mode),
                // navigation happens entirely in memory, not in the real browser environment
                expect(router.state.location.search).toContain('size=038');
            });
        });

        test('should show swatch as selected when URL contains its value', () => {
            const router = createMemoryRouter(
                [
                    {
                        path: '/product/:productId',
                        element: (
                            <AllProvidersWrapper>
                                <ProductViewProvider product={mockProduct}>
                                    <ProductInfo product={mockProduct} />
                                </ProductViewProvider>
                            </AllProvidersWrapper>
                        ),
                    },
                    // Catch-all route to prevent 404 errors when navigating
                    {
                        path: '*',
                        element: <div>Navigated</div>,
                    },
                ],
                {
                    initialEntries: ['/product/test-product?size=038'],
                }
            );
            render(<RouterProvider router={router} />);

            // Size 38 swatch should be selected (aria-checked=true)
            const size38Swatch = screen.getByLabelText('38');
            expect(size38Swatch).toHaveAttribute('aria-checked', 'true');

            // Size 36 swatch should not be selected
            const size36Swatch = screen.getByLabelText('36');
            expect(size36Swatch).toHaveAttribute('aria-checked', 'false');
        });
    });

    describe('inventory and stock handling', () => {
        test('should show out of stock message when inventory is zero', () => {
            // Simple item (no variants) so OOS reflects this SKU, not indeterminate master inventory
            const outOfStockProduct = {
                ...standardProd,
                name: mockProduct.name,
                inventory: { ats: 0, orderable: false, id: 'test-inventory' },
            };

            renderProductInfo({ product: outOfStockProduct });

            expect(
                screen.getByText('Out of stock for Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit')
            ).toBeInTheDocument();
        });

        test('should render properly with low stock inventory', () => {
            const lowStockProduct = {
                ...mockProduct,
                inventory: { ats: 2, orderable: true, id: 'test-inventory' },
                variationAttributes: [], // Remove variants to simplify
            };

            renderProductInfo({ product: lowStockProduct });

            // Should still render basic elements
            expect(screen.getByText('Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit')).toBeInTheDocument();
            expect(screen.getByLabelText(t('quantitySelector:quantity'))).toBeInTheDocument();
        });

        test('should render swatches when product has variations', () => {
            renderProductInfo({ product: mockProduct });

            // Check that variation swatches are rendered - Charcoal color, sizes 36-50, widths Short/Regular/Long
            expect(screen.getByLabelText('Charcoal')).toBeInTheDocument();
            expect(screen.getByLabelText('36')).toBeInTheDocument();
            expect(screen.getByLabelText('38')).toBeInTheDocument();
            expect(screen.getByLabelText('Short')).toBeInTheDocument();
            expect(screen.getByLabelText('Regular')).toBeInTheDocument();
        });

        test('should hide inventory message until multi-attribute selection resolves to one variant in controlled mode', () => {
            const multiAttributeProduct = {
                ...mockProduct,
                inventory: {
                    ats: 0,
                    orderable: false,
                    id: 'master-oos-inventory',
                    backorderable: false,
                    preorderable: false,
                },
            };
            renderProductInfo({
                product: multiAttributeProduct,
                swatchMode: 'controlled',
                onAttributeChange: () => undefined,
                variationValues: { color: 'CHARCWL' },
            });

            // With only one of multiple variation attributes selected, inventory message stays hidden.
            expect(screen.queryByText(t('product:outOfStockLabel'))).not.toBeInTheDocument();
            expect(screen.queryByText(t('product:inStock'))).not.toBeInTheDocument();
            expect(
                screen.queryByText(
                    t('product:outOfStock', {
                        productName: 'Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit',
                    })
                )
            ).not.toBeInTheDocument();
        });

        test('should disable non-selectable attribute values in controlled mode based on current selection', () => {
            const constrainedProduct = {
                ...mockProduct,
                variationAttributes: [
                    ...(mockProduct.variationAttributes ?? []).map((attribute) => {
                        if (attribute.id === 'size') {
                            return {
                                ...attribute,
                                values: [
                                    { name: '40', value: '040', orderable: true },
                                    { name: '42', value: '042', orderable: true },
                                ],
                            };
                        }
                        if (attribute.id === 'width') {
                            return {
                                ...attribute,
                                values: [
                                    { name: 'Short', value: 'S', orderable: true },
                                    { name: 'Regular', value: 'V', orderable: true },
                                ],
                            };
                        }
                        return attribute;
                    }),
                ],
                variants: [
                    {
                        productId: 'variant-40-short',
                        orderable: true,
                        variationValues: { color: 'CHARCWL', size: '040', width: 'S' },
                    },
                    {
                        productId: 'variant-42-regular',
                        orderable: true,
                        variationValues: { color: 'CHARCWL', size: '042', width: 'V' },
                    },
                ],
            };

            renderProductInfo({
                product: constrainedProduct,
                swatchMode: 'controlled',
                onAttributeChange: () => undefined,
                variationValues: { color: 'CHARCWL', size: '042' },
            });

            // Disabled swatches expose aria-disabled (kept focusable/announceable) with an out-of-stock accessible name.
            expect(screen.getByRole('radio', { name: /short.*out of stock/i })).toHaveAttribute(
                'aria-disabled',
                'true'
            );
            expect(screen.getByRole('radio', { name: /^regular$/i })).not.toHaveAttribute('aria-disabled', 'true');
        });

        test('should disable controlled swatch value when only matching variants are out of stock', () => {
            const constrainedProduct = {
                ...mockProduct,
                variationAttributes: [
                    ...(mockProduct.variationAttributes ?? []).map((attribute) => {
                        if (attribute.id === 'size') {
                            return {
                                ...attribute,
                                values: [
                                    { name: '40', value: '040', orderable: true },
                                    { name: '42', value: '042', orderable: true },
                                ],
                            };
                        }
                        if (attribute.id === 'width') {
                            return {
                                ...attribute,
                                values: [
                                    { name: 'Short', value: 'S', orderable: true },
                                    { name: 'Regular', value: 'V', orderable: true },
                                ],
                            };
                        }
                        return attribute;
                    }),
                ],
                variants: [
                    {
                        productId: 'variant-42-short-oos',
                        orderable: false,
                        variationValues: { color: 'CHARCWL', size: '042', width: 'S' },
                    },
                    {
                        productId: 'variant-42-regular',
                        orderable: true,
                        variationValues: { color: 'CHARCWL', size: '042', width: 'V' },
                    },
                ],
            };

            renderProductInfo({
                product: constrainedProduct,
                swatchMode: 'controlled',
                onAttributeChange: () => undefined,
                variationValues: { color: 'CHARCWL', size: '042' },
            });

            // Disabled swatches expose aria-disabled (kept focusable/announceable) with an out-of-stock accessible name.
            expect(screen.getByRole('radio', { name: /short.*out of stock/i })).toHaveAttribute(
                'aria-disabled',
                'true'
            );
            expect(screen.getByRole('radio', { name: /^regular$/i })).not.toHaveAttribute('aria-disabled', 'true');
        });

        test('should display in-stock inventory message when product has stock', () => {
            const inStockProduct = {
                ...mockProduct,
                inventory: {
                    ats: 10,
                    orderable: true,
                    id: 'test-inventory',
                    backorderable: false,
                    preorderable: false,
                },
                variationAttributes: [],
            };

            renderProductInfo({ product: inStockProduct });

            expect(screen.getByText(t('product:inStock'))).toBeInTheDocument();
        });

        test('should display pre-order inventory message when product is preorderable', () => {
            const preOrderProduct = {
                ...mockProduct,
                inventory: {
                    ats: 0,
                    orderable: true,
                    id: 'test-inventory',
                    preorderable: true,
                    backorderable: false,
                },
                variationAttributes: [],
            };

            renderProductInfo({ product: preOrderProduct });

            expect(screen.getByText(t('product:preOrder'))).toBeInTheDocument();
        });

        test('should display back-order inventory message when product is backorderable', () => {
            const backOrderProduct = {
                ...mockProduct,
                inventory: {
                    ats: 0,
                    orderable: true,
                    id: 'test-inventory',
                    backorderable: true,
                    preorderable: false,
                },
                variationAttributes: [],
            };

            renderProductInfo({ product: backOrderProduct });

            expect(screen.getByText(t('product:backOrder'))).toBeInTheDocument();
        });

        test('should display out-of-stock inventory message when product is not orderable', () => {
            const outOfStockProduct = {
                ...standardProd,
                name: mockProduct.name,
                inventory: {
                    ats: 0,
                    orderable: false,
                    id: 'test-inventory',
                    backorderable: false,
                    preorderable: false,
                },
            };

            renderProductInfo({ product: outOfStockProduct });

            expect(screen.getByText(t('product:outOfStockLabel'))).toBeInTheDocument();
        });
    });

    describe('quantity selector', () => {
        test('should render quantity selector elements', () => {
            const simpleProduct = {
                ...mockProduct,
                variationAttributes: [], // No variants to simplify
            };

            renderProductInfo({ product: simpleProduct });

            expect(screen.getByLabelText(t('quantitySelector:quantity'))).toBeInTheDocument();
            expect(
                screen.getByLabelText(
                    'Decrement Quantity for Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit'
                )
            ).toBeInTheDocument();
            expect(
                screen.getByLabelText(
                    'Increment Quantity for Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit'
                )
            ).toBeInTheDocument();
        });

        test('should not render quantity selector for product sets', () => {
            const productSet = { ...mockProduct, type: { set: true } };
            renderProductInfo({ product: productSet });

            expect(screen.queryByLabelText(t('quantitySelector:quantity'))).not.toBeInTheDocument();
        });

        test('should not render quantity selector for product bundles', () => {
            const productBundle = { ...mockProduct, type: { bundle: true } };
            renderProductInfo({ product: productBundle });

            expect(screen.queryByLabelText(t('quantitySelector:quantity'))).not.toBeInTheDocument();
        });

        test('should not render quantity selector in edit mode', () => {
            const simpleProduct = {
                ...mockProduct,
                variationAttributes: [], // No variants to simplify
            };

            // Render with mode="edit" to simulate cart edit scenario
            const router = createMemoryRouter(
                [
                    {
                        path: '/product/:productId',
                        element: (
                            <AllProvidersWrapper>
                                <ProductViewProvider product={simpleProduct} mode="edit">
                                    <ProductInfo product={simpleProduct} />
                                </ProductViewProvider>
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                {
                    initialEntries: ['/product/test-product'],
                }
            );
            render(<RouterProvider router={router} />);

            // Quantity selector should not be rendered in edit mode
            expect(screen.queryByLabelText(t('quantitySelector:quantity'))).not.toBeInTheDocument();
        });
    });

    describe('edge cases', () => {
        test('should handle standard product without variation attributes', () => {
            renderProductInfo({ product: standardProd });

            // Standard product has no variation attributes, so no swatches should render
            expect(screen.queryByText(/Color/)).not.toBeInTheDocument();
            expect(screen.queryByText(/Size/)).not.toBeInTheDocument();
            expect(screen.queryByText(/Width/)).not.toBeInTheDocument();

            // Should render the product name and price
            expect(screen.getByText('Laptop Briefcase with wheels (37L)')).toBeInTheDocument();
            expect(screen.getByText('$99.99')).toBeInTheDocument();
        });

        test('should handle product with empty imageGroups', () => {
            const productWithoutImages = {
                ...mockProduct,
                imageGroups: [],
            };
            renderProductInfo({ product: productWithoutImages });

            // Should still render the product name - price may vary based on priceRanges
            expect(screen.getByText('Charcoal Flat Front Athletic Fit Shadow Striped Wool Suit')).toBeInTheDocument();
            expect(screen.getAllByText((content) => content.includes('$299.99')).length).toBeGreaterThanOrEqual(1);
        });
    });
});
