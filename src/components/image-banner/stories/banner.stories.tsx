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
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import ImageBanner from '@/components/image-banner/banner';

const meta = {
    title: 'Content/Marketing/Image Banner Renderer',
    component: ImageBanner,
    tags: ['autodocs', 'interaction'],
    parameters: { layout: 'fullscreen' },
    decorators: [
        (Story) => (
            <AllProvidersWrapper>
                <Story />
            </AllProvidersWrapper>
        ),
    ],
} satisfies Meta<typeof ImageBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Direct route composition uses the same renderer as the Page Designer entry point. */
export const RouteComposition: Story = {
    args: {
        imageUrl: { url: '/images/hero-01.webp' },
        imageAlt: 'Summer drinks collection',
        linkUrl: '/search',
        linkAriaLabel: 'Browse summer drinks',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(await canvas.findByRole('link', { name: 'Browse summer drinks' })).toBeVisible();
        await expect(canvas.getByRole('img', { name: 'Summer drinks collection' })).toBeInTheDocument();
    },
};
