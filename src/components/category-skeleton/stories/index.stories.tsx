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
import { ProductTileSkeleton, ProductTileSwatchesSkeleton } from '../index';
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

// ---------------------------------------------------------------------------
// This file exports two PLP loading skeletons:
//   - ProductTileSkeleton — the per-tile placeholder shown while a product
//     hits are pending. No props, single appearance.
//   - ProductTileSwatchesSkeleton — the per-tile swatch row, parameterized
//     by `count` (drives the number of swatch dots shown).
// Tile-in-grid is a distinct visual context and gets its own story.
// Viewport variants are exposed via the global Storybook viewport toolbar
// rather than via dedicated stories.
// ---------------------------------------------------------------------------

const meta: Meta<typeof ProductTileSkeleton> = {
    title: 'Category/Category Skeleton',
    component: ProductTileSkeleton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Skeleton placeholders shown while a Product Listing Page is fetching. Includes the per-tile skeleton (image, swatches, name, price) and the standalone swatch-row skeleton.',
            },
        },
    },
    decorators: [
        (Story) => (
            <div className="w-[300px]">
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof ProductTileSkeleton>;

/**
 * Default tile skeleton — image placeholder, two-swatch row, two-line name,
 * price block. No props. Use the global viewport toolbar to verify
 * mobile/tablet/desktop layouts.
 */
export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const card = canvasElement.querySelector('[data-slot="card"]');
        await expect(card).toBeInTheDocument();
        const header = canvasElement.querySelector('[data-slot="card-header"]');
        await expect(header).toBeInTheDocument();
    },
};

/**
 * Standalone swatches skeleton with a configurable count. Use the Controls
 * panel to verify `count` from 1 (single dot) up through realistic merchant
 * values (a six- or seven-color product). Subsumes the previous SwatchesOnly
 * and ManySwatches stories.
 */
export const SwatchesOnly: StoryObj<typeof ProductTileSwatchesSkeleton> = {
    render: (args) => <ProductTileSwatchesSkeleton {...args} />,
    args: {
        count: 4,
    },
    argTypes: {
        count: {
            description: 'Number of swatch dots to render',
            control: { type: 'number', min: 1, max: 8, step: 1 },
        },
    },
};

/**
 * Tile-in-grid context — four skeleton tiles arranged in a 2-up / 4-up grid.
 * Distinct from the single-tile `Default` story because it demonstrates the
 * full PLP loading state, not just one card.
 */
export const Grid: Story = {
    render: () => (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }, (_, i) => (
                <ProductTileSkeleton key={i} />
            ))}
        </div>
    ),
    decorators: [
        (Story) => (
            <div className="w-full max-w-4xl">
                <Story />
            </div>
        ),
    ],
};
