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
import CartBadge from '../cart-badge';
import BasketProvider from '@/providers/basket';
import emptyBasket from '@/components/__mocks__/empty-basket';
import emptyBasketSnapshot from '@/components/__mocks__/empty-basket-snapshot';
import { basketWithOneItem } from '@/components/__mocks__/basket-with-dress';
import basketWithOneItemSnapshot from '@/components/__mocks__/basket-with-dress-snapshot';

const meta: Meta<typeof CartBadge> = {
    title: 'Layout/Header/Cart Badge',
    component: CartBadge,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Cart icon with an item-count badge. Click opens the cart sheet (lazy-loaded). The badge is hidden when the cart is empty.',
            },
        },
    },
    decorators: [
        (Story) => (
            <div className="p-8">
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof CartBadge>;

export const Empty: Story = {
    render: () => (
        <BasketProvider basket={emptyBasket} snapshot={emptyBasketSnapshot}>
            <CartBadge />
        </BasketProvider>
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(await canvas.findByRole('button', { name: /cart/i }, { timeout: 5000 })).toBeInTheDocument();
        await expect(await canvas.findByTestId('shopping-cart-icon', {}, { timeout: 5000 })).toBeInTheDocument();
        await expect(canvas.queryByTestId('shopping-cart-badge')).not.toBeInTheDocument();
    },
};

export const WithItems: Story = {
    render: () => (
        <BasketProvider basket={basketWithOneItem} snapshot={basketWithOneItemSnapshot}>
            <CartBadge />
        </BasketProvider>
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(await canvas.findByRole('button', { name: /cart/i }, { timeout: 5000 })).toBeInTheDocument();
        const badge = await canvas.findByTestId('shopping-cart-badge', {}, { timeout: 5000 });
        await expect(badge).toBeInTheDocument();
        await expect(Number.parseInt(badge.textContent || '0', 10)).toBeGreaterThan(0);
    },
};
