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
import { allModes } from '../../../../.storybook/modes';
import { useState } from 'react';
import { action } from 'storybook/actions';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import QuantityPicker from '../quantity-picker';

const meta: Meta<typeof QuantityPicker> = {
    title: 'Core/Forms/Quantity Picker',
    component: QuantityPicker,
    parameters: {
        chromatic: { modes: { desktop: allModes.desktop } },
        layout: 'centered',
        docs: {
            description: {
                component:
                    'A mobile-first quantity selector with increment/decrement buttons and direct input field. Provides keyboard navigation support, accessibility features, and auto-correction of invalid values.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
    argTypes: {
        value: { description: 'Current quantity value as string', control: 'text' },
        onChange: { table: { disable: true } },
        onBlur: { table: { disable: true } },
        min: { description: 'Minimum quantity allowed', control: 'number' },
        max: { description: 'Maximum quantity allowed (for bonus products, etc.)', control: 'number' },
        productName: { description: 'Product name for accessibility', control: 'text' },
        disabled: { description: 'Whether the picker is disabled', control: 'boolean' },
        className: { description: 'Additional class names for the container', control: 'text' },
    },
};

export default meta;
type Story = StoryObj<typeof QuantityPicker>;

// Controlled component wrapper for stories
function ControlledQuantityPicker(args: Parameters<typeof QuantityPicker>[0]) {
    const [value, setValue] = useState(args.value || '1');

    return (
        <QuantityPicker
            {...args}
            value={value}
            onChange={(stringValue, numberValue) => {
                setValue(stringValue);
                args.onChange?.(stringValue, numberValue);
            }}
        />
    );
}

/**
 * At-rest state — value=1 with default `min` and no `max`. The decrement
 * button disables at `value === 1` (independent of `min`) — a UI
 * convention enforced by `useQuantityPicker`.
 *
 * Drive every other variant from the Controls panel:
 *   - `value` — type any number; decrement re-enables once value > 1
 *   - `disabled` — see the dedicated `Disabled` story (snapshot-distinct)
 *   - `productName` — appears in `aria-label` only (no visible text), confirm with screen reader
 *   - `min` — does NOT control decrement-disabled-at-rest (hook hard-codes value === 1)
 */
export const Default: Story = {
    render: (args) => <ControlledQuantityPicker {...args} />,
    args: {
        value: '1',
        onChange: action('onChange'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const quantityInput = canvas.getByRole('spinbutton');
        await expect(quantityInput).toHaveValue(1);

        // Decrement is disabled at value=1 by hook convention.
        await expect(canvas.getByTestId('quantity-decrement')).toBeDisabled();
        await expect(canvas.getByTestId('quantity-increment')).not.toBeDisabled();
    },
};

/**
 * Fully disabled — `disabled: true` disables the input AND both +/- buttons.
 * This is the only story whose snapshot includes `disabled=""` on the input
 * element (the Default story disables only the decrement button).
 */
export const Disabled: Story = {
    render: (args) => <ControlledQuantityPicker {...args} />,
    args: {
        value: '3',
        disabled: true,
        onChange: action('onChange'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByRole('spinbutton')).toBeDisabled();
        await expect(canvas.getByTestId('quantity-increment')).toBeDisabled();
        await expect(canvas.getByTestId('quantity-decrement')).toBeDisabled();
    },
};

/**
 * Increment-disabled-at-max — `value === max` disables the increment button.
 * None of the prior stories drove the `max` prop, so this branch had zero
 * snapshot coverage. Closes the coverage gap.
 */
export const AtMaximum: Story = {
    render: (args) => <ControlledQuantityPicker {...args} />,
    args: {
        value: '5',
        max: 5,
        onChange: action('onChange'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByRole('spinbutton')).toHaveValue(5);
        await expect(canvas.getByTestId('quantity-increment')).toBeDisabled();
        await expect(canvas.getByTestId('quantity-decrement')).not.toBeDisabled();
    },
};

/**
 * Interactive — exercises increment, decrement, and direct-input behaviors
 * via the play function. At-rest visual is identical to any other value=5
 * story; the value of this story is the play interactions, not the snapshot.
 */
export const Interactive: Story = {
    render: (args) => <ControlledQuantityPicker {...args} />,
    args: {
        value: '5',
        productName: 'Test Product',
        onChange: action('onChange'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const quantityInput = canvas.getByRole('spinbutton');
        await expect(quantityInput).toHaveValue(5);

        const incrementButton = canvas.getByTestId('quantity-increment');
        const decrementButton = canvas.getByTestId('quantity-decrement');

        await userEvent.click(incrementButton);
        await expect(quantityInput).toHaveValue(6);

        await userEvent.click(decrementButton);
        await expect(quantityInput).toHaveValue(5);

        await userEvent.clear(quantityInput);
        await userEvent.type(quantityInput, '8');
        await expect(quantityInput).toHaveValue(8);
    },
};
