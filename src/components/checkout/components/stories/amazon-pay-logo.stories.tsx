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
import { Title, Description, Controls } from '@storybook/addon-docs/blocks';
import AmazonPayLogo from '../amazon-pay-logo';
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

const meta: Meta<typeof AmazonPayLogo> = {
    title: 'Checkout/Payment/Logos/Amazon Pay Logo',
    component: AmazonPayLogo,
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'centered',
        controls: { expanded: true },
        docs: {
            description: {
                component: `
### AmazonPayLogo Component (PLACEHOLDER)

**⚠️ IMPORTANT: This is a PLACEHOLDER logo for UI demonstration only. It is not the official Amazon Pay brand asset.**

This component renders a generic Amazon Pay logo image used inside the placeholder \`ExpressPayments\` button. It exists solely to visually represent Amazon Pay in UI mockups and wireframes.

**Current Implementation:**
- Optimized PNG from \`public/images/amazon-pay-logo.png\`
- Used inside the Amazon Pay button in the \`ExpressPayments\` placeholder component
- Not the official Amazon Pay brand asset

**Production Replacement:**
When integrating a real Amazon Pay SDK, replace this placeholder with the **official Amazon Pay logo and button** provided through the Amazon Pay SDK / brand guidelines. Amazon provides branded button components (with correct colors, spacing, and logo usage) that must be used per their trademark/branding policies. See:
- [Amazon Pay Button Guidelines](https://developer.amazon.com/docs/amazon-pay-checkout/button-placement-guidelines.html)
- [Amazon Pay SDK](https://developer.amazon.com/docs/amazon-pay-checkout/setting-up-server.html)
                `,
            },
            page: () => (
                <>
                    <Title />
                    <Description />
                    <Controls />
                </>
            ),
        },
    },
    tags: ['autodocs'],
    argTypes: {
        className: {
            control: 'text',
            description: 'Additional CSS classes applied to the underlying `<img>` element.',
            table: {
                type: { summary: 'string' },
            },
        },
        decorative: {
            control: 'boolean',
            description:
                'When `true`, the image is hidden from the accessibility tree (`aria-hidden="true"`, empty `alt`). Use this when the logo is rendered inside a button that already provides an `aria-label`.',
            table: {
                type: { summary: 'boolean' },
                defaultValue: { summary: 'false' },
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof AmazonPayLogo>;

export const Default: Story = {
    args: {},
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const logo = canvasElement.querySelector('img[alt="Amazon Pay"]');
        await expect(logo).toBeInTheDocument();
    },
};

export const WithCustomClassName: Story = {
    args: {
        className: 'custom-class',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const logo = canvasElement.querySelector('img[alt="Amazon Pay"]');
        await expect(logo).toHaveClass('custom-class');
    },
};

/** Inside a button with its own label; image is decorative for assistive tech. */
export const Decorative: Story = {
    args: {
        decorative: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const logo = canvasElement.querySelector('img[aria-hidden="true"]');
        await expect(logo).toBeInTheDocument();
    },
};
