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
/** @sfdc-extension-file SFDC_EXT_BNPL */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { type ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, useInRouterContext } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import BuyNowPayLater from '../index';
import type { BuyNowPayLaterMessageData, BuyNowPayLaterLearnMoreData } from '@/extensions/bnpl/lib/api/bnpl.server';
import { ActionLogger } from '../../../../../../.storybook/decorators';

const messageData: BuyNowPayLaterMessageData = {
    paymentCount: 4,
    amountPerPayment: 12.25,
};

const learnMoreData: BuyNowPayLaterLearnMoreData = {
    paymentSchedule: {
        amountPerPayment: 12.25,
        totalAmount: 49,
        schedule: ['Today', '2 weeks', '4 weeks', '6 weeks'],
    },
    howItWorks: [
        'Choose BNPL at checkout to pay later with Pay in 4.',
        'Complete your purchase with a 25% down payment.',
        "Use autopay for the rest of your payments. It's easy!",
    ],
    disclosures:
        'Pay in 4 is available to consumers upon approval for purchases of $30 to $1,500. Offer availability depends on the merchant and may not be available for certain recurring or subscription services.',
    disclosureLinks: [
        { label: 'Find more disclosures related to Pay in 4' },
        { label: 'See other ways to pay over time' },
    ],
};

const meta: Meta<typeof BuyNowPayLater> = {
    title: 'Extensions/BNPL/Buy Now Pay Later',
    component: BuyNowPayLater,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Inline installment message + "Learn more" payment-schedule modal rendered on the PDP. Data is supplied as props from the route loader; this story passes mock fixtures directly. Backed by `lib/api/bnpl.server.ts` (mock by default).',
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => {
            const RouterWrapper = (): ReactElement => {
                const inRouter = useInRouterContext();
                const content = (
                    <ConfigProvider config={mockConfig}>
                        <SiteProvider
                            site={mockSiteObject}
                            locale={mockLocale}
                            language={mockSiteObject.defaultLocale}
                            currency={mockSiteObject.defaultCurrency}>
                            <ActionLogger>
                                <div className="max-w-md p-6">
                                    <Story />
                                </div>
                            </ActionLogger>
                        </SiteProvider>
                    </ConfigProvider>
                );

                if (inRouter) return content;

                const router = createMemoryRouter([{ path: '/', element: content }], {
                    initialEntries: ['/'],
                });
                return <RouterProvider router={router} />;
            };

            return <RouterWrapper />;
        },
    ],
};

export default meta;
type Story = StoryObj<typeof BuyNowPayLater>;

export const Default: Story = {
    args: { messageData, learnMoreData },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText(/Pay in 4 interest-free payments of/i)).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /learn more/i })).toBeInTheDocument();
    },
};

export const OpenLearnMoreModal: Story = {
    args: { messageData, learnMoreData },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // Preload the lazy InfoModal chunk so it is ready when "Learn more" is clicked.
        await import('@/components/info-modal');
        const canvas = within(canvasElement);

        const learnMoreButton = canvas.getByRole('button', { name: /learn more/i });
        await userEvent.click(learnMoreButton);

        const documentBody = within(document.body);
        const dialog = await documentBody.findByRole('dialog', {}, { timeout: 5000 });
        await expect(dialog).toBeInTheDocument();
    },
};
