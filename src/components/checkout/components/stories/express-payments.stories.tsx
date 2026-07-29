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
import ExpressPayments from '../express-payments';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';
import { useEffect, useRef, type ReactNode, type ReactElement } from 'react';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logClick = action('express-payment-click');

        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;
            const button = target.closest('button');
            if (button && root.contains(button)) {
                logClick({ text: button.textContent || button.getAttribute('aria-label') || 'Payment Button' });
            }
        };

        root.addEventListener('click', handleClick);
        return () => {
            root.removeEventListener('click', handleClick);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const meta: Meta<typeof ExpressPayments> = {
    title: 'Checkout/Express Payments',
    component: ExpressPayments,
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'padded',
        controls: { expanded: true },
        docs: {
            description: {
                component: `
### ExpressPayments Component (PLACEHOLDER)

**⚠️ IMPORTANT: This is a PLACEHOLDER component for UI demonstration only. It does not process real payments.**

This component provides visual representations of express payment buttons (Apple Pay, Google Pay, Amazon Pay, PayPal, and Venmo) with configurable layout and separator. All buttons trigger alert messages instead of actual payment processing.

**Current Implementation:**
- Static payment buttons that trigger JavaScript alerts
- No integration with real payment providers
- No PayPal SDK or payment provider SDKs loaded
- All buttons are always visible — in a real implementation, visibility would depend on device capabilities, geographic eligibility, and browser support
- Suitable for UI mockups, design reviews, and wireframes only

**Production Replacement:**
Replace this component with actual payment provider integrations (Stripe, Adyen, PayPal SDK, etc.) before deploying to production. See the component file (\`express-payments.tsx\`) for detailed removal instructions, including translation keys to prune and parent components to update.

**Where Used:**
- Checkout page: \`src/components/checkout/checkout-form-page.tsx\`
- Product page: \`src/components/product-cart-actions/index.tsx\`
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
    decorators: [
        (Story) => (
            <ActionLogger>
                <Story />
            </ActionLogger>
        ),
    ],
    argTypes: {
        disabled: {
            description: 'When `true`, all payment buttons are disabled and cannot be clicked.',
            control: 'boolean',
            table: {
                type: { summary: 'boolean' },
                defaultValue: { summary: 'false' },
            },
        },
        layout: {
            description:
                'Layout orientation for the payment buttons. `horizontal` = responsive grid (1 col mobile → 3 cols tablet → 5 cols desktop). `vertical` = single stacked column.',
            control: 'radio',
            options: ['horizontal', 'vertical'],
            table: {
                type: { summary: "'horizontal' | 'vertical'" },
                defaultValue: { summary: 'horizontal' },
            },
        },
        separatorPosition: {
            description: 'Position of the separator divider relative to the payment buttons.',
            control: 'radio',
            options: ['top', 'bottom'],
            table: {
                type: { summary: "'top' | 'bottom'" },
                defaultValue: { summary: 'bottom' },
            },
        },
        separatorText: {
            description: 'Custom text rendered inside the separator divider.',
            control: 'text',
            table: {
                type: { summary: 'string' },
                defaultValue: { summary: "'or continue below'" },
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof ExpressPayments>;

export const Default: Story = {
    args: {
        disabled: false,
    },
    parameters: {
        docs: {
            description: {
                story: `Default rendering: all 5 express payment buttons (Apple Pay, Google Pay, Amazon Pay, PayPal, Venmo) in a horizontal responsive grid with the separator below.

**Note:** All buttons are always visible in this placeholder. In a real integration with payment SDKs, visibility would depend on device capabilities (e.g. Apple Pay on supported devices), geographic eligibility (e.g. Venmo US-only), payment provider availability, and browser support.`,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(await canvas.findByRole('button', { name: /apple pay/i })).toBeInTheDocument();

        // All 5 payment buttons should be present in the placeholder
        const buttons = canvas.getAllByRole('button');
        await expect(buttons.length).toBeGreaterThanOrEqual(5);

        // Check for "Or" divider
        const orDivider = await canvas.findByText(/or/i);
        await expect(orDivider).toBeInTheDocument();
    },
};

export const Disabled: Story = {
    args: {
        disabled: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const buttons = canvas.getAllByRole('button');
        // All buttons should be disabled
        buttons.forEach((button) => {
            void expect(button).toBeDisabled();
        });
    },
};

export const VerticalLayout: Story = {
    args: {
        disabled: false,
        layout: 'vertical',
    },
    parameters: {
        docs: {
            description: {
                story: 'Express payment buttons stacked vertically in a single column, useful for sidebars or narrow containers. Used on product detail pages.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(await canvas.findByRole('button', { name: /apple pay/i })).toBeInTheDocument();

        // Check for "Or" divider
        const orDivider = await canvas.findByText(/or/i);
        await expect(orDivider).toBeInTheDocument();
    },
};

export const SeparatorAtTop: Story = {
    args: {
        disabled: false,
        separatorPosition: 'top',
    },
    parameters: {
        docs: {
            description: {
                story: 'Separator displayed above the payment buttons. Useful when express payments are at the bottom of a form.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Check for "Or" divider
        const orDivider = await canvas.findByText(/or/i);
        await expect(orDivider).toBeInTheDocument();
    },
};

export const CustomSeparatorText: Story = {
    args: {
        disabled: false,
        separatorText: 'Or continue with card',
    },
    parameters: {
        docs: {
            description: {
                story: 'Custom separator text to provide context (automatically displayed in uppercase via CSS). Common variations: "Or continue with card", "Or pay another way", "Express checkout".',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Check for custom divider text (displayed uppercase via CSS)
        const customDivider = await canvas.findByText('Or continue with card');
        await expect(customDivider).toBeInTheDocument();
    },
};

export const VerticalWithTopSeparator: Story = {
    args: {
        disabled: false,
        layout: 'vertical',
        separatorPosition: 'top',
        separatorText: 'Express checkout',
    },
    parameters: {
        docs: {
            description: {
                story: 'Vertical layout with separator at top and custom text (automatically displayed in uppercase via CSS). Ideal for product detail pages or narrow sidebars.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Check for custom divider text (displayed uppercase via CSS)
        const customDivider = await canvas.findByText('Express checkout');
        await expect(customDivider).toBeInTheDocument();

        await expect(await canvas.findByRole('button', { name: /apple pay/i })).toBeInTheDocument();
    },
};
