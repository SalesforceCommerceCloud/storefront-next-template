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
import type { ShopperStores } from '@/scapi';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';
import CartPickup from './index';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

// Mock useFetcher from react-router
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

// Mock useToast
const mockAddToast = vi.fn();
vi.mock('@/components/toast', () => ({
    useToast: vi.fn(() => ({ addToast: mockAddToast })),
}));

// Mock useStoreLocator
const mockSelectedStoreInfo = vi.fn<() => SelectedStoreInfo | null>(() => null);
const mockIsStoreLocatorOpen = vi.fn<() => boolean>(() => false);
const mockOpenStoreLocator = vi.fn();
const mockSetSelectedStoreInfoRaw = vi.fn();

vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    default: ({ children }: { children: ReactNode }) => <>{children}</>,
    useStoreLocator: vi.fn((selector: (store: any) => any) => {
        const mockStore = {
            selectedStoreInfo: mockSelectedStoreInfo(),
            isOpen: mockIsStoreLocatorOpen(),
            open: mockOpenStoreLocator,
            setSelectedStoreInfo: mockSetSelectedStoreInfoRaw,
        };
        return selector(mockStore);
    }),
}));

// Mock useChangePickupStore
const mockChangeStore = vi.fn();
vi.mock('@/extensions/bopis/hooks/use-change-pickup-store', () => ({
    useChangePickupStore: () => ({
        changeStore: mockChangeStore,
    }),
}));

const mockStore: ShopperStores.schemas['Store'] = {
    id: 'store-001',
    name: 'Somerville Square',
    address1: '478 Artisan Way',
    city: 'Somerville',
    stateCode: 'MA',
    postalCode: '02145',
    countryCode: 'US',
    inventoryId: 'inventory-001',
};

describe('CartPickup', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSelectedStoreInfo.mockReturnValue(null);
        mockIsStoreLocatorOpen.mockReturnValue(false);
    });

    describe('Rendering', () => {
        it('renders store name and address', () => {
            render(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            expect(screen.getByText(/Pick up in/)).toBeInTheDocument();
            expect(screen.getByText(/1 out of 4 items/)).toBeInTheDocument();
            expect(screen.getByText('Somerville Square')).toBeInTheDocument();
            expect(screen.getByText(/478 Artisan Way/)).toBeInTheDocument();
            expect(screen.getByText(/Somerville, MA 02145/)).toBeInTheDocument();
        });

        it('uses singular item when basket has one line item', () => {
            render(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={1} />
                </AllProvidersWrapper>
            );

            expect(screen.getByText(/1 out of 1 item$/)).toBeInTheDocument();
            expect(screen.queryByText(/1 out of 1 items/)).not.toBeInTheDocument();
        });

        it('renders Change Store button', () => {
            render(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            expect(screen.getByText('Change Store')).toBeInTheDocument();
        });

        it('renders with data-testid attribute', () => {
            render(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            expect(screen.getByTestId('cart-pickup-card')).toBeInTheDocument();
        });

        it('renders store icon', () => {
            const { container } = render(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            // Check for Store icon from lucide-react (rendered as SVG)
            const storeIcon = container.querySelector('svg');
            expect(storeIcon).toBeInTheDocument();
        });

        it('renders StoreAddress component with store prop', () => {
            render(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            // StoreAddress should render the address
            expect(screen.getByText(/478 Artisan Way/)).toBeInTheDocument();
            expect(screen.getByText(/Somerville, MA 02145/)).toBeInTheDocument();
        });

        it('handles store without name', () => {
            const storeWithoutName: ShopperStores.schemas['Store'] = {
                ...mockStore,
                name: undefined,
            };

            render(
                <AllProvidersWrapper>
                    <CartPickup store={storeWithoutName} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            // Should still render "Pick up in" text
            expect(screen.getByText(/Pick up in/)).toBeInTheDocument();
            // Heading uses store id when name is missing
            expect(screen.getByText('store-001')).toBeInTheDocument();
        });
    });

    describe('Change Store Button Interaction', () => {
        it('sets selectedStoreInfo and opens store locator when button is clicked', async () => {
            const user = userEvent.setup();

            render(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            const changeStoreButton = screen.getByText('Change Store');
            await user.click(changeStoreButton);

            // Verify that setSelectedStoreInfoRaw was called with the full store object
            // (normalization happens inside setSelectedStoreInfo)
            expect(mockSetSelectedStoreInfoRaw).toHaveBeenCalledWith(mockStore);

            // Verify that openStoreLocator was called (unscoped when no pickupContext is provided)
            expect(mockOpenStoreLocator).toHaveBeenCalledTimes(1);
            expect(mockOpenStoreLocator).toHaveBeenCalledWith(undefined);
        });

        it('forwards the pickup context to the store locator so it can scope by inventory', async () => {
            const user = userEvent.setup();
            const pickupContext = { productId: 'ln-heritage-005', quantity: 2 };

            render(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} pickupContext={pickupContext} />
                </AllProvidersWrapper>
            );

            await user.click(screen.getByText('Change Store'));

            expect(mockOpenStoreLocator).toHaveBeenCalledWith(pickupContext);
        });

        it('uses store.id as fallback when store.name is undefined', async () => {
            const user = userEvent.setup();
            const storeWithoutName: ShopperStores.schemas['Store'] = {
                ...mockStore,
                name: undefined,
            };

            render(
                <AllProvidersWrapper>
                    <CartPickup store={storeWithoutName} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            const changeStoreButton = screen.getByText('Change Store');
            await user.click(changeStoreButton);

            // Verify that setSelectedStoreInfoRaw was called with the full store object
            // (normalization with name fallback happens inside setSelectedStoreInfo)
            expect(mockSetSelectedStoreInfoRaw).toHaveBeenCalledWith(storeWithoutName);
        });
    });

    describe('Store Selection Change Handling', () => {
        it('applies the store change when a different boutique is selected and the picker closes', async () => {
            const differentStore: SelectedStoreInfo = {
                id: 'store-002',
                name: 'Different Store',
                inventoryId: 'inventory-002',
            };
            const user = userEvent.setup();

            // Locator open, current store selected — click "Change Store" to mark a pending change for this group.
            mockIsStoreLocatorOpen.mockReturnValue(true);
            mockSelectedStoreInfo.mockReturnValue({
                id: 'store-001',
                name: 'Somerville Square',
                inventoryId: 'inventory-001',
            });
            const { rerender } = render(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );
            await user.click(screen.getByText('Change Store'));

            // Picker closes on select (luxury pattern): sheet closed + a different boutique chosen.
            mockIsStoreLocatorOpen.mockReturnValue(false);
            mockSelectedStoreInfo.mockReturnValue(differentStore);
            rerender(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            await waitFor(() => {
                expect(mockChangeStore).toHaveBeenCalledWith({
                    id: 'store-002',
                    name: 'Different Store',
                    inventoryId: 'inventory-002',
                });
            });
        });

        it('does not call changeStore when same store is selected', async () => {
            const sameStore: SelectedStoreInfo = {
                id: 'store-001',
                name: 'Somerville Square',
                inventoryId: 'inventory-001',
            };

            // Set up initial state: locator is open, same store is selected
            mockIsStoreLocatorOpen.mockReturnValue(true);
            mockSelectedStoreInfo.mockReturnValue(sameStore);

            const { rerender } = render(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            // Trigger re-render
            rerender(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            // Wait a bit to ensure useEffect has run
            await waitFor(
                () => {
                    // changeStore should not be called because it's the same store
                    expect(mockChangeStore).not.toHaveBeenCalled();
                },
                { timeout: 100 }
            );
        });

        it('does not call changeStore when locator is closed', async () => {
            const differentStore: SelectedStoreInfo = {
                id: 'store-002',
                name: 'Different Store',
                inventoryId: 'inventory-002',
            };

            // Set up initial state: locator is closed, different store is selected
            mockIsStoreLocatorOpen.mockReturnValue(false);
            mockSelectedStoreInfo.mockReturnValue(differentStore);

            const { rerender } = render(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            // Trigger re-render
            rerender(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            // Wait a bit to ensure useEffect has run
            await waitFor(
                () => {
                    // changeStore should not be called because locator is closed
                    expect(mockChangeStore).not.toHaveBeenCalled();
                },
                { timeout: 100 }
            );
        });

        it('does not call changeStore when selectedStoreInfo is null', async () => {
            // Set up initial state: locator is open, but no store is selected
            mockIsStoreLocatorOpen.mockReturnValue(true);
            mockSelectedStoreInfo.mockReturnValue(null);

            const { rerender } = render(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            // Trigger re-render
            rerender(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            // Wait a bit to ensure useEffect has run
            await waitFor(
                () => {
                    // changeStore should not be called because selectedStoreInfo is null
                    expect(mockChangeStore).not.toHaveBeenCalled();
                },
                { timeout: 100 }
            );
        });

        it('does not call changeStore when selectedStoreInfo is missing inventoryId', async () => {
            const storeWithoutInventoryId: SelectedStoreInfo = {
                id: 'store-002',
                name: 'Different Store',
                // inventoryId is missing
            };

            // Set up initial state: locator is open, different store is selected but without inventoryId
            mockIsStoreLocatorOpen.mockReturnValue(true);
            mockSelectedStoreInfo.mockReturnValue(storeWithoutInventoryId);

            const { rerender } = render(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            // Trigger re-render
            rerender(
                <AllProvidersWrapper>
                    <CartPickup store={mockStore} pickupCount={1} totalCount={4} />
                </AllProvidersWrapper>
            );

            // Wait a bit to ensure useEffect has run
            await waitFor(
                () => {
                    // changeStore should not be called because inventoryId is missing
                    expect(mockChangeStore).not.toHaveBeenCalled();
                },
                { timeout: 100 }
            );
        });
    });
});
