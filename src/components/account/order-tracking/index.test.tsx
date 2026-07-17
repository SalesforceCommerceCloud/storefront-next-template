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
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import type { OrderLike } from '@/lib/order-management/types';
import OrderTracking from './index';
import {
    getTrackOptionLabels,
    getTrackShipmentHref,
    getTrackShipmentTargets,
    ORDER_TRACKING_SECTION_ID,
} from './track-shipment';

const renderWithProviders = (ui: ReactElement) => render(ui, { wrapper: AllProvidersWrapper });

/** Order with the given OMS shipments under omsData. */
function omsOrder(shipments: unknown[]): OrderLike {
    return { orderNo: 'O1', omsData: { shipments } } as unknown as OrderLike;
}
/** Order with the given legacy ECOM shipments. */
function ecomOrder(shipments: unknown[]): OrderLike {
    return { orderNo: 'O1', shipments } as unknown as OrderLike;
}

describe('OrderTracking', () => {
    it('renders the tracking number as a carrier link (href/target/rel) when trackingUrl is present', () => {
        renderWithProviders(
            <OrderTracking
                order={omsOrder([
                    { id: 's1', trackingNumber: '1Z999', trackingUrl: 'https://carrier.test/track/1Z999' },
                ])}
            />
        );
        const link = screen.getByTestId('tracking-number-link');
        expect(link).toHaveTextContent('1Z999');
        expect(link).toHaveAttribute('href', 'https://carrier.test/track/1Z999');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        // no plain-text variant when a link is rendered
        expect(screen.queryByTestId('tracking-number-text')).not.toBeInTheDocument();
    });

    it('normalizes a scheme-less trackingUrl to an absolute external href (not a relative path)', () => {
        renderWithProviders(
            <OrderTracking
                order={omsOrder([{ id: 's1', trackingNumber: '1Z999', trackingUrl: 'www.carrier.test/t' }])}
            />
        );
        // Without normalization the browser would resolve this relative to the current
        // page; ensureExternalUrl prepends https:// so it points at the carrier.
        expect(screen.getByTestId('tracking-number-link')).toHaveAttribute('href', 'https://www.carrier.test/t');
    });

    it('renders the tracking number as plain text (no link) when trackingUrl is absent', () => {
        renderWithProviders(<OrderTracking order={omsOrder([{ id: 's1', trackingNumber: 'PLAIN-1' }])} />);
        expect(screen.getByTestId('tracking-number-text')).toHaveTextContent('PLAIN-1');
        expect(screen.queryByTestId('tracking-number-link')).not.toBeInTheDocument();
    });

    it('renders NO card for a URL-only entry (no number/provider/date → would be an empty card)', () => {
        // A trackingUrl alone has no card-visible content (the link sits on the number),
        // so the card must not render an empty min-height box.
        const { container } = renderWithProviders(
            <OrderTracking order={omsOrder([{ id: 's1', trackingUrl: 'https://carrier.test/t' }])} />
        );
        expect(container.querySelector('[data-card="tracking-number"]')).toBeNull();
        expect(container.querySelector('[data-section="order-tracking"]')).toBeNull();
    });

    it('renders the tracking number as plain text (no link) when trackingUrl is unsafe', () => {
        // ensureExternalUrl rejects the userinfo spoof → no href → plain text, not a link to evil.com
        renderWithProviders(
            <OrderTracking
                order={omsOrder([{ id: 's1', trackingNumber: 'SPOOF-1', trackingUrl: 'https://www.ups.com@evil.com' }])}
            />
        );
        expect(screen.getByTestId('tracking-number-text')).toHaveTextContent('SPOOF-1');
        expect(screen.queryByTestId('tracking-number-link')).not.toBeInTheDocument();
    });

    it('renders provider and expected + actual delivery dates per shipment', () => {
        renderWithProviders(
            <OrderTracking
                order={omsOrder([
                    {
                        id: 's1',
                        trackingNumber: 'T1',
                        provider: 'UPS',
                        expectedDeliveryDate: '2026-06-20T10:00:00.000Z',
                        actualDeliveryDate: '2026-06-19T15:00:00.000Z',
                    },
                ])}
            />
        );
        expect(screen.getByText(/UPS/)).toBeInTheDocument();
        // dates formatted via toLocaleDateString (year present, not the raw ISO string)
        const expected = screen.getByText(/Expected delivery:/);
        expect(expected).toHaveTextContent('2026');
        expect(expected).not.toHaveTextContent('T10:00');
        expect(screen.getByText(/Delivered:/)).toHaveTextContent('2026');
    });

    it('renders a flat list of N entries for multiple shipments', () => {
        const { container } = renderWithProviders(
            <OrderTracking
                order={omsOrder([
                    { id: 's1', trackingNumber: 'T1' },
                    { id: 's2', trackingNumber: 'T2', trackingUrl: 'https://carrier.test/t2' },
                ])}
            />
        );
        expect(container.querySelectorAll('[data-card="tracking-number"]')).toHaveLength(2);
    });

    it('renders the tracking section with the in-page anchor id (the Track-shipment fallback target exists)', () => {
        // The non-external Track-shipment action links to #order-tracking; this locks
        // that the section actually emits that id, so the anchor target can't silently vanish.
        const { container } = renderWithProviders(
            <OrderTracking order={omsOrder([{ id: 's1', trackingNumber: 'T1' }])} />
        );
        expect(container.querySelector(`#${ORDER_TRACKING_SECTION_ID}`)).toBeInTheDocument();
    });

    it('renders provider + delivery dates for an entry with NO tracking number (no number card, lines still show)', () => {
        // OMS shape where carrier + dates are known but no number yet.
        renderWithProviders(
            <OrderTracking
                order={omsOrder([{ id: 's1', provider: 'UPS', expectedDeliveryDate: '2026-06-20T10:00:00.000Z' }])}
            />
        );
        expect(screen.getByText(/UPS/)).toBeInTheDocument();
        expect(screen.getByText(/Expected delivery:/)).toHaveTextContent('2026');
        // no tracking-number element when there is no number
        expect(screen.queryByTestId('tracking-number-link')).not.toBeInTheDocument();
        expect(screen.queryByTestId('tracking-number-text')).not.toBeInTheDocument();
        // the "Tracking Number" heading is scoped to the number — it must NOT render
        // as an orphaned label above provider/date-only content
        expect(screen.queryByText('Tracking Number')).not.toBeInTheDocument();
    });

    it('renders nothing when there are no tracking entries', () => {
        const { container } = renderWithProviders(<OrderTracking order={ecomOrder([])} />);
        expect(container.querySelector('[data-section="order-tracking"]')).toBeNull();
    });

    it('renders NO card for a status-only entry (not-yet-shipped order — no empty "Tracking Number" card)', () => {
        // Regression lock for a live-found bug: an ECOM shipment with a shippingStatus
        // but NO tracking number passes the mapper's keep-filter (it has a status), but
        // must NOT render an empty tracking card — status is shown by the shipping badge.
        const { container } = renderWithProviders(
            <OrderTracking order={ecomOrder([{ shipmentId: 'me', shippingStatus: 'not_shipped' }])} />
        );
        expect(container.querySelector('[data-section="order-tracking"]')).toBeNull();
        expect(container.querySelector('[data-card="tracking-number"]')).toBeNull();
    });

    it('falls back to the ECOM tracking number (plain text) when there is no OMS data', () => {
        renderWithProviders(
            <OrderTracking
                order={ecomOrder([{ shipmentId: 'e1', shippingStatus: 'shipped', trackingNumber: 'ECOM-9' }])}
            />
        );
        expect(screen.getByTestId('tracking-number-text')).toHaveTextContent('ECOM-9');
        // provider/ETA are OMS-only → absent on ECOM
        expect(screen.queryByText(/Carrier:/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Expected delivery:/)).not.toBeInTheDocument();
    });

    it('does not render "Dec 31, 1969" when a delivery date is null/absent (two-layer guard, end to end)', () => {
        renderWithProviders(
            <OrderTracking order={omsOrder([{ id: 's1', trackingNumber: 'T1', expectedDeliveryDate: null }])} />
        );
        expect(screen.queryByText(/1969/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Expected delivery:/)).not.toBeInTheDocument();
    });

    // --- accessibility ---
    it('gives the tracking link an accessible name conveying purpose + new-tab', () => {
        renderWithProviders(
            <OrderTracking
                order={omsOrder([{ id: 's1', trackingNumber: '1Z999', trackingUrl: 'https://carrier.test/x' }])}
            />
        );
        const link = screen.getByRole('link', { name: /track shipment 1Z999.*new tab/i });
        expect(link).toBeInTheDocument();
    });
});

describe('getTrackShipmentTargets', () => {
    it('returns one target per entry with an externalizable carrier URL, in order', () => {
        const targets = getTrackShipmentTargets(
            omsOrder([
                { id: 's1', trackingNumber: 'T1', trackingUrl: 'https://carrier.test/t1' },
                { id: 's2', trackingNumber: 'T2', trackingUrl: 'www.carrier.test/t2' },
            ])
        );
        expect(targets).toEqual([
            { id: 's1', trackingNumber: 'T1', href: 'https://carrier.test/t1' },
            // scheme-less host is normalized to an absolute external URL
            { id: 's2', trackingNumber: 'T2', href: 'https://www.carrier.test/t2' },
        ]);
    });

    it('skips entries without an externalizable URL (no URL, unsafe URL, relative path)', () => {
        const targets = getTrackShipmentTargets(
            omsOrder([
                { id: 's1', trackingNumber: 'T1' }, // no URL
                { id: 's2', trackingNumber: 'T2', trackingUrl: 'https://www.ups.com@evil.com' }, // userinfo spoof
                { id: 's3', trackingNumber: 'T3', trackingUrl: '/account/orders/1' }, // relative
                { id: 's4', trackingNumber: 'T4', trackingUrl: 'https://carrier.test/t4' }, // kept
            ])
        );
        expect(targets).toEqual([{ id: 's4', trackingNumber: 'T4', href: 'https://carrier.test/t4' }]);
    });

    it('keeps a target with a carrier URL but no tracking number (number is optional)', () => {
        const targets = getTrackShipmentTargets(omsOrder([{ id: 's1', trackingUrl: 'https://carrier.test/t' }]));
        expect(targets).toEqual([{ id: 's1', trackingNumber: undefined, href: 'https://carrier.test/t' }]);
    });

    it('returns an empty array when there is no tracking', () => {
        expect(getTrackShipmentTargets(ecomOrder([]))).toEqual([]);
    });
});

describe('getTrackOptionLabels', () => {
    // A minimal typed t() that returns the key + interpolation, so we assert the
    // key/var wiring without depending on the resolved English copy.
    const t = ((key: string, vars?: Record<string, unknown>) =>
        vars ? `${key}:${JSON.stringify(vars)}` : key) as unknown as Parameters<typeof getTrackOptionLabels>[2];

    it('labels a target by its tracking number (visible + new-tab aria) when a number is present', () => {
        const labels = getTrackOptionLabels({ id: 's1', trackingNumber: '1Z999', href: 'https://c.test/x' }, 0, t);
        expect(labels).toEqual({
            label: 'orders.actions.trackNumber:{"trackingNumber":"1Z999"}',
            ariaLabel: 'orders.actions.trackNumberNewTab:{"trackingNumber":"1Z999"}',
        });
    });

    it('falls back to the 1-based position when the target has no tracking number', () => {
        const labels = getTrackOptionLabels({ id: 's2', href: 'https://c.test/y' }, 1, t);
        expect(labels).toEqual({
            label: 'orders.actions.trackShipmentNumber:{"number":2}',
            ariaLabel: 'orders.actions.trackShipmentNumberNewTab:{"number":2}',
        });
    });
});

describe('getTrackShipmentHref', () => {
    it('prefers the first entry with a carrier URL (external)', () => {
        const target = getTrackShipmentHref(
            omsOrder([
                { id: 's1', trackingNumber: 'T1' },
                { id: 's2', trackingNumber: 'T2', trackingUrl: 'https://carrier.test/t2' },
            ])
        );
        expect(target).toEqual({ href: 'https://carrier.test/t2', external: true });
    });

    it('skips an entry whose URL is unsafe/unusable and uses the next externalizable one', () => {
        const target = getTrackShipmentHref(
            omsOrder([
                { id: 's1', trackingNumber: 'T1', trackingUrl: 'javascript:alert(1)' },
                { id: 's2', trackingNumber: 'T2', trackingUrl: 'www.carrier.test/t2' },
            ])
        );
        expect(target).toEqual({ href: 'https://www.carrier.test/t2', external: true });
    });

    it('falls back to the in-page anchor (not external) when tracking exists without a URL', () => {
        expect(getTrackShipmentHref(omsOrder([{ id: 's1', trackingNumber: 'T1' }]))).toEqual({
            href: `#${ORDER_TRACKING_SECTION_ID}`,
            external: false,
        });
    });

    it('returns null (hides action) for a URL-only entry whose URL is unsafe — no dead in-page anchor', () => {
        // The entry is displayable (has a trackingUrl) but NOT card-visible (no number/
        // provider/date), and the URL is unsafe so it can't externalize. OrderTracking would
        // render no section, so the #order-tracking anchor never mounts — the action must be
        // hidden rather than fall back to an anchor that scrolls nowhere.
        expect(getTrackShipmentHref(omsOrder([{ id: 's1', trackingUrl: 'javascript:alert(1)' }]))).toBeNull();
        expect(getTrackShipmentHref(omsOrder([{ id: 's1', trackingUrl: '/account/orders/1' }]))).toBeNull();
    });

    it('still uses the in-page anchor when a URL-only entry coexists with a card-visible entry', () => {
        // The section WILL render (the second entry is card-visible), so the in-page anchor
        // is a valid target even though no entry has an externalizable URL.
        expect(
            getTrackShipmentHref(
                omsOrder([
                    { id: 's1', trackingUrl: 'javascript:alert(1)' },
                    { id: 's2', trackingNumber: 'T2' },
                ])
            )
        ).toEqual({ href: `#${ORDER_TRACKING_SECTION_ID}`, external: false });
    });

    it('returns null when there is no tracking', () => {
        expect(getTrackShipmentHref(ecomOrder([]))).toBeNull();
    });

    it('returns null for a status-only entry (not trackable)', () => {
        expect(getTrackShipmentHref(ecomOrder([{ shipmentId: 'me', shippingStatus: 'not_shipped' }]))).toBeNull();
    });
});
