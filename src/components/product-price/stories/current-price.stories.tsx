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
import CurrentPrice from '../current-price';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

const meta: Meta<typeof CurrentPrice> = {
    title: 'Products/Product Price/Current Price',
    component: CurrentPrice,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
    },
    argTypes: {
        price: { description: 'Current price value', control: 'number' },
        currency: {
            description: 'Currency code (USD, EUR, GBP, etc.)',
            control: 'select',
            options: ['USD', 'EUR', 'GBP'],
        },
        as: {
            description: 'HTML element/tag to render as',
            control: 'select',
            options: ['span', 'div', 'p', 'h3', 'h5'],
        },
        isRange: {
            description: 'Display as price range (changes aria-label only when maxPrice is unset)',
            control: 'boolean',
        },
        maxPrice: { description: 'Maximum price (with isRange=true, renders "min – max")', control: 'number' },
        labelForA11y: { description: 'sr-only label prefix for screen readers', control: 'text' },
        className: { description: 'Additional CSS classes', control: 'text' },
    },
};

export default meta;
type Story = StoryObj<typeof CurrentPrice>;

/**
 * At-rest state — single price `$99.99` rendered as a `<span>`.
 *
 * Drive every other variant from the Controls panel:
 *   - `price` / `currency` — value updates the visible text and aria-label
 *   - `isRange` (alone) — only changes aria-label; visible text stays single-price
 *     because no `maxPrice` is provided
 *   - `isRange: true` + `maxPrice: 150` — switches visible text to "min – max" range
 *   - `as: 'h3'` / `'h5'` / etc. — swaps the wrapping element (see CustomElement story
 *     for an example with `as: 'h3'` plus className)
 *   - `labelForA11y` — appears only in the sr-only span (verify with screen reader)
 */
export const Default: Story = {
    args: {
        price: 99.99,
        currency: 'USD',
        as: 'span',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('$99.99')).toBeInTheDocument();
    },
};

/**
 * Custom HTML element — `as: 'h3'` plus `className` overrides the default
 * `<span>` wrapper. Distinct visual: heading-level styling and color override.
 * Kept dedicated because tag-swap + className combination changes layout.
 */
export const CustomElement: Story = {
    args: {
        price: 1234.56,
        currency: 'EUR',
        as: 'h3',
        className: 'text-2xl text-blue-600',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const priceElement = canvas.getByRole('heading', { level: 3 });
        await expect(priceElement).toBeInTheDocument();
        await expect(priceElement).toHaveClass('text-2xl');
    },
};
