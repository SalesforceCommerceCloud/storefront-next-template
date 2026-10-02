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
import { useSyncExternalStore } from 'react';
import { EMPTY_CART_FULFILLMENT_STATE, parseCartFulfillmentState } from './cart-fulfillment';
import type { CartFulfillmentState } from './types';

/**
 * Browser storage for the cart fulfillment JSON.
 *
 * The SSR snapshot is always empty, so server and first client render match (no hydration mismatch);
 * stored data appears right after hydration. Storage access is wrapped in try/catch because it can
 * throw or be empty (private windows, blocked site data); an in-memory copy keeps the page working.
 * The Salesforce basket stays the source of truth, this JSON is a client-side fulfillment context.
 */
export const CART_FULFILLMENT_STORAGE_KEY = 'sf.multiCityFulfillment.v1';

const listeners = new Set<() => void>();
let memoryState: CartFulfillmentState = EMPTY_CART_FULFILLMENT_STATE;
let cachedRaw: string | null | undefined;
let cachedState: CartFulfillmentState = EMPTY_CART_FULFILLMENT_STATE;

function readRaw(): string | null | undefined {
    try {
        return window.localStorage.getItem(CART_FULFILLMENT_STORAGE_KEY);
    } catch {
        return undefined; // storage unavailable -> use memory copy
    }
}

/** Stable-reference snapshot: only re-parses when the stored string actually changed. */
export function getCartFulfillmentSnapshot(): CartFulfillmentState {
    if (typeof window === 'undefined') return EMPTY_CART_FULFILLMENT_STATE;
    const raw = readRaw();
    if (raw === undefined) return memoryState;
    if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedState = parseCartFulfillmentState(raw);
    }
    return cachedState;
}

function notify() {
    listeners.forEach((listener) => listener());
}

/** Persist a new state and notify subscribers. */
export function writeCartFulfillmentState(state: CartFulfillmentState): void {
    memoryState = state;
    try {
        if (state.cartItems.length === 0) {
            window.localStorage.removeItem(CART_FULFILLMENT_STORAGE_KEY);
        } else {
            window.localStorage.setItem(CART_FULFILLMENT_STORAGE_KEY, JSON.stringify(state));
        }
    } catch {
        // storage full / blocked: the in-memory copy above still serves this session
    }
    notify();
}

/** Read-modify-write helper: `update` receives the current state and returns the next one. */
export function updateCartFulfillmentState(update: (state: CartFulfillmentState) => CartFulfillmentState): void {
    const current = getCartFulfillmentSnapshot();
    const next = update(current);
    if (next !== current) writeCartFulfillmentState(next);
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
        if (event.key === CART_FULFILLMENT_STORAGE_KEY || event.key === null) listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
    };
}

const getServerSnapshot = (): CartFulfillmentState => EMPTY_CART_FULFILLMENT_STATE;

export function useCartFulfillmentState(): CartFulfillmentState {
    return useSyncExternalStore(subscribe, getCartFulfillmentSnapshot, getServerSnapshot);
}
