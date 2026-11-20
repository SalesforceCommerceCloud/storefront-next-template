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
import { expect, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import ContentCarousel from '../index';

const meta = {
    title: 'Content/Marketing/Content Carousel',
    component: ContentCarousel,
    tags: ['autodocs', 'interaction', 'content-carousel'],
    parameters: { layout: 'fullscreen' },
    decorators: [
        (Story) => (
            <AllProvidersWrapper>
                <Story />
            </AllProvidersWrapper>
        ),
    ],
    args: {
        title: 'Discover more',
        itemsOnMobile: 1.25,
        itemsOnTablet: 2.25,
        itemsOnDesktop: 4.25,
        items: Array.from({ length: 6 }, (_, index) => ({
            id: `campaign-${index}`,
            title: `Campaign ${index + 1}`,
            description: 'Explore seasonal collections and everyday favourites.',
            imageUrl: '/images/hero-01.webp',
            imageAlt: `Campaign ${index + 1} artwork`,
            buttonText: 'Explore',
            buttonLink: `/search?q=campaign-${index + 1}`,
            buttonAriaLabel: `Explore campaign ${index + 1}`,
            imageAspectRatio: '3:4' as const,
            className: 'gap-0 py-0',
        })),
    },
} satisfies Meta<typeof ContentCarousel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('heading', { name: 'Discover more' })).toBeVisible();
        await expect(canvas.getByRole('link', { name: 'Explore campaign 1' })).toBeVisible();
        await expect(canvas.getByRole('link', { name: 'Explore campaign 2' })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /next slide/i })).toBeInTheDocument();
    },
};
export const Autoplay: Story = {
    args: { autoPlay: true },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const pause = canvas.queryByRole('button', { name: 'Pause the slideshow' });
        if (pause) await userEvent.click(pause);
        await expect(canvas.getByRole('button', { name: 'Play the slideshow' })).toBeVisible();
    },
};
export const ImageCards: Story = {
    args: {
        items: Array.from({ length: 6 }, (_, index) => ({
            id: `image-${index}`,
            layout: 'image' as const,
            imageUrl: '/images/hero-01.webp',
            imageAlt: `Collection ${index + 1}`,
            imageAspectRatio: '3:4' as const,
            buttonLink: `/search?q=collection-${index + 1}`,
            badge: 'Sponsored',
            className: 'gap-0 py-0',
        })),
    },
};
export const SingleCard: Story = { args: { items: [meta.args.items[0]], autoPlay: true } };
export const Empty: Story = { args: { items: [] } };

export const CampaignPresentation: Story = {
    args: {
        titleVariant: 'section',
        items: meta.args.items.map((item) => ({ ...item, variant: 'campaign', className: undefined })),
    },
};
