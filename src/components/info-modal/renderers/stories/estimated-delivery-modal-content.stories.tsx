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
import type { ShippingEstimateOption } from '@/lib/shipping-estimate/types';
import { EstimatedDeliveryModalContent } from '../estimated-delivery-modal-content';

const shippingOptions: ShippingEstimateOption[] = [
    {
        shippingMethodId: 'ground',
        name: 'Ground Shipping',
        price: 0,
        currency: 'USD',
        deliveryWindow: { startAt: '2027-01-02T00:00:00Z', endAt: '2027-01-05T00:00:00Z' },
    },
    {
        shippingMethodId: 'express',
        name: 'Express Shipping',
        description: 'Fast delivery',
        price: 9.99,
        currency: 'USD',
        deliveryWindow: { startAt: '2027-01-01T00:00:00Z', endAt: '2027-01-03T00:00:00Z' },
    },
];

function Wrapper() {
    return (
        <SiteProvider
            site={mockSiteObject}
            locale={mockLocale}
            language={mockSiteObject.defaultLocale}
            currency={mockSiteObject.defaultCurrency}>
            <div className="max-w-2xl p-6">
                <EstimatedDeliveryModalContent shippingOptions={shippingOptions} />
            </div>
        </SiteProvider>
    );
}

const meta: Meta<typeof Wrapper> = {
    title: 'Core/Overlays/Info Modal/Estimated Delivery Modal Content',
    component: Wrapper,
    tags: ['autodocs'],
    parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Wrapper>;

export const Default: Story = {};
