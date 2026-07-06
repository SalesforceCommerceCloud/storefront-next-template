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

import { expect, within, userEvent, fn } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import ProductQuantityPicker from '../index';

const meta: Meta<typeof ProductQuantityPicker> = {
    title: 'PRODUCTS/Product Quantity Picker',
    component: ProductQuantityPicker,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'A product-specific quantity picker component that wraps the base QuantityPicker with product-specific logic including stock level warnings, validation, and inventory messages.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
    argTypes: {
        value: { description: 'Current quantity value as string', control: 'text' },
        onChange: { table: { disable: true } },
        className: { description: 'Custom className for styling', control: 'text' },
        stockLevel: { description: 'Stock level for displaying stock message', control: 'number' },
        isOutOfStock: { description: 'Whether the product is out of stock', control: 'boolean' },
        productName: { description: 'Product name for inventory messages', control: 'text' },
        disabled: { description: 'Whether the picker is disabled', control: 'boolean' },
        isBundle: { description: 'Whether this is a bundle product', control: 'boolean' },
        maxQuantity: { description: 'Maximum quantity allowed (e.g. for bonus products)', control: 'number' },
    },
    args: {
        value: '1',
        productName: 'Classic T-Shirt',
        stockLevel: 50,
        isOutOfStock: false,
        disabled: false,
        isBundle: false,
        onChange: () => {},
    },
};

export default meta;
type Story = StoryObj<typeof ProductQuantityPicker>;

/**
 * Default — picker at value=1 with healthy stock (50 units).
 * Decrement is disabled because value === min (1); increment is enabled.
 *
 * Drive every other variant from the Controls panel:
 *   - `disabled: true` — both buttons disabled (replaces old `Disabled` story)
 *   - `stockLevel: 1000` / any number — visual is identical until value > stockLevel
 *   - `isBundle: true` — tested when paired with `value > stockLevel` (see LowStockWarning)
 *   - `className: 'border-2 ...'` — visual styling override (replaces old `CustomStyling` story)
 *   - `productName: '...long string...'` — verify wrapping in inventory text
 */
export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const quantityInput = canvas.getByDisplayValue('1');
        void expect(quantityInput).toBeInTheDocument();

        const incrementButton = canvas.getByRole('button', { name: /increment quantity for/i });
        const decrementButton = canvas.getByRole('button', { name: /decrement quantity for/i });
        void expect(incrementButton).not.toBeDisabled();
        // value === min (1), so decrement is disabled at rest
        void expect(decrementButton).toBeDisabled();
    },
};

/**
 * Stepper archetype — an interaction that crosses a validation threshold.
 * The wrapper owns quantity as local state (JSDoc: "No API integration —
 * simple state management"), so clicking increment is fully safe: it fires
 * `onChange(n)` and re-renders with the new value, with no network or
 * navigation. Starting at value=1 with stockLevel=2, two increments drive
 * the quantity to 3 (> stock), which reveals the "Only N left" inventory
 * alert that was absent at rest. Asserts both the callback contract and the
 * interaction-driven conditional render.
 */
export const IncrementPastStock: Story = {
    args: {
        value: '1',
        productName: 'Limited Run Tee',
        stockLevel: 2,
        onChange: fn(),
    },
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // At rest: quantity is within stock, so no inventory alert.
        await expect(canvas.getByDisplayValue('1')).toBeInTheDocument();
        await expect(canvas.queryByRole('alert')).toBeNull();

        const incrementButton = canvas.getByRole('button', { name: /increment quantity for/i });

        // First increment → 2 (equal to stock, still no warning).
        await userEvent.click(incrementButton);
        await expect(canvas.getByDisplayValue('2')).toBeInTheDocument();
        await expect(args.onChange).toHaveBeenLastCalledWith(2);
        await expect(canvas.queryByRole('alert')).toBeNull();

        // Second increment → 3 (exceeds stock) surfaces the "Only N left" alert.
        await userEvent.click(incrementButton);
        await expect(canvas.getByDisplayValue('3')).toBeInTheDocument();
        await expect(args.onChange).toHaveBeenLastCalledWith(3);
        await expect(canvas.getByRole('alert')).toBeInTheDocument();
    },
};

/**
 * Out of stock — `isOutOfStock` plus `disabled` show the localized
 * "Out of stock for {productName}" inventory message in red, with both
 * +/- buttons disabled. Distinct visible text + button state, kept dedicated.
 */
export const OutOfStock: Story = {
    args: {
        productName: 'Sold Out Product',
        stockLevel: 0,
        isOutOfStock: true,
        disabled: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const incrementButton = canvas.getByRole('button', { name: /increment quantity for/i });
        const decrementButton = canvas.getByRole('button', { name: /decrement quantity for/i });
        void expect(incrementButton).toBeDisabled();
        void expect(decrementButton).toBeDisabled();

        // Inventory alert text is the distinguishing feature of this story.
        void expect(canvas.getByRole('alert')).toBeInTheDocument();
    },
};

/**
 * Low-stock warning — `value > stockLevel` triggers the "Only N left" message.
 * None of the prior stories exercised this branch (they all had value: '1'
 * with stockLevel >= 1, so the comparison was never true). Kept as a
 * dedicated story so the snapshot captures the inventory-message layout.
 */
export const LowStockWarning: Story = {
    args: {
        value: '5',
        productName: 'Limited Edition Jacket',
        stockLevel: 3,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Inventory alert text appears because requested quantity (5) > stockLevel (3).
        void expect(canvas.getByRole('alert')).toBeInTheDocument();
    },
};
