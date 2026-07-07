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
import type { ComponentType } from 'react';
import ImageGallery, { type GalleryImage } from '../index';
import { expect, within, waitFor } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { standardProd } from '@/components/__mocks__/standard-product-2';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';

const baseImage = standardProd.imageGroups?.[0]?.images?.[0];
const baseSrc =
    baseImage?.link ||
    baseImage?.disBaseLink ||
    'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dwbeefee44/images/large/P0048_001.jpg';
const baseAlt = baseImage?.alt || 'Laptop Briefcase with wheels (37L), , large';
const thumbSrc = standardProd.imageGroups?.find((g) => g.viewType === 'small')?.images?.[0]?.link || baseSrc;

const buildImages = (count: number): GalleryImage[] =>
    Array.from({ length: count }, (_, idx) => ({
        src: idx === 0 ? baseSrc : `${baseSrc}?v=${idx + 1}`,
        alt: idx === 0 ? baseAlt : `${baseAlt} (${idx + 1})`,
        thumbSrc,
    }));

type SyntheticArgs = {
    imageCount: number;
    eager: boolean;
    showNavigationArrows: boolean;
    navigationArrowSize: 'sm' | 'lg';
    horizontalThumbnails: boolean;
    productName: string;
};

const meta: Meta<ComponentType<SyntheticArgs>> = {
    title: 'COMMON/Image Gallery',
    component: ImageGallery as unknown as ComponentType<SyntheticArgs>,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
    },
    argTypes: {
        imageCount: {
            control: { type: 'number', min: 0, max: 8 },
            description:
                'Synthetic arg — number of images. 0 triggers the empty state, 1 hides the thumbnail grid, 2+ renders the grid (or strip when horizontalThumbnails is on)',
        },
        eager: {
            control: 'boolean',
            description: 'Eager-load the main image (sets loading="eager", fetchpriority="high")',
        },
        showNavigationArrows: {
            control: 'boolean',
            description: 'Render prev/next arrows over the main image (only visible when imageCount > 1)',
        },
        navigationArrowSize: {
            control: { type: 'radio' },
            options: ['sm', 'lg'],
            description: 'Size of the prev/next arrows when shown',
        },
        horizontalThumbnails: {
            control: 'boolean',
            description: 'Use a horizontal scrollable thumbnail strip instead of the 4-column grid',
        },
        productName: {
            control: 'text',
            description: 'Fallback alt text used when an image has no alt of its own',
        },
    },
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <Story />
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<ComponentType<SyntheticArgs>>;

/**
 * At-rest state — single-image gallery (matches the mock fixture, which
 * has one image in `standardProd.imageGroups[0]`). Drive every variant
 * from the Controls panel:
 *
 *   - `imageCount: 0` — renders the "No image available" empty state
 *   - `imageCount: 4` — adds the 4-column thumbnail grid below the main image
 *   - `imageCount: 6` + `horizontalThumbnails: true` — switches to the
 *     scrollable strip with chevron buttons (visible on `sm` and up)
 *   - `showNavigationArrows: true` (with imageCount > 1) — adds prev/next
 *     arrow buttons over the main image; toggle `navigationArrowSize`
 *     between `sm` (default) and `lg` (PDP variant)
 *   - `eager: true` — main image switches to `loading="eager"`,
 *     `fetchpriority="high"`
 *   - `productName` — appears as the fallback `alt` when the image has none
 */
export const Default: Story = {
    args: {
        imageCount: 1,
        eager: false,
        showNavigationArrows: false,
        navigationArrowSize: 'sm',
        horizontalThumbnails: false,
        productName: '',
    },
    render: ({ imageCount, eager, showNavigationArrows, navigationArrowSize, horizontalThumbnails, productName }) => (
        <ImageGallery
            images={buildImages(imageCount)}
            eager={eager}
            showNavigationArrows={showNavigationArrows}
            navigationArrowSize={navigationArrowSize}
            horizontalThumbnails={horizontalThumbnails}
            productName={productName || undefined}
        />
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        let images: HTMLElement[] = [];
        try {
            images = await canvas.findAllByRole('img', {}, { timeout: 10000 });
        } catch {
            images = Array.from(canvasElement.querySelectorAll('img'));
        }
        await expect(images.length).toBeGreaterThan(0);
        await expect(images[0]).toBeInTheDocument();
    },
};

/**
 * Empty-state dedicated story — keeps the camera-emoji + "No image
 * available" message reachable via a single bookmarkable URL for QA. The
 * fallback path is structurally different from the populated gallery
 * (no `picture`, no thumbnails), so a dedicated story is more useful
 * than nudging the Default Controls to `imageCount: 0`.
 */
export const Empty: Story = {
    args: {
        imageCount: 0,
        eager: false,
        showNavigationArrows: false,
        navigationArrowSize: 'sm',
        horizontalThumbnails: false,
        productName: '',
    },
    render: ({ imageCount }) => <ImageGallery images={buildImages(imageCount)} />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        await waitFor(
            () => {
                const hasContent = canvasElement.textContent && canvasElement.textContent.length > 0;
                if (!hasContent) {
                    throw new Error('Empty state content not found');
                }
                return hasContent;
            },
            { timeout: 5000 }
        );
    },
};

/**
 * Horizontal-strip thumbnail layout — the variant the quick-add modal uses
 * (it renders <ImageGallery horizontalThumbnails />). Structurally distinct
 * from the 4-column grid: the thumbnails live in a scrollable strip marked
 * [data-gallery-strip] rather than the grid's [data-gallery-thumbs], and the
 * cosmetic overlay rounds each layout via its own seam. A dedicated story
 * locks the strip DOM into the snapshot suite (the grid stories never
 * exercised it) and gives QA a bookmarkable URL for the quick-add gallery.
 */
export const HorizontalStrip: Story = {
    args: {
        imageCount: 6,
        eager: false,
        showNavigationArrows: false,
        navigationArrowSize: 'sm',
        horizontalThumbnails: true,
        productName: '',
    },
    render: ({ imageCount, eager, showNavigationArrows, navigationArrowSize, horizontalThumbnails, productName }) => (
        <ImageGallery
            images={buildImages(imageCount)}
            eager={eager}
            showNavigationArrows={showNavigationArrows}
            navigationArrowSize={navigationArrowSize}
            horizontalThumbnails={horizontalThumbnails}
            productName={productName || undefined}
        />
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const strip = canvasElement.querySelector('[data-gallery-strip]');
        await expect(strip).toBeInTheDocument();
        // The strip renders one thumbnail button per image; the cosmetic overlay
        // rounds these via [data-slot='dialog-content'] [data-gallery-strip] button.
        await expect(strip?.querySelectorAll('button').length).toBe(6);
    },
};
