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
import type { OrderLike, OrderTrackingEntry } from '@/lib/order-management/types';
import { getOrderTrackingEntries } from '@/lib/order-management/tracking';
import { ensureExternalUrl } from '@/lib/utils';

/** Anchor id for the in-page tracking section (used by the "Track shipment" action fallback). */
export const ORDER_TRACKING_SECTION_ID = 'order-tracking';

/**
 * Whether an entry has tracking content worth rendering / linking to.
 *
 * The mapper keeps any entry with a status (so other consumers can use it), but a
 * "Tracking Number" card — and the "Track shipment" action — only make sense when
 * there is something trackable to show: a number, carrier link, provider, or a
 * delivery date. A status alone is already conveyed by the shipping-status badge,
 * so a status-only entry (e.g. a not-yet-shipped order) must NOT surface tracking.
 *
 * Two gates, deliberately different: the "Track shipment" *action*
 * ({@link getTrackShipmentHref}) uses THIS predicate (a bare `trackingUrl` is
 * enough to deep-link to the carrier), while the *card render* filter
 * ({@link OrderTracking}) uses the stricter {@link hasVisibleTrackingCard} (a
 * URL-only entry has nothing to put in a card). They are NOT a single source of
 * truth — see {@link hasVisibleTrackingCard} for why, and {@link getTrackShipmentHref}
 * for how the in-page-anchor fallback stays consistent with what the card renders.
 *
 * Takes the whole {@link OrderTrackingEntry} (not a hand-copied field subset) so a
 * new tracking-relevant field added to the entry type stays type-checked here.
 */
export function hasDisplayableTracking(entry: OrderTrackingEntry): boolean {
    return Boolean(
        entry.trackingNumber ||
            entry.trackingUrl ||
            entry.provider ||
            entry.expectedDeliveryDate ||
            entry.actualDeliveryDate
    );
}

/**
 * Whether an entry has content the tracking *card* actually renders: a number,
 * provider, or a delivery date. A bare `trackingUrl` is NOT enough — the carrier
 * link is rendered only on the tracking number, so a URL-only entry would produce
 * an empty card. (The "Track shipment" action can still use a bare `trackingUrl`,
 * which is why {@link hasDisplayableTracking} keeps it; the card filter is stricter.)
 */
export function hasVisibleTrackingCard(entry: OrderTrackingEntry): boolean {
    return Boolean(entry.trackingNumber || entry.provider || entry.expectedDeliveryDate || entry.actualDeliveryDate);
}

/**
 * Compute the target for the "Track shipment" order-action.
 *
 * Deep-links to the first tracking entry that has a carrier `trackingUrl`; if none
 * has a URL but the tracking section will actually render, links to the in-page
 * tracking section; returns `null` when there is nothing trackable (the action is
 * then hidden). A status-only entry (e.g. a not-yet-shipped order) does NOT count as
 * trackable — matching the tracking section, which renders nothing for it.
 *
 * The in-page-anchor fallback is gated on {@link hasVisibleTrackingCard}, not just
 * {@link hasDisplayableTracking}: an entry whose ONLY field is a `trackingUrl` that
 * `ensureExternalUrl` rejects (relative/internal/unsafe) is displayable-but-not-card-
 * visible, so {@link OrderTracking} renders no section and the `#order-tracking` anchor
 * never mounts. Linking to it would scroll nowhere, so we hide the action instead.
 */
export function getTrackShipmentHref(order: OrderLike): { href: string; external: boolean } | null {
    const entries = getOrderTrackingEntries(order).filter(hasDisplayableTracking);
    if (entries.length === 0) {
        return null;
    }
    // First entry with an externalizable carrier URL: "www.carrier.com" → "https://www.carrier.com/" (unsafe/relative → skip)
    for (const entry of entries) {
        const external = ensureExternalUrl(entry.trackingUrl);
        if (external) {
            return { href: external, external: true };
        }
    }
    // No externalizable URL → fall back to the in-page section, but only if that section
    // will actually render (some entry is card-visible); otherwise the anchor target never
    // mounts and the link would scroll nowhere, so hide the action.
    if (entries.some(hasVisibleTrackingCard)) {
        return { href: `#${ORDER_TRACKING_SECTION_ID}`, external: false };
    }
    return null;
}
