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
import ApplePayLogo from '../apple-pay-logo';
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

const meta: Meta<typeof ApplePayLogo> = {
    title: 'Checkout/Payment/Logos/Apple Pay Logo',
    component: ApplePayLogo,
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'centered',
        controls: { expanded: true },
        docs: {
            description: {
                component: `
### ApplePayLogo Component (PLACEHOLDER)

**⚠️ IMPORTANT: This is a PLACEHOLDER logo for UI demonstration only. It is not the official Apple Pay brand asset.**

This component renders a generic Apple Pay logo used inside the placeholder \`ExpressPayments\` button. It exists solely to visually represent Apple Pay in UI mockups and wireframes.

**Current Implementation:**
- Local SVG from \`public/images/apple-pay-logo.svg\`
- Applies \`filter: brightness(0) invert(1)\` to render the logo in white — designed to be displayed inside a black Apple Pay button
- Because of the white filter, stories are rendered on a **dark background** so the logo is visible. On a light background the logo appears invisible.

**Production Replacement:**
When integrating real Apple Pay, replace this placeholder with the **official Apple Pay button** provided through Apple's PassKit JS / Payment Request API. Apple has strict branding rules that mandate using their supplied button components (with correct typography, spacing, color, and corner radius). See:
- [Apple Pay on the Web — Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/apple-pay)
- [Displaying Apple Pay Buttons](https://developer.apple.com/documentation/apple_pay_on_the_web/displaying_apple_pay_buttons_using_javascript)
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
            <div style={{ backgroundColor: '#000', padding: '20px', borderRadius: '8px' }}>
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
type Story = StoryObj<typeof ApplePayLogo>;

export const Default: Story = {
    args: {},
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const logo = canvasElement.querySelector('img[alt="Apple Pay"]');
        await expect(logo).toBeInTheDocument();
    },
};

export const WithCustomClassName: Story = {
    args: {
        className: 'custom-class',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const logo = canvasElement.querySelector('img[alt="Apple Pay"]');
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
