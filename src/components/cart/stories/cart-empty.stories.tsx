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

import EmptyCart from '../cart-empty';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const meta: Meta<typeof EmptyCart> = {
    title: 'Cart/Empty Cart',
    component: EmptyCart,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
The EmptyCart component displays when the shopping cart has no items. It provides a clean, centered empty state with a shopping bag icon, messaging, and a single "Start Shopping" call-to-action.

## Features

- **Shopping Bag Icon**: Inline SVG (w-24 h-24) with light muted stroke (strokeWidth 1.5)
- **Empty State Messaging**: "Your cart is empty" heading with subtitle
- **Single CTA**: "Start Shopping" button linking back to the homepage
- **Responsive Padding**: p-8 on mobile, md:p-16 on larger screens
- **Accessibility**: aria-hidden icon, semantic heading, proper link markup

## Layout

- **Outer Container**: Full-width muted background with section-container max width
- **Card**: \`bg-background rounded-none\` with generous responsive padding
- **Icon**: 96×96px inline SVG shopping bag with \`text-muted-foreground/30\`
- **Typography**: h2 heading (text-2xl font-semibold) with mb-2, subtitle (text-sm) with mb-8
- **Button**: Centered "Start Shopping" button (not full-width)
                `,
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Default empty cart state — shopping-bag icon, heading, message, and a single "Start Shopping" CTA.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const { t } = getTranslation();
        await waitForStorybookReady(canvasElement);

        // Container.
        const root = canvasElement.querySelector('[data-testid="sf-cart-empty"]');
        await expect(root).toBeInTheDocument();

        // Empty-state heading and "Start Shopping" CTA.
        const heading = await canvas.findByRole('heading', { level: 2, name: t('cart:empty.title') });
        await expect(heading).toBeInTheDocument();

        const cta = await canvas.findByText(t('cart:empty.continueShopping'));
        await expect(cta).toBeInTheDocument();
    },
};
