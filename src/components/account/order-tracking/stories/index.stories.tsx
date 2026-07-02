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
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { OrderLike } from '@/lib/order-management/types';
import OrderTracking, { TrackShipmentAction } from '../index';

/**
 * Synthetic args that mutate the order fixture (they are NOT real component props —
 * the only real prop is `order`). Grouped under a "Synthetic (data shape)" Controls
 * category so designers can tell them apart from real props.
 */
type PlaygroundArgs = {
    source: 'oms' | 'ecom';
    hasTrackingNumber: boolean;
    hasCarrierLink: boolean;
    hasProvider: boolean;
    hasExpectedDate: boolean;
    hasActualDate: boolean;
    secondShipment: boolean;
};

/**
 * Build an OMS order fixture directly from a list of shipment shapes. Used by the
 * edge-case stories that the synthetic Controls can't express (e.g. an unsafe
 * `trackingUrl`, or a URL-only / status-only shipment).
 */
function omsOrder(shipments: Record<string, unknown>[]): OrderLike {
    return { orderNo: 'INO001', omsData: { shipments } } as unknown as OrderLike;
}

/** Build an order fixture from the synthetic Controls args. */
function buildOrder(a: PlaygroundArgs): OrderLike {
    const makeOms = (n: string) => ({
        id: `oms-${n}`,
        status: 'shipped',
        provider: a.hasProvider ? 'UPS' : undefined,
        trackingNumber: a.hasTrackingNumber ? `1Z-${n}` : undefined,
        trackingUrl: a.hasCarrierLink ? `https://carrier.example/track/${n}` : undefined,
        expectedDeliveryDate: a.hasExpectedDate ? '2026-06-25T10:00:00.000Z' : undefined,
        actualDeliveryDate: a.hasActualDate ? '2026-06-24T16:00:00.000Z' : undefined,
    });
    const makeEcom = (n: string) => ({
        shipmentId: `ecom-${n}`,
        shippingStatus: 'shipped',
        trackingNumber: a.hasTrackingNumber ? `ECOM-${n}` : undefined,
    });

    if (a.source === 'oms') {
        const shipments = [makeOms('1'), ...(a.secondShipment ? [makeOms('2')] : [])];
        return { orderNo: 'INO001', omsData: { shipments } } as unknown as OrderLike;
    }
    const shipments = [makeEcom('1'), ...(a.secondShipment ? [makeEcom('2')] : [])];
    return { orderNo: 'INO001', shipments } as unknown as OrderLike;
}

const meta: Meta<PlaygroundArgs> = {
    title: 'ACCOUNT/Order Tracking',
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Per-shipment OMS tracking block for the Order Details page. Renders the tracking number as the carrier link (`data-testid="tracking-number-link"`) when a `trackingUrl` is present, plain text (`tracking-number-text`) otherwise; plus carrier/provider and expected/actual delivery dates. Sourced from `getOrderTrackingEntries` (OMS-preferred, ECOM fallback — ECOM carries only a number + status). Renders nothing when there is no displayable tracking (e.g. a not-yet-shipped order). The companion `TrackShipmentAction` (`track-shipment-action`) deep-links to the carrier, or to the in-page tracking section when no carrier link exists, and is hidden when nothing is trackable.',
            },
        },
    },
    tags: ['autodocs'],
    // No per-story decorators: the global preview stack (withRouter → StorybookConfigProvider
    // + StorybookSiteProvider + I18nextProvider) already supplies config, site, and i18n.
    // The component takes its data via the `order` prop and reads i18n from useTranslation.
    argTypes: {
        source: {
            control: 'radio',
            options: ['oms', 'ecom'],
            description: 'Tracking source. OMS exposes provider/link/dates; ECOM is tracking number + status only.',
            table: { category: 'Synthetic (data shape)' },
        },
        hasTrackingNumber: {
            control: 'boolean',
            description: 'Whether the shipment has a tracking number.',
            table: { category: 'Synthetic (data shape)' },
        },
        hasCarrierLink: {
            control: 'boolean',
            description: 'OMS only: render the tracking number as a link to the carrier (else plain text).',
            table: { category: 'Synthetic (data shape)' },
        },
        hasProvider: {
            control: 'boolean',
            description: 'OMS only: show the carrier/provider name.',
            table: { category: 'Synthetic (data shape)' },
        },
        hasExpectedDate: {
            control: 'boolean',
            description: 'OMS only: show the expected delivery date.',
            table: { category: 'Synthetic (data shape)' },
        },
        hasActualDate: {
            control: 'boolean',
            description: 'OMS only: show the actual (delivered) date.',
            table: { category: 'Synthetic (data shape)' },
        },
        secondShipment: {
            control: 'boolean',
            description: 'Add a second shipment to show the flat multi-shipment list.',
            table: { category: 'Synthetic (data shape)' },
        },
    },
};

export default meta;
type Story = StoryObj<PlaygroundArgs>;

/** Controls-driven story — toggle the data shape to see every tracking state. */
export const Playground: Story = {
    args: {
        source: 'oms',
        hasTrackingNumber: true,
        hasCarrierLink: true,
        hasProvider: true,
        hasExpectedDate: true,
        hasActualDate: false,
        secondShipment: false,
    },
    render: (args) => <OrderTracking order={buildOrder(args)} />,
};

/**
 * The standalone "Track shipment" order-action (rendered in the order-actions row).
 * Deep-links to the carrier when a tracking URL exists.
 */
export const TrackShipmentActionStory: Story = {
    name: 'Track Shipment Action',
    args: {
        source: 'oms',
        hasTrackingNumber: true,
        hasCarrierLink: true,
        hasProvider: false,
        hasExpectedDate: false,
        hasActualDate: false,
        secondShipment: false,
    },
    render: (args) => <TrackShipmentAction order={buildOrder(args)} />,
};

// --- Edge cases ---------------------------------------------------------------
// Named, fixed-fixture stories that pin the behaviors the synthetic Controls can't
// express. These document (and snapshot) the URL-safety and empty-card handling.

/**
 * Number + an UNSAFE `trackingUrl` (userinfo spoof: real host is `evil.com`).
 * `ensureExternalUrl` rejects it, so the number renders as plain text — never a
 * link to the spoof host.
 */
export const UnsafeTrackingUrl: Story = {
    name: 'Number + unsafe URL (→ plain text)',
    render: () => (
        <OrderTracking
            order={omsOrder([
                { id: 's1', status: 'shipped', trackingNumber: 'SPOOF-1', trackingUrl: 'https://www.ups.com@evil.com' },
            ])}
        />
    ),
};

/**
 * A scheme-less `trackingUrl` (`www.carrier.example/t`). `ensureExternalUrl`
 * prepends `https://` so the browser navigates to the carrier instead of resolving
 * it as a path relative to the current page.
 */
export const SchemelessTrackingUrl: Story = {
    name: 'Number + scheme-less URL (→ external link)',
    render: () => (
        <OrderTracking
            order={omsOrder([
                { id: 's1', status: 'shipped', trackingNumber: '1Z-1', trackingUrl: 'www.carrier.example/track/1' },
            ])}
        />
    ),
};

/**
 * URL-only shipment (no number/provider/date). The carrier link sits on the
 * tracking number, so a URL alone has nothing card-visible → NO card renders
 * (avoids an empty box). The "Track shipment" action can still use the bare URL.
 */
export const UrlOnlyNoCard: Story = {
    name: 'URL only (→ no card)',
    render: () => (
        <OrderTracking order={omsOrder([{ id: 's1', status: 'shipped', trackingUrl: 'https://carrier.example/t' }])} />
    ),
};

/**
 * Status-only shipment (e.g. not-yet-shipped). No number/provider/date → NO card
 * renders; the status is conveyed by the shipping-status badge elsewhere on the
 * page, not by this block.
 */
export const StatusOnlyNothing: Story = {
    name: 'Status only (→ nothing)',
    render: () => <OrderTracking order={omsOrder([{ id: 's1', status: 'not_shipped' }])} />,
};

/**
 * Provider + delivery dates but NO tracking number. The card renders the carrier
 * and date lines without a "Tracking Number" label.
 */
export const ProviderAndDatesNoNumber: Story = {
    name: 'Provider + dates, no number',
    render: () => (
        <OrderTracking
            order={omsOrder([
                {
                    id: 's1',
                    status: 'shipped',
                    provider: 'UPS',
                    expectedDeliveryDate: '2026-06-30T10:00:00.000Z',
                    actualDeliveryDate: '2026-06-28T16:00:00.000Z',
                },
            ])}
        />
    ),
};

/**
 * The "Track shipment" action when no entry has a usable carrier URL: it links to
 * the in-page `#order-tracking` section (no external icon) rather than deep-linking
 * to a carrier.
 */
export const TrackShipmentActionInPage: Story = {
    name: 'Track Shipment Action (in-page anchor)',
    render: () => <TrackShipmentAction order={omsOrder([{ id: 's1', status: 'shipped', trackingNumber: '1Z-1' }])} />,
};
