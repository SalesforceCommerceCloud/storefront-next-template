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
import { within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useState, type ReactElement } from 'react';
// @sfdc-extension-line SFDC_EXT_RATINGS_REVIEWS
import { action } from 'storybook/actions';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import InfoModal, { type InfoModalData } from '../index';
import { Button } from '@/components/ui/button';

function InfoModalWrapper({
    data,
    currency = mockSiteObject.defaultCurrency,
}: {
    data?: InfoModalData;
    currency?: string;
}): ReactElement {
    const [open, setOpen] = useState(false);

    return (
        <ConfigProvider config={mockConfig}>
            <SiteProvider
                site={mockSiteObject}
                locale={mockLocale}
                language={mockSiteObject.defaultLocale}
                currency={currency}>
                <div className="p-6">
                    <Button onClick={() => setOpen(true)}>Open Modal</Button>
                    <InfoModal open={open} onOpenChange={setOpen} data={data} />
                </div>
            </SiteProvider>
        </ConfigProvider>
    );
}

const meta: Meta<typeof InfoModalWrapper> = {
    title: 'Core/Overlays/Info Modal',
    component: InfoModalWrapper,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
The InfoModal is a generic, reusable modal component that displays informational content.

**Features:**
- Supports multiple modal types (payment-schedule, write-review, star-rating-distribution)
- Accepts structured data from adapters
- Handles all rendering logic internally
- Themeable and accessible

**Modal Types:**
- **Payment Schedule**: Displays title, description, payment schedule timeline, "How it works" steps, disclaimer, and Close button
- **Write Review**: Displays a form for submitting product reviews
- **Star Rating Distribution**: Displays star rating and distribution of ratings across 1-5 stars

**Usage:**
The modal accepts structured data with a specific type and transforms it into the appropriate UI.
                `,
            },
        },
    },
    argTypes: {
        // `data` is a discriminated union with deeply structured shapes —
        // JSON editor fails the Designer-Friendly Input Rule. The
        // branch-specific stories below cover every meaningful `type`.
        data: { control: false, table: { disable: true } },
        currency: {
            description: 'Currency code for formatting',
            control: 'select',
            options: ['USD', 'EUR', 'GBP', 'JPY'],
        },
    },
};

export default meta;
type Story = StoryObj<typeof InfoModalWrapper>;

export const NoData: Story = {
    args: {
        data: undefined,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const openButton = canvas.getByRole('button', { name: /open modal/i });
        await userEvent.click(openButton);

        // Verify the dialog opens — the post-mount text content is covered by snapshot.
        await within(document.body).findByRole('dialog', {}, { timeout: 5000 });
    },
};

export const PaymentScheduleType: Story = {
    args: {
        data: {
            type: 'payment-schedule',
            title: 'Pay in 4 interest-free payments',
            description: 'Split your purchase of $49.00 into 4 with no impact on credit score and no late fees.',
            paymentSchedule: {
                totalAmount: 59.0,
                numberOfPayments: 4,
                payments: [
                    { amount: 14.75, dueDate: 'Today' },
                    { amount: 14.75, dueDate: '2 weeks' },
                    { amount: 14.75, dueDate: '4 weeks' },
                    { amount: 14.75, dueDate: '6 weeks' },
                ],
            },
            steps: [
                { number: 1, text: 'Choose BNPL at checkout to pay later with Pay in 4.' },
                { number: 2, text: 'Complete your purchase with a 25% down payment.' },
                { number: 3, text: "Use autopay for the rest of your payments. It's easy!" },
            ],
            disclaimer: 'Subject to credit approval. Terms apply.',
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const openButton = canvas.getByRole('button', { name: /open modal/i });
        await userEvent.click(openButton);

        await within(document.body).findByRole('dialog', {}, { timeout: 5000 });
    },
};

export const PaymentScheduleOnly: Story = {
    args: {
        data: {
            type: 'payment-schedule',
            title: 'Pay in 4',
            paymentSchedule: {
                totalAmount: 100.0,
                numberOfPayments: 4,
                payments: [
                    { amount: 25.0, dueDate: 'Today' },
                    { amount: 25.0, dueDate: '2 weeks' },
                    { amount: 25.0, dueDate: '4 weeks' },
                    { amount: 25.0, dueDate: '6 weeks' },
                ],
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const openButton = canvas.getByRole('button', { name: /open modal/i });
        await userEvent.click(openButton);

        await within(document.body).findByRole('dialog', {}, { timeout: 5000 });
    },
};

// @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
export const StarRatingDistributionType: Story = {
    args: {
        data: {
            type: 'star-rating-distribution',
            title: '4.8 out of 5',
            rating: 4.8,
            reviewCount: 200,
            distributions: [
                { rating: 5, count: 120 },
                { rating: 4, count: 50 },
                { rating: 3, count: 20 },
                { rating: 2, count: 8 },
                { rating: 1, count: 2 },
            ],
            onSeeReviewsClick: action('see reviews clicked'),
        },
    },
    parameters: {
        docs: {
            description: {
                story: `
Star rating distribution modal displaying rating overview and distribution breakdown.

### Features:
- Modal width: 19rem (304px) to accommodate w-64 (256px) content + padding
- Content area: w-64 (256px)
- Star rating with right label and review count
- Distribution bars showing rating breakdown
- "See customer reviews" link button (follows project pattern: text-primary hover:underline)
- X button to close (top right)
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const openButton = canvas.getByRole('button', { name: /open modal/i });
        await userEvent.click(openButton);

        await within(document.body).findByRole('dialog', {}, { timeout: 5000 });
    },
};

// @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS

export const PaymentScheduleLongContent: Story = {
    args: {
        data: {
            type: 'payment-schedule',
            title: 'Pay over 12 months — full installment plan',
            description:
                'Split your purchase of $1,200.00 into 12 equal monthly payments at 0% interest. ' +
                'Approval is subject to a soft credit check and does not affect your credit score. ' +
                'Late payments may incur fees of up to $25. Subject to availability and merchant approval.',
            paymentSchedule: {
                totalAmount: 1200.0,
                numberOfPayments: 12,
                payments: Array.from({ length: 12 }, (_, i) => ({
                    amount: 100.0,
                    dueDate: i === 0 ? 'Today' : `Month ${i + 1}`,
                })),
            },
            steps: [
                { number: 1, text: 'Select Pay-Over-Time at checkout.' },
                { number: 2, text: 'Confirm the payment schedule and authorize the soft credit check.' },
                { number: 3, text: 'Pay the first installment immediately on order confirmation.' },
                { number: 4, text: 'Subsequent installments are billed automatically each month.' },
                { number: 5, text: 'Manage or pay off early any time from your account dashboard.' },
            ],
            disclaimer:
                'Subject to credit approval. Terms and conditions apply. Late fees of up to $25 may be charged. ' +
                'See merchant agreement for full terms. Available only to US residents over 18.',
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Long-content payment schedule with 12 payments and extended copy — verifies the modal scrolls cleanly without breaking layout.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const openButton = canvas.getByRole('button', { name: /open modal/i });
        await userEvent.click(openButton);

        await within(document.body).findByRole('dialog', {}, { timeout: 5000 });
    },
};

// @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
export const StarRatingDistributionHighlyRated: Story = {
    args: {
        data: {
            type: 'star-rating-distribution',
            rating: 4.9,
            reviewCount: 200,
            distributions: [
                { rating: 5, count: 180 },
                { rating: 4, count: 15 },
                { rating: 3, count: 3 },
                { rating: 2, count: 1 },
                { rating: 1, count: 1 },
            ],
            onSeeReviewsClick: action('see reviews clicked'),
        },
    },
    parameters: {
        docs: {
            description: {
                story: `
Highly rated product with most reviews being 5-star. Demonstrates how the modal handles excellent ratings with heavily skewed distribution.

### Features:
- 4.9 rating with 90% 5-star reviews
- Distribution bars show clear visual hierarchy
- Modal title defaults to rating label when not explicitly provided
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const openButton = canvas.getByRole('button', { name: /open modal/i });
        await userEvent.click(openButton);

        await within(document.body).findByRole('dialog', {}, { timeout: 5000 });
    },
};
// @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
