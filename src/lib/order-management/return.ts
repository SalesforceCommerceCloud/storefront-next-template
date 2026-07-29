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
import type { ShopperOrders } from '@/scapi';
import type { OrderLike } from '@/lib/order-management/types';

/**
 * An order product item as returned by Shopper Orders, carrying the optional
 * OMS enrichment (`omsData.quantityAvailableToReturn`) that drives eligibility.
 * Taken straight from the generated SCAPI client so a schema rename is caught at
 * compile time — no hand-maintained shape to drift.
 */
export type ReturnableItem = ShopperOrders.schemas['OrderProductItem'];

/**
 * A single element of the OMS return payload
 * (`OmsReturnOrderRequest.productItems[]`): `{ itemId, quantity, reason? }`.
 * Reusing the generated type keeps {@link buildReturnProductItems} honest about
 * the exact wire shape.
 */
export type ReturnProductItem = ShopperOrders.schemas['OmsReturnProductItem'];

/**
 * A UI selection row from the return dialog, one per returnable item. The dialog
 * owns this state; {@link buildReturnProductItems} turns the checked rows
 * into the API payload. Kept as an array (not a `{[itemId]: row}` map) because
 * the dialog renders a list and the payload is a list — no keyed lookup needed.
 */
export type ReturnSelection = {
    /** The order product item id being returned. */
    itemId: string;
    /** Whether the shopper selected this item for return. */
    checked: boolean;
    /**
     * Requested return quantity (1..`quantityAvailableToReturn`). Typed
     * `number | string` because it arrives as a `number` when set in-memory but
     * as a `string` when it comes off `<input type="number">` / `FormData`;
     * {@link buildReturnProductItems} coerces it with `Number(...)`.
     */
    quantity: number | string;
    /** Selected OMS reason code (the `returnReasonCodes[].reason` value), or undefined for the default. */
    reason?: string;
};

/**
 * OMS-driven eligibility: an item is returnable when its
 * `omsData.quantityAvailableToReturn` is a finite number greater than 0. OMS
 * computes this field per item, factoring whatever order/item state matters; we
 * trust it verbatim. The authoritative refusal happens server-side via the 409
 * returned by `POST .../actions/oms-return-order`. There is NO client-side
 * status allowlist. ECOM-only orders have no per-item `omsData`, so they yield
 * `[]`.
 *
 * Unlike cancel (which requires every item fully cancellable), return supports
 * partial returns — a single returnable item is sufficient.
 */
export function getReturnableItems(order: OrderLike): ReturnableItem[] {
    if (!order?.productItems?.length) {
        return [];
    }
    return order.productItems.filter((item) => {
        const qty: unknown = item?.omsData?.quantityAvailableToReturn;
        return typeof qty === 'number' && Number.isFinite(qty) && qty > 0;
    });
}

/**
 * Ownership guard: true only when a concrete shopper `customerId` matches the
 * order's `customerInfo.customerId`. Both sides must be concrete — the explicit
 * `!!customerId` check prevents an `undefined === undefined` false positive that
 * would treat a guest/unowned order as owned.
 */
export function isOrderOwnedBy(order: OrderLike, customerId: string | undefined | null): boolean {
    return !!customerId && customerId === order?.customerInfo?.customerId;
}

/**
 * Build the OMS return payload from the dialog's selection rows.
 *
 * `defaultReasonCode` is a single scalar: OMS returns exactly one default across
 * all items (the `default: true` entry in `returnReasonCodes`), NOT a per-item
 * default. Every checked row is compared against this one value.
 *
 * - Keeps only checked rows with a concrete `itemId` and a positive quantity.
 * - Serializes `quantity` as a JS Number (`format: double`) — never the raw form
 *   string.
 * - Omits `reason` when the shopper kept the OMS default; the server applies the
 *   default reason code when `reason` is absent, keeping the payload minimal.
 */
export function buildReturnProductItems(
    selections: ReturnSelection[],
    defaultReasonCode?: string
): ReturnProductItem[] {
    return selections.flatMap((s) => {
        // Normalize the form value once — `quantity` may arrive as a string.
        const quantity = Number(s.quantity);
        if (!s.checked || !s.itemId || !(quantity > 0)) {
            return [];
        }
        const item: ReturnProductItem = { itemId: s.itemId, quantity };
        // Omit `reason` when the shopper kept the OMS default OR when reason codes
        // never loaded (reasons-unavailable path — `s.reason` is empty and
        // `defaultReasonCode` is undefined). SCAPI treats `reason` as optional and
        // the server applies its default when absent.
        if (s.reason && s.reason !== defaultReasonCode) {
            item.reason = s.reason;
        }
        return [item];
    });
}
