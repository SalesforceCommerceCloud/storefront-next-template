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
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import type { AppConfig } from '@/types/config';
import { DynamicImage } from '../index';

// A neutral placeholder source with the DynamicImage placeholder syntax `[?sw={width}]` so the
// resolver emits per-breakpoint widths when responsive widths are supplied.
const SRC = 'https://via.placeholder.com/800[?sw={width}&q=60]';

type PlaygroundArgs = Pick<
    React.ComponentProps<typeof DynamicImage>,
    'alt' | 'objectFit' | 'borderRadius' | 'boxShadow' | 'padding' | 'margin' | 'hoverEffect' | 'priority'
> & {
    /** Synthetic: when on, passes responsive `widths` (renders a <picture> with <source>s); when off, a plain <img>. */
    hasResponsiveWidths: boolean;
};

const meta: Meta<typeof DynamicImage> = {
    title: 'Content/Page Designer/Atomic/Image',
    component: DynamicImage,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Responsive image component optimized for the Dynamic Imaging Service (DIS) with Page Designer support. Builds a `<picture>` element with theme-aware `<source>`s and React 19 SSR preloading for high-priority images. Page Designer authors style it via the enum props (objectFit, borderRadius, boxShadow, padding, margin, hoverEffect); code callers typically pass `widths` (+ `priority` for above-the-fold images).',
            },
        },
    },
    // composeStories runs OUTSIDE the global decorator stack, and DynamicImage calls useConfig()
    // for DIS URL math — so ConfigProvider must live on the meta decorator (not just the global one),
    // otherwise the snapshot harness renders without a config.
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <Story />
            </ConfigProvider>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof DynamicImage>;
type PlaygroundStory = StoryObj<PlaygroundArgs>;

const ENUM_TABLE = { category: 'Page Designer styling' };

/**
 * Controls-driven story. Flip the Page Designer styling enums and the synthetic
 * `hasResponsiveWidths` toggle to explore every variant from one URL.
 */
export const Playground: PlaygroundStory = {
    argTypes: {
        alt: { control: 'text', description: 'Alt text for the image (accessibility).' },
        objectFit: {
            control: 'select',
            options: ['contain', 'cover', 'fill', 'none', 'scale-down'],
            description: 'How the image fills its container.',
            table: ENUM_TABLE,
        },
        borderRadius: {
            control: 'select',
            options: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'full'],
            description: 'Corner roundness (`full` = circular in a square container). Applies `overflow-hidden`.',
            table: ENUM_TABLE,
        },
        boxShadow: {
            control: 'select',
            options: ['none', 'sm', 'md', 'lg', 'xl', '2xl'],
            description: 'Drop-shadow elevation.',
            table: ENUM_TABLE,
        },
        padding: {
            control: 'select',
            options: ['0', '1', '2', '3', '4', '6', '8'],
            description: 'Padding around the image (Tailwind spacing units).',
            table: ENUM_TABLE,
        },
        margin: {
            control: 'select',
            options: ['0', '1', '2', '3', '4', '6', '8'],
            description: 'Margin around the image (Tailwind spacing units).',
            table: ENUM_TABLE,
        },
        hoverEffect: {
            control: 'select',
            options: ['none', 'scale', 'opacity', 'shadow', 'brightness'],
            description: 'Interactive hover treatment (hover the image to see it).',
            table: ENUM_TABLE,
        },
        priority: {
            control: 'radio',
            options: ['high', 'low', 'auto'],
            description:
                'Loading priority hint. `high` → eager + SSR preload (above-the-fold); `auto`/`low` → lazy. No visual delta at rest; changes `loading`/`fetchPriority`.',
        },
        hasResponsiveWidths: {
            control: 'boolean',
            description:
                'Synthetic: ON passes `widths={[400,800,1200]}` (renders a <picture> with <source>s); OFF renders a plain <img> with no responsive sources.',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    args: {
        alt: 'Responsive product image',
        objectFit: 'cover',
        borderRadius: 'none',
        boxShadow: 'none',
        padding: '0',
        margin: '0',
        hoverEffect: 'none',
        priority: 'auto',
        hasResponsiveWidths: true,
    },
    render: ({ hasResponsiveWidths, alt, ...args }) => (
        <div className="w-96">
            <DynamicImage src={SRC} alt={alt} widths={hasResponsiveWidths ? [400, 800, 1200] : undefined} {...args} />
        </div>
    ),
};

/**
 * At-rest baseline: a responsive image with array-form widths. This is how most code callers
 * (product tiles, grids, carousels) render the component.
 */
export const Default: Story = {
    render: () => <DynamicImage src={SRC} alt="Example image" widths={[400, 800, 1200]} />,
};

/**
 * Responsive widths in object form (`{ base, sm, md, lg }`) — the breakpoint-keyed configuration.
 * Each breakpoint produces a `<source>` with a media query, so the browser picks the right size
 * for desktop vs mobile. Resize the canvas (or use the viewport toolbar) to see the source switch.
 */
export const ResponsiveWidths: Story = {
    render: () => (
        <DynamicImage src={SRC} alt="Responsive object widths" widths={{ base: 400, sm: 600, md: 800, lg: 1200 }} />
    ),
    parameters: {
        docs: {
            description: {
                story: 'Breakpoint-keyed widths drive distinct `<source>` elements (desktop vs mobile). Covers the responsive desktop/mobile rendering path.',
            },
        },
    },
};

/**
 * Missing source: when `src` is empty the component renders a bare `<img>` with no responsive
 * `<picture>`/`<source>` wrapper. Covers the missing-media authoring state.
 */
export const MissingSrc: Story = {
    render: () => <DynamicImage src="" alt="No image source provided" />,
    parameters: {
        docs: {
            description: {
                story: 'With an empty `src` and no responsive `widths`, the component renders a single bare `<img>` with no `<picture>`/`<source>` wrapper and no `src` attribute. Authors hit this when an image attribute is left unset in Page Designer.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const image = await canvas.findByRole('img', { name: /no image source/i });
        await expect(image).toBeInTheDocument();
        // Empty src + no widths → the sources-length-0 branch: a plain <img>, not a <picture>.
        await expect(image.closest('picture')).toBeNull();
        // React omits the src attribute entirely for an empty string.
        await expect(image.getAttribute('src')).toBeNull();
    },
};

/**
 * DIS disabled: when `config.images.enableDis === false` (e.g. internal workspace environments),
 * the component skips DIS transformation — no `<source>` format conversion and no `sfrm`/`q`
 * parameters appended to the URL. Covers the DIS-disabled state.
 */
export const DisDisabled: Story = {
    decorators: [
        (Story) => (
            <ConfigProvider config={{ ...mockConfig, images: { ...mockConfig.images, enableDis: false } } as AppConfig}>
                <Story />
            </ConfigProvider>
        ),
    ],
    render: () => (
        <DynamicImage src="https://cdn.example.com/product.jpg" alt="DIS disabled image" widths={[400, 800]} />
    ),
    parameters: {
        docs: {
            description: {
                story: 'With `enableDis: false`, the rendered `src` keeps its original format and carries no DIS `sfrm=` parameter, and no `<source>` format-conversion elements are emitted. This mirrors the workspace-proxy image path.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const image = await canvas.findByRole('img', { name: /dis disabled/i });
        await expect(image).toBeInTheDocument();
        // Real coupled behavior of the enableDis=false branch: no DIS format-conversion param.
        await expect(image.getAttribute('src') ?? '').not.toMatch(/[?&]sfrm=/);
    },
};
