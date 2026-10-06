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
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import ProductZoomModal from './index';
import type { GalleryImage } from '@/components/image-gallery';

void i18next.init({
    lng: 'en-US',
    fallbackLng: 'en-US',
    resources: {
        'en-US': {
            common: {
                previousImage: 'Previous image',
                nextImage: 'Next image',
                zoom: {
                    open: 'Zoom image',
                    title: 'Product image',
                    description:
                        'Zoomed product image. Click the image to magnify. When magnified, use the arrow keys to pan. Otherwise, use left and right arrow keys to change image.',
                    counter: '{{current}} of {{total}}',
                },
            },
            product: { imageAlt: 'Product Image' },
        },
    },
});

const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
        ConfigProvider,
        { config: mockConfig } as never,
        createElement(I18nextProvider, { i18n: i18next }, children)
    );

const disSrc = (name: string) =>
    `https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw4cd0a798/images/large/${name}.jpg`;

const images: GalleryImage[] = [
    { src: disSrc('image1'), alt: 'Image 1' },
    { src: disSrc('image2'), alt: 'Image 2' },
    { src: disSrc('image3'), alt: 'Image 3' },
];

const renderModal = (props: Partial<React.ComponentProps<typeof ProductZoomModal>> = {}) =>
    render(
        <ProductZoomModal
            images={images}
            initialIndex={0}
            open
            onOpenChange={vi.fn()}
            productName="Test Product"
            {...props}
        />,
        { wrapper }
    );

describe('ProductZoomModal', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('renders an accessible dialog when open', () => {
        renderModal();
        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
        // sr-only title gives the dialog an accessible name.
        expect(screen.getByText('Product image')).toBeInTheDocument();
    });

    it('shows the higher-resolution image for the initial index', () => {
        renderModal({ initialIndex: 1 });
        const img = screen.getByRole('img', { name: 'Image 2' });
        expect(img).toBeInTheDocument();
    });

    it('renders nav arrows and a counter when there is more than one image', () => {
        renderModal();
        expect(screen.getByRole('button', { name: 'Previous image' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next image' })).toBeInTheDocument();
        expect(screen.getByText('1 of 3')).toBeInTheDocument();
    });

    it('advances to the next image on ArrowRight and reports it via onIndexChange', () => {
        const onIndexChange = vi.fn();
        renderModal({ onIndexChange });
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
        expect(screen.getByText('2 of 3')).toBeInTheDocument();
        expect(onIndexChange).toHaveBeenLastCalledWith(1);
    });

    it('wraps to the last image on ArrowLeft from the first', () => {
        renderModal();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
        expect(screen.getByText('3 of 3')).toBeInTheDocument();
    });

    it('advances via the Next arrow button', () => {
        renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
        expect(screen.getByText('2 of 3')).toBeInTheDocument();
    });

    it('omits arrows and counter for a single image', () => {
        renderModal({ images: [images[0]] });
        expect(screen.queryByRole('button', { name: 'Next image' })).not.toBeInTheDocument();
        expect(screen.queryByText(/of/)).not.toBeInTheDocument();
    });

    it('renders nothing when open but given no images', () => {
        const { container } = renderModal({ images: [] });
        expect(container).toBeEmptyDOMElement();
    });

    it('does not render dialog content when closed', () => {
        renderModal({ open: false });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('starts un-magnified and toggles magnify on click of the image surface', () => {
        renderModal();
        const img = screen.getByRole('img', { name: 'Image 1' });
        const viewport = document.querySelector('[data-slot="product-zoom-viewport"]') as HTMLElement;
        expect(img.style.transform).toBe('scale(1)');
        expect(viewport).toHaveClass('cursor-zoom-in');

        fireEvent.click(viewport);
        expect(img.style.transform).toBe('scale(2.5)');
        expect(viewport).toHaveClass('cursor-zoom-out');

        // Click again returns to the fit view.
        fireEvent.click(viewport);
        expect(img.style.transform).toBe('scale(1)');
    });

    it('supports keyboard activation of the magnify toggle', async () => {
        renderModal();
        const viewport = screen.getByRole('button', { name: 'Toggle image magnification' });

        expect(viewport).toHaveAttribute('aria-pressed', 'false');
        viewport.focus();
        await userEvent.keyboard('{Enter}');
        expect(viewport).toHaveAttribute('aria-pressed', 'true');
        const img = screen.getByRole('img', { name: 'Image 1' });
        expect(img.style.transform).toBe('scale(2.5)');
        expect(img.style.transformOrigin).toBe('50% 50%');

        await userEvent.keyboard(' ');
        expect(viewport).toHaveAttribute('aria-pressed', 'false');
    });

    it('centers keyboard-activated zoom after pointer panning', async () => {
        renderModal();
        const viewport = screen.getByRole('button', { name: 'Toggle image magnification' });
        const imageContainer = viewport.parentElement as HTMLElement;
        const img = screen.getByRole('img', { name: 'Image 1' });
        vi.spyOn(imageContainer, 'getBoundingClientRect').mockReturnValue({
            left: 50,
            top: 25,
            width: 100,
            height: 50,
            right: 150,
            bottom: 75,
            x: 50,
            y: 25,
            toJSON: () => ({}),
        } as DOMRect);

        fireEvent.pointerDown(viewport, { clientX: 75, clientY: 37.5 });
        fireEvent.click(viewport, { detail: 1 });
        expect(img.style.transformOrigin).toBe('25% 25%');

        viewport.focus();
        await userEvent.keyboard(' ');
        await userEvent.keyboard('{Enter}');
        expect(img.style.transformOrigin).toBe('50% 50%');
    });

    it('pans the magnified image from its untransformed layout bounds', () => {
        renderModal();
        const img = screen.getByRole('img', { name: 'Image 1' });
        const viewport = document.querySelector('[data-slot="product-zoom-viewport"]') as HTMLElement;
        const imageContainer = viewport.parentElement as HTMLElement;
        // jsdom has no layout — give the untransformed image container a deterministic, letterboxed box
        // so percentage math is stable even while the nested <img> scales.
        vi.spyOn(imageContainer, 'getBoundingClientRect').mockReturnValue({
            left: 50,
            top: 25,
            width: 100,
            height: 50,
            right: 150,
            bottom: 75,
            x: 50,
            y: 25,
            toJSON: () => ({}),
        } as DOMRect);

        // Click at (75, 37.5) → origin 25% / 25% within the actual image.
        fireEvent.pointerDown(viewport, { clientX: 75, clientY: 37.5 });
        fireEvent.click(viewport, { detail: 1 });
        expect(img.style.transform).toBe('scale(2.5)');
        expect(img.style.transformOrigin).toBe('25% 25%');

        // Move to (125, 62.5) → origin pans to 75% / 75%.
        fireEvent.pointerMove(viewport, { clientX: 125, clientY: 62.5 });
        expect(img.style.transformOrigin).toBe('75% 75%');
    });

    it('uses a pointer at the screen origin as a valid pan origin', () => {
        renderModal();
        const viewport = screen.getByRole('button', { name: 'Toggle image magnification' });
        const imageContainer = viewport.parentElement as HTMLElement;
        const img = screen.getByRole('img', { name: 'Image 1' });
        vi.spyOn(imageContainer, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 100,
            height: 100,
            right: 100,
            bottom: 100,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);

        fireEvent.pointerDown(viewport, { clientX: 0, clientY: 0 });
        fireEvent.click(viewport, { detail: 1 });

        expect(img.style.transformOrigin).toBe('0% 0%');
    });

    it('pans a magnified image from the dialog without paging', () => {
        renderModal();
        const viewport = screen.getByRole('button', { name: 'Toggle image magnification' });
        const img = screen.getByRole('img', { name: 'Image 1' });

        fireEvent.click(viewport);
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown' });

        expect(img.style.transformOrigin).toBe('60% 60%');
        expect(screen.getByText('1 of 3')).toBeInTheDocument();
    });

    it('resets magnify when paging to another image', () => {
        renderModal();
        const viewport = document.querySelector('[data-slot="product-zoom-viewport"]') as HTMLElement;
        fireEvent.click(viewport);
        expect(screen.getByRole('img', { name: 'Image 1' }).style.transform).toBe('scale(2.5)');

        fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
        // New slide starts un-magnified.
        expect(screen.getByRole('img', { name: 'Image 2' }).style.transform).toBe('scale(1)');
    });
});
