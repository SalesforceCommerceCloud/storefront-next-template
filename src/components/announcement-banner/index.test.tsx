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
import { render, screen } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

vi.mock('@/lib/decorators/component', () => ({
    Component: () => (target: any) => target,
}));

vi.mock('@/lib/decorators', () => ({
    RegionDefinition: () => (target: any) => target,
}));

vi.mock('@/lib/decorators/attribute-definition', () => ({
    AttributeDefinition: () => () => {},
}));

// The instructional empty state is gated to Page Designer design mode. Default to false (live
// storefront) so the bulk of the suite exercises the shopper-facing render; individual empty-state
// tests flip this to true.
let mockIsDesignMode = false;
vi.mock('@salesforce/storefront-next-runtime/design/react/core', () => ({
    usePageDesignerMode: () => ({ isDesignMode: mockIsDesignMode }),
}));

import AnnouncementBanner from './index';

function renderWithRouter(ui: React.ReactElement) {
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: <AllProvidersWrapper>{ui}</AllProvidersWrapper>,
            },
        ],
        { initialEntries: ['/'] }
    );
    return render(<RouterProvider router={router} />);
}

describe('AnnouncementBanner', () => {
    beforeEach(() => {
        mockIsDesignMode = false;
    });

    test('renders message text', () => {
        renderWithRouter(<AnnouncementBanner message="Free shipping on orders over $50" />);
        expect(screen.getByText('Free shipping on orders over $50')).toBeInTheDocument();
    });

    test('renders with role="status" for accessibility', () => {
        renderWithRouter(<AnnouncementBanner message="Sale today" />);
        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    test('renders CTA link when linkUrl and linkText provided', () => {
        renderWithRouter(<AnnouncementBanner message="Summer Sale" linkUrl="/sale" linkText="Shop Now" />);
        const link = screen.getByRole('link', { name: 'Shop Now' });
        expect(link.getAttribute('href')).toContain('/sale');
    });

    test('does not render link when linkUrl is missing', () => {
        renderWithRouter(<AnnouncementBanner message="Hello" />);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    test('does not render link when linkText is missing', () => {
        renderWithRouter(<AnnouncementBanner message="Hello" linkUrl="/sale" />);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    test('renders nothing when message is empty', () => {
        renderWithRouter(<AnnouncementBanner message="" />);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    test('uses bg-primary tokens by default', () => {
        renderWithRouter(<AnnouncementBanner message="Sale" />);
        expect(screen.getByRole('status')).toHaveClass('bg-primary', 'text-primary-foreground');
    });

    test('applies className alongside built-in classes', () => {
        renderWithRouter(<AnnouncementBanner message="Sale" className="custom-banner" />);
        expect(screen.getByRole('status')).toHaveClass('custom-banner');
    });

    describe('height', () => {
        test('defaults to medium density when no height is provided', () => {
            renderWithRouter(<AnnouncementBanner message="Sale" />);
            expect(screen.getByRole('status')).toHaveClass('py-3', 'text-sm');
        });

        test('applies small density classes when height="sm"', () => {
            renderWithRouter(<AnnouncementBanner message="Sale" height="sm" />);
            expect(screen.getByRole('status')).toHaveClass('py-1.5', 'text-xs');
        });

        test('applies large density classes when height="lg"', () => {
            renderWithRouter(<AnnouncementBanner message="Sale" height="lg" />);
            expect(screen.getByRole('status')).toHaveClass('py-5', 'text-base');
        });

        test('falls back to medium density for unknown height values', () => {
            renderWithRouter(<AnnouncementBanner message="Sale" height="huge" />);
            expect(screen.getByRole('status')).toHaveClass('py-3', 'text-sm');
        });
    });

    describe('alignment', () => {
        test('defaults to center alignment when no alignment is provided', () => {
            renderWithRouter(<AnnouncementBanner message="Sale" />);
            const banner = screen.getByRole('status');
            expect(banner).toHaveClass('justify-center');
            expect(screen.getByText('Sale')).toHaveClass('text-center');
        });

        test('applies left alignment classes', () => {
            renderWithRouter(<AnnouncementBanner message="Sale" alignment="left" />);
            const banner = screen.getByRole('status');
            expect(banner).toHaveClass('justify-start');
            expect(screen.getByText('Sale')).toHaveClass('text-left');
        });

        test('applies right alignment classes', () => {
            renderWithRouter(<AnnouncementBanner message="Sale" alignment="right" />);
            const banner = screen.getByRole('status');
            expect(banner).toHaveClass('justify-end');
            expect(screen.getByText('Sale')).toHaveClass('text-right');
        });

        test('falls back to center for unknown alignment values', () => {
            renderWithRouter(<AnnouncementBanner message="Sale" alignment="diagonal" />);
            expect(screen.getByRole('status')).toHaveClass('justify-center');
        });
    });

    test('renders link inline with message when both linkUrl and linkText are provided', () => {
        renderWithRouter(<AnnouncementBanner message="Summer Sale" linkUrl="/sale" linkText="Shop Now" />);
        const paragraph = screen.getByText(/Summer Sale/);
        expect(paragraph).toContainElement(screen.getByRole('link', { name: 'Shop Now' }));
    });

    test('does not apply an inline style attribute', () => {
        renderWithRouter(<AnnouncementBanner message="Sale" />);
        expect(screen.getByRole('status').getAttribute('style')).toBeNull();
    });

    describe('colorScheme', () => {
        test('defaults to primary tokens', () => {
            renderWithRouter(<AnnouncementBanner message="Sale" />);
            expect(screen.getByRole('status')).toHaveClass('bg-primary', 'text-primary-foreground');
        });

        test('applies secondary tokens when colorScheme="secondary"', () => {
            renderWithRouter(<AnnouncementBanner message="Sale" colorScheme="secondary" />);
            expect(screen.getByRole('status')).toHaveClass('bg-secondary', 'text-secondary-foreground');
        });

        test('applies destructive tokens when colorScheme="destructive"', () => {
            renderWithRouter(<AnnouncementBanner message="Sale" colorScheme="destructive" />);
            expect(screen.getByRole('status')).toHaveClass('bg-destructive', 'text-white');
        });

        test('falls back to primary tokens for unknown colorScheme values', () => {
            renderWithRouter(<AnnouncementBanner message="Sale" colorScheme="rainbow" />);
            expect(screen.getByRole('status')).toHaveClass('bg-primary');
        });
    });

    describe('Empty state (Page Designer authoring)', () => {
        test('does not render the instructional empty state on the live storefront (not design mode)', () => {
            const { container } = renderWithRouter(<AnnouncementBanner message="" />);

            // On the live storefront an unconfigured banner still renders nothing — no authoring
            // prompt is shown to shoppers.
            expect(screen.queryByRole('status')).not.toBeInTheDocument();
            expect(screen.queryByText('Add your text here')).not.toBeInTheDocument();
            expect(container.querySelector('[data-slot="empty-state"]')).not.toBeInTheDocument();
        });

        test('renders the instructional empty state in design mode as a default-styled banner with placeholder copy', () => {
            mockIsDesignMode = true;
            const { container } = renderWithRouter(<AnnouncementBanner message="" />);

            // W-23729792: in Page Designer design mode, an unconfigured Announcement Banner renders
            // like a real default banner (Primary color, Md height, Center alignment) with the
            // placeholder message "Add your text here" — no decorative art and no CTA.
            const emptyState = container.querySelector('[data-slot="empty-state"]');
            expect(emptyState).toBeInTheDocument();
            expect(screen.getByText('Add your text here')).toBeInTheDocument();
            // Uses the default Primary color scheme via theme tokens (no hardcoded grey surface).
            expect(emptyState).toHaveClass('bg-primary', 'text-primary-foreground');
            expect(container.querySelector('.bg-muted')).not.toBeInTheDocument();
            // The preview must use the component's *declared* default alignment (center) so the
            // banner does not shift when an author types their first message — see normalizeAlignment
            // and AnnouncementBannerMetadata.alignment (defaultValue: 'center').
            expect(emptyState).toHaveClass('justify-center');
            expect(screen.getByText('Add your text here')).toHaveClass('text-center');
        });

        test('the empty state has no interactive controls (illustrative placeholder only)', () => {
            mockIsDesignMode = true;
            renderWithRouter(<AnnouncementBanner message="" />);

            // The placeholder is a preview of the default banner — copy only, no CTA button or link.
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });

        test('configured banners are unchanged in design mode', () => {
            mockIsDesignMode = true;
            renderWithRouter(<AnnouncementBanner message="Sale" />);

            expect(screen.getByText('Sale')).toBeInTheDocument();
            expect(screen.queryByText('Add your text here')).not.toBeInTheDocument();
        });

        test('renders nothing when message is whitespace-only and design mode is disabled', () => {
            const { container } = renderWithRouter(<AnnouncementBanner message="   " />);

            expect(screen.queryByRole('status')).not.toBeInTheDocument();
            expect(container.querySelector('[data-slot="empty-state"]')).not.toBeInTheDocument();
        });
    });
});
