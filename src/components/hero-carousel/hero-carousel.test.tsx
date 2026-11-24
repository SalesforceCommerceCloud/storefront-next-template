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
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { maxWidthBelowQuery, minWidthQuery } from '@/lib/theme/breakpoints';
import { HeroCarouselPlain, type HeroSlide } from './index';

const renderInRouter = (element: React.ReactElement) => {
    const router = createMemoryRouter([{ path: '*', element: <AllProvidersWrapper>{element}</AllProvidersWrapper> }], {
        initialEntries: ['/'],
    });
    return render(<RouterProvider router={router} />);
};

const mockSlides: HeroSlide[] = [
    {
        id: 'slide-1',
        title: 'Slide 1',
        subtitle: 'Subtitle 1',
        imageUrl: '/images/hero-01.webp',
        imageAlt: 'Hero 1',
        ctaText: 'Shop Now',
        ctaLink: '/category/mens',
    },
    {
        id: 'slide-2',
        title: 'Slide 2',
        subtitle: 'Subtitle 2',
        imageUrl: '/images/hero-02.webp',
        imageAlt: 'Hero 2',
        ctaText: 'Explore',
        ctaLink: '/category/womens',
    },
    {
        id: 'slide-3',
        title: 'Slide 3',
        subtitle: 'Subtitle 3',
        imageUrl: '/images/hero-03.webp',
        imageAlt: 'Hero 3',
        ctaText: 'Discover',
        ctaLink: '/category/accessories',
    },
];

const DESKTOP_MEDIA = minWidthQuery('md');
const MOBILE_MEDIA = maxWidthBelowQuery('md');

describe('HeroCarousel', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    test('renders carousel with slides', () => {
        renderInRouter(<HeroCarouselPlain slides={mockSlides} />);

        expect(screen.getByRole('region', { name: /hero carousel/i })).toBeInTheDocument();
        expect(screen.getByText('Slide 1')).toBeInTheDocument();
    });

    test('renders pause/play button when autoPlay is enabled', () => {
        renderInRouter(<HeroCarouselPlain slides={mockSlides} autoPlay={true} showNavigation={true} />);

        const pauseButton = screen.getByRole('button', { name: /pause carousel/i });
        expect(pauseButton).toBeInTheDocument();
    });

    test('does not render pause/play button when autoPlay is disabled', () => {
        renderInRouter(<HeroCarouselPlain slides={mockSlides} autoPlay={false} showNavigation={true} />);

        const pauseButton = screen.queryByRole('button', { name: /pause carousel/i });
        const playButton = screen.queryByRole('button', { name: /play carousel/i });
        expect(pauseButton).not.toBeInTheDocument();
        expect(playButton).not.toBeInTheDocument();
    });

    test('toggles between pause and play states when clicked', async () => {
        vi.useRealTimers();
        const user = userEvent.setup();
        renderInRouter(<HeroCarouselPlain slides={mockSlides} autoPlay={true} showNavigation={true} />);

        const pauseButton = screen.getByRole('button', { name: /pause carousel/i });
        expect(pauseButton).toBeInTheDocument();

        await user.click(pauseButton);
        expect(screen.getByRole('button', { name: /play carousel/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /play carousel/i }));
        expect(screen.getByRole('button', { name: /pause carousel/i })).toBeInTheDocument();
    });

    test('carousel navigation buttons have accessible labels', () => {
        renderInRouter(<HeroCarouselPlain slides={mockSlides} showNavigation={true} />);

        const prevButton = screen.getByRole('button', { name: /previous slide/i });
        const nextButton = screen.getByRole('button', { name: /next slide/i });

        expect(prevButton).toBeInTheDocument();
        expect(nextButton).toBeInTheDocument();
    });

    test('dot buttons have accessible labels', () => {
        renderInRouter(<HeroCarouselPlain slides={mockSlides} showDots={true} />);

        const dot1 = screen.getByRole('tab', { name: /go to slide 1 of 3/i });
        const dot2 = screen.getByRole('tab', { name: /go to slide 2 of 3/i });
        const dot3 = screen.getByRole('tab', { name: /go to slide 3 of 3/i });

        expect(dot1).toBeInTheDocument();
        expect(dot2).toBeInTheDocument();
        expect(dot3).toBeInTheDocument();
    });

    test('announces current slide to screen readers', () => {
        renderInRouter(<HeroCarouselPlain slides={mockSlides} />);

        const announcement = screen.getByText(/slide 1 of 3: slide 1/i);
        expect(announcement).toBeInTheDocument();
        expect(announcement).toHaveAttribute('aria-live', 'polite');
        expect(announcement).toHaveAttribute('aria-atomic', 'true');
    });

    test('carousel region is keyboard accessible', () => {
        renderInRouter(<HeroCarouselPlain slides={mockSlides} />);

        const carousel = screen.getByRole('region', { name: /hero carousel/i });

        // Carousel should be focusable
        expect(carousel).toHaveAttribute('tabIndex', '0');
    });

    test('renders nothing on the live storefront when no slides provided', () => {
        // Outside a PageDesignerProvider `usePageDesignerMode` defaults to design mode off, so an
        // unconfigured carousel renders nothing rather than a placeholder (W-23729831 leak fix).
        renderInRouter(<HeroCarouselPlain slides={[]} />);

        expect(screen.queryByRole('region', { name: /hero carousel/i })).not.toBeInTheDocument();
        expect(screen.queryByText(/no slides available/i)).not.toBeInTheDocument();
    });

    test('pause/play button is keyboard accessible', () => {
        renderInRouter(<HeroCarouselPlain slides={mockSlides} autoPlay={true} showNavigation={true} />);

        const pauseButton = screen.getByRole('button', { name: /pause carousel/i });

        // Button should be keyboard focusable
        expect(pauseButton).not.toHaveAttribute('tabIndex', '-1');
    });
});

describe('HeroCarousel mobile image rendition', () => {
    const slidesWithMobile: HeroSlide[] = [
        { ...mockSlides[0], mobileImageUrl: '/images/hero-01-mobile.webp' },
        mockSlides[1],
    ];

    test('serves the mobile rendition below md and the desktop image otherwise', () => {
        const { container } = renderInRouter(<HeroCarouselPlain slides={slidesWithMobile} />);

        const source = container.querySelector('picture source');
        expect(source).toHaveAttribute('media', MOBILE_MEDIA);
        expect(source).toHaveAttribute('srcset', '/images/hero-01-mobile.webp');
        expect(container.querySelector('picture img')).toHaveAttribute('src', '/images/hero-01.webp');
    });

    test('keeps slides without a mobile rendition on the single-image path', () => {
        const { container } = renderInRouter(<HeroCarouselPlain slides={slidesWithMobile} />);

        expect(container.querySelectorAll(`picture source[media="${MOBILE_MEDIA}"]`)).toHaveLength(1);
        expect(container.querySelector('img[src="/images/hero-02.webp"]')).toBeInTheDocument();
    });

    test('a carousel-level image replaces the slide image on every viewport, dropping the mobile rendition', () => {
        const { container } = renderInRouter(
            <HeroCarouselPlain slides={slidesWithMobile} image={{ url: '/images/override.webp' } as never} />
        );

        expect(container.querySelector('picture')).not.toBeInTheDocument();
        expect(container.querySelector('img[src="/images/override.webp"]')).toBeInTheDocument();
        expect(container.querySelector('[srcset="/images/hero-01-mobile.webp"]')).not.toBeInTheDocument();
    });

    test('loads only the first slide eagerly', () => {
        const slides = slidesWithMobile.map((slide) => ({ ...slide, mobileImageUrl: '/images/m.webp' }));
        const { container } = renderInRouter(<HeroCarouselPlain slides={slides} />);

        const images = container.querySelectorAll('picture img');
        expect(images[0]).toHaveAttribute('loading', 'eager');
        expect(images[1]).toHaveAttribute('loading', 'lazy');
    });
});

describe('HeroCarousel art-directed renditions across image kinds', () => {
    const disUrl = (name: string) =>
        `https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/ZZRF_001/on/demandware.static/-/Sites-apparel-m-catalog/default/dw4cd0a798/images/large/${name}.jpg`;
    const renderSlide = (imageUrl: string, mobileImageUrl: string) =>
        renderInRouter(<HeroCarouselPlain slides={[{ ...mockSlides[0], imageUrl, mobileImageUrl }]} />);

    test('bundled desktop and mobile: one source per rendition, each scoped to its own range', () => {
        const { container } = renderSlide('/images/hero-01.webp', '/images/hero-01-mobile.webp');

        const sources = [...container.querySelectorAll('picture source')];
        expect(sources.map((source) => [source.getAttribute('srcset'), source.getAttribute('media')])).toEqual([
            ['/images/hero-01-mobile.webp', MOBILE_MEDIA],
            ['/images/hero-01.webp', DESKTOP_MEDIA],
        ]);
        expect(container.querySelector('picture img')).toHaveAttribute('src', '/images/hero-01.webp');
    });

    test('DIS desktop and mobile: each rendition keeps its own sources, scoped to its range', () => {
        const { container } = renderSlide(disUrl('desktop'), disUrl('mobile'));

        const sources = [...container.querySelectorAll('picture source')];
        const mobile = sources.filter((source) => source.getAttribute('srcset')?.includes('mobile'));
        const desktop = sources.filter((source) => source.getAttribute('srcset')?.includes('desktop'));

        expect(mobile.length).toBeGreaterThan(0);
        expect(mobile.every((source) => source.getAttribute('media')?.endsWith(MOBILE_MEDIA))).toBe(true);
        expect(desktop.length).toBeGreaterThan(1);
        expect(desktop.every((source) => source.getAttribute('media')?.endsWith(DESKTOP_MEDIA))).toBe(true);
        expect(desktop.some((source) => source.getAttribute('srcset')?.includes('1536w'))).toBe(true);
        expect(sources).toHaveLength(mobile.length + desktop.length);
    });

    test('DIS desktop and bundled mobile: renditions resolve independently', () => {
        const { container } = renderSlide(disUrl('desktop'), '/images/hero-01-mobile.webp');

        const mobile = container.querySelectorAll(`picture source[media="${MOBILE_MEDIA}"]`);
        expect(mobile).toHaveLength(1);
        expect(mobile[0]).toHaveAttribute('srcset', '/images/hero-01-mobile.webp');
        const desktop = container.querySelectorAll(`picture source[media="${DESKTOP_MEDIA}"]`);
        expect(desktop.length).toBeGreaterThan(0);
        expect([...desktop].every((source) => source.getAttribute('srcset')?.includes('/dw/image/v2/'))).toBe(true);
    });
});
