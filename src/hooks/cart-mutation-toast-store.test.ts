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

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import {
    registerPendingCartMutation,
    unregisterPendingCartMutation,
    useMiniCartPendingMutations,
} from './cart-mutation-toast-store';

// The registry is module-scoped, so drain it after each test to keep them independent.
afterEach(() => {
    act(() => {
        unregisterPendingCartMutation('item-1-mini-cart-item');
        unregisterPendingCartMutation('item-1-mini-cart-remove');
        unregisterPendingCartMutation('item-2-mini-cart-item');
    });
});

describe('cart-mutation-toast-store', () => {
    test('surfaces a registered mutation to subscribers', () => {
        const { result } = renderHook(() => useMiniCartPendingMutations());
        expect(result.current).toEqual([]);

        act(() => registerPendingCartMutation('item-1-mini-cart-item', 'quantity-update'));

        expect(result.current).toEqual([{ key: 'item-1-mini-cart-item', kind: 'quantity-update' }]);
    });

    test('tracks multiple keys independently', () => {
        const { result } = renderHook(() => useMiniCartPendingMutations());

        act(() => {
            registerPendingCartMutation('item-1-mini-cart-item', 'quantity-update');
            registerPendingCartMutation('item-2-mini-cart-item', 'remove');
        });

        expect(result.current).toHaveLength(2);
        expect(result.current).toContainEqual({ key: 'item-1-mini-cart-item', kind: 'quantity-update' });
        expect(result.current).toContainEqual({ key: 'item-2-mini-cart-item', kind: 'remove' });
    });

    test('ignores an empty key (a fetcher with no stable key cannot be re-observed)', () => {
        const { result } = renderHook(() => useMiniCartPendingMutations());

        act(() => registerPendingCartMutation('', 'quantity-update'));

        expect(result.current).toEqual([]);
    });

    test('is idempotent for a repeated (key, kind): the snapshot reference is stable', () => {
        const { result } = renderHook(() => useMiniCartPendingMutations());

        act(() => registerPendingCartMutation('item-1-mini-cart-item', 'quantity-update'));
        const first = result.current;

        act(() => registerPendingCartMutation('item-1-mini-cart-item', 'quantity-update'));

        // No change means getSnapshot returns the same array reference (no useSyncExternalStore loop).
        expect(result.current).toBe(first);
    });

    test('drops a mutation on unregister', () => {
        const { result } = renderHook(() => useMiniCartPendingMutations());

        act(() => registerPendingCartMutation('item-1-mini-cart-item', 'quantity-update'));
        expect(result.current).toHaveLength(1);

        act(() => unregisterPendingCartMutation('item-1-mini-cart-item'));
        expect(result.current).toEqual([]);
    });

    test('unregistering an unknown key is a no-op with a stable snapshot', () => {
        const { result } = renderHook(() => useMiniCartPendingMutations());
        const empty = result.current;

        act(() => unregisterPendingCartMutation('never-registered'));

        expect(result.current).toBe(empty);
    });
});
