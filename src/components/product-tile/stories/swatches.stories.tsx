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
import type { DecoratedVariationAttributeValue } from '@/lib/product/product-utils';
import { action } from 'storybook/actions';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { ProductTileSwatches } from '../swatches';

const mockColorValues: DecoratedVariationAttributeValue[] = [
    {
        value: 'navy',
        name: 'Navy',
        href: '/product/test?color=navy',
        swatch: { link: 'https://example.com/navy.jpg', disBaseLink: 'https://example.com/navy.jpg' },
    },
    {
        value: 'red',
        name: 'Red',
        href: '/product/test?color=red',
        swatch: { link: 'https://example.com/red.jpg', disBaseLink: 'https://example.com/red.jpg' },
    },
    {
        value: 'blue',
        name: 'Blue',
        href: '/product/test?color=blue',
        swatch: { link: 'https://example.com/blue.jpg', disBaseLink: 'https://example.com/blue.jpg' },
    },
    {
        value: 'black',
        name: 'Black',
        href: '/product/test?color=black',
        swatch: { link: 'https://example.com/black.jpg', disBaseLink: 'https://example.com/black.jpg' },
    },
    {
        value: 'green',
        name: 'Green',
        href: '/product/test?color=green',
        swatch: { link: 'https://example.com/green.jpg', disBaseLink: 'https://example.com/green.jpg' },
    },
];

const meta: Meta<typeof ProductTileSwatches> = {
    title: 'Products/Product Tile/Swatches',
    component: ProductTileSwatches,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
    },
    decorators: [
        (Story) => (
            <div className="w-64">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        colorValues: {
            description: 'Decorated colour-attribute values rendered as `<Link>` swatches',
            control: false,
        },
        selectedAttributeValue: {
            description: 'Currently selected colour value — adds the `aria-current` ring on the matching swatch',
            control: 'text',
        },
        productName: {
            description: 'Product name interpolated into each swatch’s `aria-label`',
            control: 'text',
        },
        totalColorCount: {
            description: 'Total colour count before slicing — drives the `+N` overflow indicator',
            control: { type: 'number', min: 0, max: 99 },
        },
        maxSwatches: {
            description: 'Maximum visible swatches before the overflow indicator appears',
            control: { type: 'number', min: 0, max: 10 },
        },
        productHref: {
            description: 'Product URL used by the `+N` overflow indicator',
            control: 'text',
        },
        onSwatchHover: {
            description: 'Mouse-enter handler — fires for parent preview-image updates',
            action: 'onSwatchHover',
        },
        onSwatchClick: {
            description: 'Click handler — fires for analytics / parent callbacks',
            action: 'onSwatchClick',
        },
    },
};

export default meta;
type Story = StoryObj<typeof ProductTileSwatches>;

/**
 * Rich-but-realistic baseline. The Controls panel exposes every leaf prop —
 * `selectedAttributeValue`, `productName`, `totalColorCount`, `maxSwatches`,
 * `productHref`. `colorValues` stays as a fixture (composite array). Toggle
 * `maxSwatches` below `totalColorCount` to drive the overflow indicator from
 * the panel.
 */
export const Playground: Story = {
    args: {
        colorValues: mockColorValues,
        selectedAttributeValue: 'navy',
        onSwatchHover: action('onSwatchHover'),
        onSwatchClick: action('onSwatchClick'),
        productName: 'Test Product',
        totalColorCount: 5,
        maxSwatches: 5,
        productHref: '/product/test',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const group = canvas.getByRole('group');
        await expect(group).toBeInTheDocument();
    },
};

export const ColorSwatches: Story = {
    args: {
        colorValues: mockColorValues,
        selectedAttributeValue: 'navy',
        onSwatchHover: action('onSwatchHover'),
        onSwatchClick: action('onSwatchClick'),
        productName: 'Test Product',
        totalColorCount: 5,
        maxSwatches: 5,
        productHref: '/product/test',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const links = canvas.getAllByRole('link');
        // 5 colour swatches, no overflow indicator (maxSwatches === totalColorCount)
        await expect(links.length).toBe(5);
    },
};

export const ColorSwatchesWithOverflow: Story = {
    args: {
        colorValues: mockColorValues.slice(0, 3),
        selectedAttributeValue: 'red',
        onSwatchHover: action('onSwatchHover'),
        onSwatchClick: action('onSwatchClick'),
        productName: 'Test Product',
        totalColorCount: 5,
        maxSwatches: 3,
        productHref: '/product/test',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // 3 colour swatches + 1 overflow indicator (+2)
        const overflow = canvasElement.querySelector('[title^="+2"]');
        await expect(overflow).not.toBeNull();
    },
};

export const NoSelection: Story = {
    args: {
        colorValues: mockColorValues,
        selectedAttributeValue: null,
        onSwatchHover: action('onSwatchHover'),
        onSwatchClick: action('onSwatchClick'),
        productName: 'Test Product',
        totalColorCount: 5,
        maxSwatches: 5,
        productHref: '/product/test',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // No swatch should have aria-current="true"
        const selected = canvasElement.querySelector('a[aria-current="true"]');
        await expect(selected).toBeNull();
    },
};

export const NoSwatches: Story = {
    args: {
        colorValues: [],
        selectedAttributeValue: null,
        onSwatchHover: action('onSwatchHover'),
        onSwatchClick: action('onSwatchClick'),
        productName: 'Test Product',
        totalColorCount: 0,
        maxSwatches: 5,
        productHref: '/product/test',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const group = canvas.getByRole('group');
        // Container still renders, but no swatch links inside
        await expect(group.querySelectorAll('a').length).toBe(0);
    },
};
