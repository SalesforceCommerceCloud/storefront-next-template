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
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { PaymentScheduleModalContent } from '../../payment-schedule-modal-content';
import type { PaymentSchedule, StepInfo } from '../../../types';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import {
    basketWithInstallmentSchedule,
    basketWithSinglePayment,
    basketWithUnavailableSchedule,
} from '@/components/__mocks__';
import type { ReactElement } from 'react';

interface RendererArgs {
    paymentSchedule?: PaymentSchedule;
    steps?: StepInfo[];
    disclaimer?: string;
    currency?: string;
}

function PaymentScheduleModalContentWrapper({
    paymentSchedule,
    steps,
    disclaimer,
    currency = mockSiteObject.defaultCurrency,
}: RendererArgs): ReactElement {
    return (
        <ConfigProvider config={mockConfig}>
            <SiteProvider
                site={mockSiteObject}
                locale={mockLocale}
                language={mockSiteObject.defaultLocale}
                currency={currency}>
                <div className="max-w-md p-6">
                    <PaymentScheduleModalContent
                        paymentSchedule={paymentSchedule}
                        steps={steps}
                        disclaimer={disclaimer}
                        currency={currency}
                    />
                </div>
            </SiteProvider>
        </ConfigProvider>
    );
}

const meta: Meta<typeof PaymentScheduleModalContentWrapper> = {
    title: 'Core/Overlays/Info Modal/Payment Schedule Modal Content',
    component: PaymentScheduleModalContentWrapper,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
\`<PaymentScheduleModalContent>\` is a *content renderer* mounted inside \`<InfoModal data={{ type: 'payment-schedule', ... }}>\` — it has no open/close state, so Pattern 11 (closed-by-default + trigger) does not apply here. The trigger lives on \`<InfoModal>\`'s own stories.

These stories cover the three resolved \`PaymentScheduleModalData\` shapes BNPL's loader produces (Pattern 16):

| Story | Fixture | Description |
|-------|---------|-------------|
| **Default** | \`basketWithInstallmentSchedule\` | Standard "Pay in 4" with full timeline + steps + disclaimer |
| **PaymentScheduleOnly** | inline | Schedule only, no steps/disclaimer (tests the schedule-only render path) |
| **StepsOnly** | inline | Steps only, no schedule (tests the steps-only render path) |
| **SinglePayment** | \`basketWithSinglePayment\` | Single-payment plan — verifies the timeline collapses to one dot |
| **Unavailable** | \`basketWithUnavailableSchedule\` | No schedule — only steps + disclaimer render |
                `,
            },
        },
    },
    // `paymentSchedule` and `steps` are deeply structured fixtures that
    // would render as JSON editors in Controls — fails the
    // Designer-Friendly Input Rule. The branch-specific stories below
    // already cover every meaningful shape via realistic args. `disclaimer`
    // is exposed as a text control; `currency` as a small select.
    argTypes: {
        disclaimer: {
            control: 'text',
            description: 'Disclaimer text rendered below the schedule',
        },
        currency: {
            control: 'select',
            options: ['USD', 'EUR', 'GBP', 'JPY'],
            description: 'Currency code used to format payment amounts',
        },
        paymentSchedule: { control: false, table: { disable: true } },
        steps: { control: false, table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof PaymentScheduleModalContentWrapper>;

const installmentArgs = {
    paymentSchedule: basketWithInstallmentSchedule.paymentSchedule,
    steps: basketWithInstallmentSchedule.steps,
    disclaimer: basketWithInstallmentSchedule.disclaimer,
    currency: mockSiteObject.defaultCurrency,
};

export const Default: Story = {
    args: installmentArgs,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Payment Schedule')).toBeInTheDocument();
        await expect(canvas.getByText('How it works')).toBeInTheDocument();
        await expect(canvas.getByText('Subject to credit approval. Terms apply.')).toBeInTheDocument();
    },
};

export const PaymentScheduleOnly: Story = {
    args: {
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
        currency: mockSiteObject.defaultCurrency,
    },
};

export const StepsOnly: Story = {
    args: {
        steps: [
            { number: 1, text: 'Select payment method at checkout' },
            { number: 2, text: 'Choose Pay in 4' },
            { number: 3, text: 'Complete your purchase' },
        ],
        currency: mockSiteObject.defaultCurrency,
    },
};

export const SinglePayment: Story = {
    args: {
        paymentSchedule: basketWithSinglePayment.paymentSchedule,
        steps: basketWithSinglePayment.steps,
        disclaimer: basketWithSinglePayment.disclaimer,
        currency: mockSiteObject.defaultCurrency,
    },
    parameters: {
        docs: {
            description: {
                story: 'Single-payment plan — timeline collapses to a single dot. Backed by `basketWithSinglePayment`.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Payment Schedule')).toBeInTheDocument();
        await expect(canvas.getByText('How it works')).toBeInTheDocument();
    },
};

export const Unavailable: Story = {
    args: {
        paymentSchedule: basketWithUnavailableSchedule.paymentSchedule,
        steps: basketWithUnavailableSchedule.steps,
        disclaimer: basketWithUnavailableSchedule.disclaimer,
        currency: mockSiteObject.defaultCurrency,
    },
    parameters: {
        docs: {
            description: {
                story: 'Plan unavailable for this basket — only steps + disclaimer render, no schedule. Backed by `basketWithUnavailableSchedule`.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // Schedule heading should not render
        await expect(canvas.queryByText('Payment Schedule')).not.toBeInTheDocument();
        await expect(canvas.getByText('How it works')).toBeInTheDocument();
    },
};
