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
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import CategoryBannerSkeleton from '../skeleton';

const meta: Meta<typeof CategoryBannerSkeleton> = {
    title: 'Category/Category Banner Skeleton',
    component: CategoryBannerSkeleton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
Loading placeholder for the Category Banner. Shown via the Page Designer \`Region\`
\`fallbackElement\` prop while Page Designer data and route loader data are pending.

Mirrors the banner's responsive heights (250px/300px/350px) and the
bottom-anchored text layout with three skeleton blocks for the root label, category name,
and product count.
                `,
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof CategoryBannerSkeleton>;

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Skeleton loading state shown while category banner data is being fetched.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        const skeleton = canvasElement.querySelector('.animate-pulse');
        expect(skeleton).toBeInTheDocument();

        const skeletonBlocks = canvasElement.querySelectorAll('[data-slot="skeleton"]');
        expect(skeletonBlocks.length).toBeGreaterThanOrEqual(3);
    },
};
