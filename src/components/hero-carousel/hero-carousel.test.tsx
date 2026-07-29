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

    test('renders empty state when no slides provided', () => {
        renderInRouter(<HeroCarouselPlain slides={[]} />);

        expect(screen.getByText('No slides available')).toBeInTheDocument();
    });

    test('pause/play button is keyboard accessible', () => {
        renderInRouter(<HeroCarouselPlain slides={mockSlides} autoPlay={true} showNavigation={true} />);

        const pauseButton = screen.getByRole('button', { name: /pause carousel/i });

        // Button should be keyboard focusable
        expect(pauseButton).not.toHaveAttribute('tabIndex', '-1');
    });
});
