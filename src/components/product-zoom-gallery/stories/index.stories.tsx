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
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import type { GalleryImage } from '@/components/image-gallery';
import { mockConfig } from '@/test-utils/config';
import ProductZoomGallery from '../index';

const imageSource =
    'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dwbeefee44/images/large/P0048_001.jpg';

const images: GalleryImage[] = Array.from({ length: 4 }, (_, index) => ({
    src: index === 0 ? imageSource : `${imageSource}?view=${index + 1}`,
    alt: `Canvas weekender bag, view ${index + 1}`,
}));

const meta: Meta<typeof ProductZoomGallery> = {
    title: 'Products/Product Zoom Gallery',
    component: ProductZoomGallery,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'PDP gallery that defers the zoom lightbox until a shopper activates an image. Use the layout control to preview the stacked and furniture mosaic arrangements.',
            },
        },
    },
    args: {
        images,
        productName: 'Canvas Weekender Bag',
        layout: 'stacked',
    },
    argTypes: {
        images: { table: { disable: true } },
        productName: {
            control: 'text',
            description: 'Fallback accessible name used when an image has no alt text',
        },
        layout: {
            control: 'inline-radio',
            options: ['stacked', 'mosaic'],
            description: 'PDP image arrangement',
        },
    },
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <div className="w-[min(42rem,90vw)]">
                    <Story />
                </div>
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Stacked PDP gallery with its deferred lightbox open interaction. */
export const Playground: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const zoomTrigger = canvas.getByRole('button', { name: /zoom image 1 of 4/i });

        await userEvent.click(zoomTrigger);

        const dialog = await waitFor(() => {
            const element = within(document.body).getByRole('dialog');
            expect(element).toBeInTheDocument();
            return element;
        });
        await expect(within(dialog).getByRole('button', { name: /toggle image magnification/i })).toHaveAttribute(
            'aria-pressed',
            'false'
        );
    },
};

/** Furniture's structurally distinct mosaic PDP gallery. */
export const Mosaic: Story = {
    args: {
        layout: 'mosaic',
    },
};
