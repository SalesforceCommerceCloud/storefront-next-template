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
import { type ReactElement } from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import type { OrderLike } from '@/lib/order-management/types';
import { getOrderTrackingEntries, parseTrackingDate } from '@/lib/order-management/tracking';
import { ensureExternalUrl } from '@/lib/utils';
import {
    ORDER_TRACKING_SECTION_ID,
    getTrackShipmentHref,
    hasVisibleTrackingCard,
} from '@/components/account/order-tracking/track-shipment';

/** Format an OMS delivery date for display, or `null` if absent/unparseable (see {@link parseTrackingDate}). */
function formatDeliveryDate(value: string | null | undefined, locale: string): string | null {
    const date = parseTrackingDate(value);
    if (!date) {
        return null;
    }
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

export type OrderTrackingProps = {
    order: OrderLike;
};

/**
 * Per-shipment tracking block for the Order Details page.
 *
 * Fed by {@link getOrderTrackingEntries} (OMS-preferred, ECOM fallback). Renders,
 * per shipment: the tracking number as the carrier link (anchored to `trackingUrl`
 * when present, plain text otherwise), provider, status, and expected/actual
 * delivery dates. Renders nothing when there are no tracking entries.
 */
export default function OrderTracking({ order }: OrderTrackingProps): ReactElement | null {
    const { t, i18n } = useTranslation('account');
    const locale = i18n.language;
    // Render a card only for entries with card-visible content (number/provider/date);
    // a bare trackingUrl alone would produce an empty card (the link sits on the number).
    const entries = getOrderTrackingEntries(order).filter(hasVisibleTrackingCard);

    if (entries.length === 0) {
        return null;
    }

    return (
        <div id={ORDER_TRACKING_SECTION_ID} data-section="order-tracking" className="space-y-3">
            {entries.map((entry) => {
                const expected = formatDeliveryDate(entry.expectedDeliveryDate, locale);
                const delivered = formatDeliveryDate(entry.actualDeliveryDate, locale);
                // External href, else plain text: "www.carrier.com" → "https://www.carrier.com/" (unsafe/relative → undefined)
                const trackingHref = ensureExternalUrl(entry.trackingUrl);
                return (
                    <Card
                        key={entry.id}
                        className="rounded-none min-h-[4rem] p-0 bg-card"
                        data-card="tracking-number"
                        data-tracking-entry={entry.id}>
                        <CardContent className="p-3 space-y-2">
                            {entry.trackingNumber ? (
                                <>
                                    <p className="text-xs font-semibold text-foreground">
                                        {t('orders.trackingNumber')}
                                    </p>
                                    {trackingHref ? (
                                        <a
                                            href={trackingHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            data-testid="tracking-number-link"
                                            aria-label={t('orders.tracking.trackingNumberLinkLabel', {
                                                number: entry.trackingNumber,
                                            })}
                                            className="text-sm font-medium text-primary underline break-all">
                                            {entry.trackingNumber}
                                        </a>
                                    ) : (
                                        <p
                                            data-testid="tracking-number-text"
                                            className="text-sm font-medium text-foreground break-all">
                                            {entry.trackingNumber}
                                        </p>
                                    )}
                                </>
                            ) : null}
                            {entry.provider ? (
                                <p className="text-sm text-muted-foreground" data-field="provider">
                                    {t('orders.tracking.provider')}: {entry.provider}
                                </p>
                            ) : null}
                            {expected ? (
                                <p className="text-sm text-muted-foreground" data-field="expected-delivery">
                                    {t('orders.tracking.expectedDelivery')}: {expected}
                                </p>
                            ) : null}
                            {delivered ? (
                                <p className="text-sm text-muted-foreground" data-field="delivered">
                                    {t('orders.tracking.delivered')}: {delivered}
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

/** The "Track shipment" order-action link; renders nothing when no tracking exists. */
export function TrackShipmentAction({ order }: OrderTrackingProps): ReactElement | null {
    const { t } = useTranslation('account');
    const target = getTrackShipmentHref(order);
    if (!target) {
        return null;
    }
    const externalProps = target.external
        ? {
              target: '_blank',
              rel: 'noopener noreferrer',
              // Convey "opens in a new tab" to assistive tech — the visible
              // ExternalLink icon is aria-hidden, so without this the new-tab
              // affordance would be sighted-only.
              'aria-label': t('orders.actions.trackShipmentNewTab'),
          }
        : {};
    return (
        <a
            href={target.href}
            data-testid="track-shipment-action"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary underline"
            {...externalProps}>
            {t('orders.actions.trackShipment')}
            {target.external ? <ExternalLink className="size-3.5" aria-hidden={true} /> : null}
        </a>
    );
}
