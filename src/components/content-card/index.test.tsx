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
import { createRef } from 'react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { type Image } from '@/types';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

// The instructional empty state is gated to Page Designer design mode. Default to false (live
// storefront) so the bulk of the suite exercises the shopper-facing render; individual empty-state
// tests flip this to true.
let mockIsDesignMode = false;
vi.mock('@salesforce/storefront-next-runtime/design/react/core', () => ({
    usePageDesignerMode: () => ({ isDesignMode: mockIsDesignMode }),
}));

// Import the component after mocks are set up
import ContentCard from './index';

describe('ContentCard', () => {
    beforeEach(() => {
        mockIsDesignMode = false;
    });

    const defaultProps = {
        title: 'Test Title',
        description: 'Test description content',
        imageUrl: { url: 'https://example.com/image.jpg' } as Image,
        imageAlt: 'Test image',
        buttonText: 'Click Me',
        buttonLink: '/test-link',
    };

    const renderWithRouter = (ui: React.ReactElement) => {
        const router = createMemoryRouter([{ path: '*', element: <AllProvidersWrapper>{ui}</AllProvidersWrapper> }], {
            initialEntries: ['/'],
        });
        return render(<RouterProvider router={router} />);
    };

    test('renders all content with correct attributes', () => {
        renderWithRouter(<ContentCard {...defaultProps} />);

        expect(screen.getByText('Test Title')).toBeInTheDocument();
        expect(screen.getByText('Test description content')).toBeInTheDocument();

        const image = screen.getByAltText('Test image');
        expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
        expect(image).toHaveAttribute('loading', 'lazy');

        const link = screen.getByRole('link', { name: 'Click Me' });
        expect(link).toHaveAttribute('href', '/global/en-GB/test-link');
        expect(link.className).toContain('w-fit');
    });

    test('handles optional props correctly', () => {
        renderWithRouter(<ContentCard {...defaultProps} title={undefined} />);
        expect(screen.queryByText('Test Title')).not.toBeInTheDocument();
        expect(screen.getByText('Test description content')).toBeInTheDocument();
    });

    test('does not render button when buttonText or buttonLink is missing', () => {
        renderWithRouter(<ContentCard {...defaultProps} buttonText={undefined} />);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();

        cleanup();
        renderWithRouter(<ContentCard {...defaultProps} buttonLink={undefined} />);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    test('uses title as alt text when imageAlt is not provided', () => {
        renderWithRouter(<ContentCard {...defaultProps} imageAlt={undefined} />);
        expect(screen.getByAltText('Test Title')).toBeInTheDocument();
    });

    test('does not render footer when no content is provided', () => {
        const { container } = renderWithRouter(<ContentCard imageUrl={{ url: 'https://example.com/image.jpg' }} />);
        expect(container.querySelector('[data-slot="card-footer"]')).not.toBeInTheDocument();
    });

    test('applies styling props correctly', () => {
        let result = renderWithRouter(<ContentCard {...defaultProps} showBackground={true} />);
        let card = result.container.querySelector('[data-slot="card"]');
        expect(card?.className).toContain('bg-muted/50');

        cleanup();
        result = renderWithRouter(<ContentCard {...defaultProps} showBackground={false} />);
        card = result.container.querySelector('[data-slot="card"]');
        expect(card?.className).toContain('bg-transparent');

        cleanup();
        result = renderWithRouter(<ContentCard {...defaultProps} showBorder={false} />);
        card = result.container.querySelector('[data-slot="card"]');
        expect(card?.className).toContain('border-0');
    });

    test('applies custom className and h-full for grid layouts', () => {
        const { container } = renderWithRouter(<ContentCard {...defaultProps} className="custom-class" />);
        const card = container.querySelector('[data-slot="card"]');
        expect(card?.className).toContain('custom-class');
        expect(card?.className).toContain('h-full');
    });

    test('applies custom classnames for footer, description, and button', () => {
        renderWithRouter(
            <ContentCard
                {...defaultProps}
                cardFooterClassName="footer-custom"
                cardDescriptionClassName="description-custom"
                buttonClassName="button-custom"
            />
        );

        const descriptionWrapper = screen.getByText('Test description content').closest('div');
        expect(descriptionWrapper?.className).toContain('description-custom');

        const link = screen.getByRole('link', { name: 'Click Me' });
        expect(link.className).toContain('button-custom');
    });

    test('forwards ref to Card component', () => {
        const ref = createRef<HTMLDivElement>();
        renderWithRouter(<ContentCard {...defaultProps} ref={ref} />);
        expect(ref.current).toBeInstanceOf(HTMLDivElement);
        expect(ref.current?.getAttribute('data-slot')).toBe('card');
    });

    test('renders with only image (no text or button)', () => {
        renderWithRouter(<ContentCard imageUrl={{ url: 'https://example.com/image.jpg' }} imageAlt="Only image" />);
        expect(screen.getByAltText('Only image')).toBeInTheDocument();
        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    test('renders with only text (no image or button)', () => {
        const { container } = renderWithRouter(<ContentCard title="Only Title" description="Only description" />);
        expect(container.querySelector('[data-slot="card"]')).toBeInTheDocument();
        // No image authored: title/description render directly on the card
        // surface (not gated behind an image), so authored copy is never dropped.
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Only Title' })).toBeInTheDocument();
        expect(screen.getByText('Only description')).toBeInTheDocument();
        // Still no CTA when buttonText/buttonLink are absent.
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    test('renders CTA in text-only card when button is authored without an image', () => {
        renderWithRouter(<ContentCard title="Only Title" buttonText="Go" buttonLink="/go" />);
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        const link = screen.getByRole('link', { name: 'Go' });
        expect(link).toHaveAttribute('href', '/global/en-GB/go');
    });

    test('renders empty card when neither image nor text nor CTA is authored', () => {
        const { container } = renderWithRouter(<ContentCard />);
        expect(container.querySelector('[data-slot="card"]')).toBeInTheDocument();
        expect(container.querySelector('[data-slot="card-content"]')).not.toBeInTheDocument();
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    describe('Empty state (Page Designer authoring)', () => {
        test('does not render the instructional empty state on the live storefront (not design mode)', () => {
            const { container } = renderWithRouter(<ContentCard />);

            // On the live storefront an unconfigured Content Card falls through to the plain empty
            // card shell — no authoring prompt is shown to shoppers.
            expect(screen.queryByRole('heading', { name: 'Add your title here' })).not.toBeInTheDocument();
            expect(screen.queryByText('Add your description here')).not.toBeInTheDocument();
            expect(container.querySelector('[data-slot="empty-state"]')).not.toBeInTheDocument();
            expect(container.querySelector('[data-slot="card-content"]')).not.toBeInTheDocument();
        });

        test('renders the instructional empty state in design mode with default title/description and no props', () => {
            mockIsDesignMode = true;
            const { container } = renderWithRouter(<ContentCard />);

            // W-23729786: in Page Designer design mode, an unconfigured Content Card renders through
            // the real image-backed path — the shared placeholder image with the default title and
            // description bottom-left aligned over the standard gradient, and no CTA.
            expect(screen.getByRole('heading', { name: 'Add your title here' })).toBeInTheDocument();
            expect(screen.getByText('Add your description here')).toBeInTheDocument();
            // The placeholder art renders as a real <img> (fed through the normal render path). The
            // src is the shared placeholder asset — in tests the Vite asset alias resolves any
            // static image import to a fixed mock string (see asset-mock.ts), so we assert that the
            // mocked asset (not an authored URL) is what flows through. It is decorative (alt="") so
            // the screen reader doesn't read the title twice (heading + image name), which means it
            // carries the presentation role — query it by tag rather than role="img".
            const placeholder = container.querySelector('img');
            expect(placeholder).not.toBeNull();
            expect(placeholder?.getAttribute('alt')).toBe('');
            expect(placeholder?.getAttribute('src')).toContain('__ASSET_MOCK__');
            expect(screen.queryByRole('link')).not.toBeInTheDocument();

            expect(container.querySelector('[data-slot="empty-state"]')).toBeInTheDocument();
        });

        test('the empty state has no interactive controls (illustrative placeholder only)', () => {
            mockIsDesignMode = true;
            renderWithRouter(<ContentCard />);

            // The placeholder previews the default card — copy only, no CTA button or link.
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });

        test('configured cards are unchanged in design mode', () => {
            mockIsDesignMode = true;
            renderWithRouter(<ContentCard {...defaultProps} />);

            expect(screen.getByText('Test Title')).toBeInTheDocument();
            expect(screen.queryByRole('heading', { name: 'Add your title here' })).not.toBeInTheDocument();
            expect(screen.queryByText('Add your description here')).not.toBeInTheDocument();
        });

        test('cards with only an image (no text/CTA) are unchanged in design mode', () => {
            mockIsDesignMode = true;
            const { container } = renderWithRouter(
                <ContentCard imageUrl={{ url: 'https://example.com/image.jpg' }} imageAlt="Only image" />
            );

            expect(screen.getByAltText('Only image')).toBeInTheDocument();
            expect(container.querySelector('[data-slot="empty-state"]')).not.toBeInTheDocument();
        });
    });

    test('applies loading attribute correctly', () => {
        renderWithRouter(<ContentCard {...defaultProps} loading="eager" />);
        let image = screen.getByAltText('Test image');
        expect(image).toHaveAttribute('loading', 'eager');

        cleanup();
        renderWithRouter(<ContentCard {...defaultProps} loading="lazy" />);
        image = screen.getByAltText('Test image');
        expect(image).toHaveAttribute('loading', 'lazy');

        cleanup();
        renderWithRouter(<ContentCard {...defaultProps} />);
        image = screen.getByAltText('Test image');
        expect(image).toHaveAttribute('loading', 'lazy');
    });
});
