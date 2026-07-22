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
import { isOrderCancelled } from '@/lib/order-management/cancel';

/**
 * Order and shipping status labels and badge styles for account order UI.
 */

/** SCAPI Order.status enum type. */
export type OrderStatusType = NonNullable<ShopperOrders.schemas['Order']['status']>;

/** SCAPI Order.shippingStatus / Shipment.shippingStatus enum type (Order has all three; Shipment has not_shipped | shipped). */
export type ShippingStatusType = NonNullable<ShopperOrders.schemas['Order']['shippingStatus']>;

export type OrderStatusLabelKey =
    | 'orders.status.created'
    | 'orders.status.new'
    | 'orders.status.completed'
    | 'orders.status.cancelled'
    | 'orders.status.replaced'
    | 'orders.status.failed';

/** Order-level RETURN display statuses, derived from item-level `omsData.status`. */
export type OrderReturnStatusType =
    | 'RETURN_INITIATED'
    | 'PARTIAL_RETURN_INITIATED'
    | 'RETURN_COMPLETE'
    | 'PARTIAL_RETURN_COMPLETE';

export type OrderReturnStatusLabelKey =
    | 'orders.returnStatus.initiated'
    | 'orders.returnStatus.partialInitiated'
    | 'orders.returnStatus.complete'
    | 'orders.returnStatus.partialComplete';

/**
 * Order-level FULFILLMENT display statuses, aggregated from item-level `omsData.status`
 * per the Shopper Agent Order Level Status Matrix. Mirrors PWA Kit's
 * `getOrderDisplayStatus`. These describe the fulfillment lifecycle after checkout
 * and before any return activity; when a cancel/return derivation applies it takes
 * precedence over any fulfillment state.
 */
export type OrderFulfillmentStatusType =
    | 'ORDERED'
    | 'IN_PROGRESS'
    | 'PARTIALLY_SHIPPED'
    | 'SHIPPED'
    | 'PART_ORDER_DELIVERED'
    | 'DELIVERED';

export type OrderFulfillmentStatusLabelKey =
    | 'orders.fulfillmentStatus.ordered'
    | 'orders.fulfillmentStatus.inProgress'
    | 'orders.fulfillmentStatus.partiallyShipped'
    | 'orders.fulfillmentStatus.shipped'
    | 'orders.fulfillmentStatus.partOrderDelivered'
    | 'orders.fulfillmentStatus.delivered';

export type OrderStatusBadgeIcon = 'x' | 'check';

export interface OrderStatusConfig {
    labelKey: OrderStatusLabelKey;
    className: string;
    icon?: OrderStatusBadgeIcon;
}

/** Badge config for a derived order-level return status. Same shell as {@link OrderStatusConfig} but a distinct label-key domain. */
export interface OrderReturnStatusConfig {
    labelKey: OrderReturnStatusLabelKey;
    className: string;
    icon?: OrderStatusBadgeIcon;
}

/** Badge config for a derived order-level fulfillment status. */
export interface OrderFulfillmentStatusConfig {
    labelKey: OrderFulfillmentStatusLabelKey;
    className: string;
    icon?: OrderStatusBadgeIcon;
}

/**
 * Shared badge shells for SCAPI order status; unknown statuses use neutral `bg-muted` in components.
 * Palette diverges slightly from PWA Kit's `order-status-badge` on the UX team's guidance:
 * green for terminal successes (created/new/completed/replaced), red/critical for
 * cancelled/failed, gray/muted for complete-return states, and blue/info for in-progress
 * return states so shoppers can distinguish an in-flight return from one that has fully settled.
 */
export const ORDER_STATUS_BADGE_CLASS = {
    success: 'border-transparent bg-status-positive text-success-foreground',
    critical: 'border-transparent bg-status-critical/20 text-status-critical-foreground',
    muted: 'border-transparent bg-muted text-muted-foreground',
    info: 'border-transparent bg-info text-info-foreground',
} as const;

const STATUS_CONFIG: Record<OrderStatusType, OrderStatusConfig> = {
    created: {
        labelKey: 'orders.status.created',
        className: ORDER_STATUS_BADGE_CLASS.success,
    },
    new: {
        labelKey: 'orders.status.new',
        className: ORDER_STATUS_BADGE_CLASS.success,
    },
    completed: {
        labelKey: 'orders.status.completed',
        className: ORDER_STATUS_BADGE_CLASS.success,
        icon: 'check',
    },
    cancelled: {
        labelKey: 'orders.status.cancelled',
        className: ORDER_STATUS_BADGE_CLASS.critical,
        icon: 'x',
    },
    replaced: {
        labelKey: 'orders.status.replaced',
        className: ORDER_STATUS_BADGE_CLASS.success,
        icon: 'check',
    },
    failed: {
        labelKey: 'orders.status.failed',
        className: ORDER_STATUS_BADGE_CLASS.critical,
        icon: 'x',
    },
};

export type ShippingStatusLabelKey =
    | 'orders.shippingStatus.notShipped'
    | 'orders.shippingStatus.partShipped'
    | 'orders.shippingStatus.shipped';

export interface ShippingStatusConfig {
    labelKey: ShippingStatusLabelKey;
    className: string;
}

const SHIPPING_STATUS_CONFIG: Record<ShippingStatusType, ShippingStatusConfig> = {
    not_shipped: {
        labelKey: 'orders.shippingStatus.notShipped',
        className: 'border-transparent bg-info text-info-foreground',
    },
    part_shipped: {
        labelKey: 'orders.shippingStatus.partShipped',
        className: 'border-transparent bg-info text-info-foreground',
    },
    shipped: {
        labelKey: 'orders.shippingStatus.shipped',
        className: 'border-transparent bg-status-positive text-success-foreground',
    },
};

function normalizeScapiStatusToken(status: string): string {
    return status.toLowerCase().replace(/\s+/g, '_');
}

function lookupStatusConfig<K extends string, C>(map: Record<K, C>, status: string | undefined): C | undefined {
    if (status == null || status.trim() === '') {
        return undefined;
    }
    const key = normalizeScapiStatusToken(status);
    return key in map ? map[key as K] : undefined;
}

/**
 * Formats raw fallback status text for display:
 * - `not_shipped` -> `Not Shipped`
 * - `SHIPPED` -> `Shipped`
 */
export function formatStatusFallbackLabel(status: string | undefined): string {
    if (status == null || status.trim() === '') {
        return '';
    }
    return status
        .trim()
        .replace(/_/g, ' ')
        .split(/\s+/)
        .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
        .join(' ');
}

/**
 * Colored-badge config for SCAPI `Order.status` only. Unknown / missing / empty → `undefined`.
 */
export function getOrderStatusConfig(status: string | undefined): OrderStatusConfig | undefined {
    return lookupStatusConfig(STATUS_CONFIG, status);
}

/**
 * Colored-badge config for SCAPI shipment/order shipping status only. Unknown / missing / empty → `undefined` (Order Details shows `shipment.shippingStatus` as raw text in a neutral badge).
 */
export function getShippingStatusConfig(status: string | undefined): ShippingStatusConfig | undefined {
    return lookupStatusConfig(SHIPPING_STATUS_CONFIG, status);
}

/**
 * No-icon badge config per derived order-level return status. In-progress return states
 * (`*_INITIATED`) use the `info` shell (blue) so shoppers can distinguish an in-flight
 * return from one that has fully settled; complete states (`*_COMPLETE`) use `muted` (gray).
 * Neither uses `critical` — a return is not an error, distinct from the red shell reserved
 * for `cancelled`/`failed`.
 */
const RETURN_STATUS_CONFIG: Record<OrderReturnStatusType, OrderReturnStatusConfig> = {
    RETURN_INITIATED: {
        labelKey: 'orders.returnStatus.initiated',
        className: ORDER_STATUS_BADGE_CLASS.info,
    },
    PARTIAL_RETURN_INITIATED: {
        labelKey: 'orders.returnStatus.partialInitiated',
        className: ORDER_STATUS_BADGE_CLASS.info,
    },
    RETURN_COMPLETE: {
        labelKey: 'orders.returnStatus.complete',
        className: ORDER_STATUS_BADGE_CLASS.muted,
    },
    PARTIAL_RETURN_COMPLETE: {
        labelKey: 'orders.returnStatus.partialComplete',
        className: ORDER_STATUS_BADGE_CLASS.muted,
    },
};

/**
 * Narrow structural shape for computing return status. SCAPI carries return state
 * ONLY at the line-item level (`productItems[*].omsData`) — never at order level,
 * so an order-level status must be derived. Alongside the `status` enum
 * (`return_initiated` / `returned` among others), OMS enriches each line with
 * per-unit quantity counters; when present they let a single multi-quantity line
 * be split into individual returned / in-flight / untouched units. Read through
 * this local shape rather than a generated union because the `omsData` typing on
 * `Order.productItems` differs across the ShopperOrders (detail) and
 * ShopperCustomers (list) schemas; a structural param compiles and runs for both
 * without a cast.
 */
type ReturnStatusOrderShape = {
    productItems?: {
        omsData?: {
            status?: string;
            quantityOrdered?: number;
            quantityCanceled?: number;
            quantityReturned?: number;
            quantityReturnInitiated?: number;
        };
    }[];
};

/** Per-unit return bucket categories that feed the order-level aggregation. */
type ReturnUnitBucket = 'returned' | 'initiated' | 'other';

/**
 * Coerces a SCAPI OMS quantity counter to a non-negative integer.
 * Returns `null` when the value is missing or non-finite (so callers can fall
 * back to status-only counting); otherwise a truncated count clamped at 0.
 */
function toUnitCount(value: number | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }
    const n = Math.trunc(value);
    return n > 0 ? n : 0;
}

/** Maps a raw `omsData.status` string to its return-unit bucket category. */
function statusToReturnBucket(status: string | undefined): ReturnUnitBucket {
    const normalized = status?.trim().toLowerCase();
    if (normalized === 'returned') {
        return 'returned';
    }
    if (normalized === 'return_initiated') {
        return 'initiated';
    }
    return 'other';
}

/**
 * Derives the order-level RETURN display status by aggregating per-unit return
 * buckets across all line items, per the Shopper Agent Order Level Status Matrix:
 *
 * - all active units `returned` → `RETURN_COMPLETE`
 * - some (not all) active units `returned` → `PARTIAL_RETURN_COMPLETE`
 * - all active units return-initiated (none yet returned) → `RETURN_INITIATED`
 * - some active units return-initiated (none returned) → `PARTIAL_RETURN_INITIATED`
 * - no returned or initiated units → `undefined` (caller falls back to the raw
 *   `order.status` badge)
 *
 * When a line carries OMS per-unit quantities (`quantityOrdered` present) it is
 * expanded into individual units: `quantityCanceled` units drop out (cancelled
 * units are excluded from the active total so a fully-returned-but-partly-cancelled
 * order still reads `RETURN_COMPLETE`), `quantityReturned` units are returned,
 * `quantityReturnInitiated − quantityReturned` are in-flight returns, and the rest
 * take the line's `status`. This mirrors PWA Kit and lets a single line with
 * quantity > 1 report a partial return. When quantities are absent the line falls
 * back to one unit categorized by its `status` string, preserving the original
 * one-entry-per-line behavior.
 *
 * `returned` is the terminal state and outranks in-flight returns, so any order
 * with at least one returned unit resolves to a `*_COMPLETE` status.
 * `PARTIAL_RETURN_COMPLETE` intentionally conflates "some returned + some
 * in-flight" with "some returned + some untouched" — the enum offers no finer
 * bucket.
 */
export function getOrderReturnStatus(order: ReturnStatusOrderShape): OrderReturnStatusType | undefined {
    const items = order.productItems ?? [];
    if (items.length === 0) {
        return undefined;
    }

    let activeUnits = 0;
    let returnedUnits = 0;
    let initiatedUnits = 0;

    const addUnits = (bucket: ReturnUnitBucket, count: number) => {
        if (count <= 0) {
            return;
        }
        activeUnits += count;
        if (bucket === 'returned') {
            returnedUnits += count;
        } else if (bucket === 'initiated') {
            initiatedUnits += count;
        }
    };

    for (const item of items) {
        const oms = item.omsData;
        const ordered = toUnitCount(oms?.quantityOrdered);

        // No usable quantities → fall back to one unit categorized by status string.
        if (ordered == null) {
            addUnits(statusToReturnBucket(oms?.status), 1);
            continue;
        }

        const canceled = toUnitCount(oms?.quantityCanceled) ?? 0;
        const returned = toUnitCount(oms?.quantityReturned) ?? 0;
        // `quantityReturnInitiated` is cumulative (it already counts returned units).
        const returnInitiated = toUnitCount(oms?.quantityReturnInitiated) ?? 0;
        const inFlightReturns = Math.max(0, returnInitiated - returned);
        // Cancelled and return-initiated units are removed from the untouched remainder.
        const remaining = Math.max(0, ordered - canceled - returnInitiated);

        addUnits('returned', returned);
        addUnits('initiated', inFlightReturns);
        addUnits(statusToReturnBucket(oms?.status), remaining);
    }

    if (activeUnits === 0) {
        return undefined;
    }
    if (returnedUnits > 0) {
        return returnedUnits === activeUnits ? 'RETURN_COMPLETE' : 'PARTIAL_RETURN_COMPLETE';
    }
    if (initiatedUnits > 0) {
        return initiatedUnits === activeUnits ? 'RETURN_INITIATED' : 'PARTIAL_RETURN_INITIATED';
    }
    return undefined;
}

/**
 * Informational colored-badge config for a derived {@link OrderReturnStatusType}.
 * `undefined` in → `undefined` out, so callers can pass the result of
 * {@link getOrderReturnStatus} straight through.
 */
export function getOrderReturnStatusConfig(
    status: OrderReturnStatusType | undefined
): OrderReturnStatusConfig | undefined {
    return status ? RETURN_STATUS_CONFIG[status] : undefined;
}

/**
 * Fulfillment badge shells. Mirrors PWA Kit's `OrderStatusBadge`, which renders every
 * non-cancel/non-return fulfillment state in a single green badge (colorScheme='green').
 * SFN uses the same `success` shell so the badge palette stays consistent with PWA.
 */
const FULFILLMENT_STATUS_CONFIG: Record<OrderFulfillmentStatusType, OrderFulfillmentStatusConfig> = {
    ORDERED: {
        labelKey: 'orders.fulfillmentStatus.ordered',
        className: ORDER_STATUS_BADGE_CLASS.success,
    },
    IN_PROGRESS: {
        labelKey: 'orders.fulfillmentStatus.inProgress',
        className: ORDER_STATUS_BADGE_CLASS.success,
    },
    PARTIALLY_SHIPPED: {
        labelKey: 'orders.fulfillmentStatus.partiallyShipped',
        className: ORDER_STATUS_BADGE_CLASS.success,
    },
    SHIPPED: {
        labelKey: 'orders.fulfillmentStatus.shipped',
        className: ORDER_STATUS_BADGE_CLASS.success,
    },
    PART_ORDER_DELIVERED: {
        labelKey: 'orders.fulfillmentStatus.partOrderDelivered',
        className: ORDER_STATUS_BADGE_CLASS.success,
    },
    DELIVERED: {
        labelKey: 'orders.fulfillmentStatus.delivered',
        className: ORDER_STATUS_BADGE_CLASS.success,
        icon: 'check',
    },
};

/** Canonical item-level fulfillment buckets that raw OMS item statuses normalize into. */
type ItemFulfillmentBucket = 'ordered' | 'in_progress' | 'shipped' | 'delivered' | 'cancelled';

/**
 * Case-insensitive exact-match map from a raw OMS item `omsData.status` string to a
 * canonical fulfillment bucket. Mirrors PWA Kit's `STATUS_MAP` (`app/utils/order-status-utils.js`)
 * so both platforms bucket the same raw values identically.
 *
 * `allocated`/`fulfilled` are intentionally IN_PROGRESS (upstream fulfillment-order milestones,
 * not customer-visible "Delivered").
 */
const ITEM_FULFILLMENT_STATUS_MAP: Record<string, ItemFulfillmentBucket> = {
    ordered: 'ordered',
    created: 'ordered',
    approved: 'ordered',
    new: 'ordered',
    open: 'ordered',
    placed: 'ordered',
    in_progress: 'in_progress',
    'in progress': 'in_progress',
    processing: 'in_progress',
    allocated: 'in_progress',
    fulfilled: 'in_progress',
    shipped: 'shipped',
    in_transit: 'shipped',
    'in transit': 'shipped',
    delivered: 'delivered',
    canceled: 'cancelled',
    cancelled: 'cancelled',
};

/**
 * Return states are handled separately by {@link getOrderReturnStatus}. The fulfillment
 * aggregation excludes these buckets rather than mapping them to `in_progress` (which would
 * happen via the unknown-status fallback otherwise).
 */
const ITEM_RETURN_STATUSES = new Set(['returned', 'return_initiated', 'return initiated', 'return requested']);

/**
 * Maps a raw item-level `omsData.status` string to a canonical fulfillment bucket.
 * Return states (`returned`/`return_initiated`) are treated as "not fulfillment" and yield
 * `undefined` so the caller excludes them from aggregation. Unknown but present statuses
 * default to `in_progress` (mirrors PWA Kit's `STATUS_MAP[s] ?? ITEM_BUCKET.IN_PROGRESS`)
 * so an unexpected value never reads as a terminal state like "Delivered".
 */
function bucketForItemStatus(status: string | undefined): ItemFulfillmentBucket | undefined {
    if (status == null) return undefined;
    const normalized = status.trim().toLowerCase();
    if (!normalized) return undefined;
    if (ITEM_RETURN_STATUSES.has(normalized)) return undefined;
    return ITEM_FULFILLMENT_STATUS_MAP[normalized] ?? 'in_progress';
}

/**
 * Narrow structural shape for computing fulfillment status. Same rationale as
 * {@link ReturnStatusOrderShape} — reads through a local shape so it compiles
 * against both ShopperOrders and ShopperCustomers order schemas without a cast.
 */
type FulfillmentStatusOrderShape = {
    productItems?: {
        omsData?: {
            status?: string;
            quantityOrdered?: number;
            quantityCanceled?: number;
            quantityReturned?: number;
            quantityReturnInitiated?: number;
        };
    }[];
};

/**
 * Derives the order-level FULFILLMENT display status by aggregating per-unit
 * fulfillment buckets across all line items. Mirrors PWA Kit's `getOrderDisplayStatus`
 * (`app/utils/order-status-utils.js`) so both platforms produce the same terminal
 * state for the same underlying data.
 *
 * When a line carries OMS per-unit quantities it is expanded into individual units:
 * cancelled units drop out, returned / return-initiated units are excluded from
 * fulfillment aggregation (returns are handled separately by {@link getOrderReturnStatus}),
 * and the remaining units take the line's fulfillment bucket. When quantities are
 * absent, the whole line contributes a single unit categorized by its status string.
 *
 * Returns `undefined` when:
 * - no item carries a usable `omsData.status`, OR
 * - the caller has already resolved cancel/return states (fulfillment is not the
 *   right badge in those cases — check {@link getOrderCancelStatusConfig} and
 *   {@link getOrderReturnStatus} first).
 */
export function getOrderFulfillmentStatus(order: FulfillmentStatusOrderShape): OrderFulfillmentStatusType | undefined {
    const items = order.productItems ?? [];
    if (items.length === 0) return undefined;

    // Only the distinct set of active fulfillment buckets matters — per-unit counts never
    // change the outcome (`all`/`some` below test bucket membership, not quantities).
    const buckets = new Set<ItemFulfillmentBucket>();
    let anyStatusPresent = false;

    for (const item of items) {
        const oms = item.omsData;
        if (oms?.status != null && oms.status.trim() !== '') {
            anyStatusPresent = true;
        }
        const bucket = bucketForItemStatus(oms?.status);
        // Return-state and status-less items don't contribute to fulfillment aggregation.
        if (bucket === undefined) continue;

        const ordered = toUnitCount(oms?.quantityOrdered);

        // No usable quantity breakdown → categorize the line by its status string.
        if (ordered == null) {
            if (bucket === 'cancelled') continue;
            buckets.add(bucket);
            continue;
        }

        const canceled = toUnitCount(oms?.quantityCanceled) ?? 0;
        // `quantityReturnInitiated` is cumulative (it already counts fully-returned units),
        // so subtracting it once removes every unit currently in any return flow.
        const returnInitiated = toUnitCount(oms?.quantityReturnInitiated) ?? 0;
        // Units still in the line's fulfillment state (not cancelled, not in any return flow).
        const remaining = Math.max(0, ordered - canceled - returnInitiated);
        if (remaining === 0) continue;
        buckets.add(bucket);
    }

    // No item carried a status at all → nothing to show. When all statuses were present but
    // resolved to return/cancelled states, the caller's cancel/return derivations render the
    // right badge instead of this one.
    if (!anyStatusPresent || buckets.size === 0) return undefined;

    const all = (bucket: ItemFulfillmentBucket) => buckets.size === 1 && buckets.has(bucket);
    const some = (bucket: ItemFulfillmentBucket) => buckets.has(bucket);

    if (all('delivered')) return 'DELIVERED';
    if (some('delivered')) return 'PART_ORDER_DELIVERED';

    if (all('shipped')) return 'SHIPPED';
    if (some('shipped')) return 'PARTIALLY_SHIPPED';

    // Any in-progress unit reads as in progress. Unknown raw statuses already resolved to
    // `in_progress` via {@link bucketForItemStatus}'s fallback, mirroring PWA's
    // `STATUS_MAP[s] ?? ITEM_BUCKET.IN_PROGRESS` behavior.
    if (some('in_progress')) return 'IN_PROGRESS';

    return 'ORDERED';
}

/**
 * Colored-badge config for a derived {@link OrderFulfillmentStatusType}.
 * `undefined` in → `undefined` out, so callers can pass the result of
 * {@link getOrderFulfillmentStatus} straight through.
 */
export function getOrderFulfillmentStatusConfig(
    status: OrderFulfillmentStatusType | undefined
): OrderFulfillmentStatusConfig | undefined {
    return status ? FULFILLMENT_STATUS_CONFIG[status] : undefined;
}

/** Badge config for OMS-derived cancel status (all items canceled at item level). */
export type OrderCancelStatusConfig = {
    labelKey: 'orders.status.cancelled';
    className: string;
    icon: OrderStatusBadgeIcon;
};

const CANCEL_STATUS_CONFIG: OrderCancelStatusConfig = {
    labelKey: 'orders.status.cancelled',
    className: ORDER_STATUS_BADGE_CLASS.critical,
    icon: 'x',
};

/**
 * Returns the "Cancelled" badge config when every product item is in OMS
 * `canceled` state. Delegates to {@link isOrderCancelled} for the single
 * source-of-truth predicate. The SCAPI order-level `status` field stays stale
 * ("new" / "created") even after all items are cancelled via OMS, so this
 * item-level derivation is necessary for the badge to reflect reality.
 */
export function getOrderCancelStatusConfig(
    order: Parameters<typeof isOrderCancelled>[0]
): OrderCancelStatusConfig | undefined {
    return isOrderCancelled(order) ? CANCEL_STATUS_CONFIG : undefined;
}

/**
 * Resolve the order-level status to display on the **status badge**, preferring
 * the ECOM `order.status` and falling back to the OMS status (`omsData.status`)
 * when ECOM is absent.
 *
 * The badge prefers ECOM because ECOM's status is the one the badge was built to
 * understand. `order.status` (ECOM) speaks exactly the badge's vocabulary — it
 * returns one of the 6 SCAPI `OrderStatusEnum` values (`created | new | completed |
 * cancelled | replaced | failed`), each of which {@link getOrderStatusConfig} knows
 * how to color. The OMS status (`omsData.status`) speaks a different vocabulary
 * (`Approved`, `Allocated`, `Fulfilled`, `Shipped`…) — none of which are in the
 * 6-value map, so it is only the fallback for orders with no ECOM status.
 *
 * Do NOT confuse this with the shipment-list **sourcing**: the mapper
 * {@link getOrderTrackingEntries} is OMS-*preferred* (which list of shipments to
 * render), which is a separate decision from this badge's status precedence.
 *
 * Single source of truth for both the order-history list and the Order Details
 * badge, so the two surfaces can never disagree for the same order. Returns
 * `undefined` when neither is set — callers apply their own default (the list
 * defaults to `created`; the detail page leaves it unset so the badge hides).
 *
 * A blank/whitespace status (e.g. OMS returning `status: ''` to mean "unset") is
 * normalized to `undefined` so it does not propagate as a status — a bare `??`
 * would pass `''` through (only `null`/`undefined` are nullish), surfacing an
 * empty value where there should be none.
 *
 * `omsData` is not declared on the generated SCAPI `Order` schema (the client
 * carries two conflicting `OmsData` definitions), so it is read through a narrow
 * local shape rather than the generated union.
 */
export function resolveOrderStatus(order: { status?: string; omsData?: { status?: string } }): string | undefined {
    const status = order.status?.trim() || order.omsData?.status?.trim();
    return status || undefined;
}
