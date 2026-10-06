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

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { CartMutationToastWatcher } from './cart-mutation-toast-watcher';

// The watcher's only observable effects are the toast and the unregister call, so spy on both.
const mockAddToast = vi.fn();
vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: mockAddToast }),
}));

// Identity t(): the resolvers run for real, so a success/error still maps to the right key and variant.
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

// Controllable fetcher. The mock ignores the key (one item per test) and returns this mutable object.
let fetcherState: { state: string; data: unknown } = { state: 'idle', data: undefined };
vi.mock('react-router', () => ({
    useFetcher: () => fetcherState,
}));

// Controllable registry: the watcher renders one leaf per entry, and each leaf unregisters after firing.
const mockUnregister = vi.fn();
let pending: Array<{ key: string; kind: 'quantity-update' | 'remove' }> = [];
vi.mock('@/hooks/cart-mutation-toast-store', () => ({
    useMiniCartPendingMutations: () => pending,
    unregisterPendingCartMutation: (...args: unknown[]) => mockUnregister(...args),
}));

beforeEach(() => {
    pending = [];
    fetcherState = { state: 'idle', data: undefined };
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('CartMutationToastWatcher', () => {
    test('fires the confirmation toast once and unregisters when a handed-off update settles', () => {
        pending = [{ key: 'item-1-mini-cart-item', kind: 'quantity-update' }];
        fetcherState = { state: 'idle', data: { success: true } };

        render(<CartMutationToastWatcher />);

        expect(mockAddToast).toHaveBeenCalledTimes(1);
        expect(mockAddToast).toHaveBeenCalledWith('quantityUpdated', 'success');
        expect(mockUnregister).toHaveBeenCalledWith('item-1-mini-cart-item');
    });

    test('fires the error toast for a rejected handed-off update', () => {
        pending = [{ key: 'item-1-mini-cart-item', kind: 'quantity-update' }];
        fetcherState = { state: 'idle', data: { success: false, error: { code: 'OUT_OF_STOCK' } } };

        render(<CartMutationToastWatcher />);

        expect(mockAddToast).toHaveBeenCalledTimes(1);
        expect(mockAddToast).toHaveBeenCalledWith('insufficientStock', 'error');
    });

    test('fires the remove toast for a handed-off removal', () => {
        pending = [{ key: 'item-1-mini-cart-remove', kind: 'remove' }];
        fetcherState = { state: 'idle', data: { success: true } };

        render(<CartMutationToastWatcher />);

        expect(mockAddToast).toHaveBeenCalledTimes(1);
        expect(mockAddToast).toHaveBeenCalledWith('success', 'success');
    });

    test('does not fire while the request is still in flight', () => {
        pending = [{ key: 'item-1-mini-cart-item', kind: 'quantity-update' }];
        fetcherState = { state: 'submitting', data: undefined };

        render(<CartMutationToastWatcher />);

        expect(mockAddToast).not.toHaveBeenCalled();
        expect(mockUnregister).not.toHaveBeenCalled();
    });

    test('does not fire for a settled response that is not a cart mutation result', () => {
        pending = [{ key: 'item-1-mini-cart-item', kind: 'quantity-update' }];
        // An unrelated/malformed payload reusing the key: idle and non-null, but no boolean `success`.
        fetcherState = { state: 'idle', data: { redirect: '/login' } };

        render(<CartMutationToastWatcher />);

        expect(mockAddToast).not.toHaveBeenCalled();
        expect(mockUnregister).not.toHaveBeenCalled();
    });

    test('fires only once even if the settled data reference changes on a later render', () => {
        pending = [{ key: 'item-1-mini-cart-item', kind: 'quantity-update' }];
        fetcherState = { state: 'idle', data: { success: true } };

        const { rerender } = render(<CartMutationToastWatcher />);
        expect(mockAddToast).toHaveBeenCalledTimes(1);

        // A fresh object with the same settled result must not re-fire (firedRef guard, also covers StrictMode).
        fetcherState = { state: 'idle', data: { success: true } };
        rerender(<CartMutationToastWatcher />);

        expect(mockAddToast).toHaveBeenCalledTimes(1);
    });

    test('renders nothing and fires nothing when there are no pending mutations', () => {
        const { container } = render(<CartMutationToastWatcher />);

        expect(container).toBeEmptyDOMElement();
        expect(mockAddToast).not.toHaveBeenCalled();
    });
});
