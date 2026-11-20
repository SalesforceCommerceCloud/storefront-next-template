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
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, test } from 'vitest';
import { PageDesignerProvider } from '@salesforce/storefront-next-runtime/design/react/core';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import ImageBanner from './index';

function renderBanner(banner: React.ReactElement, mode?: 'EDIT') {
    const router = createMemoryRouter([
        {
            path: '*',
            element: (
                <AllProvidersWrapper>
                    {mode ? (
                        <PageDesignerProvider clientId="image-banner-test" targetOrigin="*" mode={mode}>
                            {banner}
                        </PageDesignerProvider>
                    ) : (
                        banner
                    )}
                </AllProvidersWrapper>
            ),
        },
    ]);
    return render(<RouterProvider router={router} />);
}

describe('Image Banner', () => {
    test('renders linked campaign artwork with an optional disclosure', () => {
        const { container } = renderBanner(
            <ImageBanner
                imageUrl={{ url: '/wide.webp', metaData: { width: 2624, height: 256 } }}
                imageAlt="Summer offer. Save on sparkling water."
                linkUrl="/c/drinks"
                disclosure="Sponsored"
            />
        );
        expect(screen.getByRole('link', { name: 'Summer offer. Save on sparkling water.' })).toHaveAttribute(
            'href',
            '/global/en-GB/c/drinks'
        );
        expect(screen.getAllByRole('link')).toHaveLength(1);
        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
        expect(screen.getByRole('img')).toHaveAttribute('width', '2624');
        expect(screen.getByRole('img')).toHaveClass('h-auto');
        expect(container.querySelector('picture source')).not.toBeInTheDocument();
        expect(screen.getByText('Sponsored')).toBeInTheDocument();
    });

    test.each([undefined, ['50vw']])('resizes one DIS artwork responsively with width hints %j', (imageWidths) => {
        const imageUrl =
            'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-catalog/default/banner.jpg';
        const { container } = renderBanner(
            <ImageBanner
                imageUrl={{ url: imageUrl, metaData: { width: 2624, height: 256 } }}
                imageAlt="Summer offer"
                imageWidths={imageWidths}
            />
        );
        const sources = container.querySelectorAll('picture source');
        expect(sources.length).toBeGreaterThan(0);
        for (const source of sources) {
            expect(source.getAttribute('srcset')).toContain('sw=');
            expect(source.getAttribute('sizes')).toContain(imageWidths?.[0] ?? '100vw');
            expect(source.getAttribute('srcset')).toContain('/banner.');
        }
        expect(screen.getByRole('img')).toHaveAttribute('width', '2624');
        expect(screen.getByRole('img')).toHaveAttribute('height', '256');
    });

    test('supports an explicit accessible link label', () => {
        renderBanner(
            <ImageBanner
                imageUrl="/campaign.webp"
                imageAlt="Campaign artwork"
                linkUrl="/sale"
                linkAriaLabel="Shop the summer sale"
            />
        );
        expect(screen.getByRole('link', { name: 'Shop the summer sale' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Campaign artwork' })).toBeInTheDocument();
    });

    test('can display artwork without a link or sponsorship label', () => {
        renderBanner(<ImageBanner imageUrl="/campaign.webp" imageAlt="Seasonal collection" />);
        expect(screen.getByRole('img', { name: 'Seasonal collection' })).toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.queryByText('Sponsored')).not.toBeInTheDocument();
    });

    test.each([undefined, '', '   '])('omits an unnamed linked banner (%j)', (imageAlt) => {
        const { container } = renderBanner(<ImageBanner imageUrl="/offer.webp" linkUrl="/offer" imageAlt={imageAlt} />);
        expect(container.querySelector('[data-slot="image-banner"]')).not.toBeInTheDocument();
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    test('omits unnamed linked banners in authoring mode without an extra validation alert', () => {
        renderBanner(<ImageBanner imageUrl="/offer.webp" linkUrl="/offer" imageAlt="   " />, 'EDIT');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    test('omits unconfigured banners on the storefront', () => {
        const { container } = renderBanner(<ImageBanner linkUrl="/sale" disclosure="Sponsored" />);
        expect(container.querySelector('[data-slot="image-banner"]')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(container.querySelector('img')).not.toBeInTheDocument();
    });

    test('previews an unlinked shared placeholder while authoring an empty banner', async () => {
        const { container } = renderBanner(<ImageBanner linkUrl="/sale" disclosure="Sponsored" />, 'EDIT');
        await waitFor(() => expect(container.querySelector('[data-slot="image-banner"]')).toBeInTheDocument());
        expect(container.querySelector('[data-slot="empty-state"] img')).toHaveAttribute('alt', '');
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.queryByText('Sponsored')).not.toBeInTheDocument();
    });
});
