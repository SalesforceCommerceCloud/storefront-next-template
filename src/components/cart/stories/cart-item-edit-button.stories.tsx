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
import { CartItemEditButton } from '../cart-item-edit-button';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { inBasketProductDetails } from '@/components/__mocks__/basket-with-dress';

const meta: Meta<typeof CartItemEditButton> = {
    title: 'Cart/Items/Cart Item Edit Button',
    component: CartItemEditButton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
A lightweight text button that opens a modal for editing cart items (size, color, quantity, etc.). Renders as a plain \`<button>\` styled with the \`primary\` design token to match the blue action-link pattern used across the cart.

## Features

- **Primary blue styling**: Uses \`text-primary\` with \`hover:text-primary/80\` for a consistent blue action-link appearance
- **Modal integration**: Opens \`CartItemEditModal\` on click, passing product data, current quantity, and item ID
- **Accessible**: Provides a dynamic \`aria-label\` combining the action text and the product name (e.g. "Edit Solid Cylinder")
- **Customisable**: Accepts an optional \`className\` prop to override or extend styles
- **Responsive text**: \`text-xs\` on mobile, \`text-sm\` on \`md\`+ breakpoints

## Usage

\`\`\`tsx
import { CartItemEditButton } from '@/components/cart/cart-item-edit-button';

// Inside a cart item row, alongside Remove and Add to Wishlist
<div className="flex gap-3 items-center">
  <CartItemEditButton product={item} />
  <button className="text-xs md:text-sm text-primary ...">Remove</button>
  <button className="text-xs md:text-sm text-primary ...">Add to Wishlist</button>
</div>
\`\`\`

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| \`product\` | \`ProductItem & Partial<Product>\` | — | Cart line item with optional product details (name, variants) |
| \`className\` | \`string\` | \`''\` | Additional CSS classes appended to the button |

## Stories

| Story | Description |
|-------|-------------|
| **Default** | Standalone button — only the production-driven default render |
                `,
            },
        },
    },
    argTypes: {
        product: {
            description: 'The cart item product to edit',
            table: {
                disable: true,
                type: {
                    summary: "ShopperBasketsV2.schemas['ProductItem'] & Partial<ShopperProducts.schemas['Product']>",
                },
            },
        },
        className: {
            description: 'Optional additional CSS classes',
            table: {
                disable: true,
                type: { summary: 'string' },
                defaultValue: { summary: "''" },
            },
        },
    },
    args: {
        product: inBasketProductDetails as ShopperBasketsV2.schemas['ProductItem'] &
            Partial<ShopperProducts.schemas['Product']>,
        className: '',
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Default cart-item edit button. Only the production-driven render is exercised; tweaking `className` from the controls panel was disabled because there is no review-time signal on a styling-only override (Pattern 20 / 6.1).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        await waitForStorybookReady(canvasElement);

        const editButton = await canvas.findByRole('button', { name: /edit/i });
        await expect(editButton).toBeInTheDocument();
        await expect(editButton).not.toBeDisabled();
    },
};
