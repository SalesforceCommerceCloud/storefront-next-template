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
import CartQuantityPicker from '../cart-quantity-picker';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

const meta: Meta<typeof CartQuantityPicker> = {
    title: 'Cart/Items/Cart Quantity Picker',
    component: CartQuantityPicker,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
A cart-specific quantity picker that wraps the base \`QuantityPicker\` with API integration, debounced updates, stock validation, and remove-item confirmation.

## Design

Renders a **"Quantity"** label (no colon) above the stepper, left-aligned with the control. The stepper uses a single \`border border-input rounded-none\` wrapper with flush −/+ buttons and a borderless numeric input — matching the cart line layout.

## Features

- **Single-border stepper**: Clean picker with \`−\` and \`+\` buttons inside one rounded border
- **Debounced API calls**: Configurable delay (default from \`config.pages.cart.quantityUpdateDebounce\`) prevents request spam
- **Stock validation**: Warns when quantity exceeds available stock with a destructive-coloured message
- **Remove confirmation**: Shows a \`ConfirmationDialog\` when quantity is set to 0
- **Optimistic updates**: UI updates immediately; rolls back on API failure
- **Loading state**: Disables the picker while the fetcher is submitting

## Usage

\`\`\`tsx
import CartQuantityPicker from '@/components/cart/cart-quantity-picker';

<CartQuantityPicker value={item.quantity.toString()} itemId={item.itemId} stockLevel={item.stockLevel} />
\`\`\`

## Stories

| Story | Description |
|-------|-------------|
| **Default** | Standard picker; \`value\` / \`stockLevel\` / \`disabled\` / \`debounceDelay\` are exposed as controls |
| **AtStockLimit** | Boundary case — increment disabled, "Maximum stock reached" alert visible |
                `,
            },
        },
    },
    argTypes: {
        value: {
            control: 'text',
            description: 'Current quantity value as string',
            table: { type: { summary: 'string' } },
        },
        itemId: {
            control: 'text',
            description: 'Cart item ID for API calls',
            table: { type: { summary: 'string' } },
        },
        className: {
            description: 'Custom className for styling',
            table: {
                disable: true,
                type: { summary: 'string' },
                defaultValue: { summary: 'undefined' },
            },
        },
        debounceDelay: {
            control: 'number',
            description: 'Debounce delay in milliseconds',
            table: {
                type: { summary: 'number' },
                defaultValue: { summary: 'From config' },
            },
        },
        stockLevel: {
            control: 'number',
            description: 'Stock level for validation',
            table: {
                type: { summary: 'number' },
                defaultValue: { summary: 'undefined' },
            },
        },
        disabled: {
            control: 'boolean',
            description: 'Disable quantity picker',
            table: {
                type: { summary: 'boolean' },
                defaultValue: { summary: 'false' },
            },
        },
    },
    args: {
        value: '1',
        itemId: 'item-123',
        className: undefined,
        stockLevel: undefined,
        disabled: false,
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        value: '1',
        itemId: 'item-123',
    },
    parameters: {
        docs: {
            description: {
                story: 'Default quantity picker. Use the controls panel to drive `value`, `stockLevel`, `disabled`, and `debounceDelay` — separate stories per prop value were collapsed into controls (Pattern 10).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const quantityInput = canvasElement.querySelector('input[type="number"]') as HTMLInputElement;
        await expect(quantityInput).toBeInTheDocument();
        await expect(quantityInput).toHaveValue(1);

        const incrementButton = await canvas.findByRole('button', { name: /increment/i }, { timeout: 5000 });
        await expect(incrementButton).toBeInTheDocument();

        const decrementButton = await canvas.findByRole('button', { name: /decrement/i }, { timeout: 5000 });
        await expect(decrementButton).toBeInTheDocument();
    },
};

export const AtStockLimit: Story = {
    args: {
        value: '10',
        itemId: 'item-123',
        stockLevel: 10,
    },
    parameters: {
        docs: {
            description: {
                story: 'Boundary case: quantity equals available stock. Increment is disabled and a "Maximum stock reached" alert is announced.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const quantityInput = canvasElement.querySelector('input[type="number"]') as HTMLInputElement;
        await expect(quantityInput).toBeInTheDocument();
        await expect(quantityInput).toHaveValue(10);

        const incrementButton = await canvas.findByRole('button', { name: /increment/i }, { timeout: 5000 });
        await expect(incrementButton).toBeDisabled();

        const stockMessage = await canvas.findByRole('alert');
        await expect(stockMessage).toBeInTheDocument();
        await expect(stockMessage).toHaveTextContent('Maximum stock reached');
    },
};
