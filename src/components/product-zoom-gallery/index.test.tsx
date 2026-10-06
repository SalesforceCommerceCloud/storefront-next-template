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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import type { GalleryImage } from '@/components/image-gallery';
import ProductZoomGallery from './index';

const preloadMock = vi.hoisted(() => vi.fn());

vi.mock('react-dom', async () => {
    const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
    return { ...actual, preload: preloadMock };
});

void i18next.init({
    lng: 'en-US',
    fallbackLng: 'en-US',
    resources: {
        'en-US': {
            common: {
                noImageAvailable: 'No Image Available',
                previousImage: 'Previous Image',
                nextImage: 'Next Image',
                thumbnailImage: 'Product image {{current}} of {{total}}',
                thumbnailImageLabeled: '{{label}}, product image {{current}} of {{total}}',
                zoom: {
                    openImage: 'Zoom image {{current}} of {{total}}',
                    magnify: 'Toggle image magnification',
                    title: 'Product image',
                    description: 'Zoomed product image. Use the arrows or arrow keys to change image.',
                    counter: '{{current}} of {{total}}',
                },
            },
            product: { imageAlt: 'Product Image' },
        },
    },
});

const wrapperWithDis = (enableDis: boolean) => {
    const config = { ...mockConfig, images: { ...mockConfig.images, enableDis } };
    function DisWrapper({ children }: { children: ReactNode }) {
        return createElement(
            ConfigProvider,
            { config } as never,
            createElement(I18nextProvider, { i18n: i18next }, children)
        );
    }
    return DisWrapper;
};

const disSrc = (name: string) =>
    `https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw4cd0a798/images/large/${name}.jpg`;
const images: GalleryImage[] = [
    { src: disSrc('image1'), alt: 'Image 1' },
    { src: disSrc('image2'), alt: 'Image 2' },
    { src: disSrc('image3'), alt: 'Image 3' },
];

describe('ProductZoomGallery', () => {
    beforeEach(() => {
        preloadMock.mockClear();
    });

    afterEach(cleanup);

    it('does not mount the lightbox until a zoom trigger is activated', async () => {
        render(<ProductZoomGallery images={images} />, { wrapper: wrapperWithDis(true) });
        const trigger = screen.getByRole('button', { name: 'Zoom image 1 of 3' });
        expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        fireEvent.click(trigger);
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('falls back to the shared gallery behavior when DIS is unavailable', async () => {
        const user = userEvent.setup();
        render(<ProductZoomGallery images={images} />, { wrapper: wrapperWithDis(false) });

        expect(screen.queryByRole('button', { name: /zoom image/i })).not.toBeInTheDocument();

        const secondThumbnail = await screen.findByRole('button', { name: 'Product image 2 of 3' });
        await user.click(secondThumbnail);

        expect(secondThumbnail).toHaveAttribute('aria-current', 'true');
    });

    it('renders the shared empty-gallery fallback when DIS is enabled', () => {
        render(<ProductZoomGallery images={[]} />, { wrapper: wrapperWithDis(true) });

        expect(screen.getByText('No Image Available')).toBeInTheDocument();
    });

    it('can render images after the initial empty state', () => {
        const { rerender } = render(<ProductZoomGallery images={[]} />, { wrapper: wrapperWithDis(true) });

        rerender(<ProductZoomGallery images={images} />);

        expect(screen.getByRole('button', { name: 'Zoom image 1 of 3' })).toBeInTheDocument();
    });

    it('preloads off-screen images and promotes a thumbnail on focus', async () => {
        const preloadImages = [
            ...images,
            { src: disSrc('image4'), alt: 'Image 4' },
            { src: disSrc('image5'), alt: 'Image 5' },
        ];
        const { container } = render(<ProductZoomGallery images={preloadImages} />, { wrapper: wrapperWithDis(true) });

        await waitFor(() => {
            const preloadedSources = preloadMock.mock.calls.map(([href]) => String(href)).join(' | ');
            expect(preloadedSources).toContain('image2');
            expect(preloadedSources).toContain('image5');
        });
        preloadMock.mockClear();

        const fifthThumbnail = container.querySelectorAll<HTMLButtonElement>(
            '[data-gallery-thumbs] button[data-index]'
        )[4];
        fireEvent.focus(fifthThumbnail);

        expect(preloadMock.mock.calls.map(([href]) => String(href)).join(' | ')).toContain('image5');
    });

    it('preserves the horizontal thumbnail strip behavior', async () => {
        const user = userEvent.setup();
        const stripImages = Array.from({ length: 5 }, (_, index) => ({
            src: disSrc(`strip-${index}`),
            alt: `Strip ${index}`,
        }));
        const { container } = render(<ProductZoomGallery images={stripImages} horizontalThumbnails />, {
            wrapper: wrapperWithDis(true),
        });

        expect(container.querySelector('[data-gallery-strip]')).not.toBeNull();
        expect(container.querySelector('[data-gallery-thumbs]')).toBeNull();

        const fifthThumbnail = screen.getByRole('button', { name: 'Product image 5 of 5' });
        await user.click(fifthThumbnail);

        expect(fifthThumbnail).toHaveAttribute('aria-current', 'true');
        expect(screen.getByRole('button', { name: 'Zoom image 5 of 5' })).toBeInTheDocument();
    });

    it('names thumbnail controls and keeps its selection in sync with modal navigation', async () => {
        const user = userEvent.setup();
        const labeledImages: GalleryImage[] = [
            { ...images[0], thumbnailLabel: 'Front view' },
            { ...images[1], thumbnailLabel: 'Side view' },
            images[2],
        ];
        render(<ProductZoomGallery images={labeledImages} />, { wrapper: wrapperWithDis(true) });

        expect(screen.getByRole('button', { name: 'Front view, product image 1 of 3' })).toBeInTheDocument();
        const secondThumbnail = screen.getByRole('button', { name: 'Side view, product image 2 of 3' });
        await user.click(secondThumbnail);
        expect(secondThumbnail).toHaveAttribute('aria-current', 'true');

        await user.click(screen.getByRole('button', { name: 'Zoom image 2 of 3' }));
        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: 'Next Image' }));
        await user.keyboard('{Escape}');

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Product image 3 of 3' })).toHaveAttribute(
                'aria-current',
                'true'
            );
            expect(screen.getByRole('button', { name: 'Zoom image 3 of 3' })).toBeInTheDocument();
        });
    });

    it('opens the mosaic image the shopper selects and pages only among displayed tiles', async () => {
        const mosaicImages = Array.from({ length: 7 }, (_, index) => ({
            src: disSrc(`mosaic-${index}`),
            alt: `Mosaic ${index}`,
        }));
        render(<ProductZoomGallery images={mosaicImages} layout="mosaic" />, { wrapper: wrapperWithDis(true) });

        const triggers = screen.getAllByRole('button', { name: /zoom image/i });
        expect(triggers).toHaveLength(6);
        fireEvent.click(triggers[5]);

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByRole('img', { name: 'Mosaic 5' })).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Next Image' }));
        expect(within(dialog).getByRole('img', { name: 'Mosaic 0' })).toBeInTheDocument();
        expect(within(dialog).queryByRole('img', { name: 'Mosaic 6' })).not.toBeInTheDocument();
    });

    it('restores focus to the zoom trigger after the controlled dialog closes', async () => {
        const user = userEvent.setup();
        render(<ProductZoomGallery images={images} />, { wrapper: wrapperWithDis(true) });
        const trigger = screen.getByRole('button', { name: 'Zoom image 1 of 3' });

        await user.click(trigger);
        await screen.findByRole('dialog');
        await user.keyboard('{Escape}');

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(trigger).toHaveFocus();
        });
    });
});
