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
import Hero from '../index';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

type HeroProps = React.ComponentProps<typeof Hero>;
type HeroArgs = HeroProps & {
    hasImage?: boolean;
    hasSubtitle?: boolean;
    hasCta?: boolean;
};

const SAMPLE_IMAGE = '/images/hero-01.webp';

const TYPOGRAPHY_OPTIONS = [
    'Default',
    'Paragraph',
    'Heading 1',
    'Heading 2',
    'Heading 3',
    'Heading 4',
    'Heading 5',
    'Heading 6',
] as const;
const BUTTON_STYLE_OPTIONS = ['Primary', 'Secondary', 'Tertiary'] as const;
const OVERLAY_POSITION_OPTIONS = [
    'Top Left',
    'Top Center',
    'Top Right',
    'Middle Left',
    'Middle Center',
    'Middle Right',
    'Bottom Left',
    'Bottom Center',
    'Bottom Right',
] as const;
const OVERLAY_ALIGNMENT_OPTIONS = ['left', 'center', 'right'] as const;
const HEIGHT_OPTIONS = ['sm', 'md', 'lg', 'xl', 'full'] as const;

const meta: Meta<HeroArgs> = {
    title: 'Content/Marketing/Hero',
    component: Hero,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
A Page Designer hero banner with background image, title, subtitle, and call-to-action button. Title and subtitle support typography presets, optional hex color overrides, and overlay placement (9 positions × 3 alignments). The \`styleOverride\` prop accepts a CSS fragment scoped to the hero instance via a unique \`data-hero-id\` attribute — supports CSS nesting and design-system tokens.
                `,
            },
        },
    },
    argTypes: {
        hasImage: {
            control: 'boolean',
            description: 'Synthetic toggle: when off, clears imageUrl to demonstrate the empty placeholder.',
            table: { category: 'Synthetic' },
        },
        hasSubtitle: {
            control: 'boolean',
            description: 'Synthetic toggle: when off, clears subtitle.',
            table: { category: 'Synthetic' },
        },
        hasCta: {
            control: 'boolean',
            description: 'Synthetic toggle: when off, clears ctaLink (the CTA only renders when ctaLink is non-empty).',
            table: { category: 'Synthetic' },
        },
        titleTypography: { control: 'select', options: TYPOGRAPHY_OPTIONS },
        subtitleTypography: { control: 'select', options: TYPOGRAPHY_OPTIONS },
        buttonStyle: { control: 'select', options: BUTTON_STYLE_OPTIONS },
        overlayPosition: { control: 'select', options: OVERLAY_POSITION_OPTIONS },
        overlayAlignment: { control: 'inline-radio', options: OVERLAY_ALIGNMENT_OPTIONS },
        height: { control: 'select', options: HEIGHT_OPTIONS },
        titleColor: { control: 'color' },
        subtitleColor: { control: 'color' },
        styleOverride: { control: 'text' },
        imageUrl: { table: { disable: true } },
    },
    args: {
        title: 'Welcome to Our Store',
        subtitle: 'Discover amazing products for your everyday needs',
        imageAlt: 'Hero background',
        imageTitle: '',
        ctaText: 'Shop Now',
        ctaLink: '/category/all',
        titleTypography: 'Default',
        titleColor: '',
        subtitleTypography: 'Default',
        subtitleColor: '',
        buttonStyle: 'Primary',
        overlayPosition: 'Middle Center',
        overlayAlignment: 'center',
        height: 'full',
        styleOverride: '',
        hasImage: true,
        hasSubtitle: true,
        hasCta: true,
    },
    render: ({ hasImage, hasSubtitle, hasCta, subtitle, ctaLink, ...props }) => (
        <Hero
            {...props}
            imageUrl={hasImage ? { url: SAMPLE_IMAGE } : undefined}
            subtitle={hasSubtitle ? subtitle : undefined}
            ctaLink={hasCta ? ctaLink : ''}
        />
    ),
};

export default meta;
type Story = StoryObj<HeroArgs>;

export const Playground: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Toggle every Page Designer prop via Controls. Use `hasImage`, `hasSubtitle`, and `hasCta` to flip optional content on and off; the CTA hides automatically when `ctaLink` is empty.',
            },
        },
    },
};

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Standard hero with title, subtitle, image, and CTA — all defaults.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        await expect(await canvas.findByText(/welcome to our store/i)).toBeInTheDocument();
        await expect(await canvas.findByRole('link', { name: /shop now/i })).toBeInTheDocument();
    },
};

export const WithoutSubtitle: Story = {
    args: {
        title: 'Simple Hero',
        ctaText: 'Explore',
        ctaLink: '/explore',
        hasSubtitle: false,
    },
    parameters: {
        docs: {
            description: {
                story: 'Hero with title and CTA but no subtitle. Verifies the subtitle paragraph element is omitted entirely (not just hidden).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        await expect(await canvas.findByText(/simple hero/i)).toBeInTheDocument();
        // No subtitle should render.
        await expect(canvas.queryByText(/discover amazing products/i)).not.toBeInTheDocument();
    },
};

export const WithoutImage: Story = {
    args: {
        title: 'Missing Background Image',
        subtitle: 'When imageUrl is unauthored, the hero renders a flat muted placeholder behind the overlay text.',
        hasImage: false,
    },
    parameters: {
        docs: {
            description: {
                story: 'Coverage for AC #2 missing-media. Component falls back to `<div class="absolute inset-0 bg-muted" />` when `imageUrl` is missing — title and CTA still render legibly because of the contrast against the muted surface.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        await expect(await canvas.findByText(/missing background image/i)).toBeInTheDocument();
        // No <img> should render.
        await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
        // The bg-muted placeholder is in the DOM.
        await expect(canvasElement.querySelector('.bg-muted')).not.toBeNull();
    },
};

export const LongCopy: Story = {
    args: {
        title: 'A Substantially Longer Headline That Tests How the Hero Handles Multi-Line Authored Content Across Responsive Breakpoints',
        subtitle:
            'A multi-sentence subtitle of the kind merchants actually author for editorial homepage takeovers. Used for seasonal campaigns, brand stories, or category storytelling where the copy is the entire creative — no separate marketing image, no carousel, just one large hero with rich typography. Verifies that long copy reflows cleanly within the overlay container at the default Middle Center placement.',
        ctaText: 'Browse the Editorial Collection',
        ctaLink: '/category/editorial',
    },
    parameters: {
        docs: {
            description: {
                story: 'Coverage for AC #2 long-copy authoring. Long headline + multi-sentence subtitle + long CTA label, all within the default content-block max-width.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        await expect(await canvas.findByText(/a substantially longer headline/i)).toBeInTheDocument();
        await expect(await canvas.findByText(/multi-sentence subtitle/i)).toBeInTheDocument();
        await expect(await canvas.findByRole('link', { name: /browse the editorial collection/i })).toBeInTheDocument();
    },
};

export const PageDesignerStyling: Story = {
    args: {
        title: 'Styled headline',
        titleTypography: 'Heading 2',
        titleColor: '#F8FAFC',
        subtitle: 'Subtitle with custom color and paragraph scale',
        subtitleTypography: 'Paragraph',
        subtitleColor: '#E2E8F0',
        ctaText: 'Shop',
        ctaLink: '/category/all',
        buttonStyle: 'Tertiary',
    },
    parameters: {
        docs: {
            description: {
                story: 'Demonstrates Page Designer typography, hex color overrides, and tertiary (outline) button style — the full PD attribute surface.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        await expect(await canvas.findByText(/styled headline/i)).toBeInTheDocument();
        const link = await canvas.findByRole('link', { name: /shop/i });
        await expect(link).toHaveAttribute('data-variant', 'outline');
    },
};

export const StyleOverrideWithDesignTokens: Story = {
    args: {
        title: 'Design Token Override',
        subtitle:
            'Ghost button using var(--primary-foreground) — inverts to solid on hover using var(--primary). White inset frame via var(--ring).',
        titleColor: '#F8FAFC',
        subtitleColor: '#E2E8F0',
        ctaText: 'Shop Now',
        ctaLink: '/category/all',
        styleOverride:
            '& { outline: 3px solid var(--primary-foreground); outline-offset: -12px; }\n& [data-slot="button"] { background-color: transparent; color: var(--primary-foreground); border: 2px solid var(--primary-foreground); }\n& [data-slot="button"]:hover { background-color: var(--primary-foreground); color: var(--primary); transform: scale(1.03); }',
    },
    parameters: {
        docs: {
            description: {
                story: 'Coverage for AC #3 — the `styleOverride` CSS-override-block hook. Uses design system tokens (`var(--primary-foreground)`, `var(--primary)`, `var(--ring)`) so the override automatically adapts to theme changes. Demonstrates CSS nesting via `&` (the hero root) and descendant selectors (`& [data-slot="button"]`).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        const hero = canvasElement.querySelector('[data-hero-id]');
        await expect(hero).toBeInTheDocument();

        const styleTag = canvasElement.querySelector('style');
        await expect(styleTag).toBeInTheDocument();
        await expect(styleTag?.textContent).toContain('var(--primary-foreground)');
        await expect(styleTag?.textContent).toContain('var(--primary)');
    },
};

export const RightBlockCenteredText: Story = {
    args: {
        title: 'Right-aligned column',
        subtitle: 'Text stays centered inside the content block',
        ctaText: 'Shop Now',
        ctaLink: '/category/all',
        overlayPosition: 'Middle Right',
        overlayAlignment: 'center',
    },
    parameters: {
        docs: {
            description: {
                story: 'Layout-variant coverage (WI Step 3) — content block sits at Middle Right position; title, subtitle, and CTA remain center-aligned within that block. Page Designer overlayPosition + overlayAlignment together form a 9 × 3 layout grid; this story exercises one off-center placement.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        await expect(await canvas.findByText(/right-aligned column/i)).toBeInTheDocument();
    },
};
