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
import ProductContentSkeleton from '../index';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

const meta: Meta<typeof ProductContentSkeleton> = {
    title: 'Products/Product Content Skeleton',
    component: ProductContentSkeleton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    '`ProductContentSkeleton` is the loading-state placeholder for `<ProductView>` (PDP). Renders a fixed two-column skeleton — image gallery on the left, product info on the right. Takes **no props** — there is nothing to drive from Controls.',
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof ProductContentSkeleton>;

export const Default: Story = {
    args: {},
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('product-skeleton')).toBeInTheDocument();
        await expect(canvas.getByTestId('image-gallery-skeleton')).toBeInTheDocument();
        await expect(canvas.getByTestId('product-info-skeleton')).toBeInTheDocument();
    },
};
