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
import { Swatch } from '../swatch';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady, SITE_PREFIX } from '@storybook/test-utils';

const meta: Meta<typeof Swatch> = {
    title: 'Products/Swatches/Swatch',
    component: Swatch,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Interactive swatch component for selecting options like colors, sizes, or variants. Supports click and hover interaction modes, and can be used for navigation.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
    argTypes: {
        children: {
            description: 'Content to render inside the swatch',
            control: false,
        },
        disabled: {
            description: 'Whether the swatch is disabled',
            control: 'boolean',
        },
        href: {
            description: 'URL to navigate to when swatch is clicked',
            control: 'text',
        },
        label: {
            description: 'Accessible label for the swatch',
            control: 'text',
        },
        selected: {
            description: 'Whether the swatch is currently selected',
            control: 'boolean',
        },
        value: {
            description: 'Value associated with this swatch',
            control: 'text',
        },
        size: {
            description: 'Size of the swatch',
            control: 'select',
            options: ['sm', 'md', 'lg'],
        },
        shape: {
            description: 'Shape of the swatch',
            control: 'select',
            options: ['color', 'label'],
        },
        mode: {
            description: 'Interaction mode',
            control: 'select',
            options: ['click', 'hover'],
        },
        handleSelect: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof Swatch>;

/**
 * Rich-but-realistic baseline. The Controls panel exposes every prop the
 * `Swatch` component reads — `value`, `label`, `selected`, `disabled`, `size`,
 * `shape`, `mode`, `href`. Toggle them in the panel to drive every prop-driven
 * visual state from a single bookmarkable URL. The dedicated stories below
 * remain bookmarked entry points for the most common variants.
 */
export const Playground: Story = {
    args: {
        value: 'red',
        label: 'Red',
        selected: false,
        disabled: false,
        size: 'lg',
        shape: 'color',
        mode: 'click',
        children: <div className="w-full h-full bg-red-500 rounded-full" />,
        handleSelect: () => {},
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const swatch = canvas.getByRole('radio', { name: /red/i });
        await expect(swatch).toBeInTheDocument();
    },
};

export const Default: Story = {
    args: {
        value: 'red',
        label: 'Red',

        children: <div className="w-full h-full bg-red-500 rounded-full" />,
        handleSelect: () => {},
        mode: 'click',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const swatch = canvas.getByRole('radio', { name: /red/i });
        await expect(swatch).toBeInTheDocument();

        await userEvent.click(swatch);
    },
};

export const Selected: Story = {
    args: {
        value: 'blue',
        label: 'Blue',
        selected: true,

        children: <div className="w-full h-full bg-blue-500 rounded-full" />,
        handleSelect: () => {},
        mode: 'click',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const swatch = canvas.getByRole('radio', { name: /blue/i });
        await expect(swatch).toBeInTheDocument();
        await expect(swatch).toHaveAttribute('aria-checked', 'true');
    },
};

export const Disabled: Story = {
    args: {
        value: 'green',
        label: 'Green',
        disabled: true,

        children: <div className="w-full h-full bg-green-500 rounded-full" />,
        handleSelect: () => {},
        mode: 'click',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const swatch = canvas.getByRole('radio', { name: /green/i });
        await expect(swatch).toBeDisabled();
    },
};

export const Square: Story = {
    args: {
        value: 'large',
        label: 'Large',
        shape: 'label',
        size: 'lg',
        children: 'L',
        handleSelect: () => {},
        mode: 'click',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const swatch = canvas.getByRole('radio', { name: /large/i });
        await expect(swatch).toBeInTheDocument();
    },
};

export const WithHref: Story = {
    args: {
        value: 'product-1',
        label: 'Product Variant',
        href: '/products/1',

        children: <div className="w-full h-full bg-purple-500 rounded-full" />,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // NavLink renders as <a> tag, find it by href attribute
        const link = canvasElement.querySelector(`a[href="${SITE_PREFIX}/products/1"]`);
        await expect(link).toBeInTheDocument();
        if (link) {
            await expect(link).toHaveAttribute('href', `${SITE_PREFIX}/products/1`);
        }
    },
};

export const HoverMode: Story = {
    args: {
        value: 'yellow',
        label: 'Yellow',

        children: <div className="w-full h-full bg-yellow-500 rounded-full" />,
        handleSelect: () => {},
        mode: 'hover',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const swatch = canvas.getByRole('radio', { name: /yellow/i });
        await expect(swatch).toBeInTheDocument();

        await userEvent.hover(swatch);
    },
};
