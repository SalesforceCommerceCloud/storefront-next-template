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
import HeroCarouselSkeleton from '../skeleton';

const meta: Meta<typeof HeroCarouselSkeleton> = {
    title: 'Content/Marketing/Hero Carousel Skeleton',
    component: HeroCarouselSkeleton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'Loading-state placeholder for the hero carousel. Used by `withSuspense(HeroCarouselPlain, { fallback })` while slide data is being fetched. Pure presentational — `slideCount`, `showDots`, and `showNavigation` mirror the live component so the skeleton matches what eventually replaces it.',
            },
        },
    },
    argTypes: {
        slideCount: {
            description: 'Number of dot placeholders to render (matches the live carousel).',
            control: { type: 'number', min: 1, max: 10 },
        },
        showDots: {
            description: 'Render the dot-indicator skeleton row.',
            control: 'boolean',
        },
        showNavigation: {
            description: 'Render the prev/next button skeletons.',
            control: 'boolean',
        },
    },
    args: {
        slideCount: 3,
        showDots: true,
        showNavigation: true,
    },
};

export default meta;
type Story = StoryObj<typeof HeroCarouselSkeleton>;

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Default skeleton: 3 dots, prev/next button placeholders, full pulsing image + title + subtitle + CTA stand-ins.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // The component's signature affordance: `animate-pulse` on the root.
        await expect(canvasElement.querySelector('.animate-pulse')).toBeInTheDocument();
        // 3 dot placeholders by default.
        const dotsContainer = canvasElement.querySelector('.absolute.bottom-6');
        await expect(dotsContainer).toBeInTheDocument();
    },
};
