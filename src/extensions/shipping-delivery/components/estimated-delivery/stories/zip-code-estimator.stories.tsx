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
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { getPostalCodeFormat } from '@/lib/shipping-estimate/postal-code-formats';
import ZipCodeEstimator from '../zip-code-estimator';

function EstimatorStory({
    hasValidationError = false,
    hasLookupFailure = false,
    fallbackDeliveryDescription,
}: {
    hasValidationError?: boolean;
    hasLookupFailure?: boolean;
    fallbackDeliveryDescription?: string;
}) {
    const [inputValue, setInputValue] = useState('');
    return (
        <ZipCodeEstimator
            idPrefix="storybook-estimated-delivery"
            inputValue={inputValue}
            isLoading={false}
            hasValidationError={hasValidationError}
            hasLookupFailure={hasLookupFailure}
            fallbackDeliveryDescription={fallbackDeliveryDescription}
            format={getPostalCodeFormat(mockSiteObject.defaultLocale)}
            onInputChange={setInputValue}
            onCalculate={() => {}}
        />
    );
}

const meta: Meta<typeof EstimatorStory> = {
    title: 'Extensions/Shipping Delivery/Zip Code Estimator',
    component: EstimatorStory,
    tags: ['autodocs'],
    parameters: { layout: 'centered' },
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
type Story = StoryObj<typeof EstimatorStory>;

export const Default: Story = {};
export const InvalidPostalCode: Story = { args: { hasValidationError: true } };
export const MerchantFallback: Story = {
    args: {
        hasLookupFailure: true,
        fallbackDeliveryDescription: 'Delivered in 2-3 business days',
    },
};
