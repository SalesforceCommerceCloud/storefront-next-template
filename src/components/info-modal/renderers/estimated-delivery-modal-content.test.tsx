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
import type React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider, type Site } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockSiteObject } from '@/test-utils/config';
import type { ShippingEstimateOption } from '@/lib/shipping-estimate/types';
import { EstimatedDeliveryModalContent } from './estimated-delivery-modal-content';

const mockSite: Site = mockSiteObject;
const mockLocale =
    mockSite.supportedLocales.find((locale) => locale.id === mockSite.defaultLocale) ?? mockSite.supportedLocales[0];
const shippingOptions: ShippingEstimateOption[] = [
    {
        shippingMethodId: 'ground',
        name: 'Ground',
        price: 0,
        currency: 'USD',
        deliveryWindow: { startAt: '2027-01-02T00:00:00Z', endAt: '2027-01-05T00:00:00Z' },
    },
    {
        shippingMethodId: 'express',
        name: 'Express',
        description: 'Fast delivery',
        price: 9.99,
        currency: 'USD',
        deliveryWindow: { startAt: '2027-01-01T00:00:00Z', endAt: '2027-01-03T00:00:00Z' },
    },
];

const renderWithConfig = (ui: React.ReactElement) =>
    render(
        <ConfigProvider config={mockConfig}>
            <SiteProvider site={mockSite} locale={mockLocale} language={mockSiteObject.defaultLocale} currency="USD">
                {ui}
            </SiteProvider>
        </ConfigProvider>
    );

describe('EstimatedDeliveryModalContent', () => {
    it('renders each calculated delivery option with its delivery window and price', () => {
        renderWithConfig(<EstimatedDeliveryModalContent shippingOptions={shippingOptions} />);

        expect(screen.getByRole('heading', { name: 'Shipping Options' })).toBeInTheDocument();
        expect(screen.getByText('Ground')).toBeInTheDocument();
        expect(screen.getByText('Express')).toBeInTheDocument();
        expect(screen.getByText('Free')).toBeInTheDocument();
        expect(screen.getByText('$9.99')).toBeInTheDocument();
        expect(screen.getByText('Fast delivery')).toBeInTheDocument();
        expect(screen.getAllByText(/Jan/)).toHaveLength(2);
    });
});
