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
/** @sfdc-extension-file SFDC_EXT_SHIPPING_DELIVERY */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockLocale, mockSiteObject } from '@/test-utils/config';

const mockSite = mockSiteObject;
import { EstimatedDeliveryModalContent } from '../estimated-delivery-modal-content';
import type { EstimatedDeliveryData } from '@/extensions/shipping-delivery/lib/api/shipping-delivery.server';

const mockDeliveryData: EstimatedDeliveryData = {
    title: 'Fulfillment & Shipping',
    estimatedDelivery: {
        options: [
            { name: 'Standard Shipping', deliveryTime: '5-7 business days' },
            { name: 'Express Shipping', deliveryTime: '2-3 business days' },
            { name: 'Next Day Delivery', deliveryTime: '1 business day' },
        ],
        note: 'Delivery times are estimated and may vary based on your location.',
    },
    shippingOptions: [
        { name: 'Standard', deliveryTime: '5-7 business days', cost: 0, condition: 'Orders over $50' },
        { name: 'Express', deliveryTime: '2-3 business days', cost: 9.99 },
        { name: 'Next Day', deliveryTime: '1 business day', cost: 19.99 },
    ],
    internationalShipping: {
        heading: 'International Shipping',
        points: [
            'We ship to over 50 countries worldwide. International shipping rates and delivery times vary by destination.',
            'Customs & Duties: International orders may be subject to customs fees and import duties, which are the responsibility of the customer.',
        ],
        note: 'For specific international shipping rates, please continue to checkout and enter your shipping address.',
    },
    orderTracking: {
        heading: 'Order Tracking',
        points: [
            "Once your order ships, you'll receive a confirmation email with tracking information. You can track your order status in real-time through our website or mobile app.",
            'Need Help? Contact our customer service team if you have questions about your shipment or delivery.',
        ],
    },
};

function Wrapper({ deliveryData, currency }: { deliveryData: EstimatedDeliveryData; currency: string }) {
    return (
        <SiteProvider site={mockSite} locale={mockLocale} language={mockSiteObject.defaultLocale} currency={currency}>
            <div className="max-w-2xl p-6 space-y-6">
                <EstimatedDeliveryModalContent deliveryData={deliveryData} currency={currency} />
            </div>
        </SiteProvider>
    );
}

const meta: Meta<typeof Wrapper> = {
    title: 'Core/Overlays/Info Modal/Estimated Delivery Modal Content',
    component: Wrapper,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
EstimatedDeliveryModalContent is a renderer component that displays delivery options, shipping rates, international shipping notes, and order tracking information within the InfoModal.

This component is used internally by InfoModal when the modal type is 'estimated-delivery'.
                `,
            },
        },
    },
    // `deliveryData` is a deeply structured fixture that would render as
    // a JSON editor in Controls — fails the Designer-Friendly Input Rule.
    argTypes: {
        currency: {
            control: 'select',
            options: ['USD', 'EUR', 'GBP', 'JPY'],
            description: 'Currency code used to format shipping costs',
        },
        deliveryData: { control: false, table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof Wrapper>;

export const Default: Story = {
    args: {
        deliveryData: mockDeliveryData,
        currency: mockSiteObject.defaultCurrency,
    },
};
