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
import type { OrderLike } from '@/lib/order-management/types';
import { isOrderOwnedBy } from './return';

/**
 * Single entry point for cancel eligibility — combines all 5 spec conditions:
 * 1. Shopper is registered (customerId is concrete)
 * 2. Shopper owns the order
 * 3. Order has OMS data
 * 4. Order has at least one product item (guards `[].every()` vacuous truth)
 * 5. Every item has quantityAvailableToCancel === quantityOrdered (all-or-nothing)
 */
export function canCancelOrder(order: OrderLike, customerId: string | undefined | null): boolean {
    if (!customerId || !isOrderOwnedBy(order, customerId)) {
        return false;
    }
    return isCancellable(order);
}

/**
 * Data-only eligibility (conditions 3-5): true when the order's OMS data shows
 * every item is fully cancellable. Does not check ownership — use
 * {@link canCancelOrder} for the full gate.
 */
export function isCancellable(order: OrderLike): boolean {
    if (!order?.omsData) {
        return false;
    }
    if (!order?.productItems?.length) {
        return false;
    }
    return order.productItems.every((item) => {
        const available: unknown = item?.omsData?.quantityAvailableToCancel;
        const ordered: unknown = item?.omsData?.quantityOrdered;
        return (
            typeof available === 'number' &&
            Number.isFinite(available) &&
            typeof ordered === 'number' &&
            Number.isFinite(ordered) &&
            ordered > 0 &&
            available === ordered
        );
    });
}

/** Minimal shape needed to check cancel state — accepts both full OrderLike and partial test fixtures. */
type OrderWithOmsStatus = { productItems?: { omsData?: { status?: string } }[] };

/**
 * True when every product item is in OMS canceled state. Guards against
 * `[].every()` vacuous truth by requiring at least one item.
 * Normalizes status comparison (trim + lowercase) for payload resilience.
 */
export function isOrderCancelled(order: OrderWithOmsStatus | null | undefined): boolean {
    if (!order?.productItems?.length) {
        return false;
    }
    return order.productItems.every((item) => item?.omsData?.status?.trim().toLowerCase() === 'canceled');
}
