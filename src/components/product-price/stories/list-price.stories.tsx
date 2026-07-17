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
import ListPrice from '../list-price';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

const meta: Meta<typeof ListPrice> = {
    title: 'Products/Product Price/List Price',
    component: ListPrice,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
    },
    argTypes: {
        price: { description: 'List price (struck-through value)', control: 'number' },
        currency: {
            description: 'Currency code (USD, EUR, GBP, etc.)',
            control: 'select',
            options: ['USD', 'EUR', 'GBP'],
        },
        as: {
            description: 'HTML element/tag to render as',
            control: 'select',
            options: ['span', 'div', 'p', 'h5'],
        },
        isRange: {
            description: 'Toggle "List price from {price}" aria-label (visible text unchanged)',
            control: 'boolean',
        },
        labelForA11y: { description: 'sr-only label prefix for screen readers', control: 'text' },
        className: { description: 'Additional CSS classes (merged with line-through)', control: 'text' },
    },
};

export default meta;
type Story = StoryObj<typeof ListPrice>;

/**
 * At-rest state — list price `$129.99` rendered with `line-through`
 * styling. The visual is identical regardless of `isRange`; only the
 * `aria-label` switches between "List price: …" and "List price from …".
 *
 * Drive every other variant from the Controls panel:
 *   - `price` / `currency` — value updates visible text + aria-label
 *   - `isRange: true` — aria-label changes to "List price from {price}";
 *     visible text unchanged (snapshot is identical to Default)
 *   - `as: 'p'` / `'h5'` — swaps wrapping element
 *   - `className` — additional classes merged with default line-through styling
 *   - `labelForA11y` — appears only in sr-only span
 */
export const Default: Story = {
    args: {
        price: 129.99,
        currency: 'USD',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const price = canvas.getByText('$129.99');
        await expect(price).toBeInTheDocument();
        await expect(price).toHaveClass('line-through');
    },
};
