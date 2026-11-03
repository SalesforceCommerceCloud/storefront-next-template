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
import { act, renderHook } from '@testing-library/react';
import { useReorder } from './use-reorder';
import type { ReorderActionResponse } from '@/routes/types/action-responses';

const mocks = vi.hoisted(() => ({
    submit: vi.fn(),
    addToast: vi.fn(),
    updateBasket: vi.fn(),
    setMiniCartOpen: vi.fn(),
    /** Captures the latest useFetcherEffect config so tests can invoke callbacks directly. */
    effectConfig: null as {
        onSuccess?: (data: ReorderActionResponse | undefined) => void;
        onError?: (error: string | string[], data?: ReorderActionResponse) => void;
    } | null,
}));

vi.mock('react-router', () => ({
    useFetcher: () => ({ state: 'idle', data: undefined, submit: mocks.submit }),
    useCallback: (fn: unknown) => fn,
}));

vi.mock('@/hooks/use-fetcher-effect', () => ({
    useFetcherEffect: (
        _fetcher: unknown,
        config: {
            onSuccess?: (data: ReorderActionResponse | undefined) => void;
            onError?: (error: string | string[], data?: ReorderActionResponse) => void;
        }
    ) => {
        mocks.effectConfig = config;
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/providers/basket', () => ({
    useBasketUpdater: () => mocks.updateBasket,
}));

vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: mocks.addToast }),
}));

vi.mock('@/hooks/mini-cart-store', () => ({
    setMiniCartOpen: (open: boolean) => mocks.setMiniCartOpen(open),
}));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.effectConfig = null;
});

const makeBasket = () => ({ basketId: 'b-1', lastModified: '2026-01-01T00:00:00.000Z' });

describe('useReorder — onSuccess callbacks', () => {
    it('add-all happy path: updates basket, opens mini cart, fires no toast', () => {
        renderHook(() => useReorder('ORDER-1'));

        act(() => {
            mocks.effectConfig?.onSuccess?.({
                success: true,
                basket: makeBasket() as never,
                skippedItems: [],
                adjustedItems: [],
            });
        });

        expect(mocks.updateBasket).toHaveBeenCalledWith(makeBasket());
        expect(mocks.setMiniCartOpen).toHaveBeenCalledWith(true);
        expect(mocks.addToast).not.toHaveBeenCalled();
    });

    it('add-all with OOS skip: updates basket and fires partial-skip toast with count', () => {
        renderHook(() => useReorder('ORDER-1'));

        act(() => {
            mocks.effectConfig?.onSuccess?.({
                success: true,
                basket: makeBasket() as never,
                skippedItems: [{ productId: 'p1', reason: 'OUT_OF_STOCK' }] as never,
                adjustedItems: [],
            });
        });

        expect(mocks.updateBasket).toHaveBeenCalledWith(makeBasket());
        expect(mocks.setMiniCartOpen).toHaveBeenCalledWith(true);
        expect(mocks.addToast).toHaveBeenCalledWith('orders.reorderPartialSkip', 'info');
    });

    it('all items unavailable (empty-order guard): fires reorderAllSkipped toast, does not update basket', () => {
        renderHook(() => useReorder('ORDER-1'));

        act(() => {
            mocks.effectConfig?.onSuccess?.({
                success: true,
                basket: undefined,
                skippedItems: [{ productId: 'p1', reason: 'OUT_OF_STOCK' }] as never,
                adjustedItems: [],
            });
        });

        expect(mocks.updateBasket).not.toHaveBeenCalled();
        expect(mocks.setMiniCartOpen).not.toHaveBeenCalled();
        expect(mocks.addToast).toHaveBeenCalledWith('orders.reorderAllSkipped', 'info');
    });

    it('fires reorderFailed toast on action error', () => {
        renderHook(() => useReorder('ORDER-1'));

        act(() => {
            mocks.effectConfig?.onError?.('something went wrong');
        });

        expect(mocks.addToast).toHaveBeenCalledWith('orders.reorderFailed', 'error');
        expect(mocks.updateBasket).not.toHaveBeenCalled();
    });
});

describe('useReorder — reorder() submit', () => {
    it('submits with the correct orderNo and default quantityMode (exact)', () => {
        const { result } = renderHook(() => useReorder('ORDER-99'));

        act(() => {
            result.current.reorder();
        });

        expect(mocks.submit).toHaveBeenCalledOnce();
        const [formData, options] = mocks.submit.mock.calls[0] as [FormData, { method: string; action: string }];
        expect(formData.get('orderNo')).toBe('ORDER-99');
        expect(formData.get('quantityMode')).toBe('exact');
        expect(options).toMatchObject({ method: 'POST', action: '/action/cart-reorder' });
    });

    it('submits with custom quantityMode when provided', () => {
        const { result } = renderHook(() => useReorder('ORDER-99', 'available'));

        act(() => {
            result.current.reorder();
        });

        const [formData] = mocks.submit.mock.calls[0] as [FormData, unknown];
        expect(formData.get('quantityMode')).toBe('available');
    });
});
