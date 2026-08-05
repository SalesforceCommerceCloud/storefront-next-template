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
import { useTranslation } from 'react-i18next';
import { ShipmentShippingStatusBadge } from '../shipment-shipping-status-badge';

/** Thin render wrapper so the story can supply `t` from the live i18n instance instead of a prop control. */
function ShipmentShippingStatusBadgeStory({ shippingStatus }: { shippingStatus: string | undefined }) {
    const { t } = useTranslation('account');
    return <ShipmentShippingStatusBadge shippingStatus={shippingStatus} t={t} />;
}

const meta: Meta<typeof ShipmentShippingStatusBadgeStory> = {
    title: 'Account/Orders/Order Details/Shipment Shipping Status Badge',
    component: ShipmentShippingStatusBadgeStory,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Per-shipment shipping-status badge (`getShippingStatusConfig` / `data-testid="shipping-status-badge"`). Renders raw text in a neutral badge when the status is not one of the known SCAPI enum values, and renders nothing when there is no status to show.',
            },
        },
    },
    tags: ['autodocs'],
    // No per-story decorators: the global preview stack already supplies i18n.
};

export default meta;
type Story = StoryObj<typeof ShipmentShippingStatusBadgeStory>;

export const NotShipped: Story = {
    args: { shippingStatus: 'not_shipped' },
};

export const PartShipped: Story = {
    args: { shippingStatus: 'part_shipped' },
};

export const Shipped: Story = {
    args: { shippingStatus: 'shipped' },
};

/** Not one of the known SCAPI enum values — falls back to a neutral badge with the raw formatted text. */
export const UnknownStatus: Story = {
    args: { shippingStatus: 'awaiting_pickup' },
};

export const NoStatus: Story = {
    args: { shippingStatus: undefined },
};
