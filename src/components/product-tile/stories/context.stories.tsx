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
import { ProductTileProvider } from '../context';
import ProductTile from '../index';
import { mockProductSearchItem } from '../../__mocks__/product-search-hit-data';
import DynamicImageProvider from '@/providers/dynamic-image';

interface ContextStoryArgs {
    /** Synthetic Controls arg — number of tiles rendered inside the provider */
    tileCount: number;
}

function ProductTileProviderWrapper({ tileCount }: ContextStoryArgs) {
    return (
        <ProductTileProvider>
            <div className="grid grid-cols-2 gap-4 w-[32rem]">
                {Array.from({ length: tileCount }, (_, i) => `tile-${i}`).map((id) => (
                    <ProductTile key={id} product={mockProductSearchItem} />
                ))}
            </div>
        </ProductTileProvider>
    );
}

const meta: Meta<typeof ProductTileProviderWrapper> = {
    title: 'Products/Product Tile/Context',
    component: ProductTileProviderWrapper,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
**ProductTileProvider** hoists shared hooks (navigation, config, currency, swatch mode, badge logic) out of
individual tiles into a single context. This reduces hydration cost when many tiles are rendered together
(e.g. a product grid) and ensures a single \`matchMedia\` subscription drives swatch-mode across all tiles.

When \`ProductTileProvider\` is not present, \`ProductTile\` falls back to calling each hook directly — so the
provider is optional but recommended for grids of 3+ tiles.
                `,
            },
        },
    },
    argTypes: {
        tileCount: {
            description: 'Synthetic arg — number of `<ProductTile>` children rendered inside the provider',
            control: { type: 'number', min: 1, max: 12 },
        },
    },
};

export default meta;
type Story = StoryObj<typeof ProductTileProviderWrapper>;

/**
 * Rich-but-realistic baseline. The provider exposes no runtime props (it
 * forwards children verbatim), so the Controls panel exposes a single
 * synthetic `tileCount` arg that drives how many `<ProductTile>` children are
 * rendered inside it. Use the panel to compare a single-tile render against a
 * grid of 4–12 tiles.
 */
export const Playground: Story = {
    args: {
        tileCount: 4,
    },
    decorators: [
        (Story) => (
            <DynamicImageProvider value={{ widths: ['50vw', '50vw', '15vw'] }}>
                <Story />
            </DynamicImageProvider>
        ),
    ],
    render: ({ tileCount }) => (
        <ProductTileProvider>
            <div className="grid grid-cols-2 gap-4 w-[32rem]">
                {Array.from({ length: tileCount }, (_, i) => `tile-${i}`).map((id) => (
                    <ProductTile key={id} product={mockProductSearchItem} />
                ))}
            </div>
        </ProductTileProvider>
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // Each tile renders the product name; verify at least one is present
        const names = canvas.getAllByText(mockProductSearchItem.productName ?? '');
        await expect(names.length).toBeGreaterThan(0);
    },
};

export const Default: Story = {
    args: {
        tileCount: 1,
    },
    decorators: [
        (Story) => (
            <DynamicImageProvider value={{ widths: ['50vw', '50vw', '15vw'] }}>
                <div className="w-64">
                    <Story />
                </div>
            </DynamicImageProvider>
        ),
    ],
    render: () => (
        <ProductTileProvider>
            <ProductTile product={mockProductSearchItem} />
        </ProductTileProvider>
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText(mockProductSearchItem.productName ?? '')).toBeInTheDocument();
    },
};

export const MultiTileGrid: Story = {
    args: {
        tileCount: 4,
    },
    parameters: {
        docs: {
            description: {
                story: 'Multiple tiles sharing a single provider — one matchMedia subscription serves all swatch-mode consumers.',
            },
        },
    },
    decorators: [
        (Story) => (
            <DynamicImageProvider value={{ widths: ['50vw', '50vw', '15vw'] }}>
                <Story />
            </DynamicImageProvider>
        ),
    ],
    render: () => (
        <ProductTileProvider>
            <div className="grid grid-cols-2 gap-4 w-[32rem]">
                <ProductTile product={mockProductSearchItem} />
                <ProductTile product={mockProductSearchItem} />
                <ProductTile product={mockProductSearchItem} />
                <ProductTile product={mockProductSearchItem} />
            </div>
        </ProductTileProvider>
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // 4 tiles — the product name should appear 4 times
        const names = canvas.getAllByText(mockProductSearchItem.productName ?? '');
        await expect(names.length).toBe(4);
    },
};
