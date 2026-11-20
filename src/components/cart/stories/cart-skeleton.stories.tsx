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
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

import CartSkeleton from '../cart-skeleton';

const meta: Meta<typeof CartSkeleton> = {
    title: 'Cart/Cart Skeleton',
    component: CartSkeleton,
    tags: ['autodocs', 'interaction'],
    args: {
        productItemCount: 1,
    },
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
Skeleton loading state for the CartContent component. Mirrors the cart page layout — including the
mobile fixed-bottom checkout bar and the desktop OrderSummary card — so the skeleton occupies the
same space as the resolved page on every breakpoint.

\`productItemCount\` sets how many line-item rows render. An empty cart has no skeleton: the cart route
renders the real empty state while the basket loads.

## Layout

- **Mobile (< md)**: Page heading, item card with each line's image + details + price + qty + gift
  row, and a fixed-bottom bar that mirrors the real Order Summary accordion + checkout button.
- **md+**: Same item card on the right (lg ordering), with the desktop OrderSummary card on the
  left at lg breakpoint. The desktop card mirrors the real OrderSummary layout: heading, totals,
  promo code accordion trigger, checkout button and four payment-method icons.
                `,
            },
        },
    },
    argTypes: {
        productItemCount: {
            control: 'number',
            description: 'Number of item skeletons to render (at least 1).',
            table: {
                type: { summary: 'number' },
                defaultValue: { summary: '1' },
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof CartSkeleton>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const container = canvasElement.querySelector('[data-testid="sf-cart-skeleton"]');
        await expect(container).toBeInTheDocument();
    },
};
