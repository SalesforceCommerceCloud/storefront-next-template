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
import { getDefaultLocation, getProductAvailability, toCartFulfillment } from './availability';
import type { BasketLine, CartFulfillment, CartFulfillmentItem, CartFulfillmentState, DeliveryGroup } from './types';

/**
 * Pure state transitions for the fulfillment JSON kept in browser storage. Every function returns a
 * new state (or the same reference when nothing changed) and never mutates its input.
 */

export const EMPTY_CART_FULFILLMENT_STATE: CartFulfillmentState = Object.freeze({ cartItems: [] }) as never;

/** Add a product, or replace the quantity + location of an existing one (one location per product). */
export function upsertItem(state: CartFulfillmentState, item: CartFulfillmentItem): CartFulfillmentState {
    const exists = state.cartItems.some((existing) => existing.productId === item.productId);
    return {
        cartItems: exists
            ? state.cartItems.map((existing) => (existing.productId === item.productId ? item : existing))
            : [...state.cartItems, item],
    };
}

export function removeItem(state: CartFulfillmentState, productId: string): CartFulfillmentState {
    const cartItems = state.cartItems.filter((item) => item.productId !== productId);
    return cartItems.length === state.cartItems.length ? state : { cartItems };
}

/** Quantity <= 0 removes the item. */
export function updateQuantity(state: CartFulfillmentState, productId: string, quantity: number): CartFulfillmentState {
    if (quantity <= 0) return removeItem(state, productId);
    return {
        cartItems: state.cartItems.map((item) => (item.productId === productId ? { ...item, quantity } : item)),
    };
}

export function changeLocation(
    state: CartFulfillmentState,
    productId: string,
    fulfillment: CartFulfillment
): CartFulfillmentState {
    return {
        cartItems: state.cartItems.map((item) => (item.productId === productId ? { ...item, fulfillment } : item)),
    };
}

/**
 * Join basket lines with stored fulfillment data. A line without a stored entry gets the product's
 * default (best) location; lines for products with no fulfillment data are left out.
 */
export function resolveCartItems(lines: readonly BasketLine[], state: CartFulfillmentState): CartFulfillmentItem[] {
    const resolved: CartFulfillmentItem[] = [];
    for (const line of lines) {
        if (!line.productId || line.quantity <= 0) continue;
        const stored = state.cartItems.find((item) => item.productId === line.productId);
        if (stored) {
            resolved.push({ ...stored, productName: line.productName || stored.productName, quantity: line.quantity });
            continue;
        }
        const product = getProductAvailability(line.productId);
        const location = getDefaultLocation(line.productId);
        if (!product || !location) continue;
        resolved.push({
            productId: line.productId,
            productName: line.productName || product.productName,
            sku: product.sku,
            quantity: line.quantity,
            fulfillment: toCartFulfillment(location),
        });
    }
    return resolved;
}

/**
 * Make the stored JSON match the basket (the source of truth for what is in the cart): drops removed
 * products, syncs quantities, and adds entries for basket lines that have none. Returns the same
 * `state` reference when nothing changed so callers can skip a write.
 */
export function reconcileWithBasket(state: CartFulfillmentState, lines: readonly BasketLine[]): CartFulfillmentState {
    const next: CartFulfillmentState = { cartItems: resolveCartItems(lines, state) };
    return JSON.stringify(next) === JSON.stringify(state) ? state : next;
}

/** Group items by fulfillment location, keeping first-seen order. */
export function groupByLocation(items: readonly CartFulfillmentItem[]): DeliveryGroup[] {
    const groups = new Map<string, DeliveryGroup>();
    for (const item of items) {
        const { locationId, city, postalCode } = item.fulfillment;
        const group = groups.get(locationId) ?? { locationId, city, postalCode, items: [] };
        group.items.push(item);
        groups.set(locationId, group);
    }
    return [...groups.values()];
}

/** Validate untrusted JSON (browser storage can be edited or corrupted). Invalid entries are dropped. */
export function parseCartFulfillmentState(raw: string | null): CartFulfillmentState {
    if (!raw) return EMPTY_CART_FULFILLMENT_STATE;
    try {
        const parsed = JSON.parse(raw) as { cartItems?: unknown };
        if (!Array.isArray(parsed.cartItems)) return EMPTY_CART_FULFILLMENT_STATE;
        const cartItems = parsed.cartItems.filter(isCartFulfillmentItem);
        return cartItems.length ? { cartItems } : EMPTY_CART_FULFILLMENT_STATE;
    } catch {
        return EMPTY_CART_FULFILLMENT_STATE;
    }
}

function isCartFulfillmentItem(value: unknown): value is CartFulfillmentItem {
    if (typeof value !== 'object' || value === null) return false;
    const item = value as Partial<CartFulfillmentItem>;
    const fulfillment = item.fulfillment as Partial<CartFulfillment> | undefined;
    return (
        typeof item.productId === 'string' &&
        typeof item.quantity === 'number' &&
        item.quantity > 0 &&
        typeof fulfillment === 'object' &&
        fulfillment !== null &&
        typeof fulfillment.locationId === 'string' &&
        typeof fulfillment.city === 'string'
    );
}
