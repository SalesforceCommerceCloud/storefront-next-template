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

export type OrderStatusBadgeIcon = 'x' | 'check';

export interface OrderStatusConfig {
    labelKey: OrderStatusLabelKey;
    className: string;
    icon?: OrderStatusBadgeIcon;
}

/** Shared badge shells for SCAPI order status; unknown statuses use neutral `bg-muted` in components. */
const ORDER_STATUS_BADGE_CLASS = {
    info: 'border-transparent bg-info text-info-foreground',
    success: 'border-transparent bg-status-positive text-white',
    critical: 'border-transparent bg-status-critical/20 text-status-critical-foreground',
} as const;

const STATUS_CONFIG: Record<OrderStatusType, OrderStatusConfig> = {
    created: {
        labelKey: 'orders.status.created',
        className: ORDER_STATUS_BADGE_CLASS.info,
    },
    new: {
        labelKey: 'orders.status.new',
        className: ORDER_STATUS_BADGE_CLASS.info,
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
        className: 'border-transparent bg-status-positive text-white',
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
