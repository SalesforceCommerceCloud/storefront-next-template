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
import StaticPayPalButton from '../static-paypal-button';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';

import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

const meta: Meta<typeof StaticPayPalButton> = {
    title: 'Checkout/Payment/Static PayPal Button',
    component: StaticPayPalButton,
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'centered',
        controls: { expanded: true },
        docs: {
            description: {
                component: `
### StaticPayPalButton Component (PLACEHOLDER)

**⚠️ IMPORTANT: This is a PLACEHOLDER button for UI demonstration only. It does not launch the real PayPal checkout flow.**

This component renders a static PayPal-branded button styled to match the official PayPal SDK gold button appearance. It wraps the \`PayPalLogo\` in a button with the official PayPal gold background (\`#FFC439\`) and is used inside the placeholder \`ExpressPayments\` component.

**Current Implementation:**
- Uses the PayPal gold color (\`#FFC439\` via the \`--paypal-gold\` CSS variable)
- Renders the decorative \`PayPalLogo\` inside a labeled \`<button>\` (\`aria-label="PayPal"\`)
- Calls the provided \`onClick\` handler when clicked — no PayPal SDK, no payment session
- Visual styling only; no real PayPal checkout integration

**Production Replacement:**
When integrating real PayPal, replace this placeholder with the **official PayPal Smart Payment Buttons** rendered via the PayPal JS SDK. PayPal's SDK handles button rendering, eligibility checks, funding source logic, and the full checkout flow. PayPal has strict brand guidelines that mandate using their supplied button components. See:
- [PayPal JS SDK — Smart Payment Buttons](https://developer.paypal.com/sdk/js/reference/)
- [PayPal Logo & Branding Guidelines](https://www.paypal.com/us/brc/article/logo-guidelines)
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
    tags: ['autodocs', 'interaction'],
    argTypes: {
        onClick: {
            control: false,
            description: '**Required.** Callback fired when the button is clicked.',
            table: {
                type: { summary: '() => void' },
            },
            type: { name: 'function', required: true },
        },
        disabled: {
            control: 'boolean',
            description: 'When `true`, the button is disabled and cannot be clicked.',
            table: {
                type: { summary: 'boolean' },
                defaultValue: { summary: 'false' },
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof StaticPayPalButton>;

export const Default: Story = {
    args: {
        onClick: action('onClick'),
        disabled: false,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // Single control in canvas; do not use getByAltText — logo is decorative (alt="") inside the labeled button.
        const button = await canvas.findByRole('button');
        await expect(button).toBeInTheDocument();
        await expect((button.getAttribute('aria-label') ?? '').toLowerCase()).toContain('paypal');
        const logo = button.querySelector('img');
        await expect(logo).toBeTruthy();
        await expect(logo).toHaveAttribute('src');
    },
};

export const Disabled: Story = {
    args: {
        onClick: action('onClick'),
        disabled: true,
    },
    parameters: {
        docs: {
            description: {
                story: 'Disabled state — the button cannot be clicked. Use when checkout is not ready (e.g., basket still loading, required info missing).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const button = await canvas.findByRole('button', { name: /paypal/i });
        await expect(button).toBeDisabled();
    },
};
