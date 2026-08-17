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
import ContentCard from '../index';
import { CONTENT_CARD_TYPOGRAPHY_VALUES } from '../typography';
import { expect, within, waitFor } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { PageDesignerProvider } from '@salesforce/storefront-next-runtime/design/react/core';

type ContentCardArgs = React.ComponentProps<typeof ContentCard> & {
    hasImage?: boolean;
    hasButton?: boolean;
};

const SAMPLE_IMAGE = 'https://via.placeholder.com/400x300';

// Reuse the ContentCard PD enum directly so the Controls select can never drift
// from the component's actual typography presets.
const TYPOGRAPHY_OPTIONS = CONTENT_CARD_TYPOGRAPHY_VALUES;

const meta: Meta<ContentCardArgs> = {
    title: 'Content/Marketing/Content Card',
    component: ContentCard,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
A flexible card component for displaying authored content with optional image, title, description, and call-to-action button. Used in Page Designer authoring contexts (home page, about-us, and other CMS-authored pages).

### Features
- Optional image with lazy loading
- Title and description text: rendered as a gradient overlay when an image is present, or directly on the card surface when it is not
- Call-to-action button with link
- Configurable background and border (designer-controlled via Page Designer attributes)
- CSS override hooks (\`className\`, \`cardFooterClassName\`, \`cardDescriptionClassName\`, \`buttonClassName\`)
- W-23729786: a freshly-dropped, unconfigured card shows an instructional empty state — a grey image-placeholder surface with the default description/title bottom-left aligned — while authoring in Page Designer design mode — see UnconfiguredDesignMode. On the live storefront (UnconfiguredLiveStorefront) it renders just the empty card shell, with no authoring prompt shown to shoppers.
                `,
            },
        },
    },
    argTypes: {
        hasImage: {
            control: 'boolean',
            description:
                'Synthetic toggle: when off, clears imageUrl so any authored title/description/CTA render on the card surface (text-only card) instead of as an image overlay.',
            table: { category: 'Synthetic' },
        },
        hasButton: {
            control: 'boolean',
            description: 'Synthetic toggle: when off, clears buttonText/buttonLink.',
            table: { category: 'Synthetic' },
        },
        loading: {
            control: { type: 'inline-radio' },
            options: ['lazy', 'eager'],
        },
        titleTypography: { control: 'select', options: TYPOGRAPHY_OPTIONS },
        descriptionTypography: { control: 'select', options: TYPOGRAPHY_OPTIONS },
        className: { table: { disable: true } },
        cardFooterClassName: { table: { disable: true } },
        cardDescriptionClassName: { table: { disable: true } },
        buttonClassName: { table: { disable: true } },
        regionId: { table: { disable: true } },
        component: { table: { disable: true } },
        componentData: { table: { disable: true } },
        designMetadata: { table: { disable: true } },
        data: { table: { disable: true } },
    },
    args: {
        title: 'Featured Product',
        description: 'Discover our latest collection of premium products designed for modern living.',
        imageUrl: SAMPLE_IMAGE,
        imageAlt: 'Featured Product',
        buttonText: 'Shop Now',
        buttonLink: '/category/featured',
        showBackground: true,
        showBorder: true,
        loading: 'lazy',
        hasImage: true,
        hasButton: true,
    },
    render: ({ hasImage, hasButton, imageUrl, buttonText, buttonLink, ...props }) => (
        <div style={{ width: 400 }}>
            <ContentCard
                {...props}
                imageUrl={hasImage ? imageUrl : undefined}
                buttonText={hasButton ? buttonText : undefined}
                buttonLink={hasButton ? buttonLink : undefined}
            />
        </div>
    ),
};

export default meta;
type Story = StoryObj<ContentCardArgs>;

export const Playground: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Toggle every prop via Controls. Use `hasImage` and `hasButton` to flip optional content on and off.',
            },
        },
    },
};

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Standard content card with image, title, description, and call-to-action button.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        await expect(await canvas.findByText(/featured product/i)).toBeInTheDocument();
        await expect(await canvas.findByText(/discover our latest/i)).toBeInTheDocument();
        await expect(await canvas.findByRole('link', { name: /shop now/i })).toBeInTheDocument();
    },
};

export const WithoutButton: Story = {
    args: {
        title: 'Text Only Card',
        description: 'This card has an image with text overlay but no button.',
        imageAlt: 'Text only card',
        hasButton: false,
    },
    parameters: {
        docs: {
            description: {
                story: 'Image card with title and description but no call-to-action button.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        await expect(await canvas.findByText(/text only card/i)).toBeInTheDocument();
        // The whole point of this story: no button should render.
        await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
    },
};

export const WithoutImage: Story = {
    args: {
        title: 'Text Only, No Image',
        description:
            'When imageUrl is missing, the title, description, and call-to-action render directly on the card surface instead of as an overlay. Authored copy is never dropped just because an image is absent.',
        imageAlt: '',
        hasImage: false,
        hasButton: true,
    },
    parameters: {
        docs: {
            description: {
                story: 'Text-only content card. With no image authored, the component renders the title/description/CTA on the card surface (no image overlay). Merchants can author image-less content cards without silently losing their copy.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        // No image, but the authored text and CTA still render.
        await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
        await expect(await canvas.findByText(/text only, no image/i)).toBeInTheDocument();
        await expect(await canvas.findByRole('link', { name: /shop now/i })).toBeInTheDocument();
    },
};

export const UnconfiguredLiveStorefront: Story = {
    args: {
        title: undefined,
        description: undefined,
        imageAlt: '',
        hasImage: false,
        hasButton: false,
    },
    parameters: {
        docs: {
            description: {
                story: 'W-23729786: a freshly-dropped, unconfigured Content Card as a shopper sees it on the live storefront (not Page Designer design mode). With no image, no text, and no CTA authored, the component renders just the empty card shell — no card content, and no authoring prompt, is emitted. The instructional empty state (a grey placeholder surface with the default description/title) is gated to design mode, so it never leaks to shoppers. See UnconfiguredDesignMode for the design-mode authoring view.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        // Nothing authored → no image, no heading, no link, and no authoring prompt.
        await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
        await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();
        await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
        await expect(canvas.queryByRole('heading', { name: /add your title here/i })).not.toBeInTheDocument();
        await expect(canvasElement.querySelector('[data-slot="empty-state"]')).toBeNull();
    },
};

export const UnconfiguredDesignMode: Story = {
    args: {
        title: undefined,
        description: undefined,
        imageAlt: '',
        hasImage: false,
        hasButton: false,
    },
    parameters: {
        // Design mode renders the real ContentCard inside PageDesignerProvider's lazy Suspense
        // provider, which resolves in a live browser but suspends to a fallback in the synchronous
        // snapshot render — so this story is interaction-only and opts out of snapshotting.
        snapshot: false,
        docs: {
            description: {
                story: 'W-23729786: a freshly-dropped, unconfigured Content Card as a merchant sees it in Page Designer design mode (`mode="EDIT"`). Renders a preview of the real image-backed card — a grey placeholder surface with the image glyph and the default description/title bottom-left aligned, no CTA — the authoring cue that never leaks to shoppers (see UnconfiguredLiveStorefront for the live view).',
            },
        },
    },
    decorators: [
        (Story) => (
            <PageDesignerProvider clientId="storybook-content-card" targetOrigin="*" mode="EDIT">
                <Story />
            </PageDesignerProvider>
        ),
    ],
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        // The lazy DesignProvider resolves asynchronously — wait for the authoring prompt to appear.
        await waitFor(async () => {
            await expect(canvas.getByRole('heading', { name: /add your title here/i })).toBeInTheDocument();
        });
        await expect(canvas.getByText(/add your description here/i)).toBeInTheDocument();
        // The placeholder is copy only — no CTA button or link.
        await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
        await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
        await expect(canvasElement.querySelector('[data-slot="empty-state"]')).not.toBeNull();
    },
};

export const LongCopy: Story = {
    args: {
        title: 'Discover the Most Comprehensive Curated Collection of Sustainable, Ethically Sourced, Premium-Quality Goods Designed for the Modern Conscious Consumer',
        description:
            'Every piece in this collection has been selected by our editorial team for its provenance, craftsmanship, and material story. From hand-loomed textiles to single-origin ceramics, our partners share a commitment to fair-wage manufacturing, low-impact materials, and durable design that outlasts trend cycles. Browse the full assortment to find pieces that match your aesthetic and your values.',
        imageAlt: 'Long-copy editorial card',
        buttonText: 'Browse the Full Editorial Collection',
        buttonLink: '/category/editorial',
    },
    parameters: {
        docs: {
            description: {
                story: 'Coverage for AC #2 long-copy authoring. Verifies that the gradient overlay still legibly contains a long headline + multi-paragraph description + long button label without breaking the layout.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        await expect(await canvas.findByText(/discover the most comprehensive/i)).toBeInTheDocument();
        await expect(await canvas.findByText(/every piece in this collection/i)).toBeInTheDocument();
        await expect(
            await canvas.findByRole('link', { name: /browse the full editorial collection/i })
        ).toBeInTheDocument();
    },
};

export const NoBackground: Story = {
    args: {
        title: 'Transparent Card',
        description: 'This card has no background or border for a cleaner look.',
        imageAlt: 'Transparent card',
        showBackground: false,
        showBorder: false,
        buttonText: 'Explore',
        buttonLink: '/explore',
    },
    parameters: {
        docs: {
            description: {
                story: 'Content card with `showBackground={false}` and `showBorder={false}` — the outer card surface goes transparent and borderless.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        await expect(await canvas.findByText(/transparent card/i)).toBeInTheDocument();

        // showBackground={false} swaps `bg-muted/50` for `bg-transparent`.
        // Find the outer card by its `relative h-full overflow-hidden` baseline.
        const card = canvasElement.querySelector('.bg-transparent');
        await expect(card).not.toBeNull();
        await expect(canvasElement.querySelector('.bg-muted\\/50')).toBeNull();
    },
};

export const TypographyPresets: Story = {
    args: {
        title: 'Preset Heading',
        titleTypography: 'Heading 2',
        description: 'Description rendered with the shared Paragraph typography preset.',
        descriptionTypography: 'Paragraph',
        imageAlt: 'Typography presets',
        hasImage: false,
        hasButton: false,
    },
    parameters: {
        docs: {
            description: {
                story: 'Exercises the non-`Default` title/description typography presets. `Default` reproduces the original hardcoded look; the other presets derive from the shared `typographyVariants` scale. The snapshot captures the resolved class strings, so a change to `typographyVariants` (or the preset wiring) fails CI here instead of silently altering authored cards.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        // `Heading 2` → typographyVariants({ variant: 'h2' }) = text-3xl font-semibold tracking-tight.
        const heading = await canvas.findByRole('heading', { name: /preset heading/i });
        await expect(heading).toHaveClass('text-3xl', 'font-semibold', 'tracking-tight');
        // The local `Default` size must NOT leak in when a preset is selected.
        await expect(heading).not.toHaveClass('text-2xl');

        // `Paragraph` → typographyVariants({ variant: 'body' }) = text-base font-normal leading-7.
        const description = await canvas.findByText(/shared paragraph typography preset/i);
        await expect(description).toHaveClass('text-base', 'font-normal', 'leading-7');
    },
};

export const CustomClassNames: Story = {
    args: {
        title: 'Custom Class Names',
        description: 'This example applies custom classes to the footer, description, and button.',
        imageAlt: 'Custom class names',
        buttonText: 'View Details',
        buttonLink: '/details',
        // Unique sentinel per prop so each assertion proves THAT specific override
        // landed on THAT specific element — a shared sentinel (e.g. all `flex-row`)
        // would pass even if only one of the four actually applied.
        className: 'card-override-sentinel',
        cardFooterClassName: 'footer-override-sentinel',
        cardDescriptionClassName: 'description-override-sentinel',
        buttonClassName: 'button-override-sentinel',
    },
    parameters: {
        docs: {
            description: {
                story: 'Coverage for AC #3 — CSS-override-block hooks. Demonstrates the four className override props (`className`, `cardFooterClassName`, `cardDescriptionClassName`, `buttonClassName`) all reaching their target elements.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        await expect(await canvas.findByText(/custom class names/i)).toBeInTheDocument();

        // Each override must land on its OWN target element (unique sentinel per prop).
        // `className` → outer card; `cardFooterClassName` → footer overlay;
        // `cardDescriptionClassName` → description block; `buttonClassName` → CTA link.
        const outerCard = canvasElement.querySelector('.card-override-sentinel');
        await expect(outerCard).not.toBeNull();
        await expect(outerCard).toHaveClass('relative', 'h-full', 'overflow-hidden');

        const footer = canvasElement.querySelector('.footer-override-sentinel');
        await expect(footer).not.toBeNull();
        await expect(footer).toHaveClass('absolute', 'inset-0');

        await expect(canvasElement.querySelector('.description-override-sentinel')).not.toBeNull();

        const button = await canvas.findByRole('link', { name: /view details/i });
        await expect(button).toHaveClass('button-override-sentinel');
    },
};
