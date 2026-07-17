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
import PayPalLogo from '../paypal-logo';
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

const meta: Meta<typeof PayPalLogo> = {
    title: 'Checkout/Payment/Logos/PayPal Logo',
    component: PayPalLogo,
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'centered',
        controls: { expanded: true },
        docs: {
            description: {
                component: `
### PayPalLogo Component (PLACEHOLDER)

**⚠️ IMPORTANT: This is a PLACEHOLDER logo for UI demonstration only. It is not the official PayPal brand asset.**

This component renders a generic PayPal wordmark logo used inside the placeholder \`ExpressPayments\` button. It exists solely to visually represent PayPal in UI mockups and wireframes.

**Current Implementation:**
- Local SVG from \`public/images/paypal.svg\`
- Used inside the PayPal button in the \`ExpressPayments\` placeholder component
- Not the official PayPal brand asset

**Note:** On the storefront, this logo is rendered inside the \`StaticPayPalButton\`, which provides the official PayPal gold background (\`#FFC439\`). The logo itself is background-agnostic and can be composed into other button styles — see the \`CHECKOUT/StaticPayPalButton\` stories to view the full branded button.

**Production Replacement:**
When integrating real PayPal, replace this placeholder with the **official PayPal Smart Payment Buttons** from the PayPal JS SDK. PayPal has strict brand guidelines that mandate using their supplied button components (with correct logo usage, colors, shapes, and sizing). See:
- [PayPal Logo & Branding Guidelines](https://www.paypal.com/us/brc/article/logo-guidelines)
- [PayPal JS SDK — Smart Payment Buttons](https://developer.paypal.com/sdk/js/reference/)
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
type Story = StoryObj<typeof PayPalLogo>;

export const Default: Story = {
    args: {},
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const logo = canvasElement.querySelector('img[alt="PayPal"]');
        await expect(logo).toBeInTheDocument();
    },
};

export const WithCustomClassName: Story = {
    args: {
        className: 'custom-class',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const logo = canvasElement.querySelector('img[alt="PayPal"]');
        await expect(logo).toHaveClass('custom-class');
    },
};

export const Decorative: Story = {
    args: {
        decorative: true,
    },
    parameters: {
        docs: {
            description: {
                story: 'Decorative mode — use when the logo is inside a labeled button. Image is hidden from the accessibility tree (`aria-hidden="true"`).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const logo = canvasElement.querySelector('img[aria-hidden="true"]');
        await expect(logo).toBeInTheDocument();
    },
};
