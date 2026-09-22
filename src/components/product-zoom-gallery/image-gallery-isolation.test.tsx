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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import type { GalleryImage } from '@/components/image-gallery';
import ProductZoomGallery from './index';

const imageGalleryMock = vi.fn((props: { renderImageOverlay?: (index: number) => ReactNode }) => (
    <div data-testid="base-gallery">{props.renderImageOverlay?.(0)}</div>
));

vi.mock('@/components/image-gallery/gallery-content', () => ({
    default: (props: { renderImageOverlay?: (index: number) => ReactNode }) => imageGalleryMock(props),
}));

const images: GalleryImage[] = [
    { src: 'https://example.com/image-1.jpg', alt: 'Image 1' },
    { src: 'https://example.com/image-2.jpg', alt: 'Image 2' },
];

void i18next.init({
    lng: 'en-US',
    fallbackLng: 'en-US',
    resources: {
        'en-US': {
            common: {
                noImageAvailable: 'No Image Available',
                thumbnailImage: 'Product image {{current}} of {{total}}',
                thumbnailImageLabeled: '{{label}}, product image {{current}} of {{total}}',
                zoom: { openImage: 'Zoom image {{current}} of {{total}}' },
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

describe('ProductZoomGallery shared gallery isolation', () => {
    afterEach(() => {
        cleanup();
        imageGalleryMock.mockClear();
    });

    it('supplies a PDP-only zoom action through shared gallery content', () => {
        render(<ProductZoomGallery images={images} />, { wrapper });

        expect(imageGalleryMock).toHaveBeenCalledOnce();
        expect(screen.getByRole('button', { name: 'Zoom image 1 of 2' })).toBeInTheDocument();
    });
});
