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
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import { standardProd } from '@/components/__mocks__/standard-product-2';
import ProductZoomModal from '../index';
import type { GalleryImage } from '@/components/image-gallery';

const baseImage = standardProd.imageGroups?.[0]?.images?.[0];
const baseSrc =
    baseImage?.link ||
    baseImage?.disBaseLink ||
    'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dwbeefee44/images/large/P0048_001.jpg';
const baseAlt = baseImage?.alt || 'Product image';

const buildImages = (count: number): GalleryImage[] =>
    Array.from({ length: count }, (_, idx) => ({
        src: idx === 0 ? baseSrc : `${baseSrc}?v=${idx + 1}`,
        alt: `${baseAlt} (${idx + 1})`,
    }));

/** Query the portaled dialog (Radix renders `DialogContent` into `document.body`). */
const dialog = () => within(document.body);
const zoomImage = () => dialog().getByRole('img') as HTMLImageElement;

const meta: Meta<typeof ProductZoomModal> = {
    title: 'PRODUCT/Product Zoom Modal',
    component: ProductZoomModal,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
Product-image zoom lightbox opened from the PDP gallery to inspect a product up close.

- **Large centered dialog** (~90% of the viewport) over a dimmed backdrop — not fullscreen, so the page
  stays visible around it. Click the backdrop or press \`Escape\` to close.
- **Click to magnify**: the image opens fit-to-dialog; clicking it magnifies (~2.5×). While magnified,
  moving the cursor pans the enlarged image so the area under the cursor stays under the cursor. Click
  again to return to fit; paging to another image resets magnify. On touch, tap toggles magnify.
- **Navigation**: reused prev/next arrows, an image counter, and left/right arrow-key support.
- Built on the design-system \`Dialog\` (focus trap, \`Escape\`, \`aria-modal\`, scroll-lock) with an
  \`sr-only\` accessible name, and honors \`prefers-reduced-motion\`. Lazy-mounted from the gallery.
                `,
            },
        },
    },
    args: {
        images: buildImages(4),
        initialIndex: 0,
        open: true,
        productName: 'Sample Product',
        onOpenChange: fn(),
        onIndexChange: fn(),
    },
    argTypes: {
        initialIndex: { control: { type: 'number', min: 0 } },
        open: { control: 'boolean' },
    },
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig as never}>
                <Story />
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default multi-image lightbox: prev/next arrows and an image counter. Clicking "Next" advances the slide.
 */
export const MultipleImages: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const body = dialog();
        await waitFor(async () => {
            await expect(body.getByRole('dialog')).toBeInTheDocument();
        });
        await expect(body.getByText('1 of 4')).toBeInTheDocument();
        await userEvent.click(body.getByRole('button', { name: /next image/i }));
        await expect(body.getByText('2 of 4')).toBeInTheDocument();
    },
};

/**
 * Click-to-magnify: clicking the image scales it up (~2.5×); clicking again returns to the fit view.
 */
export const ClickToMagnify: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const body = dialog();
        await waitFor(async () => {
            await expect(body.getByRole('dialog')).toBeInTheDocument();
        });
        const viewport = document.body.querySelector('[data-slot="product-zoom-viewport"]') as HTMLElement;

        // Starts fit-to-dialog.
        await expect(zoomImage().style.transform).toBe('scale(1)');
        await expect(viewport).toHaveClass('cursor-zoom-in');

        // Click magnifies.
        await userEvent.click(viewport);
        await expect(zoomImage().style.transform).toBe('scale(2.5)');
        await expect(viewport).toHaveClass('cursor-zoom-out');

        // Click again returns to fit.
        await userEvent.click(viewport);
        await expect(zoomImage().style.transform).toBe('scale(1)');
    },
};

/**
 * Single image: no arrows and no counter (nothing to page through). Magnify still works.
 */
export const SingleImage: Story = {
    args: {
        images: buildImages(1),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const body = dialog();
        await waitFor(async () => {
            await expect(body.getByRole('dialog')).toBeInTheDocument();
        });
        await expect(body.queryByRole('button', { name: /next image/i })).not.toBeInTheDocument();
        await expect(body.queryByText(/of/)).not.toBeInTheDocument();
    },
};

/**
 * Opened on a later slide — the lightbox honors `initialIndex`.
 */
export const OpenedOnLaterSlide: Story = {
    args: {
        initialIndex: 2,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const body = dialog();
        await waitFor(async () => {
            await expect(body.getByText('3 of 4')).toBeInTheDocument();
        });
    },
};

/**
 * Keyboard panning while magnified, then left/right navigation after returning to the fit view.
 */
export const KeyboardNavigation: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const body = dialog();
        const dlg = await waitFor(async () => {
            const node = body.getByRole('dialog');
            await expect(node).toBeInTheDocument();
            return node;
        });

        // Magnify, then pan with the arrow keys without changing the selected slide.
        const viewport = document.body.querySelector('[data-slot="product-zoom-viewport"]') as HTMLElement;
        await userEvent.click(viewport);
        await expect(zoomImage().style.transform).toBe('scale(2.5)');

        dlg.focus();
        const originBeforePan = zoomImage().style.transformOrigin;
        await userEvent.keyboard('{ArrowRight}{ArrowDown}');
        await expect(zoomImage().style.transformOrigin).not.toBe(originBeforePan);
        await expect(body.getByText('1 of 4')).toBeInTheDocument();

        // Return to the fit view. Left/right arrow keys resume image navigation.
        await userEvent.click(viewport);
        await expect(zoomImage().style.transform).toBe('scale(1)');
        await userEvent.keyboard('{ArrowRight}');
        await expect(body.getByText('2 of 4')).toBeInTheDocument();
        await expect(zoomImage().style.transform).toBe('scale(1)');

        // ArrowLeft from image 1 wraps to the last image.
        await userEvent.type(dlg, '{ArrowLeft}');
        await expect(body.getByText('1 of 4')).toBeInTheDocument();
        await userEvent.type(dlg, '{ArrowLeft}');
        await expect(body.getByText('4 of 4')).toBeInTheDocument();
    },
};
