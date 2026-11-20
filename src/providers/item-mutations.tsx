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
import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react';
import { getItemFetcherKey } from '@/hooks/use-item-fetcher';
import { useBasketItemStore } from '@/providers/basket-item-state';
import { getStore, IDLE, type Submit } from '@/providers/item-mutations-store';
import ItemMutationsRuntime from '@/providers/item-mutations-runtime';

/** Item-specific action response and pending state, including mutations initiated by cart or PDP controls. */
export function useItemMutation(itemId: string | undefined, basketId: string | undefined) {
    const basket = useBasketItemStore();
    const store = getStore(basket);
    const key = itemId ? getItemFetcherKey(itemId, `inline-add-to-cart-${basketId ?? ''}`) : undefined;
    const getSnapshot = useCallback(() => store.read(key), [store, key]);
    const getServerSnapshot = useCallback(() => IDLE, []);
    const getPending = useCallback(() => store.isPending(itemId), [store, itemId]);
    const state = useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot);
    const pending = useSyncExternalStore(store.subscribe, getPending, () => false);
    const active = Boolean(itemId);
    useLayoutEffect(() => (active ? basket.retainRuntime(ItemMutationsRuntime) : undefined), [basket, active]);
    useLayoutEffect(() => (key ? store.retain(key) : undefined), [store, key, basketId]);
    const submit = useCallback<Submit>(
        (...args) => {
            if (!key) return Promise.resolve();
            return store.submit(key, ...args);
        },
        [store, key]
    );
    return { ...state, pending, submit };
}
