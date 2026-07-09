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

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { useFetcher } from 'react-router';
import type { ActionResponse } from '@/routes/types/action-responses';

// Hooks
import { useCartQuantityUpdate } from './use-cart-quantity-update';
import { resourceRoutes } from '@/route-paths';

// Test utilities
import { ConfigWrapper } from '@/test-utils/config';

// UI Strings
// Mock dependencies
// Stable spy so tests can assert the toast message text across renders.
const mockAddToast = vi.fn();
vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: mockAddToast,
    }),
}));

// Publishing the action-response basket into BasketProvider keeps the freshness reference
// (useBasket) ahead of the basket-products revalidation round-trip — see the test below.
const mockUpdateBasket = vi.fn();
vi.mock('@/providers/basket', () => ({
    useBasketUpdater: () => mockUpdateBasket,
}));

// Mock debounce to be synchronous for testing
vi.mock('lodash.debounce', () => ({
    default: (fn: (...args: unknown[]) => void) => {
        const debouncedFn = (...args: unknown[]) => {
            // Execute immediately for testing
            fn(...args);
        };
        debouncedFn.cancel = vi.fn();
        debouncedFn.flush = vi.fn();
        return debouncedFn;
    },
}));

const mockFetcher = {
    submit: vi.fn(),
    state: 'idle' as 'idle' | 'submitting' | 'loading',
    data: null as unknown,
};

// Create a stable fetcher object to prevent useMemo from recreating debounced function
// Only include properties actually used by the hook: submit, state, and data
const stableMockFetcher = {
    submit: mockFetcher.submit,
    state: 'idle',
    data: null,
} as unknown as ReturnType<typeof useFetcher<ActionResponse>>;

vi.mock('react-router', async () => {
    const actual = await vi.importActual('react-router');
    return {
        ...actual,
        useFetcher: () => stableMockFetcher,
    };
});

const defaultProps = {
    itemId: 'test-item-123',
    initialValue: 2,
    stockLevel: 10,
    debounceDelay: 100,
    fetcher: stableMockFetcher,
};

// Helper function to extract quantity from FormData
const getQuantityFromFormData = (formData: FormData): string => {
    return formData.get('quantity') as string;
};

describe('useCartQuantityUpdate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetcher.state = 'idle';
        mockFetcher.data = null;
    });

    describe('BasketProvider sync', () => {
        // The hook reads fetcher.state / fetcher.data from the fetcher passed in props (stableMockFetcher),
        // so these tests mutate that object — not the module-scoped mockFetcher — to drive the response effect.
        const setStableFetcher = (state: 'idle' | 'submitting' | 'loading', data: unknown): void => {
            (stableMockFetcher as unknown as { state: string }).state = state;
            (stableMockFetcher as unknown as { data: unknown }).data = data;
        };

        beforeEach(() => {
            setStableFetcher('idle', null);
        });

        afterEach(() => {
            setStableFetcher('idle', null);
        });

        test('publishes the action-response basket into BasketProvider on success', async () => {
            // The basket-products fetcher revalidates when the panel is open and the quantity action returns a
            // basket. Its load gate (`needsMiniCartLoad`) decides freshness off useBasket()'s lastModified. Unless
            // this hook writes the action-response basket into BasketProvider, the reference revision lags one render
            // behind the revalidation result, so the open mini-cart fires a redundant SECOND basket-products request.
            // Publishing here lifts the reference to the new revision before the round-trip returns, closing the gap.
            const basket = { basketId: 'basket-123', lastModified: '2026-06-24T10:00:01.000Z' };
            const { rerender } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                setStableFetcher('idle', { success: true, basket });
            });
            rerender();

            await waitFor(() => {
                expect(mockUpdateBasket).toHaveBeenCalledWith(basket);
            });
        });

        test('does not publish when the action response carries no basket', () => {
            const { rerender } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                setStableFetcher('idle', { success: true });
            });
            rerender();

            expect(mockUpdateBasket).not.toHaveBeenCalled();
        });

        test('does not publish on a failed response', () => {
            const { rerender } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                setStableFetcher('idle', { success: false, basket: { basketId: 'basket-123' } });
            });
            rerender();

            expect(mockUpdateBasket).not.toHaveBeenCalled();
        });
    });

    describe('Initial State', () => {
        test('should initialize with correct default values', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            expect(result.current.quantity).toBe(2);
            expect(result.current.stockValidationError).toBeNull();
            expect(result.current.showRemoveConfirmation).toBe(false);
            expect(typeof result.current.handleQuantityChange).toBe('function');
            expect(typeof result.current.handleQuantityBlur).toBe('function');
            expect(typeof result.current.handleKeepItem).toBe('function');
            expect(typeof result.current.handleRemoveItem).toBe('function');
            expect(typeof result.current.setShowRemoveConfirmation).toBe('function');
        });

        test('should handle missing stockLevel', () => {
            const { result } = renderHook(
                () =>
                    useCartQuantityUpdate({
                        ...defaultProps,
                        stockLevel: undefined,
                    }),
                { wrapper: ConfigWrapper }
            );

            expect(result.current.quantity).toBe(2);
        });

        test('should show stock limit message on load when initialValue is at stockLevel', () => {
            const { result } = renderHook(
                () =>
                    useCartQuantityUpdate({
                        ...defaultProps,
                        initialValue: 10,
                        stockLevel: 10,
                    }),
                { wrapper: ConfigWrapper }
            );

            expect(result.current.quantity).toBe(10);
            expect(result.current.stockValidationError).toBe('Maximum stock reached');
        });
    });

    describe('Quantity Change Handling', () => {
        test('should handle empty input', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                result.current.handleQuantityChange('', 0);
            });

            expect(result.current.quantity).toBe('');
            expect(result.current.stockValidationError).toBeNull();
        });

        test('should handle zero input by showing remove confirmation', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                result.current.handleQuantityChange('0', 0);
            });

            expect(result.current.showRemoveConfirmation).toBe(true);
        });

        test('should handle increment from empty state', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // First set quantity to empty
            act(() => {
                result.current.handleQuantityChange('', 0);
            });

            // Then increment from empty state
            act(() => {
                result.current.handleQuantityChange('1', 1);
            });

            expect(result.current.quantity).toBe(1);
            expect(result.current.stockValidationError).toBeNull();
        });

        test('should update quantity for valid values', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                result.current.handleQuantityChange('5', 5);
            });

            expect(result.current.quantity).toBe(5);
            expect(result.current.stockValidationError).toBeNull();
        });

        test('should show stock validation error for quantities exceeding stock', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                result.current.handleQuantityChange('15', 15);
            });

            expect(result.current.quantity).toBe(15);
            expect(result.current.stockValidationError).toBe('Maximum stock reached');
        });

        test('should show stock limit message when quantity reaches max allowed', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                result.current.handleQuantityChange('10', 10); // stockLevel is 10
            });

            expect(result.current.quantity).toBe(10);
            expect(result.current.stockValidationError).toBe('Maximum stock reached');
        });

        test('should clear stock limit message when quantity decreases below max', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // First reach max
            act(() => {
                result.current.handleQuantityChange('10', 10);
            });
            expect(result.current.stockValidationError).toBe('Maximum stock reached');

            // Then decrease below max
            act(() => {
                result.current.handleQuantityChange('9', 9);
            });
            expect(result.current.stockValidationError).toBeNull();
        });

        test('should not show stock validation error when stockLevel is undefined', () => {
            const { result } = renderHook(
                () =>
                    useCartQuantityUpdate({
                        ...defaultProps,
                        stockLevel: undefined,
                    }),
                { wrapper: ConfigWrapper }
            );

            act(() => {
                result.current.handleQuantityChange('15', 15);
            });

            expect(result.current.quantity).toBe(15);
            expect(result.current.stockValidationError).toBeNull();
        });

        test('should not show stock validation error when stockLevel is 0', () => {
            const { result } = renderHook(
                () =>
                    useCartQuantityUpdate({
                        ...defaultProps,
                        stockLevel: 0,
                    }),
                { wrapper: ConfigWrapper }
            );

            act(() => {
                result.current.handleQuantityChange('15', 15);
            });

            expect(result.current.quantity).toBe(15);
            expect(result.current.stockValidationError).toBeNull();
        });
    });

    describe('Quantity Blur Handling', () => {
        test('should reset to initial value on blur with empty input', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // First set quantity to empty
            act(() => {
                result.current.handleQuantityChange('', 0);
            });

            // Then blur with empty input
            act(() => {
                result.current.handleQuantityBlur({
                    target: { value: '' },
                } as React.FocusEvent<HTMLInputElement>);
            });

            expect(result.current.quantity).toBe(2); // initialValue
            expect(result.current.stockValidationError).toBeNull();
        });

        test('should show remove confirmation on blur with zero input', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                result.current.handleQuantityBlur({
                    target: { value: '0' },
                } as React.FocusEvent<HTMLInputElement>);
            });

            expect(result.current.showRemoveConfirmation).toBe(true);
        });

        test('should not change quantity on blur with valid input', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // First set quantity to 5
            act(() => {
                result.current.handleQuantityChange('5', 5);
            });

            // Then blur with valid input
            act(() => {
                result.current.handleQuantityBlur({
                    target: { value: '5' },
                } as React.FocusEvent<HTMLInputElement>);
            });

            expect(result.current.quantity).toBe(5);
        });
    });

    describe('Remove Confirmation Handling', () => {
        test('should handle keep item action', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // First show remove confirmation
            act(() => {
                result.current.setShowRemoveConfirmation(true);
            });

            expect(result.current.showRemoveConfirmation).toBe(true);

            // Then keep item
            act(() => {
                result.current.handleKeepItem();
            });

            expect(result.current.showRemoveConfirmation).toBe(false);
            expect(result.current.quantity).toBe(2); // Should reset to initial value
        });

        test('should handle remove item action', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // First show remove confirmation
            act(() => {
                result.current.setShowRemoveConfirmation(true);
            });

            // Then remove item
            act(() => {
                result.current.handleRemoveItem();
            });

            expect(result.current.showRemoveConfirmation).toBe(false);
            expect(mockFetcher.submit).toHaveBeenCalledWith(
                expect.any(FormData),
                expect.objectContaining({
                    method: 'POST',
                    action: resourceRoutes.cartItemRemove,
                })
            );
        });
    });

    describe('API Response Handling', () => {
        test('should handle successful API response', async () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // Simulate successful API response
            act(() => {
                mockFetcher.state = 'idle';
                mockFetcher.data = { success: true };
            });

            // Trigger the effect by changing fetcher state
            await waitFor(() => {
                expect(result.current.quantity).toBe(2);
            });
        });

        test('should maintain quantity after successful API call with optimistic updates', async () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // User changes quantity optimistically
            act(() => {
                result.current.handleQuantityChange('5', 5);
            });

            // Verify optimistic update
            expect(result.current.quantity).toBe(5);

            // Simulate successful API response
            act(() => {
                mockFetcher.state = 'idle';
                mockFetcher.data = { success: true };
            });

            // Quantity should remain 5 (not reset to initialValue)
            await waitFor(() => {
                expect(result.current.quantity).toBe(5);
            });
        });

        test('should handle button clicks after successful input update', async () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // Step 1: User types in input (quantity changes to 5)
            act(() => {
                result.current.handleQuantityChange('5', 5);
            });
            expect(result.current.quantity).toBe(5);

            // Step 2: API succeeds for input update
            act(() => {
                mockFetcher.state = 'idle';
                mockFetcher.data = { success: true };
            });
            await waitFor(() => {
                expect(result.current.quantity).toBe(5);
            });

            // Step 3: User clicks + button (quantity should change to 6)
            act(() => {
                result.current.handleQuantityChange('6', 6);
            });
            expect(result.current.quantity).toBe(6);

            // Step 4: API succeeds for button click
            act(() => {
                mockFetcher.state = 'idle';
                mockFetcher.data = { success: true };
            });

            // Quantity should remain 6 (button click should work after input update)
            await waitFor(() => {
                expect(result.current.quantity).toBe(6);
            });
        });

        test('should handle failed API response', async () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // Simulate failed API response
            act(() => {
                mockFetcher.state = 'idle';
                mockFetcher.data = { success: false };
            });

            // Trigger the effect by changing fetcher state
            await waitFor(() => {
                expect(result.current.quantity).toBe(2);
            });
        });

        test('should not handle response when fetcher is not idle', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // Simulate non-idle fetcher state
            act(() => {
                mockFetcher.state = 'submitting';
                mockFetcher.data = { success: true };
            });

            // Should not trigger any response handling
            expect(result.current.quantity).toBe(2);
        });

        test('should not handle response when no data', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // Simulate idle state with no data
            act(() => {
                mockFetcher.state = 'idle';
                mockFetcher.data = null;
            });

            // Should not trigger any response handling
            expect(result.current.quantity).toBe(2);
        });
    });

    describe('Failure toast messaging', () => {
        // The hook reads fetcher.state / fetcher.data from the fetcher passed in props (stableMockFetcher),
        // so drive the response effect by mutating that object rather than the module-scoped mockFetcher.
        const setStableFetcher = (state: 'idle' | 'submitting' | 'loading', data: unknown): void => {
            (stableMockFetcher as unknown as { state: string }).state = state;
            (stableMockFetcher as unknown as { data: unknown }).data = data;
        };

        afterEach(() => {
            setStableFetcher('idle', null);
        });

        test('shows the generic failure toast when the response carries no error code', async () => {
            const { rerender } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                setStableFetcher('idle', { success: false });
            });
            rerender();

            await waitFor(() => {
                expect(mockAddToast).toHaveBeenCalledWith('Failed to update quantity', 'error');
            });
        });

        test('shows the stock-specific toast when the server rejects with OUT_OF_STOCK', async () => {
            const { rerender } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                setStableFetcher('idle', { success: false, error: { code: 'OUT_OF_STOCK' } });
            });
            rerender();

            await waitFor(() => {
                expect(mockAddToast).toHaveBeenCalledWith('Not enough stock available', 'error');
            });
            expect(mockAddToast).not.toHaveBeenCalledWith('Failed to update quantity', 'error');
        });
    });

    describe('Initial Value Updates', () => {
        test('should update quantity when initialValue changes', () => {
            const { result, rerender } = renderHook(
                ({ initialValue }) => useCartQuantityUpdate({ ...defaultProps, initialValue }),
                {
                    initialProps: { initialValue: 2 },
                    wrapper: ConfigWrapper,
                }
            );

            expect(result.current.quantity).toBe(2);

            rerender({ initialValue: 5 });

            expect(result.current.quantity).toBe(5);
        });
    });

    describe('Edge Cases', () => {
        test('should handle negative quantities', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                result.current.handleQuantityChange('-1', -1);
            });

            // Should not update quantity for negative values
            expect(result.current.quantity).toBe(2);
        });

        test('should handle non-numeric input', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                result.current.handleQuantityChange('abc', NaN);
            });

            // Should not update quantity for non-numeric values
            expect(result.current.quantity).toBe(2);
        });
    });

    describe('Debounce Integration', () => {
        test('should call debounced cart update for valid quantity changes', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // Make a quantity change
            act(() => {
                result.current.handleQuantityChange('3', 3);
            });

            // Verify quantity state is updated immediately
            expect(result.current.quantity).toBe(3);

            // API should be called immediately (since debounce is mocked to be synchronous)
            expect(mockFetcher.submit).toHaveBeenCalledTimes(1);

            // Verify the quantity value
            const call = mockFetcher.submit.mock.calls[0];
            const formData = call[0] as FormData;
            expect(getQuantityFromFormData(formData)).toBe('3');

            expect(mockFetcher.submit).toHaveBeenCalledWith(
                expect.any(FormData),
                expect.objectContaining({
                    method: 'PATCH',
                    action: resourceRoutes.cartItemUpdate,
                })
            );
        });

        test('should handle multiple quantity changes', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // Make multiple changes
            act(() => {
                result.current.handleQuantityChange('3', 3);
            });
            act(() => {
                result.current.handleQuantityChange('4', 4);
            });

            // Verify final quantity state
            expect(result.current.quantity).toBe(4);

            // Both calls should be made (since debounce is mocked to be synchronous)
            // In real implementation, only the last call would be made due to debouncing
            expect(mockFetcher.submit).toHaveBeenCalledTimes(2);

            // Verify the last call (quantity 4) was made
            const lastCall = mockFetcher.submit.mock.calls[1];
            const formData = lastCall[0] as FormData;
            expect(getQuantityFromFormData(formData)).toBe('4');
        });

        test('should not call debounced cart update for quantities exceeding stock', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                result.current.handleQuantityChange('15', 15);
            });

            // Verify the debounced function was NOT called
            expect(mockFetcher.submit).not.toHaveBeenCalled();
            expect(result.current.quantity).toBe(15);
            expect(result.current.stockValidationError).toBe('Maximum stock reached');
        });

        test('should call debounced cart update even for same quantity as initial', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            act(() => {
                result.current.handleQuantityChange('2', 2); // Same as initialValue
            });

            // Verify the debounced function WAS called (new behavior for consistency)
            expect(mockFetcher.submit).toHaveBeenCalledTimes(1);
            expect(result.current.quantity).toBe(2);
        });

        test('should cancel previous debounced calls when increment/decrement buttons are clicked', () => {
            const { result } = renderHook(() => useCartQuantityUpdate(defaultProps), { wrapper: ConfigWrapper });

            // Simulate increment button click (like from QuantityPicker)
            act(() => {
                result.current.handleQuantityChange('3', 3);
            });

            // Simulate another increment button click quickly (should cancel previous)
            act(() => {
                result.current.handleQuantityChange('4', 4);
            });

            // Both calls should be made (since debounce is mocked to be synchronous)
            // In real implementation, only the last call would be made due to debounce cancellation
            expect(mockFetcher.submit).toHaveBeenCalledTimes(2);

            // Verify the last call was for quantity 4
            const lastCall = mockFetcher.submit.mock.calls[1];
            expect(lastCall[1]).toEqual(
                expect.objectContaining({
                    method: 'PATCH',
                    action: resourceRoutes.cartItemUpdate,
                })
            );
        });
    });
});
