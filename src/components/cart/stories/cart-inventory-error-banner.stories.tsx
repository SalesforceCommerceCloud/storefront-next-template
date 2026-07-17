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

import { CartInventoryErrorBanner } from '../cart-inventory-error-banner';
import type { CartInventoryIssue } from '@/lib/cart/inventory-validation';

const meta: Meta<typeof CartInventoryErrorBanner> = {
    title: 'Cart/Cart Inventory Error Banner',
    component: CartInventoryErrorBanner,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Displays a global error banner when cart items exceed available inventory. Shows a fixed friendly message (\`inventory.blockMessage\`) prompting users to adjust quantities or remove items before continuing to checkout.

The component renders **the same banner text regardless of how many issues are passed in or whether they are delivery vs. pickup** — the message doesn't enumerate per-product details. The only real branch is \`issues.length === 0\` → \`null\`, which is the implicit "no banner" case covered transitively by every cart story that doesn't trip inventory validation. So a single \`Default\` story covers the rendered shape; the controls panel exposes \`issues\`, \`className\`, and \`id\` for one-off adjustments.

## Features

- **Friendly Error Message**: Single-line message explaining the inventory issue
- **Destructive Variant**: Uses Alert destructive variant with AlertCircle icon
- **Accessibility**: Includes \`role="alert"\` and \`aria-live="polite"\` for screen readers
- **Conditional Rendering**: Returns \`null\` when no inventory issues exist (verified by unit tests)

## Usage

Typically displayed above the checkout button when cart-wide inventory validation fails. The banner is linked to the disabled checkout button via \`aria-describedby\`.
                `,
            },
        },
    },
    argTypes: {
        issues: {
            control: 'object',
            description: 'Array of cart items exceeding inventory',
            table: { type: { summary: 'CartInventoryIssue[]' } },
        },
        className: {
            description: 'Optional CSS classes',
            table: { disable: true, type: { summary: 'string' } },
        },
        id: {
            description:
                'ID for ARIA linking (use distinct IDs when rendering multiple banners, e.g. mobile vs desktop)',
            table: {
                disable: true,
                type: { summary: 'string' },
                defaultValue: { summary: 'cart-inventory-error' },
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof CartInventoryErrorBanner>;

const sampleIssues: CartInventoryIssue[] = [
    {
        itemId: 'item-1',
        productId: 'prod-1',
        productName: 'Striped Silk Tie',
        requestedQuantity: 10,
        availableStock: 3,
        isPickup: false,
    },
];

export const Default: Story = {
    args: {
        issues: sampleIssues,
    },
    parameters: {
        docs: {
            description: {
                story: 'Banner rendered with one inventory issue. Adjust the `issues` / `className` / `id` controls to exercise multi-issue, pickup, or styled variants — the rendered DOM is identical for any non-empty `issues` array.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const alert = canvasElement.querySelector('[role="alert"]');
        await expect(alert).toBeInTheDocument();
        await expect(alert).toHaveAttribute('aria-live', 'polite');
        const message = canvasElement.textContent;
        await expect(message).toContain('Some items exceed available stock');
    },
};
