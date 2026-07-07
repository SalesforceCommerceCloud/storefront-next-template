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
 * The SCAPI Order document, as returned by Shopper Orders `getOrder`.
 *
 * Order tracking enrichment lives under `order.omsData` (Salesforce Order
 * Management) when the order has been fulfilled through SOM; otherwise the
 * legacy `order.shipments` (ECOM) is the only source.
 */
export type OrderLike = ShopperOrders.schemas['Order'];

/**
 * A single, head-agnostic shipment-tracking entry the UI can render directly.
 *
 * Produced by {@link getOrderTrackingEntries}. All fields except `id` are
 * optional because the two sources differ:
 * - **OMS** (`order.omsData.shipments[]`) can populate every field.
 * - **ECOM fallback** (`order.shipments[]`) only has a tracking number and a
 *   shipping status — `provider`, `trackingUrl`, and the delivery dates are
 *   OMS-only and come back `undefined` on ECOM-sourced orders.
 */
export type OrderTrackingEntry = {
    /** Stable id for the entry — the shipment's own id (a positional `oms-N`/`ecom-N` id is only a defensive fallback if a source shipment somehow lacks one). */
    id: string;
    /** Shipment/shipping status (e.g. `shipped`, `not_shipped`). */
    status?: string;
    /** Carrier / shipping-provider name (OMS only). */
    provider?: string;
    /** Carrier tracking number. */
    trackingNumber?: string;
    /** Deep link to the carrier's tracking page (OMS only). */
    trackingUrl?: string;
    /** Expected delivery date-time, ISO string (OMS only). `null` when the source explicitly clears it. */
    expectedDeliveryDate?: string | null;
    /** Actual (delivered) date-time, ISO string; absent until delivered (OMS only). `null` when the source explicitly clears it. */
    actualDeliveryDate?: string | null;
};
