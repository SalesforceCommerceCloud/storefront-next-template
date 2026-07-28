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

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { BonusProductModal } from './index';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

// Mock dependencies
const mockFetcherLoad = vi.fn();
const mockFetcherSubmit = vi.fn();
const mockAddToast = vi.fn();

// Mock state for fetcher
let mockFetcherData: any = null;
let mockFetcherState: 'idle' | 'loading' | 'submitting' = 'idle';
let mockFetcherSuccess = false;

vi.mock('@/hooks/use-scapi-fetcher', () => ({
    useScapiFetcher: () => ({
        load: mockFetcherLoad,
        data: mockFetcherData,
        state: mockFetcherState,
        success: mockFetcherSuccess,
    }),
}));

vi.mock('@/hooks/product/use-product-images', () => ({
    useProductImages: () => ({
        galleryImages: [],
        selectedImage: null,
    }),
}));

vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: mockAddToast,
    }),
}));

// Stub only useBasketUpdater so the publish-back can be asserted; keep the rest of the provider real for any
// AllProvidersWrapper consumers.
const mockUpdateBasket = vi.fn();
vi.mock('@/providers/basket', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/providers/basket')>()),
    useBasketUpdater: () => mockUpdateBasket,
}));

vi.mock('@/providers/product-view', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useProductView: () => ({
        quantity: 1,
        setQuantity: vi.fn(),
        canAddToCart: true,
        isMasterOrVariantProduct: false,
    }),
}));

// Capture the props the modal hands to <ImageGallery> so tests can assert that the documented
// GALLERY_WIDTHS constant (and any other shape-bearing props) actually reach the component.
const capturedImageGalleryProps: { last: any } = { last: null };
vi.mock('@/components/image-gallery', () => ({
    default: (props: any) => {
        capturedImageGalleryProps.last = props;
        return <div data-testid="image-gallery">Image Gallery</div>;
    },
}));

// Capture the variationValues prop so tests can assert what the modal seeded.
const capturedProductInfoProps: { last: any } = { last: null };
vi.mock('@/components/product-view/product-info', () => ({
    default: (props: any) => {
        capturedProductInfoProps.last = props;
        return <div data-testid="product-info">Product Info</div>;
    },
}));

// Helper to render with router context - similar to CartItemEditModal pattern
function renderWithRouter(ui: React.ReactElement) {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: <AllProvidersWrapper>{ui}</AllProvidersWrapper>,
            },
        ],
        {
            initialEntries: ['/'],
        }
    );

    return render(<RouterProvider router={router} />);
}

describe('BonusProductModal', () => {
    const mockOnOpenChange = vi.fn();

    const mockProps = {
        open: true,
        onOpenChange: mockOnOpenChange,
        productId: 'test-product-123',
        productName: 'Striped Silk Tie',
        promotionId: 'promo-abc',
        bonusDiscountLineItemId: 'bdli-xyz',
        bonusDiscountSlots: [
            { id: 'bdli-xyz', maxBonusItems: 2, bonusProductsSelected: 0 },
            { id: 'bdli-abc', maxBonusItems: 1, bonusProductsSelected: 0 },
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockFetcherData = null;
        mockFetcherState = 'idle';
        mockFetcherSuccess = false;
        mockFetcherLoad.mockClear();
        mockFetcherSubmit.mockClear();
        mockAddToast.mockClear();
        capturedProductInfoProps.last = null;
        capturedImageGalleryProps.last = null;
        // Use vi.spyOn to mock useFetcher while keeping real router exports
        vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue({
            submit: mockFetcherSubmit,
            data: null,
            state: 'idle',
        } as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Rendering', () => {
        it('should render the modal when open is true', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            expect(screen.getByRole('dialog')).toBeInTheDocument();
            // The modal shows product name in the title
            expect(screen.getByText(/Striped Silk Tie/)).toBeInTheDocument();
        });

        it('should not render modal content when open is false', () => {
            renderWithRouter(<BonusProductModal {...mockProps} open={false} />);

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('should display all passed props in scaffold', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            // Check that the modal is rendered
            const dialog = screen.getByRole('dialog');
            expect(dialog).toBeInTheDocument();

            // Check that product name is displayed in title
            expect(screen.getByText(/Striped Silk Tie/)).toBeInTheDocument();

            // Check that the selected count is displayed (0 of 2 — matches maxBonusItems in mockProps).
            // Derive the text from the resolved translation rather than hardcoding the canonical
            // wording — verticals (e.g. cosmetic) override `selectionCount` to a compact "0/2" form.
            const { t } = getTranslation();
            const countText = t('cart:bonusProducts.selectionCount', { selected: 0, max: 2 }).trim();
            expect(screen.getByText((content) => content.includes(countText))).toBeInTheDocument();
        });

        it('should update when open prop changes from false to true', () => {
            const { rerender } = renderWithRouter(<BonusProductModal {...mockProps} open={false} />);

            // Initially should not be visible
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

            // Rerender with open=true - need to wrap in providers again
            const router = createMemoryRouter(
                [
                    {
                        path: '/',
                        element: (
                            <AllProvidersWrapper>
                                <BonusProductModal {...mockProps} open={true} />
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                { initialEntries: ['/'] }
            );
            rerender(<RouterProvider router={router} />);

            // Should now be visible
            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        it('should update when open prop changes from true to false', () => {
            const { rerender } = renderWithRouter(<BonusProductModal {...mockProps} open={true} />);

            // Initially should be visible
            expect(screen.getByRole('dialog')).toBeInTheDocument();

            // Rerender with open=false
            const router = createMemoryRouter(
                [
                    {
                        path: '/',
                        element: (
                            <AllProvidersWrapper>
                                <BonusProductModal {...mockProps} open={false} />
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                { initialEntries: ['/'] }
            );
            rerender(<RouterProvider router={router} />);

            // Should now be hidden
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('should have proper Dialog role', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            // Dialog element should have role="dialog"
            const dialog = screen.getByRole('dialog');

            expect(dialog).toBeInTheDocument();
            expect(dialog).toHaveAttribute('role', 'dialog');
        });
    });

    describe('User Interactions', () => {
        it('should call onOpenChange with false when close button clicked', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            // Find and click the close button
            const closeButton = screen.getByRole('button', { name: /close/i });
            fireEvent.click(closeButton);

            expect(mockOnOpenChange).toHaveBeenCalledWith(false);
            expect(mockOnOpenChange).toHaveBeenCalledTimes(1);
        });

        it('should call onOpenChange with false when ESC key pressed', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            // Press ESC key
            fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

            expect(mockOnOpenChange).toHaveBeenCalledWith(false);
        });

        it('should call onOpenChange with false when clicking outside modal', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            // Click on the overlay/backdrop (outside the modal content)
            const overlay = document.querySelector('[data-radix-dialog-overlay]');
            if (overlay) {
                fireEvent.click(overlay);
                expect(mockOnOpenChange).toHaveBeenCalledWith(false);
            }
        });

        it('should have close button enabled', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            const closeButton = screen.getByRole('button', { name: /close/i });

            expect(closeButton).toBeInTheDocument();
            expect(closeButton).not.toBeDisabled();
        });
    });

    describe('Variant pre-selection', () => {
        it('seeds variationValues from product.variationValues for variant products', () => {
            mockFetcherData = {
                id: 'variant-123',
                name: 'Variant Bonus Tie',
                type: { variant: true },
                variationValues: { color: 'NAVY', width: 'REGULAR' },
            };
            mockFetcherSuccess = true;
            mockFetcherState = 'idle';

            renderWithRouter(<BonusProductModal {...mockProps} />);

            expect(capturedProductInfoProps.last?.variationValues).toEqual({ color: 'NAVY', width: 'REGULAR' });
        });

        it('seeds variationValues from first orderable variant for master products without defaults', () => {
            mockFetcherData = {
                id: 'master-123',
                name: 'Master Bonus Tie',
                type: { master: true },
                variationAttributes: [
                    { id: 'color', name: 'Color', values: [{ value: 'NAVY' }, { value: 'RED' }] },
                    { id: 'size', name: 'Size', values: [{ value: 'M' }, { value: 'L' }] },
                ],
                variants: [
                    { productId: 'v1', variationValues: { color: 'NAVY', size: 'M' }, orderable: false },
                    { productId: 'v2', variationValues: { color: 'RED', size: 'L' }, orderable: true },
                ],
            };
            mockFetcherSuccess = true;
            mockFetcherState = 'idle';

            renderWithRouter(<BonusProductModal {...mockProps} />);

            // First orderable variant — color RED, size L — gets pre-selected so the picker is actionable.
            expect(capturedProductInfoProps.last?.variationValues).toEqual({ color: 'RED', size: 'L' });
        });

        it('respects representedProduct hint over first-orderable fallback', () => {
            mockFetcherData = {
                id: 'master-456',
                name: 'Master Bonus Tie With Hint',
                type: { master: true },
                representedProduct: { id: 'v1' },
                variationAttributes: [{ id: 'color', name: 'Color', values: [{ value: 'NAVY' }, { value: 'RED' }] }],
                variants: [
                    { productId: 'v1', variationValues: { color: 'NAVY' }, orderable: true },
                    { productId: 'v2', variationValues: { color: 'RED' }, orderable: true },
                ],
            };
            mockFetcherSuccess = true;
            mockFetcherState = 'idle';

            renderWithRouter(<BonusProductModal {...mockProps} />);

            expect(capturedProductInfoProps.last?.variationValues).toEqual({ color: 'NAVY' });
        });
    });

    describe('Add to cart result handling', () => {
        const fetcherProduct = {
            id: 'variant-123',
            name: 'Variant Bonus Tie',
            type: { variant: true },
            variationValues: { color: 'NAVY' },
        };

        function setupAndClickAdd(addToCartFetcherData: unknown) {
            mockFetcherData = fetcherProduct;
            mockFetcherSuccess = true;
            mockFetcherState = 'idle';

            // Two-phase fetcher mock: first render returns no data (so the user can click),
            // second render returns the completed result that drives the result-handling effect.
            const useFetcherSpy = vi.spyOn(ReactRouter, 'useFetcher');
            useFetcherSpy.mockReturnValueOnce({
                submit: mockFetcherSubmit,
                data: null,
                state: 'idle',
            } as any);
            useFetcherSpy.mockReturnValue({
                submit: mockFetcherSubmit,
                data: addToCartFetcherData,
                state: 'idle',
            } as any);

            const { rerender } = renderWithRouter(<BonusProductModal {...mockProps} />);
            // Click the Add to Cart button so isAddingToCart flips to true. The modal renders
            // both a desktop and mobile button; either click drives the same handler.
            const [addBtn] = screen.getAllByRole('button', { name: /add to cart/i });
            fireEvent.click(addBtn);

            // Force a rerender so the second useFetcher mock value (with data) is consumed
            const router = createMemoryRouter(
                [
                    {
                        path: '/',
                        element: (
                            <AllProvidersWrapper>
                                <BonusProductModal {...mockProps} />
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                { initialEntries: ['/'] }
            );
            rerender(<RouterProvider router={router} />);
        }

        it('does not show a success toast when add-to-cart succeeds — closes the modal instead', () => {
            setupAndClickAdd({ success: true, basket: { basketId: 'b1' } });

            // No success toast — the closing modal is the user-visible confirmation.
            const successCalls = mockAddToast.mock.calls.filter(([, level]) => level === 'success');
            expect(successCalls).toHaveLength(0);
            // Modal close was requested
            expect(mockOnOpenChange).toHaveBeenCalledWith(false);
        });

        it('publishes the action-response basket into BasketProvider on success', () => {
            const responseBasket = { basketId: 'b1', lastModified: '2026-06-24T10:00:00.000Z' };
            setupAndClickAdd({ success: true, basket: responseBasket });

            expect(mockUpdateBasket).toHaveBeenCalledWith(responseBasket);
        });

        it('does not publish a basket on a failed add-to-cart', () => {
            setupAndClickAdd({ success: false, error: { message: 'Inventory short' } });

            expect(mockUpdateBasket).not.toHaveBeenCalled();
        });

        it('shows an error toast when add-to-cart fails', () => {
            setupAndClickAdd({ success: false, error: { message: 'Inventory short' } });

            const errorCalls = mockAddToast.mock.calls.filter(([, level]) => level === 'error');
            expect(errorCalls).toHaveLength(1);
            // The translation key produces a string containing the SCAPI error
            expect(String(errorCalls[0][0])).toContain('Inventory short');
            // Modal stays open on error
            expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
        });
    });

    describe('Gallery widths', () => {
        // The bonus modal's gallery sits in `lg:max-w-4xl` (~848) with `lg:grid-cols-2`, so the gallery
        // is the full inner column below `lg` and ~408 wide at `lg+`. We deliberately snap to the shared
        // pixel ladder (lg:420 main, md:240 thumb) instead of the tight fit so this surface reuses DIS
        // cache entries with the cart-modal and the child-product-card. The constant is private to the
        // module — these assertions guard that snap by checking the values that actually reach the
        // <ImageGallery> component.
        it('passes the documented widths to <ImageGallery> (cache-ladder rungs)', () => {
            mockFetcherData = {
                id: 'variant-123',
                name: 'Variant Bonus Tie',
                type: { variant: true },
                variationValues: { color: 'NAVY' },
            };
            mockFetcherSuccess = true;
            mockFetcherState = 'idle';

            renderWithRouter(<BonusProductModal {...mockProps} />);

            expect(capturedImageGalleryProps.last?.widths).toEqual({
                main: { base: '100vw', lg: 420 },
                thumbnail: { base: 144, sm: 176, md: 240, lg: 96 },
            });
        });
    });

    describe('Styling', () => {
        it('should have correct modal dimensions', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            // Dialog is rendered in a portal, use document to query
            const dialogContent = document.querySelector('[class*="lg:max-w-4xl"]');

            expect(dialogContent).toBeInTheDocument();
            expect(dialogContent?.className).toContain('lg:max-w-4xl');
            expect(dialogContent?.className).toContain('lg:max-h-[90vh]');
            expect(dialogContent?.className).toContain('lg:overflow-y-auto');
        });
    });
});
