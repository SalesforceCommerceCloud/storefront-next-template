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
import VenmoLogo from '../venmo-logo';
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

const meta: Meta<typeof VenmoLogo> = {
    title: 'Checkout/Payment/Logos/Venmo Logo',
    component: VenmoLogo,
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'centered',
        controls: { expanded: true },
        docs: {
            description: {
                component: `
### VenmoLogo Component (PLACEHOLDER)

**⚠️ IMPORTANT: This is a PLACEHOLDER logo for UI demonstration only. It is not the official Venmo brand asset.**

This component renders a generic Venmo wordmark used inside the placeholder \`ExpressPayments\` button. It exists solely to visually represent Venmo in UI mockups and wireframes.

**Current Implementation:**
- Local SVG from \`public/images/venmo.svg\`
- SVG paths use white fill — designed to be displayed inside a blue Venmo button
- Stories are rendered on Venmo's brand blue background so the logo is visible. On a light background the logo would appear invisible.

**Note:** On the storefront, this logo is rendered inside the \`StaticVenmoButton\`, which provides the official Venmo blue background (\`#008CFF\`). The logo itself relies on its parent button for the brand color — see the \`CHECKOUT/StaticVenmoButton\` stories to view the full branded button.

**Production Replacement:**
When integrating real Venmo, replace this placeholder with the **official Venmo button** rendered through the PayPal JS SDK (Venmo is a PayPal-owned funding source and ships via the PayPal Smart Payment Buttons). Venmo has strict brand guidelines that mandate using their supplied button components. See:
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
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <div style={{ backgroundColor: '#008CFF', padding: '20px', borderRadius: '8px' }}>
                <Story />
            </div>
        ),
    ],
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
type Story = StoryObj<typeof VenmoLogo>;

export const Default: Story = {
    args: {},
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const logo = canvasElement.querySelector('img[alt="Venmo"]');
        await expect(logo).toBeInTheDocument();
    },
};

export const WithCustomClassName: Story = {
    args: {
        className: 'custom-class',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const logo = canvasElement.querySelector('img[alt="Venmo"]');
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
