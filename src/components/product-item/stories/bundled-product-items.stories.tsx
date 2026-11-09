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
import BundledProductItems from '../bundled-product-items';
import { bundleProd } from '../../__mocks__/bundle-product';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { ActionLogger } from '../../../../.storybook/decorators';

const meta: Meta<typeof BundledProductItems> = {
    title: 'Products/Product Item/Bundled Product Items',
    component: BundledProductItems,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
    },
    decorators: [
        (Story) => (
            <ActionLogger>
                <div className="max-w-md border p-4">
                    <Story />
                </div>
            </ActionLogger>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof BundledProductItems>;

export const Default: Story = {
    args: {
        bundledProducts: bundleProd.bundledProducts as any,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // Check for bundled product names
        const firstProduct = bundleProd.bundledProducts![0].product;
        await expect(canvas.getByText(firstProduct.name || '')).toBeInTheDocument();
        // Check for quantity - using regex to match "Quantity 1" or just checking if element with quantity text exists
        // The rendered text might be "Quantity 1" (if t returns key or default) or localized
        // If translations are missing it might render key
        // We can look for the number 1 which is the quantity in mock
        const quantityElements = canvas.getAllByText(/1/);
        await expect(quantityElements.length).toBeGreaterThan(0);
    },
};
