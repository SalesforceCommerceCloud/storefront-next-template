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
/** @sfdc-extension-file SFDC_EXT_PRODUCT_CONTENT */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { createMemoryRouter, RouterProvider, useInRouterContext } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import ReturnsAndWarranty from '../index';
import type { ReturnsAndWarrantyData } from '@/extensions/product-content/lib/api/product-content.server';
import type { ReactElement } from 'react';

const mockData: ReturnsAndWarrantyData = {
    title: '30-Day Returns & 1 Year Warranty',
    description: 'Returns accepted within 30 days. Full warranty coverage included.',
    returnsPolicy: {
        heading: '30-Day Returns Policy',
        intro: 'Return most items within 30 days of delivery for a full refund or exchange.',
        conditions: ['Original condition', 'Tags attached'],
        howToReturn: ['Log in', 'Print label', 'Drop off'],
        note: 'Return shipping costs are the responsibility of the customer.',
    },
    warranty: {
        heading: '1-Year Warranty',
        intro: '1-year manufacturer warranty for defects in materials and workmanship.',
        whatsCovered: ['Defects'],
        whatsNotCovered: ['Wear and tear'],
        claimsProcess: 'Contact customer service.',
    },
    exchanges: {
        heading: 'Exchanges',
        intro: 'Hassle-free exchanges within 30 days.',
        process: 'Follow the return flow.',
    },
    needHelp: {
        intro: 'Customer service is here to help.',
        email: 'support@example.com',
        phone: '1-800-000-0000',
    },
};

function ReturnsAndWarrantyWrapper(): ReactElement {
    const inRouter = useInRouterContext();
    const content = (
        <ConfigProvider config={mockConfig}>
            <SiteProvider
                site={mockSiteObject}
                locale={mockLocale}
                language={mockSiteObject.defaultLocale}
                currency={mockSiteObject.defaultCurrency}>
                <div className="max-w-md p-6">
                    <ReturnsAndWarranty data={mockData} />
                </div>
            </SiteProvider>
        </ConfigProvider>
    );

    if (inRouter) {
        return content;
    }

    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: content,
            },
        ],
        { initialEntries: ['/'] }
    );

    return <RouterProvider router={router} />;
}

const meta: Meta<typeof ReturnsAndWarrantyWrapper> = {
    title: 'Extensions/Product Content/Returns And Warranty',
    component: ReturnsAndWarrantyWrapper,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
    },
};

export default meta;
type Story = StoryObj<typeof ReturnsAndWarrantyWrapper>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const card = await canvas.findByText('30-Day Returns & 1 Year Warranty', {}, { timeout: 5000 });
        await expect(card).toBeInTheDocument();
        await expect(canvas.getByText('View Policies')).toBeInTheDocument();
    },
};
