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

import { type ComponentProps } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import ChildProductCard from './child-product-card';
import type { ShopperProducts } from '@/scapi';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

// Prop-capture mock for <ImageGallery> so tests can assert that the card forwards the documented
// GALLERY_WIDTHS constant (private to the module, but the only meaningful surface is what reaches
// the gallery component).
const capturedImageGalleryProps: { last: any } = { last: null };
vi.mock('@/components/image-gallery', () => ({
    default: (props: any) => {
        capturedImageGalleryProps.last = props;
        return <div data-testid="image-gallery" />;
    },
}));

// Prop-capture mock for <ProductPrice> so we can assert that the card threads `allowMissingPrice`
// down to the price display (in lockstep with the gate's allowMissingPrice).
const capturedProductPriceProps: { last: any } = { last: null };
vi.mock('@/components/product-price', () => ({
    default: (props: any) => {
        capturedProductPriceProps.last = props;
        return <div data-testid="product-price" />;
    },
}));

vi.mock('@/hooks/product/use-current-variant', () => ({
    useCurrentVariant: () => null,
}));

vi.mock('@/hooks/product/use-selected-variations', () => ({
    useSelectedVariations: () => ({}),
}));

vi.mock('@/hooks/product/use-product-images', () => ({
    useProductImages: () => ({
        galleryImages: [],
    }),
}));

vi.mock('@/hooks/product/use-product-actions', () => ({
    useProductActions: () => ({
        isAddingToOrUpdatingCart: false,
        canAddToCart: true,
        stockLevel: 10,
        isOutOfStock: false,
        handleAddToCart: vi.fn(),
        quantity: 1,
        setQuantity: vi.fn(),
    }),
}));

vi.mock('@/hooks/product/use-variation-attributes', () => ({
    useVariationAttributes: () => [],
}));

// Mock pickup availability used by the BOPIS fulfillment contributor.
vi.mock('@/extensions/bopis/hooks/use-pickup-availability', () => ({
    usePickupAvailability: () => false,
}));

const createStandardProduct = (): ShopperProducts.schemas['Product'] => ({
    id: 'standard-123',
    name: 'Standard Product',
    type: { item: true },
    inventory: {
        id: 'inventory-123',
        ats: 10,
        orderable: true,
    },
});

const createVariantProduct = (): ShopperProducts.schemas['Product'] => ({
    id: 'variant-123',
    name: 'Variant Product',
    type: { variant: true },
    inventory: {
        id: 'inventory-123',
        ats: 10,
        orderable: true,
    },
});

const createSetProduct = (): ShopperProducts.schemas['Product'] => ({
    id: 'set-123',
    name: 'Set Product',
    type: { set: true },
});

const renderChildProductCard = (props: ComponentProps<typeof ChildProductCard>) => {
    const router = createMemoryRouter(
        [
            {
                path: '/product/:productId',
                element: (
                    <AllProvidersWrapper>
                        <ChildProductCard {...props} />
                    </AllProvidersWrapper>
                ),
            },
        ],
        {
            initialEntries: ['/product/parent-123'],
        }
    );
    return { ...render(<RouterProvider router={router} />), router };
};

describe('ChildProductCard', () => {
    const mockOnSelectionChange = vi.fn();
    const mockStore = {
        getState: vi.fn(),
        setState: vi.fn(),
        subscribe: vi.fn(() => vi.fn()), // subscribe returns unsubscribe function
        destroy: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        capturedImageGalleryProps.last = null;
        capturedProductPriceProps.last = null;

        // Set up stable mock state
        mockStore.getState.mockReturnValue({
            selectedStoreInfo: null,
            open: vi.fn(),
        });
    });

    describe('standard products', () => {
        test('auto-selects standard products on mount', async () => {
            const standardProduct = createStandardProduct();
            const parentProduct = createSetProduct();

            renderChildProductCard({
                childProduct: standardProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            // Standard product should be auto-selected - wait for useEffect to run
            await waitFor(
                () => {
                    expect(mockOnSelectionChange).toHaveBeenCalledWith('standard-123', {
                        product: standardProduct,
                        quantity: 1,
                    });
                },
                { timeout: 1000 }
            );
        });

        test('displays selected status for standard products', () => {
            const standardProduct = createStandardProduct();
            const parentProduct = createSetProduct();

            renderChildProductCard({
                childProduct: standardProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            expect(screen.getByText(/selected/i)).toBeInTheDocument();
        });

        test('does not require variant selection for standard products', () => {
            const standardProduct = createStandardProduct();
            const parentProduct = createSetProduct();

            renderChildProductCard({
                childProduct: standardProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            // Should not show "Select options above" message
            expect(screen.queryByText(/select options above/i)).not.toBeInTheDocument();
        });

        test('renders image gallery when images exist', async () => {
            const imagesModule = await import('@/hooks/product/use-product-images');
            vi.spyOn(imagesModule, 'useProductImages').mockReturnValue({
                galleryImages: [
                    {
                        src: 'https://example.com/primary.jpg',
                        alt: 'Primary image',
                        thumbSrc: 'https://example.com/primary.jpg',
                    },
                ],
            } as never);

            const standardProduct = createStandardProduct();
            const parentProduct = createSetProduct();

            renderChildProductCard({
                childProduct: standardProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            expect(screen.queryByText(/no image available/i)).not.toBeInTheDocument();
        });
    });

    describe('variant products without variant selection', () => {
        test('notifies parent for variant products in sets (for inventory calculation)', async () => {
            const variantProduct = createVariantProduct();
            const parentProduct = createSetProduct();

            renderChildProductCard({
                childProduct: variantProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            // Variant products in sets notify parent about quantity changes (even without variant selection)
            // This allows parent to calculate inventory based on child quantities
            await waitFor(() => {
                expect(mockOnSelectionChange).toHaveBeenCalledWith('variant-123', {
                    product: expect.objectContaining({ id: 'variant-123' }),
                    quantity: 1,
                });
            });
        });

        test('does NOT notify parent for variant products in bundles without variant selection', async () => {
            const variantProduct = createVariantProduct();
            const parentProduct: ShopperProducts.schemas['Product'] = {
                id: 'bundle-123',
                name: 'Bundle Product',
                type: { bundle: true },
            };

            renderChildProductCard({
                childProduct: variantProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            // Bundles should NOT notify parent for variant products without variant selection
            // Wait a bit to ensure no notification happens
            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(mockOnSelectionChange).not.toHaveBeenCalled();
        });

        test('notifies parent when quantity changes for variant products in sets', async () => {
            const actionsModule = await import('@/hooks/product/use-product-actions');
            const mockSetQuantity = vi.fn();

            // Start with quantity 1
            vi.spyOn(actionsModule, 'useProductActions').mockReturnValue({
                isAddingToOrUpdatingCart: false,
                canAddToCart: true,
                stockLevel: 10,
                isOutOfStock: false,
                handleAddToCart: vi.fn(),
                quantity: 1,
                setQuantity: mockSetQuantity,
            } as never);

            const variantProduct = createVariantProduct();
            const parentProduct = createSetProduct();

            const { rerender } = renderChildProductCard({
                childProduct: variantProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            // Wait for initial notification
            await waitFor(() => {
                expect(mockOnSelectionChange).toHaveBeenCalledWith('variant-123', {
                    product: expect.objectContaining({ id: 'variant-123' }),
                    quantity: 1,
                });
            });

            mockOnSelectionChange.mockClear();

            // Now change quantity to 2
            vi.spyOn(actionsModule, 'useProductActions').mockReturnValue({
                isAddingToOrUpdatingCart: false,
                canAddToCart: true,
                stockLevel: 10,
                isOutOfStock: false,
                handleAddToCart: vi.fn(),
                quantity: 2,
                setQuantity: mockSetQuantity,
            } as never);

            // Trigger re-render with new quantity
            rerender(
                <RouterProvider
                    router={createMemoryRouter(
                        [
                            {
                                path: '/product/:productId',
                                element: (
                                    <AllProvidersWrapper>
                                        <ChildProductCard
                                            childProduct={variantProduct}
                                            parentProduct={parentProduct}
                                            onSelectionChange={mockOnSelectionChange}
                                        />
                                    </AllProvidersWrapper>
                                ),
                            },
                        ],
                        {
                            initialEntries: ['/product/parent-123'],
                        }
                    )}
                />
            );

            // Should notify parent with new quantity
            await waitFor(() => {
                expect(mockOnSelectionChange).toHaveBeenCalledWith('variant-123', {
                    product: expect.objectContaining({ id: 'variant-123' }),
                    quantity: 2,
                });
            });
        });

        test('displays selection prompt for variant products', () => {
            const variantProduct = createVariantProduct();
            const parentProduct = createSetProduct();

            renderChildProductCard({
                childProduct: variantProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            expect(screen.getByText(/select options above/i)).toBeInTheDocument();
        });

        test('reports orderability as false when no variant selected', async () => {
            const mockOnOrderabilityChange = vi.fn();
            const actionsModule = await import('@/hooks/product/use-product-actions');

            // Mock canAddToCart as false (no variant selected)
            vi.spyOn(actionsModule, 'useProductActions').mockReturnValue({
                isAddingToOrUpdatingCart: false,
                canAddToCart: false,
                stockLevel: 10,
                isOutOfStock: false,
                handleAddToCart: vi.fn(),
                quantity: 1,
                setQuantity: vi.fn(),
            } as never);

            const variantProduct = createVariantProduct();
            const parentProduct = createSetProduct();

            renderChildProductCard({
                childProduct: variantProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
                onOrderabilityChange: mockOnOrderabilityChange,
            });

            // Should report as not orderable
            await waitFor(() => {
                expect(mockOnOrderabilityChange).toHaveBeenCalledWith('variant-123', {
                    isOrderable: false,
                    errorMessage: expect.any(String),
                });
            });
        });
    });

    describe('product set behavior', () => {
        test('shows quantity picker for set products', () => {
            const standardProduct = createStandardProduct();
            const parentProduct = createSetProduct();

            renderChildProductCard({
                childProduct: standardProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            // Set products should have quantity pickers
            expect(screen.getByRole('spinbutton')).toBeInTheDocument();
        });

        test('shows individual add to cart button for set products', () => {
            const standardProduct = createStandardProduct();
            const parentProduct = createSetProduct();

            renderChildProductCard({
                childProduct: standardProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument();
        });
    });

    describe('product bundle behavior', () => {
        test('does not show quantity picker for bundle products', () => {
            const standardProduct = createStandardProduct();
            const parentProduct: ShopperProducts.schemas['Product'] = {
                id: 'bundle-123',
                name: 'Bundle Product',
                type: { bundle: true },
            };

            renderChildProductCard({
                childProduct: standardProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            // Bundle products should not have individual quantity pickers
            expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
        });

        test('does not show individual add to cart button for bundle products', () => {
            const standardProduct = createStandardProduct();
            const parentProduct: ShopperProducts.schemas['Product'] = {
                id: 'bundle-123',
                name: 'Bundle Product',
                type: { bundle: true },
            };

            renderChildProductCard({
                childProduct: standardProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            expect(screen.queryByRole('button', { name: /add to cart/i })).not.toBeInTheDocument();
        });
    });

    describe('swatches', () => {
        test('renders swatch rendering functions when variation attributes exist', async () => {
            const variationModule = await import('@/hooks/product/use-variation-attributes');
            const variantProduct = createVariantProduct();
            const parentProduct = createSetProduct();

            // Mock variation attributes with swatches that have images
            vi.spyOn(variationModule, 'useVariationAttributes').mockReturnValue([
                {
                    id: 'color',
                    name: 'Color',
                    selectedValue: { value: 'red', name: 'Red' },
                    values: [
                        {
                            value: 'red',
                            name: 'Red',
                            href: '/product/red',
                            image: { link: 'https://example.com/red.jpg', alt: 'Red color' },
                            orderable: true,
                        },
                        {
                            value: 'blue',
                            name: 'Blue',
                            href: '/product/blue',
                            image: { link: 'https://example.com/blue.jpg', alt: 'Blue color' },
                            orderable: true,
                        },
                    ],
                },
                {
                    id: 'size',
                    name: 'Size',
                    selectedValue: { value: 'large', name: 'Large' },
                    values: [
                        {
                            value: 'small',
                            name: 'Small',
                            href: '/product/small',
                            orderable: true,
                        },
                        {
                            value: 'large',
                            name: 'Large',
                            href: '/product/large',
                            orderable: false,
                        },
                    ],
                },
            ] as never);

            renderChildProductCard({
                childProduct: variantProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            // Verify swatches render with images for color (circle shape)
            expect(screen.getByLabelText('Red color')).toBeInTheDocument();
            expect(screen.getByLabelText('Blue color')).toBeInTheDocument();
            // Verify swatches render without images for size (square shape)
            // Use getAllByText since "Large" appears in both selectedValue displayName and swatch content
            const largeElements = screen.getAllByText('Large');
            expect(largeElements.length).toBeGreaterThan(0);
            expect(screen.getByText('Small')).toBeInTheDocument();
        });

        test('renders swatches as buttons (no href) so clicks update URL params without navigation', async () => {
            const variationModule = await import('@/hooks/product/use-variation-attributes');
            const variantProduct = createVariantProduct();
            const parentProduct = createSetProduct();

            vi.spyOn(variationModule, 'useVariationAttributes').mockReturnValue([
                {
                    id: 'color',
                    name: 'Color',
                    selectedValue: { value: 'red', name: 'Red' },
                    values: [
                        {
                            value: 'red',
                            name: 'Red Swatch',
                            href: '/product/red',
                            orderable: true,
                        },
                    ],
                },
            ] as never);

            renderChildProductCard({
                childProduct: variantProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            expect(screen.getByText('Red Swatch')).toBeInTheDocument();
        });

        test('renders swatches with disabled state when not orderable', async () => {
            const variationModule = await import('@/hooks/product/use-variation-attributes');
            const variantProduct = createVariantProduct();
            const parentProduct = createSetProduct();

            vi.spyOn(variationModule, 'useVariationAttributes').mockReturnValue([
                {
                    id: 'color',
                    name: 'Color',
                    selectedValue: { value: 'red', name: 'Red' },
                    values: [
                        {
                            value: 'red',
                            name: 'Red Disabled',
                            href: '/product/red',
                            orderable: false,
                        },
                    ],
                },
            ] as never);

            renderChildProductCard({
                childProduct: variantProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            expect(screen.getByText('Red Disabled')).toBeInTheDocument();
        });
    });

    describe('variant products', () => {
        test('notifies parent when a variant is selected', async () => {
            const variantModule = await import('@/hooks/product/use-current-variant');
            const variantMock = {
                productId: 'variant-456',
                inventory: { ats: 5 },
            };

            // Set up the mock before rendering
            vi.spyOn(variantModule, 'useCurrentVariant').mockReturnValue(variantMock as never);

            const variantProduct = createVariantProduct();
            const parentProduct = createSetProduct();

            renderChildProductCard({
                childProduct: variantProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            // Wait for the effect to run and notify parent
            await waitFor(() => {
                expect(mockOnSelectionChange).toHaveBeenCalledWith(
                    'variant-123',
                    expect.objectContaining({
                        product: variantProduct,
                        variant: expect.objectContaining({ productId: 'variant-456' }),
                        quantity: 1,
                    })
                );
            });
        });

        test('notifies parent when variant changes', async () => {
            const variantModule = await import('@/hooks/product/use-current-variant');
            const actionsModule = await import('@/hooks/product/use-product-actions');
            const variantProduct = createVariantProduct();
            const parentProduct = createSetProduct();

            // Start with first variant
            const variant1 = { productId: 'variant-1', inventory: { ats: 5 } };
            vi.spyOn(variantModule, 'useCurrentVariant').mockReturnValue(variant1 as never);
            vi.spyOn(actionsModule, 'useProductActions').mockReturnValue({
                isAddingToOrUpdatingCart: false,
                canAddToCart: true,
                stockLevel: 10,
                isOutOfStock: false,
                handleAddToCart: vi.fn(),
                quantity: 1,
                setQuantity: vi.fn(),
            } as never);

            const { rerender } = renderChildProductCard({
                childProduct: variantProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            // Wait for initial notification
            await waitFor(() => {
                expect(mockOnSelectionChange).toHaveBeenCalledWith(
                    'variant-123',
                    expect.objectContaining({
                        variant: expect.objectContaining({ productId: 'variant-1' }),
                    })
                );
            });

            mockOnSelectionChange.mockClear();

            // Change to different variant
            const variant2 = { productId: 'variant-2', inventory: { ats: 3 } };
            vi.spyOn(variantModule, 'useCurrentVariant').mockReturnValue(variant2 as never);

            rerender(
                <RouterProvider
                    router={createMemoryRouter(
                        [
                            {
                                path: '/product/:productId',
                                element: (
                                    <AllProvidersWrapper>
                                        <ChildProductCard
                                            childProduct={variantProduct}
                                            parentProduct={parentProduct}
                                            onSelectionChange={mockOnSelectionChange}
                                        />
                                    </AllProvidersWrapper>
                                ),
                            },
                        ],
                        {
                            initialEntries: ['/product/parent-123'],
                        }
                    )}
                />
            );

            // Should notify parent with new variant
            await waitFor(() => {
                expect(mockOnSelectionChange).toHaveBeenCalledWith(
                    'variant-123',
                    expect.objectContaining({
                        variant: expect.objectContaining({ productId: 'variant-2' }),
                    })
                );
            });
        });

        test('does not notify parent when variant and quantity unchanged', async () => {
            const variantModule = await import('@/hooks/product/use-current-variant');
            const actionsModule = await import('@/hooks/product/use-product-actions');
            const variantProduct = createVariantProduct();
            const parentProduct = createSetProduct();

            const variant = { productId: 'variant-1', inventory: { ats: 5 } };
            vi.spyOn(variantModule, 'useCurrentVariant').mockReturnValue(variant as never);
            vi.spyOn(actionsModule, 'useProductActions').mockReturnValue({
                isAddingToOrUpdatingCart: false,
                canAddToCart: true,
                stockLevel: 10,
                isOutOfStock: false,
                handleAddToCart: vi.fn(),
                quantity: 1,
                setQuantity: vi.fn(),
            } as never);

            const { rerender } = renderChildProductCard({
                childProduct: variantProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            // Wait for initial notification
            await waitFor(() => {
                expect(mockOnSelectionChange).toHaveBeenCalled();
            });

            mockOnSelectionChange.mockClear();

            // Re-render with same variant and quantity - should not notify again
            rerender(
                <RouterProvider
                    router={createMemoryRouter(
                        [
                            {
                                path: '/product/:productId',
                                element: (
                                    <AllProvidersWrapper>
                                        <ChildProductCard
                                            childProduct={variantProduct}
                                            parentProduct={parentProduct}
                                            onSelectionChange={mockOnSelectionChange}
                                        />
                                    </AllProvidersWrapper>
                                ),
                            },
                        ],
                        {
                            initialEntries: ['/product/parent-123'],
                        }
                    )}
                />
            );

            // Wait a bit to ensure no additional calls
            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(mockOnSelectionChange).not.toHaveBeenCalled();
        });
    });

    describe('gallery widths', () => {
        // The card cell sits inside `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`; worst-case cell
        // width is ~420 at `md` on PDP (lg-3-col and base mobile both stay below 420). Thumbnails are
        // grid-cols-4 of the cell. The card snaps to the shared pixel ladder (md main 420, md thumb 96)
        // so the same DIS variants are reused on cart-modal and bonus-modal during a session.
        test('passes the documented widths to <ImageGallery> (cache-ladder rungs)', () => {
            const standardProduct = createStandardProduct();
            const parentProduct = createSetProduct();

            renderChildProductCard({
                childProduct: standardProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            expect(capturedImageGalleryProps.last?.widths).toEqual({
                main: { base: 360, md: 420 },
                thumbnail: { base: 80, md: 96 },
            });
        });
    });

    describe('cart interactions', () => {
        test('disables add to cart when out of stock', async () => {
            const actionsModule = await import('@/hooks/product/use-product-actions');
            vi.spyOn(actionsModule, 'useProductActions').mockReturnValue({
                isAddingToOrUpdatingCart: false,
                canAddToCart: false,
                stockLevel: 0,
                isOutOfStock: true,
                handleAddToCart: vi.fn(),
                quantity: 1,
                setQuantity: vi.fn(),
            } as never);

            const standardProduct = createStandardProduct();
            const parentProduct = createSetProduct();

            renderChildProductCard({
                childProduct: standardProduct,
                parentProduct,
                onSelectionChange: mockOnSelectionChange,
            });

            const btn = screen.getByRole('button', { name: /add to cart/i });
            expect(btn).toBeDisabled();
        });
    });

    describe('price gate (allowMissingPrice flow)', () => {
        const captureActionsArgs = async () => {
            const actionsModule = await import('@/hooks/product/use-product-actions');
            const spy = vi.spyOn(actionsModule, 'useProductActions').mockReturnValue({
                isAddingToOrUpdatingCart: false,
                canAddToCart: true,
                stockLevel: 10,
                isOutOfStock: false,
                handleAddToCart: vi.fn(),
                quantity: 1,
                setQuantity: vi.fn(),
            } as never);
            return spy;
        };

        test('passes allowMissingPrice=false to useProductActions for set children by default', async () => {
            const spy = await captureActionsArgs();
            renderChildProductCard({
                childProduct: createStandardProduct(),
                parentProduct: createSetProduct(),
                onSelectionChange: mockOnSelectionChange,
            });
            expect(spy).toHaveBeenCalledWith(expect.objectContaining({ allowMissingPrice: false }));
        });

        test('passes allowMissingPrice=true for set children in edit mode (cart-edit)', async () => {
            // Regression: per-child price gate must bypass in edit mode so
            // hasUnorderableChildProducts doesn't re-block the parent Update button.
            const spy = await captureActionsArgs();
            renderChildProductCard({
                childProduct: createStandardProduct(),
                parentProduct: createSetProduct(),
                onSelectionChange: mockOnSelectionChange,
                isEditMode: true,
            });
            expect(spy).toHaveBeenCalledWith(expect.objectContaining({ allowMissingPrice: true }));
        });

        test('passes allowMissingPrice=true for bundle children regardless of mode', async () => {
            // Bundle children are charged at the parent price, so they should never block on
            // their own missing price.
            const spy = await captureActionsArgs();
            renderChildProductCard({
                childProduct: createStandardProduct(),
                parentProduct: { id: 'b1', name: 'Bundle', type: { bundle: true } } as never,
                onSelectionChange: mockOnSelectionChange,
            });
            expect(spy).toHaveBeenCalledWith(expect.objectContaining({ allowMissingPrice: true }));
        });

        // Display must apply the same rule as the gate (display/gate invariant). Each gate case
        // above has a matching display assertion below — if these ever drift the row will show
        // "Price unavailable" next to an enabled control, or vice versa.

        test('ProductPrice gets allowMissingPrice=false for set children by default (matches gate)', () => {
            renderChildProductCard({
                childProduct: createStandardProduct(),
                parentProduct: createSetProduct(),
                onSelectionChange: mockOnSelectionChange,
            });
            expect(capturedProductPriceProps.last?.allowMissingPrice).toBe(false);
        });

        test('ProductPrice gets allowMissingPrice=true for set children in edit mode (matches gate)', () => {
            // Regression: prior to the fix, the gate took `!isParentProductASet || isEditMode`
            // but the display only took `!isParentProductASet`, so a set child in cart-edit
            // rendered "Price unavailable" right next to an enabled parent Update.
            renderChildProductCard({
                childProduct: createStandardProduct(),
                parentProduct: createSetProduct(),
                onSelectionChange: mockOnSelectionChange,
                isEditMode: true,
            });
            expect(capturedProductPriceProps.last?.allowMissingPrice).toBe(true);
        });

        test('ProductPrice gets allowMissingPrice=true for bundle children regardless of mode (matches gate)', () => {
            renderChildProductCard({
                childProduct: createStandardProduct(),
                parentProduct: { id: 'b1', name: 'Bundle', type: { bundle: true } } as never,
                onSelectionChange: mockOnSelectionChange,
            });
            expect(capturedProductPriceProps.last?.allowMissingPrice).toBe(true);
        });
    });
});
