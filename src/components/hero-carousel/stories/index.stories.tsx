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
import HeroCarousel, { type HeroSlide } from '../index';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

type HeroCarouselArgs = {
    slideCount?: number;
    autoPlay?: boolean;
    autoPlayInterval?: number;
    showDots?: boolean;
    showNavigation?: boolean;
    longCopy?: boolean;
};

const SAMPLE_IMAGE = 'https://via.placeholder.com/1920x1080?text=Slide';

function buildSlides(count: number, longCopy: boolean): HeroSlide[] {
    const titles = ['Welcome to Our Store', 'New Collection', 'Special Offers', 'Outdoor Adventures', 'Members Only'];
    const subtitles = [
        'Discover amazing products',
        'Latest seasonal styles',
        'Limited time deals',
        'Built for the wild',
        'Early access perks',
    ];
    const ctas = ['Shop Now', 'Explore', 'Shop Deals', 'Discover Gear', 'Sign in'];
    const ctaLinks = ['/category/all', '/category/new', '/category/sale', '/category/outdoors', '/account'];

    const longHeadline =
        'A Substantially Longer Editorial Headline That Tests How the Carousel Slide Handles Multi-Line Authored Content Across Responsive Breakpoints';
    const longSubtitle =
        'A multi-sentence subtitle of the kind merchants actually author for seasonal campaign takeovers — exercises the slide overlay layout under realistic copy density.';

    return Array.from({ length: count }, (_, i) => ({
        id: `slide-${i + 1}`,
        title: longCopy ? longHeadline : titles[i % titles.length],
        subtitle: longCopy ? longSubtitle : subtitles[i % subtitles.length],
        imageUrl: `${SAMPLE_IMAGE}+${i + 1}`,
        imageAlt: `Slide ${i + 1}`,
        ctaText: ctas[i % ctas.length],
        ctaLink: ctaLinks[i % ctaLinks.length],
    }));
}

const meta: Meta<HeroCarouselArgs> = {
    title: 'Content/Marketing/Hero Carousel',
    component: HeroCarousel,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
A Page Designer carousel of \`Hero\` slides. Supports autoplay (paused on hover/focus), keyboard navigation (arrows / Home / End), prev/next buttons, and dot indicators. Slides come from either the \`slides\` prop (storybook/test path) or the Page Designer \`component.regions\` payload (production path).
                `,
            },
        },
    },
    argTypes: {
        slideCount: {
            control: { type: 'number', min: 0, max: 10 },
            description:
                'Synthetic toggle: how many slides to mock. 0 exercises the empty-state branch; 1 hides dots/nav; 2+ shows full controls.',
            table: { category: 'Synthetic' },
        },
        longCopy: {
            control: 'boolean',
            description:
                'Synthetic toggle: replaces slide titles/subtitles with editorial-length copy (AC #2 long-copy authoring).',
            table: { category: 'Synthetic' },
        },
        autoPlay: { control: 'boolean' },
        autoPlayInterval: { control: { type: 'number', min: 1000, step: 500 } },
        showDots: { control: 'boolean' },
        showNavigation: { control: 'boolean' },
    },
    args: {
        slideCount: 3,
        longCopy: false,
        autoPlay: true,
        autoPlayInterval: 5000,
        showDots: true,
        showNavigation: true,
    },
    render: ({ slideCount = 3, longCopy = false, ...props }) => (
        <HeroCarousel slides={buildSlides(slideCount, longCopy)} {...props} />
    ),
};

export default meta;
type Story = StoryObj<HeroCarouselArgs>;

export const Playground: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Toggle every prop via Controls. Use `slideCount` to flip between empty-state (0), single-slide (1), and multi-slide (2+) branches.',
            },
        },
    },
};

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: '3-slide carousel with autoplay, dots, and prev/next navigation — the standard authoring shape.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        const carousel = await canvas.findByRole('region', { name: /hero carousel with 3 slides/i });
        await expect(carousel).toBeInTheDocument();

        // Dots tablist with 3 dots.
        const tablist = await canvas.findByRole('tablist', { name: /slide navigation/i });
        await expect(tablist).toBeInTheDocument();
        await expect(within(tablist).getAllByRole('tab')).toHaveLength(3);
    },
};

export const EmptySlides: Story = {
    args: {
        slideCount: 0,
    },
    parameters: {
        docs: {
            description: {
                story: 'Coverage for AC #2 missing-media at the carousel level — when the `slides` prop is empty (or every slide gets filtered out), the component falls back to a flat "No slides available" placeholder. Merchants see this when a Page Designer slides region is left empty.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        await expect(await canvas.findByText(/no slides available/i)).toBeInTheDocument();
        // No carousel region, no tablist.
        await expect(canvas.queryByRole('region', { name: /hero carousel/i })).not.toBeInTheDocument();
        await expect(canvas.queryByRole('tablist')).not.toBeInTheDocument();
    },
};

export const SingleSlide: Story = {
    args: {
        slideCount: 1,
    },
    parameters: {
        docs: {
            description: {
                story: 'With one slide, the component hides the dot indicators and prev/next buttons (`slides.length > 1` gate). Verifies the merchant-facing "carousel of one" layout.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        // Region renders.
        await expect(await canvas.findByRole('region', { name: /hero carousel with 1 slide/i })).toBeInTheDocument();
        // No dots, no prev/next.
        await expect(canvas.queryByRole('tablist')).not.toBeInTheDocument();
        await expect(canvas.queryByRole('button', { name: /previous slide/i })).not.toBeInTheDocument();
    },
};

export const LongCopy: Story = {
    args: {
        slideCount: 3,
        longCopy: true,
        autoPlay: false, // Pause autoplay so the long-copy slide is observable.
    },
    parameters: {
        docs: {
            description: {
                story: 'AC #2 long-copy coverage — every slide gets editorial-length title + multi-sentence subtitle. Autoplay paused so the layout under copy density is observable.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        // All 3 slides share the long-copy headline (longCopy=true mirrors it across the helper output).
        const headings = await canvas.findAllByText(/a substantially longer editorial headline/i);
        await expect(headings.length).toBeGreaterThan(0);
    },
};
