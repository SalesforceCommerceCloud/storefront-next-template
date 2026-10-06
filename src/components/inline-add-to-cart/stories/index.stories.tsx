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
import { expect, fn, userEvent, within } from 'storybook/test';
import { allModes } from '../../../../.storybook/modes';
import InlineAddToCart from '../index';

const meta: Meta<typeof InlineAddToCart> = {
    title: 'Products/Inline Add To Cart',
    component: InlineAddToCart,
    parameters: {
        chromatic: { modes: { desktop: allModes.desktop } },
        layout: 'centered',
        docs: {
            description: {
                component:
                    'The PDP cart control starts as an Add to Cart button and becomes a basket-backed quantity stepper after the first add.',
            },
        },
    },
    argTypes: {
        quantityInCart: {
            description: 'Units of this SKU currently in the basket. Zero renders the Add to Cart button.',
            control: { type: 'number', min: 0, max: 20 },
        },
        disabled: {
            description: 'Disables the control when the selected product cannot be purchased.',
            control: 'boolean',
        },
        incrementDisabled: {
            description: 'Disables increment when the selected SKU has reached its stock limit.',
            control: 'boolean',
        },
        loading: {
            description: 'Disables mutations while the basket action is pending.',
            control: 'boolean',
        },
        productName: {
            description: 'Product name used in the accessible labels for the stepper controls.',
            control: 'text',
        },
        stockMessage: {
            description: 'Visible stock-limit message announced to assistive technologies.',
            control: 'text',
        },
        className: { table: { disable: true } },
        onAdd: { table: { disable: true } },
        onIncrement: { table: { disable: true } },
        onDecrement: { table: { disable: true } },
    },
    args: {
        quantityInCart: 0,
        onAdd: fn(),
        onIncrement: fn(),
        onDecrement: fn(),
        productName: 'Harbor Crossbody Bag',
        disabled: false,
        incrementDisabled: false,
        loading: false,
        stockMessage: null,
    },
};

export default meta;
type Story = StoryObj<typeof InlineAddToCart>;

export const Default: Story = {};

export const InCart: Story = {
    args: { quantityInCart: 2 },
};

export const AtStockLimit: Story = {
    args: {
        quantityInCart: 2,
        incrementDisabled: true,
        stockMessage: 'Maximum stock reached',
    },
};

export const KeyboardControls: Story = {
    args: { quantityInCart: 2 },
    play: async ({ canvasElement, args }) => {
        const canvas = within(canvasElement);
        const increment = canvas.getByRole('button', { name: /increment quantity/i });
        const decrement = canvas.getByRole('button', { name: /decrement quantity/i });

        await userEvent.tab();
        await userEvent.keyboard('{Enter}');
        await expect(args.onDecrement).toHaveBeenCalledOnce();

        await userEvent.tab();
        await userEvent.keyboard('{Enter}');
        await expect(increment).toHaveFocus();
        await expect(args.onIncrement).toHaveBeenCalledOnce();
        await expect(decrement).not.toBeDisabled();
    },
};

export const Disabled: Story = {
    args: { disabled: true },
};
