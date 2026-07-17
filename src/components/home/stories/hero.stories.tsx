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
import HeroSkeleton from '../hero';

const meta: Meta<typeof HeroSkeleton> = {
    title: 'Home/Hero Skeleton',
    component: HeroSkeleton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'Loading placeholder for the hero carousel — animated skeleton with background, content, and navigation-dot stand-ins. Pure presentational; the viewport toolbar covers responsive variants.',
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        await expect(canvasElement.querySelector('.animate-pulse')).toBeInTheDocument();
        await expect(canvasElement.querySelector('.bg-muted')).toBeInTheDocument();
        await expect(canvasElement.querySelector('.absolute.bottom-6')).toBeInTheDocument();
    },
};
