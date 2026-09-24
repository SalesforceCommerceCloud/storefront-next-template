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
import type { ShopperBasketsV2 } from '@/scapi';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { ErrorCode } from '@/lib/error-codes';
import { resourceRoutes } from '@/route-paths';
import { ConfigWrapper } from '@/test-utils/config';
import type { BasketActionResponse } from '@/routes/types/action-responses';
import { useInlineCartQuantity } from './use-inline-cart-quantity';

const mockAddToast = vi.fn();
const mockUpdateBasket = vi.fn();
const mockLoadBasket = vi.fn();
const mockUseBasket = vi.fn();
const mockSubmit = vi.fn();
let mockBasket: ShopperBasketsV2.schemas['Basket'] | undefined;
let mockBasketSnapshot: { basketId?: string } | null | undefined;
let mockBasketHydrated = false;
let mockBasketError: string[] | null | undefined;
let hasPendingItemMutation = false;
const mockFetcher: {
    state: 'idle' | 'loading' | 'submitting';
    data: BasketActionResponse | undefined;
    submit: typeof mockSubmit;
} = {
    state: 'idle',
    data: undefined,
    submit: mockSubmit,
};

vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock('@/providers/basket', () => ({
    useBasket: (options: { autoLoad?: boolean }) => {
        mockUseBasket(options);
        return mockBasket;
    },
    useBasketSnapshot: () => mockBasketSnapshot,
    useBasketHydrated: () => mockBasketHydrated,
    useBasketError: () => mockBasketError,
    useBasketLoader: () => mockLoadBasket,
    useBasketUpdater: () => mockUpdateBasket,
}));

vi.mock('@/hooks/use-item-fetcher', () => ({
    useItemFetcher: () => mockFetcher,
    useItemFetcherLoading: () => hasPendingItemMutation,
}));

const createBasket = (
    productItems: ShopperBasketsV2.schemas['ProductItem'][],
    shipments?: ShopperBasketsV2.schemas['Shipment'][]
): ShopperBasketsV2.schemas['Basket'] =>
    ({ basketId: 'basket-1', productItems, shipments }) as ShopperBasketsV2.schemas['Basket'];

const createItem = (
    overrides: Partial<ShopperBasketsV2.schemas['ProductItem']> = {}
): ShopperBasketsV2.schemas['ProductItem'] =>
    // A ship-to-home add lands in the default `me` shipment (see action.cart-item-add). The pickup
    // test overrides this with its own shipment id.
    ({
        itemId: 'item-1',
        productId: 'sku-a',
        quantity: 2,
        shipmentId: 'me',
        ...overrides,
    }) as ShopperBasketsV2.schemas['ProductItem'];

const getSubmittedFormData = (): FormData => mockSubmit.mock.calls[0]?.[0] as FormData;
const getSubmitOptions = (): { method: string; action: string } =>
    mockSubmit.mock.calls[0]?.[1] as { method: string; action: string };

// Quantity submits are debounced (see use-inline-cart-quantity.ts). Tests that assert the network
// call use fake timers and flush the debounce window; the test config sets the delay to 750ms.
const flushDebounce = () =>
    act(() => {
        vi.advanceTimersByTime(1000);
    });

describe('useInlineCartQuantity', () => {
    const { t } = getTranslation();

    beforeEach(() => {
        vi.clearAllMocks();
        mockBasket = undefined;
        mockBasketSnapshot = { basketId: 'basket-1' };
        mockBasketHydrated = true;
        mockBasketError = null;
        hasPendingItemMutation = false;
        mockFetcher.state = 'idle';
        mockFetcher.data = undefined;
    });

    afterEach(() => {
        // Tests opt into fake timers individually; restore real timers so async waitFor tests are unaffected.
        vi.useRealTimers();
    });

    test('does not use a basket line while the inline control is disabled', () => {
        mockBasket = createBasket([createItem({ quantity: 4 })]);

        const { result } = renderHook(() => useInlineCartQuantity({ productId: 'sku-a', enabled: false }), {
            wrapper: ConfigWrapper,
        });

        expect(mockUseBasket).toHaveBeenCalledWith({ autoLoad: false });
        expect(result.current.quantityInCart).toBe(0);
    });

    test('increments the selected delivery line through the cart update action', () => {
        vi.useFakeTimers();
        mockBasket = createBasket([createItem()]);
        const { result } = renderHook(
            () => useInlineCartQuantity({ productId: 'sku-a', stockLevel: 5, enabled: true }),
            { wrapper: ConfigWrapper }
        );

        act(() => {
            result.current.increment();
        });

        expect(result.current.quantityInCart).toBe(3);
        flushDebounce();
        expect(getSubmittedFormData()).toEqual(expect.any(FormData));
        expect(getSubmittedFormData().get('itemId')).toBe('item-1');
        expect(getSubmittedFormData().get('quantity')).toBe('3');
        expect(getSubmitOptions()).toEqual({ method: 'PATCH', action: resourceRoutes.cartItemUpdate });
    });

    test('updates only the line in the selected pickup store', () => {
        mockBasket = createBasket(
            [
                createItem({ itemId: 'delivery-line', quantity: 2 }),
                createItem({ itemId: 'pickup-line', quantity: 4, shipmentId: 'pickup-shipment' }),
            ],
            [{ shipmentId: 'pickup-shipment', c_fromStoreId: 'store-a' }]
        );
        vi.useFakeTimers();
        const { result } = renderHook(
            () => useInlineCartQuantity({ productId: 'sku-a', storeId: 'store-a', enabled: true }),
            { wrapper: ConfigWrapper }
        );

        act(() => {
            result.current.increment();
        });

        expect(result.current.quantityInCart).toBe(5);
        flushDebounce();
        expect(getSubmittedFormData().get('itemId')).toBe('pickup-line');
        expect(getSubmittedFormData().get('quantity')).toBe('5');
    });

    test('does not increment when the basket quantity has reached available stock', () => {
        mockBasket = createBasket([createItem({ quantity: 2 })]);
        const { result } = renderHook(
            () => useInlineCartQuantity({ productId: 'sku-a', stockLevel: 2, enabled: true }),
            { wrapper: ConfigWrapper }
        );

        expect(result.current.incrementDisabled).toBe(true);
        act(() => {
            result.current.increment();
        });

        expect(mockSubmit).not.toHaveBeenCalled();
    });

    test('uses an item-specific quantity limit before available stock', () => {
        mockBasket = createBasket([createItem({ quantity: 2 })]);
        const { result } = renderHook(
            () => useInlineCartQuantity({ productId: 'sku-a', stockLevel: 10, maxQuantity: 2, enabled: true }),
            { wrapper: ConfigWrapper }
        );

        expect(result.current.incrementDisabled).toBe(true);
        act(() => {
            result.current.increment();
        });

        expect(mockSubmit).not.toHaveBeenCalled();
    });

    test('does not increment past available stock when the configured limit is higher', () => {
        mockBasket = createBasket([createItem({ quantity: 2 })]);
        const { result } = renderHook(
            () => useInlineCartQuantity({ productId: 'sku-a', stockLevel: 2, maxQuantity: 10, enabled: true }),
            { wrapper: ConfigWrapper }
        );

        expect(result.current.incrementDisabled).toBe(true);
        act(() => {
            result.current.increment();
        });

        expect(mockSubmit).not.toHaveBeenCalled();
    });

    test('does not increment when the item limit is zero', () => {
        mockBasket = createBasket([createItem({ quantity: 1 })]);
        const { result } = renderHook(
            () => useInlineCartQuantity({ productId: 'sku-a', stockLevel: 10, maxQuantity: 0, enabled: true }),
            { wrapper: ConfigWrapper }
        );

        expect(result.current.incrementDisabled).toBe(true);
        act(() => {
            result.current.increment();
        });

        expect(mockSubmit).not.toHaveBeenCalled();
    });

    test('decrements a multi-unit line through the cart update action', () => {
        vi.useFakeTimers();
        mockBasket = createBasket([createItem({ quantity: 2 })]);
        const { result } = renderHook(() => useInlineCartQuantity({ productId: 'sku-a', enabled: true }), {
            wrapper: ConfigWrapper,
        });

        act(() => {
            result.current.decrement();
        });

        expect(result.current.quantityInCart).toBe(1);
        flushDebounce();
        expect(getSubmittedFormData().get('itemId')).toBe('item-1');
        expect(getSubmittedFormData().get('quantity')).toBe('1');
        expect(getSubmitOptions()).toEqual({ method: 'PATCH', action: resourceRoutes.cartItemUpdate });
    });

    test('removes a single-unit line instead of submitting a zero quantity', () => {
        vi.useFakeTimers();
        mockBasket = createBasket([createItem({ quantity: 1 })]);
        const { result } = renderHook(() => useInlineCartQuantity({ productId: 'sku-a', enabled: true }), {
            wrapper: ConfigWrapper,
        });

        act(() => {
            result.current.decrement();
        });

        expect(result.current.quantityInCart).toBe(0);
        flushDebounce();
        expect(getSubmittedFormData().get('itemId')).toBe('item-1');
        expect(getSubmittedFormData().get('quantity')).toBeNull();
        expect(getSubmitOptions()).toEqual({ method: 'POST', action: '/action/cart-item-remove' });
    });

    test('coalesces rapid increments into a single update carrying the final quantity', () => {
        vi.useFakeTimers();
        mockBasket = createBasket([createItem({ quantity: 2 })]);
        const { result } = renderHook(
            () => useInlineCartQuantity({ productId: 'sku-a', stockLevel: 10, enabled: true }),
            { wrapper: ConfigWrapper }
        );

        // Separate ticks so each tap sees the previous optimistic quantity, as separate taps would.
        act(() => {
            result.current.increment();
        });
        act(() => {
            result.current.increment();
        });
        act(() => {
            result.current.increment();
        });

        // Every tap advances the displayed quantity immediately.
        expect(result.current.quantityInCart).toBe(5);

        // Nothing is submitted mid-burst.
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(mockSubmit).not.toHaveBeenCalled();

        // One submit carrying the trailing quantity once the burst settles.
        flushDebounce();
        expect(mockSubmit).toHaveBeenCalledTimes(1);
        expect(getSubmittedFormData().get('quantity')).toBe('5');
        expect(getSubmitOptions()).toEqual({ method: 'PATCH', action: resourceRoutes.cartItemUpdate });
    });

    test('coalesces rapid decrements down to a single remove', () => {
        vi.useFakeTimers();
        mockBasket = createBasket([createItem({ quantity: 2 })]);
        const { result } = renderHook(() => useInlineCartQuantity({ productId: 'sku-a', enabled: true }), {
            wrapper: ConfigWrapper,
        });

        act(() => {
            result.current.decrement();
        });
        act(() => {
            result.current.decrement();
        });

        expect(result.current.quantityInCart).toBe(0);

        flushDebounce();
        expect(mockSubmit).toHaveBeenCalledTimes(1);
        expect(getSubmittedFormData().get('quantity')).toBeNull();
        expect(getSubmitOptions()).toEqual({ method: 'POST', action: '/action/cart-item-remove' });
    });

    test('does not drop a tap made during an in-flight update, and flushes it once the line is free', () => {
        vi.useFakeTimers();
        mockBasket = createBasket([createItem({ quantity: 2 })]);
        const { result, rerender } = renderHook(
            () => useInlineCartQuantity({ productId: 'sku-a', stockLevel: 10, enabled: true }),
            { wrapper: ConfigWrapper }
        );

        // An update for this line is in flight.
        mockFetcher.state = 'submitting';
        rerender();
        expect(result.current.isUpdating).toBe(true);

        // Taps during the in-flight update still advance the displayed quantity immediately and coalesce,
        // rather than being dropped by the busy line.
        act(() => {
            result.current.increment();
        });
        act(() => {
            result.current.increment();
        });
        expect(result.current.quantityInCart).toBe(4);

        // Nothing new is submitted while the line is busy.
        flushDebounce();
        expect(mockSubmit).not.toHaveBeenCalled();

        // Once the in-flight update settles, the queued taps flush as a single trailing submit carrying
        // the final quantity.
        act(() => {
            mockFetcher.state = 'idle';
        });
        rerender();
        flushDebounce();
        expect(mockSubmit).toHaveBeenCalledTimes(1);
        expect(getSubmittedFormData().get('quantity')).toBe('4');
        expect(getSubmitOptions()).toEqual({ method: 'PATCH', action: resourceRoutes.cartItemUpdate });
    });

    test('cancels a pending quantity update on unmount', () => {
        vi.useFakeTimers();
        mockBasket = createBasket([createItem({ quantity: 2 })]);
        const { result, unmount } = renderHook(
            () => useInlineCartQuantity({ productId: 'sku-a', stockLevel: 10, enabled: true }),
            { wrapper: ConfigWrapper }
        );

        act(() => {
            result.current.increment();
        });
        unmount();
        act(() => {
            vi.advanceTimersByTime(1000);
        });

        expect(mockSubmit).not.toHaveBeenCalled();
    });

    test('publishes the returned basket after a successful mutation', async () => {
        mockBasket = createBasket([createItem({ quantity: 2 })]);
        const { result, rerender } = renderHook(() => useInlineCartQuantity({ productId: 'sku-a', enabled: true }), {
            wrapper: ConfigWrapper,
        });
        const updatedBasket = createBasket([createItem({ quantity: 3 })]);

        act(() => {
            result.current.increment();
            mockBasket = updatedBasket;
            mockFetcher.data = { success: true, basket: updatedBasket };
        });
        rerender();

        await waitFor(() => {
            expect(mockUpdateBasket).toHaveBeenCalledWith(updatedBasket);
        });
        expect(result.current.quantityInCart).toBe(3);
    });

    test('restores the basket quantity and reports an out-of-stock rejection', async () => {
        mockBasket = createBasket([createItem({ quantity: 2 })]);
        const { result, rerender } = renderHook(() => useInlineCartQuantity({ productId: 'sku-a', enabled: true }), {
            wrapper: ConfigWrapper,
        });

        act(() => {
            result.current.increment();
        });
        expect(result.current.quantityInCart).toBe(3);

        act(() => {
            mockFetcher.data = { success: false, error: { code: ErrorCode.OUT_OF_STOCK, message: 'Out of stock' } };
        });
        rerender();

        await waitFor(() => {
            expect(mockAddToast).toHaveBeenCalledWith(t('quantitySelector:insufficientStock'), 'error');
        });
        expect(result.current.quantityInCart).toBe(2);
        expect(mockUpdateBasket).not.toHaveBeenCalled();
    });

    test('does not start another mutation while this basket line is pending elsewhere', () => {
        mockBasket = createBasket([createItem()]);
        hasPendingItemMutation = true;
        const { result } = renderHook(() => useInlineCartQuantity({ productId: 'sku-a', enabled: true }), {
            wrapper: ConfigWrapper,
        });

        expect(result.current.isUpdating).toBe(true);
        act(() => {
            result.current.increment();
        });

        expect(mockSubmit).not.toHaveBeenCalled();
    });

    test('reports the quantity as resolving while the basket auto-loads', () => {
        mockBasket = undefined;
        mockBasketSnapshot = { basketId: 'basket-1' };
        mockBasketHydrated = false;

        const { result } = renderHook(() => useInlineCartQuantity({ productId: 'sku-a', enabled: true }), {
            wrapper: ConfigWrapper,
        });

        expect(result.current.isResolvingQuantity).toBe(true);
        expect(result.current.quantityInCart).toBe(0);
    });

    test('is not resolving once the basket has hydrated', () => {
        mockBasket = createBasket([createItem({ quantity: 2 })]);
        mockBasketHydrated = true;

        const { result } = renderHook(() => useInlineCartQuantity({ productId: 'sku-a', enabled: true }), {
            wrapper: ConfigWrapper,
        });

        expect(result.current.isResolvingQuantity).toBe(false);
        expect(result.current.quantityInCart).toBe(2);
    });

    test('is not resolving for a shopper with no basket to fetch', () => {
        mockBasket = undefined;
        mockBasketSnapshot = null;
        mockBasketHydrated = false;

        const { result } = renderHook(() => useInlineCartQuantity({ productId: 'sku-a', enabled: true }), {
            wrapper: ConfigWrapper,
        });

        expect(result.current.isResolvingQuantity).toBe(false);
    });

    test('holds the CTA while retrying, then releases it once the retry settles with a failure', () => {
        // A failed load leaves a basket id, no current basket, and hydrated true. The hook retries the
        // load once and keeps the quantity resolving across that retry, so the CTA can't offer a
        // first-add mid-retry and duplicate a line the retry is about to reveal.
        mockBasket = undefined;
        mockBasketSnapshot = { basketId: 'basket-1' };
        mockBasketHydrated = true;
        mockBasketError = ['load failed'];

        const { result, rerender } = renderHook(() => useInlineCartQuantity({ productId: 'sku-a', enabled: true }), {
            wrapper: ConfigWrapper,
        });

        // The retry is in flight (same error reference), so the quantity is still resolving.
        expect(result.current.isResolvingQuantity).toBe(true);
        expect(result.current.quantityInCart).toBe(0);
        expect(mockLoadBasket).toHaveBeenCalledTimes(1);

        // The retry fails again: a fresh error reference arrives with no basket. The load is now
        // terminally failed, so the CTA is released rather than blocked indefinitely, and the retry is
        // not fired a second time.
        mockBasketError = ['load failed again'];
        rerender();

        expect(result.current.isResolvingQuantity).toBe(false);
        expect(result.current.quantityInCart).toBe(0);
        expect(mockLoadBasket).toHaveBeenCalledTimes(1);
    });

    test('does not inherit retry exhaustion across a basket hand-off', () => {
        // Basket A's load fails and its retry fails, so A is terminally exhausted and the CTA releases.
        mockBasket = undefined;
        mockBasketSnapshot = { basketId: 'basket-a' };
        mockBasketHydrated = true;
        mockBasketError = ['a load failed'];
        const { result, rerender } = renderHook(() => useInlineCartQuantity({ productId: 'sku-a', enabled: true }), {
            wrapper: ConfigWrapper,
        });
        expect(result.current.isResolvingQuantity).toBe(true);
        mockBasketError = ['a load failed again'];
        rerender();
        expect(result.current.isResolvingQuantity).toBe(false);

        // A guest-to-registered hand-off switches to basket B while the provider still carries A's error
        // for the first B render. B's exhaustion is its own, so the CTA must stay resolving until B's own
        // load and retry settle rather than inheriting A's terminal state.
        mockBasketSnapshot = { basketId: 'basket-b' };
        mockBasketError = ['b load failed'];
        rerender();
        expect(result.current.isResolvingQuantity).toBe(true);
    });
});
