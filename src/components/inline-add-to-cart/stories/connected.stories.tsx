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
import { fn } from 'storybook/test';
import ConnectedInlineAddToCart from '../connected';

const meta: Meta<typeof ConnectedInlineAddToCart> = {
    title: 'Products/Inline Add To Cart/Connected',
    component: ConnectedInlineAddToCart,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: 'Basket-backed PDP cart control used after the inline controller loads.',
            },
        },
    },
    argTypes: {
        productId: { table: { disable: true } },
        storeId: { table: { disable: true } },
        stockLevel: { table: { disable: true } },
        maxQuantity: { table: { disable: true } },
        onAdd: { table: { disable: true } },
        className: { table: { disable: true } },
        disabled: {
            description: 'Disables the control when the selected product cannot be purchased.',
            control: 'boolean',
        },
        loading: {
            description: 'Disables mutations while a cart update is pending.',
            control: 'boolean',
        },
        productName: {
            description: 'Product name used in accessible control labels.',
            control: 'text',
        },
    },
    args: {
        productId: 'P0048M',
        stockLevel: 9,
        onAdd: fn(),
        disabled: false,
        loading: false,
        productName: 'Laptop Briefcase with wheels (37L)',
    },
};

export default meta;
type Story = StoryObj<typeof ConnectedInlineAddToCart>;

export const Default: Story = {};

export const Disabled: Story = {
    args: { disabled: true },
};
