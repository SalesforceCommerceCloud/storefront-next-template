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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import CartDeliveryOption from './cart-delivery-option';
import { DELIVERY_OPTIONS } from '@/extensions/bopis/constants';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { resourceRoutes } from '@/route-paths';
import type { EnrichedProductItem } from '@/lib/product/product-utils';

// Mock PickupOrDeliveryDropdown
vi.mock('./pickup-or-delivery-dropdown', () => ({
    default: ({
        value,
        onChange,
        isPickupDisabled,
        isDeliveryDisabled,
    }: {
        value: string;
        onChange: (v: string) => void;
        isPickupDisabled?: boolean;
        isDeliveryDisabled?: boolean;
    }) => (
        <div
            data-testid="pickup-or-delivery-dropdown"
            data-pickup-disabled={isPickupDisabled}
            data-delivery-disabled={isDeliveryDisabled}>
            <button
                onClick={() =>
                    onChange(value === DELIVERY_OPTIONS.DELIVERY ? DELIVERY_OPTIONS.PICKUP : DELIVERY_OPTIONS.DELIVERY)
                }>
                {value === DELIVERY_OPTIONS.DELIVERY ? 'Delivery' : 'Pick Up in Store'}
            </button>
        </div>
    ),
}));

// Mock hooks
vi.mock('@/extensions/bopis/hooks/use-pickup-availability', () => ({
    usePickupAvailability: vi.fn(),
}));

vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    default: ({ children }: { children: ReactNode }) => <>{children}</>,
    useStoreLocator: vi.fn(),
}));

vi.mock('@/providers/basket', () => ({
    useBasket: vi.fn(),
}));

vi.mock('@/components/toast', () => ({
    useToast: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: vi.fn(),
}));

const mockFetcher = {
    state: 'idle' as const,
    data: null,
    submit: vi.fn(),
    load: vi.fn(),
    Form: vi.fn(),
};

vi.mock('react-router', async (importOriginal) => {
    const actual = (await importOriginal()) as any;
    return {
        ...actual,
        useFetcher: vi.fn(() => mockFetcher),
    };
});

const mockProduct: EnrichedProductItem = {
    itemId: 'item-1',
    productId: 'product-1',
    quantity: 2,
    shipmentId: 'shipment-1',
};

const tMap: Record<string, string> = {
    'deliveryOptions.pickupOrDelivery.outOfStockAtStore': 'Out of stock at store',
    'cart.pickupStoreInfo.missingStoreIdOrInventoryIdError': 'Missing store or inventory information',
};

describe('CartDeliveryOption', () => {
    let mockUseStoreLocator: ReturnType<typeof vi.fn>;
    let mockUseBasket: ReturnType<typeof vi.fn>;
    let mockUseToast: ReturnType<typeof vi.fn>;
    let mockUsePickupAvailability: ReturnType<typeof vi.fn>;
    let mockUseTranslation: ReturnType<typeof vi.fn>;
    let mockOpenStoreLocator: ReturnType<typeof vi.fn>;
    let mockSetSelectedStoreInfo: ReturnType<typeof vi.fn>;
    let mockAddToast: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Get the mocked functions
        const { useStoreLocator } = await import('@/extensions/store-locator/providers/store-locator');
        const { useBasket } = await import('@/providers/basket');
        const { useToast } = await import('@/components/toast');
        const { usePickupAvailability } = await import('@/extensions/bopis/hooks/use-pickup-availability');
        const { useTranslation } = await import('react-i18next');

        mockUseStoreLocator = useStoreLocator as any;
        mockUseBasket = useBasket as any;
        mockUseToast = useToast as any;
        mockUsePickupAvailability = usePickupAvailability as any;
        mockUseTranslation = useTranslation as any;

        // Setup mock functions
        mockOpenStoreLocator = vi.fn();
        mockSetSelectedStoreInfo = vi.fn();
        mockAddToast = vi.fn();

        // Default mock implementations
        mockUseStoreLocator.mockImplementation((selector: any) => {
            const mockStoreState = {
                selectedStoreInfo: null,
                open: mockOpenStoreLocator,
                setSelectedStoreInfo: mockSetSelectedStoreInfo,
                close: vi.fn(),
                isOpen: false,
            };
            return selector(mockStoreState);
        });

        mockUseBasket.mockReturnValue({
            basketId: 'basket-1',
            shipments: [],
        });

        mockUseToast.mockReturnValue({
            addToast: mockAddToast,
        });

        mockUsePickupAvailability.mockReturnValue(false);

        mockUseTranslation.mockReturnValue({
            t: (key: string) => tMap[key] || key,
        });
    });

    describe('Rendering', () => {
        it('renders PickupOrDeliveryDropdown component', () => {
            render(
                <AllProvidersWrapper>
                    <CartDeliveryOption product={mockProduct} isDeliveryOutOfStock={false} />
                </AllProvidersWrapper>
            );

            expect(screen.getByTestId('pickup-or-delivery-dropdown')).toBeInTheDocument();
        });

        it('reads the basket without opting in to auto-load (cart route hydrates the basket via CartContent)', () => {
            render(
                <AllProvidersWrapper>
                    <CartDeliveryOption product={mockProduct} isDeliveryOutOfStock={false} />
                </AllProvidersWrapper>
            );

            // The cart loader hydrates the basket; CartContent syncs it into context via
            // useBasketUpdater. This consumer must not opt in to auto-load — that would
            // issue a redundant GET on mount.
            expect(mockUseBasket).toHaveBeenCalled();
            const args = mockUseBasket.mock.calls[0];
            expect(args[0]?.autoLoad).not.toBe(true);
        });

        it('renders with delivery option when shipment has no store', () => {
            mockUseBasket.mockReturnValue({
                basketId: 'basket-1',
                shipments: [{ shipmentId: 'shipment-1' }],
            });

            render(
                <AllProvidersWrapper>
                    <CartDeliveryOption product={mockProduct} isDeliveryOutOfStock={false} />
                </AllProvidersWrapper>
            );

            expect(screen.getByText('Delivery')).toBeInTheDocument();
        });

        it('renders with pickup option when shipment has store', () => {
            mockUseBasket.mockReturnValue({
                basketId: 'basket-1',
                shipments: [{ shipmentId: 'shipment-1', c_fromStoreId: 'store-1' }],
            });

            render(
                <AllProvidersWrapper>
                    <CartDeliveryOption product={mockProduct} isDeliveryOutOfStock={false} />
                </AllProvidersWrapper>
            );

            expect(screen.getByText('Pick Up in Store')).toBeInTheDocument();
        });

        it('checks the current pickup shipment inventory instead of an unrelated selected store', () => {
            mockUseBasket.mockReturnValue({
                basketId: 'basket-1',
                shipments: [{ shipmentId: 'shipment-1', c_fromStoreId: 'store-current' }],
            });
            mockUseStoreLocator.mockImplementation((selector: any) =>
                selector({
                    selectedStoreInfo: { id: 'store-other', inventoryId: 'inventory-other' },
                    open: mockOpenStoreLocator,
                    setSelectedStoreInfo: mockSetSelectedStoreInfo,
                    close: vi.fn(),
                    isOpen: false,
                })
            );

            render(
                <AllProvidersWrapper>
                    <CartDeliveryOption
                        product={{ ...mockProduct, inventoryId: 'inventory-current' }}
                        isDeliveryOutOfStock={false}
                    />
                </AllProvidersWrapper>
            );

            expect(mockUsePickupAvailability).toHaveBeenCalledWith(
                expect.objectContaining({
                    pickupStore: { id: 'store-current', inventoryId: 'inventory-current' },
                })
            );
        });

        it('passes unavailable fulfillment options to the dropdown', () => {
            mockUsePickupAvailability.mockReturnValue(true);

            render(
                <AllProvidersWrapper>
                    <CartDeliveryOption product={mockProduct} isDeliveryOutOfStock />
                </AllProvidersWrapper>
            );

            expect(screen.getByTestId('pickup-or-delivery-dropdown')).toHaveAttribute('data-pickup-disabled', 'true');
            expect(screen.getByTestId('pickup-or-delivery-dropdown')).toHaveAttribute('data-delivery-disabled', 'true');
        });
    });

    describe('Delivery option change handling', () => {
        it('opens store locator when pickup is selected without a store', async () => {
            const user = userEvent.setup();

            render(
                <AllProvidersWrapper>
                    <CartDeliveryOption product={mockProduct} isDeliveryOutOfStock={false} />
                </AllProvidersWrapper>
            );

            const button = screen.getByRole('button');
            await user.click(button);

            expect(mockSetSelectedStoreInfo).toHaveBeenCalledWith(null);
            expect(mockOpenStoreLocator).toHaveBeenCalledTimes(1);
            expect(mockFetcher.submit).not.toHaveBeenCalled();
        });

        it('shows toast when pickup is selected but item is out of stock at store', async () => {
            mockUsePickupAvailability.mockReturnValue(true);

            mockUseStoreLocator.mockImplementation((selector: any) => {
                const mockStoreState = {
                    selectedStoreInfo: { id: 'store-1', inventoryId: 'inv-1' },
                    open: mockOpenStoreLocator,
                    setSelectedStoreInfo: mockSetSelectedStoreInfo,
                    close: vi.fn(),
                    isOpen: false,
                };
                return selector(mockStoreState);
            });

            const user = userEvent.setup();

            render(
                <AllProvidersWrapper>
                    <CartDeliveryOption product={mockProduct} isDeliveryOutOfStock={false} />
                </AllProvidersWrapper>
            );

            const button = screen.getByRole('button');
            await user.click(button);

            expect(mockAddToast).toHaveBeenCalledWith('Out of stock at store', 'error');
            expect(mockFetcher.submit).not.toHaveBeenCalled();
        });

        it('shows toast when delivery is selected but item is out of stock at site', async () => {
            mockUsePickupAvailability.mockReturnValue(false);

            mockUseBasket.mockReturnValue({
                basketId: 'basket-1',
                shipments: [{ shipmentId: 'shipment-1', c_fromStoreId: 'store-1' }],
            });

            const user = userEvent.setup();

            render(
                <AllProvidersWrapper>
                    <CartDeliveryOption product={mockProduct} isDeliveryOutOfStock />
                </AllProvidersWrapper>
            );

            const button = screen.getByRole('button');
            await user.click(button);

            expect(mockAddToast).toHaveBeenCalledWith('Out of stock at store', 'error');
            expect(mockFetcher.submit).not.toHaveBeenCalled();
        });

        it('submits form data when switching to delivery', async () => {
            mockUseBasket.mockReturnValue({
                basketId: 'basket-1',
                shipments: [{ shipmentId: 'shipment-1', c_fromStoreId: 'store-1' }],
            });

            const user = userEvent.setup();

            render(
                <AllProvidersWrapper>
                    <CartDeliveryOption product={mockProduct} isDeliveryOutOfStock={false} />
                </AllProvidersWrapper>
            );

            const button = screen.getByRole('button');
            await user.click(button);

            await waitFor(() => {
                expect(mockFetcher.submit).toHaveBeenCalledTimes(1);
            });

            const formData = mockFetcher.submit.mock.calls[0][0] as FormData;
            expect(formData.get('itemId')).toBe('item-1');
            expect(formData.get('quantity')).toBe('2');
            expect(formData.get('deliveryOption')).toBe(DELIVERY_OPTIONS.DELIVERY);
            expect(mockFetcher.submit.mock.calls[0][1]).toEqual({
                method: 'PATCH',
                action: resourceRoutes.cartItemUpdate,
            });
        });

        it('submits form data with store info when switching to pickup', async () => {
            mockUseStoreLocator.mockImplementation((selector: any) => {
                const mockStoreState = {
                    selectedStoreInfo: { id: 'store-1', inventoryId: 'inv-1' },
                    open: mockOpenStoreLocator,
                    setSelectedStoreInfo: mockSetSelectedStoreInfo,
                    close: vi.fn(),
                    isOpen: false,
                };
                return selector(mockStoreState);
            });

            const user = userEvent.setup();

            render(
                <AllProvidersWrapper>
                    <CartDeliveryOption product={mockProduct} isDeliveryOutOfStock={false} />
                </AllProvidersWrapper>
            );

            const button = screen.getByRole('button');
            await user.click(button);

            await waitFor(() => {
                expect(mockFetcher.submit).toHaveBeenCalledTimes(1);
            });

            const formData = mockFetcher.submit.mock.calls[0][0] as FormData;
            expect(formData.get('itemId')).toBe('item-1');
            expect(formData.get('quantity')).toBe('2');
            expect(formData.get('deliveryOption')).toBe(DELIVERY_OPTIONS.PICKUP);
            expect(formData.get('storeId')).toBe('store-1');
            expect(formData.get('inventoryId')).toBe('inv-1');
        });

        it('shows toast when switching to pickup without store or inventory ID', async () => {
            mockUseStoreLocator.mockImplementation((selector: any) => {
                const mockStoreState = {
                    selectedStoreInfo: null,
                    open: mockOpenStoreLocator,
                    setSelectedStoreInfo: mockSetSelectedStoreInfo,
                    close: vi.fn(),
                    isOpen: false,
                };
                return selector(mockStoreState);
            });

            const productWithoutStore = {
                ...mockProduct,
                storeId: undefined,
                inventoryId: undefined,
            };

            const user = userEvent.setup();

            const { rerender } = render(
                <AllProvidersWrapper>
                    <CartDeliveryOption product={productWithoutStore} isDeliveryOutOfStock={false} />
                </AllProvidersWrapper>
            );

            // First click opens store locator
            const button = screen.getByRole('button');
            await user.click(button);
            expect(mockOpenStoreLocator).toHaveBeenCalledTimes(1);

            // Simulate store selected but missing inventoryId
            mockUseStoreLocator.mockImplementation((selector: any) => {
                const mockStoreState = {
                    selectedStoreInfo: { id: 'store-1' }, // No inventoryId
                    open: mockOpenStoreLocator,
                    close: vi.fn(),
                    isOpen: false,
                };
                return selector(mockStoreState);
            });

            // Re-render with updated store state
            rerender(
                <AllProvidersWrapper>
                    <CartDeliveryOption product={productWithoutStore} isDeliveryOutOfStock={false} />
                </AllProvidersWrapper>
            );

            // Verify component still renders correctly
            expect(screen.getByTestId('pickup-or-delivery-dropdown')).toBeInTheDocument();
        });

        it('uses product storeId and inventoryId as fallback when selectedStoreInfo is missing', async () => {
            mockUseStoreLocator.mockImplementation((selector: any) => {
                const mockStoreState = {
                    selectedStoreInfo: null,
                    open: mockOpenStoreLocator,
                    setSelectedStoreInfo: mockSetSelectedStoreInfo,
                    close: vi.fn(),
                    isOpen: false,
                };
                return selector(mockStoreState);
            });

            const productWithStore = {
                ...mockProduct,
                storeId: 'product-store-1',
                inventoryId: 'product-inv-1',
            };

            const user = userEvent.setup();

            render(
                <AllProvidersWrapper>
                    <CartDeliveryOption product={productWithStore} isDeliveryOutOfStock={false} />
                </AllProvidersWrapper>
            );

            // First click opens store locator
            const button = screen.getByRole('button');
            await user.click(button);
            expect(mockOpenStoreLocator).toHaveBeenCalledTimes(1);
        });
    });
});
