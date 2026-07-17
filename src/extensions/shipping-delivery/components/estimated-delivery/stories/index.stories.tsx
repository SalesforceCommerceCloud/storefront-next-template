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
import { within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import EstimatedDelivery from '../index';
import type { EstimatedDeliveryData } from '@/extensions/shipping-delivery/lib/api/shipping-delivery.server';

const mockData: EstimatedDeliveryData = {
    title: 'Fulfillment & Shipping',
    estimatedDelivery: {
        options: [
            { name: 'Standard Shipping', deliveryTime: '5-7 business days' },
            { name: 'Express Shipping', deliveryTime: '2-3 business days' },
            { name: 'Overnight Shipping', deliveryTime: 'Next business day' },
        ],
        note: 'Delivery estimates are calculated from the date your order ships.',
    },
    shippingOptions: [
        {
            name: 'Standard Shipping',
            deliveryTime: '5-7 business days',
            cost: 5.99,
            condition: 'Free on orders over $50',
        },
        {
            name: 'Express Shipping',
            deliveryTime: '2-3 business days',
            cost: 12.99,
            condition: 'Free on orders over $100',
        },
        {
            name: 'Overnight Shipping',
            deliveryTime: 'Next business day',
            cost: 24.99,
            condition: 'Orders placed before 2 PM EST',
        },
    ],
    internationalShipping: {
        heading: 'International Shipping',
        points: [
            'We ship to over 50 countries worldwide.',
            'Customs & Duties: International orders may be subject to customs fees.',
        ],
        note: 'For specific international shipping rates, enter your shipping address at checkout.',
    },
    orderTracking: {
        heading: 'Order Tracking',
        points: [
            "Once your order ships, you'll receive a confirmation email with tracking information.",
            'Need Help? Contact our customer service team.',
        ],
    },
};

const meta: Meta<typeof EstimatedDelivery> = {
    title: 'Extensions/Shipping Delivery/Estimated Delivery',
    component: EstimatedDelivery,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
    },
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <div className="w-[400px]">
                        <Story />
                    </div>
                </SiteProvider>
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof EstimatedDelivery>;

export const Default: Story = {
    args: {
        data: mockData,
    },
};

export const SingleOption: Story = {
    args: {
        data: {
            ...mockData,
            estimatedDelivery: {
                options: [{ name: 'Standard Shipping', deliveryTime: '5-7 business days' }],
                note: 'Free shipping on all orders.',
            },
        },
    },
};

export const ModalInteraction: Story = {
    args: {
        data: mockData,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const learnMoreButton = canvas.getByRole('button', { name: /learn more/i });
        await userEvent.click(learnMoreButton);

        await within(document.body).findByRole('dialog', {}, { timeout: 5000 });
    },
};
