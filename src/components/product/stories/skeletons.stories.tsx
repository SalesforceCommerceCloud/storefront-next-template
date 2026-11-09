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
import { ProductMainSkeleton, ProductRecommendationSkeleton, ProductRecommendationsSkeleton } from '../skeletons';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { ActionLogger } from '../../../../.storybook/decorators';
// Combine skeletons into one meta since they are related
const meta: Meta<typeof ProductMainSkeleton> = {
    title: 'Products/Skeletons',
    component: ProductMainSkeleton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
    },
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <ActionLogger>
                    <div className="p-4">
                        <Story />
                    </div>
                </ActionLogger>
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof ProductMainSkeleton>;

export const MainSkeleton: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // Check structure
        const container = canvasElement.querySelector('.animate-pulse');
        await expect(container).toBeInTheDocument();
    },
};

export const RecommendationSkeleton: StoryObj<typeof ProductRecommendationSkeleton> = {
    render: (args) => <ProductRecommendationSkeleton {...args} />,
    args: {
        title: 'You May Also Like',
        itemCount: 4,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const container = canvasElement.querySelector('.animate-pulse');
        await expect(container).toBeInTheDocument();
    },
};

export const RecommendationsSkeleton: StoryObj<typeof ProductRecommendationsSkeleton> = {
    render: (args) => <ProductRecommendationsSkeleton {...args} />,
    args: {
        count: 2,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const container = canvasElement.querySelector('.animate-pulse');
        await expect(container).toBeInTheDocument();
    },
};
