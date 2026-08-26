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
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import EstimatedDelivery from '../index';

const meta: Meta<typeof EstimatedDelivery> = {
    title: 'Extensions/Shipping Delivery/Estimated Delivery',
    component: EstimatedDelivery,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        mockRoutes: [
            {
                path: '/resource/shipping-estimate',
                loader: () => ({
                    success: true,
                    productId: 'test-product-id',
                    zipcode: '94105',
                    estimate: {
                        deliveryWindow: {
                            startAt: '2027-01-02T00:00:00Z',
                            endAt: '2027-01-05T00:00:00Z',
                        },
                        shippingOptions: [
                            {
                                shippingMethodId: 'ground',
                                name: 'Ground',
                                price: 0,
                                currency: 'USD',
                                deliveryWindow: {
                                    startAt: '2027-01-02T00:00:00Z',
                                    endAt: '2027-01-05T00:00:00Z',
                                },
                            },
                            {
                                shippingMethodId: 'express',
                                name: 'Express',
                                price: 9.99,
                                currency: 'USD',
                                deliveryWindow: {
                                    startAt: '2027-01-01T00:00:00Z',
                                    endAt: '2027-01-03T00:00:00Z',
                                },
                            },
                        ],
                    },
                }),
            },
        ],
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

export const NoDestination: Story = { args: { productId: 'test-product-id' } };

export const Summary: Story = {
    args: {
        productId: 'test-product-id',
        initialDestination: { postalCode: '94105', countryCode: 'US' },
        displayStyle: 'summary',
    },
};

export const Detailed: Story = {
    args: {
        productId: 'test-product-id',
        initialDestination: { postalCode: '94105', countryCode: 'US' },
        displayStyle: 'detailed',
    },
};
