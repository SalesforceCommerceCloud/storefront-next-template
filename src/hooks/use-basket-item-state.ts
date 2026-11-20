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
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { BasketProviderValue } from '@/providers/basket';
import { useBasketItemStore } from '@/providers/basket-item-state';
import { findBasketItemForProduct } from '@/lib/cart/find-basket-item';

export interface BasketItemState {
    basketId?: string;
    itemId?: string;
    quantity: number;
    hasBasket: boolean;
    hydrated: boolean;
    error?: string[] | null;
}
/** Subscribe only to a SKU/fulfillment slice, preserving the provider's existing deduplicated hydration. */
export function useBasketItemState(
    productId: string | undefined,
    storeId: string | null | undefined,
    enabled: boolean,
    loadBasket: () => void
): BasketItemState {
    const store = useBasketItemStore();
    const cache = useRef<{
        source: BasketProviderValue;
        productId: string | undefined;
        storeId: string | null | undefined;
        enabled: boolean;
        value: BasketItemState;
    } | null>(null);
    const select = useCallback(
        (source: BasketProviderValue) => {
            const prev = cache.current;
            if (
                prev?.source === source &&
                prev.productId === productId &&
                prev.storeId === storeId &&
                prev.enabled === enabled
            )
                return prev.value;
            const basketId = source.snapshot?.basketId ?? source.current?.basketId;
            const basket = !basketId || source.current?.basketId === basketId ? source.current : undefined;
            const item = enabled ? findBasketItemForProduct(basket, productId, storeId) : undefined;
            const next: BasketItemState = {
                basketId,
                itemId: item?.itemId,
                quantity: item ? (item.quantity ?? 1) : 0,
                hasBasket: Boolean(basket),
                hydrated: source.hydrated ?? false,
                error: source.error,
            };
            const value =
                prev &&
                Object.keys(next).every(
                    (key) => next[key as keyof BasketItemState] === prev.value[key as keyof BasketItemState]
                )
                    ? prev.value
                    : next;
            cache.current = { source, productId, storeId, enabled, value };
            return value;
        },
        [productId, storeId, enabled]
    );
    const getSnapshot = useCallback(() => select(store.getState()), [select, store]);
    const getServerSnapshot = useCallback(() => select(store.getServerState()), [select, store]);
    const value = useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot);
    useEffect(() => {
        if (enabled && !value.hasBasket && value.basketId) loadBasket();
    }, [enabled, value.hasBasket, value.basketId, loadBasket]);
    return value;
}
