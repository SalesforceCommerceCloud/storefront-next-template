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
import StaticVenmoButton from '../static-venmo-button';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';

import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

const meta: Meta<typeof StaticVenmoButton> = {
    title: 'Checkout/Payment/Static Venmo Button',
    component: StaticVenmoButton,
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'centered',
        controls: { expanded: true },
        docs: {
            description: {
                component: `
### StaticVenmoButton Component (PLACEHOLDER)

**⚠️ IMPORTANT: This is a PLACEHOLDER button for UI demonstration only. It does not launch the real Venmo checkout flow.**

This component renders a static Venmo-branded button styled to match the official Venmo SDK button appearance. It wraps the \`VenmoLogo\` in a button with the official Venmo blue background (\`#3D95CE\`) and is used inside the placeholder \`ExpressPayments\` component.

**Current Implementation:**
- Uses the Venmo blue color (\`#3D95CE\` via the \`--venmo-blue\` CSS variable)
- Renders the decorative \`VenmoLogo\` inside a labeled \`<button>\` (\`aria-label="Venmo"\`)
- Calls the provided \`onClick\` handler when clicked — no Venmo SDK, no eligibility checks, no payment session
- Visual styling only; no real Venmo checkout integration

**Production Replacement:**
When integrating real Venmo, replace this placeholder with the **official Venmo button** rendered through the PayPal JS SDK (Venmo is a PayPal-owned funding source and ships via the PayPal Smart Payment Buttons). The SDK handles button rendering, device/region eligibility, and the full checkout flow. Note that Venmo is only available to US shoppers on supported devices. See:
- [Venmo Integration via PayPal SDK](https://developer.paypal.com/docs/checkout/pay-with-venmo/)
- [Venmo Brand Guidelines](https://venmo.com/legal/us-brand-guidelines/)
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
type Story = StoryObj<typeof StaticVenmoButton>;

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
        await expect((button.getAttribute('aria-label') ?? '').toLowerCase()).toContain('venmo');
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
        const button = await canvas.findByRole('button', { name: /venmo/i });
        await expect(button).toBeDisabled();
    },
};
