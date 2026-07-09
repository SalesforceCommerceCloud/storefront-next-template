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
import type { OrderLike, OrderTrackingEntry } from '@/lib/order-management/types';

/**
 * An OMS shipment as carried on `order.omsData.shipments[]`, taken straight from
 * the generated SCAPI client (`ShopperOrders` exposes it as `OmsShipment`)
 * so a field rename in the schema is caught at compile time — no hand-maintained
 * shape to drift.
 */
type OmsShipment = ShopperOrders.schemas['OmsShipment'];

/**
 * True when an entry carries at least one tracking-relevant field.
 *
 * Includes the delivery dates (not just number/url/provider/status) so the mapper
 * does not drop a date-only OMS shipment (carrier date known before a label is
 * generated) — keeping it consistent with the render gate `hasDisplayableTracking`,
 * which treats a delivery date as displayable. The mapper additionally keeps
 * status-only entries (the render gate drops those, by design).
 *
 * Contract for consumers: this is the MAPPER's keep-filter, NOT a
 * "renderable" predicate. It deliberately keeps `status`-only entries so that
 * non-rendering consumers can read shipment status — but the tracking UI must
 * NOT assume every entry returned by {@link getOrderTrackingEntries} is worth
 * displaying. Anything that renders a tracking card or links to it must apply
 * `hasDisplayableTracking` (track-shipment.ts), which excludes `status`-only
 * entries (status is already conveyed by the shipping-status badge). Keeping the
 * two predicates separate is intentional: the mapper is the general source of
 * truth; the render gate is the display policy.
 */
/**
 * Trim a source string field and collapse a blank/whitespace-only value to `undefined`.
 * OMS can return `""` (or a padded string) for a field it means as "unset"; without this,
 * a whitespace-only `trackingNumber`/`provider`/`trackingUrl` is truthy and slips past
 * {@link hasTrackingData}/`hasDisplayableTracking`, producing an empty tracking card or a
 * "Track shipment" action that links nowhere. (Mirrors the blank-status normalization in
 * `resolveOrderStatus`.)
 */
function normalizeField(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function hasTrackingData(entry: OrderTrackingEntry): boolean {
    return Boolean(
        entry.trackingNumber ||
            entry.trackingUrl ||
            entry.provider ||
            entry.status ||
            entry.expectedDeliveryDate ||
            entry.actualDeliveryDate
    );
}

/**
 * Map an order's shipments to head-agnostic {@link OrderTrackingEntry} list.
 *
 * **OMS-preferred, ECOM-fallback:** if the order carries OMS shipments
 * (`order.omsData.shipments[]`) we return those; otherwise we fall back to the
 * whole legacy `order.shipments[]` (tracking number + status only —
 * `provider`/`trackingUrl`/delivery dates are OMS-only and stay `undefined`).
 *
 * **No positional OMS↔ECOM join.** We return one whole list or the other; we
 * never zip `omsData.shipments[i]` against `order.shipments[i]` by array
 * index. There is no field linking an OMS shipment back to an ECOM shipment, so
 * a positional pairing would render data against the wrong shipment. The index
 * is only ever used as a fallback id, never as a cross-array key.
 *
 * Entries with no tracking-relevant data are filtered out.
 */
export function getOrderTrackingEntries(order: OrderLike): OrderTrackingEntry[] {
    const omsShipments = (order.omsData as { shipments?: OmsShipment[] } | undefined)?.shipments;

    if (omsShipments && omsShipments.length > 0) {
        return omsShipments
            .map(
                (shipment, index): OrderTrackingEntry => ({
                    id: shipment.id ?? `oms-${index}`,
                    status: normalizeField(shipment.status),
                    provider: normalizeField(shipment.provider),
                    trackingNumber: normalizeField(shipment.trackingNumber),
                    trackingUrl: normalizeField(shipment.trackingUrl),
                    expectedDeliveryDate: shipment.expectedDeliveryDate,
                    actualDeliveryDate: shipment.actualDeliveryDate,
                })
            )
            .filter(hasTrackingData);
    }

    // ECOM fallback: legacy `order.shipments[]` only carries a tracking number
    // and a shipping status — nothing else.
    return (order.shipments ?? [])
        .map(
            (shipment, index): OrderTrackingEntry => ({
                id: shipment.shipmentId ?? `ecom-${index}`,
                status: normalizeField(shipment.shippingStatus),
                trackingNumber: normalizeField(shipment.trackingNumber),
            })
        )
        .filter(hasTrackingData);
}

/**
 * Parse an ISO date string for display, guarding **both** failure modes:
 *
 * 1. Falsy input returns `null` first — `new Date(null)` is the epoch
 *    (1970-01-01), NOT an Invalid Date, so without this guard a null/absent
 *    delivery date would silently render "Dec 31, 1969".
 * 2. A truthy-but-unparseable string yields an Invalid Date, caught via
 *    `isNaN(getTime())`, so it renders nothing instead of throwing in
 *    downstream formatting.
 *
 * Returns the parsed `Date`, or `null` if either guard trips.
 */
export function parseTrackingDate(value: string | undefined | null): Date | null {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
        return null;
    }
    return date;
}
