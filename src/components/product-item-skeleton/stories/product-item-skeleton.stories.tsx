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
import { ProductItemSkeleton } from '../index';
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

const meta: Meta<typeof ProductItemSkeleton> = {
    title: 'Products/Product Item Skeleton',
    component: ProductItemSkeleton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    '`ProductItemSkeleton` is the loading-state placeholder for `ProductItem` (cart, mini-cart, order summary). Renders a fixed `<Skeleton>` layout — no toggle-able pieces, no domain props. The only prop is `className` for layout overrides.',
            },
        },
    },
    decorators: [
        (Story) => (
            <div className="w-full max-w-md p-4">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        className: {
            description: 'Optional CSS classes merged onto the skeleton root',
            control: 'text',
        },
    },
};

export default meta;
type Story = StoryObj<typeof ProductItemSkeleton>;

export const Default: Story = {
    args: {},
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // Skeleton renders multiple animated placeholders (image, name, attrs, price, qty).
        // Assert the pulse class is present to prove the skeleton shape rendered, not just any DOM.
        const pulses = canvasElement.querySelectorAll('.animate-pulse');
        await expect(pulses.length).toBeGreaterThan(0);
    },
};
